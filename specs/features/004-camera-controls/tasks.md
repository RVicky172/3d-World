# 004 — Shared Camera Controls · Tasks

**Plan:** `./plan.md` (Approved)
Legend: `[P]` = can run in parallel with the previous task. Each task lists files and the proving test.
Test-first: each "tests" task must fail before its paired implementation task makes it pass.
Every task leaves `npm run check` **and** `npm run test:e2e` green. demo-cube only switches to the controls in
T022, together with the updated demo-cube tests.
Baseline for the size NFR: entry 132.8 KB gzipped (from 003).

## Controls building blocks (`src/shared/controls/`, not used by any Space yet)

- [x] **T010** — Keyboard tests:
  - `keyAction` table:
    - arrows → orbit;
    - Shift + arrows → pan;
    - `+`, `=` → zoom in; `-` → zoom out;
    - `r`/`R` → reset;
    - Ctrl/Meta/Alt + any key → null;
    - other keys (Tab, Space, letters) → null.
  - `orbitStep` changes azimuth and polar angle around the target while keeping the distance.
  - `zoomStep` scales the distance while keeping the direction.
  - `panStep` moves the camera and target by the same offset while keeping the orientation.

  files: `tests/unit/shared/controls/keyboard.test.ts` · covers: AC-3

- [x] **T011** — Implement `keyAction`, `orbitStep`, `zoomStep`, `panStep` and the default steps.
      files: `src/shared/controls/keyboard.ts`, `src/shared/controls/types.ts` · test: T010
- [x] **T012** [P] — Turntable, test first:
  - active when idle;
  - `interact()` stops it;
  - it resumes only after `idleDelay` seconds of `tick(delta)`;
  - a further `interact()` restarts the delay;
  - it is never active when disabled (reduced motion).

  files: `src/shared/controls/turntable.ts`, `tests/unit/shared/controls/turntable.test.ts` · covers: AC-7, AC-11

- [x] **T013** [P] — Controls UI tests:
  - the hint wording differs for fine and coarse pointers;
  - the hint has `aria-live="polite"`;
  - it is removed after 4 s of `tick` or on `dismissHint()`;
  - the "?" button toggles `aria-expanded` and the panel's visibility;
  - the panel lists mouse, touch and keyboard controls;
  - `Esc` closes the panel and returns focus to "?";
  - the "Reset view" button calls `onReset`;
  - `dispose()` removes everything, and the signal removes the listeners.

  files: `tests/unit/shared/controls/controls-ui.test.ts` · covers: AC-5, AC-10

- [x] **T014** — Implement `createControlsUi` plus CSS: a hint pill at bottom centre, buttons and a panel at bottom right, focus-visible styles, and no hint fade under reduced motion.
      files: `src/shared/controls/controls-ui.ts`, `src/styles/main.css` · test: T013
- [x] **T015** — `createCameraControls` tests, using real OrbitControls on a jsdom canvas with a `PerspectiveCamera`:
  - the config is applied (distance, polar angle, `cursor`/`maxTargetRadius`);
  - damping and `autoRotate` follow `reducedMotion`;
  - while mounted the canvas has `tabindex`, `role` and `aria-label`, and keydown on it moves the camera;
  - keydown elsewhere does nothing;
  - zooming, orbiting and panning past the limits are clamped;
  - drag/damping → `reset()` restores the exact initial pose (no drift);
  - the turntable stops on the controls' `start` event and on keys;
  - `dispose()` removes the canvas attributes and the UI, stops events on the canvas from moving the camera, and restores `touch-action`.

  files: `tests/unit/shared/controls/camera-controls.test.ts` · covers: AC-3–AC-8, AC-11

- [x] **T016** — _(Note: the "damping eases motion" check moved to T031 E2E. In r186, damping applies to rotate and pan only, never to wheel zoom, and jsdom cannot drive pointer drags.)_ Implement `createCameraControls`: wire OrbitControls, the keyboard handler on the canvas, the turntable, the UI, the canvas a11y attributes and the reset flush.
      files: `src/shared/controls/index.ts` · test: T015

## Integration

_Added during T022: T023 (AC-13 focus management) and the 1.5 KB NFR (D-010)._

- [x] **T020** [P] — Back link first in the DOM, test first: `createBackLink` prepends, so it is the container's first child (the tab order for AC-9).
      files: `src/ui/back-link.ts`, `tests/unit/ui/back-link.test.ts` · test: unit + existing E2E (003 AC-7 Tab test)
