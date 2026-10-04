import type { Page } from '@playwright/test';
import { expect, gotoSpace, noReloadMarker, test } from './fixtures';

// Spec 002 — hash router & deep links. Console errors fail every test (fixtures.ts).
// Only demo-cube is registered, so "another Space" is `nope` (renders "Space not found").

const body = (page: Page) => page.locator('body');

/** Waits for a hash-driven open to finish with the given outcome. */
async function expectShowing(page: Page, id: string) {
  await expect(body(page)).toHaveAttribute('data-space-id', id);
  await expect(body(page)).toHaveAttribute('data-space-ready', 'true');
}
async function expectNotFound(page: Page) {
  await expect(body(page)).toHaveAttribute('data-space-status', 'not-found');
  await expect(page.getByRole('alert')).toContainText('Space not found');
}

const setHash = (page: Page, hash: string) => page.evaluate((h) => (window.location.hash = h), hash);

/**
 * Records whether the SpaceManager started an open (it removes data-space-ready synchronously when it does).
 * `settled()` waits for queued hashchange handlers, then reports.
 */
async function watchForReopen(page: Page) {
  await page.evaluate(() => {
    const w = window as Window & { __reopened?: boolean };
    w.__reopened = false;
    new MutationObserver(() => {
      if (!document.body.hasAttribute('data-space-ready')) w.__reopened = true;
    }).observe(document.body, { attributes: true, attributeFilter: ['data-space-ready'] });
  });
  return async () => {
    await page.evaluate(() => new Promise((resolve) => setTimeout(() => requestAnimationFrame(resolve), 50)));
    return page.evaluate(() => (window as Window & { __reopened?: boolean }).__reopened === true);
  };
}

test('AC-1: a deep link opens that Space', async ({ page }) => {
  await page.goto('/#/space/demo-cube');
  await expectShowing(page, 'demo-cube');
  await expect(body(page)).toHaveAttribute('data-space-status', 'opened');
});

test('AC-2: changing the hash switches Space without reloading the page', async ({ page }) => {
  await gotoSpace(page, 'demo-cube');
  const sameDocument = await noReloadMarker(page);

  await setHash(page, '#/space/nope');
  await expectNotFound(page);
  await setHash(page, '#/space/demo-cube');
  await expectShowing(page, 'demo-cube');

  expect(await sameDocument()).toBe(true);
});

test('AC-3: Back and Forward move between visited Spaces without reloading', async ({ page }) => {
  await gotoSpace(page, 'demo-cube');
  const sameDocument = await noReloadMarker(page);
  await setHash(page, '#/space/nope');
  await expectNotFound(page);

  await page.goBack();
  await expectShowing(page, 'demo-cube');
  expect(page.url()).toMatch(/#\/space\/demo-cube$/);

  await page.goForward();
  await expectNotFound(page);
  expect(page.url()).toMatch(/#\/space\/nope$/);

  expect(await sameDocument()).toBe(true);
});

test('AC-4: an unregistered id shows "Space not found"', async ({ page }) => {
  await page.goto('/#/space/nope');
  await expectNotFound(page);
});

test('AC-5: the home route shows the default Space and keeps its address', async ({ page }) => {
  await page.goto('/');
  await expectShowing(page, 'demo-cube');
  expect(new URL(page.url()).hash).toBe('');

  await page.goto('/#/');
  await expectShowing(page, 'demo-cube');
  expect(new URL(page.url()).hash).toBe('#/');
});

test('AC-5: moving between home and the default Space’s own route does not re-open it', async ({ page }) => {
  await page.goto('/#/');
  await expectShowing(page, 'demo-cube');
  const reopened = await watchForReopen(page);

  await setHash(page, '#/space/demo-cube');
  await setHash(page, '#/');

  expect(await reopened()).toBe(false);
  await expectShowing(page, 'demo-cube');
});

test('AC-6: an unknown route redirects home and Back skips it', async ({ page }) => {
  await gotoSpace(page, 'demo-cube');

  await setHash(page, '#/foo');
  await expect(page).toHaveURL(/#\/$/);
  await expectShowing(page, 'demo-cube');

  await page.goBack();
  await expect(page).toHaveURL(/#\/space\/demo-cube$/);
});

test('AC-6: a page loaded on an unknown route lands on home', async ({ page }) => {
  await page.goto('/#/space/a/b');
  await expect(page).toHaveURL(/#\/$/);
  await expectShowing(page, 'demo-cube');
});

test('AC-8: navigating from code adds one history entry; re-navigating is a no-op', async ({ page }) => {
  await page.goto('/#/space/nope');
  await expectNotFound(page);
  const historyLength = () => page.evaluate(() => window.history.length);
  const before = await historyLength();

  await page.evaluate(() => window.__WORLD__!.navigate('demo-cube'));
  await expectShowing(page, 'demo-cube');
  expect(await historyLength()).toBe(before + 1);

  const reopened = await watchForReopen(page);
  await page.evaluate(() => window.__WORLD__!.navigate('demo-cube'));
  expect(await reopened()).toBe(false);
  expect(await historyLength()).toBe(before + 1);
});

test('AC-9: the page title names the Space that is showing', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Demo Cube — 3D World');

  await setHash(page, '#/space/nope');
  await expectNotFound(page);
  await expect(page).toHaveTitle('3D World');

  await setHash(page, '#/space/demo-cube');
  await expect(page).toHaveTitle('Demo Cube — 3D World');
});

test('AC-10: rapid hash changes end on the last one', async ({ page }) => {
  await page.goto('/#/space/nope');
  await expectNotFound(page);

  // Spaced by 20 ms so each change is handled separately while fades are still running.
  // (Synchronous assignments would coalesce: every handler would read the final hash.)
  await page.evaluate(async () => {
    for (const id of ['demo-cube', 'nope', 'demo-cube', 'nope', 'demo-cube']) {
      window.location.hash = `#/space/${id}`;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  });

  await expectShowing(page, 'demo-cube');
  await expect(body(page)).toHaveAttribute('data-space-status', 'opened');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page).toHaveTitle('Demo Cube — 3D World');
});

test('AC-12: the old ?space= parameter is ignored', async ({ page }) => {
  await page.goto('/?space=nope');
  await expectShowing(page, 'demo-cube');
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('watchForReopen detects a real re-open (guards the AC-5/AC-8 negative checks)', async ({ page }) => {
  await gotoSpace(page, 'demo-cube');
  const reopened = await watchForReopen(page);
  await page.evaluate(() => window.__WORLD__!.open('demo-cube'));
  expect(await reopened()).toBe(true);
});
