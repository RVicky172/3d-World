import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Mesh, PerspectiveCamera, Vector3, type BufferGeometry } from 'three';
import type { SpaceContext, SpaceInstance } from '../../../../src/core/types';
import { BODIES, SOLAR_SYSTEM } from '../../../../src/spaces/solar-system/data';
import { createSolarSystem, SCALE_PREFERENCE } from '../../../../src/spaces/solar-system';
import { layout, systemExtent, worldPositions } from '../../../../src/spaces/solar-system/scale';
import { frameDistance } from '../../../../src/shared/model-viewer/framing';
import { toScreen } from '../../../../src/shared/hotspots/projection';
import { createFakeContext, memoryStorage } from '../../../helpers/fakes';

// Spec 020: the Space ties data, scale, toggle, markers and controls together (AC-7, AC-8, AC-8a, AC-11,
// AC-12), with the D-023 re-centring zoom at real scale.

const W = 800;
const H = 600;
const FOV_Y = (SOLAR_SYSTEM.camera.fov * Math.PI) / 180;

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

  const open = async (stored?: string) => {
    if (stored !== undefined) storage.setItem(SCALE_PREFERENCE, JSON.stringify(stored));
    space = await createSolarSystem(ctx, { storage });
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
    it('opens in stylised scale by default, without markers', async () => {
      await open();
      expect(toggle().getAttribute('aria-pressed')).toBe('false');
      expect(body('earth').radius).toBeCloseTo(radiusIn('stylised', 'earth'), 12);
      expect(markersLayer().hidden).toBe(true);
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
      expect(body('neptune').world[0]).toBeCloseTo(
        worldPositions(BODIES, layout(BODIES, 'real')).get('neptune')![0],
        6,
      );
      expect(JSON.parse(storage.getItem(SCALE_PREFERENCE)!)).toBe('real');
      expect(camera().position.length()).toBeCloseTo(homeDistance('real'), 1);
      expect(markersLayer().hidden).toBe(false);

      toggle().click();
      expect(JSON.parse(storage.getItem(SCALE_PREFERENCE)!)).toBe('stylised');
      expect(camera().position.length()).toBeCloseTo(homeDistance('stylised'), 3);
      expect(markersLayer().hidden).toBe(true);
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

    it('holds every body still while time passes (AC-11)', async () => {
      await open();
      const before = space.bodies!();
      for (let i = 1; i <= 60; i++) space.update(1 / 60, i / 60);
      expect(space.bodies!()).toEqual(before);
    });
  });

  it('bodies() reports every body’s world position and radius (seam)', async () => {
    await open();
    const expected = worldPositions(BODIES, layout(BODIES, 'stylised'));
    expect(
      space.bodies!()
        .map((b) => b.id)
        .sort(),
    ).toEqual(BODIES.map((b) => b.id).sort());
    for (const b of space.bodies!()) {
      b.world.forEach((c, i) => expect(c, b.id).toBeCloseTo(expected.get(b.id)![i]!, 6));
    }
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
    expect(ctx.overlay.querySelector('.scale-toggle, .body-markers')).toBeNull();
    expect(ctx.canvas.hasAttribute('aria-describedby')).toBe(false);
    expect(ctx.canvas.hasAttribute('tabindex')).toBe(false); // the controls are gone too
  });
});
