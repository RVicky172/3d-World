import { Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import fixture from '../../../fixtures/horizons-positions.json';
import { BODIES } from '../../../../src/spaces/solar-system/data';
import {
  eccentricAnomaly,
  moonPosition,
  orientation,
  planetPosition,
  toScene,
} from '../../../../src/spaces/solar-system/orbit';
import type { BodyData } from '../../../../src/spaces/solar-system/types';

// Spec 021, AC-1–AC-4 (plan §3, D-026): positions against JPL Horizons vectors at 7 dates (tests/fixtures, T002),
// orbit shapes, moon directions and spin.

const DEG = 180 / Math.PI;
const J2000_JD = 2451545;
const byId = new Map(BODIES.map((b) => [b.id, b]));
const body = (id: string): BodyData => {
  const found = byId.get(id);
  if (!found) throw new Error(`no body ${id}`);
  return found;
};
const planets = BODIES.filter((b) => b.kind === 'planet');
const moons = BODIES.filter((b) => b.kind === 'moon');
const parentOf = (b: BodyData) => body(b.parent!);

interface Reference {
  dates: Array<{ iso: string; jd: number }>;
  bodies: Record<string, { xyz: number[][] }>;
}
const reference = fixture as Reference;
const referenceDates = reference.dates.map(({ iso, jd }) => ({ iso, days: jd - J2000_JD }));
const referenceXyz = (id: string, index: number) => {
  const [x, y, z] = reference.bodies[id]!.xyz[index]!;
  return new Vector3(x, y, z);
};

const v = () => new Vector3();
const planetAt = (b: BodyData, days: number) => planetPosition(b, days, v()) as Vector3;
const moonAt = (b: BodyData, days: number) => moonPosition(b, parentOf(b), days, v()) as Vector3;
const turnOf = (b: BodyData, days: number, speed = 0) =>
  orientation(b, days, speed, new Quaternion(), b.kind === 'moon' ? parentOf(b) : undefined) as Quaternion;
/** Signed angle (degrees) between two orientations. */
const turnBetween = (a: Quaternion, b: Quaternion) => a.angleTo(b) * DEG;
/** A body's north pole in ecliptic J2000 (IAU), from its NAIF RA/Dec on a date. */
const eclipticPole = (b: BodyData, days: number) => {
  const T = days / 36525;
  const ra = (b.rotation.poleRaDeg[0] + b.rotation.poleRaDeg[1] * T) / DEG;
  const dec = (b.rotation.poleDecDeg[0] + b.rotation.poleDecDeg[1] * T) / DEG;
  const e = 23.4392911 / DEG;
  const [x, y, z] = [Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec)];
  return new Vector3(x, y * Math.cos(e) + z * Math.sin(e), -y * Math.sin(e) + z * Math.cos(e));
};
const ecliptic = (x: number, y: number, z: number) => toScene(new Vector3(x, y, z)) as Vector3;
/** A planet's orbit normal in scene axes, from two positions a quarter orbit apart. */
const orbitNormal = (b: BodyData, days: number) => {
  if (!b.orbit) return ecliptic(0, 0, 1);
  const a = planetAt(b, days);
  const later = planetAt(b, days + b.orbit.periodDays / 4);
  return toScene(a.cross(later).normalize()) as Vector3;
};

describe('Kepler', () => {
  it('solves E − e sin E = M to 1e-12 for every planet eccentricity', () => {
    for (const e of [0, 0.0068, 0.0934, 0.2056]) {
      for (let M = -Math.PI; M <= Math.PI; M += 0.05) {
        const E = eccentricAnomaly(M, e);
        expect(Math.abs(E - e * Math.sin(E) - M)).toBeLessThan(1e-12);
      }
    }
  });
});

