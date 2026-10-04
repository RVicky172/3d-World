# 3D World — Architecture

**Last updated:** 2026-10-04 · Status: core framework (001), hash router (002) and gallery (003) implemented; camera controls pending (004)

---

## Concepts

- **Space**: one self-contained 3D experience (e.g. `demo-cube`, later `model-viewer`, `solar-system`).
  - _Single-object Space_: one focal object, camera orbits it.
  - _Multi-object Space_: many objects sharing a world and a clock (e.g. planets orbiting a sun).
- **Engine**: owns the single `WebGLRenderer`, the canvas, the overlay layer, the render loop and resizing. It lives for
  the whole session and renders whichever Space instance it is given. It never creates or disposes Spaces.
- **View**: whatever is on screen. A view is either a registry **Space** or the **gallery**. Both are built from the
  same `SpaceFactory` contract, so they share every lifecycle guarantee below. The gallery is not a Space and is
  not in the registry.
- **SpaceManager**: mounts views. `open(id)` loads a registry Space on demand; `openView(name, factory)` mounts
  any other view (the gallery). It disposes the previous view, coordinates the fade, and reports outcomes.
- **Registry**: a static list of Space metadata with lazy `import()` loaders. Nothing is loaded until it is opened.
- **Gallery**: the home page (`#/`). It shows a starfield backdrop and one card link per registry entry, built from
  metadata only, so browsing it loads no Space code.
- **HashRouter**: maps the URL hash to the view that should be showing (gallery or a Space) and asks the
  SpaceManager to open it.
  Deep links, Back/Forward and code navigation all go through it.

## Directory Layout

```text
src/
  main.ts                 # bootstrap: WebGL check → renderer → Engine → Fader → SpaceManager → gallery view + back link → HashRouter.start()
  core/
    types.ts              # the Space contract + RendererLike + OpenResult
    clock.ts              # Clock, createClock(), FakeClock: timestamps → { delta, elapsed }
    render-loop.ts        # RenderLoop: injectable Scheduler + VisibilitySource; pauses when hidden
    engine.ts             # Engine: renderer, canvas, overlay, resize, per-frame update/render
    space-manager.ts      # SpaceManager: open/close, ordering, supersession, errors, status attributes
    routes.ts             # pure: parseHash() / formatRoute() — the route grammar
    router.ts             # HashRouter: hash → Space, redirects, page title, navigate()
    debug.ts              # window.__WORLD__ test/dev hook (stripped from production)
    capabilities.ts       # hasWebGL2(), prefersReducedMotion()
  shared/
    dispose.ts            # disposeObject3D(): geometries, materials, textures (incl. uniforms, background)
  gallery/
    index.ts              # createGalleryView(): the gallery as a SpaceFactory (cards in overlay, starfield in scene)
    cards.ts              # renderGallery(): heading + list of card links; thumbnails with generated placeholder
    starfield.ts          # STARFIELD config, seeded Points backdrop (1 draw call, still with reduced motion)
  ui/
    back-link.ts          # permanent "Back to gallery" link, hidden on the gallery via data-view
    fader.ts              # Fader: opacity overlay hiding Space swaps (instant with reduced motion)
    messages.ts           # "Space not found" / "Failed to load" alerts in the overlay
    fallback.ts           # WebGL2-unavailable screen
  spaces/
    registry.ts           # spaces[] with lazy loaders, findSpace()
    <space-id>/
      index.ts            # default-exports a SpaceFactory; scene data as a typed config object
  styles/main.css         # tokens; stacking: canvas → .overlay → .fader → .back-to-gallery
scripts/
  bundle-checks.mjs       # pure bundle rules (unit-tested)
  check-bundle.mjs        # runs them on dist/ after `npm run build`
tests/
  helpers/fakes.ts        # FakeScheduler, FakeVisibility, createFakeRenderer, createFakeContext
  unit/                   # Vitest, mirrors src/ (+ scripts/)
  e2e/                    # Playwright; fixtures.ts fails tests on console errors; subpath.spec.ts runs on /3d-World/
public/
  assets/<space-id>/      # models, textures (licensed; see CREDITS.md)
```

