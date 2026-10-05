# 021 — Orbital Mechanics & Time Controls · Implementation Plan

**Spec:** `./spec.md` · **Status:** Approved (2026-10-05) <!-- Draft | Approved -->

## Approach

021 animates 020's Solar System from a **simulated date**. Everything that moves is a pure function of that
date, so the same date always gives the same scene (AC-5) and the maths is unit-tested without WebGL against JPL
reference positions (AC-1, AC-3). The Space only wires the date to the scene, the controls and the UI.

**1. Simulated time (`time.ts`, pure).** State: `days` since J2000 (TDB, treated as UTC: 64 s apart, negligible),
`speed` (days per real second, signed), `playing`.

- `advance(delta)` adds `speed · delta` while playing, clamped to **1800-01-01 … 2050-12-31** (Q7). At a limit it
  stops there, pauses and reports `limit: 'start' | 'end'` once.
- **Speeds (Q2):** 1 day/s, 1 week/s, 1 month/s (30.436875 d), 1 year/s (365.25 d); forward or backward. The
  default is 1 week/s forward, playing, or paused under reduced motion (AC-9).
- **Display:** `formatDate(days)` gives "12 Mar 2031" in UTC: a pure conversion, no clock read.

**2. Start date and restore (core seams, additive).**

- **Start date:** `SpaceManager` gains `wallClock?: () => number` (main passes `Date.now`; tests pass a constant)
  and puts the result in `SpaceContext.startTime` (ms) at each open (Q1: "today"). Space logic still never reads
  the clock.
- **Restore after a context loss:** `suspend()` asks the mounted instance for `saveState?.()`, and `resume()`
  passes it back as `SpaceContext.savedState`. A normal open gets none (Q8: a new visit starts fresh). The Solar
  System saves `{ time }` (date, speed, direction, play state; AC-12). Not `followId`: the camera returns home after
  a loss, so following would swing the view to a body the visitor no longer looks at (D-028).

**3. Orbit maths (`orbit.ts`, pure, double precision).**

- **Planets:** JPL Table 1 elements with their **per-century rates** (020 stored only the J2000 values; T010
  adds the rates from the same table). `T = days / 36525`, each element `= value + rate · T`, then
  `M = L − ϖ` and `ω = ϖ − Ω`. Solve Kepler's equation `E − e sin E = M` by Newton (≤ 6 iterations, 1e-12).
  Rotate the orbital-plane position by ω, I and Ω into **heliocentric ecliptic J2000** coordinates, in km.
- **Moons (D-026):** JPL mean elements, with three corrections measured against Horizons in T013:
  - the **mean-longitude rate** is the moon's NAIF synchronous spin rate `|Ẇ|` (its true mean motion); the
    table's `P` drifts the Galileans up to 175° over the range;
  - the argument of periapsis advances at 360°/Papsis; the node turns at 360°/Pnode, **regressing for prograde
    orbits and advancing for retrograde ones** (Triton); the argument of latitude advances at `n ∓ Ω̇` (mean longitude Ω ± (ω + M), by the sign of
    cos i);
  - **Titan's epoch mean anomaly** is 213.3° (fitted to Horizons' J2000 vector; the table's 11.7° is ~150° out).

  The Moon's plane is the ecliptic. For the others, the source plane is the planet's Laplace plane,
  approximated by the planet's **equator** from its pole, with the node measured from the equator's ascending
  node on the J2000 equator (the table's convention). Measured worst errors: Moon 1.4°, Galileans 2.1°, Titan
  5.2°, Triton 25.1° (AC-3 allows Triton 30°); planets 0.17°. The result is planetocentric ecliptic km.

- **Spin (AC-4):** the pole (RA, Dec) and prime meridian `W = W0 + Ẇ · d` come from NAIF's PCK (`pck00011.tpc`,
  public domain), converted from J2000 equatorial to ecliptic. Orientation = pole axis + rotation W about it, so
  Venus and Uranus turn backwards because their poles point "down" (IAU).
  - The big moons' NAIF rotation is synchronous, so they keep one face to their planet. For an exact "same face
    at any speed", the plan computes their facing from the planet direction instead of W.
