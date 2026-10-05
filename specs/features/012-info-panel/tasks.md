# 012 — Info Panel & Hotspots · Tasks

**Plan:** `./plan.md` (Approved)
Legend: `[P]` = can run in parallel with the previous task. Each task lists files and the proving test.
Test-first: each "tests" task must fail before its paired implementation task makes it pass.
Every task leaves `npm run check` **and** `npm run test:e2e` green (D-015 worker cap; `E2E_WORKERS=2` for one
spec). Baseline: entry 145.6 KB gzipped (011); allowance ≤ 3 KB (D-020).

## Setup

- [x] **T001** — **Entry-size check.** Temporarily wire a minimal panel (`createInfoPanel` stub + preferences)
      into `main.ts` and import `Raycaster` from a lazy chunk, then `npm run build`.
  - **Growth ≤ 3 KB:** carry on.
  - **> 3 KB:** **stop** and report. The cap is fixed (Q7), so propose a spec change or a slimmer design.
  - Remove the stub afterwards.

  files: temporary only · covers: AC-17 risk

  **Result (2026-10-05):** entry 145.6 → 146.3 KB gzipped (**+0.7 KB**) with a realistic panel + preferences
  module in the entry and `Raycaster` imported from the lazy chair chunk. Within the 3 KB cap. Spike removed.

## Preferences & info panel (core)

- [x] **T010** [P] — Preferences tests:
  - a missing key gives the fallback;
  - a value written is read back (boolean and string);
  - a storage that throws on read or write gives the fallback and never throws;
  - corrupt stored values give the fallback.

  files: `tests/unit/core/preferences.test.ts` · covers: AC-1

- [x] **T011** — Implement `src/core/preferences.ts`. test: T010

- [x] **T012** — Info panel tests:
  - region named by its `<h2>` title, plus the description `<p>`;
  - toggle with `aria-expanded` and `aria-controls`, named "Hide info" when open and "About <title>" when
    collapsed;
  - `open: false` starts collapsed;
  - clicking toggles the state and calls `onToggle`;
  - focus stays on the toggle;
  - `dispose()` removes everything.

  files: `tests/unit/ui/info-panel.test.ts` · covers: AC-1, AC-2, AC-4

- [x] **T013** — Implement `src/ui/info-panel.ts` and CSS: a side panel above 640 px, a bottom sheet at or below
      it (`bottom: 72px`, `max-height: 35vh`), and the hint moved to the top on narrow screens.
      files: `src/ui/info-panel.ts`, `src/styles/main.css` · test: T012 · covers: AC-3

- [x] **T014** — SpaceManager tests:
  - a registry Space gets `infoPanel(overlay, { title, description })` from the registry, prepended before the
    Space's own overlay DOM;
  - the gallery view gets none;
  - the panel is disposed on unmount, load-error, factory error, supersession, `suspend()` and `close()`;
  - no `infoPanel` option means no change.

  files: `tests/unit/core/space-manager.test.ts` · covers: AC-1, AC-4, AC-15

- [x] **T015** — Implement it in `SpaceManager` and wire `createInfoPanel` + preferences in `main.ts`.
  - **Update the existing E2E** that pins Tab order or focus, which the new toggle changes:
    - `controls.spec.ts` AC-9 (Tab order) and AC-13 (focus round trip);
    - `gallery.spec.ts` and `resilience.spec.ts` where they Tab through a Space.
  - Record the entry size.

  files: `src/core/space-manager.ts`, `src/main.ts`, those E2E specs · test: T014, the full E2E suite

  **Result (2026-10-05):** only `controls.spec.ts` AC-9 (Tab order) needed updating (+ the info toggle); the
  focus round trips still pass. Screenshots at 1280 × 720, 320 × 640 (expanded and collapsed), 375 × 667 and
  demo-cube at 320 found the 010 model credit wrapping to four lines and covering the bottom sheet. Fix: on
  narrow screens the credit is a full-width line above the controls row, and
  `.overlay:has(.model-credit) .info` lifts the sheet above it. Entry **146.0 KB** (+0.4 KB). 491 unit + 99 E2E
  green.

