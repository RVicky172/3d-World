# 011 — Asset Pipeline · Implementation Plan

**Spec:** `./spec.md` · **Status:** Approved (2026-10-05) <!-- Draft | Approved -->

## Approach

The work has three parts. They meet in the model viewer, which gets a loader that understands compressed
assets and reports download progress.

**1. Offline pipeline (dev only): `npm run assets`.** A Node script, `scripts/build-assets.mjs`, reads a typed
manifest (`scripts/assets.config.mjs`). For each entry it turns an original model in `assets-src/` into its
web-ready file in `public/assets/`. It uses the glTF-Transform library API, not the CLI: the CLI's KTX2 commands
shell out to KTX-Software's `toktx`, which isn't installed here and would make the pipeline depend on a system
binary. Steps per model:

1. Read the source GLB. Steps: `dedup()` → `prune()` → `weld()`.
2. **Textures → KTX2** with `ktx2-encoder` (Basis Universal compiled to WASM, runs in Node):
   - base colour and sheen colour → **ETC1S** (small, fine for colour);
   - normal and other data maps (ORM, sheen roughness) → **UASTC + Zstandard** (ETC1S artefacts show on
     normals);
   - an optional per-slot `maxSize`; the T003 spike set `normalTexture: 512` for the chair (all other maps
     keep their size).
   - Node needs an `imageDecoder` (PNG → RGBA) for `ktx2-encoder`, plus resizing; both use sharp.
   - The `ktx2` transform **swallows** encoding failures: it warns and keeps the PNG. The post-check therefore
     requires every texture to be `image/ktx2`.
3. **Geometry → Meshopt:** `reorder()` + `quantize()` + `meshopt()` (`EXT_meshopt_compression`, D-017).
4. Write the GLB. The script then checks its own result: the output must exist, be under the manifest's
   `maxBytes`, keep the source's `KHR_materials_sheen` / `KHR_texture_transform` extensions, and have every
   texture in `image/ktx2`. Any failure
   exits non-zero with a message naming the model.

The pipeline isn't part of `npm run build`. Its output is committed, so the build, tests and deploy never need the
encoder. The pure parts (manifest validation, choosing a texture mode per slot, the post-checks) are in
`scripts/asset-pipeline.mjs` and unit-tested like `bundle-checks.mjs`.

**2. Runtime decoding: `createGltfLoader()`** in `src/shared/model-viewer/loader.ts`:

