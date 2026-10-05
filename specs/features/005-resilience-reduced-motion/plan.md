# 005 — WebGL Resilience & Reduced Motion · Implementation Plan

**Spec:** `./spec.md` · **Status:** Approved (2026-10-05) <!-- Draft | Approved -->

## Approach

Four small, independent pieces, plus wiring in `main.ts`. No new dependency.

**1. Boot fallback (AC-1–AC-5).**

- `main.ts` already shows `renderWebGLFallback()` when `hasWebGL2()` fails. It also needs to handle the
  renderer constructor throwing (three r186 logs `THREE.WebGLRenderer: Error creating WebGL context.` with
  `console.error`, then throws).
- A new `createRendererOrNull(create)` in `capabilities.ts` wraps the constructor and returns `null` on
  failure. `main.ts` treats `null` exactly like "no WebGL2". Boot is extracted into a small `startApp()` so the
  two fallback paths are one branch.
- `renderWebGLFallback(container, statusElement = document.body)` additionally sets
  `<body data-webgl="unavailable">`. This is a new attribute, separate from `data-space-status`.
- The existing fallback heading (`h1`), `role="alert"` and `--muted` copy already meet AC-4. The E2E test proves
  contrast and 320 px reflow; the CSS only gains `overflow-wrap: anywhere` as insurance.
- **No JavaScript (AC-5):** a `<noscript>` block in `index.html` reuses the `.fallback` markup and classes.
  Production builds link the entry CSS from the HTML, so it is styled. In `npm run dev` the CSS is injected by
  JS, so it shows unstyled there, which is acceptable.

**2. Context loss (AC-6–AC-8, D-011).** The strategy is "suspend on loss, rebuild on restore", rather than
trusting three.js to re-upload a live scene.

- three r186 already calls `preventDefault()` on `webglcontextlost`, which lets the browser restore the context.
- On `webglcontextrestored`, three runs `initGLContext()`, which replaces `info`, `properties`, `geometries` and
  the other caches. Disposing the old view _after_ restore would therefore call `deleteBuffer` and similar on
  objects from the old context. That risks WebGL warnings, which DoD #5 forbids.
- So we dispose the view **while the context is lost**, when every GL call is a silent no-op. On restore we
  reopen the same view from scratch through the normal `SpaceManager` path. Its fade, ready signals, focus and
  supersession all apply unchanged.

A `ContextGuard` (new, `src/core/context-guard.ts`) owns this:

- **On `webglcontextlost`:**
  1. Stop the engine loop: `engine.stop()`, new, so no work is done while the context is lost (AC-8).
  2. Call `manager.suspend()`.
  3. Show the "3D view stopped" panel with a **Reload** button.
  4. Set `<body data-webgl="lost">`.
- **On `webglcontextrestored`:**
  1. Remove the panel and `data-webgl`.
  2. Call `engine.start()`, then `manager.resume()`.
- **If the context never comes back,** the panel stays and **Reload** calls `location.reload()`, injected for
  tests.
- **`dispose()`** removes both listeners and the panel (AC-12). The app never disposes it; tests do.

`SpaceManager` gains two methods:

- **`suspend()`** works like `close()`: it takes a new sequence number (cancelling any in-flight open), aborts
  the signal and disposes the mounted view, then `engine.setInstance(null)`, and clears `data-space-ready` /
  `data-space-status`.
  - It **remembers the latest requested target**, not just the mounted one, so a loss during an open resumes
    the view the visitor was heading to.
  - `data-view` is left alone, so the back link doesn't flash.
- **`resume()`** re-runs that target: `open(id)` for a Space, `openView('gallery', factory)` for the gallery.
  To support this, the manager records `{ view, id, factory }` at the start of every request.
- The router isn't involved and the URL doesn't change, so the router's "skip if already showing" memory stays
  correct.

The panel lives in `#app` **above the fader** (new z-index 3; the back link stays on top at 4). It is visible
whatever state the fader was in when the loss hit. Its `h2` + `p` + `button` use the existing message styles.

**3. Reduced motion, live (AC-9–AC-11).**

