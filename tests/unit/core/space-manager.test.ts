import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PerspectiveCamera, Scene, type WebGLRenderer } from 'three';
import { SpaceManager, type ManagedEngine, type Transition } from '../../../src/core/space-manager';
import type { SpaceContext, SpaceFactory, SpaceInstance, SpaceMeta } from '../../../src/core/types';

/** Shared call log so tests can assert ordering across engine, fader and Spaces. */
let log: string[];

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const flush = () => new Promise<void>((r) => setTimeout(r, 0));

class FakeEngine implements ManagedEngine {
  readonly renderer = { domElement: document.createElement('canvas') } as unknown as WebGLRenderer;
  readonly overlay = document.createElement('div');
  instance: SpaceInstance | null = null;

  setInstance(instance: SpaceInstance | null): void {
    this.instance = instance;
    log.push(`setInstance(${instance ? (instance as TestInstance).id : 'null'})`);
  }

  nextFrame(): Promise<void> {
    log.push('nextFrame');
    return Promise.resolve();
  }
}

class FakeFader implements Transition {
  out = vi.fn(async () => void log.push('fader.out'));
  in = vi.fn(async () => void log.push('fader.in'));
}

interface TestInstance extends SpaceInstance {
  id: string;
  ctx: SpaceContext;
  signalAbortedAtDispose?: boolean;
}

function createSpace(id: string) {
  const instances: TestInstance[] = [];
  const factory: SpaceFactory = async (ctx) => {
    log.push(`create(${id})`);
    const instance: TestInstance = {
      id,
      ctx,
      scene: new Scene(),
      camera: new PerspectiveCamera(),
      update: () => {},
      resize: () => {},
      dispose: vi.fn(() => {
        instance.signalAbortedAtDispose = ctx.signal.aborted;
        log.push(`dispose(${id})`);
      }),
    };
    instances.push(instance);
    return instance;
  };
  const load = vi.fn(async () => {
    log.push(`load(${id})`);
    return { default: factory };
  });
  const meta: SpaceMeta = { id, title: id, description: id, kind: 'single', load };
  return { meta, load, instances };
}