## Controls additions (004 API, additive)

- [x] **T020** [P] — `turnStep` tests:
  - t = 0 gives `from`, t = 1 gives `to`;
  - results stay unit length;
  - eased at the ends (smoothstep);
  - shortest arc;
  - near-opposite vectors take a stable perpendicular path;
  - identical vectors stay put.

  files: `tests/unit/shared/controls/turn.test.ts` · covers: AC-9

- [x] **T021** — Implement `src/shared/controls/turn.ts`. test: T020

- [x] **T022** — Controls tests:
  - **`turnTo(dir)`:** reaches `dir` at the current distance after `duration` of `update(delta)` time; instant
    with reduced motion; clamped to the polar limits; cancelled by keyboard, pointer or `reset()`; sets
    `userMoved`.
  - **`holdTurntable(true)`:** the turntable stays inactive past its idle delay.
  - **`holdTurntable(false)`:** the turntable resumes only after the idle delay.

  files: `tests/unit/shared/controls/camera-controls.test.ts` · covers: AC-9, AC-12

- [x] **T023** — Implement `turnTo` and `holdTurntable` (with a turntable hold). demo-cube and the 010/011 E2E
      stay green. files: `src/shared/controls/index.ts`, `types.ts`, `turntable.ts` · test: T022

## Hotspots module (shared)

- [x] **T030** [P] — `toScreen` tests:
  - centre of view → the canvas centre;
  - known off-axis points → expected CSS px at two aspects;
  - behind the camera → `visible: false`.

  files: `tests/unit/shared/hotspots/projection.test.ts` · covers: AC-6

- [x] **T031** — Implement `src/shared/hotspots/projection.ts`. test: T030

- [x] **T032** — Occlusion tests with real three meshes:
  - a box between the camera and the point → occluded;
  - a clear line → visible;
  - a point on the near surface isn't self-occluded (the `0.01 r` epsilon);
  - throttled to ≥ 0.1 s of accumulated delta, and only after the camera changes.

  files: `tests/unit/shared/hotspots/occlusion.test.ts` · covers: AC-7

- [x] **T033** — Implement `src/shared/hotspots/occlusion.ts`. test: T032

- [x] **T034** — `createHotspots` tests (jsdom, fake controls, real camera):
  - **Markers:** one button per hotspot in data order, named "Hotspot: <title>", with `aria-expanded`; placed
    via `transform` at the projected point; no DOM writes when nothing changed.
  - **Dimming:** an occluded marker becomes `disabled` + `.is-dimmed`; focus on a marker that dims moves to the
    canvas.
  - **Activation:** calls `turnTo(view)` + `holdTurntable(true)` and fills the polite annotation; one open at a
    time.
  - **Closing:** Escape, Close or the marker again closes it, calls `holdTurntable(false)` and returns focus to
    the marker.
  - **Layer:** the layer has `pointer-events: none` and the markers `auto`.
  - **`dispose()`:** removes the DOM and listeners.

  files: `tests/unit/shared/hotspots/hotspots.test.ts` · covers: AC-5–AC-8, AC-10–AC-12, AC-15

- [x] **T035** — Implement `src/shared/hotspots/index.ts` + `types.ts` and the CSS: `.hotspots`, `.hotspot`
      (a 44 px hit area around a dot, focus ring), `.is-dimmed`, `.hotspot-annotation` (clamped in the
      viewport). test: T034

## Chair data, viewer and hooks

