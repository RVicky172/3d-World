import { BufferAttribute, BufferGeometry, Points, ShaderMaterial } from 'three';
import { toScene, type Vector3Like } from './orbit';

/**
 * The night sky's data (spec 022, AC-9): `public/assets/solar-system/stars.bin`, packed by
 * scripts/build-star-catalogue.mjs from the Yale Bright Star Catalogue. Layout (little-endian): "STAR", uint32
 * count, then per star uint16 RA (0–360° → 0–65536), int16 Dec (±90° → ±32767), uint8 (V + 2) × 20, int8 B−V × 50.
 */

const DEG = Math.PI / 180;
/** The J2000 obliquity, as in 021's frames. */
const COS_E = Math.cos(23.4392911 * DEG);
const SIN_E = Math.sin(23.4392911 * DEG);

export interface Sky {
  count: number;
  /** Unit directions in scene axes, xyz per star. */
  directions: Float32Array;
  /** V magnitudes. */
  magnitudes: Float32Array;
  /** Display (sRGB) RGB 0–1 per star, from B−V; drawn as is, without an output conversion. */
  colours: Float32Array;
}

/** A J2000 RA/Dec (degrees) as a unit direction in scene axes: equatorial → ecliptic → (x, z, −y). */
export function starDirection(raDeg: number, decDeg: number, out: Vector3Like): Vector3Like {
  const [ra, dec] = [raDeg * DEG, decDeg * DEG];
  const [x, y, z] = [Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec)];
  out.x = x;
  out.y = y * COS_E + z * SIN_E;
  out.z = -y * SIN_E + z * COS_E;
  return toScene(out);
}

/** Point size in CSS px: Sirius ~4.5 px, the faintest naked-eye stars 1 px. */
export function starSize(magnitude: number): number {
  return Math.min(4.5, Math.max(1, 3.2 - 0.4 * magnitude));
}

/** Opacity: full for the bright stars, fading towards magnitude 6.5 but never invisible. */
export function starAlpha(magnitude: number): number {
  return Math.min(1, Math.max(0.12, 1.15 - 0.16 * magnitude));
}

/**
 * A star's colour from B−V: Ballesteros' temperature, then a blackbody approximation (Tanner Helland's fit),
 * normalised so the brightest channel is 1.
 */
export function starColour(bv: number, out: Vector3Like): Vector3Like {
  const t = (4600 * (1 / (0.92 * bv + 1.7) + 1 / (0.92 * bv + 0.62))) / 100;
  const r = t <= 66 ? 255 : 329.698727446 * (t - 60) ** -0.1332047592;
  const g =
    t <= 66 ? 99.4708025861 * Math.log(t) - 161.1195681661 : 288.1221695283 * (t - 60) ** -0.0755148492;
  const b = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  const [cr, cg, cb] = [r, g, b].map((c) => Math.min(255, Math.max(0, c)) / 255) as [number, number, number];
  const top = Math.max(cr, cg, cb, 1e-6);
  out.x = cr / top;
  out.y = cg / top;
  out.z = cb / top;
  return out;
}

/** Decodes `stars.bin`. Throws on anything that isn't a star catalogue. */
export function decodeStars(buffer: ArrayBuffer): Sky {
  const view = new DataView(buffer);
  const magic = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
  if (magic !== 'STAR') throw new Error('not a star catalogue');
  const count = view.getUint32(4, true);
  const directions = new Float32Array(count * 3);
  const magnitudes = new Float32Array(count);
  const colours = new Float32Array(count * 3);
  const v = { x: 0, y: 0, z: 0 };
  for (let i = 0; i < count; i++) {
    const at = 8 + 6 * i;
    starDirection((view.getUint16(at, true) / 65536) * 360, (view.getInt16(at + 2, true) / 32767) * 90, v);
    directions.set([v.x, v.y, v.z], 3 * i);
    magnitudes[i] = view.getUint8(at + 4) / 20 - 2;
    starColour(view.getInt8(at + 5) / 50, v);
    colours.set([v.x, v.y, v.z], 3 * i);
  }
  return { count, directions, magnitudes, colours };
}

export interface Starfield {
  points: Points;
  /** The renderer's pixel ratio: point sizes are in device pixels. */
  setPixelRatio(ratio: number): void;
  dispose(): void;
}

/**
 * The sky (AC-9) as one `Points`: each star a direction, turned by the view's rotation only and placed on the far
 * plane (`xyww`), so it sits at infinity at both scales whatever the camera's position, zoom or far plane. Drawn
 * first (render order −1, no depth write); depth-tested so the bodies in front hide it; never culled or picked.
 */
export function createStarfield(sky: Sky): Starfield {
  const geometry = new BufferGeometry();
  const size = new Float32Array(sky.count);
  const colour = new Float32Array(sky.count * 4);
  for (let i = 0; i < sky.count; i++) {
    size[i] = starSize(sky.magnitudes[i]!);
    colour.set(sky.colours.subarray(3 * i, 3 * i + 3), 4 * i);
    colour[4 * i + 3] = starAlpha(sky.magnitudes[i]!);
  }
  geometry.setAttribute('position', new BufferAttribute(sky.directions, 3));
  geometry.setAttribute('aSize', new BufferAttribute(size, 1));
  geometry.setAttribute('aColour', new BufferAttribute(colour, 4));

  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uPixelRatio: { value: 1 } },
    vertexShader: /* glsl */ `
      attribute float aSize;
      attribute vec4 aColour;
      uniform float uPixelRatio;
      varying vec4 vColour;
      void main() {
        vColour = aColour;
        gl_Position = ( projectionMatrix * vec4( mat3( viewMatrix ) * position, 1.0 ) ).xyww;
        gl_PointSize = aSize * uPixelRatio;
      }`,
    fragmentShader: /* glsl */ `
      varying vec4 vColour;
      void main() {
        // A soft round point: full inside, fading over its outer edge.
        float edge = 1.0 - smoothstep( 0.25, 0.5, length( gl_PointCoord - 0.5 ) );
        gl_FragColor = vec4( vColour.rgb, vColour.a * edge );
      }`,
  });

  const points = new Points(geometry, material);
  points.name = 'stars';
  points.renderOrder = -1;
  points.frustumCulled = false;
  points.raycast = () => {};
  return {
    points,
    setPixelRatio(ratio) {
      material.uniforms.uPixelRatio!.value = ratio;
    },
    dispose() {
      points.removeFromParent();
      geometry.dispose();
      material.dispose();
    },
  };
}
