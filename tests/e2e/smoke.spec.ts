import { expect, test } from './fixtures';

test('app boots, opens the default Space and renders a WebGL canvas', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('body')).toHaveAttribute('data-space-id', 'demo-cube');
  await expect(page.locator('body')).toHaveAttribute('data-space-ready', 'true');

  const canvas = page.locator('#app canvas');
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  expect(box?.width).toBeGreaterThan(0);
  expect(box?.height).toBeGreaterThan(0);
});
