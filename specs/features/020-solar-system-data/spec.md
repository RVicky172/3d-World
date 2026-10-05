# 020 — Solar System Data Model & Scale Modes

**Status:** Implemented <!-- Draft | Approved | In Progress | Implemented | Superseded -->
**Roadmap phase:** 3 · **Created:** 2026-10-05 · **Owner:** project lead

## Summary

Phase 3 builds a multi-object Space: the Solar System. This first feature defines **what is in it**: the Sun, the
eight planets and their major moons, each described by sourced physical and orbital data. It also defines **how
it is shown**: a stylised scale, where every body is visible and the layout is readable, and a real scale, where
sizes and distances keep their true proportions. That contrast is the point: the visitor sees how empty the
Solar System really is. The feature ships a first, simple **Solar System Space** in the gallery: plain spheres
in their places, a way to switch scales, and the shared camera controls. Motion (021), surfaces (022) and
selection with facts (023) build on this data.

## User Stories

- **US-1:** As a visitor, I want to open a Solar System Space from the gallery and see the Sun, the planets and
  their major moons, so that I can take in the whole system at a glance.
- **US-2:** As a visitor, I want to switch between a stylised view and a true-to-scale view, so that I understand
  both the order of the planets and how small and far apart they really are.
- **US-3:** As a visitor, I want to orbit, zoom and pan around the system with mouse, touch or keyboard, as in
  other Spaces, so that I can look at any part of it.
- **US-4:** As a keyboard or screen-reader user, I want the scale switch and the current scale to be announced,
  so that the true-scale view isn't a mystery blank screen.
- **US-5:** As a content author, I want every body's data in one typed, sourced data file, so that later features
  (orbits, textures, facts) and corrections need no render-code changes.

## Acceptance Criteria

Each must be objectively testable. Note the test type that proves it.

### Data

- [x] **AC-1:** The data lists the Sun, the eight planets in order from the Sun, and the seven major moons
      (radius ≥ 1 000 km: the Moon, Io, Europa, Ganymede, Callisto, Titan, Triton; Q2), each with a unique id, a display name, its parent body (the Sun has
      none) and a representative colour. _(unit)_
- [x] **AC-2:** Every body has its physical data: mean radius, rotation period and axial tilt. Every body except
      the Sun also has its orbital data, complete enough for 021 to compute motion (Q4): semi-major axis, orbital
      period, eccentricity and inclination; planets also longitude of the ascending node, longitude of
      perihelion and mean longitude at a stated epoch (J2000). Moons carry the same angles where their source
      gives them. Values are in stated real-world units. _(unit)_
- [x] **AC-3:** The data is **plausible and consistent**. A unit test checks that:
  - radii, distances and periods are positive;
  - planets are ordered by distance, and every moon orbits closer to its planet than the planet's next
    neighbour;
  - orbital periods follow Kepler's third law within 5 % (for planets about the Sun, for moons about their
    planet).

  _(unit)_

- [x] **AC-4:** The data names its sources (e.g. NASA planetary fact sheets, public domain) and the date they
      were taken, and its numbers match those sources to the precision stated. _(unit: source fields present;
      review)_

### Scale modes

- [x] **AC-5:** **Stylised scale:** every body is visible at the home view as a distinct sphere. The bodies keep
      their order from the Sun, larger bodies stay larger, no two bodies overlap, and every moon is drawn outside
      its planet. The spec's Scene Notes state how sizes and distances are compressed. _(unit for the mapping;
      e2e for visibility)_
