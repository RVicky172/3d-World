# 001 — Space Framework · Implementation Plan

**Spec:** `./spec.md` · **Status:** Approved <!-- Draft | Approved -->

## Approach

Split the engine into small parts, each tested on its own. Anything that touches the browser or the GPU is
**injected**, so the logic can be unit-tested in jsdom without WebGL:

- **Clock**: turns raw timestamps into `{ delta, elapsed }`. `FakeClock` steps time by hand in tests.
- **RenderLoop**: drives frames through an injected scheduler (`requestAnimationFrame` in production, manual in
  tests) and listens to an injected visibility source. It stops scheduling while the tab is hidden and resets the
  clock on resume, so a Space never receives a huge `delta` (AC-6).
- **Engine**: owns the renderer (typed as a narrow `RendererLike` interface), the canvas, the DOM overlay and a
  `ResizeObserver`. Each frame it calls `instance.update(delta, elapsed)`, then either `instance.render()` if the
  Space defines one (AC-11) or `renderer.render(scene, camera)`.
- **SpaceManager**: `open(id)` and `close()`. It looks up the registry, fades out, lazy-loads the module with
  `import()`, disposes the previous instance, creates the new one, hands it to the Engine, then fades in.
  Each `open` gets a sequence token, so if the user switches quickly only the newest request wins; an instance
  created for a superseded request is disposed straight away.
- **Fader**: a full-screen DOM overlay whose opacity transitions over ~300 ms. With `reducedMotion`, the duration
  is 0 and the promises resolve immediately (AC-10).
- **demo-cube**: a minimal Space that proves the contract. Its rotation is computed from `elapsed`
  (`rotation.y = elapsed * speed`), so it is deterministic (AC-7).

Routing (002) and the gallery (003) are out of scope. Until they exist, `main.ts` opens the space named in
`?space=<id>` and falls back to `demo-cube`.

### Ordering guarantee (AC-3, AC-10)

```text
open(B):  fader.out()  →  await load(B)  →  A.dispose()  →  B = await factory(ctx)
          →  engine.setInstance(B)  →  fader.in()  →  body[data-space-ready="true"], body[data-space-id="B"]
```

While the fade-out is running, A keeps rendering under the overlay. Between `A.dispose()` and `setInstance(B)` the
engine has no instance and only clears the canvas, so a disposed Space is never rendered. `data-space-ready` is
removed when `open` starts and set again when it finishes, which gives E2E tests a reliable signal to wait on.
`data-space-status` (`opened` | `not-found` | `load-error`) records the outcome. An unknown id or a load failure first
closes the current Space, then shows the message over the empty canvas, so the screen never shows a Space that
doesn't match the request. Load errors are also logged with `console.error`; an unknown id is not an error.

### Post-processing hook (AC-11)

`SpaceInstance.render?(): void`. A Space that wants post-processing builds its own `EffectComposer(ctx.renderer)`
and calls it from `render()`. It also resizes the composer in `resize()` and disposes it in `dispose()`. The
engine needs no knowledge of composers. Because `EffectComposer` comes from `three/examples/jsm` and is only
imported by Spaces that use it, it ends up in their lazy chunk, not the main bundle.

### Test-mode debug hook

E2E runs against a build made with `vite build --mode test`. When `import.meta.env.MODE !== 'production'`, the app
exposes `window.__WORLD__`:

- `open(id)` and `close()`
- `activeId()`
- `memory()`, which returns `renderer.info.memory`
- `cameraAspect()`

In test mode the renderer also sets `preserveDrawingBuffer: true`, so the E2E test can read canvas pixels. A normal
`npm run build` sets `MODE` to `'production'`, so the bundler removes the hook from production code.

## Files