- [x] **T040** — **Positions probe** (throwaway script plus screenshots):
  1. For each part (fabric, wood, metal, label), raycast from outside onto the mesh to pick a surface point and a
     view direction within the polar limits.
  2. Confirm which parts the wood and metal actually are, and adjust the drafted copy if needed. **Stop** and
     show the user if the meaning changes, e.g. the legs turn out to be wood.
  3. Time one occlusion pass on the chair; it must be ≤ 1 ms per raycast run. If not, apply the plan's
     mitigation.
  4. Record the positions, views and timing in this file.

  files: temporary only · covers: AC-5, AC-13, NFR

  **Probe results (2026-10-05)**: mesh components of `assets-src/`, plus a page rendering the shipped GLB through
  the real loader (screenshots, raycasts). Copy and occlusion approach approved (D-021); probe removed.
  - **Parts:** fabric = seat cushion and back cushion (velvet; **the chair has no arms**). Wood = four legs, a
    back shell behind the back cushion, back posts, a board and rails under the seat. Metal = 20 bolt heads at
    the leg joints plus 4 floor glides (~1 cm each, too small for a hotspot). Label = a printed white label on
    the board under the seat. So the plan's "Metal base" and "frame shapes the arms" copy is wrong, and spec
    AC-5's "wooden frame and arms" needs "arms" dropped.
  - **Positions** (model coords) / **views**, each confirmed visible from its own view:
    seat `[-0.001, 0.358, 0.096]` / `[0, 0.6, 1]`; back shell `[0.003, 0.564, -0.257]` / `[0.3, 0.3, -1]`;
    front leg `[0.325, 0.121, 0.208]` / `[1, 0.1, 0.6]`; label `[0, 0.239, 0.029]` / `[0.2, -0.9, 0.6]`
    (polar 2.53 rad, inside the 2.99 limit). At the home view the back shell and the label are dimmed.
  - **Timing:** one pass of 4 rays with three's `Raycaster` = **8.2 ms median** (p95 10 ms), ~8× over the
    1 ms NFR; the plan's mitigations can't close that (Mesh.raycast already box-checks; one ray ≈ 2 ms). A flat
    world-space triangle array with an any-hit Möller–Trumbore loop (early exit): **0.7 ms median, 1.0 ms max**
    for all 4 rays, identical results at every view tested. Costs 1.4 MB (39 936 triangles as Float32).

- [x] **T041** — Viewer tests:
  - a config with hotspots creates the layer **before** the controls bar in DOM order;
  - `update()` updates the hotspots after the controls;
  - `dispose()` disposes them;
  - a config without hotspots creates no layer;
  - `hotspotPositions()` returns world positions that account for the model's centring.

  files: `tests/unit/shared/model-viewer/viewer.test.ts` · covers: AC-5, AC-14, AC-15

- [x] **T042** — Implement it in `createModelViewer` and `ModelViewerConfig.hotspots`.
      files: `src/shared/model-viewer/index.ts`, `types.ts` · test: T041

- [x] **T043** [P] — Chair data tests:
  - four hotspots, unique kebab-case ids;
  - titles ≤ 4 words, texts ≤ 2 sentences;
  - positions within the source GLB's bounds (+2 %, glTF-Transform `getBounds` on `assets-src/`);
  - `view` non-zero.

  files: `tests/unit/spaces/sheen-chair.test.ts` · covers: AC-13

- [x] **T044** — Add the four hotspots to `src/spaces/sheen-chair/data.ts` (T040 values, approved copy).
      test: T043

- [x] **T045** [P] — Debug hooks: tests and implementation for `__WORLD__.hotspots()` (via
      `SpaceInstance.hotspotPositions?()`) and `cameraProjection()`; absent in production.
      files: `src/core/debug.ts`, `src/core/types.ts`, `tests/unit/core/debug.test.ts` · covers: AC-6 seam

## End-to-end

