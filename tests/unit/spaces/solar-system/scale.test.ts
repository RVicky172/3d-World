import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';
import { BODIES, REAL_UNIT_KM, SOLAR_SYSTEM } from '../../../../src/spaces/solar-system/data';
import { layout, placeBodies, systemExtent, worldPositions } from '../../../../src/spaces/solar-system/scale';
import { frameDistance } from '../../../../src/shared/model-viewer/framing';
import type { BodyData } from '../../../../src/spaces/solar-system/types';

// Spec 020, AC-5 (stylised: readable, ordered, nothing overlapping, every body visible) and AC-6 (real: one
// linear scale for every size and distance).

const byId = new Map(BODIES.map((b) => [b.id, b]));
const planets = BODIES.filter((b) => b.kind === 'planet');
const moonsOf = (planet: BodyData) =>
  BODIES.filter((b) => b.parent === planet.id).sort(
    (a, b) => a.orbit!.semiMajorAxisKm - b.orbit!.semiMajorAxisKm,
  );

describe('real scale (AC-6)', () => {
  const real = layout(BODIES, 'real');

  it('uses one linear scale: 1 unit = 10⁶ km for every radius and distance', () => {
    expect(REAL_UNIT_KM).toBe(1e6);
    for (const b of BODIES) {
      expect(real.get(b.id)!.radius, b.id).toBeCloseTo(b.radiusKm / 1e6, 12);
      expect(real.get(b.id)!.distance, b.id).toBeCloseTo((b.orbit?.semiMajorAxisKm ?? 0) / 1e6, 9);
    }
  });

  it('keeps any two ratios within 0.1 % of the data', () => {
    const ratio = (x: number, y: number) => x / y;
    const r = (id: string) => real.get(id)!.radius;
    const d = (id: string) => real.get(id)!.distance;
    const km = (id: string) => byId.get(id)!;
    expect(ratio(r('earth'), r('jupiter')) / ratio(km('earth').radiusKm, km('jupiter').radiusKm)).toBeCloseTo(
      1,
      3,
    );
    expect(
      ratio(d('neptune'), d('earth')) /
        ratio(km('neptune').orbit!.semiMajorAxisKm, km('earth').orbit!.semiMajorAxisKm),
    ).toBeCloseTo(1, 3);
    expect(
      ratio(d('moon'), r('earth')) / ratio(km('moon').orbit!.semiMajorAxisKm, km('earth').radiusKm),
    ).toBeCloseTo(1, 3);
  });
});

describe('stylised scale (AC-5)', () => {
  const styl = layout(BODIES, 'stylised');
  const r = (id: string) => styl.get(id)!.radius;
  const d = (id: string) => styl.get(id)!.distance;
  /** A planet's extent: its outermost moon's outer edge, or its own radius. */
  const extent = (planet: BodyData) =>
    Math.max(r(planet.id), ...moonsOf(planet).map((m) => d(m.id) + r(m.id)));

  it('keeps the planets in their order from the Sun', () => {
    const distances = planets.map((p) => d(p.id));
    expect([...distances].sort((a, b) => a - b)).toEqual(distances);
  });

  it('keeps bigger bodies bigger, for every pair (the Sun largest)', () => {
    for (const a of BODIES) {
      for (const b of BODIES) {
        if (a.radiusKm > b.radiusKm) expect(r(a.id), `${a.id} > ${b.id}`).toBeGreaterThan(r(b.id));
      }
    }
  });

  it('never overlaps: each planet’s ring (with its moons) clears the Sun and its neighbours at any angle', () => {
    let inner = r('sun');
    for (const p of planets) {
      expect(d(p.id) - extent(p), p.id).toBeGreaterThan(inner);
      inner = d(p.id) + extent(p);
    }
  });

  it('draws every moon outside its planet, each on its own ring, in their true order', () => {
    for (const p of planets) {
      let inner = r(p.id);
      for (const m of moonsOf(p)) {
        expect(d(m.id) - r(m.id), m.id).toBeGreaterThan(inner);
        inner = d(m.id) + r(m.id);
      }
    }
  });

  it('shows every body at least 3 px in radius at the 1280 × 720 home view', () => {
    const { camera: view } = SOLAR_SYSTEM;
    const fovY = (view.fov * Math.PI) / 180;
    const extentAll = systemExtent(BODIES, styl);
    const camera = new PerspectiveCamera(view.fov, 1280 / 720, 0.1, 1e4);
    camera.position
      .set(...view.direction)
      .normalize()
      .multiplyScalar(frameDistance(extentAll, fovY, 1280 / 720, view.fill));
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    const pxPerUnitAt = (distance: number) => 720 / 2 / (distance * Math.tan(fovY / 2));
    for (const [id, world] of worldPositions(BODIES, styl)) {
      const distance = camera.position.distanceTo(new Vector3(...world));
      expect(r(id) * pxPerUnitAt(distance), id).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('placing bodies', () => {
  const styl = layout(BODIES, 'stylised');

  it('puts each body at its display angle around its parent, in the XZ plane', () => {
    const offsets = placeBodies(BODIES, styl);
    expect(offsets.get('sun')).toEqual([0, 0, 0]);
    const earth = byId.get('earth')!;
    const angle = (earth.displayAngleDeg * Math.PI) / 180;
    const [x, y, z] = offsets.get('earth')!;
    expect(x).toBeCloseTo(styl.get('earth')!.distance * Math.cos(angle), 9);
    expect(y).toBe(0);
    expect(z).toBeCloseTo(-styl.get('earth')!.distance * Math.sin(angle), 9);
  });

  it('adds a moon’s offset to its planet’s for its world position', () => {
    const offsets = placeBodies(BODIES, styl);
    const world = worldPositions(BODIES, styl);
    const sum = offsets.get('earth')!.map((c, i) => c + offsets.get('moon')![i]!);
    world.get('moon')!.forEach((c, i) => expect(c).toBeCloseTo(sum[i]!, 9));
  });

  it('measures the system out to the outermost moon’s edge', () => {
    const real = layout(BODIES, 'real');
    const neptune = real.get('neptune')!.distance;
    expect(systemExtent(BODIES, real)).toBeGreaterThan(neptune);
    expect(systemExtent(BODIES, real)).toBeLessThan(neptune + 1);
  });
});