| File                                | Change | Purpose                                                                                                               |
| ----------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------- |
| `src/core/types.ts`                 | new    | Space contract: `SpaceMeta`, `SpaceContext`, `SpaceInstance`, `SpaceFactory`, `RendererLike`                          |
| `src/core/clock.ts`                 | new    | `Clock` interface, `createClock()`, `FakeClock`; delta is clamped to 0.1 s                                            |
| `src/core/render-loop.ts`           | new    | `RenderLoop` with injectable `Scheduler` and `VisibilitySource`                                                       |
| `src/core/engine.ts`                | new    | `Engine`: renderer, canvas, overlay, resize, per-frame update/render, `setInstance()`, `dispose()`                    |
| `src/core/space-manager.ts`         | new    | `SpaceManager`: `open(id)`, `close()`, race token, not-found and load-error handling                                  |
| `src/core/debug.ts`                 | new    | Installs `window.__WORLD__` outside production                                                                        |
| `src/shared/dispose.ts`             | new    | `disposeObject3D(root)`: geometries, materials (including material arrays), and every `Texture` held by a material    |
| `src/ui/fader.ts`                   | new    | `Fader` overlay: `out()` and `in()` promises, respects `reducedMotion`                                                |
| `src/ui/messages.ts`                | new    | "Space not found" and "Failed to load" messages in the overlay (`role="alert"`)                                       |
| `src/spaces/registry.ts`            | new    | `SpaceMeta[]` containing `demo-cube`, plus `findSpace(id)`                                                            |
| `src/spaces/demo-cube/index.ts`     | new    | Placeholder Space (cube, lights, rotation computed from `elapsed`)                                                    |
| `src/main.ts`                       | modify | Replace the Phase 0 scene: capability check → Engine → SpaceManager → open `?space=` or `demo-cube`                   |
| `src/styles/main.css`               | modify | Styles for the overlay and fader                                                                                      |
| `scripts/check-bundle.mjs`          | new    | Reads `dist/.vite/manifest.json`. Asserts each Space is a separate dynamic chunk and the entry JS is ≤ 250 KB gzipped |
| `vite.config.ts`                    | modify | `build.manifest: true`                                                                                                |
| `package.json`                      | modify | `build` runs `check-bundle.mjs` after `vite build`; new `build:test` script (`vite build --mode test`)                |
| `playwright.config.ts`              | modify | Web server runs `build:test` instead of `build`                                                                       |
| `tests/unit/core/*.test.ts`         | new    | Clock, render loop, engine, space manager                                                                             |
| `tests/unit/shared/dispose.test.ts` | new    | `disposeObject3D`                                                                                                     |
| `tests/unit/ui/fader.test.ts`       | new    | Fader timing and reduced motion                                                                                       |
| `tests/unit/spaces/*.test.ts`       | new    | Registry integrity, demo-cube determinism                                                                             |
| `tests/e2e/space-framework.spec.ts` | new    | demo-cube smoke test, memory baseline, resize, fade                                                                   |
| `tests/e2e/smoke.spec.ts`           | modify | Keep the boot check; now waits for `data-space-id`                                                                    |
| `specs/architecture.md`             | modify | Add `render?()` to `SpaceInstance`, the `Clock`/`RenderLoop` split and the ordering guarantee                         |

## Data Structures & Interfaces

```ts
// src/core/types.ts
export interface RendererLike {
  readonly domElement: HTMLCanvasElement;
  readonly info: { memory: { geometries: number; textures: number } };
  setPixelRatio(ratio: number): void;
  setSize(width: number, height: number, updateStyle?: boolean): void;
  render(scene: Object3D, camera: Camera): void;
  clear(): void;
  dispose(): void;
}

export interface SpaceContext {
  renderer: WebGLRenderer; // real renderer for Spaces; the engine only depends on RendererLike
  canvas: HTMLCanvasElement;
  overlay: HTMLElement;
  reducedMotion: boolean;
  signal: AbortSignal; // aborted by the manager right before dispose()
}

export interface SpaceInstance {
  scene: Scene;
  camera: Camera;
  update(deltaSeconds: number, elapsedSeconds: number): void;
  resize(width: number, height: number): void;
  render?(): void; // AC-11 opt-in custom rendering
  dispose(): void;
}

export type SpaceFactory = (ctx: SpaceContext) => Promise<SpaceInstance>;
export interface SpaceMeta {
  id: string;
  title: string;
  description: string;
  kind: 'single' | 'multi';
  thumbnail?: string;
  load: () => Promise<{ default: SpaceFactory }>;
}

// src/core/clock.ts
export interface Clock {
  tick(nowMs: number): { delta: number; elapsed: number }; // elapsed = sum of clamped deltas (Space time, stops while paused)
  reset(): void; // next tick has delta 0 (used on resume)
}

// src/core/render-loop.ts
export interface Scheduler {
  request(cb: (nowMs: number) => void): number;
  cancel(handle: number): void;
}
export interface VisibilitySource extends EventTarget {
  readonly visibilityState: DocumentVisibilityState;
}

// src/core/space-manager.ts
export type OpenResult = 'opened' | 'not-found' | 'load-error' | 'superseded';
```

## Three.js Techniques

- **One `WebGLRenderer`** for the whole session: `antialias: true`, pixel ratio `min(devicePixelRatio, 2)`, and
  `preserveDrawingBuffer` only in test mode.
- **Rendering between Spaces**: when there is no instance, `renderer.clear()` with the background colour.
- **Disposal**: `disposeObject3D` traverses meshes, lines and points. It disposes each geometry and material, and
  every material property that is `instanceof Texture` (see `memory/learnings.md`: disposing a material does not
  free its textures).
- **Resize**: a `ResizeObserver` on the `#app` container, not `window.resize`, so layout changes are caught too.
  The engine calls `renderer.setSize()` and then `instance.resize(w, h)`; the Space updates its own camera aspect.
- **demo-cube**: `BoxGeometry` + `MeshStandardMaterial`, plus a small generated `DataTexture` (checkerboard; no DOM canvas needed, so unit tests run in jsdom) so AC-4 also checks that
  textures return to baseline.

## Test Approach

