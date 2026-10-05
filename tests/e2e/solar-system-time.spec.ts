import type { Page } from '@playwright/test';
import { PerspectiveCamera, Quaternion, Vector3 } from 'three';
import { BODIES, REAL_UNIT_KM } from '../../src/spaces/solar-system/data';
import { planetPosition, toScene } from '../../src/spaces/solar-system/orbit';
import { layout } from '../../src/spaces/solar-system/scale';
import { canvasRgba, expect, gotoSpace, test } from './fixtures';

// Spec 021 — time controls (T040): AC-6 (play/pause, speed, direction by mouse, touch and keyboard), AC-7 (the
// date), AC-8 (opens today; range limits), AC-9 (reduced motion). Motion (T041): AC-4 (spin), AC-10 (markers and
// following while time runs), AC-11 (orbit lines). Positions are projected here, in Node, from the camera and
// bodies the app reports, independently of its drawing code.

const ID = 'solar-system';
const DAY_MS = 86_400_000;
const J2000_MS = Date.UTC(2000, 0, 1, 12);

const group = (page: Page) => page.getByRole('group', { name: 'Time' });
const playButton = (page: Page) => group(page).locator('button.time-play');
const speed = (page: Page) => group(page).getByRole('combobox', { name: 'Speed' });
const backwards = (page: Page) => group(page).getByRole('button', { name: 'Backwards' });
const announcer = (page: Page) => group(page).locator('[aria-live="polite"]');
const simTime = (page: Page) => page.evaluate(() => window.__WORLD__!.simTime()!);
const focusedClass = (page: Page) => page.evaluate(() => document.activeElement?.className ?? '');

/** Simulated days per real second, measured over ~1 s of the page's own clock. */
async function measuredSpeed(page: Page): Promise<number> {
  const [d0, t0] = await page.evaluate(() => [window.__WORLD__!.simTime()!.days, performance.now()]);
  await page.waitForTimeout(1000);
  const [d1, t1] = await page.evaluate(() => [window.__WORLD__!.simTime()!.days, performance.now()]);
  return (d1 - d0) / ((t1 - t0) / 1000);
}

test.describe('time controls (AC-6, AC-7)', () => {
  test('mouse: pause, play, choose a speed and run backwards; each change is announced and keeps focus', async ({
    page,
  }) => {
    await gotoSpace(page, ID);
    await expect(playButton(page)).toHaveText('Pause time');
    expect(await measuredSpeed(page)).toBeCloseTo(7, -0.5); // 1 week per second by default (± ~1.5 d/s)

    await playButton(page).click();
    await expect(playButton(page)).toHaveText('Play time');
    await expect(announcer(page)).toHaveText('Time paused');
    expect(await focusedClass(page)).toContain('time-play');
    expect(await measuredSpeed(page)).toBe(0);

    await playButton(page).click();
    await expect(announcer(page)).toHaveText('Time playing');
    await speed(page).selectOption('month');
    expect(await measuredSpeed(page)).toBeCloseTo(30.44, -1); // ± ~5 d/s

    await backwards(page).click();
    await expect(backwards(page)).toHaveAttribute('aria-pressed', 'true');
    await expect(announcer(page)).toHaveText('Time runs backwards');
    expect(await focusedClass(page)).toContain('time-direction');
    expect(await measuredSpeed(page)).toBeCloseTo(-30.44, -1);
  });

  test('keyboard: Tab reaches the controls; Enter, Space and arrow keys work them', async ({ page }) => {
    await gotoSpace(page, ID);
    await playButton(page).focus();
    await page.keyboard.press('Enter');
    await expect(playButton(page)).toHaveText('Play time');
    await page.keyboard.press('Space');
    await expect(playButton(page)).toHaveText('Pause time');

    await page.keyboard.press('Tab');
    expect(await focusedClass(page)).toContain('time-speed');
    await page.keyboard.press('ArrowDown'); // week → month
    await expect(speed(page)).toHaveValue('month');
    await expect.poll(async () => (await simTime(page)).speed).toBe(30.436875);

    await page.keyboard.press('Tab');
    await page.keyboard.press('Space');
    await expect(backwards(page)).toHaveAttribute('aria-pressed', 'true');
    expect(await focusedClass(page)).toContain('time-direction');
    await expect.poll(async () => (await simTime(page)).speed).toBe(-30.436875);
  });

  test('the date is shown as <time datetime>, not announced, and advances', async ({ page }) => {
    await gotoSpace(page, ID);
    const date = group(page).locator('time');
    await expect(date).toBeVisible();
    expect(await date.evaluate((el) => el.closest('[aria-live]'))).toBeNull();
    await speed(page).selectOption('year');
    const first = await date.getAttribute('datetime');
    await expect.poll(() => date.getAttribute('datetime')).not.toBe(first);
    // Text and attribute agree with the simulated day.
    const { days } = await simTime(page);
    const shown = (await date.getAttribute('datetime'))!;
    const iso = new Date(J2000_MS + days * DAY_MS).toISOString().slice(0, 10);
    expect(Math.abs(Date.parse(iso) - Date.parse(shown)) / DAY_MS).toBeLessThanOrEqual(400); // a second at 1 y/s
    expect(await date.textContent()).toMatch(/^\d{1,2} [A-Z][a-z]{2} \d{4}$/);
  });
});

