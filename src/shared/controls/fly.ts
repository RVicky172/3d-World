import { Vector3 } from 'three';
import { easeTurn } from './turn';

/** A flight never takes longer than this (spec 023, Q3), in seconds of Space time. */
export const FLY_MAX_SECONDS = 2;
/** Nor, unless it goes nowhere, shorter than this. */
export const FLY_MIN_SECONDS = 0.6;
/** Seconds per unit of van Wijk path length, on top of the minimum. */
const SECONDS_PER_UNIT = 0.25;
/** van Wijk & Nuij's recommended trade-off between zooming and panning (√2). */
const RHO = Math.SQRT2;
const RHO2 = RHO * RHO;
const RHO4 = RHO2 * RHO2;

/** A view to fly between: what the camera looks at, and how far away it is. */
export interface FlyView {
  readonly target: Vector3;
  readonly distance: number;
}

export interface FlyPath {
  /** Seconds of Space time: 0 for a flight that goes nowhere, else 0.6–2 s, longer for longer paths. */
  readonly duration: number;
  /** The view at `t` (linear time, clamped to [0, 1]; eased inside), written into `out`. Exact at both ends. */
  at(t: number, out: { target: Vector3; distance: number }): void;
  /** Moves both ends by `delta`, so the flight lands on a body that moved (spec 023, plan §2). */
  shift(delta: { readonly x: number; readonly y: number; readonly z: number }): void;
}

/**
 * A smooth zoom-and-pan between two views (van Wijk & Nuij, "Smooth and efficient zooming and panning", 2003):
 * the target moves along the straight line between the two targets while the visible width follows the path
 * that is optimal in screen terms (zoom out a little, pan, zoom in). Distance therefore changes geometrically,
 * which is what a 10⁸ zoom at real scale needs. Time is eased with smoothstep (as `turnTo`).
 *
 * `widthPerDistance` converts a camera distance to the visible width (2·tan(fov/2) for a perspective camera);
 * it changes the path's shape, never its ends. Inputs are copied, never modified.
 */
export function flyPath(from: FlyView, to: FlyView, options: { widthPerDistance?: number } = {}): FlyPath {
  const k = options.widthPerDistance ?? 1;
  const c0 = from.target.clone();
  const c1 = to.target.clone();
  const d0 = from.distance;
  const d1 = to.distance;
  const w0 = d0 * k;
  const w1 = d1 * k;
  const u1 = c0.distanceTo(c1);

  // A pan this small next to the views' widths is a pure zoom (the general formulas divide by u1).
  const panning = u1 > 1e-12 * Math.max(w0, w1);
  let S: number;
  let r0 = 0;
  if (panning) {
    const b0 = (w1 * w1 - w0 * w0 + RHO4 * u1 * u1) / (2 * w0 * RHO2 * u1);
    const b1 = (w1 * w1 - w0 * w0 - RHO4 * u1 * u1) / (2 * w1 * RHO2 * u1);
    // ln(−b + √(b² + 1)) = −asinh(b), without the cancellation for large b.
    r0 = -Math.asinh(b0);
    const r1 = -Math.asinh(b1);
    S = (r1 - r0) / RHO;
  } else {
    S = Math.abs(Math.log(w1 / w0)) / RHO;
  }
  const zoomSign = Math.sign(w1 - w0);
  const coshR0 = Math.cosh(r0);
  const sinhR0 = Math.sinh(r0);
  const duration = S > 0 ? Math.min(FLY_MAX_SECONDS, FLY_MIN_SECONDS + SECONDS_PER_UNIT * S) : 0;

  return {
    duration,
    at(t, out) {
      if (t <= 0 || S === 0) {
        if (t >= 1) {
          out.target.copy(c1);
          out.distance = d1;
        } else {
          out.target.copy(c0);
          out.distance = d0;
        }
        return;
      }
      if (t >= 1) {
        out.target.copy(c1);
        out.distance = d1;
        return;
      }
      const s = S * easeTurn(t);
      let fraction: number;
      let width: number;
      if (panning) {
        const u = (w0 / RHO2) * (coshR0 * Math.tanh(RHO * s + r0) - sinhR0);
        fraction = u / u1;
        width = (w0 * coshR0) / Math.cosh(RHO * s + r0);
      } else {
        fraction = s / S;
        width = w0 * Math.exp(zoomSign * RHO * s);
      }
      out.target.copy(c0).lerp(c1, fraction);
      out.distance = width / k;
    },
    shift(delta) {
      c0.x += delta.x;
      c0.y += delta.y;
      c0.z += delta.z;
      c1.x += delta.x;
      c1.y += delta.y;
      c1.z += delta.z;
    },
  };
}
