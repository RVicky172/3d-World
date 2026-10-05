# 012 — Info Panel & Hotspots · Implementation Plan

**Spec:** `./spec.md` · **Status:** Approved (2026-10-05) <!-- Draft | Approved -->

## Approach

Two independent pieces with different owners. The **info panel** belongs to the core: every registry Space gets
one, so a Space can't forget it (Constitution V). **Hotspots** belong to the shared viewer: only Spaces whose data
defines them show markers, and the solar system can reuse the module later (023). No new dependency.

**1. Info panel (core).** `createInfoPanel(overlay, { title, description }, { open, onToggle })` in
`src/ui/info-panel.ts`.

- **Mounting:** `SpaceManager` gets an optional `infoPanel` factory. After a registry Space's factory resolves,
  the manager mounts the panel with that Space's **registry** title and description (the gallery card's strings,
  AC-1). It's **prepended** to the overlay, so the Tab order is back link → 3D view → panel toggle → (Space UI:
  hotspots, "?", Reset) (AC-4). The manager disposes it with the view: on unmount, failure, supersession and
  `suspend()`. The gallery view gets none.
- **DOM:** a `<section aria-labelledby>` region with the title as `<h2>` and the description as `<p>`, plus a
  toggle `<button aria-expanded aria-controls>`. The toggle is named "Hide info" when open and "About <title>" when
  collapsed, so the title stays reachable when collapsed. State lives in `aria-expanded` (TypeScript's `hidden`
  typing quirk, see learnings). The panel stops pointer events from reaching the canvas (the overlay rule from
  004), so it never moves the camera (AC-3).
- **Remembered choice (Q1):** `src/core/preferences.ts`, with `readPreference(key, fallback)` and
  `writePreference(key, value)` over `localStorage`, each wrapped in try/catch (private mode can throw).
  `main.ts` passes `open: readPreference('world.infoPanel.open', true)` and writes on toggle. This is the
  project's first `localStorage` use, for preferences only (Constitution II).
- **Layout:** CSS only, with no JS measuring.
  - **Wide (> 640 px):** a side panel at top-right, `width: min(20rem, 40vw)`, scrolling if long.
  - **Narrow (≤ 640 px):** a bottom sheet above the controls row (`bottom: 72px`, 16 px gutters,
    `max-height: 35vh`, so ≤ 35 % of the viewport, AC-3). On narrow screens the controls hint moves to the top
    (below the back link), so the sheet never covers it.
  - **Collapsed:** only the toggle pill remains, in the same spot.

**2. Hotspots (shared): `src/shared/hotspots/`.**

- **Data (`HotspotConfig`, AC-13):** `{ id, title, text, position, view }`. `position` is in the model's own
  (glTF scene) coordinates, so it survives `fitModel()` centring: world position = `model.localToWorld(position)`.
  `view` is the direction the camera should look from (Q3). Array order is the Tab order (AC-10).
- **Markers:** one `<button class="hotspot" aria-label="Hotspot: <title>" aria-expanded aria-controls>` per
  hotspot, in a `.hotspots` layer. The viewer inserts that layer into the overlay **before** creating the
  controls, so markers come before "?" and Reset in Tab order. Each frame, after `controls.update()`:
  1. **Read phase:** project every world point with the camera (`Vector3.project`) to CSS px of the canvas size
     (pure `toScreen()` in `projection.ts`). Points behind the camera (`z > 1`) are hidden.
  2. **Write phase:** one batched pass sets `transform: translate(x, y)` per marker (AC-6, NFR: no layout
     thrash). It's skipped when the camera matrix, projection and size are unchanged.
- **Occlusion (Q2, AC-7):** a ray from the camera to each point, against the model's triangles. The point is
  occluded if any hit is closer than the point minus `0.01 r` (D-021: an own any-hit test, see Three.js
  Techniques). It runs only when the camera changed, at most
  every 0.1 s of Space time (accumulated `delta`, no clock reads), to stay under the 1 ms/frame NFR.
  - Occluded markers get `disabled` plus the `.is-dimmed` class: visible at low opacity, not focusable or
    clickable.
  - If a marker becomes dimmed while focused, focus moves to the canvas (never lost, 004 AC-13).
