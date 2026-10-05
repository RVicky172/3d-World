import type { Page } from '@playwright/test';
import {
  cameraPose,
  canvasCoverage,
  expect,
  gotoSpace,
  noReloadMarker,
  rotationBetween,
  test,
} from './fixtures';

/** Every `webgl2` context request returns null, as on a browser or GPU without WebGL2. */
async function withoutWebGL2(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      type: string,
      ...rest: unknown[]
    ) {
      if (type === 'webgl2') return null;
      return (original as (...args: unknown[]) => unknown).call(this, type, ...rest);
    } as typeof original;
  });
}

/** The capability probe (first `webgl2` request) succeeds; every later one fails, so the renderer cannot start. */
async function withFailingRenderer(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    let webgl2Requests = 0;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      type: string,
      ...rest: unknown[]
    ) {
      if (type === 'webgl2' && ++webgl2Requests > 1) return null;
      return (original as (...args: unknown[]) => unknown).call(this, type, ...rest);
    } as typeof original;
  });
}

async function expectFallback(page: Page): Promise<void> {
  await expect(page.locator('body')).toHaveAttribute('data-webgl', 'unavailable');
  await expect(page.getByRole('alert')).toContainText('WebGL2 is not available');
  await expect(page.locator('canvas')).toHaveCount(0);
}

test.describe('boot fallback (spec 005)', () => {
  for (const route of ['/', '/#/space/demo-cube', '/#/nope']) {
    test(`without WebGL2, ${route} shows the fallback and no canvas (AC-1, AC-3)`, async ({ page }) => {
      await withoutWebGL2(page);
      await page.goto(route);
      await expectFallback(page);
    });
  }

  test.describe('when the renderer cannot be created', () => {
    // three.js logs the cause itself before throwing; anything uncaught would still fail the test.
    test.use({ allowConsoleErrors: ['Error creating WebGL context'] });

    test('the fallback is shown instead of a blank page (AC-2, AC-3)', async ({ page }) => {
      await withFailingRenderer(page);
      await page.goto('/#/space/demo-cube');
      await expectFallback(page);
    });
  });

  test('the fallback is an accessible, readable alert (AC-4)', async ({ page }) => {
    await withoutWebGL2(page);
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto('/');
    await expectFallback(page);

    const alert = page.getByRole('alert');
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(alert.locator('h1')).toBeVisible();

    const ratios = await alert.evaluate((el) => {
      const rgb = (css: string) => (css.match(/\d+(\.\d+)?/g) ?? []).slice(0, 3).map(Number);
      const luminance = (css: string) => {
        const [r = 0, g = 0, b = 0] = rgb(css).map((v) => {
          const c = v / 255;
          return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };
      // The fallback has no background of its own; it sits on the page background.
      const background = luminance(getComputedStyle(document.body).backgroundColor);
      return ['h1', 'p'].map((selector) => {
        const node = el.querySelector(selector);
        const fg = luminance(node ? getComputedStyle(node).color : '');
        const [hi, lo] = fg > background ? [fg, background] : [background, fg];
        return { selector, ratio: (hi + 0.05) / (lo + 0.05) };
      });
    });
    for (const { selector, ratio } of ratios) {
      expect(ratio, `${selector} contrast`).toBeGreaterThanOrEqual(4.5);
    }

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, 'horizontal scroll at 320 px').toBeLessThanOrEqual(0);
  });
});

test.describe('without JavaScript (spec 005, AC-5)', () => {
  test.use({ javaScriptEnabled: false });

  test('a message explains that the site needs JavaScript', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('JavaScript is turned off');
    // getByText() ignores <noscript> content, so locate the paragraph by CSS.
    const text = page.locator('.fallback p');
    await expect(text).toBeVisible();
    await expect(text).toContainText('needs JavaScript and WebGL2');
  });
});

