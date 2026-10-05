import { Spherical, Vector3 } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createControlsUi } from './controls-ui';
import { keyAction, orbitStep, panStep, zoomStep, type KeyAction } from './keyboard';
import { easeTurn, turnStep } from './turn';
import { Turntable } from './turntable';
import type { CameraControls, CameraControlsOptions, ControlsHome } from './types';

export type { CameraControls, CameraControlsConfig, CameraControlsOptions, ControlsHome } from './types';

const DAMPING = 0.08;
/** Default length of a `turnTo()` (spec 012, AC-9), in seconds of Space time. */
const TURN_SECONDS = 0.6;
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

  /** A `turnTo()` in progress: directions and targets to ease between, at a fixed distance. */
  let turn: {
    from: Vector3;
    to: Vector3;
    fromTarget: Vector3;
    distance: number;
    elapsed: number;
    duration: number;
  } | null = null;

  let userMoved = false;
  const interact = () => {
    userMoved = true;
    turn = null; // the visitor takes over
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
    userMoved = false;
  }

  function setHome(home: ControlsHome) {
    orbit.minDistance = home.distance.min;
    orbit.maxDistance = home.distance.max;
    orbit.maxTargetRadius = home.panLimit;
    // The state reset() returns to (what saveState() would store, without moving the camera).
    orbit.target0.copy(focus);
    orbit.position0.set(...home.position);
    orbit.zoom0 = camera.zoom;
    if (!userMoved) {
      orbit.target.copy(focus);
      camera.position.set(...home.position);
    }
    // Clamp a moved camera into the new limits. Without a delta, update() would also add a 60 fps
    // turntable step, so switch auto-rotation off for this call; the next frame restores it.
    const autoRotate = orbit.autoRotate;
    orbit.autoRotate = false;
    orbit.update();
    orbit.autoRotate = autoRotate;
  }

  /** Flushes leftover damping so a programmatic move doesn't pick up stale drag velocity. */
  function settle() {
    const damping = orbit.enableDamping;
    const autoRotate = orbit.autoRotate;
    orbit.enableDamping = false;
    orbit.autoRotate = false; // without a delta, update() would add a 60 fps turntable step
    orbit.update();
    orbit.enableDamping = damping;
    orbit.autoRotate = autoRotate;
  }

  /** Places the camera `distance` from `target` along `direction`, then lets OrbitControls apply its limits. */
  function place(direction: Vector3, target: Vector3, distance: number) {
    orbit.target.copy(target);
    camera.position.copy(target).addScaledVector(direction, distance);
    settle();
  }

  function turnTo(direction: readonly [number, number, number], { duration = TURN_SECONDS } = {}) {
    settle();
    const spherical = new Spherical().setFromVector3(new Vector3(...direction));
    spherical.radius = 1;
    spherical.phi = Math.min(orbit.maxPolarAngle, Math.max(orbit.minPolarAngle, spherical.phi));
    const to = new Vector3().setFromSpherical(spherical);
    const distance = Math.min(
      orbit.maxDistance,
      Math.max(orbit.minDistance, camera.position.distanceTo(orbit.target)),
    );

    userMoved = true;
    turntable.interact();
    orbit.autoRotate = false;
    turn = null;
    if (reducedMotion || duration <= 0) {
      place(to, focus, distance);
      return;
    }
    const from = camera.position.clone().sub(orbit.target).normalize();
    turn = { from, to, fromTarget: orbit.target.clone(), distance, elapsed: 0, duration };
  }

  /** Advances a turn in progress by `delta` seconds; clears it at the end. */
  function advanceTurn(delta: number) {
    if (!turn) return;
    turn.elapsed += delta;
    const t = Math.min(1, turn.elapsed / turn.duration);
    const target = new Vector3().lerpVectors(turn.fromTarget, focus, easeTurn(t));
    place(turnStep(turn.from, turn.to, t), target, turn.distance);
    if (t >= 1) turn = null;
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
      advanceTurn(delta);
      orbit.autoRotate = turntable.active && !turn;
      orbit.update(delta);
      ui.tick(delta);
    },
    reset,
    get turntableActive() {
      return turntable.active;
    },
    target: orbit.target,
    get userMoved() {
      return userMoved;
    },
    setHome,
    turnTo,
    holdTurntable(hold) {
      turntable.hold(hold);
      if (hold) orbit.autoRotate = false;
    },
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
