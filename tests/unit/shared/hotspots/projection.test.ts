import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';
import { toScreen } from '../../../../src/shared/hotspots/projection';

// Spec 012, AC-6: markers sit where their point is drawn. Projection to CSS px of the canvas.

/** A camera at (0, 0, 5) looking at the origin. With fov 90° the half-height at distance 5 is 5 units. */
function camera(aspect: number) {
  const cam = new PerspectiveCamera(90, aspect, 0.1, 100);
  cam.position.set(0, 0, 5);
  cam.lookAt(0, 0, 0);
  cam.updateMatrixWorld();
  cam.updateProjectionMatrix();
  return cam;
}

describe('toScreen', () => {
  it('puts the point at the centre of view in the middle of the canvas', () => {
    expect(toScreen(new Vector3(0, 0, 0), camera(2), 800, 400)).toEqual({ x: 400, y: 200, visible: true });
  });

  it('maps off-axis points to CSS px, y growing downwards (landscape)', () => {
    const cam = camera(2); // 800 × 400: half-width 10 units, half-height 5 units at the origin
    const right = toScreen(new Vector3(2.5, 0, 0), cam, 800, 400);
    expect(right.x).toBeCloseTo(500, 6); // a quarter of the half-width right of centre
    expect(right.y).toBeCloseTo(200, 6);
    const up = toScreen(new Vector3(0, 2.5, 0), cam, 800, 400);
    expect(up.x).toBeCloseTo(400, 6);
    expect(up.y).toBeCloseTo(100, 6); // half of the half-height above centre
  });

  it('works the same in portrait', () => {
    const cam = camera(0.5); // 300 × 600: half-width 2.5 units, half-height 5 units
    const p = toScreen(new Vector3(1.25, -2.5, 0), cam, 300, 600);
    expect(p.x).toBeCloseTo(225, 6);
    expect(p.y).toBeCloseTo(450, 6);
    expect(p.visible).toBe(true);
  });

  it('reports points behind the camera as not visible', () => {
    expect(toScreen(new Vector3(0, 0, 10), camera(1), 400, 400).visible).toBe(false);
  });

  it('reports points beside the view as visible (off-canvas), so only depth decides', () => {
    const p = toScreen(new Vector3(20, 0, 0), camera(1), 400, 400);
    expect(p.visible).toBe(true);
    expect(p.x).toBeGreaterThan(400);
  });

  it('does not modify the point it projects', () => {
    const point = new Vector3(1, 2, 3);
    toScreen(point, camera(1), 400, 400);
    expect(point.toArray()).toEqual([1, 2, 3]);
  });
});
