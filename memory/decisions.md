# Decision Log

Append-only. Newest at the bottom. To reverse a decision, add a new entry that says `Supersedes D-00X`.

Format:

```
## D-00X — Title (YYYY-MM-DD)
**Context:** … **Decision:** … **Alternatives:** … **Consequences:** …
```

---

## D-001 — Browser-only static site (2026-10-04)

**Context:** Project is a 3D showcase; no user accounts or shared data.
**Decision:** No backend of any kind. Static hosting only. Codified as Constitution II.
**Alternatives:** Serverless functions for asset listing — unnecessary; registry is static.
**Consequences:** All content is bundled or in `public/`. Deep links use hash routing.

## D-002 — Vanilla Three.js + TypeScript, no UI framework (2026-10-04)

**Context:** UI surface is small (gallery, info panels); 3D is the core.
**Decision:** Three.js + strict TS + vanilla DOM, built with Vite.
**Alternatives:** React Three Fiber (bigger bundle, two mental models), Babylon.js (heavier).
**Consequences:** We write a small router and DOM helpers ourselves. Revisit if UI grows complex.

## D-003 — Vitest + Playwright for testing (2026-10-04)

**Context:** Need fast unit tests for math and real-browser checks for WebGL.
**Decision:** Vitest for unit/integration, Playwright (Chromium headless, SwiftShader WebGL) for E2E.
**Consequences:** Pure logic must be WebGL-free to be unit-testable; time must be injectable.

## D-004 — Project memory lives in the repo (2026-10-04)

**Context:** Agent sessions are stateless; multiple machines/agents may work on the project.
**Decision:** Version-controlled `memory/` folder (index, decisions, progress, learnings). Personal Claude auto-memory only for user preferences.
**Consequences:** Session start/end protocol in `CLAUDE.md`.

## D-005 — Fade transition and opt-in post-processing hook in v1 (2026-10-04)

**Context:** Spec 001 open questions: how Spaces switch, and whether Spaces can use post-processing.
**Decision:** Switching uses a ~300 ms DOM-overlay fade (instant with `prefers-reduced-motion`). Spaces may define an optional `render()` on `SpaceInstance` and own their `EffectComposer`; the engine calls it instead of `renderer.render`.
**Alternatives:** Instant switch (deferred polish); engine-managed composer (couples the engine to post-processing and pulls it into the main bundle).
**Consequences:** No new dependency; `EffectComposer` stays in the lazy chunks of the Spaces that use it. The Space is responsible for resizing and disposing its composer.

## D-006 — Failed opens close the current Space (2026-10-04)

**Context:** What should the screen show when `open(id)` gets an unknown id or the Space fails to load while another Space is showing?
**Decision:** Close the current Space, then show the "Space not found" / "Failed to load" message over the empty canvas. `<body data-space-status>` records the outcome (`opened` | `not-found` | `load-error`). Load errors also go to `console.error`; unknown ids don't (not a bug).
**Alternatives:** Keep the previous Space visible behind the message — rejected: the screen would not match the requested id/URL once routing (002) lands.
**Consequences:** E2E tests can assert outcomes via `data-space-status`. E2E's "no console errors" rule still holds for unknown ids.

## D-007 — Routing behaviour for 002 (2026-10-04)

**Context:** Spec 002 open questions on the home route, the temporary `?space=` parameter, and unknown routes.
**Decision:** The home route (`#/`) opens the default Space (demo-cube) until the gallery (003) exists. `?space=<id>` is dropped with no redirect. Unrecognised routes redirect to `#/`, replacing the history entry. The page title follows whichever Space is showing, including the default on home.
**Alternatives:** A placeholder link list on home; keeping `?space=` as a redirecting alias; a "Page not found" page for bad routes.
**Consequences:** 003 must redefine the home route. Bad links fail quietly to home rather than visibly, so broken links won't be obvious to visitors.

