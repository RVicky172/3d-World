import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { easeTurn, turnStep } from '../../../../src/shared/controls/turn';

// Spec 012, AC-9: activating a hotspot turns the camera to the hotspot's viewing direction. The turn is an
// eased rotation between unit directions, advanced by Space time (Constitution VI).

const v = (x: number, y: number, z: number) => new Vector3(x, y, z).normalize();
const expectClose = (actual: Vector3, expected: Vector3) => {
  expect(actual.distanceTo(expected)).toBeLessThan(1e-9);
};

describe('easeTurn', () => {
  it('starts and ends at rest (smoothstep) and is symmetric', () => {
    expect(easeTurn(0)).toBe(0);
    expect(easeTurn(1)).toBe(1);
    expect(easeTurn(0.5)).toBeCloseTo(0.5, 12);
    expect(easeTurn(0.1)).toBeLessThan(0.1); // slow start
    expect(easeTurn(0.9)).toBeGreaterThan(0.9); // slow finish
    expect(easeTurn(0.25) + easeTurn(0.75)).toBeCloseTo(1, 12);
  });

  it('clamps progress outside [0, 1]', () => {
    expect(easeTurn(-1)).toBe(0);
    expect(easeTurn(2)).toBe(1);
  });
});

describe('turnStep', () => {
  it('is `from` at t = 0 and `to` at t = 1', () => {
    const from = v(1, 0, 0);
    const to = v(0, 1, 1);
    expectClose(turnStep(from, to, 0), from);
    expectClose(turnStep(from, to, 1), to);
  });

  it('stays a unit direction all the way', () => {
    const from = v(1, 0.2, 0);
    const to = v(-0.3, 0.5, 1);
    for (let t = 0; t <= 1; t += 0.1) expect(turnStep(from, to, t).length()).toBeCloseTo(1, 12);
  });

  it('moves along the great circle, eased: halfway in time is halfway in angle', () => {
    const from = v(1, 0, 0);
    const to = v(0, 0, 1);
    const mid = turnStep(from, to, 0.5);
    expectClose(mid, v(1, 0, 1));
    // Eased: a tenth of the time covers well under a tenth of the 90° angle.
    expect(turnStep(from, to, 0.1).angleTo(from)).toBeLessThan((0.1 * Math.PI) / 2);
  });

  it('takes the shortest arc', () => {
    const from = v(1, 0, 0);
    const to = v(0, 0, -1);
    const mid = turnStep(from, to, 0.5);
    expect(mid.angleTo(from)).toBeCloseTo(Math.PI / 4, 9);
    expect(mid.z).toBeLessThan(0);
  });

  it('turns through a stable perpendicular when the directions are opposite', () => {
    const from = v(0, 0, 1);
    const to = v(0, 0, -1);
    const mid = turnStep(from, to, 0.5);
    expect(mid.length()).toBeCloseTo(1, 12);
    expect(mid.angleTo(from)).toBeCloseTo(Math.PI / 2, 9);
    expect(Number.isFinite(mid.x + mid.y + mid.z)).toBe(true);
    expectClose(turnStep(from, to, 0.5), mid); // deterministic
    expectClose(turnStep(from, to, 1), to);
  });

  it('stays put when the directions are the same', () => {
    const d = v(0.3, 0.4, 0.5);
    expectClose(turnStep(d, d, 0.37), d);
  });

  it('does not modify its inputs, and can write into a target vector', () => {
    const from = v(1, 0, 0);
    const to = v(0, 1, 0);
    const out = new Vector3();
    const result = turnStep(from, to, 0.5, out);
    expect(result).toBe(out);
    expectClose(from, v(1, 0, 0));
    expectClose(to, v(0, 1, 0));
  });
});
