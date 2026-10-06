import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  CompressedTexture,
  LineLoop,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Points,
  Quaternion,
  ShaderLib,
  Sprite,
  UniformsUtils,
  Vector3,
  type BufferGeometry,
  type Material,
  type MeshStandardMaterial,
  type ShaderMaterial,
  type WebGLProgramParametersWithUniforms,
} from 'three';
import type { SpaceContext, SpaceInstance } from '../../../../src/core/types';
import { BODIES, SOLAR_SYSTEM } from '../../../../src/spaces/solar-system/data';
import { createSolarSystem, SCALE_PREFERENCE } from '../../../../src/spaces/solar-system';
import { glowSize } from '../../../../src/spaces/solar-system/glow';
import { FADE_SECONDS, imageryJobs } from '../../../../src/spaces/solar-system/imagery';
import { EARTH_NIGHT_INTENSITY } from '../../../../src/spaces/solar-system/materials';
import { createPlacement, layout, systemExtent } from '../../../../src/spaces/solar-system/scale';
import { daysFromEpochMs, RANGE } from '../../../../src/spaces/solar-system/time';
import { frameDistance } from '../../../../src/shared/model-viewer/framing';
import { toScreen } from '../../../../src/shared/hotspots/projection';
import { createFakeContext, memoryStorage } from '../../../helpers/fakes';

// Spec 020: the Space ties data, scale, toggle, markers and controls together (AC-7, AC-8, AC-8a, AC-11,
// AC-12), with the D-023 re-centring zoom at real scale. Spec 021: time moves the bodies (AC-4–AC-12).

const W = 800;
const H = 600;
const FOV_Y = (SOLAR_SYSTEM.camera.fov * Math.PI) / 180;

/** World positions on a date, from the per-date placement (021): each offset plus its parent's. */
const worldAt = (mode: 'stylised' | 'real', days: number) => {
  const offsets = createPlacement(BODIES).at(layout(BODIES, mode), mode, days);
  const world = new Map<string, Vector3>();
  for (const b of BODIES) {
    const { x, y, z } = offsets.get(b.id)!;
    world.set(b.id, new Vector3(x, y, z).add(b.parent ? world.get(b.parent)! : new Vector3()));
  }
  return world;
};

/**
 * The imagery and star seams (spec 022): KTX2 loads that finish when a test says so, and the shipped catalogue
 * once released. Every test opens with these, so none downloads anything.
 */
function stubImagery() {
  const pending = new Map<string, { resolve: (t: CompressedTexture) => void; reject: (e: Error) => void }>();
  const loads: string[] = [];
  const textures: CompressedTexture[] = [];
  const ktx2 = {
    load: vi.fn(
      (url: string) =>
        new Promise<CompressedTexture>((resolve, reject) => {
          const file = url.slice(url.lastIndexOf('/') + 1);
          loads.push(file);
          pending.set(file, { resolve, reject });
        }),
    ),
    dispose: vi.fn(),
  };
  const settle = (file: string) => {
    const entry = pending.get(file)!;
    pending.delete(file);
    return entry;
  };
  const make = () => {
    const t = new CompressedTexture([], 4, 4);
    vi.spyOn(t, 'dispose');
    textures.push(t);
    return t;
  };
  let releaseStars: () => void = () => {};
  const stars = new Promise<void>((r) => (releaseStars = r));
  return {
    ktx2,
    loads,
    textures,
    deps: {
      createKtx2: () => ktx2,
      loadStars: async () => {
        await stars;
        return STARS.buffer.slice(STARS.byteOffset, STARS.byteOffset + STARS.byteLength);
      },
      baseUrl: '/assets/solar-system/',
    },
    finish(file: string) {
      const t = make();
      settle(file).resolve(t);
      return t;
    },
    fail: (file: string) => settle(file).reject(new Error(`404 ${file}`)),
    finishAll() {
      for (const file of [...pending.keys()]) settle(file).resolve(make());
    },
    releaseStars: () => releaseStars(),
  };
}
const STARS = readFileSync('public/assets/solar-system/stars.bin');
/** Lets pending promise callbacks run. */
const flush = () => new Promise((r) => setTimeout(r, 0));

/** Runs a material's onBeforeCompile on three's real shader source and returns the uniforms it binds. */
const uniformsOf = (material: Material) => {
  const lib = material instanceof MeshBasicMaterial ? ShaderLib.basic : ShaderLib.standard;
  const shader = {
    vertexShader: lib.vertexShader,
    fragmentShader: lib.fragmentShader,
    uniforms: UniformsUtils.clone(lib.uniforms),
  } as unknown as WebGLProgramParametersWithUniforms;
  material.onBeforeCompile(shader, undefined as never);
  return shader.uniforms;
};

