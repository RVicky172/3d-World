# 004 — Shared Camera Controls · Implementation Plan

**Spec:** `./spec.md` · **Status:** Approved <!-- Draft | Approved -->

## Approach

A small shared module, `src/shared/controls/`, wraps three's **`OrbitControls`**, which `tech-stack.md` already
approves. Spaces call one function, `createCameraControls(…)`, with a declarative config, and get mouse, touch,
keyboard, limits, turntable, reset and the on-screen UI. Everything is torn down in `dispose()`.

Only Spaces import this module, so it ships in their lazy chunks and never in the entry bundle (NFR ≤ 0.5 KB).

### What OrbitControls gives us (checked against the installed r186)

- Mouse:
  - left-drag orbits;
  - the wheel dollies;
  - right-drag, or Shift + left-drag, pans.
- Touch:
  - one finger orbits;
  - two fingers dolly and pan;
  - it sets `touch-action: none` on the canvas, so the page doesn't scroll (AC-1, AC-2).
- Limits:
  - `minDistance` / `maxDistance`;
  - `minPolarAngle` / `maxPolarAngle`;
  - **`cursor` + `maxTargetRadius`**, which clamps panning around a home point and is exactly our pan limit (AC-4).
- Motion:
  - `enableDamping` provides the easing (AC-7);
  - **`autoRotate` with `update(deltaTime)`** turns by elapsed time, so the turntable is deterministic in tests (AC-11).
- Interaction events: `start` and `end`, which we use to stop the turntable.
- State: `saveState()` / `reset()`, used for reset (AC-5).

### What we add

1. **Keyboard (our own handler).** OrbitControls' built-in keys do the opposite of the spec: plain arrows pan and
   Shift + arrows rotate, and there are no zoom or reset keys. So we never call `listenToKeyEvents`.
   - Pure functions in `keyboard.ts` map a key event to an action, then apply that action to the camera and target
     with `Spherical` maths (orbit step, zoom step, pan step) and call `controls.update()`, which re-applies every
     clamp.
   - The handler is attached to the **canvas**, so keys only work while it has focus (AC-3, Q3).
   - Keys are ignored when modifiers other than Shift are held, so browser shortcuts keep working.
2. **Focusable 3D view.** While a Space with controls is mounted, the canvas gets:
   - `tabindex="0"`;
   - `role="application"`;
   - an `aria-label` describing the Space and its keys;
   - a CSS `:focus-visible` ring.

   All of these are removed on `dispose()`, so the canvas is not focusable on the gallery (AC-6).

3. **Turntable state (`turntable.ts`, pure).** Its idle timer is advanced by `delta` in `update()`, never by wall
   clock time (Constitution VI).
   - Any interaction stops it: the controls' `start` event, a handled key, or a reset.
   - It resumes after `idleDelay` seconds of no interaction.
   - It is permanently off under reduced motion, where damping is also off (AC-7, AC-11).
4. **On-screen UI (`controls-ui.ts`)**, placed in `ctx.overlay` (AC-10):
   - **Hint pill** (bottom centre): `aria-live="polite"`, with wording for the input type (coarse vs fine pointer).
     Its lifetime is counted in `update(delta)`; it is dismissed after about 4 s or on the first interaction.
   - **"?" button + panel** (bottom right): `aria-expanded` and `aria-controls`. It lists the mouse, touch and
     keyboard controls, and `Esc` closes it.
   - **"Reset view" button** (bottom right).

   The overlay already sits above the canvas, and only its children receive pointer events. So clicks, drags and
   wheels on these controls never reach the canvas or move the camera (AC-9).

5. **Reset that really resets (AC-5).** `OrbitControls.reset()` calls `update()`, which would apply leftover
   damping velocity and drift away from the saved pose. So `reset()` first flushes pending deltas (one `update()`
   with damping temporarily off), then calls `controls.reset()`. A unit test asserts the pose after drag → reset
   is exactly the initial pose.
6. **Tab order (AC-9).** `createBackLink` changes from `append` to **`prepend`**, so the DOM order is back link →
   canvas → overlay controls. That matches the visual layout. The z-index keeps the link on top, and 003's
   "first Tab = back link" test keeps passing.
7. **demo-cube adopts the controls.** Its self-rotation is removed (D-009), a `controls` block is added to
   `DEMO_CUBE`, and `update(delta)` drives `controls.update(delta)`. Determinism (001 AC-7) now applies to the
   camera.
