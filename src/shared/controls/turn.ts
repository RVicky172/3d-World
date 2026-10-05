import { Vector3 } from 'three';

const UP = new Vector3(0, 1, 0);
const X = new Vector3(1, 0, 0);
const axis = new Vector3();

/** Smoothstep: the camera eases out of rest and into the new view (spec 012, AC-9). Clamped to [0, 1]. */
export function easeTurn(t: number): number {
  const p = Math.min(1, Math.max(0, t));
  return p * p * (3 - 2 * p);
}

/**
 * The direction `t` (0–1, linear time) of the way through an eased turn from `from` to `to`: a rotation along
 * the great circle (shortest arc). Opposite directions turn about a fixed perpendicular, so the path is
 * deterministic. Inputs must be unit vectors and are not modified.
 */
export function turnStep(from: Vector3, to: Vector3, t: number, out = new Vector3()): Vector3 {
  const angle = from.angleTo(to);
  out.copy(from);
  if (angle < 1e-9) return out;

  axis.crossVectors(from, to);
  if (axis.lengthSq() < 1e-12) {
    // Opposite: any perpendicular works; prefer turning about the vertical, like the turntable.
    axis.crossVectors(from, Math.abs(from.dot(UP)) > 0.9 ? X : UP);
  }
  return out.applyAxisAngle(axis.normalize(), angle * easeTurn(t));
}
