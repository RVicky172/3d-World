import {
  PerspectiveCamera,
  PMREMGenerator,
  Scene,
  Vector3,
  type Object3D,
  type Texture,
  type WebGLRenderer,
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { prefersCoarsePointer } from '../../core/capabilities';
import type { SpaceContext, SpaceInstance } from '../../core/types';
import { createCameraControls } from '../controls';
import { createHotspots } from '../hotspots';
import { disposeObject3D } from '../dispose';
import { showCredit } from './credit';
import { distanceLimits, fitModel, frameDistance } from './framing';
import { createGltfLoader, type ModelLoader } from './loader';
import type { ModelViewerConfig } from './types';

export type { AssetCredit, ModelViewerConfig } from './types';
export type { HotspotConfig } from '../hotspots';

const DEFAULT_FILL = 0.75;
/** Keep the camera off the poles so the view never flips (as in 004). */
const POLAR_MARGIN = 0.15;
/** Blur of the baked environment: soft studio reflections. */
const ENVIRONMENT_SIGMA = 0.04;

/** Seams for unit tests: no network, no WebGL. */
export interface ModelViewerDeps {
  /** Builds the model loader (Meshopt + KTX2 in the app, spec 011). */
  createLoader?: (renderer: WebGLRenderer) => ModelLoader;
  createEnvironment?: (renderer: WebGLRenderer) => Texture;
  /** Joined with `config.model.path`; the site's base URL in the app. */
  baseUrl?: string;
}

/**
 * Generated studio lighting (D-012): bakes three's procedural RoomEnvironment into a PMREM texture for
 * `scene.environment`. The generator and the room are freed straight away; only the texture lives on.
 * The texture belongs to a render target, and three only frees render-target textures through the
 * target (`texture.dispose()` alone leaks one GPU texture per visit, AC-10), so disposing the texture
 * disposes its target.
 */
function createStudioEnvironment(renderer: WebGLRenderer): Texture {
  const generator = new PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const target = generator.fromScene(room, ENVIRONMENT_SIGMA);
  room.dispose();
  generator.dispose();
  const freeTarget = () => {
    target.texture.removeEventListener('dispose', freeTarget);
    target.dispose();
  };
  target.texture.addEventListener('dispose', freeTarget);
  return target.texture;
}

/**
 * Shared "one object, many angles" viewer (spec 010). A model Space is its data plus
 * `(ctx) => createModelViewer(ctx, CONFIG)`. Loads the GLB first, so a failed load (model or decoder)
 * allocates nothing and rejects into the SpaceManager's "Failed to load" (AC-9; 011 AC-12). The model is centred, lit by a generated
 * environment, auto-framed for every viewport size (AC-2, AC-3) and explored with the shared controls.
 */
export async function createModelViewer(
  ctx: SpaceContext,
  config: ModelViewerConfig,
  deps: ModelViewerDeps = {},
): Promise<SpaceInstance> {
  const baseUrl = deps.baseUrl ?? import.meta.env.BASE_URL;
  const loader = (deps.createLoader ?? createGltfLoader)(ctx.renderer);
  let gltf: { scene: Object3D };
  try {
    gltf = await loader.load(baseUrl + config.model.path, (fraction) => ctx.reportProgress?.(fraction));
  } finally {
    // Textures are transcoded by now, so the decoder workers are idle: free them, success or not (AC-13).
    loader.dispose();
  }

  const scene = new Scene();
  const model = gltf.scene;
  const { radius } = fitModel(model);
  scene.add(model);
  scene.environment = (deps.createEnvironment ?? createStudioEnvironment)(ctx.renderer);

  const fovY = (config.camera.fov * Math.PI) / 180;
  const fill = config.fill ?? DEFAULT_FILL;
  const homeDirection = new Vector3(...config.camera.direction).normalize();
  const camera = new PerspectiveCamera(config.camera.fov, 1, radius / 100, radius * 100);

  /** Home view for an aspect ratio: framed distance along `direction`, and matching zoom limits. */
  const homeFor = (aspect: number, direction: Vector3) => ({
    position: direction
      .clone()
      .multiplyScalar(frameDistance(radius, fovY, aspect, fill))
      .toArray(),
    distance: distanceLimits(radius, fovY, aspect),
    panLimit: radius,
  });

  const initial = homeFor(1, homeDirection); // the Engine resizes us to the real aspect straight away
  // Markers go in before the controls so they come first in Tab order (spec 012, AC-4). They act on the
  // controls only when activated, which is after both exist.
  const hotspots = config.hotspots?.length
    ? createHotspots({
        overlay: ctx.overlay,
        canvas: ctx.canvas,
        signal: ctx.signal,
        camera,
        model,
        hotspots: config.hotspots,
        epsilon: 0.01 * radius,
        controls: {
          turnTo: (direction, options) => controls.turnTo(direction, options),
          holdTurntable: (hold) => controls.holdTurntable(hold),
        },
      })
    : null;
  const controls = createCameraControls({
    camera,
    canvas: ctx.canvas,
    overlay: ctx.overlay,
    signal: ctx.signal,
    reducedMotion: ctx.reducedMotion,
    coarsePointer: prefersCoarsePointer(),
    label: config.title,
    config: {
      focus: [0, 0, 0],
      initialPosition: initial.position,
      distance: initial.distance,
      polar: { min: POLAR_MARGIN, max: Math.PI - POLAR_MARGIN },
      panLimit: radius,
      turntable: config.turntable,
    },
  });
  const removeCredit = showCredit(ctx.overlay, config.assets);

  return {
    scene,
    camera,
    update(delta) {
      controls.update(delta);
      hotspots?.update(delta); // after the controls, so markers match this frame's camera (AC-6)
    },
    focusTarget: () => ctx.canvas, // the 3D view (spec 004, AC-13)
    hotspotPositions: () => hotspots?.positions() ?? [],
    resize(width, height) {
      const aspect = width / height;
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
      // Untouched: re-frame along the current direction, keeping the turntable's angle (AC-3).
      // Moved by the visitor: their view stays; Reset goes to the framed view from the home direction.
      const direction = controls.userMoved
        ? homeDirection
        : camera.position.clone().sub(controls.target).normalize();
      controls.setHome(homeFor(aspect, direction));
      hotspots?.resize(width, height);
    },
    dispose() {
      hotspots?.dispose();
      controls.dispose();
      removeCredit();
      disposeObject3D(scene);
    },
  };
}
