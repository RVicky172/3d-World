import { SphereGeometry, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import fixture from '../../../fixtures/horizons-positions.json';
import { BODIES } from '../../../../src/spaces/solar-system/data';
import { moonPosition, planetPosition, toScene } from '../../../../src/spaces/solar-system/orbit';
import { longitudeOfU, subPoint } from '../../../../src/spaces/solar-system/surfaces';
import { daysFromEpochMs } from '../../../../src/spaces/solar-system/time';
import type { BodyData } from '../../../../src/spaces/solar-system/types';

// Spec 022, AC-2: each map's 0° longitude sits on the body's prime meridian, so the right face shows for the
// date: Earth's sunlit hemisphere, the Moon's near side, and the direction surfaces turn.

const byId = new Map(BODIES.map((b) => [b.id, b]));
const body = (id: string): BodyData => byId.get(id)!;
const wrap = (deg: number) => (((deg % 360) + 540) % 360) - 180;

/** Direction from a planet to the Sun, in scene axes. */
const toSun = (planet: BodyData, days: number) =>
  (toScene(planetPosition(planet, days, new Vector3())) as Vector3).negate().normalize();

describe('longitudeOfU: the maps’ convention on three’s sphere', () => {
  it('maps u to longitude: −180° at the left edge, 0° in the centre, east to the right', () => {
    expect(longitudeOfU(0, -180)).toBe(-180);
    expect(longitudeOfU(0.5, -180)).toBe(0);
    expect(longitudeOfU(0.75, -180)).toBe(90);
    expect(longitudeOfU(0.25, 0)).toBe(90); // a map that starts at 0°
  });

  it('matches SphereGeometry: u = 0.5 on local +X (the prime meridian, 021) and u = 0.75 on −Z (east)', () => {
    const sphere = new SphereGeometry(1, 64, 32);
    const position = sphere.getAttribute('position');
    const uv = sphere.getAttribute('uv');
    const onEquatorAt = (u: number) => {
      for (let i = 0; i < uv.count; i++) {
        if (Math.abs(uv.getX(i) - u) < 1e-6 && Math.abs(uv.getY(i) - 0.5) < 1e-6) {
          return new Vector3().fromBufferAttribute(position, i);
        }
      }
      throw new Error(`no equator vertex at u = ${u}`);
    };
    expect(onEquatorAt(0.5).distanceTo(new Vector3(1, 0, 0))).toBeLessThan(1e-6);
    expect(onEquatorAt(0.75).distanceTo(new Vector3(0, 0, -1))).toBeLessThan(1e-6);
  });
});

describe('subPoint: what faces a direction, as map longitude and latitude', () => {
  /** NOAA's equation of time, minutes. */
  const equationOfTime = (date: Date) => {
    const dayOfYear =
      (Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) -
        Date.UTC(date.getUTCFullYear(), 0, 0)) /
      86_400_000;
    const b = (2 * Math.PI * (dayOfYear - 81)) / 365;
    return 9.87 * Math.sin(2 * b) - 7.53 * Math.cos(b) - 1.5 * Math.sin(b);
  };

  it.each([
    '2000-01-01T12:00:00Z',
    '1850-07-01T18:00:00Z',
    '2026-03-20T12:00:00Z',
    '2026-06-21T06:00:00Z',
    '2026-10-06T21:30:00Z',
    '2050-12-01T00:00:00Z',
  ])('Earth’s sub-solar longitude matches the clock on %s (within 5°)', (iso) => {
    const date = new Date(iso);
    const days = daysFromEpochMs(date.getTime());
    const { lonDeg } = subPoint(body('earth'), days, toSun(body('earth'), days));
    const hours = date.getUTCHours() + date.getUTCMinutes() / 60;
    const expected = -15 * (hours - 12 + equationOfTime(date) / 60);
    expect(Math.abs(wrap(lonDeg - expected))).toBeLessThan(5);
  });

  it('the Moon shows its near side: the sub-Earth point within 10° of (0°, 0°) at the reference dates', () => {
    const moon = body('moon');
    for (const { jd } of fixture.dates) {
      const days = jd - 2451545;
      const towardEarth = (toScene(moonPosition(moon, body('earth'), days, new Vector3())) as Vector3)
        .negate()
        .normalize();
      const { lonDeg, latDeg } = subPoint(moon, days, towardEarth, body('earth'));
      expect(Math.hypot(wrap(lonDeg), latDeg)).toBeLessThan(10);
    }
  });

  it('surfaces turn the right way: the sub-solar point moves west on Earth and Mars, east on Venus and Uranus', () => {
    const drift = (id: string) => {
      const b = body(id);
      const step = (Math.abs(360 / b.rotation.primeMeridianDeg[1]) / 50) * 1; // 1/50 of a turn
      const at = (d: number) => subPoint(b, d, toSun(b, d)).lonDeg;
      return wrap(at(5000 + step) - at(5000));
    };
    expect(drift('earth')).toBeLessThan(0);
    expect(drift('mars')).toBeLessThan(0);
    expect(drift('venus')).toBeGreaterThan(0);
    expect(drift('uranus')).toBeGreaterThan(0);
  });
});
