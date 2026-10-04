import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OrthographicCamera, PerspectiveCamera, Scene } from 'three';
import { installDebugHook, type DebugDeps, type DebugTarget } from '../../../src/core/debug';
import type { SpaceInstance } from '../../../src/core/types';

function createDeps() {
  const manager = {
    activeId: 'demo-cube' as string | null,
    open: vi.fn(async () => 'opened' as const),
    close: vi.fn(async () => {}),
  };
  const engine = {
    renderer: { info: { memory: { geometries: 3, textures: 1 } } },
    instance: null as SpaceInstance | null,
  };
  return { manager, engine } satisfies DebugDeps;
}

const instanceWith = (camera: SpaceInstance['camera']): SpaceInstance => ({
  scene: new Scene(),
  camera,
  update: () => {},
  resize: () => {},
  dispose: () => {},
});

describe('installDebugHook', () => {
  let target: DebugTarget;
  let deps: ReturnType<typeof createDeps>;

  beforeEach(() => {
    target = {};
    deps = createDeps();
  });

  it('does not install in production', () => {
    expect(installDebugHook(target, deps, 'production')).toBe(false);
    expect(target.__WORLD__).toBeUndefined();
  });

  it.each(['test', 'development'])('installs in %s mode', (mode) => {
    expect(installDebugHook(target, deps, mode)).toBe(true);
    expect(target.__WORLD__).toBeDefined();
  });

  describe('API', () => {
    beforeEach(() => installDebugHook(target, deps, 'test'));

    it('open() and close() delegate to the SpaceManager', async () => {
      await expect(target.__WORLD__?.open('demo-cube')).resolves.toBe('opened');
      await target.__WORLD__?.close();
      expect(deps.manager.open).toHaveBeenCalledWith('demo-cube');
      expect(deps.manager.close).toHaveBeenCalledOnce();
    });

    it('activeId() reads the current id live', () => {
      expect(target.__WORLD__?.activeId()).toBe('demo-cube');
      deps.manager.activeId = null;
      expect(target.__WORLD__?.activeId()).toBeNull();
    });

    it('memory() returns a snapshot copy of renderer.info.memory (AC-4)', () => {
      const snapshot = target.__WORLD__?.memory();
      expect(snapshot).toEqual({ geometries: 3, textures: 1 });
      deps.engine.renderer.info.memory.geometries = 0;
      expect(snapshot?.geometries).toBe(3);
    });

    it('cameraAspect() reports the active perspective camera aspect, else null (AC-5)', () => {
      expect(target.__WORLD__?.cameraAspect()).toBeNull();

      const camera = new PerspectiveCamera();
      camera.aspect = 1.5;
      deps.engine.instance = instanceWith(camera);
      expect(target.__WORLD__?.cameraAspect()).toBe(1.5);

      deps.engine.instance = instanceWith(new OrthographicCamera());
      expect(target.__WORLD__?.cameraAspect()).toBeNull();
    });
  });
});
