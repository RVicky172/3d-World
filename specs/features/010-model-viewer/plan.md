# 010 — Model Viewer Space · Implementation Plan

**Spec:** `./spec.md` · **Status:** Approved (2026-10-05) <!-- Draft | Approved -->

## Approach

The reusable model viewer goes in `src/shared/model-viewer/`. Each model is a tiny Space (`src/spaces/<id>/`)
holding typed data and a one-line factory (D-012). 010 ships one model, `sheen-chair`. No new dependency:
`GLTFLoader` and `RoomEnvironment` ship with three (`three/examples/jsm`), and `tech-stack.md` already lists
`GLTFLoader`.

**1. Viewer factory: `createModelViewer(ctx, config)` → `SpaceInstance`.** Its order makes failure safe:

1. **Load the GLB first** with `GLTFLoader.loadAsync(url)`, where `url = BASE_URL + config.model.path`. Nothing
   is allocated before this, so a rejected load leaks nothing. The rejection propagates, and the SpaceManager
   shows "Failed to load" (AC-9).
2. **Centre the model.** Compute its `Box3`, then move `gltf.scene` by `-center` so the focus is the origin.
   The bounding-sphere radius `r` drives all framing.
3. **Light it with a generated environment:**
   - `new PMREMGenerator(ctx.renderer).fromScene(new RoomEnvironment(), 0.04).texture` → `scene.environment`;
   - then dispose the `RoomEnvironment` and the `PMREMGenerator` immediately.
   - `scene.background` stays null, so the clear colour is the site's `--bg` (D-012).
   - No tone-mapping change: the renderer is shared, and Spaces must not change global renderer state.
4. **Add the camera controls** (004) with limits derived from `r` (see Framing).
5. **Add the attribution line** (CC-BY, AC-13) to `ctx.overlay`.
6. **`dispose()`:** controls → `disposeObject3D(scene)`, which already covers `scene.environment` and every
   material texture → remove the attribution.

**2. Framing.** Pure maths in `src/shared/model-viewer/framing.ts`, unit-tested first.

- **`frameDistance(r, fovY, aspect, fill)`** returns the distance at which the bounding sphere spans `fill` of
  the **smaller** viewport dimension. With `t = tan(fovY/2) · min(1, aspect)`, it is `r / sin(atan(fill · t))`.
- **Default fill is 0.75.** The sphere over-estimates the visible bounds, so the target lands inside AC-2's
  50–90 % band.
- **`distanceLimits(r, fovY, aspect)`:**
  - `min = 1.2 r`: the camera can't enter the model;
  - `max = frameDistance(r, …, 0.1)`: the model's bounding sphere is never smaller than 10 % (AC-5; the outline of an open shape can be smaller, D-016).
- **`panLimit = r`.**

**3. Re-framing on resize (AC-3).** `resize(w, h)` updates the camera aspect, then recomputes the home
distance and limits for the new aspect.

- **If the visitor hasn't moved the camera since open or the last Reset:** the camera moves along its
  **current** direction to the new distance. This keeps any turntable angle.
- **Either way:** the controls' saved home is replaced, so "Reset view" frames for the current size.

This needs two small additions to the shared controls (`src/shared/controls/`):

```ts
interface CameraControls {
  // …existing
  /** True once the visitor moved the camera; cleared by reset(). The turntable doesn't count. */
  readonly userMoved: boolean;
  /** New home view and limits (e.g. after a resize); also moves the camera there unless userMoved. */
  setHome(home: { position: Vec3; distance: { min: number; max: number }; panLimit: number }): void;
}
```

`setHome` sets the OrbitControls limits, calls `saveState()`, and moves the camera when `!userMoved`. demo-cube
keeps its static config and never calls it.

**4. Loading indication (AC-8): a core addition, not per Space.**

- **The problem:** while a view opens, the Fader (z 2) covers the overlay, so a Space can't show its own
  loading UI.
- **The fix:** `SpaceManager` gets an optional `loading: { show(label: string): void; hide(): void }`.
  - If loading the module and running the factory takes longer than **250 ms**, it calls
    `show(title)`. The delay avoids flashing on fast or cached opens.
  - It calls `hide()` on every outcome: opened, failed or superseded.
- **The UI:** `src/ui/loading.ts` renders `role="status"` (`aria-live="polite"`) "Loading <title>…" in `#app`
  at **z 3**, above the fader.
  - A CSS pulse that is off under reduced motion.
  - Its timer lives in core UI code, not Space logic, like the Fader's.
- **Later:** 011 replaces the text with real progress.

