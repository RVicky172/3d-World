import type { Page } from '@playwright/test';
import { PerspectiveCamera, Vector3 } from 'three';
import { cameraPose, distanceBetween, expect, gotoSpace, rotationBetween, test } from './fixtures';

// Spec 012 — hotspots on the Sheen Chair: markers (AC-5–AC-7, AC-10). Marker placement is checked against
// points projected here, in Node, from the camera the app reports, not by the marker code's own projection.

const CHAIR = 'sheen-chair';
const TITLES = ['Velvet upholstery', 'Wooden frame', 'Wooden legs', 'Printed label'];
const canvas = (page: Page) => page.locator('#app canvas');
const markers = (page: Page) => page.locator('button.hotspot');
const marker = (page: Page, title: string) => page.getByRole('button', { name: `Hotspot: ${title}` });

/** Lets queued frames run (the occlusion check needs its 0.1 s of Space time), then reads the pose. */
const settledPose = async (page: Page) => {
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  return cameraPose(page);
};

type Placement = { id: string; shown: boolean; error: number };

/**
 * For every hotspot: whether its marker is shown and how far (px) its centre is from the point projected with
 * the current camera. Pose, projection, positions and marker rects come from one `evaluate`, so from one frame.
 */
async function placements(page: Page): Promise<Placement[]> {
  const snap = await page.evaluate(() => {
    const world = window.__WORLD__;
    const box = document.querySelector('#app canvas')?.getBoundingClientRect();
    if (!world || !box) throw new Error('no app');
    return {
      pose: world.cameraPose(),
      projection: world.cameraProjection(),
      hotspots: world.hotspots(),
      canvas: { x: box.x, y: box.y, width: box.width, height: box.height },
      markers: [...document.querySelectorAll<HTMLButtonElement>('button.hotspot')].map((button) => {
        const r = button.getBoundingClientRect();
        return { hidden: button.hidden, x: r.x + r.width / 2, y: r.y + r.height / 2 };
      }),
    };
  });
  if (!snap.pose || !snap.projection) throw new Error('no camera');
  const { fov, aspect, near, far } = snap.projection;
  const camera = new PerspectiveCamera(fov, aspect, near, far);
  camera.position.fromArray(snap.pose.position);
  camera.quaternion.fromArray(snap.pose.quaternion);
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();
  return snap.hotspots.map(({ id, world }, i) => {
    const ndc = new Vector3(...world).project(camera);
    const x = snap.canvas.x + ((ndc.x + 1) / 2) * snap.canvas.width;
    const y = snap.canvas.y + ((1 - ndc.y) / 2) * snap.canvas.height;
    const m = snap.markers[i];
    if (!m) throw new Error(`no marker for ${id}`);
    return { id, shown: !m.hidden, error: Math.hypot(m.x - x, m.y - y) };
  });
}

async function expectAttached(page: Page, where: string) {
  const all = await placements(page);
  const shown = all.filter((p) => p.shown);
  expect(shown.length, `${where}: shown markers`).toBeGreaterThan(0);
  for (const p of shown) expect(p.error, `${where}: ${p.id}`).toBeLessThanOrEqual(4);
}

/** Presses `key` on the 3D view until `done` holds (max `limit` presses); returns whether it did. */
async function orbitUntil(page: Page, key: string, done: () => Promise<boolean>, limit = 30) {
  await canvas(page).focus();
  for (let i = 0; i < limit; i++) {
    await page.keyboard.press(key);
    await settledPose(page);
    if (await done()) return true;
  }
  return false;
}

