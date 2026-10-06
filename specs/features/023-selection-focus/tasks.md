# 023 — Selection & Focus · Tasks

**Plan:** `./plan.md` (Approved, D-036)
Legend: `[P]` = can run in parallel with the previous task. Each task lists files and the proving test.
Test-first: each "tests" task must fail before its paired implementation makes it pass.
Every task leaves `npm run check` **and** `npm run test:e2e` green (D-015 worker cap; `E2E_WORKERS=2` for one spec).
Baselines: entry 147.9 KB gzipped (022), allowance ≤ 5 KB (≤ 152.9 KB); Space ≤ 4 MB with the decoder (D-030).

## Setup (spike and content)

- [x] **T001** — **Spike (temporary):** in a dev build, at real scale, put the target on the Moon, the camera at
      the plan §3 distance (a third of the shorter side) and a `setViewOffset` for a 320 × 640 bottom sheet. Check:
      the Moon is stable over 60 frames with time paused (no depth flicker; near plane ≈ 10⁻³); drag-orbit and the
      wheel still pivot on the Moon with the offset on; the 022 Sun uniforms and glow look right with the offset.
      Anything wrong: **stop** and report before T020. Remove the spike. files: temporary only · covers: AC-4, AC-7,
      AC-11 risks

  **Result (2026-10-06):** test-mode dev server, SwiftShader, reduced motion (time paused). A temporary instance
  method placed the target on a body, the camera at plan §3's distance and direction, and a `setViewOffset` for
  the clear area (the info panel's rect: left of it above 640 px, above it below). Six cases: real-scale Moon at
  1280 × 720 and 320 × 640, Mercury at 320, Earth at 1280; stylised Saturn at 320, the Sun at 1280.
  - **Framing:** centre 0.00 px from the clear centre; disc / clear short side 0.331–0.333 (plan §3 formula exact).
  - **Stability:** 5 captures over 60 frames, mean pixel difference 0.000 in every case; near plane = half the
    gap to the surface (Moon at 320: 0.0151 units for d = 0.032), so the near-plane/precision risk is closed.
  - **Pivot with the offset:** a drag orbits (the background moves) with the body still at the clear centre (0.00
    px, same size); three wheel notches zoom to 0.61 of the short side, still centred.
  - **022 visuals with the offset:** Earth's terminator and lights, Saturn's rings and both shadows, the Sun's glow
    all correct. No console errors or warnings.
  - **Findings for later tasks (not blockers):** (1) at real scale a close-up shows the body's marker dot and name
    on top of its disc; (2) a straight segment of a real-scale orbit line can cross a close-up body (256 points
    leave ~0.011 units of sag on Earth's orbit, ~6 Moon radii). Both reported to the lead.

  Spike code removed (`index.ts`, `debug.ts` restored); dev server stopped.

- [x] **T002** — **Facts copy (review gate):** draft the 16 descriptions (1–2 sentences, plain words, each claim
      from NASA Science's body pages) and the planets' known-moon counts with an as-of date and source URL.
      Present them as a table to the lead; **stop** until approved. files: notes in this task's result · covers:
      AC-9, AC-13 inputs

  **Draft for review (2026-10-06):** wording is ours, plain English; each body's claims are standard facts from its
  NASA Science page (`science.nasa.gov/<body>/`, public domain). Descriptions hold no numbers that the card's rows
  show.

  | Body     | Description (draft)                                                                                                                                                                        | Chars |
  | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----- |
  | Sun      | A star: a vast ball of hot hydrogen and helium whose light and heat power the whole Solar System. It holds about 99.8 % of the Solar System's mass.                                        | 147   |
  | Mercury  | The smallest planet and the closest to the Sun. With almost no atmosphere to hold in heat, its surface swings from scorching days to freezing nights.                                      | 149   |
  | Venus    | Close to Earth in size, but wrapped in clouds of sulphuric acid above a crushing carbon-dioxide atmosphere. The trapped heat makes it the hottest planet, hotter even than Mercury.        | 179   |
  | Earth    | Our home, and the only place known to have life. Liquid water covers most of its surface.                                                                                                  | 89    |
  | Moon     | Earth's only natural satellite, and the only other world people have walked on. It always keeps the same face towards Earth.                                                               | 124   |
  | Mars     | A cold desert world, red from rusty iron in its dust. It has the Solar System's largest volcano, Olympus Mons, and signs that water once flowed on its surface.                            | 159   |
  | Jupiter  | The largest planet, a gas giant more than twice as massive as all the other planets combined. Its Great Red Spot is a storm bigger than Earth that has raged for centuries.                | 171   |
  | Io       | The most volcanically active world in the Solar System. Tides from Jupiter knead its interior, powering hundreds of volcanoes.                                                             | 126   |
  | Europa   | An icy moon hiding a global ocean of salty water beneath its frozen shell: one of the most promising places to look for life beyond Earth.                                                 | 138   |
  | Ganymede | The largest moon in the Solar System, bigger than the planet Mercury. It is the only moon known to have its own magnetic field.                                                            | 127   |
  | Callisto | One of the most heavily cratered worlds in the Solar System. Its dark, ancient surface has barely changed in billions of years.                                                            | 127   |
  | Saturn   | A gas giant famous for its bright rings of ice and rock. It is the least dense planet: on average, less dense than water.                                                                  | 121   |
  | Titan    | Saturn's largest moon, and the only moon with a thick atmosphere. Methane and ethane rain fill rivers, lakes and seas on its surface.                                                      | 133   |
  | Uranus   | An ice giant that spins on its side, so each pole spends decades in sunlight and then decades in darkness. Methane in its atmosphere gives it a blue-green colour.                         | 162   |
  | Neptune  | The farthest planet from the Sun: a cold, dark ice giant with the fastest winds in the Solar System.                                                                                       | 100   |
  | Triton   | Neptune's largest moon, and the only large moon that orbits backwards, against its planet's spin. Probably a captured world from the Kuiper Belt, it has geysers erupting through its ice. | 186   |

  **Known moons** (planets only; the card shows "N known (as of 2026)"): Earth 1 (the Moon), Mars 2, Jupiter 115,
  Saturn 293, Uranus 29, Neptune 16. Source: JPL Solar System Dynamics, _Planetary Satellite Discovery
  Circumstances_ (`ssd.jpl.nasa.gov/sats/discovery.html`, public domain), read 2026-10-06: per-planet totals Mars 2,
  Jupiter 115, Saturn 293, Uranus 29, Neptune 16 (+ Pluto 5 = the page's stated 460; Earth not listed). Its footer
  still says "last updated 2023-May-23", but the counts are newer (Saturn was 146 in 2023 and 274 in 2025), so the
  table is current and the footer is stale. NASA Science's moons page (updated 2026-09-14) agrees on Neptune (16)
  and gives no other totals. The Sun's card shows "8 planets" (D-036) instead.

  **Approved by the lead (2026-10-06)** as drafted: copy and counts go into `FACTS` in T032.

## Core seams

- [x] **T010** — **Info-panel slot: tests.** `tests/unit/ui/info-panel.test.ts`: `slot.content` is inside the
      region after the description; `showDescription(false/true)` hides/shows only the description; `open()`
      expands a collapsed panel **without** calling `onToggle`; `onOpenChange` fires on toggle clicks and on
      `open()`. `tests/unit/core/space-manager.test.ts`: `instance.attachInfo(slot)` is called once, after the
      panel is mounted; never for the gallery or a Space without it; not after a superseded open. covers: plan §8
- [x] **T011** — **Info-panel slot: implementation.** `src/core/types.ts` (`InfoSlot`, `attachInfo?`,
      `selection?`), `src/ui/info-panel.ts`, `src/core/space-manager.ts`, `src/main.ts` (option type). test: T010;
      012's info-panel E2E still green.
- [x] **T012** [P] — **Test hooks.** `src/core/debug.ts`: `selection()` (from `instance.selection?.()`, else
      null) and `cameraProjection()` gains `view` (`camera.view` when enabled, else null), both additive.
      `tests/e2e/solar-helpers.ts`: apply `setViewOffset` when `view` is present; add `waitForFly(page)` (polls
      `selection().flying === false` per frame, no sleeps) and `selectFromList(page, name)`. test:
      `tests/unit/core/debug.test.ts`; 020–022 Solar E2E still green.

## Camera controls (shared)

- [x] **T020** — **Fly path: tests.** `tests/unit/shared/controls/fly.test.ts`: endpoints exact at t = 0 and 1;
      eased progress monotone; distance moves logarithmically (midpoint of a 10⁸ zoom ≈ geometric mean when the
      targets coincide); a pan between equal distances zooms out mid-way (van Wijk); `duration` ≤ 2 s for the
      longest real-scale flight (home → the Moon), ≥ 0.6 s, and longer for longer paths; inputs never modified;
      works at real-scale magnitudes (targets 10³ apart, distance 10⁻³) without NaN. covers: AC-4, AC-7
- [x] **T021** — **Fly path: implementation.** `src/shared/controls/fly.ts` (`flyPath`, smoothstep, direction via
      `turnStep`). test: T020.
- [x] **T022** — **`flyTo`, fly-aware `follow`, `onReset`: tests.** `tests/unit/shared/controls/camera-controls.test.ts`:
      `flyTo` advances only through `update(delta)` and lands exactly; `flying` true then false; reduced motion
      lands on the next `update`; `minDistance` applies until `reset()`; any input (pointer, wheel, key), `reset()`
      or a new `flyTo` cancels with **no jump** (pose after cancel = pose of the last frame); `follow(delta)` during
      a fly shifts its start and goal (lands on the moved point); `userMoved` set; turntable idle delay restarts;
      `onReset` fires for the button, `R` and `reset()`, but not for the internal re-frame used by `setHome`.
      covers: AC-4, AC-5, AC-6, AC-12
- [x] **T023** — **Controls: implementation.** `src/shared/controls/index.ts`, `types.ts` (plus a `reframe()`
      the scale switch uses without firing `onReset`). test: T022; 004/012/020/021 controls tests and E2E green.

## Solar System: pure modules

**Result (2026-10-06):** `flyTo(target, position, { minDistance })`, `flying`, `reframe()` and the `onReset`
option; `follow()` shifts a flight in progress. Landing restarts the turntable's idle delay (it counted from
take-off, so the turntable could resume ~2 s after a 2 s flight). 15 new tests (55 in the file); removing the
flight shift from `follow()` fails its test. 939 unit, 177 E2E green.

- [x] **T030** [P] — **Picking: tests, then implementation.** `tests/unit/spaces/solar-system/picking.test.ts` →
      `src/spaces/solar-system/picking.ts`: a 1 px body hit at 21 px, missed at 23 px; a big disc hit anywhere
      inside; inside two discs → nearer the camera; outside all discs → nearest centre; a name box hits its body;
      hidden/behind-camera items never hit; empty → null. covers: AC-1
- [x] **T031** [P] — **End pose and clear area: tests, then implementation.**
      `tests/unit/spaces/solar-system/focus.test.ts` → `focus.ts`: through a real `PerspectiveCamera`, the
      projected disc at `framingDistance` spans ⅓ of the clear area's shorter side (± 1 %) at 1280 × 720 and
      320 × 640; `viewDirection` is 40° round and 20° up from the sunward direction (the angle to the Sun < 60°);
      clamped by the polar limits; `clearArea` for no panel, a right side panel and a bottom sheet; the view
      offset that puts the target at the clear centre. covers: AC-4, AC-11
- [x] **T032** [P] — **Facts: tests, then implementation** (after T002). `tests/unit/spaces/solar-system/facts.test.ts`
      and `data.test.ts` → `src/spaces/solar-system/types.ts` (`BodyFacts`, `covers: 'facts'`), `data.ts`
      (`FACTS`, a `SOURCES` entry), `facts.ts`:
  - every body has a 1–2 sentence description (≤ 300 chars); every planet a moon count with an as-of date;
    `FACTS` holds no number 020 already has;
  - derived values: Earth's mass from GM within 0.5 % of 5.972 × 10²⁴ kg, diameter 12,742 km, "1.00 × Earth";
  - formatters: km, "million km", hours vs days, days vs years, degrees, × 10ⁿ kg, fixed English locale;
  - Venus's and Uranus's day says "backwards"; the Sun's card has no distance or year (D-036);
  - live distance: Earth ≈ 147.1 million km on 2026-01-03, ≈ 152.1 on 2026-07-06 (± 0.1); the Moon "from Earth".

  covers: AC-9, AC-10, AC-13

  **Result (2026-10-06):** `FACTS` (16 approved descriptions; known moons for the 8 planets, Mercury and Venus 0,
  as of 2026-10-06), two `facts` sources (JPL discovery table, NASA Science pages), `BodyFacts`. `facts.ts`:
  `factsFor` (planets 7 rows, moons 6 with "from <planet>" and "Orbit (one turn round <planet>)", the Sun 5:
  diameter, mass, day, tilt, planets), `massKg` (GM ÷ G, CODATA 2018), formatters (comma-grouped English; a
  diameter always in km), `liveDistance` (real km from the orbit maths; moons to 1,000 km). 33 tests + the 020
  sources test now lists `facts`; a constant-distance sabotage fails the perihelion/aphelion test. 979 unit green.

## Solar System: labels and panel

- [x] **T033** — **Markers at both scales: tests.** `tests/unit/spaces/solar-system/markers.test.ts`: active at
      both scales; one rule (D-037): below 3 px on-screen radius a dot and the name 7 px from the centre, from 3 px
      no dot and the name `radius + 4` px from the centre (a real-scale close-up and stylised bodies alike);
      declutter boxes use that offset; moons within 24 px still hidden; the
      selected body has `.is-selected` and keeps its name over a larger neighbour; `hit(x, y)` = `pick()` over
      centres, discs and shown name boxes; layer still `aria-hidden`, `pointer-events: none` (CSS loaded in jsdom).
      covers: AC-1, AC-3, AC-14
- [x] **T034** — **Markers: implementation.** `src/spaces/solar-system/markers.ts`, `src/styles/main.css`
      (dot-less names, selected style). test: T033; 020/021 marker E2E green (sub-pixel real-scale markers
      unchanged).
- [x] **T040** [P] — **Body list and facts card: tests.** `tests/unit/spaces/solar-system/body-panel.test.ts`:
      16 buttons in data order, moons nested under their planet, names as accessible names; `setSelected(id)`
      moves `aria-pressed`, shows the card (heading `<h3>`, description, `<dl>` rows, "Close <Name>") and
      announces "<Name> selected" in the polite region; `setSelected(null)` hides the card, announces "Selection
      cleared"; list click calls `onSelect(id)`; Close calls `onClose`; `setLive(text)` writes only on change;
      `restoreFocus(opener)` focuses the list button or the canvas; `dispose()` removes everything. covers: AC-2,
      AC-3, AC-9, AC-10, AC-12
- [x] **T041** — **Body list and facts card: implementation.** `src/spaces/solar-system/body-panel.ts`,
      `src/styles/main.css` (card, nested list, 44 px targets, bottom sheet scrolls with the card first). test:
      T040.

## Solar System: integration

- [x] **T050** — **Selection in the Space: tests.** `tests/unit/spaces/solar-system/space.test.ts` (fake context,
      fake slot, stub controls where needed):
  - a click (≤ 5 px, one pointer) on Mars's projection selects it; a 6 px drag or a two-finger touch doesn't;
    empty space keeps the selection;
  - select → panel `open()`, description hidden, `flyTo` called with plan §3's pose, turntable held, following
    Mars;
  - Escape and Close → deselected, description shown, camera unchanged, follow ended, turntable released;
    `onReset` → deselected; a pan → follow ended, still selected; a real-scale re-centre on Jupiter → follow
    moves, Mars still selected (D-036);
  - time state (`simTime()`) unchanged by select, fly and close.

  covers: AC-1–AC-3, AC-5, AC-6, AC-12, AC-15

- [x] **T051** — **Selection in the Space: implementation.** `src/spaces/solar-system/index.ts` (selection state,
      `attachInfo`, pointer click detection on `listeners`, `select`/`deselect`, Escape on the overlay and canvas
      unless the "?" disclosure is open, `onReset`, turntable hold, `selection()` seam, per-frame order plan §13).
      test: T050.

  **Result (2026-10-06):** selection in `index.ts`: click detection (one primary pointer, ≤ 5 px, no second
  pointer) → `markers.hit()`; the panel via `attachInfo` (`createBodyPanel` in the slot); `select()` marks, shows
  the card, hides the description, opens the panel, holds the turntable, `flyTo` the plan §3 pose and follows;
  `deselect()` on Escape (capture phase on the overlay, skipped while the "?" help is open), Close and `onReset`;
  the follow check waits while a flight is under way. Labels now at both scales with `radiusOf` (AC-14): 020's
  "stylised: no markers" assertions updated (unit and `solar-system.spec.ts`). The scale switch uses `reframe()`
  so it keeps a selection (T052 re-frames the body). A list selection's opener is its own button, not
  `document.activeElement` (Safari and jsdom don't focus a clicked button). 18 tests; removing the flight guard in
  `checkFollowing` fails two. 1016 unit, 177 E2E green.

- [x] **T052** — **Clear area, scale switch, live facts, saved state: tests, then implementation.**
      `space.test.ts` → `index.ts`: the view offset eases in with the fly and out over 0.3 s on deselect (instant
      under reduced motion) and is recomputed on resize and panel toggle; a scale switch keeps the selection and
      jumps to the new end pose, still following, without firing `onReset`; live distance re-formatted only on a
      new time state; `saveState()` includes `selected`, and a rebuild selects it instantly and follows it; a new
      visit starts with nothing selected; `dispose()` leaves no listeners or DOM. covers: AC-8, AC-10, AC-11,
      AC-16

  **Result (2026-10-06):** the clear area from the panel's region (`.info-panel` rect, zero when collapsed) →
  `framingDistance` on its shorter side and a view offset eased in over 0.6 s (flights take ≥ 0.6 s) and out over
  0.3 s, instant under reduced motion; re-aimed on resize and on `onOpenChange`. A scale switch re-frames the
  selected body at once (`flyTo({ instant })`, a small additive controls option) and keeps following. Live
  distance on select and on every new time state (`setLive` writes only changes). `saveState()` adds `selected`;
  a rebuild selects it instantly on the first `resize` (the viewport size is needed) and syncs the panel in
  `attachInfo`. 8 tests; sabotaging the offset fails 3, dropping the saved selection fails 1. 1024 unit, 177 E2E.

- [x] **T053** [P] — **Real-scale orbit lines (D-037 → D-038): tests, then implementation.**
      `tests/unit/spaces/solar-system/orbit-lines.test.ts` → `orbit-lines.ts`: planets' real loops have 2 048
      points, moons' and stylised loops 256; every planet's real line stays within 2 × 10⁻⁴ units of its true
      ellipse midway between points (Earth's 256-point line fails this); no new geometry on a scale switch or the
      10-year rewrite. covers: AC-7 (a close-up isn't crossed by its own line chord)

  **Result (2026-10-06):** measured first (a temporary test): with 256 points and 021's fixed refresh, planets sat
  0.8–8.2 radii off their own line on the build date and up to 13.6 before a rebuild; the Moon 0.62. So 2 048
  points alone (D-037) wouldn't do; the lead chose rebuild-on-stray (D-038). Planets' real lines: 4 096 points
  (2 048 left Uranus at 0.15 radius of sag); any real line rebuilt in place once its body is > 0.25 radius from it.
  Tests: point counts; sag < 1/8 radius over a full orbit for all 15; every body within 0.25 radius for 20 years
  of weekly steps (planets) and a year of daily steps (moons); backwards jumps; no rewrite on a still date. Never
  rebuilding fails 3 of them. ~0.1 ms per frame. 1027 unit, 48 Solar E2E green.

- [x] **T054** — **Real-scale line level of detail (D-040): tests, then implementation.**
      `tests/unit/spaces/solar-system/orbit-lines.test.ts` → `orbit-lines.ts`: each planet's far copy has 256
      points, every 16th fine vertex, also after a rebuild; moons have none; at real scale exactly one of fine/far is
      drawn per planet, the fine one exactly when the far copy's worst sag is ≥ 0.5 px from the eye (both sides of
      the switch, a smaller view switches nearer); stylised draws neither; dispose frees the far copies.
      `space.test.ts`: the whole-system view draws far copies; a close-up of Earth draws Earth's fine line.
      `index.ts`: `setView` every frame after the camera matrix. covers: AC-17 (and keeps AC-7)

  **Result (2026-10-06):** 7 new unit tests failed first, then pass (orbit-lines 17, Space +1); setting the
  threshold to 0.25 px fails the switch test. Real-scale whole-system view on SwiftShader 47–52 fps (was 35–39;
  022: 44–50). 1034 unit, 200 E2E green.

## End-to-end

- [x] **T060** — **E2E: selecting and facts.** `tests/e2e/solar-system-selection.spec.ts`:
  - click Mars at both scales → selected, `.is-selected`, card with heading and seven rows; a drag starting on
    Mars orbits and selects nothing; clicking empty space keeps it; a touch tap selects (touch context);
  - keyboard only: Tab to the list, Enter on "Jupiter" → selected and framed; the announcement text;
  - the "Now" distance changes as time runs and is not in a live region;
  - Escape keeps the camera pose and returns focus to the list button; after a canvas click, to the canvas;
    "Reset view" goes home and clears.

  covers: AC-1, AC-2, AC-3, AC-9, AC-10, AC-12

  **Result (2026-10-06):** `tests/e2e/solar-system-selection.spec.ts`, 9 tests (reduced motion; clicks at projected
  points checked to land on the canvas). Found a real bug: on wide screens the side panel, now holding the facts
  card and the body list, grew past its `max-height` over "Reset view" (grid `auto` rows don't shrink); the
  phones-only `grid-template-rows: auto minmax(0, 1fr)` moved to the base `.info`. 1027 unit, 186 E2E green.

- [x] **T061** — **E2E: flying and following.** Same spec:
  - after `waitForFly`, Earth's projected diameter ÷ the clear short side ∈ [0.28, 0.38], centred within 4 px of
    the clear centre, sunward side lit (brighter half towards the Sun); the fly takes ≤ 2 s of Space time;
    reduced motion → framed on the next frame;
  - follow: time at 1 month/s with a **still** camera (turntable held), Mars stays within 4 px over 3 s; a
    drag-orbit keeps it centred; a pan ends following and keeps the card;
  - interrupt: a wheel mid-fly → `flying` false and no pose jump between consecutive frames;
  - real scale: select the Moon from the list → disc in the AC-4 band, 5 consecutive frames with time paused
    differ by less than the noise threshold;
  - scale switch (camera moved first) with Saturn selected → still selected, framed again in the band.

  covers: AC-4, AC-5, AC-6, AC-7, AC-8

  **Result (2026-10-06):** 5 tests (motion on; waits on `data-space-background="done"`). Flight length measured in
  Space time from the simulated days (1 week/s), ≤ 2.2 s; Earth's fill and centring; seen from the sunlit side
  (camera < 60° from the Sun as seen from Earth, disc middle brighter than the far limb). Follow at 1 month/s
  with a held camera (≤ 4 px over 12 frames), drag-orbit keeps it, Shift+arrow pans end it; a wheel mid-flight
  stops it with < 2° between frames; the real-scale Moon framed and pixel-steady (< 0.5) over 5 frames; a scale
  switch after zooming out re-frames Saturn. Sabotages: no follow, no cancel, night-side view each fail their
  test (the first lit check, sunward half vs far half, passed from the night side too, so it was replaced).

- [x] **T062** — **E2E: labels, placement, time and lifecycle.** Same spec:
  - stylised labels within 4 px of their anchors with time running, at 1280 × 720 and 320 × 640; no overlapping
    shown names; a drag starting on a name orbits;
  - placement: `elementFromPoint` at the selected body's centre is the canvas at both sizes; panel + card ≤ 35 %
    of 320 × 640;
  - time: speed and play state unchanged by select/fly/close; turntable still for longer than its idle delay
    while selected;
  - lifecycle: 10 round trips selecting a body each time → GPU memory and DOM (`#app *:not(.loading-announcer)`)
    at baseline; context loss with Mars selected → Mars selected and followed after restore; a new visit → none.

  covers: AC-11, AC-14, AC-15, AC-16

  **Result (2026-10-06):** 8 tests. Stylised labels at 1280 × 720 and 320 × 640 with time at 1 month/s: each name's
  near edge within 4 px of its D-037 offset from the projected centre (labels and camera read in one evaluate), no
  two shown names overlap; a drag starting on a name orbits. Saturn selected: the canvas is what's at its centre
  at both sizes; the phone `.info` ≤ 35 %. Clock unchanged by select/fly/close; no turntable orbit over 5 s of
  Space time while selected. 10 round trips with a selection each → memory and DOM at baseline; context loss with
  Mars selected → selected, followed, centred; a new visit → none. Sabotages: CSS ignoring `--name-offset` fails
  the 1280 label test; no turntable hold fails the clock test. 1027 unit, 199 E2E green.

- [x] **T063** — **Screenshots (manual check):** 1280 × 720 and 320 × 640, both scales, Saturn and the Moon
      selected, panel open and collapsed. Look for overlapping overlays (learnings: screenshot every new overlay at
      320 px), clipped labels, the card's scrolling. Fix and re-run T060–T062. covers: AC-11, AC-14

  **Result (2026-10-06):** 20 screenshots (1280 × 720 and 320 × 640; both scales; none, Saturn, the Moon; panel
  open and collapsed) on the test build, with an overlap/clipping report: no console errors or warnings; nothing
  overlaps at 1280; "clipped" names were all off-screen bodies' (the layer hides them). Fixed: at 320 px a
  selection from low in the list left the sheet scrolled to the list, the facts out of sight; selecting now
  scrolls the panel to the top (new E2E; fails without the fix). Pre-existing, unchanged: at 320 px the 021 time
  bar's box spans the width (no visible collision); labels under the panel toggle (012 stacking). Observed, not
  changed: in a real-scale close-up the body's own orbit line passes through it and its near half crosses the disc
  (correct geometry; measured: Earth's line is 112 Moon radii away, the Moon's within 0.25) — reported to the lead.
  1027 unit, 200 E2E green.

## Verify

- [x] **T090** — `specs/architecture.md`: info-panel slot, `attachInfo`, controls `flyTo`/`onReset`, Solar System
      selection (picking, end pose, clear area, facts, labels at both scales, per-frame order), testability seams
      (`selection()`, `cameraProjection().view`), Tab order; replace "Multi-Object Pattern (planned, 023)".

  **Result (2026-10-06):** directory layout (`fly.ts`, `picking.ts`, `focus.ts`, `facts.ts`, `body-panel.ts`,
  helpers), Space contract (`attachInfo`, `selection`, `InfoSlot`), camera controls (`flyTo`, `reframe`, `onReset`),
  info panel (slot, grid rows at every width), Tab order, seams, Solar System (labels both scales, D-038 orbit
  lines, selection, facts), and "Multi-Object Pattern" now records what 020–023 established. D-039 logged; 030
  note on the roadmap. The budget line is updated in T091.

- [x] **T091** — `npm run check`, `npm run test:e2e`, `npm run build` all green. Record entry size (≤ 152.9 KB)
      and the Space total (≤ 4 MB); a manual FPS note during a fly with time running, with the renderer string; a
      warning probe with the E2E flags (DoD gate 5). covers: AC-17

  **Result (2026-10-06):** `npm run check` (1027 unit), `npm run build`
  green; E2E 200/200 on two consecutive full runs (an earlier run had 3 one-off load flakes; the AC-6 wheel test
  was really racy — pose read and CDP wheel were separate, so the flight's own progress counted as a "jump" — fixed
  to read the pose and dispatch the wheel in one task; 15/15 repeats; fails with cancellation sabotaged). Entry
  148.0 KB (+0.1 of 5); Space 3.06 MB of 4. Gate-5 probe on the production build, E2E flags: no warnings or errors
  (both scales, flights, reverse at 1 yr/s, scale switch while selected, drag, Reset, panel toggle, context
  loss/restore keeps Io selected, 3 round trips incl. one mid-flight). Renderer: `ANGLE (Google, Vulkan 1.3.0
(SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)`. FPS, time running, 1280 × 720: stylised
  57.0 whole system, 60.0 flying to/following Neptune, Earth, the Moon; real 60.0 flying/following Earth and the
  Moon, 60.0 following Neptune, **47.2 flying to Neptune** (starts at the whole-system view), **whole system 35–39
  vs 022's 44–50** (`322b1b6` worktree build, same script, same session). Cause, by elimination: D-038's 4 096-point
  planet lines (256 points → 44–50 again); not the stray check (no-op'd: 36–41), not labels or the panel (hidden:
  unchanged). SwiftShader's per-primitive cost; no real-GPU measurement. The lead chose a level of detail (D-040,
  T054). **Re-run after T054:** 1034 unit, 200 E2E, build green; entry 148.0 KB; Space 3.06 MB (code 51.2 KB);
  gate-5 probe clean again; same renderer. FPS: stylised 59.0 whole system, 60.0 every flight and follow; real
  whole system 43.3–51.8 (three runs 46.8 / 51.8 / 50.8), flying to Neptune 50.1, every other flight and follow
  60.0. What remains under 60 is 022's texture-sampling cost at whole-system views, accepted on this floor (D-034),
  which AC-17 names.

- [x] **T092** — Tick ACs in `spec.md` (Status `Implemented`), set `roadmap.md` 023 ✔️ (and Phase 3's exit), update
      `memory/progress.md`, `memory/MEMORY.md`, `memory/learnings.md` and `memory/decisions.md`.

## AC coverage

| AC    | Tasks                              |
| ----- | ---------------------------------- |
| AC-1  | T030, T033, T050, T051, T060       |
| AC-2  | T040, T041, T060                   |
| AC-3  | T033, T040, T050, T060             |
| AC-4  | T001, T020, T021, T022, T031, T061 |
| AC-5  | T022, T050, T061                   |
| AC-6  | T022, T023, T050, T061             |
| AC-7  | T001, T020, T053, T061             |
| AC-8  | T052, T061                         |
| AC-9  | T002, T032, T040, T060             |
| AC-10 | T032, T040, T052, T060             |
| AC-11 | T001, T031, T052, T062, T063       |
| AC-12 | T022, T040, T050, T060             |
| AC-13 | T002, T032                         |
| AC-14 | T033, T034, T062, T063             |
| AC-15 | T050, T062                         |
| AC-16 | T052, T062                         |
| AC-17 | T091                               |
