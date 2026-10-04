import type { Page } from '@playwright/test';
import { canvasCoverage, expect, test } from './fixtures';

// Spec 003 — gallery page. Console errors fail every test (fixtures.ts).
// The registry has one Space (demo-cube); multi-card layout is checked via grid tracks (AC-10).

const body = (page: Page) => page.locator('body');
const card = (page: Page) => page.getByRole('link', { name: /Demo Cube/ });
const backLink = (page: Page) => page.getByRole('link', { name: 'Back to gallery' });

async function gotoGallery(page: Page) {
  await page.goto('/');
  await expectGallery(page);
}
async function expectGallery(page: Page) {
  await expect(body(page)).toHaveAttribute('data-view', 'gallery');
  await expect(body(page)).toHaveAttribute('data-space-ready', 'true');
}
async function expectSpace(page: Page, id: string) {
  await expect(body(page)).toHaveAttribute('data-space-id', id);
  await expect(body(page)).toHaveAttribute('data-space-ready', 'true');
}

test('AC-1: the home route shows the gallery with one card per registered Space', async ({ page }) => {
  await gotoGallery(page);
  await expect(page.locator('.gallery li')).toHaveCount(1);
  await expect(page.locator('.gallery a.card')).toHaveAttribute('href', '#/space/demo-cube');
});

test('AC-2: a card shows title, description and kind', async ({ page }) => {
  await gotoGallery(page);
  await expect(card(page).getByRole('heading', { level: 2 })).toHaveText('Demo Cube');
  await expect(card(page)).toContainText('proves the Space framework');
  await expect(card(page).locator('.card-kind')).toHaveText('Single object');
});

test('AC-3: without a thumbnail, the preview shows the kind icon and initials', async ({ page }) => {
  await gotoGallery(page);
  const preview = card(page).locator('.card-preview');
  await expect(preview.locator('img')).toHaveCount(0);
  await expect(preview.locator('.card-placeholder svg')).toBeVisible();
  await expect(preview.locator('.card-initials')).toHaveText('DC');
});

test('AC-4: clicking a card opens the Space with one history entry; Back returns', async ({ page }) => {
  await gotoGallery(page);
  const before = await page.evaluate(() => history.length);

  await card(page).click();
  await expectSpace(page, 'demo-cube');
  expect(new URL(page.url()).hash).toBe('#/space/demo-cube');
  expect(await page.evaluate(() => history.length)).toBe(before + 1);

  await page.goBack();
  await expectGallery(page);
});

test('AC-4: the keyboard opens a card with Enter', async ({ page }) => {
  await gotoGallery(page);
  await page.keyboard.press('Tab');
  await expect(card(page)).toBeFocused();
  await page.keyboard.press('Enter');
  await expectSpace(page, 'demo-cube');
});

test('AC-5: the gallery downloads no Space code until a card is opened', async ({ page }) => {
  const spaceChunks: string[] = [];
  page.on('request', (r) => {
    if (/\/assets\/demo-cube-[\w-]+\.js$/.test(r.url())) spaceChunks.push(r.url());
  });

  await gotoGallery(page);
  await page.waitForLoadState('networkidle');
  expect(spaceChunks).toEqual([]);

  await card(page).click();
  await expectSpace(page, 'demo-cube');
  expect(spaceChunks).toHaveLength(1);
});

test.describe('memory (AC-6)', () => {
  test.use({ reducedMotion: 'reduce' }); // instant swaps keep 10 round trips fast

  test('10 gallery → Space → gallery round trips return GPU memory to the gallery baseline', async ({
    page,
  }) => {
    await gotoGallery(page);
    expect(await page.evaluate(() => window.__WORLD__!.activeId())).toBeNull();

    // Warm-up trip: the first PBR material makes three.js create its shared DFG LUT texture,
    // which the renderer keeps for its lifetime (not a leak). Take the baseline after it.
    await page.evaluate(() => window.__WORLD__!.navigate('demo-cube'));
    await expectSpace(page, 'demo-cube');
    await page.evaluate(() => (window.location.hash = '#/'));
    await expectGallery(page);
    const baseline = await page.evaluate(() => window.__WORLD__!.memory());

    for (let i = 0; i < 10; i++) {
      await page.evaluate(() => window.__WORLD__!.navigate('demo-cube'));
      await expectSpace(page, 'demo-cube');
      const during = await page.evaluate(() => window.__WORLD__!.memory());
      // The cube has a texture, the starfield none: proves the Space really loaded.
      expect(during.textures).toBeGreaterThan(baseline.textures);

      await page.evaluate(() => (window.location.hash = '#/'));
      await expectGallery(page);
    }

    expect(await page.evaluate(() => window.__WORLD__!.memory())).toEqual(baseline);
  });
});

test('AC-7: "Back to gallery" is hidden on the gallery, shown on Space screens, and works by keyboard', async ({
  page,
}) => {
  await gotoGallery(page);
  await expect(backLink(page)).toBeHidden();

  await card(page).click();
  await expectSpace(page, 'demo-cube');
  await expect(backLink(page)).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(backLink(page)).toBeFocused();
  await page.keyboard.press('Enter');
  await expectGallery(page);

  await page.goto('/#/space/nope');
  await expect(page.getByRole('alert')).toContainText('Space not found');
  await expect(backLink(page)).toBeVisible();
  await backLink(page).click();
  await expectGallery(page);
});

test('AC-8: the gallery title is "3D World"; Spaces keep their own', async ({ page }) => {
  await gotoGallery(page);
  await expect(page).toHaveTitle('3D World');
  await card(page).click();
  await expect(page).toHaveTitle('Demo Cube — 3D World');
});

