import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, PerspectiveCamera } from 'three';
import { createHotspots, type Hotspots } from '../../../../src/shared/hotspots';
import type { CameraControls } from '../../../../src/shared/controls/types';
import type { HotspotConfig } from '../../../../src/shared/hotspots/types';

// Spec 012, AC-5–AC-8, AC-10–AC-12, AC-15: markers drawn over points on the model, dimmed when the model hides
// them, opening one annotation at a time that turns the camera and pauses the turntable.

/** On a 2 × 2 × 2 box at the origin: the front face (z = 1), the back face, and a point in the open. */
const HOTSPOTS: readonly HotspotConfig[] = [
  { id: 'front', title: 'Front face', text: 'Faces the camera.', position: [0, 0, 1], view: [0, 0, 1] },
  { id: 'back', title: 'Back face', text: 'Hidden at first.', position: [0, 0, -1], view: [0, 0, -1] },
  { id: 'side', title: 'Side point', text: 'In the open.', position: [2, 0, 0], view: [1, 0, 0] },
];
const SIZE = 400;

describe('createHotspots', () => {
  let overlay: HTMLElement;
  let canvas: HTMLCanvasElement;
  let camera: PerspectiveCamera;
  let model: Group;
  let controls: {
    turnTo: Mock<CameraControls['turnTo']>;
    holdTurntable: Mock<CameraControls['holdTurntable']>;
  };
  let space: AbortController;
  let hotspots: Hotspots;

  /** A camera with fov 90°: at distance d from a plane, the half-height there is d units. */
  const moveCamera = (x: number, y: number, z: number, lookZ = 0) => {
    camera.position.set(x, y, z);
    camera.lookAt(0, 0, lookZ);
    camera.updateMatrixWorld();
  };

  const create = (config: readonly HotspotConfig[] = HOTSPOTS) => {
    hotspots = createHotspots({
      overlay,
      canvas,
      signal: space.signal,
      camera,
      model,
      hotspots: config,
      epsilon: 0.01,
      controls,
    });
    hotspots.resize(SIZE, SIZE);
    hotspots.update(0);
    return hotspots;
  };

  const layer = () => overlay.querySelector<HTMLElement>('.hotspots')!;
  const markers = () => [...overlay.querySelectorAll<HTMLButtonElement>('button.hotspot')];
  const marker = (id: string) => markers()[HOTSPOTS.findIndex((h) => h.id === id)]!;
  const annotation = () => overlay.querySelector<HTMLElement>('.hotspot-annotation');
  const closeButton = () => annotation()!.querySelector<HTMLButtonElement>('button')!;
  const escape = (target: EventTarget) =>
    target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  /** The `translate(x, y)` of an element, in px. */
  const translation = (el: HTMLElement) => {
    const match = /translate\((-?[\d.]+)px, (-?[\d.]+)px\)/.exec(el.style.transform);
    expect(match, `transform "${el.style.transform}"`).not.toBeNull();
    return { x: Number(match![1]), y: Number(match![2]) };
  };

  beforeEach(() => {
    overlay = document.createElement('div');
    canvas = document.createElement('canvas');
    canvas.tabIndex = 0;
    document.body.replaceChildren(canvas, overlay);
    model = new Group();
    model.add(new Mesh(new BoxGeometry(2, 2, 2), new MeshBasicMaterial()));
    model.updateMatrixWorld(true);
    camera = new PerspectiveCamera(90, 1, 0.1, 100);
    moveCamera(0, 0, 5);
    controls = { turnTo: vi.fn(), holdTurntable: vi.fn() };
    space = new AbortController();
  });

  afterEach(() => {
    hotspots?.dispose();
    vi.restoreAllMocks();
  });

  describe('markers (AC-5, AC-6, AC-10)', () => {
    it('adds one button per hotspot, in data order, named "Hotspot: <title>" and collapsed', () => {
      create();
      expect(layer().parentElement).toBe(overlay);
      expect(markers()).toHaveLength(3);
      markers().forEach((button, i) => {
        expect(button.type).toBe('button');
        expect(button.getAttribute('aria-label')).toBe(`Hotspot: ${HOTSPOTS[i]!.title}`);
        expect(button.getAttribute('aria-expanded')).toBe('false');
        expect(button.getAttribute('aria-controls')).toBeTruthy();
        expect(document.getElementById(button.getAttribute('aria-controls')!)).not.toBeNull();
      });
    });

    it('places each marker at its projected point via transform', () => {
      create();
      // (2, 0, 0) at depth 5 with a half-width of 5 units: 2/5 of the half-canvas right of centre.
      expect(translation(marker('side')).x).toBeCloseTo(280, 1);
      expect(translation(marker('side')).y).toBeCloseTo(200, 1);
      expect(translation(marker('front')).x).toBeCloseTo(200, 1);
      expect(translation(marker('front')).y).toBeCloseTo(200, 1);
    });

    it('follows the camera and the viewport size', () => {
      create();
      moveCamera(0, 0, 10); // twice as far: the side point is half as far from the centre
      hotspots.update(1 / 60);
      expect(translation(marker('side')).x).toBeCloseTo(240, 1);
      camera.aspect = 2; // wider, as the viewer sets it: same vertical fov, the centre moves
      camera.updateProjectionMatrix();
      hotspots.resize(800, 400);
      hotspots.update(1 / 60);
      expect(translation(marker('side')).x).toBeCloseTo(440, 1);
      expect(translation(marker('side')).y).toBeCloseTo(200, 1);
    });

    it('accounts for where the model sits (e.g. after centring)', () => {
      model.position.set(1, 0, 0);
      model.updateMatrixWorld(true);
      create();
      expect(hotspots.positions().map((p) => p.id)).toEqual(['front', 'back', 'side']);
      expect(hotspots.positions()[2]!.world).toEqual([3, 0, 0]);
      expect(translation(marker('front')).x).toBeCloseTo(200 + (1 / 4) * 200, 1); // depth 4 at z = 1
    });

    it('hides markers whose point is behind the camera', () => {
      create();
      moveCamera(0, 0, 0.5, -1); // inside the box, looking away from the front face
      hotspots.update(1 / 60);
      expect(marker('front').hidden).toBe(true);
      expect(marker('back').hidden).toBe(false);
    });

    it('writes nothing to the DOM when neither the camera nor the size changed (NFR)', () => {
      create();
      const observer = new MutationObserver(() => {});
      observer.observe(layer(), { attributes: true, childList: true, subtree: true, characterData: true });
      for (let i = 0; i < 10; i++) hotspots.update(1 / 60);
      expect(observer.takeRecords()).toHaveLength(0);

      moveCamera(0, 1, 5);
      hotspots.update(1 / 60);
      expect(observer.takeRecords().length).toBeGreaterThan(0);
      hotspots.resize(300, 300);
      hotspots.update(1 / 60);
      expect(observer.takeRecords().length).toBeGreaterThan(0);
      observer.disconnect();
    });
  });

  describe('dimming (AC-7)', () => {
    it('disables and dims markers the model hides, and enables them once their point faces the camera', () => {
      create();
      expect(marker('back').disabled).toBe(true);
      expect(marker('back').classList.contains('is-dimmed')).toBe(true);
      expect(marker('back').hidden).toBe(false); // still visible, just dimmed
      expect(marker('front').disabled).toBe(false);
      expect(marker('side').disabled).toBe(false);

      moveCamera(0, 0, -5);
      hotspots.update(0.2);
      expect(marker('back').disabled).toBe(false);
      expect(marker('back').classList.contains('is-dimmed')).toBe(false);
      expect(marker('front').disabled).toBe(true);
    });

    it('moves focus to the 3D view when the focused marker dims, so it is never lost', () => {
      create();
      marker('front').focus();
      moveCamera(0, 0, -5);
      hotspots.update(0.2);
      expect(document.activeElement).toBe(canvas);
    });

    it('a dimmed marker cannot be activated', () => {
      create();
      marker('back').click();
      expect(controls.turnTo).not.toHaveBeenCalled();
      expect(annotation()).toBeNull();
    });
  });

  describe('activation (AC-8, AC-9, AC-12)', () => {
    it('turns the camera to the view, holds the turntable and fills the polite annotation', () => {
      create();
      marker('front').focus();
      marker('front').click();

      const [direction] = controls.turnTo.mock.calls[0]!;
      [0, 0, 1].forEach((c, i) => expect(direction[i]).toBeCloseTo(c, 9));
      expect(controls.holdTurntable).toHaveBeenLastCalledWith(true);
      expect(marker('front').getAttribute('aria-expanded')).toBe('true');

      const live = annotation()!.closest('[aria-live]');
      expect(live?.getAttribute('aria-live')).toBe('polite');
      expect(live?.id).toBe(marker('front').getAttribute('aria-controls'));
      const heading = annotation()!.querySelector('h3');
      expect(heading?.textContent).toBe('Front face');
      expect(annotation()!.getAttribute('aria-labelledby')).toBe(heading?.id);
      expect(annotation()!.querySelector('p')?.textContent).toBe('Faces the camera.');
      expect(closeButton().textContent).toBe('Close');
      expect(document.activeElement).toBe(marker('front')); // focus stays put
    });

    it('opens one annotation at a time, keeping the turntable held while switching', () => {
      create();
      marker('front').click();
      marker('side').click();
      expect(marker('front').getAttribute('aria-expanded')).toBe('false');
      expect(marker('side').getAttribute('aria-expanded')).toBe('true');
      expect(overlay.querySelectorAll('.hotspot-annotation')).toHaveLength(1);
      expect(annotation()!.querySelector('h3')?.textContent).toBe('Side point');
      expect(controls.holdTurntable).not.toHaveBeenCalledWith(false);
    });

    it('sits beside its marker, inside the viewport, and follows it', () => {
      vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(200);
      vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(100);
      create();
      marker('side').click(); // at (280, 200): no room on the right, so it goes left
      hotspots.update(1 / 60);
      const box = translation(annotation()!);
      expect(box.x).toBeGreaterThanOrEqual(8);
      expect(box.x + 200).toBeLessThanOrEqual(SIZE - 8);
      expect(box.y).toBeGreaterThanOrEqual(8);
      expect(box.y + 100).toBeLessThanOrEqual(SIZE - 8);
      expect(box.x + 200 <= 280 - 22 || box.x >= 280 + 22).toBe(true); // doesn't cover its marker

      moveCamera(0, 0, 10); // the marker moves to x = 240
      hotspots.update(1 / 60);
      expect(translation(annotation()!).x).not.toBeCloseTo(box.x, 1);
    });

    it('goes below its marker when neither side has room, never over it (narrow screens)', () => {
      vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(200);
      vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(100);
      create();
      hotspots.resize(240, 400); // the front marker sits at x = 120: no 200 px on either side
      marker('front').click();
      hotspots.update(1 / 60);
      const below = translation(annotation()!);
      expect(below.y).toBeGreaterThanOrEqual(200 + 22); // under the marker's 44 px target
      expect(below.x).toBeGreaterThanOrEqual(8);
      expect(below.x + 200).toBeLessThanOrEqual(240 - 8);
    });

    it('goes above its marker when there is no room below either', () => {
      vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(200);
      vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(100);
      // In the open below the box: at depth 4, y = −2.5 lands at 325 px of 400.
      create([
        { id: 'low', title: 'Low', text: 'Near the bottom.', position: [0, -2.5, 1], view: [0, 0, 1] },
      ]);
      hotspots.resize(240, 400);
      markers()[0]!.click();
      hotspots.update(1 / 60);
      const y = translation(markers()[0]!).y;
      expect(y).toBeCloseTo(325, 0);
      expect(translation(annotation()!).y + 100).toBeLessThanOrEqual(y - 22);
    });

    it('moves with the camera while open', () => {
      create();
      marker('side').click();
      hotspots.update(1 / 60);
      const box = translation(annotation()!);
      moveCamera(0, 0, 10);
      hotspots.update(1 / 60);
      expect(translation(annotation()!).x).not.toBeCloseTo(box.x, 1);
    });
  });

  describe('closing (AC-8, AC-12)', () => {
    const closers: Array<[string, () => void]> = [
      ['Escape', () => escape(closeButton())],
      ['the Close button', () => closeButton().click()],
      ['the marker again', () => marker('front').click()],
    ];

    it.each(closers)('%s closes it, releases the turntable and returns focus to the marker', (_, close) => {
      create();
      marker('front').click();
      closeButton().focus();
      close();
      expect(annotation()).toBeNull();
      expect(marker('front').getAttribute('aria-expanded')).toBe('false');
      expect(controls.holdTurntable).toHaveBeenLastCalledWith(false);
      expect(document.activeElement).toBe(marker('front'));
    });

    it('Escape with nothing open does nothing', () => {
      create();
      escape(marker('front'));
      expect(controls.holdTurntable).not.toHaveBeenCalled();
    });

    it('returns focus to the 3D view if the marker has dimmed meanwhile', () => {
      create();
      marker('front').click();
      moveCamera(0, 0, -5);
      hotspots.update(0.2);
      closeButton().click();
      expect(document.activeElement).toBe(canvas);
    });
  });

  it('the layer lets drags through to the 3D view; markers and the annotation catch them (AC-11)', () => {
    const style = document.createElement('style');
    style.textContent = readFileSync('src/styles/main.css', 'utf8');
    document.head.append(style);
    try {
      create();
      marker('front').click();
      expect(getComputedStyle(layer()).pointerEvents).toBe('none');
      expect(getComputedStyle(marker('front')).pointerEvents).toBe('auto');
      expect(getComputedStyle(annotation()!).pointerEvents).toBe('auto');
      expect(getComputedStyle(marker('back')).pointerEvents).toBe('none'); // dimmed: drags pass through
    } finally {
      style.remove();
    }
  });

  it('dispose() removes the DOM and the listeners (AC-15)', () => {
    create();
    marker('front').click();
    hotspots.dispose();
    expect(overlay.querySelector('.hotspots')).toBeNull();
    controls.holdTurntable.mockClear();
    escape(overlay);
    expect(controls.holdTurntable).not.toHaveBeenCalled();
    expect(() => hotspots.update(1 / 60)).not.toThrow();
  });
});