8. **Debug hook:** `__WORLD__.cameraPose()` returns `{ position, quaternion }` so E2E can see orbit, zoom and pan
   effects.

## Files

| File                                   | Change | Purpose                                                                                               |
| -------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------- |
| `src/shared/controls/types.ts`         | new    | `CameraControlsConfig`, `CameraControls` interface                                                    |
| `src/shared/controls/keyboard.ts`      | new    | `keyAction(event)` → action or null; `orbitStep`, `zoomStep`, `panStep` (pure, Spherical maths)       |
| `src/shared/controls/turntable.ts`     | new    | `Turntable`: `tick(delta)`, `interact()`, `active` (pure)                                             |
| `src/shared/controls/controls-ui.ts`   | new    | Hint, help button + panel, reset button; `tick(delta)`, `dismissHint()`, `dispose()`                  |
| `src/shared/controls/index.ts`         | new    | `createCameraControls(options)`: wires OrbitControls + keyboard + turntable + UI + canvas a11y        |
| `src/spaces/demo-cube/index.ts`        | modify | Remove self-rotation; add `DEMO_CUBE.controls`; use `createCameraControls`                            |
| `src/core/debug.ts`                    | modify | `cameraPose()`                                                                                        |
| `src/ui/back-link.ts`                  | modify | `prepend` instead of `append` (tab order)                                                             |
| `src/styles/main.css`                  | modify | Canvas `:focus-visible` ring; hint pill, control buttons, help panel; reduced-motion: no hint fade    |
| `tests/unit/shared/controls/*.test.ts` | new    | keyboard, turntable, controls-ui, camera-controls (real OrbitControls on a jsdom canvas)              |
| `tests/unit/spaces/demo-cube.test.ts`  | modify | Cube no longer rotates; camera determinism; turntable off with reduced motion; dispose frees controls |
| `tests/unit/core/debug.test.ts`        | modify | `cameraPose()`                                                                                        |
| `tests/unit/ui/back-link.test.ts`      | modify | Link is the container's first child                                                                   |
| `tests/e2e/controls.spec.ts`           | new    | AC-1–AC-12 in the browser (mouse, CDP multi-touch, keyboard, limits, turntable, UI, a11y)             |
| `specs/architecture.md`                | modify | Camera controls section; tab order; turntable time model                                              |

## Data Structures & Interfaces

```ts
// src/shared/controls/types.ts
export interface CameraControlsConfig {
  focus: readonly [number, number, number]; // home focus point (also the pan-limit centre)
  initialPosition: readonly [number, number, number];
  distance: { min: number; max: number };
  polar: { min: number; max: number }; // radians from +Y; keep inside (0, π) to avoid flipping
  panLimit: number; // max distance of the focus from its home
  turntable: { speed: number; idleDelay: number }; // speed in OrbitControls units; delay in seconds
  keyboard?: { orbitStep: number; zoomFactor: number; panStep: number }; // sensible defaults
}

export interface CameraControlsOptions {
  camera: PerspectiveCamera;
  canvas: HTMLCanvasElement;
  overlay: HTMLElement;
  signal: AbortSignal;
  reducedMotion: boolean;
  coarsePointer: boolean; // hint wording; from matchMedia('(pointer: coarse)')
  label: string; // e.g. "Demo Cube", for the canvas aria-label
  config: CameraControlsConfig;
}

export interface CameraControls {
  update(deltaSeconds: number): void; // call from SpaceInstance.update
  reset(): void;
  readonly turntableActive: boolean;
  dispose(): void;
}

// src/shared/controls/keyboard.ts
export type KeyAction =
  | { type: 'orbit'; dTheta: number; dPhi: number }
  | { type: 'pan'; dx: number; dy: number }
  | { type: 'zoom'; factor: number }
  | { type: 'reset' };
export function keyAction(event: Pick<KeyboardEvent, 'key' | 'shiftKey' | 'ctrlKey' | 'metaKey' | 'altKey'>, steps): KeyAction | null;
export function orbitStep(camera: Object3D, target: Vector3, dTheta: number, dPhi: number): void;
export function zoomStep(camera: Object3D, target: Vector3, factor: number): void;
export function panStep(camera: Object3D, target: Vector3, dx: number, dy: number): void;

// src/shared/controls/turntable.ts
export class Turntable {
  constructor(idleDelay: number, enabled: boolean);
  get active(): boolean;
  tick(delta: number): void;
  interact(): void;
}

// src/core/debug.ts (addition)
cameraPose(): { position: number[]; quaternion: number[] } | null;
```

