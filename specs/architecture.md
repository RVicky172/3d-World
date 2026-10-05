# 3D World — Architecture

**Last updated:** 2026-10-05 · Status: core framework (001), hash router (002), gallery (003), camera controls (004) and resilience + reduced motion (005) implemented

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
  main.ts                 # bootstrap: WebGL check + renderer (or fallback) → startApp(): motion watcher → Engine → Fader → loading indicator → info panel + preference → SpaceManager → gallery view + back link → ContextGuard → HashRouter.start()
  core/
    progress.ts           # pure: clampProgress(), announcementFor() — download progress rules (011)
    preferences.ts        # readPreference()/writePreference(): JSON in localStorage, never throws (012)
    types.ts              # the Space contract + RendererLike + OpenResult
    clock.ts              # Clock, createClock(), FakeClock: timestamps → { delta, elapsed }
    render-loop.ts        # RenderLoop: injectable Scheduler + VisibilitySource; pauses when hidden
    engine.ts             # Engine: renderer, canvas, overlay, resize, per-frame update/render
    space-manager.ts      # SpaceManager: open/close, ordering, supersession, errors, status attributes
    routes.ts             # pure: parseHash() / formatRoute() — the route grammar
    router.ts             # HashRouter: hash → Space, redirects, page title, navigate()
    debug.ts              # window.__WORLD__ test/dev hook (stripped from production)
    capabilities.ts       # hasWebGL2(), createRendererOrNull(), watchReducedMotion(), prefersCoarsePointer()
    context-guard.ts      # ContextGuard: WebGL context lost → suspend + message; restored → rebuild the view (005)
  shared/
    controls/
      index.ts            # createCameraControls(): OrbitControls + our keyboard + limits + turntable + UI
      keyboard.ts         # keyAction() mapping; orbitStep/zoomStep/panStep (pure Spherical maths)
      turntable.ts        # idle auto-orbit state, advanced only by delta; hold() (012)
      turn.ts             # pure: easeTurn(), turnStep() — great-circle turn of a view direction (012)
      controls-ui.ts      # fading hint, "?" help disclosure, "Reset view" button
      types.ts            # CameraControlsConfig, CameraControlsOptions, CameraControls
    model-viewer/
      index.ts            # createModelViewer(): load GLB → centre → studio environment → controls → credit (010)
      loader.ts           # createGltfLoader(): Meshopt + KTX2, transcoder ready before parsing, progress (011)
      framing.ts          # pure: frameDistance(), distanceLimits(), fitModel()
      credit.ts           # visible asset credit line (.model-credit)
      types.ts            # ModelViewerConfig, AssetCredit (SPDX licence ids)
    hotspots/
      index.ts            # createHotspots(): marker buttons, one annotation, per-frame placement + dimming (012)
      projection.ts       # pure: toScreen() — world point → CSS px of the canvas, visible flag
      occlusion.ts        # createOcclusion(): throttled any-hit ray test over a world-space triangle copy (D-021)
      types.ts            # HotspotConfig
    dispose.ts            # disposeObject3D(): geometries, materials, textures (incl. uniforms, background)
  gallery/
    index.ts              # createGalleryView(): the gallery as a SpaceFactory (cards in overlay, starfield in scene)
    cards.ts              # renderGallery(): heading + list of card links; thumbnails with generated placeholder
    starfield.ts          # STARFIELD config, seeded Points backdrop (1 draw call, still with reduced motion)
  ui/
    back-link.ts          # permanent "Back to gallery" link, first in the DOM (Tab order); hidden on the gallery
    fader.ts              # Fader: opacity overlay hiding Space swaps (instant with reduced motion)
    messages.ts           # "Space not found" / "Failed to load" alerts in the overlay
    fallback.ts           # WebGL2-unavailable screen (sets data-webgl="unavailable")
    context-lost.ts       # "The 3D view stopped" alert with a Reload button (005)
    loading.ts            # createLoadingIndicator(): "Loading <title>…", bar + % (011), "<title> loaded" announcer
    info-panel.ts         # createInfoPanel(): the Space's title + description, collapsible region (012)
  spaces/
    registry.ts           # spaces[] with lazy loaders, findSpace()
    <space-id>/
      index.ts            # default-exports a SpaceFactory; scene data as a typed config object
      data.ts             # typed scene data (e.g. sheen-chair: ModelViewerConfig, incl. hotspots)
    solar-system/         # 020: the multi-object Space
      data.ts             # BODIES (16, from JPL), SOURCES, REAL_UNIT_KM, STYLISED constants, SOLAR_SYSTEM view
      types.ts            # BodyData, OrbitalElements, ScaleMode, BodyLayout, DataSource
      scale.ts            # pure: layout(bodies, mode), placeBodies(), worldPositions(), systemExtent()
      scene.ts            # buildSystem(): pivot groups + one shared sphere + Sun light; applyLayout()
      markers.ts          # createBodyMarkers(): real-scale name labels, moon rule, declutter, nearest()
      scale-toggle.ts     # createScaleToggle(): "True scale" button + polite scale description
      index.ts            # createSolarSystem(): ties them together; re-centring zoom; dynamic near/far
  styles/main.css         # tokens; stacking: canvas → .overlay → .fader → .loading / .context-lost → .back-to-gallery
