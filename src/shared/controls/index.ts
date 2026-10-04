import { Vector3 } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createControlsUi } from './controls-ui';
import { keyAction, orbitStep, panStep, zoomStep, type KeyAction } from './keyboard';
import { Turntable } from './turntable';
import type { CameraControls, CameraControlsOptions } from './types';

export type { CameraControls, CameraControlsConfig, CameraControlsOptions } from './types';

const DAMPING = 0.08;
const CANVAS_ATTRIBUTES = ['tabindex', 'role', 'aria-label'] as const;

/**
 * Shared camera controls (spec 004): OrbitControls for mouse/touch, our own keyboard mapping,
 * pan/zoom/angle limits, an idle turntable, reset, and the discoverability UI. Spaces opt in with
 * a config; everything is removed on `dispose()` or when the Space's signal aborts.
 */
export function createCameraControls(options: CameraControlsOptions): CameraControls {
  const { camera, canvas, overlay, reducedMotion, coarsePointer, label, config } = options;

  // Own lifetime, also ended by the Space's signal.
  const lifetime = new AbortController();
  const { signal } = lifetime;
  options.signal.addEventListener('abort', () => lifetime.abort(), { once: true, signal });

  const focus = new Vector3(...config.focus);
  camera.position.set(...config.initialPosition);
  camera.lookAt(focus);

  const orbit = new OrbitControls(camera, canvas);
  orbit.target.copy(focus);
  orbit.cursor.copy(focus); // centre of the pan limit
  orbit.maxTargetRadius = config.panLimit;
  orbit.minDistance = config.distance.min;
  orbit.maxDistance = config.distance.max;
  orbit.minPolarAngle = config.polar.min;
  orbit.maxPolarAngle = config.polar.max;
  orbit.enableDamping = !reducedMotion;
  orbit.dampingFactor = DAMPING;
  orbit.autoRotateSpeed = config.turntable.speed;
  orbit.update();
  orbit.saveState();

  const turntable = new Turntable(config.turntable.idleDelay, !reducedMotion);
  const ui = createControlsUi({ overlay, signal, coarsePointer, onReset: () => reset() });

  const interact = () => {
    turntable.interact();
    orbit.autoRotate = false;
    ui.dismissHint();
  };
  // `start` begins an interaction; `end` restarts the idle delay from release, not from press.
  orbit.addEventListener('start', interact);
  orbit.addEventListener('end', interact);

  function reset() {
    interact();
    // Flush in-flight damping first: OrbitControls.reset() calls update(), which would otherwise
    // apply leftover velocity and drift away from the saved view.
    const damping = orbit.enableDamping;
    orbit.enableDamping = false;
    orbit.update();
    orbit.reset();
    orbit.enableDamping = damping;
  }

  const apply = (action: KeyAction) => {
    switch (action.type) {
      case 'orbit':
        orbitStep(camera, orbit.target, action.dTheta, action.dPhi);
        break;
      case 'zoom':
        zoomStep(camera, orbit.target, action.factor);
        break;
      case 'pan':
        panStep(camera, orbit.target, action.dx, action.dy);
        break;
      case 'reset':
        reset();
        return;
    }
    orbit.update(); // re-applies distance, angle and pan limits (AC-4)
  };

  // Keys only while the 3D view itself has focus (spec 004, Q3).
  canvas.setAttribute('tabindex', '0');
  canvas.setAttribute('role', 'application');
  canvas.setAttribute(
    'aria-label',
    `3D view: ${label}. Arrow keys rotate, Shift and arrow keys pan, plus and minus zoom, R resets the view.`,
  );
  canvas.addEventListener(
    'keydown',
    (event) => {
      const action = keyAction(event, config.keyboard);
      if (!action) return;
      event.preventDefault();
      interact();
      apply(action);
    },
    { signal },
  );

  let disposed = false;
  return {
    update(delta) {
      if (disposed) return;
      turntable.tick(delta);
      orbit.autoRotate = turntable.active;
      orbit.update(delta);
      ui.tick(delta);
    },
    reset,
    get turntableActive() {
      return turntable.active;
    },
    target: orbit.target,
    dispose() {
      if (disposed) return;
      disposed = true;
      lifetime.abort();
      orbit.removeEventListener('start', interact);
      orbit.removeEventListener('end', interact);
      orbit.dispose(); // pointer/wheel listeners; restores touch-action
      ui.dispose();
      if (document.activeElement === canvas) canvas.blur();
      for (const name of CANVAS_ATTRIBUTES) canvas.removeAttribute(name);
    },
  };
}
