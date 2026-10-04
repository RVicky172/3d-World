# Progress Log

Newest first. One entry per working session.

```
## YYYY-MM-DD — <feature id or "chore">
**Done:** …
**Next:** …
**Blockers:** …
```

---

## 2026-10-04 — 001-space-framework (T090–T091) ✔️ Implemented

**Done:** Verified Definition of Done: `npm run check` (105 unit tests), `npm run build` + bundle check (entry 130.3 KB gz, demo-cube lazy, no `__WORLD__`), `npm run test:e2e` (7 tests), Prettier clean. Coverage: lines 96.6 % total; core 93.7 %, shared/ui 100 %. Added `prefersReducedMotion` unit tests (was the only untested branch of note). Ticked AC-1…AC-11, spec → Implemented, roadmap 001 → ✔️.
**Next:** `/spec-new` for 002 — hash router & deep links.
**Blockers:** none

## 2026-10-04 — 001-space-framework (T040)

**Done:** Rewrote `specs/architecture.md` to match the implementation: directory layout, contract with `render?()`, time model (Space time, clamped delta, reset on resume), Engine frame/resize rules, SpaceManager open sequence + supersession + error handling, Fader, disposal rules, testability seams table, `__WORLD__` hook.
**Next:** `/spec-verify 001`.
**Blockers:** none

## 2026-10-04 — 001-space-framework (T032–T033)

**Done:** `scripts/bundle-checks.mjs` (pure checks: Spaces are lazy chunks, entry ≤ 250 KB gz, no `__WORLD__` in prod) + `scripts/check-bundle.mjs` run by `npm run build`; tsconfig now type-checks `scripts/`. E2E: `tests/e2e/fixtures.ts` (auto console-error check, helpers), `space-framework.spec.ts` covering AC-4, AC-5, AC-8, AC-9, AC-10 (incl. reduced motion); smoke test updated. Mutation-checked AC-4 (leak detected). 102 unit + 7 E2E green; entry 130.3 KB gz.
**Next:** T040 architecture doc, then verify.
**Blockers:** none

## 2026-10-04 — 001-space-framework (T030–T031)

**Done:** `src/core/debug.ts` (`installDebugHook` → `window.__WORLD__`: open/close/activeId/memory/cameraAspect; skipped in production). `src/main.ts` rewired: WebGL check → `WebGLRenderer` (clear colour from CSS `--bg`, `preserveDrawingBuffer` in test builds) → `Engine` → `Fader` (starts covered) → `SpaceManager` → open `?space=` or demo-cube. `Fader` gained `covered` and same-direction waiting. Verified manually: prod entry 134 KB gz with no `__WORLD__`; demo-cube is a separate 0.9 KB chunk. 10 new tests; 95 unit + 1 E2E green.
**Next:** T032–T033 — bundle check script, E2E suite.
**Blockers:** none

## 2026-10-04 — 001-space-framework (T024–T025)

**Done:** `src/core/space-manager.ts` — `SpaceManager` with `open(id)` (fade out → load → dispose previous → create → setInstance → nextFrame → fade in), sequence-token supersession, not-found/load-error messages, `close()`, `<body>` status attributes. 14 new tests (ordering, rapid switching, stale-instance disposal, errors, close-during-open); 85 total green. Decision D-006: failed opens close the current Space; added `data-space-status`.
**Next:** T030–T031 — debug hook and `main.ts` wiring.
**Blockers:** none

## 2026-10-04 — 001-space-framework (T022–T023)

**Done:** `src/spaces/registry.ts` (`spaces` with lazy `import()` loaders, `findSpace`). `src/spaces/demo-cube/index.ts` (data-driven `DEMO_CUBE` config, checkerboard `DataTexture`, rotation = elapsed × speed, slower with reduced motion, `disposeObject3D` on dispose). Plan/tasks: `CanvasTexture` → `DataTexture` (jsdom has no 2D canvas). 12 new tests; 71 total green.
**Next:** T024–T025 — SpaceManager.
**Blockers:** none

## 2026-10-04 — 001-space-framework (T020–T021)

**Done:** `src/core/engine.ts` — `Engine<R extends RendererLike>`: mounts canvas + `.overlay`, pixel ratio capped at 2, injectable `ResizeWatcher` (default `ResizeObserver`), `setSize(w,h,false)`, per-frame update → custom `render()` or `renderer.render` (AC-11), clear when empty, `setInstance` sizes new instance, `nextFrame()` promise, `dispose()` (does not dispose Spaces). Extracted shared fakes to `tests/helpers/fakes.ts`. 14 new tests; 59 total green.
**Next:** T022–T023 — registry + demo-cube.
**Blockers:** none

## 2026-10-04 — 001-space-framework (T014–T018)

**Done:** `src/shared/dispose.ts` (`disposeObject3D`: geometries, material arrays, material + uniform textures, scene background/environment, shared resources once). `src/ui/fader.ts` (`Fader`, 300 ms opacity fade, instant with reduced motion, timer-based). `src/ui/messages.ts` (`showMessage`/`clearMessage`, `role=alert`, text-only). CSS stacking: canvas → `.fader` → `.overlay`. 19 new unit tests; 45 total green; E2E green.
**Next:** T020–T021 — Engine.
**Blockers:** none

## 2026-10-04 — 001-space-framework (T010–T013)

**Done:** `src/core/clock.ts` (`createClock`, `FakeClock`, delta clamped to 0.1 s; `elapsed` is Space time = sum of clamped deltas) and `src/core/render-loop.ts` (`RenderLoop` with injectable `Scheduler`/`VisibilitySource`; pauses when hidden, resumes with delta 0). 17 new unit tests; 26 total green. Plan interface: `Clock.reset()` takes no argument.
**Next:** T014–T018 — disposeObject3D, Fader, overlay messages.
**Blockers:** none

## 2026-10-04 — 001-space-framework (T001–T002)

**Done:** Resolved 001 open questions (fade, opt-in render hook) → spec Approved; wrote plan.md + tasks.md (24 tasks). T001: Space contract in `src/core/types.ts` with compile-time tests (`tests/unit/core/types.test.ts`). T002: `build:test` script (Vite `--mode test`), `build.manifest: true`, Playwright serves the test build.
**Next:** T010–T013 — Clock and RenderLoop, test-first.
**Blockers:** none

## 2026-10-04 — 000-foundation

**Done:** Created `specs/` (constitution, roadmap, tech stack, architecture, workflow, testing strategy, memory management, templates). Scaffolded Vite + TS + Three.js with ESLint, Prettier, Vitest, Playwright. Placeholder scene + WebGL fallback. Drafted spec 001-space-framework. Added `CLAUDE.md`, `memory/`, and `/spec-*` slash commands. Initialised git.
**Next:** Human reviews/approves `specs/features/001-space-framework/spec.md` (2 open questions), then `/spec-plan 001`.
**Blockers:** none
