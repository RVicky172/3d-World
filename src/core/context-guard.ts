import { showContextLost } from '../ui/context-lost';

export interface ContextGuardOptions {
  /** The renderer's canvas, which fires `webglcontextlost` / `webglcontextrestored`. */
  canvas: EventTarget;
  /** `#app`: the panel goes here, above the fader. */
  container: HTMLElement;
  engine: { start(): void; stop(): void };
  manager: { suspend(): void; resume(): Promise<unknown> };
  /** `location.reload` in the app; the panel's way out if the context never comes back. */
  reload: () => void;
  /** Receives `data-webgl="lost"`. Defaults to `<body>`. */
  statusElement?: HTMLElement;
}

/**
 * Keeps a lost WebGL context from leaving a frozen or blank page (spec 005, AC-6–AC-8).
 *
 * On loss, the view is disposed while every GL call is a harmless no-op, the loop stops and the
 * visitor gets a message with a Reload button. three.js itself calls `preventDefault()` so the
 * browser may restore the context. When it does, three re-creates its internal state, and the view
 * is rebuilt from scratch through the SpaceManager (no stale GPU objects from the old context).
 */
export class ContextGuard {
  private readonly canvas: EventTarget;
  private readonly container: HTMLElement;
  private readonly engine: ContextGuardOptions['engine'];
  private readonly manager: ContextGuardOptions['manager'];
  private readonly reload: () => void;
  private readonly status: HTMLElement;
  private removePanel: (() => void) | null = null;

  constructor(options: ContextGuardOptions) {
    this.canvas = options.canvas;
    this.container = options.container;
    this.engine = options.engine;
    this.manager = options.manager;
    this.reload = options.reload;
    this.status = options.statusElement ?? document.body;
    this.canvas.addEventListener('webglcontextlost', this.onLost);
    this.canvas.addEventListener('webglcontextrestored', this.onRestored);
  }

  get isLost(): boolean {
    return this.removePanel !== null;
  }

  dispose(): void {
    this.canvas.removeEventListener('webglcontextlost', this.onLost);
    this.canvas.removeEventListener('webglcontextrestored', this.onRestored);
    this.clearLost();
  }

  private readonly onLost = (): void => {
    this.engine.stop();
    this.manager.suspend();
    this.removePanel = showContextLost(this.container, () => this.reload());
    this.status.dataset.webgl = 'lost';
  };

  private readonly onRestored = (): void => {
    if (!this.isLost) return;
    this.clearLost();
    this.engine.start();
    void this.manager.resume();
  };

  private clearLost(): void {
    this.removePanel?.();
    this.removePanel = null;
    delete this.status.dataset.webgl;
  }
}
