import { REAL_UNIT_KM, STYLISED } from './data';
import type { BodyData, BodyLayout, ScaleMode } from './types';

type Vec3 = [number, number, number];

/**
 * Where each body sits and how big it is drawn, in scene units (spec 020, AC-5/AC-6). Pure.
 * - **Real:** one linear scale, `REAL_UNIT_KM` per unit, for every radius and distance.
 * - **Stylised:** radii compressed by a power curve (the Sun capped); moons on rings by their true order;
 *   planets on packed rings, each clear of its neighbours at any angle (so 021's motion can't make them collide),
 *   with a log term so wider true gaps stay wider.
 * `distance` is from the body's parent's centre.
 */
export function layout(
  bodies: readonly BodyData[],
  mode: ScaleMode,
  config: typeof STYLISED = STYLISED,
): Map<string, BodyLayout> {
  return mode === 'real' ? realLayout(bodies) : stylisedLayout(bodies, config);
}

function realLayout(bodies: readonly BodyData[]): Map<string, BodyLayout> {
  return new Map(
    bodies.map((b) => [
      b.id,
      { distance: (b.orbit?.semiMajorAxisKm ?? 0) / REAL_UNIT_KM, radius: b.radiusKm / REAL_UNIT_KM },
    ]),
  );
}

function stylisedLayout(bodies: readonly BodyData[], config: typeof STYLISED): Map<string, BodyLayout> {
  const earthKm = bodies.find((b) => b.id === config.unitBody)?.radiusKm;
  if (!earthKm) throw new Error(`stylised layout needs the ${config.unitBody} as its unit`);
  const radius = (b: BodyData) =>
    b.kind === 'star' ? config.sunRadius : (b.radiusKm / earthKm) ** config.radiusExponent;
  const byDistance = (a: BodyData, b: BodyData) => a.orbit!.semiMajorAxisKm - b.orbit!.semiMajorAxisKm;

  const result = new Map<string, BodyLayout>();
  const extents = new Map<string, number>();
  const sun = bodies.find((b) => b.kind === 'star');
  if (sun) result.set(sun.id, { distance: 0, radius: radius(sun) });

  const planets = bodies.filter((b) => b.kind === 'planet').sort(byDistance);
  for (const planet of planets) {
    // Moons by their true order, each on its own ring outside the previous one.
    let edge = radius(planet);
    for (const moon of bodies.filter((b) => b.parent === planet.id).sort(byDistance)) {
      const r = radius(moon);
      const distance = edge + config.moonGap + r;
      result.set(moon.id, { distance, radius: r });
      edge = distance + r;
    }
    extents.set(planet.id, edge);
  }

  let previous: BodyData | null = null;
  for (const planet of planets) {
    const ext = extents.get(planet.id)!;
    const distance: number = previous
      ? result.get(previous.id)!.distance +
        extents.get(previous.id)! +
        config.ringGap +
        ext +
        config.logSpacing * Math.log(planet.orbit!.semiMajorAxisKm / previous.orbit!.semiMajorAxisKm)
      : config.sunRadius + config.ringGap + ext;
    result.set(planet.id, { distance, radius: radius(planet) });
    previous = planet;
  }
  return result;
}

/** Each body's offset from its parent: `distance` at its display angle, in the XZ (ecliptic) plane. */
export function placeBodies(
  bodies: readonly BodyData[],
  layoutOf: Map<string, BodyLayout>,
): Map<string, Vec3> {
  return new Map(
    bodies.map((b) => {
      const { distance } = layoutOf.get(b.id)!;
      const angle = (b.displayAngleDeg * Math.PI) / 180;
      return [b.id, b.parent ? [distance * Math.cos(angle), 0, -distance * Math.sin(angle)] : [0, 0, 0]];
    }),
  );
}

/** World positions: a body's offset plus its ancestors'. */
export function worldPositions(
  bodies: readonly BodyData[],
  layoutOf: Map<string, BodyLayout>,
): Map<string, Vec3> {
  const offsets = placeBodies(bodies, layoutOf);
  const parents = new Map(bodies.map((b) => [b.id, b.parent]));
  const world = (id: string): Vec3 => {
    const own = offsets.get(id)!;
    const parent = parents.get(id);
    if (!parent) return [...own];
    const base = world(parent);
    return [base[0] + own[0], base[1] + own[1], base[2] + own[2]];
  };
  return new Map(bodies.map((b) => [b.id, world(b.id)]));
}

/** The radius of a sphere around the Sun that holds every body: the farthest body's edge from the Sun. */
export function systemExtent(bodies: readonly BodyData[], layoutOf: Map<string, BodyLayout>): number {
  let extent = 0;
  for (const [id, [x, y, z]] of worldPositions(bodies, layoutOf)) {
    extent = Math.max(extent, Math.hypot(x, y, z) + layoutOf.get(id)!.radius);
  }
  return extent;
}
