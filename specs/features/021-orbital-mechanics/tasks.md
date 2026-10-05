# 021 — Orbital Mechanics & Time Controls · Tasks

**Plan:** `./plan.md` (Approved)
Legend: `[P]` = can run in parallel with the previous task. Each task lists files and the proving test.
Test-first: each "tests" task must fail before its paired implementation task makes it pass.
Every task leaves `npm run check` **and** `npm run test:e2e` green (D-015 worker cap; `E2E_WORKERS=2` for one
spec). Baseline: entry 146.5 KB gzipped (020); allowance ≤ 5 KB (D-025).

## Setup

- [x] **T001** — **Entry-size spike (temporary):** import `LineLoop`, `LineBasicMaterial` and `Quaternion` use
      from a lazy chunk, then `npm run build`. Growth ≤ 5 KB: carry on; more: **stop** and report. Remove the
      spike. files: temporary only · covers: AC-13 risk

  **Result (2026-10-05):** entry 146.5 → **146.5 KB** (+0.0): those classes are already in the shared chunk.

- [x] **T002** — **Reference positions (dev-only script + fixture):**
  - `scripts/fetch-reference-positions.mjs` queries the Horizons API (VECTORS, ecliptic J2000, km):
    - the 8 planets, heliocentric (`@10`);
    - the 7 moons, planetocentric (`@399`, `@599`, `@699`, `@899`);
  - at 1800-01-01, 1850, 1900, 1950, 2000-01-01.5, 2025 and 2050-12-31;
  - writes `tests/fixtures/horizons-positions.json` with the query, date read and source.

  Type-checked like the other scripts (`// @ts-check`); not run in CI. Add the credit line.

  files: `scripts/fetch-reference-positions.mjs`, `tests/fixtures/horizons-positions.json`,
  `public/assets/CREDITS.md` · test: the fixture is consumed by T012

  **Result (2026-10-05):** `scripts/horizons.mjs` (pure, 4 unit tests) + the runner; fixture of 15 bodies × 7
  dates (9 KB). Horizons has no Neptune ephemeris before 1800-01-02, so the first date is 1800-01-03. Sanity:
  Earth at 0.983 AU on 2000-01-01 (perihelion).

## Data, time and orbit maths (pure, test-first)