- [x] **AC-6:** **Real scale:** all sizes and distances share one scale, so any two ratios (e.g. Earth's radius
      ÷ Jupiter's, Neptune's distance ÷ Earth's) match the data within 0.1 %. _(unit)_
- [x] **AC-7:** The visitor can switch scale with a clearly labelled control, by mouse, touch and keyboard. The
      control reports the current scale to assistive technology, and the change is announced politely. Keyboard
      focus stays on the control. The Space opens in **stylised** scale the first time; after that the visitor's
      choice is remembered across visits (a preference in `localStorage`, like 012's panel; Q3). _(e2e)_
- [x] **AC-8:** After a switch, the camera frames the whole system for the new scale (out to Neptune's orbit).
      With reduced motion any change is instant. _(e2e)_
- [x] **AC-8a:** **Finding bodies at real scale (Q5):** at real scale each planet gets a small name marker drawn
      over its true position, within 4 px, so the visitor can find bodies that are smaller than a pixel. The
      spheres stay exactly to scale; zooming in reveals them. A moon's marker shows only when it is at least
      24 px from its planet's. Where two names would overlap, the larger body keeps its name and the other shows
      only its dot; names stay inside the view (D-024). Markers are labels, not controls (selecting a body is 023).
      Stylised scale has no markers. _(unit for the rules; e2e)_

### The Space

- [x] **AC-9:** A "Solar System" card in the gallery opens the Space (lazy-loaded). It shows the info panel
      (012) with its title and description, renders a non-blank canvas with no console errors, and uses the
      shared camera controls (004). _(e2e)_
- [x] **AC-10:** The Sun looks self-lit, and the planets and moons are lit by it, so their sides facing the Sun are
      brighter. Surfaces are plain colours from the data; textures come in 022. _(e2e: brighter on the sunward
      side)_
- [x] **AC-11:** Bodies hold still in this feature: no orbital motion or spin (021). The idle turntable may orbit
      the camera, as in other Spaces. _(e2e: body positions unchanged over time)_
- [x] **AC-12:** Leaving the Space frees everything. 10 gallery ↔ solar-system round trips return GPU memory to
      the baseline and leave no extra DOM. After a WebGL context loss and restore, the Space comes back in the
      same scale. _(e2e)_
- [x] **AC-13:** Budgets: entry growth ≤ **3 KB gzipped** over 012's 146.0 KB (Q6), and the Space stays well
      within its 5 MB budget (no textures yet). It keeps 60 FPS on a mid-range laptop. _(build check; manual FPS
      note)_

## Scene / Content Notes

- **Bodies (proposal):** Sun; Mercury, Venus, Earth, Mars, Jupiter, Saturn, Uranus, Neptune; moons with a mean
  radius ≥ 1 000 km: the Moon, Io, Europa, Ganymede, Callisto, Titan and Triton (7). Pluto and other dwarf
  planets are out of scope (Q2).
- **Real vs stylised (Constitution VII):** _real_ = one linear scale for every size and distance, so the
  planets are sub-pixel at a view that fits the orbits. _Stylised_ = distances and radii compressed by a
  monotonic mapping (e.g. a power or log curve, chosen in the plan), with moons placed by their order rather than
  their true distance. Ordering and "bigger stays bigger" hold in both. The exact stylised curves are a plan
  decision and are stated in the plan for review.
- **Positions:** with no motion yet (021), each body sits at a fixed, data-defined angle on its orbit, spread out
  so the system looks natural (Q1). 021 replaces these with computed positions.
- **Lighting:** a light at the Sun; the Sun itself is emissive. Glow, rings and textures are 022.
- **Camera:** the shared controls (004) focused on the Sun. Distance limits follow the current scale.
- **Assets:** none in this feature (plain spheres), so `CREDITS.md` gains only the data source line if the
  project lead wants it recorded there.

## Non-Functional Requirements

- **Performance:** 60 FPS on a mid-range laptop, 30 FPS on a mid-range phone, with ~16 bodies. A scale switch
  doesn't rebuild geometry or stall for more than one frame.
- **Accessibility:** the scale control meets WCAG 2.2 AA (name, role, state, focus, 44 px target). The current
  scale is part of the 3D view's description, so screen-reader users know what they're looking at.
- **Precision:** real-scale distances span ~10⁵ (Mercury's radius to Neptune's orbit, ~10⁹ m). Rendering at
  real scale must not flicker or jitter (depth precision, float precision).

## Out of Scope

- Orbital motion, rotation, time controls (021).
- Textures, rings, starfield, Sun glow (022).
- Selecting a body, flying to it, facts, and labels in stylised scale (023). Only real scale gets name markers
  here (AC-8a).
- Dwarf planets, asteroids, comets, spacecraft.
- Deep links to a body.

## Resolved Questions

All resolved by the project lead on 2026-10-05 (D-022).

- **Q1 — Fixed positions:** each body at a fixed, data-defined angle on its orbit, spread out (no orbit maths
  yet).
- **Q2 — Moons:** the seven with radius ≥ 1 000 km: the Moon, Io, Europa, Ganymede, Callisto, Titan, Triton.
- **Q3 — Default scale:** stylised; the visitor's choice is remembered in `localStorage`.
- **Q4 — Data scope:** the full orbital data now, so 021 only adds the maths.
- **Q5 — Real scale:** name markers over the true positions; the spheres stay exactly to scale.
- **Q6 — Entry allowance:** ≤ 3 KB gzipped, fixed.

## Changelog

- 2026-10-05 — Created.
- 2026-10-05 — Q1–Q6 resolved (D-022); AC-8a added for real-scale markers. Approved.
- 2026-10-05 — Plan approved as drafted (stylised thresholds ≥ 3 px at 1280 × 720, ≥ 1 px at 320 × 640; Sun marker at real scale); tasks written. In Progress.
- 2026-10-05 — T001 spike: OrbitControls' zoom-to-cursor can't reach a body; at real scale a zoom that starts on a body re-centres on it instead (D-023). No AC change.
- 2026-10-05 — T027 screenshots: at the real-scale home view the Sun's and inner planets' names overprinted, and Neptune's was clipped at 320 px. AC-8a gains the declutter rule (D-024).
- 2026-10-05 — Implemented: all 14 ACs verified (652 unit + 145 E2E; entry 146.5 KB, +0.5 KB; Space 12.7 KB).
