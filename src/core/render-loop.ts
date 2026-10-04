import { createClock, type Clock } from './clock';

/** Frame scheduling, injectable so tests can step frames by hand. */
export interface Scheduler {
  request(cb: (nowMs: number) => void): number;
  cancel(handle: number): void;
}

/** Anything that reports page visibility like `document`. */
export interface VisibilitySource extends EventTarget {
  readonly visibilityState: DocumentVisibilityState;
}

export type FrameCallback = (deltaSeconds: number, elapsedSeconds: number) => void;

export interface RenderLoopOptions {
  clock?: Clock;
  scheduler?: Scheduler;
  visibility?: VisibilitySource;
}

const browserScheduler: Scheduler = {
  request: (cb) => requestAnimationFrame(cb),
  cancel: (handle) => cancelAnimationFrame(handle),
};

/**
 * Drives frames while started. Pauses scheduling while the page is hidden and resets the
 * clock on resume, so the next frame sees delta 0 instead of the time spent hidden (AC-6).
 */
export class RenderLoop {
  private readonly clock: Clock;
  private readonly scheduler: Scheduler;
  private readonly visibility: VisibilitySource;
  private handle: number | undefined;
  private running = false;

  constructor(
    private readonly onFrame: FrameCallback,
    options: RenderLoopOptions = {},
  ) {
    this.clock = options.clock ?? createClock();
    this.scheduler = options.scheduler ?? browserScheduler;
    this.visibility = options.visibility ?? document;
  }

  /** True between `start()` and `stop()`, including while paused by a hidden tab. */
  get isRunning(): boolean {
    return this.running;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.clock.reset();
    this.visibility.addEventListener('visibilitychange', this.onVisibilityChange);
    if (this.visibility.visibilityState === 'visible') this.schedule();
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    this.visibility.removeEventListener('visibilitychange', this.onVisibilityChange);
    this.unschedule();
  }

  private schedule(): void {
    if (this.handle === undefined) this.handle = this.scheduler.request(this.frame);
  }

  private unschedule(): void {
    if (this.handle === undefined) return;
    this.scheduler.cancel(this.handle);
    this.handle = undefined;
  }

  private readonly frame = (nowMs: number): void => {
    this.handle = undefined;
    const { delta, elapsed } = this.clock.tick(nowMs);
    this.onFrame(delta, elapsed);
    if (this.running && this.visibility.visibilityState === 'visible') this.schedule();
  };

  private readonly onVisibilityChange = (): void => {
    if (this.visibility.visibilityState === 'visible') {
      this.clock.reset();
      this.schedule();
    } else {
      this.unschedule();
    }
  };
}
