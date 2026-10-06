import type { Page } from '@playwright/test';
import { clearArea } from '../../src/spaces/solar-system/focus';
import { Vector3 } from 'three';
import {
  cameraPose,
  canvasRgba,
  expect,
  gotoSpace,
  meanPixelDifference,
  rotationBetween,
  test,
  touchGesture,
  waitForBackground,
} from './fixtures';
import { cameraFrom, frames, project, selectFromList, snapshot, waitForFly } from './solar-helpers';

// Spec 023 — selection and focus in the Solar System. T060: selecting and facts (AC-1, AC-2, AC-3, AC-9, AC-10,
// AC-12). T061: flying and following (AC-4–AC-8). T062: labels, placement, time and lifecycle (AC-11, AC-14–AC-16). Bodies are projected in Node from the camera (with its view offset) and the positions the app reports.

const ID = 'solar-system';
const SCALE = 'world.solarSystem.scale';

const selection = (page: Page) => page.evaluate(() => window.__WORLD__!.selection()!);
const card = (page: Page) => page.locator('.body-card');
const listButton = (page: Page, name: string) =>
  page.locator('.body-list').getByRole('button', { name, exact: true });

/** Opens the Space at a scale (the remembered preference, as a visitor's last choice would be). */
async function openAt(page: Page, scale: 'stylised' | 'real') {
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
    key: SCALE,
    value: scale,
  });
  await gotoSpace(page, ID);
  await frames(page);
}

/** Where a body is drawn (CSS px), and that the canvas, not some overlay, is what a click there lands on. */
async function onScreen(page: Page, id: string) {
  const { bodies } = await project(page);
  const b = bodies.find((x) => x.id === id)!;
  const top = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.tagName, { x: b.x, y: b.y });
  expect(top, `${id} at (${b.x.toFixed(0)}, ${b.y.toFixed(0)}) is under an overlay`).toBe('CANVAS');
  return b;
}

/** The centre of the area the info panel leaves clear (spec 023, plan §4). */
async function clearCentre(page: Page) {
  const { viewport, panel } = await page.evaluate(() => {
    const canvas = document.querySelector('#app canvas')!.getBoundingClientRect();
    const region = document.querySelector('.info-panel')!.getBoundingClientRect();
    return {
      viewport: { width: canvas.width, height: canvas.height },
      panel:
        region.width > 0
          ? { left: region.left, top: region.top, width: region.width, height: region.height }
          : null,
    };
  });
  const area = clearArea(viewport, panel);
  return { x: area.x + area.width / 2, y: area.y + area.height / 2 };
}

/** A point on the canvas at least 80 px from every body and not under an overlay: "empty space". */
async function emptySpot(page: Page) {
  const { width, height, bodies } = await project(page);
  for (let y = 60; y < height - 60; y += 20) {
    for (let x = 20; x < width - 20; x += 20) {
      if (bodies.some((b) => b.inFront && Math.hypot(b.x - x, b.y - y) < 80 + b.radiusPx)) continue;
      const top = await page.evaluate((p) => document.elementFromPoint(p.x, p.y)?.tagName, { x, y });
      if (top === 'CANVAS') return { x, y };
    }
  }
  throw new Error('no empty spot on the canvas');
}

