# 001 — Space Framework · Tasks

**Plan:** `./plan.md` (Approved)
Legend: `[P]` = can run in parallel with the previous task. Each task lists files and the proving test.
Test-first: each "tests" task must fail before its paired implementation task makes it pass.

## Setup

- [x] **T001** — Space contract types: `SpaceMeta`, `SpaceContext`, `SpaceInstance` (with optional `render?()`), `SpaceFactory`, `RendererLike`, `OpenResult`.
      files: `src/core/types.ts` · test: `npm run typecheck` · covers: AC-1, AC-11 (type)
- [x] **T002** [P] — Test build mode: `build.manifest: true` in Vite; `build:test` script (`tsc --noEmit && vite build --mode test`); Playwright web server uses `build:test`.
      files: `vite.config.ts`, `package.json`, `playwright.config.ts` · test: existing `npm run test:e2e` still green

## Time & Loop

- [x] **T010** — Tests for `Clock`: delta/elapsed from timestamps, `reset()` gives delta 0, delta clamped to 0.1 s, identical tick sequences → identical output; `FakeClock.step()`.
      files: `tests/unit/core/clock.test.ts` · covers: AC-7
- [x] **T011** — Implement `createClock()` and `FakeClock`.
      files: `src/core/clock.ts` · test: T010
- [x] **T012** [P] — Tests for `RenderLoop` with fake `Scheduler` + fake `VisibilitySource`: start schedules frames; `hidden` stops scheduling; `visible` resumes with clock reset (delta 0); `stop()` cancels and removes listener.
      files: `tests/unit/core/render-loop.test.ts` · covers: AC-6
- [x] **T013** — Implement `RenderLoop`.
      files: `src/core/render-loop.ts` · test: T012

## Shared & UI Helpers

- [x] **T014** [P] — Tests for `disposeObject3D`: disposes geometries, single and array materials, and every `Texture` property on materials; handles nested children; no double-dispose of shared geometry.
      files: `tests/unit/shared/dispose.test.ts`
- [x] **T015** — Implement `disposeObject3D`.
      files: `src/shared/dispose.ts` · test: T014
- [x] **T016** [P] — Tests for `Fader` (fake timers): `out()` resolves after ~300 ms and sets opacity 1; `in()` resolves and sets opacity 0; `reducedMotion` resolves immediately with no transition.
      files: `tests/unit/ui/fader.test.ts` · covers: AC-10
- [x] **T017** — Implement `Fader` + overlay/fader CSS.
      files: `src/ui/fader.ts`, `src/styles/main.css` · test: T016
- [x] **T018** [P] — Overlay messages "Space not found" / "Failed to load" with `role="alert"` + `clearMessage()`; test and implementation together (small).
      files: `src/ui/messages.ts`, `tests/unit/ui/messages.test.ts` · covers: AC-8 (UI)

## Engine

- [x] **T020** — Tests for `Engine` with fake `RendererLike` and real `Scene`/`PerspectiveCamera`: frame calls `update(delta, elapsed)` then `renderer.render`; instance with `render()` → custom render called, `renderer.render` not; no instance → `renderer.clear()`; resize sets renderer size and calls `instance.resize(w, h)`; `setInstance` triggers an immediate resize of the new instance.
      files: `tests/unit/core/engine.test.ts` · covers: AC-11, AC-5 (unit part)
- [x] **T021** — Implement `Engine` (renderer setup, pixel-ratio cap, `ResizeObserver` on container, overlay element, loop wiring, `setInstance`, `dispose`).
      files: `src/core/engine.ts` · test: T020

## Registry & demo-cube

- [x] **T022** — Tests: registry ids unique and URL-safe, `findSpace()` hit/miss; demo-cube factory builds a scene with a mesh and lights from a fake context; two instances stepped with identical `FakeClock` sequences have equal rotation; `dispose()` frees its geometry, material, and `DataTexture`.
      files: `tests/unit/spaces/registry.test.ts`, `tests/unit/spaces/demo-cube.test.ts` · covers: AC-1, AC-7, AC-9 (unit part)
