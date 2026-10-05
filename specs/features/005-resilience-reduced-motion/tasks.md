# 005 — WebGL Resilience & Reduced Motion · Tasks

**Plan:** `./plan.md` (Approved)
Legend: `[P]` = can run in parallel with the previous task. Each task lists files and the proving test.
Test-first: each "tests" task must fail before its paired implementation task makes it pass.
Every task leaves `npm run check` **and** `npm run test:e2e` green.
Baseline for the size NFR: entry 134.2 KB gzipped (from 004); 005 may add ≤ 2 KB.

## Spike

- [x] **T001** — Check that headless Chromium (SwiftShader) fires `webglcontextlost` **and**
      `webglcontextrestored` for `WEBGL_lose_context.loseContext()` / `restoreContext()`. Use a throwaway
      E2E test that adds listeners via `page.evaluate` on the app canvas. Record the result in
      `memory/learnings.md`.
  - If restore does not fire, mark the restore parts of T051 as unit-only and add a Changelog line to
    `spec.md` for AC-7.
  - Delete the throwaway test afterwards.

  files: `tests/e2e/` (temporary), `memory/learnings.md` · covers: risk check for AC-7

## Boot fallback (AC-1–AC-5)

- [x] **T010** — `createRendererOrNull` tests:
  - returns the created value;
  - returns `null` when the factory throws;
  - never rethrows.

  files: `tests/unit/capabilities.test.ts` · covers: AC-2

- [x] **T011** — Implement `createRendererOrNull`. files: `src/core/capabilities.ts` · test: T010
- [x] **T012** [P] — Fallback signal tests: `renderWebGLFallback(container, status)` sets
      `data-webgl="unavailable"` on the status element (default `<body>`). The heading is still a single `h1`
      and the box has `role="alert"`.
      files: `tests/unit/fallback.test.ts` · covers: AC-3, AC-4
- [x] **T013** — Implement the signal; add `overflow-wrap: anywhere` to `.fallback`.
      files: `src/ui/fallback.ts`, `src/styles/main.css` · test: T012
- [x] **T014** — Wire into `main.ts`:
  - extract `startApp()`;
  - `hasWebGL2()` false **or** `createRendererOrNull()` null → fallback, with nothing else created.

  files: `src/main.ts` · test: T016

- [x] **T015** [P] — Add a `<noscript>` message using the `.fallback` markup.
      files: `index.html` · test: T016
- [x] **T016** — E2E boot-fallback tests (new `resilience.spec.ts`):
  - **WebGL2 unavailable** (init script makes `getContext('webgl2')` return `null`), at `#/`,
    `#/space/demo-cube` and `#/nope`:
    - `body[data-webgl="unavailable"]`;
    - fallback visible;
    - no `canvas`;
    - no page errors.
  - **Renderer creation fails** (probe succeeds, later `webgl2` calls fail): same outcome. Use
    `allowConsoleErrors` for three's `Error creating WebGL context`, and require no `pageerror`.
  - **Readability:**
    - `role=alert`;
    - exactly one `h1`;
    - text/background contrast ≥ 4.5;
    - at a 320 px viewport, `scrollWidth ≤ clientWidth`.
  - **JavaScript disabled** (`javaScriptEnabled: false`): the noscript text is visible.

  files: `tests/e2e/resilience.spec.ts` · covers: AC-1, AC-2, AC-3, AC-4, AC-5

## Live reduced motion (AC-10, AC-11)

- [x] **T020** — `watchReducedMotion` tests, using a fake `MediaQueryList` (an `EventTarget` with `matches`):
  - `current` follows `change` events;
  - `null` query → `current` false;
  - `dispose()` removes the listener (spy).

  files: `tests/unit/capabilities.test.ts` · covers: AC-10, AC-12