- `capabilities.ts` gains `watchReducedMotion(query?)`. It returns `{ readonly current: boolean; dispose() }`,
  kept up to date by the `MediaQueryList` `change` event.
- `SpaceManager` and `Fader` take `reducedMotion: () => boolean` instead of a boolean.
  - The manager reads it when it builds each `SpaceContext`, so the gallery starfield, turntable and damping
    follow the preference from the next view opened.
  - The fader reads it on every `out()`/`in()` and sets its `transition` style then, rather than in the
    constructor.
- CSS `@media (prefers-reduced-motion)` rules (card hover, controls hint) already update immediately.
- Under D-011 there is no on-page toggle (AC-11). So no `localStorage` and no UI; the OS setting stays the only
  input.

**4. Debug hook.** `__WORLD__` gains `loseContext()` / `restoreContext()`. They call three's
`renderer.forceContextLoss()` / `forceContextRestore()`, which cache the `WEBGL_lose_context` extension.
`getExtension()` returns null while the context is lost, so fetching the extension on demand can't restore
(found in T051). E2E tests use them to force loss and restore. They are stripped from
production like the rest of the hook.

## Files

| File                                    | Change | Purpose                                                                                            |
| --------------------------------------- | ------ | -------------------------------------------------------------------------------------------------- |
| `src/core/capabilities.ts`              | modify | `createRendererOrNull()`, `watchReducedMotion()`                                                   |
| `src/core/context-guard.ts`             | new    | `ContextGuard`: listens for loss/restore on the canvas, coordinates engine, manager, panel, signal |
| `src/core/engine.ts`                    | modify | `stop()` (loop only; `start()` is already idempotent)                                              |
| `src/core/space-manager.ts`             | modify | `suspend()`, `resume()`, remember last requested target; `reducedMotion` becomes a getter          |
| `src/core/debug.ts`                     | modify | `loseContext()`, `restoreContext()`                                                                |
| `src/ui/fader.ts`                       | modify | `reducedMotion` getter, transition style set per fade                                              |
| `src/ui/fallback.ts`                    | modify | Sets `data-webgl="unavailable"` on the status element                                              |
| `src/ui/context-lost.ts`                | new    | `showContextLost(container, onReload)` / its remove function: alert panel with Reload button       |
| `src/main.ts`                           | modify | `startApp()`: renderer-or-fallback branch, motion watcher, `ContextGuard`                          |
| `src/styles/main.css`                   | modify | `.context-lost` panel (z 3, solid `--surface`), fallback wrap                                      |
| `index.html`                            | modify | `<noscript>` message                                                                               |
| `tests/unit/capabilities.test.ts`       | modify | renderer-or-null, motion watcher                                                                   |
| `tests/unit/core/context-guard.test.ts` | new    | loss/restore sequencing with fakes                                                                 |
| `tests/unit/core/engine.test.ts`        | modify | `stop()` cancels the scheduled frame; `start()` resumes                                            |
| `tests/unit/core/space-manager.test.ts` | modify | suspend/resume (Space, gallery, during an open, after not-found), live motion getter               |
| `tests/unit/ui/fader.test.ts`           | modify | preference read per fade                                                                           |
| `tests/unit/fallback.test.ts`           | modify | `data-webgl` signal                                                                                |
| `tests/unit/ui/context-lost.test.ts`    | new    | panel markup, role, Reload callback, removal                                                       |
| `tests/unit/core/debug.test.ts`         | modify | lose/restore call the extension                                                                    |
| `tests/e2e/resilience.spec.ts`          | new    | AC-1–AC-10, AC-12 end to end                                                                       |
| `specs/architecture.md`                 | modify | Resilience section, layout, stacking (z 3), seams table                                            |

## Data Structures & Interfaces

