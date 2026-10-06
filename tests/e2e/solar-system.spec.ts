import type { Page } from '@playwright/test';
import { PerspectiveCamera, Quaternion, Vector3 } from 'three';
import { cameraPose, canvasCoverage, canvasRgba, expect, gotoSpace, test, touchGesture } from './fixtures';
import { frames, project } from './solar-helpers';

// Spec 020 — the Solar System Space: AC-5, AC-7, AC-8, AC-9 (T030); AC-8a, AC-10, AC-11 (T031). Bodies are projected here, in Node, from
// the camera and positions the app reports, independently of the app's own drawing code.

const ID = 'solar-system';
const toggle = (page: Page) => page.getByRole('button', { name: 'True scale' });
const body = (page: Page) => page.locator('body');

test.describe('with reduced motion (input-driven only)', () => {
  test.use({ reducedMotion: 'reduce' });

  test('AC-9: the gallery card opens the Space: info panel, a drawn canvas, no console errors', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(body(page)).toHaveAttribute('data-view', 'gallery');
    await page.getByRole('link', { name: /Solar System/ }).click();
    await expect(body(page)).toHaveAttribute('data-space-id', ID);
    await expect(body(page)).toHaveAttribute('data-space-ready', 'true');
    await expect(page.getByRole('region', { name: 'Solar System' })).toBeVisible();
    expect(await canvasCoverage(page)).toBeGreaterThan(0);
    expect(await page.evaluate(() => window.__WORLD__!.bodies().length)).toBe(16);
  });

  for (const [width, height, minPx] of [
    [1280, 720, 3],
    [320, 640, 1],
  ] as const) {
    test(`AC-5: at stylised scale every body is drawn (≥ ${minPx} px radius) at ${width}×${height}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height });
      await gotoSpace(page, ID);
      await frames(page);
      const { bodies } = await project(page);
      const pixels = await canvasRgba(page);
      const [r0 = 0, g0 = 0, b0 = 0] = pixels.data;
      for (const b of bodies) {
        expect(b.inFront, b.id).toBe(true);
        expect(b.radiusPx, b.id).toBeGreaterThanOrEqual(minPx);
        // Something other than the background within a pixel or two of its centre.
        let drawn = false;
        for (let dy = -2; dy <= 2 && !drawn; dy++) {
          for (let dx = -2; dx <= 2 && !drawn; dx++) {
            const x = Math.round(b.x) + dx;
            const y = Math.round(b.y) + dy;
            const i = (y * pixels.width + x) * 4;
            const delta =
              Math.abs((pixels.data[i] ?? 0) - r0) +
              Math.abs((pixels.data[i + 1] ?? 0) - g0) +
              Math.abs((pixels.data[i + 2] ?? 0) - b0);
            drawn = delta > 12;
          }
        }
        expect(drawn, `${b.id} drawn at (${b.x.toFixed(0)}, ${b.y.toFixed(0)})`).toBe(true);
      }
    });
  }

  test('AC-7: stylised first; mouse, Enter and Space switch; state, description and focus follow', async ({
    page,
  }) => {
    await gotoSpace(page, ID);
    await expect(toggle(page)).toHaveAttribute('aria-pressed', 'false');
    const description = () =>
      page.locator('#app canvas').evaluate((canvas) => {
        const el = document.getElementById(canvas.getAttribute('aria-describedby') ?? '');
        return el ? { live: el.getAttribute('aria-live'), text: el.textContent ?? '' } : null;
      });
    expect(await description()).toMatchObject({
      live: 'polite',
      text: expect.stringMatching(/^Stylised scale/),
    });

    await toggle(page).click();
    await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true');
    expect((await description())?.text).toMatch(/^True scale/);

    await toggle(page).focus();
    await page.keyboard.press('Enter');
    await expect(toggle(page)).toHaveAttribute('aria-pressed', 'false');
    await expect(toggle(page)).toBeFocused();
    await page.keyboard.press('Space');
    await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true');
    await expect(toggle(page)).toBeFocused();
  });

  test('AC-7: the choice is remembered across reloads; a fresh visitor starts stylised', async ({
    page,
    browser,
  }) => {
    await gotoSpace(page, ID);
    await toggle(page).click();
    await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true');
    await page.reload();
    await expect(body(page)).toHaveAttribute('data-space-ready', 'true');
    await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true');

    const context = await browser.newContext({ reducedMotion: 'reduce' });
    const fresh = await context.newPage();
    await gotoSpace(fresh, ID);
    await expect(fresh.getByRole('button', { name: 'True scale' })).toHaveAttribute('aria-pressed', 'false');
    await context.close();
  });

  test('AC-7: a tap switches scale on a touch screen', async ({ browser }) => {
    const context = await browser.newContext({
      hasTouch: true,
      isMobile: true,
      viewport: { width: 390, height: 844 },
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await gotoSpace(page, ID);
    await toggle(page).tap();
    await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true');
    expect(errors).toEqual([]);
    await context.close();
  });

  for (const [width, height] of [
    [1280, 720],
    [320, 640],
  ] as const) {
    test(`AC-8: each switch frames the whole system at once (${width}×${height})`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await gotoSpace(page, ID);
      for (const mode of ['real', 'stylised'] as const) {
        // The visitor zooms in and orbits first: a switch must re-frame even a moved camera.
        await page.locator('#app canvas').focus();
        for (const key of ['+', '+', '+', 'ArrowLeft', 'ArrowUp']) await page.keyboard.press(key);
        await toggle(page).click();
        await expect(toggle(page)).toHaveAttribute('aria-pressed', String(mode === 'real'));
        await frames(page); // instant with reduced motion: settled within a frame
        const view = await project(page);
        const half = Math.min(view.width, view.height) / 2;
        let farthest = 0;
        for (const b of view.bodies) {
          expect(b.inFront, `${mode}: ${b.id}`).toBe(true);
          expect(b.x, `${mode}: ${b.id} x`).toBeGreaterThanOrEqual(0);
          expect(b.x, `${mode}: ${b.id} x`).toBeLessThanOrEqual(view.width);
          expect(b.y, `${mode}: ${b.id} y`).toBeGreaterThanOrEqual(0);
          expect(b.y, `${mode}: ${b.id} y`).toBeLessThanOrEqual(view.height);
          farthest = Math.max(farthest, Math.hypot(b.x - view.width / 2, b.y - view.height / 2));
        }
        expect(farthest / half, mode).toBeGreaterThanOrEqual(0.5);
        expect(farthest / half, mode).toBeLessThanOrEqual(0.9);
      }
    });
  }
});

/** The camera's forward direction against the direction to a body, in degrees. */
async function angleTo(page: Page, id: string): Promise<number> {
  const { pose, world } = await page.evaluate((id) => {
    const w = window.__WORLD__!;
    return { pose: w.cameraPose()!, world: w.bodies().find((b) => b.id === id)!.world };
  }, id);
  const forward = new Vector3(0, 0, -1).applyQuaternion(new Quaternion().fromArray(pose.quaternion));
  const toBody = new Vector3(...world).sub(new Vector3().fromArray(pose.position)).normalize();
  return (forward.angleTo(toBody) * 180) / Math.PI;
}

/** Real-scale markers on screen: each dot's centre, and each shown name's box. */
const markerBoxes = (page: Page) =>
  page.$$eval('.body-marker:not([hidden])', (els) =>
    els.map((el) => {
      const dot = el.querySelector('.body-marker-dot')!.getBoundingClientRect();
      const name = el.querySelector<HTMLElement>('.body-marker-name')!;
      const box = name.hidden ? null : name.getBoundingClientRect();
      return {
        id: (el as HTMLElement).dataset.body!,
        x: dot.left + dot.width / 2,
        y: dot.top + dot.height / 2,
        name: box ? { left: box.left, top: box.top, right: box.right, bottom: box.bottom } : null,
      };
    }),
  );

test.describe('real scale, with reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  for (const [width, height] of [
    [1280, 720],
    [320, 640],
  ] as const) {
    test(`AC-8a: markers sit on their bodies; names don’t overlap and stay in view (${width}×${height})`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height });
      await gotoSpace(page, ID);
      await expect(page.locator('.body-markers')).toBeVisible(); // stylised too since spec 023 (AC-14)
      await toggle(page).click();
      await frames(page);
      const view = await project(page);
      const shown = await markerBoxes(page);
      expect(shown.map((m) => m.id)).toEqual(expect.arrayContaining(['sun', 'jupiter', 'neptune']));
      for (const m of shown) {
        const b = view.bodies.find((v) => v.id === m.id)!;
        expect(Math.hypot(m.x - b.x, m.y - b.y), m.id).toBeLessThanOrEqual(4);
      }
      const names = shown.flatMap((m) => (m.name ? [{ id: m.id, ...m.name }] : []));
      expect(names.map((n) => n.id)).toContain('sun'); // the largest keeps its name
      for (const a of names) {
        expect(a.left, a.id).toBeGreaterThanOrEqual(0);
        expect(a.right, a.id).toBeLessThanOrEqual(width);
        for (const b of names) {
          if (a.id >= b.id) continue;
          const overlap = a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
          expect(overlap, `${a.id} vs ${b.id}`).toBe(false);
        }
      }
    });
  }

  test('AC-8a: zooming in on Earth’s marker reaches Earth (≥ 3 px), and the Moon’s marker appears', async ({
    page,
  }) => {
    await gotoSpace(page, ID);
    await toggle(page).click();
    await frames(page);
    let earth = (await project(page)).bodies.find((b) => b.id === 'earth')!;
    for (let i = 0; i < 60 && earth.radiusPx < 3; i++) {
      await page.mouse.move(earth.x, earth.y); // the wheel zooms where the mouse is (learnings)
      await page.mouse.wheel(0, -300);
      await frames(page);
      earth = (await project(page)).bodies.find((b) => b.id === 'earth')!;
    }
    expect(earth.radiusPx).toBeGreaterThanOrEqual(3);
    expect(await angleTo(page, 'earth')).toBeLessThan(1); // re-centred on it (D-023)
    await expect(page.locator('.body-marker[data-body="moon"]')).toBeVisible();
  });
});

test('AC-8a: a pinch that starts on Jupiter’s marker re-centres on Jupiter (touch)', async ({ browser }) => {
  const context = await browser.newContext({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 390, height: 844 },
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await gotoSpace(page, ID);
  await page.getByRole('button', { name: 'True scale' }).tap();
  await frames(page);
  const jupiter = (await project(page)).bodies.find((b) => b.id === 'jupiter')!;
  // Two fingers land either side of the marker and lift without moving: the re-centre alone. (A moving pinch
  // also pans by its midpoint's wobble, as two-finger gestures do, which would blur what this checks.)
  const still = (x: number) => ({ from: { x, y: jupiter.y }, to: { x, y: jupiter.y } });
  await touchGesture(page, [still(jupiter.x - 20), still(jupiter.x + 20)], 0);
  await frames(page);
  expect(await angleTo(page, 'jupiter')).toBeLessThan(1);
  expect(errors).toEqual([]);
  await context.close();
});

test.describe('lighting, with reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('AC-10: the side facing the Sun is brighter (Jupiter, Earth)', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await gotoSpace(page, ID);
    await frames(page);
    const snap = await page.evaluate(() => {
      const w = window.__WORLD__!;
      return { pose: w.cameraPose()!, projection: w.cameraProjection()!, bodies: w.bodies() };
    });
    const { fov, aspect, near, far } = snap.projection;
    const camera = new PerspectiveCamera(fov, aspect, near, far);
    camera.position.fromArray(snap.pose.position);
    camera.quaternion.fromArray(snap.pose.quaternion);
    camera.updateMatrixWorld();
    camera.updateProjectionMatrix();
    const pixels = await canvasRgba(page);
    const luminance = (p: Vector3) => {
      const ndc = p.clone().project(camera);
      const x = Math.round(((ndc.x + 1) / 2) * pixels.width);
      const y = Math.round(((1 - ndc.y) / 2) * pixels.height);
      const i = (y * pixels.width + x) * 4;
      return 0.2126 * pixels.data[i]! + 0.7152 * pixels.data[i + 1]! + 0.0722 * pixels.data[i + 2]!;
    };
    for (const id of ['jupiter', 'earth']) {
      const b = snap.bodies.find((x) => x.id === id)!;
      const centre = new Vector3(...b.world);
      const towardSun = centre
        .clone()
        .negate()
        .normalize()
        .multiplyScalar(0.6 * b.radius);
      const lit = luminance(centre.clone().add(towardSun));
      const dark = luminance(centre.clone().sub(towardSun));
      expect(lit, `${id}: sunward ${lit.toFixed(0)} vs far ${dark.toFixed(0)}`).toBeGreaterThan(dark + 10);
    }
  });
});

// 020 AC-11, kept under 021: with time paused, the turntable alone never moves a body.
test('AC-11: with time paused, the bodies hold still while the turntable turns the camera', async ({
  page,
}) => {
  await gotoSpace(page, ID);
  await page.getByRole('button', { name: 'Pause time' }).click();
  await frames(page); // the pause takes effect on the next frame (paused bodies show their true spin)
  const first = await page.evaluate(() => window.__WORLD__!.bodies());
  const pose = await cameraPose(page);
  await page.waitForTimeout(1000);
  expect(await page.evaluate(() => window.__WORLD__!.bodies())).toEqual(first);
  const moved = await cameraPose(page);
  expect(moved.position).not.toEqual(pose.position); // the camera did move: the check isn't vacuous
});

test.describe('lifecycle, with reduced motion', () => {
  test.use({ reducedMotion: 'reduce' }); // instant swaps keep 10 round trips fast

  test('AC-12: 10 gallery ↔ solar-system round trips leave no extra DOM and return GPU memory to the baseline', async ({
    page,
  }) => {
    const toGallery = async () => {
      await page.evaluate(() => (window.location.hash = '#/'));
      await expect(body(page)).toHaveAttribute('data-view', 'gallery');
      await expect(body(page)).toHaveAttribute('data-space-ready', 'true');
    };
    // The "<title> loaded" announcer is created on the first slow load and kept for the app's lifetime (learnings).
    const snapshot = () =>
      page.evaluate(() => ({
        elements: document.querySelectorAll('#app *:not(.loading-announcer)').length,
        memory: window.__WORLD__!.memory(),
      }));

    await gotoSpace(page, ID); // warm-up: renderer-lifetime resources (learnings)
    await toGallery();
    const baseline = await snapshot();

    for (let i = 0; i < 10; i++) {
      await page.evaluate((id) => window.__WORLD__!.navigate(id), ID);
      await expect(body(page)).toHaveAttribute('data-space-ready', 'true');
      const during = await page.evaluate(() => window.__WORLD__!.memory());
      // One shared sphere, the same count as the gallery's starfield: the leak check is the final equality.
      expect(during.geometries).toBeGreaterThanOrEqual(1);
      await toggle(page).click(); // leave from either scale, markers included
      await page.getByRole('button', { name: 'Play time' }).click(); // 021: leave with time running too
      await toGallery();
      await expect(page.locator('.scale, .body-markers, .solar-bar, .time-controls')).toHaveCount(0);
    }
    expect(await snapshot()).toEqual(baseline);
  });

  test('AC-12: after a WebGL context loss and restore, the Space comes back in the same scale', async ({
    page,
  }) => {
    await gotoSpace(page, ID);
    await toggle(page).click();
    await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true');
    const realEarth = await page.evaluate(
      () => window.__WORLD__!.bodies().find((b) => b.id === 'earth')!.radius,
    );

    await page.evaluate(() => window.__WORLD__!.loseContext());
    await expect(body(page)).toHaveAttribute('data-webgl', 'lost', { timeout: 1000 });
    // Restore only after the app's signal: a later task than the loss event (learnings).
    await page.evaluate(() => window.__WORLD__!.restoreContext());
    await expect(body(page)).not.toHaveAttribute('data-webgl', /.*/);
    await expect(body(page)).toHaveAttribute('data-space-ready', 'true');

    await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true');
    const earth = await page.evaluate(() => window.__WORLD__!.bodies().find((b) => b.id === 'earth')!.radius);
    expect(earth).toBeCloseTo(realEarth, 12);
    await expect(page.locator('.body-markers')).toHaveCount(1);
    // At real scale every body is under a pixel, so prove drawing works at stylised scale.
    await toggle(page).click();
    await frames(page);
    expect(await canvasCoverage(page)).toBeGreaterThan(0);
  });
});
