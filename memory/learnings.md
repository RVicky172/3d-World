# Learnings & Gotchas

Non-obvious facts discovered while building. Keep entries short; group by topic. Delete entries that become wrong.

## Three.js

- Disposing a mesh does not dispose its material's textures — traverse materials and dispose each texture map explicitly. `disposeObject3D` (src/shared/dispose.ts) handles this, plus `ShaderMaterial` uniform textures and `scene.background`/`environment`.

## Three.js — renderer-owned resources

- three r186 lazily creates a shared **DFG LUT** texture (`getDFGLUT()`) the first time any physically based material (`MeshStandardMaterial`/`MeshPhysicalMaterial`) renders, and keeps it for the renderer's lifetime. `renderer.info.memory.textures` therefore goes +1 once and never back. GPU-leak tests must take their baseline **after a warm-up visit** to a PBR Space. A real leak still shows as growth per cycle (verified: disabling gallery dispose → 12 geometries vs 2).

- **PMREM textures leak through `texture.dispose()`.** `PMREMGenerator.fromScene()` returns a render target. three r186 only frees render-target textures through `renderTarget.dispose()`: `texture.dispose()` returns early because `__webglInit` is never set for them, so `info.memory.textures` grows by 1 per visit. The model viewer disposes the target from the texture's `dispose` event. Unit tests with stub environments can't see this; the E2E memory round trip caught it (010 T073).

## Three.js — OrbitControls (r186)

- Built-in keys are the opposite of our spec (plain arrows pan, Shift/Ctrl + arrows rotate) and have no zoom or reset, so we never call `listenToKeyEvents` and use `src/shared/controls/keyboard.ts` instead.
- **`zoomToCursor` can't reach an object far from the target** (r186). Each wheel step moves the camera along the pointer ray by a fraction of its distance to `target`, then re-places `target` just ahead of the camera, so steps shrink geometrically and stall at the target's depth or `minDistance`. In a real-scale solar system, 400 steps on Earth never got it past 0.1 px. Re-targeting the orbit onto the body under the pointer, then zooming normally, works (020 T001).
- `enableDamping` smooths **rotate and pan only**. Wheel/pinch zoom is applied in full on the next `update()`. Test easing with a pointer drag (E2E), not the wheel.
- `reset()` calls `update()`, which applies leftover damping velocity and drifts from the saved view. Flush first: `enableDamping = false; update(); reset();`, then restore damping.
- `cursor` + `maxTargetRadius` is a built-in pan limit (clamps `target` around `cursor`).
- `update(deltaTime)` makes `autoRotate` time-based, so the turntable is deterministic. Without the argument it assumes 60 fps.
- Poses round-trip through `Spherical`, so expect `2e-16`-style noise. Compare with `toBeCloseTo`, not `toEqual`.
- It sets `touch-action: none` on its element and restores `''` in `dispose()`.
- **three's `Raycaster` is slow for visibility checks:** ~2 ms per ray on the 40k-triangle chair (r186, Chromium), because `Mesh.raycast` tests every triangle in any box the ray crosses and builds a full intersection (uv, normal, sort) for each hit. An any-hit Möller–Trumbore loop over a flat world-space `Float32Array` with early exit did 4 rays in 0.7 ms with identical answers (012 T040).
- `controls.update()` moves the camera's position/quaternion but **not `matrixWorld`** (the renderer updates that later). Anything that projects or raycasts from the camera inside `SpaceInstance.update()` (012 hotspots) must call `camera.updateMatrixWorld()` first, or it lags a frame behind the pixels.

## WebGL context loss

- Headless Chromium (SwiftShader) does fire `webglcontextlost` and `webglcontextrestored` for `WEBGL_lose_context`, so restore can be tested E2E (005 T001 spike, 2026-10-05).
- `restoreContext()` must be called in a **later task** than the lost event's dispatch. If it runs in a microtask right after the event (for example `await`ing a promise that the listener resolves), Chrome logs `INVALID_OPERATION: restoreContext: context restoration not allowed`. Chrome only marks restore as allowed after every listener has run and it has checked `defaultPrevented`. Wait for a `setTimeout`, or for an app signal.
- `gl.getExtension()` returns **null while the context is lost**, so fetching `WEBGL_lose_context` on demand can lose the context but never restore it. Use three's `renderer.forceContextLoss()` / `forceContextRestore()`, which cache the extension from creation (this is what `__WORLD__.loseContext/restoreContext` do).
- After a restore, a warm-up visit to a PBR Space is needed again before taking a memory baseline. three creates new `info` counters and a new DFG LUT on the new context.
- three r186 calls `preventDefault()` on loss itself, and logs `Context Lost.` / `Context Restored.` with `console.log` (not as errors). With no app handling at all, demo-cube re-rendered after restore with no warnings. We still rebuild the view (005 plan), so the outcome doesn't depend on every resource re-uploading itself.

