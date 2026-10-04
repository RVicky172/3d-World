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
