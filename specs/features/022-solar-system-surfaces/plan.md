# 022 — Solar System Surfaces · Implementation Plan

**Spec:** `./spec.md` · **Status:** Approved <!-- Draft | Approved -->

## Approach

022 dresses 021's moving system without changing how it moves. Everything new hangs off the existing scene graph
(`scene.ts`) and per-frame order (`index.ts`, plan 021 §8), and every new visual is data-driven from `data.ts`.

**1. Imagery as assets (build time).** The 011 pipeline today turns GLB models into web-ready GLBs. It gains a
second entry kind, **`texture`**: one source image → resized (sharp) → one `.ktx2` file (the existing WASM Basis
encoder; ETC1S throughout, the ocean mask included: a two-level mask survives ETC1S, and UASTC would cost
~0.3–0.5 MB, T002), with mipmaps and a byte cap per file.
Source images live in `assets-src/solar-system/` at their shipping resolution (2K planets, 1K the rest), fetched
once by a dev-only `scripts/fetch-solar-imagery.mjs` that records each URL, licence and longitude convention. The
star catalogue is converted the same way by `scripts/build-star-catalogue.mjs` into a compact binary
(`stars.bin`, ~55 KB). Nothing is fetched from third parties at runtime.

**2. Imagery data (`data.ts`).** Each body gains `imagery`: its file(s) and the source map's longitude at the left
edge, so 0° lands on the body's prime meridian (AC-2). three's `SphereGeometry` already puts u = 0.5 on local +X,
which 021 points at the prime meridian, and east on −Z, so a standard map (0° at the centre, east to the right)
needs no offset; others get `texture.offset.x`. Earth gains `clouds`, `night` and `ocean` layers; Saturn gains
`rings` (inner/outer radii in Saturn radii, a radial profile image). `SOURCES` and `CREDITS.md` gain every image and
the catalogue.

