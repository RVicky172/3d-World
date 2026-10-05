import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PerspectiveCamera, Scene } from 'three';
import { Engine, MAX_PIXEL_RATIO } from '../../../src/core/engine';
import type { SpaceInstance } from '../../../src/core/types';
import { createFakeRenderer, FakeScheduler, FakeVisibility } from '../../helpers/fakes';

function createInstance(overrides: Partial<SpaceInstance> = {}) {
  return {
    scene: new Scene(),
    camera: new PerspectiveCamera(),
    update: vi.fn<SpaceInstance['update']>(),
    resize: vi.fn<SpaceInstance['resize']>(),
    dispose: vi.fn<SpaceInstance['dispose']>(),
    ...overrides,
  };
}

function setContainerSize(el: HTMLElement, width: number, height: number) {
  Object.defineProperty(el, 'clientWidth', { configurable: true, value: width });
  Object.defineProperty(el, 'clientHeight', { configurable: true, value: height });
}

describe('Engine', () => {
  let container: HTMLElement;
  let renderer: ReturnType<typeof createFakeRenderer>;
  let scheduler: FakeScheduler;
  let onResize: ((width: number, height: number) => void) | undefined;
  let stopWatching: ReturnType<typeof vi.fn<() => void>>;
  let engine: Engine<ReturnType<typeof createFakeRenderer>>;

  beforeEach(() => {
    container = document.createElement('div');
    setContainerSize(container, 800, 600);
    renderer = createFakeRenderer();
    scheduler = new FakeScheduler();
    stopWatching = vi.fn<() => void>();
    engine = new Engine({
      container,
      renderer,
      devicePixelRatio: 3,
      loop: { scheduler, visibility: new FakeVisibility() },
      watchResize: (_target, cb) => {
        onResize = cb;
        return stopWatching;
      },
    });
  });

  describe('stop() (spec 005, AC-8)', () => {
    it('stops scheduling frames, so no work is done while stopped', () => {
      engine.setInstance(createInstance());
      engine.start();
      expect(scheduler.pending.size).toBe(1);

      engine.stop();
      expect(scheduler.pending.size).toBe(0);
    });

    it('can start again afterwards', () => {
      const instance = createInstance();
      engine.setInstance(instance);
      engine.start();
      engine.stop();
      engine.start();
      scheduler.flush(16);
      expect(instance.update).toHaveBeenCalledTimes(1);
      expect(scheduler.pending.size).toBe(1);
    });

    it('is safe to call twice, or before start()', () => {
      expect(() => {
        engine.stop();
        engine.stop();
      }).not.toThrow();
    });
  });

  describe('setup', () => {
    it('mounts the canvas, then an overlay layer above it', () => {
      expect([...container.children]).toEqual([renderer.domElement, engine.overlay]);
      expect(engine.overlay.className).toBe('overlay');
    });

    it(`caps the pixel ratio at ${MAX_PIXEL_RATIO}`, () => {
      expect(renderer.setPixelRatio).toHaveBeenCalledWith(MAX_PIXEL_RATIO);
    });

    it('sizes the renderer to the container', () => {
      expect(renderer.setSize).toHaveBeenCalledWith(800, 600, false);
      expect(engine.size).toEqual({ width: 800, height: 600 });
    });

    it('does not render until started', () => {
      expect(scheduler.pending.size).toBe(0);
    });
  });

  describe('frames', () => {
    beforeEach(() => engine.start());

    it('clears the canvas when there is no instance', () => {
      scheduler.flush(0);
      expect(renderer.clear).toHaveBeenCalledOnce();
      expect(renderer.render).not.toHaveBeenCalled();
    });

    it('updates the instance with clock time, then renders its scene with its camera', () => {
      const calls: string[] = [];
      const instance = createInstance({ update: vi.fn(() => void calls.push('update')) });
      renderer.render.mockImplementation(() => void calls.push('render'));
      engine.setInstance(instance);

      scheduler.flush(1000);
      scheduler.flush(1016);

      expect(instance.update).toHaveBeenNthCalledWith(1, 0, 0);
      expect(instance.update).toHaveBeenNthCalledWith(2, 0.016, 0.016);
      expect(renderer.render).toHaveBeenCalledWith(instance.scene, instance.camera);
      expect(calls).toEqual(['update', 'render', 'update', 'render']);
    });

    it('calls the Space’s own render() instead of renderer.render when provided (AC-11)', () => {
      const render = vi.fn<() => void>();
      engine.setInstance(createInstance({ render }));

      scheduler.flush(0);

      expect(render).toHaveBeenCalledOnce();
      expect(renderer.render).not.toHaveBeenCalled();
    });

    it('clears again after the instance is removed', () => {
      engine.setInstance(createInstance());
      engine.setInstance(null);
      scheduler.flush(0);
      expect(renderer.clear).toHaveBeenCalledOnce();
      expect(renderer.render).not.toHaveBeenCalled();
    });

    it('nextFrame() resolves after the next frame has rendered', async () => {
      const instance = createInstance();
      engine.setInstance(instance);
      let resolved = false;
      const next = engine.nextFrame().then(() => (resolved = true));

      await Promise.resolve();
      expect(resolved).toBe(false);
      scheduler.flush(0);
      await next;
      expect(renderer.render).toHaveBeenCalledOnce();
    });
  });

  describe('resize (AC-5)', () => {
    it('resizes the renderer and the active instance', () => {
      const instance = createInstance();
      engine.setInstance(instance);
      vi.mocked(instance.resize).mockClear();

      onResize?.(1024, 512);

      expect(renderer.setSize).toHaveBeenLastCalledWith(1024, 512, false);
      expect(instance.resize).toHaveBeenCalledWith(1024, 512);
      expect(engine.size).toEqual({ width: 1024, height: 512 });
    });

    it('immediately sizes a newly set instance to the current size', () => {
      const instance = createInstance();
      engine.setInstance(instance);
      expect(instance.resize).toHaveBeenCalledWith(800, 600);
    });

    it('does not pass a zero size to the instance (would give a NaN camera aspect)', () => {
      const instance = createInstance();
      engine.setInstance(instance);
      vi.mocked(instance.resize).mockClear();

      onResize?.(0, 600);

      expect(instance.resize).not.toHaveBeenCalled();
    });
  });

  describe('dispose', () => {
    it('stops the loop, stops watching resize, removes DOM and disposes the renderer', () => {
      engine.start();
      engine.dispose();

      expect(scheduler.pending.size).toBe(0);
      expect(stopWatching).toHaveBeenCalledOnce();
      expect(container.children).toHaveLength(0);
      expect(renderer.dispose).toHaveBeenCalledOnce();
    });

    it('does not dispose the instance — the SpaceManager owns Space lifecycles', () => {
      const instance = createInstance();
      engine.setInstance(instance);
      engine.dispose();
      expect(instance.dispose).not.toHaveBeenCalled();
    });
  });
});