test.describe('touch (AC-6)', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 375, height: 667 } });

  test('a tap works play/pause and the direction toggle', async ({ page }) => {
    await gotoSpace(page, ID);
    await playButton(page).tap();
    await expect(playButton(page)).toHaveText('Play time');
    await backwards(page).tap();
    await expect(backwards(page)).toHaveAttribute('aria-pressed', 'true');
    await playButton(page).tap();
    await expect.poll(async () => (await simTime(page)).speed).toBe(-7);
    await expect(playButton(page)).toHaveText('Pause time');
  });
});

test.describe('start and range (AC-8)', () => {
  test('opens at today’s date, by the page’s own clock', async ({ page }) => {
    await gotoSpace(page, ID);
    const [{ days }, now] = await Promise.all([simTime(page), page.evaluate(() => Date.now())]);
    const today = (now - J2000_MS) / DAY_MS;
    // Time has run 1 week per second since opening: a few seconds at most.
    expect(days - today).toBeGreaterThanOrEqual(-0.01);
    expect(days - today).toBeLessThan(7 * 10);
  });

  test('playing into 2050 pauses there and says so', async ({ page }) => {
    await gotoSpace(page, ID);
    const end = (Date.UTC(2050, 11, 31) - J2000_MS) / DAY_MS;
    await speed(page).selectOption('year');
    await page.evaluate((d) => window.__WORLD__!.setSimTime(d), end - 30);
    await expect(announcer(page)).toHaveText('Reached 2050, the end of the supported dates. Time paused.');
    await expect(playButton(page)).toHaveText('Play time');
    expect(await simTime(page)).toMatchObject({ days: end, playing: false });
    await expect(group(page).locator('time')).toHaveAttribute('datetime', '2050-12-31');
  });
});

test.describe('reduced motion (AC-9)', () => {
  test.use({ reducedMotion: 'reduce' });

  test('time starts paused; Play starts it', async ({ page }) => {
    await gotoSpace(page, ID);
    await expect(playButton(page)).toHaveText('Play time');
    expect(await measuredSpeed(page)).toBe(0);
    await playButton(page).click();
    expect(await measuredSpeed(page)).toBeGreaterThan(3);
  });
});

// --- Motion (T041) ---

const toggle = (page: Page) => page.getByRole('button', { name: 'True scale' });
const frames = (page: Page) =>
  page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

/**
 * One frame's camera, bodies and marker dots, read in a single task (no frame in between, so moving bodies and
 * their markers agree), with helpers to project points to CSS px.
 */
async function snapshot(page: Page) {
  const snap = await page.evaluate(() => {
    const world = window.__WORLD__!;
    const box = document.querySelector('#app canvas')!.getBoundingClientRect();
    const markers = [...document.querySelectorAll<HTMLElement>('.body-marker:not([hidden])')].map((el) => {
      const dot = el.querySelector('.body-marker-dot')!.getBoundingClientRect();
      return { id: el.dataset.body!, x: dot.left + dot.width / 2, y: dot.top + dot.height / 2 };
    });
    return {
      pose: world.cameraPose()!,
      projection: world.cameraProjection()!,
      bodies: world.bodies(),
      markers,
      days: world.simTime()!.days,
      width: box.width,
      height: box.height,
    };
  });
  const { fov, aspect, near, far } = snap.projection;
  const camera = new PerspectiveCamera(fov, aspect, near, far);
  camera.position.fromArray(snap.pose.position);
  camera.quaternion.fromArray(snap.pose.quaternion);
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();
  const toPx = (point: Vector3) => {
    const ndc = point.clone().project(camera);
    return {
      x: ((ndc.x + 1) / 2) * snap.width,
      y: ((1 - ndc.y) / 2) * snap.height,
      inView: Math.abs(ndc.x) < 1 && Math.abs(ndc.y) < 1 && ndc.z < 1,
    };
  };
  const at = (id: string) => snap.bodies.find((b) => b.id === id)!;
  const worldOf = (id: string) => new Vector3(...at(id).world);
  /** Degrees between the view direction and a body. */
  const angleTo = (id: string) => {
    const forward = new Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    return (forward.angleTo(worldOf(id).sub(camera.position)) * 180) / Math.PI;
  };
  return { ...snap, camera, toPx, at, worldOf, angleTo };
}

