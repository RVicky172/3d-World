import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createClock } from '../../../src/core/clock';
import { RenderLoop } from '../../../src/core/render-loop';
import { FakeScheduler, FakeVisibility } from '../../helpers/fakes';

describe('RenderLoop', () => {
  let scheduler: FakeScheduler;
  let visibility: FakeVisibility;
  let onFrame: ReturnType<typeof vi.fn<(delta: number, elapsed: number) => void>>;
  let loop: RenderLoop;

  beforeEach(() => {
    scheduler = new FakeScheduler();
    visibility = new FakeVisibility();
    onFrame = vi.fn<(delta: number, elapsed: number) => void>();
    loop = new RenderLoop(onFrame, { scheduler, visibility, clock: createClock() });
  });

  it('does nothing until started', () => {
    expect(scheduler.pending.size).toBe(0);
    expect(loop.isRunning).toBe(false);
  });

  it('start() schedules frames that receive clock time and keep rescheduling', () => {
    loop.start();
    scheduler.flush(1000);
    scheduler.flush(1016);
    expect(onFrame).toHaveBeenNthCalledWith(1, 0, 0);
    expect(onFrame).toHaveBeenNthCalledWith(2, 0.016, 0.016);
    expect(scheduler.pending.size).toBe(1);
  });

  it('start() twice does not double-schedule', () => {
    loop.start();
    loop.start();
    expect(scheduler.pending.size).toBe(1);
  });

  it('stops scheduling while the tab is hidden (AC-6)', () => {
    loop.start();
    scheduler.flush(0);
    visibility.set('hidden');
    expect(scheduler.pending.size).toBe(0);
    scheduler.flush(16);
    expect(onFrame).toHaveBeenCalledTimes(1);
    expect(loop.isRunning).toBe(true);
  });

  it('resumes when visible again with delta 0, not the hidden duration (AC-6)', () => {
    loop.start();
    scheduler.flush(0);
    scheduler.flush(50);
    visibility.set('hidden');
    visibility.set('visible');
    expect(scheduler.pending.size).toBe(1);
    scheduler.flush(60_000);
    expect(onFrame).toHaveBeenLastCalledWith(0, 0.05);
  });

  it('does not schedule on start while hidden, then begins when visible', () => {
    visibility.visibilityState = 'hidden';
    loop.start();
    expect(scheduler.pending.size).toBe(0);
    visibility.set('visible');
    expect(scheduler.pending.size).toBe(1);
  });

  it('stop() cancels the pending frame and ignores later visibility changes', () => {
    loop.start();
    loop.stop();
    expect(scheduler.pending.size).toBe(0);
    expect(loop.isRunning).toBe(false);
    visibility.set('hidden');
    visibility.set('visible');
    expect(scheduler.pending.size).toBe(0);
  });

  it('can be restarted after stop()', () => {
    loop.start();
    loop.stop();
    loop.start();
    scheduler.flush(0);
    expect(onFrame).toHaveBeenCalledTimes(1);
  });
});
