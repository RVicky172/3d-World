import {
  AdditiveBlending,
  DataTexture,
  Sprite,
  SpriteMaterial,
  Vector3,
  type Mesh,
  type PerspectiveCamera,
} from 'three';

/** The Sun's glow (spec 022, AC-10, Q7: static): a size rule and the sprite. */

/** 4 Sun radii across, and never under 48 CSS px on screen (real scale's home view shows the Sun < 1 px). */
export const GLOW = { radii: 4, minPx: 48 } as const;

/**
 * The glow sprite's size in world units: the larger of `GLOW.radii` Sun radii and `GLOW.minPx` CSS px at the
 * Sun's distance from the camera.
 */
export function glowSize(
  sunRadius: number,
  distance: number,
  fovYRadians: number,
  viewportHeightPx: number,
): number {
  const worldPerPx = (2 * distance * Math.tan(fovYRadians / 2)) / viewportHeightPx;
  return Math.max(GLOW.radii * sunRadius, GLOW.minPx * worldPerPx);
}

/** The halo's colour (warm white) and texture size. */
const COLOUR = 0xffd9a0;
const TEXTURE_PX = 128;

/** A radial falloff, white with alpha (1 − r)² … 0 at the edge: generated, so no canvas is needed. */
function halo(): DataTexture {
  const data = new Uint8Array(TEXTURE_PX * TEXTURE_PX * 4);
  for (let y = 0; y < TEXTURE_PX; y++) {
    for (let x = 0; x < TEXTURE_PX; x++) {
      const r = Math.hypot(x + 0.5 - TEXTURE_PX / 2, y + 0.5 - TEXTURE_PX / 2) / (TEXTURE_PX / 2);
      const i = 4 * (y * TEXTURE_PX + x);
      data.fill(255, i, i + 3);
      data[i + 3] = Math.round(255 * Math.max(0, 1 - r) ** 2);
    }
  }
  const texture = new DataTexture(data, TEXTURE_PX, TEXTURE_PX);
  texture.needsUpdate = true;
  return texture;
}

export interface Glow {
  sprite: Sprite;
  /** Sizes the sprite for this frame's camera (after the controls). */
  update(camera: PerspectiveCamera, viewportHeightPx: number): void;
  dispose(): void;
}

/**
 * An additive sprite at the Sun, beside it under the same parent (the Sun's scale and spin don't apply). Depth-
 * tested, so the Sun's disc hides the halo behind it and bodies in front stay unchanged; no depth write, so it
 * hides nothing; never picked.
 */
export function createGlow(sun: Mesh): Glow {
  const map = halo();
  const material = new SpriteMaterial({
    map,
    color: COLOUR,
    blending: AdditiveBlending,
    depthTest: true,
    depthWrite: false,
  });
  const sprite = new Sprite(material);
  sprite.name = 'sun-glow';
  sprite.position.copy(sun.position);
  sprite.raycast = () => {};
  sun.parent?.add(sprite);

  const sunWorld = new Vector3();
  const sunScale = new Vector3();
  const cameraWorld = new Vector3();
  return {
    sprite,
    update(camera, viewportHeightPx) {
      sun.getWorldPosition(sunWorld);
      sun.getWorldScale(sunScale);
      const distance = camera.getWorldPosition(cameraWorld).distanceTo(sunWorld);
      sprite.scale.setScalar(glowSize(sunScale.x, distance, (camera.fov * Math.PI) / 180, viewportHeightPx));
    },
    dispose() {
      sprite.removeFromParent();
      material.dispose();
      map.dispose();
    },
  };
}