## Three.js — renderer sizing

- Call `renderer.setSize(w, h, false)` when a `ResizeObserver` watches the container: with the default `updateStyle=true` Three writes inline px sizes onto the canvas, which then fights the CSS `100%` sizing. Let CSS size the canvas; set only the drawing buffer.
- Never pass a 0 width/height to a Space's `resize()` — `camera.aspect` becomes NaN/Infinity. `Engine` skips it.

## Assets & licences

- **NASA's NSSDC fact sheets (`nssdc.gsfc.nasa.gov`) were unreachable** on 2026-10-05: connection refused from both WebFetch and curl, and web.archive.org is blocked for WebFetch. JPL covers the same data: the **Horizons API** (`ssd.jpl.nasa.gov/api/horizons.api?format=text&COMMAND='499'&OBJ_DATA='YES'&MAKE_EPHEM='NO'`) returns each body's radius, GM, rotation and obliquity as plain text via curl. Body codes: 10 Sun, `n99` planets, 301 Moon, 501–504 Galileans, 606 Titan, 801 Triton.
- **NAIF PCK "periodic" terms aren't always small.** WGCCRE 2015's Mars pole has a ~71 000-year term of 1.59° in Dec (0.42° in RA); dropping it put Mars's tilt 1.3° off. The Moon (3.9° in RA) and Triton (32°) have big terms too. Fold slow terms in at J2000, or derive the axis another way. A cross-check of pole-derived tilt against Horizons' obliquity caught it (021 T010).
- **Horizons vector tables:** `EPHEM_TYPE='VECTORS'`, `TLIST='<JD …>'` gives many dates in one request. Its ephemerides have start dates: no Neptune before **1800-01-02** (a reply with no `$$SOE`, just "No ephemeris … prior to …"). `scripts/horizons.mjs` fails loudly on that (021 T002).
- **JPL's satellite mean-elements table (`sats/elem/sep.html`) can't be propagated for centuries as-is** (021 T013). Its `P` is not the mean-longitude rate for every moon: Io's 1.762732 d gives 204.23°/d against the true 203.49°/d (NAIF's synchronous Ẇ), so Io is ~90° off by 2025. Titan's row is ~160° out of phase with Horizons at J2000 (osculating M 163.4° vs the table's 11.7°). Triton (retrograde, fast node precession) needs its node to _advance_ (Ω̇ ∝ −cos i) and still lands up to 25° off. Also: on a near-ecliptic orbit, a `cos i` factor on the node term (Ω̇ cos i instead of Ω̇) put the Moon 14° off by 1800: keep the dogleg mean longitude Ω + ω + M. Check moon elements against Horizons vectors at several dates before trusting them.

- JPL gives spin direction twice (Venus: obliquity 177.3° **and** a negative rotation rate). Store one: we keep positive periods and let tilt > 90° mean backwards spin (IAU), or 021 would flip it back.

- **Read the model's `LICENSE.md`, not just its headline credit.** Khronos glTF-Sample-Assets lists every licence that applies. DamagedHelmet looks CC-BY but its files are **also CC-BY-NC** (the original author's licence), which Constitution IX forbids (D-014). In those files, the CC-BY-4.0 line under "This file and all other metadocumentation" covers only the docs, not the model.
- Quick check without downloading: `curl -sIL <raw .glb url>` for `content-length`, and `curl -sfL <model>/LICENSE.md` for the licences.
- three r186 `GLTFLoader` supports `KHR_materials_sheen` and `KHR_texture_transform`. `KHR_materials_variants` is not implemented but is optional, so the default materials are used. Check a GLB's `extensionsRequired` by reading its JSON chunk (bytes 20…20+len, len = uint32 at byte 12).

## Model framing

- A box-derived bounding sphere **over-estimates open shapes** (e.g. a chair: legs and back leave most of the sphere empty). At `fill` 0.75 the SheenChair outline filled only ~53 % of the smaller dimension, so its data sets `fill: 0.85`. Check new models with a screenshot at 1280×720 and 320×640 before trusting the default.
- `canvasCoverage` (share of non-background pixels) is low for sparse silhouettes (~6 % for the chair) even when framing is right. Use bounds, not coverage, to judge framing.
- The same over-estimate hits the **zoom-out limit**: at the 10 % sphere floor the chair outline is ~7 % (D-016). Any limit or framing rule stated in pixels needs a pixel check, not just the maths.
- OrbitControls `update()` with no delta adds a 60 fps `autoRotate` step. `setHome()` switches auto-rotate off for its one update, so re-framing doesn't jump the turntable.

