# 3D World — Architecture

**Last updated:** 2026-10-04 · Status: core framework implemented (feature 001); router, gallery and controls pending (002–004)

---

## Concepts

- **Space**: one self-contained 3D experience (e.g. `demo-cube`, later `model-viewer`, `solar-system`).
  - _Single-object Space_: one focal object, camera orbits it.
  - _Multi-object Space_: many objects sharing a world and a clock (e.g. planets orbiting a sun).
- **Engine**: owns the single `WebGLRenderer`, the canvas, the overlay layer, the render loop and resizing. It lives for
  the whole session and renders whichever Space instance it is given. It never creates or disposes Spaces.
- **SpaceManager**: loads a Space module on demand, creates it, hands it to the Engine, and disposes the previous one.
  It coordinates the fade transition and reports outcomes.
- **Registry**: a static list of Space metadata with lazy `import()` loaders. Nothing is loaded until it is opened.

## Directory Layout

```text
src/
  main.ts                 # bootstrap: WebGL check → renderer → Engine → Fader → SpaceManager → open ?space=
  core/
    types.ts              # the Space contract + RendererLike + OpenResult
    clock.ts              # Clock, createClock(), FakeClock: timestamps → { delta, elapsed }
    render-loop.ts        # RenderLoop: injectable Scheduler + VisibilitySource; pauses when hidden
    engine.ts             # Engine: renderer, canvas, overlay, resize, per-frame update/render
    space-manager.ts      # SpaceManager: open/close, ordering, supersession, errors, status attributes
    debug.ts              # window.__WORLD__ test/dev hook (stripped from production)
    capabilities.ts       # hasWebGL2(), prefersReducedMotion()
  shared/
    dispose.ts            # disposeObject3D(): geometries, materials, textures (incl. uniforms, background)
  ui/
    fader.ts              # Fader: opacity overlay hiding Space swaps (instant with reduced motion)
    messages.ts           # "Space not found" / "Failed to load" alerts in the overlay
    fallback.ts           # WebGL2-unavailable screen
  spaces/
    registry.ts           # spaces[] with lazy loaders, findSpace()
    <space-id>/
      index.ts            # default-exports a SpaceFactory; scene data as a typed config object
  styles/main.css         # tokens; stacking: canvas → .fader → .overlay
scripts/
  bundle-checks.mjs       # pure bundle rules (unit-tested)
  check-bundle.mjs        # runs them on dist/ after `npm run build`
tests/
  helpers/fakes.ts        # FakeScheduler, FakeVisibility, createFakeRenderer, createFakeContext
  unit/                   # Vitest, mirrors src/ (+ scripts/)
  e2e/                    # Playwright; fixtures.ts fails tests on console errors
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

## Opening a Space (SpaceManager)

```text
open(B)
  clear <body data-space-*>
  → fader.out()                       A still renders underneath
  → findSpace(B)                      unknown → close A, show "Space not found"  → 'not-found'
  → await load()                      rejects → close A, show "Failed to load"  → 'load-error'
  → A: abort signal, dispose(); engine.setInstance(null)   (never renders a disposed Space)
  → B = await factory(ctx)            throws  → show "Failed to load"           → 'load-error'
  → engine.setInstance(B) → await engine.nextFrame() → fader.in()
  → <body data-space-id="B" data-space-status="opened" data-space-ready="true">  → 'opened'
```

- **Supersession:** every `open()` and `close()` takes a new sequence number. After each `await`, an older request
  checks whether a newer one has started. If it has, it stops and returns `'superseded'`, and disposes any instance
  it had just created. Rapid switching therefore always ends on the most recent request.
- **Never throws:** `open()` reports every failure through its result. Load and factory errors are also sent to
  `console.error`. An unknown id is not treated as an error (decision D-006).
- **`close()`:** disposes the active Space, clears any message, and cancels any `open()` that is still running.

### Transition (Fader)

- The Fader is a full-screen element in the background colour. It sits between the canvas and the overlay, and fades
  its opacity over 300 ms.
- It starts covered at boot, so the first Space only fades in.
- With `prefers-reduced-motion`, swaps are instant.
- Its promises resolve on a timer rather than on `transitionend`, which doesn't always fire.

## Disposal Rules

A Space's `dispose()` must free everything it created: geometries, materials, textures, listeners, DOM elements and
composers.

- `disposeObject3D(scene)` from `src/shared/dispose.ts` covers geometries, materials (including material arrays),
  every `Texture` a material references, `ShaderMaterial` uniform textures, and `scene.background` and
  `scene.environment`. Shared resources are disposed once.
- Use `ctx.signal` for event listeners so they are removed automatically: it is aborted before `dispose()` runs.
- The E2E test for AC-4 opens and closes a Space 10 times and asserts that `renderer.info.memory` returns to its
  baseline.

## Testability Seams

| Seam                   | Real                    | In tests                                          |
| ---------------------- | ----------------------- | ------------------------------------------------- |
| Time                   | `createClock()`         | `FakeClock`                                       |
| Frames                 | `requestAnimationFrame` | `FakeScheduler.flush(now)`                        |
| Visibility             | `document`              | `FakeVisibility.set('hidden')`                    |
| Renderer (Engine)      | `WebGLRenderer`         | `createFakeRenderer()` (`RendererLike`)           |
| Resize                 | `ResizeObserver`        | injected `watchResize` callback                   |
| Space context          | built by `SpaceManager` | `createFakeContext()`                             |
| Engine/Fader (Manager) | `Engine`, `Fader`       | `ManagedEngine`, `Transition` fakes               |
| Running app (E2E)      | —                       | `window.__WORLD__` in `npm run build:test` builds |

`window.__WORLD__` provides `open`, `close`, `activeId`, `memory` and `cameraAspect`. It is installed behind a
literal `import.meta.env.MODE !== 'production'` check, so production bundles drop it. `npm run build` verifies this.

## Multi-Object Pattern (Solar System, planned — features 020–023)

- The scene graph uses **pivots**: `Sun → orbitPivot(planet) → planetMesh → orbitPivot(moon) → moonMesh`.
- Positions come from pure functions in `orbit.ts`: `positionAt(orbitalElements, t)` returns a Vector3-like value.
  They are unit-tested without WebGL.
- `data.ts` holds each body's radius, distance, period, tilt and texture path. A `scaleMode` setting maps real values
  to display values.
