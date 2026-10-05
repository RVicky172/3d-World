import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PerspectiveCamera, Spherical, Vector3 } from 'three';
import { createCameraControls } from '../../../../src/shared/controls';
import type { CameraControls, CameraControlsConfig } from '../../../../src/shared/controls/types';

const CONFIG: CameraControlsConfig = {
  focus: [0, 0, 0],
  initialPosition: [0, 0, 4],
  distance: { min: 2, max: 8 },
  polar: { min: 0.2, max: Math.PI - 0.2 },
  panLimit: 1,
  turntable: { speed: 2, idleDelay: 4 },
};

describe('createCameraControls', () => {
  let canvas: HTMLCanvasElement;
  let overlay: HTMLElement;
  let camera: PerspectiveCamera;
  let space: AbortController;
  let controls: CameraControls;

  const create = (reducedMotion = false, config: CameraControlsConfig = CONFIG) => {
    controls = createCameraControls({
      camera,
      canvas,
      overlay,
      signal: space.signal,
      reducedMotion,
      coarsePointer: false,
      label: 'Demo Cube',
      config,
    });
    return controls;
  };
  const press = (key: string, init: KeyboardEventInit = {}, target: EventTarget = canvas) => {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
    target.dispatchEvent(event);
    return event;
  };
  const wheel = (deltaY: number) =>
    canvas.dispatchEvent(new WheelEvent('wheel', { deltaY, bubbles: true, cancelable: true }));
  const distance = () => camera.position.distanceTo(controls.target);
  const polar = () => new Spherical().setFromVector3(camera.position.clone().sub(controls.target)).phi;
  const pose = () => [...camera.position.toArray(), ...controls.target.toArray()];
  const expectAt = (v: Vector3, expected: [number, number, number]) =>
    v.toArray().forEach((c, i) => expect(c).toBeCloseTo(expected[i] ?? NaN, 9));
  const frames = (n: number, delta = 1 / 60) => {
    for (let i = 0; i < n; i++) controls.update(delta);
  };

  beforeEach(() => {
    canvas = document.createElement('canvas');
    overlay = document.createElement('div');
    document.body.append(canvas, overlay);
    camera = new PerspectiveCamera(50, 1, 0.1, 100);
    space = new AbortController();
  });

  afterEach(() => {
    controls?.dispose();
    canvas.remove();
    overlay.remove();
  });

  describe('setup (AC-6)', () => {
    it('places the camera at the initial position, looking at the focus point', () => {
      create();
      expectAt(camera.position, [0, 0, 4]);
      expectAt(controls.target, [0, 0, 0]);
    });

    it('makes the 3D view focusable and labelled while mounted (AC-3)', () => {
      create();
      expect(canvas.getAttribute('tabindex')).toBe('0');
      expect(canvas.getAttribute('role')).toBe('application');
      expect(canvas.getAttribute('aria-label')).toMatch(/Demo Cube/);
      expect(canvas.getAttribute('aria-label')).toMatch(/arrow keys/i);
    });

    it('adds the controls UI to the overlay (AC-10)', () => {
      create();
      expect(overlay.querySelector('.controls-hint')).not.toBeNull();
      expect(overlay.querySelector('button.controls-reset')).not.toBeNull();
    });
  });

  describe('keyboard (AC-3)', () => {
    it('orbits with arrow keys while the canvas has focus, keeping the distance', () => {
      create();
      const event = press('ArrowRight');
      expect(event.defaultPrevented).toBe(true); // arrows must not scroll the page
      expect(camera.position.x).not.toBeCloseTo(0);
      expect(distance()).toBeCloseTo(4);
    });

    it('zooms with + and - and pans with Shift+arrows', () => {
      create();
      press('+');
      expect(distance()).toBeLessThan(4);
      press('-');
      press('-');
      expect(distance()).toBeGreaterThan(4);
      press('ArrowRight', { shiftKey: true });
      expect(controls.target.x).toBeGreaterThan(0);
    });

    it('ignores keys that are not aimed at the 3D view', () => {
      create();
      const event = press('ArrowRight', {}, document.body);
      expect(event.defaultPrevented).toBe(false);
      expectAt(camera.position, [0, 0, 4]);
    });

    it('leaves browser shortcuts alone', () => {
      create();
      const event = press('ArrowLeft', { altKey: true });
      expect(event.defaultPrevented).toBe(false);
      expectAt(camera.position, [0, 0, 4]);
    });
  });

  describe('limits (AC-4)', () => {
    it('clamps zoom to the distance limits', () => {
      create(true);
      for (let i = 0; i < 50; i++) press('+');
      expect(distance()).toBeGreaterThanOrEqual(CONFIG.distance.min - 1e-6);
      for (let i = 0; i < 50; i++) press('-');
      expect(distance()).toBeLessThanOrEqual(CONFIG.distance.max + 1e-6);
    });

    it('clamps wheel zoom too', () => {
      create(true);
      for (let i = 0; i < 50; i++) wheel(-500);
      frames(5);
      expect(distance()).toBeGreaterThanOrEqual(CONFIG.distance.min - 1e-6);
    });

    it('never orbits over the top or under the bottom', () => {
      create(true);
      for (let i = 0; i < 50; i++) press('ArrowUp');
      expect(polar()).toBeGreaterThanOrEqual(CONFIG.polar.min - 1e-6);
      for (let i = 0; i < 100; i++) press('ArrowDown');
      expect(polar()).toBeLessThanOrEqual(CONFIG.polar.max + 1e-6);
    });

    it('keeps the focus point within the pan limit of home', () => {
      create(true);
      for (let i = 0; i < 50; i++) press('ArrowRight', { shiftKey: true });
      for (let i = 0; i < 50; i++) press('ArrowUp', { shiftKey: true });
      expect(controls.target.length()).toBeLessThanOrEqual(CONFIG.panLimit + 1e-6);
    });
  });

  describe('reset (AC-5)', () => {
    it('returns exactly to the initial view, even with damping still in flight', () => {
      create(false);
      press('ArrowRight');
      press('ArrowDown');
      press('ArrowRight', { shiftKey: true });
      wheel(-200);
      frames(2); // damping is mid-glide

      controls.reset();
      expect(pose()).toEqual([0, 0, 4, 0, 0, 0].map((v) => expect.closeTo(v, 9)));

      frames(30, 1 / 60); // no leftover glide, and the turntable waits (reset counts as interaction)
      expect(pose()).toEqual([0, 0, 4, 0, 0, 0].map((v) => expect.closeTo(v, 9)));
    });

    it('R resets, and so does the on-screen button', () => {
      create(true);
      press('ArrowRight');
      press('r');
      expect(camera.position.toArray().map((v) => +v.toFixed(9))).toEqual([0, 0, 4]);

      press('ArrowLeft');
      overlay.querySelector<HTMLButtonElement>('button.controls-reset')?.click();
      expect(camera.position.toArray().map((v) => +v.toFixed(9))).toEqual([0, 0, 4]);
    });
  });

  describe('motion (AC-7, AC-11)', () => {
    it('runs the turntable while idle', () => {
      create(false);
      frames(60);
      expect(controls.turntableActive).toBe(true);
      expect(camera.position.x).not.toBeCloseTo(0);
      expect(distance()).toBeCloseTo(4);
    });

    it('stops the turntable on wheel and key input, resuming after the idle delay', () => {
      create(false);
      wheel(-50);
      expect(controls.turntableActive).toBe(false);
      frames(60 * 3); // 3 s < 4 s idle delay
      expect(controls.turntableActive).toBe(false);
      frames(60 * 2);
      expect(controls.turntableActive).toBe(true);

      press('ArrowLeft');
      expect(controls.turntableActive).toBe(false);
    });

    it('with reduced motion: no turntable and no inertia', () => {
      create(true);
      frames(600);
      expect(controls.turntableActive).toBe(false);
      expectAt(camera.position, [0, 0, 4]);

      wheel(-100);
      const afterInput = camera.position.clone();
      frames(30);
      expect(camera.position.distanceTo(afterInput)).toBeCloseTo(0); // no glide after input
    });

    it('dismisses the hint on the first interaction', () => {
      create(false);
      wheel(-10);
      expect(overlay.querySelector('.controls-hint')).toBeNull();
    });

    it('is deterministic: identical deltas give identical turntable poses', () => {
      const run = () => {
        const cam = new PerspectiveCamera(50, 1, 0.1, 100);
        const c = createCameraControls({
          camera: cam,
          canvas: document.createElement('canvas'),
          overlay: document.createElement('div'),
          signal: new AbortController().signal,
          reducedMotion: false,
          coarsePointer: false,
          label: 'x',
          config: CONFIG,
        });
        for (const d of [0.016, 0.02, 0.1, 0.033]) c.update(d);
        const result = cam.position.toArray();
        c.dispose();
        return result;
      };
      expect(run()).toEqual(run());
    });
  });

  describe('userMoved and setHome() (spec 010, AC-3, AC-5)', () => {
    it('userMoved is false at start and while the turntable runs', () => {
      create();
      frames(120);
      expect(controls.turntableActive).toBe(true);
      expect(controls.userMoved).toBe(false);
    });

    it('becomes true on keyboard input or a pointer interaction, and reset() clears it', () => {
      create();
      press('ArrowLeft');
      expect(controls.userMoved).toBe(true);
      controls.reset();
      expect(controls.userMoved).toBe(false);

      wheel(100); // OrbitControls reports wheel zoom as start/end
      expect(controls.userMoved).toBe(true);
      press('r');
      expect(controls.userMoved).toBe(false);
    });

    it('setHome() applies new limits and moves the camera there when the visitor has not moved it', () => {
      create();
      controls.setHome({ position: [0, 0, 6], distance: { min: 3, max: 12 }, panLimit: 2 });

      expectAt(camera.position, [0, 0, 6]);
      expectAt(controls.target, [0, 0, 0]);
      for (let i = 0; i < 40; i++) press('-');
      expect(distance()).toBeCloseTo(12, 6);
      for (let i = 0; i < 40; i++) press('+');
      expect(distance()).toBeCloseTo(3, 6);
    });

    it('setHome() leaves a moved camera where it is, but reset() goes to the new home', () => {
      create();
      press('ArrowLeft');
      const before = pose();

      controls.setHome({ position: [0, 0, 6], distance: { min: 2, max: 12 }, panLimit: 1 });
      expect(pose()).toEqual(before);

      controls.reset();
      expectAt(camera.position, [0, 0, 6]);
      expectAt(controls.target, [0, 0, 0]);
    });

    it('setHome() keeps a moved camera within the new limits', () => {
      create();
      press('ArrowLeft'); // moved, at distance 4
      controls.setHome({ position: [0, 0, 6], distance: { min: 5, max: 12 }, panLimit: 1 });
      frames(1);
      expect(distance()).toBeCloseTo(5, 6);
    });
  });

  describe('turnTo() and holdTurntable() (spec 012, AC-9, AC-12)', () => {
    const direction = () => camera.position.clone().sub(controls.target).normalize();

    it('eases round to look from the given direction, keeping the distance, over the duration', () => {
      create();
      const before = distance();
      controls.turnTo([1, 0, 0], { duration: 0.5 });
      frames(15); // 0.25 s: halfway in time
      expect(direction().angleTo(new Vector3(1, 0, 0))).toBeCloseTo(Math.PI / 4, 1);
      frames(15);
      expectAt(direction(), [1, 0, 0]);
      expect(distance()).toBeCloseTo(before, 6);
      frames(30); // the turn is over: nothing drifts afterwards
      expectAt(direction(), [1, 0, 0]);
    });

    it('is instant with reduced motion', () => {
      create(true);
      controls.turnTo([0, 0.6, 0.8]);
      expectAt(direction(), [0, 0.6, 0.8]);
    });

    it('turns about the focus point, bringing a panned view back to it', () => {
      create(true);
      press('ArrowRight', { shiftKey: true });
      expect(controls.target.length()).toBeGreaterThan(0.01);
      controls.turnTo([1, 0, 0]);
      expectAt(controls.target, [0, 0, 0]);
      expectAt(direction(), [1, 0, 0]);
    });

    it('stays within the polar limits', () => {
      create(true);
      controls.turnTo([0, -1, 0.001]); // straight up from underneath
      expect(polar()).toBeCloseTo(CONFIG.polar.max, 6);
    });

    it('any visitor input cancels a turn in progress', () => {
      create();
      controls.turnTo([1, 0, 0], { duration: 1 });
      frames(10);
      press('ArrowUp');
      const after = direction();
      frames(60);
      expect(direction().angleTo(after)).toBeLessThan(1e-6);
      expect(direction().angleTo(new Vector3(1, 0, 0))).toBeGreaterThan(0.1);
    });

    it('counts as moving the camera, and the turntable stays off while turning', () => {
      create();
      controls.turnTo([1, 0, 0], { duration: 0.5 });
      expect(controls.userMoved).toBe(true);
      frames(10);
      expect(controls.turntableActive).toBe(false);
    });

    it('holdTurntable(true) keeps the turntable off; release resumes it only after the idle delay', () => {
      create();
      controls.holdTurntable(true);
      frames(600); // 10 s, well past the 4 s idle delay
      expect(controls.turntableActive).toBe(false);
      const held = pose();
      frames(30);
      pose().forEach((value, i) => expect(value).toBeCloseTo(held[i] ?? NaN, 9));

      controls.holdTurntable(false);
      frames(60 * 3);
      expect(controls.turntableActive).toBe(false);
      frames(60 * 1.1);
      expect(controls.turntableActive).toBe(true);
    });
  });

  describe('focusOn() and zoomSpeed (spec 020, D-023)', () => {
    it('focusOn() moves the orbit target to the point and keeps the camera where it is', () => {
      create(true);
      const before = camera.position.clone();
      controls.focusOn([0.5, 0, 0]);
      expectAt(controls.target, [0.5, 0, 0]);
      expect(camera.position.distanceTo(before)).toBeLessThan(1e-9);
      // The view turns to it.
      const looking = new Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
      const toPoint = new Vector3(0.5, 0, 0).sub(camera.position).normalize();
      expect(looking.angleTo(toPoint)).toBeLessThan(1e-6);
    });

    it('orbiting and zooming then happen around the new target', () => {
      create(true);
      controls.focusOn([0.5, 0, 0]);
      const before = camera.position.distanceTo(controls.target);
      press('ArrowLeft');
      expect(camera.position.distanceTo(controls.target)).toBeCloseTo(before, 6); // orbit keeps the distance
      wheel(-100);
      controls.update(1 / 60);
      expect(camera.position.distanceTo(controls.target)).toBeLessThan(before);
    });

    it('counts as an interaction: the turntable waits its idle delay; reset() returns home', () => {
      create(false);
      frames(10); // the turntable is running
      controls.focusOn([0.5, 0, 0]);
      expect(controls.userMoved).toBe(true);
      frames(60); // 1 s, inside the 4 s idle delay
      expect(controls.turntableActive).toBe(false);
      controls.reset();
      expectAt(controls.target, [0, 0, 0]);
      expectAt(camera.position, [0, 0, 4]);
    });

    it('focusOn(point, { minDistance }) keeps the camera that far from the point until reset()', () => {
      create(true);
      controls.focusOn([0.5, 0, 0], { minDistance: 1 });
      for (let i = 0; i < 40; i++) {
        wheel(-500);
        controls.update(1 / 60);
      }
      expect(camera.position.distanceTo(controls.target)).toBeGreaterThanOrEqual(1 - 1e-9);
      expect(camera.position.distanceTo(controls.target)).toBeLessThan(1.1); // it did zoom in, down to the limit

      controls.reset(); // back to the home limits (CONFIG: min 2)
      for (let i = 0; i < 40; i++) {
        wheel(-500);
        controls.update(1 / 60);
      }
      expect(distance()).toBeGreaterThanOrEqual(2 - 1e-9);
    });

    it('zoomSpeed scales each wheel step (default 1)', () => {
      const zoomedBy = (zoomSpeed?: number) => {
        controls?.dispose();
        camera = new PerspectiveCamera(50, 1, 0.1, 100);
        create(true, zoomSpeed === undefined ? CONFIG : { ...CONFIG, zoomSpeed });
        const start = distance();
        wheel(-100);
        controls.update(1 / 60);
        return distance() / start;
      };
      const normal = zoomedBy();
      const fast = zoomedBy(4);
      expect(normal).toBeLessThan(1);
      expect(Math.log(fast) / Math.log(normal)).toBeCloseTo(4, 1);
    });
  });

  describe('teardown (AC-8)', () => {
    it('dispose() removes attributes, UI and listeners, and restores touch scrolling', () => {
      create(false);
      expect(canvas.style.touchAction).toBe('none');
      controls.dispose();

      expect(canvas.hasAttribute('tabindex')).toBe(false);
      expect(canvas.hasAttribute('role')).toBe(false);
      expect(canvas.hasAttribute('aria-label')).toBe(false);
      expect(canvas.style.touchAction).toBe('');
      expect(overlay.children).toHaveLength(0);

      const before = camera.position.clone();
      press('ArrowRight');
      wheel(-200);
      expect(camera.position.equals(before)).toBe(true);
    });

    it('aborting the Space signal also removes the keyboard listener', () => {
      create(true);
      space.abort();
      press('ArrowRight');
      expectAt(camera.position, [0, 0, 4]);
    });
  });
});
