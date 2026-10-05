import type { Page } from '@playwright/test';
import { canvasRgba, contentBounds, expect, gotoSpace, meanPixelDifference, test } from './fixtures';

// Spec 011 — asset pipeline: the chair ships compressed (Meshopt + KTX2), decoders are self-hosted and lazy,
// and it looks like the original. Console errors fail every test (fixtures.ts).

const ID = 'sheen-chair';
const GLB = '**/assets/sheen-chair/SheenChair.glb';
const ORIGINAL = 'assets-src/sheen-chair/SheenChair.glb'; // not deployed; served to the page via a route
const body = (page: Page) => page.locator('body');

/** Two animation frames, so the latest camera state has been drawn. */
const nextFrames = (page: Page) =>
  page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

/** Every URL the page requests from now on. */
function recordRequests(page: Page): string[] {
  const urls: string[] = [];
  page.on('request', (request) => urls.push(request.url()));
  return urls;
}

test.describe('compressed chair', () => {
  test.use({ reducedMotion: 'reduce' }); // no turntable: both loads are measured at the same home view

  test('AC-1: the model file is at most 1.5 MB', async ({ page }) => {
    const response = page.waitForResponse((r) => r.url().endsWith('/assets/sheen-chair/SheenChair.glb'));
    await gotoSpace(page, ID);
    const bytes = (await (await response).body()).byteLength;
    expect(bytes).toBeLessThanOrEqual(1.5 * 1024 * 1024);
    expect(bytes).toBeGreaterThan(100 * 1024); // sanity: a real model, not an error page
  });

  test('AC-2, AC-7: looks like the original (brightness within 10 %, pixels within 2.0, same framing) in SwiftShader', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });

    await gotoSpace(page, ID);
    await nextFrames(page);
    const compressed = await contentBounds(page);
    const compressedPixels = await canvasRgba(page);

    // Same view, original uncompressed file.
    await page.route(GLB, (route) => route.fulfill({ path: ORIGINAL, contentType: 'model/gltf-binary' }));
    const originalResponse = page.waitForResponse((r) =>
      r.url().endsWith('/assets/sheen-chair/SheenChair.glb'),
    );
    await page.goto('/');
    await gotoSpace(page, ID);
    // Guard: the comparison is only meaningful if the original really was served.
    expect((await (await originalResponse).body()).byteLength).toBeGreaterThan(3 * 1024 * 1024); // 3.93 MiB original vs 1.26 MiB compressed
    await nextFrames(page);
    const original = await contentBounds(page);
    const originalPixels = await canvasRgba(page);

    for (const [label, bounds] of [
      ['compressed', compressed],
      ['original', original],
    ] as const) {
      expect(bounds.fillOfSmaller, `${label} framing`).toBeGreaterThanOrEqual(0.5);
      expect(bounds.fillOfSmaller, `${label} framing`).toBeLessThanOrEqual(0.9);
      expect(bounds.meanLuminance, `${label} lit`).toBeGreaterThan(40);
    }
    const delta = Math.abs(compressed.meanLuminance - original.meanLuminance) / original.meanLuminance;
    expect(
      delta,
      `brightness compressed ${compressed.meanLuminance.toFixed(1)} vs original ${original.meanLuminance.toFixed(1)}`,
    ).toBeLessThanOrEqual(0.1);
    // Mean brightness alone barely moves even when every texture is lost (3.4 %), so compare pixels too:
    // measured 0.33 for the compressed chair, 5.47 for an untextured one (D-019).
    expect(
      meanPixelDifference(compressedPixels.data, originalPixels.data),
      'mean RGB difference',
    ).toBeLessThanOrEqual(2);
  });
});

