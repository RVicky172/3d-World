import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Spherical, Vector3 } from 'three';
import {
  DEFAULT_KEY_STEPS,
  keyAction,
  orbitStep,
  panStep,
  zoomStep,
  type KeyAction,
} from '../../../../src/shared/controls/keyboard';

const key = (
  key: string,
  mods: Partial<Record<'shiftKey' | 'ctrlKey' | 'metaKey' | 'altKey', boolean>> = {},
) => ({
  key,
  shiftKey: false,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  ...mods,
});

const { orbitStep: o, panStep: p, zoomFactor: z } = DEFAULT_KEY_STEPS;

describe('keyAction (AC-3)', () => {
  it.each<[string, ReturnType<typeof key>, KeyAction]>([
    ['← orbits left', key('ArrowLeft'), { type: 'orbit', dTheta: -o, dPhi: 0 }],
    ['→ orbits right', key('ArrowRight'), { type: 'orbit', dTheta: o, dPhi: 0 }],
    ['↑ orbits up', key('ArrowUp'), { type: 'orbit', dTheta: 0, dPhi: -o }],
    ['↓ orbits down', key('ArrowDown'), { type: 'orbit', dTheta: 0, dPhi: o }],
    ['Shift+← pans left', key('ArrowLeft', { shiftKey: true }), { type: 'pan', dx: -p, dy: 0 }],
    ['Shift+→ pans right', key('ArrowRight', { shiftKey: true }), { type: 'pan', dx: p, dy: 0 }],
    ['Shift+↑ pans up', key('ArrowUp', { shiftKey: true }), { type: 'pan', dx: 0, dy: p }],
    ['Shift+↓ pans down', key('ArrowDown', { shiftKey: true }), { type: 'pan', dx: 0, dy: -p }],
    ['+ zooms in', key('+', { shiftKey: true }), { type: 'zoom', factor: z }],
    ['= zooms in', key('='), { type: 'zoom', factor: z }],
    ['- zooms out', key('-'), { type: 'zoom', factor: 1 / z }],
    ['r resets', key('r'), { type: 'reset' }],
    ['R resets', key('R', { shiftKey: true }), { type: 'reset' }],
  ])('%s', (_name, event, action) => {
    expect(keyAction(event)).toEqual(action);
  });

  it.each([
    ['Ctrl+→ (browser shortcut)', key('ArrowRight', { ctrlKey: true })],
    ['Meta+R (reload)', key('r', { metaKey: true })],
    ['Alt+← (history back)', key('ArrowLeft', { altKey: true })],
    ['Ctrl+- (browser zoom)', key('-', { ctrlKey: true })],
    ['Tab (focus navigation)', key('Tab')],
    ['Space', key(' ')],
    ['Escape', key('Escape')],
    ['a letter', key('x')],
  ])('ignores %s', (_name, event) => {
    expect(keyAction(event)).toBeNull();
  });

  it('honours custom steps', () => {
    expect(keyAction(key('ArrowRight'), { orbitStep: 1, panStep: 2, zoomFactor: 0.5 })).toEqual({
      type: 'orbit',
      dTheta: 1,
      dPhi: 0,
    });
  });
});

describe('camera steps', () => {
  const setup = () => {
    const camera = new PerspectiveCamera();
    const target = new Vector3(1, 0, 0);
    camera.position.set(1, 2, 5);
    camera.lookAt(target);
    return { camera, target };
  };
  const sphericalOf = (camera: PerspectiveCamera, target: Vector3) =>
    new Spherical().setFromVector3(camera.position.clone().sub(target));

  it('orbitStep turns around the target, keeping the distance and looking at it', () => {
    const { camera, target } = setup();
    const before = sphericalOf(camera, target);

    orbitStep(camera, target, 0.3, -0.1);

    const after = sphericalOf(camera, target);
    expect(after.radius).toBeCloseTo(before.radius);
    expect(after.theta).toBeCloseTo(before.theta + 0.3);
    expect(after.phi).toBeCloseTo(before.phi - 0.1);
    const forward = new Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    expect(forward.dot(target.clone().sub(camera.position).normalize())).toBeCloseTo(1);
  });

  it('zoomStep scales the distance and keeps the direction', () => {
    const { camera, target } = setup();
    const before = sphericalOf(camera, target);

    zoomStep(camera, target, 0.5);

    const after = sphericalOf(camera, target);
    expect(after.radius).toBeCloseTo(before.radius * 0.5);
    expect(after.theta).toBeCloseTo(before.theta);
    expect(after.phi).toBeCloseTo(before.phi);
  });

  it('panStep moves camera and target by the same offset, keeping orientation', () => {
    const { camera, target } = setup();
    const quaternion = camera.quaternion.clone();
    const offsetBefore = camera.position.clone().sub(target);
    const targetBefore = target.clone();

    panStep(camera, target, 0.5, 0.25);

    expect(camera.quaternion.equals(quaternion)).toBe(true);
    expect(camera.position.clone().sub(target).distanceTo(offsetBefore)).toBeCloseTo(0);
    const moved = target.clone().sub(targetBefore);
    const right = new Vector3(1, 0, 0).applyQuaternion(quaternion);
    const up = new Vector3(0, 1, 0).applyQuaternion(quaternion);
    expect(moved.dot(right)).toBeCloseTo(0.5);
    expect(moved.dot(up)).toBeCloseTo(0.25);
  });
});