- [x] **T010** — Data additions + tests:
  - **Planets:** per-century element rates (JPL Table 1).
  - **Every body:** the pole (RA, Dec + rates) and prime meridian (W0, Ẇ) from NAIF `pck00011.tpc`.
  - **Moons:** apsis and node periods (JPL satellite elements).
  - **`SOURCES`** extended.

  Tests: every field present and finite; the poles' tilts to each orbit agree with the 020 `axialTiltDeg` within
  1° (a cross-check of two sources). **Review:** show the lead the added values before ticking.

  files: `src/spaces/solar-system/types.ts`, `data.ts`, `tests/unit/spaces/solar-system/data.test.ts` · covers:
  AC-1–AC-4 inputs

  **Status (2026-10-05): values approved by the lead; 30 data tests green.**
  - **Rates:** Table 1 per-century rates for the 8 planets (each L rate agrees with 360°/period).
  - **Spin:** NAIF `pck00011.tpc` poles and prime meridians (constant + linear terms) for all 16 bodies.
  - **Moon precession:** apsis/node periods for the 7 moons.

  The cross-check (spin axis vs 020's tilt) caught **Mars 1.3° off**: NAIF's 2015 Mars pole carries a
  ~71 000-year term (0.42° RA, 1.59° Dec), now folded in at J2000. The result matches IAU 2009. NAIF's poles
  for the Moon (3.9° term) and Triton (32° precession) also need their periodic terms, so T013 must derive the
  moons' axes from their orbits (as planned), not from these poles.

- [x] **T011** [P] — Simulated time tests, then `time.ts`:
  - speeds in days/s; direction;
  - `advance` adds `speed · delta` only while playing;
  - clamped to 1800-01-01 … 2050-12-31, pausing there and reporting the limit once;
  - two delta sequences reaching the same day agree;
  - `formatDate` in UTC ("12 Mar 2031"), plus `fromEpochMs` / ISO for `datetime`.

  files: `tests/unit/spaces/solar-system/time.test.ts`, `src/spaces/solar-system/time.ts` · covers: AC-5, AC-6,
  AC-8

  **Result (2026-10-05):** 12 tests green; `time.ts` matches the plan's `SimTime` (keyed speed + `backwards`).
  Also `initialTime(startMs, reducedMotion)` (clamped; paused under reduced motion) and `isoDate()`.

- [x] **T012** — Orbit maths tests (vs the T002 fixture):
  - planets within 1° (longitude, latitude) and 1 % (distance) at all 7 dates (AC-1);
  - the ellipse's focus at the Sun, its shape matching e and I (AC-2);
  - moons within 10° (Triton 30°, D-026) of their planetocentric direction, Triton retrograde (AC-3);
  - spin: one sidereal period = one turn, Venus/Uranus backwards, the moons' facing points at their planet, the
    fast-spin rule (AC-4);
  - the ecliptic → scene axes;
  - no allocation (output parameters).

  files: `tests/unit/spaces/solar-system/orbit.test.ts` · covers: AC-1–AC-4

- [x] **T013** — Implement `orbit.ts`. If a moon misses 10°, **stop** and report the numbers (plan risk).
      test: T012

  **Result (2026-10-05):** the moons missed (stopped, reported); the lead chose D-026 (moon rates from NAIF |Ẇ|,
  Titan's M from Horizons, node sign by orbit direction, Triton allowed 30°). 36 orbit tests green. Worst errors:
  planets 0.17° / 0.13 %, Moon 1.4°, Galileans 2.1°, Titan 5.2°, Triton 25.1°.

- [x] **T014** — Per-date placement tests, then `scale.ts` additions:
  - **Real:** orbit maths ÷ `REAL_UNIT_KM`.
  - **Stylised:** on the 020 rings at the true projected angle.
  - **020's no-overlap holds at 200 random dates.**

  files: `tests/unit/spaces/solar-system/scale.test.ts`, `scale.ts` · covers: AC-2, AC-5

  **Result (2026-10-05):** `createPlacement(bodies).at(layout, mode, days)` writes each body's offset from its
  parent into the same map and vectors every call. 4 tests; the 200-date overlap test was sabotage-checked (moons
  at 30 % of their ring → Earth–Moon overlap caught).

## Scene, controls and core seams

- [x] **T020** — Scene tests, then `scene.ts` additions:
  - `applyPositions()` / `applyOrientations()` set groups and quaternions from per-date values;
  - no allocation (the same objects each call);
  - moons still don't inherit scale.

  files: `tests/unit/spaces/solar-system/scene.test.ts`, `scene.ts` · covers: AC-4, AC-5

  **Result (2026-10-05):** `applyPositions(offsets)` (then `updateMatrixWorld`, so markers project current
  positions) and `applyOrientations(days, speed)` writing straight into each mesh's quaternion. 3 tests.

- [x] **T021** [P] — Orbit lines tests, then `orbit-lines.ts`:
  - 15 `LineLoop`s per scale, the real ellipses on the planets' paths (sampled points match `planetPosition` over
    an orbit) and the stylised circles on the rings;
  - moon lines under their planet's group;
  - a scale switch only toggles visibility;
  - a rebuild after > 10 years of drift (a moon's sooner, D-027);
  - dispose frees them all.

  files: `tests/unit/spaces/solar-system/orbit-lines.test.ts`, `orbit-lines.ts` · covers: AC-11

  **Result (2026-10-05):** 8 tests. One shared faint material; each line rewrites its own buffer when stale;
  `raycast` is a no-op. `planetPosition`/`moonPosition` gained an optional mean anomaly to trace an orbit. The
  plan's 10-year rebuild left the Moon 5.4 % of its orbit off its line after 9 years (sabotage-checked); the
  per-moon interval keeps it < 0.5 %.

- [x] **T022** [P] — Controls `follow(delta)`: tests and implementation.
  - It moves the camera and target together by `delta`.
  - It doesn't count as an interaction (`userMoved` unchanged, the turntable keeps its state).
  - The limits still apply.

  files: `src/shared/controls/index.ts`, `types.ts`, `tests/unit/shared/controls/camera-controls.test.ts` ·
  covers: AC-10

  **Result (2026-10-05):** 3 tests (the "not an interaction" one sabotage-checked). `follow` takes any
  `{ x, y, z }` (a reused vector, no per-frame tuple) and leaves clamping to the frame's `update()`: calling
  `update` inside it would flush the visitor's drag damping every frame. 726 unit + 145 E2E green.

- [x] **T023** [P] — Core seams: tests and implementation.
  - `SpaceManager({ wallClock })` → `SpaceContext.startTime` on every open.
  - `suspend()` keeps `instance.saveState?.()`; `resume()` passes it as `savedState`; a normal open has none.
  - `__WORLD__.simTime()` / `setSimTime()` (absent in production).
  - `main.ts` passes `Date.now`.

  files: `src/core/types.ts`, `space-manager.ts`, `debug.ts`, `src/main.ts`, `tests/unit/core/space-manager.test.ts`,
  `debug.test.ts`, `tests/helpers/fakes.ts` (`createFakeContext` gets a fixed `startTime`) · covers: AC-8, AC-12

  **Result (2026-10-05):** 8 tests. `startTime` is a required `SpaceContext` field (`wallClock` defaults to
  `Date.now`). One saved state per target: `suspend()` takes it from a mounted view (a throwing `saveState()` is
  logged), keeps it through a loss mid-rebuild (sabotage-checked), and any other open or close drops it.
  734 unit + 145 E2E green.

## UI and the Space

- [x] **T030** — Time controls tests, then `time-controls.ts`:
  - a "Time" group;
  - a `<time datetime>` date, not live;
  - "Play time"/"Pause time";
  - a Speed `<select>` (four speeds, default week);
  - a "Backwards" toggle (`aria-pressed`);
  - a polite region for play/pause, direction and range-limit messages;
  - focus kept;
  - `set()` from outside without reporting;
  - dispose.

  files: `tests/unit/spaces/solar-system/time-controls.test.ts`, `time-controls.ts` · covers: AC-6, AC-7, AC-8

  **Result (2026-10-05):** 14 tests (date-write and silent `set()` sabotage-checked). API: `set(time)` (silent,
  date text written only on a new day), `announceLimit('start' | 'end')`, `dispose()`; `onChange(time)` on each
  visitor change. Not mounted until T032.

- [x] **T031** — Space tests (`space.test.ts` additions):
  - opens at `startTime`, playing at 1 week/s (paused with reduced motion);
  - `update(delta)` advances the date and moves bodies;
  - paused → nothing moves;
  - same date by different paths → identical `bodies()`;
  - the controls change speed and direction;
  - a range limit pauses with the message;
  - follow after a re-centre keeps the body centred while time runs, and a pan or reset stops it;
  - `saveState()` → `savedState` restores date, speed and play state;
  - orbit lines toggle with scale;
  - `simTime`/`setSimTime`;
  - per-frame order;
  - dispose frees lines and the UI.

  files: `tests/unit/spaces/solar-system/space.test.ts` · covers: AC-4–AC-12

- [x] **T032** — Implement the wiring in `index.ts` + CSS (wide and narrow layouts, info sheet lift). Screenshots
      at 1280 × 720, 375 × 667 and 320 × 640, both scales, time running (overlap and readability; flag fast-moon
      strobing). files: `src/spaces/solar-system/index.ts`, `src/styles/main.css` · test: T031

  **Result (2026-10-05):** 20 new Space tests (+3 adapted from 020's fixed angles); following's stop rule
  sabotage-checked. A reset was dragged one frame along by the follow until the check moved before the follow
  step. "True scale" and the time controls share a `.solar-bar` row (wraps above the controls bar at ≤ 640 px; the
  info sheet lifted to 180 px). Screenshots at 1280 × 720, 375 × 667 and 320 × 640, both scales, time running: no
  overlap, no console errors. D-028: ambient 0.03 → 0.1 (Mercury's night side vanished against black, failing
  020 AC-5), saved state is the time only. The 020 "bodies still" E2E now pauses time first. Fast moons strobe
  at 1 year/s when zoomed in (accepted by the plan). Entry 146.6 KB (+0.1). 765 unit + 145 E2E green.

## End-to-end

- [x] **T040** — `solar-system-time.spec.ts`, controls:
  - **AC-6:** mouse, touch tap and keyboard on play/pause, speed and direction; the date moves at the chosen
    speed and direction; announcements; focus kept.
  - **AC-7:** the date is visible as `<time datetime>`, not live, and advances.
  - **AC-8:** opens at "today" (compare with the page's own date); `setSimTime` near 2050 + play → pauses at the
    limit with the message.
  - **AC-9:** reduced motion → paused at open; Play starts it.

  covers: AC-6–AC-9

  **Result (2026-10-05):** 7 tests (mouse, keyboard incl. ArrowDown on the select, touch tap, the date, today by
  the page's clock, the 2050 limit, reduced motion); speeds measured over 1 s of page time. The limit test was
  sabotage-checked (no announcement → fails).

- [x] **T041** — `solar-system-time.spec.ts`, motion:
  - **AC-4:** body orientation (via `bodies()`) changes with time at a slow speed and holds above one turn per
    second.
  - **AC-10:** markers within 4 px while time runs; re-centre on Earth + play → Earth stays centred; a pan stops
    following.
  - **AC-11:** orbit lines drawn at both scales (non-background pixels along Neptune's ring).

  covers: AC-4, AC-10, AC-11

  **Result (2026-10-05):** 4 tests; camera, bodies and markers read in one task so moving bodies and markers agree;
  Neptune's path computed in Node from `orbit.ts`. `bodies()` now reports each body's quaternion. Found a bug: markers
  skipped re-projecting while the camera was still, so they lagged moving bodies (12 px at 1 year/s) — fixed with
  `markers.invalidate()` after each re-placement; the unit test now runs with a still camera. Both motion tests
  sabotage-checked (no invalidation; no following). The 020 stillness E2E now waits a frame after pausing.
  766 unit + 156 E2E green.

- [x] **T042** — `solar-system-time.spec.ts`, lifecycle:
  - **AC-12:** 10 round trips back to the baseline (DOM minus `.loading-announcer`, GPU memory); lose → restore
    keeps date, speed and play state; a fresh visit starts at today, 1 week/s.

  covers: AC-12

  **Result (2026-10-05):** 3 tests in the time spec (loss while paused: exact state; loss while playing: continues;
  fresh visit: today, 1 week/s). The 020 round-trip test now leaves with time playing and checks `.solar-bar` /
  `.time-controls` are gone; its memory baseline covers the orbit lines. Restore tests sabotage-checked (an
  unusable saved state → both fail). 766 unit + 159 E2E green.

## Docs & Verify

- [x] **T090** — `specs/architecture.md`:
  - simulated time and its range;
  - the orbit maths and frames;
  - stylised per-date placement;
  - orbit lines;
  - following;
  - the core seams (`startTime`, `saveState`/`savedState`);
  - the `follow` controls API;
  - the seams table;
  - Tab order.
- [x] **T091** — `npm run check`, `npm run test:e2e`, `npm run build` all green. Record the entry size (AC-13) and
      the Space's size; a manual FPS note with the renderer string; a warning probe with the E2E flags.
- [x] **T092** — Tick ACs in `spec.md` (Status `Implemented`), set `roadmap.md` 021 ✔️, update
      `memory/progress.md`, `memory/MEMORY.md` and `memory/learnings.md`.

## AC coverage

| AC    | Tasks                              |
| ----- | ---------------------------------- |
| AC-1  | T002, T010, T012, T013             |
| AC-2  | T012–T014                          |
| AC-3  | T002, T010, T012, T013             |
| AC-4  | T010, T012, T013, T020, T031, T041 |
| AC-5  | T011, T014, T020, T031             |
| AC-6  | T011, T030, T031, T040             |
| AC-7  | T030, T040                         |
| AC-8  | T011, T023, T030, T031, T040       |
| AC-9  | T031, T040                         |
| AC-10 | T022, T031, T041                   |
| AC-11 | T021, T031, T041                   |
| AC-12 | T023, T031, T042                   |
| AC-13 | T001, T091                         |

## Verification (2026-10-06)

- **T090:** `specs/architecture.md`: contract (`startTime`, `savedState`, `saveState`, `simTime`/`setSimTime`,
  `bodies()` quaternion), Time, SpaceManager start time and saved state, controls `follow`, seams, Solar System
  (time, orbit maths, placement, orbit lines, per-frame order, following, markers `invalidate`, time controls, Tab
  order, budget); the planned section narrowed to 022–023.
- **T091:** `npm run check` 766 unit, `npm run test:e2e` 159, `npm run build` OK. Entry 146.6 KB gzipped (+0.1 KB,
  cap 5 KB); Space 17.3 KB, 0.02 MB. Gate-5 probe on the production build with the E2E flags (time at 1 year/s,
  both scales, re-centre and follow, backwards, 3 round trips, context loss): no warnings or errors;
  `__WORLD__` absent. 60.2 fps at both scales on "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)),
  SwiftShader driver)": software rendering, a floor below a mid-range laptop GPU.
- **T092:** 13 ACs ticked, spec Implemented, roadmap 021 ✔️, memory updated.
