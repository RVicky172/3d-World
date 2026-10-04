import { Spherical, Vector3, type Object3D } from 'three';
import type { KeySteps } from './types';

/**
 * Keyboard camera input (spec 004, AC-3). Our own mapping, because OrbitControls' built-in keys do
 * the opposite (arrows pan, Shift+arrows rotate) and have no zoom or reset.
 */
export const DEFAULT_KEY_STEPS: KeySteps = {
  orbitStep: Math.PI / 24, // 7.5°
  zoomFactor: 0.85,
  panStep: 0.25,
};

export type KeyAction =
  | { type: 'orbit'; dTheta: number; dPhi: number }
  | { type: 'pan'; dx: number; dy: number }
  | { type: 'zoom'; factor: number }
  | { type: 'reset' };

type KeyInput = Pick<KeyboardEvent, 'key' | 'shiftKey' | 'ctrlKey' | 'metaKey' | 'altKey'>;

/** Maps a key press to a camera action, or null to let the browser handle it. */
export function keyAction(event: KeyInput, steps: KeySteps = DEFAULT_KEY_STEPS): KeyAction | null {
  // Ctrl/Meta/Alt combos belong to the browser and assistive tech (zoom, reload, history).
  if (event.ctrlKey || event.metaKey || event.altKey) return null;
  const { orbitStep: o, panStep: p, zoomFactor: z } = steps;
  const pan = event.shiftKey;

  switch (event.key) {
    case 'ArrowLeft':
      return pan ? { type: 'pan', dx: -p, dy: 0 } : { type: 'orbit', dTheta: -o, dPhi: 0 };
    case 'ArrowRight':
      return pan ? { type: 'pan', dx: p, dy: 0 } : { type: 'orbit', dTheta: o, dPhi: 0 };
    case 'ArrowUp':
      return pan ? { type: 'pan', dx: 0, dy: p } : { type: 'orbit', dTheta: 0, dPhi: -o };
    case 'ArrowDown':
      return pan ? { type: 'pan', dx: 0, dy: -p } : { type: 'orbit', dTheta: 0, dPhi: o };
    case '+':
    case '=':
      return { type: 'zoom', factor: z };
    case '-':
    case '_':
      return { type: 'zoom', factor: 1 / z };
    case 'r':
    case 'R':
      return { type: 'reset' };
    default:
      return null;
  }
}

const offset = new Vector3();
const spherical = new Spherical();
const axis = new Vector3();
const shift = new Vector3();

/** Rotates the camera around `target` (Y-up). Limits are applied afterwards by the controls. */
export function orbitStep(camera: Object3D, target: Vector3, dTheta: number, dPhi: number): void {
  spherical.setFromVector3(offset.copy(camera.position).sub(target));
  spherical.theta += dTheta;
  spherical.phi += dPhi;
  spherical.makeSafe();
  camera.position.copy(target).add(offset.setFromSpherical(spherical));
  camera.lookAt(target);
}

/** Moves the camera toward (factor < 1) or away from (factor > 1) `target`. */
export function zoomStep(camera: Object3D, target: Vector3, factor: number): void {
  offset.copy(camera.position).sub(target).multiplyScalar(factor);
  camera.position.copy(target).add(offset);
}

/** Slides camera and target together along the camera's right/up axes. Orientation is unchanged. */
export function panStep(camera: Object3D, target: Vector3, dx: number, dy: number): void {
  shift.copy(axis.set(1, 0, 0).applyQuaternion(camera.quaternion)).multiplyScalar(dx);
  shift.add(axis.set(0, 1, 0).applyQuaternion(camera.quaternion).multiplyScalar(dy));
  camera.position.add(shift);
  target.add(shift);
}
