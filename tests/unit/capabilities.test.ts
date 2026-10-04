import { afterEach, describe, expect, it, vi } from 'vitest';
import { hasWebGL2, prefersCoarsePointer, prefersReducedMotion } from '../../src/core/capabilities';

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

describe('prefersReducedMotion', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const stubMatchMedia = (matches: boolean) => {
    const matchMedia = vi.fn((query: string) => ({ matches, media: query }) as MediaQueryList);
    vi.stubGlobal('matchMedia', matchMedia);
    return matchMedia;
  };

  it('is true when the OS asks for reduced motion', () => {
    const matchMedia = stubMatchMedia(true);
    expect(prefersReducedMotion()).toBe(true);
    expect(matchMedia).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)');
  });

  it('is false otherwise', () => {
    stubMatchMedia(false);
    expect(prefersReducedMotion()).toBe(false);
  });

  it('is false when matchMedia is unavailable', () => {
    vi.stubGlobal('matchMedia', undefined);
    expect(prefersReducedMotion()).toBe(false);
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
