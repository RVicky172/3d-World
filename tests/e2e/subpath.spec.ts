import { canvasCoverage, expect, test } from './fixtures';

// Spec 002, AC-11 — runs only in the `subpath` project, against a build served from /3d-World/.
// Navigate with relative URLs ('#/…', './…'): a leading '/' would drop the base path.

test('a deep link opens the Space when the site lives under a sub-path', async ({ page }) => {
  const chunkRequests: string[] = [];
  page.on('request', (request) => {
    if (/demo-cube-[\w-]+\.js$/.test(request.url())) chunkRequests.push(new URL(request.url()).pathname);
  });

  await page.goto('#/space/demo-cube');

  await expect(page.locator('body')).toHaveAttribute('data-space-id', 'demo-cube');
  await expect(page.locator('body')).toHaveAttribute('data-space-ready', 'true');
  expect(new URL(page.url()).pathname).toBe('/3d-World/');
  // The lazy Space chunk was fetched from under the base path, and it actually rendered.
  expect(chunkRequests).toHaveLength(1);
  expect(chunkRequests[0]).toMatch(/^\/3d-World\/assets\//);
  expect(await canvasCoverage(page)).toBeGreaterThan(0.02);
});

test('an unknown Space still shows "Space not found" under a sub-path', async ({ page }) => {
  await page.goto('#/space/nope');
  await expect(page.locator('body')).toHaveAttribute('data-space-status', 'not-found');
  await expect(page.getByRole('alert')).toContainText('Space not found');
});

test('the home route works under a sub-path', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('body')).toHaveAttribute('data-space-id', 'demo-cube');
  await expect(page).toHaveTitle('Demo Cube — 3D World');
});
