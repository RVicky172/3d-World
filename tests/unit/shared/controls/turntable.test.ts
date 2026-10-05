import { describe, expect, it } from 'vitest';
import { Turntable } from '../../../../src/shared/controls/turntable';

describe('Turntable (AC-11)', () => {
  it('is active while the visitor is idle', () => {
    expect(new Turntable(4, true).active).toBe(true);
  });

  it('stops on interaction and resumes only after the idle delay', () => {
    const t = new Turntable(4, true);
    t.interact();
    expect(t.active).toBe(false);
    t.tick(3.9);
    expect(t.active).toBe(false);
    t.tick(0.1);
    expect(t.active).toBe(true);
  });

  it('restarts the delay on each interaction', () => {
    const t = new Turntable(4, true);
    t.interact();
    t.tick(3);
    t.interact();
    t.tick(3);
    expect(t.active).toBe(false);
    t.tick(1);
    expect(t.active).toBe(true);
  });

  it('is never active when disabled (reduced motion, AC-7)', () => {
    const t = new Turntable(4, false);
    expect(t.active).toBe(false);
    t.tick(1000);
    expect(t.active).toBe(false);
  });

  it('is driven only by the deltas it is given (deterministic)', () => {
    const run = () => {
      const t = new Turntable(2, true);
      const states: boolean[] = [];
      for (const [delta, interact] of [
        [0.5, true],
        [1, false],
        [0.6, false],
        [0.5, false],
      ] as const) {
        if (interact) t.interact();
        t.tick(delta);
        states.push(t.active);
      }
      return states;
    };
    expect(run()).toEqual([false, false, true, true]);
    expect(run()).toEqual(run());
  });
});

describe('Turntable hold (spec 012, AC-12)', () => {
  it('stays still while held, however long the visitor is idle', () => {
    const t = new Turntable(4, true);
    t.hold(true);
    expect(t.active).toBe(false);
    t.tick(100);
    expect(t.active).toBe(false);
  });

  it('release restarts the idle delay rather than resuming at once', () => {
    const t = new Turntable(4, true);
    t.hold(true);
    t.tick(100);
    t.hold(false);
    expect(t.active).toBe(false);
    t.tick(3.9);
    expect(t.active).toBe(false);
    t.tick(0.1);
    expect(t.active).toBe(true);
  });
});