## Testing

- **Multi-touch in E2E:** `touchGesture()` in `tests/e2e/fixtures.ts` sends CDP `Input.dispatchTouchEvent`. Chromium turns it into pointer events, which OrbitControls handles (one-finger orbit, pinch, two-finger pan). It needs a context with `hasTouch: true` (and `isMobile` for coarse-pointer wording).
- **Playwright `click()` on an element the turntable is moving stalls for seconds:** its actionability check waits for the box to stay put across two animation frames. A hotspot click took 9.3 s. Use `click({ force: true })` (still a real mouse click at the current centre) for moving targets, with reduced motion wherever the test allows it (012).
- **DOM-count leak checks must skip the lazy `.loading-announcer`** (011, D-019). It's created on the first load slow enough to show the indicator and kept for the app's lifetime, so under 4-worker load a round-trip count went 31 → 32 once. Count `#app *:not(.loading-announcer)` (012 AC-15).
- **Check estimated text sizes against the real browser.** A declutter rule using estimated label boxes (7 px/char, 12 px tall) passed jsdom tests but let "Jupiter" and "Sun" overlap at 320 px in Chromium. An E2E check on the shown names' `getBoundingClientRect()` caught it. Now names are measured once per show or resize (one layout read), with the estimate only as a jsdom fallback (020 T031).
- **A moving CDP pinch also pans.** Chromium sends each finger's `touchMove` as its own pointer event, so the two-finger midpoint wobbles and OrbitControls' DOLLY_PAN pans. With a fast `zoomSpeed` that drifted the target ~6° off the pinched body. To test something that happens on touch-down, use `touchGesture(page, fingers, 0)`: start and end, no moves (020 T031).
- **"Re-frames after X" tests must move the camera first.** Controls' `setHome()` already re-frames a camera the visitor hasn't touched, so a scale switch looked framed even with the explicit `reset()` removed. Zoom and orbit before switching, or the test can't fail (020 T030).
- **An optimisation keyed on the camera breaks once the scene moves on its own.** 020's markers skip re-projecting while the camera's matrices are unchanged; with 021's moving bodies they lagged up to 12 px whenever the camera stood still (e.g. the 4 s turntable pause after any interaction). The unit test passed because the turntable kept the camera moving. Anything that moves bodies must call `markers.invalidate()`; test motion with a still camera (021 T041).
- **Make sure a motion test moves further than its tolerance.** A "markers follow this frame's camera" test ran the turntable 0.5 s. At real scale the slow turntable moved Jupiter ~0.5 px, inside `toBeCloseTo(…, 0)`, so swapping the update order still passed. With 10 s (~11 px) the sabotage fails (020 T025).
- **A "paused" test must outlast the idle delay.** `turnTo` counts as interaction and restarts the turntable's 4 s idle delay, so checking stillness for 600 ms after opening an annotation passed even with `holdTurntable` removed. Check beyond the idle delay (012 AC-12).
- `page.mouse.wheel()` scrolls wherever the mouse **currently** is. After a drag that ended over the canvas, a wheel meant for a button zooms the camera. Hover the target first.
- **Camera assertions:** compare poses with `rotationBetween()` (degrees) and `distanceBetween()` plus tolerances, never exact equality. Motion tests: the turntable turns ~2° per 300 ms, and "stopped" is < 0.5°. Stable over 5 repeats in SwiftShader.
- "Non-blank canvas" = `canvasCoverage(page)` (fraction of pixels differing from the corner/background pixel), not a distinct-colour count — colour counts depend on the model's rotation at capture time and flaked (9 vs >10). Its blank-canvas guard lives in the 001 not-found E2E test.
- Negative E2E checks ("did not re-open") need a detector proven to fire: `watchForReopen` has its own positive test in `router.spec.ts`.
- Playwright's text engine (`getByText`, `toHaveText` matching via text) **ignores `<noscript>` content**, even with `javaScriptEnabled: false`. Role and CSS locators still find it, e.g. `getByRole('heading')` or `locator('.fallback p')`.
- `reuseExistingServer` is true locally, so a leftover `vite preview` on port 4173 silently serves a **stale build** to every E2E run, and a sabotage check then "passes". Never start your own preview on 4173/4174. If you did, stop it before trusting E2E results.
- Playwright `webServer` can be an array; per-server `env` is merged with `process.env` (no `cross-env` needed). The `subpath` project serves `/3d-World/`; its tests must use relative URLs (`goto("#/space/x")`, `goto("./")`) because a leading `/` drops the base path.
- E2E: import `test`/`expect` from `tests/e2e/fixtures.ts`, not `@playwright/test` — the fixture fails any test with console errors. `gotoSpace()` and `distinctCanvasColours()` live there too.
- Use Playwright's `test.use({ reducedMotion: "reduce" })` to make Space switches instant (fast loops) or to test the reduced-motion path.
- To check a test can fail, sabotage the code temporarily — but keep it compiling: `noUnusedLocals` makes the test build (and the Playwright web server) fail if you just comment out the only use of an import. `void importedThing;` keeps it used. Verified AC-4 this way: skipping dispose gives 11 geometries vs baseline 1.
- Scripts in `scripts/*.mjs` are type-checked (`allowJs` + `checkJs` + `// @ts-check`, JSDoc types) and unit-tested from `tests/unit/scripts/`.
- **jsdom cascades real stylesheets** in `getComputedStyle` (selectors, specificity, later-wins). A unit test can load `src/styles/main.css` into a `<style>` and check rules such as `pointer-events` (012 hotspots test); `:has()`/`color-mix()` in the file don't break the parse.
- jsdom has no 2D canvas: `canvas.getContext("2d")` returns null and logs "Not implemented". For generated textures use `DataTexture` (bytes in a `Uint8Array`) — works in Node and on the GPU. `createFakeContext()` in `tests/helpers/fakes.ts` builds a `SpaceContext` for factory tests.
- Shared fakes (`FakeScheduler`, `FakeVisibility`, `createFakeRenderer`) live in `tests/helpers/fakes.ts`.
- A test factory that spreads `Partial<SpaceInstance>` overrides loses the `Mock` type on its methods; use `vi.mocked(instance.resize)` to get it back.
- **E2E parallelism can take down the machine.** Playwright defaults to half the cores (12 here); 12 SwiftShader Chromiums, each multi-threaded, loading the 010 chair crashed Windows. `playwright.config.ts` caps workers (D-015); use `E2E_WORKERS=2` for a gentler run. Don't raise the cap or pass `--workers` > 4 locally.
- **"GPU stall due to ReadPixels" warnings are environmental.** Probes launched without the E2E flags use the real NVIDIA GPU, whose driver logs 4 of them on the first page a fresh browser opens. That happens in 011's build too, and never under SwiftShader (`--use-angle=swiftshader`, as `playwright.config.ts` launches). When checking DoD gate 5 with a probe, launch with the E2E flags (012 T092).
- **Check which GPU a probe really used before trusting FPS.** On 2026-10-05 a probe launched without SwiftShader flags still reported `UNMASKED_RENDERER_WEBGL` = SwiftShader (while an earlier no-flag probe logged NVIDIA driver messages). Log the renderer string next to any FPS figure (020 T091).
- Headless Chromium renders WebGL via SwiftShader (software). It's slow, so E2E scenes should allow a `?quality=low` mode; don't assert on FPS in CI.

