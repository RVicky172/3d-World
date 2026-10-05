import type { Page } from '@playwright/test';
import { frameDistance } from '../../src/shared/model-viewer/framing';
import { SHEEN_CHAIR } from '../../src/spaces/sheen-chair/data';
import {
  cameraPose,
  contentBounds,
  distanceBetween,
  expect,
  gotoSpace,
  radius,
  rotationBetween,
  test,
} from './fixtures';

// Spec 010 — model viewer Space (sheen-chair). Console errors fail every test (fixtures.ts).
// Framing and lighting are measured on the drawing buffer with contentBounds().

const ID = 'sheen-chair';
const body = (page: Page) => page.locator('body');
const canvas = (page: Page) => page.locator('#app canvas');

/** Resizes the viewport and waits until the Space has re-framed for it. */
async function resizeTo(page: Page, width: number, height: number): Promise<void> {
  await page.setViewportSize({ width, height });
  await expect
    .poll(() => page.evaluate(() => window.__WORLD__?.cameraAspect()))
    .toBeCloseTo(width / height, 3);
  await nextFrames(page);
}

/** Two animation frames, so the latest camera state has been drawn. */
const nextFrames = (page: Page) =>
  page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

test.describe('contentBounds helper (T070)', () => {
  test.use({ reducedMotion: 'reduce' });

  test('reads a large subject as a large fill, and a blank canvas as nothing', async ({ page }) => {
    await gotoSpace(page, 'demo-cube');
    expect((await contentBounds(page)).fillOfSmaller).toBeGreaterThan(0.3);

    await page.goto('/#/space/does-not-exist'); // "Space not found": the canvas is cleared
    await expect(body(page)).toHaveAttribute('data-space-status', 'not-found');
    await nextFrames(page);
    expect(await contentBounds(page)).toEqual({ width: 0, height: 0, fillOfSmaller: 0, meanLuminance: 0 });
  });
});

test.describe('showing the model', () => {
  test.use({ reducedMotion: 'reduce' }); // no turntable: framing is measured at the home view

  test('AC-1: the gallery card opens the chair, ready only once it is drawn', async ({ page }) => {
    await page.goto('/');
    await expect(body(page)).toHaveAttribute('data-space-ready', 'true');
    const card = page.locator(`a.card[href="#/space/${ID}"]`);
    await expect(card.getByRole('heading', { level: 2 })).toHaveText('Sheen Chair');
    await expect(card).toContainText('velvet armchair');
    await expect(card.locator('.card-placeholder')).toBeVisible();

    await card.click();
    await expect(body(page)).toHaveAttribute('data-space-id', ID);
    await expect(body(page)).toHaveAttribute('data-space-ready', 'true');
    expect((await contentBounds(page)).fillOfSmaller).toBeGreaterThan(0.3);
  });

  for (const [width, height] of [
    [1280, 720],
    [768, 1024],
    [320, 640],
  ] as const) {
    test(`AC-2: the whole model is framed at ${width}×${height}`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await gotoSpace(page, ID);
      const { fillOfSmaller } = await contentBounds(page);
      expect(fillOfSmaller).toBeGreaterThanOrEqual(0.5);
      expect(fillOfSmaller).toBeLessThanOrEqual(0.9);
    });
  }

  test('AC-3: re-frames on resize until the visitor moves the camera; Reset frames for the new size', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await gotoSpace(page, ID);

    await resizeTo(page, 320, 640);
    const portrait = (await contentBounds(page)).fillOfSmaller;
    expect(portrait).toBeGreaterThanOrEqual(0.5);
    expect(portrait).toBeLessThanOrEqual(0.9);

    // The visitor moves the camera: a resize no longer overrides their view.
    await canvas(page).focus();
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('Minus');
    const moved = await cameraPose(page);
    await resizeTo(page, 1280, 720);
    const after = await cameraPose(page);
    expect(rotationBetween(moved, after)).toBeLessThan(0.5);
    expect(distanceBetween(moved, after)).toBeLessThan(1e-3);

    // Reset returns to the framed view for the current (landscape) size.
    await page.keyboard.press('r');
    await nextFrames(page);
    const reset = (await contentBounds(page)).fillOfSmaller;
    expect(reset).toBeGreaterThanOrEqual(0.5);
    expect(reset).toBeLessThanOrEqual(0.9);
  });

  test('AC-4: every side of the model is lit (front, left, back, right)', async ({ page }) => {
    await gotoSpace(page, ID);
    await canvas(page).focus();
    const brightness: number[] = [];
    let previous = await cameraPose(page);
    for (let side = 0; side < 4; side++) {
      if (side > 0) {
        for (let i = 0; i < 12; i++) await page.keyboard.press('ArrowLeft'); // 12 × 7.5° = 90°
        const now = await cameraPose(page);
        expect(rotationBetween(previous, now)).toBeGreaterThan(80);
        previous = now;
      }
      await nextFrames(page);
      const { meanLuminance, fillOfSmaller } = await contentBounds(page);
      expect(fillOfSmaller, `side ${side} visible`).toBeGreaterThan(0.3);
      brightness.push(meanLuminance);
    }
    for (const [side, value] of brightness.entries()) {
      expect(
        value,
        `side ${side} brightness (all: ${brightness.map(Math.round).join(', ')})`,
      ).toBeGreaterThan(40);
    }
  });
});

