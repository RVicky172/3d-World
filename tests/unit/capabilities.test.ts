import { afterEach, describe, expect, it, vi } from 'vitest';
import { hasWebGL2, prefersReducedMotion } from '../../src/core/capabilities';

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
