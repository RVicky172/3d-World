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

export interface SpaceManagerOptions {
  engine: ManagedEngine;
  fader: Transition;
  reducedMotion: boolean;
  registry?: readonly SpaceMeta[];
  /** Receives `data-space-ready`, `data-space-id`, `data-space-status`. Defaults to `<body>`. */
  statusElement?: HTMLElement;
}

interface Mounted {
  id: string;
  instance: SpaceInstance;
  controller: AbortController;
}

/**
 * Loads, shows, switches and disposes Spaces. `open()` never throws.
 *
 * Order (AC-3, AC-10): fade out → load module → dispose previous → create next → show →
 * first frame → fade in. Every `open()`/`close()` takes a new sequence number; an older
 * request that finds it is no longer the latest stops and resolves `'superseded'`.
 */
export class SpaceManager {
  private readonly engine: ManagedEngine;
  private readonly fader: Transition;
  private readonly reducedMotion: boolean;
  private readonly registry: readonly SpaceMeta[];
  private readonly status: HTMLElement;
  private mounted: Mounted | null = null;
  private sequence = 0;

  constructor(options: SpaceManagerOptions) {
    this.engine = options.engine;
    this.fader = options.fader;
    this.reducedMotion = options.reducedMotion;
    this.registry = options.registry ?? spaces;
    this.status = options.statusElement ?? document.body;
  }

  get activeId(): string | null {
    return this.mounted?.id ?? null;
  }

  async open(id: string): Promise<OpenResult> {
    const token = ++this.sequence;
    const isStale = () => token !== this.sequence;
    this.clearStatus();

    await this.fader.out();
    if (isStale()) return 'superseded';
    clearMessage(this.engine.overlay);

    const meta = findSpace(id, this.registry);
    if (!meta) return this.fail('not-found', id);

    let factory: SpaceFactory;
    try {
      factory = (await meta.load()).default;
    } catch (error) {
      if (isStale()) return 'superseded';
      return this.fail('load-error', id, error);
    }
    if (isStale()) return 'superseded';

    this.unmount();

    const controller = new AbortController();
    let instance: SpaceInstance;
    try {
      instance = await factory({
        renderer: this.engine.renderer,
        canvas: this.engine.renderer.domElement,
        overlay: this.engine.overlay,
        reducedMotion: this.reducedMotion,
        signal: controller.signal,
      });
    } catch (error) {
      if (isStale()) return 'superseded';
      return this.fail('load-error', id, error);
    }
    if (isStale()) {
      this.release({ id, instance, controller });
      return 'superseded';
    }

    this.mounted = { id, instance, controller };
    this.engine.setInstance(instance);
    await this.engine.nextFrame();
    if (isStale()) return 'superseded';

    await this.fader.in();
    if (isStale()) return 'superseded';

    this.status.dataset.spaceId = id;
    this.status.dataset.spaceStatus = 'opened';
    this.status.dataset.spaceReady = 'true';
    return 'opened';
  }

  /** Disposes the active Space (if any) and cancels any `open()` in flight. */
  async close(): Promise<void> {
    ++this.sequence;
    this.clearStatus();
    clearMessage(this.engine.overlay);
    this.unmount();
    await this.fader.in();
  }

  private async fail(kind: MessageKind, id: string, error?: unknown): Promise<OpenResult> {
    if (error !== undefined) console.error(`Space "${id}" failed to load`, error);
    this.unmount();
    showMessage(this.engine.overlay, kind, id);
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

  /** Abort first so listeners are gone before the Space tears down its scene. */
  private release({ id, instance, controller }: Mounted): void {
    controller.abort();
    try {
      instance.dispose();
    } catch (error) {
      console.error(`Space "${id}" threw during dispose()`, error);
    }
  }

  private clearStatus(): void {
    delete this.status.dataset.spaceReady;
    delete this.status.dataset.spaceId;
    delete this.status.dataset.spaceStatus;
  }
}
