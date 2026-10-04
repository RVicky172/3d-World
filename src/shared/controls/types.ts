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
  dispose(): void;
}