| AC    | Test file                                                              | Type         | How                                                                                                                                                                                           |
| ----- | ---------------------------------------------------------------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC-1  | `npm run typecheck`, `tests/unit/spaces/registry.test.ts`              | type         | demo-cube's factory satisfies `SpaceFactory`; every registry entry has a unique, URL-safe id                                                                                                  |
| AC-2  | `tests/unit/core/space-manager.test.ts` + `scripts/check-bundle.mjs`   | unit + build | The loader is not called until `open()`; the manifest shows `src/spaces/demo-cube/index.ts` as a dynamic chunk                                                                                |
| AC-3  | `tests/unit/core/space-manager.test.ts`                                | unit         | A call log shows `A.dispose` before `setInstance(B)`; a rapid A→B→C switch leaves only C active and disposes B                                                                                |
| AC-4  | `tests/e2e/space-framework.spec.ts`                                    | e2e          | Record the `memory()` baseline after `close()`, run `open`/`close` 10 times, then assert `geometries` and `textures` equal the baseline                                                       |
| AC-5  | `tests/e2e/space-framework.spec.ts`                                    | e2e          | `page.setViewportSize()`; the canvas size matches and `cameraAspect()` ≈ width / height                                                                                                       |
| AC-6  | `tests/unit/core/render-loop.test.ts`                                  | unit         | Fake visibility source set to `hidden` → no frames scheduled; back to `visible` → frames resume with `delta` 0                                                                                |
| AC-7  | `tests/unit/core/clock.test.ts`, `tests/unit/spaces/demo-cube.test.ts` | unit         | Same tick sequence gives the same `{delta, elapsed}`; two demo-cube instances stepped identically end with equal rotation                                                                     |
| AC-8  | `tests/unit/core/space-manager.test.ts`                                | unit         | `open('nope')` resolves to `'not-found'`, the overlay contains `role="alert"`, and nothing throws                                                                                             |
| AC-9  | `tests/e2e/space-framework.spec.ts`                                    | e2e          | `?space=demo-cube` → `data-space-id="demo-cube"`, the canvas has more than one distinct colour, no console errors                                                                             |
| AC-10 | `tests/unit/ui/fader.test.ts` + e2e                                    | unit + e2e   | Fake timers: `out()` resolves after ~300 ms, or immediately with reduced motion. Manager order: fade out → swap → fade in. E2E with `reducedMotion: 'reduce'` finishes switching with no fade |
| AC-11 | `tests/unit/core/engine.test.ts`                                       | unit         | An instance with `render()` → it is called and `renderer.render` is not; without it → `renderer.render(scene, camera)` is called                                                              |

The engine and manager unit tests use a fake `RendererLike` and real Three.js `Scene` and `Camera` objects, which
work in Node. Coverage target: ≥ 80 % for `src/core`, `src/shared` and `src/ui`.

## Risks & Mitigations

- **Headless WebGL is slow (SwiftShader)**: the E2E tests use demo-cube only and assert on state signals, not FPS.
- **Race conditions in fast switching**: the sequence token, plus the A→B→C unit test.
- **Load failure (a chunk fails to download)**: `open()` catches the error, shows "Failed to load", returns
  `'load-error'` and leaves the engine with no instance. It does not throw.
- **Test-mode code leaking into production**: the hook is gated by `import.meta.env.MODE`. `check-bundle.mjs` also
  greps the production entry for `__WORLD__` and fails if it finds it.
- **`renderer.info.memory` counts only what has been uploaded to the GPU**: wait one rendered frame after `open`
  before reading it, using `data-space-ready`, which is set after the first frame.
- **No real `EffectComposer` user yet**: AC-11 is proved with a fake instance. The first real use (Sun bloom, 022)
  will exercise it end to end.

## Constitution Check

| Principle                 | Status | Notes                                                                                                        |
| ------------------------- | ------ | ------------------------------------------------------------------------------------------------------------ |
| I. Spec before code       | ✅     | Spec 001 is Approved; this plan maps every AC                                                                |
| II. Browser-only          | ✅     | No network calls apart from loading our own lazy chunks                                                      |
| III. Self-contained Space | ✅     | Spaces are only reachable through the registry `load()`; `disposeObject3D` and `AbortSignal` support cleanup |
| IV. Performance budgets   | ✅     | `check-bundle.mjs` enforces 250 KB gzipped on the entry; pixel ratio capped at 2; loop stops when tab hidden |
| V. Accessible & resilient | ✅     | Fade respects reduced motion; not-found and load-error messages use `role="alert"`; WebGL fallback kept      |
| VI. Test-gated            | ✅     | Every AC has a test; time is injected through `Clock`                                                        |
| VII. Data-driven          | ✅     | Space metadata lives in `registry.ts`; demo-cube constants sit in one config object                          |
| VIII. Small dependencies  | ✅     | **No new dependencies.** `EffectComposer` ships with `three`; bundle script uses only Node's `zlib`/`fs`     |
| IX. Licensed assets       | ✅     | No external assets; demo-cube texture is generated in code (`DataTexture`)                                   |
| X. Memory maintained      | ✅     | Decision D-005 records the fade and post-processing choices                                                  |