test.describe('selecting and facts (T060), reduced motion: time paused, flights instant', () => {
  test.use({ reducedMotion: 'reduce' });

  for (const scale of ['stylised', 'real'] as const) {
    test(`AC-1, AC-3, AC-9: a click on Mars selects it at ${scale} scale and shows its facts`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 1280, height: 720 });
      await openAt(page, scale);
      const mars = await onScreen(page, 'mars');
      await page.mouse.click(mars.x, mars.y);
      await frames(page);
      expect(await selection(page)).toMatchObject({ id: 'mars', following: true });
      await expect(page.locator('.body-marker[data-body="mars"]')).toHaveClass(/is-selected/);
      await expect(page.locator('.body-marker.is-selected')).toHaveCount(1);
      await expect(listButton(page, 'Mars')).toHaveAttribute('aria-pressed', 'true');
      await expect(card(page).getByRole('heading', { name: 'Mars' })).toBeVisible();
      await expect(card(page).locator('dt')).toHaveCount(7);
      await expect(card(page).locator('dd').first()).toHaveText(/^6,7\d\d km \(0\.53\d × Earth\)$/);
      await expect(page.locator('.info-panel > p').first()).toBeHidden(); // the Space description gives way
    });
  }

  test('AC-1: a drag that starts on Mars orbits the camera and selects nothing', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await openAt(page, 'stylised');
    const mars = await onScreen(page, 'mars');
    const before = await cameraPose(page);
    await page.mouse.move(mars.x, mars.y);
    await page.mouse.down();
    await page.mouse.move(mars.x + 60, mars.y + 10, { steps: 6 });
    await page.mouse.up();
    await frames(page);
    expect(rotationBetween(before, await cameraPose(page))).toBeGreaterThan(1);
    expect((await selection(page)).id).toBeNull();
  });

  test('AC-1: clicking empty space keeps the selection', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await openAt(page, 'stylised');
    await selectFromList(page, 'Saturn');
    await frames(page);
    const spot = await emptySpot(page);
    await page.mouse.click(spot.x, spot.y);
    await frames(page);
    expect((await selection(page)).id).toBe('saturn');
  });

  test('AC-2, AC-3: keyboard only: Tab to "Jupiter" in the list, Enter selects and frames it, announced', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await openAt(page, 'stylised');
    await page.locator('#app canvas').focus();
    let reached = false;
    for (let i = 0; i < 40 && !reached; i++) {
      await page.keyboard.press('Tab');
      reached = await page.evaluate(() => document.activeElement?.textContent === 'Jupiter');
    }
    expect(reached, 'Tab reaches the "Jupiter" button').toBe(true);
    await page.keyboard.press('Enter');
    await frames(page);
    expect((await selection(page)).id).toBe('jupiter');
    await expect(
      page.locator('.info [aria-live="polite"]').filter({ hasText: 'Jupiter selected' }),
    ).toHaveCount(1);
    const jupiter = (await project(page)).bodies.find((b) => b.id === 'jupiter')!;
    const centre = await clearCentre(page);
    expect(Math.hypot(jupiter.x - centre.x, jupiter.y - centre.y)).toBeLessThan(4);
  });

  test('AC-10: the live distance changes as time runs and is not announced', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await openAt(page, 'stylised');
    await selectFromList(page, 'Earth');
    const live = card(page).locator('.body-card-live');
    await expect(live).toHaveText(/^Now: [\d.]+ million km from the Sun$/);
    expect(await live.evaluate((el) => el.closest('[aria-live]'))).toBeNull();
    const first = await live.textContent();
    await page.getByRole('button', { name: 'Play time' }).click();
    await page.getByLabel('Speed').selectOption({ label: '1 month per second' });
    await expect(live).not.toHaveText(first!, { timeout: 10_000 });
  });

  test('AC-12: Escape keeps the camera where it is and returns focus to the list button', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await openAt(page, 'stylised');
    await listButton(page, 'Mars').focus();
    await page.keyboard.press('Enter');
    await frames(page);
    const framed = await cameraPose(page);
    await page.keyboard.press('Escape');
    await frames(page);
    expect((await selection(page)).id).toBeNull();
    await expect(card(page)).toBeHidden();
    expect(rotationBetween(framed, await cameraPose(page))).toBeLessThan(0.01);
    await expect(listButton(page, 'Mars')).toBeFocused();
  });

  test('AC-12: after a canvas click, Close returns focus to the 3D view; "Reset view" goes home and clears', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await openAt(page, 'stylised');
    const home = await cameraPose(page);
    const mars = await onScreen(page, 'mars');
    await page.mouse.click(mars.x, mars.y);
    await frames(page);
    await card(page).getByRole('button', { name: 'Close Mars' }).click();
    expect((await selection(page)).id).toBeNull();
    await expect(page.locator('#app canvas')).toBeFocused();

    await selectFromList(page, 'Venus');
    await frames(page);
    await page.getByRole('button', { name: 'Reset view' }).click();
    await frames(page);
    expect((await selection(page)).id).toBeNull();
    expect(rotationBetween(home, await cameraPose(page))).toBeLessThan(1);
  });
});

test.describe('touch (T060)', () => {
  test.use({
    reducedMotion: 'reduce',
    hasTouch: true,
    isMobile: true,
    viewport: { width: 390, height: 844 },
  });

  test('AC-1: a tap on a body selects it', async ({ page }) => {
    await openAt(page, 'stylised');
    const jupiter = await onScreen(page, 'jupiter');
    await touchGesture(
      page,
      [{ from: { x: jupiter.x, y: jupiter.y }, to: { x: jupiter.x, y: jupiter.y } }],
      0,
    );
    await frames(page);
    expect((await selection(page)).id).toBe('jupiter');
  });
});

