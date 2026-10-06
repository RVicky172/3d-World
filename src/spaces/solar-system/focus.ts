import { Vector3 } from 'three';

/** A selected body's disc spans this share of the clear area's shorter side (spec 023, AC-4, Q3). */
export const FRAME_FRACTION = 1 / 3;
/** How far round from the sunward direction the camera looks (plan §3): a mostly lit, three-quarter disc. */
const TURN_DEG = 40;
/** And how far above the ecliptic. */
const RAISE_DEG = 20;
/** A clear area smaller than this share of the view isn't worth framing into: use the whole view. */
const MIN_CLEAR = 0.25;

const UP = new Vector3(0, 1, 0);
const flat = new Vector3();

/** A rectangle in CSS px. */
export interface Area {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The camera distance at which a sphere of `radius` spans `FRAME_FRACTION` of `clearShortSide` (px), for a
 * perspective camera with vertical field of view `fovY` (radians) on a viewport `viewportHeight` px tall. Uses
 * the sphere's true silhouette (the tangent cone), so it holds close up.
 */
export function framingDistance(
  radius: number,
  fovY: number,
  viewportHeight: number,
  clearShortSide: number,
) {
  const halfAngle = Math.atan((Math.tan(fovY / 2) * FRAME_FRACTION * clearShortSide) / viewportHeight);
  return radius / Math.sin(halfAngle);
}

/**
 * Where to look at a body from (a unit vector from the body towards the camera, plan §3): the sunward direction
 * in the ecliptic (scene XZ), turned 40° round and raised 20°. The Sun itself (or a body straight above it) keeps
 * `current`. Writes into `out`; inputs are not modified.
 */
export function viewDirection(body: Vector3, sun: Vector3, current: Vector3, out = new Vector3()): Vector3 {
  flat.copy(sun).sub(body);
  flat.y = 0;
  if (flat.lengthSq() < 1e-24) return out.copy(current).normalize();
  flat.normalize().applyAxisAngle(UP, (TURN_DEG * Math.PI) / 180);
  const raise = (RAISE_DEG * Math.PI) / 180;
  return out.copy(flat).multiplyScalar(Math.cos(raise)).addScaledVector(UP, Math.sin(raise));
}

/**
 * The part of the view the info panel leaves clear (spec 023, AC-11, plan §4): above a sheet that spans most of
 * the width (phones), else left of a side panel. The whole view if there is no panel or it would leave too little.
 */
export function clearArea(
  viewport: { width: number; height: number },
  panel: { left: number; top: number; width: number; height: number } | null,
): Area {
  const whole = { x: 0, y: 0, width: viewport.width, height: viewport.height };
  if (!panel || panel.width <= 0 || panel.height <= 0) return whole;
  if (panel.width > viewport.width / 2) {
    return panel.top >= MIN_CLEAR * viewport.height ? { ...whole, height: panel.top } : whole;
  }
  return panel.left >= MIN_CLEAR * viewport.width ? { ...whole, width: panel.left } : whole;
}

/**
 * The view offset (`PerspectiveCamera.setViewOffset`'s x and y, full size = view size) that moves the screen's
 * centre, where the orbit target is drawn, to the centre of `clear`.
 */
export function viewOffset(
  viewport: { width: number; height: number },
  clear: Area,
): { x: number; y: number } {
  return {
    x: viewport.width / 2 - (clear.x + clear.width / 2),
    y: viewport.height / 2 - (clear.y + clear.height / 2),
  };
}