/** Degrees between two reported orientations. */
const turned = (a: number[] | undefined, b: number[] | undefined) =>
  (new Quaternion().fromArray(a!).angleTo(new Quaternion().fromArray(b!)) * 180) / Math.PI;

test.describe('motion (AC-4, AC-10)', () => {
  test('AC-4: bodies turn with time at a slow speed, and hold still above one turn per second', async ({
    page,
  }) => {
    await gotoSpace(page, ID);
    await speed(page).selectOption('day'); // Mercury turns ~6° a day: 0.017 turns per second
    await frames(page);
    const before = await snapshot(page);
    await page.waitForTimeout(1000);
    const after = await snapshot(page);
    const expected = (360 / 58.6463) * (after.days - before.days);
    expect(
      Math.abs(turned(before.at('mercury').quaternion, after.at('mercury').quaternion) - expected),
    ).toBeLessThan(0.5);

    await speed(page).selectOption('year'); // Earth would turn 366 times a second: held instead (Q6)
    await frames(page);
    const fast0 = await snapshot(page);
    await page.waitForTimeout(500);
    const fast1 = await snapshot(page);
    expect(fast1.days - fast0.days).toBeGreaterThan(100);
    expect(turned(fast0.at('earth').quaternion, fast1.at('earth').quaternion)).toBeLessThan(0.5); // pole drift only
  });

  test('AC-10: real-scale markers stay on their moving bodies (within 4 px)', async ({ page }) => {
    await gotoSpace(page, ID);
    await toggle(page).click();
    await speed(page).selectOption('year'); // Mercury goes round ~4 times a second
    for (let i = 0; i < 5; i++) {
      await page.waitForTimeout(200);
      const snap = await snapshot(page);
      expect(snap.markers.length).toBeGreaterThan(3);
      for (const m of snap.markers) {
        const b = snap.toPx(snap.worldOf(m.id));
        expect(Math.hypot(m.x - b.x, m.y - b.y), `${m.id} at frame ${i}`).toBeLessThanOrEqual(4);
      }
    }
  });

  test('AC-10: re-centred on Earth, the view follows it while time runs; a pan stops following', async ({
    page,
  }) => {
    await gotoSpace(page, ID);
    await toggle(page).click();
    await speed(page).selectOption('month');
    await frames(page);
    const dot = (await page.locator('.body-marker[data-body="earth"] .body-marker-dot').boundingBox())!;
    await page.mouse.move(dot.x + dot.width / 2, dot.y + dot.height / 2); // the wheel zooms where the mouse is
    await page.mouse.wheel(0, -100);
    await frames(page);
    const start = await snapshot(page);
    expect(start.angleTo('earth')).toBeLessThan(0.5);

    await page.waitForTimeout(1500); // ~45 days: Earth moves ~44°
    const later = await snapshot(page);
    expect(later.days - start.days).toBeGreaterThan(20);
    const earthMoved = later.worldOf('earth').sub(start.worldOf('earth'));
    expect(earthMoved.length()).toBeGreaterThan(20);
    // The camera moved with Earth (the turntable only turns it about Earth), and still looks at it.
    const cameraMoved = later.camera.position.clone().sub(start.camera.position);
    expect(cameraMoved.distanceTo(earthMoved)).toBeLessThan(0.05 * earthMoved.length());
    expect(later.angleTo('earth')).toBeLessThan(0.5);

    await page.locator('#app canvas').focus();
    await page.keyboard.press('Shift+ArrowLeft'); // a pan
    await frames(page);
    const panned = await snapshot(page);
    await page.waitForTimeout(1000);
    const after = await snapshot(page);
    expect(after.worldOf('earth').distanceTo(panned.worldOf('earth'))).toBeGreaterThan(10); // Earth moved on…
    expect(after.camera.position.distanceTo(panned.camera.position)).toBeLessThan(1e-6); // …the camera didn't
  });
});