- [x] **T023** — Implement registry and demo-cube Space (config object, `DataTexture`, rotation = `elapsed * speed`, `resize` updates camera aspect).
      files: `src/spaces/registry.ts`, `src/spaces/demo-cube/index.ts` · test: T022

## Space Manager

- [x] **T024** — Tests for `SpaceManager` with fake engine, fake fader, and fake registry loaders:
  - loader not called until `open()` (AC-2)
  - call order: `fader.out` → `load` → `A.dispose` → factory(B) → `setInstance(B)` → `fader.in` (AC-3, AC-10)
  - `signal` aborted before `dispose()`
  - rapid `open(A)`, `open(B)`, `open(C)` → only C active, superseded instances disposed, results `'superseded'`
  - `open('nope')` → `'not-found'`, alert shown, no throw (AC-8)
  - loader rejects → `'load-error'`, alert shown, no throw
  - `close()` disposes active and sets no instance
  - `body[data-space-ready]` removed at start, set (with `data-space-id`) when opened
    files: `tests/unit/core/space-manager.test.ts` · covers: AC-2, AC-3, AC-8, AC-10
- [x] **T025** — Implement `SpaceManager`.
      files: `src/core/space-manager.ts` · test: T024

## Integration

- [x] **T030** — Debug hook `window.__WORLD__` (`open`, `close`, `activeId`, `memory`, `cameraAspect`) installed only when `import.meta.env.MODE !== 'production'`; unit test for install/no-install.
      files: `src/core/debug.ts`, `tests/unit/core/debug.test.ts`
- [x] **T031** — Rewire `main.ts`: WebGL check → `Engine` (`preserveDrawingBuffer` in test mode) → `SpaceManager` → open `?space=<id>` or `demo-cube`; set `data-space-ready` after first rendered frame.
      files: `src/main.ts` · test: `npm run dev` manual + T033
- [x] **T032** [P] — Bundle check script: reads `dist/.vite/manifest.json`; asserts each registry Space is a dynamic chunk, not in the entry; entry JS ≤ 250 KB gzipped; production entry does not contain `__WORLD__`. `build` script runs it.
      files: `scripts/check-bundle.mjs`, `package.json` · test: `npm run build` passes; covers: AC-2 (build part), NFR budget
- [x] **T033** — E2E tests:
  - AC-9: `?space=demo-cube` → `data-space-id="demo-cube"`, canvas has >1 distinct colour, no console errors
  - AC-4: baseline `memory()` after `close()`, 10× `open`/`close`, geometries/textures equal baseline
  - AC-5: `setViewportSize` → canvas matches viewport, `cameraAspect()` ≈ w/h
  - AC-10: with `reducedMotion: 'reduce'` switch completes immediately; default switch shows fader opacity > 0 mid-transition
  - unknown id `?space=nope` → alert visible, no page errors (AC-8 e2e)
  - update `smoke.spec.ts` to wait for `data-space-id`
    files: `tests/e2e/space-framework.spec.ts`, `tests/e2e/smoke.spec.ts` · covers: AC-4, AC-5, AC-8, AC-9, AC-10

## Docs

- [x] **T040** [P] — Update architecture: `render?()` hook, `Clock`/`RenderLoop`/`Engine`/`SpaceManager` split, ordering guarantee, test-mode debug hook.
      files: `specs/architecture.md`

## Verify

- [x] **T090** — `npm run check`, `npm run build` (with bundle check), `npm run test:e2e` all green; coverage ≥ 80 % for `src/core`, `src/shared`, `src/ui` (`npm run test:coverage`).
- [x] **T091** — Tick AC-1…AC-11 in `spec.md`, set Status `Implemented`, roadmap ✔️, `memory/progress.md` entry, update `memory/MEMORY.md` (`/spec-verify 001`).

## AC Coverage

| AC    | Tasks            |
| ----- | ---------------- |
| AC-1  | T001, T022       |
| AC-2  | T024, T032       |
| AC-3  | T024             |
| AC-4  | T015, T033       |
| AC-5  | T020, T033       |
| AC-6  | T012             |
| AC-7  | T010, T022       |
| AC-8  | T018, T024, T033 |
| AC-9  | T022, T033       |
| AC-10 | T016, T024, T033 |
| AC-11 | T001, T020       |