test.describe('with reduced motion (input-driven only)', () => {
  test.use({ reducedMotion: 'reduce' });

  test('AC-5: four markers, one per hotspot, in data order', async ({ page }) => {
    await gotoSpace(page, CHAIR);
    await expect(markers(page)).toHaveCount(4);
    const names = await markers(page).evaluateAll((all) => all.map((b) => b.getAttribute('aria-label')));
    expect(names).toEqual(TITLES.map((t) => `Hotspot: ${t}`));
    for (const title of TITLES) await expect(marker(page, title)).toBeVisible();
  });

  test('AC-6: markers stay on their points at home, after orbit, zoom and pan', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await gotoSpace(page, CHAIR);
    await settledPose(page);
    await expectAttached(page, 'home');

    await canvas(page).focus();
    for (const key of ['ArrowLeft', 'ArrowLeft', 'ArrowUp']) await page.keyboard.press(key);
    await settledPose(page);
    await expectAttached(page, 'orbit');

    await page.keyboard.press('+');
    await page.keyboard.press('+');
    await settledPose(page);
    await expectAttached(page, 'zoom');

    await page.keyboard.press('Shift+ArrowRight');
    await page.keyboard.press('Shift+ArrowUp');
    await settledPose(page);
    await expectAttached(page, 'pan');
  });

  test('AC-6: and on a 320 × 640 phone, including after a resize', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await gotoSpace(page, CHAIR);
    await settledPose(page);
    await expectAttached(page, '320×640');

    await page.setViewportSize({ width: 800, height: 600 });
    await expect
      .poll(async () => (await page.evaluate(() => window.__WORLD__?.cameraAspect())) ?? 0)
      .toBeCloseTo(800 / 600, 3);
    await settledPose(page);
    await expectAttached(page, 'after resize');
  });

  test('AC-7: a marker whose point faces away is dimmed and disabled; turning to it enables it', async ({
    page,
  }) => {
    await gotoSpace(page, CHAIR);
    await settledPose(page);
    // Front view: the back frame and the label under the seat are hidden by the chair.
    for (const title of ['Wooden frame', 'Printed label']) {
      await expect(marker(page, title)).toBeDisabled();
      await expect(marker(page, title)).toHaveClass(/is-dimmed/);
      await expect(marker(page, title)).toBeVisible(); // dimmed, not gone
    }
    await expect(marker(page, 'Velvet upholstery')).toBeEnabled();

    // Round to the back: the frame faces the camera.
    const frame = marker(page, 'Wooden frame');
    expect(await orbitUntil(page, 'ArrowLeft', () => frame.isEnabled())).toBe(true);
    await expect(frame).not.toHaveClass(/is-dimmed/);

    // Back home, then down under the seat: the label faces the camera.
    await page.keyboard.press('r');
    await settledPose(page);
    const label = marker(page, 'Printed label');
    await expect(label).toBeDisabled();
    expect(await orbitUntil(page, 'ArrowDown', () => label.isEnabled())).toBe(true);
  });

  test('AC-10: Tab reaches the usable markers in data order, named, with a focus ring', async ({ page }) => {
    await gotoSpace(page, CHAIR);
    await settledPose(page);
    await page.getByRole('button', { name: 'Hide info' }).focus();
    // Frame and label are dimmed at home, so Tab skips them.
    for (const title of ['Velvet upholstery', 'Wooden legs']) {
      await page.keyboard.press('Tab');
      await expect(marker(page, title)).toBeFocused();
      const outline = await marker(page, title).evaluate((el) => {
        const style = getComputedStyle(el);
        return { style: style.outlineStyle, width: style.outlineWidth };
      });
      expect(outline).toEqual({ style: 'solid', width: '3px' });
    }
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Camera controls help' })).toBeFocused();
  });

  test('AC-10: arrow keys orbit only while the 3D view has focus', async ({ page }) => {
    await gotoSpace(page, CHAIR);
    const start = await settledPose(page);
    await marker(page, 'Velvet upholstery').focus();
    await page.keyboard.press('ArrowLeft');
    const still = await settledPose(page);
    expect(rotationBetween(start, still)).toBeLessThan(0.01);
    expect(distanceBetween(start, still)).toBeLessThan(1e-4);

    await canvas(page).focus();
    await page.keyboard.press('ArrowLeft');
    expect(rotationBetween(still, await settledPose(page))).toBeGreaterThan(5);
  });
});

test('AC-6: markers stay attached while the turntable turns the chair', async ({ page }) => {
  await gotoSpace(page, CHAIR);
  const first = await settledPose(page);
  await expect.poll(async () => rotationBetween(first, await cameraPose(page))).toBeGreaterThan(1); // moving
  for (let i = 0; i < 3; i++) {
    await expectAttached(page, `turntable ${i}`);
    await page.waitForTimeout(200);
  }
});

