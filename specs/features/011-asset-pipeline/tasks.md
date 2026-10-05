# 011 — Asset Pipeline · Tasks

**Plan:** `./plan.md` (Approved)
Legend: `[P]` = can run in parallel with the previous task. Each task lists files and the proving test.
Test-first: each "tests" task must fail before its paired implementation task makes it pass.
Every task leaves `npm run check` **and** `npm run test:e2e` green. Run E2E at the D-015 worker cap; use
`E2E_WORKERS=2` for single-spec runs.
Baselines: entry 144.8 KB gzipped (010); the chair's GLB is 4.1 MB, uncompressed.

## Spikes & setup

- [x] **T001** — **Entry-size and transcoder spike.** Add a throwaway lazy chunk that imports `KTX2Loader` and
      `MeshoptDecoder` and calls `new KTX2Loader().init()`.
  - `npm run build`: note the entry growth, and check that `basis_transcoder.js` and `.wasm` are emitted as
    hashed files in `dist/assets/`.
  - `npm run dev`: check that the transcoder URLs resolve, with no 404s.
  - **≤ 5 KB:** the cap is 5 KB; carry on. **> 5 KB:** **stop** and propose the AC-6 number (spec Changelog plus
    a decision).
  - **If the dev server breaks the URLs:** try `optimizeDeps.exclude`. Otherwise use the plan's fallback (a
    pinned `public/decoders/basis/` copy plus a sync unit test), and update the plan.
  - Remove the chunk afterwards.

  files: temporary only · covers: AC-6 risk, AC-4/AC-5 mechanism

  **Result (2026-10-05):** entry 144.8 → 145.0 KB gzipped (**+0.2 KB**) → AC-6 cap is **5 KB**. The build emits
  `basis_transcoder-<hash>.js` (57.5 KB) and `.wasm` (527.3 KB, 248.9 KB gzipped), and the manifest lists both
  under the chair chunk's `assets` (T050 can use this). The dev server serves them from
  `node_modules/three/examples/jsm/libs/basis/` and `init()` resolves with no 404s, so no `optimizeDeps` change
  or `public/` copy is needed. The chair's lazy code grows 21.2 → 51.9 KB gzipped (the Meshopt decoder embeds
  its WASM), still lazy only.

- [x] **T002** — Install the dev dependencies (`@gltf-transform/core`, `/extensions`, `/functions`,
      `meshoptimizer`, `ktx2-encoder`; D-018). Move the original model to
      `assets-src/sheen-chair/SheenChair.glb` (the shipped file stays in place until T043) and add
      `assets-src/README.md`. Check that `npm run build` doesn't deploy `assets-src/`.
      files: `package.json`, `package-lock.json`, `assets-src/**` · test: `npm run check`, `dist/` listing
- [x] **T003** — **Encoding spike.** A throwaway script encodes the chair: ETC1S colour, UASTC + Zstd data maps,
      Meshopt geometry.
  - Record the size. If it's over 1.5 MB, retry with `maxSize` 1024 for the data maps, then for all maps.
  - Check that the result keeps `KHR_materials_sheen` and `KHR_texture_transform`, and that `ktx2-encoder`
    runs in Node without a system binary.
  - **If no setting reaches 1.5 MB, or `ktx2-encoder` fails:** stop and propose the plan's fallback or a spec
    change.
  - Record the chosen settings in this file.

  files: temporary only · covers: AC-1, AC-14 risk

  **Result (2026-10-05):** `ktx2-encoder` runs in Node with no system binary. It needs an `imageDecoder`
  (PNG → RGBA); sharp, already installed through `@gltf-transform/functions` → `ndarray-pixels`, does it.
  All 7 textures are PNG, ≤ 1024 px. Sizes (1.5 MB = 1536 KB):

  | Settings                                                     | Size         |
  | ------------------------------------------------------------ | ------------ |
  | ETC1S colour, UASTC+Zstd RDO 1 data, full size               | 1 875 KB     |
  | + RDO 3                                                      | 1 778 KB     |
  | + RDO 3, AO as ETC1S                                         | 1 619 KB     |
  | + RDO 5, AO as ETC1S                                         | 1 544 KB ✗   |
  | **ETC1S colour, UASTC+Zstd RDO 1 data, normal map → 512 px** | **1 300 KB** |
  | normal 512, AO as ETC1S                                      | 1 130 KB     |

  **Chosen: the bold row** (1.27 MB, 237 KB headroom). The normal map was 838 of the 1 445 KB of textures. It
  tiles 2×2 across the velvet at strength 0.6, so 512 px per tile is a moderate loss. Every data map keeps UASTC
  quality. Geometry: 1 119 → 430 KB with Meshopt (`level: 'medium'`). Output keeps `KHR_materials_sheen`,
  `KHR_materials_variants` and `KHR_texture_transform`, and adds `KHR_texture_basisu`, `KHR_mesh_quantization`
  and `EXT_meshopt_compression`. Two runs → byte-identical files (same SHA-256), ~10 s each. The visual check
  is AC-2's parity E2E (T060).

