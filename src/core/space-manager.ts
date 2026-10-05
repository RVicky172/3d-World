import type { WebGLRenderer } from 'three';
import { findSpace, spaces } from '../spaces/registry';
import { clearMessage, showMessage, type MessageKind } from '../ui/messages';
import { clampProgress } from './progress';
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

/** Shown while a view takes a while to load (spec 010, AC-8): the fader hides the view's own DOM meanwhile. */
export interface LoadingIndicator {
  show(label: string): void;
  /** Download progress, 0–1 or null (spec 011); only called while shown. */
  progress?(fraction: number | null): void;
  /** The view is ready after a shown indicator: announce it (spec 011, D-019). Falls back to `hide()`. */
  ready?(): void;
  hide(): void;
}

/** Opens faster than this show no loading indication, so cached or tiny views don't flash it. */
export const LOADING_DELAY_MS = 250;

export interface SpaceManagerOptions {
  engine: ManagedEngine;
  fader: Transition;
  /** Read for each view opened, so a mid-session preference change applies to the next view (spec 005, AC-10). */
  reducedMotion: () => boolean;
  registry?: readonly SpaceMeta[];
  /** Receives `data-view`, `data-space-ready`, `data-space-id`, `data-space-status`. Defaults to `<body>`. */
  statusElement?: HTMLElement;
  loading?: LoadingIndicator;
  loadingDelayMs?: number;
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
  private readonly loading: LoadingIndicator | null;
  private readonly loadingDelayMs: number;
  /** The request whose loading timer is pending or whose indicator is showing, and its latest progress. */
  private loadingFor: {
    token: number;
    timer: ReturnType<typeof setTimeout>;
    shown: boolean;
    progress: number | null;
  } | null = null;
  private sequence = 0;
  /** False until the first view mounts: focus is never moved on the initial page view (AC-13). */
  private hasMounted = false;

  constructor(options: SpaceManagerOptions) {
    this.engine = options.engine;
    this.fader = options.fader;
    this.reducedMotion = options.reducedMotion;
    this.registry = options.registry ?? spaces;
    this.status = options.statusElement ?? document.body;
    this.loading = options.loading ?? null;
    this.loadingDelayMs = options.loadingDelayMs ?? LOADING_DELAY_MS;
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
    this.stopLoading();
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
    this.stopLoading();
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
    this.stopLoading(); // a newer request replaces any indication for an older one
    this.clearStatus();
    // Set immediately, not after the fade: chrome such as the back link keys off it and must not flash.
    this.status.dataset.view = view;

    await this.fader.out();
    if (isStale()) return 'superseded';
    clearMessage(this.engine.overlay);

    // Timed from here, after the fade: only the loading itself counts towards the delay.
    const title = id === null ? view : (findSpace(id, this.registry)?.title ?? id);
    this.startLoading(token, title);
    try {
      return await this.build(token, view, id, label, source);
    } finally {
      this.stopLoading(token);
    }
  }

  private async build(
    token: number,
    view: ViewName,
    id: string | null,
    label: string,
    source: FactorySource,
  ): Promise<OpenResult> {
    const isStale = () => token !== this.sequence;
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
        reportProgress: (fraction) => this.reportProgress(token, fraction),
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
    this.finishLoading(token); // gone before the view fades in

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

  private startLoading(token: number, title: string): void {
    if (!this.loading) return;
    const loading = this.loading;
    const timer = setTimeout(() => {
      const state = this.loadingFor;
      if (state?.token !== token) return;
      state.shown = true;
      loading.show(title);
      // Progress reported during the delay appears with the indicator (spec 011, AC-8).
      if (state.progress !== null) loading.progress?.(state.progress);
    }, this.loadingDelayMs);
    this.loadingFor = { token, timer, shown: false, progress: null };
  }

  /** Success: a shown indicator says "<title> loaded" (D-019); a pending timer is just cancelled. */
  private finishLoading(token: number): void {
    const state = this.loadingFor;
    if (!this.loading || state?.token !== token || !state.shown) return this.stopLoading(token);
    clearTimeout(state.timer);
    this.loadingFor = null;
    if (this.loading.ready) this.loading.ready();
    else this.loading.hide();
  }

  /** Forwards a view's download progress, but only while its own request is the one loading (AC-11). */
  private reportProgress(token: number, fraction: number | null): void {
    const state = this.loadingFor;
    if (!this.loading || state?.token !== token) return;
    state.progress = clampProgress(state.progress, fraction);
    if (state.shown) this.loading.progress?.(fraction);
  }

  /** Cancels the pending timer and hides the indicator; with `token`, only if it belongs to that request. */
  private stopLoading(token?: number): void {
    if (!this.loading) return;
    if (token !== undefined && this.loadingFor?.token !== token) return;
    if (this.loadingFor) clearTimeout(this.loadingFor.timer);
    this.loadingFor = null;
    this.loading.hide();
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
