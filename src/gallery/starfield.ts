import { BufferGeometry, Float32BufferAttribute, Points, PointsMaterial } from 'three';

/** Gallery backdrop data (Constitution VII). One draw call, no textures. */
export const STARFIELD = {
  count: 1500,
  /** Stars sit in a shell around the camera at the origin. */
  radius: { min: 40, max: 90 },
  size: 1.6,
  opacity: 0.85,
  color: 0xcfd8ff,
  /** Radians per second of Space time. */
  speed: { x: 0.003, y: 0.01 },
  /** Fixed seed: identical layout every run, so frames can be compared in tests. */
  seed: 0x3d,
};

/** mulberry32: tiny seeded PRNG returning floats in [0, 1). */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Starfield {
  object: Points;
  /** Pure function of elapsed time; a no-op with reduced motion (spec 003, AC-13). */
  update(elapsedSeconds: number): void;
}

export function createStarfield(reducedMotion: boolean): Starfield {
  const { count, radius, seed } = STARFIELD;
  const random = seededRandom(seed);
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    // Uniform direction on the unit sphere, then a distance within the shell.
    const z = random() * 2 - 1;
    const theta = random() * Math.PI * 2;
    const ring = Math.sqrt(1 - z * z);
    const r = radius.min + random() * (radius.max - radius.min);
    positions[i * 3] = Math.cos(theta) * ring * r;
    positions[i * 3 + 1] = Math.sin(theta) * ring * r;
    positions[i * 3 + 2] = z * r;
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  const material = new PointsMaterial({
    color: STARFIELD.color,
    size: STARFIELD.size,
    sizeAttenuation: false,
    transparent: true,
    opacity: STARFIELD.opacity,
    depthWrite: false,
  });
  const object = new Points(geometry, material);
  object.name = 'starfield';

  return {
    object,
    update(elapsed) {
      if (reducedMotion) return;
      object.rotation.x = elapsed * STARFIELD.speed.x;
      object.rotation.y = elapsed * STARFIELD.speed.y;
    },
  };
}