demo-cube's controls config:

- focus: the origin;
- initial position: `(0, 0, 4)`;
- distance: 2.2 to 9;
- polar angle: 0.15 to π − 0.15;
- pan limit: 1.5;
- turntable: speed 1.2 (about 50 s per revolution), resuming after 4 s idle.

## Three.js Techniques

- **OrbitControls on the shared canvas.**
  - It is created per Space and disposed with the Space, which removes its pointer, wheel and context-menu
    listeners and restores `touch-action`.
  - `enableDamping` is `!reducedMotion`, with `dampingFactor` 0.08.
  - `autoRotate` is driven by `Turntable.active` each frame, then `controls.update(delta)`.
- **Keyboard maths.**
  - Orbit and zoom use `Spherical` around `controls.target`; zoom scales the radius.
  - Pan moves both the camera and the target along the camera's right and up vectors.
  - Every step is followed by `controls.update()`, so the polar, distance and target-radius clamps apply uniformly
    (AC-4).
- **Resize.** The Space's `resize()` only changes `camera.aspect`. The controls' target and the camera's position
  are untouched, so the view is kept (AC-12).
- **Cost.** OrbitControls adds about 5 KB gzipped to the demo-cube chunk. No per-frame allocations: scratch vectors
  are reused.

## Test Approach

| AC    | Test file                                                         | Type       | How                                                                                                                                                                                                                                                                                                                  |
| ----- | ----------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC-1  | `controls.spec.ts`                                                | e2e        | `page.mouse` drag → the quaternion changes; wheel → the distance changes; right-drag and Shift+drag → position moves while the quaternion is unchanged (pan)                                                                                                                                                         |
| AC-2  | `controls.spec.ts`                                                | e2e        | Touch context (`hasTouch`, `isMobile`) using CDP `Input.dispatchTouchEvent`: one-finger drag rotates; a two-finger spread changes the distance; a two-finger parallel drag pans; `scrollY` and `visualViewport.scale` unchanged                                                                                      |
| AC-3  | `keyboard.test.ts`, `camera-controls.test.ts`, `controls.spec.ts` | unit + e2e | Key → action table (arrows, Shift+arrows, `+` `=` `-`, `r`/`R`; Ctrl/Meta/Alt → null). Keys on the focused canvas move the camera. The same keys with focus on the body, the back link or a button do nothing. Focus ring visible                                                                                    |
| AC-4  | `camera-controls.test.ts`, `controls.spec.ts`                     | unit + e2e | Unit: zoom past min and max, orbit past the poles, pan past the limit → clamped (distance, polar angle, target radius). E2E: 50 zoom-in and 50 zoom-out key presses → distance within limits; heavy panning → the cube is still on screen (`canvasCoverage > 0.02`)                                                  |
| AC-5  | `camera-controls.test.ts`, `controls.spec.ts`                     | unit + e2e | Drag, damping, then reset → position and target exactly the initial values. E2E: `R` and the button restore the initial pose (reduced motion, so it is immediate)                                                                                                                                                    |
| AC-6  | `camera-controls.test.ts`, `controls.spec.ts`                     | unit + e2e | Config is applied to the controls' limits. Canvas `tabindex`/`role`/`aria-label` are set while mounted and removed on dispose. E2E: on the gallery the canvas has no tabindex and the wheel scrolls the page, not a camera                                                                                           |
| AC-7  | `camera-controls.test.ts`, `controls.spec.ts`                     | unit + e2e | `enableDamping` and `autoRotate` follow reduced motion. E2E (reduced motion): the pose is identical 500 ms after a drag ends, and identical across 1 s idle                                                                                                                                                          |
| AC-8  | `camera-controls.test.ts`, `controls.spec.ts`                     | unit + e2e | Unit: after `dispose()`, pointer, wheel and key events on the canvas don't move the camera; the overlay UI is removed; the `touch-action` style is restored. E2E: 10 enter/leave cycles with no errors; on the gallery, wheel and keys leave `cameraPose` unchanged (the gallery camera)                             |
| AC-9  | `controls.spec.ts`                                                | e2e        | Click, drag and wheel on the "?", "Reset view" and back-link elements → pose unchanged. Tab order: back link → canvas → "?" → "Reset view"                                                                                                                                                                           |
| AC-10 | `controls-ui.test.ts`, `controls.spec.ts`                         | unit + e2e | Hint wording for fine vs coarse pointers; `aria-live`; dismissed after 4 s of ticks or on interaction. Help toggles `aria-expanded`; `Esc` closes it; the panel lists all three input types. Reset button present                                                                                                    |
| AC-11 | `turntable.test.ts`, `demo-cube.test.ts`, `controls.spec.ts`      | unit + e2e | Turntable: active when idle; `interact()` stops it; resumes after the idle delay of ticks; never active when disabled. demo-cube: the cube's rotation stays 0; identical delta sequences give identical camera positions. E2E: the pose changes while idle; it stops after a drag; it is static under reduced motion |
| AC-12 | `controls.spec.ts`                                                | e2e        | Orbit away, resize the viewport → the quaternion and distance are unchanged and the aspect matches the viewport                                                                                                                                                                                                      |

