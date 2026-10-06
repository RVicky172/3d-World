import type { Page } from '@playwright/test';
import { PerspectiveCamera, Quaternion, Vector3 } from 'three';

// Shared by the Solar System E2E specs (020–022): bodies projected in Node from the camera and positions the app
// reports, independently of the app's own drawing code.

type ProjectionSnap = NonNullable<ReturnType<NonNullable<Window['__WORLD__']>['cameraProjection']>>;

/**
 * The app's camera rebuilt in Node from the test hook: pose, projection and, while a body is selected, the view
 * offset that centres it in the area the info panel leaves clear (spec 023).
 */
export function cameraFrom(snap: {
  pose: { position: number[]; quaternion: number[] };
  projection: ProjectionSnap;
}) {
  const { fov, aspect, near, far, view } = snap.projection;
  const camera = new PerspectiveCamera(fov, aspect, near, far);
  if (view)
    camera.setViewOffset(
      view.fullWidth,
      view.fullHeight,
      view.offsetX,
      view.offsetY,
      view.width,
      view.height,
    );
  camera.position.fromArray(snap.pose.position);
  camera.quaternion.fromArray(snap.pose.quaternion);
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();
  return camera;
}

/** Waits, frame by frame, until a selection's camera flight has landed (spec 023). No fixed sleeps. */
export async function waitForFly(page: Page): Promise<void> {
  await page.waitForFunction(() => window.__WORLD__?.selection()?.flying === false, undefined, {
    polling: 'raf',
    timeout: 10_000,
  });
}

/** Selects a body from the info panel's list, as a visitor would (spec 023, AC-2). */
export async function selectFromList(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name, exact: true }).click();
}

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
  const camera = cameraFrom(snap);
  const tanHalf = Math.tan((camera.fov * Math.PI) / 360);
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
  const camera = cameraFrom(snap);
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