scripts/
  bundle-checks.mjs       # pure bundle rules (unit-tested): entry budget, per-Space 5 MB (code + assets + emitted decoders)
  check-bundle.mjs        # runs them on dist/ after `npm run build`
  asset-pipeline.mjs      # pure pipeline rules (unit-tested): manifest validation, texture modes, output checks (011)
  assets.config.mjs       # which models `npm run assets` converts, and how
  build-assets.mjs        # `npm run assets`: assets-src/ → Meshopt + KTX2 GLB in public/assets/ (dev only)
assets-src/<space-id>/    # original, uncompressed models; NOT deployed (011, D-017)
tests/
  helpers/fakes.ts        # FakeScheduler, FakeVisibility, createFakeRenderer, createFakeContext
  unit/                   # Vitest, mirrors src/ (+ scripts/)
  e2e/                    # Playwright; fixtures.ts fails tests on console errors; subpath.spec.ts runs on /3d-World/
                          # workers capped at min(4, cores/4), override with E2E_WORKERS (D-015)
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
  reportProgress?(fraction: number | null): void; // download progress (011)
  startTime: number; // wall-clock ms at this open, read by the core (021, Q1)
  savedState?: unknown; // the Space's saveState() from before a context loss; only on that rebuild (021, AC-12)
}