- **Fast spin (Q6):** if `|speed| · 24 / rotationHours > 1` turn per second, the body shows `W = W0` (a fixed
  reference orientation) instead of `W(d)`. That's deterministic: same date and speed, same scene. Uniform
  colours make it invisible today; 022's textures will show it.
- **Frames:** scene x = ecliptic X, scene y = ecliptic Z, scene z = −ecliptic Y (020's XZ convention).

**4. Placing bodies per scale (`scale.ts`).**

- **Real:** position = orbit maths ÷ `REAL_UNIT_KM`.
- **Stylised (Q3):** each body stays on its 020 ring (same radii and distances), at the **angle** of its true
  position projected on its parent's XZ plane. Rings stay disjoint at every date (020 AC-5 holds), and the
  angles are true.
- `scene.applyPositions()` sets each orbit group's position and `applyOrientations()` each mesh's quaternion.
  Both run per frame only while the date changes, with no allocation (preallocated vectors and quaternions).

**5. Orbit lines (`orbit-lines.ts`, AC-11, Q5).** One `LineLoop` per orbit (8 planets + 7 moons), 256 points,
`LineBasicMaterial({ transparent, opacity ≈ 0.25, depthWrite: false })`.

- **Two prebuilt sets, toggled by visibility on a scale switch:** real ellipses (from the elements at the current
  date) and stylised circles (the rings). No geometry is created on a switch (020 NFR).
- Moon lines hang off their planet's orbit group, so they move with it.
- Real-scale ellipses are rebuilt in place when the date has moved more than 10 years from the last build (the
  planets' elements drift slowly); a moon's after 1 % of its fastest precession period (the Moon: ~22 days),
  D-027.
- WebGL lines take no pointer events.

**6. Following a body (Q4, AC-10).** After a re-centre on body _b_ (D-023), the Space remembers `followId = b`.
Each frame, before `controls.update()`, it moves the camera and target by _b_'s displacement (new controls
method `follow(delta)`: no interaction, no `userMoved`, the turntable keeps its state).

- **Stopping:** if the target is no longer where following last put it (the visitor panned, reset or re-centred
  elsewhere), following stops.
- **Stylised scale:** re-centring and following only happen at real scale (as D-023).

**7. Time controls UI (`time-controls.ts`, AC-6–AC-9).** A group `role="group" aria-label="Time"`:

- **The date:** a `<time datetime>` element, visible text, not live (AC-7).
- **Play/Pause:** a button named "Pause time" / "Play time".
- **Speed:** a native `<select aria-label="Speed">` with the four speeds.
- **Direction:** a "Backwards" toggle with `aria-pressed`.
- **Announcements:** a visually hidden polite region announces play/pause and direction changes (the select
  announces itself) and the range limit ("Reached 2050, the end of the supported dates").
- **Focus** stays on the control used.
- **Tab order:** info toggle → "True scale" → time controls → "?" → "Reset view".
- **Layout:** wide screens: bottom-left, beside "True scale", with the date above. Narrow (≤ 640 px): a second row
  above the bottom row, and the info sheet lifted above it (as `.overlay:has(.model-credit)` does). Screenshots
  at 320 and 375 px in the tasks.

**8. Per-frame order (`index.ts`):**

1. `time.advance(delta)`;
2. if the date changed: positions and orientations, then follow;
3. `controls.update(delta)`;
4. follow check;
5. near/far;
6. `camera.updateMatrixWorld()`;
7. markers;
8. UI date text (written only when the shown day changes).

Markers now change every frame while time runs: still one batched write.

**9. Test seams.** `SpaceInstance.simTime?(): { days, speed, playing }` and `setSimTime?(days)`, exposed as
`__WORLD__.simTime()` / `__WORLD__.setSimTime(days)` (stripped from production). E2E reads the date and jumps to
dates (e.g. near 2050) without waiting.

**Reference data (AC-1, AC-3).** A dev-only script `scripts/fetch-reference-positions.mjs` asks the Horizons API
for heliocentric ecliptic J2000 vectors of the 8 planets, and planetocentric ones for the 7 moons, at
1800, 1850, 1900, 1950, 2000, 2025 and 2050-12-31. It writes `tests/fixtures/horizons-positions.json` (committed,
with the query and date read). Nothing is fetched at runtime or in CI.

## Files

| File                                                     | Change     | Purpose                                                                                              |
| -------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------- |
| `src/core/types.ts`                                      | modify     | `SpaceContext.startTime`, `savedState?`; `SpaceInstance.saveState?()`, `simTime?()`, `setSimTime?()` |
| `src/core/space-manager.ts`                              | modify     | `wallClock` option → `startTime`; save state on `suspend()`, pass it on `resume()`                   |
| `src/main.ts`                                            | modify     | `wallClock: Date.now`                                                                                |
| `src/core/debug.ts`                                      | modify     | `__WORLD__.simTime()`, `setSimTime(days)`                                                            |
| `src/shared/controls/index.ts`, `types.ts`               | modify     | additive `follow(delta)`                                                                             |
| `src/spaces/solar-system/data.ts`, `types.ts`            | modify     | element rates (Table 1), poles and prime meridians (NAIF PCK), moon apsis/node periods, sources      |
| `src/spaces/solar-system/time.ts`                        | new        | simulated clock: speeds, direction, range, `formatDate()`                                            |
| `src/spaces/solar-system/orbit.ts`                       | new        | Kepler solve, planet/moon positions, spin orientation, ecliptic → scene                              |
| `src/spaces/solar-system/scale.ts`                       | modify     | per-date positions for both scales (stylised: rings at true angles)                                  |
| `src/spaces/solar-system/scene.ts`                       | modify     | `applyPositions()`, `applyOrientations()` (no allocation)                                            |
| `src/spaces/solar-system/orbit-lines.ts`                 | new        | real ellipses + stylised circles, toggled per scale                                                  |
| `src/spaces/solar-system/time-controls.ts`               | new        | date, play/pause, speed, direction, polite announcements                                             |
| `src/spaces/solar-system/index.ts`                       | modify     | wiring, per-frame order, follow, saved state, seams                                                  |
| `src/styles/main.css`                                    | modify     | `.time-controls` (wide and narrow layouts), info sheet lift                                          |
| `scripts/fetch-reference-positions.mjs`                  | new        | dev-only Horizons fetch for the reference table                                                      |
| `tests/fixtures/horizons-positions.json`                 | new        | JPL reference positions (AC-1, AC-3)                                                                 |
| `public/assets/CREDITS.md`                               | modify     | NAIF PCK + Horizons reference positions (public domain)                                              |
| `specs/architecture.md`                                  | modify     | simulated time, orbit maths, follow, saved state, seams                                              |
| `tests/unit/spaces/solar-system/*.test.ts`               | new/modify | time, orbit (vs fixture), scale per date, scene, orbit lines, time controls, Space                   |
| `tests/unit/core/space-manager.test.ts`, `debug.test.ts` | modify     | start time, saved state on resume only, hooks                                                        |
| `tests/unit/shared/controls/camera-controls.test.ts`     | modify     | `follow(delta)`                                                                                      |
| `tests/e2e/solar-system-time.spec.ts`                    | new        | AC-4, AC-6–AC-12                                                                                     |

## Data Structures & Interfaces

```ts
// solar-system/types.ts (additions)
interface ElementRates {
  // per Julian century, JPL Table 1
  semiMajorAxisKm: number;
  eccentricity: number;
  inclinationDeg: number;
  meanLongitudeDeg: number;
  perihelionLongitudeDeg: number;
  ascendingNodeDeg: number;
}
interface OrbitalElements {
  // …020 fields
  ratesPerCentury?: ElementRates; // planets
  apsisPeriodYears?: number; // moons (0 = none)
  nodePeriodYears?: number; // moons
}
interface Rotation {
  // NAIF PCK, J2000 equatorial, d = days since J2000
  poleRaDeg: [number, number]; // value, rate per century
  poleDecDeg: [number, number];
  primeMeridianDeg: [number, number]; // W0, Ẇ per day
}
interface BodyData {
  // …020 fields
  rotation: Rotation;
}

// time.ts
export const SPEEDS = { day: 1, week: 7, month: 30.436875, year: 365.25 } as const; // days per second
export interface SimTime {
  days: number;
  speed: keyof typeof SPEEDS;
  backwards: boolean;
  playing: boolean;
}
export function advance(t: SimTime, deltaSeconds: number): { time: SimTime; limit: 'start' | 'end' | null };
export function formatDate(days: number): string; // "12 Mar 2031", UTC

// orbit.ts
export function planetPosition(body: BodyData, days: number, out: Vector3Like): Vector3Like; // heliocentric ecliptic km
export function moonPosition(moon: BodyData, planet: BodyData, days: number, out: Vector3Like): Vector3Like; // planetocentric ecliptic km
export function orientation(
  body: BodyData,
  days: number,
  speedDaysPerSecond: number,
  out: QuaternionLike,
): QuaternionLike;

// core (additive)
interface SpaceContext {
  startTime: number;
  savedState?: unknown;
}
interface SpaceInstance {
  saveState?(): unknown;
  simTime?(): { days: number; speed: number; playing: boolean };
  setSimTime?(days: number): void;
}
interface CameraControls {
  follow(delta: { readonly x: number; readonly y: number; readonly z: number }): void; // reusable per frame
}
```

## Three.js Techniques

- **Per-frame updates without allocation:** preallocated `Vector3`/`Quaternion` per body; `group.position.set()`,
  `mesh.quaternion.copy()`. The Kepler solve is plain number maths (~15 bodies ≪ 1 ms).
- **Orbit lines:** `BufferGeometry` + `LineLoop` + `LineBasicMaterial`, 256 vertices each, 15 per scale (30 small
  geometries in all), in the shared dispose.
  - At real scale, planet orbit vertices are up to ~4 500 units from the Sun in float32 (~0.3 mm/unit
    precision). That's fine for faint lines; the bodies themselves stay precise (separate meshes, 020).
- **Depth:** 020's dynamic near/far is unchanged; lines don't take part in "nearest surface".
- **Entry size:** `LineLoop` and `LineBasicMaterial` may join the shared `three` chunk; T001 measures (≤ 5 KB, Q9).

## Test Approach

| AC    | Test                                                                                                                                                                                                                                                                                | Type       |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| AC-1  | `orbit.test.ts`: every planet at the 7 fixture dates: longitude and latitude within 1°, distance within 1 % of Horizons                                                                                                                                                             | unit       |
| AC-2  | `orbit.test.ts`: the orbit's focus is at the Sun and its shape matches e and I (sampled path vs elements); `scale.test.ts`: stylised positions lie on the 020 rings at the true angle, rings disjoint at 200 random dates                                                           | unit       |
| AC-3  | `orbit.test.ts`: each moon's planetocentric direction within 10° of Horizons at the fixture dates; Triton's angular motion is retrograde; periods match                                                                                                                             | unit       |
| AC-4  | `orbit.test.ts`: one sidereal period → one full turn; Venus/Uranus turn backwards; the moons' facing points at their planet; fast-spin rule (> 1 turn/s → W0). E2E: `simTime` + a body quaternion via `bodies()` changes with time (uniform spheres show no visible turn until 022) | unit + e2e |
| AC-5  | `time.test.ts` + `space.test.ts`: two runs reaching the same date by different delta sequences give identical `bodies()`; no change while paused                                                                                                                                    | unit       |
| AC-6  | `time-controls.test.ts` (names, `aria-pressed`, select, focus kept, polite announcements). E2E: mouse, touch, keyboard; date moves at the chosen speed and direction                                                                                                                | unit + e2e |
| AC-7  | E2E: the date text is visible, `<time datetime>`, not inside a live region; it advances while playing                                                                                                                                                                               | e2e        |
| AC-8  | `time.test.ts` (range clamp, limit report) + `space-manager.test.ts` (`startTime`). E2E: opens at the injected "today"; `setSimTime` near 2050 + play → pauses at the limit with the polite message                                                                                 | unit + e2e |
| AC-9  | E2E (reduced motion): paused at open; Play starts it                                                                                                                                                                                                                                | e2e        |
| AC-10 | `space.test.ts` (follow keeps the body centred; pan/reset stops it). E2E: markers within 4 px while time runs; re-centre on Earth + play → Earth stays centred                                                                                                                      | unit + e2e |
| AC-11 | `orbit-lines.test.ts` (15 loops per scale, shapes match the paths, toggled per scale, no new geometry on a switch). E2E: lines drawn (non-background pixels along Neptune's ring)                                                                                                   | unit + e2e |
| AC-12 | `space-manager.test.ts` (saved state only on resume). E2E: 10 round trips; lose → restore keeps date, speed and play state; a fresh visit starts at today, 1 week/s                                                                                                                 | unit + e2e |
| AC-13 | Bundle check ≤ 146.5 + 5 KB; a manual FPS note (log the renderer string, learnings)                                                                                                                                                                                                 | build      |

## Risks & Mitigations

- **Moon accuracy (AC-3, 10°).** The Laplace plane is approximated by the planet's equator; the Moon's mean
  elements ignore its large perturbations (evection ~1.3°, variation ~0.7°). _Mitigation:_ the fixture test at 7
  dates measures the real error. If a moon fails, report it with numbers before changing the approach (e.g.
  Triton's Laplace plane from its source).
- **Fast moons strobe at high speeds** (Io circles Jupiter ~200 times a second at 1 year/s). The spec accepts true
  positions. _Mitigation:_ none planned; flagged for review in the screenshots task.
- **Follow vs input conflicts** (zooming while following, keyboard orbit). _Mitigation:_ follow only translates
  camera and target together; any target change not made by following ends it. Unit tests cover pan, reset and
  re-centre.
- **Narrow layout** (time controls + "True scale" + "?" + "Reset view" + info sheet at 320 px). _Mitigation:_ a
  second row with the sheet lifted; screenshots (learnings rule).
- **Date formatting by locale:** `toLocaleDateString` differs between machines. _Mitigation:_ our own UTC
  formatter with English month abbreviations; `datetime` in ISO.
- **Data transcription** (rates, poles). _Mitigation:_ copied from the named sources, a review table shown to the
  lead (as 020 T011), and the reference-position test catches errors in rates and elements.

## Constitution Check

| Principle                 | Status | Notes                                                                                                           |
| ------------------------- | ------ | --------------------------------------------------------------------------------------------------------------- |
| I. Spec before code       | ✅     | Spec Approved 2026-10-05 (D-025)                                                                                |
| II. Browser-only          | ✅     | Reference data fetched at dev time only; nothing at runtime                                                     |
| III. Self-contained Space | ✅     | Space code in `src/spaces/solar-system/`; additive core seams (`startTime`, `savedState`) and controls `follow` |
| IV. Performance budgets   | ✅     | ≪ 1 ms of maths per frame, no allocation; entry ≤ 5 KB (T001)                                                   |
| V. Accessible & resilient | ✅     | Time controls with names/states/announcements; paused under reduced motion; state survives context loss         |
| VI. Test-gated            | ✅     | Time injected (`startTime`, `delta`); pure maths tested against JPL fixtures                                    |
| VII. Data-driven          | ✅     | Elements, rates, poles in `data.ts`; scale choices stated                                                       |
| VIII. Small dependencies  | ✅     | None added                                                                                                      |
| IX. Licensed assets       | ✅     | No assets; NAIF/JPL data public domain, credited                                                                |
| X. Memory maintained      | ✅     | D-025 recorded                                                                                                  |
