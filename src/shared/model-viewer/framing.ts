import { Box3, Sphere, Vector3, type Object3D } from 'three';

/** Closest the camera may get, as a multiple of the model's radius: never inside it (spec 010, AC-5). */
export const MIN_DISTANCE_FACTOR = 1.2;
/** Smallest share of the smaller viewport dimension the model may shrink to (AC-5). */
export const MIN_FILL = 0.1;

/**
 * Camera distance at which a sphere of `radius`, centred in view, spans `fill` (0–1) of the smaller
 * viewport dimension (spec 010, AC-2). Portrait screens are framed by their width, landscape by height.
 */
export function frameDistance(radius: number, fovYRadians: number, aspect: number, fill: number): number {
  // Half-extent of the smaller dimension on the image plane at distance 1.
  const halfExtent = Math.tan(fovYRadians / 2) * Math.min(1, aspect);
  // A sphere seen from distance d subtends asin(r / d); its projected half-size is the tangent of that.
  const angularRadius = Math.atan(fill * halfExtent);
  return radius / Math.sin(angularRadius);
}

/** Zoom limits for a model of `radius`: outside the model, and never smaller than `MIN_FILL`. */
export function distanceLimits(
  radius: number,
  fovYRadians: number,
  aspect: number,
): { min: number; max: number } {
  return {
    min: MIN_DISTANCE_FACTOR * radius,
    max: frameDistance(radius, fovYRadians, aspect, MIN_FILL),
  };
}

/**
 * Moves `object` so its bounding box is centred on the origin (the controls' focus point) and returns
 * the radius of the sphere around that box, which drives all framing.
 */
export function fitModel(object: Object3D): { radius: number } {
  object.updateMatrixWorld(true);
  const box = new Box3().setFromObject(object);
  const center = box.getCenter(new Vector3());
  object.position.sub(center);
  object.updateMatrixWorld(true);
  return { radius: box.getBoundingSphere(new Sphere()).radius };
}