- **Coverage:** ≥ 80 % lines for `src/shared/controls/*`.
- **Size:** the bundle-check line must show the entry growing by ≤ 0.5 KB (baseline 132.8 KB). The demo-cube chunk
  growth is recorded.

## Risks & Mitigations

- **OrbitControls internals change between three versions.** We use only its public API (properties, `update`,
  `saveState`, `reset`, events) and **not** its underscore methods; the keyboard does its own maths. The version is
  pinned by the lockfile.
- **Reset drifts because of residual damping.** We flush pending deltas before `reset()` (see Approach 5), and a
  unit test pins it.
- **The turntable fights the user.** It stops on `start` (pointer, wheel, touch) and on our key handler, and it
  resumes only after the idle delay. A unit test plus an E2E "stops after drag" test cover it.
- **Multi-touch is hard to simulate.** Playwright's touchscreen API taps only, so we use a Chromium CDP session with
  `Input.dispatchTouchEvent` for pinch and two-finger pan. It is Chromium-only, which matches our single E2E browser.
- **The keyboard hijacks screen-reader keys.** Keys only act while the canvas has focus (Q3), the canvas is a
  labelled `role="application"`, and Tab leaves it normally (Tab is never handled).
- **The `aria-live` hint is noisy.** It is announced once per Space open, and it is not re-created on resize.
- **The canvas keeps its `tabindex` after leaving.** `dispose()` removes it, and an E2E check confirms the gallery
  canvas has no tabindex.
- **The tab-order change (prepend) could affect 003 tests.** The 003 AC-7 test expects the back link on the first
  Tab, which prepend keeps. The full E2E suite runs in the same task.

## Constitution Check

| Principle                 | Status | Notes                                                                                                                                                            |
| ------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I. Spec before code       | ✅     | 004 approved (D-009); every AC mapped; the 001 behaviour change is recorded in the spec                                                                          |
| II. Browser-only          | ✅     | Pure client-side input handling                                                                                                                                  |
| III. Self-contained Space | ✅     | Shared helper in `src/shared/`; Spaces opt in by config; everything is disposed with the Space via `signal`/`dispose`                                            |
| IV. Performance budgets   | ✅     | Lazy-chunk only (entry ≤ +0.5 KB); no per-frame allocations; one OrbitControls per mounted Space                                                                 |
| V. Accessible & resilient | ✅     | Mouse, touch and keyboard (the core of V); focus-scoped keys, labelled view, visible focus; reset button for touch; reduced motion = no inertia and no turntable |
| VI. Test-gated            | ✅     | Pure keyboard/turntable logic unit-tested first; turntable and hint driven by `delta` (no wall clock); E2E for real input                                        |
| VII. Data-driven          | ✅     | All limits and speeds in each Space's config (`DEMO_CUBE.controls`)                                                                                              |
| VIII. Small dependencies  | ✅     | **No new dependency.** OrbitControls is already approved in `tech-stack.md`, as is "keyboard added in our wrapper"                                               |
| IX. Licensed assets       | ✅     | No assets; icons are text or CSS                                                                                                                                 |
| X. Memory maintained      | ✅     | D-009 recorded; OrbitControls quirks (key mapping, reset drift) go to learnings when confirmed                                                                   |