**5. Content.**

- `public/assets/sheen-chair/SheenChair.glb` is downloaded once from the Khronos glTF-Sample-Assets
  repository at implementation time. It is not fetched at runtime (AC-12).
- `CREDITS.md` gets its row.
- `src/spaces/sheen-chair/data.ts` holds the model path, title, description, initial direction, turntable
  settings, camera FOV, and an `assets` list with attribution.
- The registry lists `sheen-chair` **first**; demo-cube stays (Q4).
- The gallery card uses the generated placeholder; a real thumbnail can come with 011.

**6. Budgets.** `scripts/bundle-checks.mjs` gains a pure rule: each Space's lazy chunk(s) (gzipped) plus its
`public/assets/<id>/` folder must total ≤ 5 MB. `check-bundle.mjs` runs it on every build (AC-12).

## Files

| File                                                 | Change | Purpose                                                                                                   |
| ---------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------- |
| `src/shared/model-viewer/framing.ts`                 | new    | `frameDistance`, `distanceLimits`, `fitModel` (centre + radius)                                           |
| `src/shared/model-viewer/types.ts`                   | new    | `ModelViewerConfig`, `AssetCredit`                                                                        |
| `src/shared/model-viewer/index.ts`                   | new    | `createModelViewer(ctx, config)`: load, centre, environment, controls, credit, resize, dispose            |
| `src/shared/model-viewer/credit.ts`                  | new    | Visible attribution line in the overlay                                                                   |
| `src/shared/controls/index.ts`, `types.ts`           | modify | `userMoved`, `setHome()`                                                                                  |
| `src/core/space-manager.ts`                          | modify | Optional `loading` with 250 ms delay; hide on every outcome                                               |
| `src/ui/loading.ts`                                  | new    | `createLoadingIndicator(container)` → `{ show, hide, dispose }`                                           |
| `src/main.ts`                                        | modify | Pass the loading indicator to the manager                                                                 |
| `src/styles/main.css`                                | modify | `.loading` (z 3, pulse off with reduced motion), `.model-credit`                                          |
| `src/spaces/sheen-chair/data.ts`                     | new    | `SHEEN_CHAIR: ModelViewerConfig`                                                                          |
| `src/spaces/sheen-chair/index.ts`                    | new    | `export default (ctx) => createModelViewer(ctx, SHEEN_CHAIR)`                                             |
| `src/spaces/registry.ts`                             | modify | Add `sheen-chair` first                                                                                   |
| `public/assets/sheen-chair/SheenChair.glb`           | new    | The model (CC0)                                                                                           |
| `public/assets/CREDITS.md`                           | modify | Asset row                                                                                                 |
| `scripts/bundle-checks.mjs`, `check-bundle.mjs`      | modify | Per-Space 5 MB rule                                                                                       |
| `tests/unit/shared/model-viewer/framing.test.ts`     | new    | Framing maths                                                                                             |
| `tests/unit/shared/model-viewer/viewer.test.ts`      | new    | Factory with a stubbed loader: centring, env set, limits, resize re-frame, dispose, failure leaks nothing |
| `tests/unit/shared/controls/camera-controls.test.ts` | modify | `userMoved`, `setHome`                                                                                    |
| `tests/unit/core/space-manager.test.ts`              | modify | Loading show/hide timing and outcomes                                                                     |
| `tests/unit/ui/loading.test.ts`                      | new    | Indicator markup, role, label                                                                             |
| `tests/unit/spaces/sheen-chair.test.ts`              | new    | Data validation (AC-14), credits ↔ `CREDITS.md` (AC-13)                                                   |
| `tests/unit/scripts/bundle-checks.test.ts`           | modify | 5 MB rule                                                                                                 |
| `tests/e2e/fixtures.ts`                              | modify | `contentBounds(page)`: bounding box of non-background pixels                                              |
| `tests/e2e/model-viewer.spec.ts`                     | new    | AC-1–AC-13 end to end                                                                                     |
| `specs/architecture.md`                              | modify | Model viewer section, loading indicator, stacking, seams                                                  |

## Data Structures & Interfaces