/** A body's disc on screen and the clear area's shorter side, from one snapshot (with the view offset). */
async function framing(page: Page, id: string) {
  const { bodies } = await project(page);
  const b = bodies.find((x) => x.id === id)!;
  const centre = await clearCentre(page);
  const short = await page.evaluate(() => {
    const canvas = document.querySelector('#app canvas')!.getBoundingClientRect();
    const region = document.querySelector('.info-panel')!.getBoundingClientRect();
    return region.width > canvas.width / 2
      ? Math.min(canvas.width, region.top - canvas.top)
      : Math.min(region.width > 0 ? region.left - canvas.left : canvas.width, canvas.height);
  });
  return { b, fill: (2 * b.radiusPx) / short, off: Math.hypot(b.x - centre.x, b.y - centre.y) };
}

const simDays = (page: Page) => page.evaluate(() => window.__WORLD__!.simTime()!.days);
const pauseTime = async (page: Page) => {
  const pause = page.getByRole('button', { name: 'Pause time' });
  if (await pause.isVisible()) await pause.click();
};

test.describe('flying and following (T061), motion on', () => {
  test('AC-4: flies to Earth in ≤ 2 s of Space time and frames it: a third of the clear side, centred, lit side towards us', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await openAt(page, 'stylised');
    await waitForBackground(page); // imagery uploads would stall frames (learnings, 022)
    const start = await simDays(page);
    await selectFromList(page, 'Earth');
    expect((await selection(page)).flying).toBe(true);
    await waitForFly(page);
    const flewDays = (await simDays(page)) - start;
    expect(flewDays / 7).toBeLessThanOrEqual(2 + 0.2); // time runs at 1 week per Space second; a frame or two of slack
    await pauseTime(page);
    await frames(page);
    const { fill, off } = await framing(page, 'earth');
    expect(fill).toBeGreaterThanOrEqual(0.28);
    expect(fill).toBeLessThanOrEqual(0.38);
    expect(off).toBeLessThan(4);

    // Seen from the sunlit side: the camera is within 60° of the Sun as seen from Earth, so the middle of the disc
    // (the part facing us) is lit, brighter than the limb on the far side from the Sun.
    const snap = await snapshot(page);
    const earth = snap.bodies.find((b) => b.id === 'earth')!;
    const sun = snap.bodies.find((b) => b.id === 'sun')!;
    const toSun = sun.world.clone().sub(earth.world).normalize();
    const toCamera = snap.camera.position.clone().sub(earth.world).normalize();
    expect((toCamera.angleTo(toSun) * 180) / Math.PI).toBeLessThan(60);
    const pixels = await canvasRgba(page);
    const scale = pixels.width / snap.width;
    const luminance = (world: Vector3) => {
      const ndc = world.clone().project(snap.camera);
      const x = Math.round(((ndc.x + 1) / 2) * snap.width * scale);
      const y = Math.round(((1 - ndc.y) / 2) * snap.height * scale);
      const i = (y * pixels.width + x) * 4;
      return 0.2126 * pixels.data[i]! + 0.7152 * pixels.data[i + 1]! + 0.0722 * pixels.data[i + 2]!;
    };
    // Across the disc, away from the Sun: the Sun's direction with the line of sight taken out.
    const away = toSun.clone().addScaledVector(toCamera, -toSun.dot(toCamera)).normalize().negate();
    const middle = luminance(earth.world.clone().addScaledVector(toCamera, earth.radius));
    const farLimb = luminance(earth.world.clone().addScaledVector(away, 0.8 * earth.radius));
    expect(middle).toBeGreaterThan(farLimb);
  });

  test('AC-5: follows Mars at 1 month per second with a still camera; a drag-orbit keeps it centred; a pan ends following', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await openAt(page, 'stylised');
    await waitForBackground(page);
    await selectFromList(page, 'Mars');
    await waitForFly(page);
    await page.getByLabel('Speed').selectOption({ label: '1 month per second' });
    const startDays = await simDays(page);
    let worst = 0;
    for (let i = 0; i < 12; i++) {
      await frames(page);
      worst = Math.max(worst, (await framing(page, 'mars')).off);
    }
    expect((await simDays(page)) - startDays).toBeGreaterThan(3); // Mars really moved (≥ 0.1 Space s)
    expect(worst).toBeLessThan(4);

    const spot = await emptySpot(page);
    await page.mouse.move(spot.x, spot.y);
    await page.mouse.down();
    await page.mouse.move(spot.x + 80, spot.y, { steps: 6 });
    await page.mouse.up();
    for (let i = 0; i < 4; i++) await frames(page);
    expect((await framing(page, 'mars')).off).toBeLessThan(4);
    expect((await selection(page)).following).toBe(true);

    await page.locator('#app canvas').focus();
    await page.keyboard.press('Shift+ArrowLeft'); // a pan
    for (let i = 0; i < 4; i++) await frames(page);
    expect(await selection(page)).toMatchObject({ id: 'mars', following: false });
    await expect(card(page)).toBeVisible();
  });

  test('AC-6: a wheel during the flight cancels it, with no jump between frames', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await openAt(page, 'stylised');
    await waitForBackground(page);
    await selectFromList(page, 'Neptune');
    await frames(page);
    expect((await selection(page)).flying).toBe(true);
    const spot = await emptySpot(page);
    await page.mouse.move(spot.x, spot.y);
    // Pose and wheel in one task: a CDP wheel lands an unknown number of flight frames after a separate
    // pose read, which flaked under full-suite load (the flight's own progress, not a snap).
    const { before, after } = await page.evaluate(async ({ x, y }) => {
      const world = window.__WORLD__!;
      const before = world.cameraPose()!;
      document
        .querySelector('#app canvas')!
        .dispatchEvent(
          new WheelEvent('wheel', { deltaY: -100, clientX: x, clientY: y, bubbles: true, cancelable: true }),
        );
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      return { before, after: world.cameraPose()! };
    }, spot);
    expect((await selection(page)).flying).toBe(false);
    await frames(page);
    const later = await cameraPose(page);
    expect(rotationBetween(before, after)).toBeLessThan(2); // no snap to the destination
    expect(rotationBetween(after, later)).toBeLessThan(1); // and nothing carries on flying
    expect((await selection(page)).id).toBe('neptune');
  });

  test('AC-7: at real scale the Moon is framed and steady (no depth flicker) with time paused', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await openAt(page, 'real');
    await waitForBackground(page);
    await selectFromList(page, 'Moon');
    await waitForFly(page);
    await pauseTime(page);
    for (let i = 0; i < 3; i++) await frames(page);
    const { fill, off } = await framing(page, 'moon');
    expect(fill).toBeGreaterThanOrEqual(0.28);
    expect(fill).toBeLessThanOrEqual(0.38);
    expect(off).toBeLessThan(4);
    const shots = [];
    for (let i = 0; i < 5; i++) {
      shots.push(await canvasRgba(page));
      await frames(page);
    }
    for (let i = 1; i < shots.length; i++) {
      expect(meanPixelDifference(shots[i - 1]!.data, shots[i]!.data)).toBeLessThan(0.5);
    }
  });

  test('AC-8: after moving the camera, a scale switch keeps Saturn selected and frames it again', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await openAt(page, 'stylised');
    await waitForBackground(page);
    await selectFromList(page, 'Saturn');
    await waitForFly(page);
    await pauseTime(page);
    const spot = await emptySpot(page);
    await page.mouse.move(spot.x, spot.y);
    await page.mouse.wheel(0, 300); // zoom out: off the framed distance
    await frames(page);
    await page.getByRole('button', { name: 'True scale' }).click();
    for (let i = 0; i < 3; i++) await frames(page);
    expect((await selection(page)).id).toBe('saturn');
    const { fill, off } = await framing(page, 'saturn');
    expect(fill).toBeGreaterThanOrEqual(0.28);
    expect(fill).toBeLessThanOrEqual(0.38);
    expect(off).toBeLessThan(4);
  });
});

