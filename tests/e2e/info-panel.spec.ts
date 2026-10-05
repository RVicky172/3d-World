import type { Locator, Page } from '@playwright/test';
import {
  cameraPose,
  contentBounds,
  distanceBetween,
  expect,
  gotoSpace,
  rotationBetween,
  test,
} from './fixtures';

// Spec 012 — the info panel: the Space's title and description inside the view (AC-1–AC-4, AC-14).
// Reduced motion throughout: no turntable or fades, so poses only change from input.

const CHAIR = 'sheen-chair';
const panel = (page: Page) => page.locator('section.info-panel');
const toggle = (page: Page) => page.locator('button.info-toggle');
const region = (page: Page, title: string) => page.getByRole('region', { name: title });

/** The gallery card's title and description: the panel must show the same strings (AC-1). */
async function cardText(page: Page, title: string) {
  await page.goto('/');
  await expect(page.locator('body')).toHaveAttribute('data-view', 'gallery');
  const card = page.getByRole('link', { name: new RegExp(title) });
  return {
    title: (await card.getByRole('heading', { level: 2 }).textContent())?.trim() ?? '',
    description: (await card.locator('p').first().textContent())?.trim() ?? '',
  };
}

/** Lets queued frames run, then reads the pose. */
const settledPose = async (page: Page) => {
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  return cameraPose(page);
};

const area = async (locator: Locator) => {
  const box = await locator.boundingBox();
  if (!box) throw new Error('not laid out');
  return box;
};
const overlaps = (a: { x: number; y: number; width: number; height: number }, b: typeof a) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

test.use({ reducedMotion: 'reduce' });

test.describe('AC-1: title and description from the gallery card, open first, then remembered', () => {
  test('shows the card’s strings; open on a first visit', async ({ page }) => {
    const card = await cardText(page, 'Sheen Chair');
    await gotoSpace(page, CHAIR);
    await expect(region(page, card.title).getByRole('heading', { level: 2 })).toHaveText(card.title);
    await expect(panel(page).locator('p')).toHaveText(card.description);
    await expect(toggle(page)).toHaveAttribute('aria-expanded', 'true');
    await expect(panel(page)).toBeVisible();
  });

  test('a collapse survives a reload and other Spaces; a fresh visitor sees it open', async ({
    page,
    browser,
  }) => {
    await gotoSpace(page, CHAIR);
    await toggle(page).click();
    await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false');

    await page.reload();
    await expect(page.locator('body')).toHaveAttribute('data-space-ready', 'true');
    await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false');
    await expect(panel(page)).toBeHidden();
    await gotoSpace(page, 'demo-cube'); // remembered across Spaces too
    await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false');

    const context = await browser.newContext({ reducedMotion: 'reduce' });
    const fresh = await context.newPage();
    await gotoSpace(fresh, CHAIR);
    await expect(fresh.locator('button.info-toggle')).toHaveAttribute('aria-expanded', 'true');
    await context.close();
  });
});

test.describe('AC-2: a labelled toggle for mouse, keyboard and touch', () => {
  test('mouse: the toggle reports its state and keeps its name in step', async ({ page }) => {
    await gotoSpace(page, CHAIR);
    await expect(toggle(page)).toHaveAccessibleName('Hide info');
    await toggle(page).click();
    await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false');
    await expect(toggle(page)).toHaveAccessibleName('About Sheen Chair');
    await expect(panel(page)).toBeHidden();
    await toggle(page).click();
    await expect(toggle(page)).toHaveAttribute('aria-expanded', 'true');
    await expect(panel(page)).toBeVisible();
  });

  test('keyboard: Enter and Space toggle it, and focus stays on the toggle', async ({ page }) => {
    await gotoSpace(page, CHAIR);
    await toggle(page).focus();
    await page.keyboard.press('Enter');
    await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false');
    await expect(toggle(page)).toBeFocused();
    await page.keyboard.press('Space');
    await expect(toggle(page)).toHaveAttribute('aria-expanded', 'true');
    await expect(toggle(page)).toBeFocused();
  });

  test('touch: a tap toggles it', async ({ browser }) => {
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
    await toggle(page).tap();
    await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false');
    await toggle(page).tap();
    await expect(toggle(page)).toHaveAttribute('aria-expanded', 'true');
    expect(errors).toEqual([]);
    await context.close();
  });
});

