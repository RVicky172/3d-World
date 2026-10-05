import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createRendererOrNull,
  watchReducedMotion,
  hasWebGL2,
  prefersCoarsePointer,
} from '../../src/core/capabilities';

const fakeCanvas = (context: unknown) => ({ getContext: () => context }) as unknown as HTMLCanvasElement;

describe('hasWebGL2', () => {
  it('returns true when a webgl2 context can be created', () => {
    expect(hasWebGL2(() => fakeCanvas({}))).toBe(true);
  });

  it('returns false when getContext returns null', () => {
    expect(hasWebGL2(() => fakeCanvas(null))).toBe(false);
  });

  it('returns false when canvas creation throws', () => {
    expect(
      hasWebGL2(() => {
        throw new Error('no canvas');
      }),
    ).toBe(false);
  });
});

describe('prefersCoarsePointer', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('is true on touch-first devices', () => {
    const matchMedia = vi.fn((query: string) => ({ matches: true, media: query }) as MediaQueryList);
    vi.stubGlobal('matchMedia', matchMedia);
    expect(prefersCoarsePointer()).toBe(true);
    expect(matchMedia).toHaveBeenCalledWith('(pointer: coarse)');
  });

  it('is false when matchMedia is unavailable (e.g. jsdom)', () => {
    vi.stubGlobal('matchMedia', undefined);
    expect(prefersCoarsePointer()).toBe(false);
  });
});

describe('createRendererOrNull (spec 005, AC-2)', () => {
  it('returns what the factory creates', () => {
    const renderer = { kind: 'renderer' };
    expect(createRendererOrNull(() => renderer)).toBe(renderer);
  });

  it('returns null instead of throwing when the factory throws', () => {
    expect(
      createRendererOrNull(() => {
        throw new Error('THREE.WebGLRenderer: Error creating WebGL context.');
      }),
    ).toBeNull();
  });
});

describe('watchReducedMotion (spec 005, AC-10)', () => {
  /** A MediaQueryList stand-in: an EventTarget whose `matches` the test can flip. */
  class FakeQuery extends EventTarget {
    constructor(public matches: boolean) {
      super();
    }
    set(matches: boolean): void {
      this.matches = matches;
      this.dispatchEvent(new Event('change'));
    }
  }
  const asQuery = (q: FakeQuery) => q as unknown as MediaQueryList;

  it('starts from the current preference', () => {
    expect(watchReducedMotion(asQuery(new FakeQuery(true))).current).toBe(true);
    expect(watchReducedMotion(asQuery(new FakeQuery(false))).current).toBe(false);
  });

  it('follows changes without a reload', () => {
    const query = new FakeQuery(false);
    const motion = watchReducedMotion(asQuery(query));
    query.set(true);
    expect(motion.current).toBe(true);
    query.set(false);
    expect(motion.current).toBe(false);
  });

  it('is false when media queries are unsupported', () => {
    expect(watchReducedMotion(null).current).toBe(false);
  });

  it('stops listening once disposed (AC-12)', () => {
    const query = new FakeQuery(false);
    const remove = vi.spyOn(query, 'removeEventListener');
    const motion = watchReducedMotion(asQuery(query));
    motion.dispose();
    expect(remove).toHaveBeenCalledWith('change', expect.any(Function));
    query.set(true);
    expect(motion.current).toBe(false);
  });

  it('uses the prefers-reduced-motion query by default', () => {
    const matchMedia = vi.fn(() => asQuery(new FakeQuery(true)));
    vi.stubGlobal('matchMedia', matchMedia);
    expect(watchReducedMotion().current).toBe(true);
    expect(matchMedia).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)');
    vi.unstubAllGlobals();
  });
});
