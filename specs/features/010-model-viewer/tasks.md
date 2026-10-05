# 010 — Model Viewer Space · Tasks

**Plan:** `./plan.md` (Approved)
Legend: `[P]` = can run in parallel with the previous task. Each task lists files and the proving test.
Test-first: each "tests" task must fail before its paired implementation task makes it pass.
Every task leaves `npm run check` **and** `npm run test:e2e` green.
Baseline for the size NFR: entry 134.9 KB gzipped (from 005); allowed growth ≤ 10 KB (D-013).

## Spike & asset

- [x] **T001** — **Entry-size spike.** Add a throwaway lazy chunk that imports `GLTFLoader` and
      `RoomEnvironment`, then run `npm run build` and note the entry growth. Remove the chunk afterwards.
  - **≤ 1 KB:** carry on.
  - **> 1 KB:** **stop**. Propose the NFR amendment (spec Changelog plus a decision entry), and continue only
    once it is approved.

  files: temporary only · covers: NFR (performance) risk

  **Result (2026-10-05):** entry 134.9 → 143.2 KB gzipped (**+8.3 KB**); the GLTFLoader code itself (~12 KB gz)
  stays in the lazy chunk. Over 1 KB → NFR amended to ≤ 10 KB (D-013, approved).

- [x] **T002** — **Asset.**
  1. Download `SheenChair.glb` once from the Khronos glTF-Sample-Assets repository (official GitHub) into
     `public/assets/sheen-chair/`.
  2. Check the size (≤ 5 MB) and the licence (CC0 1.0, Wayfair / Eric Chadwick). DamagedHelmet was
     rejected here: it is also CC-BY-NC (D-014).
  3. Add the `CREDITS.md` row.

  files: `public/assets/sheen-chair/SheenChair.glb`, `public/assets/CREDITS.md` · covers: AC-12,
  AC-13 (data)

## Framing maths (pure, test-first)

- [x] **T010** — Framing tests:
  - **`frameDistance`:**
    - at aspect 16:9 the sphere fills `fill` of the height;
    - at 1:2 portrait it fills `fill` of the width;
    - fill 0.75 lands the sphere's projected diameter at 75 % (±1 %);
    - the distance grows as fill shrinks.
  - **`distanceLimits`:** `min = 1.2 r`; `max` gives a 10 % fill; `min < home < max` for fill 0.75 at the
    test aspects.
  - **`fitModel`:** centres an off-origin mesh on the origin and returns its bounding-sphere radius.

  files: `tests/unit/shared/model-viewer/framing.test.ts` · covers: AC-2, AC-5

- [x] **T011** — Implement `framing.ts` and `types.ts`. files: `src/shared/model-viewer/framing.ts`,
      `src/shared/model-viewer/types.ts` · test: T010

## Controls additions (004 API, additive)

- [x] **T020** [P] — Controls tests:
  - **`userMoved`:**
    - false at start, and stays false while the turntable runs;
    - true after a keyboard orbit or a pointer `start`;
    - `reset()` clears it.
  - **`setHome()`:**
    - updates min/max distance and pan limit;
    - moves the camera to the new position when not moved, and leaves it when moved;
    - a later `reset()` returns to the new home.

  files: `tests/unit/shared/controls/camera-controls.test.ts` · covers: AC-3, AC-5

- [x] **T021** — Implement `userMoved` and `setHome()`. demo-cube is unchanged; its controls tests and E2E
      stay green. files: `src/shared/controls/index.ts`, `src/shared/controls/types.ts` · test: T020

## Loading indicator (core)

- [x] **T030** [P] — Loading indicator UI tests:
  - `show(label)` renders one `role="status"`, `aria-live="polite"` element with text "Loading <label>…" in
    the container;
  - `hide()` removes it;
  - a repeated `show` replaces;
  - `dispose()` cleans up.

  files: `tests/unit/ui/loading.test.ts` · covers: AC-8

- [x] **T031** — Implement `createLoadingIndicator`; CSS `.loading` at z 3 with a pulse that is off under
      reduced motion. files: `src/ui/loading.ts`, `src/styles/main.css` · test: T030
- [x] **T032** — SpaceManager loading tests (fake timers):
  - nothing is shown when the open finishes under 250 ms;
  - `show(title)` after 250 ms of load + factory (registry title for Spaces; the view label for the gallery);
  - `hide()` on opened, not-found, load-error, superseded and `suspend()`;
  - no `loading` option → no change.

  files: `tests/unit/core/space-manager.test.ts` · covers: AC-8

- [x] **T033** — Implement in `SpaceManager` (`loading?`, `loadingDelayMs?`); wire the indicator in `main.ts`.
      files: `src/core/space-manager.ts`, `src/main.ts` · test: T032

## Model viewer (shared)

- [x] **T040** — Viewer tests, with a stub loader returning a scene with an off-centre textured mesh and a fake
      renderer that supports a PMREM stub:
  - **Factory:**
    - loads `BASE_URL + path`;
    - centres the model;
    - sets `scene.environment` and keeps `scene.background` null;
    - camera direction from config; distance = `frameDistance`; near/far from `r`;
    - controls label = title;
    - credit line in the overlay naming the title, author and licence.
  - **Resize:**
    - re-frames when not moved;
    - keeps the pose when moved;
    - Reset returns to the new home.
  - **`dispose()`:** frees the geometries, textures and environment, and removes the credit line.
  - **Loader rejects:** the factory rejects and allocates nothing (no environment, no DOM).

  files: `tests/unit/shared/model-viewer/viewer.test.ts` · covers: AC-2, AC-3, AC-9, AC-10, AC-13

