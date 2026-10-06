import type { Page } from '@playwright/test';
import { Quaternion, Raycaster, Vector2, Vector3 } from 'three';
import { BODIES } from '../../src/spaces/solar-system/data';
import { canvasRgba, expect, gotoSpace, test, waitForBackground } from './fixtures';
import { frames, project, snapshot } from './solar-helpers';

// Spec 022, T060 — surfaces (AC-1–AC-3) and Earth (AC-4–AC-6), at real scale, where the re-centring zoom (D-023)
// brings any body close. Each check compares two pages that follow the same zoom path to the same camera pose
// (verified): one with the imagery, one with a map (or all maps) answering 404, so lighting, framing and date
// are identical and only the image differs.

const ID = 'solar-system';
/** Maps with no surface detail to show, as the T001 survey recorded: banding too faint to measure. */
const FEATURELESS = new Set(['uranus', 'neptune']);
const CLOSE_PX = 120;
const FIXED_DATE = Date.UTC(2026, 9, 6, 12);

test.use({ reducedMotion: 'reduce', viewport: { width: 1280, height: 720 } });

/**
 * Opens at real scale with the imagery settled, on a fixed date: paired pages must agree on it, and "today" is the
 * wall clock at each open (seconds apart under load: enough to turn Earth visibly). `blocked` files (or every
 * map, with '*') answer 404.
 */
async function open(page: Page, blocked: string[] = []) {
  if (blocked.length) {
    await page.route('**/assets/solar-system/*.ktx2', (route) => {
      const file = new URL(route.request().url()).pathname.split('/').pop()!;
      return blocked.includes('*') || blocked.includes(file)
        ? route.fulfill({ status: 404 })
        : route.continue();
    });
  }
  await gotoSpace(page, ID);
  await waitForBackground(page);
  await setDate(page, FIXED_DATE);
  await page.getByRole('button', { name: 'True scale' }).click();
  await frames(page);
}

/** Wheels at the body until it is drawn `px` in radius: re-centres on it, then follows it (D-023). */
async function closeUp(page: Page, id: string, px = CLOSE_PX) {
  await page.getByRole('button', { name: 'Reset view' }).click();
  await frames(page);
  for (let i = 0; i < 200; i++) {
    const b = (await project(page)).bodies.find((v) => v.id === id)!;
    if (b.radiusPx >= px) return;
    await page.mouse.move(b.x, b.y);
    await page.mouse.wheel(0, b.radiusPx > px / 3 ? -60 : -400);
    await frames(page);
  }
  throw new Error(`${id}: never drawn ${px} px`);
}

const setDate = async (page: Page, utcMs: number) => {
  await page.evaluate(
    (d) => window.__WORLD__!.setSimTime(d),
    (utcMs - Date.UTC(2000, 0, 1, 12)) / 86_400_000,
  );
  await frames(page);
};

/** A rendered view of one body: pixels, the camera and bodies, and the body's disc in canvas pixels. */
async function view(page: Page, id: string) {
  const snap = await snapshot(page);
  const pixels = await canvasRgba(page);
  const body = snap.bodies.find((b) => b.id === id)!;
  const k = pixels.width / snap.width;
  const centre = body.world.clone().project(snap.camera);
  const distance = snap.camera.position.distanceTo(body.world);
  const radiusPx =
    ((body.radius * (snap.height / 2)) / (distance * Math.tan((snap.camera.fov * Math.PI) / 360))) * k;
  return {
    snap,
    pixels,
    body,
    cx: ((centre.x + 1) / 2) * pixels.width,
    cy: ((1 - centre.y) / 2) * pixels.height,
    r: radiusPx,
  };
}
type View = Awaited<ReturnType<typeof view>>;

const lum = (v: View, x: number, y: number) => {
  const i = (y * v.pixels.width + x) * 4;
  return 0.2126 * v.pixels.data[i]! + 0.7152 * v.pixels.data[i + 1]! + 0.0722 * v.pixels.data[i + 2]!;
};

/** Visits the disc's pixels within `fraction` of its radius. */
function inDisc(v: View, fraction: number, visit: (x: number, y: number) => void) {
  const r = fraction * v.r;
  for (let y = Math.ceil(v.cy - r); y < v.cy + r; y++)
    for (let x = Math.ceil(v.cx - r) + 1; x < v.cx + r - 1; x++)
      if (Math.hypot(x - v.cx, y - v.cy) <= r) visit(x, y);
}

/** Surface detail: mean |second difference| of luminance along rows (shading gradients cancel; texture doesn't). */
function detail(v: View) {
  let sum = 0;
  let n = 0;
  inDisc(v, 0.7, (x, y) => {
    sum += Math.abs(lum(v, x + 1, y) - 2 * lum(v, x, y) + lum(v, x - 1, y));
    n++;
  });
  return sum / n;
}