## D-008 — Gallery replaces the default Space on home (2026-10-04)

**Context:** Spec 003 open questions on where the gallery lives, its background, and card previews.
**Decision:** The gallery is the home route `#/`, ending D-007's "home shows the default Space" rule (supersedes that part of D-007). Behind the cards is a subtle animated starfield drawn with the single renderer, which is still under `prefers-reduced-motion` and is removed whenever a Space is open. Cards show the Space's `thumbnail` image, or a generated placeholder (kind icon plus initials) if it is missing or broken.
**Alternatives:** Gallery at `#/gallery`; a plain background (lighter, no GPU while browsing); generated placeholders only; text-only cards.
**Consequences:** 002's "home = demo-cube" tests change. The GPU memory baseline for leak tests is "gallery + backdrop". Thumbnails need licensed images recorded in `CREDITS.md`. demo-cube uses the placeholder for now.

## D-009 — Camera controls behaviour for 004 (2026-10-04)

**Context:** Spec 004 open questions on idle motion, panning, keyboard scope and discoverability.
**Decision:** Idle Spaces with controls use a camera turntable that stops on any interaction and resumes after a Space-defined delay; the subject holds still, and reduced motion disables all automatic movement. Panning is on everywhere, clamped to a Space-defined pan limit. Keyboard controls work only while the focusable 3D view has focus. Discoverability comes from a fading hint, a persistent "?" help panel and a "Reset view" button.
**Alternatives:** Subject keeps its own animation; no automatic motion; per-Space or no panning; page-wide keys; hint-only or buttons-only.
**Consequences:** demo-cube stops self-rotating (a 001 behaviour change). The canvas becomes focusable inside Spaces, so Tab order must be back link → 3D view → help/reset. Touch users get an on-screen reset because they have no `R` key.

## D-010 — Focus management on view switches; 1.5 KB entry allowance for 004 (2026-10-04)

