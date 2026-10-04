import {
  AmbientLight,
  BoxGeometry,
  DataTexture,
  DirectionalLight,
  Mesh,
  MeshStandardMaterial,
  NearestFilter,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
} from 'three';
import type { SpaceFactory } from '../../core/types';
import { prefersCoarsePointer } from '../../core/capabilities';
import { createCameraControls, type CameraControlsConfig } from '../../shared/controls';
import { disposeObject3D } from '../../shared/dispose';

/** Scene data (Constitution VII). */
export const DEMO_CUBE = {
  name: 'demo-cube',
  title: 'Demo Cube',
  size: 1.4,
  camera: { fov: 50 },
  /**
   * Camera controls (spec 004). The cube holds still; when idle the camera turntable orbits it (D-009).
   * Starts ~23° above the equator so the top face shows too; distance 4 as before.
   */
  controls: {
    focus: [0, 0, 0],
    initialPosition: [0, 1.6, 3.666],
    distance: { min: 2.2, max: 9 },
    polar: { min: 0.15, max: Math.PI - 0.15 },
    panLimit: 1.5,
    turntable: { speed: 1.2, idleDelay: 4 },
  } satisfies CameraControlsConfig,
  texture: { cells: 8, colors: [0x6aa8ff, 0x1d2a44] as const },
  light: { ambient: 0.4, key: 2, keyPosition: [3, 2, 4] as const },
};

/** Checkerboard generated in code: a real GPU texture with no asset file and no DOM canvas. */
function createCheckerTexture(): DataTexture {
  const { cells, colors } = DEMO_CUBE.texture;
  const data = new Uint8Array(cells * cells * 4);
  for (let y = 0; y < cells; y++) {
    for (let x = 0; x < cells; x++) {
      const color = colors[(x + y) % 2] ?? 0xffffff;
      const i = (y * cells + x) * 4;
      data[i] = (color >> 16) & 0xff;
      data[i + 1] = (color >> 8) & 0xff;
      data[i + 2] = color & 0xff;
      data[i + 3] = 255;
    }
  }
  const texture = new DataTexture(data, cells, cells);
  texture.magFilter = NearestFilter;
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

const createDemoCube: SpaceFactory = async (ctx) => {
  const scene = new Scene();
  const camera = new PerspectiveCamera(DEMO_CUBE.camera.fov, 1, 0.1, 100);

  const cube = new Mesh(
    new BoxGeometry(DEMO_CUBE.size, DEMO_CUBE.size, DEMO_CUBE.size),
    new MeshStandardMaterial({ map: createCheckerTexture() }),
  );
  cube.name = DEMO_CUBE.name;
  scene.add(cube);

  const key = new DirectionalLight(0xffffff, DEMO_CUBE.light.key);
  key.position.set(...DEMO_CUBE.light.keyPosition);
  scene.add(new AmbientLight(0xffffff, DEMO_CUBE.light.ambient), key);

  const controls = createCameraControls({
    camera,
    canvas: ctx.canvas,
    overlay: ctx.overlay,
    signal: ctx.signal,
    reducedMotion: ctx.reducedMotion,
    coarsePointer: prefersCoarsePointer(),
    label: DEMO_CUBE.title,
    config: DEMO_CUBE.controls,
  });

  return {
    scene,
    camera,
    update(delta) {
      // Camera motion is driven only by delta, so identical clocks give identical frames (001 AC-7).
      controls.update(delta);
    },
    focusTarget: () => ctx.canvas, // the 3D view (spec 004, AC-13)
    resize(width, height) {
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    },
    dispose() {
      controls.dispose();
      disposeObject3D(scene);
    },
  };
};

export default createDemoCube;
