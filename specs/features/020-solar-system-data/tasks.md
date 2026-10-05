# 020 — Solar System Data Model & Scale Modes · Tasks

**Plan:** `./plan.md` (Approved)
Legend: `[P]` = can run in parallel with the previous task. Each task lists files and the proving test.
Test-first: each "tests" task must fail before its paired implementation task makes it pass.
Every task leaves `npm run check` **and** `npm run test:e2e` green (D-015 worker cap; `E2E_WORKERS=2` for one
spec). Baseline: entry 146.0 KB gzipped (012); allowance ≤ 3 KB (D-022).

## Setup

- [x] **T001** — **Spike (throwaway, browser):** a minimal page with real-scale spheres (1 unit = 10⁶ km), the
      shared controls with OrbitControls' `zoomToCursor`, the pan limit at Neptune's orbit, and the dynamic
      near/far plane. Then `npm run build` with `PointLight`, `SphereGeometry` and `AmbientLight` imported from
      a lazy chunk.
  1. From the whole-system view, wheel-zoom on Earth's position until Earth is ≥ 3 px. Record the number of
     wheel steps, or that it can't be done.
  2. Screenshot Earth + Moon and Jupiter zoomed in: no flicker or jitter while orbiting.
  3. Entry growth ≤ 3 KB.

  **Stop** and report if 1 or 3 fails (plan fallbacks need the lead's call). Remove the spike afterwards.

  files: temporary only · covers: AC-8a, AC-13, NFR precision risks

  **Result (2026-10-05), SwiftShader at 1280 × 720:**
  1. **`zoomToCursor` fails.** After 400 wheel steps on Earth's position Earth was still 0.1 px; the camera stalls
     ~66 units away. OrbitControls moves the camera by a fraction of its distance to the _target_ and re-places
     the target just ahead of it, so it converges on the target's depth, not on the body under the pointer (Jupiter
     the same).
     **Alternative tested:** a zoom starting within 24 px of a body re-targets the orbit onto that body, then
     zooms normally. Earth ≥ 3 px after 58 steps of 3 wheel notches, Jupiter after 43. **Lead chose this
     (D-023):** `focusOn()` + `zoomSpeed` replace `zoomToCursor` (plan and T022, T024, T025, T031 updated).
  2. **Precision OK:** zoomed in on Earth (~67 px) and Jupiter (~88 px) at real-scale coordinates and orbiting:
     clean spheres and terminators, no jitter or flicker. Near plane followed the nearest surface (0.04 units at
     Earth).
  3. **Entry +0.4 KB** (146.0 → 146.4) with `PointLight` + `SphereGeometry` in a lazy chunk.

  Spike removed.

## Data & layout (pure, test-first)

- [x] **T010** [P] — Data tests:
  - 16 bodies, kebab-case unique ids, planets in order, the 7 moons with the right parents (AC-1);
  - every field present; planets have the full J2000 set; the Sun has no orbit (AC-2);
  - positive values; ordered distances; each moon's orbit < half the gap to the next planet; Kepler
    `T = 2π√(a³/GM_parent)` within 5 % (AC-3);
  - `SOURCES` with name, URL, licence and date read (AC-4).

  files: `tests/unit/spaces/solar-system/data.test.ts` · covers: AC-1–AC-4

- [x] **T011** — `types.ts` + `data.ts`: transcribe the values from the NASA Planetary Fact Sheets and JPL
      (planets: approximate J2000 elements; moons: mean elements) at dev time (WebFetch; nothing at runtime).
      List the URLs and the read date in `SOURCES`. Fixed display angles (Q1); colours. Add a data-sources line
      to `public/assets/CREDITS.md`. **Review:** show the lead the value table before ticking.
      files: `src/spaces/solar-system/types.ts`, `data.ts`, `public/assets/CREDITS.md` · test: T010

  **Status (2026-10-05): values approved by the lead.** NASA's NSSDC fact sheets were
  unreachable (connection refused from WebFetch and curl, and the Internet Archive is blocked), so every value
  comes from JPL instead:
  - **Physical data:** Horizons API object data (radius, GM, rotation, obliquity).
  - **Planet orbits:** `planets/phys_par` (sidereal orbital periods) and `approx_pos` Table 1 (J2000 a, e, I, L,
    ϖ, Ω).
  - **Moon orbits:** `sats/elem` (mean elements).

  Kepler residuals ≤ 0.75 % (largest: Europa, Moon, Io). A planted 8 % error in Io's period fails the test.
  Rotation is always positive; a backwards spin is a tilt > 90° (IAU), so Venus is 177.3° and Uranus 97.77°.

