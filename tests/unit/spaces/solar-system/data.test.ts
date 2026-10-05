import { describe, expect, it } from 'vitest';
import { BODIES, SOURCES } from '../../../../src/spaces/solar-system/data';
import type { BodyData } from '../../../../src/spaces/solar-system/types';

// Spec 020, AC-1–AC-4: the Sun, the eight planets and the seven major moons as sourced, consistent data.

const PLANETS = ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'];
const MOONS: Record<string, string> = {
  moon: 'earth',
  io: 'jupiter',
  europa: 'jupiter',
  ganymede: 'jupiter',
  callisto: 'jupiter',
  titan: 'saturn',
  triton: 'neptune',
};

const byId = new Map(BODIES.map((b) => [b.id, b]));
const body = (id: string): BodyData => {
  const found = byId.get(id);
  if (!found) throw new Error(`no body ${id}`);
  return found;
};
const planets = BODIES.filter((b) => b.kind === 'planet');
const orbiting = BODIES.filter((b) => b.orbit !== null);

describe('solar-system bodies (AC-1)', () => {
  it('lists the Sun, the eight planets in order from the Sun, and the seven major moons', () => {
    expect(BODIES).toHaveLength(16);
    expect(body('sun').kind).toBe('star');
    expect(planets.map((b) => b.id)).toEqual(PLANETS);
    expect(Object.fromEntries(BODIES.filter((b) => b.kind === 'moon').map((b) => [b.id, b.parent]))).toEqual(
      MOONS,
    );
  });

  it('gives every body a unique kebab-case id, a name and a colour', () => {
    expect(new Set(BODIES.map((b) => b.id)).size).toBe(BODIES.length);
    for (const b of BODIES) {
      expect(b.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(b.name.trim(), b.id).not.toBe('');
      expect(Number.isInteger(b.colour) && b.colour >= 0 && b.colour <= 0xffffff, b.id).toBe(true);
    }
  });

  it('only the Sun has no parent; planets orbit the Sun', () => {
    expect(body('sun').parent).toBeNull();
    for (const id of PLANETS) expect(body(id).parent).toBe('sun');
  });

  it('gives every orbiting body a fixed display angle in [0, 360) (Q1)', () => {
    for (const b of orbiting) {
      expect(b.displayAngleDeg, b.id).toBeGreaterThanOrEqual(0);
      expect(b.displayAngleDeg, b.id).toBeLessThan(360);
    }
  });
});

describe('physical and orbital data (AC-2)', () => {
  it('every body has a radius, GM, rotation period and axial tilt (IAU: retrograde spin = tilt > 90°)', () => {
    for (const b of BODIES) {
      expect(b.radiusKm, b.id).toBeGreaterThan(0);
      expect(b.gmKm3s2, b.id).toBeGreaterThan(0);
      expect(b.rotationHours, b.id).toBeGreaterThan(0);
      expect(b.axialTiltDeg, b.id).toBeGreaterThanOrEqual(0);
      expect(b.axialTiltDeg, b.id).toBeLessThanOrEqual(180);
    }
  });

  it('every body but the Sun has an orbit: semi-major axis, period, eccentricity, inclination', () => {
    expect(body('sun').orbit).toBeNull();
    expect(orbiting).toHaveLength(15);
    for (const { id, orbit } of orbiting) {
      expect(orbit!.semiMajorAxisKm, id).toBeGreaterThan(0);
      expect(orbit!.periodDays, id).toBeGreaterThan(0);
      expect(orbit!.eccentricity, id).toBeGreaterThanOrEqual(0);
      expect(orbit!.eccentricity, id).toBeLessThan(1);
      expect(Number.isFinite(orbit!.inclinationDeg), id).toBe(true);
    }
  });

  it('Venus and Uranus spin backwards, shown by their tilt alone', () => {
    expect(body('venus').axialTiltDeg).toBeGreaterThan(90);
    expect(body('uranus').axialTiltDeg).toBeGreaterThan(90);
    expect(body('earth').axialTiltDeg).toBeLessThan(90);
  });

  it('planets carry the full J2000 elements for 021 (Q4)', () => {
    for (const { id, orbit } of planets) {
      expect(orbit!.epoch, id).toBe('J2000');
      for (const angle of [orbit!.ascendingNodeDeg, orbit!.perihelionLongitudeDeg, orbit!.meanLongitudeDeg]) {
        expect(Number.isFinite(angle), id).toBe(true);
      }
    }
  });
});

describe('plausibility (AC-3)', () => {
  it('planets are ordered by distance from the Sun', () => {
    const distances = planets.map((b) => b.orbit!.semiMajorAxisKm);
    expect([...distances].sort((a, b) => a - b)).toEqual(distances);
  });

  it('every moon orbits closer to its planet than half the gap to the nearest neighbouring planet', () => {
    for (const moon of BODIES.filter((b) => b.kind === 'moon')) {
      const parent = body(moon.parent!);
      const i = planets.indexOf(parent);
      const a = parent.orbit!.semiMajorAxisKm;
      const gaps = [planets[i - 1], planets[i + 1]]
        .filter((p): p is BodyData => p !== undefined)
        .map((p) => Math.abs(p.orbit!.semiMajorAxisKm - a));
      expect(moon.orbit!.semiMajorAxisKm, moon.id).toBeLessThan(Math.min(...gaps) / 2);
      expect(moon.orbit!.semiMajorAxisKm, moon.id).toBeGreaterThan(parent.radiusKm + moon.radiusKm);
    }
  });

  it.each(orbiting.map((b) => [b.id, b] as const))(
    '%s follows Kepler’s third law within 5 % (T = 2π√(a³/GM of its parent))',
    (_, b) => {
      const gm = body(b.parent!).gmKm3s2;
      const predictedDays = (2 * Math.PI * Math.sqrt(b.orbit!.semiMajorAxisKm ** 3 / gm)) / 86_400;
      expect(Math.abs(b.orbit!.periodDays / predictedDays - 1)).toBeLessThan(0.05);
    },
  );
});

describe('sources (AC-4)', () => {
  it('names a source with URL, licence and date read for each kind of data', () => {
    const covered = new Set(SOURCES.flatMap((s) => s.covers));
    expect([...covered].sort()).toEqual(['moon-orbits', 'physical', 'planet-orbits']);
    for (const source of SOURCES) {
      expect(source.name.trim()).not.toBe('');
      expect(source.url).toMatch(/^https:\/\//);
      expect(source.licence.trim()).not.toBe('');
      expect(source.read).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});