## Progress (pure, test-first)

- [x] **T010** — Progress tests:
  - **`clampProgress`:** never decreases; keeps values in [0, 1]; null stays null until a value arrives; a value
    after null is accepted.
  - **`announcementFor`:** 0.2 → 0.3 gives 25; 0.3 → 0.8 gives 75 (only the highest step crossed); no repeats;
    `next` null gives null; `previous` null counts as 0 (so a first value of 0.3 still gives 25).

  files: `tests/unit/core/progress.test.ts` · covers: AC-9, AC-11

- [x] **T011** — Implement `src/core/progress.ts`. test: T010

## Loading indicator progress

- [x] **T020** [P] — `loading.test.ts` additions:
  - `progress(0.42)` after `show()` renders the visible text "Loading Sheen Chair… 42 %" (`aria-hidden`) and a
    `role="progressbar"` named "Loading Sheen Chair" with `aria-valuenow="42"`, min 0 and max 100;
  - the `role="status"` text stays "Loading Sheen Chair…" until 25 %, then reads "Loading Sheen Chair… 25 %",
    and changes only at 50 % and 75 %;
  - values never go backwards;
  - `progress(null)` before any value keeps 010's look; after a value it changes nothing (never backwards);
  - `progress()` before `show()` and after `hide()` does nothing;
  - the existing 010 tests stay unchanged and green.

  files: `tests/unit/ui/loading.test.ts` · covers: AC-8, AC-9, AC-11

- [x] **T021** — Implement `progress()` in `src/ui/loading.ts`, plus CSS `.loading-bar`: a width transition
      that's off under reduced motion, and no pulse while determinate. files: `src/ui/loading.ts`,
      `src/styles/main.css` · test: T020 · covers: AC-10

- [x] **T022** — SpaceManager tests (fake timers):
  - the context gets `reportProgress`;
  - values reach `loading.progress()` only for the current request;
  - they're ignored after supersession, after any hide (opened, failed, `suspend()`), and before the 250 ms
    show (the latest value is applied when it shows);
  - no `loading` option → a harmless no-op.

  files: `tests/unit/core/space-manager.test.ts` · covers: AC-8, AC-11

- [x] **T023** — Implement `SpaceContext.reportProgress?` and the forwarding in `SpaceManager`.
      files: `src/core/types.ts`, `src/core/space-manager.ts` · test: T022

- [x] **T024** — "Loaded" announcement tests (D-019):
  - **Indicator `ready()`:** after `show('Sheen Chair')`, it removes the indicator and announces "Sheen Chair
    loaded" in a persistent polite live region (not `.loading`, so 010's checks hold); `ready()` while hidden
    announces nothing; the next `show()` clears the old announcement; `dispose()` removes the region.
  - **SpaceManager:** an open whose indicator was shown calls `ready()` instead of `hide()`; a fast open, a
    failure, a supersession or `suspend()` never calls `ready()`.

  files: `tests/unit/ui/loading.test.ts`, `tests/unit/core/space-manager.test.ts` · covers: AC-9

- [x] **T025** — Implement `ready()` in `src/ui/loading.ts` and its use in `SpaceManager`. test: T024

## Loader & viewer

- [x] **T030** — Viewer tests:
  - **Seam:** the `createLoader` seam replaces `loader`, and 010's viewer tests are ported to it.
  - **Progress:** values from the stub loader reach `ctx.reportProgress`.
  - **Decoder init rejects:** the factory rejects, the loader's `dispose()` is called, and nothing is allocated
    (no environment, no DOM).
  - **Model load rejects:** the same.
  - **Loader freed when loading settles:** its `dispose()` runs right after the model loads (and on failure), not
    in the viewer's `dispose()`. The workers are idle once textures are transcoded.

  files: `tests/unit/shared/model-viewer/viewer.test.ts` · covers: AC-8, AC-12, AC-13