```ts
// src/core/capabilities.ts
export function createRendererOrNull<R>(create: () => R): R | null; // catches; three already logged the cause
export interface MotionPreference {
  readonly current: boolean;
  dispose(): void;
}
export function watchReducedMotion(
  query?: MediaQueryList | null, // default: matchMedia('(prefers-reduced-motion: reduce)'), null when unsupported
): MotionPreference;

// src/core/engine.ts
class Engine {
  stop(): void; // stops the render loop; resolves no frame waiters (a suspended view has none pending)
}

// src/core/space-manager.ts
export interface SpaceManagerOptions {
  reducedMotion: () => boolean; // was: boolean
  // …unchanged
}
class SpaceManager {
  /** Dispose the mounted view and cancel any open, remembering what should be showing. Never throws. */
  suspend(): void;
  /** Reopen the remembered target; 'superseded' if something else was requested meanwhile; null if nothing to resume. */
  resume(): Promise<OpenResult | null>;
}

// src/core/context-guard.ts
export interface ContextGuardOptions {
  canvas: EventTarget; // the renderer's canvas
  container: HTMLElement; // #app, for the panel
  engine: { start(): void; stop(): void };
  manager: { suspend(): void; resume(): Promise<unknown> };
  reload: () => void; // location.reload in the app
  statusElement?: HTMLElement; // default <body>; gets data-webgl="lost"
}
export class ContextGuard {
  constructor(options: ContextGuardOptions);
  readonly isLost: boolean;
  dispose(): void;
}

// src/ui/context-lost.ts
export function showContextLost(container: HTMLElement, onReload: () => void): () => void; // returns remove()

// src/ui/fader.ts
export interface FaderOptions {
  reducedMotion: () => boolean; // was: boolean
  // …unchanged
}

// src/core/debug.ts — WorldDebugApi
loseContext(): void;
restoreContext(): void;
```

**Body signals.** `data-webgl` is absent when healthy, `unavailable` after a failed boot, and `lost` while the
context is gone. `data-space-ready` is removed by `suspend()` and set again when `resume()`'s open completes.

## Three.js Techniques

- **No scene changes.** The work is renderer lifecycle only.
- **Losing the context:** three's own `onContextLost` calls `preventDefault()`, which is what makes restore
  possible. Our listener is added after three's and must not stop propagation.
- **Restoring:** `initGLContext()` replaces `renderer.info`, so `__WORLD__.memory()` must keep reading
  `engine.renderer.info` on each call, as it already does. Counts restart from zero, and the reopened view
  allocates again.
- **`WEBGL_lose_context`** simulates loss in E2E. `restoreContext()` is only valid after the loss event has
  fired, so tests wait for `data-webgl="lost"` first.
- **Performance:** two canvas listeners and one media-query listener. Nothing is added per frame.

## Test Approach

| AC    | Test file                                                                                                                                                                                                                                                                                               | Type       |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| AC-1  | `tests/e2e/resilience.spec.ts`: init script returns `null` for `webgl2`; `#/`, `#/space/demo-cube`, `#/nope`                                                                                                                                                                                            | e2e        |
| AC-2  | `tests/unit/capabilities.test.ts` (throwing factory → `null`); e2e: init script lets the first `webgl2` call succeed and later ones fail; `allowConsoleErrors` for three's message, no `pageerror`                                                                                                      | unit + e2e |
| AC-3  | `tests/unit/fallback.test.ts`; e2e waits on `body[data-webgl="unavailable"]`                                                                                                                                                                                                                            | unit + e2e |
| AC-4  | e2e: `role=alert`, one `h1`, computed-colour contrast ≥ 4.5 (existing helper approach from 003), viewport 320 px → `scrollWidth ≤ clientWidth`                                                                                                                                                          | e2e        |
| AC-5  | e2e: `browser.newContext({ javaScriptEnabled: false })` → noscript text visible                                                                                                                                                                                                                         | e2e        |
| AC-6  | `tests/unit/core/context-guard.test.ts`; e2e: `__WORLD__.loseContext()` on the gallery and in demo-cube → `body[data-webgl="lost"]` within 1 s, panel visible                                                                                                                                           | unit + e2e |
| AC-7  | unit (restore → `resume()`, panel removed; Reload → injected `reload`); e2e: `restoreContext()` → `data-space-ready="true"`, same view, `canvasCoverage` > 0, no panel; e2e: lose → click Reload → page ready again                                                                                     | unit + e2e |
| AC-8  | `tests/unit/core/engine.test.ts` (`stop()` leaves no scheduled frame); `context-guard.test.ts` (loss → `engine.stop`, `manager.suspend`); e2e: no console errors across lose/restore (fixture)                                                                                                          | unit + e2e |
| AC-9  | e2e `reducedMotion: 'reduce'` regression: fader `transition-duration: 0s`, card `transition-duration: 0s`, hint `animation-name: none`, starfield frames identical 500 ms apart, demo-cube `cameraPose` still 600 ms after open (turntable off); damping already covered in `controls.spec.ts`          | e2e        |
| AC-10 | `tests/unit/capabilities.test.ts` (fake `MediaQueryList` `change`); `space-manager.test.ts` (context built after the change sees the new value); `fader.test.ts`; e2e: start with `no-preference`, `page.emulateMedia({ reducedMotion: 'reduce' })`, open the next view → instant fade, still turntable | unit + e2e |
| AC-11 | No toggle exists. Covered by AC-9/AC-10 (only the media query drives motion)                                                                                                                                                                                                                            | —          |
| AC-12 | unit: `ContextGuard.dispose()` and `MotionPreference.dispose()` remove listeners (spy on `removeEventListener`); e2e: existing 10-round-trip memory tests still pass; after lose → restore → 10 round trips, memory returns to the post-restore baseline                                                | unit + e2e |