test.describe('exploring the model', () => {
  test.use({ reducedMotion: 'reduce' }); // input-driven only, so poses are stable between reads

  test('AC-5: zoom stops outside the model, and zooming out stops at the 10 % bounding-sphere distance (D-016)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await gotoSpace(page, ID);
    await canvas(page).focus();

    // The model is centred on the origin and framed at the home distance, so the measured home distance
    // gives its bounding-sphere radius (frameDistance is linear in r).
    const home = radius(await cameraPose(page));
    const fovY = (SHEEN_CHAIR.camera.fov * Math.PI) / 180;
    const modelRadius = home / frameDistance(1, fovY, 1280 / 720, SHEEN_CHAIR.fill ?? 0.75);

    for (let i = 0; i < 20; i++) await page.keyboard.press('+');
    await nextFrames(page);
    const closest = radius(await cameraPose(page));
    expect(closest, 'never inside the model').toBeGreaterThan(modelRadius);
    expect(closest, 'zoom really reached its limit').toBeLessThan(1.3 * modelRadius);

    for (let i = 0; i < 40; i++) await page.keyboard.press('-');
    await nextFrames(page);
    const farthest = radius(await cameraPose(page));
    expect(farthest).toBeGreaterThan(5 * home); // it did zoom out
    expect(farthest).toBeLessThanOrEqual(frameDistance(modelRadius, fovY, 1280 / 720, 0.1) * 1.001);
    expect((await contentBounds(page)).fillOfSmaller, 'still visible').toBeGreaterThan(0);
  });

  test('AC-5: the shared controls are all there — hint, "?" help, Reset and keyboard', async ({ page }) => {
    await gotoSpace(page, ID);
    await expect(page.locator('.controls-hint')).toBeVisible();

    const help = page.getByRole('button', { name: 'Camera controls help' });
    await help.click();
    await expect(page.locator('.controls-help')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.controls-help')).toBeHidden();

    await canvas(page).focus();
    const start = await cameraPose(page);
    await page.keyboard.press('ArrowRight');
    await nextFrames(page);
    expect(rotationBetween(start, await cameraPose(page))).toBeGreaterThan(5);

    await page.getByRole('button', { name: 'Reset view' }).click();
    await nextFrames(page);
    const reset = await cameraPose(page);
    expect(rotationBetween(start, reset)).toBeLessThan(0.5);
    expect(distanceBetween(start, reset)).toBeLessThan(1e-3);
  });

  test('AC-6: with reduced motion the turntable is off', async ({ page }) => {
    await gotoSpace(page, ID);
    await nextFrames(page);
    const first = await cameraPose(page);
    await page.waitForTimeout(600); // intentional: watching for automatic motion
    await nextFrames(page);
    const later = await cameraPose(page);
    expect(rotationBetween(first, later)).toBeLessThan(0.01);
    expect(distanceBetween(first, later)).toBeLessThan(1e-4);
  });

  test('AC-7: the 3D view is named after the model; the card gives title and description', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(body(page)).toHaveAttribute('data-space-ready', 'true');
    const card = page.getByRole('link', { name: /Sheen Chair/ });
    await expect(card).toContainText('Sheen Chair');
    await expect(card).toContainText('A velvet armchair to turn, zoom and inspect');

    await card.click();
    await expect(body(page)).toHaveAttribute('data-space-ready', 'true');
    await expect(canvas(page)).toHaveAttribute('aria-label', /^3D view: Sheen Chair\./);
    await expect(page).toHaveTitle(/Sheen Chair/);
  });

  test('AC-13: the credit line names the model, its author and its licence', async ({ page }) => {
    await gotoSpace(page, ID);
    const credit = page.locator('.model-credit');
    await expect(credit).toBeVisible();
    await expect(credit).toContainText('SheenChair by Eric Chadwick, © 2020 Wayfair, LLC · CC0 1.0');
    await expect(credit.getByRole('link', { name: 'SheenChair' })).toHaveAttribute(
      'href',
      'https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/SheenChair',
    );
  });
});

