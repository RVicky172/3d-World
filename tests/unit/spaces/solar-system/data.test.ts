import { existsSync, readFileSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BODIES, SKY, SOURCES } from '../../../../src/spaces/solar-system/data';
import type { BodyData, Imagery } from '../../../../src/spaces/solar-system/types';

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
    expect([...covered].sort()).toEqual([
      'imagery',
      'moon-orbits',
      'physical',
      'planet-orbits',
      'rings',
      'rotation',
      'stars',
    ]);
    for (const source of SOURCES) {
      expect(source.name.trim()).not.toBe('');
      expect(source.url).toMatch(/^https:\/\//);
      expect(source.licence.trim()).not.toBe('');
      expect(source.read).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});

describe('motion data for 021 (D-025)', () => {
  const finite = (...values: number[]) => values.every(Number.isFinite);

  it('planets carry their JPL Table 1 element rates per century', () => {
    for (const { id, orbit } of planets) {
      const r = orbit!.ratesPerCentury;
      expect(r, id).toBeDefined();
      expect(
        finite(
          r!.semiMajorAxisKm,
          r!.eccentricity,
          r!.inclinationDeg,
          r!.meanLongitudeDeg,
          r!.perihelionLongitudeDeg,
          r!.ascendingNodeDeg,
        ),
        id,
      ).toBe(true);
      // The mean longitude's rate is the planet's motion: 36 525 days of it is one century.
      expect(r!.meanLongitudeDeg / 36_525, id).toBeCloseTo(360 / orbit!.periodDays, 4);
    }
  });

  it('moons carry their apsis and node precession periods (0 = none given)', () => {
    for (const moon of BODIES.filter((b) => b.kind === 'moon')) {
      expect(moon.orbit!.apsisPeriodYears, moon.id).toBeGreaterThanOrEqual(0);
      expect(moon.orbit!.nodePeriodYears, moon.id).toBeGreaterThanOrEqual(0);
    }
  });

  it('every body has a pole (RA, Dec) and prime meridian from NAIF', () => {
    for (const b of BODIES) {
      const { poleRaDeg, poleDecDeg, primeMeridianDeg } = b.rotation;
      expect(finite(...poleRaDeg, ...poleDecDeg, ...primeMeridianDeg), b.id).toBe(true);
      expect(Math.abs(poleDecDeg[0]), b.id).toBeLessThanOrEqual(90);
      expect(primeMeridianDeg[1], b.id).not.toBe(0);
    }
  });

  /** A unit vector in the ecliptic J2000 frame from equatorial RA/Dec. */
  const fromEquatorial = (raDeg: number, decDeg: number) => {
    const ra = (raDeg * Math.PI) / 180;
    const dec = (decDeg * Math.PI) / 180;
    const e = (23.4392911 * Math.PI) / 180;
    const [x, y, z] = [Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec)];
    return [x, y * Math.cos(e) + z * Math.sin(e), -y * Math.sin(e) + z * Math.cos(e)] as const;
  };
  const angle = (a: readonly number[], b: readonly number[]) =>
    (Math.acos(
      Math.min(
        1,
        Math.max(
          -1,
          a.reduce((sum, v, i) => sum + v * b[i]!, 0),
        ),
      ),
    ) *
      180) /
    Math.PI;

  it('cross-check: each spin axis (pole × sign of spin) is tilted to its orbit as 020 says, within 1°', () => {
    for (const b of BODIES.filter((x) => x.kind !== 'moon')) {
      const pole = fromEquatorial(b.rotation.poleRaDeg[0], b.rotation.poleDecDeg[0]);
      const axis = pole.map((v) => v * Math.sign(b.rotation.primeMeridianDeg[1]));
      // The Sun's tilt is to the ecliptic; a planet's to its orbit plane (normal from I and Ω).
      const i = ((b.orbit?.inclinationDeg ?? 0) * Math.PI) / 180;
      const node = ((b.orbit?.ascendingNodeDeg ?? 0) * Math.PI) / 180;
      const normal = [Math.sin(i) * Math.sin(node), -Math.sin(i) * Math.cos(node), Math.cos(i)];
      expect(Math.abs(angle(axis, normal) - b.axialTiltDeg), b.id).toBeLessThan(1);
    }
  });
});

// Spec 022, AC-1, AC-7, AC-13 (D-029–D-031): every body's imagery, Earth's layers, Saturn's rings and the sky.
describe('imagery (022)', () => {
  const credits = readFileSync('public/assets/CREDITS.md', 'utf8');
  const file = (image: { file: string }) => `public/assets/solar-system/${image.file}`;
  const all: Imagery[] = [
    ...BODIES.map((b) => b.imagery),
    ...Object.values(body('earth').layers ?? {}),
    ...(body('saturn').rings ? [body('saturn').rings!.profile] : []),
  ];

  it('gives every body a map, at 0° longitude in the centre (the fetch script’s convention)', () => {
    for (const b of BODIES) {
      expect(b.imagery.file, b.id).toBe(`${b.id}.ktx2`);
      expect(b.imagery.leftEdgeLongitudeDeg, b.id).toBe(-180);
    }
  });

  it('gives Earth clouds, night lights and an ocean mask, and no other body layers', () => {
    expect(Object.keys(body('earth').layers ?? {}).sort()).toEqual(['clouds', 'night', 'ocean']);
    expect(body('earth').layers!.clouds.file).toBe('earth-clouds.ktx2');
    expect(BODIES.filter((b) => b.layers).map((b) => b.id)).toEqual(['earth']);
  });

  it('every file exists, its recorded size matches, and it has a credit line', () => {
    for (const image of [...all, SKY.stars]) {
      expect(existsSync(file(image)), image.file).toBe(true);
      expect(statSync(file(image)).size, image.file).toBe(image.bytes);
      expect(credits, image.file).toContain(`assets/solar-system/${image.file}`);
    }
  });

  it('imagery and stars together fit 3 MB (AC-13, D-029)', () => {
    const total = [...all, SKY.stars].reduce((sum, image) => sum + image.bytes, 0);
    expect(total).toBeLessThanOrEqual(3 * 1024 * 1024);
  });

  it('only Saturn has rings: the C ring’s inner edge to the A ring’s outer edge, outside the planet (AC-7)', () => {
    expect(BODIES.filter((b) => b.rings).map((b) => b.id)).toEqual(['saturn']);
    const { innerKm, outerKm, profile } = body('saturn').rings!;
    expect(innerKm).toBe(74_490); // PDS Rings Node
    expect(outerKm).toBe(136_780);
    expect(innerKm).toBeGreaterThan(body('saturn').radiusKm);
    expect(outerKm).toBeLessThan(body('titan').orbit!.semiMajorAxisKm);
    expect(profile.file).toBe('saturn-rings.ktx2');
  });
});
