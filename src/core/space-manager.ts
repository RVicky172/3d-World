import type { WebGLRenderer } from 'three';
import { findSpace, spaces } from '../spaces/registry';
import { clearMessage, showMessage, type MessageKind } from '../ui/messages';
import type { OpenResult, SpaceFactory, SpaceInstance, SpaceMeta } from './types';

/** The parts of `Engine` the manager needs. */
export interface ManagedEngine {
  readonly renderer: WebGLRenderer;
  readonly overlay: HTMLElement;
  setInstance(instance: SpaceInstance | null): void;
  nextFrame(): Promise<void>;
}

/** Hides the swap between Spaces (the `Fader`). */
export interface Transition {
  out(): Promise<void>;
  in(): Promise<void>;
}

/**
 * What is on screen. `space` = a registry Space (or its "not found"/"failed" screen);
 * `gallery` = the home page (spec 003), a view built from the same factory contract.
 */
export type ViewName = 'gallery' | 'space';

export interface SpaceManagerOptions {
  engine: ManagedEngine;
  fader: Transition;
  /** Read for each view opened, so a mid-session preference change applies to the next view (spec 005, AC-10). */
  reducedMotion: () => boolean;
  registry?: readonly SpaceMeta[];
  /** Receives `data-view`, `data-space-ready`, `data-space-id`, `data-space-status`. Defaults to `<body>`. */
  statusElement?: HTMLElement;
}

interface Mounted {
  view: ViewName;
  /** Registry id for Spaces; null for other views. */
  id: string | null;
  /** For messages and logs. */
  label: string;
  instance: SpaceInstance;
  controller: AbortController;
}

type FactorySource = () => Promise<SpaceFactory | 'not-found'>;

/** The latest view requested, so `resume()` can rebuild it after a context loss (spec 005). */
interface Target {
  view: ViewName;
  id: string | null;
  source: FactorySource;
}

/**
 * Loads, shows, switches and disposes views — registry Spaces and the gallery. Never throws.
 *
 * Order (001 AC-3, AC-10): fade out → load → dispose previous → create next → show →
 * first frame → fade in. Every `open()`/`openView()`/`close()` takes a new sequence number; an
 * older request that finds it is no longer the latest stops and resolves `'superseded'`.
 */
export class SpaceManager {
  private readonly engine: ManagedEngine;
  private readonly fader: Transition;
  private readonly reducedMotion: () => boolean;
  private readonly registry: readonly SpaceMeta[];
  private readonly status: HTMLElement;
  private mounted: Mounted | null = null;
  private target: Target | null = null;
  private sequence = 0;
  /** False until the first view mounts: focus is never moved on the initial page view (AC-13). */
  private hasMounted = false;

  constructor(options: SpaceManagerOptions) {
    this.engine = options.engine;
    this.fader = options.fader;
    this.reducedMotion = options.reducedMotion;
    this.registry = options.registry ?? spaces;
    this.status = options.statusElement ?? document.body;
  }

  /** Id of the mounted registry Space; null on the gallery or when nothing is mounted. */
  get activeId(): string | null {
    return this.mounted?.id ?? null;
  }

  get activeView(): ViewName | null {
    return this.mounted?.view ?? null;
  }

  /** Opens a registry Space by id. Unknown ids and load failures show a message (view `space`). */
  open(id: string): Promise<OpenResult> {
    return this.mount('space', id, async () => {
      const meta = findSpace(id, this.registry);
      return meta ? (await meta.load()).default : 'not-found';
    });
  }

  /** Opens a non-registry view such as the gallery, with the same transitions and lifecycle. */
  openView(view: ViewName, factory: SpaceFactory): Promise<OpenResult> {
    return this.mount(view, null, async () => factory);
  }

  /** Disposes the active view (if any) and cancels any open in flight. */
  async close(): Promise<void> {
    ++this.sequence;
    this.target = null;
    this.clearStatus();
    delete this.status.dataset.view;
    clearMessage(this.engine.overlay);
    this.unmount();
    await this.fader.in();
  }