```ts
// src/shared/model-viewer/types.ts
export interface AssetCredit {
  path: string; // under public/, e.g. 'assets/sheen-chair/SheenChair.glb'
  title: string; // 'SheenChair'
  author: string; // 'Eric Chadwick (© 2020 Wayfair, LLC)'
  license: 'CC0' | 'CC-BY-4.0' | 'Public domain';
  source: string; // URL of the original
}

export interface ModelViewerConfig {
  title: string; // also the controls' accessible label
  model: { path: string }; // relative to BASE_URL
  camera: { fov: number; direction: readonly [number, number, number] }; // initial view direction (normalised in code)
  fill?: number; // default 0.75 (AC-2)
  turntable: { speed: number; idleDelay: number };
  assets: readonly AssetCredit[]; // every file the Space loads (AC-13)
}

// src/shared/model-viewer/framing.ts
export function frameDistance(radius: number, fovYRadians: number, aspect: number, fill: number): number;
export function distanceLimits(
  radius: number,
  fovYRadians: number,
  aspect: number,
): { min: number; max: number };
export function fitModel(object: Object3D): { radius: number }; // centres object on the origin

// src/shared/model-viewer/index.ts
export function createModelViewer(
  ctx: SpaceContext,
  config: ModelViewerConfig,
  loader?: { loadAsync(url: string): Promise<{ scene: Object3D }> }, // injectable for unit tests
): Promise<SpaceInstance>;

// src/core/space-manager.ts
export interface LoadingIndicator {
  show(label: string): void;
  hide(): void;
}
// SpaceManagerOptions.loading?: LoadingIndicator; SpaceManagerOptions.loadingDelayMs?: number (default 250)

// tests/e2e/fixtures.ts
export function contentBounds(page: Page): Promise<{ width: number; height: number; fillOfSmaller: number }>;
```

## Three.js Techniques

- **Loading:** `GLTFLoader` (no Draco/KTX2 needed: SheenChair is plain glTF with embedded JPEG/PNG
  textures). three decodes the textures to `ImageBitmap`, and `texture.dispose()` frees the GPU copies.
- **Environment:** `RoomEnvironment` (a procedural room of boxes and lights) is baked once into a PMREM cube
  texture by `PMREMGenerator.fromScene(…, sigma 0.04)`. That texture is set as `scene.environment` for PBR
  reflections and ambient light, with no lights in the scene. The generator and the room are disposed right
  after; only the environment texture lives on, and the Space disposes it.
- **Framing:** a bounding sphere from `Box3.getBoundingSphere`, plus the trigonometry above.
  `camera.near/far` are set from `r` (`near = r / 100`, `far = r * 100`) to keep depth precision.
- **Performance:** a single 4.1 MB GLB with `KHR_materials_sheen` (supported by `GLTFLoader` and
  `MeshPhysicalMaterial`). The triangle count is modest. Fine for 60 FPS. The pixel ratio cap
  (2) still applies.
- **Shared-module effect (learnings):** `GLTFLoader` imports about 65 three core symbols (animation, skinning,
  interleaved buffers…). All of `three` sits in the chunk the entry loads, so those classes grow the **entry**
  even though the loader itself is lazy. T001 measured +8.3 KB; the NFR is amended to ≤ 10 KB (D-013).

## Test Approach

| AC    | Test                                                                                                                                                                                                                                           | Type       |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| AC-1  | `model-viewer.spec.ts`: gallery card (title, description, placeholder) → open → `data-space-ready`, `canvasCoverage` > 0.05                                                                                                                    | e2e        |
| AC-2  | `framing.test.ts`: sphere fill = target at several aspects; portrait uses width. E2E: `contentBounds` fill in [0.5, 0.9] at 1280×720, 768×1024, 320×640 (reduced motion: no turntable drift)                                                   | unit + e2e |
| AC-3  | `viewer.test.ts`: resize re-frames when not moved, keeps the pose when moved, Reset uses the new home. E2E: 1280×720 → 320×640 bounds in range; drag → resize → pose unchanged; Reset → bounds in range                                        | unit + e2e |
| AC-4  | E2E: mean luminance of content pixels ≥ threshold after orbiting 0°/90°/180°/270° (ArrowLeft ×12 = 90°)                                                                                                                                        | e2e        |
| AC-5  | `camera-controls.test.ts` (`setHome`, `userMoved`), `framing.test.ts` (limits). E2E: zoom fully in → camera distance ≥ 1.2 r (no inside view); fully out → fill ≥ 0.1; existing 004 behaviours smoke-checked (hint, help, Reset, keyboard)     | unit + e2e |
| AC-6  | E2E with `reducedMotion: 'reduce'`: pose still for 600 ms                                                                                                                                                                                      | e2e        |
| AC-7  | E2E: canvas `aria-label` contains "Sheen Chair"; the card text is the title and description                                                                                                                                                    | e2e        |
| AC-8  | `space-manager.test.ts` (fake timers: no show under 250 ms; show after; hide on opened, failed, superseded); `loading.test.ts`. E2E: `page.route` delays the GLB by 1.5 s → `role=status` "Loading Sheen Chair…" visible, then gone when ready | unit + e2e |
| AC-9  | `viewer.test.ts`: loader rejects → factory rejects, nothing allocated. E2E: `page.route(**/SheenChair.glb, abort)` → "Failed to load", back link works; `allowConsoleErrors` for the logged load error only                                    | unit + e2e |
| AC-10 | E2E: warm-up visit, then 10 gallery ↔ model round trips → `memory()` equals the baseline (reduced motion for speed)                                                                                                                            | e2e        |
| AC-11 | E2E: open the model → `loseContext` → `restoreContext` → ready, `contentBounds` fill in range, luminance check passes                                                                                                                          | e2e        |
| AC-12 | E2E: request log while opening — every URL is same-origin. `bundle-checks.test.ts`: the 5 MB rule; build runs it                                                                                                                               | e2e + unit |
| AC-13 | `sheen-chair.test.ts`: every `assets[].path` has a `CREDITS.md` row with an allowed licence, and the file exists. E2E: credit line visible with author and licence                                                                             | unit + e2e |
| AC-14 | `sheen-chair.test.ts`: config validates (path under `assets/`, non-empty title, FOV in (10°, 100°), non-zero direction)                                                                                                                        | unit       |

