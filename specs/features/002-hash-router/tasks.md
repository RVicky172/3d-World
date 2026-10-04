# 002 — Hash Router & Deep Links · Tasks

**Plan:** `./plan.md` (Approved)
Legend: `[P]` = can run in parallel with the previous task. Each task lists files and the proving test.
Test-first: each "tests" task must fail before its paired implementation task makes it pass.
Baseline for the size NFR: entry 130.3 KB gzipped (from 001).

## Setup

- [x] **T001** — Ignore the sub-path build output `dist-subpath/` in git, Prettier and ESLint.
      files: `.gitignore`, `.prettierignore`, `eslint.config.js` · test: `npm run check` still green

## Routes (pure)

- [x] **T010** — Tests for `parseHash` / `formatRoute`, table-driven:
  - `""`, `#`, `#/` → home
  - `#/space/<id>` and `#/space/<id>/` → space
  - percent-encoded ids are decoded
  - malformed `%E0%A4%A` → `space('%E0%A4%A')`
  - `#/foo`, `#/space`, `#/space/a/b`, `#//space/x`, `#space/x` → unknown
  - `formatRoute` round-trips with `parseHash`, including ids that need encoding
  - no input throws (a list of hostile strings)

  files: `tests/unit/core/routes.test.ts` · covers: AC-6, AC-7

- [x] **T011** — Implement `Route`, `HOME_ROUTE`, `parseHash()`, `formatRoute()`.
      files: `src/core/routes.ts` · test: T010

## Router

- [x] **T012** — `FakeBrowserLocation` test helper. It behaves like the browser:
  - assigning `hash` adds a history entry and fires `hashchange`, unless the value is unchanged;
  - `replaceState` swaps the current entry without an event;
  - `back()` and `forward()` move through entries and fire `hashchange`;
  - it exposes `entries` and `index`.

  Includes a few sanity tests of the fake itself.
  files: `tests/helpers/fakes.ts`, `tests/unit/helpers/fake-browser-location.test.ts`

- [x] **T013** — Tests for `HashRouter` using `FakeBrowserLocation` and a stub `openSpace`:
  - `start()` on `#/space/a` opens `a` (AC-1); on `""`, `#` and `#/` opens the default (AC-5)
  - `start()` on `#/foo` → one `replaceState` to `#/`, then the default opens, with no loop (AC-6)
  - a hash change to a registered Space opens it; `#/` ↔ `#/space/<default>` calls `openSpace` once (AC-2, AC-5)
  - back and forward re-open the previous and next Spaces (AC-3)
  - `navigate('b')` adds one entry and opens `b`; `navigate` to the Space already showing adds no entry and does not open (AC-8)
  - after a `'not-found'` or `'load-error'` result, navigating to the same id retries
  - titles: opened → `"<title> — 3D World"`; not-found and load-error → `"3D World"`; superseded → unchanged (AC-9)
  - `dispose()` stops listening to `hashchange`

  files: `tests/unit/core/router.test.ts` · covers: AC-1, AC-2, AC-3, AC-5, AC-6, AC-8, AC-9

- [x] **T014** — Implement `HashRouter` (`start`, `navigate`, `dispose`, `SITE_TITLE`).
      files: `src/core/router.ts` · test: T013
- [x] **T015** — _(do together with T020: making the router a required debug dependency needs `main.ts` to create one)_ Debug hook: add `navigate(id)` to `WorldDebugApi` and the router to `DebugDeps`. Test first.
      files: `src/core/debug.ts`, `tests/unit/core/debug.test.ts` · covers: AC-8 (E2E enabler)

## Integration

- [x] **T020** — Wire the router in, and remove `?space=` and its E2E uses in the same task so E2E never goes red:
  - `main.ts`: remove the `?space=` lookup; create `HashRouter` (`openSpace` = `manager.open`, `titleOf` from `findSpace`, `setTitle` sets `document.title`); call `router.start()`; pass the router to the debug hook
  - `fixtures.ts`: `gotoSpace()` uses `#/space/<id>`; add a `noReloadMarker()` helper
  - `space-framework.spec.ts`: the 001 AC-8 test uses `#/space/nope`

  files: `src/main.ts`, `tests/e2e/fixtures.ts`, `tests/e2e/space-framework.spec.ts` · test: existing E2E suite green; covers: AC-12 (code)

- [x] **T021** — E2E router tests:
  - AC-1: deep link opens the Space
  - AC-2: hash change switches Spaces with no reload (marker survives)
  - AC-3: `goBack()` / `goForward()` with no reload
  - AC-4: `#/space/nope` shows "Space not found"
  - AC-5: home keeps `#/`; `#/` ↔ `#/space/demo-cube` stays ready with no re-open
  - AC-6: `#/foo` → URL ends `#/`, and Back skips it
  - AC-8: `__WORLD__.navigate` and `history.length`
  - AC-9: titles
  - AC-10: 5 rapid hash changes end on the last one
  - AC-12: `/?space=nope` behaves like `/`

  files: `tests/e2e/router.spec.ts` · covers: AC-1–AC-6, AC-8–AC-10, AC-12

- [x] **T022** — Sub-path E2E:
  - a second Playwright `webServer` builds with `VITE_BASE=/3d-World/` via `env`, into `dist-subpath/`, and previews on port 4174
  - a `subpath` project runs only `subpath.spec.ts`; the main project ignores it
  - tests: the deep link opens with a non-blank canvas (so the lazy chunk loaded under the base), and `#/space/nope` shows not-found

  files: `playwright.config.ts`, `tests/e2e/subpath.spec.ts` · covers: AC-11

## Docs

- [x] **T030** [P] — Add a Routing section to the architecture doc: route grammar, router rules (resolve, skip if already showing, redirect, titles), and where it sits in startup. Remove the "`?space=` until 002" note.
      files: `specs/architecture.md`

## Verify

- [x] **T090** — Run `npm run check`, `npm run build` (bundle check) and `npm run test:e2e` (both projects), and confirm all are green.
  - Coverage: ≥ 80 % lines for `routes.ts` and `router.ts`.
  - NFR: entry size growth ≤ 2 KB gzipped against the 130.3 KB baseline; record the number.
- [x] **T091** — Tick AC-1…AC-12 in `spec.md`, set Status `Implemented`, roadmap ✔️, add a `memory/progress.md` entry, and update `memory/MEMORY.md` (`/spec-verify 002`).

## AC Coverage

| AC    | Tasks            |
| ----- | ---------------- |
| AC-1  | T013, T021       |
| AC-2  | T013, T021       |
| AC-3  | T012, T013, T021 |
| AC-4  | T021             |
| AC-5  | T013, T021       |
| AC-6  | T010, T013, T021 |
| AC-7  | T010             |
| AC-8  | T013, T015, T021 |
| AC-9  | T013, T021       |
| AC-10 | T021             |
| AC-11 | T022             |
| AC-12 | T020, T021       |
