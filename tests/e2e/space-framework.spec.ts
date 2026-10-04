import { canvasCoverage, expect, gotoSpace, test } from './fixtures';

// Spec 001 — Space framework. Console errors fail every test (see fixtures.ts).

test.describe('demo-cube Space (AC-9)', () => {
  test('loads, reports itself ready and renders a non-blank scene', async ({ page }) => {
    await gotoSpace(page, 'demo-cube');

    expect(await page.evaluate(() => window.__WORLD__?.activeId())).toBe('demo-cube');
    // The cube covers ~8 % of the frame at any rotation; background alone would be 0.
    expect(await canvasCoverage(page)).toBeGreaterThan(0.02);
  });
});

test.describe('unknown Space (AC-8)', () => {
  test('shows "Space not found" and renders no Space', async ({ page }) => {
    await page.goto('/#/space/nope');

    await expect(page.locator('body')).toHaveAttribute('data-space-status', 'not-found');
    await expect(page.getByRole('alert')).toContainText('Space not found');
    expect(await page.evaluate(() => window.__WORLD__?.activeId())).toBeNull();
    // Guards canvasCoverage: a cleared canvas must read as (almost) empty.
    expect(await canvasCoverage(page)).toBeLessThan(0.005);
  });
});

test.describe('memory (AC-4)', () => {
  test.use({ reducedMotion: 'reduce' }); // instant swaps keep 10 round trips fast

  test('GPU resources return to baseline after 10 open/close cycles', async ({ page }) => {
    await gotoSpace(page, 'demo-cube');
    await page.evaluate(() => window.__WORLD__!.close());
    const baseline = await page.evaluate(() => window.__WORLD__!.memory());

    for (let i = 0; i < 10; i++) {
      const result = await page.evaluate(() => window.__WORLD__!.open('demo-cube'));
      expect(result).toBe('opened');
      const during = await page.evaluate(() => window.__WORLD__!.memory());
      // Sanity: the Space really uploaded resources, so returning to baseline means something.
      expect(during.geometries).toBeGreaterThan(baseline.geometries);
      expect(during.textures).toBeGreaterThan(baseline.textures);
      await page.evaluate(() => window.__WORLD__!.close());
    }

    expect(await page.evaluate(() => window.__WORLD__!.memory())).toEqual(baseline);
  });
});

test.describe('resize (AC-5)', () => {
  test('canvas follows the viewport and the camera aspect updates', async ({ page }) => {
    await gotoSpace(page, 'demo-cube');

    for (const size of [
      { width: 1000, height: 500 },
      { width: 480, height: 800 },
    ]) {
      await page.setViewportSize(size);
      await expect
        .poll(() => page.evaluate(() => window.__WORLD__?.cameraAspect()))
        .toBeCloseTo(size.width / size.height, 3);
      const canvas = await page.locator('#app canvas').boundingBox();
      expect(canvas?.width).toBe(size.width);
      expect(canvas?.height).toBe(size.height);
    }
  });
});

test.describe('transition (AC-10)', () => {
  test('switching fades out and back in over ~300 ms each way', async ({ page }) => {
    await gotoSpace(page, 'demo-cube');
    const fader = page.locator('.fader');
    await expect(fader).toHaveCSS('transition-duration', '0.3s');

    const { result, ms } = await page.evaluate(async () => {
      const start = performance.now();
      const result = await window.__WORLD__!.open('demo-cube');
      return { result, ms: performance.now() - start };
    });

    expect(result).toBe('opened');
    // Timer-driven: out (300 ms) + in (300 ms) is a hard lower bound.
    expect(ms).toBeGreaterThanOrEqual(590);
    await expect(fader).toHaveAttribute('data-state', 'in');
    await expect(fader).toHaveCSS('opacity', '0');
  });

  test.describe('with prefers-reduced-motion', () => {
    test.use({ reducedMotion: 'reduce' });

    test('switching is instant: no fade transition', async ({ page }) => {
      await gotoSpace(page, 'demo-cube');
      const fader = page.locator('.fader');
      await expect(fader).toHaveCSS('transition-duration', '0s');

      const { result, ms } = await page.evaluate(async () => {
        const start = performance.now();
        const result = await window.__WORLD__!.open('demo-cube');
        return { result, ms: performance.now() - start };
      });

      expect(result).toBe('opened');
      expect(ms).toBeLessThan(590);
    });
  });
});