/** Mean |RGB difference| between two renders over the pixels `where` accepts. */
function difference(a: View, b: View, where: (x: number, y: number) => boolean = () => true) {
  let sum = 0;
  let n = 0;
  inDisc(a, 0.95, (x, y) => {
    if (!where(x, y)) return;
    const i = (y * a.pixels.width + x) * 4;
    for (let c = 0; c < 3; c++) sum += Math.abs(a.pixels.data[i + c]! - b.pixels.data[i + c]!) / 3;
    n++;
  });
  return { mean: sum / n, n };
}

/** Same camera in both pages (the comparison is only meaningful then). */
function expectSamePose(a: View, b: View) {
  expect(a.snap.camera.position.distanceTo(b.snap.camera.position)).toBeLessThan(
    1e-6 * a.snap.camera.position.length(),
  );
}

/** The surface under a canvas pixel: its normal and the cosine of the Sun's angle there; null off the body. */
function surfaceAt(v: View, x: number, y: number) {
  const ndc = new Vector2((x / v.pixels.width) * 2 - 1, 1 - (y / v.pixels.height) * 2);
  const raycaster = new Raycaster();
  raycaster.setFromCamera(ndc, v.snap.camera);
  const { origin, direction } = raycaster.ray;
  const oc = origin.clone().sub(v.body.world);
  const b = oc.dot(direction);
  const c = oc.lengthSq() - v.body.radius ** 2;
  if (b * b - c < 0) return null;
  const point = origin.clone().addScaledVector(direction, -b - Math.sqrt(b * b - c));
  const normal = point.clone().sub(v.body.world).normalize();
  const sun = v.snap.bodies.find((s) => s.id === 'sun')!.world;
  return { normal, cosSun: normal.dot(sun.clone().sub(point).normalize()) };
}

test.describe('surfaces (AC-1–AC-3)', () => {
  // AC-1: four groups in parallel; each body close up, textured vs plain colours at the same pose.
  const groups = [BODIES.slice(0, 4), BODIES.slice(4, 8), BODIES.slice(8, 12), BODIES.slice(12)];
  for (const group of groups) {
    test(`AC-1: ${group.map((b) => b.id).join(', ')} are drawn with their imagery`, async ({
      page,
      allowConsoleErrors,
    }) => {
      test.setTimeout(120_000);
      allowConsoleErrors.push('404');
      const plain = await page.context().newPage();
      await Promise.all([open(page), open(plain, ['*'])]);
      for (const { id } of group) {
        const [textured, coloured] = await Promise.all(
          [page, plain].map(async (p) => {
            await closeUp(p, id);
            return view(p, id);
          }),
        );
        expectSamePose(textured!, coloured!);
        // Its image changes how it looks (all ≥ 6.8 when measured; Venus lowest)…
        expect(difference(textured!, coloured!).mean, id).toBeGreaterThan(4);
        // …and shows detail a plain sphere doesn't, except where the map itself is near-featureless (T001).
        if (!FEATURELESS.has(id)) expect(detail(textured!), id).toBeGreaterThan(detail(coloured!) + 0.15);
      }
      await plain.close();
    });
  }

  test('AC-2: as time runs, the Moon’s surface turns the way its orientation says', async ({
    page,
    allowConsoleErrors,
  }) => {
    allowConsoleErrors.push('404');
    // Textured over plain luminance at the same pose and date leaves the map alone: the shading, which changes as
    // the surface turns towards or away from the Sun, cancels.
    const plain = await page.context().newPage();
    const start = Date.UTC(2026, 9, 6, 12);
    const frame = async () => {
      const [t, p] = await Promise.all([view(page, 'moon'), view(plain, 'moon')]);
      expectSamePose(t, p);
      return { ...t, ratio: (x: number, y: number) => lum(t, x, y) / Math.max(lum(p, x, y), 1) };
    };
    await Promise.all(
      [page, plain].map(async (p, k) => {
        await open(p, k ? ['*'] : []);
        await setDate(p, start);
        await closeUp(p, 'moon');
      }),
    );
    const a = await frame();
    await Promise.all([page, plain].map((p) => setDate(p, start + 86_400_000))); // a day on: ~13° of spin
    const b = await frame();
    await plain.close();

    // Each lit pixel of B, traced back to A under a hypothesis for how the surface turned in between: the
    // app's reported rotation should explain B far better than no turn or the reverse turn.
    const turn = b.body.quaternion.clone().multiply(a.body.quaternion.clone().invert()); // world, A → B
    const hypotheses = { reported: turn.clone().invert(), none: new Quaternion(), reverse: turn };
    const error = (back: Quaternion) => {
      let sum = 0;
      let n = 0;
      inDisc(b, 0.8, (x, y) => {
        const surface = surfaceAt(b, x, y);
        if (!surface || surface.cosSun < 0.3) return;
        const point = surface.normal.clone().applyQuaternion(back);
        const toCamera = a.snap.camera.position.clone().sub(a.body.world).normalize();
        if (point.dot(toCamera) < 0.3) return; // hidden or grazing in A
        const ndc = point.multiplyScalar(a.body.radius).add(a.body.world).project(a.snap.camera);
        const [ax, ay] = [
          Math.round(((ndc.x + 1) / 2) * a.pixels.width),
          Math.round(((1 - ndc.y) / 2) * a.pixels.height),
        ];
        const lit = surfaceAt(a, ax, ay);
        if (!lit || lit.cosSun < 0.3) return;
        sum += Math.abs(b.ratio(x, y) - a.ratio(ax, ay));
        n++;
      });
      return { mean: sum / n, n };
    };
    const results = Object.fromEntries(Object.entries(hypotheses).map(([name, q]) => [name, error(q)]));
    expect((turn.angleTo(new Quaternion()) * 180) / Math.PI).toBeGreaterThan(5);
    for (const result of Object.values(results)) expect(result.n).toBeGreaterThan(2000);
    // Measured: reported 0.023, none 0.078, reverse 0.087.
    expect(results.reported!.mean).toBeLessThan(0.5 * results.none!.mean);
    expect(results.reported!.mean).toBeLessThan(0.5 * results.reverse!.mean);
  });

  test('AC-3: with imagery, the sunward side is brighter and the night side still shows against the sky', async ({
    page,
  }) => {
    await open(page);
    await setDate(page, Date.UTC(2026, 9, 6, 12)); // a fixed date: which bodies show both sides depends on it
    let checked = 0;
    for (const id of ['moon', 'mars', 'jupiter', 'saturn']) {
      await closeUp(page, id);
      const v = await view(page, id);
      const sides = { day: [] as number[], night: [] as number[], sky: [] as number[] };
      inDisc(v, 0.9, (x, y) => {
        const s = surfaceAt(v, x, y);
        if (s && s.cosSun > 0.4) sides.day.push(lum(v, x, y));
        if (s && s.cosSun < -0.4) sides.night.push(lum(v, x, y));
      });
      for (let a = 0; a < 2 * Math.PI; a += 0.05) {
        const [x, y] = [
          Math.round(v.cx + 1.2 * v.r * Math.cos(a)),
          Math.round(v.cy + 1.2 * v.r * Math.sin(a)),
        ];
        if (x >= 0 && y >= 0 && x < v.pixels.width && y < v.pixels.height) sides.sky.push(lum(v, x, y));
      }
      if (sides.day.length < 500 || sides.night.length < 500) continue; // this body's phase hides a side
      const median = (xs: number[]) => xs.sort((p, q) => p - q)[Math.floor(xs.length / 2)]!;
      const [day, night, sky] = [median(sides.day), median(sides.night), median(sides.sky)];
      expect(day, `${id}: day ${day}, night ${night}`).toBeGreaterThan(night + 20);
      expect(night, `${id}: night ${night}, sky ${sky}`).toBeGreaterThan(sky + 2); // D-028's ambient
      checked++;
    }
    expect(checked).toBeGreaterThanOrEqual(2);
  });
});