**Context:** During 004 T022, activating a gallery card removed the focused element, so keyboard focus was lost and Tab reached the help buttons before "Back to gallery" and the 3D view. Separately, the controls grew the entry by 1.2 KB against a 0.5 KB NFR.
**Decision:** (1) New 004 AC-13: when focus would otherwise be lost on a view switch (never on the first page view, and never from a still-visible focused element), focus moves to the new view's start. That is the 3D view for a Space, and on the gallery the card of the Space just left (or the heading). This clarifies 002's "focus is not stolen". (2) The 004 entry NFR is amended to ≤ 1.5 KB.
**Alternatives:** Gallery heading instead of the card (loses the visitor's place); no focus management (keyboard users lose focus). Restructuring chunks to save size (no real saving, since startup loads `three` anyway).
**Consequences:** `SpaceInstance` gains an optional `focusTarget()`. The size growth comes from `three` core classes being shared with lazy chunks: any Space importing new parts of three core can grow the entry, so watch the bundle-check line.

## D-011 — Resilience and reduced-motion behaviour for 005 (2026-10-05)

**Context:** Spec 005 open questions. The project lead delegated the choices and asked for simple ones, because this is a learning project.
**Decision:** (1) After a WebGL context loss, show a message with a "Reload" button, and if the browser restores the context, reopen the current view automatically. (2) A change to `prefers-reduced-motion` applies from the next view opened (CSS rules update live). (3) There is no on-page motion toggle; the OS setting is the only source. (4) The WebGL fallback stays a plain message without a list of Spaces.
**Alternatives:** Reload button only, or auto-recovery only; live reconfiguration of the open view's turntable, damping and starfield; a persisted on-page toggle; a text-only list of Spaces on the fallback.
**Consequences:** No reactive motion state has to be threaded through Spaces or controls. Context restore reuses `SpaceManager`'s open path. AC-11 becomes a no-op constraint.

## D-012 — Model viewer choices for 010 (2026-10-05)

**Context:** Spec 010 open questions. The project lead delegated the choices: a learning project, so prefer simple and well documented.
**Decision:**

1. The first model is the Khronos glTF sample "DamagedHelmet" (theblueturtle_, CC-BY 4.0, about 3.7 MB GLB). Its attribution is shown inside the Space and recorded in `CREDITS.md`.
2. Each model is its own Space (card + URL). The reusable viewer (load, frame, light) lives in `src/shared/`.
3. Lighting comes from a generated studio environment, with no HDRI asset, and the background stays the site's `--bg`.
4. The demo cube stays as the framework demo, listed after the model.
5. The GLB ships uncompressed in 010; compression comes in 011.

**Alternatives:** A CC0 Poly Haven model (no attribution needed, but less of a reference scene). A single viewer Space with a model switcher. A bundled CC0 HDRI (more realistic, +1–2 MB). Removing the demo cube. Compressing the GLB already in 010.
**Consequences:** Phase 2 adds `src/shared/` viewer code that the solar system can reuse for loading. A CC-BY asset needs a visible credit line in the UI. The model Space is the first one with real network-loaded assets, so the "Failed to load" path becomes reachable for asset errors, not just module errors.

## D-013 — 10 KB entry allowance for 010 (2026-10-05)

**Context:** The 010 T001 spike measured the entry bundle at +8.3 KB gzipped (134.9 → 143.2 KB) once a lazy Space imports `GLTFLoader` and `RoomEnvironment`. The three core classes they use join the shared `three` chunk that the entry loads (same effect as D-010). Spec 010 allowed only ≤ 1 KB.
**Decision:** The spec 010 entry-growth NFR is amended to ≤ 10 KB gzipped, with the measured +8.3 KB recorded. The Constitution's 250 KB total budget is unchanged.
**Alternatives:** Dropping the per-feature cap (total budget only): simpler, but large jumps go unnoticed. A build-config workaround to keep lazy-only three classes out of the entry: uncertain and complex, since `three.core.js` is one module that Rollup won't split.
**Consequences:** Entry is about 143 KB after 010, leaving ~107 KB of headroom. Later loaders (DRACOLoader/KTX2Loader in 011) will add more; measure again in 011.

## D-014 — SheenChair replaces DamagedHelmet for 010 (2026-10-05)

**Context:** In 010 T002, the Khronos `LICENSE.md` for DamagedHelmet showed its model files are licensed under **both** CC-BY 4.0 (ctxwing's rebuild) and CC-BY-NC 4.0 (theblueturtle_'s original). NonCommercial is not allowed by Constitution IX. D-012 had assumed CC-BY only.
**Decision:** The first model is Khronos "SheenChair": © 2020 Wayfair, LLC; Eric Chadwick; **CC0 1.0** for all model files; 4.1 MB GLB. Space id `sheen-chair`. A credit line is still shown in the Space. This supersedes D-012 point 1.
**Alternatives:** GlamVelvetSofa (CC-BY 4.0, 3.1 MB); SunglassesKhronos (CC-BY 4.0, 0.4 MB, but includes Khronos trademark logos and uses transmission/iridescence). Over-budget CC0 models (WaterBottle 9 MB, Lantern 9.6 MB, Avocado 8.1 MB, ToyCar 5.4 MB) could be revisited after 011's compression.
**Consequences:** Always read a model's `LICENSE.md` (all licences listed), not just its headline credit, before choosing. The model uses `KHR_materials_sheen` → `MeshPhysicalMaterial`.

## D-015 — Cap local E2E parallelism (2026-10-05)

**Context:** During 010, `npm run test:e2e` crashed the developer's machine (24 cores, 127 GB). Playwright's default local workers is half the cores (12). Each worker is a Chromium rendering WebGL in software (SwiftShader, itself one thread per core), and the new Space loads a 4 MB, 40k-triangle PBR model and generates a PMREM environment.
**Decision:** `playwright.config.ts` sets `workers` to `min(4, max(1, floor(cores / 4)))`, overridable with `E2E_WORKERS=n`. Applies on CI too (CI runners have few cores, so the formula gives 1).
**Alternatives:** Keep the default and ask the developer to pass `--workers`; serialise model-viewer tests only; drop SwiftShader for the host GPU (non-deterministic, and GPU driver load is its own crash risk).
**Consequences:** Full suite (80 tests) runs in ~27 s at 4 workers, with no crash. Heavier future Spaces should keep this cap rather than raise it.

## D-016 — AC-5 zoom-out floor is measured on the bounding sphere (2026-10-05)

**Context:** 010 T072 measured the chair's on-screen outline at full zoom-out: ~7 % of the smaller viewport side (51 px at 1280×720), while AC-5 said "never below 10 %". The limit is `frameDistance(r, …, 0.1)` on the bounding sphere, which over-estimates open shapes (same effect as the chair's `fill: 0.85`).
**Decision:** Amend AC-5: the 10 % floor applies to the bounding sphere; an open shape's outline may look smaller but stays clearly visible. No code change. Chosen by the user.
**Alternatives:** A per-model `minFill` in data; scaling the floor automatically by each model's fill correction.
**Consequences:** The E2E checks the camera distance against the sphere-based limit rather than pixel fill. Revisit if a future model gets lost at full zoom-out.

