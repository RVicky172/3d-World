# Learnings & Gotchas

Non-obvious facts discovered while building. Keep entries short; group by topic. Delete entries that become wrong.

## Three.js

- Disposing a mesh does not dispose its material's textures — traverse materials and dispose each texture map explicitly. `disposeObject3D` (src/shared/dispose.ts) handles this, plus `ShaderMaterial` uniform textures and `scene.background`/`environment`.

## Three.js — renderer-owned resources

- three r186 lazily creates a shared **DFG LUT** texture (`getDFGLUT()`) the first time any physically based material (`MeshStandardMaterial`/`MeshPhysicalMaterial`) renders, and keeps it for the renderer's lifetime. `renderer.info.memory.textures` therefore goes +1 once and never back. GPU-leak tests must take their baseline **after a warm-up visit** to a PBR Space. A real leak still shows as growth per cycle (verified: disabling gallery dispose → 12 geometries vs 2).

## Three.js — OrbitControls (r186)

- Built-in keys are the opposite of our spec (plain arrows pan, Shift/Ctrl + arrows rotate) and have no zoom or reset, so we never call `listenToKeyEvents` and use `src/shared/controls/keyboard.ts` instead.
- `enableDamping` smooths **rotate and pan only**. Wheel/pinch zoom is applied in full on the next `update()`. Test easing with a pointer drag (E2E), not the wheel.
- `reset()` calls `update()`, which applies leftover damping velocity and drifts from the saved view. Flush first: `enableDamping = false; update(); reset();`, then restore damping.
- `cursor` + `maxTargetRadius` is a built-in pan limit (clamps `target` around `cursor`).
- `update(deltaTime)` makes `autoRotate` time-based, so the turntable is deterministic. Without the argument it assumes 60 fps.
- Poses round-trip through `Spherical`, so expect `2e-16`-style noise. Compare with `toBeCloseTo`, not `toEqual`.
- It sets `touch-action: none` on its element and restores `''` in `dispose()`.

## Three.js — renderer sizing

- Call `renderer.setSize(w, h, false)` when a `ResizeObserver` watches the container: with the default `updateStyle=true` Three writes inline px sizes onto the canvas, which then fights the CSS `100%` sizing. Let CSS size the canvas; set only the drawing buffer.
- Never pass a 0 width/height to a Space's `resize()` — `camera.aspect` becomes NaN/Infinity. `Engine` skips it.

## Testing

- **Multi-touch in E2E:** `touchGesture()` in `tests/e2e/fixtures.ts` sends CDP `Input.dispatchTouchEvent`. Chromium turns it into pointer events, which OrbitControls handles (one-finger orbit, pinch, two-finger pan). It needs a context with `hasTouch: true` (and `isMobile` for coarse-pointer wording).
- `page.mouse.wheel()` scrolls wherever the mouse **currently** is. After a drag that ended over the canvas, a wheel meant for a button zooms the camera. Hover the target first.
- **Camera assertions:** compare poses with `rotationBetween()` (degrees) and `distanceBetween()` plus tolerances, never exact equality. Motion tests: the turntable turns ~2° per 300 ms, and "stopped" is < 0.5°. Stable over 5 repeats in SwiftShader.
- "Non-blank canvas" = `canvasCoverage(page)` (fraction of pixels differing from the corner/background pixel), not a distinct-colour count — colour counts depend on the model's rotation at capture time and flaked (9 vs >10). Its blank-canvas guard lives in the 001 not-found E2E test.
- Negative E2E checks ("did not re-open") need a detector proven to fire: `watchForReopen` has its own positive test in `router.spec.ts`.
- Playwright `webServer` can be an array; per-server `env` is merged with `process.env` (no `cross-env` needed). The `subpath` project serves `/3d-World/`; its tests must use relative URLs (`goto("#/space/x")`, `goto("./")`) because a leading `/` drops the base path.
- E2E: import `test`/`expect` from `tests/e2e/fixtures.ts`, not `@playwright/test` — the fixture fails any test with console errors. `gotoSpace()` and `distinctCanvasColours()` live there too.
- Use Playwright's `test.use({ reducedMotion: "reduce" })` to make Space switches instant (fast loops) or to test the reduced-motion path.
- To check a test can fail, sabotage the code temporarily — but keep it compiling: `noUnusedLocals` makes the test build (and the Playwright web server) fail if you just comment out the only use of an import. `void importedThing;` keeps it used. Verified AC-4 this way: skipping dispose gives 11 geometries vs baseline 1.
- Scripts in `scripts/*.mjs` are type-checked (`allowJs` + `checkJs` + `// @ts-check`, JSDoc types) and unit-tested from `tests/unit/scripts/`.
- jsdom has no 2D canvas: `canvas.getContext("2d")` returns null and logs "Not implemented". For generated textures use `DataTexture` (bytes in a `Uint8Array`) — works in Node and on the GPU. `createFakeContext()` in `tests/helpers/fakes.ts` builds a `SpaceContext` for factory tests.
- Shared fakes (`FakeScheduler`, `FakeVisibility`, `createFakeRenderer`) live in `tests/helpers/fakes.ts`.
- A test factory that spreads `Partial<SpaceInstance>` overrides loses the `Mock` type on its methods; use `vi.mocked(instance.resize)` to get it back.
- Headless Chromium renders WebGL via SwiftShader (software). It's slow, so E2E scenes should allow a `?quality=low` mode; don't assert on FPS in CI.

