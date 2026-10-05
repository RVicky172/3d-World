import { describe, expect, it } from 'vitest';
import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Vector3,
} from 'three';
import { createOcclusion } from '../../../../src/shared/hotspots/occlusion';

// Spec 012, AC-7: a marker whose point is hidden behind the model is dimmed. Raycasts are throttled to
// changes of the camera, at most every 0.1 s of Space time (NFR: ≤ 1 ms per frame). Its own any-hit test
// (D-021) must agree with three's raycaster on transformed, quantized and non-indexed geometry.

/** A 2 × 2 × 2 box centred on the origin, so its front face is at z = 1. */
function scene() {
  const root = new Group();
  root.add(new Mesh(new BoxGeometry(2, 2, 2), new MeshBasicMaterial()));
  root.updateMatrixWorld(true);
  return root;
}

function cameraAt(x: number, y: number, z: number) {
  const camera = new PerspectiveCamera(50, 1, 0.1, 100);
  camera.position.set(x, y, z);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  return camera;
}

const FRONT = new Vector3(0, 0, 1); // on the front face
const BACK = new Vector3(0, 0, -1); // on the back face
const ABOVE = new Vector3(0, 3, 0); // in the open

describe('createOcclusion', () => {
  it('a point behind the model is occluded; points in the open or on the near face are not', () => {
    const occlusion = createOcclusion(scene(), { epsilon: 0.01 });
    occlusion.update(0, cameraAt(0, 0, 5), [FRONT, BACK, ABOVE]);
    expect(occlusion.occluded(0)).toBe(false); // on the surface facing the camera: no self-occlusion
    expect(occlusion.occluded(1)).toBe(true);
    expect(occlusion.occluded(2)).toBe(false);
  });

  it('reports whether anything changed', () => {
    const occlusion = createOcclusion(scene(), { epsilon: 0.01 });
    expect(occlusion.update(0, cameraAt(0, 0, 5), [FRONT, BACK])).toBe(true); // first result
    expect(occlusion.update(0.2, cameraAt(0, 0, 5), [FRONT, BACK])).toBe(false); // same camera
    expect(occlusion.update(0.2, cameraAt(0, 0, -5), [FRONT, BACK])).toBe(true); // other side: swapped
    expect(occlusion.occluded(0)).toBe(true);
    expect(occlusion.occluded(1)).toBe(false);
  });

  it('raycasts only after the camera moves, at most every 0.1 s, and never misses the final pose', () => {
    const occlusion = createOcclusion(scene(), { epsilon: 0.01, interval: 0.1 });
    const points = [FRONT, BACK];
    occlusion.update(0, cameraAt(0, 0, 5), points);
    expect(occlusion.passes).toBe(1);

    // Still camera: no raycasts however long.
    for (let i = 0; i < 30; i++) occlusion.update(1 / 60, cameraAt(0, 0, 5), points);
    expect(occlusion.passes).toBe(1);

    // Moving every frame for 0.5 s at 60 fps: about 5 recomputes, not 30.
    for (let i = 1; i <= 30; i++) {
      const angle = (i / 30) * Math.PI;
      occlusion.update(1 / 60, cameraAt(5 * Math.sin(angle), 0, 5 * Math.cos(angle)), points);
    }
    const recomputes = occlusion.passes - 1;
    expect(recomputes).toBeGreaterThanOrEqual(4);
    expect(recomputes).toBeLessThanOrEqual(6);

    // The camera stopped behind the box during the cool-down: the pending change still lands.
    const final = cameraAt(0, 0, -5);
    for (let i = 0; i < 12; i++) occlusion.update(1 / 60, final, points);
    expect(occlusion.occluded(0)).toBe(true);
    expect(occlusion.occluded(1)).toBe(false);
  });

  it('a changed list of points is checked at once', () => {
    const occlusion = createOcclusion(scene(), { epsilon: 0.01 });
    const camera = cameraAt(0, 0, 5);
    occlusion.update(0, camera, [FRONT]);
    occlusion.update(0, camera, [FRONT, BACK]);
    expect(occlusion.occluded(1)).toBe(true);
  });

  it('works in world space: a moved, rotated and scaled model hides what it covers there', () => {
    const root = new Group();
    const holder = new Group();
    holder.position.set(10, 0, 0);
    holder.rotation.y = Math.PI / 2; // the box's local front (+z) now faces +x
    holder.scale.setScalar(2); // 4 × 4 × 4
    holder.add(new Mesh(new BoxGeometry(2, 2, 2), new MeshBasicMaterial()));
    root.add(holder);
    root.updateMatrixWorld(true);
    const occlusion = createOcclusion(root, { epsilon: 0.01 });
    const camera = cameraAt(20, 0, 0); // looking along −x at the box's +x face (x = 12)
    camera.lookAt(10, 0, 0);
    camera.updateMatrixWorld();
    occlusion.update(0, camera, [new Vector3(12, 0, 0), new Vector3(8, 0, 0), new Vector3(10, 3, 0)]);
    expect([0, 1, 2].map((i) => occlusion.occluded(i))).toEqual([false, true, false]);
  });

  it('reads quantized (normalized integer) positions, as Meshopt files store them', () => {
    // A 2 × 2 quad at z = 0 stored as int16 normalized, scaled back up by the node (KHR_mesh_quantization).
    const q = 32767;
    const geometry = new BufferGeometry();
    geometry.setAttribute(
      'position',
      new BufferAttribute(new Int16Array([-q, -q, 0, q, -q, 0, q, q, 0, -q, q, 0]), 3, true),
    );
    geometry.setIndex([0, 1, 2, 0, 2, 3]);
    const mesh = new Mesh(geometry, new MeshBasicMaterial());
    const root = new Group().add(mesh);
    root.updateMatrixWorld(true);
    const occlusion = createOcclusion(root, { epsilon: 0.01 });
    occlusion.update(0, cameraAt(0, 0, 5), [new Vector3(0.9, 0.9, -1), new Vector3(1.5, 0, -1)]);
    expect(occlusion.occluded(0)).toBe(true); // behind the quad, inside its corner
    expect(occlusion.occluded(1)).toBe(false); // its ray crosses z = 0 at x = 1.25, outside the ±1 quad
  });

  it('handles non-indexed geometry and is double-sided', () => {
    const plane = new PlaneGeometry(2, 2).toNonIndexed(); // faces +z
    const root = new Group().add(new Mesh(plane, new MeshBasicMaterial()));
    root.updateMatrixWorld(true);
    const occlusion = createOcclusion(root, { epsilon: 0.01 });
    occlusion.update(0, cameraAt(0, 0, 5), [new Vector3(0, 0, -1)]);
    expect(occlusion.occluded(0)).toBe(true);
    occlusion.update(0.2, cameraAt(0, 0, -5), [new Vector3(0, 0, 1)]); // from behind: its back face
    expect(occlusion.occluded(0)).toBe(true);
  });

  it('dispose() drops the triangles; later updates change nothing', () => {
    const occlusion = createOcclusion(scene(), { epsilon: 0.01 });
    occlusion.dispose();
    expect(occlusion.update(0, cameraAt(0, 0, 5), [BACK])).toBe(false);
    expect(occlusion.occluded(0)).toBe(false);
  });
});