- [x] **T012** [P] — Layout tests:
  - **Real:** every radius and distance = km / 10⁶; ratios within 0.1 % (AC-6).
  - **Stylised:**
    - planets in order;
    - bigger stays bigger (every pair, Sun largest);
    - Sun, planet and moon rings disjoint;
    - moons outside their planet;
    - the smallest radius ≥ 3 px at 1280 × 720 at the home framing (`frameDistance`) (AC-5).
  - `placeBodies()` uses the display angle in the XZ plane; `systemExtent()`.

  files: `tests/unit/spaces/solar-system/scale.test.ts` · covers: AC-5, AC-6

- [x] **T013** — Implement `scale.ts` with the plan's stylised constants in `data.ts` (`STYLISED`). test: T012

  **Result (2026-10-05):** the plan's constants (exponent 0.3, log term 2) gave Europa only 2.99 px once the
  test projected with a perspective camera at the real home pose. Tuned to exponent **0.25** and log term
  **1.5**: S ≈ 57 units, smallest 3.33 px at 1280 × 720 and 1.59 px at 320 × 640; Jupiter still 1.8× Earth.
  Plan updated. A negative ring gap fails the overlap test.

## Scene & Space

- [x] **T020** — Scene tests (no rendering):
  - `buildSystem()` makes the graph `system → Sun; orbit group → planet mesh + moon groups → moon meshes`, with
    one shared geometry;
  - `applyLayout(mode)` moves groups and sets `mesh.scale` with no new geometry or material, and moons don't
    inherit their planet's scale;
  - the Sun is a basic material with a decay-0 point light at its centre; the others are standard materials in
    their data colour;
  - dispose frees everything.

  files: `tests/unit/spaces/solar-system/scene.test.ts` · covers: AC-8, AC-10, AC-11, AC-12

- [x] **T021** — Implement `scene.ts`. test: T020

- [x] **T022** [P] — Controls: tests and implementation, additive (D-023):
  - **`focusOn(point, { minDistance? })`:** (`minDistance` added in T025, which found the camera could enter
    Earth or the Sun) moves the target to `point` and keeps the camera position; it counts as an
    interaction (the idle delay restarts) and sets `userMoved`; `reset()` returns home.
  - **`zoomSpeed`:** passed to OrbitControls (default 1).

  demo-cube and the chair are unchanged.
  files: `src/shared/controls/index.ts`, `types.ts`, `tests/unit/shared/controls/camera-controls.test.ts`
  · covers: AC-8a

- [x] **T023** [P] — Scale toggle tests, then implementation:
  - a button "True scale" with `aria-pressed`;
  - a visually hidden polite description that the canvas's `aria-describedby` points at;
  - a click toggles, calls `onChange`, and keeps focus;
  - dispose removes the DOM and the attribute.

  files: `tests/unit/spaces/solar-system/scale-toggle.test.ts`, `src/spaces/solar-system/scale-toggle.ts` ·
  covers: AC-7, NFR accessibility

- [x] **T024** [P] — Markers tests, then implementation:
  - one `.body-marker` per body in an `aria-hidden` layer with `pointer-events: none`;
  - placed by `toScreen()`;
  - a moon is hidden when < 24 px from its planet's marker;
  - `nearest(x, y, 24)` returns the body whose projected centre is nearest within 24 px, or null;
  - the layer is hidden while inactive (stylised);
  - points behind the camera are hidden;
  - nothing is written when nothing changed;
  - dispose.

  files: `tests/unit/spaces/solar-system/markers.test.ts`, `src/spaces/solar-system/markers.ts` · covers:
  AC-8a

