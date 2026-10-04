import { describe, expect, it } from 'vitest';
import { Points, PointsMaterial, Vector3 } from 'three';
import { createStarfield, STARFIELD } from '../../../src/gallery/starfield';

const positionsOf = (points: Points) => Array.from(points.geometry.getAttribute('position').array);

describe('createStarfield', () => {
  it(`is a single Points object with ${STARFIELD.count} stars and no texture`, () => {
    const { object } = createStarfield(false);
    expect(object).toBeInstanceOf(Points);
    expect(object.children).toHaveLength(0);
    expect(object.geometry.getAttribute('position').count).toBe(STARFIELD.count);
    const material = object.material as PointsMaterial;
    expect(material).toBeInstanceOf(PointsMaterial);
    expect(material.map).toBeNull();
  });

  it('places every star in the radius shell around the camera', () => {
    const position = createStarfield(false).object.geometry.getAttribute('position');
    const v = new Vector3();
    for (let i = 0; i < position.count; i++) {
      const r = v.fromBufferAttribute(position, i).length();
      expect(r).toBeGreaterThanOrEqual(STARFIELD.radius.min - 1e-6);
      expect(r).toBeLessThanOrEqual(STARFIELD.radius.max + 1e-6);
    }
  });

  it('is deterministic: the seeded layout is identical every time (AC-13 frame comparison)', () => {
    expect(positionsOf(createStarfield(false).object)).toEqual(positionsOf(createStarfield(false).object));
  });

  it('spreads stars in all directions, not in a clump', () => {
    const position = createStarfield(false).object.geometry.getAttribute('position');
    const centroid = new Vector3();
    const v = new Vector3();
    for (let i = 0; i < position.count; i++) centroid.add(v.fromBufferAttribute(position, i));
    centroid.divideScalar(position.count);
    // Uniform directions average to ~0; a clump would sit far out at ~radius.
    expect(centroid.length()).toBeLessThan(STARFIELD.radius.min * 0.1);
  });

  it('drifts as a pure function of elapsed time', () => {
    const a = createStarfield(false);
    const b = createStarfield(false);
    a.update(10);
    b.update(10);
    expect(a.object.rotation.y).not.toBe(0);
    expect(a.object.rotation.toArray()).toEqual(b.object.rotation.toArray());
  });

  it('stays still with reduced motion (AC-13)', () => {
    const { object, update } = createStarfield(true);
    update(10);
    update(1000);
    expect(object.rotation.toArray().slice(0, 3)).toEqual([0, 0, 0]);
  });
});
