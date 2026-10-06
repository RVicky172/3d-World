import type { Page } from '@playwright/test';
import { PerspectiveCamera, Quaternion, Vector3 } from 'three';

// Shared by the Solar System E2E specs (020–022): bodies projected in Node from the camera and positions the app
// reports, independently of the app's own drawing code.

/** Lets queued frames run. */
export const frames = (page: Page) =>
  page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

export type Projected = { id: string; x: number; y: number; radiusPx: number; inFront: boolean };

/** Every body's centre and radius on the canvas (CSS px), from one snapshot of camera and bodies. */
export async function project(page: Page): Promise<{ width: number; height: number; bodies: Projected[] }> {
  const snap = await page.evaluate(() => {
    const world = window.__WORLD__!;
    const box = document.querySelector('#app canvas')!.getBoundingClientRect();
    return {
      pose: world.cameraPose()!,
      projection: world.cameraProjection()!,
      bodies: world.bodies(),
      width: box.width,
      height: box.height,
    };
  });
  const { fov, aspect, near, far } = snap.projection;
  const camera = new PerspectiveCamera(fov, aspect, near, far);
  camera.position.fromArray(snap.pose.position);
  camera.quaternion.fromArray(snap.pose.quaternion);
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();
  const tanHalf = Math.tan((fov * Math.PI) / 360);
  return {
    width: snap.width,
    height: snap.height,
    bodies: snap.bodies.map(({ id, world, radius }) => {
      const point = new Vector3(...world);
      const ndc = point.clone().project(camera);
      const distance = camera.position.distanceTo(point);
      return {
        id,
        x: ((ndc.x + 1) / 2) * snap.width,
        y: ((1 - ndc.y) / 2) * snap.height,
        radiusPx: (radius * (snap.height / 2)) / (distance * tanHalf),
        inFront: ndc.z >= -1 && ndc.z <= 1,
      };
    }),
  };
}

export interface Snapshot {
  camera: PerspectiveCamera;
  bodies: Array<{ id: string; world: Vector3; radius: number; quaternion: Quaternion }>;
  /** Canvas size in CSS px. */
  width: number;
  height: number;
}

/** The camera (as a three camera) and the bodies, from one moment of the app. */
export async function snapshot(page: Page): Promise<Snapshot> {
  const snap = await page.evaluate(() => {
    const world = window.__WORLD__!;
    const box = document.querySelector('#app canvas')!.getBoundingClientRect();
    return {
      pose: world.cameraPose()!,
      projection: world.cameraProjection()!,
      bodies: world.bodies(),
      width: box.width,
      height: box.height,
    };
  });
  const { fov, aspect, near, far } = snap.projection;
  const camera = new PerspectiveCamera(fov, aspect, near, far);
  camera.position.fromArray(snap.pose.position);
  camera.quaternion.fromArray(snap.pose.quaternion);
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();
  return {
    camera,
    width: snap.width,
    height: snap.height,
    bodies: snap.bodies.map((b) => ({
      id: b.id,
      world: new Vector3(...b.world),
      radius: b.radius,
      quaternion: new Quaternion(...(b.quaternion ?? [0, 0, 0, 1])),
    })),
  };
}
