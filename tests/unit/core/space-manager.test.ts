import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

function createSpace(id: string, options: { attachInfo?: boolean } = {}) {
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
    if (options.attachInfo) instance.attachInfo = vi.fn(() => log.push(`attachInfo(${id})`));
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
      reducedMotion: () => false,
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

  it('reads the reduced-motion preference for each view it opens (spec 005, AC-10)', async () => {
    let reduce = false;
    const live = new SpaceManager({
      engine,
      fader,
      registry: [a.meta, b.meta],
      reducedMotion: () => reduce,
      statusElement: status,
    });

    await live.open('a');
    reduce = true;
    await live.open('b');

    expect(a.instances[0]?.ctx.reducedMotion).toBe(false); // the open view keeps what it was given
    expect(b.instances[0]?.ctx.reducedMotion).toBe(true);
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

  describe('suspend() and resume() (spec 005, context loss)', () => {
    it('suspend() disposes the Space and clears the ready signals, but keeps data-view (AC-6, AC-8)', async () => {
      await manager.open('a');
      log = [];

      manager.suspend();

      expect(log).toEqual(['dispose(a)', 'setInstance(null)']);
      expect(a.instances[0]?.signalAbortedAtDispose).toBe(true);
      expect(engine.instance).toBeNull();
      expect(manager.activeId).toBeNull();
      expect(status.dataset.spaceReady).toBeUndefined();
      expect(status.dataset.spaceStatus).toBeUndefined();
      expect(status.dataset.spaceId).toBeUndefined();
      expect(status.dataset.view).toBe('space');
    });

    it('resume() reopens the same Space from scratch (AC-7)', async () => {
      await manager.open('a');
      manager.suspend();

      await expect(manager.resume()).resolves.toBe('opened');

      expect(a.instances).toHaveLength(2);
      expect(engine.instance).toBe(a.instances[1]);
      expect(status.dataset.spaceId).toBe('a');
      expect(status.dataset.spaceReady).toBe('true');
    });

    it('resume() reopens a non-registry view such as the gallery through its factory', async () => {
      const gallery = createSpace('gallery');
      const factory = (await gallery.meta.load()).default;
      await manager.openView('gallery', factory);
      manager.suspend();

      await expect(manager.resume()).resolves.toBe('opened');

      expect(gallery.instances).toHaveLength(2);
      expect(manager.activeView).toBe('gallery');
      expect(engine.instance).toBe(gallery.instances[1]);
    });

    it('a suspend during an open cancels it; resume() opens the Space that was requested', async () => {
      await manager.open('a');
      const loadB = deferred<{ default: SpaceFactory }>();
      const realB = await b.meta.load();
      b.load.mockReturnValueOnce(loadB.promise);

      const openB = manager.open('b');
      await flush();
      manager.suspend();
      loadB.resolve(realB);

      await expect(openB).resolves.toBe('superseded');
      expect(b.instances).toHaveLength(0);
      await expect(manager.resume()).resolves.toBe('opened');
      expect(manager.activeId).toBe('b');
    });

    it('resume() after a suspend on "Space not found" shows it again', async () => {
      await manager.open('nope');
      manager.suspend();
      expect(engine.overlay.querySelector('[role="alert"]')).toBeNull();

      await expect(manager.resume()).resolves.toBe('not-found');
      expect(engine.overlay.querySelector('[role="alert"]')?.textContent).toContain('Space not found');
    });

    it('resume() does nothing when nothing was requested, or after close()', async () => {
      await expect(manager.resume()).resolves.toBeNull();
      await manager.open('a');
      await manager.close();
      manager.suspend();
      await expect(manager.resume()).resolves.toBeNull();
      expect(a.instances).toHaveLength(1);
    });

    it('a newer open() after suspend wins, and resume() follows it', async () => {
      await manager.open('a');
      manager.suspend();
      await manager.open('c');
      manager.suspend();

      await manager.resume();
      expect(manager.activeId).toBe('c');
    });

    it('suspend() with nothing mounted does not throw', () => {
      expect(() => manager.suspend()).not.toThrow();
    });
  });

  describe('start time and saved state (spec 021, AC-8, AC-12)', () => {
    /** Gives the mounted instance of `space` a `saveState()` returning `state`. */
    const saving = (space: ReturnType<typeof createSpace>, state: unknown) => {
      const instance = space.instances.at(-1)!;
      instance.saveState = vi.fn(() => state);
      return instance;
    };

    it('passes the wall clock as startTime, read again at each open (Q1)', async () => {
      const wallClock = vi.fn().mockReturnValueOnce(1000).mockReturnValueOnce(2000);
      const timed = new SpaceManager({
        engine,
        fader,
        registry: [a.meta],
        reducedMotion: () => false,
        wallClock,
      });
      await timed.open('a');
      await timed.open('a');
      expect(a.instances.map((i) => i.ctx.startTime)).toEqual([1000, 2000]);
    });

    it('a normal open gets no saved state (Q8: a new visit starts fresh)', async () => {
      await manager.open('a');
      expect(a.instances[0]?.ctx.savedState).toBeUndefined();
      expect('savedState' in a.instances[0]!.ctx).toBe(false);
    });

    it('suspend() keeps the Space’s saveState(); resume() hands it back as savedState', async () => {
      await manager.open('a');
      const first = saving(a, { days: 42 });
      manager.suspend();
      expect(first.saveState).toHaveBeenCalledOnce();
      expect(log.indexOf('dispose(a)')).toBeGreaterThan(-1); // still disposed

      await manager.resume();
      expect(a.instances[1]?.ctx.savedState).toEqual({ days: 42 });
    });

    it('uses a saved state once: a later open of the same Space starts fresh', async () => {
      await manager.open('a');
      saving(a, { days: 42 });
      manager.suspend();
      await manager.resume();
      await manager.open('a');
      expect(a.instances[2]?.ctx.savedState).toBeUndefined();
    });

    it('a newer open() or close() after suspend drops the saved state', async () => {
      await manager.open('a');
      saving(a, { days: 1 });
      manager.suspend();
      await manager.open('a');
      expect(a.instances[1]?.ctx.savedState).toBeUndefined();

      saving(a, { days: 2 });
      manager.suspend();
      await manager.close();
      await manager.open('a');
      manager.suspend();
      await manager.resume();
      expect(a.instances.at(-1)?.ctx.savedState).toBeUndefined();
    });

    it('a second loss while the restored Space is still loading keeps its saved state', async () => {
      await manager.open('a');
      saving(a, { days: 7 });
      manager.suspend();
      const loadA = deferred<{ default: SpaceFactory }>();
      const realA = await a.meta.load();
      a.load.mockReturnValueOnce(loadA.promise);
      const resumed = manager.resume();
      await flush();
      manager.suspend(); // nothing mounted yet
      loadA.resolve(realA);
      await expect(resumed).resolves.toBe('superseded');

      await manager.resume();
      expect(a.instances.at(-1)?.ctx.savedState).toEqual({ days: 7 });
    });

    it('a saveState() that throws is logged; the Space is still disposed and resumes fresh', async () => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => {});
      await manager.open('a');
      a.instances[0]!.saveState = () => {
        throw new Error('boom');
      };
      manager.suspend();
      expect(a.instances[0]?.dispose).toHaveBeenCalled();
      expect(error).toHaveBeenCalled();
      await manager.resume();
      expect(a.instances[1]?.ctx.savedState).toBeUndefined();
      error.mockRestore();
    });
  });

  describe('loading indication (spec 010, AC-8)', () => {
    let loading: {
      show: ReturnType<typeof vi.fn<(label: string) => void>>;
      hide: ReturnType<typeof vi.fn<() => void>>;
      progress: ReturnType<typeof vi.fn<(fraction: number | null) => void>>;
      ready: ReturnType<typeof vi.fn<() => void>>;
    };
    let slow: SpaceManager;

    beforeEach(() => {
      vi.useFakeTimers();
      loading = {
        show: vi.fn<(label: string) => void>(),
        hide: vi.fn<() => void>(),
        progress: vi.fn<(fraction: number | null) => void>(),
        ready: vi.fn<() => void>(),
      };
      a.meta.title = 'Space A';
      slow = new SpaceManager({
        engine,
        fader,
        registry: [a.meta, b.meta],
        reducedMotion: () => false,
        statusElement: status,
        loading,
      });
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    /** Makes the next load of `space` wait until the returned function is called. */
    const holdLoad = async (space: ReturnType<typeof createSpace>) => {
      const gate = deferred<{ default: SpaceFactory }>();
      const real = await space.meta.load();
      space.load.mockReturnValueOnce(gate.promise);
      return () => gate.resolve(real);
    };

    it('shows nothing when the view opens within 250 ms', async () => {
      const release = await holdLoad(a);
      const opening = slow.open('a');
      await vi.advanceTimersByTimeAsync(200);
      release();
      await expect(opening).resolves.toBe('opened');
      await vi.advanceTimersByTimeAsync(500);
      expect(loading.show).not.toHaveBeenCalled();
    });

    it('shows the Space title after 250 ms and hides it once the view is shown', async () => {
      const release = await holdLoad(a);
      const opening = slow.open('a');
      await vi.advanceTimersByTimeAsync(249);
      expect(loading.show).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(loading.show).toHaveBeenCalledWith('Space A');

      release();
      await expect(opening).resolves.toBe('opened');
      expect(loading.hide).toHaveBeenCalled();
      expect(loading.show).toHaveBeenCalledTimes(1);
    });

    it('labels a non-registry view by its name', async () => {
      const gate = deferred<void>();
      const gallery = createSpace('gallery');
      const factory = (await gallery.meta.load()).default;
      const opening = slow.openView('gallery', async (ctx) => {
        await gate.promise;
        return factory(ctx);
      });
      await vi.advanceTimersByTimeAsync(300);
      expect(loading.show).toHaveBeenCalledWith('gallery');
      gate.resolve();
      await opening;
    });

    it('hides it when the open fails (load-error)', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const gate = deferred<void>();
      a.load.mockImplementationOnce(async () => {
        await gate.promise;
        throw new Error('offline');
      });
      const opening = slow.open('a');
      await vi.advanceTimersByTimeAsync(300);
      expect(loading.show).toHaveBeenCalled();
      gate.resolve();
      await expect(opening).resolves.toBe('load-error');
      expect(loading.hide).toHaveBeenCalled();
    });

    it('hides it when the open is superseded, and the newer open manages its own', async () => {
      const releaseA = await holdLoad(a);
      const openA = slow.open('a');
      await vi.advanceTimersByTimeAsync(300);
      expect(loading.show).toHaveBeenCalledTimes(1);

      const openB = slow.open('b'); // fast
      await expect(openB).resolves.toBe('opened');
      releaseA();
      await expect(openA).resolves.toBe('superseded');

      expect(loading.hide).toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1000);
      expect(loading.show).toHaveBeenCalledTimes(1); // the stale timer never fires again
    });

    it('hides it on suspend() (context loss) and on close()', async () => {
      const release = await holdLoad(a);
      void slow.open('a');
      await vi.advanceTimersByTimeAsync(300);
      expect(loading.show).toHaveBeenCalledTimes(1);
      loading.hide.mockClear();
      slow.suspend();
      expect(loading.hide).toHaveBeenCalled();

      loading.hide.mockClear();
      await slow.close();
      expect(loading.hide).toHaveBeenCalled();
      release();
      await vi.advanceTimersByTimeAsync(1000);
      expect(loading.show).toHaveBeenCalledTimes(1);
    });

    it('a pending timer is cancelled when the open finishes first', async () => {
      await slow.open('a');
      await vi.advanceTimersByTimeAsync(1000);
      expect(loading.show).not.toHaveBeenCalled();
    });

    describe('"loaded" announcement (spec 011, AC-9, D-019)', () => {
      it('a slow open that showed the indicator ends with ready(), not hide()', async () => {
        const release = await holdLoad(a);
        const opening = slow.open('a');
        await vi.advanceTimersByTimeAsync(300);
        loading.hide.mockClear();
        release();
        await expect(opening).resolves.toBe('opened');
        expect(loading.ready).toHaveBeenCalledTimes(1);
        expect(loading.hide).not.toHaveBeenCalled();
      });

      it('a fast open never announces', async () => {
        await slow.open('a');
        await vi.advanceTimersByTimeAsync(1000);
        expect(loading.ready).not.toHaveBeenCalled();
      });

      it('failure, supersession and suspend() hide without announcing', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const gate = deferred<void>();
        a.load.mockImplementationOnce(async () => {
          await gate.promise;
          throw new Error('offline');
        });
        const failing = slow.open('a');
        await vi.advanceTimersByTimeAsync(300);
        gate.resolve();
        await expect(failing).resolves.toBe('load-error');

        const releaseA = await holdLoad(a);
        const superseded = slow.open('a');
        await vi.advanceTimersByTimeAsync(300);
        await slow.open('b');
        releaseA();
        await expect(superseded).resolves.toBe('superseded');

        const releaseB = await holdLoad(b);
        void slow.open('b');
        await vi.advanceTimersByTimeAsync(300);
        slow.suspend();
        releaseB();
        await vi.advanceTimersByTimeAsync(10);

        expect(loading.ready).not.toHaveBeenCalled();
      });
    });

    describe('progress (spec 011, AC-8, AC-11)', () => {
      /** Makes the next factory run of `space` wait; exposes its context so the test can report progress. */
      const holdFactory = async (space: ReturnType<typeof createSpace>) => {
        const gate = deferred<void>();
        const real = (await space.meta.load()).default;
        let context: SpaceContext | undefined;
        space.load.mockResolvedValueOnce({
          default: async (ctx) => {
            context = ctx;
            await gate.promise;
            return real(ctx);
          },
        });
        return {
          report: (fraction: number | null) => context!.reportProgress!(fraction),
          release: () => gate.resolve(),
          ctx: () => context!,
        };
      };

      it('gives the factory a reportProgress that reaches the shown indicator', async () => {
        const held = await holdFactory(a);
        const opening = slow.open('a');
        await vi.advanceTimersByTimeAsync(300);
        expect(loading.show).toHaveBeenCalledWith('Space A');

        held.report(0.4);
        held.report(null);
        expect(loading.progress.mock.calls).toEqual([[0.4], [null]]);
        held.release();
        await expect(opening).resolves.toBe('opened');
      });

      it('keeps progress reported before the indicator shows and applies it when it does', async () => {
        const held = await holdFactory(a);
        const opening = slow.open('a');
        await vi.advanceTimersByTimeAsync(10);
        held.report(0.3);
        held.report(0.2); // never backwards: the higher value is kept
        expect(loading.progress).not.toHaveBeenCalled();

        await vi.advanceTimersByTimeAsync(300);
        expect(loading.show).toHaveBeenCalledTimes(1);
        expect(loading.progress.mock.calls).toEqual([[0.3]]);
        expect(loading.show.mock.invocationCallOrder[0]!).toBeLessThan(
          loading.progress.mock.invocationCallOrder[0]!,
        );
        held.release();
        await opening;
      });

      it('a fast open that reported progress never shows anything', async () => {
        const held = await holdFactory(a);
        const opening = slow.open('a');
        await vi.advanceTimersByTimeAsync(10); // well under the 250 ms delay
        held.report(0.9);
        held.release();
        await expect(opening).resolves.toBe('opened');
        await vi.advanceTimersByTimeAsync(1000);
        expect(loading.show).not.toHaveBeenCalled();
        expect(loading.progress).not.toHaveBeenCalled();
      });

      it('ignores reports once the view has opened', async () => {
        const held = await holdFactory(a);
        const opening = slow.open('a');
        await vi.advanceTimersByTimeAsync(300);
        held.release();
        await expect(opening).resolves.toBe('opened');
        loading.progress.mockClear();
        held.report(1);
        expect(loading.progress).not.toHaveBeenCalled();
      });

      it('ignores a superseded request; the newer request reports its own', async () => {
        const heldA = await holdFactory(a);
        const openA = slow.open('a');
        await vi.advanceTimersByTimeAsync(300);
        const heldB = await holdFactory(b);
        const openB = slow.open('b');
        await vi.advanceTimersByTimeAsync(300);
        loading.progress.mockClear();

        heldA.report(0.9);
        expect(loading.progress).not.toHaveBeenCalled();
        heldB.report(0.1);
        expect(loading.progress.mock.calls).toEqual([[0.1]]);

        heldA.release();
        heldB.release();
        await expect(openA).resolves.toBe('superseded');
        await expect(openB).resolves.toBe('opened');
      });

      it('ignores reports after a failure or suspend()', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const held = await holdFactory(a);
        void slow.open('a');
        await vi.advanceTimersByTimeAsync(300);
        slow.suspend();
        loading.progress.mockClear();
        held.report(0.5);
        expect(loading.progress).not.toHaveBeenCalled();
        held.release();
        await vi.advanceTimersByTimeAsync(10);
      });

      it('is a harmless no-op without a loading indicator', async () => {
        const plain = new SpaceManager({
          engine,
          fader,
          registry: [a.meta],
          reducedMotion: () => false,
          statusElement: status,
        });
        const held = await holdFactory(a);
        const opening = plain.open('a');
        await vi.advanceTimersByTimeAsync(10);
        expect(() => held.report(0.5)).not.toThrow();
        held.release();
        await expect(opening).resolves.toBe('opened');
      });
    });
  });

  describe('background progress (spec 022, AC-11)', () => {
    let loading: {
      show: ReturnType<typeof vi.fn<(label: string, options?: { background?: boolean }) => void>>;
      hide: ReturnType<typeof vi.fn<() => void>>;
      progress: ReturnType<typeof vi.fn<(fraction: number | null) => void>>;
      ready: ReturnType<typeof vi.fn<() => void>>;
    };
    let bg: SpaceManager;

    beforeEach(() => {
      vi.useFakeTimers();
      loading = {
        show: vi.fn<(label: string, options?: { background?: boolean }) => void>(),
        hide: vi.fn<() => void>(),
        progress: vi.fn<(fraction: number | null) => void>(),
        ready: vi.fn<() => void>(),
      };
      a.meta.title = 'Space A';
      bg = new SpaceManager({
        engine,
        fader,
        registry: [a.meta, b.meta],
        reducedMotion: () => false,
        statusElement: status,
        loading,
      });
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    const report = (instance: number, fraction: number | null) =>
      a.instances[instance]!.ctx.reportBackgroundProgress!(fraction, 'imagery');

    // A signal for tests to wait on (as data-space-ready), e.g. before measuring frame-rate-sensitive behaviour.
    it('marks the status element: data-space-background "loading" until 1, then "done"; cleared on close', async () => {
      await bg.open('a');
      expect(status.dataset.spaceBackground).toBeUndefined();
      report(0, 0.4);
      expect(status.dataset.spaceBackground).toBe('loading');
      report(0, 1);
      expect(status.dataset.spaceBackground).toBe('done');
      await bg.close();
      expect(status.dataset.spaceBackground).toBeUndefined();
      report(0, 0.5); // the closed view's late report changes nothing
      expect(status.dataset.spaceBackground).toBeUndefined();
    });

    it('after the view is ready, shows a compact indicator after 250 ms with the progress', async () => {
      await bg.open('a');
      loading.show.mockClear();
      report(0, 0.1);
      expect(loading.show).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(250);
      expect(loading.show).toHaveBeenCalledWith('Space A imagery', { background: true });
      expect(loading.progress).toHaveBeenLastCalledWith(0.1);
      report(0, 0.6);
      expect(loading.progress).toHaveBeenLastCalledWith(0.6);
    });

    it('reaching 1 announces "… imagery loaded" when the indicator showed', async () => {
      await bg.open('a');
      report(0, 0.2);
      await vi.advanceTimersByTimeAsync(250);
      report(0, 1);
      expect(loading.ready).toHaveBeenCalledTimes(1);
    });

    it('content that arrives within 250 ms shows and announces nothing', async () => {
      await bg.open('a');
      loading.show.mockClear();
      report(0, 0.5);
      report(0, 1);
      await vi.advanceTimersByTimeAsync(1000);
      expect(loading.show).not.toHaveBeenCalled();
      expect(loading.ready).not.toHaveBeenCalled();
    });

    it('keeps reports made while the view was still opening, and shows them once it is ready', async () => {
      const fadeIn = deferred<undefined>();
      fader.in.mockImplementationOnce(() => fadeIn.promise); // hold the open just before "ready"
      const open = bg.open('a');
      await vi.advanceTimersByTimeAsync(0);
      expect(a.instances).toHaveLength(1); // created, not ready yet
      report(0, 0.3);
      await vi.advanceTimersByTimeAsync(1000);
      expect(loading.show).not.toHaveBeenCalledWith('Space A imagery', { background: true });
      fadeIn.resolve(undefined);
      await open;
      await vi.advanceTimersByTimeAsync(250);
      expect(loading.show).toHaveBeenLastCalledWith('Space A imagery', { background: true });
      expect(loading.progress).toHaveBeenLastCalledWith(0.3);
    });

    it('a newer open, close() or suspend() hides it and ignores the old view’s reports', async () => {
      await bg.open('a');
      report(0, 0.2);
      await vi.advanceTimersByTimeAsync(250);
      loading.hide.mockClear();
      await bg.close();
      expect(loading.hide).toHaveBeenCalled();
      loading.show.mockClear();
      loading.progress.mockClear();
      report(0, 0.9);
      await vi.advanceTimersByTimeAsync(1000);
      expect(loading.show).not.toHaveBeenCalled();
      expect(loading.progress).not.toHaveBeenCalled();

      await bg.open('a');
      report(1, 0.2);
      bg.suspend();
      loading.show.mockClear();
      await vi.advanceTimersByTimeAsync(1000);
      expect(loading.show).not.toHaveBeenCalled(); // the pending timer was cancelled
    });

    it('works without a loading indicator', async () => {
      await manager.open('a');
      expect(() => a.instances.at(-1)!.ctx.reportBackgroundProgress!(0.5, 'imagery')).not.toThrow();
    });
  });

  describe('info panel (spec 012, AC-1, AC-4, AC-15)', () => {
    let panels: Array<{
      id: string;
      info: { title: string; description: string };
      dispose: ReturnType<typeof vi.fn>;
    }>;
    let withPanel: SpaceManager;

    beforeEach(() => {
      panels = [];
      a.meta.title = 'Space A';
      a.meta.description = 'About A.';
      withPanel = new SpaceManager({
        engine,
        fader,
        registry: [a.meta, b.meta],
        reducedMotion: () => false,
        statusElement: status,
        infoPanel: (overlay, info) => {
          expect(overlay).toBe(engine.overlay);
          const id = engine.instance === null ? '?' : 'mounted';
          log.push(`panel(${info.title})`);
          const slot = {
            content: document.createElement('div'),
            showDescription: vi.fn(),
            open: vi.fn(),
            onOpenChange: vi.fn(),
          };
          const panel = { id, info, slot, dispose: vi.fn(() => log.push(`panel.dispose(${info.title})`)) };
          panels.push(panel);
          return panel;
        },
      });
    });

    it('mounts one with the registry title and description, after the Space built its own UI', async () => {
      await withPanel.open('a');
      expect(panels).toHaveLength(1);
      expect(panels[0]?.info).toEqual({ title: 'Space A', description: 'About A.' });
      // After the factory, so the panel's prepend puts it before the Space's own overlay DOM.
      expect(log.indexOf('create(a)')).toBeLessThan(log.indexOf('panel(Space A)'));
      expect(log.indexOf('panel(Space A)')).toBeLessThan(log.indexOf('fader.in'));
    });

    it('hands the panel’s slot to a Space that takes one, right after mounting it (spec 023, plan §8)', async () => {
      const d = createSpace('d', { attachInfo: true });
      const manager = new SpaceManager({
        engine,
        fader,
        registry: [d.meta],
        reducedMotion: () => false,
        statusElement: status,
        infoPanel: (_overlay, info) => {
          log.push(`panel(${info.title})`);
          const slot = {
            content: document.createElement('div'),
            showDescription: vi.fn(),
            open: vi.fn(),
            onOpenChange: vi.fn(),
          };
          panels.push({ id: 'd', info, slot, dispose: vi.fn() } as never);
          return { slot, dispose: vi.fn() };
        },
      });
      await manager.open('d');
      const instance = d.instances.at(-1)!;
      expect(instance.attachInfo).toHaveBeenCalledTimes(1);
      expect(instance.attachInfo).toHaveBeenCalledWith((panels[0] as unknown as { slot: unknown }).slot);
      expect(log.indexOf('panel(d)')).toBeLessThan(log.indexOf('attachInfo(d)'));
      expect(log.indexOf('attachInfo(d)')).toBeLessThan(log.indexOf('fader.in'));
    });

    it('opens a Space without attachInfo as before', async () => {
      await expect(withPanel.open('a')).resolves.toBe('opened');
      expect(panels).toHaveLength(1);
    });

    it('never hands a slot to a superseded open', async () => {
      const d = createSpace('d', { attachInfo: true });
      const gate = deferred<{ default: SpaceFactory }>();
      const real = await d.meta.load();
      d.load.mockReturnValueOnce(gate.promise);
      const manager = new SpaceManager({
        engine,
        fader,
        registry: [d.meta, b.meta],
        reducedMotion: () => false,
        statusElement: status,
        infoPanel: () => ({
          slot: {
            content: document.createElement('div'),
            showDescription: vi.fn(),
            open: vi.fn(),
            onOpenChange: vi.fn(),
          },
          dispose: vi.fn(),
        }),
      });
      const stale = manager.open('d');
      const fresh = manager.open('b');
      gate.resolve(real);
      await expect(stale).resolves.toBe('superseded');
      await fresh;
      for (const instance of d.instances) expect(instance.attachInfo).not.toHaveBeenCalled();
    });

    it('gives the gallery view none', async () => {
      const gallery = createSpace('gallery');
      await withPanel.openView('gallery', (await gallery.meta.load()).default);
      expect(panels).toHaveLength(0);
    });

    it('disposes it when another view replaces the Space, and on close() and suspend()', async () => {
      await withPanel.open('a');
      await withPanel.open('b');
      expect(panels[0]?.dispose).toHaveBeenCalledTimes(1);
      expect(panels).toHaveLength(2);

      await withPanel.close();
      expect(panels[1]?.dispose).toHaveBeenCalledTimes(1);

      await withPanel.open('a');
      withPanel.suspend();
      expect(panels[2]?.dispose).toHaveBeenCalledTimes(1);
    });

    it('creates none for an open that fails or is superseded', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      a.load.mockRejectedValueOnce(new Error('offline'));
      await expect(withPanel.open('a')).resolves.toBe('load-error');

      const gate = deferred<{ default: SpaceFactory }>();
      const real = await a.meta.load();
      a.load.mockReturnValueOnce(gate.promise);
      const stale = withPanel.open('a');
      const fresh = withPanel.open('b');
      gate.resolve(real);
      await expect(stale).resolves.toBe('superseded');
      await expect(fresh).resolves.toBe('opened');

      expect(panels.map((panel) => panel.info.title)).toEqual(['b']);
    });
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

  describe('views (spec 003)', () => {
    /** The gallery is not in the registry: it is handed to openView() as a factory. */
    const galleryFactory = async () => {
      const gallery = createSpace('gallery');
      const factory = (await gallery.meta.load()).default;
      log = [];
      return { gallery, factory };
    };

    it('openView() mounts a view with the same ordering as a Space (AC-11)', async () => {
      await manager.open('a');
      const { factory } = await galleryFactory();

      await expect(manager.openView('gallery', factory)).resolves.toBe('opened');

      expect(log).toEqual([
        'fader.out',
        'dispose(a)',
        'setInstance(null)',
        'create(gallery)',
        'setInstance(gallery)',
        'nextFrame',
        'fader.in',
      ]);
    });

    it('reports the active view, with no Space id on the gallery', async () => {
      const { factory } = await galleryFactory();
      expect(manager.activeView).toBeNull();

      await manager.openView('gallery', factory);
      expect(manager.activeView).toBe('gallery');
      expect(manager.activeId).toBeNull();

      await manager.open('a');
      expect(manager.activeView).toBe('space');
      expect(manager.activeId).toBe('a');
    });

    it('sets data-view as soon as a view is requested, and data-space-id only for Spaces', async () => {
      const { factory } = await galleryFactory();

      const toGallery = manager.openView('gallery', factory);
      expect(status.dataset.view).toBe('gallery'); // immediately: the back link must not flash
      await toGallery;
      expect(status.dataset.spaceId).toBeUndefined();
      expect(status.dataset.spaceReady).toBe('true');

      const toSpace = manager.open('a');
      expect(status.dataset.view).toBe('space');
      await toSpace;
      expect(status.dataset.spaceId).toBe('a');
    });

    it('treats "Space not found" as a Space screen (data-view="space", AC-7)', async () => {
      const { factory } = await galleryFactory();
      await manager.openView('gallery', factory);

      await manager.open('nope');

      expect(status.dataset.view).toBe('space');
      expect(manager.activeView).toBeNull();
    });

    it('disposes the gallery when a Space opens, and the Space when the gallery returns (AC-6)', async () => {
      const { gallery, factory } = await galleryFactory();
      await manager.openView('gallery', factory);
      await manager.open('a');
      expect(gallery.instances[0]?.dispose).toHaveBeenCalledOnce();

      await manager.openView('gallery', factory);
      expect(a.instances[0]?.dispose).toHaveBeenCalledOnce();
    });

    it('rapid gallery → Space → gallery ends on the gallery; the stale Space is disposed or never created', async () => {
      const { factory } = await galleryFactory();
      const loadA = deferred<{ default: SpaceFactory }>();
      const realA = await a.meta.load();
      a.load.mockReturnValueOnce(loadA.promise);

      const first = manager.openView('gallery', factory);
      const toSpace = manager.open('a');
      await flush();
      const back = manager.openView('gallery', factory);
      loadA.resolve(realA);

      await expect(first).resolves.toBe('superseded');
      await expect(toSpace).resolves.toBe('superseded');
      await expect(back).resolves.toBe('opened');
      expect(manager.activeView).toBe('gallery');
      expect(a.instances.every((i) => vi.mocked(i.dispose).mock.calls.length === 1)).toBe(true);
      expect(status.dataset.view).toBe('gallery');
    });

    it('a view whose factory throws reports load-error without throwing', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      const broken: SpaceFactory = async () => {
        throw new Error('no WebGL points');
      };

      await expect(manager.openView('gallery', broken)).resolves.toBe('load-error');
      expect(consoleError).toHaveBeenCalledOnce();
      consoleError.mockRestore();
    });

    it('close() clears data-view', async () => {
      const { factory } = await galleryFactory();
      await manager.openView('gallery', factory);
      await manager.close();
      expect(status.dataset.view).toBeUndefined();
      expect(manager.activeView).toBeNull();
    });
  });
});

