import { Vector3, type Camera } from 'three';

const ndc = new Vector3();

export interface ScreenPoint {
  /** CSS px from the canvas's left edge. */
  x: number;
  /** CSS px from the canvas's top edge (grows downwards). */
  y: number;
  /** False for points behind the camera (or nearer than its near plane): their x/y are meaningless. */
  visible: boolean;
}

/**
 * Where a world point is drawn on a `width` × `height` CSS-px canvas (spec 012, AC-6). Points beside the view
 * still count as visible (they're just off-canvas); only depth decides. The camera's matrices must be current.
 */
export function toScreen(world: Vector3, camera: Camera, width: number, height: number): ScreenPoint {
  ndc.copy(world).project(camera);
  return {
    x: ((ndc.x + 1) / 2) * width,
    y: ((1 - ndc.y) / 2) * height,
    visible: ndc.z >= -1 && ndc.z <= 1,
  };
}