test('AC-9: heading, list, named links, visible focus, sensible tab order', async ({ page }) => {
  await gotoGallery(page);
  await expect(page.getByRole('heading', { level: 1, name: '3D World' })).toBeVisible();
  const list = page.getByRole('list');
  await expect(list).toHaveCount(1);
  await expect(list.getByRole('listitem')).toHaveCount(1);
  await expect(list.getByRole('listitem').getByRole('link', { name: /Demo Cube/ })).toHaveCount(1);

  await page.keyboard.press('Tab');
  await expect(card(page)).toBeFocused();
  const outline = await card(page).evaluate((el) => parseFloat(getComputedStyle(el).outlineWidth));
  expect(outline).toBeGreaterThan(0);
});

test.describe('layout (AC-10)', () => {
  const gridTracks = (page: Page) =>
    page
      .locator('.gallery-grid')
      .evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').filter(Boolean).length);

  test('one column with no horizontal scroll at 360 px', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await gotoGallery(page);
    expect(await gridTracks(page)).toBe(1);
    const overflow = await page.evaluate(() => {
      const gallery = document.querySelector('.gallery');
      return {
        page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        gallery: gallery ? gallery.scrollWidth - gallery.clientWidth : 0,
      };
    });
    expect(overflow).toEqual({ page: 0, gallery: 0 });
  });

  test('a multi-column grid at 1280 px', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await gotoGallery(page);
    expect(await gridTracks(page)).toBeGreaterThan(1);
  });

  test('card text meets WCAG AA contrast (≥ 4.5:1) against the card surface', async ({ page }) => {
    await gotoGallery(page);
    const ratios = await card(page).evaluate((el) => {
      const rgb = (css: string) => (css.match(/\d+(\.\d+)?/g) ?? []).slice(0, 3).map(Number);
      const luminance = (css: string) => {
        const [r = 0, g = 0, b = 0] = rgb(css).map((v) => {
          const c = v / 255;
          return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };
      const background = luminance(getComputedStyle(el).backgroundColor);
      return ['h2', 'p', '.card-kind'].map((selector) => {
        const node = el.querySelector(selector);
        const fg = luminance(node ? getComputedStyle(node).color : '');
        const [hi, lo] = fg > background ? [fg, background] : [background, fg];
        return { selector, ratio: (hi + 0.05) / (lo + 0.05) };
      });
    });
    for (const { selector, ratio } of ratios) {
      expect(ratio, `${selector} contrast`).toBeGreaterThanOrEqual(4.5);
    }
  });
});

test.describe('transitions (AC-11)', () => {
  test('the fader sits above the view DOM, and the back link above the fader', async ({ page }) => {
    await gotoGallery(page);
    const z = await page.evaluate(() => {
      const zOf = (selector: string) => {
        const el = document.querySelector(selector);
        return el ? Number(getComputedStyle(el).zIndex) : NaN;
      };
      return { overlay: zOf('.overlay'), fader: zOf('.fader'), back: zOf('.back-to-gallery') };
    });
    expect(z.fader).toBeGreaterThan(z.overlay);
    expect(z.back).toBeGreaterThan(z.fader);
  });

  test('the gallery is only removed once the fader fully covers it, in both directions', async ({ page }) => {
    await gotoGallery(page);
    // Record the fader state at the moment the gallery DOM leaves or enters the overlay.
    await page.evaluate(() => {
      const w = window as Window & { __faderAtSwap?: string[] };
      w.__faderAtSwap = [];
      const fader = document.querySelector<HTMLElement>('.fader');
      const overlay = document.querySelector('.overlay');
      if (!fader || !overlay) throw new Error('fader/overlay missing');
      new MutationObserver((records) => {
        for (const r of records) {
          const touched = [...r.addedNodes, ...r.removedNodes].some(
            (n) => n instanceof HTMLElement && n.classList.contains('gallery'),
          );
          if (touched) w.__faderAtSwap?.push(`${fader.dataset.state}:${fader.style.opacity}`);
        }
      }).observe(overlay, { childList: true });
    });

    await card(page).click();
    await expectSpace(page, 'demo-cube');
    await page.evaluate(() => (window.location.hash = '#/'));
    await expectGallery(page);

    const swaps = await page.evaluate(() => (window as Window & { __faderAtSwap?: string[] }).__faderAtSwap);
    expect(swaps).toEqual(['out:1', 'out:1']); // removed under cover; re-added under cover
  });
});

test.describe('starfield backdrop (AC-13)', () => {
  const frame = (page: Page) =>
    page.evaluate(() => document.querySelector<HTMLCanvasElement>('#app canvas')?.toDataURL() ?? '');

  test('draws stars behind the gallery, and they drift', async ({ page }) => {
    await gotoGallery(page);
    // Sparse stars cover ~0.15 % of the frame; a blank canvas reads 0.
    expect(await canvasCoverage(page)).toBeGreaterThan(0.0005);
    const first = await frame(page);
    await page.waitForTimeout(500); // intentional: comparing frames across time
    expect(await frame(page)).not.toBe(first);
  });

  test.describe('with prefers-reduced-motion', () => {
    test.use({ reducedMotion: 'reduce' });

    test('the starfield is still: frames 500 ms apart are identical', async ({ page }) => {
      await gotoGallery(page);
      expect(await canvasCoverage(page)).toBeGreaterThan(0.0005);
      const first = await frame(page);
      await page.waitForTimeout(500); // intentional: comparing frames across time
      expect(await frame(page)).toBe(first);
    });
  });
});
