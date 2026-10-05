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
    renderer: {
      info: { memory: { geometries: 3, textures: 1 } },
      forceContextLoss: vi.fn<() => void>(),
      forceContextRestore: vi.fn<() => void>(),
    },
    instance: null as SpaceInstance | null,
  };
  const router = { navigate: vi.fn<(id: string) => void>() };
  return { manager, engine, router } satisfies DebugDeps;
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

    it('loseContext() / restoreContext() simulate a GPU context loss through the renderer (spec 005)', () => {
      target.__WORLD__?.loseContext();
      expect(deps.engine.renderer.forceContextLoss).toHaveBeenCalledTimes(1);
      target.__WORLD__?.restoreContext();
      expect(deps.engine.renderer.forceContextRestore).toHaveBeenCalledTimes(1);
    });

    it('open() and close() delegate to the SpaceManager', async () => {
      await expect(target.__WORLD__?.open('demo-cube')).resolves.toBe('opened');
      await target.__WORLD__?.close();
      expect(deps.manager.open).toHaveBeenCalledWith('demo-cube');
      expect(deps.manager.close).toHaveBeenCalledOnce();
    });

    it('navigate() delegates to the router, like a gallery card would (spec 002 AC-8)', () => {
      target.__WORLD__?.navigate('demo-cube');
      expect(deps.router.navigate).toHaveBeenCalledExactlyOnceWith('demo-cube');
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

    it('cameraPose() reports the active camera position and orientation as plain arrays (spec 004)', () => {
      expect(target.__WORLD__?.cameraPose()).toBeNull();

      const camera = new PerspectiveCamera();
      camera.position.set(1, 2, 3);
      camera.lookAt(0, 0, 0);
      deps.engine.instance = instanceWith(camera);

      const pose = target.__WORLD__?.cameraPose();
      expect(pose?.position).toEqual([1, 2, 3]);
      expect(pose?.quaternion).toEqual(camera.quaternion.toArray());
      camera.position.set(9, 9, 9);
      expect(pose?.position).toEqual([1, 2, 3]); // a snapshot, not a live reference
    });
  });
});
