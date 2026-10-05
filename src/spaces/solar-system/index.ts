import { PerspectiveCamera, Scene, Vector3 } from 'three';
import { prefersCoarsePointer } from '../../core/capabilities';
import { readPreference, writePreference } from '../../core/preferences';
import type { SpaceContext, SpaceFactory, SpaceInstance } from '../../core/types';
import { createCameraControls } from '../../shared/controls';
import { distanceLimits, frameDistance } from '../../shared/model-viewer/framing';
import { BODIES, SOLAR_SYSTEM } from './data';
import { createBodyMarkers } from './markers';
import { createScaleToggle } from './scale-toggle';
import { layout, systemExtent } from './scale';
import { buildSystem } from './scene';
import type { BodyLayout, ScaleMode } from './types';

/** The visitor's scale, remembered across visits (spec 020, AC-7, D-022). */
export const SCALE_PREFERENCE = 'world.solarSystem.scale';
/** Keep the camera off the poles so the view never flips (as in 004/010). */
const POLAR_MARGIN = 0.15;
/** A zoom that starts this close (CSS px) to a body re-centres on it at real scale (D-023). */
const RECENTRE_RADIUS = 24;
/** Wheel/pinch zoom speed: ~40 wheel notches from the whole real-scale system to Earth at 3 px (D-023). */
const ZOOM_SPEED = 4;
/** The camera stays this many radii from the body it orbits (as 010's model viewer), so it never goes inside. */
const MIN_DISTANCE_FACTOR = 1.2;
/** Near plane: half the distance to the nearest surface, within these bounds (scene units). */
const NEAR = { min: 1e-6, max: 1 };

/** Seams for unit tests. */
export interface SolarSystemDeps {
  storage?: Storage;
}

/**
 * The Solar System Space (spec 020): the Sun, eight planets and seven moons from sourced data, in a stylised or a
 * true-to-scale layout. Switching scale only moves and resizes bodies, then re-frames the whole system. At real
 * scale, name markers show where the sub-pixel bodies are, and a zoom that starts on one re-centres on it
 * (D-023). The near plane follows the nearest surface every frame, so real-scale distances (~10⁵ apart) don't
 * flicker; each body is its own mesh, so positions stay precise.
 */