/**
 * One frame's labels and camera, read together (labels and bodies move every frame): each shown label's name box
 * and where it should start, from the body's projected centre and radius (D-037: 7 px beside a dot under 3 px,
 * else radius + 4 px; on the left near the right edge).
 */
async function labelReading(page: Page) {
  const snap = await page.evaluate(() => {
    const world = window.__WORLD__!;
    const box = document.querySelector('#app canvas')!.getBoundingClientRect();
    const labels = [...document.querySelectorAll<HTMLElement>('.body-marker:not([hidden])')].map((el) => {
      const name = el.querySelector<HTMLElement>('.body-marker-name')!;
      const r = name.hidden ? null : name.getBoundingClientRect();
      return {
        id: el.dataset.body!,
        left: el.classList.contains('is-left'),
        name: r ? { left: r.left, right: r.right, top: r.top, bottom: r.bottom } : null,
      };
    });
    return {
      pose: world.cameraPose()!,
      projection: world.cameraProjection()!,
      bodies: world.bodies(),
      labels,
      width: box.width,
      height: box.height,
    };
  });
  const camera = cameraFrom(snap);
  const tanHalf = Math.tan((camera.fov * Math.PI) / 360);
  return snap.labels.map((label) => {
    const b = snap.bodies.find((x) => x.id === label.id)!;
    const p = new Vector3(...b.world);
    const ndc = p.clone().project(camera);
    const x = ((ndc.x + 1) / 2) * snap.width;
    const y = ((1 - ndc.y) / 2) * snap.height;
    const rPx = (b.radius * (snap.height / 2)) / (camera.position.distanceTo(p) * tanHalf);
    const offset = rPx >= 3 ? Math.round(rPx + 4) : 7;
    return { ...label, x, y, offset };
  });
}

