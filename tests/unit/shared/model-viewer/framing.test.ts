import { describe, expect, it } from 'vitest';
import { Box3, BoxGeometry, Group, Mesh, Vector3 } from 'three';
import { distanceLimits, fitModel, frameDistance } from '../../../../src/shared/model-viewer/framing';

const FOV = (50 * Math.PI) / 180;

/** Fraction of the smaller viewport dimension a centred sphere spans when seen from `distance`. */
function sphereFill(radius: number, distance: number, fovY: number, aspect: number): number {
  const angularRadius = Math.asin(radius / distance);
  return Math.tan(angularRadius) / (Math.tan(fovY / 2) * Math.min(1, aspect));
}

describe('frameDistance (spec 010, AC-2)', () => {
  it.each([
    ['landscape 16:9', 16 / 9],
    ['tablet 3:4', 768 / 1024],
    ['portrait phone 1:2', 320 / 640],
    ['square', 1],
  ])('makes the sphere fill the requested share of the smaller dimension (%s)', (_label, aspect) => {
    const distance = frameDistance(2, FOV, aspect, 0.75);
    expect(sphereFill(2, distance, FOV, aspect)).toBeCloseTo(0.75, 6);
  });

  it('frames by the width in portrait, so a narrow phone needs a larger distance than landscape', () => {
    expect(frameDistance(1, FOV, 0.5, 0.75)).toBeGreaterThan(frameDistance(1, FOV, 16 / 9, 0.75));
  });

  it('is the same for every landscape aspect: the height is the smaller dimension', () => {
    expect(frameDistance(1, FOV, 4 / 3, 0.75)).toBeCloseTo(frameDistance(1, FOV, 21 / 9, 0.75), 10);
  });

  it('grows as the fill shrinks, and scales with the radius', () => {
    expect(frameDistance(1, FOV, 1, 0.1)).toBeGreaterThan(frameDistance(1, FOV, 1, 0.75));
    expect(frameDistance(3, FOV, 1, 0.75)).toBeCloseTo(3 * frameDistance(1, FOV, 1, 0.75), 10);
  });

  it('always keeps the camera outside the sphere', () => {
    expect(frameDistance(1, FOV, 1, 0.99)).toBeGreaterThan(1);
  });
});

describe('distanceLimits (spec 010, AC-5)', () => {
  it('keeps the camera out of the model and the model at least 10 % of the smaller dimension', () => {
    const { min, max } = distanceLimits(2, FOV, 16 / 9);
    expect(min).toBeCloseTo(2.4, 10); // 1.2 × radius
    expect(sphereFill(2, max, FOV, 16 / 9)).toBeCloseTo(0.1, 6);
  });

  it.each([16 / 9, 0.75, 0.5])('leaves the framed view inside the limits (aspect %f)', (aspect) => {
    const { min, max } = distanceLimits(1, FOV, aspect);
    const home = frameDistance(1, FOV, aspect, 0.75);
    expect(min).toBeLessThan(home);
    expect(home).toBeLessThan(max);
  });
});

describe('fitModel', () => {
  it('centres an off-origin model on the origin and returns its bounding-sphere radius', () => {
    const group = new Group();
    const mesh = new Mesh(new BoxGeometry(2, 4, 4));
    mesh.position.set(5, -3, 1);
    group.add(mesh);

    const { radius } = fitModel(group);

    const center = new Box3().setFromObject(group).getCenter(new Vector3());
    expect(center.length()).toBeCloseTo(0, 10);
    expect(radius).toBeCloseTo(3, 10); // half the box diagonal: √(1² + 2² + 2²)
  });

  it('works when the model itself already has an offset', () => {
    const mesh = new Mesh(new BoxGeometry(1, 1, 1));
    mesh.position.set(-2, 2, 7);
    fitModel(mesh);
    expect(new Box3().setFromObject(mesh).getCenter(new Vector3()).length()).toBeCloseTo(0, 10);
  });
});
