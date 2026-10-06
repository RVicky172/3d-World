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
  /** `background`: the compact, non-blocking variant for content arriving after the view is ready (022). */
  show(label: string, options?: { background?: boolean }): void;
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
  /**
   * Receives `data-view`, `data-space-ready`, `data-space-id`, `data-space-status` and `data-space-background`
   * (022: "loading", then "done" once the view's background content has arrived). Defaults to `<body>`.
   */
  statusElement?: HTMLElement;
  loading?: LoadingIndicator;
  loadingDelayMs?: number;
  /**
   * Builds the info panel shown in every registry Space (spec 012, AC-1): called with the Space's registry
   * title and description once its factory has built the view, and disposed with the view. Not for the gallery.
   */
  infoPanel?: (overlay: HTMLElement, info: { title: string; description: string }) => { dispose(): void };
  /** Read at each open for `SpaceContext.startTime` (spec 021). Defaults to `Date.now`; tests pass a constant. */
  wallClock?: () => number;
}

interface Mounted {
  view: ViewName;
  /** Registry id for Spaces; null for other views. */
  id: string | null;
  /** For messages and logs. */
  label: string;
  instance: SpaceInstance;
  controller: AbortController;
  /** The core's info panel for registry Spaces (spec 012). */
  panel: { dispose(): void } | null;
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
  private readonly infoPanel: SpaceManagerOptions['infoPanel'] | null;
  private readonly loadingDelayMs: number;
  private readonly wallClock: () => number;
  /**
   * The current target's state from before a context loss (spec 021, AC-12): set by `suspend()` from the mounted
   * view, handed to the next `resume()`, kept while that rebuild is in flight, dropped by any other request.
   */
  private savedState: unknown = undefined;
  /** The request whose loading timer is pending or whose indicator is showing, and its latest progress. */
  private loadingFor: {
    token: number;
    timer: ReturnType<typeof setTimeout>;
    shown: boolean;
    progress: number | null;
  } | null = null;
  /**
   * Content a ready view is still loading (spec 022, AC-11), for one request: its latest progress, whether the
   * view is ready, the delay timer, and whether the compact indicator is showing.
   */
  private background: {
    token: number;
    label: string;
    value: number | null;
    ready: boolean;
    timer: ReturnType<typeof setTimeout> | null;
    shown: boolean;
  } | null = null;
  /** The request whose view last became ready (spec 022): its background progress may show at once. */
  private readyToken = -1;
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
    this.infoPanel = options.infoPanel ?? null;
    this.loadingDelayMs = options.loadingDelayMs ?? LOADING_DELAY_MS;
    this.wallClock = options.wallClock ?? Date.now;
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
    this.savedState = undefined;
    this.stopBackground();
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
    // With nothing mounted (a loss mid-load), keep what the interrupted rebuild was carrying.
    if (this.mounted) this.savedState = saveStateOf(this.mounted);
    this.stopBackground();
    this.stopLoading();
    this.clearStatus();
    clearMessage(this.engine.overlay);
    this.unmount();
  }

  /** Rebuilds the view that was last requested; null if there is none (nothing opened, or closed). */
  async resume(): Promise<OpenResult | null> {
    if (!this.target) return null;
    const { view, id, source } = this.target;
    return this.mount(view, id, source, this.savedState);
  }

  private async mount(
    view: ViewName,
    id: string | null,
    source: FactorySource,
    savedState?: unknown,
  ): Promise<OpenResult> {
    const token = ++this.sequence;
    this.target = { view, id, source };
    this.savedState = savedState;
    this.stopBackground();
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
      return await this.build(token, view, id, label, source, savedState);
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
    savedState: unknown,
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

    const title = id === null ? view : (findSpace(id, this.registry)?.title ?? id);
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
        reportBackgroundProgress: (fraction, what) =>
          this.reportBackground(token, `${title} ${what}`, fraction),
        startTime: this.wallClock(),
        ...(savedState === undefined ? {} : { savedState }),
      });
    } catch (error) {
      if (isStale()) return 'superseded';
      return this.fail('load-error', label, error);
    }
    if (isStale()) {
      this.release({ view, id, label, instance, controller, panel: null });
      return 'superseded';
    }

    // After the factory: the panel prepends itself, so it lands before the Space's own UI in Tab order (AC-4).
    const meta = id === null ? undefined : findSpace(id, this.registry);
    const panel =
      meta && this.infoPanel
        ? this.infoPanel(this.engine.overlay, { title: meta.title, description: meta.description })
        : null;
    this.mounted = { view, id, label, instance, controller, panel };
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
    this.backgroundReady(token);
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
  private release({ label, instance, controller, panel }: Mounted): void {
    controller.abort();
    panel?.dispose();
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

  /**
   * Background progress from the view of request `token` (spec 022): kept until the view is ready, shown compactly
   * after the loading delay, `1` hides it with a "loaded" announcement (silent if it never showed).
   */
  private reportBackground(token: number, label: string, fraction: number | null): void {
    if (token !== this.sequence) return;
    // For tests, as data-space-ready: wait for "done" before measuring anything frame-rate sensitive.
    this.status.dataset.spaceBackground = fraction === 1 ? 'done' : 'loading';
    if (!this.loading) return;
    if (this.background?.token !== token) {
      this.background = {
        token,
        label,
        value: null,
        ready: token === this.readyToken,
        timer: null,
        shown: false,
      };
    }
    const state = this.background;
    state.value = clampProgress(state.value, fraction);
    if (state.value === 1) {
      if (state.timer) clearTimeout(state.timer);
      if (state.shown) {
        if (this.loading.ready) this.loading.ready();
        else this.loading.hide();
      }
      this.background = null;
      return;
    }
    if (state.shown) this.loading.progress?.(fraction);
    else this.scheduleBackground();
  }

  /** The view of request `token` is ready: pending background progress may now show. */
  private backgroundReady(token: number): void {
    this.readyToken = token;
    if (this.background?.token !== token) return;
    this.background.ready = true;
    this.scheduleBackground();
  }

  private scheduleBackground(): void {
    const state = this.background;
    const loading = this.loading;
    if (!state || !loading || !state.ready || state.timer || state.shown) return;
    state.timer = setTimeout(() => {
      if (this.background !== state) return;
      state.timer = null;
      state.shown = true;
      loading.show(state.label, { background: true });
      if (state.value !== null) loading.progress?.(state.value);
    }, this.loadingDelayMs);
  }

  /** A new request, close() or a context loss: drop background progress and hide its indicator. */
  private stopBackground(): void {
    const state = this.background;
    if (!state) return;
    if (state.timer) clearTimeout(state.timer);
    if (state.shown) this.loading?.hide();
    this.background = null;
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
    delete this.status.dataset.spaceBackground;
  }
}

/** A view's state for after a context loss; a throwing `saveState()` is logged and the view restarts fresh. */
function saveStateOf({ label, instance }: Mounted): unknown {
  try {
    return instance.saveState?.();
  } catch (error) {
    console.error(`Space "${label}" threw during saveState()`, error);
    return undefined;
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