test.describe('decoders', () => {
  test('AC-4: opening the chair fetches the KTX2 transcoder from the site itself', async ({
    page,
    baseURL,
  }) => {
    const urls = recordRequests(page);
    await gotoSpace(page, ID);

    const site = new URL(baseURL!).origin;
    expect(urls.some((url) => /basis_transcoder[^/]*\.js$/.test(url))).toBe(true);
    expect(urls.some((url) => /basis_transcoder[^/]*\.wasm$/.test(url))).toBe(true);
    // data: URLs never leave the page; blob: URLs (the transcoder's workers) carry the page's own origin.
    const foreign = urls.filter((url) => !url.startsWith('data:') && new URL(url).origin !== site);
    expect(foreign).toEqual([]);
  });

  test('AC-5: the gallery downloads no decoder; opening the chair does', async ({ page }) => {
    const urls = recordRequests(page);
    await page.goto('/');
    await expect(body(page)).toHaveAttribute('data-space-ready', 'true');
    expect(urls.filter((url) => /basis_transcoder|sheen-chair/.test(url))).toEqual([]);

    await page.evaluate((id) => window.__WORLD__!.navigate(id), ID);
    await expect(body(page)).toHaveAttribute('data-space-id', ID);
    await expect(body(page)).toHaveAttribute('data-space-ready', 'true');
    expect(urls.some((url) => url.includes('basis_transcoder'))).toBe(true);
  });
});

test.describe('download progress', () => {
  /** Slows downloads so the ~1.3 MB model takes a few seconds (route.fulfill would arrive in one go). */
  async function throttle(page: Page, bytesPerSecond = 400 * 1024): Promise<void> {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 0,
      downloadThroughput: bytesPerSecond,
      uploadThroughput: -1,
    });
  }

  /** Records progress values and spoken texts while the chair opens; read with `read()`. */
  async function watchLoading(page: Page) {
    await page.evaluate(() => {
      const log = { values: [] as number[], spoken: [] as string[], announced: [] as string[] };
      (window as unknown as { __loadingLog: typeof log }).__loadingLog = log;
      const app = document.querySelector('#app')!;
      const push = (list: string[], text: string | null | undefined) => {
        if (text && list.at(-1) !== text) list.push(text);
      };
      new MutationObserver(() => {
        const bar = app.querySelector('[role="progressbar"]');
        const value = bar?.getAttribute('aria-valuenow');
        if (value !== null && value !== undefined && log.values.at(-1) !== Number(value)) {
          log.values.push(Number(value));
        }
        push(log.spoken, app.querySelector('.loading-label')?.textContent);
        push(log.announced, app.querySelector('.loading-announcer')?.textContent);
      }).observe(app, { subtree: true, childList: true, attributes: true, characterData: true });
    });
    return {
      read: () =>
        page.evaluate(
          () =>
            (
              window as unknown as {
                __loadingLog: { values: number[]; spoken: string[]; announced: string[] };
              }
            ).__loadingLog,
        ),
    };
  }

  test('AC-8, AC-9, AC-11: a bar and percentage advance, are spoken at 25/50/75 %, then "loaded"', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(body(page)).toHaveAttribute('data-space-ready', 'true');
    const watcher = await watchLoading(page);
    await throttle(page);

    await page.evaluate((id) => window.__WORLD__!.navigate(id), ID);
    const bar = page.getByRole('progressbar', { name: 'Loading Sheen Chair' });
    await expect(bar).toBeVisible();
    await expect(page.locator('.loading-text')).toHaveText(/^Loading Sheen Chair… \d+ %$/);
    // Normal motion: the bar eases (the reduced-motion test below checks it doesn't).
    expect(
      await page.locator('.loading-bar-fill').evaluate((el) => getComputedStyle(el).transitionDuration),
    ).not.toBe('0s');
    await expect(body(page)).toHaveAttribute('data-space-ready', 'true', { timeout: 25_000 });
    await expect(page.locator('.loading')).toHaveCount(0);

    const { values, spoken, announced } = await watcher.read();
    expect(
      values.some((v) => v > 0 && v < 100),
      `values: ${values.join(', ')}`,
    ).toBe(true);
    expect(values, 'never backwards').toEqual([...values].sort((a, b) => a - b));
    expect(spoken[0]).toBe('Loading Sheen Chair…');
    const steps = ['Loading Sheen Chair… 25 %', 'Loading Sheen Chair… 50 %', 'Loading Sheen Chair… 75 %'];
    expect(
      spoken.slice(1).every((text) => steps.includes(text)),
      `spoken: ${spoken.join(' | ')}`,
    ).toBe(true);
    expect(spoken.length, 'at most the three steps after the first').toBeLessThanOrEqual(4);
    expect(announced).toEqual(['Sheen Chair loaded']);
  });

  test.describe('with reduced motion', () => {
    test.use({ reducedMotion: 'reduce' });

    test('AC-10: the value still advances, but nothing eases or pulses', async ({ page }) => {
      await page.goto('/');
      await expect(body(page)).toHaveAttribute('data-space-ready', 'true');
      await throttle(page);
      await page.evaluate((id) => window.__WORLD__!.navigate(id), ID);

      const bar = page.getByRole('progressbar', { name: 'Loading Sheen Chair' });
      await expect(bar).toBeVisible();
      await expect.poll(async () => Number(await bar.getAttribute('aria-valuenow'))).toBeGreaterThan(0);
      const styles = await page.evaluate(() => ({
        fill: getComputedStyle(document.querySelector('.loading-bar-fill')!).transitionDuration,
        pulse: getComputedStyle(document.querySelector('.loading')!).animationName,
      }));
      expect(styles).toEqual({ fill: '0s', pulse: 'none' });
      await expect(body(page)).toHaveAttribute('data-space-ready', 'true', { timeout: 25_000 });
    });
  });
});

