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

## D-025 — Orbital motion and time choices for 021 (2026-10-05)

**Context:** Spec 021 open questions Q1–Q9.
**Decision (project lead):**

1. The Solar System opens at **today's date**; the core passes the wall-clock date in (Space logic never reads the clock).
2. Speeds: 1 day, 1 week, 1 month, 1 year per second, **forwards or backwards**; default **1 week/s** forwards.
3. Stylised scale keeps 020's **circular rings**, with each body at its true angle for the date.
4. A view re-centred on a body (D-023) **follows** it while time runs, until the visitor pans, resets or re-centres.
5. Every orbit is drawn as a **faint line, at both scales**.
6. Spin faster than **one turn per second** of real time is held still instead of strobing.
7. Time stays within **1800–2050** (the elements' validity) and pauses at a limit, saying so.
8. Time settings are **not remembered** across visits; only the scale is.
9. The entry-growth cap is **≤ 5 KB gzipped**.

**Alternatives:** J2000 or another fixed start; forward-only or other speeds; scaled ellipses at stylised scale; a camera that stays put; real-scale-only or no orbit lines; always-true or capped spin; a wider date range; remembering time state; a 3 KB cap.
**Consequences:** `SpaceContext` gains a start date from the core (the first wall-clock value given to a Space). The motion code needs a reference table of JPL positions for its accuracy tests (read at dev time). Following a body extends the controls' focus. Orbit lines add geometry per orbit (~15 line loops).

## D-026 — Moon motion corrections and Triton's allowance (021, 2026-10-05)

**Context:** T013 measured the moons against Horizons positions at 7 dates (1800–2050). Propagating JPL's satellite mean-elements table as given missed AC-3's 10° badly: the Galileans drift to 90–175° (the table's `P` isn't their mean motion: Io 204.23°/d vs the true 203.49°/d), Titan is ~160° off at every date (its epoch angle disagrees with Horizons: osculating M 163.4° vs the table's 11.7°), the Moon is 10.4° off in 1800, Triton 45–151°.
**Decision (project lead):** Mean-longitude rates come from each moon's NAIF synchronous spin rate `|Ẇ|` (already in the data). Titan's epoch mean anomaly becomes 213.3°, fitted to Horizons' J2000 vector. Node precession advances for retrograde orbits (physically, Ω̇ ∝ −cos i), and the argument of latitude advances at `n ∓ Ω̇` by the sign of cos i (mean longitude Ω ± (ω + M)). AC-3 allows **30° for Triton only**; the other six moons stay at 10°.
**Alternatives:** Research a precession term from Triton's source to reach 10° (deferred; 30° is enough for the visual); loosen AC-3 for every moon (Io would sit on the wrong side of Jupiter).
**Consequences:** Measured worst errors: Moon 1.4°, Galileans 2.1°, Titan 5.2°, Triton 25.1° (1850); planets 0.17°. Titan's data value is fitted to the J2000 reference date, so its other 6 dates are the independent check. Spec AC-3 and plan §3 amended.

## D-027 — Moon orbit lines refresh with their precession (021, 2026-10-05)

**Context:** Plan §5 rebuilt the real-scale ellipses once the date moved 10 years. That suits the planets, but the Moon's ellipse turns a full circle every ~6 years (e = 0.055): after 9 years its line was 5.4 % of its orbit away from the Moon, against AC-11's "matching the path its body travels".
**Decision:** Each real line has its own refresh interval: 10 years for planets; for a moon, 1 % of its fastest apsis or node period (the Moon ~22 days, Io ~5 days, Triton ~3.4 years). A refresh rewrites the line's existing buffer (256 Kepler solves), so no geometry is created. Plan detail only; the spec is unchanged.
**Alternatives:** Rebuild every line every frame (wasteful); accept the drift (visible when zoomed to Earth at real scale).
**Consequences:** The Moon stays within 0.5 % of its orbit of its line; at 1 year/s it refreshes ~17 times a second (~256 solves each, negligible).

## D-028 — Solar System wiring details (021 T032, 2026-10-05)

**Context:** Wiring time into the Space surfaced three details the plan left open or got wrong.
**Decision:**

1. **Ambient light 0.03 → 0.1.** With real positions, an inner planet between the camera and the Sun shows its night side; at 0.03 it rendered ~10/255 against the black background and Mercury vanished at today's date (020 AC-5's E2E caught it). At 0.1 night sides read ~26/255, still far darker than the lit side (020 AC-10 test passes).
2. **Saved state is the time only** (`{ time }`), not `followId` (plan §2): after a context loss the camera is back home, so resuming a follow would swing the view to a body the visitor no longer looks at. AC-12 asks for date, speed and play state only.
3. **One `.solar-bar` row** holds "True scale" and the time controls (flex; wraps on narrow screens), instead of two independently positioned boxes. Tab order unchanged.
   **Alternatives:** (1) Accept invisible new-phase planets, or relax the E2E check; (2) restore follow with a focusOn on resume; (3) fixed offsets per control.
   **Consequences:** Night sides are a little brighter. Plan §2 amended.

## D-029 — Solar System surfaces choices for 022 (2026-10-06)

**Context:** Spec 022 open questions Q1–Q9.
**Decision (project lead):**

1. **All 16 bodies** get surface imagery (Sun, planets, moons).
2. **Source:** public-domain NASA/USGS maps first; CC-BY 4.0 with attribution where none fits.
3. **Budget:** ~3 MB for imagery and star data; 2K maps for the planets, 1K for the Sun, moons and Earth's extra layers.
4. **Earth extras:** a cloud layer, night-side city lights and ocean shine.
5. **Rings:** Saturn only, with Saturn's shadow on the rings and the rings' shadow on Saturn.
6. **Stars:** a real catalogue to about magnitude 6.5, true positions and brightness (no share-alike licences).
7. **Sun glow:** a static halo.
8. **Loading:** the Space opens at once in plain colours; imagery fades in as it arrives (instant under reduced motion).
9. **Entry cap:** ≤ 5 KB gzipped.

**Alternatives:** fewer textured bodies; a single CC-BY set; 1K or 4K maps; no Earth extras; all ring systems or no shadows; a random star field or a Milky Way image; an animated glow; waiting for all imagery before opening; a 2 KB cap.
**Consequences:** Earth needs its own material (layers blended by sunlight); Saturn's ring and body need shadow terms in their shaders; a star catalogue becomes a data asset; the Space reports imagery progress after it has opened.

## D-030 — 022 plan approved: Space budget and committed source maps (2026-10-06)

**Context:** The bundle check counts each lazy chunk's emitted files, including the 0.57 MB Basis transcoder that the KTX2 loader brings (already shipped for the chair). With ~3 MB of imagery the Solar System would total ~3.6 MB, over 022 AC-13's 3.5 MB. The plan also had to choose where the source maps live.
**Decision (project lead):** AC-13's Space total is **≤ 4 MB including the shared decoder**; imagery and star data stay ≤ 3 MB. Source maps are **committed** at shipping resolution (~10 MB, JPEG q95) in `assets-src/solar-system/`. Plan approved.
**Alternatives:** keep 3.5 MB and shrink the imagery to ~2.9 MB; commit only the fetch script.
**Consequences:** Spec AC-13 amended (changelog). The repository grows by ~10 MB of source imagery.

## D-031 — 022 imagery sources and treatment (2026-10-06)

**Context:** 022 T001 source survey (table in `specs/features/022-solar-system-surfaces/tasks.md`).
**Decision (project lead):**

1. **Sources as surveyed:** public domain (NASA/USGS) for Mercury (PIA16298), Earth's day (Blue Marble NG), clouds and night (Black Marble 2016), Mars (Viking MDIM 2.1), Jupiter (PIA07782), the Galileans, Titan and Triton (USGS); Solar System Scope CC-BY 4.0 for the Sun, Venus (cloud tops), Saturn, its rings, Uranus, Neptune and Earth's ocean mask; the Moon from the USGS LRO mosaic, falling back to Solar System Scope if unreachable. Ring radii from the PDS Rings Node (C inner 74 490 km, A outer 136 780 km).
2. **Greyscale maps** (Mercury, Europa, Callisto, Titan) are tinted by the body's 020 colour.
3. **Titan:** its near-infrared surface map, tinted orange at low contrast.
4. **Stars:** the Yale Bright Star Catalogue (5th rev., CDS V/50), credited to Hoffleit & Warren (1991), Yale University Observatory, via NASA ADC/CDS.

**Alternatives:** the Moon from Solar System Scope; greyscale as published; Titan grey or haze only; an explicitly licensed catalogue.
**Consequences:** The fetch script brings every map to 0° at the centre (rolling those centred on 180°; none needs mirroring, T004), tints greyscale ones, fills unmapped areas and records each convention; CREDITS.md lists every image.

## D-032 — Background-content signal and block-aligned textures (2026-10-06)

**Context:** 022 T051. Wiring the imagery made 021's time-speed E2E fail 2 of 3 full runs: under SwiftShader the
textures' arrival (uploads, shader variants) makes frames exceed the 0.1 s delta clamp, so simulated time lags the
wall clock in the second the test measures. Separately, the Saturn ring strip (published 1024 × 63) made
KTX2Loader warn that block-compressed textures need sides in multiples of four.
**Decision:** `SpaceManager` marks the status element `data-space-background="loading"` while the view reports
background progress and `"done"` at 1 (cleared with the other status attributes). E2E waits on it
(`waitForBackground`) before wall-clock measurements. The asset pipeline resizes a texture whose sides aren't
multiples of four to the nearest that are (`blockAligned`), and `checkTextureOutput` rejects any that aren't.
**Alternatives:** polling the GPU texture count until stable; widening the speed test's tolerance; fixing only
the ring strip in the fetch script.
**Consequences:** One more status attribute on `<body>` (additive, test-facing). The ring texture is 1024 × 64.
T062 can wait on the same signal.

## D-033 — AC-1's E2E check for near-featureless maps (2026-10-06)

**Context:** 022 T060. Close up, Uranus's and Neptune's approved maps (T001: "near-featureless") show no more detail than a plain sphere (second-difference detail 0.39 vs 0.38 and 0.53 vs 0.45), though the imagery does change how they look (18.7 and 13.8 mean RGB from the plain colour). AC-1's E2E note asked every body to show surface detail.
**Decision (project lead):** AC-1's E2E note is amended: every body must differ clearly from its plain colour at the same view, and the detail check applies to all but Uranus and Neptune.
**Alternatives:** contrast-stretch or re-source the two maps so banding measures; drop the detail check for all bodies.
**Consequences:** Spec changelog entry; `FEATURELESS` in `tests/e2e/solar-system-surfaces.spec.ts`.

## D-034 — 022 AC-13's frame rate accepted on the software floor (2026-10-06)

**Context:** 022 T091. With time running at 1280 × 720, SwiftShader (the E2E renderer; no compressed texture formats, so the maps are sampled uncompressed on the CPU) gives 56.5 fps (stylised) and 53.5 fps (real scale) at the whole-system views and 60.1 zoomed in. With the maps blocked it is 60.3 / 60.2 / 60.3, so the cost is texture sampling. 021 measured 60.2 on the same floor. No real-GPU measurement was available.
**Decision (project lead):** accept the SwiftShader result as AC-13's frame-rate evidence and close 022.
**Alternatives:** measure on a mid-range laptop first; optimise for the software floor (anisotropy 1, smaller distant maps); leave 022 open.
**Consequences:** AC-13 ticked with this note; 022 Implemented. 030 (performance pass) is the place to revisit texture cost (e.g. anisotropy, LOD) and to measure on real hardware.

## D-035 — 023 selection & focus: open questions resolved (2026-10-06)

**Context:** 023's draft spec left Q1–Q13 open (hit targets, body list, fly, facts, labels, budget).
**Decision (project lead):** accept every drafted proposal: click the body with a ≥ 44 px hit area; a body list in the info panel; an eased fly ≤ 2 s ending with the body ≈ ⅓ of the shorter side from its sunlit side; the selection survives a scale switch; seven facts plus a description, metric with "× Earth" for diameter and mass; live distance from the Sun (a moon's from its planet); the facts replace the Space description in the info panel; closing leaves the camera where it is ("Reset view" goes home); stylised labels always shown with 020's declutter; time keeps running; ≤ 5 KB entry growth; no deep links.
**Alternatives:** labels as the only targets; a separate floating card; flying home on close; pausing time on select; deep links.
**Consequences:** Spec Approved; the plan builds on 012's panel, 020's marker layer and 021's follow.

## D-036 — 023 plan approved: fly path, clear area, facts details (2026-10-06)

**Context:** 023 plan review; three review points (the Sun's card, "length of day", re-centre vs selection).
**Decision (project lead):** plan approved as drafted: van Wijk–Nuij zoom-and-pan fly in the shared controls (`flyTo`, ≤ 2 s, `follow()` shifts it), body framed in the area the info panel leaves clear via `camera.setViewOffset`, facts derived from 020's data except descriptions and moon counts, an `InfoSlot` seam from the core's panel (`SpaceInstance.attachInfo`), controls `onReset`. The Sun's card omits distance and year; "day" is the sidereal rotation (no solar-day data); a real-scale re-centre on another body keeps the selection and only moves the follow.
**Alternatives:** "not applicable" rows for the Sun; adding NASA's solar day; re-centre clearing or switching the selection; a target offset instead of a view offset.
**Consequences:** `__WORLD__.cameraProjection()` gains the view offset so E2E projections stay correct. Spec AC-9 notes the Sun and the sidereal day.

## D-037 — 023 labels: one dot/name rule at both scales; denser real-scale orbit lines (2026-10-06)

**Context:** 023 T001 spike (real-scale close-ups with a view offset). Two existing behaviours look wrong close up: the real-scale marker (dot + name, built for sub-pixel bodies) prints on top of a close-up body's disc; and a straight segment of a planet's 256-point real-scale orbit line sits up to ~0.011 units inside the ellipse (~6 Moon radii on Earth's orbit), so it can cross a close-up body.
**Decision (project lead):** markers follow one rule at both scales: below 3 px on-screen radius, 020's dot with the name 7 px from the centre; from 3 px, no dot and the name `radius + 4` px from the centre. Planets' real-scale orbit lines get 2 048 points (sag ~1.8 × 10⁻⁴ units); moons' and stylised lines keep 256.
**Alternatives:** keep real-scale markers as they are and hide only the selected body's; fade orbit lines near the camera (shader change); hide the selected body's and its parent's lines while close.
**Consequences:** Plan §10 and new §10a; T033 updated, T053 added. ~14 000 more line vertices, built once. 020 AC-8a's tests are unaffected (sub-pixel bodies keep their dot within 4 px).

## D-038 — Real-scale orbit lines: 4 096 points for planets, rebuilt when the body strays (2026-10-06)

**Context:** 023 T053. Measuring each body's distance from its own real-scale line (in its radii) showed D-037's 2 048 points weren't enough: on the build date planets were 0.8–8.2 radii off (256-point chords), and 021's fixed refresh (D-027: planets every 10 years, moons after 1 % of their precession) let the elements drift up to 13.6 radii (Neptune) and 0.62 for the Moon before a rebuild. A close-up could show a body's own line crossing it.
**Decision (project lead):** planets' real lines get 4 096 points (2 048 left Uranus's chords at 0.15 radius); a real line is rebuilt, in place, on any new date where its body is more than 0.25 of its radius from it (an exact point-to-polyline check, no allocation). This replaces D-027's fixed intervals and D-037's 2 048.
**Alternatives:** 2 048 points only; hiding the selected body's lines while selected; faster fixed intervals.
**Consequences:** Every body stays within 0.25 radius of its own line at any speed, backwards or after a date jump (unit-tested over 20 years for planets and a year of daily steps for moons); straight segments sag < 1/8 radius, so a fresh line never re-triggers. The check costs ~0.1 ms per frame while time runs (incl. rebuilds; Node timing). ~32 000 planet line vertices, built once.

## D-039 — A body's own orbit line in a real-scale close-up: left as is (2026-10-06)

**Context:** 023 T063. In a real-scale close-up of a selected body, its own orbit line passes through it (within 0.25 radius, D-038) and the half nearer the camera crosses the disc. The geometry is correct, but it distracts; no AC covers it.
**Decision (project lead):** no change in 023; noted for 030 (performance and polish).
**Alternatives:** fade the body's own line when the camera is within ~20 of its radii; hide it while selected.
**Consequences:** Roadmap 030 carries the note; architecture's orbit-lines entry says so.

## D-040 — Real-scale planet lines: a 256-point far copy, the 4 096-point line only up close (2026-10-06)

**Context:** 023 T091. On SwiftShader (the E2E renderer and AC-17's floor), D-038's 4 096-point planet lines
(~32 000 segments) cut the real-scale whole-system view from 44–50 fps (022, same session) to 35–39, and the flight
to Neptune to 47. By elimination the cost is drawing the segments, not the per-frame stray check, labels or panel.
**Decision (project lead):** each planet's real line also gets a 256-point far copy (every 16th vertex of the fine
line, so the same date and points). Every frame the fine line is drawn only when the far copy's worst chord sag,
seen from the camera's distance to that copy, would be at least 0.5 CSS px; otherwise the far copy is drawn. The
stray check and rebuilds stay on the fine line (both rewritten together). Moons and stylised lines unchanged.
**Alternatives:** accept the SwiftShader result (as D-034); fewer points (fails D-038's sag bound); hide the lines.
**Consequences:** D-038's close-up accuracy is kept; a whole-system view draws 256-point planet lines again. The
swap is at most a 0.5 px change. ~2 000 segment-distance checks per frame (8 × 256). `OrbitLines` gains
`setView(eye, pixelAngle)` and `coarse(id)`. T054 implements it; T091 re-measures.
