// @ts-check
// Pure helpers for the dev-only star catalogue build (spec 022, T005, AC-9, D-031): parse the Yale Bright Star
// Catalogue (5th rev., CDS V/50, fixed-width; byte positions from its ReadMe) and pack it into a compact binary
// the Solar System's sky reads at runtime. Unit-tested from tests/unit/scripts/star-catalogue.test.ts; the build
// lives in scripts/build-star-catalogue.mjs.
//
// Binary layout (little-endian): "STAR", uint32 count, then per star:
//   uint16 RA (0–360° → 0–65535), int16 Dec (−90–90° → −32767–32767), uint8 (V + 2) × 20, int8 B−V × 50.

/** B−V for stars the catalogue gives no colour: about the Sun's (white-yellow). */
export const DEFAULT_BV = 0.65;

/**
 * @typedef {{ ra: number; dec: number; mag: number; bv: number }} Star degrees (J2000), V magnitude, B−V
 */

/**
 * One catalogue record, or null when it has no J2000 position (novae, extragalactic objects).
 * @param {string} line
 * @returns {Star | null}
 */
export function parseBsc5Line(line) {
  const field = (/** @type {number} */ from, /** @type {number} */ to) => line.slice(from - 1, to).trim();
  const [rah, ram, ras, sign, ded, dem, des, vmag] = [
    field(76, 77),
    field(78, 79),
    field(80, 83),
    field(84, 84),
    field(85, 86),
    field(87, 88),
    field(89, 90),
    field(103, 107),
  ];
  if (!rah || !ded || !vmag) return null;
  const ra = (Number(rah) + Number(ram) / 60 + Number(ras) / 3600) * 15;
  const dec = (sign === '-' ? -1 : 1) * (Number(ded) + Number(dem) / 60 + Number(des) / 3600);
  const bv = field(110, 114);
  return { ra, dec, mag: Number(vmag), bv: bv ? Number(bv) : DEFAULT_BV };
}

/**
 * @param {string} text the whole catalogue
 * @returns {Star[]}
 */
export function parseBsc5(text) {
  /** @type {Star[]} */
  const stars = [];
  for (const line of text.split(/\r?\n/)) {
    const star = parseBsc5Line(line);
    if (star) stars.push(star);
  }
  return stars;
}

/**
 * @param {readonly Star[]} stars
 * @returns {Uint8Array}
 */
export function encodeStars(stars) {
  const bytes = new Uint8Array(8 + 6 * stars.length);
  const view = new DataView(bytes.buffer);
  bytes.set(
    [...'STAR'].map((c) => c.charCodeAt(0)),
    0,
  );
  view.setUint32(4, stars.length, true);
  stars.forEach((s, i) => {
    const at = 8 + 6 * i;
    view.setUint16(at, Math.round(((((s.ra % 360) + 360) % 360) / 360) * 65536) % 65536, true);
    view.setInt16(at + 2, Math.round((s.dec / 90) * 32767), true);
    view.setUint8(at + 4, Math.max(0, Math.min(255, Math.round((s.mag + 2) * 20))));
    view.setInt8(at + 5, Math.max(-128, Math.min(127, Math.round(s.bv * 50))));
  });
  return bytes;
}

/**
 * The inverse of `encodeStars` (for tests; the app decodes with its own copy in src/spaces/solar-system/stars.ts).
 * @param {Uint8Array} bytes
 * @returns {Star[]}
 */
export function decodeStars(bytes) {
  if (String.fromCharCode(...bytes.slice(0, 4)) !== 'STAR') throw new Error('not a star catalogue');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = view.getUint32(4, true);
  return Array.from({ length: count }, (_, i) => {
    const at = 8 + 6 * i;
    return {
      ra: (view.getUint16(at, true) / 65536) * 360,
      dec: (view.getInt16(at + 2, true) / 32767) * 90,
      mag: view.getUint8(at + 4) / 20 - 2,
      bv: view.getInt8(at + 5) / 50,
    };
  });
}
