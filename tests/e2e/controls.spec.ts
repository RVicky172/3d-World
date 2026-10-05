import type { Page } from '@playwright/test';
import {
  cameraPose,
  canvasCoverage,
  distanceBetween,
  expect,
  radius,
  rotationBetween,
  test,
  touchGesture,
  type CameraPose,
} from './fixtures';

// Spec 004 — shared camera controls, exercised through demo-cube. Console errors fail every test.
// Most tests use reduced motion: no turntable and no damping, so poses only change from input.

const canvas = (page: Page) => page.locator('#app canvas');
const backLink = (page: Page) => page.getByRole('link', { name: 'Back to gallery' });
const helpButton = (page: Page) => page.getByRole('button', { name: 'Camera controls help' });
const resetButton = (page: Page) => page.getByRole('button', { name: 'Reset view' });

async function gotoCube(page: Page) {
  await page.goto('/#/space/demo-cube');
  await expect(page.locator('body')).toHaveAttribute('data-space-id', 'demo-cube');
  await expect(page.locator('body')).toHaveAttribute('data-space-ready', 'true');
}
async function gotoGallery(page: Page) {
  await page.goto('/');
  await expect(page.locator('body')).toHaveAttribute('data-view', 'gallery');
  await expect(page.locator('body')).toHaveAttribute('data-space-ready', 'true');
}
/** Viewport centre, where the cube is. */
const centre = (page: Page) => {
  const size = page.viewportSize() ?? { width: 1280, height: 720 };
  return { x: size.width / 2, y: size.height / 2 };
};
async function drag(page: Page, dx: number, dy: number, options: { button?: 'left' | 'right' } = {}) {
  const { x, y } = centre(page);
  await page.mouse.move(x, y);
  await page.mouse.down(options);
  await page.mouse.move(x + dx, y + dy, { steps: 6 });
  await page.mouse.up(options);
}
/** Lets queued frames run, then reads the pose. */
const settledPose = async (page: Page) => {
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  return cameraPose(page);
};
const expectSamePose = (a: CameraPose, b: CameraPose) => {
  expect(rotationBetween(a, b)).toBeLessThan(0.01);
  expect(distanceBetween(a, b)).toBeLessThan(1e-4);
};