- [x] **T050** — `info-panel.spec.ts`:
  - **AC-1:** the card's title and description; open on a first visit; collapse → reload → still collapsed; a
    fresh context → open.
  - **AC-2:** toggle by mouse, touch tap and keyboard; `aria-expanded`; focus kept.
  - **AC-3:** drag and wheel on the panel leave the pose unchanged; at 320 × 640 the expanded rect is ≤ 35 % of
    the viewport and the hint isn't covered; collapsed → fill in 50–90 %. Screenshots at 320 × 640 and
    375 × 667.
  - **AC-4:** the named region; the full Tab sequence.
  - **AC-14:** demo-cube has the panel and no `.hotspot`.

  covers: AC-1, AC-2, AC-3, AC-4, AC-14

- [x] **T051** — `hotspots.spec.ts`, markers:
  - **AC-5:** four markers.
  - **AC-6:** within 4 px of the point projected in the test (from `cameraPose()`, `cameraProjection()` and
    `hotspots()`, read in one `evaluate`) at the home view, after orbit, zoom and pan, mid-turntable, and at
    320 × 640.
  - **AC-7:** the label is dimmed and `disabled` at home, and enabled after turning to its view.
  - **AC-10:** Tab order follows the data; focus ring; names; arrows orbit only while the canvas has focus.

  covers: AC-5, AC-6, AC-7, AC-10

- [x] **T052** — `hotspots.spec.ts`, activation:
  - **AC-8:** click → annotation in a polite region; Escape, Close and re-activation close it; focus returns to
    the marker.
  - **AC-9:** the camera turns (> 20°), instantly with reduced motion.
  - **AC-11:** a ≥ 44 × 44 target; a drag from a marker doesn't orbit; a drag between markers does; touch tap
    opens.
  - **AC-12:** the pose is still for 600 ms while open (after the turn settles); the turntable resumes after
    close + its idle delay.

  covers: AC-8, AC-9, AC-11, AC-12

- [x] **T053** — `hotspots.spec.ts`, lifecycle:
  - **AC-15:** 10 round trips → `#app` element count and `memory()` back to the baseline.
  - **AC-16:** lose → restore → panel present, markers within 4 px.

  covers: AC-15, AC-16

## Docs & Verify

- [x] **T090** — Update `specs/architecture.md`:
  - info panel (core, prepended, preferences, layout);
  - hotspots module (projection, occlusion throttle, annotation, focus rules);
  - controls `turnTo` / `holdTurntable`;
  - Tab order;
  - stacking and layout;
  - seams (`hotspotPositions`, `cameraProjection`).

- [x] **T091** — `npm run check`, `npm run test:e2e`, `npm run build` all green; record the entry size (AC-17)
      and the chair's total.

  **Result (2026-10-05):** Prettier clean; 560 unit (40 files) + 129 E2E green; build OK. Entry **146.0 KB**
  gzipped (+0.4 KB of the 3 KB cap); sheen-chair 55.1 KB + 1.26 MB + 571.2 KB = **1.87 MB** (≤ 5 MB);
  `__WORLD__` absent from `dist/`.

- [x] **T092** — Tick ACs in `spec.md` (Status `Implemented`), set `roadmap.md` 012 ✔️, update
      `memory/progress.md`, `memory/MEMORY.md` and `memory/learnings.md`.

## AC coverage

| AC    | Tasks                              |
| ----- | ---------------------------------- |
| AC-1  | T010–T015, T050                    |
| AC-2  | T012, T013, T050                   |
| AC-3  | T013, T050                         |
| AC-4  | T012, T014, T015, T050             |
| AC-5  | T034, T040–T044, T051              |
| AC-6  | T030, T031, T034, T045, T051, T053 |
| AC-7  | T032–T034, T051                    |
| AC-8  | T034, T035, T052                   |
| AC-9  | T020–T023, T034, T052              |
| AC-10 | T034, T051                         |
| AC-11 | T034, T035, T052                   |
| AC-12 | T022, T023, T034, T052             |
| AC-13 | T040, T043, T044                   |
| AC-14 | T041, T050                         |
| AC-15 | T014, T034, T041, T053             |
| AC-16 | T053                               |
| AC-17 | T001, T015, T091                   |
