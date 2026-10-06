import type { Vector3Like } from './orbit';

/**
 * Saturn's ring shadows (spec 022, AC-8), in Saturn's local frame: the planet a unit sphere at the origin, the
 * ring plane y = 0 (the pole along +y), `toSun` a unit vector. Computed here in double precision for tests; the
 * ring and body shaders mirror these lines in float, which is ample at unit scale (world positions at real scale
 * would not be: hence the local frame).
 */

/** True when the ray from a ring point towards the Sun hits the planet: the point lies in Saturn's shadow. */
export function inPlanetShadow(point: Vector3Like, toSun: Vector3Like): boolean {
  // |p + t·d|² = 1 with t > 0, for a point outside the sphere: the ray must head towards the centre.
  const b = point.x * toSun.x + point.y * toSun.y + point.z * toSun.z;
  const c = point.x * point.x + point.y * point.y + point.z * point.z - 1;
  return b < 0 && b * b - c > 0;
}

/**
 * Where the ray from a point on Saturn towards the Sun crosses the ring plane, as a radius in Saturn radii; null
 * when it never does (the point faces the Sun's side of the plane, or the Sun lies in the plane at equinox). The
 * point is shadowed by the rings when the radius falls within them.
 */
export function ringShadowRadius(point: Vector3Like, toSun: Vector3Like): number | null {
  if (Math.abs(toSun.y) < 1e-9) return null;
  const t = -point.y / toSun.y;
  if (t <= 0) return null;
  return Math.hypot(point.x + t * toSun.x, point.z + t * toSun.z);
}