test.describe('labels, placement, time and lifecycle (T062)', () => {
  for (const [width, height] of [
    [1280, 720],
    [320, 640],
  ] as const) {
    test(`AC-14: stylised labels sit beside their bodies as time runs, without overlapping (${width}×${height})`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height });
      await openAt(page, 'stylised');
      await page.getByLabel('Speed').selectOption({ label: '1 month per second' });
      for (let k = 0; k < 3; k++) {
        await frames(page);
        const labels = await labelReading(page);
        expect(labels.map((l) => l.id)).toEqual(expect.arrayContaining(['sun', 'jupiter', 'saturn']));
        const named = labels.filter((l) => l.name);
        for (const l of named) {
          const edge = l.left ? l.x - l.name!.right : l.name!.left - l.x;
          // The name's near edge sits its offset from the centre (± 4 px; text padding and rounding).
          expect(Math.abs(edge - l.offset), `${l.id} name edge`).toBeLessThanOrEqual(4);
          expect(
            Math.abs((l.name!.top + l.name!.bottom) / 2 - l.y),
            `${l.id} name height`,
          ).toBeLessThanOrEqual(4);
        }
        for (const [i, a] of named.entries()) {
          for (const b of named.slice(i + 1)) {
            const overlap =
              a.name!.left < b.name!.right - 1 &&
              b.name!.left < a.name!.right - 1 &&
              a.name!.top < b.name!.bottom - 1 &&
              b.name!.top < a.name!.bottom - 1;
            expect(overlap, `${a.id} and ${b.id} names overlap`).toBe(false);
          }
        }
      }
    });
  }

  test('AC-14: a drag that starts on a name orbits the camera (labels never block the 3D view)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await openAt(page, 'stylised');
    await page.getByRole('button', { name: 'Pause time' }).click();
    await frames(page);
    const name = page.locator('.body-marker[data-body="jupiter"] .body-marker-name');
    const box = (await name.boundingBox())!;
    const before = await cameraPose(page);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 70, box.y + box.height / 2, { steps: 6 });
    await page.mouse.up();
    await frames(page);
    expect(rotationBetween(before, await cameraPose(page))).toBeGreaterThan(1);
  });

  for (const [width, height] of [
    [1280, 720],
    [320, 640],
  ] as const) {
    test(`AC-11: the selected body is clear of the panel; the panel stays within 35 % on phones (${width}×${height})`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height });
      await openAt(page, 'stylised');
      await waitForBackground(page);
      await selectFromList(page, 'Saturn');
      await waitForFly(page);
      await frames(page);
      const saturn = (await project(page)).bodies.find((b) => b.id === 'saturn')!;
      const top = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.tagName, saturn);
      expect(top).toBe('CANVAS');
      if (width <= 640) {
        const sheet = (await page.locator('.info').boundingBox())!;
        expect((sheet.width * sheet.height) / (width * height)).toBeLessThanOrEqual(0.35);
      }
    });
  }

  test('AC-9, AC-11: on a phone, selecting from far down the list scrolls the sheet back to the facts', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await openAt(page, 'stylised');
    await selectFromList(page, 'Neptune'); // the last row: Playwright scrolls the sheet down to tap it
    await frames(page);
    const region = (await page.locator('.info-panel').boundingBox())!;
    const heading = (await card(page).getByRole('heading', { name: 'Neptune' }).boundingBox())!;
    expect(heading.y).toBeGreaterThanOrEqual(region.y);
    expect(heading.y + heading.height).toBeLessThanOrEqual(region.y + region.height);
  });

  test('AC-15: selecting, flying and closing leave the clock alone; the turntable holds while selected', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await openAt(page, 'stylised');
    await waitForBackground(page);
    const clock = () => page.evaluate(() => window.__WORLD__!.simTime()!);
    const before = await clock();
    await selectFromList(page, 'Jupiter');
    await waitForFly(page);
    // Hold for 5 s of Space time (past the turntable's 4 s idle delay): days advance at 7 per second.
    const fromDays = (await clock()).days;
    const view = async () => {
      const snap = await snapshot(page);
      const jupiter = snap.bodies.find((b) => b.id === 'jupiter')!;
      return snap.camera.position.clone().sub(jupiter.world).normalize();
    };
    const held = await view();
    await page.waitForFunction((d) => window.__WORLD__!.simTime()!.days >= d, fromDays + 35, {
      polling: 'raf',
      timeout: 30_000,
    });
    expect((await view()).angleTo(held)).toBeLessThan(0.01); // no turntable orbit round Jupiter
    await page.keyboard.press('Escape');
    const after = await clock();
    expect(after.speed).toBe(before.speed);
    expect(after.playing).toBe(before.playing);
    expect(after.days).toBeGreaterThan(before.days);
  });
});