export async function createSolarSystem(
  ctx: SpaceContext,
  deps: SolarSystemDeps = {},
): Promise<SpaceInstance> {
  const stored = readPreference(SCALE_PREFERENCE, 'stylised', deps.storage);
  let mode: ScaleMode = stored === 'real' ? 'real' : 'stylised';

  const layouts = new Map<ScaleMode, Map<string, BodyLayout>>();
  const layoutOf = (m: ScaleMode) => {
    if (!layouts.has(m)) layouts.set(m, layout(BODIES, m));
    return layouts.get(m)!;
  };

  const scene = new Scene();
  const system = buildSystem(BODIES);
  scene.add(system.root);
  system.applyLayout(layoutOf(mode));

  const { fov, fill } = SOLAR_SYSTEM.camera;
  const fovY = (fov * Math.PI) / 180;
  const homeDirection = new Vector3(...SOLAR_SYSTEM.camera.direction).normalize();
  const camera = new PerspectiveCamera(fov, 1, NEAR.max, 1e4);
  let aspect = 1;

  /** The whole system framed from `direction`, with limits for the current scale. */
  const homeFor = (m: ScaleMode, direction: Vector3) => {
    const extent = systemExtent(BODIES, layoutOf(m));
    return {
      position: direction
        .clone()
        .multiplyScalar(frameDistance(extent, fovY, aspect, fill))
        .toArray(),
      // Home orbits the Sun: never inside it.
      distance: {
        min: MIN_DISTANCE_FACTOR * layoutOf(m).get('sun')!.radius,
        max: distanceLimits(extent, fovY, aspect).max,
      },
      panLimit: extent,
    };
  };

  const world = (id: string) => system.mesh(id).getWorldPosition(new Vector3());
  // Created before the controls, so the toggle comes before "?" and "Reset view" in Tab order.
  const markers = createBodyMarkers({
    overlay: ctx.overlay,
    camera,
    bodies: BODIES.map((b) => ({ id: b.id, name: b.name, parent: b.parent, size: b.radiusKm })),
    worldOf: world,
  });
  markers.setActive(mode === 'real');
  const toggle = createScaleToggle({
    overlay: ctx.overlay,
    canvas: ctx.canvas,
    signal: ctx.signal,
    mode,
    onChange: (next) => {
      writePreference(SCALE_PREFERENCE, next, deps.storage);
      setScale(next);
    },
  });

  const initial = homeFor(mode, homeDirection);
  const controls = createCameraControls({
    camera,
    canvas: ctx.canvas,
    overlay: ctx.overlay,
    signal: ctx.signal,
    reducedMotion: ctx.reducedMotion,
    coarsePointer: prefersCoarsePointer(),
    label: SOLAR_SYSTEM.title,
    config: {
      focus: [0, 0, 0],
      initialPosition: initial.position,
      distance: initial.distance,
      polar: { min: POLAR_MARGIN, max: Math.PI - POLAR_MARGIN },
      panLimit: initial.panLimit,
      turntable: SOLAR_SYSTEM.turntable,
      zoomSpeed: ZOOM_SPEED,
    },
  });

  function setScale(next: ScaleMode) {
    mode = next;
    system.applyLayout(layoutOf(mode));
    markers.setActive(mode === 'real');
    controls.setHome(homeFor(mode, homeDirection));
    controls.reset(); // re-frame the whole system for the new scale (AC-8), instantly
    fitDepth(true);
  }

  // --- Re-centring zoom (D-023): only at real scale, where the bodies are too small to aim at otherwise.
  const listeners = new AbortController();
  ctx.signal.addEventListener('abort', () => listeners.abort(), { once: true, signal: listeners.signal });
  const recentreAt = (clientX: number, clientY: number) => {
    if (mode !== 'real') return;
    const rect = ctx.canvas.getBoundingClientRect();
    camera.updateMatrixWorld();
    markers.update();
    const id = markers.nearest(clientX - rect.left, clientY - rect.top, RECENTRE_RADIUS);
    if (!id) return;
    const point = world(id);
    if (point.distanceTo(controls.target) > 0) {
      controls.focusOn(point.toArray(), { minDistance: MIN_DISTANCE_FACTOR * radii(id) });
    }
  };
  // Capture phase: before OrbitControls' own listeners on the same canvas start the zoom.
  ctx.canvas.addEventListener('wheel', (e) => recentreAt(e.clientX, e.clientY), {
    capture: true,
    signal: listeners.signal,
  });
  const touches = new Map<number, { x: number; y: number }>();
  ctx.canvas.addEventListener(
    'pointerdown',
    (e) => {
      if (e.pointerType !== 'touch') return;
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.size !== 2) return;
      const [a, b] = [...touches.values()] as [{ x: number; y: number }, { x: number; y: number }];
      recentreAt((a.x + b.x) / 2, (a.y + b.y) / 2); // a pinch starting on a body
    },
    { capture: true, signal: listeners.signal },
  );
  for (const type of ['pointerup', 'pointercancel'] as const) {
    ctx.canvas.addEventListener(type, (e) => touches.delete(e.pointerId), {
      capture: true,
      signal: listeners.signal,
    });
  }

  // --- Depth: near plane at half the nearest surface, far past the whole system.
  const radii = (id: string) => layoutOf(mode).get(id)!.radius;
  function fitDepth(force = false) {
    let nearest = Infinity;
    for (const body of BODIES) {
      nearest = Math.min(nearest, camera.position.distanceTo(world(body.id)) - radii(body.id));
    }
    const near = Math.min(NEAR.max, Math.max(NEAR.min, nearest / 2));
    const far = camera.position.length() + 2 * systemExtent(BODIES, layoutOf(mode));
    const changed = (current: number, next: number) => Math.abs(next - current) > 0.1 * current;
    if (force || changed(camera.near, near) || changed(camera.far, far)) {
      camera.near = near;
      camera.far = far;
      camera.updateProjectionMatrix();
    }
  }
  fitDepth(true);

  return {
    scene,
    camera,
    update(delta) {
      controls.update(delta);
      fitDepth();
      camera.updateMatrixWorld(); // the controls moved the camera; markers project from this frame's pose
      markers.update();
    },
    focusTarget: () => ctx.canvas, // the 3D view (spec 004, AC-13)
    resize(width, height) {
      aspect = width / height;
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
      markers.resize(width, height);
      // Untouched: re-frame along the current direction (keeps the turntable's angle). Moved: keep the view.
      const direction = controls.userMoved
        ? homeDirection
        : camera.position.clone().sub(controls.target).normalize();
      controls.setHome(homeFor(mode, direction));
      fitDepth(true);
    },
    bodies: () =>
      BODIES.map((b) => ({
        id: b.id,
        world: world(b.id).toArray(),
        radius: radii(b.id),
      })),
    dispose() {
      listeners.abort();
      controls.dispose();
      toggle.dispose();
      markers.dispose();
      system.dispose();
    },
  };
}

const factory: SpaceFactory = (ctx) => createSolarSystem(ctx);
export default factory;