- [x] **T021** [P] — Debug `cameraPose()`, test first: it returns the active instance camera's position and quaternion arrays, or null.
      files: `src/core/debug.ts`, `tests/unit/core/debug.test.ts`
- [x] **T022** — demo-cube adopts the controls, together with its updated tests:
  - remove the self-rotation and add `DEMO_CUBE.controls` (plan values);
  - `update(delta)` calls `controls.update(delta)`; `dispose()` disposes the controls; the coarse pointer comes from `matchMedia`;
  - tests: the cube's rotation stays 0; identical delta sequences give an identical camera position (001 AC-7); the turntable moves the camera, but not under reduced motion; `dispose()` frees the controls;
  - the full E2E suite stays green;
  - record the demo-cube chunk size and the entry size.

  files: `src/spaces/demo-cube/index.ts`, `tests/unit/spaces/demo-cube.test.ts` · covers: AC-6, AC-11 (unit)

- [x] **T023** — Focus management (AC-13), test first:
  - add `SpaceInstance.focusTarget?({ previousSpaceId })`;
  - SpaceManager: after mounting (not on the first mount), if focus is lost (body, disconnected or hidden), focus the new view's target;
  - gallery: return the card of the previous Space, or else the heading (`tabindex="-1"`);
  - demo-cube: return the 3D view;
  - update 003's AC-7 E2E: after clicking a card, the 3D view is focused, Shift+Tab reaches the back link, and Enter returns to the gallery with the Demo Cube card focused.

  files: `src/core/types.ts`, `src/core/space-manager.ts`, `src/gallery/{cards,index}.ts`, `src/spaces/demo-cube/index.ts`, unit tests, `tests/e2e/gallery.spec.ts` · covers: AC-13

- [x] **T030** — Controls E2E, part 1 (mouse, keyboard, UI):
  - AC-1: drag orbits, wheel zooms, right-drag and Shift+drag pan;
  - AC-3: keys only while the canvas is focused, with a focus ring;
  - AC-4: zoom and pan limits, with the cube still on screen;
  - AC-5: `R` and the button reset;
  - AC-6: the gallery canvas has no tabindex and isn't a camera;
  - AC-8: 10 enter/leave cycles, and no camera input on the gallery;
  - AC-9: the UI never moves the camera, and Tab order is back → canvas → "?" → reset;
  - AC-10: hint, help panel, `Esc`;
  - AC-12: resize keeps the view.

  files: `tests/e2e/controls.spec.ts` · covers: AC-1, AC-3–AC-6, AC-8–AC-10, AC-12

- [x] **T031** — Controls E2E, part 2 (touch and motion):
  - AC-2: a touch context with a CDP `Input.dispatchTouchEvent` helper; one finger orbits, a pinch zooms, a two-finger drag pans, and `scrollY` and `visualViewport.scale` are unchanged;
  - AC-7 and AC-11: the turntable moves the camera while idle, stops after a drag, and everything is static under reduced motion (after a drag and while idle).

  files: `tests/e2e/controls.spec.ts`, `tests/e2e/fixtures.ts` (touch helper) · covers: AC-2, AC-7, AC-11

## Docs

- [x] **T040** [P] — Add a "Camera controls" section to the architecture doc:
  - the module, config and lifecycle;
  - our keyboard handler and why we don't use OrbitControls' keys;
  - the turntable time model;
  - the reset flush;
  - tab order;
  - seams.

  Record the OrbitControls quirks in `memory/learnings.md`.
  files: `specs/architecture.md`, `memory/learnings.md`

## Verify

- [x] **T090** — Run `npm run check`, `npm run build` (bundle check) and `npm run test:e2e`, and confirm all are green with Prettier clean.
  - Coverage: ≥ 80 % lines for `src/shared/controls/*`.
  - NFR: entry growth ≤ 1.5 KB against 132.8 KB (amended, D-010); record the demo-cube chunk size.
- [x] **T091** — Tick AC-1…AC-12, set Status `Implemented`, roadmap ✔️, add a progress entry and update MEMORY (`/spec-verify 004`).

## AC Coverage

| AC    | Tasks                  |
| ----- | ---------------------- |
| AC-1  | T030                   |
| AC-2  | T031                   |
| AC-3  | T010, T015, T030       |
| AC-4  | T015, T030             |
| AC-5  | T013, T015, T030       |
| AC-6  | T015, T022, T030       |
| AC-7  | T012, T015, T031       |
| AC-8  | T015, T030             |
| AC-9  | T020, T030             |
| AC-10 | T013, T030             |
| AC-11 | T012, T015, T022, T031 |
| AC-12 | T030                   |
| AC-13 | T023, T030             |
