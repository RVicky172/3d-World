import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';
import { BODIES, REAL_UNIT_KM, SOLAR_SYSTEM } from '../../../../src/spaces/solar-system/data';
import { moonPosition, planetPosition, toScene } from '../../../../src/spaces/solar-system/orbit';
import { RANGE } from '../../../../src/spaces/solar-system/time';
import {
  createPlacement,
  layout,
  placeBodies,
  systemExtent,
  worldPositions,
} from '../../../../src/spaces/solar-system/scale';
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

  it.each([
    [1280, 720, 3],
    [320, 640, 1],
  ])('shows every body at least %i × %i: %i px in radius at the home view', (width, height, minPx) => {
    const { camera: view } = SOLAR_SYSTEM;
    const fovY = (view.fov * Math.PI) / 180;
    const extentAll = systemExtent(BODIES, styl);
    const camera = new PerspectiveCamera(view.fov, width / height, 0.1, 1e4);
    camera.position
      .set(...view.direction)
      .normalize()
      .multiplyScalar(frameDistance(extentAll, fovY, width / height, view.fill));
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    const pxPerUnitAt = (distance: number) => height / 2 / (distance * Math.tan(fovY / 2));
    for (const [id, world] of worldPositions(BODIES, styl)) {
      const distance = camera.position.distanceTo(new Vector3(...world));
      expect(r(id) * pxPerUnitAt(distance), id).toBeGreaterThanOrEqual(minPx);
    }
  });

  // Spec 022, AC-7: Saturn's rings take room at stylised scale too, so nothing passes through them.
  it('counts Saturn’s rings in its extent: Titan’s ring clears them (2.349 × Saturn’s drawn radius)', () => {
    const saturn = byId.get('saturn')!;
    const ringOuter = (saturn.rings!.outerKm / saturn.radiusKm) * r('saturn');
    expect(ringOuter / r('saturn')).toBeCloseTo(2.349, 3);
    expect(d('titan') - r('titan')).toBeGreaterThan(ringOuter);
    // …and Saturn's neighbours' rings clear them too.
    expect(d('saturn') - ringOuter).toBeGreaterThan(d('jupiter') + extent(byId.get('jupiter')!));
    expect(d('uranus') - extent(byId.get('uranus')!)).toBeGreaterThan(d('saturn') + ringOuter);
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

// Spec 021, AC-2/AC-5 (plan §4, Q3): positions for a date. Real: the orbit maths ÷ REAL_UNIT_KM. Stylised: on
// the 020 ring, at the true angle around the parent.
describe('placing bodies on a date (021)', () => {
  const styl = layout(BODIES, 'stylised');
  const real = layout(BODIES, 'real');
  const truth = (b: BodyData, days: number) => {
    const out = new Vector3();
    if (b.kind === 'planet') planetPosition(b, days, out);
    if (b.kind === 'moon') moonPosition(b, byId.get(b.parent!)!, days, out);
    return toScene(out) as Vector3;
  };

  it('real: each body sits at its true offset from its parent, in scene axes, ÷ REAL_UNIT_KM', () => {
    const placement = createPlacement(BODIES);
    for (const days of [-73_000, 0, 9_400]) {
      const offsets = placement.at(real, 'real', days);
      for (const b of BODIES) {
        const expected = truth(b, days).divideScalar(REAL_UNIT_KM);
        const { x, y, z } = offsets.get(b.id)!;
        expect(new Vector3(x, y, z).distanceTo(expected), `${b.id} ${days}`).toBeLessThan(1e-9);
      }
    }
  });

  it('stylised: each body stays on its 020 ring, in the XZ plane, at its true angle around its parent', () => {
    const placement = createPlacement(BODIES);
    for (const days of [-73_000, 0, 9_400]) {
      const offsets = placement.at(styl, 'stylised', days);
      for (const b of BODIES.filter((x) => x.parent)) {
        const { x, y, z } = offsets.get(b.id)!;
        expect(Math.hypot(x, z), b.id).toBeCloseTo(styl.get(b.id)!.distance, 9);
        expect(y, b.id).toBe(0);
        const t = truth(b, days);
        expect(Math.atan2(z, x), `${b.id} ${days}`).toBeCloseTo(Math.atan2(t.z, t.x), 9);
      }
    }
  });

  it('keeps the Sun at the origin and writes into the same objects every call', () => {
    const placement = createPlacement(BODIES);
    const first = placement.at(styl, 'stylised', 0);
    const earth = first.get('earth');
    const second = placement.at(real, 'real', 500);
    expect(second).toBe(first);
    expect(second.get('earth')).toBe(earth);
    expect(Object.values(second.get('sun')!).map((n) => n + 0)).toEqual([0, 0, 0]); // −0 → 0
  });

  it('stylised: nothing overlaps at 200 random dates in the range (020 AC-5 at every date)', () => {
    const placement = createPlacement(BODIES);
    let seed = 21;
    const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646; // deterministic
    for (let n = 0; n < 200; n++) {
      const days = RANGE.start + random() * (RANGE.end - RANGE.start);
      const offsets = placement.at(styl, 'stylised', days);
      const world = new Map<string, Vector3>();
      for (const b of BODIES) {
        const { x, y, z } = offsets.get(b.id)!;
        world.set(b.id, new Vector3(x, y, z).add(b.parent ? world.get(b.parent)! : new Vector3()));
      }
      for (const a of BODIES) {
        for (const b of BODIES) {
          if (a.id >= b.id) continue;
          const gap =
            world.get(a.id)!.distanceTo(world.get(b.id)!) - styl.get(a.id)!.radius - styl.get(b.id)!.radius;
          expect(gap, `${a.id}–${b.id} on day ${days.toFixed(1)}`).toBeGreaterThan(0);
        }
      }
    }
  });
});
