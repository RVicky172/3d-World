import { Matrix4, Vector3, type Camera, type Mesh, type Object3D } from 'three';

export interface Occlusion {
  /**
   * Advances by `delta` seconds of Space time and, if the camera moved since the last check and at least
   * `interval` has passed, checks again. Returns true when any point's state changed.
   */
  update(delta: number, camera: Camera, points: readonly Vector3[]): boolean;
  /** Whether point `index` is hidden behind the model, as of the last check. */
  occluded(index: number): boolean;
  /** How many checks have run (tests and diagnostics). */
  readonly passes: number;
  /** Drops the triangle copy; later updates do nothing. */
  dispose(): void;
}

/**
 * Which hotspot points the model hides from the camera (spec 012, AC-7). A ray from the camera towards each
 * point stops `epsilon` short of it, so a point on the surface facing the camera doesn't hide itself; any hit
 * means it's behind the model. Checks run only after the camera moves, at most every `interval` seconds; a
 * move during the cool-down is still checked afterwards. A changed list of points is checked at once.
 *
 * three's `Raycaster` took 8 ms for four rays on the 40k-triangle chair (D-021), so this copies the model's
 * triangles once into a world-space array (the model holds still, D-009) and runs its own any-hit test, which
 * stops at the first triangle in the way: 0.7 ms for the same four rays.
 */
export function createOcclusion(
  root: Object3D,
  { epsilon, interval = 0.1 }: { epsilon: number; interval?: number },
): Occlusion {
  let triangles = worldTriangles(root);
  const origin = new Vector3();
  const direction = new Vector3();
  const lastCamera = new Matrix4();
  let checkedOnce = false;
  let states: boolean[] = [];
  let sinceCheck = Infinity;
  let pending = true;
  let passes = 0;
  let disposed = false;

  return {
    update(delta, camera, points) {
      if (disposed) return false;
      sinceCheck += delta;
      if (!checkedOnce || !camera.matrixWorld.equals(lastCamera)) {
        lastCamera.copy(camera.matrixWorld);
        pending = true;
      }
      if (points.length !== states.length) {
        pending = true;
        sinceCheck = Infinity;
      }
      if (!pending || sinceCheck < interval) return false;
      pending = false;
      sinceCheck = 0;
      checkedOnce = true;
      passes++;

      origin.setFromMatrixPosition(camera.matrixWorld);
      let changed = points.length !== states.length;
      states = points.map((point, i) => {
        direction.subVectors(point, origin);
        const distance = direction.length();
        direction.divideScalar(distance || 1);
        const hidden = anyHit(triangles, origin, direction, distance - epsilon);
        if (hidden !== states[i]) changed = true;
        return hidden;
      });
      return changed;
    },
    occluded: (index) => states[index] ?? false,
    get passes() {
      return passes;
    },
    dispose() {
      disposed = true;
      triangles = new Float32Array(0);
      states = [];
    },
  };
}

/** Every mesh triangle under `root` in world space, 9 floats each (normalized attributes de-quantized). */
function worldTriangles(root: Object3D): Float32Array {
  root.updateMatrixWorld(true);
  const meshes: Mesh[] = [];
  root.traverse((object) => {
    if ((object as Mesh).isMesh) meshes.push(object as Mesh);
  });
  const vertexCount = (mesh: Mesh) => {
    const n = mesh.geometry.index?.count ?? mesh.geometry.getAttribute('position').count;
    return n - (n % 3);
  };
  const out = new Float32Array(meshes.reduce((sum, mesh) => sum + vertexCount(mesh), 0) * 3);
  const vertex = new Vector3();
  let o = 0;
  for (const mesh of meshes) {
    const position = mesh.geometry.getAttribute('position');
    const index = mesh.geometry.index;
    const n = vertexCount(mesh);
    for (let i = 0; i < n; i++) {
      vertex.fromBufferAttribute(position, index ? index.getX(i) : i).applyMatrix4(mesh.matrixWorld);
      out[o++] = vertex.x;
      out[o++] = vertex.y;
      out[o++] = vertex.z;
    }
  }
  return out;
}

/**
 * Whether the ray from `o` along unit `d` crosses any triangle closer than `far` (Möller–Trumbore, both
 * faces). Plain locals over the typed array: no allocation in the loop.
 */
function anyHit(t: Float32Array, o: Vector3, d: Vector3, far: number): boolean {
  if (far <= 0) return false;
  const { x: ox, y: oy, z: oz } = o;
  const { x: dx, y: dy, z: dz } = d;
  for (let i = 0; i < t.length; i += 9) {
    const ax = t[i]!;
    const ay = t[i + 1]!;
    const az = t[i + 2]!;
    const e1x = t[i + 3]! - ax;
    const e1y = t[i + 4]! - ay;
    const e1z = t[i + 5]! - az;
    const e2x = t[i + 6]! - ax;
    const e2y = t[i + 7]! - ay;
    const e2z = t[i + 8]! - az;
    const px = dy * e2z - dz * e2y;
    const py = dz * e2x - dx * e2z;
    const pz = dx * e2y - dy * e2x;
    const det = e1x * px + e1y * py + e1z * pz;
    if (det > -1e-12 && det < 1e-12) continue; // parallel to the triangle
    const inv = 1 / det;
    const sx = ox - ax;
    const sy = oy - ay;
    const sz = oz - az;
    const u = (sx * px + sy * py + sz * pz) * inv;
    if (u < 0 || u > 1) continue;
    const qx = sy * e1z - sz * e1y;
    const qy = sz * e1x - sx * e1z;
    const qz = sx * e1y - sy * e1x;
    const v = (dx * qx + dy * qy + dz * qz) * inv;
    if (v < 0 || u + v > 1) continue;
    const distance = (e2x * qx + e2y * qy + e2z * qz) * inv;
    if (distance > 0 && distance < far) return true;
  }
  return false;
}
