/** Returns true if the browser can create a WebGL2 context. */
export function hasWebGL2(
  createCanvas: () => HTMLCanvasElement = () => document.createElement('canvas'),
): boolean {
  try {
    const canvas = createCanvas();
    return !!canvas.getContext('webgl2');
  } catch {
    return false;
  }
}

/**
 * Runs `create` (e.g. `new WebGLRenderer(…)`) and returns null if it throws, so the caller can show the
 * fallback instead of a blank page (spec 005, AC-2). three.js has already logged the cause.
 */
export function createRendererOrNull<R>(create: () => R): R | null {
  try {
    return create();
  } catch {
    return null;
  }
}

/** The visitor's reduced-motion preference (Constitution V), kept current while the page is open (spec 005, AC-10). */
export interface MotionPreference {
  readonly current: boolean;
  dispose(): void;
}

const reducedMotionQuery = (): MediaQueryList | null =>
  typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;

/** Tracks `prefers-reduced-motion` through the query's `change` event; `null` (unsupported) means false. */
export function watchReducedMotion(query: MediaQueryList | null = reducedMotionQuery()): MotionPreference {
  let current = query?.matches ?? false;
  const onChange = (): void => {
    current = query?.matches ?? false;
  };
  query?.addEventListener('change', onChange);
  return {
    get current() {
      return current;
    },
    dispose: () => query?.removeEventListener('change', onChange),
  };
}

/** True on touch-first devices (finger rather than mouse), used for control hints (spec 004). */
export function prefersCoarsePointer(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
}
