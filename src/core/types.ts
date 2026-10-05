import type { Camera, Object3D, Scene, WebGLRenderer } from 'three';

/**
 * The slice of `WebGLRenderer` the engine depends on. Narrow on purpose so the engine
 * can be unit-tested with a fake renderer (no WebGL in jsdom).
 */
export interface RendererLike {
  readonly domElement: HTMLCanvasElement;
  readonly info: { memory: { geometries: number; textures: number } };
  setPixelRatio(ratio: number): void;
  setSize(width: number, height: number, updateStyle?: boolean): void;
  render(scene: Object3D, camera: Camera): void;
  clear(): void;
  dispose(): void;
}

/** What the engine hands to a Space when it is created. */
export interface SpaceContext {
  /** The session's single renderer. Spaces must not create their own. */
  renderer: WebGLRenderer;
  canvas: HTMLCanvasElement;
  /** DOM layer above the canvas the Space may use for its own UI. */
  overlay: HTMLElement;
  reducedMotion: boolean;
  /** Aborted right before `dispose()` — use it for listeners and fetches. */
  signal: AbortSignal;
  /**
   * Download progress while the view opens: 0–1, or null when the total is unknown (spec 011, AC-8).
   * Shown by the loading indicator; calls after the open has finished, failed or been superseded do nothing.
   */
  reportProgress?(fraction: number | null): void;
}

/** A live, mounted Space. */
export interface SpaceInstance {
  scene: Scene;
  camera: Camera;
  /** Advance the Space. Must depend only on its inputs for time (Constitution VI). */
  update(deltaSeconds: number, elapsedSeconds: number): void;
  resize(width: number, height: number): void;
  /**
   * Opt-in custom rendering (e.g. an `EffectComposer`). When present, the engine calls this
   * instead of `renderer.render(scene, camera)`. The Space owns resizing and disposing it.
   */
  render?(): void;
  /**
   * Where keyboard focus should land when this view replaces another and focus would otherwise be
   * lost (spec 004, AC-13). `previousSpaceId` is the registry Space just left, if any.
   */
  focusTarget?(context: { previousSpaceId: string | null }): HTMLElement | null;
  /** World positions of the Space's hotspots, in data order (test seam, spec 012 AC-6). */
  hotspotPositions?(): Array<{ id: string; world: [number, number, number] }>;
  /** Bodies' world positions and drawn radii, in scene units (test seam, spec 020). */
  bodies?(): Array<{ id: string; world: [number, number, number]; radius: number }>;
  /** Free everything: geometries, materials, textures, listeners, DOM. */
  dispose(): void;
}

export type SpaceFactory = (ctx: SpaceContext) => Promise<SpaceInstance>;

/** Registry entry. `load` is a lazy `import()` so a Space costs nothing until opened. */
export interface SpaceMeta {
  /** URL-safe and unique, e.g. "solar-system". */
  id: string;
  title: string;
  description: string;
  kind: 'single' | 'multi';
  /** Path under `public/`. */
  thumbnail?: string;
  load: () => Promise<{ default: SpaceFactory }>;
}

/** Outcome of `SpaceManager.open()`; it never throws. */
export type OpenResult = 'opened' | 'not-found' | 'load-error' | 'superseded';
