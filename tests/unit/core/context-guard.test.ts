import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ContextGuard } from '../../../src/core/context-guard';

describe('ContextGuard (spec 005, AC-6–AC-8, AC-12)', () => {
  let log: string[];
  let canvas: EventTarget;
  let container: HTMLElement;
  let status: HTMLElement;
  let reload: ReturnType<typeof vi.fn<() => void>>;
  let guard: ContextGuard;

  const engine = {
    start: () => void log.push('engine.start'),
    stop: () => void log.push('engine.stop'),
  };
  const manager = {
    suspend: () => void log.push('manager.suspend'),
    resume: async () => void log.push('manager.resume'),
  };

  const lose = () => canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
  const restore = () => canvas.dispatchEvent(new Event('webglcontextrestored'));
  const panel = () => container.querySelector('.context-lost');

  beforeEach(() => {
    log = [];
    canvas = new EventTarget();
    container = document.createElement('div');
    status = document.createElement('div');
    reload = vi.fn<() => void>();
    guard = new ContextGuard({ canvas, container, engine, manager, reload, statusElement: status });
  });

  it('on loss: stops the engine, suspends the view, shows the panel and sets data-webgl="lost"', () => {
    lose();

    expect(log).toEqual(['engine.stop', 'manager.suspend']);
    expect(panel()?.getAttribute('role')).toBe('alert');
    expect(status.dataset.webgl).toBe('lost');
    expect(guard.isLost).toBe(true);
  });

  it('does not stop the event or depend on whether three.js prevented its default', () => {
    const event = new Event('webglcontextlost', { cancelable: true, bubbles: true });
    const later = vi.fn();
    canvas.addEventListener('webglcontextlost', later);
    canvas.dispatchEvent(event);
    expect(later).toHaveBeenCalled();
    expect(log).toContain('manager.suspend');
  });

  it('on restore: removes the panel and signal, then restarts the engine and resumes the view', () => {
    lose();
    log = [];

    restore();

    expect(log).toEqual(['engine.start', 'manager.resume']);
    expect(panel()).toBeNull();
    expect(status.dataset.webgl).toBeUndefined();
    expect(guard.isLost).toBe(false);
  });

  it('ignores a restore without a preceding loss', () => {
    restore();
    expect(log).toEqual([]);
  });

  it('the panel’s Reload button calls reload()', () => {
    lose();
    container.querySelector('button')?.click();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('handles repeated lose/restore cycles', () => {
    for (let i = 0; i < 3; i++) {
      lose();
      restore();
    }
    expect(log.filter((entry) => entry === 'manager.resume')).toHaveLength(3);
    expect(container.querySelectorAll('.context-lost')).toHaveLength(0);
  });

  it('dispose() removes both listeners and the panel; later events do nothing (AC-12)', () => {
    const remove = vi.spyOn(canvas, 'removeEventListener');
    lose();
    log = [];

    guard.dispose();

    expect(remove).toHaveBeenCalledWith('webglcontextlost', expect.any(Function));
    expect(remove).toHaveBeenCalledWith('webglcontextrestored', expect.any(Function));
    expect(panel()).toBeNull();
    restore();
    lose();
    expect(log).toEqual([]);
  });

  it('defaults the status element to <body>', () => {
    const ownCanvas = new EventTarget();
    const own = new ContextGuard({ canvas: ownCanvas, container, engine, manager, reload });
    ownCanvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
    expect(document.body.dataset.webgl).toBe('lost');
    own.dispose();
    delete document.body.dataset.webgl;
  });
});
