# 020 — Solar System Data Model & Scale Modes · Implementation Plan

**Spec:** `./spec.md` · **Status:** Approved (2026-10-05) <!-- Draft | Approved -->

## Approach

A new multi-object Space, `src/spaces/solar-system/`, built from three layers so the hard parts are pure and
unit-tested:

1. **Data (`data.ts`):** 16 bodies (Sun, 8 planets, 7 moons) as typed records with sourced real values (km,
   days, hours, degrees, km³/s²), each body's parent, colour and a fixed display angle (Q1). Planets carry J2000
   orbital elements for 021 (Q4). A `SOURCES` block names each source and the date it was read (AC-4).
2. **Layout (`scale.ts`, pure):** `layout(bodies, mode)` returns, per body, its distance from its parent and its
   display radius, in scene units. Two modes:
   - **Real (AC-6):** one linear scale, 1 unit = 10⁶ km, for every size and distance.
   - **Stylised (AC-5):** see "Stylised mapping" below.

   `placeBodies(layout, bodies)` turns distances and display angles into positions in the ecliptic (XZ) plane.
   Inclinations are ignored until 021 adds orbits.

3. **Space (`index.ts`):** a scene graph that 021 can animate. A scale switch only moves groups and rescales
   meshes. Also the shared camera controls, the scale toggle, real-scale markers, and a dynamic near/far plane.