- `GLTFLoader` + `setMeshoptDecoder(MeshoptDecoder)` (three's `meshopt_decoder.module.js`: JS with the WASM
  embedded, so it lands in the Space's lazy chunk and needs no extra request).
- `KTX2Loader` + `detectSupport(renderer)` + `setWorkerLimit(2)`. **Its transcoder path is left unset:** in three
  r186, KTX2Loader finds `basis_transcoder.js/.wasm` with `new URL('../libs/basis/…', import.meta.url)`. Vite emits
  both as hashed, same-origin build assets, so they're self-hosted and stay in step with the installed three
  version. Nothing is copied into `public/`. The spike (T001) confirms this works in both the dev server and
  the build.
- **Decoders are ready before the model is parsed.** GLTFLoader catches texture errors: it logs one and renders
  the model **untextured**, so a blocked transcoder would never reach "Failed to load". `load()` therefore runs
  `Promise.all([file.loadAsync(url, progress), ktx2.init()])` (a raw `FileLoader` download in parallel with the
  transcoder), then `gltf.parseAsync(bytes, urlBase)`. Parsing only after both succeed also means a failed
  `init()` can't leave a background parse logging texture errors (AC-12).
- It returns `{ load(url, onProgress), dispose() }`. `dispose()` calls `KTX2Loader.dispose()`, which ends its
  workers. **The viewer disposes the loader as soon as loading settles** (try/finally around `load()`), success
  or failure. The workers are idle once textures are transcoded, so they never pile up (AC-13), and two loaders
  are never active at once (KTX2Loader warns about that). A failed load therefore leaves nothing allocated.

**3. Progress (AC-8–AC-11)** passes from the Space to the core indicator through one new, optional context method:

- `SpaceContext.reportProgress?(fraction: number | null)` takes 0–1, or null when the total is unknown. The
  viewer calls it from GLTFLoader's `onProgress` (`loaded / total`, or null when `lengthComputable` is false).
- **`SpaceManager`** forwards it to the indicator only for the current request, so a superseded request can't
  move the bar. It doesn't change when the indicator appears: still after 250 ms, and hidden on every outcome
  (010).
- **Pure maths in `src/core/progress.ts`** (unit-tested first):
  - `clampProgress(previous, next)` never goes backwards and keeps values in [0, 1];
  - `announcementFor(previous, next)` returns 25, 50 or 75 when a step boundary is crossed, otherwise null.
- **`createLoadingIndicator`** gains `progress(fraction or null)`. With a fraction, the pill shows the visible text
  "Loading Sheen Chair… 42 %" (`aria-hidden`, so it isn't read on every change) and a thin bar with
  `role="progressbar"`, `aria-label="Loading Sheen Chair"`, `aria-valuemin/max/now`. The existing polite
  `role="status"` keeps "Loading Sheen Chair…" and changes only at 25/50/75 %, then the indicator goes when the
  model is drawn. With null, or before any progress, it looks exactly like 010, so 010's tests stay valid.
  - Under reduced motion the bar width jumps instead of easing, and there's no pulse (AC-10).

**Download progress, not total progress.** The bar measures the model file only. The transcoder downloads in
parallel, and decoding happens after 100 %. The indicator stays at 100 % until the model is drawn (AC-11). That's
honest and simple, and decoding the chair is short.

## Files

| File                                            | Change | Purpose                                                                                            |
| ----------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------- |
| `assets-src/sheen-chair/SheenChair.glb`         | new    | Original 4.1 MB model, moved from `public/assets/` (not deployed, Q3)                              |
| `assets-src/README.md`                          | new    | What lives here and how to regenerate: `npm run assets`                                            |
| `public/assets/sheen-chair/SheenChair.glb`      | modify | Replaced by the compressed output (≤ 1.5 MB, AC-1). Same path, so `data.ts` doesn't change         |
| `scripts/assets.config.mjs`                     | new    | Manifest: source, output, texture modes, `maxSize`, `maxBytes` per model                           |
| `scripts/asset-pipeline.mjs`                    | new    | Pure: manifest validation, texture-mode choice per slot, output checks                             |
| `scripts/build-assets.mjs`                      | new    | Runs glTF-Transform + ktx2-encoder for each manifest entry (`npm run assets`)                      |
| `scripts/bundle-checks.mjs`                     | modify | A Space's budget also counts the static assets its lazy chunks emit (the Basis transcoder, AC-6)   |
| `src/core/progress.ts`                          | new    | `clampProgress`, `announcementFor` (pure)                                                          |
| `src/core/types.ts`                             | modify | `SpaceContext.reportProgress?`                                                                     |
| `src/core/space-manager.ts`                     | modify | Builds `reportProgress` per request and forwards it to the indicator for the current token only    |
| `src/ui/loading.ts`                             | modify | `progress(fraction or null)`: visible text + bar, progressbar role, stepped announcements          |
| `src/styles/main.css`                           | modify | `.loading-bar`; no transition under reduced motion                                                 |
| `src/shared/model-viewer/loader.ts`             | new    | `createGltfLoader(renderer)`: Meshopt + KTX2, transcoder pre-init, dispose                         |
| `src/shared/model-viewer/index.ts`              | modify | Uses the loader seam; `Promise.all` decoder init + download; reports progress; disposes the loader |
| `public/assets/CREDITS.md`                      | modify | Chair row notes "converted: Meshopt + KTX2"; third-party code section (Basis transcoder, Meshopt)  |
| `package.json`                                  | modify | `assets` script; dev dependencies (see below; **approval needed**)                                 |
| `tests/unit/core/progress.test.ts`              | new    | Clamp and announcement steps                                                                       |
| `tests/unit/ui/loading.test.ts`                 | modify | `progress()` rendering, roles, stepped status text, null fallback                                  |
| `tests/unit/core/space-manager.test.ts`         | modify | Progress forwarded for the current request only; ignored after supersession, hide or failure       |
| `tests/unit/shared/model-viewer/viewer.test.ts` | modify | Stub loader reports progress; decoder-init rejection → factory rejects and the loader is disposed  |
| `tests/unit/scripts/asset-pipeline.test.ts`     | new    | Manifest validation, missing-source message, texture modes, output checks                          |
| `tests/unit/scripts/bundle-checks.test.ts`      | modify | Emitted assets count towards the Space budget                                                      |
| `tests/unit/spaces/sheen-chair.test.ts`         | modify | Shipped GLB ≤ 1.5 MB, uses `EXT_meshopt_compression` + `KHR_texture_basisu`, keeps sheen           |
| `tests/e2e/asset-pipeline.spec.ts`              | new    | Parity vs original, decoders same-origin and lazy, progress, failure, workers                      |
| `specs/architecture.md`, `specs/tech-stack.md`  | modify | Pipeline, loader, progress seam; dev-tool rows                                                     |

## Data Structures & Interfaces

```ts
// src/core/types.ts
interface SpaceContext {
  // …existing
  /** Download progress of the view being opened: 0–1, or null when the total is unknown (011). */
  reportProgress?(fraction: number | null): void;
}

// src/ui/loading.ts
interface LoadingIndicatorUi {
  show(label: string): void;
  /** Determinate when given a fraction; back to 010's indeterminate look with null. */
  progress(fraction: number | null): void;
  hide(): void;
  dispose(): void;
}

// src/core/progress.ts
export function clampProgress(previous: number | null, next: number | null): number | null;
/** 25, 50 or 75 when `next` crosses that step from `previous`, else null. */
export function announcementFor(previous: number | null, next: number | null): 25 | 50 | 75 | null;

// src/shared/model-viewer/loader.ts
export interface ModelLoader {
  load(url: string, onProgress?: (fraction: number | null) => void): Promise<{ scene: Object3D }>;
  dispose(): void;
}
export function createGltfLoader(renderer: WebGLRenderer): ModelLoader;

// src/shared/model-viewer/index.ts — the seam replaces 010's `loader` dep
interface ModelViewerDeps {
  createLoader?: (renderer: WebGLRenderer) => ModelLoader;
  createEnvironment?: (renderer: WebGLRenderer) => Texture;
  baseUrl?: string;
}
```

```js
// scripts/assets.config.mjs
/** @type {import('./asset-pipeline.mjs').AssetManifest} */
export default [
  {
    id: 'sheen-chair',
    source: 'assets-src/sheen-chair/SheenChair.glb',
    output: 'public/assets/sheen-chair/SheenChair.glb',
    maxBytes: 1.5 * 1024 * 1024, // AC-1
    textures: { color: 'etc1s', data: 'uastc' }, // per-slot mode (normal/ORM/sheenRoughness = data)
    maxSize: { normalTexture: 512 }, // T003: 1.30 MB instead of 1.88 MB at full size
  },
];
```

## Three.js Techniques

- **`EXT_meshopt_compression`** is decoded by `MeshoptDecoder` (synchronous WASM, fast). `quantize()` stores
  positions, normals and UVs as normalised integers; three dequantises them through `normalized` attributes and
  node scales. That's transparent to `fitModel()`, which uses world-space bounds.
- **`KHR_texture_basisu`:** KTX2Loader transcodes in workers to the best format the GPU reports (ASTC, BC7,
  ETC2, …), or to RGBA32 when none is supported. SwiftShader exposes few compressed formats, so E2E exercises
  the fallback path (AC-7). The result is a `CompressedTexture`, which `disposeObject3D()` already frees, since
  it is a `Texture`.
- **Colour space:** GLTFLoader assigns sRGB to colour slots, and KTX2 files carry their own colour metadata. Both
  must agree, which the parity test proves (AC-2).
- **Workers:** at most 2 per loader. `dispose()` terminates them. KTX2Loader warns when more than one loader is
  active, so a viewer disposes its loader before the next one initialises (the SpaceManager disposes the old
  view before the new factory runs).
- **Entry size:** `KTX2Loader` and `MeshoptDecoder` are imported only by lazy code, but the three core classes
  they use (e.g. `CompressedTexture`, `CompressedArrayTexture`, `Data3DTexture`) may join the shared `three`
  chunk, as in D-010 and D-013. The T001 spike measures this.

## Test Approach

| AC    | Test                                                                                                                                                                                                                                                                              | Type       |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| AC-1  | `sheen-chair.test.ts`: the shipped GLB is ≤ 1.5 MB and its JSON chunk lists `EXT_meshopt_compression` and `KHR_texture_basisu`. E2E: the request log shows `SheenChair.glb` transfer ≤ 1.5 MB                                                                                     | unit + e2e |
| AC-2  | E2E `asset-pipeline.spec.ts`: `page.route` serves `assets-src/…/SheenChair.glb` (the original) for one load and the compressed file for another, at the same viewport and home view. Each side's `meanLuminance` is within 10 % of the original's; fill stays in the 50–90 % band | e2e        |
| AC-3  | The existing `model-viewer.spec.ts` (12 tests) and all 010 unit tests stay green against the compressed file                                                                                                                                                                      | e2e + unit |
| AC-4  | E2E: the request log while opening is all same-origin (010 AC-12 test) **and** includes `basis_transcoder` `.js` and `.wasm`                                                                                                                                                      | e2e        |
| AC-5  | E2E: load the gallery and wait for ready: no request matches `basis_transcoder` or a decoder chunk. Then open the chair: they appear                                                                                                                                              | e2e        |
| AC-6  | T001 spike records the entry growth. `bundle-checks.test.ts`: emitted assets of lazy-only chunks count towards the Space budget; the build prints the chair's code + model + transcoder total                                                                                     | unit + e2e |
| AC-7  | E2E in SwiftShader (limited compressed formats): the chair renders lit and framed (010 AC-1/AC-4 checks on the compressed file)                                                                                                                                                   | e2e        |
| AC-8  | `progress.test.ts`, `loading.test.ts`, `space-manager.test.ts` (fake timers). E2E: CDP `Network.emulateNetworkConditions` throttles the download (~300 KB/s), and the `progressbar` shows at least one value strictly between 0 and 100 before ready                              | unit + e2e |
| AC-9  | `loading.test.ts`: progressbar role, name and values; the status text changes only at 25/50/75. E2E: a `MutationObserver` records the status text during a throttled load and sees at most the three step texts after the first                                                   | unit + e2e |
| AC-10 | `loading.test.ts`: reduced motion → no transition class. E2E with `reducedMotion: 'reduce'`: the bar's computed `transition-duration` is 0s and `animation-name` is `none`                                                                                                        | unit + e2e |
| AC-11 | `progress.test.ts` (never backwards). E2E: recorded `aria-valuenow` values are non-decreasing, and `.loading` is gone at `data-space-ready`. 010's "nothing under 250 ms" unit test is unchanged                                                                                  | unit + e2e |
| AC-12 | `viewer.test.ts`: a decoder-init rejection makes the factory reject, disposes the loader and allocates nothing. E2E: `page.route('**/basis_transcoder*', abort)` → "Failed to load", back link works, only the expected logged errors; a corrupt GLB (served via route) → same    | unit + e2e |
| AC-13 | E2E: 10 gallery ↔ chair round trips → `memory()` equals the baseline, and `page.workers().length` is back to its pre-visit count                                                                                                                                                  | e2e        |
| AC-14 | `asset-pipeline.test.ts`: manifest validation, a missing-source error naming the file, texture modes per slot, output checks (size, extensions). T002 runs `npm run assets` twice and compares sizes (recorded in tasks)                                                          | unit       |
| AC-15 | `sheen-chair.test.ts` (010 credit test) still passes; a new assertion checks that the CREDITS row mentions the conversion                                                                                                                                                         | unit       |

## Dependencies (dev only, approved 2026-10-05, D-018)

No new **runtime** dependency: `KTX2Loader`, `MeshoptDecoder` and the Basis transcoder ship with `three`.
For the offline pipeline, these **devDependencies** (MIT; sharp Apache-2.0; none shipped to browsers):

| Package                                                                           | Why                                                                   |
| --------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `@gltf-transform/core`, `@gltf-transform/extensions`, `@gltf-transform/functions` | Read/write glTF, `dedup`/`prune`/`weld`/`quantize`/`meshopt`          |
| `meshoptimizer`                                                                   | The Meshopt encoder used by `meshopt()`                               |
| `ktx2-encoder`                                                                    | Basis Universal KTX2 encoding in WASM, so no system `toktx` is needed |
| `sharp` (added after T003, D-018 addendum)                                        | PNG → RGBA for `ktx2-encoder` in Node, and resizing                   |

`tech-stack.md` already plans "`gltf-transform` CLI (added in Phase 2)". It would change to "glTF-Transform
library + ktx2-encoder (011, D-018)", and D-018 would record why not the CLI + `toktx`: a system binary isn't
reproducible from `npm install`. **Fallback if the T002 spike shows `ktx2-encoder` can't handle the chair in
Node:** install KTX-Software and use the glTF-Transform CLI. That needs a documented system prerequisite and a
spec note.

## Risks & Mitigations

- **Entry growth from KTX2Loader's core imports** is unknown. _Mitigation:_ the T001 spike, with the allowance
  rule from D-017.
- **`new URL(…, import.meta.url)` inside `node_modules` under Vite's dev pre-bundling** can resolve wrong (a known
  Vite caveat). _Mitigation:_ T001 checks the dev server too. If it breaks, add `three` to
  `optimizeDeps.exclude`, or fall back to a pinned copy in `public/decoders/basis/` plus a unit test that
  compares it with `node_modules`.
- **Silent untextured model** when the transcoder fails (GLTFLoader swallows texture errors). _Mitigation:_
  pre-init the transcoder in `Promise.all` (AC-12 has unit and E2E coverage).
- **Can't hit 1.5 MB without visible loss.** _Mitigation:_ the T002 spike tries ETC1S colour + UASTC/Zstd data at
  full size first, then a lower `maxSize` (1024) for data maps, then for all. It records the size and the AC-2
  brightness delta. If nothing fits, stop and propose a spec change.
- **Headless progress events:** a `route.fulfill` body arrives in one go, so there are no intermediate values.
  _Mitigation:_ throttle with CDP network emulation instead of routes for AC-8/AC-9/AC-11.
- **Transcoder WASM is 527 KB on disk.** It counts towards the Space budget (≈ 1.5 + 0.6 MB, well under 5 MB).
  Static hosts may not gzip `.wasm`, so the stored size is what's counted.
- **E2E load:** decoding in workers adds CPU per test. The D-015 worker cap stays; the new spec reuses
  reduced motion and avoids repeated cold loads where one load can serve several checks.

## Constitution Check

| Principle                 | Status | Notes                                                                                                 |
| ------------------------- | ------ | ----------------------------------------------------------------------------------------------------- |
| I. Spec before code       | ✅     | Spec Approved 2026-10-05 (D-017)                                                                      |
| II. Browser-only          | ✅     | Decoders self-hosted as Vite build assets; no CDN; the pipeline runs offline at dev time              |
| III. Self-contained Space | ✅     | The loader lives in `src/shared/model-viewer/`; decoders load lazily (AC-5); the loader is disposed   |
| IV. Performance budgets   | ✅     | Model ≤ 1.5 MB; Space total checked by the build; entry allowance from the spike                      |
| V. Accessible & resilient | ✅     | Progressbar role + stepped announcements; reduced motion; decoder failure → "Failed to load"          |
| VI. Test-gated            | ✅     | Pure progress maths and pipeline checks test-first; E2E parity, request logs, workers, failure        |
| VII. Data-driven          | ✅     | Pipeline settings in a typed manifest; the Space's `data.ts` doesn't change                           |
| VIII. Small dependencies  | ✅     | No runtime deps; 5 dev-only packages approved (D-018)                                                 |
| IX. Licensed assets       | ✅     | CC0 source allows modified versions; CREDITS notes the conversion; shipped third-party code is listed |
| X. Memory maintained      | ✅     | D-017 recorded; D-018 (tooling) once approved; spike results go into learnings                        |
