import { PerspectiveCamera } from 'three';
import type { OpenResult, RendererLike, SpaceInstance } from './types';

/** Test/dev-only handle on the running app, used by Playwright (`window.__WORLD__`). */
export interface WorldDebugApi {
  open(id: string): Promise<OpenResult>;
  close(): Promise<void>;
  activeId(): string | null;
  /** Snapshot of GPU resource counts (AC-4). */
  memory(): { geometries: number; textures: number };
  /** Aspect of the active Space's perspective camera, or null (AC-5). */
  cameraAspect(): number | null;
}

export interface DebugDeps {
  manager: {
    readonly activeId: string | null;
    open(id: string): Promise<OpenResult>;
    close(): Promise<void>;
  };
  engine: {
    readonly renderer: { readonly info: RendererLike['info'] };
    readonly instance: SpaceInstance | null;
  };
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
export function installDebugHook(target: DebugTarget, { manager, engine }: DebugDeps, mode: string): boolean {
  if (mode === 'production') return false;

  target.__WORLD__ = {
    open: (id) => manager.open(id),
    close: () => manager.close(),
    activeId: () => manager.activeId,
    memory: () => ({ ...engine.renderer.info.memory }),
    cameraAspect: () => {
      const camera = engine.instance?.camera;
      return camera instanceof PerspectiveCamera ? camera.aspect : null;
    },
  };
  return true;
}
