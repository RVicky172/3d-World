# 002 — Hash Router & Deep Links · Implementation Plan

**Spec:** `./spec.md` · **Status:** Approved <!-- Draft | Approved -->

## Approach

The router has two layers, following the pattern from 001: pure logic, plus a thin layer around anything the
browser provides that is passed in rather than read directly.

1. **`routes.ts` (pure):** turns a hash string into a `Route` and back.
   - It has no DOM access and never throws, so every parsing rule (AC-6, AC-7) is unit-tested in isolation.
2. **`HashRouter` (`router.ts`):** listens for `hashchange` and decides which Space should be showing. It is given
   these dependencies:
   - `location` and `history`, and an event target for `hashchange`
   - an `openSpace(id)` function (the SpaceManager's `open`)
   - a function to look up a Space's title, and a function to set the page title

   It owns four rules:
   - **Resolve:** home → the default Space; `space/<id>` → `<id>`; unknown → redirect home with `replaceState` (AC-6).
   - **Skip if already showing:** if the resolved Space is the one already shown or being opened, do not call
     `open()` again (AC-5, AC-8).
   - **Navigate from code:** `navigate(id)` assigns `location.hash`, which adds exactly one history entry. It does
     nothing if that Space is already showing (AC-8).
   - **Title:** when `open()` resolves `'opened'` → `"<title> — 3D World"`; `'not-found'` or `'load-error'` →
     `"3D World"`; `'superseded'` → leave the title alone, because the newer request will set it (AC-9).

Back, Forward, typed addresses, links and `navigate()` all reach the router the same way, through `hashchange`.
None of them reload the page (AC-2, AC-3). Rapid changes work because each one calls `open()`, and the
SpaceManager's existing supersession makes the last request win (AC-10).

`main.ts` stops reading `?space=` (AC-12), creates the router after the SpaceManager, and calls `router.start()`.
`start()` handles the URL the page loaded with (AC-1, AC-5, AC-6).

### Route grammar (AC-6, AC-7)

```text
hash          route
""  "#"  "#/"                       → home
"#/space/<id>"  "#/space/<id>/"     → space(<decoded id>)   trailing slash ignored
"#/space/%E0%A4%A"                  → space("%E0%A4%A")     malformed encoding → raw id → "Space not found"
"#/foo"  "#/space"  "#/space/a/b"  "#//space/x"  "#space/x"  → unknown → replace with "#/"
```

`formatRoute()` is the inverse of `parseHash()`: `home` → `#/`, and `space(id)` → `#/space/<encodeURIComponent(id)>`.
A round-trip test checks that formatting a route and parsing it again gives back the same route.

### "Already showing" (AC-5, AC-8)

The router remembers `currentId`, the Space it last asked the manager to show.

- It sets `currentId` when it calls `open()`.
- It clears `currentId` if the result is `'not-found'` or `'load-error'`, so navigating there again retries.
- It leaves `currentId` alone if the result is `'superseded'`, because a newer request already replaced it.

If a hash change or a `navigate()` call resolves to `currentId`, the router does nothing. So `#/` →
`#/space/demo-cube` → `#/` never re-opens the cube. Calling `navigate('demo-cube')` while on `#/` with the cube
showing also does nothing, which means no history entry is added.

### Sub-path hosting (AC-11)

Hash routes don't depend on the site's path. The risk is the lazy Space chunks, whose URLs depend on Vite's `base`.
To test this, Playwright starts a second web server:

- It builds with `VITE_BASE=/3d-World/` into `dist-subpath/`, passing the variable through the web server's `env`
  option. That works on Windows and needs no `cross-env`.
- It previews that build on port 4174.

A separate `subpath` Playwright project runs `tests/e2e/subpath.spec.ts` against
`http://localhost:4174/3d-World/`.

### Debug hook

`window.__WORLD__` gains `navigate(id)`, so E2E can exercise code navigation (AC-8) the way the gallery (003) will.

## Files

| File                                                | Change | Purpose                                                                                                                                     |
| --------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/core/routes.ts`                                | new    | `Route` type, `parseHash()`, `formatRoute()`, `HOME_ROUTE`                                                                                  |
| `src/core/router.ts`                                | new    | `HashRouter`: `start()`, `navigate(id)`, `dispose()`; resolves routes, redirects unknown ones, skips Spaces already showing, sets the title |
| `src/core/debug.ts`                                 | modify | Add `navigate(id)` to `WorldDebugApi` and the router to `DebugDeps`                                                                         |
| `src/main.ts`                                       | modify | Remove `?space=`; create `HashRouter` with `findSpace`-based titles; `router.start()`                                                       |
| `tests/helpers/fakes.ts`                            | modify | `FakeBrowserLocation`: hash setter adds a history entry and fires `hashchange`; `back()` and `forward()`; `replaceState`                    |
| `tests/unit/core/routes.test.ts`                    | new    | Route grammar table, round-trip, never throws                                                                                               |
| `tests/unit/core/router.test.ts`                    | new    | Startup, redirects, skipping a Space already showing, `navigate`, titles, error retry, dispose                                              |
| `tests/unit/core/debug.test.ts`                     | modify | `navigate` delegates to the router                                                                                                          |
| `tests/e2e/fixtures.ts`                             | modify | `gotoSpace()` uses `#/space/<id>`; add `noReloadMarker()` helper                                                                            |
| `tests/e2e/space-framework.spec.ts`                 | modify | AC-8 (001) test uses `#/space/nope` instead of `?space=nope`                                                                                |
| `tests/e2e/router.spec.ts`                          | new    | AC-1–AC-10 and AC-12 in the browser                                                                                                         |
| `tests/e2e/subpath.spec.ts`                         | new    | AC-11 against the `/3d-World/` build                                                                                                        |
| `playwright.config.ts`                              | modify | Second `webServer` (sub-path build, port 4174) and a `subpath` project; the main project ignores `subpath.spec.ts`                          |
| `.gitignore`, `.prettierignore`, `eslint.config.js` | modify | Ignore `dist-subpath/`                                                                                                                      |
| `specs/architecture.md`                             | modify | Routing section: grammar, router rules, where it sits in startup                                                                            |

## Data Structures & Interfaces

```ts
// src/core/routes.ts
export type Route = { name: 'home' } | { name: 'space'; id: string } | { name: 'unknown' };
export const HOME_ROUTE: Route = { name: 'home' };
export function parseHash(hash: string): Route; // never throws
export function formatRoute(route: Exclude<Route, { name: 'unknown' }>): string;

// src/core/router.ts
export interface RouterLocation {
  hash: string; // assigning adds a history entry and fires hashchange (browser behaviour)
}
export interface RouterDeps {
  location: RouterLocation;
  history: Pick<History, 'replaceState'>;
  events: EventTarget; // window: 'hashchange'
  openSpace(id: string): Promise<OpenResult>;
  defaultSpaceId: string;
  titleOf(id: string): string | undefined; // registry lookup
  setTitle(title: string): void;
}
export const SITE_TITLE = '3D World';
export class HashRouter {
  constructor(deps: RouterDeps);
  start(): Promise<void>; // handles the current hash, then listens
  navigate(spaceId: string): void; // no-op if already showing
  dispose(): void;
}

// src/core/debug.ts (addition)
interface WorldDebugApi {
  navigate(id: string): void;
}
```

## Three.js Techniques

None. This feature has no rendering changes. Space switching reuses 001's SpaceManager unchanged.

## Test Approach

| AC    | Test file                                            | Type       | How                                                                                                                                                                                            |
| ----- | ---------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC-1  | `tests/e2e/router.spec.ts`                           | e2e        | `goto('/#/space/demo-cube')` → `data-space-id="demo-cube"`, status `opened`                                                                                                                    |
| AC-2  | `router.spec.ts`                                     | e2e        | Set `window.__noReload = 1`. Change `location.hash` to another Space (`#/space/nope`, then back). The Space switches and the marker survives                                                   |
| AC-3  | `router.spec.ts` + `router.test.ts`                  | e2e + unit | A → B, then `page.goBack()` → A and `page.goForward()` → B, with the marker intact. Unit test: the fake history drives the same sequence                                                       |
| AC-4  | `router.spec.ts`                                     | e2e        | `#/space/nope` → alert "Space not found", status `not-found`                                                                                                                                   |
| AC-5  | `router.test.ts` + `router.spec.ts`                  | unit + e2e | `""`, `#`, `#/` open `demo-cube`. `#/` ↔ `#/space/demo-cube` calls `openSpace` once. E2E: the hash stays `#/`, and switching to `#/space/demo-cube` keeps `data-space-ready` (no re-open)      |
| AC-6  | `routes.test.ts`, `router.test.ts`, `router.spec.ts` | unit + e2e | Grammar table. Unknown → `replaceState(…, '#/')` and the default Space opens. E2E: after `#/space/demo-cube` → `#/foo`, the URL ends `#/` and Back returns to `#/space/demo-cube`, not `#/foo` |
| AC-7  | `routes.test.ts`                                     | unit       | Trailing slash, `%2D`-style decoding, malformed `%E0%A4%A` → `space('%E0%A4%A')`, never throws (table-driven)                                                                                  |
| AC-8  | `router.test.ts` + `router.spec.ts`                  | unit + e2e | `navigate('b')` → one new history entry. `navigate` to the Space already showing → no entry and no `openSpace`. E2E via `__WORLD__.navigate` + `history.length`                                |
| AC-9  | `router.test.ts` + `router.spec.ts`                  | unit + e2e | Titles for opened, not-found and load-error. Superseded leaves the title alone. E2E: `toHaveTitle('Demo Cube — 3D World')` on `#/` and `#/space/demo-cube`; `'3D World'` on `#/space/nope`     |
| AC-10 | `router.spec.ts`                                     | e2e        | Set the hash 5 times in one `evaluate` (A, nope, A, nope, A). The result ends on A, and the fixture confirms no console errors                                                                 |
| AC-11 | `tests/e2e/subpath.spec.ts`                          | e2e        | On the `subpath` project: `goto('#/space/demo-cube')` under `/3d-World/` → opened, non-blank canvas; `#/space/nope` → not-found                                                                |
| AC-12 | `router.spec.ts`                                     | e2e        | `goto('/?space=nope')` → `data-space-id="demo-cube"`, no alert, no errors                                                                                                                      |

- Coverage target: ≥ 80 % lines for `routes.ts` and `router.ts`. Both are pure or have all dependencies passed in,
  so 100 % is realistic.
- NFR "router ≤ 2 KB gzipped": compare the entry gzip size before and after, using the `npm run build` bundle-check
  line. Record the result in `memory/progress.md`.

## Risks & Mitigations

- **Assigning `location.hash` to its current value does nothing:** no event and no history entry.
  - This is browser behaviour, and it is exactly what AC-8 wants for "same Space".
  - The router never relies on an event that would not fire: `navigate()` checks `currentId` first.
- **`replaceState` does not fire `hashchange`:** the redirect path handles the home route directly after replacing
  the URL, rather than waiting for an event. A unit test asserts the default Space opens.
- **Redirect loops:** home is always valid, so a redirect can only happen once. A unit test confirms `#/foo` leads to
  one `replaceState` call and one `open` call.
- **Breaking 001's E2E test:** its `?space=nope` not-found test would start opening demo-cube. It is updated to
  `#/space/nope` in the same task that removes `?space=`.
- **Two Playwright web servers make E2E slower:** the second build is small (it adds a few seconds), and the
  servers start in parallel. If it becomes a problem, AC-11 could move to a CI-only project. That would need a
  spec note.
- **The sub-path preview must serve under `/3d-World/`:** `vite preview` reads `base` from the config, so the
  `VITE_BASE` env var applies to both build and preview. The first sub-path test asserts the chunk actually loads.

## Constitution Check

| Principle                 | Status | Notes                                                                                                                     |
| ------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------- |
| I. Spec before code       | ✅     | Spec 002 approved; every AC is mapped to a test above                                                                     |
| II. Browser-only          | ✅     | Hash routing needs no server config; state lives in the URL, as II prefers                                                |
| III. Self-contained Space | ✅     | Spaces are untouched; the router only knows ids, via the registry                                                         |
| IV. Performance budgets   | ✅     | Router ≤ 2 KB gzipped (NFR); the bundle check still guards 250 KB                                                         |
| V. Accessible & resilient | ✅     | Titles per Space (AC-9); no route input can throw (AC-6, AC-7); focus untouched                                           |
| VI. Test-gated            | ✅     | Pure parsing is unit-tested first; the router is tested with a fake location and history; E2E covers real browser history |
| VII. Data-driven          | ✅     | Titles come from registry metadata; the default Space id is one constant                                                  |
| VIII. Small dependencies  | ✅     | **No new dependencies.** The hand-rolled router follows `tech-stack.md`; there is no `cross-env`                          |
| IX. Licensed assets       | ✅     | No assets                                                                                                                 |
| X. Memory maintained      | ✅     | D-007 already records the routing behaviour; the plan's outcomes go to `progress.md`                                      |