## Routing

- Several synchronous `location.hash = …` assignments coalesce: each queued `hashchange` handler reads the _final_ hash. To test rapid navigation, space the changes (e.g. 20 ms apart).
- Assigning `location.hash` its current value fires no `hashchange` and adds no history entry; `history.replaceState` never fires `hashchange`. So the router handles redirects itself after `replaceState`, and `navigate()` to the URL already shown (e.g. retry after "not found") calls its handler directly.
- Guard async outcomes with a sequence number, not just the `superseded` result: an older request can resolve `not-found` after a newer one started and would otherwise overwrite the title. `FakeBrowserLocation` (`tests/helpers/fakes.ts`) mimics all of this for unit tests.

## DOM / CSS

- Removing the focused element (e.g. the gallery card the visitor activated) drops focus to `<body>`, but Chrome keeps the sequential-focus starting point where the removed node was. The next Tab then continues from there, not from the top. SpaceManager now restores lost focus via `SpaceInstance.focusTarget()` (004 AC-13). A same-document `page.goto('#…')` does not reset that starting point either, so it is not a "fresh load" in tests.
- `element.checkVisibility()` detects focus stranded on a `display: none` element, such as the back link on the gallery. jsdom lacks it, so guard with `typeof … === 'function'`.
- TypeScript 6 DOM types declare `HTMLElement.hidden` as `boolean | "until-found"`, so `setOpen(panel.hidden)` fails to typecheck. Keep disclosure state in `aria-expanded` and read it from there.
- Stacking since 003: canvas → `.overlay` (z 1, view DOM) → `.fader` (z 2) → `.back-to-gallery` (z 4). The fader hides the whole view while switching. Chrome that must stay steady goes above it, and `data-view` is set at the _start_ of an open so chrome never flashes.
- jsdom lacks `HTMLImageElement.loading`: `img.loading = "lazy"` sets nothing there. Use `img.setAttribute("loading", "lazy")` (works in browsers too).
- Colours that tests check for contrast must be solid tokens (`--surface`, `--border`): `color-mix()` computes to `color(srgb …)` strings, not `rgb()`.
- An SVG child's `fill="none"` attribute beats a `fill` inherited from CSS on the parent `<svg>`, so one icon stylesheet can mix filled and outline shapes.
- `Fader`: a second `out()` while an `out()` is still running must wait for that same fade, not resolve early; requesting the state it is already in resolves immediately. It starts `covered` at boot so the first Space only fades in.
- Don't wait on `transitionend` for fades: it never fires if the property value doesn't change, if the element is `display: none`, or in jsdom. `Fader` resolves on a `setTimeout` of the same duration instead.

## Tooling

- **three.js is one shared module.** Any Space that uses new parts of three core (e.g. OrbitControls pulling in Spherical, MOUSE/TOUCH, the Controls base class) grows the **entry** bundle, even though the Space's own code is lazy, because the bundler keeps all of `three` in the chunk the entry already loads. 004 measured +1.4 KB (D-010). Watch the bundle-check line when adding Spaces.
- Piping a Node script via `node - <<EOF` runs it through Node 24's TypeScript stripping, and regex escapes like `/` inside template literals got mangled, so string matches silently missed. For edits containing regexes or backticks, use the Edit tool.
- A temporary "bridge" to keep tests green between tasks only works if the code under it keeps its old semantics. Check which E2E tests depend on the changed behaviour before promising a task boundary.
- Don't pipe `npm run check` through `grep` and then chain more steps with `&&`: the pipeline's exit status is grep's, so a failing typecheck slips through (it ticked tasks once). Check `$?` of `npm run check` itself before ticking.
- Shell-escaped JS one-liners (`node -e "..."`) eat backticks inside the script. Use the Edit tool or a heredoc file for code comments containing backticks.
- To strip dev/test-only code from production, guard the **call site** with a literal `if (import.meta.env.MODE !== "production")`. Vite inlines MODE, the branch becomes dead code, and the imported module is tree-shaken. Passing MODE as a runtime argument alone would keep the module in the bundle. Verified: `__WORLD__` absent from `npm run build`, present in `npm run build:test`.
- `vite build --mode test` is still a minified production-style build (`import.meta.env.PROD` is true); only `MODE` differs.
- `vi.spyOn(obj, "dispose")` fails to typecheck when `obj` is a generic `T extends { dispose(): void }`; type the helper parameter structurally as `{ dispose(): void }` instead.

- Vite warns "chunks larger than 500 kB" for any Three.js bundle — that's the raw size; gzip is ~130 KB. The budget is measured gzipped (Constitution IV), so `chunkSizeWarningLimit` is set to 700.
- Typecheck includes `vite.config.ts`/`playwright.config.ts`, so `@types/node` + `"node"` in tsconfig `types` is required.