test.describe('AC-3: never in the way', () => {
  test('dragging and scrolling on the panel leave the camera alone', async ({ page }) => {
    await gotoSpace(page, CHAIR);
    const start = await settledPose(page);
    const box = await area(panel(page));
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x - 300, box.y + 200, { steps: 6 });
    await page.mouse.up();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, -400);
    const after = await settledPose(page);
    expect(rotationBetween(start, after)).toBeLessThan(0.01);
    expect(distanceBetween(start, after)).toBeLessThan(1e-4);
  });

  for (const [width, height] of [
    [320, 640],
    [375, 667],
  ] as const) {
    test(`at ${width}×${height}: a bottom sheet of ≤ 35 % that leaves the hint clear`, async ({
      page,
    }, info) => {
      await page.setViewportSize({ width, height });
      await gotoSpace(page, CHAIR);
      const sheet = await area(page.locator('.info'));
      expect((sheet.width * sheet.height) / (width * height)).toBeLessThanOrEqual(0.35);
      expect(sheet.y + sheet.height).toBeGreaterThan(height / 2); // it's at the bottom, not the side
      const hint = await area(page.locator('.controls-hint'));
      expect(overlaps(sheet, hint)).toBe(false);
      for (const other of ['.controls-bar', '.model-credit']) {
        expect(overlaps(sheet, await area(page.locator(other))), other).toBe(false);
      }
      await page.screenshot({ path: info.outputPath(`info-panel-${width}x${height}.png`) });
    });
  }

  test('collapsed at 320×640, the model is framed as in 010 (50–90 %)', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await gotoSpace(page, CHAIR);
    await toggle(page).click();
    await expect(panel(page)).toBeHidden();
    const { fillOfSmaller } = await contentBounds(page);
    expect(fillOfSmaller).toBeGreaterThanOrEqual(0.5);
    expect(fillOfSmaller).toBeLessThanOrEqual(0.9);
  });
});

test.describe('AC-4: a named region in the Tab order', () => {
  test('the region is named by the Space’s title', async ({ page }) => {
    await gotoSpace(page, CHAIR);
    await expect(region(page, 'Sheen Chair')).toBeVisible();
  });

  test('Tab: back link → 3D view → panel toggle → hotspots → "?" → "Reset view"', async ({ page }) => {
    await gotoSpace(page, CHAIR);
    const names: string[] = [];
    for (let i = 0; i < 7; i++) {
      await page.keyboard.press('Tab');
      names.push(
        await page.evaluate(() => {
          const el = document.activeElement as HTMLElement | null;
          if (el?.tagName === 'CANVAS') return '3D view';
          return el?.getAttribute('aria-label') ?? el?.textContent?.trim() ?? '';
        }),
      );
    }
    // At the home view the back frame and the label face away, so their markers are dimmed and skipped (AC-7).
    expect(names).toEqual([
      '← Back to gallery',
      '3D view',
      'Hide info',
      'Hotspot: Velvet upholstery',
      'Hotspot: Wooden legs',
      'Camera controls help',
      'Reset view',
    ]);
  });
});

test('AC-14: a Space without hotspots shows the panel and no markers', async ({ page }) => {
  await gotoSpace(page, 'demo-cube');
  await expect(region(page, 'Demo Cube')).toBeVisible();
  await expect(page.locator('.hotspot')).toHaveCount(0);
  await expect(page.locator('.hotspots')).toHaveCount(0);
});
