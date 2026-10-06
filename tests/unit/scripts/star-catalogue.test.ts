import { gunzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BV,
  decodeStars,
  encodeStars,
  parseBsc5,
  parseBsc5Line,
} from '../../../scripts/star-catalogue.mjs';

// Spec 022, T005 (AC-9, D-031): the Yale Bright Star Catalogue (5th rev., CDS V/50) → a compact binary the
// Solar System's sky reads. Pure parts only.

const SIRIUS =
  '2491  9Alp CMaBD-16 1591  48915151881 257I   5423           064044.6-163444064508.9-164258227.22-08.88-1.46   0.00 -0.05';
const NOVA = '  92 NOVA 1572                                     B Cas';

describe('parseBsc5Line', () => {
  it('reads J2000 RA/Dec in degrees, V magnitude and B−V (Sirius)', () => {
    const star = parseBsc5Line(SIRIUS)!;
    expect(star.ra).toBeCloseTo((6 + 45 / 60 + 8.9 / 3600) * 15, 6);
    expect(star.dec).toBeCloseTo(-(16 + 42 / 60 + 58 / 3600), 6);
    expect(star.mag).toBe(-1.46);
    expect(star.bv).toBe(0);
  });

  it('skips entries without J2000 coordinates (novae, extragalactic objects)', () => {
    expect(parseBsc5Line(NOVA)).toBeNull();
    expect(parseBsc5Line('')).toBeNull();
  });

  it('uses a Sun-like colour when B−V is missing', () => {
    const noColour = `${SIRIUS.slice(0, 109)}     `;
    expect(parseBsc5Line(noColour)!.bv).toBe(DEFAULT_BV);
  });
});

describe('parseBsc5 (the shipped source)', () => {
  const text = gunzipSync(readFileSync('assets-src/solar-system/bsc5-catalog.gz')).toString('latin1');
  const stars = parseBsc5(text);

  it('keeps the ~9 100 stars down to magnitude ~6.5', () => {
    expect(stars.length).toBeGreaterThan(9080);
    expect(stars.length).toBeLessThanOrEqual(9110);
    expect(Math.max(...stars.map((s) => s.mag))).toBeLessThan(8);
    expect(Math.min(...stars.map((s) => s.mag))).toBe(-1.46); // Sirius
  });

  it('every star has a valid direction', () => {
    for (const s of stars) {
      expect(s.ra).toBeGreaterThanOrEqual(0);
      expect(s.ra).toBeLessThan(360);
      expect(Math.abs(s.dec)).toBeLessThanOrEqual(90);
    }
  });
});

describe('encodeStars / decodeStars', () => {
  const stars = [
    { ra: 101.2871, dec: -16.7161, mag: -1.46, bv: 0 },
    { ra: 37.9546, dec: 89.2641, mag: 2.02, bv: 0.6 }, // Polaris
    { ra: 88.7929, dec: 7.4071, mag: 0.5, bv: 1.85 }, // Betelgeuse
    { ra: 359.99, dec: -89.99, mag: 7.96, bv: -0.3 },
  ];

  it('writes a "STAR" header, the count, then 6 bytes per star', () => {
    const bytes = encodeStars(stars);
    expect(bytes.byteLength).toBe(8 + 6 * stars.length);
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe('STAR');
    expect(new DataView(bytes.buffer).getUint32(4, true)).toBe(stars.length);
  });

  it('round-trips within 0.01°, 0.05 mag and 0.02 in B−V', () => {
    const decoded = decodeStars(encodeStars(stars));
    stars.forEach((s, i) => {
      const d = decoded[i]!;
      expect(Math.abs(((d.ra - s.ra + 540) % 360) - 180)).toBeLessThan(0.01);
      expect(Math.abs(d.dec - s.dec)).toBeLessThan(0.01);
      expect(Math.abs(d.mag - s.mag)).toBeLessThan(0.05);
      expect(Math.abs(d.bv - s.bv)).toBeLessThan(0.02);
    });
  });

  it('rejects bytes that are not a star file', () => {
    expect(() => decodeStars(new Uint8Array([1, 2, 3, 4, 0, 0, 0, 0]))).toThrow(/not a star catalogue/);
  });
});