- [x] **T031** — Implement `createGltfLoader(renderer)`:
  - `GLTFLoader` + `MeshoptDecoder`;
  - `KTX2Loader` with `detectSupport` and a worker limit of 2;
  - `load()` runs `Promise.all([ktx2.init(), download])` with progress;
  - `dispose()`.

  Wire it into `createModelViewer` with try/finally disposal. Still serving the uncompressed GLB, the 010 E2E
  stays green. files: `src/shared/model-viewer/loader.ts`, `src/shared/model-viewer/index.ts` · test: T030,
  `model-viewer.spec.ts`

## Pipeline (test-first)

- [x] **T040** [P] — Pipeline tests:
  - **Manifest validation:** id, `assets-src/` source, `public/assets/` output, `maxBytes` > 0, known texture
    modes.
  - **Missing source:** the error names the file.
  - **Texture modes:** `baseColorTexture` and `sheenColorTexture` → color mode; normal, ORM and
    `sheenRoughnessTexture` → data mode.
  - **Output checks:** over `maxBytes` → an error naming the model and both sizes; a missing required
    extension → an error.

  files: `tests/unit/scripts/asset-pipeline.test.ts` · covers: AC-14

- [x] **T041** — Implement `scripts/asset-pipeline.mjs` (pure, `// @ts-check`) and `scripts/assets.config.mjs`
      with the T003 settings. test: T040
- [x] **T042** [P] — `sheen-chair.test.ts` additions (they fail against the current uncompressed file):
  - the shipped GLB is ≤ 1.5 MB;
  - its JSON chunk lists `EXT_meshopt_compression` and `KHR_texture_basisu`, and keeps `KHR_materials_sheen`;
  - the CREDITS row notes the conversion.

  files: `tests/unit/spaces/sheen-chair.test.ts` · covers: AC-1, AC-15

- [x] **T043** — Implement `scripts/build-assets.mjs` and the `npm run assets` script.
  - Run it **twice** and record that both runs give the same size (AC-14).
  - Commit the compressed `public/assets/sheen-chair/SheenChair.glb`.
  - Update the CREDITS row ("converted: Meshopt + KTX2") and add a third-party code section (Basis transcoder,
    Apache-2.0; Meshopt decoder, MIT).
  - Run the full E2E: the 010 suite must pass on the compressed file (AC-3, AC-7). If AC-2's framing band
    shifts, stop and check before touching `fill`.

  files: `scripts/build-assets.mjs`, `package.json`, `public/assets/sheen-chair/SheenChair.glb`,
  `public/assets/CREDITS.md` · test: T042, `model-viewer.spec.ts` · covers: AC-1, AC-3, AC-7, AC-14, AC-15

  **Result (2026-10-05):** `npm run assets`: 4 029 KB → **1 286 KB** (1 317 176 bytes) in ~8 s. Two runs gave
  byte-identical files (same SHA-256). Textures are encoded one at a time with `encodeToKTX2` (not the `ktx2()`
  transform), so failures throw, and the Basis encoder's per-mip stdout lines are muted. All 90 E2E tests pass
  on the compressed file in SwiftShader: 010's framing band at 3 sizes, lighting from 4 sides, memory round
  trips, context loss and failure path (AC-3, AC-7). Entry 145.5 KB (+0.7 KB); chair assets 3.93 → 1.26 MB.

## Budget rule

- [x] **T050** [P] — `bundle-checks.test.ts` additions:
  - static assets emitted by a Space's lazy-only chunks (manifest `assets`) count towards its 5 MB budget;
  - assets that the entry also uses don't;
  - the error message includes them.

  files: `tests/unit/scripts/bundle-checks.test.ts` · covers: AC-6

- [x] **T051** — Implement it in `bundle-checks.mjs`, and print "code + assets + decoders" per Space in
      `check-bundle.mjs`. Record the entry size and the chair's total. files: `scripts/bundle-checks.mjs`,
      `scripts/check-bundle.mjs` · test: T050 · covers: AC-6

  **Result (2026-10-05):** entry 145.5 KB gzipped (+0.7 KB, within the 5 KB cap). sheen-chair = 52.3 KB code +
  1.26 MB model + 571.2 KB transcoder (stored) = **1.86 MB** of 5 MB. Sabotage with a 1.5 MB budget → exit 1,
  message names the chair with the breakdown.

## End-to-end (`tests/e2e/asset-pipeline.spec.ts`)

