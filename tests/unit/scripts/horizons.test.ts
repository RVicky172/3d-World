import { describe, expect, it } from 'vitest';
import { horizonsUrl, julianDay, parseVectors } from '../../../scripts/horizons.mjs';

// Spec 021, T002: the dev-only fetch of JPL reference positions (AC-1, AC-3). Pure parts only; the network
// call is never made in tests or CI.

describe('julianDay', () => {
  it('converts UTC calendar dates, including J2000 noon', () => {
    expect(julianDay('2000-01-01T12:00:00Z')).toBe(2451545);
    expect(julianDay('1800-01-01T00:00:00Z')).toBe(2378496.5);
    expect(julianDay('2050-12-31T00:00:00Z')).toBe(2470171.5);
  });
});

describe('horizonsUrl', () => {
  it('asks for ecliptic J2000 vectors in km at the given Julian days, about the given centre', () => {
    const url = new URL(horizonsUrl('599', '@10', [2451545, 2378496.5]));
    expect(url.origin + url.pathname).toBe('https://ssd.jpl.nasa.gov/api/horizons.api');
    const p = url.searchParams;
    expect(p.get('COMMAND')).toBe("'599'");
    expect(p.get('CENTER')).toBe("'@10'");
    expect(p.get('EPHEM_TYPE')).toBe("'VECTORS'");
    expect(p.get('REF_PLANE')).toBe("'ECLIPTIC'");
    expect(p.get('REF_SYSTEM')).toBe("'J2000'");
    expect(p.get('OUT_UNITS')).toBe("'KM-S'");
    expect(p.get('VEC_TABLE')).toBe("'1'");
    expect(p.get('TLIST')).toBe("'2451545 2378496.5'");
    expect(p.get('format')).toBe('text');
  });
});

describe('parseVectors', () => {
  const sample = `*******************************************************************************
$$SOE
2451545.000000000 = A.D. 2000-Jan-01 12:00:00.0000 TDB
 X = 5.989091645401344E+08 Y = 4.391225866604841E+08 Z =-1.523251063025475E+07
2378496.500000000 = A.D. 1800-Jan-01 00:00:00.0000 TDB
 X =-1.2E+08 Y = 3.0E+07 Z = 5.5E+03
$$EOE
*******************************************************************************`;

  it('reads each Julian day and its X, Y, Z (km), in order', () => {
    expect(parseVectors(sample)).toEqual([
      { jd: 2451545, xyz: [5.989091645401344e8, 4.391225866604841e8, -1.523251063025475e7] },
      { jd: 2378496.5, xyz: [-1.2e8, 3.0e7, 5.5e3] },
    ]);
  });

  it('fails loudly when the reply has no vectors (e.g. an API error)', () => {
    expect(() => parseVectors('API ERROR: unknown command')).toThrow(/no vectors/i);
  });
});