describe('planets (AC-1)', () => {
  it('fixture: 8 planets and 7 moons at 7 dates from 1800 to 2050', () => {
    expect(referenceDates.map((d) => d.iso.slice(0, 10))).toEqual([
      '1800-01-03',
      '1850-01-01',
      '1900-01-01',
      '1950-01-01',
      '2000-01-01',
      '2025-01-01',
      '2050-12-31',
    ]);
    for (const b of [...planets, ...moons]) expect(reference.bodies[b.id]?.xyz, b.id).toHaveLength(7);
  });

  it.each(planets.map((p) => [p.id, p] as const))(
    '%s is within 1° of longitude and latitude and 1 % of distance of JPL at every date',
    (_, planet) => {
      referenceDates.forEach(({ iso, days }, i) => {
        const ours = planetAt(planet, days);
        const jpl = referenceXyz(planet.id, i);
        const lon = (p: Vector3) => Math.atan2(p.y, p.x) * DEG;
        const lat = (p: Vector3) => Math.asin(p.z / p.length()) * DEG;
        const dLon = ((lon(ours) - lon(jpl) + 540) % 360) - 180;
        expect(Math.abs(dLon), `${planet.id} longitude ${iso}`).toBeLessThan(1);
        expect(Math.abs(lat(ours) - lat(jpl)), `${planet.id} latitude ${iso}`).toBeLessThan(1);
        expect(Math.abs(ours.length() / jpl.length() - 1), `${planet.id} distance ${iso}`).toBeLessThan(0.01);
      });
    },
  );
});

describe('orbit shape (AC-2)', () => {
  it.each(planets.map((p) => [p.id, p] as const))(
    '%s traces an ellipse with its e and I, the Sun at a focus',
    (_, planet) => {
      const { semiMajorAxisKm: a, eccentricity: e, inclinationDeg, periodDays } = planet.orbit!;
      let nearest = Infinity;
      let farthest = 0;
      for (let k = 0; k < 720; k++) {
        const r = planetAt(planet, (periodDays * k) / 720).length();
        nearest = Math.min(nearest, r);
        farthest = Math.max(farthest, r);
      }
      // Distances from the Sun span a(1 − e) … a(1 + e): an ellipse with the Sun at a focus, not its centre.
      expect(nearest / (a * (1 - e)) - 1, planet.id).toBeCloseTo(0, 2);
      expect(farthest / (a * (1 + e)) - 1, planet.id).toBeCloseTo(0, 2);
      const tilt = orbitNormal(planet, 0).angleTo(ecliptic(0, 0, 1)) * DEG;
      expect(Math.abs(tilt - Math.abs(inclinationDeg)), planet.id).toBeLessThan(0.1);
    },
  );
});

describe('moons (AC-3, D-026)', () => {
  /** AC-3: 10°, Triton 30° (D-026). */
  const allowance = (id: string) => (id === 'triton' ? 30 : 10);

  it.each(moons.map((m) => [m.id, m] as const))(
    '%s is within its allowance of JPL around its planet at every date',
    (_, moon) => {
      referenceDates.forEach(({ iso, days }, i) => {
        const angle = moonAt(moon, days).angleTo(referenceXyz(moon.id, i)) * DEG;
        expect(angle, `${moon.id} ${iso}`).toBeLessThan(allowance(moon.id));
      });
    },
  );

  it('orbit their planet in the right direction: Triton backwards, the rest forwards', () => {
    for (const moon of moons) {
      const now = moonAt(moon, 1000);
      const soon = moonAt(moon, 1000 + moon.orbit!.periodDays / 20);
      const spin = now.cross(soon).dot(eclipticPole(parentOf(moon), 1000));
      expect(Math.sign(spin), moon.id).toBe(moon.id === 'triton' ? -1 : 1);
    }
  });

  it('come round once per sidereal period (their synchronous spin rate)', () => {
    for (const moon of moons) {
      const period = 360 / Math.abs(moon.rotation.primeMeridianDeg[1]);
      expect(moonAt(moon, 5000).angleTo(moonAt(moon, 5000 + period)) * DEG, moon.id).toBeLessThan(1);
      // Halfway is ~180° away; eccentricity (the Moon's 0.055) shifts it by up to ~4e radians.
      expect(moonAt(moon, 5000).angleTo(moonAt(moon, 5000 + period / 2)) * DEG, moon.id).toBeGreaterThan(160);
    }
  });
});