describe('createSolarSystem', () => {
  let ctx: SpaceContext;
  let storage: Storage;
  let space: SpaceInstance;

  beforeEach(() => {
    ctx = createFakeContext({ reducedMotion: true });
    document.body.replaceChildren(ctx.canvas, ctx.overlay);
    // jsdom has no pointer capture; OrbitControls calls it on pointerdown.
    ctx.canvas.setPointerCapture = vi.fn();
    ctx.canvas.releasePointerCapture = vi.fn();
    storage = memoryStorage();
  });

  afterEach(() => space?.dispose());

  let imagery: ReturnType<typeof stubImagery>;
  const open = async (stored?: string) => {
    if (stored !== undefined) storage.setItem(SCALE_PREFERENCE, JSON.stringify(stored));
    imagery = stubImagery();
    space = await createSolarSystem(ctx, { storage, ...imagery.deps });
    space.resize(W, H);
    space.update(0, 0);
    return space;
  };
  const camera = () => space.camera as PerspectiveCamera;
  const toggle = () => ctx.overlay.querySelector<HTMLButtonElement>('button.scale-toggle')!;
  const markersLayer = () => ctx.overlay.querySelector<HTMLElement>('.body-markers')!;
  const body = (id: string) => space.bodies!().find((b) => b.id === id)!;
  const radiusIn = (mode: 'stylised' | 'real', id: string) => layout(BODIES, mode).get(id)!.radius;
  const homeDistance = (mode: 'stylised' | 'real') =>
    frameDistance(systemExtent(BODIES, layout(BODIES, mode)), FOV_Y, W / H, SOLAR_SYSTEM.camera.fill);
  /** Where a body is drawn on the canvas, from the current camera. */
  const screenOf = (id: string) => {
    camera().updateMatrixWorld();
    return toScreen(new Vector3(...body(id).world), camera(), W, H);
  };
  /** The orbit target, read through the camera: what it looks at, at its current distance from the Sun. */
  const controlsTarget = () => {
    const forward = new Vector3(0, 0, -1).applyQuaternion(camera().quaternion);
    return camera().position.clone().add(forward);
  };
  const looksAt = (id: string) => {
    const forward = new Vector3(0, 0, -1).applyQuaternion(camera().quaternion);
    const toBody = new Vector3(...body(id).world).sub(camera().position).normalize();
    return forward.angleTo(toBody);
  };
  const wheelAt = (x: number, y: number, deltaY = -100) =>
    ctx.canvas.dispatchEvent(
      new WheelEvent('wheel', { clientX: x, clientY: y, deltaY, bubbles: true, cancelable: true }),
    );
  const pointer = (type: string, id: number, x: number, y: number) => {
    const event = new MouseEvent(type, { clientX: x, clientY: y, bubbles: true, cancelable: true });
    Object.defineProperties(event, { pointerId: { value: id }, pointerType: { value: 'touch' } });
    ctx.canvas.dispatchEvent(event);
  };

  describe('scale on open (AC-7)', () => {
    it('opens in stylised scale by default, with name labels (spec 023, AC-14)', async () => {
      await open();
      expect(toggle().getAttribute('aria-pressed')).toBe('false');
      expect(body('earth').radius).toBeCloseTo(radiusIn('stylised', 'earth'), 12);
      expect(markersLayer().hidden).toBe(false);
    });

    it('opens in the remembered scale', async () => {
      await open('real');
      expect(toggle().getAttribute('aria-pressed')).toBe('true');
      expect(body('earth').radius).toBeCloseTo(radiusIn('real', 'earth'), 12);
      expect(markersLayer().hidden).toBe(false);
    });

    it('ignores a stored value it doesn’t know', async () => {
      await open('galactic');
      expect(toggle().getAttribute('aria-pressed')).toBe('false');
    });

    it('frames the whole system at the home view', async () => {
      await open();
      expect(camera().position.length()).toBeCloseTo(homeDistance('stylised'), 3);
    });
  });

  describe('switching scale (AC-7, AC-8)', () => {
    it('moves and resizes the bodies, remembers the choice and re-frames the system', async () => {
      await open();
      toggle().click();
      expect(body('earth').radius).toBeCloseTo(radiusIn('real', 'earth'), 12);
      const days = space.simTime!().days;
      expect(body('neptune').world[0]).toBeCloseTo(worldAt('real', days).get('neptune')!.x, 6);
      expect(JSON.parse(storage.getItem(SCALE_PREFERENCE)!)).toBe('real');
      expect(camera().position.length()).toBeCloseTo(homeDistance('real'), 1);
      expect(markersLayer().hidden).toBe(false);

      toggle().click();
      expect(JSON.parse(storage.getItem(SCALE_PREFERENCE)!)).toBe('stylised');
      expect(camera().position.length()).toBeCloseTo(homeDistance('stylised'), 3);
      expect(markersLayer().hidden).toBe(false); // labels at both scales (spec 023, AC-14)
    });

    it('re-frames even after the visitor moved the camera', async () => {
      await open();
      ctx.canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
      ctx.canvas.dispatchEvent(new KeyboardEvent('keydown', { key: '+', bubbles: true }));
      toggle().click();
      expect(camera().position.length()).toBeCloseTo(homeDistance('real'), 1);
      expect(looksAt('sun')).toBeLessThan(1e-6);
    });
  });

  describe('re-centring zoom at real scale (D-023)', () => {
    it('a wheel zoom that starts on a body re-centres the orbit on it', async () => {
      await open('real');
      const earth = screenOf('earth');
      wheelAt(earth.x, earth.y);
      space.update(1 / 60, 1 / 60);
      expect(looksAt('earth')).toBeLessThan(1e-6);
    });

    it('zooming on keeps re-centring and gets close: Earth fills pixels, the Moon’s marker appears', async () => {
      await open('real');
      for (let i = 0; i < 120 && screenOf('earth').visible; i++) {
        const earth = screenOf('earth');
        wheelAt(earth.x, earth.y, -300);
        space.update(1 / 60, i / 60);
        const distance = camera().position.distanceTo(new Vector3(...body('earth').world));
        if (distance < 2) break; // ≥ 3 px for Earth's 0.0064 units at this fov and height
      }
      const distance = camera().position.distanceTo(new Vector3(...body('earth').world));
      const px = (body('earth').radius * (H / 2)) / (distance * Math.tan(FOV_Y / 2));
      expect(px).toBeGreaterThanOrEqual(3);
      expect(ctx.overlay.querySelector<HTMLElement>('.body-marker[data-body="moon"]')!.hidden).toBe(false);
    });

    it('never zooms inside a body: not the one re-centred on, not the Sun at home (1.2 × its radius)', async () => {
      await open('real');
      for (let i = 0; i < 150; i++) {
        const earth = screenOf('earth');
        wheelAt(earth.x, earth.y, -500);
        space.update(1 / 60, i / 60);
      }
      const toEarth = camera().position.distanceTo(new Vector3(...body('earth').world));
      expect(toEarth).toBeGreaterThanOrEqual(1.2 * body('earth').radius * (1 - 1e-6));

      ctx.overlay.querySelector<HTMLButtonElement>('button.controls-reset')!.click(); // home: the Sun
      for (let i = 0; i < 150; i++) {
        wheelAt(5, 5, -500);
        space.update(1 / 60, i / 60);
      }
      expect(camera().position.length()).toBeGreaterThanOrEqual(1.2 * body('sun').radius * (1 - 1e-6));
    });

    it('a pinch whose midpoint is on a body re-centres on it', async () => {
      await open('real');
      const jupiter = screenOf('jupiter');
      pointer('pointerdown', 1, jupiter.x - 30, jupiter.y);
      pointer('pointerdown', 2, jupiter.x + 30, jupiter.y);
      space.update(1 / 60, 1 / 60);
      expect(looksAt('jupiter')).toBeLessThan(1e-6);
      pointer('pointerup', 1, jupiter.x - 30, jupiter.y);
      pointer('pointerup', 2, jupiter.x + 30, jupiter.y);
    });

    it('a zoom that starts away from every body, or at stylised scale, keeps the Sun at the centre', async () => {
      await open('real');
      wheelAt(5, 5);
      space.update(1 / 60, 1 / 60);
      expect(looksAt('sun')).toBeLessThan(1e-6);

      toggle().click(); // stylised
      const earth = screenOf('earth');
      wheelAt(earth.x, earth.y);
      space.update(1 / 60, 2 / 60);
      expect(looksAt('sun')).toBeLessThan(1e-6);
    });
  });

  describe('every frame', () => {
    it('fits the near plane to the nearest surface and the far plane past the system', async () => {
      await open('real');
      const extent = systemExtent(BODIES, layout(BODIES, 'real'));
      expect(camera().near).toBe(1); // at the whole-system view the nearest surface is far: clamped
      expect(camera().far).toBeGreaterThanOrEqual(camera().position.length() + 2 * extent - 1e-6);

      for (let i = 0; i < 120; i++) {
        const earth = screenOf('earth');
        wheelAt(earth.x, earth.y, -300);
        space.update(1 / 60, i / 60);
      }
      const surface =
        camera().position.distanceTo(new Vector3(...body('earth').world)) - body('earth').radius;
      expect(camera().near).toBeLessThan(surface);
      expect(camera().near).toBeGreaterThan(surface / 4);
    });

    it('places markers from this frame’s camera (controls first, then markers)', async () => {
      ctx = createFakeContext({ reducedMotion: false }); // the turntable moves the camera in update()
      document.body.replaceChildren(ctx.canvas, ctx.overlay);
      await open('real');
      space.update(10, 10); // ~0.26 rad of turntable: Jupiter moves ~11 px
      const marker = ctx.overlay.querySelector<HTMLElement>('.body-marker[data-body="jupiter"]')!;
      const m = /translate\((-?[\d.]+)px, (-?[\d.]+)px\)/.exec(marker.style.transform)!;
      const expected = screenOf('jupiter');
      expect(Number(m[1])).toBeCloseTo(expected.x, 0);
      expect(Number(m[2])).toBeCloseTo(expected.y, 0);
    });

    it('holds every body still while time is paused (reduced motion: 021 AC-9)', async () => {
      await open();
      expect(space.simTime!().playing).toBe(false);
      const before = space.bodies!();
      for (let i = 1; i <= 60; i++) space.update(1 / 60, i / 60);
      expect(space.bodies!()).toEqual(before);
    });
  });

  describe('time (spec 021)', () => {
    const today = daysFromEpochMs(Date.UTC(2026, 9, 5)); // the fake context's startTime
    const playing = () => {
      ctx = createFakeContext({ reducedMotion: false });
      document.body.replaceChildren(ctx.canvas, ctx.overlay);
      ctx.canvas.setPointerCapture = vi.fn();
      ctx.canvas.releasePointerCapture = vi.fn();
    };
    const timeGroup = () => ctx.overlay.querySelector<HTMLElement>('.time-controls')!;
    const playButton = () => timeGroup().querySelector<HTMLButtonElement>('button.time-play')!;
    const speedSelect = () => timeGroup().querySelector<HTMLSelectElement>('select')!;
    const chooseSpeed = (value: string) => {
      speedSelect().value = value;
      speedSelect().dispatchEvent(new Event('change'));
    };
    const announcer = () => timeGroup().querySelector<HTMLElement>('[aria-live="polite"]')!;
    const run = (seconds: number, step = 1 / 60) => {
      for (let t = 0; t < seconds - 1e-9; t += step) space.update(step, t);
    };
    const gap = (a: number[], b: number[]) => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);

    it('opens at the start time, playing at 1 week per second (Q1, Q2)', async () => {
      playing();
      await open();
      expect(space.simTime!()).toEqual({ days: today, speed: 7, playing: true });
      expect(timeGroup().querySelector('time')!.getAttribute('datetime')).toBe('2026-10-05');
    });

    it('opens paused with reduced motion (AC-9); Play starts it', async () => {
      await open();
      expect(space.simTime!().playing).toBe(false);
      playButton().click();
      space.update(1, 1);
      expect(space.simTime!().days).toBeCloseTo(today + 7, 9);
    });

    it('update(delta) advances the date and moves the bodies along their orbits (AC-5)', async () => {
      playing();
      await open();
      const before = body('earth').world;
      run(1);
      expect(space.simTime!().days).toBeCloseTo(today + 7, 6);
      expect(gap(body('earth').world, before)).toBeGreaterThan(0.1);
      const expected = worldAt('stylised', space.simTime!().days);
      for (const b of space.bodies!()) {
        expect(gap(b.world, expected.get(b.id)!.toArray()), b.id).toBeLessThan(1e-9);
      }
    });

    it('the same date by different paths gives the same scene (AC-5)', async () => {
      playing();
      await open();
      run(2, 1 / 30); // 14 days in 60 frames
      const reached = space.simTime!().days;
      const viaFrames = space.bodies!();
      space.dispose();

      await open();
      playButton().click(); // pause
      space.setSimTime!(reached);
      space.update(1 / 60, 0);
      space.bodies!().forEach((b, i) => expect(gap(b.world, viaFrames[i]!.world), b.id).toBeLessThan(1e-9));
    });

    it('turns each body on its axis as time runs (AC-4)', async () => {
      playing();
      await open();
      chooseSpeed('day'); // slow enough that Mercury isn't held by the fast-spin rule
      const mercury = space.scene.getObjectByName('mercury')!;
      const before = mercury.quaternion.clone();
      run(1);
      expect(mercury.quaternion.angleTo(before)).toBeGreaterThan(0.05); // ~6° a day
    });

    it('the speed select and the Backwards toggle change how the date moves (AC-6)', async () => {
      playing();
      await open();
      chooseSpeed('year');
      space.update(1, 1);
      expect(space.simTime!().days).toBeCloseTo(today + 365.25, 6);
      expect(space.simTime!().speed).toBe(365.25);
      timeGroup().querySelector<HTMLButtonElement>('button.time-direction')!.click();
      space.update(1, 2);
      expect(space.simTime!().days).toBeCloseTo(today, 6);
      expect(space.simTime!().speed).toBe(-365.25);
    });

    it('a range limit pauses time there and says so (AC-8)', async () => {
      playing();
      await open();
      space.setSimTime!(RANGE.end - 2);
      space.update(1, 1);
      expect(space.simTime!()).toMatchObject({ days: RANGE.end, playing: false });
      expect(announcer().textContent).toMatch(/^Reached 2050/);
      expect(playButton().textContent).toBe('Play time');
    });

    it('setSimTime() clamps to the supported range', async () => {
      await open();
      space.setSimTime!(RANGE.start - 1000);
      expect(space.simTime!().days).toBe(RANGE.start);
    });

    describe('following a re-centred body at real scale (AC-10, Q4)', () => {
      const recentreOn = (id: string) => {
        const at = screenOf(id);
        wheelAt(at.x, at.y);
        space.update(0, 0);
      };

      it('keeps the body centred while time runs', async () => {
        playing();
        await open('real');
        recentreOn('earth');
        const start = body('earth').world;
        run(2); // two weeks: Earth moves ~36 units
        expect(gap(body('earth').world, start)).toBeGreaterThan(10);
        expect(looksAt('earth')).toBeLessThan(1e-6);
      });

      it('a reset stops following: the view goes home and stays on the Sun', async () => {
        playing();
        await open('real');
        recentreOn('earth');
        run(0.5);
        ctx.overlay.querySelector<HTMLButtonElement>('button.controls-reset')!.click();
        run(1);
        expect(looksAt('sun')).toBeLessThan(1e-6);
      });

      it('a pan stops following: the camera stays where the visitor left it', async () => {
        playing();
        await open('real');
        recentreOn('earth');
        run(0.5);
        ctx.canvas.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'ArrowLeft', shiftKey: true, bubbles: true }),
        );
        space.update(1 / 60, 1);
        const where = camera().position.clone();
        run(1);
        expect(camera().position.distanceTo(where)).toBeLessThan(1e-6);
      });

      it('never follows at stylised scale', async () => {
        playing();
        await open();
        const earth = screenOf('earth');
        wheelAt(earth.x, earth.y);
        run(1);
        expect(looksAt('sun')).toBeLessThan(1e-6);
      });
    });

    it('saveState() → savedState restores the date, speed, direction and play state (AC-12)', async () => {
      playing();
      await open();
      chooseSpeed('month');
      timeGroup().querySelector<HTMLButtonElement>('button.time-direction')!.click();
      space.setSimTime!(today - 400);
      playButton().click(); // pause
      const saved = space.saveState!();
      space.dispose();

      ctx = { ...createFakeContext({ reducedMotion: false }), savedState: saved };
      document.body.replaceChildren(ctx.canvas, ctx.overlay);
      await open();
      expect(space.simTime!()).toEqual({ days: today - 400, speed: -30.436875, playing: false });
      expect(speedSelect().value).toBe('month');
      expect(playButton().textContent).toBe('Play time');
    });

    it('ignores a saved state it doesn’t recognise and starts fresh', async () => {
      ctx = { ...createFakeContext({ reducedMotion: true }), savedState: { days: 'soon' } };
      document.body.replaceChildren(ctx.canvas, ctx.overlay);
      await open();
      expect(space.simTime!()).toEqual({ days: today, speed: 7, playing: false });
    });

    it('draws faint orbit lines for the current scale only (AC-11)', async () => {
      await open();
      const visibleLines = () => {
        const names: string[] = [];
        space.scene.traverse((o) => {
          if (o instanceof LineLoop && o.visible) names.push(o.name);
        });
        return names;
      };
      expect(visibleLines()).toHaveLength(15);
      expect(visibleLines().every((n) => n.endsWith('-path-stylised'))).toBe(true);
      toggle().click();
      expect(visibleLines()).toHaveLength(15);
      expect(visibleLines().every((n) => /-path-real(-far)?$/.test(n))).toBe(true);
    });

    it('markers follow the moving bodies in the same frame, even with the camera still (AC-10)', async () => {
      await open('real'); // reduced motion: no turntable, so only time moves anything
      playButton().click();
      chooseSpeed('year');
      space.update(0.1, 0.1); // Mercury moves ~150°
      const marker = ctx.overlay.querySelector<HTMLElement>('.body-marker[data-body="mercury"]')!;
      const m = /translate\((-?[\d.]+)px, (-?[\d.]+)px\)/.exec(marker.style.transform)!;
      const expected = screenOf('mercury');
      expect(Number(m[1])).toBeCloseTo(expected.x, 0);
      expect(Number(m[2])).toBeCloseTo(expected.y, 0);
    });

    it('puts the time controls between "True scale" and the camera controls in Tab order', async () => {
      await open();
      const order = [...ctx.overlay.querySelectorAll('button, select')].map((e) => e.className.split(' ')[0]);
      expect(order.indexOf('scale-toggle')).toBeLessThan(order.indexOf('time-play'));
      expect(order.indexOf('time-direction')).toBeLessThan(order.indexOf('controls-reset'));
    });
  });

  it('bodies() reports every body’s world position, radius and orientation (seam)', async () => {
    await open();
    const expected = worldAt('stylised', space.simTime!().days);
    expect(
      space.bodies!()
        .map((b) => b.id)
        .sort(),
    ).toEqual(BODIES.map((b) => b.id).sort());
    for (const b of space.bodies!()) {
      b.world.forEach((c, i) => expect(c, b.id).toBeCloseTo(expected.get(b.id)!.getComponent(i), 6));
      const reported = new Quaternion().fromArray(b.quaternion!);
      expect(reported.angleTo(space.scene.getObjectByName(b.id)!.quaternion), b.id).toBeLessThan(1e-6);
    }
  });

  // Spec 023, T050: selecting a body, flying to it, following it, and closing (AC-1–AC-3, AC-5, AC-6, AC-12,
  // AC-15).
  describe('selection (spec 023)', () => {
    let slot: {
      content: HTMLElement;
      showDescription: ReturnType<typeof vi.fn<(show: boolean) => void>>;
      open: ReturnType<typeof vi.fn<() => void>>;
      onOpenChange: ReturnType<typeof vi.fn<(listener: (open: boolean) => void) => void>>;
    };
    const attach = () => {
      slot = {
        content: document.createElement('div'),
        showDescription: vi.fn<(show: boolean) => void>(),
        open: vi.fn<() => void>(),
        onOpenChange: vi.fn<(listener: (open: boolean) => void) => void>(),
      };
      ctx.overlay.prepend(slot.content); // where the core's panel would put it
      space.attachInfo!(slot);
    };
    const playing = () => {
      ctx = createFakeContext({ reducedMotion: false });
      document.body.replaceChildren(ctx.canvas, ctx.overlay);
      ctx.canvas.setPointerCapture = vi.fn();
      ctx.canvas.releasePointerCapture = vi.fn();
    };
    const run = (seconds: number, step = 1 / 60) => {
      for (let t = 0; t < seconds - 1e-9; t += step) space.update(step, t);
    };
    /** A mouse press and release, moved `drag` px between them. */
    const click = (x: number, y: number, drag = 0, pointerType = 'mouse') => {
      const fire = (type: string, px: number, py: number, id = 1) => {
        const event = new MouseEvent(type, {
          clientX: px,
          clientY: py,
          button: 0,
          bubbles: true,
          cancelable: true,
        });
        Object.defineProperties(event, { pointerId: { value: id }, pointerType: { value: pointerType } });
        ctx.canvas.dispatchEvent(event);
      };
      fire('pointerdown', x, y);
      if (drag) fire('pointermove', x + drag, y);
      fire('pointerup', x + drag, y);
    };
    const selection = () => space.selection!();
    const listButton = (name: string) =>
      [...slot.content.querySelectorAll<HTMLButtonElement>('.body-list button')].find(
        (b) => b.textContent === name,
      )!;
    const card = () => slot.content.querySelector<HTMLElement>('.body-card')!;
    const escape = (target: EventTarget = ctx.canvas) =>
      target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    const landed = () => {
      for (let i = 0; i < 300 && selection().flying; i++) space.update(1 / 60, i / 60);
    };
    const distanceTo = (id: string) => camera().position.distanceTo(new Vector3(...body(id).world));

    it('starts with nothing selected; the panel’s slot holds the body list', async () => {
      await open();
      attach();
      expect(selection()).toEqual({ id: null, flying: false, following: false });
      expect(slot.content.querySelectorAll('.body-list button')).toHaveLength(16);
      expect(card().hidden).toBe(true);
    });

    it('a click on a body selects it (AC-1): card, label, description hidden, panel opened', async () => {
      await open();
      attach();
      const mars = screenOf('mars');
      click(mars.x, mars.y);
      expect(selection().id).toBe('mars');
      expect(card().hidden).toBe(false);
      expect(card().querySelector('h3')!.textContent).toBe('Mars');
      expect(slot.showDescription).toHaveBeenLastCalledWith(false);
      expect(slot.open).toHaveBeenCalled();
      expect(listButton('Mars').getAttribute('aria-pressed')).toBe('true');
      space.update(0, 0); // labels redraw on the next frame
      expect(
        ctx.overlay.querySelector('.body-marker[data-body="mars"]')!.classList.contains('is-selected'),
      ).toBe(true);
    });

    it('a drag of more than 5 px, a right-button press or a two-finger touch selects nothing', async () => {
      await open();
      attach();
      const mars = screenOf('mars');
      click(mars.x, mars.y, 6);
      expect(selection().id).toBeNull();
      const right = new MouseEvent('pointerdown', {
        clientX: mars.x,
        clientY: mars.y,
        button: 2,
        bubbles: true,
      });
      Object.defineProperties(right, { pointerId: { value: 3 }, pointerType: { value: 'mouse' } });
      ctx.canvas.dispatchEvent(right);
      const up = new MouseEvent('pointerup', { clientX: mars.x, clientY: mars.y, button: 2, bubbles: true });
      Object.defineProperties(up, { pointerId: { value: 3 }, pointerType: { value: 'mouse' } });
      ctx.canvas.dispatchEvent(up);
      expect(selection().id).toBeNull();
      pointer('pointerdown', 1, mars.x, mars.y);
      pointer('pointerdown', 2, mars.x + 80, mars.y);
      pointer('pointerup', 2, mars.x + 80, mars.y);
      pointer('pointerup', 1, mars.x, mars.y);
      expect(selection().id).toBeNull();
    });

    it('a touch tap selects; clicking empty space keeps the selection', async () => {
      await open();
      attach();
      const jupiter = screenOf('jupiter');
      click(jupiter.x, jupiter.y, 0, 'touch');
      expect(selection().id).toBe('jupiter');
      click(3, 3);
      expect(selection().id).toBe('jupiter');
    });

    it('a list button selects its body like a click (AC-2)', async () => {
      await open();
      attach();
      listButton('Saturn').click();
      expect(selection().id).toBe('saturn');
    });

    it('flies to the body and frames it, from its sunlit side, then follows it (AC-4, AC-5)', async () => {
      playing();
      await open();
      attach();
      listButton('Mars').click();
      expect(selection().flying).toBe(true);
      expect(selection().following).toBe(true);
      landed();
      expect(selection().flying).toBe(false);
      expect(looksAt('mars')).toBeLessThan(1e-4);
      // A third of the shorter side: the disc's diameter on screen.
      const px = (2 * body('mars').radius * (H / 2)) / (distanceTo('mars') * Math.tan(FOV_Y / 2));
      expect(px / Math.min(W, H)).toBeCloseTo(1 / 3, 1);
      // Sunlit side: the camera is less than 60° from the Sun as seen from Mars.
      const toCamera = camera()
        .position.clone()
        .sub(new Vector3(...body('mars').world));
      const toSun = new Vector3(...body('sun').world).sub(new Vector3(...body('mars').world));
      expect((toCamera.angleTo(toSun) * 180) / Math.PI).toBeLessThan(60);
      // Time runs (a month per second would be faster; the default week is enough): still centred.
      run(2);
      expect(looksAt('mars')).toBeLessThan(1e-4);
      expect(selection().following).toBe(true);
    });

    it('holds the turntable while selected, releases it on close', async () => {
      playing();
      await open();
      attach();
      listButton('Earth').click();
      landed();
      run(6); // past the 4 s idle delay
      const before = camera()
        .position.clone()
        .sub(new Vector3(...body('earth').world));
      run(1);
      const after = camera()
        .position.clone()
        .sub(new Vector3(...body('earth').world));
      expect(after.angleTo(before)).toBeLessThan(1e-6); // no turntable orbit round Earth
      escape();
      run(6);
      const later = camera().position.clone().sub(controlsTarget());
      expect(later.angleTo(after)).toBeGreaterThan(1e-3); // the turntable is back
    });

    it('real scale: the whole-system view draws planets’ far line copies, a close-up of Earth its fine line (D-040)', async () => {
      await open('real');
      attach();
      const drawn = (name: string) => space.scene.getObjectByName(name)!.visible;
      for (const id of ['mercury', 'earth', 'neptune']) {
        expect(drawn(`${id}-path-real`), id).toBe(false);
        expect(drawn(`${id}-path-real-far`), id).toBe(true);
      }
      listButton('Earth').click();
      landed();
      space.update(1 / 60, 1 / 60);
      expect(drawn('earth-path-real')).toBe(true);
      expect(drawn('earth-path-real-far')).toBe(false);
      expect(drawn('neptune-path-real-far')).toBe(true);
      escape();
      toggle().click(); // stylised: no real line of either kind
      space.update(1 / 60, 2 / 60);
      expect(drawn('earth-path-real') || drawn('earth-path-real-far')).toBe(false);
    });

    it('Escape and Close clear it, show the description and leave the camera where it is (AC-12)', async () => {
      playing();
      await open();
      attach();
      listButton('Earth').click();
      landed();
      const where = camera().position.clone();
      escape();
      expect(selection()).toEqual({ id: null, flying: false, following: false });
      expect(card().hidden).toBe(true);
      expect(slot.showDescription).toHaveBeenLastCalledWith(true);
      expect(camera().position.distanceTo(where)).toBeLessThan(1e-9);
      expect(document.activeElement).toBe(listButton('Earth')); // back to the control that selected it

      const saturn = screenOf('saturn');
      click(saturn.x, saturn.y);
      card().querySelector<HTMLButtonElement>('button')!.click(); // Close
      expect(selection().id).toBeNull();
      expect(document.activeElement).toBe(ctx.canvas); // a canvas click: back to the 3D view
    });

    it('Escape while the "?" help is open only closes the help', async () => {
      await open();
      attach();
      listButton('Earth').click();
      const help = ctx.overlay.querySelector<HTMLButtonElement>('button.controls-help-toggle')!;
      help.click();
      escape(help);
      expect(help.getAttribute('aria-expanded')).toBe('false');
      expect(selection().id).toBe('earth');
    });

    it('"Reset view" clears the selection and goes home', async () => {
      await open();
      attach();
      listButton('Earth').click();
      ctx.overlay.querySelector<HTMLButtonElement>('button.controls-reset')!.click();
      expect(selection().id).toBeNull();
      expect(looksAt('sun')).toBeLessThan(1e-6);
    });

    it('a pan ends following but keeps the selection (AC-5)', async () => {
      playing();
      await open();
      attach();
      listButton('Earth').click();
      landed();
      ctx.canvas.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowLeft', shiftKey: true, bubbles: true }),
      );
      space.update(1 / 60, 0);
      run(0.5);
      expect(selection()).toMatchObject({ id: 'earth', following: false });
    });

    it('a real-scale re-centre on another body moves the follow, keeps the selection (D-036)', async () => {
      await open('real');
      attach();
      listButton('Mars').click();
      landed();
      // Back out to the whole system, then zoom on Jupiter.
      for (let i = 0; i < 3; i++) space.update(1 / 60, 0);
      ctx.overlay.querySelector<HTMLButtonElement>('button.scale-toggle')!.click();
      ctx.overlay.querySelector<HTMLButtonElement>('button.scale-toggle')!.click(); // real again: home view
      space.update(1 / 60, 0);
      const jupiter = screenOf('jupiter');
      wheelAt(jupiter.x, jupiter.y);
      space.update(1 / 60, 0);
      expect(looksAt('jupiter')).toBeLessThan(1e-6);
      expect(selection().id).toBe('mars');
    });

    it('any input during the flight cancels it without a jump (AC-6)', async () => {
      playing();
      await open();
      attach();
      listButton('Neptune').click();
      run(0.3);
      expect(selection().flying).toBe(true);
      ctx.canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
      expect(selection().flying).toBe(false);
      expect(selection().id).toBe('neptune');

      listButton('Mars').click();
      run(0.3);
      expect(selection().flying).toBe(true);
      click(20, H - 20, 40); // a drag-orbit from empty space
      expect(selection().flying).toBe(false);
      expect(selection().id).toBe('mars');
    });

    it('never touches the clock: speed and play state unchanged by select, fly and close (AC-15)', async () => {
      playing();
      await open();
      attach();
      const before = space.simTime!();
      listButton('Jupiter').click();
      landed();
      escape();
      const after = space.simTime!();
      expect(after.speed).toBe(before.speed);
      expect(after.playing).toBe(before.playing);
      expect(after.days).toBeGreaterThan(before.days); // and it kept running
    });

    describe('clear area, scale switch, live facts, saved state (T052)', () => {
      /** The panel's region as the core builds it, with a bottom sheet's rectangle at 320 × 640. */
      const sheet = (top = 287) => {
        const region = document.createElement('section');
        region.className = 'info-panel';
        region.append(slot.content);
        ctx.overlay.prepend(region);
        region.getBoundingClientRect = () =>
          ({
            left: 16,
            top,
            width: 288,
            height: 225,
            right: 304,
            bottom: top + 225,
            x: 16,
            y: top,
          }) as DOMRect;
        return region;
      };
      const phone = () => space.resize(320, 640);
      const at = (id: string) => {
        camera().updateMatrixWorld();
        return toScreen(new Vector3(...body(id).world), camera(), 320, 640);
      };

      it('centres the selected body in the area above a bottom sheet, framed to a third of it (AC-11)', async () => {
        playing();
        await open();
        attach();
        sheet();
        phone();
        listButton('Earth').click();
        landed();
        run(0.7); // the offset has eased in
        expect(camera().view?.enabled).toBe(true);
        const earth = at('earth');
        expect(earth.x).toBeCloseTo(160, 0);
        expect(earth.y).toBeCloseTo(287 / 2, 0);
        const px = (2 * body('earth').radius * 320) / (distanceTo('earth') * Math.tan(FOV_Y / 2));
        expect(px / 287).toBeCloseTo(1 / 3, 1);
      });

      it('eases the offset out over 0.3 s on close; instant under reduced motion', async () => {
        playing();
        await open();
        attach();
        sheet();
        phone();
        listButton('Earth').click();
        landed();
        run(0.7);
        escape();
        run(0.1);
        expect(camera().view?.enabled).toBe(true); // still easing
        run(0.3);
        expect(camera().view?.enabled ?? false).toBe(false);

        space.dispose();
        ctx = createFakeContext({ reducedMotion: true });
        document.body.replaceChildren(ctx.canvas, ctx.overlay);
        ctx.canvas.setPointerCapture = vi.fn();
        ctx.canvas.releasePointerCapture = vi.fn();
        await open();
        attach();
        sheet();
        phone();
        listButton('Earth').click();
        space.update(0, 0);
        expect(at('earth').y).toBeCloseTo(287 / 2, 0);
        escape();
        space.update(0, 0);
        expect(camera().view?.enabled ?? false).toBe(false);
      });

      it('recomputes the clear area on resize and when the panel opens or closes', async () => {
        await open();
        attach();
        const region = sheet();
        phone();
        listButton('Earth').click();
        space.update(0, 0);
        expect(at('earth').y).toBeCloseTo(287 / 2, 0);
        region.getBoundingClientRect = () => ({ left: 0, top: 0, width: 0, height: 0 }) as DOMRect; // collapsed
        slot.onOpenChange.mock.calls.forEach(([listener]) => listener(false));
        space.update(0, 0);
        expect(camera().view?.enabled ?? false).toBe(false);
        space.resize(800, 600);
        space.update(0, 0);
        expect(camera().view?.enabled ?? false).toBe(false);
      });

      it('a scale switch keeps the selection and frames the body at the new scale, still following (AC-8)', async () => {
        playing();
        await open();
        attach();
        listButton('Saturn').click();
        landed();
        toggle().click(); // real scale
        expect(selection()).toEqual({ id: 'saturn', flying: false, following: true });
        space.update(1 / 60, 0);
        expect(looksAt('saturn')).toBeLessThan(1e-4);
        const px = (2 * body('saturn').radius * (H / 2)) / (distanceTo('saturn') * Math.tan(FOV_Y / 2));
        expect(px / Math.min(W, H)).toBeCloseTo(1 / 3, 1);
        run(1);
        expect(looksAt('saturn')).toBeLessThan(1e-4);
      });

      it('shows the live distance and updates it as time runs (AC-10)', async () => {
        playing();
        await open();
        attach();
        listButton('Earth').click();
        const live = () => card().querySelector<HTMLElement>('.body-card-live')!;
        expect(live().hidden).toBe(false);
        expect(live().textContent).toMatch(/^Now: [\d.]+ million km from the Sun$/);
        const first = live().textContent;
        run(4); // four weeks
        expect(live().textContent).not.toBe(first);
        escape();
        listButton('Sun').click();
        expect(live().hidden).toBe(true); // the Sun has none
      });

      it('saveState() carries the selection across a context loss; the rebuild selects and follows it (AC-16)', async () => {
        await open();
        attach();
        listButton('Mars').click();
        landed();
        const saved = space.saveState!();
        space.dispose();
        ctx = createFakeContext({ reducedMotion: true, savedState: saved });
        document.body.replaceChildren(ctx.canvas, ctx.overlay);
        ctx.canvas.setPointerCapture = vi.fn();
        ctx.canvas.releasePointerCapture = vi.fn();
        await open();
        attach();
        expect(selection()).toEqual({ id: 'mars', flying: false, following: true });
        expect(card().querySelector('h3')!.textContent).toBe('Mars');
        expect(slot.showDescription).toHaveBeenLastCalledWith(false);
        expect(looksAt('mars')).toBeLessThan(1e-4);
      });

      it('a new visit, or a saved selection it doesn’t know, starts with nothing selected', async () => {
        ctx = createFakeContext({ reducedMotion: true, savedState: { time: undefined, selected: 'pluto' } });
        document.body.replaceChildren(ctx.canvas, ctx.overlay);
        ctx.canvas.setPointerCapture = vi.fn();
        ctx.canvas.releasePointerCapture = vi.fn();
        await open();
        attach();
        expect(selection().id).toBeNull();
      });
    });

    it('dispose() removes the list and card and stops listening for clicks', async () => {
      await open();
      attach();
      const mars = screenOf('mars');
      space.dispose();
      expect(slot.content.childElementCount).toBe(0);
      expect(() => click(mars.x, mars.y)).not.toThrow();
    });
  });

  it('dispose() frees the scene, the toggle, the markers and the 3D view’s description (AC-12)', async () => {
    await open();
    let geometry: BufferGeometry | undefined;
    space.scene.traverse((o) => {
      if (o instanceof Mesh) geometry = o.geometry;
    });
    const spy = vi.spyOn(geometry!, 'dispose');
    space.dispose();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(ctx.overlay.querySelector('.scale-toggle, .body-markers, .time-controls, .solar-bar')).toBeNull();
    let lines = 0;
    space.scene.traverse((o) => {
      if (o instanceof LineLoop) lines++;
    });
    expect(lines).toBe(0); // the orbit lines are gone
    expect(ctx.canvas.hasAttribute('aria-describedby')).toBe(false);
    expect(ctx.canvas.hasAttribute('tabindex')).toBe(false); // the controls are gone too
  });

  // Spec 022, T050 (AC-1, AC-4–AC-12): imagery, Earth's layers, Saturn's rings, the sky and the glow in the Space.
  describe('surfaces (spec 022)', () => {
    const mesh = (id: string) => space.scene.getObjectByName(id) as Mesh;
    const material = (id: string) => mesh(id).material as MeshStandardMaterial;
    const mixOf = (id: string) => uniformsOf(material(id)).uImageMix!.value as number;
    const files = imageryJobs(BODIES).map((j) => j.file);
    const saturn = BODIES.find((b) => b.id === 'saturn')!;

    it('opens in plain colours before any imagery arrives, and reports its progress in the background', async () => {
      const report = vi.fn();
      ctx = createFakeContext({ reducedMotion: true, reportBackgroundProgress: report });
      await open();
      expect(imagery.loads).toEqual(files);
      for (const b of BODIES) {
        expect(material(b.id).map, b.id).toBeNull();
        expect(mixOf(b.id), b.id).toBe(0);
      }
      imagery.finishAll();
      await flush();
      expect(report).toHaveBeenLastCalledWith(1, 'imagery');
      expect(report.mock.calls.every(([, what]) => what === 'imagery')).toBe(true);
    });

    it('attaches each map to its body and layer; under reduced motion it shows at once', async () => {
      await open();
      const earth = imagery.finish('earth.ktx2');
      const clouds = imagery.finish('earth-clouds.ktx2');
      const night = imagery.finish('earth-night.ktx2');
      const ocean = imagery.finish('earth-ocean.ktx2');
      const sun = imagery.finish('sun.ktx2');
      await flush();
      expect(material('earth').map).toBe(earth);
      expect(material('earth').emissiveMap).toBe(night);
      expect(material('earth').roughnessMap).toBe(ocean);
      expect(material('earth').emissiveIntensity).toBe(EARTH_NIGHT_INTENSITY);
      expect((mesh('sun').material as MeshBasicMaterial).map).toBe(sun);
      const cloudLayer = space.scene.getObjectByName('earth-clouds') as Mesh;
      const cloudMaterial = cloudLayer.material as MeshStandardMaterial;
      expect(cloudMaterial.alphaMap).toBe(clouds);
      expect(cloudLayer.visible).toBe(true);
      expect(cloudMaterial.opacity).toBe(1);
      expect(mixOf('earth')).toBe(1);
      expect(mixOf('sun')).toBe(1);
      expect(mixOf('mars')).toBe(0); // not arrived yet
    });

    it('fades an arriving map in over FADE_SECONDS of frame delta', async () => {
      ctx = createFakeContext({ reducedMotion: false });
      document.body.replaceChildren(ctx.canvas, ctx.overlay);
      await open();
      imagery.finish('mars.ktx2');
      imagery.finish('saturn-rings.ktx2');
      await flush();
      expect(mixOf('mars')).toBe(0);
      space.update(FADE_SECONDS / 2, 1);
      expect(mixOf('mars')).toBeCloseTo(0.5, 9);
      const rings = space.scene.getObjectByName('saturn-rings') as Mesh;
      expect((rings.material as ShaderMaterial).uniforms.uImageMix!.value).toBeCloseTo(0.5, 9);
      space.update(FADE_SECONDS, 2);
      expect(mixOf('mars')).toBe(1);
    });

    it('a failed map leaves its body coloured and the rest still arrive', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      await open();
      imagery.fail('jupiter.ktx2');
      imagery.finishAll();
      await flush();
      expect(material('jupiter').map).toBeNull();
      expect(mixOf('jupiter')).toBe(0);
      expect(material('mars').map).not.toBeNull();
      expect(warn).toHaveBeenCalledOnce();
      warn.mockRestore();
      space.update(1 / 60, 1 / 60); // still runs
    });

    it('points Earth’s night side and Saturn’s ring shadow at the Sun for the date', async () => {
      await open();
      space.update(0, 0);
      const sunView = uniformsOf(material('earth')).uSunView!.value as Vector3;
      const expectedView = new Vector3(0, 0, 0).applyMatrix4(camera().matrixWorldInverse);
      expect(sunView.distanceTo(expectedView)).toBeLessThan(1e-9 * (1 + expectedView.length()));

      const sunLocal = () => {
        const local = new Vector3(...body('saturn').world).negate(); // Saturn → Sun (the Sun at the origin)
        local.applyQuaternion(new Quaternion(...body('saturn').quaternion!).invert()).normalize();
        return local;
      };
      const uniform = uniformsOf(material('saturn')).uSunLocal!.value as Vector3;
      expect(uniform.angleTo(sunLocal())).toBeLessThan(1e-9);
      const before = uniform.clone();
      space.setSimTime!(daysFromEpochMs(Date.UTC(2032, 5, 1)));
      space.update(0, 0);
      expect(uniform.angleTo(sunLocal())).toBeLessThan(1e-9);
      expect(uniform.angleTo(before)).toBeGreaterThan(0.01); // the rings open between 2026 and 2032
      const rings = space.scene.getObjectByName('saturn-rings') as Mesh;
      expect((rings.material as ShaderMaterial).uniforms.uSunLocal!.value).toBe(uniform);
    });

    it('sizes the Sun’s glow every frame from the camera’s distance', async () => {
      await open('real');
      const glow = space.scene.getObjectByName('sun-glow') as Sprite;
      const size = () =>
        glowSize(
          body('sun').radius,
          camera().position.distanceTo(new Vector3(...body('sun').world)),
          FOV_Y,
          H,
        );
      expect(glow.scale.x).toBeCloseTo(size(), 6);
      toggle().click();
      space.update(1 / 60, 1 / 60);
      expect(glow.scale.x).toBeCloseTo(size(), 6);
    });

    it('has its sky, glow, clouds and rings at both scales', async () => {
      await open();
      imagery.releaseStars();
      await flush();
      for (const scale of ['stylised', 'real']) {
        expect(space.scene.getObjectByName('stars'), scale).toBeInstanceOf(Points);
        expect(space.scene.getObjectByName('sun-glow'), scale).toBeInstanceOf(Sprite);
        expect(space.scene.getObjectByName('earth-clouds')!.parent, scale).toBe(mesh('earth'));
        expect(space.scene.getObjectByName('saturn-rings')!.parent, scale).toBe(mesh('saturn'));
        toggle().click();
        space.update(0, 0);
      }
      // The sky hangs off the scene, not the system: the layout never scales or moves it.
      expect(space.scene.getObjectByName('stars')!.parent).toBe(space.scene);
    });

    it('counts Saturn’s rings in the near plane, so a close camera never clips them', async () => {
      await open('real');
      for (let i = 0; i < 150; i++) {
        const target = screenOf('saturn');
        wheelAt(target.x, target.y, -300);
        space.update(1 / 60, i / 60);
      }
      const r = body('saturn').radius;
      const distance = camera().position.distanceTo(new Vector3(...body('saturn').world));
      expect(distance).toBeLessThan(6 * r); // close enough for the rings to matter
      const ringSurface = distance - (saturn.rings!.outerKm / saturn.radiusKm) * r;
      expect(camera().near).toBeLessThanOrEqual(Math.max(1e-6, ringSurface / 2) * 1.1 + 1e-12);
    });

    it('dispose() frees imagery, sky, glow, clouds and rings, and textures that arrive afterwards', async () => {
      await open();
      const earth = imagery.finish('earth.ktx2');
      const profile = imagery.finish('saturn-rings.ktx2');
      imagery.releaseStars();
      await flush();
      const stars = space.scene.getObjectByName('stars') as Points;
      const glow = space.scene.getObjectByName('sun-glow') as Sprite;
      const rings = space.scene.getObjectByName('saturn-rings') as Mesh;
      const spies = [
        vi.spyOn(stars.geometry, 'dispose'),
        vi.spyOn(stars.material as ShaderMaterial, 'dispose'),
        vi.spyOn(glow.material, 'dispose'),
        vi.spyOn(glow.material.map!, 'dispose'),
        vi.spyOn(rings.geometry, 'dispose'),
        vi.spyOn(rings.material as ShaderMaterial, 'dispose'),
        vi.spyOn((space.scene.getObjectByName('earth-clouds') as Mesh).material as Material, 'dispose'),
      ];
      space.dispose();
      for (const spy of spies) expect(spy).toHaveBeenCalledOnce();
      expect(earth.dispose).toHaveBeenCalledOnce();
      expect(profile.dispose).toHaveBeenCalledOnce();
      imagery.finishAll();
      await flush();
      for (const t of imagery.textures) expect(t.dispose).toHaveBeenCalledOnce();
      expect(space.scene.getObjectByName('stars')).toBeUndefined();
      expect(space.scene.getObjectByName('sun-glow')).toBeUndefined();
    });

    it('stars that arrive after dispose are never added', async () => {
      await open();
      space.dispose();
      imagery.releaseStars();
      await flush();
      expect(space.scene.getObjectByName('stars')).toBeUndefined();
    });

    it('a rebuild after a context loss loads its imagery again', async () => {
      await open();
      const saved = space.saveState!();
      space.dispose();
      ctx = createFakeContext({ reducedMotion: true, savedState: saved });
      await open();
      expect(imagery.loads).toEqual(files);
    });
  });
});