## The Space Contract (`src/core/types.ts`)

```ts
export interface SpaceMeta {
  id: string; // URL-safe, unique: "solar-system"
  title: string;
  description: string;
  kind: 'single' | 'multi';
  thumbnail?: string; // path under public/
  load: () => Promise<{ default: SpaceFactory }>; // lazy import
}

export interface SpaceContext {
  renderer: WebGLRenderer; // the session's only renderer — never create another
  canvas: HTMLCanvasElement;
  overlay: HTMLElement; // DOM layer above the canvas for the Space's own UI
  reducedMotion: boolean;
  signal: AbortSignal; // aborted right before dispose(): use for listeners/fetches
}

export interface SpaceInstance {
  scene: Scene;
  camera: Camera;
  update(deltaSeconds: number, elapsedSeconds: number): void; // time comes only from here
  resize(width: number, height: number): void; // update camera aspect etc.; never called with 0
  render?(): void; // opt-in custom rendering (e.g. EffectComposer)
  dispose(): void; // free GPU + DOM + listeners
}

export type SpaceFactory = (ctx: SpaceContext) => Promise<SpaceInstance>;
export type OpenResult = 'opened' | 'not-found' | 'load-error' | 'superseded';
```

**Adding a Space:** create `src/spaces/<id>/index.ts` that default-exports a `SpaceFactory`, add one entry to
`src/spaces/registry.ts`, and add an E2E smoke test. `npm run build` verifies it is a lazy chunk.

## Time

- `RenderLoop` asks its `Scheduler` (`requestAnimationFrame` in the app) for frames and passes each timestamp to the
  `Clock`.
- `Clock.tick()` returns `delta`, the seconds since the last frame, clamped to `[0, 0.1]`. It also returns `elapsed`,
  the sum of the clamped deltas. `elapsed` is **Space time**: it does not advance while the loop is paused.
- When the tab is hidden, the loop stops scheduling frames. When the tab becomes visible again it calls
  `clock.reset()`, so the next frame gets `delta = 0` instead of the time spent hidden.
- Spaces must derive motion from `update(delta, elapsed)` only, never from `Date.now()` or `performance.now()`.
  `FakeClock.step(seconds)` drives them deterministically in tests.

## Rendering & Resizing (Engine)

On every frame, if a Space instance is set, the Engine:

1. calls `instance.update(delta, elapsed)`;
2. calls `instance.render()` if the Space defines it, otherwise `renderer.render(scene, camera)`.

If no instance is set, it calls `renderer.clear()` instead (clear colour = CSS `--bg`).

- **Pixel ratio:** `min(devicePixelRatio, 2)`.
- **Resizing:** a `ResizeObserver` watches `#app`. The Engine calls `renderer.setSize(w, h, false)` (CSS keeps sizing
  the canvas) and then `instance.resize(w, h)`, unless the width or height is 0.
- **New instance:** `setInstance()` immediately sizes the new Space to the current viewport.
- **First frame:** `nextFrame()` resolves after the next rendered frame. The SpaceManager uses it so a Space is only
  revealed once it has actually drawn.

### Post-processing (opt-in)

A Space that wants post-processing (for example bloom for the Sun):

- creates its own `EffectComposer(ctx.renderer)`;
- runs it from `render()`;
- resizes it in `resize()`;
- disposes it in `dispose()`.

The Engine knows nothing about composers. Because `EffectComposer` comes from `three/examples`, it lands in that
Space's lazy chunk, not the main bundle.

## Opening a View (SpaceManager)

`open(id)` (registry Space) and `openView(name, factory)` (e.g. the gallery) share one sequence:

```text
open(B) / openView('gallery', f)
  clear <body data-space-*>; set <body data-view="space" | "gallery"> immediately
  → fader.out()                       A still renders underneath
  → findSpace(B)                      unknown → close A, show "Space not found"  → 'not-found'
  → await load()                      rejects → close A, show "Failed to load"  → 'load-error'
  → A: abort signal, dispose(); engine.setInstance(null)   (never renders a disposed Space)
  → B = await factory(ctx)            throws  → show "Failed to load"           → 'load-error'
  → engine.setInstance(B) → await engine.nextFrame() → fader.in()
  → <body data-space-id="B" data-space-status="opened" data-space-ready="true">  → 'opened'
                                      (data-space-id only for registry Spaces)
```

