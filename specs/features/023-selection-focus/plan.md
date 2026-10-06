# 023 — Selection & Focus · Implementation Plan

**Spec:** `./spec.md` · **Status:** Approved <!-- Draft | Approved -->

## Approach

Selection is one piece of state in the Solar System Space: `selected: string | null`. Every way in (a click on
the canvas, a button in the body list, a context-loss restore) calls one `select(id, { instant })`, and every way
out (Escape, the card's Close, "Reset view", leaving) calls `deselect()`. Selecting:

1. marks the body (its label and its list button), announces "<Name> selected" politely, and fills the facts
   card in the info panel (opening the panel if it is collapsed, without changing the remembered preference);
2. asks the shared controls to **fly** to the body's end pose (`flyTo`, new and additive), holds the turntable;
3. makes the body the **followed** body (021's `following`), so the flight lands on a moving target and the view
   then stays on it.

Pieces, each small and mostly pure:

**1. Picking (AC-1, `picking.ts`, pure).** On `pointerdown` → `pointerup` of the same primary pointer that moved
≤ 5 CSS px with no second pointer down, the Space projects all bodies (the markers already do this each frame)
and calls `pick(points, x, y)`. Candidates are bodies whose projected centre is within `max(22 px, on-screen
radius)` of the pointer, plus any whose visible **name box** contains it (names stay `pointer-events: none`, so
drags are never blocked; the canvas handler hit-tests the boxes the declutter pass already computed). Rule: if the
pointer is inside one or more real discs, the one nearest the camera wins; otherwise the nearest centre wins.
Clicking nothing does nothing. No timestamps are read (Constitution VI): a click is defined by distance only.

**2. The fly (AC-4, AC-6, AC-7; `src/shared/controls/fly.ts`, pure, + `flyTo` in the controls).** Real scale
spans ~10⁸ in distance (whole system → the Moon at a third of the screen), so a linear move is useless: it
crawls, then teleports. The path uses **van Wijk & Nuij's smooth zoom-and-pan** ("Smooth and efficient zooming
and panning", 2003): the orbit target and the camera distance move together along the path that is optimal in
screen terms (zoom out a little, pan, zoom in), with distance interpolated logarithmically. The camera direction
turns along a great circle with 012's `turnStep`. Easing is smoothstep over the duration
`min(2 s, 0.6 s + 0.25 s · S)`, where `S` is the van Wijk path length (so short hops are quick and nothing
exceeds 2 s, Q3). Under reduced motion the end pose is applied in one step.

`flyTo` is a sibling of `turnTo`: advanced in `update(delta)`, cancelled by any visitor input or `reset()` (the
camera stays exactly where the last frame put it: no jump), sets `userMoved`, counts as an interaction. It also
takes `minDistance` (as `focusOn`) so the zoom limit lets the camera stay 1.2 radii from the body. **`follow(delta)`
during a fly also shifts the fly's start and goal by `delta`**, so the flight is computed in the moving body's
frame and lands on it however fast time runs.

**3. End pose (AC-4, `focus.ts`, pure).**

- **Distance:** the body's disc spans a third of the shorter side of the **clear area** (below). From the
  perspective camera: `d = r / sin(atan(tan(fovY/2) · (s/3) / H))`, where `s` is the clear area's shorter side and
  `H` the viewport height, in px.
- **Direction:** from the body towards the Sun, turned 40° about the vertical and raised 20°, so the visitor sees
  a mostly lit, three-quarter disc rather than a full "noon" disc or a crescent. Clamped to the controls' polar
  limits. The Sun itself keeps the current viewing direction.

**4. The clear area (AC-11).** The info panel covers the right side (wide screens) or the bottom 35 % (phones,
lifted to 180 px above the Solar System's bar). At 320 × 640 the screen centre is under the sheet. So while a body
is selected the Space shifts the projection centre with `camera.setViewOffset()` so the orbit target projects to
the centre of the area not covered by the panel. The offset eases with the fly (same fraction) and eases back to
zero over 0.3 s on deselect (instant under reduced motion). The panel's rectangle is read once per select, resize
and panel toggle (one layout read), never per frame. Markers, picking and the test hooks all project through
`camera.projectionMatrix`, so they stay correct without changes.

**5. Following (AC-5).** The existing 021 mechanism: `following = { id, point }`, moved each time step, checked
for a pan (target moved off the body) before each step. Selecting sets it; a pan ends it but keeps the selection
and its card (spec: "Panning ends the follow"). A real-scale wheel re-centre (D-023) still works and still switches
the follow to the body it lands on; it doesn't change the selection (re-centring is a zoom gesture, not a choice).

**6. Scale switch (AC-8).** `setScale` keeps `selected`. After re-layout it re-homes as today, then, if a body is
selected, jumps instantly to that body's end pose at the new scale and keeps following it (the scale switch is
already instant; a 2 s fly across scales would start from a meaningless pose).

**7. Facts (AC-9, AC-10, AC-13; `data.ts` + `facts.ts`).**

- **New data, per body, in `data.ts` (`FACTS`):** a one- or two-sentence `description`, `knownMoons` (planets;
  with the "as of" date of the count), and nothing else. A new `SOURCES` entry (NASA Science planet pages /
  NASA "Moons" counts, public domain) covers it.
- **Derived, not duplicated (AC-13):** diameter = 2 × `radiusKm`; mass = `gmKm3s2 / G` (G = 6.674 30 × 10⁻²⁰
  km³ kg⁻¹ s⁻², CODATA 2018); average distance = `orbit.semiMajorAxisKm` (from the Sun, or a moon's from its
  planet); year = `orbit.periodDays`; day = `rotationHours` (sidereal: one turn), "backwards" when the tilt is
  over 90°; tilt = `axialTiltDeg`. The Sun has no distance or year (it orbits nothing in the model): its card
  shows the facts that apply (see review point 1).
- **Formatting (`facts.ts`, pure):** fixed English (`Intl.NumberFormat('en')`, so tests don't depend on the
  browser's locale), metric only (Q6): "12,742 km (1.00 × Earth)" (comma-grouped), "5.97 × 10²⁴ kg (1.00 × Earth)",
  "149.6 million km", "23.9 hours" / "58.6 days", "365.3 days" / "11.9 years", "23.4°". Each returns a string;
  each is unit-tested.
- **Live distance (AC-10):** the card also shows "Now: 147.1 million km from the Sun" (a moon: "from Earth"),
  from the orbit maths in real km (not the scaled scene), re-formatted only when the time state changes and
  written only when the string changes. The element is not live (no announcements).

**8. The info panel seam (core, additive).** The core mounts the panel _after_ the factory (012), so the Space
can't reach it at build time. The panel gains a small slot, and the manager hands it to the Space:

- `createInfoPanel` returns `{ dispose, slot }`; `slot.content` is an empty element after the description in the
  panel's region; `slot.showDescription(show)` hides/shows the Space description (Q8: the facts replace it);
  `slot.open()` expands the panel without calling `onToggle` (so the remembered preference is untouched);
  `slot.onOpenChange(cb)` reports toggles (for the clear area).
- `SpaceInstance.attachInfo?(slot)` (optional): the manager calls it right after mounting the panel. Spaces
  without it are unaffected (demo-cube, chair).

**9. Body list and card (`body-panel.ts`, DOM).** Inside `slot.content`:

- **Card** (only while selected): `<section aria-labelledby>` with the name as `<h3>`, the description, a `<dl>`
  of facts, and a "Close" button (`aria-label="Close <Name>"`).
- **List:** a "Bodies" `<h3>` and a nested `<ul>`: the Sun, each planet, and under each planet its moons. Each is
  a `<button aria-pressed>`; choosing one = clicking the body (AC-2, AC-3).
- **Announcer:** a visually hidden `aria-live="polite"` element: "<Name> selected", "Selection cleared".
- **Focus (AC-12):** on close, focus returns to the opener: the list button, or the 3D view after a canvas click.
  The card's Close and Escape (on the overlay or the canvas, ignored while the "?" disclosure handles it) deselect.
- **Tab order:** back link → 3D view → info toggle → [card Close] → body buttons → "True scale" → time controls
  → "?" → "Reset view".

**10. Labels at both scales (AC-14, `markers.ts`).** The markers become active at both scales:

- **One rule at both scales (D-037, after T001):** a body drawn smaller than **3 px** in radius keeps 020's dot
  with its name 7 px from the centre (real scale's sub-pixel bodies: unchanged). From 3 px up there is no dot (the
  sphere is visible) and the name sits beside the disc, `on-screen radius + 4 px` from the centre. So a real-scale
  close-up no longer prints the marker on the body, and stylised bodies (≥ 3.3 px at home) get names beside them.
  It needs each body's radius in px (one more number per projection, read phase).
- Same rules: moons hidden within 24 px of their planet, declutter by size (D-024), names inside the view.
- **Selected body:** `.is-selected` on its marker, and it goes first in the declutter order, so its name always
  shows.
- `nearest()` becomes `hit(x, y)` → `pick()` over centres, discs and the shown name boxes. The layer stays
  `aria-hidden` (the list is the accessible way to select).

**10a. Real-scale orbit lines (D-037, revised by D-038 in T053).** 021 drew every orbit with 256 points and
rebuilt a real ellipse only at fixed intervals (D-027). Measured in T053, a body could sit 0.8–8 of its radii off its
own line on the build date (chord sag) and up to 13.6 before the next rebuild (element drift), so a close-up could
show its line crossing it. Planets' **real** lines get **4 096** points (sag < 1/8 radius), and any real line is
rebuilt in place on a new date once its body is more than **0.25 of its radius** from it (replaces D-027's
intervals). Moons' lines and every stylised line keep 256 points. ~0.1 ms per frame while time runs.
**Level of detail (D-040, after T091):** each planet's real line also has a 256-point far copy (every 16th fine
vertex). `setView(eye, pixelAngle)`, called every frame after the camera moves, draws the fine line only when the far
copy's worst chord sag, at the camera's distance from that copy, is ≥ 0.5 CSS px (`pixelAngle` = 2 tan(fov/2) / view
height); otherwise the far copy. Rebuilds rewrite both.

**11. "Reset view" (AC-12).** The controls gain `onReset?` (additive), called by the button, the `R` key and
`reset()`. The Space deselects on it. The scale switch's own `reset()` is excluded: it calls a private re-frame
that doesn't fire `onReset` (AC-8 keeps the selection).

**12. Lifecycle (AC-16).** `saveState()` adds `selected`. A rebuild after a context loss selects it with
`{ instant: true }` and follows it. All new listeners hang off the Space's `listeners` controller; the card, list
and announcer are removed on dispose; `setViewOffset` is cleared (it lives on the Space's own camera, which is
dropped anyway).

**13. Per-frame order (adds to 021/022).** time → bodies (+ follow, which also shifts an active fly) →
`controls.update()` (advances the fly) → follow check → view offset step → depth → `camera.updateMatrixWorld()`
→ Sun uniforms, glow → markers → date text → live distance text (only on a new time state).

## Files

| File                                                             | Change | Purpose                                                                                               |
| ---------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------- |
| `src/core/types.ts`                                              | modify | `InfoSlot`; optional `SpaceInstance.attachInfo?(slot)` and `selection?()` (test seam)                 |
| `src/ui/info-panel.ts`                                           | modify | return `slot` (`content`, `showDescription`, `open`, `onOpenChange`)                                  |
| `src/core/space-manager.ts`                                      | modify | pass the panel's slot to `instance.attachInfo?.()`; option type returns `{ dispose, slot? }`          |
| `src/core/debug.ts`                                              | modify | `__WORLD__.selection()`; `cameraProjection()` adds the view offset (test-only)                        |
| `src/shared/controls/fly.ts`                                     | new    | pure van Wijk–Nuij path, duration, direction slerp                                                    |
| `src/shared/controls/index.ts`, `types.ts`                       | modify | `flyTo(target, position, { minDistance })`, fly-aware `follow`, `onReset?` option                     |
| `src/spaces/solar-system/picking.ts`                             | new    | pure `pick()`: centres, discs, name boxes, nearest-to-camera rule                                     |
| `src/spaces/solar-system/focus.ts`                               | new    | pure end pose: framing distance, sunlit direction, clear-area view offset                             |
| `src/spaces/solar-system/facts.ts`                               | new    | pure: derive facts from `BodyData` + `FACTS`, format them, live distance                              |
| `src/spaces/solar-system/body-panel.ts`                          | new    | DOM: body list, facts card, announcer, focus return                                                   |
| `src/spaces/solar-system/markers.ts`                             | modify | both scales: dot below 3 px, name beside larger discs; selected state; `hit()`                        |
| `src/spaces/solar-system/orbit-lines.ts`                         | modify | 4 096 points for planets' real lines + 256-point far copy (D-040); rebuilt when a body strays (D-038) |
| `src/spaces/solar-system/data.ts`, `types.ts`                    | modify | `FACTS` (description, known moons + as-of), `BodyFacts`, `SOURCES` entry (`covers: 'facts'`)          |
| `src/spaces/solar-system/index.ts`                               | modify | selection state, click handling, `select`/`deselect`, view offset, scale switch, saved state, order   |
| `src/styles/main.css`                                            | modify | card, list, selected marker, stylised names                                                           |
| `tests/unit/shared/controls/fly.test.ts`                         | new    | path, duration, log distance, cancellation maths                                                      |
| `tests/unit/shared/controls/camera-controls.test.ts`             | modify | `flyTo` advance/cancel/reduced motion, `follow` during a fly, `onReset`                               |
| `tests/unit/spaces/solar-system/picking.test.ts`                 | new    | AC-1 rules                                                                                            |
| `tests/unit/spaces/solar-system/focus.test.ts`                   | new    | AC-4 distance (⅓ of the clear side, real camera), direction, clear area                               |
| `tests/unit/spaces/solar-system/facts.test.ts`                   | new    | AC-9, AC-10, AC-13                                                                                    |
| `tests/unit/spaces/solar-system/body-panel.test.ts`              | new    | AC-2, AC-3, AC-12 (DOM, focus)                                                                        |
| `tests/unit/spaces/solar-system/markers.test.ts`                 | modify | AC-14 stylised labels, selected priority, `hit()`                                                     |
| `tests/unit/spaces/solar-system/space.test.ts`                   | modify | select/deselect wiring, scale switch keeps selection, saved state, dispose                            |
| `tests/unit/ui/info-panel.test.ts`, `core/space-manager.test.ts` | modify | slot behaviour; `attachInfo` called after mount, not for the gallery                                  |
| `tests/e2e/solar-system-selection.spec.ts`                       | new    | AC-1–AC-12, AC-14–AC-16                                                                               |
| `tests/e2e/solar-helpers.ts`                                     | modify | `waitForFly`, `selection()`, project a body to screen                                                 |
| `specs/architecture.md`                                          | modify | Info-panel slot, controls `flyTo`/`onReset`, Solar System selection; replace "Multi-Object (planned)" |

No new dependency. No new asset (`CREDITS.md` unchanged; the facts source goes in `SOURCES`, as 020's data did).

## Data Structures & Interfaces

```ts
// core/types.ts (additive)
export interface InfoSlot {
  /** Empty element after the description, for the Space's own panel content. */
  content: HTMLElement;
  showDescription(show: boolean): void;
  /** Expand without touching the remembered preference. */
  open(): void;
  onOpenChange(listener: (open: boolean) => void): void;
}
interface SpaceInstance {
  attachInfo?(slot: InfoSlot): void;
  /** Test seam (023). */
  selection?(): { id: string | null; flying: boolean; following: boolean };
}

// shared/controls/types.ts (additive)
interface CameraControlsOptions {
  onReset?(): void; // "Reset view", R, reset()
}
interface CameraControls {
  /**
   * Flies the target to `target` and the camera to `position` along a smooth zoom-and-pan path (van Wijk–Nuij),
   * ≤ 2 s of Space time, instant under reduced motion. Cancelled by any input or reset(); `follow()` shifts it.
   */
  flyTo(target: Vec3, position: Vec3, options?: { minDistance?: number }): void;
  readonly flying: boolean;
}

// shared/controls/fly.ts (pure)
export interface FlyPath {
  duration: number; // seconds
  /** Target and distance at linear time t ∈ [0, 1] (eased inside); writes into `out`. */
  at(t: number, out: { target: Vector3; distance: number }): void;
}
export function flyPath(
  from: { target: Vector3; distance: number },
  to: { target: Vector3; distance: number },
): FlyPath;

// solar-system/picking.ts (pure)
export interface Pickable {
  id: string;
  x: number;
  y: number;
  radiusPx: number;
  depth: number;
  visible: boolean;
  nameBox: [number, number, number, number] | null;
}
export function pick(items: readonly Pickable[], x: number, y: number, minRadius = 22): string | null;

// solar-system/focus.ts (pure)
export function framingDistance(
  radius: number,
  fovY: number,
  viewportHeight: number,
  clearShortSide: number,
): number;
export function viewDirection(bodyWorld: Vector3, sunWorld: Vector3, out?: Vector3): Vector3; // 40° round, 20° up
export function clearArea(
  viewport: { width: number; height: number },
  panel: DOMRectReadOnly | null,
): { x: number; y: number; width: number; height: number };

// solar-system/types.ts (additive)
export interface BodyFacts {
  description: string; // 1–2 sentences
  knownMoons?: { count: number; asOf: string }; // planets only
}
export interface BodyFactsView {
  name: string;
  description: string;
  rows: Array<{ label: string; value: string }>;
  live: string | null;
}
```

## Three.js Techniques

- **No new GPU resources.** Selection is DOM + camera maths; labels are DOM (020's layer).
- **`PerspectiveCamera.setViewOffset`** shifts the projection centre for the clear area; it changes only the
  projection matrix (no re-render cost). `clearViewOffset()` when it eases back to zero.
- **Float64 maths for the fly:** positions stay in `Vector3` (float64 in JS); the per-mesh model-view matrices
  (020) keep the close-up stable at real scale. The near plane already follows the nearest surface (021); a
  close view of the Moon puts it at ~0.4 × 1.2 r ≈ 10⁻³ units, inside its [10⁻⁶, 1] clamp.
- **No raycasting:** picking uses the projections the markers already compute (one pass per click), not three's
  `Raycaster` (slow, and bodies are sub-pixel at real scale anyway).
- **No allocation per frame:** the fly writes into preallocated vectors; facts re-format only on a new time state.

## Test Approach

| AC    | Test file                                                                                                                                                                                                                                                                                                                                                                                     | Type          |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| AC-1  | `picking.test.ts` (hit rules, 22 px floor, disc/depth, name boxes, empty → null); `solar-system-selection.spec.ts` (click Mars at both scales; a drag still orbits and selects nothing; empty space keeps the selection; touch tap)                                                                                                                                                           | unit, e2e     |
| AC-2  | `body-panel.test.ts` (16 buttons, nesting, order); e2e keyboard-only: Tab to "Jupiter", Enter → selected and framed                                                                                                                                                                                                                                                                           | unit, e2e     |
| AC-3  | `body-panel.test.ts` (`aria-pressed` moves, announcer text); e2e: marker `.is-selected`, one at a time                                                                                                                                                                                                                                                                                        | unit, e2e     |
| AC-4  | `fly.test.ts` (duration ≤ 2 s, monotone eased progress, log distance, endpoints exact); `focus.test.ts` (disc = ⅓ of the clear short side through a real `PerspectiveCamera`, sunlit side: angle to Sun < 60°); e2e: after `waitForFly`, Earth's projected diameter / clear short side ∈ [0.28, 0.38], centred within 4 px of the clear-area centre; reduced motion: framed on the next frame | unit, e2e     |
| AC-5  | e2e: time at 1 month/s, still camera: the body's projection stays within 4 px of the clear centre over 3 s; drag-orbit keeps it centred; a pan ends following but the card stays                                                                                                                                                                                                              | e2e           |
| AC-6  | `camera-controls.test.ts` (input, `reset()`, a new `flyTo` cancel; no jump: pose before = after cancel); e2e: wheel mid-fly → `flying` false, pose continuous                                                                                                                                                                                                                                 | unit, e2e     |
| AC-7  | e2e: real scale, select the Moon via the list → after the fly, canvas non-blank around the centre and the Moon's disc measures ⅓ ± tolerance in 5 consecutive frames (no flicker: frame-to-frame mean pixel difference below a threshold with time paused)                                                                                                                                    | e2e           |
| AC-8  | `space.test.ts` (scale switch keeps `selected`, follows); e2e: select Saturn, switch scale → still selected, framed again within the AC-4 band                                                                                                                                                                                                                                                | unit, e2e     |
| AC-9  | `facts.test.ts` (each formatter; Earth's rows exactly; Venus "backwards"; mass from GM within 0.5 % of NASA's 5.972 × 10²⁴ kg); e2e: Mars card has heading + 7 rows                                                                                                                                                                                                                           | unit, e2e     |
| AC-10 | `facts.test.ts` (Earth on 2026-01-03 ≈ 147.1 million km, 2026-07-06 ≈ 152.1; the Moon from Earth); e2e: the "Now" text changes as time runs and has no live region                                                                                                                                                                                                                            | unit, e2e     |
| AC-11 | `focus.test.ts` (clear area for side panel / bottom sheet); e2e at 1280 × 720 and 320 × 640: `elementFromPoint` at the selected body's centre is the canvas, not the panel; panel + card height ≤ 35 % at 320 × 640                                                                                                                                                                           | unit, e2e     |
| AC-12 | `body-panel.test.ts` (Close / Escape → focus back to the opener); e2e: Escape keeps the camera pose, "Reset view" goes home and clears, focus returns to the list button / canvas                                                                                                                                                                                                             | unit, e2e     |
| AC-13 | `data.test.ts` / `facts.test.ts`: every body has a description (1–2 sentences, ≤ 300 chars), planets a moon count with an as-of date, a `facts` source; derived values only (no duplicate numbers in `FACTS`)                                                                                                                                                                                 | unit          |
| AC-14 | `markers.test.ts` (stylised: no dot, offset by radius, declutter, moon clearance, selected first); e2e: names within 4 px of their anchors at both scales with time running, and a drag starting on a name still orbits                                                                                                                                                                       | unit, e2e     |
| AC-15 | e2e: `simTime()` speed and playing unchanged by select/fly/close; turntable still for > idle delay while selected (learnings: outlast the idle delay)                                                                                                                                                                                                                                         | e2e           |
| AC-16 | `space.test.ts` (saved state round trip); e2e: 10 round trips with a selection made each time → memory and DOM at baseline; context loss with Mars selected → Mars selected and followed after restore; a new visit → nothing selected                                                                                                                                                        | unit, e2e     |
| AC-17 | `npm run build` bundle check (entry ≤ 152.9 KB); FPS probe during a fly with time running (SwiftShader floor, renderer string logged)                                                                                                                                                                                                                                                         | build, manual |

Sabotage checks (learnings): the follow test with a **still** camera; the turntable test longer than the idle
delay; the "re-frames after scale switch" test moves the camera first; the fly-cancel test proves the detector
fires.

## Risks & Mitigations

- **Fly passes through a body** (e.g. stylised scale, Mercury → Neptune past the Sun). _Mitigation:_ van Wijk's
  path zooms out mid-way, which clears most bodies; the near plane hides a brief pass-through. Accept and note; a
  collision-aware path is out of scope.
- **Real-scale fly precision.** Log-distance interpolation over 10⁸ and the moving target. _Mitigation:_ float64
  maths, `follow()` shifts the fly's endpoints, unit tests at real-scale magnitudes; AC-7's E2E checks stability.
- **View offset vs the existing E2E projections.** `__WORLD__.cameraProjection()` returns only fov, aspect, near
  and far, and the E2E helpers rebuild the projection in Node from those, so an offset view would be projected
  wrongly. _Mitigation:_ the hook additively reports `view` (`camera.view` when enabled: full size, offset, size)
  and the helpers apply `setViewOffset` in Node. Outside a selection there's no offset, so 020–022 tests are
  untouched; their suites run after the offset lands.
- **Info-panel slot touches the core and the entry bundle.** _Mitigation:_ additive, ~0.3 KB; unit tests for
  Spaces without `attachInfo`; budget check.
- **Click vs orbit:** OrbitControls fires `start`/`end` on a click too (it stops the turntable, harmless). A
  click with tiny movement may nudge the camera with damping. _Mitigation:_ ≤ 5 px threshold; the fly then
  overrides any nudge.
- **Bottom sheet too tall with the card + 16-button list.** _Mitigation:_ the sheet keeps `max-height: 35vh` and
  scrolls; the card comes first so the facts are visible; screenshot check at 320 px (learnings).
- **Moon counts change** (Saturn and Uranus gained moons in 2023–2025). _Mitigation:_ stored with an as-of date
  shown in the card ("115 (as of 2026)"; "None" for Mercury and Venus); one data line to update.

## Review points (resolved by the project lead, 2026-10-06, D-036)

1. **The Sun's card** shows diameter, mass, day (one turn), tilt and "8 planets"; distance and year don't apply
   and are omitted (spec AC-9 changelog).
2. **"Length of day"** is the **sidereal rotation** ("one turn") from 020's data, labelled as such; no solar-day
   data is added.
3. **A real-scale re-centre on another body keeps the selection;** only the follow moves (021 unchanged). A pan
   ends following but keeps the card.

## Constitution Check

| Principle                 | Status | Notes                                                                                                                          |
| ------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------ |
| I. Spec before code       | ✅     | Spec Approved 2026-10-06 (D-035).                                                                                              |
| II. Browser-only          | ✅     | No network; no new preference (selection isn't remembered across visits; context-loss state is in memory).                     |
| III. Self-contained Space | ✅     | Selection lives in the Space. Core changes are additive, optional seams (`attachInfo`, `flyTo`, `onReset`).                    |
| IV. Performance budgets   | ✅     | No GPU resources; picking per click; no per-frame allocation; entry ≤ +5 KB checked by the build.                              |
| V. Accessible & resilient | ✅     | List of buttons with `aria-pressed`, polite announcements, focus return, Escape, 44 px targets, reduced motion = instant.      |
| VI. Test-gated            | ✅     | Pure modules (`fly`, `focus`, `picking`, `facts`) test-first; E2E per AC; fly driven by `delta` only; clicks by distance only. |
| VII. Data-driven          | ✅     | Descriptions and moon counts in `data.ts` with a source; every other fact derived from 020's data.                             |
| VIII. Small dependencies  | ✅     | None added; van Wijk–Nuij is ~30 lines of maths.                                                                               |
| IX. Licensed assets       | ✅     | No assets. Fact text is our own wording of public-domain NASA data.                                                            |
| X. Memory maintained      | ✅     | D-035 logged; plan decisions go to `decisions.md` on approval; learnings as found.                                             |