test.describe('orbit lines (AC-11), with reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  /** Share of Neptune's path points on screen where the canvas isn't the background colour. */
  async function neptunePathDrawn(page: Page, mode: 'stylised' | 'real'): Promise<number> {
    await frames(page);
    const snap = await snapshot(page);
    const pixels = await canvasRgba(page);
    const scaleX = pixels.width / snap.width;
    const scaleY = pixels.height / snap.height;
    const [r0 = 0, g0 = 0, b0 = 0] = pixels.data;
    const neptune = BODIES.find((b) => b.id === 'neptune')!;
    const ring = layout(BODIES, 'stylised').get('neptune')!.distance;
    let onScreen = 0;
    let drawn = 0;
    for (let k = 0; k < 180; k++) {
      const angle = (2 * Math.PI * k) / 180;
      const point =
        mode === 'stylised'
          ? new Vector3(ring * Math.cos(angle), 0, -ring * Math.sin(angle))
          : (toScene(planetPosition(neptune, snap.days, new Vector3(), angle)) as Vector3).divideScalar(
              REAL_UNIT_KM,
            );
      const px = snap.toPx(point);
      if (!px.inView) continue;
      onScreen++;
      let hit = false;
      for (let dy = -1; dy <= 1 && !hit; dy++) {
        for (let dx = -1; dx <= 1 && !hit; dx++) {
          const i = (Math.round(px.y * scaleY + dy) * pixels.width + Math.round(px.x * scaleX + dx)) * 4;
          const delta =
            Math.abs((pixels.data[i] ?? 0) - r0) +
            Math.abs((pixels.data[i + 1] ?? 0) - g0) +
            Math.abs((pixels.data[i + 2] ?? 0) - b0);
          hit = delta > 12;
        }
      }
      if (hit) drawn++;
    }
    expect(onScreen).toBeGreaterThan(90);
    return drawn / onScreen;
  }

  test('a faint line traces Neptune’s path at both scales', async ({ page }) => {
    await gotoSpace(page, ID);
    expect(await neptunePathDrawn(page, 'stylised')).toBeGreaterThan(0.9);
    await toggle(page).click();
    expect(await neptunePathDrawn(page, 'real')).toBeGreaterThan(0.9);
  });
});

// --- Lifecycle (T042, AC-12). The 10-round-trip memory check lives in solar-system.spec.ts (020 AC-12). ---

test.describe('lifecycle (AC-12)', () => {
  /** Loses and restores the WebGL context, waiting on the app's signals (learnings). */
  const loseAndRestore = async (page: Page) => {
    const body = page.locator('body');
    await page.evaluate(() => window.__WORLD__!.loseContext());
    await expect(body).toHaveAttribute('data-webgl', 'lost', { timeout: 1000 });
    await page.evaluate(() => window.__WORLD__!.restoreContext());
    await expect(body).not.toHaveAttribute('data-webgl', /.*/);
    await expect(body).toHaveAttribute('data-space-ready', 'true');
  };

  test('a context loss and restore keeps the date, speed, direction and paused state', async ({ page }) => {
    await gotoSpace(page, ID);
    await speed(page).selectOption('month');
    await backwards(page).click();
    await playButton(page).click(); // pause
    await page.evaluate(() => window.__WORLD__!.setSimTime(-12_345.5));
    const before = await simTime(page);

    await loseAndRestore(page);
    expect(await simTime(page)).toEqual(before);
    await expect(speed(page)).toHaveValue('month');
    await expect(backwards(page)).toHaveAttribute('aria-pressed', 'true');
    await expect(playButton(page)).toHaveText('Play time');
    const iso = new Date(J2000_MS + before.days * DAY_MS).toISOString().slice(0, 10);
    await expect(group(page).locator('time')).toHaveAttribute('datetime', iso);
  });

  test('a context loss while playing comes back playing, from where it was', async ({ page }) => {
    await gotoSpace(page, ID);
    await speed(page).selectOption('day');
    await page.evaluate(() => window.__WORLD__!.setSimTime(9000));
    await loseAndRestore(page);
    const after = await simTime(page);
    expect(after).toMatchObject({ speed: 1, playing: true });
    expect(after.days).toBeGreaterThanOrEqual(9000);
    expect(after.days).toBeLessThan(9010); // continued, not restarted at today (~9774)
  });

  test('a fresh visit starts at today, 1 week per second, whatever the last one did (Q8)', async ({
    page,
  }) => {
    await gotoSpace(page, ID);
    await speed(page).selectOption('year');
    await backwards(page).click();
    await page.evaluate(() => window.__WORLD__!.setSimTime(0));
    await page.evaluate(() => (window.location.hash = '#/'));
    await expect(page.locator('body')).toHaveAttribute('data-view', 'gallery');
    await expect(page.locator('body')).toHaveAttribute('data-space-ready', 'true');

    await page.evaluate((id) => window.__WORLD__!.navigate(id), ID);
    await expect(page.locator('body')).toHaveAttribute('data-space-ready', 'true');
    const [{ days, speed: rate, playing }, now] = await Promise.all([
      simTime(page),
      page.evaluate(() => Date.now()),
    ]);
    expect({ speed: rate, playing }).toEqual({ speed: 7, playing: true });
    expect(days - (now - J2000_MS) / DAY_MS).toBeLessThan(7 * 10);
    expect(days - (now - J2000_MS) / DAY_MS).toBeGreaterThanOrEqual(-0.01);
    await expect(speed(page)).toHaveValue('week');
  });
});