## Routing

- Several synchronous `location.hash = …` assignments coalesce: each queued `hashchange` handler reads the _final_ hash. To test rapid navigation, space the changes (e.g. 20 ms apart).
- Assigning `location.hash` its current value fires no `hashchange` and adds no history entry; `history.replaceState` never fires `hashchange`. So the router handles redirects itself after `replaceState`, and `navigate()` to the URL already shown (e.g. retry after "not found") calls its handler directly.
- Guard async outcomes with a sequence number, not just the `superseded` result: an older request can resolve `not-found` after a newer one started and would otherwise overwrite the title. `FakeBrowserLocation` (`tests/helpers/fakes.ts`) mimics all of this for unit tests.

## DOM / CSS

- **Screenshot every new overlay at 320 px wide.** Independently positioned overlay pieces (credit bottom-left, controls bottom-right, the 012 bottom sheet) collide on phones: the model credit squeezed beside the controls wrapped to four lines and covered the sheet. Absolute siblings can't see each other's size; `.overlay:has(.model-credit) .info` (CSS `:has`) adjusts one piece when another is present.

- **Overlay layers vs focus visibility (012):** markers drawn over the info sheet cluttered its text, but putting them under it hid a Tab-focused marker (WCAG 2.4.11). Children of a `z-index`-less absolute layer join the overlay's stacking context, so `.hotspot:focus-visible { z-index: 2 }` lifts just the focused one above `.info { z-index: 1 }`. Check with `document.elementFromPoint` at the focused element's centre.
- A popover clamped into a 320 px viewport can land on top of its own anchor when it fits on neither side; fall back to below/above the anchor.

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
- Python `open(p, 'w')` on Windows writes **CRLF** endings. `npm run check` doesn't catch it (no Prettier step), but `prettier --check` flags every touched file. Write with `open(p, 'w', newline='\n')`, or use the Edit tool. `grep -c $'\r'` under Git Bash reported 0 even though the files had CRLF, so check with `file <path>` or `prettier --check` instead (005, 2026-10-05).
- Shell-escaped JS one-liners (`node -e "..."`) eat backticks inside the script. Use the Edit tool or a heredoc file for code comments containing backticks.
- To strip dev/test-only code from production, guard the **call site** with a literal `if (import.meta.env.MODE !== "production")`. Vite inlines MODE, the branch becomes dead code, and the imported module is tree-shaken. Passing MODE as a runtime argument alone would keep the module in the bundle. Verified: `__WORLD__` absent from `npm run build`, present in `npm run build:test`.
- `vite build --mode test` is still a minified production-style build (`import.meta.env.PROD` is true); only `MODE` differs.
- `vi.spyOn(obj, "dispose")` fails to typecheck when `obj` is a generic `T extends { dispose(): void }`; type the helper parameter structurally as `{ dispose(): void }` instead.