- [x] **T025** — Factory tests (`createFakeContext`):
  - opens in the preferred scale (stylised by default);
  - the toggle switches the scale, writes the preference and re-homes the camera (`setHome` + reset);
  - markers are active only at real scale;
  - at real scale, a wheel event (capture phase) or a pinch's second touch within 24 px of a body calls
    `focusOn(body)` before OrbitControls zooms; not at stylised scale; `zoomSpeed` 4 (D-023);
  - the dynamic near/far plane (near ≈ half the distance to the nearest surface, clamped; far covers the
    system);
  - `bodies()` returns world positions and radii;
  - `update()` order: controls → near/far → markers;
  - dispose frees scene, controls, toggle and markers.

  files: `tests/unit/spaces/solar-system/space.test.ts` · covers: AC-7, AC-8, AC-8a, AC-11, AC-12

- [x] **T026** — Implement `index.ts` and its CSS (`.scale-toggle` on the controls row, bottom-left;
      `.body-markers`, `.body-marker`). files: `src/spaces/solar-system/index.ts`, `src/styles/main.css` ·
      test: T025

- [x] **T027** — Register the Space and add the seam.
  - Files: `registry.ts` entry (`solar-system`, `kind: 'multi'`); `SpaceInstance.bodies?()` and
    `__WORLD__.bodies()` (`src/core/types.ts`, `src/core/debug.ts`).
  - Tests: `registry.test.ts`, `debug.test.ts`.
  - **Update the existing E2E that count or lay out gallery cards** (`gallery.spec.ts`, `smoke.spec.ts`)
    for the third card.
  - Screenshots at 1280 × 720, 320 × 640 and 375 × 667 (toggle, controls row, info sheet).

  covers: AC-9

  **Result (2026-10-05):** registered first in the registry (newest first). Four E2E tests pinned the two-card
  order or Tab count (`gallery.spec.ts` AC-1/AC-4/AC-9, `controls.spec.ts` AC-13) and were updated. Screenshots
  at 1280 × 720, 375 × 667 and 320 × 640 in both scales show no console errors and no overlap (toggle x 16–108
  vs controls bar x 155–304 at 320). At real scale 9 markers show (Sun + planets; moons within 24 px hidden).
  **Open, cosmetic:** at the real-scale home view the Sun's and the four inner planets' labels overprint each
  other, and at 320 px "Neptune" is clipped at the edge. Raised with the lead. Entry **146.5 KB** (+0.5 KB);
  solar-system 12.3 KB. 647 unit + 129 E2E green.

## End-to-end

- [x] **T030** — `solar-system.spec.ts`, Space and scale:
  - **AC-9:** card → Space; info region "Solar System"; non-blank; no console errors.
  - **AC-5:** every body ≥ 3 px radius at 1280 × 720 and ≥ 1 px at 320 × 640, with a non-background pixel.
  - **AC-7:** mouse, touch tap, Enter/Space; `aria-pressed`; polite description; focus kept; stylised first;
    reload → remembered; fresh context → stylised.
  - **AC-8:** after each switch every body is inside the canvas and the farthest fills 50–90 % of the smaller
    half-dimension; one frame with reduced motion.

  covers: AC-5, AC-7, AC-8, AC-9

  **Result (2026-10-05):** `tests/e2e/solar-system.spec.ts`, 8 tests. Bodies are projected in Node from
  `cameraPose()` + `cameraProjection()` + `bodies()`, and canvas pixels are checked at each centre. Sabotage-checked
  (radius curve, preference not saved, no re-frame). The re-frame check first passed without `reset()`:
  `setHome()` already re-frames an untouched camera, so the test now zooms and orbits before each switch.