test.describe('with reduced motion (input-driven only)', () => {
  test.use({ reducedMotion: 'reduce' });

  test.describe('AC-1: mouse', () => {
    test('drag orbits, wheel zooms', async ({ page }) => {
      await gotoCube(page);
      const start = await settledPose(page);

      await drag(page, 200, 0);
      const orbited = await settledPose(page);
      expect(rotationBetween(start, orbited)).toBeGreaterThan(5);
      expect(radius(orbited)).toBeCloseTo(radius(start), 3); // orbit keeps the distance

      await page.mouse.wheel(0, -400);
      await expect.poll(async () => radius(await cameraPose(page))).toBeLessThan(radius(orbited) - 0.1);
    });

    test('right-drag and Shift+drag pan: the camera slides without turning', async ({ page }) => {
      await gotoCube(page);
      const start = await settledPose(page);

      await drag(page, 120, 0, { button: 'right' });
      const panned = await settledPose(page);
      expect(distanceBetween(start, panned)).toBeGreaterThan(0.1);
      expect(rotationBetween(start, panned)).toBeLessThan(0.01);

      await page.keyboard.down('Shift');
      await drag(page, 0, 120);
      await page.keyboard.up('Shift');
      const shiftPanned = await settledPose(page);
      expect(distanceBetween(panned, shiftPanned)).toBeGreaterThan(0.1);
      expect(rotationBetween(panned, shiftPanned)).toBeLessThan(0.01);
    });
  });

  test.describe('AC-3: keyboard', () => {
    test('keys move the camera only while the 3D view has focus, and focus is visible', async ({ page }) => {
      await gotoCube(page);
      const start = await settledPose(page);

      await page.keyboard.press('ArrowRight'); // nothing focused: no effect
      expectSamePose(start, await settledPose(page));

      await page.keyboard.press('Tab'); // back link
      await page.keyboard.press('Tab'); // 3D view
      await expect(canvas(page)).toBeFocused();
      await expect(canvas(page)).toHaveAttribute('aria-label', /Demo Cube.*arrow keys/i);
      const outline = await canvas(page).evaluate((el) => parseFloat(getComputedStyle(el).outlineWidth));
      expect(outline).toBeGreaterThan(0);

      await page.keyboard.press('ArrowRight');
      const orbited = await settledPose(page);
      expect(rotationBetween(start, orbited)).toBeGreaterThan(5);

      await page.keyboard.press('Shift+ArrowUp');
      const panned = await settledPose(page);
      expect(rotationBetween(orbited, panned)).toBeLessThan(0.01);
      expect(distanceBetween(orbited, panned)).toBeGreaterThan(0.1);

      await page.keyboard.press('+');
      expect(radius(await settledPose(page))).toBeLessThan(radius(panned));

      await backLink(page).focus();
      const beforeLinkKeys = await settledPose(page);
      await page.keyboard.press('ArrowLeft');
      expectSamePose(beforeLinkKeys, await settledPose(page));
    });
  });

  test.describe('AC-4: limits', () => {
    test('zoom stops at the distance limits', async ({ page }) => {
      await gotoCube(page);
      await canvas(page).focus();
      for (let i = 0; i < 40; i++) await page.keyboard.press('+');
      expect(radius(await settledPose(page))).toBeGreaterThanOrEqual(2.2 - 1e-3);
      for (let i = 0; i < 60; i++) await page.keyboard.press('-');
      expect(radius(await settledPose(page))).toBeLessThanOrEqual(9 + 1e-3);
    });

    test('heavy panning cannot lose the cube', async ({ page }) => {
      await gotoCube(page);
      await canvas(page).focus();
      for (let i = 0; i < 40; i++) await page.keyboard.press('Shift+ArrowRight');
      for (let i = 0; i < 40; i++) await page.keyboard.press('Shift+ArrowUp');
      await drag(page, 600, 300, { button: 'right' });
      await settledPose(page);
      expect(await canvasCoverage(page)).toBeGreaterThan(0.02);
    });
  });

  test('AC-5: R and the "Reset view" button restore the initial view', async ({ page }) => {
    await gotoCube(page);
    const initial = await settledPose(page);

    await canvas(page).focus();
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('Shift+ArrowDown');
    await page.keyboard.press('-');
    await page.keyboard.press('r');
    expectSamePose(initial, await settledPose(page));

    await drag(page, -150, 60);
    await page.mouse.wheel(0, -300);
    await resetButton(page).click();
    expectSamePose(initial, await settledPose(page));
  });

  test('AC-6: the gallery has no camera controls', async ({ page }) => {
    await gotoGallery(page);
    await expect(canvas(page)).not.toHaveAttribute('tabindex');
    await expect(page.locator('.controls-bar')).toHaveCount(0);
    const before = await settledPose(page);
    await page.mouse.move(centre(page).x, centre(page).y);
    await page.mouse.wheel(0, -400);
    await drag(page, 200, 0);
    expectSamePose(before, await settledPose(page));
  });

  test('AC-8: 10 enter/leave cycles leave no controls, attributes or listeners behind', async ({ page }) => {
    await gotoGallery(page);
    for (let i = 0; i < 10; i++) {
      await page.evaluate(() => window.__WORLD__!.navigate('demo-cube'));
      await expect(page.locator('body')).toHaveAttribute('data-space-id', 'demo-cube');
      await expect(page.locator('.controls-bar')).toHaveCount(1);
      await page.evaluate(() => (window.location.hash = '#/'));
      await expect(page.locator('body')).toHaveAttribute('data-view', 'gallery');
      await expect(page.locator('body')).toHaveAttribute('data-space-ready', 'true');
    }
    await expect(page.locator('.controls-bar, .controls-hint')).toHaveCount(0);
    await expect(canvas(page)).not.toHaveAttribute('tabindex');
    await expect(canvas(page)).not.toHaveAttribute('role');
    const before = await settledPose(page);
    await page.mouse.move(centre(page).x, centre(page).y);
    await page.mouse.wheel(0, -400);
    await page.keyboard.press('ArrowRight');
    expectSamePose(before, await settledPose(page));
  });

  test.describe('AC-9: on-screen UI', () => {
    test('clicking, dragging and scrolling on controls never moves the camera', async ({ page }) => {
      await gotoCube(page);
      const start = await settledPose(page);

      // Check after every step, so a failure names the culprit.
      await helpButton(page).click();
      await helpButton(page).click();
      expectSamePose(start, await settledPose(page));

      // A drag that *starts* on a control must not orbit, even if it ends over the 3D view.
      const box = await resetButton(page).boundingBox();
      if (!box) throw new Error('reset button not laid out');
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x - 200, box.y - 100, { steps: 6 });
      await page.mouse.up();
      expectSamePose(start, await settledPose(page));

      // Scrolling *over* a control must not zoom.
      for (const control of [helpButton(page), backLink(page)]) {
        await control.hover();
        await page.mouse.wheel(0, -400);
        expectSamePose(start, await settledPose(page));
      }
    });

    test('Tab order follows the layout: back link → 3D view → info toggle → "?" → "Reset view"', async ({
      page,
    }) => {
      await gotoCube(page);
      await page.keyboard.press('Tab');
      await expect(backLink(page)).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(canvas(page)).toBeFocused();
      await page.keyboard.press('Tab'); // spec 012: the info panel's toggle comes right after the 3D view
      await expect(page.locator('button.info-toggle')).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(helpButton(page)).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(resetButton(page)).toBeFocused();
    });
  });

  test.describe('AC-10: discoverability', () => {
    test('a hint appears on open and disappears on the first interaction', async ({ page }) => {
      await gotoCube(page);
      const hint = page.locator('.controls-hint');
      await expect(hint).toBeVisible();
      await expect(hint).toHaveAttribute('aria-live', 'polite');
      await expect(hint).toContainText('Drag to rotate');
      await page.mouse.move(centre(page).x, centre(page).y);
      await page.mouse.wheel(0, -100);
      await expect(hint).toHaveCount(0);
    });

    test('the hint also leaves on its own after a few seconds', async ({ page }) => {
      await gotoCube(page);
      await expect(page.locator('.controls-hint')).toBeVisible();
      await expect(page.locator('.controls-hint')).toHaveCount(0, { timeout: 8000 });
    });

    test('"?" opens a help panel listing every input; Escape closes it', async ({ page }) => {
      await gotoCube(page);
      await expect(helpButton(page)).toHaveAttribute('aria-expanded', 'false');
      await helpButton(page).click();
      await expect(helpButton(page)).toHaveAttribute('aria-expanded', 'true');
      const panel = page.locator('.controls-help');
      await expect(panel).toBeVisible();
      for (const heading of ['Mouse', 'Touch', 'Keyboard']) await expect(panel).toContainText(heading);

      await page.keyboard.press('Escape');
      await expect(panel).toBeHidden();
      await expect(helpButton(page)).toBeFocused();
    });
  });

  test('AC-12: resizing keeps the current view and fixes the aspect', async ({ page }) => {
    await gotoCube(page);
    await canvas(page).focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('-');
    const before = await settledPose(page);

    await page.setViewportSize({ width: 900, height: 900 });
    await expect.poll(() => page.evaluate(() => window.__WORLD__?.cameraAspect())).toBeCloseTo(1, 3);
    expectSamePose(before, await settledPose(page));
  });

  test.describe('AC-13: focus is never lost when switching views', () => {
    test('keyboard round trip: card → 3D view; back link → the same card', async ({ page }) => {
      await gotoGallery(page);
      await page.keyboard.press('Tab'); // Solar System
      await page.keyboard.press('Tab'); // Sheen Chair
      await page.keyboard.press('Tab'); // Demo Cube
      await page.keyboard.press('Enter');
      await expect(page.locator('body')).toHaveAttribute('data-space-ready', 'true');
      await expect(page.locator('body')).toHaveAttribute('data-space-id', 'demo-cube');
      await expect(canvas(page)).toBeFocused();

      await page.keyboard.press('Shift+Tab');
      await expect(backLink(page)).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(page.locator('body')).toHaveAttribute('data-view', 'gallery');
      await expect(page.getByRole('link', { name: /Demo Cube/ })).toBeFocused();
    });

    test('focus is not moved on the first page view', async ({ page }) => {
      await gotoCube(page);
      expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);
    });
  });

  test('AC-2: touch — orbit, pinch zoom and two-finger pan without scrolling the page', async ({
    browser,
  }) => {
    const context = await browser.newContext({
      hasTouch: true,
      isMobile: true,
      viewport: { width: 390, height: 844 },
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await gotoCube(page);
    await expect(page.locator('.controls-hint')).toContainText('Pinch to zoom');
    const { x, y } = centre(page);
    const start = await settledPose(page);

    await touchGesture(page, [{ from: { x, y }, to: { x: x + 120, y } }]);
    const orbited = await settledPose(page);
    expect(rotationBetween(start, orbited)).toBeGreaterThan(5);

    await touchGesture(page, [
      { from: { x: x - 40, y }, to: { x: x - 140, y } },
      { from: { x: x + 40, y }, to: { x: x + 140, y } },
    ]);
    const pinched = await settledPose(page);
    expect(radius(pinched)).toBeLessThan(radius(orbited) - 0.1);

    await touchGesture(page, [
      { from: { x: x - 40, y }, to: { x: x - 40, y: y + 120 } },
      { from: { x: x + 40, y }, to: { x: x + 40, y: y + 120 } },
    ]);
    const panned = await settledPose(page);
    expect(distanceBetween(pinched, panned)).toBeGreaterThan(0.1);
    expect(rotationBetween(pinched, panned)).toBeLessThan(0.5);

    const viewport = await page.evaluate(() => ({
      scrollY: window.scrollY,
      scale: visualViewport?.scale ?? 1,
    }));
    expect(viewport).toEqual({ scrollY: 0, scale: 1 });
    expect(errors).toEqual([]);
    await context.close();
  });

  test('AC-7: no inertia — the camera stops the moment a drag ends', async ({ page }) => {
    await gotoCube(page);
    await drag(page, 250, 0);
    const atRelease = await settledPose(page);
    await page.waitForTimeout(500); // intentional: watching for drift over time
    expectSamePose(atRelease, await settledPose(page));
  });

  test('AC-7, AC-11: nothing moves on its own', async ({ page }) => {
    await gotoCube(page);
    const first = await settledPose(page);
    await page.waitForTimeout(1000); // intentional: watching for automatic motion
    expectSamePose(first, await settledPose(page));
  });
});

test.describe('with normal motion', () => {
  test('AC-11: the camera turntable orbits while idle', async ({ page }) => {
    await gotoCube(page);
    const first = await settledPose(page);
    await page.waitForTimeout(600); // intentional: the turntable is time-based
    const later = await settledPose(page);
    expect(rotationBetween(first, later)).toBeGreaterThan(1);
    expect(radius(later)).toBeCloseTo(radius(first), 2);
  });

  test('AC-7: a released drag eases to a stop, then the turntable waits for the idle delay (AC-11)', async ({
    page,
  }) => {
    await gotoCube(page);
    const { x, y } = centre(page);
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 250, y, { steps: 3 }); // fast flick
    await page.mouse.up();
    const atRelease = await cameraPose(page);
    await page.waitForTimeout(150); // intentional: damping glide after release
    const gliding = await cameraPose(page);
    expect(rotationBetween(atRelease, gliding)).toBeGreaterThan(0.05);

    await page.waitForTimeout(1500); // intentional: let the glide settle (idle delay is 4 s)
    const settledA = await cameraPose(page);
    await page.waitForTimeout(300);
    const settledB = await cameraPose(page);
    expect(rotationBetween(settledA, settledB)).toBeLessThan(0.5); // turntable still waiting
  });
});