- [x] **T060** — E2E: compressed and same:
  - **Size:** the `SheenChair.glb` response is ≤ 1.5 MB (AC-1).
  - **Parity:** the original (served via `page.route` from `assets-src/`) and the compressed file at
    1280 × 720, home view, reduced motion. `meanLuminance` is within 10 %, the mean absolute RGB difference
    over model pixels is ≤ 2.0 (D-019), and both fills are in 50–90 % (AC-2).
  - **Decoders:** the request log while opening includes `basis_transcoder` `.js` + `.wasm`, all same-origin
    (AC-4).
  - **Lazy:** the gallery alone requests no transcoder (AC-5).
  - **SwiftShader:** the chair renders lit and framed (AC-7).

  covers: AC-1, AC-2, AC-4, AC-5, AC-7

  **Result (2026-10-05):** 4 tests. Parity at 1280 × 720: brightness differs by 0.06 %, mean RGB difference
  0.33, identical bounds. A guard checks that the routed original really is the 3.93 MiB file. Probes found
  mean brightness too weak (stripping every texture moved it only 3.4 %), so AC-2 gained the ≤ 2.0 pixel rule
  (D-019). Sabotage (the untextured chair served as the compressed one) fails at 5.47. A sabotage of the KTX2
  sRGB flag changed nothing: three's GLTFLoader sets colour space by material slot, not from the KTX2 file.
  New fixtures: `canvasRgba()` (base64 transfer) and `meanPixelDifference()`.

- [x] **T061** — E2E: progress. CDP `Network.emulateNetworkConditions` at ~300 KB/s:
  - the progressbar shows a value strictly between 0 and 100;
  - recorded `aria-valuenow` values never decrease;
  - a `MutationObserver` on the status sees only the 25/50/75 step texts after the first, then "Sheen Chair
    loaded" once ready (D-019);
  - `.loading` is gone at ready.
  - With reduced motion, the bar's `transition-duration` is 0s and there's no animation.

  covers: AC-8, AC-9, AC-10, AC-11

- [x] **T062** — E2E: failure and lifecycle:
  - **Transcoder aborted via route** → "Failed to load", back link works, only the expected logged errors.
  - **Corrupt GLB (bytes served via route)** → the same.
  - **10 round trips:** `memory()` back to the baseline, and `page.workers().length` back to its pre-visit
    count.

  covers: AC-12, AC-13

  **Result (2026-10-05, T061 + T062):** 5 more tests. At 400 KB/s the recorded log was values 0 → 100 in steps
  of 1, spoken "Loading Sheen Chair…" → 25 % → 50 % → 75 %, then "Sheen Chair loaded" once. Under reduced
  motion: `transition-duration: 0s` and `animation-name: none`, and the value still advances. Sabotages:
  without the transcoder pre-init, a blocked transcoder gave `opened` (untextured) plus GLTFLoader console
  errors; without the loader's `dispose()`, 22 workers leaked over 10 round trips. Both are caught. 475 unit +
  99 E2E green (~44 s).

## Docs & Verify

- [x] **T090** — Update `specs/architecture.md`:
  - pipeline (`assets-src/` → `npm run assets` → `public/assets/`);
  - loader (Meshopt, KTX2, transcoder pre-init, workers);
  - progress seam (`reportProgress`, stepped announcements);
  - budget rule;
  - layout and seams.

  Update `specs/tech-stack.md` with the pipeline libraries.

- [x] **T091** — `npm run check`, `npm run test:e2e`, `npm run build` all green; record the entry size, the
      chair's GLB size and the Space total.

  **Result (2026-10-05):** 34 files / 475 unit, 99 E2E (~44 s, 4 workers), build green, Prettier clean.
  Entry **145.6 KB** gzipped (+0.8 KB vs 010, within the 5 KB cap). Chair GLB **1 317 176 bytes (1.26 MB)**,
  down from 4.1 MB. Space total 52.3 KB code + 1.26 MB + 571.2 KB transcoder = **1.86 MB** of 5 MB.
  `__WORLD__` absent from the production build.

- [x] **T092** — Tick ACs in `spec.md` (Status `Implemented`), set `roadmap.md` 011 ✔️, update
      `memory/progress.md`, `memory/MEMORY.md` and `memory/learnings.md`.

## AC coverage

| AC    | Tasks                                    |
| ----- | ---------------------------------------- |
| AC-1  | T003, T042, T043, T060                   |
| AC-2  | T060                                     |
| AC-3  | T031, T043                               |
| AC-4  | T001, T060                               |
| AC-5  | T001, T060                               |
| AC-6  | T001, T050, T051                         |
| AC-7  | T043, T060                               |
| AC-8  | T020–T023, T030, T061                    |
| AC-9  | T010, T011, T020, T021, T024, T025, T061 |
| AC-10 | T021, T061                               |
| AC-11 | T010, T011, T020, T022, T061             |
| AC-12 | T030, T031, T062                         |
| AC-13 | T030, T031, T062                         |
| AC-14 | T003, T040, T041, T043                   |
| AC-15 | T042, T043                               |