test.describe('loading, failure and lifecycle', () => {
  const GLB = '**/assets/sheen-chair/SheenChair.glb';

  test('AC-8: a slow download shows an announced "Loading Sheen Chair…", gone once the chair is drawn', async ({
    page,
  }) => {
    await page.route(GLB, async (route) => {
      await new Promise((r) => setTimeout(r, 1500)); // a slow network
      await route.continue();
    });
    await page.goto('/');
    await expect(body(page)).toHaveAttribute('data-space-ready', 'true');

    await page.evaluate((id) => window.__WORLD__!.navigate(id), ID);
    const status = page.getByRole('status').filter({ hasText: 'Loading Sheen Chair…' });
    await expect(status).toBeVisible();
    await expect(status).toHaveAttribute('aria-live', 'polite');
    await expect(body(page)).not.toHaveAttribute('data-space-ready', 'true');

    await expect(body(page)).toHaveAttribute('data-space-ready', 'true', { timeout: 10_000 });
    await expect(body(page)).toHaveAttribute('data-space-id', ID);
    await expect(page.locator('.loading')).toHaveCount(0);
    expect((await contentBounds(page)).fillOfSmaller).toBeGreaterThan(0.3);
  });

  test.describe('when the model cannot be downloaded', () => {
    // The app logs the failure on purpose (AC-9), and Chromium logs the aborted request itself.
    test.use({ allowConsoleErrors: [`Space "${ID}" failed to load`, 'Failed to load resource'] });

    test('AC-9: "Failed to load" is shown, the back link works, nothing else goes wrong', async ({
      page,
      consoleErrors,
    }) => {
      await page.route(GLB, (route) => route.abort('failed'));
      await page.goto(`/#/space/${ID}`);
      await expect(body(page)).toHaveAttribute('data-space-status', 'load-error');
      const message = page.getByRole('alert');
      await expect(message.getByRole('heading')).toHaveText('Failed to load this space');
      await expect(page.locator('.loading, .model-credit, .controls-bar')).toHaveCount(0);
      expect(consoleErrors.some((e) => e.includes(`Space "${ID}" failed to load`))).toBe(true);

      await page.getByRole('link', { name: 'Back to gallery' }).click();
      await expect(body(page)).toHaveAttribute('data-view', 'gallery');
      await expect(body(page)).toHaveAttribute('data-space-ready', 'true');
      await expect(page.locator(`a.card[href="#/space/${ID}"]`)).toBeVisible();
    });
  });

  test.describe('memory', () => {
    test.use({ reducedMotion: 'reduce' }); // instant swaps keep 10 round trips fast

    test('AC-10: 10 gallery ↔ chair round trips return GPU memory to the baseline', async ({ page }) => {
      const toGallery = async () => {
        await page.evaluate(() => (window.location.hash = '#/'));
        await expect(body(page)).toHaveAttribute('data-view', 'gallery');
        await expect(body(page)).toHaveAttribute('data-space-ready', 'true');
      };
      const toChair = async () => {
        await page.evaluate((id) => window.__WORLD__!.navigate(id), ID);
        await expect(body(page)).toHaveAttribute('data-space-id', ID);
        await expect(body(page)).toHaveAttribute('data-space-ready', 'true');
      };

      // Warm-up visit: three creates its renderer-lifetime DFG LUT on the first PBR render (learnings).
      await gotoSpace(page, ID);
      await toGallery();
      const baseline = await page.evaluate(() => window.__WORLD__!.memory());

      for (let i = 0; i < 10; i++) {
        await toChair();
        const during = await page.evaluate(() => window.__WORLD__!.memory());
        // Sanity: the chair really uploaded resources, so returning to baseline means something.
        expect(during.geometries).toBeGreaterThan(baseline.geometries);
        expect(during.textures).toBeGreaterThan(baseline.textures);
        await toGallery();
      }

      expect(await page.evaluate(() => window.__WORLD__!.memory())).toEqual(baseline);
    });
  });

  test('AC-11: after a context loss and restore the chair comes back framed and lit', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await gotoSpace(page, ID);

    await page.evaluate(() => window.__WORLD__!.loseContext());
    await expect(body(page)).toHaveAttribute('data-webgl', 'lost', { timeout: 1000 });
    // Restore only after the app's signal: a later task than the loss event (learnings).
    await page.evaluate(() => window.__WORLD__!.restoreContext());
    await expect(body(page)).not.toHaveAttribute('data-webgl', /.*/);
    await expect(body(page)).toHaveAttribute('data-space-id', ID);
    await expect(body(page)).toHaveAttribute('data-space-ready', 'true');

    await nextFrames(page);
    const { fillOfSmaller, meanLuminance } = await contentBounds(page);
    expect(fillOfSmaller).toBeGreaterThanOrEqual(0.5);
    expect(fillOfSmaller).toBeLessThanOrEqual(0.9);
    expect(meanLuminance).toBeGreaterThan(40);
  });

  test('AC-12: everything the chair needs comes from the site itself', async ({ page, baseURL }) => {
    const urls: string[] = [];
    page.on('request', (request) => urls.push(request.url()));

    await gotoSpace(page, ID);

    const site = new URL(baseURL!).origin;
    expect(urls.some((url) => url.endsWith('/assets/sheen-chair/SheenChair.glb'))).toBe(true);
    // data: URLs never leave the page; blob: URLs carry the page's own origin.
    const foreign = urls.filter((url) => !url.startsWith('data:') && new URL(url).origin !== site);
    expect(foreign).toEqual([]);
  });
});
