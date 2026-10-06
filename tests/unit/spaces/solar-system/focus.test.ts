import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';
import {
  clearArea,
  framingDistance,
  viewDirection,
  viewOffset,
  FRAME_FRACTION,
} from '../../../../src/spaces/solar-system/focus';

// Spec 023, AC-4 and AC-11, plan §3–§4: where the camera ends up after selecting a body.

const FOV = 40;
const fovY = (FOV * Math.PI) / 180;

/** The disc's diameter on screen (px) for a sphere of radius r seen from distance d, through a real camera. */
function discDiameterPx(r: number, d: number, height: number, aspect: number): number {
  const camera = new PerspectiveCamera(FOV, aspect, d / 100, d * 10);
  camera.position.set(0, 0, d);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  // The silhouette: the tangent ray makes asin(r/d) with the line of sight.
  const alpha = Math.asin(r / d);
  const edge = new Vector3(Math.sin(alpha), 0, -Math.cos(alpha))
    .multiplyScalar(Math.sqrt(d * d - r * r))
    .add(camera.position);
  const ndc = edge.project(camera);
  return Math.abs(ndc.x) * height * aspect; // edge at |ndc.x| of the half-width: diameter = |ndc.x| × width
}

describe('framingDistance', () => {
  it.each([
    ['1280 × 720 beside the side panel', 1280, 720, 720],
    ['320 × 640 above the bottom sheet', 320, 640, 287],
    ['a tiny real-scale Moon', 1280, 720, 720],
  ])('%s: the disc spans a third of the clear area’s shorter side', (_name, width, height, short) => {
    const r = _name.includes('Moon') ? 0.0017374 : 1.7;
    const d = framingDistance(r, fovY, height, short);
    const diameter = discDiameterPx(r, d, height, width / height);
    expect(diameter / short).toBeCloseTo(FRAME_FRACTION, 2);
    expect(FRAME_FRACTION).toBeCloseTo(1 / 3, 9);
  });
});

describe('viewDirection', () => {
  const sun = new Vector3(0, 0, 0);

  it('looks from the sunward side, turned 40° round and raised 20°', () => {
    const body = new Vector3(10, 0, 0); // the Sun is along −x
    const dir = viewDirection(body, sun, new Vector3(0, 0, 1));
    expect(dir.length()).toBeCloseTo(1, 12);
    const toSun = new Vector3(-1, 0, 0);
    expect((dir.angleTo(toSun) * 180) / Math.PI).toBeLessThan(60); // a mostly lit, three-quarter disc
    expect((Math.asin(dir.y) * 180) / Math.PI).toBeCloseTo(20, 6);
    const flat = new Vector3(dir.x, 0, dir.z).normalize();
    expect((flat.angleTo(toSun) * 180) / Math.PI).toBeCloseTo(40, 6);
  });

  it('works wherever the body is round the Sun', () => {
    for (const angle of [0.3, 1.9, 3.5, 5.2]) {
      const body = new Vector3(Math.cos(angle) * 50, 0.2, Math.sin(angle) * 50);
      const dir = viewDirection(body, sun, new Vector3(0, 0, 1));
      const toSun = sun.clone().sub(body).normalize();
      expect((dir.angleTo(toSun) * 180) / Math.PI).toBeLessThan(60);
    }
  });

  it('the Sun itself keeps the given direction', () => {
    const current = new Vector3(0.3, 0.4, 0.5);
    const dir = viewDirection(sun, sun, current);
    expect(dir.toArray().map((v) => +v.toFixed(12))).toEqual(
      current
        .clone()
        .normalize()
        .toArray()
        .map((v) => +v.toFixed(12)),
    );
  });

  it('writes into `out` and never modifies its inputs', () => {
    const body = new Vector3(10, 0, 0);
    const current = new Vector3(0, 0, 1);
    const out = new Vector3();
    expect(viewDirection(body, sun, current, out)).toBe(out);
    expect(body.toArray()).toEqual([10, 0, 0]);
    expect(current.toArray()).toEqual([0, 0, 1]);
  });
});

describe('clearArea', () => {
  const rect = (left: number, top: number, width: number, height: number) => ({
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
  });

  it('no panel (or a hidden one): the whole view', () => {
    expect(clearArea({ width: 1280, height: 720 }, null)).toEqual({ x: 0, y: 0, width: 1280, height: 720 });
    expect(clearArea({ width: 1280, height: 720 }, rect(0, 0, 0, 0))).toEqual({
      x: 0,
      y: 0,
      width: 1280,
      height: 720,
    });
  });

  it('a side panel on the right: the area left of it', () => {
    expect(clearArea({ width: 1280, height: 720 }, rect(944, 16, 320, 200))).toEqual({
      x: 0,
      y: 0,
      width: 944,
      height: 720,
    });
  });

  it('a bottom sheet across the width: the area above it', () => {
    expect(clearArea({ width: 320, height: 640 }, rect(16, 287, 288, 225))).toEqual({
      x: 0,
      y: 0,
      width: 320,
      height: 287,
    });
  });

  it('a panel that would leave too little room is ignored', () => {
    expect(clearArea({ width: 320, height: 640 }, rect(16, 100, 288, 500))).toEqual({
      x: 0,
      y: 0,
      width: 320,
      height: 640,
    });
  });
});

describe('viewOffset', () => {
  it('shifts the projection so the screen centre lands on the clear area’s centre', () => {
    expect(viewOffset({ width: 320, height: 640 }, { x: 0, y: 0, width: 320, height: 287 })).toEqual({
      x: 0,
      y: 320 - 143.5,
    });
    expect(viewOffset({ width: 1280, height: 720 }, { x: 0, y: 0, width: 944, height: 720 })).toEqual({
      x: 640 - 472,
      y: 0,
    });
  });

  it('puts the camera’s target at the clear centre through a real camera', () => {
    const camera = new PerspectiveCamera(FOV, 320 / 640, 0.1, 100);
    const offset = viewOffset({ width: 320, height: 640 }, { x: 0, y: 0, width: 320, height: 287 });
    camera.setViewOffset(320, 640, offset.x, offset.y, 320, 640);
    camera.position.set(0, 0, 5);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    const ndc = new Vector3(0, 0, 0).project(camera);
    expect(((ndc.x + 1) / 2) * 320).toBeCloseTo(160, 6);
    expect(((1 - ndc.y) / 2) * 640).toBeCloseTo(143.5, 6);
  });
});