test.describe('Earth (AC-4–AC-6)', () => {
  /** Earth close up on `utcMs` in two pages: with every layer, and with `without` answering 404 (plus `both`). */
  async function earthPair(page: Page, without: string[], utcMs: number, both: string[] = []) {
    const other = await page.context().newPage();
    await Promise.all([open(page, both), open(other, [...both, ...without])]);
    const [full, reduced] = await Promise.all(
      [page, other].map(async (p) => {
        await setDate(p, utcMs);
        await closeUp(p, 'earth', 160);
        return view(p, 'earth');
      }),
    );
    await other.close();
    expectSamePose(full!, reduced!);
    return { full: full!, reduced: reduced! };
  }
  const side = (v: View, test: (cosSun: number) => boolean) => (x: number, y: number) => {
    const s = surfaceAt(v, x, y);
    return s !== null && test(s.cosSun);
  };

  test('AC-4: the cloud layer changes Earth’s day side', async ({ page, allowConsoleErrors }) => {
    allowConsoleErrors.push('404');
    const { full, reduced } = await earthPair(page, ['earth-clouds.ktx2'], Date.UTC(2026, 9, 6, 12));
    const day = difference(
      full,
      reduced,
      side(full, (c) => c > 0.3),
    );
    expect(day.n).toBeGreaterThan(5000);
    expect(day.mean).toBeGreaterThan(5); // measured 34.7
  });

  test('AC-5: city lights show on the night side, fade across the terminator and never on the day side', async ({
    page,
    allowConsoleErrors,
  }) => {
    allowConsoleErrors.push('404');
    // 00:00 UTC: the night side facing the camera holds Europe, Africa and Asia's lights.
    const { full, reduced } = await earthPair(page, ['earth-night.ktx2'], Date.UTC(2026, 9, 6, 0));
    const isNight = side(full, (c) => c < -0.15);
    const night = difference(full, reduced, isNight);
    const day = difference(
      full,
      reduced,
      side(full, (c) => c > 0.15),
    );
    let brightest = 0;
    inDisc(full, 0.95, (x, y) => {
      if (isNight(x, y)) brightest = Math.max(brightest, lum(full, x, y) - lum(reduced, x, y));
    });
    expect(night.n).toBeGreaterThan(5000);
    expect(night.mean).toBeGreaterThan(2); // measured 15
    expect(brightest).toBeGreaterThan(50); // cities, not a uniform glow (measured 195)
    expect(day.n).toBeGreaterThan(5000);
    expect(day.mean).toBeLessThan(0.05); // measured 0.000
  });

  test('AC-6: oceans shine near the Sun’s reflection; land doesn’t', async ({ page, allowConsoleErrors }) => {
    allowConsoleErrors.push('404');
    // 12:00 UTC: the reflection falls on open ocean. Clouds off in both pages, so water and land show.
    const { full, reduced } = await earthPair(page, ['earth-ocean.ktx2'], Date.UTC(2026, 9, 6, 12), [
      'earth-clouds.ktx2',
    ]);
    // Ocean and land by colour in the matte render: water is blue-dominant.
    const colour = (v: View, x: number, y: number) => {
      const i = (y * v.pixels.width + x) * 4;
      return [v.pixels.data[i]!, v.pixels.data[i + 1]!, v.pixels.data[i + 2]!] as const;
    };
    const isOcean = (x: number, y: number) => {
      const [r, , b] = colour(reduced, x, y);
      return b > r + 15;
    };
    const isLand = (x: number, y: number) => {
      const [r, , b] = colour(reduced, x, y);
      return r > b + 15;
    };
    // The glint: where the surface normal halves the Sun and camera directions.
    const sun = full.snap.bodies.find((s) => s.id === 'sun')!.world;
    const half = sun
      .clone()
      .sub(full.body.world)
      .normalize()
      .add(full.snap.camera.position.clone().sub(full.body.world).normalize())
      .normalize();
    const nearGlint = (x: number, y: number) => {
      const s = surfaceAt(full, x, y);
      return s !== null && s.normal.dot(half) > Math.cos((15 * Math.PI) / 180);
    };
    const ocean = difference(full, reduced, (x, y) => nearGlint(x, y) && isOcean(x, y));
    const land = difference(full, reduced, (x, y) => isLand(x, y) && side(full, (c) => c > 0.1)(x, y));
    expect(ocean.n).toBeGreaterThan(500);
    expect(ocean.mean).toBeGreaterThan(10); // measured 62.8
    expect(land.n).toBeGreaterThan(500);
    expect(land.mean).toBeLessThan(1.5); // measured 0.23
  });
});