- [x] **T041** — Implement `createModelViewer` and `credit.ts`; CSS `.model-credit` (bottom-left, clear of the
      controls bar, readable contrast). files: `src/shared/model-viewer/index.ts`,
      `src/shared/model-viewer/credit.ts`, `src/styles/main.css` · test: T040

## The Space

- [x] **T050** — Space data tests:
  - **Config validates:** path under `assets/`, non-empty title and description, FOV in (10°, 100°),
    non-zero direction, turntable values > 0.
  - **Credits:** every `assets[].path` exists under `public/` and has a `CREDITS.md` row with a matching
    author and an allowed licence.

  files: `tests/unit/spaces/sheen-chair.test.ts` · covers: AC-13, AC-14

- [x] **T051** — Implement `data.ts` + `index.ts`; register `sheen-chair` first in the registry. Update any
      gallery/registry tests that assume demo-cube is the only or first entry.
      files: `src/spaces/sheen-chair/*`, `src/spaces/registry.ts` · test: T050, existing gallery tests

## Budget rule

- [x] **T060** [P] — 5 MB rule tests:
  - a Space whose lazy chunks (gzipped) plus `public/assets/<id>/` exceed 5 MB → error naming the Space and
    its size;
  - under the limit → no error;
  - a Space with no asset folder → code size only.

  files: `tests/unit/scripts/bundle-checks.test.ts` · covers: AC-12

- [x] **T061** — Implement the rule in `bundle-checks.mjs` and run it from `check-bundle.mjs` (print each
      Space's total). files: `scripts/bundle-checks.mjs`, `scripts/check-bundle.mjs` · test: T060

## End-to-end

- [x] **T070** — `contentBounds(page)` helper in fixtures (bounding box of pixels that differ from the
      background corner pixel, and the fill of the smaller dimension). It needs a positive check: demo-cube
      reads > 0.3, and a blank canvas reads 0. files: `tests/e2e/fixtures.ts` · test: used by T071
- [x] **T071** — E2E: show, frame, light:
  - **Gallery card:** title, description and placeholder, with the chair listed first.
  - **Open:** ready, coverage > 0.05, clean console (AC-1).
  - **Framing:** fill in [0.5, 0.9] at 1280×720, 768×1024 and 320×640 with reduced motion (AC-2).
  - **Resize:** re-frame on resize; drag → resize keeps the pose; Reset re-frames (AC-3).
  - **Lighting:** luminance above the threshold at 0°, 90°, 180° and 270° (AC-4).

  files: `tests/e2e/model-viewer.spec.ts` · covers: AC-1, AC-2, AC-3, AC-4

- [x] **T072** — E2E: explore and accessibility:
  - **Zoom limits:** fully in stays outside the model; fully out stops at the 10 % bounding-sphere distance (D-016).
  - **Controls:** hint, "?" help, Reset and keyboard present.
  - **Reduced motion:** pose still for 600 ms.
  - **Accessible name:** the canvas `aria-label` names "Sheen Chair".
  - **Credit line:** visible with author and licence.

  files: `tests/e2e/model-viewer.spec.ts` · covers: AC-5, AC-6, AC-7, AC-13

- [x] **T073** — E2E: loading, failure, lifecycle:
  - **Loading:** GLB delayed by 1.5 s → `role=status` "Loading Sheen Chair…" shows, then goes once ready
    (AC-8).
  - **Failure:** GLB request aborted → "Failed to load", back link works, only the expected logged error
    (AC-9).
  - **Memory:** 10 round trips back to the baseline (AC-10).
  - **Context loss:** lose → restore → framed and lit (AC-11).
  - **Same origin:** every request made while opening is same-origin (AC-12).

  files: `tests/e2e/model-viewer.spec.ts` · covers: AC-8, AC-9, AC-10, AC-11, AC-12

## Docs & Verify

- [x] **T090** — Update `specs/architecture.md`:
  - model viewer section (shared viewer, framing, environment, credit);
  - loading indicator in the open sequence;
  - stacking (`.loading` z 3);
  - layout;
  - seams (stub loader, `contentBounds`).

  Update `specs/tech-stack.md` if anything about loaders changed.

- [x] **T091** — `npm run check`, `npm run test:e2e`, `npm run build` all green; record entry and Space sizes.

  **Result (2026-10-05):** 379 unit + 90 E2E green; Prettier clean. Entry **144.8 KB** gzipped (+9.9 KB vs 005,
  within the ≤ 10 KB NFR, D-013; 250 KB budget). sheen-chair: 21.2 KB code + 3.93 MB assets (≤ 5 MB);
  demo-cube: 7.0 KB. `__WORLD__` absent from the production build.

- [x] **T092** — Tick ACs in `spec.md` (Status `Implemented`), set `roadmap.md` 010 ✔️, update
      `memory/progress.md`, `memory/MEMORY.md` and `memory/learnings.md`.

## AC coverage

| AC    | Tasks                        |
| ----- | ---------------------------- |
| AC-1  | T051, T071                   |
| AC-2  | T010, T011, T040, T041, T071 |
| AC-3  | T020, T021, T040, T041, T071 |
| AC-4  | T041, T071                   |
| AC-5  | T010, T020, T021, T072       |
| AC-6  | T072                         |
| AC-7  | T072                         |
| AC-8  | T030–T033, T073              |
| AC-9  | T040, T041, T073             |
| AC-10 | T040, T073                   |
| AC-11 | T073                         |
| AC-12 | T002, T060, T061, T073       |
| AC-13 | T002, T040, T050, T072       |
| AC-14 | T050, T051                   |