test.describe('lifecycle (T062), reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('AC-16: 10 round trips, each selecting a body, return GPU memory and DOM to the baseline', async ({
    page,
  }) => {
    const toGallery = async () => {
      await page.evaluate(() => (window.location.hash = '#/'));
      await expect(page.locator('body')).toHaveAttribute('data-view', 'gallery');
      await expect(page.locator('body')).toHaveAttribute('data-space-ready', 'true');
    };
    // The "<title> loaded" announcer is created on the first slow load and kept for the app's lifetime (learnings).
    const measure = () =>
      page.evaluate(() => ({
        elements: document.querySelectorAll('#app *:not(.loading-announcer)').length,
        memory: window.__WORLD__!.memory(),
      }));
    await gotoSpace(page, ID); // warm-up: renderer-lifetime resources (learnings)
    await toGallery();
    const baseline = await measure();
    for (let i = 0; i < 10; i++) {
      await page.evaluate((id) => window.__WORLD__!.navigate(id), ID);
      await expect(page.locator('body')).toHaveAttribute('data-space-ready', 'true');
      await selectFromList(page, ['Mars', 'Saturn', 'Moon'][i % 3]!);
      await frames(page);
      expect((await selection(page)).id).not.toBeNull();
      await toGallery();
      await expect(page.locator('.body-card, .body-list')).toHaveCount(0);
    }
    expect(await measure()).toEqual(baseline);
  });

  test('AC-16: after a context loss Mars is still selected and followed; a new visit starts with none', async ({
    page,
  }) => {
    await openAt(page, 'stylised');
    await selectFromList(page, 'Mars');
    await frames(page);
    await page.evaluate(() => window.__WORLD__!.loseContext());
    await expect(page.locator('body')).toHaveAttribute('data-webgl', 'lost', { timeout: 1000 });
    await page.evaluate(() => window.__WORLD__!.restoreContext());
    await expect(page.locator('body')).not.toHaveAttribute('data-webgl', /.*/);
    await expect(page.locator('body')).toHaveAttribute('data-space-ready', 'true');
    await frames(page);
    expect(await selection(page)).toMatchObject({ id: 'mars', following: true });
    await expect(card(page).getByRole('heading', { name: 'Mars' })).toBeVisible();
    await expect(listButton(page, 'Mars')).toHaveAttribute('aria-pressed', 'true');
    const { off } = await framing(page, 'mars');
    expect(off).toBeLessThan(4);

    await page.evaluate(() => (window.location.hash = '#/'));
    await expect(page.locator('body')).toHaveAttribute('data-view', 'gallery');
    await page.evaluate((id) => window.__WORLD__!.navigate(id), ID);
    await expect(page.locator('body')).toHaveAttribute('data-space-ready', 'true');
    expect((await selection(page)).id).toBeNull();
    await expect(card(page)).toBeHidden();
  });
});
