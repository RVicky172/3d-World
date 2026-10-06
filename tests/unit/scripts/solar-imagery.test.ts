import { describe, expect, it } from 'vitest';
import {
  IMAGERY,
  columnShift,
  fillNoData,
  outputPath,
  rollColumns,
  targetSize,
} from '../../../scripts/solar-imagery.mjs';

// Spec 022, T004 (D-031): the dev-only fetch of the Solar System's source maps. Pure parts only; the network
// call is never made in tests or CI.

const BODIES = [
  'sun',
  'mercury',
  'venus',
  'earth',
  'moon',
  'mars',
  'jupiter',
  'saturn',
  'uranus',
  'neptune',
  'io',
  'europa',
  'ganymede',
  'callisto',
  'titan',
  'triton',
];
const LAYERS = ['earth-clouds', 'earth-night', 'earth-ocean', 'saturn-rings'];
const PLANETS = ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'];

describe('IMAGERY (D-031)', () => {
  it('lists one map per body plus Earth’s three layers and Saturn’s rings', () => {
    expect(IMAGERY.map((m) => m.id).sort()).toEqual([...BODIES, ...LAYERS].sort());
  });

  it('records where each map comes from: an https URL, a page, a credit and an allowed licence', () => {
    for (const m of IMAGERY) {
      expect(m.url, m.id).toMatch(/^https:\/\//);
      expect(m.page, m.id).toMatch(/^https?:\/\//);
      expect(m.credit.length, m.id).toBeGreaterThan(3);
      expect(['Public domain', 'CC BY 4.0'], m.id).toContain(m.licence);
    }
  });

  it('takes the Sun, Venus, Saturn, its rings, Uranus, Neptune and Earth’s oceans from Solar System Scope (CC BY)', () => {
    const ccBy = IMAGERY.filter((m) => m.licence === 'CC BY 4.0').map((m) => m.id);
    expect(ccBy.sort()).toEqual([
      'earth-ocean',
      'neptune',
      'saturn',
      'saturn-rings',
      'sun',
      'uranus',
      'venus',
    ]);
    for (const m of IMAGERY.filter((x) => x.licence === 'CC BY 4.0'))
      expect(m.credit).toMatch(/Solar System Scope/);
  });

  it('records each map’s longitude at its left edge (east-positive), from its own georeferencing', () => {
    const left = Object.fromEntries(IMAGERY.map((m) => [m.id, m.leftEdgeLongitudeDeg]));
    // Centred on 180° (GeoTIFF central meridian 180): Ganymede, Europa, Callisto, Titan.
    for (const id of ['ganymede', 'europa', 'callisto', 'titan']) expect(left[id], id).toBe(0);
    for (const id of ['io', 'mars', 'triton', 'moon', 'jupiter', 'mercury', 'earth'])
      expect(left[id], id).toBe(-180);
  });

  it('tints only the greyscale maps, by body colour; Titan at low contrast', () => {
    const tinted = IMAGERY.filter((m) => m.tint).map((m) => m.id);
    expect(tinted.sort()).toEqual(['callisto', 'europa', 'mercury', 'titan']);
    const titan = IMAGERY.find((m) => m.id === 'titan')!;
    expect(titan.contrast).toBeGreaterThan(0);
    expect(titan.contrast).toBeLessThan(1);
  });
});

describe('targetSize (D-029)', () => {
  it('ships planets at 2K and the Sun, moons, Earth’s layers and the rings at 1K', () => {
    for (const m of IMAGERY) {
      expect(targetSize(m.id).width, m.id).toBe(PLANETS.includes(m.id) ? 2048 : 1024);
      if (m.id !== 'saturn-rings') expect(targetSize(m.id).height, m.id).toBe(targetSize(m.id).width / 2);
    }
  });
});

describe('outputPath', () => {
  it('writes JPEGs into assets-src/solar-system/, and the rings as PNG (they carry alpha)', () => {
    expect(outputPath('mars')).toBe('assets-src/solar-system/mars.jpg');
    expect(outputPath('saturn-rings')).toBe('assets-src/solar-system/saturn-rings.png');
  });
});

describe('columnShift / rollColumns: every map ends 0° at the centre, east to the right', () => {
  it('needs no shift for a map already starting at −180°', () => {
    expect(columnShift(2048, -180)).toBe(0);
    expect(columnShift(2048, 180)).toBe(0);
  });

  it('shifts by half for a map starting at 0°, and by three quarters for one starting at −90°', () => {
    expect(columnShift(1024, 0)).toBe(512);
    expect(columnShift(1024, -90)).toBe(768);
  });

  it('rolls rows so output column j shows input column (j + shift) mod width', () => {
    // 4 × 2 image, 1 channel: rows [0 1 2 3] and [10 11 12 13].
    const pixels = Uint8Array.from([0, 1, 2, 3, 10, 11, 12, 13]);
    expect(Array.from(rollColumns(pixels, 4, 2, 1, 1))).toEqual([1, 2, 3, 0, 11, 12, 13, 10]);
    const rgb = Uint8Array.from([1, 1, 1, 2, 2, 2]);
    expect(Array.from(rollColumns(rgb, 2, 1, 3, 1))).toEqual([2, 2, 2, 1, 1, 1]);
  });

  it('leaves the input untouched', () => {
    const pixels = Uint8Array.from([0, 1, 2, 3]);
    rollColumns(pixels, 4, 1, 1, 2);
    expect(Array.from(pixels)).toEqual([0, 1, 2, 3]);
  });
});

describe('fillNoData: unmapped areas (pure black) take the mapped average', () => {
  it('applies to the USGS moon maps with gaps: Europa, Ganymede, Callisto, Triton', () => {
    const filled = IMAGERY.filter((m) => m.fillNoData).map((m) => m.id);
    expect(filled.sort()).toEqual(['callisto', 'europa', 'ganymede', 'triton']);
  });

  it('replaces pixels whose channels are all at or below the threshold with the mean of the rest', () => {
    // RGB: two mapped pixels (100,50,20) and (50,30,10), two unmapped (0,0,0) and (3,2,1).
    const pixels = Uint8Array.from([100, 50, 20, 0, 0, 0, 50, 30, 10, 3, 2, 1]);
    expect(Array.from(fillNoData(pixels, 3, 4))).toEqual([100, 50, 20, 75, 40, 15, 50, 30, 10, 75, 40, 15]);
  });

  it('keeps dark but mapped pixels, and leaves the input untouched', () => {
    const pixels = Uint8Array.from([5, 5, 5, 200, 200, 200]);
    expect(Array.from(fillNoData(pixels, 3, 4))).toEqual([5, 5, 5, 200, 200, 200]);
    fillNoData(Uint8Array.from([0, 0, 0, 9, 9, 9]), 3, 4);
    expect(Array.from(pixels)).toEqual([5, 5, 5, 200, 200, 200]);
  });
});