- [x] **T031** — `solar-system.spec.ts`, real scale and lighting:
  - **AC-8a:** markers within 4 px of bodies projected in Node; none in stylised; wheel-zoom on Earth's marker
    → Earth ≥ 3 px and the Moon's marker appears; a pinch (`touchGesture`) started on Jupiter's marker
    re-centres on Jupiter.
  - **AC-10:** for Jupiter and Earth, the sunward pixel is brighter than the far one.
  - **AC-11:** `bodies()` unchanged after 1 s while the turntable turns.

  covers: AC-8a, AC-10, AC-11

  **Result (2026-10-05):** 6 more tests in `solar-system.spec.ts`:
  - markers within 4 px, and shown names not overlapping and inside the view, at 1280 and 320 px;
  - wheel-zoom on Earth's marker → Earth ≥ 3 px, re-centred, the Moon's marker shown;
  - a two-finger touch on Jupiter's marker → re-centred;
  - sunward side brighter;
  - bodies still while the camera turns.

  Before this task, the lead chose label declutter (D-024: larger body keeps its name; names stay inside the
  view; spec AC-8a amended). The real-browser overlap check showed estimated label sizes were wrong, so names are
  now measured once per show/resize. The pinch check uses a still two-finger touch: a moving pinch also pans by
  its midpoint's wobble (normal OrbitControls behaviour), which blurred the re-centre by ~6°. Sabotage-checked
  (marker offset, Sun light off, no re-centring). 652 unit + 143 E2E green.

- [x] **T032** — `solar-system.spec.ts`, lifecycle:
  - **AC-12:** 10 round trips → `#app` count (minus `.loading-announcer`) and `memory()` back to the baseline;
    at real scale lose → restore → still real.

  covers: AC-12

  **Result (2026-10-05):** 2 tests. The Space has one geometry (the shared sphere), the same count as the gallery's
  starfield, so the round trip relies on the final equality with the baseline; skipping `system.dispose()` or
  `markers.dispose()` fails it. After a restore, real scale shows a blank canvas by design (every body
  sub-pixel), so drawing is checked after switching back to stylised. 652 unit + 145 E2E green.

## Docs & Verify

- [x] **T090** — `specs/architecture.md`: Solar System section (replacing "planned"):
  - data and sources;
  - scale modes and the stylised mapping;
  - the scene graph for 021;
  - precision (separate meshes, dynamic near/far);
  - markers;
  - toggle and preference;
  - `focusOn()` + `zoomSpeed` and the re-centring zoom (D-023);
  - the `bodies()` seam;
  - directory layout.

- [x] **T091** — `npm run check`, `npm run test:e2e`, `npm run build` all green. Record the entry size (AC-13)
      and the Space's size. Manual FPS note on a real GPU (`npm run dev`, Chrome performance overlay).
      Warning probe with the E2E launch flags (learnings).
      **Result (2026-10-05):**
  - **Gate:** Prettier clean; 652 unit (46 files) + 145 E2E green; build OK.
  - **Sizes:** entry **146.5 KB** gzipped (+0.5 KB of the 3 KB cap); solar-system **12.7 KB**, no assets;
    `__WORLD__` absent from `dist/`.
  - **Gate 5:** a production-build probe with the E2E flags (two viewports, scale switches, 20 wheel zooms,
    reset, 3 round trips) logged no warnings or errors.
  - **FPS:** 60.3 fps in both scales at 1280 × 720, capped by the display rate, measured in headless Chromium,
    which rendered with **SwiftShader** (CPU) even without flags. A software-rendering floor, not a real-GPU
    measurement; a mid-range GPU will do at least as well.

- [x] **T092** — Tick ACs in `spec.md` (Status `Implemented`), set `roadmap.md` 020 ✔️, update
      `memory/progress.md`, `memory/MEMORY.md` and `memory/learnings.md`.

## AC coverage

| AC    | Tasks                        |
| ----- | ---------------------------- |
| AC-1  | T010, T011                   |
| AC-2  | T010, T011                   |
| AC-3  | T010, T011                   |
| AC-4  | T010, T011                   |
| AC-5  | T012, T013, T030             |
| AC-6  | T012, T013                   |
| AC-7  | T023, T025, T026, T030       |
| AC-8  | T020, T021, T025, T030       |
| AC-8a | T001, T022, T024, T025, T031 |
| AC-9  | T027, T030                   |
| AC-10 | T020, T021, T031             |
| AC-11 | T020, T025, T031             |
| AC-12 | T020, T025, T032             |
| AC-13 | T001, T091                   |