test.describe('reduced motion changed while the page is open (spec 005, AC-10, AC-11)', () => {
  test.use({ reducedMotion: 'no-preference' });

  test('CSS motion follows at once; JS motion from the next view opened; no reload', async ({ page }) => {
    const body = page.locator('body');
    await gotoSpace(page, 'demo-cube');
    const sameDocument = await noReloadMarker(page);

    // Baseline: without the preference the turntable orbits.
    const before = await cameraPose(page);
    await page.waitForTimeout(600); // intentional: the turntable is time-based
    expect(rotationBetween(before, await cameraPose(page))).toBeGreaterThan(1);

    await page.getByRole('link', { name: /back to gallery/i }).click();
    await expect(body).toHaveAttribute('data-view', 'gallery');
    await expect(body).toHaveAttribute('data-space-ready', 'true');
    const card = page.locator('.card').first();
    await expect(card).not.toHaveCSS('transition-duration', '0s');

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(card).toHaveCSS('transition-duration', '0s'); // CSS rule, no navigation needed

    await card.click();
    await expect(body).toHaveAttribute('data-space-id', 'demo-cube');
    await expect(body).toHaveAttribute('data-space-ready', 'true');
    await expect(page.locator('.fader')).toHaveCSS('transition-duration', '0s');

    const opened = await cameraPose(page);
    await page.waitForTimeout(600); // intentional: comparing poses across time
    expect(rotationBetween(opened, await cameraPose(page)), 'turntable off').toBeLessThan(0.5);

    expect(await sameDocument()).toBe(true);
  });
});

test.describe('with prefers-reduced-motion: every automatic motion is off (spec 005, AC-9)', () => {
  test.use({ reducedMotion: 'reduce' });

  /** The canvas as a data URL; identical strings mean an identical frame. */
  const frame = (page: Page) =>
    page.evaluate(() => document.querySelector<HTMLCanvasElement>('#app canvas')?.toDataURL() ?? '');
  /** Two animation frames, so queued renders have landed. */
  const nextFrames = (page: Page) =>
    page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

  test('gallery and Space hold still; transitions are instant', async ({ page }) => {
    const body = page.locator('body');
    await page.goto('/');
    await expect(body).toHaveAttribute('data-view', 'gallery');
    await expect(body).toHaveAttribute('data-space-ready', 'true');

    // Gallery: card hover transition off, starfield still.
    const card = page.locator('.card').first();
    await expect(card).toHaveCSS('transition-duration', '0s');
    const first = await frame(page);
    await page.waitForTimeout(500); // intentional: comparing frames across time
    expect(await frame(page), 'starfield still').toBe(first);

    // Space: instant fade, no hint animation, no turntable.
    await card.click();
    await expect(body).toHaveAttribute('data-space-id', 'demo-cube');
    await expect(body).toHaveAttribute('data-space-ready', 'true');
    await expect(page.locator('.fader')).toHaveCSS('transition-duration', '0s');
    await expect(page.locator('.controls-hint')).toHaveCSS('animation-name', 'none');
    const opened = await cameraPose(page);
    await page.waitForTimeout(600); // intentional: comparing poses across time
    expect(rotationBetween(opened, await cameraPose(page)), 'turntable off').toBeLessThan(0.5);

    // No damping: a released drag stops dead instead of easing on.
    const size = page.viewportSize() ?? { width: 1280, height: 720 };
    await page.mouse.move(size.width / 2, size.height / 2);
    await page.mouse.down();
    await page.mouse.move(size.width / 2 + 200, size.height / 2, { steps: 6 });
    await page.mouse.up();
    await nextFrames(page);
    const released = await cameraPose(page);
    expect(rotationBetween(opened, released), 'the drag moved the camera').toBeGreaterThan(5);
    await page.waitForTimeout(300); // intentional: damping would keep easing here
    expect(rotationBetween(released, await cameraPose(page)), 'no easing after release').toBeLessThan(0.5);
  });
});

