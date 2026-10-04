# Progress Log

Newest first. One entry per working session.

```
## YYYY-MM-DD — <feature id or "chore">
**Done:** …
**Next:** …
**Blockers:** …
```

---

## 2026-10-04 — 004-camera-controls ✔️ Implemented

**Done:** Definition of Done verified:

- `npm run check` (293 unit), exit 0;
- `npm run build` + bundle check: entry 134.2 KB gzipped (+1.4 KB vs 003; amended NFR ≤ 1.5 KB, D-010), demo-cube chunk 6.9 KB;
- `npm run test:e2e` (61 incl. touch and sub-path), no console errors;
- Prettier clean.

Coverage: total 98 % lines; `src/shared/controls/*` 100 %. Ticked AC-1…AC-13, spec → Implemented, roadmap 004 → ✔️. 60 FPS not measured (no GPU in CI).
**Next:** commit 004; `/spec-new` for 005.
**Blockers:** none

## 2026-10-04 — 004-camera-controls (T040)

**Done:** `specs/architecture.md`: status, `src/shared/controls/` in layout, `focusTarget` in the contract, focus restore in the open sequence, DOM vs stacking order, new **Focus Management** and **Camera Controls** sections, seams rows (controls unit, CDP touch), `cameraPose` in the debug hook. OrbitControls quirks were already in learnings (T016).
**Next:** `/spec-verify 004`.
**Blockers:** none

## 2026-10-04 — 004-camera-controls (T030–T031)

**Done:** `tests/e2e/controls.spec.ts`, 21 tests:

- mouse orbit, zoom and pan (right-drag and Shift+drag);
- keyboard only while the canvas has focus, with a focus ring and accessible name;
- zoom and pan limits (cube stays on screen);
- reset by `R` and by the button;
- no controls on the gallery;
- 10 enter/leave cycles leave nothing behind;
- the UI never moves the camera, and Tab order is back → 3D view → ? → reset;
- hint (interaction and timeout), help panel with Esc;
- resize keeps the view;
- AC-13 focus round trip, and no focus on first load;
- CDP multi-touch (orbit, pinch, two-finger pan, no page scroll);
- no inertia / no auto motion under reduced motion; turntable while idle; glide after a flick; turntable waits after interaction.

Fixtures gained `cameraPose`, `rotationBetween`, `distanceBetween`, `radius` and `touchGesture`. Fixed one test bug (wheel landed on the canvas after a drag). Timing tests stable at 5× repeat. 293 unit + 61 E2E green.
**Next:** T040 docs, then verify.
**Blockers:** none

## 2026-10-04 — 004-camera-controls (T020–T023)

**Done:**

- T020: back link prepended (Tab order).
- T021: `__WORLD__.cameraPose()`.
- T022: demo-cube adopts `createCameraControls`. Self-rotation removed; camera starts ~23° up so the top face shows; the turntable is deterministic by delta; `prefersCoarsePointer()` helper.
- T022 surfaced two issues, both decided by the user (D-010):
  - lost keyboard focus after activating a card → new **AC-13** + **T023**: `SpaceInstance.focusTarget()`; SpaceManager restores lost focus (never on first view, never from a visible focused element); gallery returns the card just left (else a `tabindex=-1` heading); demo-cube returns the 3D view. 003's AC-7 E2E updated.
  - entry +1.4 KB (three core classes shared with lazy chunks) → NFR amended 0.5 → 1.5 KB.
- Screenshots checked (desktop, help panel, 360 px phone); help-panel columns aligned.

293 unit + 40 E2E green. demo-cube chunk 6.9 KB gzipped.
**Next:** T030–T031 controls E2E.
**Blockers:** none

## 2026-10-04 — 004-camera-controls (T010–T016)

**Done:** `src/shared/controls/`:

