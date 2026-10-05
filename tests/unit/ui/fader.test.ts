import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FADE_DURATION_MS, Fader } from '../../../src/ui/fader';

describe('Fader', () => {
  let container: HTMLElement;

  beforeEach(() => {
    vi.useFakeTimers();
    container = document.createElement('div');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const settled = (promise: Promise<void>) => {
    let done = false;
    void promise.then(() => (done = true));
    return () => done;
  };

  it('adds a hidden, non-interactive overlay element that starts transparent', () => {
    const fader = new Fader(container, { reducedMotion: () => false });
    expect(fader.element.parentElement).toBe(container);
    expect(fader.element.getAttribute('aria-hidden')).toBe('true');
    expect(fader.element.style.opacity).toBe('0');
  });

  it(`out() goes opaque and resolves after ${FADE_DURATION_MS} ms (AC-10)`, async () => {
    const fader = new Fader(container, { reducedMotion: () => false });
    const isDone = settled(fader.out());

    expect(fader.element.style.opacity).toBe('1');
    expect(fader.element.dataset.state).toBe('out');
    await vi.advanceTimersByTimeAsync(FADE_DURATION_MS - 1);
    expect(isDone()).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(isDone()).toBe(true);
  });

  it(`in() goes transparent and resolves after ${FADE_DURATION_MS} ms`, async () => {
    const fader = new Fader(container, { reducedMotion: () => false });
    await Promise.all([fader.out(), vi.advanceTimersByTimeAsync(FADE_DURATION_MS)]);
    const isDone = settled(fader.in());

    expect(fader.element.style.opacity).toBe('0');
    expect(fader.element.dataset.state).toBe('in');
    await vi.advanceTimersByTimeAsync(FADE_DURATION_MS);
    expect(isDone()).toBe(true);
  });

  it('uses a CSS opacity transition matching the duration', () => {
    const fader = new Fader(container, { reducedMotion: () => false });
    expect(fader.element.style.transition).toContain(`${FADE_DURATION_MS}ms`);
  });

  it('with reduced motion, swaps instantly: no transition and no waiting (AC-10)', async () => {
    const fader = new Fader(container, { reducedMotion: () => true });
    expect(fader.element.style.transition).toBe('none');

    const isDone = settled(fader.out());
    await vi.advanceTimersByTimeAsync(0);
    expect(isDone()).toBe(true);
    expect(fader.element.style.opacity).toBe('1');
  });

  it('can start covered, so the first Space only needs to fade in', () => {
    const fader = new Fader(container, { reducedMotion: () => false, covered: true });
    expect(fader.element.style.opacity).toBe('1');
    expect(fader.element.dataset.state).toBe('out');
  });

  it('resolves immediately when already in the requested state (no transition would run)', async () => {
    const fader = new Fader(container, { reducedMotion: () => false, covered: true });
    const isDone = settled(fader.out());
    await vi.advanceTimersByTimeAsync(0);
    expect(isDone()).toBe(true);
  });

  it('a repeated request during the same fade waits for that fade to finish', async () => {
    const fader = new Fader(container, { reducedMotion: () => false });
    const first = settled(fader.out());
    await vi.advanceTimersByTimeAsync(100);
    const second = settled(fader.out());

    await vi.advanceTimersByTimeAsync(FADE_DURATION_MS - 101);
    expect(second()).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(first()).toBe(true);
    expect(second()).toBe(true);
  });

  it('dispose() removes the element and resolves any pending fade', async () => {
    const fader = new Fader(container, { reducedMotion: () => false });
    const isDone = settled(fader.out());
    fader.dispose();
    await vi.advanceTimersByTimeAsync(0);
    expect(container.contains(fader.element)).toBe(false);
    expect(isDone()).toBe(true);
  });

  it('reads the reduced-motion preference on every fade (spec 005, AC-10)', async () => {
    let reduce = false;
    const fader = new Fader(container, { reducedMotion: () => reduce });

    reduce = true;
    const instant = settled(fader.out());
    expect(fader.element.style.transition).toBe('none');
    await vi.advanceTimersByTimeAsync(0);
    expect(instant()).toBe(true);

    reduce = false;
    const timed = settled(fader.in());
    expect(fader.element.style.transition).toContain(`${FADE_DURATION_MS}ms`);
    await vi.advanceTimersByTimeAsync(FADE_DURATION_MS - 1);
    expect(timed()).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(timed()).toBe(true);
  });
});