// T061 — Saturn's rings and shadows (AC-7, AC-8), the sky (AC-9) and the Sun's glow (AC-10).

const SATURN = BODIES.find((b) => b.id === 'saturn')!;
const RING = {
  inner: SATURN.rings!.innerKm / SATURN.radiusKm,
  outer: SATURN.rings!.outerKm / SATURN.radiusKm,
};

/**
 * What a canvas pixel sees around Saturn, traced in Saturn's own frame (unit radius, ring plane y = 0, from the
 * app's reported orientation): the planet, the ring (radius in Saturn radii), and whether each is shadowed.
 */
function traceSaturn(v: View, x: number, y: number) {
  const ndc = new Vector2((x / v.pixels.width) * 2 - 1, 1 - (y / v.pixels.height) * 2);
  const raycaster = new Raycaster();
  raycaster.setFromCamera(ndc, v.snap.camera);
  const inverse = v.body.quaternion.clone().invert();
  const o = raycaster.ray.origin
    .clone()
    .sub(v.body.world)
    .divideScalar(v.body.radius)
    .applyQuaternion(inverse);
  const d = raycaster.ray.direction.clone().applyQuaternion(inverse);
  const sunWorld = v.snap.bodies.find((s) => s.id === 'sun')!.world;
  const s = sunWorld.clone().sub(v.body.world).applyQuaternion(inverse).normalize();
  const sphere = (p: Vector3, dir: Vector3) => {
    const b = p.dot(dir);
    const c = p.lengthSq() - 1;
    return b * b - c < 0 ? Infinity : -b - Math.sqrt(b * b - c) > 0 ? -b - Math.sqrt(b * b - c) : Infinity;
  };
  const planetT = sphere(o, d);
  const ringT = Math.abs(d.y) > 1e-9 && -o.y / d.y > 0 ? -o.y / d.y : Infinity;
  const ringPoint = o.clone().addScaledVector(d, ringT);
  const ringRadius = Math.hypot(ringPoint.x, ringPoint.z);
  const onRing = ringT < planetT && ringRadius > RING.inner && ringRadius < RING.outer;
  const planetPoint = o.clone().addScaledVector(d, planetT);
  const onPlanet =
    planetT < Infinity && !(ringT < planetT && ringRadius > RING.inner && ringRadius < RING.outer);
  // Ring point → Sun hits the planet; planet point → Sun crosses the ring band.
  const ringShadowed = onRing && sphere(ringPoint, s) < Infinity;
  const t = -planetPoint.y / s.y;
  const crossing = Math.hypot(planetPoint.x + t * s.x, planetPoint.z + t * s.z);
  const planetShadowed = onPlanet && t > 0 && crossing > RING.inner + 0.02 && crossing < RING.outer - 0.02;
  const planetClear = onPlanet && !(t > 0 && crossing > RING.inner - 0.05 && crossing < RING.outer + 0.05);
  return {
    onRing,
    ringRadius,
    ringShadowed,
    onPlanet,
    planetShadowed,
    planetClear,
    cosSun: planetPoint.dot(s),
  };
}