- `keyboard.ts`: `keyAction` mapping; `orbitStep`, `zoomStep`, `panStep`.
- `turntable.ts`: delta-driven idle state.
- `controls-ui.ts`: hint (aria-live, 4 s of Space time), "?" disclosure panel with Esc, "Reset view".
- `index.ts`: `createCameraControls` wrapping OrbitControls — limits incl. `cursor`/`maxTargetRadius` pan clamp, damping/turntable off under reduced motion, focus-scoped keys, canvas a11y attributes, reset flush, full dispose.
- CSS for the controls UI and the canvas focus ring.

62 new unit tests; 279 unit + 40 E2E green. The easing check moved to T031 (damping doesn't apply to zoom).
**Next:** T020–T022 integration.
**Blockers:** none

## 2026-10-04 — 003-gallery ✔️ Implemented

**Done:** Definition of Done verified: `npm run check` (217 unit), `npm run build` + bundle check (132.8 KB gz, +2.0 KB vs 002; NFR ≤ 5 KB), `npm run test:e2e` (40 incl. 3 `subpath`), Prettier clean, no console errors. Coverage total 97.2 % lines; gallery/router/back-link 95–100 %, space-manager 98.6 %. Ticked AC-1…AC-13, spec → Implemented, roadmap 003 → ✔️. NFRs not measured: 60 FPS backdrop and 1 s interactivity (no GPU in CI), argued by design.
**Next:** commit 003; `/spec-new` for 004 camera controls.
**Blockers:** none

## 2026-10-04 — 003-gallery (T040)

**Done:** `specs/architecture.md`: View concept (gallery vs Space), Gallery concept, `src/gallery/` + back link in layout, "Opening a View" with `openView`/`data-view`/`activeView`, new stacking order, routing home = gallery with route keys, new Gallery section, warm-up note in Disposal Rules, gallery seam row.
**Next:** `/spec-verify 003`.
**Blockers:** none

## 2026-10-04 — 003-gallery (T031)

**Done:** `tests/e2e/gallery.spec.ts` — 17 tests for AC-1–AC-11 and AC-13: cards/content/placeholder, click and Enter open with one history entry, no Space chunk until opened, 10-trip GPU baseline, back link per screen and keyboard, titles, roles/focus outline, 360 px single column / 1280 px multi-track grid, WCAG contrast ≥ 4.5 computed in-page, z-order fader > overlay, gallery swapped only under full cover (MutationObserver), starfield drawn/drifting/still under reduced motion. Found three's DFG LUT texture (+1 once, renderer-owned): baseline now taken after a warm-up visit; AC-6 clarified in spec changelog; mutation-checked (gallery dispose off → 12 vs 2 geometries). 217 unit + 40 E2E green.
**Next:** T040 docs, then verify.
**Blockers:** none

## 2026-10-04 — 003-gallery (T020–T023, T030)

**Done:** SpaceManager: shared `mount()` behind `open(id)` and new `openView(name, factory)`; `ViewName`, `activeView`; `data-view` set at request start; not-found counts as a Space screen. Router: `openGallery` replaces `defaultSpaceId`, route keys `gallery`/`space/<id>`, gallery title `3D World`. main.ts wires the gallery view + back link. CSS stacking canvas → overlay → fader → back link. Updated 8 E2E tests that assumed home = demo-cube; 002 spec changelog notes AC-5 superseded. T023 was merged into T030 (the bridge could not keep E2E green). Visual check via screenshots (desktop, 360 px, in-Space). 217 unit + 23 E2E green.
**Next:** T031 gallery E2E, T040 docs, verify.
**Blockers:** none

## 2026-10-04 — 003-gallery (T010–T015)

**Done:** `src/gallery/starfield.ts` (1500 seeded points, 1 draw call, no texture, drift = elapsed × speed, still with reduced motion; `sizeAttenuation: false` so far stars stay visible). `src/gallery/cards.ts` (heading + list of card links via `formatRoute`, kind labels, initials, base-aware `thumbnailUrl`, lazy decorative img with placeholder fallback on error, inline-SVG kind icons). `src/gallery/index.ts` (`createGalleryView` factory: cards in overlay, starfield in scene, full dispose). `src/ui/back-link.ts` + CSS (hidden on `data-view=gallery`). Gallery CSS with solid `--surface`/`--border` tokens. 33 new tests; 206 unit + 23 E2E green.
**Next:** T020–T023 core changes.
**Blockers:** none

## 2026-10-04 — 002-hash-router ✔️ Implemented

**Done:** Definition of Done verified: `npm run check` (173 unit), `npm run build` + bundle check (130.8 KB gz, +0.5 KB vs 001), `npm run test:e2e` (23 incl. 3 `subpath`), Prettier clean, no console errors. Coverage: routes.ts/router.ts/debug.ts 100 % lines, total 97 %. Ticked AC-1…AC-12, spec → Implemented, roadmap 002 → ✔️.
**Next:** commit 002; `/spec-new` for 003 gallery (redefines home route).
**Blockers:** none

## 2026-10-04 — 002-hash-router (T030)

**Done:** `specs/architecture.md`: HashRouter concept, routes.ts/router.ts in the layout, new Routing section (grammar, router rules, startup), seams table rows for `FakeBrowserLocation` and the `subpath` project, `navigate` in `__WORLD__`; removed `?space=` references.
**Next:** `/spec-verify 002`.
**Blockers:** none

## 2026-10-04 — 002-hash-router (T021–T022)

**Done:** `tests/e2e/router.spec.ts` — 13 tests for AC-1–6, 8–10, 12 (no-reload marker, real Back/Forward, MutationObserver re-open detector + its own positive test, spaced rapid changes). Sub-path: Playwright now runs two web servers; `subpath` project builds with `VITE_BASE=/3d-World/` into `dist-subpath/` (port 4174), `subpath.spec.ts` verifies deep link, chunk path under the base, not-found, home. Replaced the flaky colour-count check with `canvasCoverage()` (+ blank guard); 15/15 repeats stable. 173 unit + 23 E2E green.
**Next:** T030 architecture doc, then verify.
**Blockers:** none

## 2026-10-04 — 002-hash-router (T015, T020)

**Done:** Debug hook gains `navigate(id)` (router now a `DebugDeps` field). `main.ts` creates `HashRouter` (window location/history/events, `manager.open`, titles from `findSpace`, `document.title`) and calls `router.start()`; `?space=` lookup removed. E2E helpers: `gotoSpace` uses `#/space/<id>`, new `noReloadMarker()`; 001 not-found test moved to `#/space/nope`. 173 unit + 7 E2E green. NFR: entry 130.3 → 130.8 KB gz (+0.5 KB, limit +2 KB).
**Next:** T021 router E2E, T022 sub-path E2E.
**Blockers:** none

## 2026-10-04 — 002-hash-router (T012–T014)

**Done:** `FakeBrowserLocation` test helper (+7 sanity tests). `src/core/router.ts` — `HashRouter`: `start`/`navigate`/`dispose`, unknown → `replaceState` home, skip Space already showing, retry after failure, titles with sequence-guarded outcomes, `SITE_TITLE`. 22 router tests; 172 unit tests green; router.ts/routes.ts 100 % lines. T015 moved to pair with T020 (needs a router in `main.ts`).
**Next:** T015 + T020 — wire into the app.
**Blockers:** none

## 2026-10-04 — 002-hash-router (T001, T010–T011)

**Done:** Spec 002 approved (D-007), plan + tasks (13) written. T001: `dist-subpath/` ignored in git, Prettier, ESLint. T010–T011: `src/core/routes.ts` — `parseHash` / `formatRoute` / `HOME_ROUTE`; home, space (decoded, trailing slash ok, malformed encoding keeps raw id), everything else unknown; ids case-sensitive. 38 table-driven tests incl. round-trips and hostile inputs; 143 unit tests total green.
**Next:** T012–T015 — router.
**Blockers:** none

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