## D-017 — Asset pipeline choices for 011 (2026-10-05)

**Context:** Spec 011 open questions Q1–Q5 (compression codec, targets, source files, progress UI, entry allowance).
**Decision (project lead):**

1. Geometry compression is **Meshopt only** (no Draco).
2. The chair's model file is **≤ 1.5 MB**; its average brightness stays within **10 %** of the original.
3. Original models are kept in the repo under **`assets-src/`**, which is not deployed.
4. Progress is shown as a **bar plus a percentage**; screen readers hear **25 / 50 / 75 %**, then the model appearing.
5. The entry-growth allowance is **set by a first-task spike**: ≤ 5 KB → cap 5 KB; more → propose a number.

**Alternatives:** Draco, or both codecs; a relative size target (≤ 40 %); downloading sources when the pipeline runs; a bar only or a percentage only; time-based announcements; a fixed cap or the total budget only.
**Consequences:** One decoder for geometry (Meshopt, bundled JS) and one for textures (Basis transcoder, self-hosted WASM). The repo keeps a 4.1 MB source model. A spike may amend AC-6, as in 010 (D-013).

## D-018 — Asset pipeline tooling: glTF-Transform library + ktx2-encoder (2026-10-05)

**Context:** 011 converts models offline (Meshopt geometry, KTX2 textures). glTF-Transform's CLI encodes KTX2 by shelling out to KTX-Software's `toktx`, which isn't installed here and can't come from `npm install`.
**Decision (project lead approved the 011 plan):** dev-only packages `@gltf-transform/core`, `@gltf-transform/extensions`, `@gltf-transform/functions`, `meshoptimizer` and `ktx2-encoder` (all MIT), driven by our own `scripts/build-assets.mjs` (`npm run assets`). There is no new runtime dependency: `KTX2Loader`, `MeshoptDecoder` and the Basis transcoder ship with `three`.
**Alternatives:** glTF-Transform CLI + a system `toktx` (not reproducible from npm); Draco (rejected in D-017); a pinned copy of the decoders in `public/` (kept as the T001 fallback).
**Addendum (2026-10-05, T003):** `sharp` (Apache-2.0, dev-only) is declared too. `ktx2-encoder` needs an `imageDecoder` in Node, and the chair's normal map is resized to 512 px. sharp was already installed through `@gltf-transform/functions` → `ndarray-pixels` (same version), so it's declared rather than relied on transitively. Approved by the project lead.
**Consequences:** `npm install` alone reproduces the pipeline. If the T003 spike shows `ktx2-encoder` can't handle the chair in Node, fall back to KTX-Software as a documented prerequisite, with a spec note.

