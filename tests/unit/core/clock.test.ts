import { describe, expect, it } from 'vitest';
import { createClock, FakeClock, MAX_DELTA_SECONDS } from '../../../src/core/clock';

describe('createClock', () => {
  it('reports delta 0 on the first tick', () => {
    const clock = createClock();
    expect(clock.tick(1000)).toEqual({ delta: 0, elapsed: 0 });
  });

  it('converts milliseconds between ticks into seconds and accumulates elapsed', () => {
    const clock = createClock();
    clock.tick(1000);
    expect(clock.tick(1016)).toEqual({ delta: 0.016, elapsed: 0.016 });
    const second = clock.tick(1066);
    expect(second.delta).toBeCloseTo(0.05);
    expect(second.elapsed).toBeCloseTo(0.066);
  });

  it(`clamps delta to ${MAX_DELTA_SECONDS}s so a long stall does not jump the scene`, () => {
    const clock = createClock();
    clock.tick(0);
    expect(clock.tick(5000)).toEqual({ delta: MAX_DELTA_SECONDS, elapsed: MAX_DELTA_SECONDS });
  });

  it('never reports a negative delta if timestamps go backwards', () => {
    const clock = createClock();
    clock.tick(1000);
    expect(clock.tick(900).delta).toBe(0);
  });

  it('reset() makes the next tick report delta 0 and keeps elapsed', () => {
    const clock = createClock();
    clock.tick(0);
    clock.tick(50);
    clock.reset();
    expect(clock.tick(60_000)).toEqual({ delta: 0, elapsed: 0.05 });
    expect(clock.tick(60_010).delta).toBeCloseTo(0.01);
  });

  it('produces identical output for identical tick sequences (AC-7)', () => {
    const times = [0, 16.7, 33.3, 50, 400, 416.7];
    const run = () => {
      const clock = createClock();
      return times.map((t) => clock.tick(t));
    };
    expect(run()).toEqual(run());
  });
});

describe('FakeClock', () => {
  it('step(seconds) advances time and returns the tick result', () => {
    const clock = new FakeClock();
    expect(clock.step(0)).toEqual({ delta: 0, elapsed: 0 });
    expect(clock.step(0.02)).toEqual({ delta: 0.02, elapsed: 0.02 });
    expect(clock.step(0.03).elapsed).toBeCloseTo(0.05);
  });

  it('applies the same clamping as the real clock', () => {
    const clock = new FakeClock();
    clock.step(0);
    expect(clock.step(10).delta).toBe(MAX_DELTA_SECONDS);
  });

  it('can be driven by a scheduler through tick(nowMs) like the real clock', () => {
    const clock = new FakeClock();
    clock.tick(100);
    expect(clock.tick(125)).toEqual({ delta: 0.025, elapsed: 0.025 });
  });
});