describe('SpaceManager focus management (spec 004, AC-13)', () => {
  const makeEngine = () => ({
    renderer: { domElement: document.createElement('canvas') } as unknown as WebGLRenderer,
    overlay: document.createElement('div'),
    setInstance: () => {},
    nextFrame: () => Promise.resolve(),
  });
  const instantFader = { out: async () => {}, in: async () => {} };

  /** A view whose DOM holds a focusable element, with a spy-able focus target. */
  const view = (name: string) => {
    const target = document.createElement('button');
    target.textContent = `${name} start`;
    const focusTarget = vi.fn(() => target);
    const factory: SpaceFactory = async (ctx) => {
      ctx.overlay.append(target);
      return {
        scene: new Scene(),
        camera: new PerspectiveCamera(),
        update: () => {},
        resize: () => {},
        focusTarget,
        dispose: () => target.remove(),
      };
    };
    return { target, focusTarget, factory };
  };

  const setup = () => {
    const engine = makeEngine();
    document.body.append(engine.overlay);
    const space = view('space');
    const registry: SpaceMeta[] = [
      {
        id: 'a',
        title: 'A',
        description: 'A',
        kind: 'single',
        load: async () => ({ default: space.factory }),
      },
    ];
    const manager = new SpaceManager({
      engine,
      fader: instantFader,
      reducedMotion: () => true,
      registry,
      statusElement: document.createElement('div'),
    });
    return { engine, manager, space };
  };

  it('does not move focus on the first page view', async () => {
    const { manager, space } = setup();
    await manager.open('a');
    expect(space.focusTarget).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(document.body);
  });

  it('moves focus to the new view when the focused element was removed with the old view', async () => {
    const { manager, space } = setup();
    const gallery = view('gallery');
    await manager.openView('gallery', gallery.factory);
    gallery.target.focus(); // e.g. the card the visitor activated
    expect(document.activeElement).toBe(gallery.target);

    await manager.open('a');

    expect(space.focusTarget).toHaveBeenCalledWith({ previousSpaceId: null });
    expect(document.activeElement).toBe(space.target);
  });

  it('tells the gallery which Space was just left, so it can focus that card', async () => {
    const { manager, space } = setup();
    const gallery = view('gallery');
    await manager.openView('gallery', gallery.factory);
    await manager.open('a');
    space.target.focus();

    await manager.openView('gallery', gallery.factory);

    expect(gallery.focusTarget).toHaveBeenLastCalledWith({ previousSpaceId: 'a' });
    expect(document.activeElement).toBe(gallery.target);
  });

  it('never takes focus from something still visible and focused', async () => {
    const { manager } = setup();
    const gallery = view('gallery');
    await manager.openView('gallery', gallery.factory);
    const elsewhere = document.createElement('button');
    document.body.append(elsewhere);
    elsewhere.focus();

    await manager.open('a');

    expect(document.activeElement).toBe(elsewhere);
    elsewhere.remove();
  });
});
