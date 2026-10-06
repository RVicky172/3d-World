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
  /** World radii for the D-037 rule (spec 023); absent = every body sub-pixel, as 020's real scale. */
  let radii: Map<string, number> | null;

  const moveCamera = (z: number) => {
    camera.position.set(0, 0, z);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
  };
  const create = (active = true) => {
    markers = createBodyMarkers({
      overlay,
      camera,
      bodies: BODIES,
      worldOf: (id) => positions.get(id)!,
      ...(radii ? { radiusOf: (id: string) => radii!.get(id) ?? 0 } : {}),
    });
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
    radii = null;
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

  it('follows bodies that moved under a still camera once invalidated (021: time moves them)', () => {
    create();
    positions.get('earth')!.set(-5, 0, 0);
    markers.update();
    expect(at(marker('earth')).x).toBeCloseTo(300, 1); // the camera didn't move: skipped
    markers.invalidate();
    markers.update();
    expect(at(marker('earth')).x).toBeCloseTo(100, 1);
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

  describe('both scales: dot or name beside the disc (spec 023, AC-14, D-037)', () => {
    const offset = (id: string) => marker(id).style.getPropertyValue('--name-offset');

    it('below 3 px on screen a body keeps its dot, its name 7 px out', () => {
      radii = new Map([
        ['sun', 0.1],
        ['earth', 0.1],
        ['moon', 0.01],
      ]); // 2 px at depth 10
      create();
      expect(marker('sun').classList.contains('is-disc')).toBe(false);
      expect(offset('sun')).toBe('7px');
    });

    it('from 3 px a body has no dot and its name sits radius + 4 px from the centre', () => {
      radii = new Map([
        ['sun', 1],
        ['earth', 0.1],
        ['moon', 0.01],
      ]); // the Sun: 20 px
      create();
      expect(marker('sun').classList.contains('is-disc')).toBe(true);
      expect(offset('sun')).toBe('24px');
      expect(marker('earth').classList.contains('is-disc')).toBe(false);
      moveCamera(2); // Earth now 0.1 units at depth ~2: ~10 px
      markers.update();
      expect(marker('earth').classList.contains('is-disc')).toBe(true);
    });

    it('the CSS hides the dot of a disc and keeps the layer click-through', () => {
      const style = document.createElement('style');
      style.textContent = readFileSync('src/styles/main.css', 'utf8');
      document.head.append(style);
      try {
        radii = new Map([['sun', 1]]);
        create();
        expect(getComputedStyle(dot('sun')!).display).toBe('none');
        expect(getComputedStyle(dot('earth')!).display).not.toBe('none');
        expect(getComputedStyle(marker('sun')).pointerEvents).toBe('none');
      } finally {
        style.remove();
      }
    });

    it('the declutter uses the pushed-out name boxes', () => {
      // The Sun's disc is 60 px; Earth 70 px right of it. With the name at 64 px out, "Sun" now overlaps Earth's.
      radii = new Map([
        ['sun', 3],
        ['earth', 0.01],
        ['moon', 0.001],
      ]);
      positions.set('earth', new Vector3(3.5, 0, 0)); // x = 270
      positions.set('moon', new Vector3(9, 9, 0));
      create();
      expect(name('sun').hidden).toBe(false);
      expect(name('earth').hidden).toBe(true);
    });
  });

  describe('selection (spec 023, AC-3)', () => {
    it('marks the selected body, one at a time', () => {
      create();
      markers.setSelected('earth');
      markers.update();
      expect(marker('earth').classList.contains('is-selected')).toBe(true);
      markers.setSelected('sun');
      markers.update();
      expect(marker('earth').classList.contains('is-selected')).toBe(false);
      expect(marker('sun').classList.contains('is-selected')).toBe(true);
      markers.setSelected(null);
      markers.update();
      expect(overlay.querySelectorAll('.is-selected')).toHaveLength(0);
    });

    it('the selected body keeps its name over a larger neighbour', () => {
      positions.set('earth', new Vector3(0.5, 0, 0)); // "Sun" runs over Earth
      create();
      expect(name('earth').hidden).toBe(true);
      markers.setSelected('earth');
      markers.update(); // a selection change redraws even with a still camera
      expect(name('earth').hidden).toBe(false);
      expect(name('sun').hidden).toBe(true);
    });
  });

  describe('hit() (spec 023, AC-1)', () => {
    it('picks by disc, 22 px reach and shown names; null while inactive', () => {
      radii = new Map([
        ['sun', 3],
        ['earth', 0.01],
        ['moon', 0.001],
      ]); // the Sun: 60 px
      positions.set('earth', new Vector3(-8, 0, 0)); // x = 40
      create();
      expect(markers.hit(250, 200)).toBe('sun'); // inside its disc
      expect(markers.hit(60, 200)).toBe('earth'); // 20 px from its centre
      // On the Sun's name: it starts 64 px right of the centre (x 264), beyond the disc and its reach.
      expect(markers.hit(270, 200)).toBe('sun');
      expect(markers.hit(120, 120)).toBeNull();
      markers.setActive(false);
      expect(markers.hit(250, 200)).toBeNull();
    });

    it('never picks a hidden marker (a moon tucked into its planet)', () => {
      create();
      expect(marker('moon').hidden).toBe(true);
      expect(markers.hit(310, 200)).toBe('earth');
    });
  });

  it('dispose() removes the layer (AC-12)', () => {
    create();
    markers.dispose();
    expect(overlay.querySelector('.body-markers')).toBeNull();
    expect(() => markers.update()).not.toThrow();
  });
});
