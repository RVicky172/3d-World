import { PerspectiveCamera } from 'three';
import type { OpenResult, RendererLike, SpaceInstance } from './types';

/** A camera's view offset, as `PerspectiveCamera.setViewOffset` takes it (spec 023). */
export interface ViewOffset {
  fullWidth: number;
  fullHeight: number;
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
}

/** Test/dev-only handle on the running app, used by Playwright (`window.__WORLD__`). */
export interface WorldDebugApi {
  open(id: string): Promise<OpenResult>;
  close(): Promise<void>;
  /** Navigate like a gallery card would: updates the URL, adds a history entry (spec 002). */
  navigate(id: string): void;
  activeId(): string | null;
  /** Snapshot of GPU resource counts (AC-4). */
  memory(): { geometries: number; textures: number };
  /** Aspect of the active Space's perspective camera, or null (AC-5). */
  cameraAspect(): number | null;
  /** Snapshot of the active camera (spec 004): position xyz and quaternion xyzw. */
  cameraPose(): { position: number[]; quaternion: number[] } | null;
  /**
   * The active perspective camera's projection (spec 012): with the pose, enough to project points in tests.
   * `view` is its view offset while one is set (spec 023: the Solar System centres a selected body in the area
   * the info panel leaves clear), else null.
   */
  cameraProjection(): {
    fov: number;
    aspect: number;
    near: number;
    far: number;
    view: ViewOffset | null;
  } | null;
  /** The active Space's hotspot world positions in data order, or [] (spec 012, AC-6). */
  hotspots(): Array<{ id: string; world: [number, number, number] }>;
  /** The active Space's bodies (world position, drawn radius), or [] (spec 020). */
  bodies(): Array<{
    id: string;
    world: [number, number, number];
    radius: number;
    quaternion?: [number, number, number, number];
  }>;
  /** The active Space's selection, or null if it has none (spec 023). */
  selection(): { id: string | null; flying: boolean; following: boolean } | null;
  /** The active Space's simulated time, or null (spec 021): days since J2000, speed in days/s. */
  simTime(): { days: number; speed: number; playing: boolean } | null;
  /** Jumps the active Space to a simulated date, if it has one (spec 021). */
  setSimTime(days: number): void;
  /** Simulates a GPU context loss (spec 005). Call `restoreContext()` only after `data-webgl="lost"`. */
  loseContext(): void;
  restoreContext(): void;
}

export interface DebugDeps {
  manager: {
    readonly activeId: string | null;
    open(id: string): Promise<OpenResult>;
    close(): Promise<void>;
  };
  engine: {
    readonly renderer: {
      readonly info: RendererLike['info'];
      /** three's WEBGL_lose_context wrappers; they cache the extension, which `getExtension()` won't return while lost. */
      forceContextLoss(): void;
      forceContextRestore(): void;
    };
    readonly instance: SpaceInstance | null;
  };
  router: { navigate(id: string): void };
}

export interface DebugTarget {
  __WORLD__?: WorldDebugApi;
}

declare global {
  interface Window {
    __WORLD__?: WorldDebugApi;
  }
}

/**
 * Installs `__WORLD__` unless `mode` is production. Call it behind a literal
 * `import.meta.env.MODE !== 'production'` check so production bundles drop this module entirely.
 */
export function installDebugHook(
  target: DebugTarget,
  { manager, engine, router }: DebugDeps,
  mode: string,
): boolean {
  if (mode === 'production') return false;

  target.__WORLD__ = {
    open: (id) => manager.open(id),
    close: () => manager.close(),
    navigate: (id) => router.navigate(id),
    activeId: () => manager.activeId,
    memory: () => ({ ...engine.renderer.info.memory }),
    cameraPose: () => {
      const camera = engine.instance?.camera;
      return camera ? { position: camera.position.toArray(), quaternion: camera.quaternion.toArray() } : null;
    },
    loseContext: () => engine.renderer.forceContextLoss(),
    restoreContext: () => engine.renderer.forceContextRestore(),
    cameraProjection: () => {
      const camera = engine.instance?.camera;
      if (!(camera instanceof PerspectiveCamera)) return null;
      const view = camera.view?.enabled
        ? {
            fullWidth: camera.view.fullWidth,
            fullHeight: camera.view.fullHeight,
            offsetX: camera.view.offsetX,
            offsetY: camera.view.offsetY,
            width: camera.view.width,
            height: camera.view.height,
          }
        : null;
      return { fov: camera.fov, aspect: camera.aspect, near: camera.near, far: camera.far, view };
    },
    hotspots: () => engine.instance?.hotspotPositions?.() ?? [],
    bodies: () => engine.instance?.bodies?.() ?? [],
    selection: () => engine.instance?.selection?.() ?? null,
    simTime: () => engine.instance?.simTime?.() ?? null,
    setSimTime: (days) => engine.instance?.setSimTime?.(days),
    cameraAspect: () => {
      const camera = engine.instance?.camera;
      return camera instanceof PerspectiveCamera ? camera.aspect : null;
    },
  };
  return true;
}
