/** Longest step a Space ever sees. Prevents huge jumps after a stall or a hidden tab. */
export const MAX_DELTA_SECONDS = 0.1;

export interface TimeStep {
  /** Seconds since the previous tick, clamped to [0, MAX_DELTA_SECONDS]. */
  delta: number;
  /** Sum of all deltas: Space time, which does not advance while paused. */
  elapsed: number;
}

/**
 * Turns raw timestamps (e.g. from requestAnimationFrame) into Space time.
 * The only source of time for Spaces, so tests can inject a FakeClock (Constitution VI).
 */
export interface Clock {
  tick(nowMs: number): TimeStep;
  /** The next tick reports delta 0. Used when resuming after the loop was paused. */
  reset(): void;
}

export function createClock(): Clock {
  let lastMs: number | undefined;
  let elapsed = 0;

  return {
    tick(nowMs) {
      const raw = lastMs === undefined ? 0 : (nowMs - lastMs) / 1000;
      const delta = Math.min(Math.max(raw, 0), MAX_DELTA_SECONDS);
      lastMs = nowMs;
      elapsed += delta;
      return { delta, elapsed };
    },
    reset() {
      lastMs = undefined;
    },
  };
}

/** Deterministic clock for tests: advance time by hand with `step(seconds)`. */
export class FakeClock implements Clock {
  private readonly inner = createClock();
  private nowMs = 0;

  tick(nowMs: number): TimeStep {
    this.nowMs = nowMs;
    return this.inner.tick(nowMs);
  }

  reset(): void {
    this.inner.reset();
  }

  step(seconds: number): TimeStep {
    return this.tick(this.nowMs + seconds * 1000);
  }
}
