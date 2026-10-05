import type { PerspectiveCamera, Vector3 } from 'three';

type Vec3 = readonly [number, number, number];

/** How a Space's camera may be moved (spec 004, AC-6). Pure data (Constitution VII). */
export interface CameraControlsConfig {
  /** Home focus point: what the camera looks at, and the centre of the pan limit. */
  focus: Vec3;
  initialPosition: Vec3;
  distance: { min: number; max: number };
  /** Radians from straight up. Keep inside (0, π) so the view never flips. */
  polar: { min: number; max: number };
  /** Max distance the focus point may be panned away from `focus`. */
  panLimit: number;
  /** `speed` is OrbitControls' autoRotateSpeed (2 ≈ 30 s per turn); `idleDelay` in seconds. */
  turntable: { speed: number; idleDelay: number };
  keyboard?: KeySteps;
}

/** Keyboard step sizes: radians per orbit step, distance factor per zoom-in, world units per pan step. */
export interface KeySteps {
  orbitStep: number;
  zoomFactor: number;
  panStep: number;
}

/** A home view: camera position (looking at the config's `focus`), zoom limits and pan limit. */
export interface ControlsHome {
  position: Vec3;
  distance: { min: number; max: number };
  panLimit: number;
}

export interface CameraControlsOptions {
  camera: PerspectiveCamera;
  canvas: HTMLCanvasElement;
  overlay: HTMLElement;
  signal: AbortSignal;
  reducedMotion: boolean;
  /** Touch-first device: changes the hint wording. */
  coarsePointer: boolean;
  /** Space title, used in the 3D view's accessible name. */
  label: string;
  config: CameraControlsConfig;
}

export interface CameraControls {
  /** Call once per frame from `SpaceInstance.update` with the frame's delta. */
  update(deltaSeconds: number): void;
  reset(): void;
  readonly turntableActive: boolean;
  /** Current focus point (moves when panning). Read-only for callers. */
  readonly target: Readonly<Vector3>;
  /** True once the visitor moved the camera (any input); cleared by `reset()`. The turntable doesn't count. */
  readonly userMoved: boolean;
  /**
   * Replaces the home view and limits (e.g. re-framing after a resize, spec 010 AC-3). Moves the camera
   * there only if the visitor hasn't moved it; `reset()` always returns to the latest home.
   */
  setHome(home: ControlsHome): void;
  /**
   * Turns the camera round the focus point to look from `direction` (spec 012, AC-9): eased over `duration`
   * seconds of Space time (default 0.6), instant under reduced motion. Keeps the distance, stays within the
   * polar limits, brings a panned view back to the focus, and is cancelled by any visitor input.
   */
  turnTo(direction: Vec3, options?: { duration?: number }): void;
  /** Keeps the idle turntable still (e.g. while an annotation is open); release restarts its idle delay. */
  holdTurntable(hold: boolean): void;
  dispose(): void;
}
