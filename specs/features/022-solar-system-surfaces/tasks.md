# 022 — Solar System Surfaces · Tasks

**Plan:** `./plan.md` (Approved)
Legend: `[P]` = can run in parallel with the previous task. Each task lists files and the proving test.
Test-first: each "tests" task must fail before its paired implementation makes it pass.
Every task leaves `npm run check` **and** `npm run test:e2e` green (D-015 worker cap; `E2E_WORKERS=2` for one spec).
Baselines: entry 146.6 KB gzipped (021), allowance ≤ 5 KB; imagery + stars ≤ 3 MB; Space ≤ 4 MB with the decoder
(D-030).

## Setup (spikes and sources)

- [x] **T001** — **Source survey (review gate):** for each of the 16 bodies, Earth's clouds, night lights and ocean
      mask, Saturn's ring profile and the star catalogue, record:
  - URL, licence (public domain first; CC-BY 4.0 otherwise; no share-alike), author/credit line;
  - native resolution, projection (equirectangular?), longitude at the left edge, east- or west-positive;
  - known gaps (e.g. Triton's unseen hemisphere) and how they'd look.

  Present the table to the lead; **stop** until approved. files: notes in this task's result · covers: AC-1, AC-2,
  AC-9 inputs

  **Survey (2026-10-06), approved by the lead (D-031):** greyscale maps tinted by body colour; Titan tinted orange at low contrast; the catalogue accepted with a credit line. PD = public domain (NASA/USGS); CC-BY = Solar System Scope
  (SSS), "Distributed under Attribution 4.0 International", based on NASA mission data. Longitudes (corrected in T004 from each GeoTIFF header): every map's pixels run east to the right; "W+" in USGS
  metadata only labels the longitudes. Maps centred on 180° are rolled half a width; none is mirrored. NASA's sites moved to
  `assets.science.nasa.gov`; NASA SVS and NSSDC don't respond from here.

  | Body / layer   | Proposed source                                              | Licence    | Native      | Notes                                                                               |
  | -------------- | ------------------------------------------------------------ | ---------- | ----------- | ----------------------------------------------------------------------------------- |
  | Sun            | SSS `2k_sun.jpg`                                             | CC-BY      | 2048×1024   | No PD equirectangular Sun map exists                                                |
  | Mercury        | MESSENGER global mosaic PIA16298                             | PD         | 3060×1530   | Greyscale (Mercury is near-grey); 0° centre                                         |
  | Venus          | SSS `2k_venus_atmosphere.jpg`                                | CC-BY      | 2048×1024   | What we see is cloud; an artist's rendition from data                               |
  | Earth day      | Blue Marble NG Dec 2004, topo + bathy                        | PD         | 5400×2700   | 0° centre, E+                                                                       |
  | Earth clouds   | NASA `cloud_combined_2048.jpg`                               | PD         | 2048×1024   |                                                                                     |
  | Earth night    | Black Marble 2016, 3 km                                      | PD         | 13500×6750  |                                                                                     |
  | Earth oceans   | SSS `2k_earth_specular_map.tif` (an ocean mask)              | CC-BY      | 2048×1024   | A PD mask would mean rasterising Natural Earth (new tooling)                        |
  | Moon           | USGS LROC WAC global mosaic, or SSS `2k_moon.jpg`            | PD / BY    | ≥ 1024      | NASA's CGI Moon Kit (PD) is unreachable from here                                   |
  | Mars           | USGS Viking MDIM 2.1 colourised, 1 km JPG                    | PD         | 21339×10670 | 37 MB download; 0° centre, E+                                                       |
  | Jupiter        | Cassini PIA07782                                             | PD         | 3601×1801   | Great Red Spot drifts in System III: won't match today's sky                        |
  | Saturn         | SSS `2k_saturn.jpg`                                          | CC-BY      | 2048×1024   | No PD global Saturn map found                                                       |
  | Saturn's rings | SSS `2k_saturn_ring_alpha.png` + PDS Rings Node radii        | CC-BY / PD | 2048 × n    | C inner 74 490 km → A outer 136 780 km; calibrate the image by the Cassini Division |
  | Uranus         | SSS `2k_uranus.jpg`                                          | CC-BY      | 2048×1024   | Near-featureless                                                                    |
  | Neptune        | SSS `2k_neptune.jpg`                                         | CC-BY      | 2048×1024   | Near-featureless                                                                    |
  | Io             | USGS Galileo/Voyager colour merged, 1024 sample              | PD         | 1024×512    | 0° centre (labelled W+; pixels run east)                                            |
  | Europa         | USGS Voyager/Galileo 500 m, 1024 sample                      | PD         | 1024×512    | Greyscale; 180° centre; no data south of −83° (filled, T004)                        |
  | Ganymede       | USGS Voyager/Galileo colour 1.4 km, 1024 sample              | PD         | 1024×512    | 180° centre (labelled W+ 0–360); filters 991/559/413 nm (slightly false colour)     |
  | Callisto       | USGS Galileo/Voyager 1 km, 1024 sample                       | PD         | 1024×512    | Greyscale; 180° centre; south polar gap (filled, T004)                              |
  | Titan          | USGS Cassini ISS 4 km (PIA19658)                             | PD         | 4040×2020   | Near-infrared surface, greyscale; 180° centre; visible Titan is orange haze         |
  | Triton         | USGS Voyager 2 colour, global fill, 600 m (1024 sample)      | PD         | 1024×512    | 0° centre; unseen north is black in the sample (filled, T004)                       |
  | Stars          | Yale Bright Star Catalogue 5th rev. (CDS V/50, `catalog.gz`) | see note   | 9 110 stars | 574 KB gz; NASA ADC/CDS distribution, no licence stated                             |

- [x] **T002** — **Budget spike (temporary):** encode four real maps (Earth day 2K, Jupiter 2K, the Moon 1K, Earth's
      clouds 1K) with the pipeline's encoder settings; extrapolate the total for all 8 × 2K + 12 × 1K + rings +
      stars. Over 3 MB: **stop** and report the options (1K for Uranus/Neptune, quality settings). Remove the spike.
      files: temporary only · covers: AC-13 risk

  **Result (2026-10-06):** ETC1S q128 (the pipeline's colour setting), 2K: Earth day 264 KB, Jupiter 288, Saturn 130,
  Neptune 82, Uranus 7; 1K: clouds 92, Moon 91. The first projection from the two busiest 2K maps (3.28 MB) was
  pessimistic: with the measured smooth planets, all imagery + rings + stars ≈ **2.4–2.6 MB** (Mercury, Mars, Venus
  assumed 280 KB each). No quality cut needed. The ocean mask goes ETC1S, not UASTC (plan §1): a UASTC 1K map would
  cost ~0.3–0.5 MB for a two-level mask. q64 saves ~15 % if ever needed.

- [x] **T003** [P] — **Entry and decoder spike (temporary):** import `KTX2Loader` from the solar-system chunk;
      `npm run build`. Entry growth ≤ 5 KB and the decoder counted once in the Space total; more: **stop**. Remove
      the spike. files: temporary only · covers: AC-13 risk

  **Result (2026-10-06):** entry 146.6 KB (+0.0); the Solar System chunk 17.3 → 40.6 KB gzipped (`KTX2Loader`'s
  code) and the Basis decoder (571.2 KB) counted once. With ~2.5 MB of imagery the Space projects to ~3.1 MB, under
  D-030's 4 MB.

- [x] **T004** — **Fetch script + sources:** `scripts/fetch-solar-imagery.mjs` (dev-only, `// @ts-check`) downloads
      the approved maps, resizes them to shipping size (2K planets, 1K the rest) as JPEG q95 into
      `assets-src/solar-system/`, and writes `sources.json` (URL, licence, read date, longitude convention). Its pure
      helpers (file naming, resize targets, convention parsing) are unit-tested. `CREDITS.md` gains every image.
      files: `scripts/fetch-solar-imagery.mjs`, `scripts/solar-imagery.mjs`, `tests/unit/scripts/solar-imagery.test.ts`,
      `assets-src/solar-system/*`, `public/assets/CREDITS.md` · covers: AC-1

  **Result (2026-10-06):** 20 maps (5.4 MB of JPEG q95 + `sources.json`), all brought to 0° at the centre, east to
  the right; 14 helper tests. Conventions were read from each USGS GeoTIFF's header (range request): Ganymede,
  Europa, Callisto and Titan are centred on 180° (rolled half a width), Io, Mars, Triton on 0°; "positive west"
  only labels the longitudes, the pixels already run east to the right. Jupiter's labelled grid confirmed 0° at
  the centre. Checked on a contact sheet: Earth's four layers align, Io's Pele sits at ~105°E, the GRS at ~50°W
  (2000). Unmapped areas (Europa/Ganymede/Callisto south poles, Triton's unseen north) were black holes; they now
  take the mapped average (`fillNoData`). Flag: Triton's Voyager colours (orange/violet/UV filters) look greenish.
  CREDITS.md gains a Solar System imagery section generated from `sources.json`.

- [x] **T005** [P] — **Star catalogue:** `scripts/build-star-catalogue.mjs` (dev-only) reads the Yale BSC5 extract
      in `assets-src/solar-system/` and writes `public/assets/solar-system/stars.bin` (RA, Dec, magnitude, B−V,
      quantised); the pure encoder is unit-tested (round trip within 0.01°, 0.05 mag). Credit line. files:
      `scripts/build-star-catalogue.mjs`, `scripts/star-catalogue.mjs`, `tests/unit/scripts/star-catalogue.test.ts`,
      `public/assets/solar-system/stars.bin`, `CREDITS.md` · covers: AC-9

  **Result (2026-10-06):** 9 096 stars (14 entries without J2000 positions skipped) → `stars.bin`, 53.3 KB (doesn't
  gzip further). 8 tests: Sirius parsed exactly; round trip within 0.01°, 0.05 mag, 0.02 B−V; missing B−V → 0.65.
  Source `bsc5-catalog.gz` (574 KB) committed in `assets-src/solar-system/`; credit row added.

## Asset pipeline and shared loader

- [x] **T010** — **Texture entries in the pipeline:** tests first (`validateManifest` accepts `kind: 'texture'` with
      source, output, mode, size, byte cap, colour space; rejects bad ones; `checkOutput` enforces caps and the KTX2
      header), then `asset-pipeline.mjs` + `build-assets.mjs`; `assets.config.mjs` lists every Solar System image.
      `npm run assets` writes `public/assets/solar-system/*.ktx2`. files: `scripts/asset-pipeline.mjs`,
      `build-assets.mjs`, `assets.config.mjs`, `tests/unit/scripts/asset-pipeline.test.ts`,
      `public/assets/solar-system/*.ktx2` · covers: AC-1, AC-13

  **Result (2026-10-06):** manifest entries are `ModelEntry | TextureEntry` (`kind: 'texture'`: image → `.ktx2`,
  `mode`, `color` sRGB/linear, byte cap); ids `solar-system-<map>` stay unique across Spaces. `checkTextureOutput`
  checks the KTX2 identifier and size. 20 maps, ETC1S + mipmaps: **2.40 MB** (+ stars 53 KB = 2.45 MB of D-029's
  3 MB); largest Mercury 329 KB, Mars 325, Jupiter 290; ocean mask 35 KB and clouds 91 KB linear. The chair rebuilt
  byte-identical. The bundle check gained per-Space budgets (`budgetFor`): `solar-system` ≤ 4 MB (D-030), now
  2.47 MB without the decoder. 14 new tests; 799 unit green.

- [x] **T011** [P] — **Shared KTX2 setup:** move the transcoder setup, `detectSupport` and worker cleanup from
      `model-viewer/loader.ts` to `src/shared/ktx2.ts`; the model viewer uses it. Existing loader tests move with it
      and stay green; a test for loading a standalone `.ktx2` with a stub. files: `src/shared/ktx2.ts`,
      `src/shared/model-viewer/loader.ts`, `tests/unit/shared/ktx2.test.ts` · covers: AC-11

  **Result (2026-10-06):** `src/shared/ktx2.ts`: `configureKtx2` (worker limit 2, `detectSupport`) used by the
  model viewer's GLB loader, and `createKtx2(renderer)` for standalone textures: the transcoder readied once before
  the first download (a failure rejects every load), progress in bytes loaded, `dispose()` frees the workers. 7 new
  tests; the 011 loader tests unchanged and green. 806 unit + 159 E2E; entry and chair sizes unchanged.

## Data and pure maths (test-first)

- [x] **T020** — **Data:** `imagery` for all 16 bodies, Earth's `layers`, Saturn's `rings` (sourced radii and profile),
      `SOURCES` entries. Tests: every body has imagery and a source with a `CREDITS.md` line; every file exists under
      `public/assets/solar-system/` and its recorded `bytes` match; the totals fit 3 MB; ring radii sourced and
      ordered. files: `types.ts`, `data.ts`, `tests/unit/spaces/solar-system/data.test.ts` · covers: AC-1, AC-7, AC-13

  **Result (2026-10-06):** `Imagery { file, leftEdgeLongitudeDeg, bytes }` on all 16 bodies, Earth's `layers`
  (clouds, night, ocean), Saturn's `rings { innerKm: 74 490, outerKm: 136 780, profile }` (PDS Rings Node), `SKY.stars`,
  and four `SOURCES` (NASA/USGS maps, Solar System Scope, PDS rings, Yale BSC). Tests: files exist, recorded bytes
  match, credit lines present, total 2.46 MB ≤ 3 MB. Ring radii are kept in km: against the drawn (mean) radius they
  are 1.279–2.349, not the equatorial 1.239–2.270 the plan quoted (plan, tasks and a spec note corrected). 811 unit.

- [x] **T021** [P] — **Surface orientation:** tests, then `surfaces.ts`:
  - map u ↔ longitude for each convention (centre, left-edge, west-positive);
  - Earth's sub-solar longitude from 021's orientation vs UTC + the equation of time: within 5° at several dates;
  - the Moon's sub-Earth point within 10° of (0°, 0°) at the 7 reference dates;
  - spin direction: Venus and Uranus features move westward.

  files: `tests/unit/spaces/solar-system/surfaces.test.ts`, `src/spaces/solar-system/surfaces.ts` · covers: AC-2

  **Result (2026-10-06):** `surfaces.ts`: `longitudeOfU` (checked against a real `SphereGeometry`: u = 0.5 on +X,
  0.75 on −Z) and `subPoint(body, days, direction)`. 10 tests: Earth's sub-solar longitude vs UTC + equation of
  time within 5° at 6 dates (1850–2050), the Moon's sub-Earth point at the 7 reference dates, spin direction. **Found
  a 021 bug:** Earth's spin phase was 180° off for every date before 2000. NAIF's Earth pole Dec (90° − 0.557°·T)
  passes 90° at J2000, and `orbit.ts` built the equator's node from the pole vector's x/y, which flip. The node is
  now α₀ + 90° (IAU definition), `equatorNode()`. 821 unit + 159 E2E green.

- [x] **T022** [P] — **Ring shadows (pure):** tests on constructed geometry (Sun behind Saturn → ring point shadowed;
      beside → lit; Saturn point under the rings → shadow radius in range; equinox → no ring shadow), then
      `ring-shadows.ts`. files: `tests/unit/spaces/solar-system/ring-shadows.test.ts`, `ring-shadows.ts` · covers: AC-8

  **Result (2026-10-06):** `inPlanetShadow` (ray to the Sun hits the unit sphere) and `ringShadowRadius` (crossing
  of the ring plane, null on the sunlit hemisphere and at equinox), Saturn-local frame. 6 tests, two sabotages
  caught.

- [x] **T023** [P] — **Stars (pure):** tests (decode `stars.bin`; Sirius, Betelgeuse, Polaris within 0.5° of their
      J2000 directions in scene axes; magnitude → size/alpha and B−V → colour monotonic), then `stars.ts` decode and
      directions. files: `tests/unit/spaces/solar-system/stars.test.ts`, `stars.ts` · covers: AC-9

  **Result (2026-10-06):** `decodeStars` (9 096 stars → directions, magnitudes, colours), `starDirection`,
  `starSize` (4.5 → 1 px), `starAlpha` (1 → 0.12), `starColour` (Ballesteros + blackbody fit). Sirius, Betelgeuse
  and Polaris within 0.5° against an independent conversion; dropping the obliquity fails 4 tests. 8 tests.

- [x] **T024** [P] — **Night factor and glow size (pure):** tests (night factor 0 on the day side, 1 deep in night,
      smooth across the terminator; glow size = max(4 × radius, 48 px at the Sun's distance)), then the pure parts of
      `materials.ts` and `glow.ts`. files: `tests/unit/spaces/solar-system/materials.test.ts`, `glow.test.ts` ·
      covers: AC-5, AC-10

  **Result (2026-10-06):** `nightFactor` (smoothstep over cos ±0.1, ±~6°) and `glowSize` (max of 4 radii and 48 px at
  the Sun's distance). 6 tests. Watch in T051: at real scale's home view the 48 px halo spans the inner orbits on
  screen (markers draw on top; `GLOW.minPx` is the knob).

- [x] **T025** — **Ring-aware stylised layout:** tests (Saturn's extent counts 2.349 × its drawn radius; Titan clears
      the rings; every body ≥ 3 px at 1280 × 720 and ≥ 1 px at 320 × 640; no overlap at 200 dates), then `scale.ts`
      (and a `STYLISED` retune if needed). files: `tests/unit/spaces/solar-system/scale.test.ts`, `scale.ts`,
      `data.ts` · covers: AC-7

  **Result (2026-10-06):** a ringed planet's moons and extent start at its ring's outer edge (`outerKm / radiusKm`
  × the drawn radius). Titan's ring moves out (distance 5.13), the system extent grows 57.1 → 61.8 units; no
  `STYLISED` retune needed: every body is still ≥ 3 px at 1280 × 720 and ≥ 1 px at 320 × 640 (unit test now covers
  both), and nothing overlaps at 200 dates. 843 unit + 159 E2E green (020's pixel E2E included).

## Core seam

- [x] **T030** — **Background progress:** tests, then implementation:
  - `SpaceContext.reportBackgroundProgress` is bound to the mounted view; ignored after it's gone or superseded;
  - the indicator's compact variant (no pointer events, top centre), 250 ms delay, 25/50/75 % announcements, `1` →
    "<title> imagery loaded";
  - a later blocking open replaces it.

  files: `src/core/types.ts`, `space-manager.ts`, `src/ui/loading.ts`, `src/styles/main.css`,
  `tests/unit/core/space-manager.test.ts`, `tests/unit/ui/loading.test.ts`, `tests/helpers/fakes.ts` · covers: AC-11

  **Result (2026-10-06):** `SpaceContext.reportBackgroundProgress(fraction, what)` → `SpaceManager` keeps it per
  request (held until the view is ready, shown after 250 ms as `show('<title> <what>', { background: true })`, `1`
  → `ready()` "… loaded" if shown, silent otherwise; a new request, `close()` or `suspend()` hides and drops it).
  `.loading.is-background`: top centre (64 px down at ≤ 640), compact, `pointer-events: none` (tested through
  main.css in jsdom). Found while testing: a report arriving after the view was ready started "not ready"; the
  manager now remembers the ready request. 10 tests (the readiness hold sabotage-checked). 852 unit + 159 E2E.

## Scene objects

- [x] **T040** — **Materials:** tests (each patch finds its shader anchor or throws; the fade mixes colour → image by
      a uniform; Earth's roughness map comes from the ocean mask and its night emissive is gated by the night factor;
      the cloud layer is a child sphere at 1.006 × with an alpha map, lit, no depth write; Saturn's body patch takes
      the ring uniforms; shared program cache keys), then `materials.ts`. files: `materials.ts`, `materials.test.ts`
      · covers: AC-1, AC-4, AC-5, AC-6, AC-8

  **Result (2026-10-06):** `addPatch` (named patches, run in order, throw on a missing anchor, cache key = patch
  names), `withImageFade` (standard and basic), `createEarthMaterial` (ocean-mask roughness 1 → 0.35, night gate on
  `uSunView + vViewPosition`, i.e. fragment → Sun in view space), `createCloudLayer` (child at 1.006 ×, shared
  sphere, invisible until its map), `patchRingShadow` (Saturn-local `vLocalPos`, profile read through the ring's
  `profileU`). Driven through three's real `ShaderLib` sources, no WebGL. 8 tests.

- [x] **T041** — **Rings:** tests (radii 1.279–2.349 of the drawn radius, radial UVs, child of Saturn's mesh so the plane is Saturn's
      equator, double-sided, transparent, no depth write, no raycast, the shadow uniform, dispose), then `rings.ts`.
      files: `rings.ts`, `rings.test.ts` · covers: AC-7, AC-8

  **Result (2026-10-06):** `createRings`: `RingGeometry` turned into Saturn's XZ plane (front = +y), child of
  Saturn's mesh; instead of remapped UVs the shader reads the profile by local radius through `profileSpanU` (the
  strip's calibrated `spanKm`, Cassini Division at ~0.67). Sunlit face 1, far face 0.3, planet shadow 0.12; plain
  band (0.35 opacity) until the profile fades in. Fixed while reviewing: the plain band's colour was raw sRGB bytes
  in a linear uniform (washed out after `colorspace_fragment`); now `new Color(hex)`. 7 tests.

- [x] **T042** [P] — **Sky and glow objects:** tests (stars: one `Points`, infinity shader, render order first, no
      depth write, not frustum-culled, no raycast, dispose; glow: additive sprite, depth test on, depth write off,
      per-frame size, no raycast, dispose), then `stars.ts` and `glow.ts` objects. files: `stars.ts`, `glow.ts`,
      tests · covers: AC-9, AC-10

  **Result (2026-10-06):** `createStarfield(sky)`: one `Points` (`aSize` px, `aColour` rgb + alpha by magnitude),
  `(P · mat3(V) · dir).xyww`, render order −1, transparent, depth-tested (bodies hide it), no depth write, not
  culled, no raycast, `setPixelRatio` for device-pixel sizes. `createGlow(sun)`: additive `Sprite` beside the Sun
  (same parent, so its scale and spin don't apply), depth test on, depth write off, a generated 128² `DataTexture`
  falloff (no canvas: works in jsdom), `update(camera, heightPx)` sizes it by `glowSize`. 8 tests; removing the
  raycast overrides or the depth test fails 3.

- [x] **T043** — **Imagery loading:** tests with a stub loader, then `imagery.ts`:
  - progress = bytes loaded / total, reported until 1;
  - each texture attaches to its body/layer and fades in over 0.5 s of Space time (instant with reduced motion);
  - a failure keeps that body's colour, warns once, and the rest still load;
  - aborting disposes textures that arrive late; the transcoder's workers are freed when settled.

  files: `imagery.ts`, `tests/unit/spaces/solar-system/imagery.test.ts` · covers: AC-11, AC-12

  **Result (2026-10-06):** `imagery.ts`: `imageryJobs` (16 surfaces + Earth's clouds/night/ocean + the ring
  profile = 20 files), `loadImagery` (all files in parallel through the shared `Ktx2`; progress = bytes over the
  recorded total, capped per file, exactly one final 1; `texture.offset` from `leftEdgeLongitudeDeg` (0 for every
  shipped map); a failed load or an `onTexture` that throws → texture disposed, `id:layer` in `failed`, one
  summary `console.warn`; after an abort, late textures disposed and nothing reported; the loader is disposed once
  everything settles, not on abort, since terminating KTX2Loader's workers mid-transcode would likely leave its promises unsettled; not verified) and
  `createFader` (0 → 1 over 0.5 s of `delta`, instant under reduced motion, `clear()`). Attaching textures to the
  materials is the Space's `onTexture` (T050/T051). 12 tests; removing the late dispose or the loader dispose
  fails 2.

## The Space

- [x] **T050** — **Space tests** (`space.test.ts` additions):
  - opens before imagery arrives (plain colours, ready) and reports background progress;
  - imagery attaches and fades by `delta`; reduced motion → instant;
  - Earth's and Saturn's Sun uniforms follow the date; the glow's size updates per frame;
  - stars, glow, clouds and rings exist at both scales; the near plane counts Saturn's rings;
  - dispose frees all of it, including textures that arrive after dispose;
  - a context-loss rebuild loads imagery again.

  files: `tests/unit/spaces/solar-system/space.test.ts` · covers: AC-1, AC-4–AC-12

  **Result (2026-10-06):** 11 Space tests through new `SolarSystemDeps` seams (`createKtx2`, `loadStars`,
  `baseUrl`; every test opens with stubs, nothing downloads): opens coloured and reports `'imagery'` progress to
  1; maps attach per layer (surface, clouds' alpha map, night emissive, ocean roughness, ring profile); fades by
  `delta` (instant under reduced motion); a failure keeps Jupiter coloured, one warning; Earth's `uSunView` and
  Saturn's `uSunLocal` (shared with the ring mesh) follow the camera and the date (2026 → 2032 differ); the glow
  sized by `glowSize` each frame; sky, glow, clouds and rings at both scales; the near plane counts the rings'
  outer edge; dispose frees all of it and late textures/stars; a rebuild reloads. All 10 new ones failed first;
  removing the ring reach, `fader.advance` or `glow.dispose` each fails one.

- [x] **T051** — **Wiring** in `index.ts` (+ CSS for the compact indicator if not done in T030). Screenshots at
      1280 × 720, 375 × 667 and 320 × 640, both scales, time running; close-ups of Earth (day/night line), the Moon
      from Earth, Saturn on 2025-03-23 (edge-on) and 2032-06-01 (open). Flag anything wrong. files:
      `src/spaces/solar-system/index.ts`, `scene.ts` · test: T050

  **Result (2026-10-06):** `scene.ts` builds the patched materials (image fade on all, Earth's material + clouds,
  Saturn's ring-shadow patch + rings, a 0.35-alpha placeholder until the profile), `attach(id, layer, texture)`
  and `updateSun(camera)`; `index.ts` starts `loadImagery` and the star fetch after the view is usable, advances
  the fader, updates Sun uniforms and the glow after the camera, counts the rings in `fitDepth`, and disposes in
  order (abort, fader, stars, glow, scene). Screenshots (SwiftShader, 1280 × 720, 375 × 667, 320 × 640, both
  scales; close-ups at real scale, since stylised zoom doesn't follow the cursor): textures, rings, glow and stars
  all show; Earth's terminator, city lights over South America on the night side and a sun glint on the Indian
  Ocean (not on Australia); Saturn 2025-03-23 with its shadow drawn long across the rings and the rings' shadow a
  thin equatorial line; 2032-06-01 rings open, their unlit north face dimmer and their shadow on the northern
  hemisphere. Found and fixed: the ring strip was 1024 × 63 (KTX2Loader warned "multiple-of-four"): the
  pipeline now aligns texture sizes to four and its check rejects others (1024 × 64, 12 413 B). Found and fixed:
  the 021 speed E2E failed 2 of 3 full runs: the imagery's arrival makes SwiftShader frames exceed the 0.1 s
  delta clamp, so sim time lags the wall clock in the measured second. New core signal
  `data-space-background` ("loading" → "done", D-032); the time spec waits for it (3/3 green since). Flag:
  Jupiter's polar caps look smeared (the PIA07782 source map's polar fill), not a code issue. 902 unit + 159 E2E;
  entry 147.9 KB (+1.3); Space 3.06 MB of 4.

## End-to-end (`tests/e2e/solar-system-surfaces.spec.ts`)

- [x] **T060** — **Surfaces and Earth:**
  - **AC-1:** a close view of each body shows detail (pixel variance well above a plain colour);
  - **AC-2:** at 1 day/s, a body's surface pattern shifts in the expected direction;
  - **AC-3:** sunward side brighter than the far side; a night side above the background;
  - **AC-4–AC-6:** Earth's day side differs from its surface layer alone; night-side lights brighter over land than
    ocean; an ocean near the sub-solar point brighter than with shine off.

  covers: AC-1–AC-6

  **Result (2026-10-06; AC-1's wording amended, D-033):** `tests/e2e/solar-system-surfaces.spec.ts`, 9
  tests, all at real scale through the re-centring zoom; each compares two pages on the same camera pose
  (verified) where one has a map, or every map, answering 404. AC-1: every body's textured render differs
  from its plain colour (≥ 6.8 mean RGB measured, test > 4) and shows second-difference detail above the plain
  sphere's, **except Uranus and Neptune**, whose maps are near-featureless (0.39 vs 0.38, 0.53 vs 0.45).
  AC-2: on lighting-free (textured ÷ plain) images a day apart, the app's reported 14° turn explains the Moon's
  surface 3.4× better than no turn and 3.8× better than the reverse (patch matching first failed: the fixed
  terminator and the changing shading fooled it). AC-3 (fixed date): sunward median > night + 20, night > sky
  - 2 on ≥ 2 bodies. AC-4: clouds change the day side by 34.7. AC-5 (00:00 UTC): lights add 15 on average (max
  195. on the night side and exactly 0 on the day side. AC-6 (12:00 UTC, clouds off in both): the glint area's
       ocean +62.8, lit land 0.23. Sabotage: dropping the night gate or the ocean roughness fails AC-5/AC-6.
       `project`/`frames` moved to `tests/e2e/solar-helpers.ts` with a new `snapshot`. 168 E2E green.

- [x] **T061** — **Rings, sky, glow:**
  - **AC-7/AC-8:** ring pixels around Saturn; on 2032-06-01, darker pixels where the shadows are predicted;
  - **AC-9:** pan and zoom leave star pixels in place, rotation moves them, bodies draw over stars;
  - **AC-10:** halo pixels around the Sun at both scales; a body in front unchanged.

  covers: AC-7–AC-10

  **Result (2026-10-06):** 5 tests in `solar-system-surfaces.spec.ts`. AC-7/AC-8: Saturn close up on 2032-06-01,
  each pixel traced in Saturn's frame (unit radius, ring plane y = 0, the app's reported orientation); both
  pages turned by the same drags until Saturn's shadow on the rings shows. B ring median 60.6 (plain 43.9) vs sky
  6.1; ring pixels in Saturn's shadow 0.11–0.44 of lit ones at the same radius (test < 0.6, both pages); Saturn
  under the rings' shadow 0.82–0.84 of the clear surface at the same sunlight angle (plain page, where Saturn is
  one colour; test < 0.92 each, mean < 0.88). AC-9: paired pages with and without `stars.bin`: star pixels stay
  100 % in place after a pan and a zoom, 0 % after a turn; inside every body's disc the pages match (≤ 2).
  AC-10: halo brightness just outside the Sun 22.4 (stylised) and 143.7 (real) vs sky 6.1; with the Sun's map off,
  every disc pixel is exactly its colour #ffcc66 (the additive glow never reaches it). Sabotage: glow depth test
  off, stars without `xyww`, ring shadow 1.0, no ring shadow on Saturn: each fails its test. Fixed along the
  way: paired pages opened at "today" differed by seconds under load (Earth turned): `open()` now sets a fixed
  date. 021's speed test failed under the heavier suite (5.3 vs 7 d/s: frames under 10 fps hit the 0.1 s delta
  clamp): it now measures days per second of Space time (frame deltas clamped as the engine does). 173 E2E, 3/3
  full runs green.

- [x] **T062** — **Loading and lifecycle:**
  - **AC-11:** a delayed image (`page.route`): the Space is usable at once, the compact indicator shows progress,
    the body is coloured then textured; a 404 image: the body stays coloured, nothing else breaks (the 404 in
    `allowConsoleErrors`);
  - **AC-12:** 10 round trips back to the baseline (one leaving mid-load), GPU textures included; context loss →
    textured again at the same time state.

  covers: AC-11, AC-12

  **Result (2026-10-06):** 4 tests in `solar-system-surfaces.spec.ts`. AC-11: with Jupiter's map held back
  (`page.route` that continues later), the Space is ready, `data-space-background="loading"`, the compact
  indicator shows (no pointer events) at > 50 % and < 100 %, the scale switch works and Jupiter can be brought
  close; on release the indicator goes, "Solar System imagery loaded" is announced and Jupiter changes 20.8
  (detail 0.47 → 1.83). With Jupiter's map 404ing, its disc matches a fully plain page (0.00), Mars is textured
  (24.9), and exactly one warning names `jupiter:surface`. AC-12: 10 round trips, one leaving with every map still
  held (released after leaving), back to the DOM, GPU (geometries, textures) and worker baseline; each full visit
  puts ≥ 20 textures on the GPU. Context loss on 2032-06-01 at 1 month/s: same `simTime`, the same texture
  count, the Sun textured again (> 50 colours across its disc). Sabotage: no starfield dispose → 13 geometries
  vs 3; no loader dispose → 2 workers left. 177 E2E, 2/2 full runs.

## Docs & Verify

- [x] **T090** — `specs/architecture.md` (imagery pipeline, background progress, surfaces, rings and shadows, stars,
      glow, seams) and `specs/tech-stack.md` (texture entries in the pipeline; no new dependency).
- [x] **T091** — `npm run check`, `npm run test:e2e`, `npm run build` all green. Record entry size, imagery bytes and
      the Space total (AC-13); a manual FPS note with the renderer string; a warning probe with the E2E flags.

  **Result (2026-10-06):** T090: `architecture.md` (directory layout, background progress, texture entries,
  Solar System surfaces, testability seams, budget) and `tech-stack.md` (standalone KTX2 maps, texture entries;
  no new dependency). T091: `npm run check` 902 unit, `npm run test:e2e` 177, `npm run build` OK. Entry 147.9 KB
  gzipped (+1.3 of 5 KB); imagery + stars 2.46 MB (≤ 3); Space 45.5 KB code + 2.46 MB + decoder 571 KB = 3.06 MB
  (≤ 4). Gate-5 probe on the production build with the E2E flags (time at 1 year/s, both scales, a re-centre on
  Saturn, backwards, 3 round trips one mid-load, context loss): no warnings or errors; `__WORLD__` absent. Frame
  rate on "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)", 1280 × 720, time
  running: 56.5 (stylised) / 53.5 (real) at the whole-system views, 60.1 zoomed on Saturn; with the maps blocked
  60.3 / 60.2 / 60.3, without the stars 54.0 / 55.2: the cost is software texture sampling (SwiftShader has no
  compressed formats, so the maps run uncompressed). The lead accepted this software floor for AC-13 (D-034).

- [x] **T092** — Tick ACs in `spec.md` (Status `Implemented`), set `roadmap.md` 022 ✔️, update `memory/progress.md`,
      `memory/MEMORY.md` and `memory/learnings.md`.

  **Result (2026-10-06):** 13 ACs ticked (AC-13 on the SwiftShader floor, D-034); spec Implemented; roadmap 022
  ✔️; `progress.md`, `MEMORY.md`, `learnings.md` and `decisions.md` updated.

## AC coverage

| AC    | Tasks                                    |
| ----- | ---------------------------------------- |
| AC-1  | T001, T004, T010, T020, T040, T050, T060 |
| AC-2  | T001, T021, T060                         |
| AC-3  | T060                                     |
| AC-4  | T040, T050, T060                         |
| AC-5  | T024, T040, T050, T060                   |
| AC-6  | T040, T050, T060                         |
| AC-7  | T020, T025, T041, T050, T061             |
| AC-8  | T022, T040, T041, T050, T061             |
| AC-9  | T001, T005, T023, T042, T050, T061       |
| AC-10 | T024, T042, T050, T061                   |
| AC-11 | T011, T030, T043, T050, T062             |
| AC-12 | T043, T050, T062                         |
| AC-13 | T002, T003, T010, T020, T091             |