- **GLTFLoader + RoomEnvironment cost the entry +8.3 KB gzipped** (134.9 → 143.2 KB, measured 2026-10-05 for 010) even though they're only imported from a lazy Space. The three core classes they use (animation, skinning, interleaved buffers…) join the shared `three` chunk. The loader code itself (~12 KB gz) stays lazy.
- **KTX2Loader self-hosts its transcoder with no config (three r186).** It locates `basis_transcoder.js/.wasm` with `new URL('../libs/basis/…', import.meta.url)`. Leave `setTranscoderPath()` unset: `vite build` emits both files as hashed assets and lists them under the importing chunk's manifest `assets`, and the dev server serves them from `node_modules`. Measured for 011: entry +0.2 KB only, but the lazy chunk +30 KB gzipped (MeshoptDecoder embeds its WASM).
- **ktx2-encoder in Node:** pass `imageDecoder` (bytes → `{ width, height, data }` RGBA) or every non-HDR texture throws. Its glTF-Transform `ktx2()` transform **catches that and keeps the PNG with only a warning**, so always assert every texture's mime type is `image/ktx2` afterwards. Its Basis encoder prints per-slice debug lines to stdout even with debug off.
- **Parse only after decoders are ready.** If `GLTFLoader.loadAsync()` runs in parallel with `KTX2Loader.init()` and init fails, the parse carries on and logs "Couldn't load texture" errors after you've rejected. Download the bytes with `FileLoader` (`arraybuffer`) ∥ `init()`, then `parseAsync(bytes, LoaderUtils.extractUrlBase(url))`. KTX2Loader creates its workers lazily on the first transcode, so a worker count proves nothing until a KTX2 texture is actually loaded.
- **`page.route` + `route.fulfill` bypass CDP network throttling.** A fulfilled 4 MB response "arrived" in under a second at 1.25 MB/s. To compare load times of a routed file against a served one, measure processing unthrottled (both routed), then add transfer time from byte counts.
- **Testing download progress in E2E:** `route.fulfill` delivers the body in one chunk (no intermediate progress events). Throttle with CDP instead: `newCDPSession(page)` → `Network.enable` → `Network.emulateNetworkConditions({ downloadThroughput })`. Record values with a MutationObserver installed on the page before navigating, and read them afterwards. `page.workers()` / `page.on('worker')` count dedicated workers (e.g. KTX2Loader's).
- **Mean brightness is a weak "looks the same" check.** Stripping every texture from the chair moved mean model luminance by only 3.4 %. Mean absolute RGB difference per pixel separates cleanly (noise 0.00, KTX2 0.33, untextured 5.47). Transfer canvas pixels as base64: a JSON number array of 1280×720 RGBA is slow enough to time tests out. Also, three's GLTFLoader sets texture colour space by material slot, so a wrong sRGB flag in a KTX2 file doesn't change the render.
- KTX2 size is dominated by UASTC maps: for the chair the 1024² normal map was 838 of 1 445 KB. Halving its resolution saved more than any RDO setting (RDO 5 gave −8 %). Output is byte-identical across runs.
- Vite warns "chunks larger than 500 kB" for any Three.js bundle — that's the raw size; gzip is ~130 KB. The budget is measured gzipped (Constitution IV), so `chunkSizeWarningLimit` is set to 700.
- Typecheck includes `vite.config.ts`/`playwright.config.ts`, so `@types/node` + `"node"` in tsconfig `types` is required.