test.describe('failure and lifecycle', () => {
  test.describe('when a decoder or the model is broken', () => {
    // The app logs the failure on purpose (AC-12); Chromium logs an aborted request itself.
    test.use({ allowConsoleErrors: [`Space "${ID}" failed to load`, 'Failed to load resource'] });

    /** "Failed to load", nothing of the chair left behind, and the back link still works. */
    async function expectFailedToLoad(page: Page, consoleErrors: string[]): Promise<void> {
      await expect(body(page)).toHaveAttribute('data-space-status', 'load-error');
      await expect(page.getByRole('alert').getByRole('heading')).toHaveText('Failed to load this space');
      await expect(page.locator('.loading, .model-credit, .controls-bar')).toHaveCount(0);
      expect(consoleErrors.some((e) => e.includes(`Space "${ID}" failed to load`))).toBe(true);
      // GLTFLoader's own texture errors would mean it parsed with a broken decoder (it then renders untextured).
      expect(consoleErrors.filter((e) => /GLTFLoader|texture/i.test(e))).toEqual([]);
      await expect.poll(() => page.workers().length).toBe(0);

      await page.getByRole('link', { name: 'Back to gallery' }).click();
      await expect(body(page)).toHaveAttribute('data-view', 'gallery');
      await expect(body(page)).toHaveAttribute('data-space-ready', 'true');
    }

    test('AC-12: a blocked texture transcoder shows "Failed to load", not an untextured chair', async ({
      page,
      consoleErrors,
    }) => {
      await page.route('**/basis_transcoder*', (route) => route.abort('failed'));
      await page.goto(`/#/space/${ID}`);
      await expectFailedToLoad(page, consoleErrors);
    });

    test('AC-12: a corrupt model file shows "Failed to load"', async ({ page, consoleErrors }) => {
      await page.route(GLB, (route) =>
        route.fulfill({ body: Buffer.from('glTF but not really a model'), contentType: 'model/gltf-binary' }),
      );
      await page.goto(`/#/space/${ID}`);
      await expectFailedToLoad(page, consoleErrors);
    });
  });

  test.describe('memory', () => {
    test.use({ reducedMotion: 'reduce' }); // instant swaps keep 10 round trips fast

    test('AC-13: 10 gallery ↔ chair round trips return GPU memory to baseline and leave no workers', async ({
      page,
    }) => {
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
      const workersSeen = new Set<unknown>();
      page.on('worker', (worker) => workersSeen.add(worker));

      // Warm-up visit: three's renderer-lifetime DFG LUT (learnings).
      await gotoSpace(page, ID);
      await toGallery();
      const baseline = await page.evaluate(() => window.__WORLD__!.memory());
      expect(workersSeen.size, 'KTX2 transcoding really used workers').toBeGreaterThan(0);

      for (let i = 0; i < 10; i++) {
        await toChair();
        await toGallery();
      }

      expect(await page.evaluate(() => window.__WORLD__!.memory())).toEqual(baseline);
      await expect.poll(() => page.workers().length, { message: 'transcoder workers terminated' }).toBe(0);
    });
  });
});