- [x] **T021** — Implement `watchReducedMotion` / `MotionPreference`. files: `src/core/capabilities.ts` · test: T020
- [x] **T022** [P] — Fader tests: `reducedMotion` is a getter read on every `out()`/`in()`.
  - Flipping it between fades switches between instant and timed.
  - `transition` style is updated per fade.

  files: `tests/unit/ui/fader.test.ts` · covers: AC-10

- [x] **T023** — Implement the Fader change; update existing Fader tests and callers to pass `() => bool`.
      files: `src/ui/fader.ts`, `tests/unit/ui/fader.test.ts` · test: T022
- [x] **T024** — SpaceManager tests: `reducedMotion: () => boolean` is read when each `SpaceContext` is
      built. A view opened after a flip sees the new value; the mounted view's context is unchanged.
      Update existing manager tests to the getter.
      files: `tests/unit/core/space-manager.test.ts` · covers: AC-10
- [x] **T025** — Implement in `SpaceManager`. In `main.ts`, create one `watchReducedMotion()` and pass
      `() => motion.current` to the Fader and the manager.
      files: `src/core/space-manager.ts`, `src/main.ts` · test: T024
- [x] **T026** — E2E live change:
  1. Start with `reducedMotion: 'no-preference'` on demo-cube.
  2. `page.emulateMedia({ reducedMotion: 'reduce' })`.
  3. Go to the gallery and back to demo-cube.
  4. Expect the fader `transition-duration: 0s` and the demo-cube `cameraPose` still over 600 ms (turntable
     off).
  5. Expect the card `transition-duration: 0s` immediately after the emulation change, before any navigation.

  No page reload is allowed (`noReloadMarker`).
  files: `tests/e2e/resilience.spec.ts` · covers: AC-10, AC-11

## Reduced-motion regression (AC-9)

- [x] **T030** [P] — E2E single regression test under `reducedMotion: 'reduce'`:
  - fader `transition-duration: 0s`;
  - card `transition-duration: 0s`;
  - controls hint `animation-name: none`;
  - starfield frames identical 500 ms apart;
  - demo-cube `cameraPose` still for 600 ms after open;
  - damping off (one drag, then a pose that is stable straight after `mouse.up`).

  files: `tests/e2e/resilience.spec.ts` · covers: AC-9

## Context loss (AC-6–AC-8, AC-12)

- [x] **T040** — Engine `stop()` tests:
  - after `start()`, `stop()` leaves no scheduled frame (`FakeScheduler`);
  - `start()` again schedules;
  - `stop()` twice is safe.

  files: `tests/unit/core/engine.test.ts` · covers: AC-8

- [x] **T041** — Implement `Engine.stop()`. files: `src/core/engine.ts` · test: T040
- [x] **T042** [P] — SpaceManager `suspend()`/`resume()` tests:
  - **suspend on a Space:** disposes it (signal aborted), `setInstance(null)`, clears
    `data-space-ready`/`data-space-status`, and keeps `data-view`.
  - **resume:** reopens the same Space id and sets the ready signal again.
  - **gallery:** resume reopens it through its factory.
  - **suspend during an open:** the in-flight open returns `superseded` and disposes what it created; resume
    opens the _requested_ target.
  - **suspend on "not found":** resume shows "not found" again.
  - **nothing requested yet:** resume returns `null`.
  - **a newer `open()` after suspend:** wins, and resume follows the newest target.
  - **neither method throws.**

  files: `tests/unit/core/space-manager.test.ts` · covers: AC-6, AC-7, AC-8

- [x] **T043** — Implement: record `{ view, id, factory }` at the start of every request; add `suspend()`
      and `resume()`. files: `src/core/space-manager.ts` · test: T042
- [x] **T044** [P] — Context-lost panel tests:
  - `showContextLost(container, onReload)` appends one `role=alert` box with an `h2`, text and a
    `<button>Reload</button>`;
  - clicking the button calls `onReload`;
  - the returned remove function removes it;
  - calling it twice replaces rather than duplicates.

  files: `tests/unit/ui/context-lost.test.ts` · covers: AC-6, AC-7