describe('SpaceManager', () => {
  let engine: FakeEngine;
  let fader: FakeFader;
  let status: HTMLElement;
  let a: ReturnType<typeof createSpace>;
  let b: ReturnType<typeof createSpace>;
  let c: ReturnType<typeof createSpace>;
  let manager: SpaceManager;

  beforeEach(() => {
    log = [];
    engine = new FakeEngine();
    fader = new FakeFader();
    status = document.createElement('body');
    a = createSpace('a');
    b = createSpace('b');
    c = createSpace('c');
    manager = new SpaceManager({
      engine,
      fader,
      registry: [a.meta, b.meta, c.meta],
      reducedMotion: false,
      statusElement: status,
    });
  });

  it('does not load any Space until open() is called (AC-2)', () => {
    expect(a.load).not.toHaveBeenCalled();
    expect(manager.activeId).toBeNull();
  });

  it('opens a Space: fade out, load, create, show, first frame, fade in', async () => {
    await expect(manager.open('a')).resolves.toBe('opened');

    expect(log).toEqual(['fader.out', 'load(a)', 'create(a)', 'setInstance(a)', 'nextFrame', 'fader.in']);
    expect(manager.activeId).toBe('a');
    expect(engine.instance).toBe(a.instances[0]);
  });

  it('builds the SpaceContext from the engine', async () => {
    await manager.open('a');
    const ctx = a.instances[0]?.ctx;
    expect(ctx?.renderer).toBe(engine.renderer);
    expect(ctx?.canvas).toBe(engine.renderer.domElement);
    expect(ctx?.overlay).toBe(engine.overlay);
    expect(ctx?.reducedMotion).toBe(false);
  });

  it('disposes the previous Space before creating and showing the next (AC-3, AC-10)', async () => {
    await manager.open('a');
    log = [];

    await manager.open('b');

    expect(log).toEqual([
      'fader.out',
      'load(b)',
      'dispose(a)',
      'setInstance(null)',
      'create(b)',
      'setInstance(b)',
      'nextFrame',
      'fader.in',
    ]);
  });

  it('aborts the Space’s signal before calling dispose()', async () => {
    await manager.open('a');
    await manager.open('b');
    expect(a.instances[0]?.signalAbortedAtDispose).toBe(true);
  });

  it('when switching rapidly, only the newest request wins and stale instances are disposed', async () => {
    const loadA = deferred<{ default: SpaceFactory }>();
    const loadB = deferred<{ default: SpaceFactory }>();
    const realA = await a.meta.load();
    const realB = await b.meta.load();
    a.load.mockReturnValueOnce(loadA.promise);
    b.load.mockReturnValueOnce(loadB.promise);

    const openA = manager.open('a');
    await flush();
    const openB = manager.open('b');
    await flush();
    const openC = manager.open('c');

    // B finishes loading after C was requested; A finishes last.
    loadB.resolve(realB);
    await expect(openC).resolves.toBe('opened');
    loadA.resolve(realA);

    await expect(openA).resolves.toBe('superseded');
    await expect(openB).resolves.toBe('superseded');
    expect(manager.activeId).toBe('c');
    expect(engine.instance).toBe(c.instances[0]);
    // Stale requests stop after loading: they never create an instance.
    expect(a.instances).toHaveLength(0);
    expect(b.instances).toHaveLength(0);
  });

  it('disposes an instance that finished creating after a newer request started', async () => {
    const gate = deferred<void>();
    const slowFactory: SpaceFactory = async (ctx) => {
      await gate.promise;
      const realFactory = (await a.meta.load()).default;
      return realFactory(ctx);
    };
    a.load.mockResolvedValueOnce({ default: slowFactory });

    const openA = manager.open('a');
    await flush();
    const openB = manager.open('b');
    gate.resolve();

    await expect(openA).resolves.toBe('superseded');
    await expect(openB).resolves.toBe('opened');
    expect(a.instances[0]?.dispose).toHaveBeenCalledOnce();
    expect(engine.instance).toBe(b.instances[0]);
  });

  it('shows "Space not found" for an unknown id without throwing (AC-8)', async () => {
    await manager.open('a');

    await expect(manager.open('nope')).resolves.toBe('not-found');

    expect(engine.overlay.querySelector('[role="alert"]')?.textContent).toContain('Space not found');
    expect(a.instances[0]?.dispose).toHaveBeenCalledOnce();
    expect(engine.instance).toBeNull();
    expect(manager.activeId).toBeNull();
    expect(status.dataset.spaceStatus).toBe('not-found');
  });

  it('shows "Failed to load" when the module fails to load, without throwing', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    a.load.mockRejectedValueOnce(new Error('chunk 404'));

    await expect(manager.open('a')).resolves.toBe('load-error');

    expect(engine.overlay.querySelector('[role="alert"]')?.textContent).toContain('Failed to load');
    expect(engine.instance).toBeNull();
    expect(fader.in).toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledWith('Space "a" failed to load', expect.any(Error));
    consoleError.mockRestore();
  });

  it('shows "Failed to load" when the factory throws', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    a.load.mockResolvedValueOnce({
      default: async () => {
        throw new Error('bad scene');
      },
    });

    await expect(manager.open('a')).resolves.toBe('load-error');
    expect(engine.overlay.querySelector('[role="alert"]')).not.toBeNull();
    expect(consoleError).toHaveBeenCalledOnce();
    consoleError.mockRestore();
  });

  it('clears a previous message when a Space opens successfully', async () => {
    await manager.open('nope');
    await manager.open('a');
    expect(engine.overlay.querySelector('[role="alert"]')).toBeNull();
  });

  it('close() disposes the active Space and leaves no instance', async () => {
    await manager.open('a');

    await manager.close();

    expect(a.instances[0]?.dispose).toHaveBeenCalledOnce();
    expect(engine.instance).toBeNull();
    expect(manager.activeId).toBeNull();
    expect(status.dataset.spaceReady).toBeUndefined();
  });

  it('close() during an open cancels it', async () => {
    const loadA = deferred<{ default: SpaceFactory }>();
    const realA = await a.meta.load();
    a.load.mockReturnValueOnce(loadA.promise);

    const openA = manager.open('a');
    await flush();
    await manager.close();
    loadA.resolve(realA);

    await expect(openA).resolves.toBe('superseded');
    expect(engine.instance).toBeNull();
  });

  describe('status attributes for tests and styling', () => {
    it('removes data-space-ready when opening starts and sets it with data-space-id when done', async () => {
      await manager.open('a');
      expect(status.dataset.spaceReady).toBe('true');
      expect(status.dataset.spaceId).toBe('a');

      const opening = manager.open('b');
      expect(status.dataset.spaceReady).toBeUndefined();
      await opening;
      expect(status.dataset.spaceReady).toBe('true');
      expect(status.dataset.spaceId).toBe('b');
      expect(status.dataset.spaceStatus).toBe('opened');
    });
  });
});