test.describe('Saturn’s rings (AC-7, AC-8)', () => {
  test('AC-7/AC-8: rings around Saturn on 2032-06-01, darker where Saturn and the rings shadow each other', async ({
    page,
    allowConsoleErrors,
  }) => {
    allowConsoleErrors.push('404');
    const plain = await page.context().newPage();
    await Promise.all(
      [page, plain].map(async (p, k) => {
        await open(p, k ? ['*'] : []);
        await setDate(p, Date.UTC(2032, 5, 1));
        await closeUp(p, 'saturn', 100);
      }),
    );
    // Turn both views (the same drags) until Saturn's shadow on the rings, on the far side from the Sun, shows.
    for (let step = 0; step < 14; step++) {
      const v = await view(page, 'saturn');
      let shadowed = 0;
      for (let y = 0; y < v.pixels.height; y += 4)
        for (let x = 0; x < v.pixels.width; x += 4) if (traceSaturn(v, x, y).ringShadowed) shadowed++;
      if (shadowed >= 150) break;
      for (const p of [page, plain]) {
        await p.mouse.move(200, 600);
        await p.mouse.down();
        for (let dx = 10; dx <= 60; dx += 10) await p.mouse.move(200 + dx, 600);
        await p.mouse.up();
        await frames(p);
      }
    }
    const views = await Promise.all([view(page, 'saturn'), view(plain, 'saturn')]);
    expectSamePose(views[0]!, views[1]!);
    await plain.close();
    for (const [name, v] of [
      ['textured', views[0]!],
      ['plain', views[1]!],
    ] as const) {
      const ring: number[] = [];
      const sky: number[] = [];
      const byRadius = new Map<number, { lit: number[]; shadow: number[] }>();
      const planet = { shadow: new Map<number, number[]>(), clear: new Map<number, number[]>() };
      const span = 2.8 * v.r;
      for (let y = Math.max(0, Math.round(v.cy - span)); y < Math.min(v.pixels.height, v.cy + span); y++)
        for (let x = Math.max(0, Math.round(v.cx - span)); x < Math.min(v.pixels.width, v.cx + span); x++) {
          const at = traceSaturn(v, x, y);
          const l = lum(v, x, y);
          if (at.onRing) {
            if (!at.ringShadowed && at.ringRadius > 1.6 && at.ringRadius < 1.95) ring.push(l); // the B ring
            const bin = Math.floor(at.ringRadius / 0.05);
            const entry = byRadius.get(bin) ?? { lit: [], shadow: [] };
            (at.ringShadowed ? entry.shadow : entry.lit).push(l);
            byRadius.set(bin, entry);
          } else if (!at.onPlanet && at.ringRadius > RING.outer + 0.15 && at.ringRadius < RING.outer + 0.5) {
            sky.push(l);
          }
          if (at.cosSun > 0.15) {
            const bin = Math.floor(at.cosSun / 0.1);
            const into = at.planetShadowed ? planet.shadow : at.planetClear ? planet.clear : null;
            if (into) into.set(bin, [...(into.get(bin) ?? []), l]);
          }
        }
      const mean = (xs: number[]) => xs.reduce((p, q) => p + q, 0) / xs.length;
      const median = (xs: number[]) => [...xs].sort((p, q) => p - q)[Math.floor(xs.length / 2)]!;
      // AC-7: the B ring stands out from the sky just beyond the A ring (measured 60.6 / 43.9 vs 6.1).
      expect(median(ring), name).toBeGreaterThan(median(sky) + 20);
      expect(ring.length).toBeGreaterThan(5000);
      // AC-8, Saturn's shadow on the rings: at each radius, shadowed ring pixels are far darker than lit ones
      // on the same face (measured 0.11–0.44).
      const ringBins = [...byRadius.values()].filter((e) => e.lit.length >= 50 && e.shadow.length >= 50);
      expect(ringBins.length, name).toBeGreaterThanOrEqual(5);
      for (const e of ringBins) expect(mean(e.shadow) / mean(e.lit), name).toBeLessThan(0.6);
      // AC-8, the rings' shadow on Saturn: at the same sunlight angle, darker under the rings. Checked on the
      // plain page, where Saturn is one colour (measured 0.82–0.84); the textured bands vary with latitude.
      if (name === 'plain') {
        const ratios = [...planet.shadow]
          .filter(([bin, xs]) => xs.length >= 30 && (planet.clear.get(bin)?.length ?? 0) >= 30)
          .map(([bin, xs]) => mean(xs) / mean(planet.clear.get(bin)!));
        expect(ratios.length).toBeGreaterThanOrEqual(4);
        for (const ratio of ratios) expect(ratio).toBeLessThan(0.92);
        expect(mean(ratios)).toBeLessThan(0.88);
      }
    }
  });
});

