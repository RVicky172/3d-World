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
  await page.goto(`/?space=${encodeURIComponent(id)}`);
  await expect(page.locator('body')).toHaveAttribute('data-space-id', id);
  await expect(page.locator('body')).toHaveAttribute('data-space-ready', 'true');
}

/** Number of distinct colours in the WebGL canvas (needs the test build's preserveDrawingBuffer). */
export function distinctCanvasColours(page: Page): Promise<number> {
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
    const colours = new Set<number>();
    // Sample every 7th pixel: plenty to tell "blank" from "scene" and fast in SwiftShader.
    for (let i = 0; i < data.length; i += 4 * 7) {
      colours.add(((data[i] ?? 0) << 16) | ((data[i + 1] ?? 0) << 8) | (data[i + 2] ?? 0));
    }
    return colours.size;
  });
}
