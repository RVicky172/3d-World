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

/** True when the user asked the OS to minimise motion (Constitution V). */
export function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}
