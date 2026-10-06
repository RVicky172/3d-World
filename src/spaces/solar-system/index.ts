import { PerspectiveCamera, Quaternion, Scene, Vector3, type WebGLRenderer } from 'three';
import { prefersCoarsePointer } from '../../core/capabilities';
import { readPreference, writePreference } from '../../core/preferences';
import type { SpaceContext, SpaceFactory, SpaceInstance } from '../../core/types';
import { createCameraControls } from '../../shared/controls';
import { createKtx2, type Ktx2 } from '../../shared/ktx2';
import { distanceLimits, frameDistance } from '../../shared/model-viewer/framing';
import { BODIES, SKY, SOLAR_SYSTEM } from './data';
import { createGlow } from './glow';
import { createFader, loadImagery } from './imagery';
import { createBodyMarkers } from './markers';
import { createOrbitLines } from './orbit-lines';
import { createScaleToggle } from './scale-toggle';
import { createStarfield, decodeStars, type Starfield } from './stars';
import { createPlacement, layout, systemExtent } from './scale';
import { buildSystem } from './scene';
import { advance, initialTime, RANGE, SPEEDS, type SimTime } from './time';
import { createTimeControls } from './time-controls';
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
/** Following stops once the orbit target is further than this (relative) from the followed body (plan §6). */
const FOLLOW_TOLERANCE = 1e-9;

/** Seams for unit tests. */
export interface SolarSystemDeps {
  storage?: Storage;
  /** The KTX2 loader for the imagery (spec 022); owned by the imagery load, which frees it. */
  createKtx2?: (renderer: WebGLRenderer) => Ktx2;
  /** The star catalogue's bytes (spec 022). */
  loadStars?: (url: string, signal: AbortSignal) => Promise<ArrayBuffer>;
  /** Where the imagery and stars live. */
  baseUrl?: string;
}

/** Our own static file, as bytes. */
async function fetchBytes(url: string, signal: AbortSignal): Promise<ArrayBuffer> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.arrayBuffer();
}

/** What survives a WebGL context loss (spec 021, AC-12): the simulated time. */
interface SavedState {
  time: SimTime;
}

const isSimTime = (value: unknown): value is SimTime => {
  const t = value as Partial<SimTime> | null;
  return (
    typeof t === 'object' &&
    t !== null &&
    typeof t.days === 'number' &&
    Number.isFinite(t.days) &&
    typeof t.speed === 'string' &&
    t.speed in SPEEDS &&
    typeof t.backwards === 'boolean' &&
    typeof t.playing === 'boolean'
  );
};

/**
 * The Solar System Space (specs 020, 021): the Sun, eight planets and seven moons from sourced data, in a stylised
 * or a true-to-scale layout, moving on their orbits and spinning as a simulated clock runs.
 * - **Time:** opens at the start time the core passes in, 1 week per second (paused under reduced motion), within
 *   1800–2050; moved only by the frame delta. A context loss restores it (`saveState`/`savedState`).
 * - **Scale:** switching only moves and resizes bodies and swaps the orbit lines, then re-frames the system.
 * - **Real scale:** name markers show where the sub-pixel bodies are; a zoom that starts on one re-centres on it
 *   (D-023) and then follows it as it moves, until the visitor pans, resets or re-centres elsewhere (Q4).
 * - **Depth:** the near plane follows the nearest surface every frame, so real-scale distances don't flicker.
 * - **Surfaces (022):** opens in plain colours; the imagery and the sky load in the background, each map fading
 *   in as it arrives (progress in the compact indicator). Leaving or a context loss abandons them.
 */