describe('spin (AC-4)', () => {
  const notMoons = BODIES.filter((b) => b.kind !== 'moon');
  const spinAxis = (b: BodyData, days: number) => {
    // The world-space axis that turns the body forward in time.
    const step = (360 / Math.abs(b.rotation.primeMeridianDeg[1])) * 0.01;
    const delta = turnOf(b, days + step).multiply(turnOf(b, days).invert());
    const s = Math.sqrt(1 - delta.w * delta.w);
    return new Vector3(delta.x / s, delta.y / s, delta.z / s).multiplyScalar(Math.sign(delta.w));
  };

  it('turns once per sidereal period: back where it started, upside down halfway', () => {
    for (const b of notMoons) {
      const period = 360 / Math.abs(b.rotation.primeMeridianDeg[1]);
      expect(turnBetween(turnOf(b, 100), turnOf(b, 100 + period)), b.id).toBeLessThan(0.01);
      expect(turnBetween(turnOf(b, 100), turnOf(b, 100 + period / 2)), b.id).toBeCloseTo(180, 1);
      expect(period * 24, b.id).toBeCloseTo(b.rotationHours, 0);
    }
  });

  it('spins about an axis tilted by its axial tilt: over 90° (backwards) for Venus and Uranus', () => {
    for (const b of notMoons) {
      const tilt = spinAxis(b, 0).angleTo(orbitNormal(b, 0)) * DEG;
      expect(Math.abs(tilt - b.axialTiltDeg), b.id).toBeLessThan(1);
      expect(tilt > 90, b.id).toBe(b.id === 'venus' || b.id === 'uranus');
    }
  });

  it('keeps local +Y on the north pole', () => {
    for (const b of notMoons) {
      const up = new Vector3(0, 1, 0).applyQuaternion(turnOf(b, 3000));
      const pole = toScene(eclipticPole(b, 3000)) as Vector3;
      expect(up.angleTo(pole) * DEG, b.id).toBeLessThan(1e-6);
    }
  });

  it('a moon keeps one face (local +X) towards its planet, at any speed', () => {
    for (const moon of moons) {
      for (const [days, speed] of [
        [0, 0],
        [1234.5, 7],
        [-50_000, 365.25],
      ] as const) {
        const face = new Vector3(1, 0, 0).applyQuaternion(turnOf(moon, days, speed));
        const towardPlanet = (toScene(moonAt(moon, days)) as Vector3).negate();
        expect(face.angleTo(towardPlanet) * DEG, `${moon.id} ${days}`).toBeLessThan(0.01);
      }
    }
  });

  it('holds still (W = W0) above one turn per real second, and turns below it (Q6)', () => {
    const earth = body('earth'); // 23.93 h: 1 day/s ≈ 1.003 turns/s
    expect(turnBetween(turnOf(earth, 10, 0.9), turnOf(earth, 10.25, 0.9))).toBeGreaterThan(80);
    expect(turnBetween(turnOf(earth, 10, 1), turnOf(earth, 10.25, 1))).toBeLessThan(1);
    expect(turnBetween(turnOf(earth, 10, -1), turnOf(earth, 10.25, -1))).toBeLessThan(1);
    const mercury = body('mercury'); // 58.6 days: 0.12 turns/s at 1 week/s, 6.2 at 1 year/s
    expect(turnBetween(turnOf(mercury, 10, 7), turnOf(mercury, 20, 7))).toBeGreaterThan(50);
    expect(turnBetween(turnOf(mercury, 10, 365.25), turnOf(mercury, 20, 365.25))).toBeLessThan(1e-3); // only the pole's slow drift
  });

  it('a moon needs its planet', () => {
    expect(() => orientation(body('moon'), 0, 0, new Quaternion())).toThrow(/needs its planet/);
  });
});

describe('frames and allocation', () => {
  it('maps the ecliptic onto the scene: X → x, Y → −z, Z (north) → y, as 020 placed bodies', () => {
    const axes = (x: number, y: number, z: number) =>
      ecliptic(x, y, z)
        .toArray()
        .map((n) => n + 0); // −0 → 0
    expect(axes(1, 0, 0)).toEqual([1, 0, 0]);
    expect(axes(0, 1, 0)).toEqual([0, 0, -1]);
    expect(axes(0, 0, 1)).toEqual([0, 1, 0]);
  });

  it('writes into the given objects and returns them (no allocation per frame)', () => {
    const out = { x: 0, y: 0, z: 0 };
    const q = { x: 0, y: 0, z: 0, w: 1 };
    expect(planetPosition(body('mars'), 10, out)).toBe(out);
    expect(moonPosition(body('io'), body('jupiter'), 10, out)).toBe(out);
    expect(orientation(body('io'), 10, 7, q, body('jupiter'))).toBe(q);
    expect(orientation(body('saturn'), 10, 7, q)).toBe(q);
    expect(toScene(out)).toBe(out);
    expect(Math.hypot(q.x, q.y, q.z, q.w)).toBeCloseTo(1, 12);
  });

  it('puts the Sun at the origin', () => {
    expect(planetPosition(body('sun'), 0, { x: 1, y: 2, z: 3 })).toEqual({ x: 0, y: 0, z: 0 });
  });
});
