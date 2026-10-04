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
import { disposeObject3D } from '../../shared/dispose';

/** Scene data (Constitution VII). */
export const DEMO_CUBE = {
  name: 'demo-cube',
  size: 1.4,
  /** Radians per second of Space time. */
  rotationSpeed: { x: 0.3, y: 0.5 },
  reducedMotionFactor: 0.2,
  camera: { fov: 50, distance: 4 },
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
  camera.position.set(0, 0, DEMO_CUBE.camera.distance);

  const cube = new Mesh(
    new BoxGeometry(DEMO_CUBE.size, DEMO_CUBE.size, DEMO_CUBE.size),
    new MeshStandardMaterial({ map: createCheckerTexture() }),
  );
  cube.name = DEMO_CUBE.name;
  scene.add(cube);

  const key = new DirectionalLight(0xffffff, DEMO_CUBE.light.key);
  key.position.set(...DEMO_CUBE.light.keyPosition);
  scene.add(new AmbientLight(0xffffff, DEMO_CUBE.light.ambient), key);

  const speed = ctx.reducedMotion ? DEMO_CUBE.reducedMotionFactor : 1;

  return {
    scene,
    camera,
    update(_delta, elapsed) {
      // Pure function of elapsed time, so identical clocks give identical frames (AC-7).
      cube.rotation.x = elapsed * DEMO_CUBE.rotationSpeed.x * speed;
      cube.rotation.y = elapsed * DEMO_CUBE.rotationSpeed.y * speed;
    },
    resize(width, height) {
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    },
    dispose() {
      disposeObject3D(scene);
    },
  };
};

export default createDemoCube;