const annotation = (page: Page) => page.locator('.hotspot-annotation');
/** The seat's view [0, 0.6, 1] is ~37° from the home view [0.8, 0.45, 1]. */
const SEAT_VIEW = new Vector3(0, 0.6, 1).normalize();
const viewDirection = (pose: { position: number[] }) => new Vector3(...pose.position).normalize();
/** A point on the 3D view at least 40 px from every marker, so a drag there starts on the model's canvas. */
async function clearSpot(page: Page) {
  return page.evaluate(() => {
    const box = document.querySelector('#app canvas')!.getBoundingClientRect();
    const centres = [...document.querySelectorAll('button.hotspot')].map((b) => {
      const r = b.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    for (let dy = 0; dy < box.height / 3; dy += 10) {
      for (const sign of [1, -1]) {
        const p = { x: box.x + box.width / 2, y: box.y + box.height / 2 + sign * dy };
        const clear = centres.every((c) => Math.hypot(c.x - p.x, c.y - p.y) > 40);
        if (clear && document.elementFromPoint(p.x, p.y)?.tagName === 'CANVAS') return p;
      }
    }
    throw new Error('no clear spot');
  });
}

test.describe('activation, with reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('AC-8: a click opens the annotation in a polite region; one at a time', async ({ page }) => {
    await gotoSpace(page, CHAIR);
    await settledPose(page);
    await marker(page, 'Velvet upholstery').click();
    await expect(annotation(page)).toBeVisible();
    await expect(annotation(page).getByRole('heading', { level: 3 })).toHaveText('Velvet upholstery');
    await expect(annotation(page)).toContainText('covered in velvet');
    await expect(page.locator('[aria-live="polite"]').filter({ has: annotation(page) })).toHaveCount(1);
    await expect(marker(page, 'Velvet upholstery')).toHaveAttribute('aria-expanded', 'true');

    await settledPose(page); // the camera turned to the seat; the legs may have dimmed
    const legs = marker(page, 'Wooden legs');
    if (await legs.isEnabled()) {
      await legs.click();
      await expect(annotation(page)).toHaveCount(1);
      await expect(annotation(page).getByRole('heading', { level: 3 })).toHaveText('Wooden legs');
      await expect(marker(page, 'Velvet upholstery')).toHaveAttribute('aria-expanded', 'false');
    }
  });

  for (const how of ['Escape', 'Close', 'the marker again'] as const) {
    test(`AC-8: ${how} closes it and focus returns to the marker`, async ({ page }) => {
      await gotoSpace(page, CHAIR);
      await settledPose(page);
      const seat = marker(page, 'Velvet upholstery');
      await seat.focus();
      await page.keyboard.press('Enter'); // keyboard activation
      await expect(annotation(page)).toBeVisible();
      if (how === 'Escape') await page.keyboard.press('Escape');
      if (how === 'Close') await annotation(page).getByRole('button', { name: 'Close' }).click();
      if (how === 'the marker again') await seat.click();
      await expect(annotation(page)).toHaveCount(0);
      await expect(seat).toHaveAttribute('aria-expanded', 'false');
      await expect(seat).toBeFocused();
    });
  }

  test('AC-9: activating turns the camera to the hotspot’s view at once; Reset view returns home', async ({
    page,
  }) => {
    await gotoSpace(page, CHAIR);
    const home = await settledPose(page);
    await marker(page, 'Velvet upholstery').click();
    const turned = await settledPose(page); // instant under reduced motion: within a frame
    expect(rotationBetween(home, turned)).toBeGreaterThan(20);
    expect((viewDirection(turned).angleTo(SEAT_VIEW) * 180) / Math.PI).toBeLessThan(1);
    await expect(marker(page, 'Velvet upholstery')).toBeEnabled();

    await page.getByRole('button', { name: 'Reset view' }).click();
    const back = await settledPose(page);
    expect(rotationBetween(home, back)).toBeLessThan(0.01);
    expect(distanceBetween(home, back)).toBeLessThan(1e-4);
  });

  test('AC-11: 44 × 44 targets; a drag from a marker never orbits, a drag between markers does', async ({
    page,
  }) => {
    await gotoSpace(page, CHAIR);
    const start = await settledPose(page);
    for (const title of TITLES) {
      const box = await marker(page, title).boundingBox();
      expect(box?.width, title).toBeGreaterThanOrEqual(44);
      expect(box?.height, title).toBeGreaterThanOrEqual(44);
    }

    const box = (await marker(page, 'Wooden legs').boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x - 200, box.y - 100, { steps: 6 });
    await page.mouse.up();
    const after = await settledPose(page);
    expect(rotationBetween(start, after)).toBeLessThan(0.01);
    await expect(annotation(page)).toHaveCount(0); // a drag isn't a click

    const spot = await clearSpot(page);
    await page.mouse.move(spot.x, spot.y);
    await page.mouse.down();
    await page.mouse.move(spot.x + 150, spot.y, { steps: 6 });
    await page.mouse.up();
    expect(rotationBetween(after, await settledPose(page))).toBeGreaterThan(5);
  });

  test('AC-11: a tap opens the annotation on a touch screen', async ({ browser }) => {
    const context = await browser.newContext({
      hasTouch: true,
      isMobile: true,
      viewport: { width: 390, height: 844 },
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await gotoSpace(page, CHAIR);
    await settledPose(page);
    await marker(page, 'Velvet upholstery').tap();
    await expect(annotation(page)).toBeVisible();
    expect(errors).toEqual([]);
    await context.close();
  });
});

test.describe('activation, with motion', () => {
  // The turntable moves the markers every frame, so Playwright's "stable element" check would stall a plain
  // click for seconds. `force` still clicks with the mouse at the marker's current centre.
  const clickMoving = (page: Page, title: string) => marker(page, title).click({ force: true });

  test('AC-9: the camera eases to the hotspot’s view', async ({ page }) => {
    await gotoSpace(page, CHAIR);
    await clickMoving(page, 'Velvet upholstery');
    await expect
      .poll(async () => (viewDirection(await cameraPose(page)).angleTo(SEAT_VIEW) * 180) / Math.PI)
      .toBeLessThan(1);
  });

  test('AC-12: the turntable pauses while the annotation is open and resumes after its idle delay', async ({
    page,
  }) => {
    test.slow(); // about 12 s of deliberate waiting around the 4 s idle delay
    await gotoSpace(page, CHAIR);
    await clickMoving(page, 'Velvet upholstery');
    // Let the turn settle (0.6 s), then the pose must hold still.
    await expect
      .poll(async () => (viewDirection(await cameraPose(page)).angleTo(SEAT_VIEW) * 180) / Math.PI)
      .toBeLessThan(1);
    await page.waitForTimeout(300); // damping tail
    const open = await cameraPose(page);
    // The turn itself restarts the turntable's 4 s idle delay, so only stillness beyond it proves the pause.
    await page.waitForTimeout(4600);
    expect(rotationBetween(open, await cameraPose(page))).toBeLessThan(0.5);

    await annotation(page).getByRole('button', { name: 'Close' }).click();
    const closed = await cameraPose(page);
    await page.waitForTimeout(2000); // well inside the chair's 4 s idle delay
    expect(rotationBetween(closed, await cameraPose(page))).toBeLessThan(0.5);
    await expect
      .poll(async () => rotationBetween(closed, await cameraPose(page)), { timeout: 8000 })
      .toBeGreaterThan(1);
  });
});

test.describe('lifecycle', () => {
  test.use({ reducedMotion: 'reduce' }); // instant swaps keep 10 round trips fast

  test('AC-15: 10 gallery ↔ chair round trips leave no extra DOM and return GPU memory to the baseline', async ({
    page,
  }) => {
    const body = page.locator('body');
    const toGallery = async () => {
      await page.evaluate(() => (window.location.hash = '#/'));
      await expect(body).toHaveAttribute('data-view', 'gallery');
      await expect(body).toHaveAttribute('data-space-ready', 'true');
    };
    const snapshot = () =>
      page.evaluate(() => ({
        // The "<title> loaded" announcer (011, D-019) is created on the first slow load and kept for the app's
        // lifetime: one element, which appears whenever a visit is slow enough to show the loading indicator.
        elements: document.querySelectorAll('#app *:not(.loading-announcer)').length,
        memory: window.__WORLD__!.memory(),
      }));

    // Warm-up visit: three keeps a renderer-lifetime texture after the first PBR render (learnings).
    await gotoSpace(page, CHAIR);
    await toGallery();
    const baseline = await snapshot();

    for (let i = 0; i < 10; i++) {
      await page.evaluate((id) => window.__WORLD__!.navigate(id), CHAIR);
      await expect(body).toHaveAttribute('data-space-ready', 'true');
      await expect(markers(page)).toHaveCount(4);
      await expect(page.locator('.info')).toHaveCount(1);
      await settledPose(page);
      await marker(page, 'Velvet upholstery').click(); // leave with an annotation open: its listeners too
      await expect(annotation(page)).toBeVisible();
      await toGallery();
      await expect(page.locator('.hotspots, .info, .hotspot-annotation')).toHaveCount(0);
    }

    expect(await snapshot()).toEqual(baseline);
  });

  test('AC-16: after a context loss and restore, the panel and markers come back, attached', async ({
    page,
  }) => {
    const body = page.locator('body');
    await gotoSpace(page, CHAIR);
    await page.evaluate(() => window.__WORLD__!.loseContext());
    await expect(body).toHaveAttribute('data-webgl', 'lost', { timeout: 1000 });
    // Restore only after the app's signal: a later task than the loss event (learnings).
    await page.evaluate(() => window.__WORLD__!.restoreContext());
    await expect(body).not.toHaveAttribute('data-webgl', /.*/);
    await expect(body).toHaveAttribute('data-space-ready', 'true');

    await expect(page.getByRole('region', { name: 'Sheen Chair' })).toHaveCount(1);
    await expect(page.locator('.hotspots')).toHaveCount(1);
    await expect(markers(page)).toHaveCount(4);
    await settledPose(page);
    await expectAttached(page, 'after restore');
  });
});
