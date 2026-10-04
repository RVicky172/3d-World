import { vi } from 'vitest';
import type { Scheduler, VisibilitySource } from '../../src/core/render-loop';
import type { WebGLRenderer } from 'three';
import type { RendererLike, SpaceContext } from '../../src/core/types';

/** Collects requested frames; `flush(now)` runs them like one browser frame. */
export class FakeScheduler implements Scheduler {
  private nextHandle = 1;
  readonly pending = new Map<number, (nowMs: number) => void>();

  request(cb: (nowMs: number) => void): number {
    const handle = this.nextHandle++;
    this.pending.set(handle, cb);
    return handle;
  }

  cancel(handle: number): void {
    this.pending.delete(handle);
  }

  flush(nowMs: number): void {
    const callbacks = [...this.pending.values()];
    this.pending.clear();
    callbacks.forEach((cb) => cb(nowMs));
  }
}

export class FakeVisibility extends EventTarget implements VisibilitySource {
  visibilityState: DocumentVisibilityState = 'visible';

  set(state: DocumentVisibilityState): void {
    this.visibilityState = state;
    this.dispatchEvent(new Event('visibilitychange'));
  }
}

/** A RendererLike whose methods are spies. No WebGL needed. */
export function createFakeRenderer() {
  return {
    domElement: document.createElement('canvas'),
    info: { memory: { geometries: 0, textures: 0 } },
    setPixelRatio: vi.fn<RendererLike['setPixelRatio']>(),
    setSize: vi.fn<RendererLike['setSize']>(),
    render: vi.fn<RendererLike['render']>(),
    clear: vi.fn<RendererLike['clear']>(),
    dispose: vi.fn<RendererLike['dispose']>(),
  } satisfies RendererLike;
}

/** A SpaceContext for building Spaces in unit tests. The renderer is a stub: factories must not render. */
export function createFakeContext(overrides: Partial<SpaceContext> = {}): SpaceContext {
  const canvas = document.createElement('canvas');
  return {
    renderer: { domElement: canvas } as unknown as WebGLRenderer,
    canvas,
    overlay: document.createElement('div'),
    reducedMotion: false,
    signal: new AbortController().signal,
    ...overrides,
  };
}

/**
 * Browser-like `location` + `history` + `window` events for hash routing, in one object:
 * - assigning `hash` to a new value pushes an entry and fires `hashchange` (same value: nothing),
 *   and drops any forward entries, like a real navigation;
 * - `replaceState(_, _, '#/x')` swaps the current entry without an event;
 * - `back()` / `forward()` move through entries and fire `hashchange`.
 */
export class FakeBrowserLocation extends EventTarget {
  entries: string[];
  index = 0;

  constructor(initialHash = '') {
    super();
    this.entries = [normaliseHash(initialHash)];
  }

  get hash(): string {
    return this.entries[this.index] ?? '';
  }

  set hash(value: string) {
    const next = normaliseHash(value);
    if (next === this.hash) return;
    this.entries = [...this.entries.slice(0, this.index + 1), next];
    this.index = this.entries.length - 1;
    this.dispatchEvent(new Event('hashchange'));
  }

  replaceState(_data: unknown, _unused: string, url?: string | URL | null): void {
    if (url != null) this.entries[this.index] = normaliseHash(String(url));
  }

  back(): void {
    if (this.index === 0) return;
    this.index--;
    this.dispatchEvent(new Event('hashchange'));
  }

  forward(): void {
    if (this.index === this.entries.length - 1) return;
    this.index++;
    this.dispatchEvent(new Event('hashchange'));
  }
}

/** `location.hash` reads back as "" for an empty fragment and "#…" otherwise. */
function normaliseHash(value: string): string {
  const fragment = value.startsWith('#') ? value.slice(1) : value;
  return fragment === '' ? '' : `#${fragment}`;
}