**3. Open at once; imagery fades in (Q8).** The factory returns as today (021's plain colours). It then starts
`loadImagery()` without awaiting it: a `KTX2Loader` (shared with the model viewer's setup) loads each file;
summed bytes give progress; each arriving texture is attached to its body and fades in over 0.5 s of Space time
(instant under reduced motion), through a small shader patch that mixes the body's colour with the image. A failed
image leaves its body coloured and logs one `console.warn` (AC-11). Leaving or a context loss aborts the load
(`ctx.signal`), and anything that arrives late is disposed at once (AC-12). The transcoder's workers are freed when
loading settles (learnings, 011).

**4. Progress after the view is ready (core, additive).** The 010/011 indicator is a centred box shown only during
a blocking open, and `SpaceManager` ignores progress once the view is up. A new optional
`SpaceContext.reportBackgroundProgress?(fraction | null)` is bound to the mounted view: it shows the same indicator
in a **compact, non-blocking variant** (top centre, below the back link, no pointer events), after the usual
250 ms delay, with the same 25/50/75 % announcements; `1` hides it and politely announces "<title> imagery
loaded" (D-019's announcer). Calls after the view is gone do nothing. The model viewer is unaffected. The manager also marks the status element
`data-space-background` ("loading", then "done"), a signal for tests as `data-space-ready` is (T051, D-032).

**5. Earth (Q4).** Earth's `MeshStandardMaterial` gets: the day map; a **roughness map** from the ocean mask
(oceans ~0.35, land 1) so the Sun's point light leaves a highlight on water only (AC-6); the **night lights** as an
emissive map whose strength is multiplied, in a shader patch, by a smooth night factor from the angle between the
surface normal and the Sun (fading across the terminator, zero on the day side, AC-5). **Clouds** are a child
sphere at 1.006 × Earth's radius with the cloud image as an alpha map, lit, `depthWrite: false`, turning with Earth
(AC-4).

**6. Saturn's rings and shadows (Q5).** A `RingGeometry` (74 490–136 780 km, PDS Rings Node: 1.279–2.349 × the drawn, mean radius; T020) with
radial UVs, a child of Saturn's mesh (so it takes Saturn's pole and drawn size at both scales; spin doesn't show on
a symmetric ring). Its material samples the radial profile (colour + opacity), is double-sided and transparent,
and is lit by a simple term: brighter on the face the Sun shines on (AC-8). Shadows are computed in the shaders in
**Saturn's local frame** (unit radius; real-scale world positions would lose float32 precision):

- on the ring: a fragment is in Saturn's shadow if the ray towards the Sun hits the unit sphere;
- on Saturn: a fragment is shaded by the ring opacity where the ray towards the Sun crosses the ring plane between
  the inner and outer radii.

The Sun's direction in Saturn's frame is a uniform set each frame from double-precision positions. Pure TypeScript
mirrors of both tests (`ring-shadows.ts`) are unit-tested; the shaders follow them line for line.

**Stylised scale:** Saturn's moons and neighbours must clear the rings (AC-7), so `scale.ts` counts a ringed
planet's extent from its ring's outer edge (2.349 × its drawn radius). Titan moves out and the planets beyond shift;
020's "every body ≥ 3 px at 1280 × 720" unit test bounds any retuning of `STYLISED` (as in 020).

**7. The night sky (Q6).** The Yale Bright Star Catalogue (5th revised ed., public domain; ~9 100 stars to
magnitude 6.5) is quantised to `stars.bin` (RA, Dec, magnitude, B−V). A `Points` object whose vertex shader uses
only the view's rotation and writes depth at the far plane (`gl_Position = (P · R · dir).xyww`): stars sit at
infinity, unaffected by pan, zoom, real-scale distances or the dynamic far plane (AC-9). Directions are J2000
equatorial → ecliptic (021's obliquity) → scene (`toScene`). Point size and alpha follow magnitude; colour follows
B−V. Drawn first, no depth write, `raycast` a no-op.

**8. The Sun's glow (Q7).** A `Sprite` at the Sun with a radial-gradient texture, additive blending,
`depthTest` on and `depthWrite` off: anything in front of the Sun's centre (bodies, rings) occludes it, and the
Sun's own disc hides the glow behind it (AC-10). Its size each frame is `max(4 × the Sun's drawn radius, 48 CSS px
at the Sun's distance)`, so it shows at real scale's home view too. Static; `raycast` a no-op.

**9. Per-frame additions (021 §8 order kept):** after re-placing bodies → Earth's Sun direction and Saturn's
Sun-in-local uniforms; after the controls → the glow's size; fades advance by `delta`. Nothing is created per frame.

## Files

| File                                                                  | Change     | Purpose                                                                            |
| --------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------- |
| `scripts/asset-pipeline.mjs`, `assets.config.mjs`, `build-assets.mjs` | modify     | `texture` entries: image → resized → KTX2, byte caps, checks                       |
| `scripts/fetch-solar-imagery.mjs`                                     | new        | dev-only: download + resize source maps, record URL/licence/longitude convention   |
| `scripts/build-star-catalogue.mjs`                                    | new        | dev-only: Yale BSC5 → `stars.bin`                                                  |
| `assets-src/solar-system/*`                                           | new        | source maps at shipping resolution; BSC5 extract                                   |
| `public/assets/solar-system/*.ktx2`, `stars.bin`                      | new        | shipped imagery and stars (via `npm run assets`)                                   |
| `public/assets/CREDITS.md`                                            | modify     | every image and the catalogue                                                      |
| `src/core/types.ts`, `space-manager.ts`, `src/ui/loading.ts`, CSS     | modify     | `reportBackgroundProgress`, compact indicator variant                              |
| `src/shared/model-viewer/loader.ts` → `src/shared/ktx2.ts`            | refactor   | one KTX2 setup (transcoder, `detectSupport`, worker cleanup) shared by both Spaces |
| `src/spaces/solar-system/types.ts`, `data.ts`                         | modify     | `imagery`, Earth layers, Saturn `rings`, sources                                   |
| `src/spaces/solar-system/imagery.ts`                                  | new        | load + attach + fade; progress; abort; failure fallback                            |
| `src/spaces/solar-system/materials.ts`                                | new        | fade patch, Earth material (night/ocean), cloud layer, Saturn body shadow patch    |
| `src/spaces/solar-system/rings.ts`, `ring-shadows.ts`                 | new        | ring mesh + material; pure shadow geometry mirrored by the shaders                 |
| `src/spaces/solar-system/stars.ts`                                    | new        | catalogue decode, directions, star `Points` at infinity                            |
| `src/spaces/solar-system/glow.ts`                                     | new        | the Sun's sprite and per-frame size                                                |
| `src/spaces/solar-system/scale.ts`, `scene.ts`, `index.ts`            | modify     | ring-aware stylised extent; imagery hooks; per-frame uniforms; dispose             |
| `specs/architecture.md`, `specs/tech-stack.md`                        | modify     | imagery pipeline, background progress, surfaces (no new dependency)                |
| `tests/unit/...`, `tests/e2e/solar-system-surfaces.spec.ts`           | new/modify | see Test Approach                                                                  |

## Data Structures & Interfaces

```ts
// core/types.ts (additive)
interface SpaceContext {
  /** After the view is ready: progress of content still arriving (0–1, null unknown; 1 = done). */
  reportBackgroundProgress?(fraction: number | null): void;
}

// solar-system/types.ts (additions)
interface Imagery {
  file: string; // path under public/assets/solar-system/
  /** Longitude (°E) at the map's left edge: −180 for 0° at the centre. */
  leftEdgeLongitudeDeg: number;
  bytes: number; // for progress, written by the pipeline
}
interface BodyData {
  imagery: Imagery;
  layers?: { clouds: Imagery; night: Imagery; ocean: Imagery }; // Earth only
  rings?: { innerRadii: number; outerRadii: number; profile: Imagery }; // Saturn only
}

// ring-shadows.ts (pure, Saturn-local, unit radius)
export function inPlanetShadow(point: Vec3, toSun: Vec3): boolean; // ring fragment behind Saturn
export function ringShadowRadius(point: Vec3, toSun: Vec3): number | null; // where the Sun ray crosses the ring plane

// stars.ts
export function decodeStars(bytes: ArrayBuffer): {
  directions: Float32Array;
  magnitudes: Float32Array;
  colours: Float32Array;
};
export function starDirection(raDeg: number, decDeg: number, out: Vector3Like): Vector3Like; // scene axes

// imagery.ts
export function loadImagery(options: {
  bodies: readonly BodyData[];
  loader: Ktx2;
  signal: AbortSignal;
  onTexture(id: string, layer: 'surface' | 'clouds' | 'night' | 'ocean' | 'rings', texture: Texture): void;
  onProgress(fraction: number): void;
}): Promise<{ failed: string[] }>;
```

## Three.js Techniques

- **KTX2 textures** (`KTX2Loader`, ETC1S/UASTC): GPU-compressed, ~1/6 of RGBA memory; mipmaps from the pipeline;
  `colorSpace` sRGB for colour maps, linear for the ocean mask and ring opacity. Anisotropy 4 for the planets.
- **Shader patches** via `onBeforeCompile` on `MeshStandardMaterial` (keeps three's lighting): the image fade
  (`map_fragment`), Earth's night factor (`emissivemap_fragment`), Saturn's ring shadow (after `lights_fragment_end`).
  `customProgramCacheKey` per patch so programs are shared, not duplicated.
- **Rings:** `RingGeometry(1.279, 2.349, 128, 1)` with UVs remapped to radius; `ShaderMaterial` (own simple lighting:
  sunlit-face term + planet shadow), `side: DoubleSide`, `transparent`, `depthWrite: false`.
- **Stars at infinity:** `Points` + `ShaderMaterial`, `xyww` depth, `depthWrite: false`, `renderOrder` −1,
  `frustumCulled: false`. One draw call.
- **Glow:** `Sprite` + `SpriteMaterial` (`AdditiveBlending`, `depthWrite: false`), a generated 128² `DataTexture`
  falloff (T042: no canvas needed, testable in jsdom).
- **Draw calls:** +1 stars, +1 glow, +1 clouds, +1 rings ≈ +4 over 021; textures uploaded once.
- **Precision:** ring and shadow maths in Saturn's local frame; stars use direction only; the glow's size from
  double-precision CPU distances.

## Test Approach

| AC    | Test file                                                                                                                                                                                                                                                      | Type       |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| AC-1  | `data.test.ts` (every body has imagery + a `SOURCES` entry, files exist, `CREDITS.md` lines); `imagery.test.ts` (attach per body); E2E close views not uniform                                                                                                 | unit + e2e |
| AC-2  | `surfaces.test.ts`: map u ↔ longitude; Earth sub-solar longitude vs UTC + equation of time ≤ 5°; Moon sub-Earth point ≤ 10°; E2E texture turns (day speed)                                                                                                     | unit + e2e |
| AC-3  | E2E: 020's sunward-brighter check with imagery; night side above background                                                                                                                                                                                    | e2e        |
| AC-4  | `materials.test.ts` (cloud layer child, radius, alpha map, depthWrite); E2E day side differs from the surface layer alone                                                                                                                                      | unit + e2e |
| AC-5  | `materials.test.ts` (night factor function mirrored in TS); E2E night-side lights brighter over land than ocean; day side unchanged                                                                                                                            | unit + e2e |
| AC-6  | `materials.test.ts` (roughness from ocean mask); E2E ocean near the sub-solar point brighter than with shine off                                                                                                                                               | unit + e2e |
| AC-7  | `rings.test.ts` (radii, plane = Saturn's pole, child of Saturn, stylised scaling); `scale.test.ts` (Titan clears the rings; ≥ 3 px; no overlap at 200 dates)                                                                                                   | unit + e2e |
| AC-8  | `ring-shadows.test.ts` (both shadow tests on constructed geometry); E2E at 2032 (rings open): darker pixels where predicted                                                                                                                                    | unit + e2e |
| AC-9  | `stars.test.ts` (decode; Sirius, Betelgeuse, Polaris ≤ 0.5°; frame); E2E pan/zoom leave star pixels in place, rotate moves them; bodies over stars                                                                                                             | unit + e2e |
| AC-10 | `glow.test.ts` (size rule, no raycast); E2E halo pixels around the Sun at both scales; a body in front unchanged                                                                                                                                               | unit + e2e |
| AC-11 | `imagery.test.ts` (progress sums bytes, fade by delta, instant under reduced motion, failure keeps colour, abort disposes late arrivals); `space-manager.test.ts` (background progress bound to the view); E2E slow (`page.route` delay) + failing (404) image | unit + e2e |
| AC-12 | E2E: 10 round trips (one while loading) back to baseline incl. textures; context loss → textured again, same time state                                                                                                                                        | e2e        |
| AC-13 | `npm run build` bundle check (Space cap, entry), pipeline byte caps; manual FPS note                                                                                                                                                                           | build      |

## Risks & Mitigations

- **Budget vs the transcoder (spec impact).** The Basis transcoder (0.57 MB, already shipped for the chair) is
  counted in each Space's total by the bundle check. 3 MB of imagery + 0.57 MB + code ≈ 3.6 MB, over AC-13's
  3.5 MB. _Resolved (D-030):_ AC-13 now allows the Space ≤ **4 MB** including the shared decoder; imagery stays ≤ 3 MB.
- **Imagery sizes.** ETC1S 2K maps run ~150–300 KB; 8 planets + 11 1K maps may exceed 3 MB. _Mitigation:_ a
  first-task spike encodes four real maps and extrapolates; Uranus and Neptune (near featureless) can drop to 1K.
- **Sources.** Good public-domain maps exist for Mercury, Earth (Blue Marble, Black Marble, clouds, water mask),
  the Moon (LRO), Mars, Jupiter (Cassini), the Galileans, Titan and Triton (USGS); the Sun, Venus's cloud tops,
  Saturn, Uranus, Neptune and the ring profile likely need CC-BY (e.g. Solar System Scope). Triton's map has gaps
  (Voyager 2 saw one hemisphere). NSSDC was unreachable in 020. _Mitigation:_ a source survey task with the lead's
  review before any encoding, as in 020/021.
- **Repository size.** Source maps at shipping resolution (JPEG q95) are ~10 MB in `assets-src/`, committed so
  they can be reviewed and rebuilt offline (D-030).
- **Stylised retune.** Counting Saturn's rings in its extent grows the system; small bodies may drop under 3 px at
  the home view. _Mitigation:_ 020's unit test plus a 320 × 640 screenshot; retune `STYLISED` if needed.
- **Camera near the rings at real scale.** The closest zoom (1.2 Saturn radii) is inside the ring's radius. The
  near plane (021) will count the ring as a 2.349-radius body so it isn't clipped.
- **Shader patches and three upgrades.** `onBeforeCompile` depends on chunk names. _Mitigation:_ unit tests assert
  each patch found its anchor (fail loudly), and E2E pixel checks cover the result.
- **Sub-solar accuracy (AC-2).** NAIF's Earth `W` is tied to UT1; UTC is within 0.9 s, negligible. Map conventions
  vary; the unit test reads the recorded convention.
- **Failing-image E2E.** The browser logs a 404 as a console error; the test lists it in `allowConsoleErrors`.

## Constitution Check

| Principle                 | Status | Notes                                                                                                                |
| ------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------- |
| I. Spec before code       | ✅     | Spec approved (D-029); AC-13 amended before tasks (D-030).                                                           |
| II. Browser-only          | ✅     | Static assets on our own host; no runtime third-party calls.                                                         |
| III. Self-contained Space | ✅     | All in `src/spaces/solar-system/`; the KTX2 setup moves to `src/shared/`; one additive core seam.                    |
| IV. Performance budgets   | ✅     | Imagery ≤ 3 MB; Space total ≤ 4 MB with the decoder (D-030; 5 MB cap holds); entry ≤ 5 KB; +4 draw calls.            |
| V. Accessible & resilient | ✅     | No new controls; background progress announced at quarters; failures fall back to colours; reduced motion = no fade. |
| VI. Test-gated            | ✅     | Pure maths (shadows, stars, longitudes, night factor) unit-tested first; E2E pixel checks per AC.                    |
| VII. Data-driven          | ✅     | Imagery, layers, ring radii and the catalogue are data with sources.                                                 |
| VIII. Small dependencies  | ✅     | None added: `KTX2Loader` is three's; sharp and the Basis encoder are existing dev dependencies.                      |
| IX. Licensed assets       | ✅     | Public domain first, CC-BY with attribution otherwise; no share-alike (e.g. HYG is CC BY-SA: excluded).              |
| X. Memory maintained      | ✅     | D-029 recorded; decisions and learnings as they arise.                                                               |