## Risks & Mitigations

- **Entry growth from `GLTFLoader` (likely 10–25 KB gzipped) breaks the spec NFR (≤ 1 KB).** The total
  budget (250 KB) is not at risk: 134.9 KB today.
  - _Mitigation:_ the **first task measures it**: add a throwaway `GLTFLoader` import to the Space chunk and
    build.
  - If it is over 1 KB, stop and propose a spec change: amend the NFR to "entry stays within the 250 KB budget;
    growth recorded" and log a decision, like D-010 did.
  - A `manualChunks` split of three can't help: `three.core.js` is a single module that Rollup won't split.
- **The download source for the GLB is an outward network action** (a one-time fetch from GitHub during
  implementation). _Mitigation:_ it uses the official Khronos repository; the size and licence are checked
  on arrival.
- **Software rendering (SwiftShader) is slow** with five 2K textures and PMREM. _Mitigation:_ E2E waits on
  `data-space-ready`, not time. If open takes more than about 5 s in CI, the timeouts for this spec are raised
  rather than adding a `?quality=low` mode yet.
- **The bounding sphere over-frames elongated models**, making them look small. SheenChair is
  fairly compact. _Mitigation:_ `fill` is a per-model config, and AC-2's 50–90 % band leaves room. A box-based
  fit can come later if a model needs it.
- **Changing shared controls (004)** could regress demo-cube. _Mitigation:_ additive API only; the existing
  controls unit and E2E suites must stay green.
- **The loading indicator could flash during instant opens.** _Mitigation:_ the 250 ms delay, plus a unit test
  for no show under the delay.
- **The PMREM bake allocates temporary render targets.** If any leaks, AC-10 fails. _Mitigation:_ dispose the
  generator straight after the bake; the memory E2E test is the check.

## Constitution Check

| Principle                 | Status | Notes                                                                                                                     |
| ------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------- |
| I. Spec before code       | ✅     | Spec 010 Approved (D-012)                                                                                                 |
| II. Browser-only          | ✅     | GLB self-hosted under `public/`; no runtime third-party calls (AC-12)                                                     |
| III. Self-contained Space | ✅     | Viewer in `src/shared/`; the Space is data + one line; lazy chunk; full disposal (AC-10)                                  |
| IV. Performance budgets   | ✅     | Entry +8.3 KB measured (T001), within the amended ≤ 10 KB NFR (D-013) and ≪ 250 KB; Space ≤ 5 MB is enforced by the build |
| V. Accessible & resilient | ✅     | 004 controls; announced loading; "Failed to load" path; works after context restore (AC-11)                               |
| VI. Test-gated            | ✅     | Pure framing maths test-first; every AC mapped                                                                            |
| VII. Data-driven          | ✅     | `data.ts` holds model, camera, turntable and credits (AC-14)                                                              |
| VIII. Small dependencies  | ✅     | None added; `GLTFLoader`/`RoomEnvironment` are part of three and already listed                                           |
| IX. Licensed assets       | ✅     | CC-BY 4.0 with `CREDITS.md` row and visible attribution; checked by a unit test (AC-13)                                   |
| X. Memory maintained      | ✅     | D-012 logged; size outcome → decision; learnings as found                                                                 |
