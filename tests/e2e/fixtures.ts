import { test as base, expect, type Page } from '@playwright/test';

/**
 * `test` that fails if the page logs a console error or throws (Constitution quality gate 5).
 * Tests that expect an error can push an allowed substring onto `allowConsoleErrors`.
 */
export const test = base.extend<{ allowConsoleErrors: string[]; consoleErrors: string[] }>({
  allowConsoleErrors: [[], { option: true }],
  consoleErrors: [
    async ({ page, allowConsoleErrors }, use) => {
      const errors: string[] = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') errors.push(msg.text());
      });
      page.on('pageerror', (err) => errors.push(err.message));
      await use(errors);
      const unexpected = errors.filter((e) => !allowConsoleErrors.some((allowed) => e.includes(allowed)));
      expect(unexpected, 'console errors during test').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

/** Opens the app on a Space and waits until it is fully shown (faded in, first frame rendered). */
export async function gotoSpace(page: Page, id: string): Promise<void> {
  await page.goto(`/#/space/${encodeURIComponent(id)}`);
  await expect(page.locator('body')).toHaveAttribute('data-space-id', id);
  await expect(page.locator('body')).toHaveAttribute('data-space-ready', 'true');
}

/**
 * Marks the current document. Returns a check that is true while the same document is still loaded,
 * i.e. no full page reload happened in between (spec 002, AC-2/AC-3).
 */
export async function noReloadMarker(page: Page): Promise<() => Promise<boolean>> {
  await page.evaluate(() => ((window as Window & { __noReload?: boolean }).__noReload = true));
  return () => page.evaluate(() => (window as Window & { __noReload?: boolean }).__noReload === true);
}

/**
 * Fraction (0–1) of the WebGL canvas that differs from the background colour, read from the top-left
 * corner pixel. 0 means blank. Robust to rotation and lighting, unlike counting colours.
 * Needs the test build's preserveDrawingBuffer.
 */
export function canvasCoverage(page: Page): Promise<number> {
  return page.evaluate(() => {
    const source = document.querySelector<HTMLCanvasElement>('#app canvas');
    if (!source) throw new Error('canvas not found');
    const copy = document.createElement('canvas');
    copy.width = source.width;
    copy.height = source.height;
    const ctx = copy.getContext('2d');
    if (!ctx) throw new Error('2d context unavailable');
    ctx.drawImage(source, 0, 0);
    const { data } = ctx.getImageData(0, 0, copy.width, copy.height);
    const [r0 = 0, g0 = 0, b0 = 0] = data;
    let sampled = 0;
    let differing = 0;
    // Sample every 7th pixel: plenty for a coverage estimate and fast in SwiftShader.
    for (let i = 0; i < data.length; i += 4 * 7) {
      sampled++;
      const delta =
        Math.abs((data[i] ?? 0) - r0) + Math.abs((data[i + 1] ?? 0) - g0) + Math.abs((data[i + 2] ?? 0) - b0);
      if (delta > 12) differing++;
    }
    return differing / sampled;
  });
}

/** What `contentBounds` measures: drawing-buffer pixels, plus fill and brightness of the content. */
export type ContentBounds = {
  width: number;
  height: number;
  /** Larger side of the content's bounding box ÷ the canvas's smaller side; 0 when blank (spec 010, AC-2). */
  fillOfSmaller: number;
  /** Mean luminance (0–255) of the content pixels; 0 when blank (spec 010, AC-4). */
  meanLuminance: number;
};

/**
 * Bounding box of everything drawn that differs from the background (the corner pixel), measured on the
 * canvas's drawing buffer. Unlike `canvasCoverage`, it judges framing well for sparse shapes such as a
 * chair. Needs the test build's preserveDrawingBuffer.
 */
export function contentBounds(page: Page): Promise<ContentBounds> {
  return page.evaluate(() => {
    const source = document.querySelector<HTMLCanvasElement>('#app canvas');
    if (!source) throw new Error('canvas not found');
    const copy = document.createElement('canvas');
    copy.width = source.width;
    copy.height = source.height;
    const ctx = copy.getContext('2d');
    if (!ctx) throw new Error('2d context unavailable');
    ctx.drawImage(source, 0, 0);
    const { data, width, height } = ctx.getImageData(0, 0, copy.width, copy.height);
    const [r0 = 0, g0 = 0, b0 = 0] = data;
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    let luminance = 0;
    let count = 0;
    // Every 2nd pixel in each direction: bounds within 2 px, fast enough in SwiftShader.
    for (let y = 0; y < height; y += 2) {
      for (let x = 0; x < width; x += 2) {
        const i = (y * width + x) * 4;
        const r = data[i] ?? 0;
        const g = data[i + 1] ?? 0;
        const b = data[i + 2] ?? 0;
        if (Math.abs(r - r0) + Math.abs(g - g0) + Math.abs(b - b0) <= 12) continue;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
        luminance += 0.2126 * r + 0.7152 * g + 0.0722 * b;
        count++;
      }
    }
    if (count === 0) return { width: 0, height: 0, fillOfSmaller: 0, meanLuminance: 0 };
    const boxWidth = maxX - minX + 1;
    const boxHeight = maxY - minY + 1;
    return {
      width: boxWidth,
      height: boxHeight,
      fillOfSmaller: Math.max(boxWidth, boxHeight) / Math.min(width, height),
      meanLuminance: luminance / count,
    };
  });
}

/**
 * The canvas's drawing buffer as RGBA bytes (spec 011 parity). Sent as base64: a JSON array of a 1280×720
 * buffer is millions of numbers and slow to transfer. Needs the test build's preserveDrawingBuffer.
 */
export async function canvasRgba(page: Page): Promise<{ width: number; height: number; data: Uint8Array }> {
  const { width, height, base64 } = await page.evaluate(() => {
    const source = document.querySelector<HTMLCanvasElement>('#app canvas');
    if (!source) throw new Error('canvas not found');
    const copy = document.createElement('canvas');
    copy.width = source.width;
    copy.height = source.height;
    const ctx = copy.getContext('2d');
    if (!ctx) throw new Error('2d context unavailable');
    ctx.drawImage(source, 0, 0);
    const bytes = ctx.getImageData(0, 0, copy.width, copy.height).data;
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    return { width: copy.width, height: copy.height, base64: btoa(binary) };
  });
  return { width, height, data: new Uint8Array(Buffer.from(base64, 'base64')) };
}

/**
 * Mean absolute RGB difference (0–255) between two same-sized renders, over the pixels where either shows the
 * model (differs from the background corner pixel, as in `contentBounds`). 0 = identical (spec 011, AC-2).
 */
export function meanPixelDifference(a: Uint8Array, b: Uint8Array): number {
  if (a.length !== b.length) throw new Error(`renders differ in size: ${a.length} vs ${b.length} bytes`);
  const [r0 = 0, g0 = 0, b0 = 0] = a;
  const isBackground = (x: Uint8Array, i: number) =>
    Math.abs((x[i] ?? 0) - r0) + Math.abs((x[i + 1] ?? 0) - g0) + Math.abs((x[i + 2] ?? 0) - b0) <= 12;
  let sum = 0;
  let count = 0;
  for (let i = 0; i < a.length; i += 4) {
    if (isBackground(a, i) && isBackground(b, i)) continue;
    for (let c = 0; c < 3; c++) sum += Math.abs((a[i + c] ?? 0) - (b[i + c] ?? 0)) / 3;
    count++;
  }
  return count === 0 ? 0 : sum / count;
}

/** Camera pose from the test hook (spec 004). */
export type CameraPose = { position: number[]; quaternion: number[] };

export async function cameraPose(page: Page): Promise<CameraPose> {
  const pose = await page.evaluate(() => window.__WORLD__?.cameraPose() ?? null);
  if (!pose) throw new Error('no active camera');
  return pose;
}

/** Angle in degrees between two camera orientations. */
export function rotationBetween(a: CameraPose, b: CameraPose): number {
  const dot = Math.abs(a.quaternion.reduce((sum, q, i) => sum + q * (b.quaternion[i] ?? 0), 0));
  return (2 * Math.acos(Math.min(1, dot)) * 180) / Math.PI;
}

export function distanceBetween(a: CameraPose, b: CameraPose): number {
  return Math.hypot(...a.position.map((p, i) => p - (b.position[i] ?? 0)));
}

/** Distance of the camera from the origin (demo-cube's home focus). */
export function radius(pose: CameraPose): number {
  return Math.hypot(...pose.position);
}

type Point = { x: number; y: number };

/**
 * Multi-touch gesture via Chrome DevTools Protocol (Playwright's touchscreen only taps).
 * Each finger moves from its `from` to its `to` point in `steps`. Chromium only.
 */
export async function touchGesture(page: Page, fingers: Array<{ from: Point; to: Point }>, steps = 8) {
  const cdp = await page.context().newCDPSession(page);
  const at = (t: number) =>
    fingers.map(({ from, to }, id) => ({
      x: from.x + (to.x - from.x) * t,
      y: from.y + (to.y - from.y) * t,
      id,
    }));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(0) });
  for (let i = 1; i <= steps; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: at(i / steps) });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}