- **`data-view`** is set when the request starts, not when it finishes, so chrome keyed off it, such as the back
  link, never flashes. "Space not found" and "Failed to load" count as `space` screens.
- **`activeView`** returns `gallery`, `space` or null. **`activeId`** returns the registry id, or null on the
  gallery.

- **Supersession:** every `open()`, `openView()` and `close()` takes a new sequence number, shared across views. After each `await`, an older request
  checks whether a newer one has started. If it has, it stops and returns `'superseded'`, and disposes any instance
  it had just created. Rapid switching therefore always ends on the most recent request.
- **Never throws:** `open()` reports every failure through its result. Load and factory errors are also sent to
  `console.error`. An unknown id is not treated as an error (decision D-006).
- **`close()`:** disposes the active Space, clears any message, and cancels any `open()` that is still running.

### Transition (Fader)

- The Fader is a full-screen element in the background colour. It fades its opacity over 300 ms.
- **Stacking inside `#app`:** canvas → `.overlay` (z 1, the view's DOM: gallery cards, Space UI, messages) →
  `.fader` (z 2) → `.back-to-gallery` (z 4). The fader hides the whole view, both its 3D and its DOM, while
  switching, so nothing half-removed is ever visible. Steady chrome sits above it.
- It starts covered at boot, so the first Space only fades in.
- With `prefers-reduced-motion`, swaps are instant.
- Its promises resolve on a timer rather than on `transitionend`, which doesn't always fire.

## Routing (HashRouter)

Addresses live in the URL hash, so the site works on any static host, including a sub-path such as
`/3d-World/` on GitHub Pages, with no server configuration.

### Route grammar (`src/core/routes.ts`)

```text
""  "#"  "#/"                       → home        → shows the gallery (003; replaced 002's default Space, D-008)
"#/space/<id>"  "#/space/<id>/"     → space(id)   → id is percent-decoded; malformed encoding keeps the raw id
anything else                       → unknown     → replaced with "#/" (no history entry left behind)
```

`parseHash()` never throws. `formatRoute()` is its inverse, and ids round-trip through encoding. Ids are
case-sensitive.

### Router rules (`src/core/router.ts`)

- **One path in:** Back/Forward, typed URLs, links and `navigate(id)` all arrive as `hashchange`, so none of them
  reload the page. `start()` handles the address the page loaded with.
- **Unknown routes:** `history.replaceState(…, '#/')`, then the router handles home directly, because
  `replaceState` fires no event.
- **Skip if already showing:** the router remembers the last requested view as a key, `gallery` or `space/<id>`
  (the two cannot collide). If a new route resolves to the same key (for example `#` ↔ `#/`), it does nothing. A failed open (`not-found` or `load-error`)
  clears this memory, so the same Space can be retried.
- **`navigate(id)`** assigns `location.hash`, which adds exactly one history entry. It does nothing if that Space is
  already showing. If the address is already correct after a failed open, it retries directly, because assigning the
  same hash fires no event.
- **Page title:** `"<Space title> — 3D World"` once a Space has opened, and `"3D World"` on the gallery and after
  not-found or load-error.
- **Stale results:** every request carries a sequence number. A result from an older request is ignored, even if
  it is not `superseded`. Combined with the SpaceManager's own supersession, rapid navigation always ends on the
  latest address.

### Startup

`main.ts` creates the `HashRouter` after the SpaceManager. It passes in `window.location`, `window.history`,
`window` (for events), `manager.open`, `openGallery` (which runs `manager.openView('gallery', createGalleryView(…))`),
titles from `findSpace()` and a setter for `document.title`, then calls `router.start()`. The temporary `?space=` parameter from 001 is gone, and query strings are ignored.

## Gallery (`src/gallery/`)

- **A view, not a Space:** `createGalleryView({ spaces, baseUrl })` returns a `SpaceFactory`. Mounted with
  `openView('gallery', …)`, it gets fades, disposal, supersession and the leak test for free. It imports registry
  **metadata** only, never Space modules, so the gallery downloads no Space code. The bundle check still verifies
  that Spaces are lazy chunks.
- **Cards:**
  - `<h1>`, then `<ul>`, then one `<li><a class="card" href="#/space/<id>">` per registry entry, in order.
  - Real links, so click, tap, Enter and Back work with no script.
  - Text is inserted as text, never as HTML.
- **Preview:**
  - `thumbnail` (a path under `public/`, joined with Vite's `BASE_URL`) is shown as `<img loading="lazy" alt="">`.
  - If there is no thumbnail, or it fails to load, a generated placeholder (kind icon + initials) takes its place.
  - The preview box has a fixed aspect ratio either way.
- **Starfield:**
  - 1500 seeded `Points` in a shell around the camera, with `sizeAttenuation: false`.
  - One draw call, no textures.
  - Rotation is a pure function of elapsed time, and it is still under reduced motion.
- **Accessibility:**
  - Cards sit on a solid `--surface`, so contrast never depends on the backdrop.
  - `:focus-visible` outlines.
- **Back to gallery:** a permanent link above the fader, hidden by CSS when `body[data-view="gallery"]`.

## Disposal Rules

A Space's `dispose()` must free everything it created: geometries, materials, textures, listeners, DOM elements and
composers.

- `disposeObject3D(scene)` from `src/shared/dispose.ts` covers geometries, materials (including material arrays),
  every `Texture` a material references, `ShaderMaterial` uniform textures, and `scene.background` and
  `scene.environment`. Shared resources are disposed once.
- Use `ctx.signal` for event listeners so they are removed automatically: it is aborted before `dispose()` runs.
- The E2E tests (001 AC-4, 003 AC-6) cycle a Space 10 times and assert that `renderer.info.memory` returns to its
  baseline. Take the baseline **after a warm-up visit** to a PBR Space: three.js creates a shared DFG lookup texture
  on the first physically based material and keeps it for the renderer's lifetime.

## Testability Seams

| Seam                   | Real                                          | In tests                                                                |
| ---------------------- | --------------------------------------------- | ----------------------------------------------------------------------- |
| Time                   | `createClock()`                               | `FakeClock`                                                             |
| Frames                 | `requestAnimationFrame`                       | `FakeScheduler.flush(now)`                                              |
| Visibility             | `document`                                    | `FakeVisibility.set('hidden')`                                          |
| Renderer (Engine)      | `WebGLRenderer`                               | `createFakeRenderer()` (`RendererLike`)                                 |
| Resize                 | `ResizeObserver`                              | injected `watchResize` callback                                         |
| Space context          | built by `SpaceManager`                       | `createFakeContext()`                                                   |
| Engine/Fader (Manager) | `Engine`, `Fader`                             | `ManagedEngine`, `Transition` fakes                                     |
| URL + history (Router) | `window.location`, `window.history`, `window` | `FakeBrowserLocation` (all three in one)                                |
| Gallery (unit)         | `createGalleryView` in `main.ts`              | injected test registry; `createFakeContext()`                           |
| Sub-path hosting (E2E) | GitHub Pages `/3d-World/`                     | Playwright `subpath` project: `VITE_BASE=/3d-World/` build on port 4174 |
| Running app (E2E)      | —                                             | `window.__WORLD__` in `npm run build:test` builds                       |

`window.__WORLD__` provides `open`, `close`, `navigate`, `activeId`, `memory` and `cameraAspect`. It is installed behind a
literal `import.meta.env.MODE !== 'production'` check, so production bundles drop it. `npm run build` verifies this.

## Multi-Object Pattern (Solar System, planned — features 020–023)

- The scene graph uses **pivots**: `Sun → orbitPivot(planet) → planetMesh → orbitPivot(moon) → moonMesh`.
- Positions come from pure functions in `orbit.ts`: `positionAt(orbitalElements, t)` returns a Vector3-like value.
  They are unit-tested without WebGL.
- `data.ts` holds each body's radius, distance, period, tilt and texture path. A `scaleMode` setting maps real values
  to display values.