  /**
   * Disposes the active view and cancels any open in flight, remembering what should be showing
   * (spec 005: called when the WebGL context is lost). Keeps `data-view` so chrome doesn't flash.
   */
  suspend(): void {
    ++this.sequence;
    this.clearStatus();
    clearMessage(this.engine.overlay);
    this.unmount();
  }

  /** Rebuilds the view that was last requested; null if there is none (nothing opened, or closed). */
  async resume(): Promise<OpenResult | null> {
    if (!this.target) return null;
    const { view, id, source } = this.target;
    return this.mount(view, id, source);
  }

  private async mount(view: ViewName, id: string | null, source: FactorySource): Promise<OpenResult> {
    const token = ++this.sequence;
    this.target = { view, id, source };
    const isStale = () => token !== this.sequence;
    const label = id ?? view;
    this.clearStatus();
    // Set immediately, not after the fade: chrome such as the back link keys off it and must not flash.
    this.status.dataset.view = view;

    await this.fader.out();
    if (isStale()) return 'superseded';
    clearMessage(this.engine.overlay);

    let factory: SpaceFactory;
    try {
      const found = await source();
      if (isStale()) return 'superseded';
      if (found === 'not-found') return this.fail('not-found', label);
      factory = found;
    } catch (error) {
      if (isStale()) return 'superseded';
      return this.fail('load-error', label, error);
    }

    const previousSpaceId = this.mounted?.id ?? null;
    this.unmount();

    const controller = new AbortController();
    let instance: SpaceInstance;
    try {
      instance = await factory({
        renderer: this.engine.renderer,
        canvas: this.engine.renderer.domElement,
        overlay: this.engine.overlay,
        reducedMotion: this.reducedMotion(),
        signal: controller.signal,
      });
    } catch (error) {
      if (isStale()) return 'superseded';
      return this.fail('load-error', label, error);
    }
    if (isStale()) {
      this.release({ view, id, label, instance, controller });
      return 'superseded';
    }

    this.mounted = { view, id, label, instance, controller };
    this.engine.setInstance(instance);
    if (this.hasMounted) restoreLostFocus(instance, previousSpaceId);
    this.hasMounted = true;
    await this.engine.nextFrame();
    if (isStale()) return 'superseded';

    await this.fader.in();
    if (isStale()) return 'superseded';

    if (id !== null) this.status.dataset.spaceId = id;
    this.status.dataset.spaceStatus = 'opened';
    this.status.dataset.spaceReady = 'true';
    return 'opened';
  }

  private async fail(kind: MessageKind, label: string, error?: unknown): Promise<OpenResult> {
    if (error !== undefined) console.error(`Space "${label}" failed to load`, error);
    this.unmount();
    showMessage(this.engine.overlay, kind, label);
    this.status.dataset.spaceStatus = kind;
    await this.fader.in();
    return kind;
  }

  private unmount(): void {
    if (!this.mounted) return;
    const mounted = this.mounted;
    this.mounted = null;
    this.release(mounted);
    this.engine.setInstance(null);
  }

  /** Abort first so listeners are gone before the view tears down its scene. */
  private release({ label, instance, controller }: Mounted): void {
    controller.abort();
    try {
      instance.dispose();
    } catch (error) {
      console.error(`Space "${label}" threw during dispose()`, error);
    }
  }

  private clearStatus(): void {
    delete this.status.dataset.spaceReady;
    delete this.status.dataset.spaceId;
    delete this.status.dataset.spaceStatus;
  }
}

/**
 * Spec 004, AC-13: if the view switch left keyboard focus nowhere (the focused element was removed or
 * hidden), move it to the new view's natural start. Focus resting on something still visible is left alone.
 */
function restoreLostFocus(instance: SpaceInstance, previousSpaceId: string | null): void {
  const active = document.activeElement;
  const lost =
    !active ||
    active === document.body ||
    !active.isConnected ||
    (typeof active.checkVisibility === 'function' && !active.checkVisibility());
  if (!lost) return;
  instance.focusTarget?.({ previousSpaceId })?.focus({ preventScroll: true });
}