- [x] **T045** — Implement the panel and its CSS: `.context-lost` at z 3 on a solid `--surface`, with a
      `:focus-visible` button. files: `src/ui/context-lost.ts`, `src/styles/main.css` · test: T044
- [x] **T046** — `ContextGuard` tests, with a fake canvas (`EventTarget`), fake engine and manager, and an
      injected `reload`:
  - **`webglcontextlost`:**
    - calls `engine.stop` → `manager.suspend`;
    - shows the panel;
    - sets `data-webgl="lost"`;
    - `isLost` is true.
  - **The listener doesn't call `stopPropagation` or rely on `defaultPrevented`.**
  - **`webglcontextrestored`:**
    - removes the panel and `data-webgl`;
    - calls `engine.start` → `manager.resume`.
  - **Reload button** → `reload()`.
  - **Repeated lose/restore cycles** work.
  - **`dispose()`:** removes both listeners (spy) and the panel; events afterwards do nothing.

  files: `tests/unit/core/context-guard.test.ts` · covers: AC-6, AC-7, AC-8, AC-12

- [x] **T047** — Implement `ContextGuard`. files: `src/core/context-guard.ts` · test: T046
- [x] **T048** [P] — Debug hook tests: `loseContext()` / `restoreContext()` call the
      renderer's `forceContextLoss()` / `forceContextRestore()` (changed in T051: `getExtension()` returns null
      while lost); they are absent in production mode.
      files: `tests/unit/core/debug.test.ts` · covers: AC-6, AC-7 (test seam)
- [x] **T049** — Implement the debug methods; wire `ContextGuard` into `main.ts`
      (`reload: () => location.reload()`). files: `src/core/debug.ts`, `src/main.ts` · test: T048, T051
- [x] **T051** — E2E context loss:
  - **Loss:** on the gallery and in demo-cube, `loseContext()` → `body[data-webgl="lost"]` within 1 s, panel
    visible, Reload button focusable.
  - **Restore:** `restoreContext()` → `data-space-ready="true"`, same view and URL, `canvasCoverage` > 0, no
    panel, no `data-webgl`.
  - **Reload:** lose → click Reload → the page reloads and is ready, with no panel.
  - **Leaks:** lose → restore → 10 gallery ↔ demo-cube round trips, and memory returns to the post-restore
    baseline.
  - **No console errors** throughout (fixture).

  files: `tests/e2e/resilience.spec.ts` · covers: AC-6, AC-7, AC-8, AC-12

## Docs & Verify

- [x] **T090** — Update `specs/architecture.md`:
  - a Resilience section (boot fallback, suspend/rebuild, `data-webgl`, live motion);
  - layout entries (`context-guard.ts`, `context-lost.ts`);
  - stacking (`.context-lost` z 3);
  - seams table (`ContextGuard` fakes, `WEBGL_lose_context` via `__WORLD__`).

  files: `specs/architecture.md`

- [x] **T091** — `npm run check`, `npm run test:e2e`, `npm run build` all green; entry growth ≤ 2 KB vs
      134.2 KB.
- [x] **T092** — Tick ACs in `spec.md` (Status `Implemented`), set `roadmap.md` 005 ✔️ and close Phase 1
      (exit criteria), and update `memory/progress.md`, `memory/MEMORY.md` and `memory/learnings.md`.

## AC coverage

| AC    | Tasks                                           |
| ----- | ----------------------------------------------- |
| AC-1  | T014, T016                                      |
| AC-2  | T010, T011, T014, T016                          |
| AC-3  | T012, T013, T016                                |
| AC-4  | T012, T013, T016                                |
| AC-5  | T015, T016                                      |
| AC-6  | T042–T049, T051                                 |
| AC-7  | T001, T042–T049, T051                           |
| AC-8  | T040, T041, T046, T047, T051                    |
| AC-9  | T030                                            |
| AC-10 | T020–T026                                       |
| AC-11 | T026 (no toggle; media query is the only input) |
| AC-12 | T020, T046, T051                                |
