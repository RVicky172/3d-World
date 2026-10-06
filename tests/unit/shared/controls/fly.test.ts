import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { flyPath, FLY_MAX_SECONDS, FLY_MIN_SECONDS } from '../../../../src/shared/controls/fly';

// Spec 023, AC-4/AC-7, plan §2: a smooth zoom-and-pan (van Wijk & Nuij 2003) between two views, each a target
// point and a camera distance. Pure maths: no time source, no allocation per step.

const view = (target: [number, number, number], distance: number) => ({
  target: new Vector3(...target),
  distance,
});
const sample = () => ({ target: new Vector3(), distance: 0 });

describe('flyPath', () => {
  it('starts and lands exactly on its two views', () => {
    const from = view([1, 2, 3], 50);
    const to = view([-40, 0, 7], 0.2);
    const path = flyPath(from, to);
    const out = sample();
    path.at(0, out);
    expect(out.target.toArray()).toEqual([1, 2, 3]);
    expect(out.distance).toBe(50);
    path.at(1, out);
    expect(out.target.toArray()).toEqual([-40, 0, 7]);
    expect(out.distance).toBe(0.2);
  });

  it('clamps time outside [0, 1] to the ends', () => {
    const path = flyPath(view([0, 0, 0], 10), view([5, 0, 0], 1));
    const a = sample();
    const b = sample();
    path.at(-0.5, a);
    path.at(0, b);
    expect(a).toEqual(b);
    path.at(1.5, a);
    path.at(1, b);
    expect(a).toEqual(b);
  });

  it('never modifies its inputs', () => {
    const from = view([1, 2, 3], 50);
    const to = view([-40, 0, 7], 0.2);
    flyPath(from, to).at(0.5, sample());
    expect(from.target.toArray()).toEqual([1, 2, 3]);
    expect(to.target.toArray()).toEqual([-40, 0, 7]);
    expect([from.distance, to.distance]).toEqual([50, 0.2]);
  });

  it('eases: progress along the pan is monotone, slow at both ends and fastest mid-way', () => {
    const path = flyPath(view([0, 0, 0], 3), view([30, 0, 0], 3));
    const out = sample();
    const xs: number[] = [];
    for (let i = 0; i <= 100; i++) {
      path.at(i / 100, out);
      xs.push(out.target.x);
    }
    for (let i = 1; i < xs.length; i++) expect(xs[i]!).toBeGreaterThanOrEqual(xs[i - 1]!);
    const step = (i: number) => xs[i + 1]! - xs[i]!;
    expect(step(0)).toBeLessThan(step(50) / 10);
    expect(step(99)).toBeLessThan(step(50) / 10);
  });

  it('a pure zoom moves the distance geometrically: half way is the geometric mean (10⁸ range)', () => {
    const path = flyPath(view([0, 0, 0], 1e4), view([0, 0, 0], 1e-4));
    const out = sample();
    path.at(0.5, out);
    expect(out.distance).toBeCloseTo(1, 9);
    expect(out.target.toArray()).toEqual([0, 0, 0]);
  });

  it('a pan between equal distances zooms out mid-way, then back in', () => {
    const path = flyPath(view([0, 0, 0], 1), view([100, 0, 0], 1));
    const out = sample();
    path.at(0.5, out);
    expect(out.distance).toBeGreaterThan(5);
    expect(out.target.x).toBeCloseTo(50, 6);
  });

  it('keeps the target on the straight line between the two targets', () => {
    const path = flyPath(view([0, 0, 0], 10), view([3, 4, 12], 0.5));
    const out = sample();
    const direction = new Vector3(3, 4, 12).normalize();
    for (const t of [0.1, 0.3, 0.6, 0.9]) {
      path.at(t, out);
      const along = out.target.dot(direction);
      expect(out.target.clone().sub(direction.clone().multiplyScalar(along)).length()).toBeLessThan(1e-12);
    }
  });

  it('duration: short hops are quick, longer paths take longer, nothing exceeds 2 s', () => {
    const hop = flyPath(view([0, 0, 0], 1), view([0.5, 0, 0], 1)).duration;
    const pan = flyPath(view([0, 0, 0], 1), view([100, 0, 0], 1)).duration;
    expect(hop).toBeGreaterThanOrEqual(FLY_MIN_SECONDS);
    expect(pan).toBeGreaterThan(hop);
    expect(FLY_MAX_SECONDS).toBe(2);
    // The longest flight the Space makes: the real-scale home view (~9 000 units out) to the Moon close up.
    const longest = flyPath(view([0, 0, 0], 9000), view([-148.3, 0.004, 25.6], 0.014));
    expect(longest.duration).toBeLessThanOrEqual(2);
    expect(longest.duration).toBeGreaterThan(1);
  });

  it('a flight that goes nowhere has no duration', () => {
    expect(flyPath(view([1, 1, 1], 4), view([1, 1, 1], 4)).duration).toBe(0);
  });

  it('works at real-scale magnitudes: finite throughout, lands on a body 10⁻³ wide from 10³ away', () => {
    const from = view([0, 0, 0], 9000);
    const to = view([-148.3, 0.004, 25.6], 0.014);
    const path = flyPath(from, to);
    const out = sample();
    for (let i = 0; i <= 200; i++) {
      path.at(i / 200, out);
      expect(Number.isFinite(out.distance) && out.distance > 0).toBe(true);
      expect(out.target.toArray().every(Number.isFinite)).toBe(true);
    }
    // Close to the end the target is already on the body (within a fraction of its radius, 1.7e-3).
    path.at(0.97, out);
    expect(out.target.distanceTo(to.target)).toBeLessThan(1e-3);
  });

  it('the screen-width scale changes the shape, not the ends', () => {
    const a = flyPath(view([0, 0, 0], 1), view([100, 0, 0], 1));
    const b = flyPath(view([0, 0, 0], 1), view([100, 0, 0], 1), { widthPerDistance: 0.73 });
    const pa = sample();
    const pb = sample();
    a.at(0.5, pa);
    b.at(0.5, pb);
    expect(pa.distance).not.toBeCloseTo(pb.distance, 3);
    a.at(1, pa);
    b.at(1, pb);
    expect(pa).toEqual(pb);
  });

  it('shift(delta) moves both ends, so a flight lands on a moving body (plan §2)', () => {
    const path = flyPath(view([0, 0, 0], 10), view([20, 0, 0], 1));
    const before = sample();
    path.at(0.4, before);
    path.shift({ x: 0, y: 5, z: -1 });
    const after = sample();
    path.at(0.4, after);
    expect(after.target.x).toBeCloseTo(before.target.x, 12);
    expect(after.target.y).toBeCloseTo(before.target.y + 5, 12);
    expect(after.target.z).toBeCloseTo(before.target.z - 1, 12);
    expect(after.distance).toBe(before.distance);
    path.at(1, after);
    expect(after.target.toArray()).toEqual([20, 5, -1]);
  });
});