test.describe('the sky and the Sun’s glow (AC-9, AC-10)', () => {
  /** A view's star pixels: where the page with stars is brighter than the same pose without them. */
  const starMask = (a: View, b: View) => {
    const mask = new Uint8Array(a.pixels.width * a.pixels.height);
    for (let y = 0; y < a.pixels.height; y++)
      for (let x = 0; x < a.pixels.width; x++)
        if (lum(a, x, y) - lum(b, x, y) > 15) mask[y * a.pixels.width + x] = 1;
    return mask;
  };
  const overlap = (a: Uint8Array, b: Uint8Array) => {
    let both = 0;
    let count = 0;
    for (let i = 0; i < a.length; i++) {
      count += a[i]!;
      both += a[i]! & b[i]!;
    }
    return { fraction: both / count, count };
  };
  const drag = async (page: Page, button: 'left' | 'right', dx: number, dy: number) => {
    await page.mouse.move(400, 500);
    await page.mouse.down({ button });
    for (let k = 1; k <= 8; k++) await page.mouse.move(400 + (dx * k) / 8, 500 + (dy * k) / 8);
    await page.mouse.up({ button });
    await frames(page);
  };

  test('AC-9: stars stay put under pan and zoom, turn with the view, and never draw over a body', async ({
    page,
    allowConsoleErrors,
  }) => {
    allowConsoleErrors.push('404');
    const starless = await page.context().newPage();
    const pages = [page, starless];
    await Promise.all(
      pages.map(async (p, k) => {
        if (k) await p.route('**/assets/solar-system/stars.bin', (route) => route.fulfill({ status: 404 }));
        await gotoSpace(p, ID);
        await waitForBackground(p);
        await setDate(p, FIXED_DATE); // the same date in both pages
        await frames(p);
      }),
    );
    const masks = async () => {
      const [a, b] = await Promise.all(pages.map((p) => view(p, 'sun')));
      expectSamePose(a!, b!);
      return { a: a!, b: b!, mask: starMask(a!, b!) };
    };
    const home = await masks();
    // Bodies draw over the stars: inside every body's disc, the page with stars matches the one without.
    const { snap, pixels } = home.a;
    const k = pixels.width / snap.width;
    for (const body of snap.bodies) {
      const centre = body.world.clone().project(snap.camera);
      const distance = snap.camera.position.distanceTo(body.world);
      const r =
        ((body.radius * (snap.height / 2)) / (distance * Math.tan((snap.camera.fov * Math.PI) / 360))) * k;
      const disc = {
        ...home.a,
        cx: ((centre.x + 1) / 2) * pixels.width,
        cy: ((1 - centre.y) / 2) * pixels.height,
        r,
      };
      let worst = 0;
      inDisc(disc, Math.max(0, 1 - 1.5 / r), (x, y) => {
        worst = Math.max(worst, Math.abs(lum(home.a, x, y) - lum(home.b, x, y)));
      });
      expect(worst, body.id).toBeLessThanOrEqual(2);
    }
    for (const p of pages) await drag(p, 'right', 120, 60); // pan
    const panned = await masks();
    for (const p of pages) {
      await p.mouse.move(640, 360);
      for (let k = 0; k < 3; k++) await p.mouse.wheel(0, -200); // zoom
      await frames(p);
    }
    const zoomed = await masks();
    for (const p of pages) await drag(p, 'left', 200, 0); // rotate
    const turned = await masks();
    await starless.close();
    // At infinity: pan and zoom leave every star pixel in place (measured 100 %); turning moves them (0 %).
    expect(overlap(home.mask, home.mask).count).toBeGreaterThan(150);
    expect(overlap(home.mask, panned.mask).fraction).toBeGreaterThan(0.95);
    expect(overlap(home.mask, zoomed.mask).fraction).toBeGreaterThan(0.95);
    expect(overlap(home.mask, turned.mask).fraction).toBeLessThan(0.2);
  });

  for (const scale of ['stylised', 'real'] as const) {
    test(`AC-10: a halo around the Sun at ${scale} scale`, async ({ page }) => {
      await gotoSpace(page, ID);
      await waitForBackground(page);
      if (scale === 'real') await page.getByRole('button', { name: 'True scale' }).click();
      await frames(page);
      const v = await view(page, 'sun');
      const ring = (from: number, to: number) => {
        const values: number[] = [];
        for (let a = 0; a < 2 * Math.PI; a += 0.02)
          for (let d = from; d <= to; d += 1) {
            const [x, y] = [Math.round(v.cx + d * Math.cos(a)), Math.round(v.cy + d * Math.sin(a))];
            values.push(lum(v, x, y));
          }
        return values.sort((p, q) => p - q)[Math.floor(values.length / 2)]!;
      };
      // Just outside the Sun's disc (real scale: the Sun is under a pixel) vs open sky further out. Measured:
      // 22.4 vs 6.1 stylised, 143.7 vs 6.1 real.
      const r = Math.max(v.r, 1);
      expect(ring(r * 1.1 + 2, r * 1.1 + 8)).toBeGreaterThan(ring(r * 3 + 40, r * 3 + 60) + 10);
    });
  }

  test('AC-10: the glow never draws over the Sun in front of it (plain Sun: its colour, untouched)', async ({
    page,
    allowConsoleErrors,
  }) => {
    allowConsoleErrors.push('404');
    await page.route('**/assets/solar-system/sun.ktx2', (route) => route.fulfill({ status: 404 }));
    await gotoSpace(page, ID);
    await waitForBackground(page);
    await frames(page);
    const v = await view(page, 'sun');
    const colours = new Map<string, number>();
    inDisc(v, 0.8, (x, y) => {
      const i = (y * v.pixels.width + x) * 4;
      const key = `${v.pixels.data[i]},${v.pixels.data[i + 1]},${v.pixels.data[i + 2]}`;
      colours.set(key, (colours.get(key) ?? 0) + 1);
    });
    // Every pixel is the Sun's own colour: the additive halo behind its centre never reaches the disc.
    const sun = BODIES.find((b) => b.id === 'sun')!.colour;
    expect([...colours.keys()]).toEqual([[(sun >> 16) & 255, (sun >> 8) & 255, sun & 255].join(',')]);
  });
});

