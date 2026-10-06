import { Quaternion, Vector3 } from 'three';
import { orientation, type Vector3Like } from './orbit';
import type { BodyData } from './types';

/**
 * How the maps sit on the bodies (spec 022, AC-2). three's `SphereGeometry` puts u = 0.5 on local +X and u = 0.75
 * on local −Z; 021 points local +X at the prime meridian with east on −Z. So a map whose left edge is at
 * `leftEdgeLongitudeDeg` (east-positive, east to the right) shows longitude `left + 360 u` at u, and the fetch
 * script's maps (0° in the centre) need no offset.
 */
export function longitudeOfU(u: number, leftEdgeLongitudeDeg: number): number {
  const lon = leftEdgeLongitudeDeg + 360 * u;
  return lon >= 180 ? lon - 360 : lon;
}

const facing = new Quaternion();
const local = new Vector3();

/**
 * The map point facing `direction` (scene axes, unit), e.g. the sub-solar point: east longitude and latitude in
 * degrees, for the body's orientation on `days` (paused: its true spin). A moon needs its planet (021).
 */
export function subPoint(
  body: BodyData,
  days: number,
  direction: Vector3Like,
  planet?: BodyData,
): { lonDeg: number; latDeg: number } {
  orientation(body, days, 0, facing, planet);
  local.set(direction.x, direction.y, direction.z).applyQuaternion(facing.invert()).normalize();
  return {
    lonDeg: (Math.atan2(-local.z, local.x) * 180) / Math.PI,
    latDeg: (Math.asin(Math.max(-1, Math.min(1, local.y))) * 180) / Math.PI,
  };
}
