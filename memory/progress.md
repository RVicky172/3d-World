# Progress Log

Newest first. One entry per working session.

```
## YYYY-MM-DD — <feature id or "chore">
**Done:** …
**Next:** …
**Blockers:** …
```

---

## 2026-10-06 — 022-solar-system-surfaces (Implemented)

**Done:**

- 021 committed (`bf0d3e4`, not pushed). 022 spec drafted; Q1–Q9 answered (D-029); approved. Plan approved with AC-13 amended to Space ≤ 4 MB incl. the decoder and committed source maps (D-030); 26 tasks.
- T001: source survey (NASA/USGS public domain first, Solar System Scope CC-BY for the Sun, Venus, Saturn + rings, Uranus, Neptune, Earth's ocean mask); approved with greyscale maps tinted by body colour, Titan tinted orange, the Yale BSC5 credited (D-031). NASA's hosts moved to `assets.science.nasa.gov`; NASA SVS and NSSDC unreachable from here.
- T002: ETC1S q128 trial: Earth 264 KB, Jupiter 288, Saturn 130, Neptune 82, Uranus 7 (2K); clouds 92, Moon 91 (1K) → all imagery ≈ 2.4–2.6 MB. Ocean mask ETC1S, not UASTC.
- T003: `KTX2Loader` in the chunk: entry +0.0 KB; Space 17.3 → 40.6 KB code + 571 KB decoder → projected ~3.1 MB total.

- T004: `scripts/solar-imagery.mjs` (14 tests) + `fetch-solar-imagery.mjs`: 20 maps in `assets-src/solar-system/` (5.4 MB), one convention, tints, Titan contrast, no-data fill; CREDITS section. 780 unit green.

- T005: `scripts/star-catalogue.mjs` (8 tests) + `build-star-catalogue.mjs`: 9 096 stars → `stars.bin` 53.3 KB; credit. 788 unit green.

- T010: pipeline texture entries (`TextureEntry`, `checkTextureOutput`), `npm run assets` → 20 KTX2 maps, 2.40 MB (+ stars = 2.45 MB); per-Space budget `solar-system` ≤ 4 MB in the bundle check. 799 unit green; build OK.

- T011: `src/shared/ktx2.ts` (`configureKtx2`, `createKtx2`) shared by the model viewer and the Solar System. 806 unit + 159 E2E green.

- T020: imagery data on every body, Earth layers, Saturn rings in km (1.279–2.349 × the drawn mean radius, not the plan's equatorial 1.239–2.270), `SKY.stars`, sources; 811 unit green.

- T021: `surfaces.ts` (`longitudeOfU`, `subPoint`), 10 tests; found and fixed a 021 bug (Earth's spin 180° off before 2000: node from the pole vector; now α₀ + 90°). 821 unit + 159 E2E green.

- T022–T024: `ring-shadows.ts`, `stars.ts` (decode, directions, size/alpha, B−V colour), `nightFactor`, `glowSize`; 20 tests, sabotage-checked where written alongside.

- T025: ring-aware stylised layout (Titan clears Saturn's rings; extent 57.1 → 61.8; no retune). 843 unit + 159 E2E green.

- T030: core `reportBackgroundProgress` + compact indicator variant (`.loading.is-background`); 10 tests. 852 unit + 159 E2E green.

- T040–T042: `materials.ts` (patches with anchor checks, image fade, Earth ocean/night, clouds, Saturn ring-shadow patch), `rings.ts` (fixed: plain band colour was sRGB in a linear uniform), `createStarfield` (xyww at infinity) and `createGlow` (additive sprite, generated falloff). 875 unit + 159 E2E green. Not yet wired into the Space (T050/T051).

- T043: `imagery.ts` (`imageryJobs`, `loadImagery`: byte progress, failures kept coloured with one warning, abort disposes late arrivals, loader freed when settled; `createFader`). 887 unit + 159 E2E green.

- T050–T051: Space tests (11, via `createKtx2`/`loadStars`/`baseUrl` seams) and wiring (`scene.attach`/`updateSun`, imagery + stars after open, glow, fader, ring-aware near plane, ordered dispose). Screenshots checked (surfaces, terminator, city lights, ocean glint, Saturn 2025/2032 shadows, stars, glow). Fixed: ring strip 1024 × 63 → pipeline block alignment; 021 speed E2E straddling imagery arrival → `data-space-background` signal (D-032). 902 unit + 159 E2E (3 runs); entry 147.9 KB; Space 3.06 MB.

- T060: `solar-system-surfaces.spec.ts`, 9 E2E tests for AC-1–AC-6 by paired pages (one with maps 404ing) on one pose; AC-2 by lighting-free ratio images. AC-1's detail check excludes Uranus/Neptune (featureless maps; lead approved, D-033). 902 unit + 168 E2E.

- T061: 5 E2E tests (rings + both shadows by tracing pixels in Saturn's frame; stars at infinity and under bodies by pages with/without `stars.bin`; glow halo at both scales, never over the Sun's disc). Fixed: paired pages now share a fixed date; 021's speed test measures Space time (clamped deltas). 902 unit + 173 E2E, 3/3 full runs.

- T062: 4 E2E tests (held Jupiter map: usable, compact indicator, coloured then textured; 404: stays coloured, one warning; 10 round trips incl. one mid-load back to DOM/GPU/worker baseline; context loss keeps time state and imagery). Sabotage-checked. 902 unit + 177 E2E, 2/2 full runs. E2E section complete.

- T090–T091 (`/spec-verify 022`): docs updated; 902 unit + 177 E2E + build green; entry 147.9 KB; Space 3.06 MB; production gate-5 probe clean. AC-1–AC-12 ticked. AC-13 open: SwiftShader 53.5–56.5 fps at whole-system views (60.3 with the maps blocked: software texture sampling); 60 FPS on a mid-range laptop not yet measured. Spec stays In Progress; roadmap 🚧.

- T092: AC-13 accepted on the SwiftShader floor by the lead (D-034); 13/13 ACs ticked; spec Implemented; roadmap 022 ✔️.

**Next:** commit 022 when the lead asks; then `/spec-new` for 023 (selection & focus).
**Blockers:** none

## 2026-10-06 — 021-orbital-mechanics ✔️ Implemented

**Done:**

- Spec Q1–Q9 answered (D-025); plan approved; 20 tasks.
- T001: entry-size spike +0.0 KB (`LineLoop`, `LineBasicMaterial`, `Quaternion` already shared).
- T002: `scripts/horizons.mjs` (pure, 4 tests) + `fetch-reference-positions.mjs`; fixture of 15 bodies × 7 dates (first date 1800-01-03: no Neptune ephemeris earlier).
- T010: element rates, NAIF poles/prime meridians, moon apsis/node periods (lead-approved). The cross-check caught Mars's pole 1.3° off (71 000-year term folded in at J2000).
- T011: `time.ts` (clock in days since J2000, four speeds, direction, 1800–2050 clamp that pauses and reports once, UTC `formatDate`/`isoDate`, `initialTime`). 672 unit green.

- T013 started (draft `src/spaces/solar-system/orbit.ts`, no tests yet): planets within 0.17° and 0.13 % of Horizons at all 7 dates. **Moons miss 10° (plan risk → stopped):** with the JPL table as stored, Io/Europa/Ganymede/Callisto are right at J2000 but drift to 90–175°; Titan is ~160° off at every date; the Moon is 10.4° off in 1800; Triton 45–151°. Measured fixes: mean-longitude rate = NAIF |Ẇ| → Moon and Galileans ≤ 2.1°; Titan's epoch angle from Horizons → ≤ 3.5°; Triton still 2–29° under every convention. Scratch measurements kept outside the repo.
- Lead chose the fixes + a 30° Triton allowance (D-026; spec AC-3 and plan §3 amended). T012: `orbit.test.ts` (36 tests: planets vs fixture, ellipse shape, moons vs fixture and direction and period, spin period/tilt/backwards/facing/fast-spin hold, frames, no allocation). T013: `orbit.ts` finished; Titan's M 11.7° → 213.3°. Worst errors: planets 0.17°/0.13 %, Moon 1.4°, Galileans 2.1°, Titan 5.2°, Triton 25.1°.

- T014: `scale.ts` `createPlacement(bodies).at(layout, mode, days)`: real = orbit maths ÷ 10⁶ km, stylised = 020 ring at the true XZ angle; same objects every call; no overlap at 200 seeded random dates (sabotage-checked).
- T020: `scene.ts` `applyPositions()` / `applyOrientations()`. 715 unit green.

- T021: `orbit-lines.ts` (15 line loops per scale, prebuilt, visibility toggle, in-place refresh, no raycast). D-027: moon lines refresh after 1 % of their precession (the 10-year rule left the Moon 5.4 % off). 723 unit green.

- T022: controls `follow(delta)` (camera + target move together; not an interaction; the frame's update clamps). 726 unit + 145 E2E green.

- T023: core seams: `SpaceContext.startTime` (manager `wallClock`, main passes `Date.now`), `saveState()` → `savedState` on resume only (kept through a loss mid-rebuild), `__WORLD__.simTime()`/`setSimTime()`. 734 unit + 145 E2E green.

- T030: `time-controls.ts`: "Time" group, `<time datetime>` date (not live), Play/Pause time, Speed select, Backwards toggle, polite announcements for play/pause, direction and range limits; silent `set()`. 748 unit green.

- T031–T032: Space wiring: time (start time, reduced motion, controls, range limit, saved state), per-date positions/orientations/orbit lines, follow after a re-centre (stops on pan/reset/scale switch), `simTime`/`setSimTime`; `.solar-bar` layout; screenshots at 3 sizes clean. D-028 (ambient 0.1 for night sides; saved state = time only). 765 unit + 145 E2E green; entry 146.6 KB.

- T040: `solar-system-time.spec.ts` controls (7 tests: mouse, keyboard, touch, date, today, 2050 limit, reduced motion).
- T041: motion E2E (4 tests: spin and fast-spin hold, markers on moving bodies, follow + pan, Neptune's path drawn at both scales). Found and fixed markers lagging moving bodies under a still camera (`markers.invalidate()`); `bodies()` reports quaternions. 766 unit + 156 E2E green.

- T042: lifecycle E2E (context loss keeps time paused or playing; fresh visit starts today at 1 week/s; round trips with time running back to baseline). 766 unit + 159 E2E green.

- T090: architecture updated for 021 (contract, core seams, `follow`, Solar System motion, seams, Tab order).
- T091–T092 (`/spec-verify 021`): 766 unit + 159 E2E, build OK; entry 146.6 KB (+0.1); Space 17.3 KB; gate-5 probe clean (production build, E2E flags); 60.2 fps under SwiftShader (renderer string in `tasks.md`). All 13 ACs ticked; spec Implemented; roadmap 021 ✔️.

**Next:** commit 021 when asked; then `/spec-new` for 022 (planet textures, Saturn rings, starfield, Sun glow).
**Blockers:** none

## 2026-10-05 — 020-solar-system-data ✔️ Implemented

**Done:**

- 012 committed (`dbd4882`). 020 spec drafted; Q1–Q6 answered (D-022: spread fixed angles, 7 moons ≥ 1 000 km, stylised default remembered, full J2000 data, real-scale name markers, entry ≤ 3 KB). Plan and 19 tasks.
- T001 spike: OrbitControls' `zoomToCursor` can't reach a body at real scale (stalls at the target's depth); re-centring the orbit on the body under the pointer reaches Earth in 58 steps. Real-scale rendering clean (separate meshes, dynamic near/far). Entry +0.4 KB. Lead chose re-centring (D-023: `focusOn` + `zoomSpeed` 4).
- T010–T011: data for 16 bodies from JPL (Horizons API, phys_par, approx_pos, sats/elem; NSSDC unreachable), approved by the lead; Kepler residuals ≤ 0.75 %; IAU spin convention (tilt > 90° = backwards). CREDITS gains a Data section.
- T012–T013: `scale.ts` (real 1 unit = 10⁶ km; stylised packed rings). Constants retuned to exponent 0.25 / log 1.5 after the perspective-correct visibility test (3.33 px at 1280 × 720).
- T020–T021: `scene.ts`: system → Sun + decay-0 point light + faint ambient; planet orbit groups → mesh + moon orbit groups (moons don't inherit planet scale); one shared sphere; `applyLayout` moves/rescales only. Caught an unknown-parent fall-through with a new test.
- T022: controls `focusOn(point)` (target moves, camera stays, an interaction, reset returns home) and `zoomSpeed` config. 609 unit + 129 E2E green.

- T023: `scale-toggle.ts`: "True scale" button with `aria-pressed`; a polite visually hidden description that the canvas's `aria-describedby` points at; `set()` for restores.
- T024: `markers.ts`: real-scale name labels (`aria-hidden`, pointer-events none), read-then-write-on-change, a moon hidden within 24 px of its planet, `nearest(x, y, r)` for re-centring; a real dot element so E2E can measure it. CSS for both. 626 unit green.

- T025–T026: `index.ts` (`createSolarSystem`): remembered scale (`world.solarSystem.scale`), toggle + markers before the controls, switch re-homes instantly, real-scale re-centring on wheel (capture phase) and pinch start via `markers.nearest()`, near plane at half the nearest surface (clamped 1e-6–1, 10 % hysteresis), far past the system, `bodies()` seam. A unit test caught the camera entering Earth/the Sun (min zoom was 3 × smallest radius) → `focusOn(point, { minDistance })`, 1.2 × the orbited body's radius (D-023 addendum). `memoryStorage()` moved to `tests/helpers/fakes.ts`. 643 unit + 129 E2E green.

- T027: `solar-system` registered (first card); `__WORLD__.bodies()`. Four gallery/controls E2E tests pinned the two-card order/Tab count and were updated. Screenshots at 1280/375/320 in both scales: clean, no overlap, no console errors; cosmetic issue raised (inner-planet labels overprint at real-scale home; Neptune clipped at 320). Entry 146.5 KB (+0.5); Space 12.3 KB. 647 unit + 129 E2E green.

- Chair wording fixed at the lead's request: registry description "velvet armchair" → "velvet lounge chair" (the model has no arms, found in 012 T040); the two E2E card checks and a unit fixture updated.

- T030: `solar-system.spec.ts`, 8 tests (AC-5, AC-7, AC-8, AC-9). Sabotage-checked; the re-frame test now moves the camera first (learnings). 647 unit + 137 E2E green.

- Label declutter (D-024, lead's choice): the larger body keeps its name, names stay in view; names are measured once per show/resize after a real-browser check disproved the estimate. AC-8a amended.
- T031: 6 E2E (markers, declutter, zoom to Earth, touch re-centre, lighting, still bodies). 652 unit + 143 E2E green.

- T032: round trips (DOM + GPU memory back to baseline; sabotage-checked) and context loss keeps real scale. 652 unit + 145 E2E green.

- T090: architecture: a Solar System section (data, scales, scene graph, precision, re-centring zoom, markers, toggle, Tab order), controls `focusOn`/`zoomSpeed`, seams; the planned section narrowed to 021–023.
- T091: full gate green; entry 146.5 KB; Space 12.7 KB; gate-5 probe clean; 60.3 fps in SwiftShader (software floor; logged the renderer string).
- T092: all 14 ACs ticked; spec Implemented; roadmap 020 ✔️.

- Committed and pushed: `dbd4882` (012) and `601c597` (020).
- 021 spec drafted (13 ACs, Q1–Q9 open).

**Next:** the lead answers 021's Q1–Q9 → `/spec-plan 021`.
**Blockers:** none

## 2026-10-05 — 012-info-panel ✔️ Implemented

**Done:**

- 011 committed and pushed (`2189380`).
- 012 spec drafted; Q1–Q7 answered (D-020: panel open + remembered, side/bottom sheet; dimmed occluded markers; hotspot turns the camera; 4 chair hotspots; no deep links; turntable pauses; entry ≤ 3 KB). Plan approved with drafted hotspot copy; 30 tasks.
- T001: a realistic panel + preferences in the entry and `Raycaster` lazy → +0.7 KB.
- T010–T013: `src/core/preferences.ts` (JSON in localStorage, never throws, even when reading `window.localStorage` throws) and `src/ui/info-panel.ts` (a region named by its h2, a toggle with `aria-expanded`, "Hide info"/"About <title>", prepended). CSS: side panel above 640 px, bottom sheet ≤ 35vh below it, hint moved to the top on narrow screens.
- T014–T015: `SpaceManager` option `infoPanel`, created after the factory (with registry title + description) and disposed in `release()`; wired in `main.ts` with the preference. One E2E updated (Tab order). Screenshots caught the 010 credit wrapping over the sheet on phones; the credit now gets its own line on narrow screens. 491 unit + 99 E2E green; entry 146.0 KB.

- T020–T023: `src/shared/controls/turn.ts` (`easeTurn` smoothstep; `turnStep` great-circle rotation, fixed perpendicular for opposite directions). Turntable `hold()`: release restarts the idle delay. Controls `turnTo(direction, { duration = 0.6 })`: flushes damping, clamps polar, eases the direction and the target back to the focus at a fixed distance, advanced in `update(delta)`, instant under reduced motion, cancelled by any input, sets `userMoved`. `holdTurntable(hold)`. 509 unit + 99 E2E green.

- T030–T035: `src/shared/hotspots/` — `toScreen()` (projection), `createOcclusion()` (raycasts only after the camera moves, ≤ every 0.1 s), `createHotspots()` (buttons in a `.hotspots` layer, read-then-write per frame and nothing written when nothing changed; dimmed = `disabled` + `.is-dimmed`, focus falls back to the canvas; one annotation in an always-present polite live region; `turnTo` + `holdTurntable`; Escape on the layer). CSS for markers (44 px hit area) and annotation. Plan updated for the live-region wrapper and the Escape scope. 538 unit + 99 E2E green (one `subpath` run hit `ERR_CONNECTION_REFUSED` once; passed 3/3 alone and on a full rerun).

- T040: probe (component split of the source GLB + a throwaway page rendering the shipped chair via the real loader). No arms, wooden legs, metal = bolts + glides, printed label → AC-5 and copy revised, approved (D-021). Positions/views in `tasks.md`. `Raycaster` occlusion = 8.2 ms per pass → own any-hit test over a world-space Float32Array (0.7 ms), approved (D-021); `occlusion.ts` reworked test-first (+ transformed, quantized, non-indexed, double-sided, dispose cases). 542 unit green.

- T041–T045: viewer mounts hotspots before the controls (proxy to `controls` for `turnTo`/`holdTurntable`), updates them after `controls.update()`, resizes and disposes them; `SpaceInstance.hotspotPositions?()`. Chair data: 4 hotspots (D-021), unit-checked against the source GLB bounds via glTF-Transform. Screenshots at 1280 and 320 px: markers covered the sheet, and on phones the annotation landed on its own marker → annotation goes below/above when neither side fits; markers under `.info` (z 1) except focused/open ones (z 2, WCAG 2.4.11), annotation z 2. `__WORLD__.hotspots()` + `cameraProjection()`. 560 unit + 99 E2E green; entry 146.0 KB; chair 1.87 MB.

- T050: `tests/e2e/info-panel.spec.ts` (12 tests: card strings, remembered collapse across reload/Spaces/fresh context, mouse/keyboard/touch toggle, drag+wheel on the panel, sheet ≤ 35 % and clear of hint/controls/credit at 320 and 375 px with screenshots, collapsed framing, region name, full Tab sequence on the chair, demo-cube without markers). Sabotage-checked (preference ignored, panel letting pointers through, sheet over the controls row). 560 unit + 111 E2E green.

- T051–T053: `tests/e2e/hotspots.spec.ts` (18 tests). Markers within 4 px of points projected in Node (three) from `cameraPose()` + `cameraProjection()` + `hotspots()` read in one evaluate: home, orbit, zoom, pan, 320×640, resize, mid-turntable. Dimming at front/back/below (proves raycasts on the Meshopt chair). Tab order + focus ring, arrows only on the canvas. Activation: polite annotation, one at a time, Escape/Close/marker close with focus back, instant and eased turns, Reset home, 44 px targets, drag from a marker vs between markers, touch tap. Turntable paused beyond its idle delay, resumes after close. 10 round trips (DOM + GPU memory) and context loss/restore. Gotchas: Playwright's stable-element wait stalled clicks on moving markers 9 s (`force: true`); a 600 ms pause check was vacuous (turnTo restarts the idle delay); the lazy loading announcer. All sabotage-checked. 560 unit + 129 E2E green (twice).

- T090–T092: `specs/architecture.md` (info panel, hotspots, `turnTo`/`holdTurntable`, Tab order, stacking, seams). Full gate: Prettier clean, 560 unit + 129 E2E, build OK; entry 146.0 KB, chair 1.87 MB, `__WORLD__` absent. DoD gate 5 probe on the production build: no warnings or errors under SwiftShader. Without the E2E flags the NVIDIA driver logs "GPU stall due to ReadPixels" on a browser's first page, identically in a worktree build of 011 (`2189380`), so it's environmental (learnings). All 17 ACs ticked; spec Implemented; roadmap 012 ✔️ (Phase 2 complete).

**Next:** commit 012 when asked; then Phase 3 (`/spec-new 020`). Open question: "armchair" in the chair's registry description.
**Blockers:** none

## 2026-10-05 — 011-asset-pipeline ✔️ Implemented

**Done:**

- `/spec-verify 011`. DoD:
  - `npm run check` ✅ (34 files, 475 unit);
  - `npm run test:e2e` ✅ (99, ~44 s at 4 workers);
  - `npm run build` ✅ (entry 145.6 KB gzipped, +0.8 KB of the 5 KB cap; sheen-chair 52.3 KB + 1.26 MB + 571.2 KB transcoder = 1.86 MB ≤ 5 MB; `__WORLD__` absent from production);
  - a temporary probe (throttled load, keys, 3 round trips, lose/restore) logged no warnings or errors, and left 0 workers.
- NFRs measured with temporary probes: time to model drawn at ~10 Mbit/s is 1.85 s compressed vs ≈ 3.4 s original (processing 255 vs 228 ms, plus transfer by bytes, since routed responses bypass CDP throttling). Longest main-thread task ~80 ms for both, so decoding doesn't freeze the page.
- All 15 ACs ticked; spec Implemented; roadmap 011 ✔️; T092 ticked.
- Coverage notes:
  - AC-7 is proven in SwiftShader only (a device with few compressed formats); which format it transcoded to isn't asserted.
  - AC-14's "same size twice" was verified by running `npm run assets` twice (same SHA-256), not by an automated test (the encoder takes ~8 s and isn't part of `npm run check`).
  - AC-8's unknown-total fallback is unit-tested only (the preview server always sends Content-Length).

**Next:** commit 011; then `/spec-new` 012.
**Blockers:** none

## 2026-10-05 — 011-asset-pipeline (spec → T002)

**Done:**

- 010 committed and pushed (`46b91c1`).
- 011 spec drafted; Q1–Q5 answered (D-017: Meshopt only, ≤ 1.5 MB, ±10 % brightness, `assets-src/`, bar + % at 25/50/75, spike-set entry cap). Plan approved with five dev-only packages (D-018: glTF-Transform ×3, meshoptimizer, ktx2-encoder, chosen because `toktx` isn't installed). 23 tasks.
- T001 spike: entry +0.2 KB → AC-6 cap 5 KB. three r186 KTX2Loader self-hosts `basis_transcoder.js/.wasm` through `new URL(…, import.meta.url)`: hashed build assets, listed in the chunk's manifest `assets`, and served from `node_modules` in dev. The chair's lazy chunk grows to ~52 KB gzipped.
- T002: dev deps installed (0 vulnerabilities); original copied to `assets-src/sheen-chair/` with a README; `dist/` doesn't contain it. 379 unit + 90 E2E green.

- T003 spike: ktx2-encoder works in Node (sharp as `imageDecoder`; declared as a dev dep, D-018 addendum, user approved). Full-size encode was 1.88 MB; the normal map (838 KB of UASTC) dominated. Chosen settings: ETC1S colour, UASTC+Zstd RDO 1 data maps, normal map capped at 512 px → **1.27 MB**, byte-identical across runs, ~10 s. Meshopt took geometry from 1 119 to 430 KB. The `ktx2()` transform swallows failures, so the pipeline must assert every texture is KTX2.

- T010–T011: `src/core/progress.ts`: `clampProgress` (monotonic, [0, 1], null = unknown, non-finite ignored) and `announcementFor` (highest 25/50/75 step crossed; null previous counts as 0). 29 tests.
- T020–T021: indicator `progress()`. It stays one `role=status`: the spoken label becomes `.visually-hidden` (a class change, so it isn't re-announced), and an `aria-hidden` "… 42 %" text plus a `role=progressbar` bar are added. The spoken text changes only at 25/50/75 %. The pulse stops once determinate; the bar doesn't ease under reduced motion. 010's tests are unchanged.
- T022–T023: `SpaceContext.reportProgress?`, bound per request token in `SpaceManager`. Values from before the 250 ms show are kept (clamped) and applied on show; superseded, opened, failed and suspended requests are ignored. 423 unit + 90 E2E green.

- T030–T031: `src/shared/model-viewer/loader.ts`, `createGltfLoader(renderer, parts?)`: FileLoader download ∥ `ktx2.init()` → `gltf.parseAsync`. KTX2 is set up with `detectSupport` and 2 workers, plus MeshoptDecoder; progress is reported as a fraction or null. The viewer's seam changed from `loader` to `createLoader`; it forwards progress to `ctx.reportProgress` and disposes the loader in a `finally` right after loading. Probe: no console warnings, 0 workers after 3 round trips + lose/restore (still the uncompressed GLB). 432 unit + 90 E2E green.

- T040–T041: `scripts/asset-pipeline.mjs` (`validateManifest`, `textureMode`, `isColorTexture`, `maxSizeFor`, `checkOutput`) and `scripts/assets.config.mjs`. 30 tests, including the real manifest against the filesystem.
- T042–T043: `scripts/build-assets.mjs` + `npm run assets`. Per-texture `encodeToKTX2` (sequential, so errors throw; encoder stdout muted), Meshopt `level: 'medium'`, `KHR_texture_basisu` required. The chair is now **1.26 MB**, deterministic. CREDITS notes the conversion and lists the Basis transcoder (Apache-2.0) and the Meshopt decoder (MIT). 464 unit + 90 E2E green on the compressed file; entry 145.5 KB.

- T050–T051: the Space budget also counts files emitted by its lazy chunks (manifest `assets`, stored bytes, minus any the entry uses). The build prints code + assets + decoders = total. Chair: 1.86 MB of 5 MB. 468 unit tests green.

- T060: `tests/e2e/asset-pipeline.spec.ts`: size ≤ 1.5 MB, parity with the original (served by route from `assets-src/`), transcoder same-origin, gallery fetches no decoder. Probes: mean brightness can't see lost textures (3.4 %), but the pixel diff can (compressed 0.33, untextured 5.47, noise 0.00). The user chose to add **pixel diff ≤ 2.0** to AC-2 and a **"<title> loaded"** announcement for AC-9 (D-019).
- T024–T025: indicator `ready()`: a persistent `.loading-announcer` polite region (created on `show()`, cleared on the next show) says "<title> loaded". `SpaceManager.finishLoading()` calls it only after a shown, successful load. 475 unit + 94 E2E green.

- T061–T062: progress E2E with CDP `Network.emulateNetworkConditions` (400 KB/s) and a MutationObserver log: 0→100, spoken steps exactly 25/50/75, then "loaded". Reduced-motion styles; blocked transcoder and corrupt GLB → "Failed to load" with no GLTFLoader texture errors; 10 round trips → memory baseline and 0 workers. Sabotages (no pre-init → untextured `opened`; no dispose → 22 workers) are caught. 475 unit + 99 E2E green.

- T090: `architecture.md` gains an Asset Pipeline section and loader, progress, `ready()` and emitted-file budget notes, plus layout and seams. Fixed a stale `tech-stack.md` row (it still listed DRACOLoader and decoders in `public/`).
- T091: 475 unit + 99 E2E + build green; entry 145.6 KB; chair 1.26 MB; Space 1.86 MB.

**Next:** `/spec-verify 011`, then commit.
**Blockers:** none

## 2026-10-05 — 010-model-viewer ✔️ Implemented

**Done:**

- `/spec-verify 010`. DoD:
  - `npm run check` ✅ (31 files, 379 unit);
  - `npm run test:e2e` ✅ (90, ~36 s at 4 workers);
  - `npm run build` ✅ (entry 144.8 KB gzipped, budget 250 KB; sheen-chair 21.2 KB + 3.93 MB ≤ 5 MB; `__WORLD__` absent from production);
  - a temporary probe across open, keys, resize, 3 round trips, lose/restore and 5 s of turntable logged no warnings or errors (only three's `Context Lost.` / `Context Restored.` logs).
- All 14 ACs ticked; spec Implemented; roadmap 010 ✔️; T092 ticked.
- Coverage notes: AC-5's mouse, touch, pan and focus behaviours are proven by 004's E2E on the shared controls, and the chair's turntable by `viewer.test.ts`. The chair E2E smoke-checks hint, help, keyboard, Reset and the zoom limits (as the plan specified). AC-9 is proven E2E for a network error (aborted request); a 404 takes the same loader-rejection path but has no E2E of its own.

**Next:** commit 010; then `/spec-new` for 011 (asset pipeline).
**Blockers:** none

## 2026-10-05 — 010-model-viewer (spec → T002)

**Done:**

- Spec 010 drafted. Q1–Q5 resolved by delegation (D-012); plan and tasks written (23 tasks).
- T001 spike: GLTFLoader + RoomEnvironment cost the entry +8.3 KB, so the NFR was amended to ≤ 10 KB (D-013, approved by the user).
- T002: DamagedHelmet was rejected because its LICENSE.md also lists CC-BY-NC. The user chose SheenChair instead (CC0, 4.1 MB, 40k triangles; D-014). It is downloaded to `public/assets/sheen-chair/` with its CREDITS row. Spec, plan and tasks are updated (`sheen-chair`).

- T010–T011: `src/shared/model-viewer/framing.ts` (`frameDistance`, `distanceLimits`, `fitModel`) and `types.ts` (`ModelViewerConfig`, `AssetCredit` with SPDX licence ids). 14 unit tests; 341 unit tests total green.

- T020–T021: shared controls gain `userMoved` (any input sets it, `reset()` clears it, the turntable doesn't count) and `setHome({ position, distance, panLimit })`. It writes OrbitControls' `target0`/`position0`/`zoom0` directly, so Reset uses the new home without moving a camera the visitor has moved; it moves the camera only when `!userMoved`, and `update()` clamps into the new limits. 5 new tests; 346 unit + 73 E2E green (demo-cube unaffected).

- T030–T033: `src/ui/loading.ts` (`role=status`, polite, "Loading <title>…", z 3 above the fader, pulse off under reduced motion). `SpaceManager` options `loading` / `loadingDelayMs` (default 250 ms); the timer starts **after** the fade-out, so normal 300 ms fades don't trigger it. The indicator hides before the fade-in, on every failure or supersession, and on `suspend()`/`close()`. The body moved into a private `build()` wrapped in try/finally. Wired in `main.ts`. 358 unit + 73 E2E green.

- T040–T041: `createModelViewer(ctx, config, deps?)` with an injectable loader, environment and base URL.
  - Order: load the GLB first (a failure allocates nothing) → `fitModel` → generated RoomEnvironment PMREM as `scene.environment` → controls → credit line.
  - `resize()` re-frames along the current direction until the visitor moves the camera, then only updates the home.
  - `credit.ts` shows `.model-credit` bottom-left.
  - 11 unit tests.
- T050–T051: `src/spaces/sheen-chair/` (data + one-line factory, `fill: 0.85` after a screenshot showed ~53 % fill at 0.75), registered first.
  - Updated E2E tests that assumed a single or first demo-cube card (gallery AC-1/4/9, controls AC-13, resilience): they now select the demo-cube card by href, or press Tab twice.
  - Screenshots at 1280×720 and 320×640: framed, lit, credit visible; ready in ~240 ms locally.
- 374 unit + 73 E2E green. **Entry 144.8 KB = +9.9 KB vs 005, just inside the ≤ 10 KB NFR (D-013)**; sheen-chair chunk 15.4 KB gzipped + 4.1 MB GLB.

- T060–T061: `checkSpaceBudgets()` + `spaceIdOf()` in `scripts/bundle-checks.mjs`. A Space's own chunk plus its lazy-only static imports (gzipped; entry files excluded) plus `public/assets/<id>/` (bytes as stored) must be ≤ 5 MB. `check-bundle.mjs` prints each Space's size and fails the build when one is over (sabotage at 3 MB → exit 1, naming sheen-chair). sheen-chair = 21.1 KB code + 3.93 MB assets. 379 unit tests green.

- E2E crash fix: `npm run test:e2e` had crashed the machine (12 default workers × SwiftShader). `playwright.config.ts` now caps workers at `min(4, cores/4)`, override `E2E_WORKERS` (D-015). Full suite 80 tests in ~27 s, machine stable.
- T070–T071: `contentBounds()` in fixtures (bounds + fill of the smaller side + mean luminance; positive check: demo-cube > 0.3, not-found canvas = 0). `model-viewer.spec.ts`: gallery card + open (AC-1), framing at 3 sizes (AC-2), resize/re-frame/Reset (AC-3), lit from 4 sides (AC-4). Sabotage `fill: 0.4` → AC-2/AC-3 fail. 379 unit + 80 E2E green.

- T072: model-viewer E2E for zoom limits (radius derived from the home distance via `frameDistance`), controls smoke (hint, help, keyboard, Reset), reduced-motion stillness, accessible name + card text, credit line. Sabotage of `MIN_DISTANCE_FACTOR` and `MIN_FILL` → fails. A probe found the chair outline at ~7 % at full zoom-out: AC-5 amended to measure the bounding sphere (D-016, user's choice). 379 unit + 85 E2E green.

- T073: model-viewer E2E for the delayed-GLB loading status (AC-8), aborted GLB → "Failed to load" + back link with only the two expected console errors (AC-9), 10 round trips (AC-10), lose/restore framed + lit (AC-11), same-origin request log (AC-12). **AC-10 found a real leak:** +1 GPU texture per visit, because the PMREM environment is a render-target texture that `texture.dispose()` doesn't free. Fixed in `createStudioEnvironment` (dispose the target when the texture is disposed). 379 unit + 90 E2E green.

- T090: `specs/architecture.md` gains a Model Viewer section, loading indicator in the open sequence, `.loading` at z 3, layout, render-target disposal rule, seams (`ModelViewerDeps`, `page.route`, `contentBounds`), and the E2E worker cap. `tech-stack.md`: RoomEnvironment/PMREM lighting row, GLTFLoader-only in 010, ≤ 4 workers.
- T091: check (379), E2E (90) and build all green; entry 144.8 KB gzipped; sheen-chair 21.2 KB + 3.93 MB; `__WORLD__` absent from production.

**Next:** T092 via `/spec-verify 010`, then commit.
**Blockers:** none

## 2026-10-05 — 005-resilience-reduced-motion ✔️ Implemented (Phase 1 complete)

**Done:**

- T090: `specs/architecture.md` gains a Resilience & Reduced Motion section, plus layout, stacking (z 3), seams and `__WORLD__` additions.
- DoD:
  - `npm run check` ✅ (327 unit);
  - `npm run test:e2e` ✅ (73);
  - `npm run build` ✅ (entry 134.9 KB gzipped, +0.7 KB; `__WORLD__` absent from production);
  - a temporary test logged no console warnings across lose/restore and navigation.
- All 12 ACs ticked; spec Implemented; roadmap 005 ✔️; Phase 1 exit criteria met.
- Fixed CRLF endings that Python edits had introduced in 22 files (`prettier --write`; learning recorded).

**Next:** commit 005; then `/spec-new` for 010 (model viewer Space).
**Blockers:** none

## 2026-10-05 — 005-resilience-reduced-motion (T040–T051)

**Done:**

- `Engine.stop()`.
- `SpaceManager.suspend()` / `resume()`: remembers the latest requested target, keeps `data-view`, and `close()` forgets the target.
- `showContextLost()` panel at z 3 with a Reload button.
- `ContextGuard`: on loss, stop → suspend → panel → `data-webgl="lost"`; on restore, clear → start → resume. Wired in `main.ts`.
- `__WORLD__.loseContext/restoreContext` use three's `forceContextLoss/Restore`; `getExtension()` returns null while lost, so the plan's approach could never restore (plan + learnings updated).
- E2E:
  - loss and restore on the gallery and on a Space;
  - Reload;
  - leak check after restore (10 round trips).

  Sabotage (no `resume`) fails all 3 restore tests, and the new tests passed 5×.

- 327 unit + 73 E2E green; entry 134.9 KB (+0.7 KB vs 004).

**Next:** T090 (architecture doc), then T091–T092 / `/spec-verify 005`. Phase 1 then closes.
**Blockers:** none

## 2026-10-05 — 005-resilience-reduced-motion (T020–T030)

**Done:**

- `watchReducedMotion()` / `MotionPreference` (follows the media query's `change` event). It replaces `prefersReducedMotion()`, which was removed because nothing used it any more.
- Fader and SpaceManager take `reducedMotion: () => boolean`, read per fade and per view opened. `main.ts` keeps one watcher for the page's lifetime.
- E2E:
  - AC-10: live change → CSS at once, fade and turntable from the next view, no reload.
  - AC-9: single reduced-motion regression covering the card, starfield, fade, hint, turntable and damping.
  - Both proven to fail under sabotage.
- 302 unit + 69 E2E green.

**Next:** T040–T051, context loss (`Engine.stop`, `suspend`/`resume`, panel, `ContextGuard`, debug hooks, E2E).
**Blockers:** none

## 2026-10-05 — 005-resilience-reduced-motion (spec → T016)

**Done:**

- Spec drafted. The open questions were resolved by delegation (D-011): auto-restore + Reload button, motion change applies from the next view, no toggle, plain fallback. Spec Approved; plan and tasks written (30 tasks).
- T001 spike: SwiftShader fires context lost/restored (restore must come in a later task; see learnings).
- T010–T016:
  - `createRendererOrNull()`;
  - `data-webgl="unavailable"` on the fallback;
  - `main.ts` split into `startApp()`, falling back when there's no WebGL2 or the renderer fails;
  - `<noscript>` message;
  - `tests/e2e/resilience.spec.ts` (6 tests: 3 routes, renderer failure, a11y/contrast/320 px, no-JS). The renderer-failure test was proven to fail under sabotage.
- 298 unit + 67 E2E green.

**Next:** T020–T026, live reduced motion (`watchReducedMotion`, getter in Fader/SpaceManager).
**Blockers:** none

## 2026-10-04 — 004-camera-controls ✔️ Implemented

**Done:** Definition of Done verified:

- `npm run check` (293 unit), exit 0;
- `npm run build` + bundle check: entry 134.2 KB gzipped (+1.4 KB vs 003; amended NFR ≤ 1.5 KB, D-010), demo-cube chunk 6.9 KB;
- `npm run test:e2e` (61 incl. touch and sub-path), no console errors;
- Prettier clean.

Coverage: total 98 % lines; `src/shared/controls/*` 100 %. Ticked AC-1…AC-13, spec → Implemented, roadmap 004 → ✔️. 60 FPS not measured (no GPU in CI).
**Next:** commit 004; `/spec-new` for 005.
**Blockers:** none

## 2026-10-04 — 004-camera-controls (T040)

**Done:** `specs/architecture.md`: status, `src/shared/controls/` in layout, `focusTarget` in the contract, focus restore in the open sequence, DOM vs stacking order, new **Focus Management** and **Camera Controls** sections, seams rows (controls unit, CDP touch), `cameraPose` in the debug hook. OrbitControls quirks were already in learnings (T016).
**Next:** `/spec-verify 004`.
**Blockers:** none

## 2026-10-04 — 004-camera-controls (T030–T031)

**Done:** `tests/e2e/controls.spec.ts`, 21 tests:

- mouse orbit, zoom and pan (right-drag and Shift+drag);
- keyboard only while the canvas has focus, with a focus ring and accessible name;
- zoom and pan limits (cube stays on screen);
- reset by `R` and by the button;
- no controls on the gallery;
- 10 enter/leave cycles leave nothing behind;
- the UI never moves the camera, and Tab order is back → 3D view → ? → reset;
- hint (interaction and timeout), help panel with Esc;
- resize keeps the view;
- AC-13 focus round trip, and no focus on first load;
- CDP multi-touch (orbit, pinch, two-finger pan, no page scroll);
- no inertia / no auto motion under reduced motion; turntable while idle; glide after a flick; turntable waits after interaction.

Fixtures gained `cameraPose`, `rotationBetween`, `distanceBetween`, `radius` and `touchGesture`. Fixed one test bug (wheel landed on the canvas after a drag). Timing tests stable at 5× repeat. 293 unit + 61 E2E green.
**Next:** T040 docs, then verify.
**Blockers:** none

## 2026-10-04 — 004-camera-controls (T020–T023)

**Done:**

- T020: back link prepended (Tab order).
- T021: `__WORLD__.cameraPose()`.
- T022: demo-cube adopts `createCameraControls`. Self-rotation removed; camera starts ~23° up so the top face shows; the turntable is deterministic by delta; `prefersCoarsePointer()` helper.
- T022 surfaced two issues, both decided by the user (D-010):
  - lost keyboard focus after activating a card → new **AC-13** + **T023**: `SpaceInstance.focusTarget()`; SpaceManager restores lost focus (never on first view, never from a visible focused element); gallery returns the card just left (else a `tabindex=-1` heading); demo-cube returns the 3D view. 003's AC-7 E2E updated.
  - entry +1.4 KB (three core classes shared with lazy chunks) → NFR amended 0.5 → 1.5 KB.
- Screenshots checked (desktop, help panel, 360 px phone); help-panel columns aligned.

293 unit + 40 E2E green. demo-cube chunk 6.9 KB gzipped.
**Next:** T030–T031 controls E2E.
**Blockers:** none

## 2026-10-04 — 004-camera-controls (T010–T016)

**Done:** `src/shared/controls/`:

- `keyboard.ts`: `keyAction` mapping; `orbitStep`, `zoomStep`, `panStep`.
- `turntable.ts`: delta-driven idle state.
- `controls-ui.ts`: hint (aria-live, 4 s of Space time), "?" disclosure panel with Esc, "Reset view".
- `index.ts`: `createCameraControls` wrapping OrbitControls — limits incl. `cursor`/`maxTargetRadius` pan clamp, damping/turntable off under reduced motion, focus-scoped keys, canvas a11y attributes, reset flush, full dispose.
- CSS for the controls UI and the canvas focus ring.

62 new unit tests; 279 unit + 40 E2E green. The easing check moved to T031 (damping doesn't apply to zoom).
**Next:** T020–T022 integration.
**Blockers:** none

## 2026-10-04 — 003-gallery ✔️ Implemented

**Done:** Definition of Done verified: `npm run check` (217 unit), `npm run build` + bundle check (132.8 KB gz, +2.0 KB vs 002; NFR ≤ 5 KB), `npm run test:e2e` (40 incl. 3 `subpath`), Prettier clean, no console errors. Coverage total 97.2 % lines; gallery/router/back-link 95–100 %, space-manager 98.6 %. Ticked AC-1…AC-13, spec → Implemented, roadmap 003 → ✔️. NFRs not measured: 60 FPS backdrop and 1 s interactivity (no GPU in CI), argued by design.
**Next:** commit 003; `/spec-new` for 004 camera controls.
**Blockers:** none

## 2026-10-04 — 003-gallery (T040)

**Done:** `specs/architecture.md`: View concept (gallery vs Space), Gallery concept, `src/gallery/` + back link in layout, "Opening a View" with `openView`/`data-view`/`activeView`, new stacking order, routing home = gallery with route keys, new Gallery section, warm-up note in Disposal Rules, gallery seam row.
**Next:** `/spec-verify 003`.
**Blockers:** none

## 2026-10-04 — 003-gallery (T031)

**Done:** `tests/e2e/gallery.spec.ts` — 17 tests for AC-1–AC-11 and AC-13: cards/content/placeholder, click and Enter open with one history entry, no Space chunk until opened, 10-trip GPU baseline, back link per screen and keyboard, titles, roles/focus outline, 360 px single column / 1280 px multi-track grid, WCAG contrast ≥ 4.5 computed in-page, z-order fader > overlay, gallery swapped only under full cover (MutationObserver), starfield drawn/drifting/still under reduced motion. Found three's DFG LUT texture (+1 once, renderer-owned): baseline now taken after a warm-up visit; AC-6 clarified in spec changelog; mutation-checked (gallery dispose off → 12 vs 2 geometries). 217 unit + 40 E2E green.
**Next:** T040 docs, then verify.
**Blockers:** none

## 2026-10-04 — 003-gallery (T020–T023, T030)

**Done:** SpaceManager: shared `mount()` behind `open(id)` and new `openView(name, factory)`; `ViewName`, `activeView`; `data-view` set at request start; not-found counts as a Space screen. Router: `openGallery` replaces `defaultSpaceId`, route keys `gallery`/`space/<id>`, gallery title `3D World`. main.ts wires the gallery view + back link. CSS stacking canvas → overlay → fader → back link. Updated 8 E2E tests that assumed home = demo-cube; 002 spec changelog notes AC-5 superseded. T023 was merged into T030 (the bridge could not keep E2E green). Visual check via screenshots (desktop, 360 px, in-Space). 217 unit + 23 E2E green.
**Next:** T031 gallery E2E, T040 docs, verify.
**Blockers:** none

## 2026-10-04 — 003-gallery (T010–T015)

**Done:** `src/gallery/starfield.ts` (1500 seeded points, 1 draw call, no texture, drift = elapsed × speed, still with reduced motion; `sizeAttenuation: false` so far stars stay visible). `src/gallery/cards.ts` (heading + list of card links via `formatRoute`, kind labels, initials, base-aware `thumbnailUrl`, lazy decorative img with placeholder fallback on error, inline-SVG kind icons). `src/gallery/index.ts` (`createGalleryView` factory: cards in overlay, starfield in scene, full dispose). `src/ui/back-link.ts` + CSS (hidden on `data-view=gallery`). Gallery CSS with solid `--surface`/`--border` tokens. 33 new tests; 206 unit + 23 E2E green.
**Next:** T020–T023 core changes.
**Blockers:** none

## 2026-10-04 — 002-hash-router ✔️ Implemented

**Done:** Definition of Done verified: `npm run check` (173 unit), `npm run build` + bundle check (130.8 KB gz, +0.5 KB vs 001), `npm run test:e2e` (23 incl. 3 `subpath`), Prettier clean, no console errors. Coverage: routes.ts/router.ts/debug.ts 100 % lines, total 97 %. Ticked AC-1…AC-12, spec → Implemented, roadmap 002 → ✔️.
**Next:** commit 002; `/spec-new` for 003 gallery (redefines home route).
**Blockers:** none

## 2026-10-04 — 002-hash-router (T030)

**Done:** `specs/architecture.md`: HashRouter concept, routes.ts/router.ts in the layout, new Routing section (grammar, router rules, startup), seams table rows for `FakeBrowserLocation` and the `subpath` project, `navigate` in `__WORLD__`; removed `?space=` references.
**Next:** `/spec-verify 002`.
**Blockers:** none

## 2026-10-04 — 002-hash-router (T021–T022)

**Done:** `tests/e2e/router.spec.ts` — 13 tests for AC-1–6, 8–10, 12 (no-reload marker, real Back/Forward, MutationObserver re-open detector + its own positive test, spaced rapid changes). Sub-path: Playwright now runs two web servers; `subpath` project builds with `VITE_BASE=/3d-World/` into `dist-subpath/` (port 4174), `subpath.spec.ts` verifies deep link, chunk path under the base, not-found, home. Replaced the flaky colour-count check with `canvasCoverage()` (+ blank guard); 15/15 repeats stable. 173 unit + 23 E2E green.
**Next:** T030 architecture doc, then verify.
**Blockers:** none

## 2026-10-04 — 002-hash-router (T015, T020)

**Done:** Debug hook gains `navigate(id)` (router now a `DebugDeps` field). `main.ts` creates `HashRouter` (window location/history/events, `manager.open`, titles from `findSpace`, `document.title`) and calls `router.start()`; `?space=` lookup removed. E2E helpers: `gotoSpace` uses `#/space/<id>`, new `noReloadMarker()`; 001 not-found test moved to `#/space/nope`. 173 unit + 7 E2E green. NFR: entry 130.3 → 130.8 KB gz (+0.5 KB, limit +2 KB).
**Next:** T021 router E2E, T022 sub-path E2E.
**Blockers:** none

## 2026-10-04 — 002-hash-router (T012–T014)

**Done:** `FakeBrowserLocation` test helper (+7 sanity tests). `src/core/router.ts` — `HashRouter`: `start`/`navigate`/`dispose`, unknown → `replaceState` home, skip Space already showing, retry after failure, titles with sequence-guarded outcomes, `SITE_TITLE`. 22 router tests; 172 unit tests green; router.ts/routes.ts 100 % lines. T015 moved to pair with T020 (needs a router in `main.ts`).
**Next:** T015 + T020 — wire into the app.
**Blockers:** none

## 2026-10-04 — 002-hash-router (T001, T010–T011)

**Done:** Spec 002 approved (D-007), plan + tasks (13) written. T001: `dist-subpath/` ignored in git, Prettier, ESLint. T010–T011: `src/core/routes.ts` — `parseHash` / `formatRoute` / `HOME_ROUTE`; home, space (decoded, trailing slash ok, malformed encoding keeps raw id), everything else unknown; ids case-sensitive. 38 table-driven tests incl. round-trips and hostile inputs; 143 unit tests total green.
**Next:** T012–T015 — router.
**Blockers:** none

## 2026-10-04 — 001-space-framework (T090–T091) ✔️ Implemented

**Done:** Verified Definition of Done: `npm run check` (105 unit tests), `npm run build` + bundle check (entry 130.3 KB gz, demo-cube lazy, no `__WORLD__`), `npm run test:e2e` (7 tests), Prettier clean. Coverage: lines 96.6 % total; core 93.7 %, shared/ui 100 %. Added `prefersReducedMotion` unit tests (was the only untested branch of note). Ticked AC-1…AC-11, spec → Implemented, roadmap 001 → ✔️.
**Next:** `/spec-new` for 002 — hash router & deep links.
**Blockers:** none

## 2026-10-04 — 001-space-framework (T040)

**Done:** Rewrote `specs/architecture.md` to match the implementation: directory layout, contract with `render?()`, time model (Space time, clamped delta, reset on resume), Engine frame/resize rules, SpaceManager open sequence + supersession + error handling, Fader, disposal rules, testability seams table, `__WORLD__` hook.
**Next:** `/spec-verify 001`.
**Blockers:** none

## 2026-10-04 — 001-space-framework (T032–T033)

**Done:** `scripts/bundle-checks.mjs` (pure checks: Spaces are lazy chunks, entry ≤ 250 KB gz, no `__WORLD__` in prod) + `scripts/check-bundle.mjs` run by `npm run build`; tsconfig now type-checks `scripts/`. E2E: `tests/e2e/fixtures.ts` (auto console-error check, helpers), `space-framework.spec.ts` covering AC-4, AC-5, AC-8, AC-9, AC-10 (incl. reduced motion); smoke test updated. Mutation-checked AC-4 (leak detected). 102 unit + 7 E2E green; entry 130.3 KB gz.
**Next:** T040 architecture doc, then verify.
**Blockers:** none

## 2026-10-04 — 001-space-framework (T030–T031)

**Done:** `src/core/debug.ts` (`installDebugHook` → `window.__WORLD__`: open/close/activeId/memory/cameraAspect; skipped in production). `src/main.ts` rewired: WebGL check → `WebGLRenderer` (clear colour from CSS `--bg`, `preserveDrawingBuffer` in test builds) → `Engine` → `Fader` (starts covered) → `SpaceManager` → open `?space=` or demo-cube. `Fader` gained `covered` and same-direction waiting. Verified manually: prod entry 134 KB gz with no `__WORLD__`; demo-cube is a separate 0.9 KB chunk. 10 new tests; 95 unit + 1 E2E green.
**Next:** T032–T033 — bundle check script, E2E suite.
**Blockers:** none

## 2026-10-04 — 001-space-framework (T024–T025)

**Done:** `src/core/space-manager.ts` — `SpaceManager` with `open(id)` (fade out → load → dispose previous → create → setInstance → nextFrame → fade in), sequence-token supersession, not-found/load-error messages, `close()`, `<body>` status attributes. 14 new tests (ordering, rapid switching, stale-instance disposal, errors, close-during-open); 85 total green. Decision D-006: failed opens close the current Space; added `data-space-status`.
**Next:** T030–T031 — debug hook and `main.ts` wiring.
**Blockers:** none

## 2026-10-04 — 001-space-framework (T022–T023)

**Done:** `src/spaces/registry.ts` (`spaces` with lazy `import()` loaders, `findSpace`). `src/spaces/demo-cube/index.ts` (data-driven `DEMO_CUBE` config, checkerboard `DataTexture`, rotation = elapsed × speed, slower with reduced motion, `disposeObject3D` on dispose). Plan/tasks: `CanvasTexture` → `DataTexture` (jsdom has no 2D canvas). 12 new tests; 71 total green.
**Next:** T024–T025 — SpaceManager.
**Blockers:** none

## 2026-10-04 — 001-space-framework (T020–T021)

**Done:** `src/core/engine.ts` — `Engine<R extends RendererLike>`: mounts canvas + `.overlay`, pixel ratio capped at 2, injectable `ResizeWatcher` (default `ResizeObserver`), `setSize(w,h,false)`, per-frame update → custom `render()` or `renderer.render` (AC-11), clear when empty, `setInstance` sizes new instance, `nextFrame()` promise, `dispose()` (does not dispose Spaces). Extracted shared fakes to `tests/helpers/fakes.ts`. 14 new tests; 59 total green.
**Next:** T022–T023 — registry + demo-cube.
**Blockers:** none

## 2026-10-04 — 001-space-framework (T014–T018)

**Done:** `src/shared/dispose.ts` (`disposeObject3D`: geometries, material arrays, material + uniform textures, scene background/environment, shared resources once). `src/ui/fader.ts` (`Fader`, 300 ms opacity fade, instant with reduced motion, timer-based). `src/ui/messages.ts` (`showMessage`/`clearMessage`, `role=alert`, text-only). CSS stacking: canvas → `.fader` → `.overlay`. 19 new unit tests; 45 total green; E2E green.
**Next:** T020–T021 — Engine.
**Blockers:** none

## 2026-10-04 — 001-space-framework (T010–T013)

**Done:** `src/core/clock.ts` (`createClock`, `FakeClock`, delta clamped to 0.1 s; `elapsed` is Space time = sum of clamped deltas) and `src/core/render-loop.ts` (`RenderLoop` with injectable `Scheduler`/`VisibilitySource`; pauses when hidden, resumes with delta 0). 17 new unit tests; 26 total green. Plan interface: `Clock.reset()` takes no argument.
**Next:** T014–T018 — disposeObject3D, Fader, overlay messages.
**Blockers:** none

## 2026-10-04 — 001-space-framework (T001–T002)

**Done:** Resolved 001 open questions (fade, opt-in render hook) → spec Approved; wrote plan.md + tasks.md (24 tasks). T001: Space contract in `src/core/types.ts` with compile-time tests (`tests/unit/core/types.test.ts`). T002: `build:test` script (Vite `--mode test`), `build.manifest: true`, Playwright serves the test build.
**Next:** T010–T013 — Clock and RenderLoop, test-first.
**Blockers:** none

## 2026-10-04 — 000-foundation

**Done:** Created `specs/` (constitution, roadmap, tech stack, architecture, workflow, testing strategy, memory management, templates). Scaffolded Vite + TS + Three.js with ESLint, Prettier, Vitest, Playwright. Placeholder scene + WebGL fallback. Drafted spec 001-space-framework. Added `CLAUDE.md`, `memory/`, and `/spec-*` slash commands. Initialised git.
**Next:** Human reviews/approves `specs/features/001-space-framework/spec.md` (2 open questions), then `/spec-plan 001`.
**Blockers:** none