**Scene graph (architecture's pivot pattern):** `system` → Sun mesh; for each planet an **orbit group** placed at
the planet's position, holding the planet **mesh** (scaled to its radius) and, for each moon, a **moon group**
(offset from the planet) holding the moon mesh. Moons are children of the planet's group, not of its scaled mesh,
so they don't inherit its scale. 021 rotates these groups. Every body is its own `Mesh` sharing **one**
`SphereGeometry`. Instancing would put real-scale positions (up to ~4 500 units) into float32 instance matrices
and jitter. With separate meshes, three builds each `modelViewMatrix` in float64 in JS, so vertices stay
precise near the camera.

**Stylised mapping (Constitution VII; constants in `data.ts`, checked by unit tests).** Measured with a
throwaway script while planning:

- **Radius:** `r' = (r / R⊕)^0.25` in units (Earth = 1, Jupiter ≈ 1.82, Mercury ≈ 0.79). The Sun is capped at 3
  units, still the largest.
- **Moons, by order (not true distance):** moon _i_ circles its planet at
  `prev edge + moonGap (0.25) + r'(moon)`, where "prev edge" is the planet's or the previous moon's outer edge.
  A planet's **extent** is its outermost moon's edge, or its own radius if it has no moons.
- **Planets, packed rings with a hint of true spacing:**
  `d₁ = sunR + gap + ext₁`, then `dᵢ = dᵢ₋₁ + extᵢ₋₁ + gap + extᵢ + 1.5 · ln(aᵢ / aᵢ₋₁)`, with gap = 0.6.
  - Each planet's ring (`d ± ext`) is disjoint from its neighbours' at **any** angle, so 021's motion can't make
    them collide.
  - Order is preserved, and wider true gaps stay wider (the log term).
- **Result (T013, measured with a perspective camera at the real home pose):** the system extent is
  S ≈ 57 units, and the smallest body on screen (Europa, the farthest small moon from the camera) is
  ≈ **3.3 px** in radius at 1280 × 720 and ≈ **1.6 px** at 320 × 640. The planning sketch (exponent 0.3, log
  term 2) gave only 2.99 px once perspective was counted, so T013 tuned the constants.
  - _For review:_ "visible as a distinct sphere" (AC-5) is tested as **≥ 3 px radius at 1280 × 720** and
    **≥ 1 px at 320 × 640** (a dot; phone users zoom in).

**Scale switch (AC-7, AC-8):**

- **Control:** a `<button class="scale-toggle" aria-pressed>` named "True scale" (pressed = real).
- **Announcement:** a visually hidden polite element holds the scale's description, e.g. "Stylised scale: sizes
  and distances compressed so every body is visible". It is also the canvas's `aria-describedby`, so the 3D
  view's description always includes the scale (NFR).
- **Saving the choice:** `writePreference('world.solarSystem.scale', 'stylised' | 'real')`. On open,
  `readPreference(…, 'stylised')`.
- **Applying a switch:** re-layout (positions and `mesh.scale` only, no new geometry), then
  `controls.setHome(homeFor(mode))` and `controls.reset()`. It's instant either way, so reduced motion needs
  nothing extra.
- **Home view:** frames the whole system (S, or Neptune's orbit plus Triton at real scale) with
  `frameDistance()` from `shared/model-viewer/framing.ts`, from above at ~35° (sunlit hemispheres visible).
- **Limits by scale:**
  - distance from 1.2 × the radius of the body orbited (the Sun at home; a re-centre passes the body's own via
    `focusOn(point, { minDistance })`, T025) to `frameDistance(S, …, 0.1)`. The first draft's "3 × the smallest
    body radius" let the camera into Earth and the Sun;
  - pan limit S.

**Finding bodies at real scale (AC-8a):** `markers.ts` puts one `<span class="body-marker">` per body (Sun
included: at real scale it's sub-pixel too) in a `.body-markers` layer (`pointer-events: none`, `aria-hidden`:
labels only, the scale description speaks for them).

- **Per frame:** project with `toScreen()` (reused from `shared/hotspots/projection.ts`), then write only what
  changed (as 012 does).
- **Moon markers:** shown only when ≥ 24 px from their planet's marker.
- **Stylised scale:** the layer is hidden.

**Zooming in reveals them (D-023, after the T001 spike):** OrbitControls' `zoomToCursor` can't reach a body
far from the orbit target: it stalls at the target's depth (learnings). Instead, at real scale, a zoom that
**starts on a body** re-centres the orbit on it, then zooms normally:

- **Wheel:** a `wheel` listener on the canvas in the **capture** phase, so it runs before OrbitControls'. Pinch:
  on the second touch's `pointerdown`, the two fingers' midpoint. If that point is within 24 px of a body's
  projected centre (`markers.nearest(x, y, 24)`, nearest wins), call `controls.focusOn(bodyWorldPosition)`.
- **`focusOn(point)`** is a new additive controls method. It moves the orbit target to `point` and keeps the
  camera where it is, so the view turns to centre the body. It's instant, which reduced motion needs anyway.
  `reset()` returns home; any target change counts as an interaction.
- **Zoom speed:** an additive `zoomSpeed` config value (OrbitControls' `zoomSpeed`), 4 for this Space. Whole
  system to Earth at 3 px is a ~5 000x zoom: about 170 wheel notches at the default speed, about 40 at 4.
  Trackpads deliver many small deltas, so they feel faster.
- **In the spike:** Earth reached 3 px after 58 steps of 3 notches at speed 1, and rendering zoomed in was clean.

**Depth and precision (NFR):** real-scale distances span ~10⁵. In `update()`, after the controls:

- **Near plane:** half the distance from the camera to the nearest body surface, clamped to `[1e-6, 1]` units.
- **Far plane:** camera-to-Sun distance + 2 S.
- `updateProjectionMatrix()` runs only when either plane changes by > 10 %.

Bodies are convex and far apart, so a large far/near ratio doesn't z-fight. The shared renderer stays as it is
(no logarithmic depth buffer, which would affect every Space).

**Lighting (AC-10):** the Sun is a `MeshBasicMaterial` sphere (self-lit) with a `PointLight` at its centre
(`decay: 0`, so outer planets aren't black at real scale), plus a faint `AmbientLight` (0.03) so night sides
aren't pure black. Planets and moons use `MeshStandardMaterial({ color, roughness: 1, metalness: 0 })`.

**Registry and gallery:** `{ id: 'solar-system', title: 'Solar System', kind: 'multi', description: 'The Sun,
the eight planets and their largest moons, at a readable scale or true to scale.' }`. The info panel (012)
comes free.

**Test seam:** `SpaceInstance.bodies?()` returns `{ id, world, radius }[]` in scene units. `__WORLD__.bodies()`
exposes it, so E2E can check positions, sizes, markers and lighting against the real camera (as 012 does with
`hotspots()`).

## Files

| File                                       | Change | Purpose                                                                                          |
| ------------------------------------------ | ------ | ------------------------------------------------------------------------------------------------ |
| `src/spaces/solar-system/data.ts`          | new    | `BODIES`, `SOURCES`, `STYLISED` constants, `SOLAR_SYSTEM` view config (camera, turntable, light) |
| `src/spaces/solar-system/types.ts`         | new    | `BodyData`, `OrbitalElements`, `ScaleMode`, `BodyLayout`                                         |
| `src/spaces/solar-system/scale.ts`         | new    | pure `layout()`, `placeBodies()`, `systemExtent()`                                               |
| `src/spaces/solar-system/scene.ts`         | new    | `buildSystem()`: groups + meshes from data; `applyLayout()`; `dispose`                           |
| `src/spaces/solar-system/markers.ts`       | new    | `createBodyMarkers()`: real-scale name labels, moon rule, write-on-change                        |
| `src/spaces/solar-system/scale-toggle.ts`  | new    | `createScaleToggle()`: button + polite description, `aria-describedby` on the canvas             |
| `src/spaces/solar-system/index.ts`         | new    | the `SpaceFactory`: scene, light, controls, toggle, markers, near/far, `bodies()` seam           |
| `src/spaces/registry.ts`                   | modify | `solar-system` entry (lazy)                                                                      |
| `src/shared/controls/index.ts`, `types.ts` | modify | additive `focusOn(point)` method and `zoomSpeed?` config (D-023)                                 |
| `src/core/types.ts`, `src/core/debug.ts`   | modify | `SpaceInstance.bodies?()`; `__WORLD__.bodies()`                                                  |
| `src/styles/main.css`                      | modify | `.scale-toggle`, `.body-markers`, `.body-marker`                                                 |
| `specs/architecture.md`                    | modify | Solar System section replaces "planned"; seams; Tab order                                        |
| `tests/unit/spaces/solar-system/*.test.ts` | new    | data, scale, scene, markers, toggle, factory                                                     |
| `tests/unit/shared/controls/*.test.ts`     | modify | `focusOn` (target moves, camera stays, reset returns home); `zoomSpeed` passed through           |
| `tests/unit/core/debug.test.ts`            | modify | `bodies()` hook                                                                                  |
| `tests/unit/spaces/registry.test.ts`       | modify | the new entry                                                                                    |
| `tests/e2e/solar-system.spec.ts`           | new    | AC-5, AC-7–AC-12                                                                                 |
| `public/assets/CREDITS.md`                 | modify | a "data sources" line (NASA/JPL, public domain): no asset files, but it records provenance       |

## Data Structures & Interfaces

```ts
// src/spaces/solar-system/types.ts
export type ScaleMode = 'stylised' | 'real';

export interface OrbitalElements {
  semiMajorAxisKm: number;
  periodDays: number; // sidereal
  eccentricity: number;
  inclinationDeg: number; // planets: to the ecliptic; moons: as their source gives it
  ascendingNodeDeg?: number; // planets (J2000); moons where the source gives it
  perihelionLongitudeDeg?: number; // planets (J2000)
  meanLongitudeDeg?: number; // planets, at the epoch
  epoch?: 'J2000';
}

export interface BodyData {
  id: string; // kebab-case, unique
  name: string;
  kind: 'star' | 'planet' | 'moon';
  parent: string | null; // null only for the Sun
  radiusKm: number; // mean
  gmKm3s2: number; // standard gravitational parameter, for the Kepler check (AC-3)
  rotationHours: number; // sidereal, negative = retrograde
  axialTiltDeg: number;
  orbit: OrbitalElements | null; // null only for the Sun
  colour: number; // representative, until 022's textures
  displayAngleDeg: number; // fixed angle on its orbit until 021 (Q1)
}

/** Per body, in scene units: distance from its parent's centre, and display radius. */
export interface BodyLayout {
  distance: number;
  radius: number;
}

// scale.ts
export function layout(bodies: readonly BodyData[], mode: ScaleMode): Map<string, BodyLayout>;
export function placeBodies(
  bodies: readonly BodyData[],
  layout: Map<string, BodyLayout>,
): Map<string, [number, number, number]>; // offset from the parent
export function systemExtent(bodies: readonly BodyData[], layout: Map<string, BodyLayout>): number;

// core/types.ts (additive test seam)
interface SpaceInstance {
  bodies?(): Array<{ id: string; world: [number, number, number]; radius: number }>;
}

// shared/controls/types.ts (additive, D-023)
interface CameraControlsConfig {
  zoomSpeed?: number; // OrbitControls' zoomSpeed (default 1)
}
interface CameraControls {
  /** Moves the orbit target to `point`, keeping the camera in place (the view turns to it). Instant. */
  focusOn(point: Vec3): void;
}

// markers.ts
interface BodyMarkers {
  /** The body whose projected centre is nearest (x, y) within `radius` CSS px, or null. */
  nearest(x: number, y: number, radius: number): string | null;
}
```

## Three.js Techniques

- **One `SphereGeometry(1, 48, 24)`**, scaled per mesh: 16 draw calls, ~36 k triangles in all. Per-body
  materials (16), all freed by `disposeObject3D(scene)`. The shared geometry is disposed once (its existing
  shared-resource handling).
- **Float precision:** separate meshes, not instancing (see Approach).
- **Dynamic near/far:** see Approach.
- **`PointLight(…, decay 0)`** at the Sun. No shadows: the Sun is the light source and the bodies are far
  apart, so shadows would cost much for little.
- **Entry size:** `PointLight`, `SphereGeometry` and `AmbientLight` join the shared `three` chunk (D-010
  pattern); T001 measures the growth against the 3 KB cap (Q6).

## Test Approach

| AC    | Test                                                                                                                                                                                                                                                                                                          | Type          |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| AC-1  | `data.test.ts`: 16 bodies; ids unique and kebab-case; the Sun has no parent; planets in order; the 7 moons with the right parents; colours set                                                                                                                                                                | unit          |
| AC-2  | `data.test.ts`: every field present with units in its name; planets have the full J2000 set; the Sun has no orbit                                                                                                                                                                                             | unit          |
| AC-3  | `data.test.ts`: values positive; planets ordered by distance; each moon's orbit < half its planet's distance to the next planet; `T = 2π√(a³/GM_parent)` within 5 % for every orbit                                                                                                                           | unit          |
| AC-4  | `data.test.ts`: `SOURCES` lists a name, URL, licence and date read for each field group; review of the numbers in T010                                                                                                                                                                                        | unit + review |
| AC-5  | `scale.test.ts`: order kept, bigger stays bigger (every pair), rings disjoint (Sun, planets, moons), moons outside their planet, smallest radius ≥ 3 px at 1280 × 720 by `frameDistance`. E2E: each body's projected radius ≥ 3 px (1280 × 720) / ≥ 1 px (320 × 640) and a non-background pixel at its centre | unit + e2e    |
| AC-6  | `scale.test.ts`: real layout ratios (radii and distances) equal the data's within 0.1 %; one unit = 10⁶ km                                                                                                                                                                                                    | unit          |
| AC-7  | `scale-toggle.test.ts` (name, `aria-pressed`, polite description, `aria-describedby`, focus kept, dispose). E2E: mouse, touch, Enter/Space; stylised first; reload → remembered; fresh context → stylised                                                                                                     | unit + e2e    |
| AC-8  | `scene.test.ts`: `applyLayout` moves groups and scales meshes with no new geometry. E2E: after each switch every body projects inside the canvas and the farthest fills 50–90 % of the smaller half-dimension; with reduced motion within one frame                                                           | unit + e2e    |
| AC-8a | `markers.test.ts` (projection placement, moon ≥ 24 px rule, hidden in stylised, write-on-change, dispose). E2E: at real scale markers within 4 px of bodies projected in Node; none in stylised; wheel-zooming on Earth's marker → Earth ≥ 3 px and the Moon's marker appears                                 | unit + e2e    |
| AC-9  | `registry.test.ts`. E2E: the card opens the Space; info panel region "Solar System"; `canvasCoverage` > 0; no console errors                                                                                                                                                                                  | unit + e2e    |
| AC-10 | E2E: at the stylised home view, for Jupiter and Earth the pixel half a radius towards the Sun is brighter than the one half a radius away (projected from `bodies()` and the camera)                                                                                                                          | e2e           |
| AC-11 | E2E (normal motion): `bodies()` identical after 1 s while the turntable turns the camera                                                                                                                                                                                                                      | e2e           |
| AC-12 | E2E: 10 gallery ↔ solar-system round trips → `#app` count (minus `.loading-announcer`) and `memory()` back to the baseline; at real scale lose → restore → still real (`aria-pressed`, body radii)                                                                                                            | e2e           |
| AC-13 | Bundle check: entry ≤ 146.0 + 3 KB; Space ≪ 5 MB. FPS: a manual note in T091 (SwiftShader FPS isn't meaningful, learnings)                                                                                                                                                                                    | build         |

## Risks & Mitigations

- **Real-scale navigation.** The T001 spike showed `zoomToCursor` can't reach a body. _Mitigation (D-023):_
  re-centre on the body a zoom starts on, plus `zoomSpeed` 4. Re-centring is instant and turns the view
  (jumpy if the pointer was far from the screen centre). An eased re-centre is possible later (023 adds
  flying).
- **Pinch re-centring** depends on reading the second touch before OrbitControls starts its dolly.
  _Mitigation:_ unit test with pointer events; E2E with `touchGesture()` (CDP touch).
- **Depth/precision artefacts at real scale.** _Mitigation:_ dynamic near/far, separate meshes. The T001 spike
  also screenshots Earth and the Moon zoomed in at real scale.
- **Data errors** (transcription). _Mitigation:_ the Kepler check catches most mistakes in `a`, `T` or GM
  (within 5 %). Values are transcribed from the named NASA/JPL pages (read at dev time; nothing fetched at
  runtime) and reviewed in T010.
- **Stylised visibility on phones** is ~1.6 px for the smallest moons. _Mitigation:_ stated test thresholds
  (see Approach) for review; phones can zoom.
- **Entry growth** from new three core classes. _Mitigation:_ T001 measures; the cap is fixed (Q6).
- **Overlay crowding at 320 px** (toggle, controls row, info sheet). _Mitigation:_ the toggle sits on the
  controls row, bottom-left (this Space has no model credit). Screenshots at 320 × 640 and 375 × 667 (learnings
  rule).

## Constitution Check

| Principle                 | Status | Notes                                                                                                   |
| ------------------------- | ------ | ------------------------------------------------------------------------------------------------------- |
| I. Spec before code       | ✅     | Spec Approved 2026-10-05 (D-022)                                                                        |
| II. Browser-only          | ✅     | Data is bundled; `localStorage` only for the scale preference                                           |
| III. Self-contained Space | ✅     | `src/spaces/solar-system/`; reuses `shared/` (controls, framing, projection, dispose); lazy; disposed   |
| IV. Performance budgets   | ✅     | 16 draw calls, ~36 k triangles; no textures; entry ≤ 3 KB (T001)                                        |
| V. Accessible & resilient | ✅     | Toggle with state + polite description; scale in the 3D view's description; context-loss restore tested |
| VI. Test-gated            | ✅     | Pure `layout()` and data checks test-first; E2E projects independently                                  |
| VII. Data-driven          | ✅     | Bodies, sources and stylised constants in `data.ts`; scale choices stated in spec and plan              |
| VIII. Small dependencies  | ✅     | None added                                                                                              |
| IX. Licensed assets       | ✅     | No assets; NASA/JPL data (public domain) credited                                                       |
| X. Memory maintained      | ✅     | D-022 recorded; learnings as found                                                                      |
