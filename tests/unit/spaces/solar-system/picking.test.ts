import { describe, expect, it } from 'vitest';
import { pick, type Pickable } from '../../../../src/spaces/solar-system/picking';

// Spec 023, AC-1, plan §1: which body a click lands on, from the bodies' on-screen projections (CSS px).

const body = (id: string, x: number, y: number, more: Partial<Pickable> = {}): Pickable => ({
  id,
  x,
  y,
  radiusPx: 0.5,
  depth: 10,
  visible: true,
  nameBox: null,
  ...more,
});

describe('pick', () => {
  it('hits a tiny body within 22 px of its centre (a 44 × 44 px target), and misses beyond', () => {
    const items = [body('mercury', 100, 100, { radiusPx: 0.3 })];
    expect(pick(items, 121, 100)).toBe('mercury');
    expect(pick(items, 100 + 15, 100 + 15)).toBe('mercury'); // 21.2 px diagonally
    expect(pick(items, 123, 100)).toBeNull();
  });

  it('hits a large disc anywhere inside it', () => {
    const items = [body('saturn', 200, 200, { radiusPx: 80 })];
    expect(pick(items, 270, 200)).toBe('saturn');
    expect(pick(items, 200, 279)).toBe('saturn');
    expect(pick(items, 200, 282)).toBeNull();
  });

  it('inside two discs: the one nearer the camera wins, wherever its centre is', () => {
    const items = [
      body('saturn', 200, 200, { radiusPx: 80, depth: 30 }),
      body('titan', 250, 200, { radiusPx: 10, depth: 20 }),
    ];
    expect(pick(items, 245, 200)).toBe('titan');
    expect(pick(items, 205, 200)).toBe('saturn'); // inside Saturn only
    // Titan behind Saturn's disc: Saturn wins even right on Titan's centre.
    expect(pick([items[0]!, { ...items[1]!, depth: 40 }], 250, 200)).toBe('saturn');
  });

  it('outside every disc: the nearest centre within reach wins', () => {
    const items = [body('earth', 100, 100), body('moon', 115, 100)];
    expect(pick(items, 104, 100)).toBe('earth');
    expect(pick(items, 112, 100)).toBe('moon');
  });

  it('a click on a shown name selects its body, even with another dot closer', () => {
    const items = [body('jupiter', 100, 100, { nameBox: [107, 92, 160, 108] }), body('io', 140, 112)];
    expect(pick(items, 140, 100)).toBe('jupiter');
    expect(pick(items, 140, 112)).toBe('io'); // below the name box
  });

  it('never hits a hidden body (behind the camera, or a moon tucked into its planet)', () => {
    const items = [body('triton', 100, 100, { visible: false, nameBox: [107, 92, 150, 108] })];
    expect(pick(items, 100, 100)).toBeNull();
    expect(pick(items, 120, 100)).toBeNull();
  });

  it('nothing nearby: null', () => {
    expect(pick([], 10, 10)).toBeNull();
    expect(pick([body('sun', 500, 500)], 10, 10)).toBeNull();
  });

  it('takes the reach as a parameter', () => {
    const items = [body('mars', 100, 100)];
    expect(pick(items, 130, 100, 30)).toBe('mars');
    expect(pick(items, 130, 100)).toBeNull();
  });
});
