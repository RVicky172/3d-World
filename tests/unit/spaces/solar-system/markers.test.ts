import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';
import { createBodyMarkers, type BodyMarkers } from '../../../../src/spaces/solar-system/markers';

// Spec 020, AC-8a: at real scale, name markers show where the sub-pixel bodies are. A moon's marker shows only
// once it is ≥ 24 px from its planet's. Overlapping names keep the larger body's; names stay in view (D-024).
// `nearest()` finds the body a zoom starts on (D-023).

const SIZE = 400;
/** fov 90° at (0, 0, 10): a point at depth 10 maps 1 unit → 20 px from the centre. */
const BODIES = [
  { id: 'sun', name: 'Sun', parent: null, size: 695_700 },
  { id: 'earth', name: 'Earth', parent: 'sun', size: 6371 },
  { id: 'moon', name: 'Moon', parent: 'earth', size: 1737 },
];

describe('createBodyMarkers', () => {
  let overlay: HTMLElement;
  let camera: PerspectiveCamera;
  let positions: Map<string, Vector3>;
  let markers: BodyMarkers;

  const moveCamera = (z: number) => {
    camera.position.set(0, 0, z);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
  };
  const create = (active = true) => {
    markers = createBodyMarkers({ overlay, camera, bodies: BODIES, worldOf: (id) => positions.get(id)! });
    markers.resize(SIZE, SIZE);
    markers.setActive(active);
    markers.update();
    return markers;
  };
  const layer = () => overlay.querySelector<HTMLElement>('.body-markers')!;
  const name = (id: string) => marker(id).querySelector<HTMLElement>('.body-marker-name')!;
  const dot = (id: string) => marker(id).querySelector('.body-marker-dot');
  const marker = (id: string) => overlay.querySelector<HTMLElement>(`.body-marker[data-body="${id}"]`)!;
  const at = (el: HTMLElement) => {
    const m = /translate\((-?[\d.]+)px, (-?[\d.]+)px\)/.exec(el.style.transform);
    expect(m, el.style.transform).not.toBeNull();
    return { x: Number(m![1]), y: Number(m![2]) };
  };

  beforeEach(() => {
    overlay = document.createElement('div');
    document.body.replaceChildren(overlay);
    camera = new PerspectiveCamera(90, 1, 0.1, 100);
    moveCamera(10);
    positions = new Map([
      ['sun', new Vector3(0, 0, 0)],
      ['earth', new Vector3(5, 0, 0)],
      ['moon', new Vector3(5.5, 0, 0)], // 10 px from Earth at depth 10
    ]);
  });

  afterEach(() => markers?.dispose());

  it('labels every body by name in a layer hidden from assistive technology', () => {
    create();
    expect(layer().getAttribute('aria-hidden')).toBe('true');
    expect(BODIES.map((b) => marker(b.id).textContent)).toEqual(['Sun', 'Earth', 'Moon']);
    expect(name('sun').hidden).toBe(false);
    expect(marker('earth').querySelector('.body-marker-dot')).not.toBeNull();
  });

  it('places each marker on its body’s projected position', () => {
    create();
    expect(at(marker('sun'))).toEqual({ x: 200, y: 200 });
    expect(at(marker('earth')).x).toBeCloseTo(300, 1);
    expect(at(marker('earth')).y).toBeCloseTo(200, 1);
  });

  it('hides a moon’s marker until it is at least 24 px from its planet’s', () => {
    create();
    expect(marker('moon').hidden).toBe(true); // 10 px apart
    expect(marker('earth').hidden).toBe(false);
    moveCamera(3); // closer: Earth at depth 3, the Moon 0.5 units = ~33 px from it
    markers.update();
    expect(marker('moon').hidden).toBe(false);
  });

  describe('declutter (D-024)', () => {
    it('where two names would overlap, the larger body keeps its name; the other keeps only its dot', () => {
      positions.set('earth', new Vector3(0.5, 0, 0)); // 10 px right of the Sun: "Sun" runs over it
      create();
      expect(name('sun').hidden).toBe(false);
      expect(name('earth').hidden).toBe(true);
      expect(marker('earth').hidden).toBe(false); // the dot still shows where Earth is
      expect(dot('earth')).not.toBeNull();
    });

    it('the name comes back once there is room (zooming in)', () => {
      positions.set('earth', new Vector3(0.5, 0, 0));
      positions.set('moon', new Vector3(0.6, 0, 0));
      create();
      moveCamera(1); // Earth now ~100 px from the Sun
      markers.update();
      expect(name('earth').hidden).toBe(false);
    });

    it('uses the names’ measured sizes when the browser has them', () => {
      // Sun at 200, Earth at 300: by estimate "Sun" is ~21 px wide and clears Earth; measured at 120 px it doesn't.
      const width = vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(120);
      const height = vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(15);
      try {
        create();
        expect(name('sun').hidden).toBe(false);
        expect(name('earth').hidden).toBe(true);
      } finally {
        width.mockRestore();
        height.mockRestore();
      }
    });

    it('names far apart are all shown', () => {
      create(); // Sun at 200, Earth at 300
      expect(name('sun').hidden).toBe(false);
      expect(name('earth').hidden).toBe(false);
    });

    it('a name that would run past the right edge sits left of its dot', () => {
      positions.set('earth', new Vector3(9.5, 0, 0)); // x = 390 of 400
      create();
      expect(marker('earth').classList.contains('is-left')).toBe(true);
      expect(marker('sun').classList.contains('is-left')).toBe(false);
    });
  });

  it('hides markers behind the camera', () => {
    positions.set('earth', new Vector3(0, 0, 20));
    create();
    expect(marker('earth').hidden).toBe(true);
  });

  it('shows nothing while inactive (stylised scale), and comes back when activated', () => {
    create(false);
    expect(layer().hidden).toBe(true);
    markers.setActive(true);
    markers.update();
    expect(layer().hidden).toBe(false);
    expect(at(marker('sun'))).toEqual({ x: 200, y: 200 });
  });

  it('writes nothing to the DOM while neither the camera, the size nor the state changed', () => {
    create();
    const observer = new MutationObserver(() => {});
    observer.observe(layer(), { attributes: true, subtree: true, childList: true });
    for (let i = 0; i < 5; i++) markers.update();
    expect(observer.takeRecords()).toHaveLength(0);
    moveCamera(9);
    markers.update();
    expect(observer.takeRecords().length).toBeGreaterThan(0);
    observer.disconnect();
  });

  it('nearest() finds the body whose projected centre is closest within the radius (D-023)', () => {
    create();
    expect(markers.nearest(306, 202, 24)).toBe('moon'); // Earth at 300, the Moon at 310: the Moon is nearer
    expect(markers.nearest(298, 200, 24)).toBe('earth');
    expect(markers.nearest(200, 230, 24)).toBe(null); // the Sun is 30 px away
    markers.setActive(false);
    expect(markers.nearest(298, 200, 24)).toBe(null);
  });

  it('lets pointer events through to the 3D view (labels, not controls)', () => {
    const style = document.createElement('style');
    style.textContent = readFileSync('src/styles/main.css', 'utf8');
    document.head.append(style);
    try {
      create();
      expect(getComputedStyle(layer()).pointerEvents).toBe('none');
      expect(getComputedStyle(marker('earth')).pointerEvents).toBe('none');
    } finally {
      style.remove();
    }
  });

  it('dispose() removes the layer (AC-12)', () => {
    create();
    markers.dispose();
    expect(overlay.querySelector('.body-markers')).toBeNull();
    expect(() => markers.update()).not.toThrow();
  });
});