test.describe('WebGL context lost mid-session (spec 005, AC-6–AC-8, AC-12)', () => {
  /** Forces a loss and waits for the app's signal; the message must appear within one second (AC-6). */
  async function loseContext(page: Page): Promise<void> {
    await page.evaluate(() => window.__WORLD__!.loseContext());
    await expect(page.locator('body')).toHaveAttribute('data-webgl', 'lost', { timeout: 1000 });
  }

  /** Must run in a later task than the loss event (see learnings), which waiting on the signal ensures. */
  async function restoreContext(page: Page): Promise<void> {
    await page.evaluate(() => window.__WORLD__!.restoreContext());
  }

  async function expectReady(page: Page, view: 'gallery' | 'space'): Promise<void> {
    const body = page.locator('body');
    await expect(body).toHaveAttribute('data-view', view);
    await expect(body).toHaveAttribute('data-space-ready', 'true');
    await expect(body).not.toHaveAttribute('data-webgl', /.*/);
    await expect(page.locator('.context-lost')).toHaveCount(0);
  }

  for (const [label, route, view] of [
    ['the gallery', '/', 'gallery'],
    ['a Space', '/#/space/demo-cube', 'space'],
  ] as const) {
    test(`on ${label}: a message with a Reload button, then the same view comes back on restore`, async ({
      page,
    }) => {
      await page.goto(route);
      await expectReady(page, view);
      const sameDocument = await noReloadMarker(page);

      await loseContext(page);
      const panel = page.locator('.context-lost');
      await expect(panel).toBeVisible();
      await expect(panel).toHaveAttribute('role', 'alert');
      await expect(panel.getByRole('heading')).toHaveText('The 3D view stopped');
      const reload = panel.getByRole('button', { name: 'Reload' });
      await reload.focus();
      await expect(reload).toBeFocused();
      await expect(page.locator('body')).not.toHaveAttribute('data-space-ready', /.*/);

      await restoreContext(page);
      await expectReady(page, view);
      expect(new URL(page.url()).hash).toBe(new URL(route, 'http://x').hash);
      expect(await canvasCoverage(page)).toBeGreaterThan(0.0005);
      expect(await sameDocument()).toBe(true);
    });
  }

  test('Reload reloads the page into a working view', async ({ page }) => {
    await gotoSpace(page, 'demo-cube');
    const sameDocument = await noReloadMarker(page);
    await loseContext(page);

    await page.locator('.context-lost').getByRole('button', { name: 'Reload' }).click();
    await page.waitForLoadState('load');

    await expect(page.locator('body')).toHaveAttribute('data-space-id', 'demo-cube');
    await expectReady(page, 'space');
    expect(await sameDocument()).toBe(false);
  });

  test.describe('memory', () => {
    test.use({ reducedMotion: 'reduce' }); // instant swaps keep 10 round trips fast

    test('after lose → restore, 10 gallery ↔ Space round trips return to the post-restore baseline', async ({
      page,
    }) => {
      await gotoSpace(page, 'demo-cube');
      await loseContext(page);
      await restoreContext(page);
      await expectReady(page, 'space');

      // Warm-up trip after the restore: three.js re-creates its shared DFG LUT on the new context.
      await page.evaluate(() => (window.location.hash = '#/'));
      await expectReady(page, 'gallery');
      const baseline = await page.evaluate(() => window.__WORLD__!.memory());

      for (let i = 0; i < 10; i++) {
        await page.evaluate(() => window.__WORLD__!.navigate('demo-cube'));
        await expect(page.locator('body')).toHaveAttribute('data-space-id', 'demo-cube');
        await expectReady(page, 'space');
        await page.evaluate(() => (window.location.hash = '#/'));
        await expectReady(page, 'gallery');
      }

      expect(await page.evaluate(() => window.__WORLD__!.memory())).toEqual(baseline);
    });
  });
});