## D-019 — Stronger parity check and a "loaded" announcement for 011 (2026-10-05)

**Context:** In 011 T060, a probe showed AC-2's measure (mean model brightness within 10 %) can't detect a broken model: stripping every texture changed it by only 3.4 %. A per-pixel measure separates cleanly: mean absolute RGB difference over model pixels was 0.00 between two renders of the original, 0.33 for the compressed chair and 5.47 for an untextured one. Separately, AC-9's "then the model appearing" had no implementation: the indicator just disappears, which screen readers don't announce.
**Decision (project lead):**

1. AC-2 keeps the 10 % brightness rule and adds **mean absolute RGB difference ≤ 2.0** (of 255) over model pixels against the original, from the same view.
2. When a view whose loading indicator was shown becomes ready, a persistent polite live region announces **"<title> loaded"** once. Fast opens (no indicator) stay silent.

**Alternatives:** Replace the brightness rule with the pixel diff alone; keep AC-2 as it was (it only catches large shifts). For AC-9: reword it to limit announcements to the three steps, with no "loaded" message.
**Consequences:** The parity E2E reads full pixel arrays from both renders (it's the slowest test in the spec). The loading indicator gains `ready()`, and `SpaceManager` calls it instead of `hide()` after a shown, successful load.

## D-020 — Info panel and hotspot choices for 012 (2026-10-05)

**Context:** Spec 012 open questions Q1–Q7.
**Decision (project lead):**

1. The info panel opens the first time; the visitor's collapse/expand choice is remembered in `localStorage` across Spaces and visits. It's a side panel on wide screens and a bottom sheet on phones.
2. Markers whose point is behind the model are **dimmed** (visible, not activatable or focusable).
3. Activating a hotspot **turns the camera** to its stored viewing direction (instant under reduced motion), then opens the annotation.
4. The chair gets **four** hotspots (seat, legs, frame and arms, label), with copy drafted by the agent for review.
5. Deep links to hotspots are **out of scope**.
6. The idle turntable **pauses** while an annotation is open.
7. The entry-growth cap is **≤ 3 KB gzipped**, fixed.

**Alternatives:** Collapsed by default, or not remembered; hiding occluded markers; text-only activation; 3 hotspots or user-written copy; hotspot deep links; letting the turntable keep turning; a spike-set cap or the total budget only.
**Consequences:** The shared controls need a camera "turn to" capability and a way to hold the turntable. Each hotspot stores a viewing direction. The first `localStorage` use in the project (preferences only, wrapped in try/catch).

## D-021 — Chair hotspot copy and own occlusion test for 012 (2026-10-05)

**Context:** The 012 T040 probe found that the Sheen Chair has no arms, that its legs are wood (the metal is twenty ~1 cm bolt heads at the joints plus four floor glides), and that the label is printed. So the drafted copy ("Metal base", "frame shapes the arms") and AC-5's "wooden frame and arms" were wrong. It also measured one occlusion pass (4 rays, ~40k triangles) with three's `Raycaster` at **8.2 ms** median, against a 1 ms/frame NFR. The plan's fallbacks (box pre-check, one hotspot per tick) can't close that gap: `Mesh.raycast` already box-checks, and one ray costs ~2 ms.
**Decision (project lead):**

1. Hotspots: velvet seat, wooden frame, wooden legs, printed label, with the revised copy in the 012 plan. AC-5 drops "arms".
2. Occlusion uses an **own any-hit ray test**: the model's triangles are copied once into a world-space `Float32Array`, and an early-exit Möller–Trumbore loop checks each ray. Measured 0.7 ms median / 1.0 ms max per pass, with the same answers as `Raycaster`.

**Alternatives:** For the copy, user-written wording. For occlusion, `three-mesh-bvh` (a new runtime dependency); or keeping `Raycaster` and relaxing the NFR.
**Consequences:** About 60 lines of geometry code in `src/shared/hotspots/occlusion.ts` with unit tests. 1.4 MB of CPU memory per chair visit, freed on dispose. The copy relies on the model holding still (D-009); a moving model would need the copy rebuilt.

## D-022 — Solar system data and scale choices for 020 (2026-10-05)

**Context:** Spec 020 open questions Q1–Q6.
**Decision (project lead):**

1. Until 021 adds motion, each body sits at a fixed, data-defined angle on its orbit, spread out.
2. Moons: the seven with radius ≥ 1 000 km (the Moon, Io, Europa, Ganymede, Callisto, Titan, Triton).
3. The Space opens in **stylised** scale; the visitor's choice is remembered in `localStorage`.
4. The data carries the full orbital elements now (planets: J2000 elements), so 021 only adds the maths.
5. Real scale keeps the spheres exactly to scale and adds **name markers** over the bodies' true positions.
6. The entry-growth cap is **≤ 3 KB gzipped**, fixed.

**Alternatives:** Bodies lined up, or real positions for a date; adding Phobos and Deimos, or ~15 moons; not remembering the scale, or putting it in the URL; only the data 020 displays; a minimum on-screen size, or no help at real scale; a 5 KB cap, or the total budget only.
**Consequences:** 020 reuses 012's preference store and screen projection. Real scale needs care with depth and float precision (distances span ~10⁵). Markers are labels only; 023 adds selection.

## D-023 — Real-scale zoom re-centres on the body under the pointer (020, 2026-10-05)

**Context:** The 020 plan used OrbitControls' `zoomToCursor` so wheel and pinch could zoom from the whole real-scale system to a planet (AC-8a). The T001 spike showed it can't: each step moves the camera by a fraction of its distance to the orbit target, so it stalls at the target's depth (400 steps left Earth at 0.1 px). Re-targeting the orbit onto the body first reached Earth at 3 px in 58 steps, with clean rendering.
**Decision (project lead):** At real scale, a wheel or pinch zoom that starts within 24 px of a body's projected centre re-centres the orbit on that body (new additive controls method `focusOn(point)`: target moves, camera stays, instant), then zooms normally. This Space sets the new additive `zoomSpeed` config to 4 (about 40 wheel notches from the whole system to Earth at 3 px).
**Alternatives:** Bring forward 023's click-to-fly (markers as buttons); drop "zooming in reveals them" from AC-8a.
**Consequences:** Two additive controls APIs (`focusOn`, `zoomSpeed`). The Space listens to `wheel` in the capture phase and to pinch starts on the canvas. Re-centring turns the view instantly; an eased version can come with 023's flying.
**Addendum (2026-10-05, T025):** The plan's zoom limit, 3 × the smallest body radius in the scale, let the camera fly inside Earth and the Sun (a unit test caught it: the nearest surface came out negative). The limit now follows the body being orbited: 1.2 × its radius (as 010). `focusOn(point, { minDistance })` sets it on a re-centre, `reset()` restores the home limit (1.2 × the Sun's radius), and a resize while focused keeps the focus limit. Additive; no spec change.

## D-024 — Real-scale labels declutter (020, 2026-10-05)

**Context:** The 020 T027 screenshots showed the Sun's and the four inner planets' names overprinting into an unreadable cluster at the real-scale home view (all within ~15 px), and "Neptune" clipped at the edge of a 320 px phone. AC-8a only kept moons apart from their planet.
**Decision (project lead):** Where two names would overlap, the larger body keeps its name and the other shows only its dot (its name returns once there's room, e.g. after zooming in). A name that would run past the view's right edge sits left of its dot. The moon rule (hidden within 24 px of its planet) stays.
**Alternatives:** Leave it for 023, which reworks labels with selection.
**Consequences:** `markers.ts` gets a greedy pass by body size over estimated label boxes (from name length; no layout reads per frame). AC-8a amended (spec Changelog).
