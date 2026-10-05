export const FADE_DURATION_MS = 300;

export interface FaderOptions {
  /**
   * With reduced motion the swap is instant (Constitution V, AC-10). Read on every fade, so a
   * preference change mid-session applies to the next swap (spec 005, AC-10).
   */
  reducedMotion: () => boolean;
  durationMs?: number;
  /** Start opaque (e.g. at boot, so the first Space only fades in). */
  covered?: boolean;
}

type FadeState = 'in' | 'out';

/**
 * Full-screen overlay in the background colour used to hide a Space swap.
 * `out()` covers the canvas, `in()` reveals it. Each resolves when its fade completes.
 */
export class Fader {
  readonly element: HTMLDivElement;
  private readonly durationMs: number;
  private readonly reducedMotion: () => boolean;
  private state: FadeState;
  private pending: { timer: ReturnType<typeof setTimeout>; waiters: Array<() => void> } | undefined;

  constructor(container: HTMLElement, options: FaderOptions) {
    this.durationMs = options.durationMs ?? FADE_DURATION_MS;
    this.reducedMotion = options.reducedMotion;

    this.element = document.createElement('div');
    this.element.className = 'fader';
    this.element.setAttribute('aria-hidden', 'true');
    this.state = options.covered ? 'out' : 'in';
    this.element.dataset.state = this.state;
    this.element.style.opacity = options.covered ? '1' : '0';
    this.applyTransition();
    container.append(this.element);
  }

  out(): Promise<void> {
    return this.fadeTo('out', '1');
  }

  in(): Promise<void> {
    return this.fadeTo('in', '0');
  }

  dispose(): void {
    this.settlePending();
    this.element.remove();
  }

  /** Sets the CSS transition for the current preference; returns true when swaps are instant. */
  private applyTransition(): boolean {
    const instant = this.reducedMotion();
    this.element.style.transition = instant ? 'none' : `opacity ${this.durationMs}ms ease`;
    return instant;
  }

  private fadeTo(state: FadeState, opacity: string): Promise<void> {
    if (state === this.state) {
      // Already there, or already heading there: wait for that fade rather than starting another.
      const pending = this.pending;
      return pending ? new Promise((resolve) => pending.waiters.push(resolve)) : Promise.resolve();
    }

    // A fade in the other direction interrupts the current one; its waiters are released immediately.
    this.settlePending();
    const instant = this.applyTransition();
    this.state = state;
    this.element.dataset.state = state;
    this.element.style.opacity = opacity;
    if (instant) return Promise.resolve();

    // A timer rather than `transitionend`: it always fires, even when the opacity
    // did not change or the tab is in the background.
    return new Promise((resolve) => {
      const timer = setTimeout(() => this.settlePending(), this.durationMs);
      this.pending = { timer, waiters: [resolve] };
    });
  }

  private settlePending(): void {
    if (!this.pending) return;
    const { timer, waiters } = this.pending;
    this.pending = undefined;
    clearTimeout(timer);
    waiters.forEach((resolve) => resolve());
  }
}