- **Annotation (AC-8):** a single `<section class="hotspot-annotation" aria-labelledby>` with the title
  (`<h3>`), the text and a "Close" button, inside an always-present `aria-live="polite"` wrapper (empty while
  closed, so filling it is announced; the markers' `aria-controls` point at it). It's placed beside its marker
  (or below/above it when neither side fits, as on phones, so it never covers the marker), clamped inside the
  viewport, and it repositions in the write phase while open. Stacking: markers sit under the info panel, a
  focused or open marker comes above it (focus never hidden, WCAG 2.4.11), and the annotation is on top.
  - **Opening a hotspot:**
    1. `controls.turnTo(view)` (Q3);
    2. `controls.holdTurntable(true)` (Q6);
    3. the annotation fills in, which is announced politely.
  - **Closing:** Escape (a keydown on the hotspot layer, so Escape in the "?" help panel only closes that), the
    Close button, or activating the
    marker again. Closing calls `holdTurntable(false)`, which restarts the idle delay, and returns focus to the
    marker. Opening another hotspot closes the first one.
- **Pointer (AC-11):** markers and the annotation are overlay children with their own pointer events (004), so
  presses on them never reach OrbitControls. Between markers, the layer has `pointer-events: none`, so dragging
  the model still works. Markers are 44 × 44 px hit areas around a smaller visual dot.

**3. Controls additions (004 API, additive):**

- `turnTo(direction, { duration = 0.6 })`: eases the camera around the focus point to look from `direction` at
  the current distance (clamped to limits). It's advanced in `update(delta)`, so it's deterministic. It's
  **instant under reduced motion**, and any visitor input cancels it. It sets `userMoved`, so a resize keeps the
  new pose.
- `holdTurntable(hold)`: the turntable stays idle while held; releasing it counts as an interaction, so the idle
  delay restarts.
- Pure maths in `src/shared/controls/turn.ts`: `turnStep(from, to, t)` slerps unit directions (shortest arc,
  handling near-opposite vectors) with smoothstep easing. Unit-tested first.

**4. Test seams:** `SpaceInstance.hotspotPositions?()` returns `{ id, world }[]`, and `__WORLD__` gains
`hotspots()` and `cameraProjection()` (fov, aspect, near, far). E2E then projects the points itself, using three
in Node from the reported pose and projection, and compares the result with the markers' real bounding boxes.
That's independent of the marker code's own projection and checks the DOM placement end to end (AC-6).

## Chair hotspots: copy (Q4, approved after T040, D-021)

Positions and view directions were picked in T040 by probing the meshes (raycasts onto each part) and checked
with screenshots (values in `tasks.md`). The copy describes what the visitor sees; no product claims. The probe
found no arms, wooden legs (metal is only ~1 cm bolts and floor glides) and a printed label, so the first draft
was revised.

| Order | id      | Title (≤ 4 words) | Text (≤ 2 sentences)                                                                                                                          | Notes                                              |
| ----- | ------- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| 1     | `seat`  | Velvet upholstery | The seat and back cushions are covered in velvet. Its short pile catches light at grazing angles, which gives the soft sheen along the edges. | Front, from above; shows off `KHR_materials_sheen` |
| 2     | `frame` | Wooden frame      | A curved wooden shell holds the back cushion. The posts that carry it run down into the back legs.                                            | From behind; dimmed at the home view               |
| 3     | `legs`  | Wooden legs       | Four tapered wooden legs stand on small metal glides. Small metal fittings join them to the frame.                                            | Low front-side view of the front leg               |
| 4     | `label` | Printed label     | A printed label is fixed to the board under the seat.                                                                                         | Looks up from below; dimmed at the home view       |

## Files

| File                                                       | Change | Purpose                                                                                                                         |
| ---------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `src/core/preferences.ts`                                  | new    | `readPreference` / `writePreference` over `localStorage`, safe when storage throws                                              |
| `src/ui/info-panel.ts`                                     | new    | `createInfoPanel()`: region, heading, description, toggle with `aria-expanded`                                                  |
| `src/core/space-manager.ts`                                | modify | Optional `infoPanel` factory: mount (prepended) for registry Spaces, dispose with the view                                      |
| `src/core/types.ts`                                        | modify | `SpaceInstance.hotspotPositions?()` (test seam)                                                                                 |
| `src/core/debug.ts`                                        | modify | `__WORLD__.hotspots()`, `cameraProjection()`                                                                                    |
| `src/main.ts`                                              | modify | Wire the panel + preference                                                                                                     |
| `src/shared/controls/turn.ts`                              | new    | `turnStep()` (pure)                                                                                                             |
| `src/shared/controls/turntable.ts`, `index.ts`, `types.ts` | modify | `turnTo()`, `holdTurntable()`                                                                                                   |
| `src/shared/hotspots/projection.ts`                        | new    | `toScreen()` (pure)                                                                                                             |
| `src/shared/hotspots/occlusion.ts`                         | new    | Throttled any-hit occlusion                                                                                                     |
| `src/shared/hotspots/index.ts`                             | new    | `createHotspots()`: markers, annotation, per-frame update, dispose                                                              |
| `src/shared/hotspots/types.ts`                             | new    | `HotspotConfig`                                                                                                                 |
| `src/shared/model-viewer/index.ts`, `types.ts`             | modify | `hotspots?` in config; layer before controls; update and dispose; `hotspotPositions()`                                          |
| `src/spaces/sheen-chair/data.ts`                           | modify | Four hotspots                                                                                                                   |
| `src/styles/main.css`                                      | modify | `.info-panel` (side / bottom sheet), `.hotspot`, `.is-dimmed`, `.hotspot-annotation`, narrow hint                               |
| `tests/unit/core/preferences.test.ts`                      | new    | Read/write, fallback, storage throwing                                                                                          |
| `tests/unit/ui/info-panel.test.ts`                         | new    | DOM, roles, names, toggle, `onToggle`, dispose                                                                                  |
| `tests/unit/core/space-manager.test.ts`                    | modify | Panel mounted for registry Spaces (prepended), not for the gallery; disposed on every exit                                      |
| `tests/unit/shared/controls/turn.test.ts`                  | new    | Slerp endpoints, easing, opposite vectors, unit length                                                                          |
| `tests/unit/shared/controls/camera-controls.test.ts`       | modify | `turnTo` (eased, instant with reduced motion, cancelled by input, limits); `holdTurntable`                                      |
| `tests/unit/shared/hotspots/*.test.ts`                     | new    | `toScreen`, occlusion with real three meshes, markers/annotation DOM, focus, Escape, dispose                                    |
| `tests/unit/shared/model-viewer/viewer.test.ts`            | modify | Layer before controls; hotspots disposed; none when the config has no hotspots                                                  |
| `tests/unit/spaces/sheen-chair.test.ts`                    | modify | Hotspot data: unique ids, copy lengths, positions within the source model's bounds (glTF-Transform `getBounds`), non-zero views |
| `tests/unit/core/debug.test.ts`                            | modify | New hooks                                                                                                                       |
| `tests/e2e/info-panel.spec.ts`                             | new    | AC-1–AC-4, AC-14 (panel part)                                                                                                   |
| `tests/e2e/hotspots.spec.ts`                               | new    | AC-5–AC-12, AC-15, AC-16                                                                                                        |

## Data Structures & Interfaces

```ts
// src/shared/hotspots/types.ts
export interface HotspotConfig {
  id: string; // kebab-case, unique per Space
  title: string; // ≤ 4 words
  text: string; // ≤ 2 sentences
  /** Point on the model, in the model's own (glTF scene) coordinates. */
  position: readonly [number, number, number];
  /** Direction to view it from (Q3), pointing from the model towards the camera. */
  view: readonly [number, number, number];
}

// src/shared/model-viewer/types.ts
interface ModelViewerConfig {
  // …existing
  hotspots?: readonly HotspotConfig[];
}

// src/shared/controls/types.ts (additive)
interface CameraControls {
  // …existing
  /** Ease to look from `direction` at the focus (instant under reduced motion); cancelled by any input. */
  turnTo(direction: Vec3, options?: { duration?: number }): void;
  /** Keep the idle turntable still (e.g. while an annotation is open); release restarts its idle delay. */
  holdTurntable(hold: boolean): void;
}

// src/ui/info-panel.ts
export function createInfoPanel(
  overlay: HTMLElement,
  info: { title: string; description: string },
  options: { open: boolean; onToggle?: (open: boolean) => void },
): { dispose(): void };

// src/core/space-manager.ts
interface SpaceManagerOptions {
  // …existing
  infoPanel?: (overlay: HTMLElement, info: { title: string; description: string }) => { dispose(): void };
}

// src/core/preferences.ts
export function readPreference<T extends boolean | string>(key: string, fallback: T, storage?: Storage): T;
export function writePreference(key: string, value: boolean | string, storage?: Storage): void;
```

## Three.js Techniques

- **Projection:** `Vector3.project(camera)` gives NDC; `x = (ndc.x + 1) / 2 · width`,
  `y = (1 − ndc.y) / 2 · height`, in the canvas's CSS size (the overlay matches it). `ndc.z > 1` means behind the
  camera. Projected after `controls.update()` in `update()`, before the engine renders, so markers and pixels come
  from the same camera state.
- **Occlusion (D-021):** T040 measured three's `Raycaster` at 8.2 ms per pass (4 rays, ~40k triangles), so the
  module has its own test instead. At creation it copies every mesh's triangles into one world-space
  `Float32Array` (the model holds still, D-009; 1.4 MB for the chair, dropped on dispose). A ray then runs an
  any-hit Möller–Trumbore loop that stops at the first triangle closer than `distance − 0.01 r`, double-sided.
  Measured 0.7 ms median, 1.0 ms max per pass, with the same answers as `Raycaster`. Still throttled (≤ 10 Hz,
  only after the camera moves). Positions are read with `fromBufferAttribute`, which de-normalizes the
  Meshopt-quantized attributes; the E2E occlusion test proves it on the real chair.
- **No GPU resources** are added: markers are DOM, so GPU memory round trips are unaffected (AC-15 still checks).
- **Entry size:** the panel and preferences are small DOM modules in the entry (budget ≤ 3 KB, Q7).
  `Raycaster` and the hotspot code are imported only by lazy chunks. `Raycaster` lives in the shared `three`
  module, so it may land in the entry (as in D-010/D-013); the bundle check measures it in T001.

## Test Approach

| AC    | Test                                                                                                                                                                                                                                                                             | Type       |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| AC-1  | `space-manager.test.ts`: the panel gets the registry title and description. E2E: the panel shows the card's strings; open on first visit; collapse → reload → collapsed; new context → open                                                                                      | unit + e2e |
| AC-2  | `info-panel.test.ts`: toggle names and `aria-expanded`. E2E: mouse, touch tap, Enter/Space; focus stays on the toggle                                                                                                                                                            | unit + e2e |
| AC-3  | E2E: drag and wheel on the panel don't move the camera (pose unchanged); at 320 × 640 the expanded panel's rect ≤ 35 % of the viewport; collapsed → `contentBounds` fill in 50–90 %                                                                                              | e2e        |
| AC-4  | E2E: `getByRole('region', { name: 'Sheen Chair' })`; Tab sequence back link → canvas → toggle → 1st hotspot → … → "?" → "Reset view"                                                                                                                                             | e2e        |
| AC-5  | `sheen-chair.test.ts` (four hotspots, valid). E2E: four markers visible at the home view, or dimmed when occluded                                                                                                                                                                | unit + e2e |
| AC-6  | `projection.test.ts`. E2E: at the home view, after keyboard orbits, a zoom, a pan, mid-turntable (normal motion) and at 320 × 640, each visible marker's rect centre is within 4 px of the point projected in the test from `cameraPose()` + `cameraProjection()` + `hotspots()` | unit + e2e |
| AC-7  | `occlusion.test.ts` (box in front of a point → occluded; clear line → visible; throttle). E2E: the label is dimmed and `disabled` at the home view and enabled after "turn to" its view                                                                                          | unit + e2e |
| AC-8  | `hotspots` unit (one open at a time, Escape, Close, toggle again, focus back). E2E: click → annotation text visible, polite live region, Escape closes, focus on the marker                                                                                                      | unit + e2e |
| AC-9  | `turn.test.ts`, `camera-controls.test.ts`. E2E: activating the label turns the camera (rotation > 20°) and leaves the label enabled; with reduced motion the pose changes within one frame                                                                                       | unit + e2e |
| AC-10 | E2E: Tab reaches the markers in data order with a focus ring (`:focus-visible` outline) and name "Hotspot: …"; arrows orbit only while the canvas has focus                                                                                                                      | e2e        |
| AC-11 | E2E: marker rect ≥ 44 × 44; a drag starting on a marker leaves the pose unchanged; a drag between markers orbits; touch context: tap opens                                                                                                                                       | e2e        |
| AC-12 | `camera-controls.test.ts` (`holdTurntable`). E2E (normal motion): open → pose still for 600 ms after the turn settles; close → the turntable resumes after its idle delay                                                                                                        | unit + e2e |
| AC-13 | `sheen-chair.test.ts`: ids unique and kebab-case, title ≤ 4 words, text ≤ 2 sentences, positions within the source GLB's bounds (+2 %), `view` non-zero                                                                                                                          | unit       |
| AC-14 | E2E: demo-cube shows the panel and `.hotspot` count 0, with a clean console                                                                                                                                                                                                      | e2e        |
| AC-15 | Unit dispose tests. E2E: 10 round trips → `#app` element count back to its pre-visit count; `memory()` back to the baseline                                                                                                                                                      | unit + e2e |
| AC-16 | E2E: lose → restore → the panel is present and markers are within 4 px again                                                                                                                                                                                                     | e2e        |
| AC-17 | Bundle check: entry ≤ 145.6 + 3 KB; chair ≤ 5 MB                                                                                                                                                                                                                                 | build      |

## Risks & Mitigations

- **Raycast cost on 40k triangles.** _Mitigation:_ throttle to ≤ 10 Hz after camera changes only. T040 measured
  8.2 ms with `Raycaster`, so occlusion uses its own any-hit test (0.7 ms, D-021).
- **Focus on a marker that becomes dimmed** (`disabled` drops focus to `<body>`). _Mitigation:_ before
  disabling, move focus to the canvas if the marker has it (unit + E2E).
- **Bottom-sheet collisions on phones** (hint, controls row, credit). _Mitigation:_ the sheet sits above the
  controls row and the hint moves to the top on narrow screens; screenshots at 320 × 640 and 375 × 667 in the E2E
  task.
- **Tab order** depends on DOM order across core (panel) and Space (layer, controls, credit). _Mitigation:_ the
  panel is prepended by the core, the layer is inserted before the controls are created, and the AC-4 E2E pins the
  sequence.
- **The label sits under the seat:** its view looks up from below, near the polar limit (0.15 rad). _Mitigation:_
  `turnTo` clamps to the polar limits; T040 picks a view the limits allow.
- **`localStorage` unavailable** (private mode, blocked). _Mitigation:_ try/catch fallback to "open"; unit test
  with a throwing storage.
- **The 3 KB entry cap.** _Mitigation:_ measure in T001 by adding the panel to the entry first. If `Raycaster`
  pulls core classes into the entry, report it (the cap is fixed, Q7).
- **AC-6 snapshot consistency:** pose and DOM must come from the same frame. _Mitigation:_ read the pose,
  projection, positions and marker rects in **one** `page.evaluate` (no frame can run in between).

## Constitution Check

| Principle                 | Status | Notes                                                                                                    |
| ------------------------- | ------ | -------------------------------------------------------------------------------------------------------- |
| I. Spec before code       | ✅     | Spec Approved 2026-10-05 (D-020)                                                                         |
| II. Browser-only          | ✅     | `localStorage` for a UI preference only, which Principle II allows                                       |
| III. Self-contained Space | ✅     | Hotspots in `src/shared/hotspots/`; the panel in core; everything freed with the view                    |
| IV. Performance budgets   | ✅     | ≤ 3 KB entry; throttled raycasts; batched DOM writes; no GPU resources                                   |
| V. Accessible & resilient | ✅     | Title and description in every Space; keyboard/touch/mouse hotspots; polite announcements; 44 px targets |
| VI. Test-gated            | ✅     | Pure `turnStep`, `toScreen`, occlusion test-first; E2E projects points independently                     |
| VII. Data-driven          | ✅     | Hotspots and copy in `data.ts`; panel text from the registry                                             |
| VIII. Small dependencies  | ✅     | None added                                                                                               |
| IX. Licensed assets       | ✅     | No new assets                                                                                            |
| X. Memory maintained      | ✅     | D-020 recorded; learnings as found                                                                       |