// T062 — loading (AC-11) and lifecycle (AC-12).

/** Holds requests for `files` (or every map) until `release()`; everything else passes. */
async function holdImagery(page: Page, files: string[] | '*') {
  const held: Array<() => Promise<void>> = [];
  let holding = true;
  await page.route('**/assets/solar-system/*.ktx2', (route) => {
    const file = new URL(route.request().url()).pathname.split('/').pop()!;
    if (holding && (files === '*' || files.includes(file))) held.push(() => route.continue());
    else return route.continue();
  });
  return {
    get count() {
      return held.length;
    },
    async release() {
      holding = false;
      await Promise.all(held.splice(0).map((go) => go()));
    },
  };
}

test.describe('loading and lifecycle (AC-11, AC-12)', () => {
  test('AC-11: usable at once while imagery arrives; the compact indicator shows progress; coloured, then textured', async ({
    page,
  }) => {
    const hold = await holdImagery(page, ['jupiter.ktx2']);
    await gotoSpace(page, ID); // ready without Jupiter's map
    await expect(page.locator('body')).toHaveAttribute('data-space-background', 'loading');
    await expect.poll(() => hold.count).toBe(1);

    // The compact indicator, never in the way, with the bytes so far (Jupiter's map is ~12 % of them).
    const indicator = page.locator('.loading.is-background');
    await expect(indicator).toBeVisible();
    await expect(indicator).toHaveCSS('pointer-events', 'none');
    const percent = () =>
      indicator
        .getByRole('progressbar')
        .getAttribute('aria-valuenow')
        .then((value) => Number(value));
    await expect.poll(percent).toBeGreaterThan(50);
    expect(await percent()).toBeLessThan(100);

    // Usable meanwhile: the scale switch works, and Jupiter can be brought close.
    await page.getByRole('button', { name: 'True scale' }).click();
    await expect(page.getByRole('button', { name: 'True scale' })).toHaveAttribute('aria-pressed', 'true');
    await setDate(page, FIXED_DATE);
    await closeUp(page, 'jupiter');
    const coloured = await view(page, 'jupiter');

    await hold.release();
    await waitForBackground(page);
    await expect(page.locator('.loading')).toHaveCount(0);
    await expect(page.locator('.loading-announcer')).toHaveText('Solar System imagery loaded');
    await frames(page);
    const textured = await view(page, 'jupiter');
    expectSamePose(coloured, textured);
    // Measured: 20.8 apart; detail 0.47 → 1.83.
    expect(difference(textured, coloured).mean).toBeGreaterThan(4);
    expect(detail(textured)).toBeGreaterThan(detail(coloured) + 0.15);
  });

  test('AC-11: a map that fails leaves its body coloured; the rest arrive and the Space works', async ({
    page,
    allowConsoleErrors,
  }) => {
    allowConsoleErrors.push('404');
    const warnings: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'warning') warnings.push(m.text());
    });
    const plain = await page.context().newPage();
    const pages: Array<[Page, string[]]> = [
      [page, ['jupiter.ktx2']],
      [plain, ['*']],
    ];
    const [failing, coloured] = await Promise.all(
      pages.map(async ([p, blocked]) => {
        await open(p, blocked);
        await closeUp(p, 'jupiter');
        return view(p, 'jupiter');
      }),
    );
    expectSamePose(failing!, coloured!);
    // Mars, on the same pages: textured where only Jupiter's map failed.
    const [mars, plainMars] = await Promise.all(
      [page, plain].map(async (p) => {
        await closeUp(p, 'mars');
        return view(p, 'mars');
      }),
    );
    await plain.close();
    expect(difference(failing!, coloured!).mean).toBeLessThan(0.5); // Jupiter: its plain colour (measured 0.00)
    expect(difference(mars!, plainMars!).mean).toBeGreaterThan(4); // the rest arrived (measured 24.9)
    expect(warnings.filter((w) => /imagery/.test(w))).toEqual([
      'Solar System: imagery failed to load, kept plain colours: jupiter:surface',
    ]);
  });

  test('AC-12: 10 round trips, one leaving mid-load, return GPU memory (textures too), DOM and workers to the baseline', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const body = page.locator('body');
    const toGallery = async () => {
      await page.evaluate(() => (window.location.hash = '#/'));
      await expect(body).toHaveAttribute('data-view', 'gallery');
      await expect(body).toHaveAttribute('data-space-ready', 'true');
    };
    const snapshotNow = () =>
      page.evaluate(() => ({
        elements: document.querySelectorAll('#app *:not(.loading-announcer)').length,
        memory: window.__WORLD__!.memory(),
      }));

    await gotoSpace(page, ID); // warm-up: renderer-lifetime resources (learnings)
    await waitForBackground(page);
    await toGallery();
    await expect.poll(() => page.workers().length).toBe(0);
    const baseline = await snapshotNow();

    for (let i = 0; i < 10; i++) {
      if (i === 4) {
        // Leave with every map still on its way; they then arrive to a Space that is gone.
        const held = await holdImagery(page, '*');
        await page.evaluate((id) => window.__WORLD__!.navigate(id), ID);
        await expect(body).toHaveAttribute('data-space-ready', 'true');
        await expect.poll(() => held.count).toBeGreaterThan(0);
        await toGallery();
        await held.release();
        await page.unrouteAll({ behavior: 'wait' });
        continue;
      }
      await page.evaluate((id) => window.__WORLD__!.navigate(id), ID);
      await expect(body).toHaveAttribute('data-space-ready', 'true');
      await waitForBackground(page);
      await frames(page);
      const during = await page.evaluate(() => window.__WORLD__!.memory());
      expect(during.textures).toBeGreaterThanOrEqual(baseline.memory.textures + 20); // the imagery is on the GPU
      await toGallery();
    }
    await expect.poll(() => page.workers().length).toBe(0); // the transcoder's workers are freed
    expect(await snapshotNow()).toEqual(baseline);
  });

  test('AC-12: after a context loss and restore, the imagery is back at the same date and time state', async ({
    page,
  }) => {
    const body = page.locator('body');
    await gotoSpace(page, ID);
    await waitForBackground(page);
    await page.getByRole('combobox', { name: 'Speed' }).selectOption('month');
    await setDate(page, Date.UTC(2032, 5, 1));
    const before = await page.evaluate(() => ({
      time: window.__WORLD__!.simTime(),
      textures: window.__WORLD__!.memory().textures,
    }));

    await page.evaluate(() => window.__WORLD__!.loseContext());
    await expect(body).toHaveAttribute('data-webgl', 'lost', { timeout: 1000 });
    await page.evaluate(() => window.__WORLD__!.restoreContext());
    await expect(body).not.toHaveAttribute('data-webgl', /.*/);
    await expect(body).toHaveAttribute('data-space-ready', 'true');
    await waitForBackground(page);
    await frames(page);

    const after = await page.evaluate(() => ({
      time: window.__WORLD__!.simTime(),
      textures: window.__WORLD__!.memory().textures,
    }));
    expect(after.time).toEqual(before.time); // paused (reduced motion): the same instant, speed and state
    expect(after.textures).toBe(before.textures);
    // The Sun is textured again: many colours across its disc, not its one plain colour.
    const sun = await view(page, 'sun');
    const colours = new Set<number>();
    inDisc(sun, 0.8, (x, y) => {
      const i = (y * sun.pixels.width + x) * 4;
      colours.add((sun.pixels.data[i]! << 16) | (sun.pixels.data[i + 1]! << 8) | sun.pixels.data[i + 2]!);
    });
    expect(colours.size).toBeGreaterThan(50);
  });
});
