import { RenderLoop, type RenderLoopOptions } from './render-loop';
import type { RendererLike, SpaceInstance } from './types';

/** Constitution IV: cap device pixel ratio to keep fill-rate sane on high-DPI screens. */
export const MAX_PIXEL_RATIO = 2;

/** Calls `onResize` when `target` changes size; returns a function that stops watching. */
export type ResizeWatcher = (
  target: HTMLElement,
  onResize: (width: number, height: number) => void,
) => () => void;

export interface EngineOptions<R extends RendererLike> {
  container: HTMLElement;
  /** Created by the caller so tests can pass a fake; in the app this is the one WebGLRenderer. */
  renderer: R;
  devicePixelRatio?: number;
  loop?: RenderLoopOptions;
  watchResize?: ResizeWatcher;
}

const watchWithResizeObserver: ResizeWatcher = (target, onResize) => {
  const observer = new ResizeObserver(([entry]) => {
    if (entry) onResize(entry.contentRect.width, entry.contentRect.height);
  });
  observer.observe(target);
  return () => observer.disconnect();
};

/**
 * Owns the session's renderer, canvas, overlay layer and render loop. Renders whichever
 * SpaceInstance is set; does not create or dispose Spaces (that is the SpaceManager's job).
 */
export class Engine<R extends RendererLike = RendererLike> {
  readonly renderer: R;
  readonly container: HTMLElement;
  /** DOM layer above the canvas for Space UI and messages. */
  readonly overlay: HTMLDivElement;

  private readonly loop: RenderLoop;
  private readonly stopWatchingResize: () => void;
  private current: SpaceInstance | null = null;
  private width: number;
  private height: number;
  private frameWaiters: Array<() => void> = [];

  constructor(options: EngineOptions<R>) {
    this.renderer = options.renderer;
    this.container = options.container;

    const ratio = options.devicePixelRatio ?? window.devicePixelRatio;
    this.renderer.setPixelRatio(Math.min(ratio, MAX_PIXEL_RATIO));

    this.overlay = document.createElement('div');
    this.overlay.className = 'overlay';
    this.container.append(this.renderer.domElement, this.overlay);

    this.width = this.container.clientWidth;
    this.height = this.container.clientHeight;
    // updateStyle=false: CSS sizes the canvas (100% of the container); we only size the drawing buffer.
    this.renderer.setSize(this.width, this.height, false);

    this.loop = new RenderLoop(this.frame, options.loop);
    this.stopWatchingResize = (options.watchResize ?? watchWithResizeObserver)(this.container, this.resize);
  }

  get size(): { width: number; height: number } {
    return { width: this.width, height: this.height };
  }

  get instance(): SpaceInstance | null {
    return this.current;
  }

  start(): void {
    this.loop.start();
  }

  /** Sets (or clears, with `null`) the Space to render. Sizes it to the current viewport. */
  setInstance(instance: SpaceInstance | null): void {
    this.current = instance;
    if (instance && this.hasArea()) instance.resize(this.width, this.height);
  }

  /** Resolves after the next frame has been rendered. */
  nextFrame(): Promise<void> {
    return new Promise((resolve) => this.frameWaiters.push(resolve));
  }

  dispose(): void {
    this.loop.stop();
    this.stopWatchingResize();
    this.current = null;
    this.overlay.remove();
    this.renderer.domElement.remove();
    this.renderer.dispose();
    this.releaseFrameWaiters();
  }

  private hasArea(): boolean {
    return this.width > 0 && this.height > 0;
  }

  private readonly frame = (delta: number, elapsed: number): void => {
    const instance = this.current;
    if (instance) {
      instance.update(delta, elapsed);
      if (instance.render) instance.render();
      else this.renderer.render(instance.scene, instance.camera);
    } else {
      this.renderer.clear();
    }
    this.releaseFrameWaiters();
  };

  private readonly resize = (width: number, height: number): void => {
    this.width = width;
    this.height = height;
    this.renderer.setSize(width, height, false);
    if (this.current && this.hasArea()) this.current.resize(width, height);
  };

  private releaseFrameWaiters(): void {
    const waiters = this.frameWaiters;
    this.frameWaiters = [];
    waiters.forEach((resolve) => resolve());
  }
}
