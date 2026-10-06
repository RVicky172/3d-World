import { describe, expect, it } from 'vitest';
import { inPlanetShadow, ringShadowRadius } from '../../../../src/spaces/solar-system/ring-shadows';

// Spec 022, AC-8: Saturn's shadow on its rings and the rings' shadow on Saturn, in Saturn's local frame (unit
// radius, ring plane y = 0, the pole along +y). The ring and body shaders mirror these functions.

const v = (x: number, y: number, z: number) => ({ x, y, z });
const unit = (x: number, y: number, z: number) => {
  const l = Math.hypot(x, y, z);
  return v(x / l, y / l, z / l);
};

describe('inPlanetShadow: is a ring point behind Saturn as seen from the Sun?', () => {
  const sunAlongX = v(1, 0, 0);

  it('shadows the ring directly behind the planet', () => {
    expect(inPlanetShadow(v(-1.5, 0, 0), sunAlongX)).toBe(true);
    expect(inPlanetShadow(v(-2.3, 0, 0.9), sunAlongX)).toBe(true); // inside the shadow's unit radius
  });

  it('lights the ring on the Sun’s side and beside the planet', () => {
    expect(inPlanetShadow(v(1.5, 0, 0), sunAlongX)).toBe(false);
    expect(inPlanetShadow(v(0, 0, 1.5), sunAlongX)).toBe(false);
    expect(inPlanetShadow(v(-2, 0, 1.01), sunAlongX)).toBe(false); // just outside the shadow
  });

  it('a Sun high above the ring plane casts a shorter shadow on the rings', () => {
    const high = unit(1, 1.2, 0); // ~50° above the plane
    expect(inPlanetShadow(v(-1.5, 0, 0), high)).toBe(false);
    const low = unit(1, 0.2, 0);
    expect(inPlanetShadow(v(-1.5, 0, 0), low)).toBe(true);
  });
});

describe('ringShadowRadius: where a Saturn point’s ray to the Sun crosses the ring plane', () => {
  const sunNorth = unit(0, 0.5, 0.866); // 30° above the ring plane

  it('returns the crossing radius for points on the hemisphere away from the Sun', () => {
    const r = ringShadowRadius(v(0, -0.6, 0.8), sunNorth)!;
    expect(r).toBeCloseTo(0.8 + (0.6 / sunNorth.y) * sunNorth.z, 9);
    expect(r).toBeGreaterThan(1.279); // within the rings (1.279–2.349 radii): shadowed
    expect(r).toBeLessThan(2.349);
  });

  it('returns null on the hemisphere facing the Sun (the ray never meets the rings)', () => {
    expect(ringShadowRadius(v(0, 0.6, 0.8), sunNorth)).toBeNull();
  });

  it('returns null at equinox, when the Sun lies in the ring plane', () => {
    expect(ringShadowRadius(v(0, -0.6, 0.8), v(0, 0, 1))).toBeNull();
  });
});
