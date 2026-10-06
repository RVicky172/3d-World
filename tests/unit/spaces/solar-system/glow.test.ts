import {
  AdditiveBlending,
  Group,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Raycaster,
  SphereGeometry,
  Sprite,
  Vector3,
  type DataTexture,
} from 'three';
import { describe, expect, it, vi } from 'vitest';
import { createGlow, GLOW, glowSize } from '../../../../src/spaces/solar-system/glow';

// Spec 022, AC-10: the Sun's halo is a few Sun radii across, and never smaller than a fixed size on screen, so it
// shows at real scale's home view, where the Sun itself is under a pixel.

const FOV = (40 * Math.PI) / 180;
const HEIGHT = 720;
const worldPerPx = (distance: number) => (2 * distance * Math.tan(FOV / 2)) / HEIGHT;

describe('glowSize (world units across the sprite)', () => {
  it('is 4 Sun radii across when that is large enough on screen (stylised scale, close)', () => {
    expect(glowSize(3, 60, FOV, HEIGHT)).toBeCloseTo(GLOW.radii * 3, 9);
  });

  it('never drops below the minimum on-screen size (real scale, far)', () => {
    const size = glowSize(0.6957, 9000, FOV, HEIGHT);
    expect(size / worldPerPx(9000)).toBeCloseTo(GLOW.minPx, 6);
    expect(size).toBeGreaterThan(GLOW.radii * 0.6957);
  });

  it('switches at the distance where both rules agree, and grows with distance beyond it', () => {
    const r = 1;
    const sizes = [10, 100, 1000, 10000].map((d) => glowSize(r, d, FOV, HEIGHT));
    for (let i = 1; i < sizes.length; i++) expect(sizes[i]).toBeGreaterThanOrEqual(sizes[i - 1]!);
    expect(GLOW.minPx).toBeGreaterThanOrEqual(24);
  });
});

// T042 (AC-10): the halo is an additive sprite at the Sun. Depth-tested, so the Sun's own disc and any body in
// front hide it; it writes no depth, so it hides nothing. Its size follows `glowSize` each frame.
describe('createGlow', () => {
  const setup = () => {
    const sun = new Mesh(new SphereGeometry(1, 8, 4), new MeshBasicMaterial());
    sun.scale.setScalar(3);
    const root = new Group().add(sun);
    const glow = createGlow(sun);
    root.updateMatrixWorld(true);
    return { sun, root, glow };
  };

  it('is an additive, depth-tested sprite at the Sun that writes no depth, under the Sun’s parent', () => {
    const { sun, glow } = setup();
    expect(glow.sprite).toBeInstanceOf(Sprite);
    expect(glow.sprite.parent).toBe(sun.parent); // not the Sun's child: its scale and spin don't apply
    expect(glow.sprite.position.equals(sun.position)).toBe(true);
    const material = glow.sprite.material;
    expect(material.blending).toBe(AdditiveBlending);
    expect(material.depthTest).toBe(true);
    expect(material.depthWrite).toBe(false);
  });

  it('fades radially: opaque at the centre, clear at the edge', () => {
    const { glow } = setup();
    const { image } = glow.sprite.material.map as DataTexture;
    const alpha = (x: number, y: number) => image.data![4 * (y * image.width + x) + 3]!;
    const mid = image.width / 2;
    expect(alpha(mid, mid)).toBeGreaterThan(200);
    expect(alpha(mid + mid / 2, mid)).toBeLessThan(alpha(mid, mid));
    expect(alpha(0, mid)).toBe(0);
    expect(alpha(0, 0)).toBe(0);
  });

  it('update() sizes it by glowSize from the camera’s distance each frame', () => {
    const { sun, glow } = setup();
    const camera = new PerspectiveCamera(40, 16 / 9, 0.1, 1e6);
    camera.position.set(0, 0, 60);
    glow.update(camera, HEIGHT);
    expect(glow.sprite.scale.x).toBeCloseTo(glowSize(3, 60, FOV, HEIGHT), 9);
    camera.position.set(0, 0, 9000);
    glow.update(camera, HEIGHT);
    expect(glow.sprite.scale.x).toBeCloseTo(glowSize(3, 9000, FOV, HEIGHT), 6);
    expect(glow.sprite.scale.y).toBe(glow.sprite.scale.x);
    expect(sun.scale.x).toBe(3);
  });

  it('never catches the pointer, and dispose() frees its material and texture and leaves the scene', () => {
    const { root, glow } = setup();
    const hits: unknown[] = [];
    const camera = new PerspectiveCamera();
    camera.position.set(0, 0, 10);
    camera.updateMatrixWorld();
    const raycaster = new Raycaster(new Vector3(0, 0, 10), new Vector3(0, 0, -1));
    raycaster.camera = camera;
    glow.sprite.scale.setScalar(12);
    glow.sprite.updateMatrixWorld();
    glow.sprite.raycast(raycaster, hits as never);
    expect(hits).toHaveLength(0);
    const spies = [vi.spyOn(glow.sprite.material, 'dispose'), vi.spyOn(glow.sprite.material.map!, 'dispose')];
    glow.dispose();
    for (const spy of spies) expect(spy).toHaveBeenCalledOnce();
    expect(root.children).not.toContain(glow.sprite);
  });
});