## Risks & Mitigations

- **Restore leaves stale GPU objects or WebGL warnings.** _Mitigation:_ dispose while lost (no-op GL calls),
  rebuild after restore. E2E fails on console errors, and Chromium surfaces WebGL errors there.
- **SwiftShader may not fire `webglcontextrestored` after `loseContext()`/`restoreContext()`.** _Mitigation:_
  check this first, as the first task (one E2E spike). If it doesn't fire, test restore at unit level only and note it in
  `learnings.md`.
- **A loss arrives mid-open.** `suspend()` bumps the sequence, so the in-flight open returns `superseded` and
  disposes what it created. `resume()` reopens the remembered _target_. Unit-tested.
- **A loss arrives while showing "not found".** Nothing is mounted. Resume re-runs `open(id)`, which shows
  "not found" again. Unit-tested.
- **Losing and restoring again.** The guard is stateless apart from `isLost`; it handles repeated cycles. Unit test.
- **E2E "renderer fails" init script is brittle** (counting `getContext` calls). _Mitigation:_ key it on a
  canvas flag. `hasWebGL2()`'s probe canvas is never attached to the DOM, so fail `webgl2` only for canvases
  where `isConnected` is false _after_ the first call. If that proves fiddly, fall back to "first call
  succeeds".
- **The fallback renders before the debug hook exists.** That's fine: tests wait on `data-webgl`, not
  `__WORLD__`.
- **Bundle growth.** The guard, panel and watcher are roughly 1 KB gzipped. The NFR is ≤ 2 KB, and
  `check-bundle` reports it.

## Constitution Check

| Principle                 | Status | Notes                                                                                        |
| ------------------------- | ------ | -------------------------------------------------------------------------------------------- |
| I. Spec before code       | ✅     | Spec 005 Approved (D-011)                                                                    |
| II. Browser-only          | ✅     | No network; no `localStorage` (no toggle)                                                    |
| III. Self-contained Space | ✅     | All changes in `core`/`ui`; Spaces untouched, still get `reducedMotion` via context          |
| IV. Performance budgets   | ✅     | No per-frame work; ≤ 2 KB entry growth                                                       |
| V. Accessible & resilient | ✅     | The point of the feature: no blank screen in any failure mode; `role=alert`; keyboard Reload |
| VI. Test-gated            | ✅     | Every AC mapped; pure parts unit-tested first                                                |
| VII. Data-driven          | ✅     | Message copy kept in one const per module, like `messages.ts`                                |
| VIII. Small dependencies  | ✅     | None added                                                                                   |
| IX. Licensed assets       | ✅     | No assets                                                                                    |
| X. Memory maintained      | ✅     | D-011 logged; learnings for SwiftShader restore behaviour and three's restore internals      |
