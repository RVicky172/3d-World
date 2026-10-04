# Testing Strategy

3D code is hard to test by looking at pixels, so we push as much logic as possible into **pure, WebGL-free
functions** and keep the rendering layer thin.

## Test Pyramid

| Layer             | Tool                                  | Location                  | What it covers                                                                                                                                       | Runs in                             |
| ----------------- | ------------------------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| Unit              | Vitest (`node`/`jsdom`)               | `tests/unit/**/*.test.ts` | Pure logic: orbit math, scale mapping, router parsing, registry integrity, data validation, disposal helpers (with mock objects)                     | `npm test`                          |
| Integration       | Vitest + `jsdom`                      | `tests/unit/**/*.test.ts` | Three.js scene graphs built **without rendering** (Three's math/scene classes work in Node): correct hierarchy, object counts, positions at time _t_ | `npm test`                          |
| E2E smoke         | Playwright (Chromium, headless WebGL) | `tests/e2e/**/*.spec.ts`  | App boots, gallery lists spaces, each Space loads, canvas is non-blank, no console errors, navigation back disposes                                  | `npm run test:e2e`                  |
| Visual regression | Playwright `toHaveScreenshot`         | `tests/e2e/visual/`       | Deterministic frames (fixed time via `?t=` param, animations paused)                                                                                 | `npm run test:e2e` (added Phase 1+) |
| Performance       | Playwright + `renderer.info`          | `tests/e2e/perf/`         | Draw calls, triangle counts, memory returns to baseline after dispose                                                                                | Phase 4                             |

## Rules

1. **Time is an input.** `update(delta, elapsed)` must be deterministic. Never read `Date.now()`/`performance.now()`
   inside Space logic — the engine's `Clock` provides time, and tests inject a fake clock.
2. **Test-first for pure logic.** Write the failing unit test, then the function.
3. **Every Space gets a smoke test** in `tests/e2e/spaces.spec.ts` (loads, renders, disposes, no errors).
4. **Fail on console errors.** E2E fixtures collect `console.error` and `pageerror`; any occurrence fails the test.
5. **Debug hooks for tests.** In dev/test builds the app exposes `window.__WORLD__` (current space id, renderer info,
   `pause()`, `setTime(t)`). Stripped from production builds via `import.meta.env.DEV`/`MODE` checks.
6. **No flaky waits.** Wait on app signals (`data-space-ready="true"` on `<body>`), not arbitrary timeouts.
7. **Coverage target:** ≥ 80 % lines for `src/core`, `src/shared`, and each Space's pure modules (`data.ts`, `orbit.ts`, …).
   Rendering glue is covered by E2E instead.

## Commands

```bash
npm test                # unit + integration (watch: npm run test:watch)
npm run test:coverage   # with coverage report
npm run test:e2e        # Playwright (builds + previews automatically)
npm run check           # typecheck + lint + unit tests — run before every commit
```

## Non-blank canvas check (E2E)

Read pixels from the canvas via `page.evaluate` (renderer created with `preserveDrawingBuffer` in test mode)
or screenshot the canvas and assert it is not a single solid color.