export interface SpaceInstance {
  scene: Scene;
  camera: Camera;
  update(deltaSeconds: number, elapsedSeconds: number): void; // time comes only from here
  resize(width: number, height: number): void; // update camera aspect etc.; never called with 0
  render?(): void; // opt-in custom rendering (e.g. EffectComposer)
  focusTarget?(context: { previousSpaceId: string | null }): HTMLElement | null; // where focus lands on a switch (004 AC-13)
  hotspotPositions?(): Array<{ id: string; world: [number, number, number] }>; // test seam (012 AC-6)
  bodies?(): Array<{ id; world; radius; quaternion? }>; // test seam (020; orientation 021)
  saveState?(): unknown; // carried across a context loss (021)
  simTime?(): { days: number; speed: number; playing: boolean }; // test seam (021)
  setSimTime?(days: number): void; // test seam (021)
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
- **A Space that needs "today" (021)** gets `SpaceContext.startTime`: the core's `wallClock()` read once per open
  (`Date.now` in `main.ts`, a constant in tests). The Space's own simulated clock then moves only by `delta`.

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
  → start loading timer (250 ms)      fires → loading.show(title)   (010)
  → await load()                      rejects → close A, show "Failed to load"  → 'load-error'
  → A: abort signal, dispose(); engine.setInstance(null)   (never renders a disposed Space)
  → B = await factory(ctx)            throws  → show "Failed to load"           → 'load-error'
                                      (a model Space downloads its GLB here, so asset errors land here too;
                                       ctx.reportProgress(f) moves the indicator's bar, 011)
  → registry Space: infoPanel(overlay, { title, description }) from the registry, prepended (012)
  → loading.ready() if it was shown   says "<title> loaded" (011, D-019); else just hide()
                                      failures, supersession, suspend() and close() always hide() silently
  → engine.setInstance(B) → restore lost focus (not on the first view) → await engine.nextFrame() → fader.in()
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
- **Info panel (012, AC-1–AC-4):** optional `infoPanel` factory, called after a registry Space's factory with
  its **registry** title and description (the gallery card's strings, so they can't drift). The panel prepends
  itself to the overlay, so its toggle follows the 3D view in Tab order. `release()` disposes it with the view: on
  unmount, failure, supersession, `suspend()` and `close()`. The gallery gets none. See Info Panel below.
- **`close()`:** disposes the active Space, clears any message, and cancels any `open()` that is still running.
- **Start time and saved state (021, AC-8, AC-12):** each factory call gets `startTime: wallClock()`. `suspend()`
  asks a mounted view for `saveState?.()` (a throw is logged and treated as none); `resume()` passes it as
  `savedState`. One state per target: kept while the rebuild is still loading (a second loss doesn't lose it),
  dropped by any other `open()`, `openView()` or `close()`. A normal open never gets one (Q8).
- **Loading indicator (010, AC-8):** optional `loading` (from `createLoadingIndicator()`) and `loadingDelayMs`
  (default 250 ms). The timer starts **after** the fade-out, so ordinary fades never show it, and a view that is
  ready sooner never shows it. It reads "Loading <registry title>…" (the view's label for the gallery), is a
  `role="status"`, `aria-live="polite"` element, and its pulse is off under reduced motion.
- **Progress (011, AC-8–AC-11):** `SpaceContext.reportProgress?(fraction | null)` is bound to the request's
  token, so a superseded, finished or suspended request can't move the bar. Values from before the 250 ms show
  are kept and applied when it appears.
  - The indicator turns determinate on the first value: a visible, `aria-hidden` "Loading <title>… 42 %" and a
    `role="progressbar"` bar. Its spoken label (visually hidden from then on) changes only at 25/50/75 %
    (`announcementFor`). Values never go backwards (`clampProgress`), and a null (unknown total) keeps 010's
    look. The bar doesn't ease under reduced motion.
  - **`ready()`** (D-019): a persistent, visually hidden `.loading-announcer` polite region says "<title>
    loaded". It's created on `show()` (live regions must exist before their text changes) and cleared on the
    next show. Only `SpaceManager`'s success path calls it, and only after a shown indicator.

### Transition (Fader)

- The Fader is a full-screen element in the background colour. It fades its opacity over 300 ms.
- **DOM order inside `#app`:** back link → canvas → overlay → fader. The back link is prepended so that Tab order
  matches the layout (back link → 3D view → view controls); z-index, not DOM order, decides what is drawn on top.
- **Stacking inside `#app`:** canvas → `.overlay` (z 1, the view's DOM: gallery cards, Space UI, messages) →
  `.fader` (z 2) → `.loading` and `.context-lost` (z 3, 010/005) → `.back-to-gallery` (z 4). Inside the overlay
  (012): hotspot markers → `.info` (z 1) → a focused or open marker and the annotation (z 2). The fader hides the whole view, both its 3D and its DOM, while
  switching, so nothing half-removed is ever visible. Steady chrome sits above it.
- It starts covered at boot, so the first Space only fades in.
- With `prefers-reduced-motion`, swaps are instant. The preference is read on every fade, so a change made while the
  page is open applies to the next swap (005).
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
- **Focus target:** the card of the Space just left, else the `<h1>` (`tabindex="-1"`, no outline).

## Focus Management (004 AC-13)

Removing a view's DOM can strand keyboard focus. Chrome also keeps its Tab starting point where the removed
element was. So after mounting a view, the SpaceManager checks whether focus is lost: on `<body>`, disconnected,
or not visible per `checkVisibility()`. If it is, the manager focuses `instance.focusTarget({ previousSpaceId })`.

- A Space with controls returns its 3D view (the labelled canvas).
- The gallery returns the card of the Space just left.
- Never on the first page view, and never away from a still-visible focused element (002's "focus is not
  stolen").

## Camera Controls (`src/shared/controls/`, 004)

A Space opts in by calling `createCameraControls({ camera, canvas, overlay, signal, reducedMotion, coarsePointer,
label, config })` in its factory. It calls `controls.update(delta)` from `update()` and `controls.dispose()` from
`dispose()`. The module ships only in Spaces' lazy chunks.

- **Config (data):** focus point, initial position, distance and polar limits, pan limit, turntable speed and idle
  delay, and optional keyboard steps.
- **Mouse and touch: three's `OrbitControls`.**
  - Drag orbits; wheel or pinch zooms; right-drag, Shift + drag or a two-finger drag pans.
  - The pan limit uses `cursor` + `maxTargetRadius`.
  - It sets `touch-action: none` on the canvas while mounted.
- **Keyboard: our own handler on the canvas.** It is active only while the canvas has focus.
  - Arrows orbit, Shift + arrows pan, `+`/`=`/`-` zoom, `R` resets. Ctrl, Meta and Alt combinations are left to
    the browser.
  - We don't use OrbitControls' keys: they map the other way round and have no zoom or reset.
  - Each step moves the camera, then calls `controls.update()` so every limit applies.
- **Focusable 3D view:** while mounted, the canvas has `tabindex="0"`, `role="application"`, an `aria-label` naming
  the Space and its keys, and a `:focus-visible` ring. All of these are removed on dispose.
- **Turntable:** an idle auto-orbit through `autoRotate` + `update(delta)`, so it is deterministic by Space time.
  - It stops on any interaction (the controls' `start`/`end` events, keys, reset) and resumes after `idleDelay`.
  - It is off under reduced motion, as is damping.
- **`turnTo(direction, { duration = 0.6 })` (012, AC-9):** turns the camera round the focus to look from
  `direction` at the current distance, clamped to the polar limits; a panned target eases back to the focus.
  Pure maths in `turn.ts` (`turnStep`: great-circle rotation with smoothstep easing, a fixed perpendicular for
  opposite directions). Advanced in `update(delta)`, instant under reduced motion, cancelled by any input or
  `reset()`, and it sets `userMoved`. It counts as an interaction, so the turntable's idle delay restarts.
- **`holdTurntable(hold)` (012, AC-12):** keeps the turntable idle while held (an open annotation); releasing
  restarts the idle delay.
- **`focusOn(point, { minDistance? })` (020, D-023):** moves the orbit target to `point` and keeps the camera
  where it is, so the view turns to it. Instant; counts as an interaction. `minDistance` replaces the home view's
  closest distance until `reset()`, which restores it; a resize while focused keeps the focus limit.
- **`zoomSpeed` config (020):** OrbitControls' wheel/pinch zoom speed (default 1).
- **`follow(delta)` (021, AC-10):** moves camera and target together by any `{ x, y, z }` (a reused vector, no
  per-frame allocation). Not an interaction: `userMoved` and the turntable are untouched. It doesn't call
  `update()` itself (that would flush the visitor's damping every frame); the frame's `update()` applies the limits.
- **Reset:** flush in-flight damping (one `update()` with damping off), then `OrbitControls.reset()` to the saved
  initial state. Without the flush, the reset drifts.
- **UI (`ctx.overlay`):**
  - a hint, announced politely and dismissed after 4 s of Space time or on the first interaction;
  - a "?" disclosure (`aria-expanded`/`aria-controls`, Esc closes it and returns focus) listing mouse, touch and
    keyboard controls;
  - a "Reset view" button.

  Overlay children take their own pointer events, so the UI never moves the camera.

- **Bundle note:** OrbitControls stays in the lazy chunk, but the three core classes it uses join the shared
  `three` module that the entry loads (+1.4 KB for 004, D-010).

## Model Viewer (`src/shared/model-viewer/`, 010–011)

"One object, many angles". A model Space is its data plus one line, `(ctx) => createModelViewer(ctx, CONFIG)`
(D-012). The viewer and three's `GLTFLoader` ship only in lazy chunks, but the three core classes they use join the
shared `three` module (+8.3 KB entry, D-013).

- **Order:** load the GLB from `BASE_URL + model.path` **first**, so a failed download allocates nothing and
  rejects into "Failed to load" (AC-9). The loader is disposed as soon as loading settles (011) → `fitModel()` centres the model on the origin and returns its
  bounding-sphere radius `r` → studio environment → camera → hotspots (if the data has any, 012) → shared
  controls → credit line. The hotspot layer goes in before the controls so markers precede "?" and "Reset view"
  in Tab order; it reaches the controls through a small proxy, used only once both exist.
- **Per frame:** `controls.update(delta)`, then `hotspots.update(delta)`, so markers match this frame's camera.
  `resize()` also resizes the hotspots; `dispose()` disposes them first.
- **Framing (pure, `framing.ts`):** `frameDistance(r, fovY, aspect, fill)` puts the sphere at `fill` of the
  smaller viewport dimension (portrait by width, landscape by height). Limits: `min = 1.2 r` (never inside),
  `max = frameDistance(…, 0.1)` (the sphere never below 10 %, D-016). Near/far planes are `r/100` and `100 r`.
  - The bounding sphere over-estimates open shapes, so data can raise `fill` (sheen-chair uses 0.85).
- **Resize:** until the visitor moves the camera (`controls.userMoved`), the view re-frames along its current
  direction. Afterwards only the home changes, so Reset frames for the new size. Both go through the additive
  controls API `setHome({ position, distance, panLimit })`.
- **Lighting:** three's procedural `RoomEnvironment`, baked once by `PMREMGenerator` into `scene.environment` (no
  HDRI asset). The background stays null, showing the site's `--bg`. The PMREM result is a render-target texture,
  so disposing it also disposes its render target (see Disposal Rules).
- **Credit (`credit.ts`, AC-13):** `.model-credit`, bottom-left in the overlay and clear of the controls bar: one
  line per asset, "<title> by <author> · <licence>", the title linking to the source.
- **Data (`ModelViewerConfig`):** title, model path, camera FOV + direction, optional `fill`, turntable, and
  `assets[]` (path, title, author, SPDX licence, source). A unit test checks every asset against `CREDITS.md`.
- **Loader (`loader.ts`, 011):** `GLTFLoader` + `MeshoptDecoder` (`EXT_meshopt_compression`; JS with embedded
  WASM, bundled in the lazy chunk) + `KTX2Loader` (`KHR_texture_basisu`; `detectSupport(renderer)`, 2 workers).
  - **Self-hosted transcoder, no config:** the transcoder path is left unset. three finds
    `basis_transcoder.js/.wasm` via `new URL(…, import.meta.url)`, so Vite emits them as hashed build assets
    (manifest `assets` of the chunk), and the dev server serves them from `node_modules`. Entry +0.8 KB.
  - **`load()`:** `Promise.all([FileLoader download (arraybuffer, progress), ktx2.init()])`, then
    `gltf.parseAsync(bytes, urlBase)`. GLTFLoader swallows texture errors (it logs them and renders
    untextured), so the transcoder must be ready before parsing for a failure to reach "Failed to load".
    Parsing after both succeed also keeps a failed `init()` from leaving a background parse logging errors.
  - **`dispose()`** ends the transcoder workers. The viewer calls it in a `finally` right after `load()`:
    workers are idle once textures are transcoded, so they never pile up, and two loaders are never active at
    once (KTX2Loader warns about that).
- **Budget:** `check-bundle.mjs` sums each Space's own lazy code (gzipped), `public/assets/<id>/`, and the files
  its lazy chunks emit (the transcoder, stored size, since hosts may not gzip `.wasm`), and fails the build over
  5 MB (010 AC-12, 011 AC-6). sheen-chair: 55 KB + 1.26 MB + 571 KB = 1.87 MB (012).

## Info Panel (`src/ui/info-panel.ts`, 012)

Every registry Space shows its title and description without leaving the view (AC-1). It lives in the core (the
SpaceManager mounts it), so a Space can't forget it.

- **DOM:** `.info` holds a toggle `<button aria-expanded aria-controls>` and a `<section aria-labelledby>` region
  with the title as `<h2>` and the description as `<p>`. The toggle reads "Hide info" when open and
  "About <title>" when collapsed, so the title stays reachable. State lives in `aria-expanded` (TypeScript types
  `hidden` as `boolean | "until-found"`).
- **Remembered choice:** `main.ts` passes `open: readPreference('world.infoPanel.open', true)` and writes on
  toggle. `src/core/preferences.ts` stores JSON in `localStorage`, wrapped in try/catch; any failure falls back.
  The project's only `localStorage` use: a UI preference (Constitution II).
- **Layout (CSS only):** above 640 px, a side panel top-right, `min(20rem, 40vw)` wide. At or below it, a bottom
  sheet above the controls row (`bottom: 72px`, raised above a model credit with `.overlay:has(.model-credit)`,
  `max-height: 35vh`), and the controls hint moves to the top (AC-3). Only the toggle and card take pointer
  events, so the panel never moves the camera.

## Hotspots (`src/shared/hotspots/`, 012)

Markers on points of a model that open short annotations (AC-5–AC-12). Data: `HotspotConfig { id, title, text,
position, view }` in the Space's `data.ts`; `position` is in the model's own (glTF) coordinates, so it survives
`fitModel()` centring, and `view` is the direction to look from. Array order is the Tab order.

- **Markers:** one `<button class="hotspot" aria-label="Hotspot: <title>" aria-expanded aria-controls>` each,
  a 44 px hit area around an 18 px dot, in a `.hotspots` layer with `pointer-events: none` (drags between markers
  reach the 3D view, AC-11).
- **Per frame (`update(delta)`):** `camera.updateMatrixWorld()` first (the controls move the camera but not its
  matrix). If the camera, projection, size or occlusion changed: project every point (`toScreen()`, read
  phase), then write only what changed (`transform: translate(x, y)`, `hidden`, dimming). Nothing is written
  otherwise. Points behind the camera are hidden.
- **Occlusion (AC-7, D-021):** a ray from the camera to each point stops `0.01 r` short of it; any hit means
  the model hides it. three's `Raycaster` took 8.2 ms per pass on the chair, so `occlusion.ts` copies the
  model's triangles once into a world-space `Float32Array` (the model holds still, D-009; 1.4 MB for the chair,
  dropped on dispose) and runs an early-exit, double-sided Möller–Trumbore test: 0.7 ms per pass. It runs only
  after the camera moves, at most every 0.1 s of Space time. Hidden points' markers get `disabled` +
  `.is-dimmed`: visible, not focusable, drags pass through. If the focused marker dims, focus moves to the canvas.
- **Annotation (AC-8):** one `<section class="hotspot-annotation" aria-labelledby>` (title `<h3>`, text, Close)
  inside an always-present `aria-live="polite"` wrapper, which the markers' `aria-controls` point at. It sits
  beside its marker, or below/above it when neither side fits (phones), clamped into the viewport, and follows
  the marker. Its size is read once per open.
- **Activation:** open → `controls.turnTo(view)` + `holdTurntable(true)`; opening another keeps the hold. Close
  (Escape on the layer, Close, or the marker again) → `holdTurntable(false)` and focus back to the marker (or
  the canvas if it has dimmed).
- **Stacking:** markers sit under `.info`; a focused or open marker comes above it, so focus is never hidden
  (WCAG 2.4.11); the annotation is on top.
- **Lifecycle:** `dispose()` aborts listeners (also on `ctx.signal`), removes the layer and drops the triangle
  copy. No GPU resources: markers are DOM.

## Tab Order inside a Space (004, 012)

Back link → 3D view (canvas) → info panel toggle → hotspot markers that aren't dimmed, in data order → the open
annotation's Close → "?" → "Reset view" → the model credit's link. The Solar System puts "True scale" and its
time controls between the info toggle and "?" (020–021). The core prepends the panel; the viewer adds
the hotspot layer before the controls; the credit is appended last.

## Asset Pipeline (`npm run assets`, 011)

Originals live in `assets-src/<space-id>/` (in git, not deployed). `npm run assets` (`scripts/build-assets.mjs`,
dev-only tooling: glTF-Transform, meshoptimizer, ktx2-encoder, sharp; D-018) converts every entry in
`scripts/assets.config.mjs` and writes `public/assets/…`. Its output is committed, so build, tests and deploy
never run the encoder.

- **Steps per model:** `dedup` → `prune` → `weld` → each texture, one at a time: an optional per-slot resize
  (`maxSize`, e.g. the chair's `normalTexture: 512`), then `encodeToKTX2`. Colour slots get ETC1S (perceptual,
  sRGB); data slots (normal, ORM, roughness) get UASTC + Zstandard. A texture shared by both gets the data mode.
  Then `KHR_texture_basisu` is marked required, and `meshopt({ level: 'medium' })` runs.
- **Output checks (`checkOutput`):** under `maxBytes`, no source extension lost (sheen, texture transform,
  variants), Meshopt and Basis present, and **every texture `image/ktx2`**. glTF-Transform's `ktx2()` transform
  only warns on failure, which is why the pipeline encodes per texture and checks afterwards. Any problem exits 1
  naming the model.
- **Deterministic:** two runs give byte-identical files. Chair: 4 029 KB → 1 286 KB in ~8 s.
- **Adding a model:** put the original in `assets-src/<id>/`, add a manifest entry (`maxBytes`, texture modes,
  optional caps), run `npm run assets`, add the CREDITS row (marked "converted"), and commit both files.

## Resilience & Reduced Motion (005)

- **Boot:** `main.ts` creates the renderer only if `hasWebGL2()`, through `createRendererOrNull()`, because the
  constructor can still throw. With no renderer, `renderWebGLFallback()` replaces `#app` and sets
  `<body data-webgl="unavailable">`; nothing else starts. `index.html` has a `<noscript>` message.
- **Context loss (`ContextGuard`):** "suspend on loss, rebuild on restore".
  - **On `webglcontextlost`:** `engine.stop()` → `manager.suspend()`, which disposes the view while every GL call
    is a harmless no-op. The "3D view stopped" panel appears and `data-webgl="lost"` is set.
  - **On `webglcontextrestored`:** the panel and the signal are removed, then `engine.start()` →
    `manager.resume()`, which rebuilds the last requested view from scratch through the normal open path.
  - **Why rebuild:** three re-creates its internal caches on restore, so nothing from the old context is reused.
    three itself calls `preventDefault()` on loss so the browser may restore.
  - **If the context never comes back:** the panel's Reload button reloads the page.
- **`SpaceManager.suspend()` / `resume()`:**
  - `suspend()` works like `close()`, but remembers the latest requested target, even one still opening, and keeps
    `data-view`.
  - `resume()` re-runs that target; `close()` forgets it.
- **Reduced motion:** `watchReducedMotion()` follows the media query's `change` event for the page's lifetime.
  - The Fader reads it per fade and the SpaceManager per view (`SpaceContext.reducedMotion`). JS-driven motion
    (turntable, damping, starfield) therefore follows from the next view opened.
  - CSS `@media (prefers-reduced-motion)` rules follow immediately.
  - There is no on-page toggle (D-011).
- **Body signals:** `data-webgl` is absent when healthy, `unavailable` after a failed boot, and `lost` while the
  context is gone.

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
- **Render-target textures** (e.g. a `PMREMGenerator` result) are freed only by `renderTarget.dispose()`;
  `texture.dispose()` alone leaks them. Keep the target and dispose it with the texture (010 AC-10).

## Testability Seams

| Seam                          | Real                                                       | In tests                                                                                     |
| ----------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Time                          | `createClock()`                                            | `FakeClock`                                                                                  |
| Frames                        | `requestAnimationFrame`                                    | `FakeScheduler.flush(now)`                                                                   |
| Visibility                    | `document`                                                 | `FakeVisibility.set('hidden')`                                                               |
| Renderer (Engine)             | `WebGLRenderer`                                            | `createFakeRenderer()` (`RendererLike`)                                                      |
| Resize                        | `ResizeObserver`                                           | injected `watchResize` callback                                                              |
| Space context                 | built by `SpaceManager`                                    | `createFakeContext()`                                                                        |
| Engine/Fader (Manager)        | `Engine`, `Fader`                                          | `ManagedEngine`, `Transition` fakes                                                          |
| URL + history (Router)        | `window.location`, `window.history`, `window`              | `FakeBrowserLocation` (all three in one)                                                     |
| Camera controls (unit)        | OrbitControls on the real canvas                           | real OrbitControls on a jsdom canvas; keyboard/wheel events; `FakeClock`-style deltas        |
| Touch input (E2E)             | fingers                                                    | `touchGesture()`: CDP `Input.dispatchTouchEvent` (Chromium)                                  |
| Gallery (unit)                | `createGalleryView` in `main.ts`                           | injected test registry; `createFakeContext()`                                                |
| Sub-path hosting (E2E)        | GitHub Pages `/3d-World/`                                  | Playwright `subpath` project: `VITE_BASE=/3d-World/` build on port 4174                      |
| Running app (E2E)             | —                                                          | `window.__WORLD__` in `npm run build:test` builds                                            |
| Context loss                  | GPU/driver reset on the renderer's canvas                  | unit: `EventTarget` canvas + fake engine/manager; E2E: `__WORLD__.loseContext()`             |
| Motion preference             | `matchMedia('(prefers-reduced-motion: reduce)')`           | unit: fake `MediaQueryList` (`EventTarget` + `matches`); E2E: `page.emulateMedia()`          |
| No WebGL2 / no renderer (E2E) | the browser                                                | init script patching `HTMLCanvasElement.prototype.getContext`                                |
| Model loading (unit)          | `createGltfLoader`, PMREM studio environment, BASE_URL     | `ModelViewerDeps`: stub `createLoader`, `createEnvironment`, `baseUrl`                       |
| Loader parts (unit)           | `FileLoader`, `KTX2Loader`, `GLTFLoader`, `MeshoptDecoder` | `LoaderParts` fakes passed to `createGltfLoader(renderer, parts)`                            |
| Download progress (E2E)       | a slow network                                             | CDP `Network.emulateNetworkConditions` + a MutationObserver log                              |
| Decoder workers (E2E)         | KTX2Loader's worker pool                                   | `page.workers()` / `page.on('worker')`                                                       |
| Visual parity (E2E)           | the original model                                         | `page.route` serving `assets-src/…`; `canvasRgba()` + `meanPixelDifference()`                |
| Slow / failed download (E2E)  | the network                                                | `page.route()` delaying or aborting the GLB, the transcoder, or serving a corrupt file       |
| Framing and lighting (E2E)    | what the visitor sees                                      | `contentBounds()`: drawing-buffer bounds, fill of the smaller side, mean luminance           |
| Preferences (unit)            | `window.localStorage`                                      | an injected `Storage` (incl. one that throws)                                                |
| Marker placement (E2E)        | the hotspot module's own projection                        | `__WORLD__.hotspots()` + `cameraPose()` + `cameraProjection()`, projected with three in Node |
| Hotspot controls (unit)       | `turnTo` / `holdTurntable` of the shared controls          | `vi.fn()` controls; real camera and three meshes for occlusion                               |
| Solar system bodies (E2E)     | the Space's own drawing and markers                        | `__WORLD__.bodies()` + `cameraPose()` + `cameraProjection()`, projected with three in Node   |
| Scale preference (unit)       | `window.localStorage`                                      | `memoryStorage()` (`tests/helpers/fakes.ts`) via `SolarSystemDeps.storage`                   |
| Pointer events (unit)         | `PointerEvent`, pointer capture                            | `MouseEvent` with `pointerId`/`pointerType` defined; stubbed `setPointerCapture` (jsdom)     |
| Touch re-centring (E2E)       | fingers landing on a marker                                | `touchGesture(page, fingers, 0)`: touch start and end, no moves                              |
| Wall clock (core, 021)        | `Date.now` passed to `SpaceManager({ wallClock })`         | a constant; `createFakeContext()` has `startTime` 2026-10-05                                 |
| Simulated time (E2E, 021)     | the time controls and `update(delta)`                      | `__WORLD__.simTime()` / `setSimTime(days)`; speeds measured against `performance.now()`      |
| Orbit accuracy (unit, 021)    | JPL ephemerides                                            | `tests/fixtures/horizons-positions.json` (dev-only `scripts/fetch-reference-positions.mjs`)  |
| Moving markers (E2E, 021)     | markers and bodies in the same frame                       | camera, `bodies()` and marker dots read in one `page.evaluate`, projected in Node            |

`window.__WORLD__` provides `open`, `close`, `navigate`, `activeId`, `memory`, `cameraAspect`, `cameraPose`,
`cameraProjection`, `hotspots`, `bodies`, `simTime` / `setSimTime` (021), and `loseContext` / `restoreContext` (three's `forceContextLoss/Restore`; restore only after `data-webgl="lost"`). It is installed behind a
literal `import.meta.env.MODE !== 'production'` check, so production bundles drop it. `npm run build` verifies this.

## Solar System (`src/spaces/solar-system/`, 020–021)

The first multi-object Space: the Sun, eight planets and the seven moons ≥ 1 000 km (D-022), stylised or true to
scale, moving on their orbits as a simulated clock runs (021). 022 adds surfaces, 023 selection and facts.

- **Data (`data.ts`):** 16 `BodyData` records copied from JPL (Horizons physical data, planetary physical
  parameters, J2000 approximate elements, satellite mean elements; NSSDC was unreachable), each with its source
  listed in `SOURCES` and `CREDITS.md`. Planets carry full J2000 elements and moons their mean elements, so 021
  only adds maths. Rotation periods are positive; a tilt over 90° means a backwards spin (IAU). A unit test checks
  every orbit against Kepler's third law (all within 0.75 %). 021 adds JPL Table 1 rates per century, NAIF
  `pck00011` poles and prime meridians (Mars's 71 000-year term folded in at J2000), and moons' apsis/node periods;
  Titan's epoch mean anomaly is fitted to Horizons (D-026). `displayAngleDeg` is no longer used for placement.
- **Scales (`scale.ts`, pure):**
  - **Real:** 1 unit = 10⁶ km for every radius and distance.
  - **Stylised:** radius `(r / R⊕)^0.25` (Sun capped at 3). Moons on their own rings by true order. Planets on
    packed rings, each clear of its neighbours at any angle, plus `1.5 · ln(aᵢ / aᵢ₋₁)` so wider true gaps stay
    wider. The system extent is ≈ 57 units; at the home view every body is ≥ 3.3 px at 1280 × 720 and ≥ 1.6 px at
    320 × 640 (unit-tested with a real perspective camera).
- **Simulated time (`time.ts`, 021):** `days` since J2000 (UTC), four speeds (1 day/week/month/year per second),
  forwards or backwards, clamped to 1800-01-01 … 2050-12-31 (pauses at a limit and reports it once). A new visit
  starts at `startTime`, 1 week/s, paused under reduced motion. `formatDate` ("12 Mar 2031") and `isoDate` in UTC.
- **Orbit maths (`orbit.ts`, 021, pure, output parameters):**
  - **Planets:** Table 1 elements + rates, Kepler by Newton, rotated into heliocentric ecliptic J2000 km. Within
    0.17° and 0.13 % of Horizons at 7 dates (1800–2050).
  - **Moons (D-026):** mean longitude at the NAIF synchronous spin rate `|Ẇ|`, apsis and node precession (the
    node advancing on a retrograde orbit), angles on the planet's equator from its ascending node on the J2000
    equator. Worst: Moon 1.4°, Galileans 2.1°, Titan 5.2°, Triton 25.1° (AC-3 allows Triton 30°).
  - **Spin:** local +Y on the NAIF pole, +X at the prime meridian `W0 + Ẇ·d`; a body spinning faster than one turn
    per real second holds `W0` (Q6), and a paused one shows its true `W`. Moons face their planet (+X towards it,
    +Y along the orbit normal) at any speed.
  - **Frames:** scene x = ecliptic X, y = ecliptic Z (north), z = −ecliptic Y (`toScene`).
- **Per-date placement (`scale.ts` `createPlacement`, 021):** real = orbit maths ÷ 10⁶ km; stylised = the 020 ring
  at the true angle projected on the XZ plane, so rings stay disjoint at any date. Writes into the same map and
  vectors each call.
- **Scene graph (`scene.ts`):** `system` → Sun mesh + decay-0 `PointLight` + faint
  ambient. For each planet an orbit group holds the planet mesh and one orbit group per moon, so moons never
  inherit the planet's scale.
  - **Precision:** every body is its own `Mesh` sharing one `SphereGeometry(1, 48, 24)`, so three builds each
    model-view matrix in float64. Instancing would put real-scale positions into float32 and jitter.
  - **Switching scale:** `applyLayout()` only moves groups and rescales meshes.
  - **Per date (021):** `applyPositions(offsets)` (then world matrices) and `applyOrientations(days, speed)`.
  - **Light:** ambient 0.1 (D-028), so a planet seen on its night side against black still shows.
- **Orbit lines (`orbit-lines.ts`, 021, AC-11):** 15 `LineLoop`s per scale (256 points, one shared faint material,
  no depth write, `raycast` a no-op), prebuilt and toggled by visibility. Planet lines hang off `system`, moon lines
  off their planet's orbit group. Real ellipses are rewritten in place after 10 years (planets) or 1 % of the moon's
  fastest precession (D-027: the Moon every ~22 days).
- **The Space (`index.ts`):**
  - **Scale choice:** remembered in `localStorage` (`world.solarSystem.scale`, stylised by default).
  - **Switching:** re-layout, orbit lines swapped, bodies re-placed, markers on or off, then `setHome()` +
    `reset()`, which re-frames the whole system instantly, even a moved camera; any follow stops.
  - **Per frame (021, plan §8):** advance time → if the time state changed: re-place bodies, orientations and
    orbit lines, move the camera with a followed body, invalidate markers → `controls.update()` → follow check →
    depth → `camera.updateMatrixWorld()` → markers → the date text (written only on a new day).
  - **Following (Q4):** a re-centre (D-023) follows that body; it stops when the orbit target is no longer where
    following put it (pan, reset, scale switch, re-centre elsewhere), checked before each follow step.
  - **Saved state:** `{ time }` (date, speed, direction, play state) across a context loss; follow is not
    restored (D-028).
  - **Home view:** from 35° off vertical at `frameDistance(extent, fov 40°, aspect, 0.85)`. The closest distance
    is 1.2 × the radius of the body orbited.
  - **Depth, every frame after the controls:**
    - near plane at half the distance to the nearest surface, clamped to [10⁻⁶, 1];
    - far plane at the camera's distance from the Sun + 2 × extent;
    - the projection updates only on a > 10 % change.
- **Re-centring zoom (D-023):** at real scale, a `wheel` (capture phase, before OrbitControls) or a pinch's
  second touch-down within 24 px of a body calls `focusOn(body, { minDistance: 1.2 r })`. Zoom speed 4. A moving
  pinch also pans by its midpoint, as two-finger gestures do.
- **Real-scale markers (`markers.ts`, AC-8a):** an `aria-hidden` layer of labels (dot + name) that lets
  pointer events through.
  - **Placement:** projected with `toScreen()`; written only when something changed. Re-projection is skipped
    while the camera is unchanged, so the Space calls `invalidate()` whenever bodies move (021).
  - **Moons:** hidden within 24 px of their planet's marker.
  - **Declutter (D-024):** by body size, a name shows only if its box clears every name already shown (others
    keep their dot), and a name near the right edge sits left of its dot. Name sizes are measured once per show
    or resize.
  - **`nearest(x, y, r)`** finds the body for re-centring.
- **Scale toggle (`scale-toggle.ts`, AC-7):** a "True scale" button with `aria-pressed`, plus a visually hidden
  polite description that the canvas's `aria-describedby` points at, so the 3D view always states its scale.
- **Time controls (`time-controls.ts`, 021, AC-6–AC-8):** a `role="group"` "Time": the date as `<time datetime>`
  (not live), "Play time"/"Pause time", a native Speed `<select>`, a "Backwards" toggle (`aria-pressed`), and a
  visually hidden polite region for play/pause, direction and range limits. `set()` shows state silently.
  "True scale" and the time controls share a `.solar-bar` row (bottom-left; at ≤ 640 px it wraps above the
  controls bar and the info sheet is lifted to 180 px).
- **Tab order:** back link → 3D view → info toggle → "True scale" → Play/Pause → Speed → Backwards → "?" →
  "Reset view".
- **Budget:** 17.3 KB gzipped (020: 12.3), no assets; entry 146.6 KB (020 +0.5, 021 +0.1).

## Multi-Object Pattern (planned, 022–023)

- 022 adds textures, Saturn's rings, the starfield background and the Sun's glow; 023 adds selection and flying
  to a body (it may reuse `focusOn`).
