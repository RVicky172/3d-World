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
  /**
   * Wall-clock time of this open, ms since the Unix epoch (spec 021, Q1: the Solar System opens "today"). The
   * core reads the clock so Space logic never does (Constitution VI).
   */
  startTime: number;
  /**
   * What the Space's `saveState()` returned before a WebGL context loss, on the rebuild that follows it
   * (spec 021, AC-12). Absent on every other open (Q8: a new visit starts fresh).
   */
  savedState?: unknown;
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
  bodies?(): Array<{
    id: string;
    world: [number, number, number];
    radius: number;
    /** World orientation x, y, z, w (spec 021, AC-4). */
    quaternion?: [number, number, number, number];
  }>;
  /** State to carry across a context loss (spec 021, AC-12); comes back as `SpaceContext.savedState`. */
  saveState?(): unknown;
  /** Simulated time, `days` since J2000 and `speed` in days per second (test seam, spec 021). */
  simTime?(): { days: number; speed: number; playing: boolean };
  /** Jumps to a simulated date (test seam, spec 021). */
  setSimTime?(days: number): void;
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