export async function createSolarSystem(
  ctx: SpaceContext,
  deps: SolarSystemDeps = {},
): Promise<SpaceInstance> {
  const stored = readPreference(SCALE_PREFERENCE, 'stylised', deps.storage);
  let mode: ScaleMode = stored === 'real' ? 'real' : 'stylised';
  const saved = (ctx.savedState as Partial<SavedState> | undefined)?.time;
  let time: SimTime = isSimTime(saved) ? saved : initialTime(ctx.startTime, ctx.reducedMotion);

  const layouts = new Map<ScaleMode, Map<string, BodyLayout>>();
  const layoutOf = (m: ScaleMode) => {
    if (!layouts.has(m)) layouts.set(m, layout(BODIES, m));
    return layouts.get(m)!;
  };

  const scene = new Scene();
  const system = buildSystem(BODIES);
  scene.add(system.root);
  const glow = createGlow(system.mesh('sun'));
  const fader = createFader(ctx.reducedMotion);
  /** Imagery and stars still arriving: abandoned on leaving, a context loss or dispose. */
  const loading = new AbortController();
  ctx.signal.addEventListener('abort', () => loading.abort(), { once: true, signal: loading.signal });
  let stars: Starfield | null = null;
  let viewportHeight = 1;
  system.applyLayout(layoutOf(mode));
  const placement = createPlacement(BODIES);
  const orbitLines = createOrbitLines(system.root, BODIES, layoutOf('stylised'), time.days);
  orbitLines.setMode(mode);

  const world = (id: string) => system.mesh(id).getWorldPosition(new Vector3());
  const signedSpeed = () => SPEEDS[time.speed] * (time.backwards ? -1 : 1);
  /** The body a re-centre is following, and where it was when the camera last moved with it. */
  let following: { id: string; point: Vector3 } | null = null;
  /** The time state the bodies were last placed for. */
  let placed: SimTime | null = null;

  /** Positions, orientations and orbit lines for `time`; then the followed body's move is applied to the view. */
  function place() {
    system.applyPositions(placement.at(layoutOf(mode), mode, time.days));
    // Paused, nothing spins: bodies show their true orientation for the date (the fast-spin hold is for motion).
    system.applyOrientations(time.days, time.playing ? signedSpeed() : 0);
    orbitLines.update(time.days);
    placed = time;
    checkFollowing(); // a reset or pan since the last frame: don't drag the new view along
    if (following) {
      const now = world(following.id);
      controls.follow(now.clone().sub(following.point));
      following.point.copy(now);
    }
  }
  place();

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

  // Created before the controls, so Tab order is "True scale" → time controls → "?" → "Reset view".
  const markers = createBodyMarkers({
    overlay: ctx.overlay,
    camera,
    bodies: BODIES.map((b) => ({ id: b.id, name: b.name, parent: b.parent, size: b.radiusKm })),
    worldOf: world,
  });
  markers.setActive(mode === 'real');
  // "True scale" and the time controls share one bottom-left row, which wraps on narrow screens (plan §7).
  const bar = document.createElement('div');
  bar.className = 'solar-bar';
  ctx.overlay.append(bar);
  const toggle = createScaleToggle({
    overlay: bar,
    canvas: ctx.canvas,
    signal: ctx.signal,
    mode,
    onChange: (next) => {
      writePreference(SCALE_PREFERENCE, next, deps.storage);
      setScale(next);
    },
  });
  const timeControls = createTimeControls({
    overlay: bar,
    signal: ctx.signal,
    time,
    // The controls know the date only as of the last frame shown: keep the current one.
    onChange: (next) => (time = { ...next, days: time.days }),
  });
  let shown = time;

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
    following = null;
    system.applyLayout(layoutOf(mode));
    orbitLines.setMode(mode);
    place();
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
    following = { id, point }; // follow it as time moves it (Q4)
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

  /** A pan, reset or re-centre elsewhere moved the target off the followed body: stop following (plan §6). */
  function checkFollowing() {
    if (!following) return;
    const off = controls.target.distanceTo(following.point);
    if (off > FOLLOW_TOLERANCE * (1 + following.point.length())) following = null;
  }

  // --- Depth: near plane at half the nearest surface (Saturn's: its rings' outer edge), far past the system.
  const radii = (id: string) => layoutOf(mode).get(id)!.radius;
  const reach = new Map(BODIES.map((b) => [b.id, b.rings ? b.rings.outerKm / b.radiusKm : 1]));
  function fitDepth(force = false) {
    let nearest = Infinity;
    for (const body of BODIES) {
      nearest = Math.min(
        nearest,
        camera.position.distanceTo(world(body.id)) - reach.get(body.id)! * radii(body.id),
      );
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

  // --- Imagery and sky (spec 022): in the background, after the view is usable.
  const baseUrl = deps.baseUrl ?? `${import.meta.env.BASE_URL}assets/solar-system/`;
  void loadImagery({
    bodies: BODIES,
    baseUrl,
    loader: (deps.createKtx2 ?? createKtx2)(ctx.renderer),
    signal: loading.signal,
    onTexture: (id, layer, texture) => fader.add(system.attach(id, layer, texture)),
    onProgress: (fraction) => ctx.reportBackgroundProgress?.(fraction, 'imagery'),
  });
  (deps.loadStars ?? fetchBytes)(baseUrl + SKY.stars.file, loading.signal)
    .then((bytes) => {
      if (loading.signal.aborted) return;
      stars = createStarfield(decodeStars(bytes));
      stars.setPixelRatio(ctx.renderer.getPixelRatio());
      scene.add(stars.points);
    })
    .catch((error: unknown) => {
      if (!loading.signal.aborted) console.warn('Solar System: the star catalogue failed to load', error);
    });

  return {
    scene,
    camera,
    // Plan §8: time → bodies (+ follow) → controls → follow check → depth → camera matrix → markers → date text.
    update(delta) {
      fader.advance(delta);
      const step = advance(time, delta);
      time = step.time;
      if (step.limit) timeControls.announceLimit(step.limit);
      if (time !== placed) {
        place();
        markers.invalidate(); // bodies moved, perhaps under a still camera
      }
      controls.update(delta);
      checkFollowing();
      fitDepth();
      camera.updateMatrixWorld(); // the controls moved the camera; markers project from this frame's pose
      system.updateSun(camera);
      glow.update(camera, viewportHeight);
      markers.update();
      if (time !== shown) {
        timeControls.set(time);
        shown = time;
      }
    },
    focusTarget: () => ctx.canvas, // the 3D view (spec 004, AC-13)
    resize(width, height) {
      aspect = width / height;
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
      viewportHeight = height;
      stars?.setPixelRatio(ctx.renderer.getPixelRatio());
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
        quaternion: system.mesh(b.id).getWorldQuaternion(new Quaternion()).toArray(),
      })),
    saveState: (): SavedState => ({ time }),
    simTime: () => ({ days: time.days, speed: signedSpeed(), playing: time.playing }),
    setSimTime(days) {
      time = { ...time, days: Math.min(RANGE.end, Math.max(RANGE.start, days)) };
      place();
      markers.invalidate();
    },
    dispose() {
      loading.abort(); // late textures and stars are disposed as they arrive
      fader.clear();
      stars?.dispose();
      glow.dispose();
      listeners.abort();
      controls.dispose();
      timeControls.dispose();
      toggle.dispose();
      bar.remove();
      markers.dispose();
      orbitLines.dispose();
      system.dispose();
    },
  };
}

const factory: SpaceFactory = (ctx) => createSolarSystem(ctx);
export default factory;
