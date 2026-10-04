import { expect, test } from './fixtures';

test('app boots to the gallery and renders a WebGL canvas', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('body')).toHaveAttribute('data-view', 'gallery');
  await expect(page.locator('body')).toHaveAttribute('data-space-ready', 'true');
  await expect(page.getByRole('heading', { level: 1, name: '3D World' })).toBeVisible();

  const canvas = page.locator('#app canvas');
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  expect(box?.width).toBeGreaterThan(0);
  expect(box?.height).toBeGreaterThan(0);
});
