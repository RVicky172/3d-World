# 021 — Orbital Mechanics & Time Controls

**Status:** Implemented <!-- Draft | Approved | In Progress | Implemented | Superseded -->
**Roadmap phase:** 3 · **Created:** 2026-10-05 · **Owner:** project lead

## Summary

020 put the Sun, the planets and their major moons in place, but they stand still at fixed angles. This feature
sets them in motion. Planets follow their real elliptical, inclined orbits; moons circle their planets; every body
spins about its tilted axis. The visitor controls a simulated clock: play, pause and change speed, and can always
see the date being shown. The planets' positions match where they really are on that date, so the visitor can
watch the inner planets lap the outer ones, Venus and Uranus spin the "wrong" way, and the Moon keep the same face
to Earth. 022 (surfaces) and 023 (selection and facts) build on the moving system.

## User Stories

- **US-1:** As a visitor, I want the planets and moons to move along their orbits, so that the Solar System feels
  alive and I can see how fast each one goes.
- **US-2:** As a visitor, I want to pause, play and speed up time, so that I can watch years pass or stop to look
  at one moment.
- **US-3:** As a visitor, I want to see the date being shown and know the positions are real for that date, so
  that I can trust what I'm looking at.
- **US-4:** As a visitor, I want each body to spin about its tilted axis, so that I can see seasons' cause (tilt),
  Venus's and Uranus's odd spins, and moons that always face their planet.
- **US-5:** As a keyboard, touch or screen-reader user, I want the time controls to be reachable and their state
  announced, so that the moving view isn't mouse-only or confusing.
- **US-6:** As a visitor who prefers reduced motion, I want the system to start still, so that nothing moves
  until I choose.

## Acceptance Criteria

Each must be objectively testable. Note the test type that proves it.

### Motion

- [x] **AC-1:** **Planets are where they really are.** For any date the controls allow, each planet's position
      relative to the Sun matches JPL's positions for that date: heliocentric ecliptic longitude and latitude
      within **1°**, distance within **1 %**. Checked against a reference table of JPL positions at several dates.
      _(unit)_
- [x] **AC-2:** **Orbits have their true shape at real scale:** each planet's orbit is an ellipse with its
      eccentricity and inclination, with the Sun at a focus. At stylised scale, each body moves on its 020 ring
      (a circle) at its **true angle** around its parent for the date (Q3), so 020's "nothing overlaps" holds at
      every date. _(unit)_
- [x] **AC-3:** **Moons orbit their planets** in the right direction (Triton backwards) with their true periods.
      Their position around the planet at the reference dates is within **10°** of JPL's (**Triton: 30°**,
      D-026). _(unit)_
- [x] **AC-4:** **Spin and tilt:** every body turns about an axis tilted by its axial tilt, once per sidereal
      rotation period of simulated time. Venus and Uranus turn backwards. Each large moon keeps the same face
      towards its planet (its facing follows its orbit, at any speed). A body whose spin would exceed **one turn
      per second** of real time holds its orientation instead of strobing (Q6). _(unit; e2e for a visible turn)_
- [x] **AC-5:** **Motion follows only the simulated date.** The same date always gives the same scene, whatever
      speed or path led to it. Nothing moves while paused, or while the tab is hidden (the render loop already
      stops). _(unit)_

### Time controls

- [x] **AC-6:** The visitor can **play and pause** time and **choose a speed**: 1 day, 1 week, 1 month or 1 year
      per second, **forwards or backwards** (Q2); the default is 1 week per second forwards. By mouse, touch and
      keyboard. Each control reports
      its state to assistive technology, keyboard focus stays where it is, and a change is announced politely.
      _(unit; e2e)_
- [x] **AC-7:** **The date shown is always visible** as text (e.g. "12 Mar 2031"), updated as time runs. It is
      exposed to screen readers without announcing every change. _(e2e)_
- [x] **AC-8:** **Start and range:** the Space opens at **today's date** (Q1). Time stays within **1800–2050**,
      the elements' validity (Q7): at a limit it pauses there and says so (politely announced). _(unit; e2e)_
- [x] **AC-9:** **Reduced motion:** with `prefers-reduced-motion`, time starts **paused**; the visitor can still
      play it. _(e2e)_

### Integration

- [x] **AC-10:** **Real-scale markers follow the moving bodies** (within 4 px, as in 020 AC-8a), and a zoom that
      starts on a body still re-centres on it (D-023). While time runs, a re-centred view **follows that body**
      until the visitor pans, resets or re-centres elsewhere (Q4). _(unit; e2e)_
- [x] **AC-11:** **Orbit paths:** every planet's and moon's orbit is drawn as a faint line at **both scales**
      (Q5), matching the path its body travels (true ellipses at real scale, the rings at stylised scale). The
      lines never catch pointer events. _(unit for the shapes; e2e)_
- [x] **AC-12:** **Lifecycle:** leaving frees everything (10 round trips back to the baseline). After a WebGL
      context loss and restore, the Space comes back at the same date, speed and play/pause state. A new visit
      starts fresh: today, 1 week per second, playing (paused with reduced motion); only the scale is remembered
      (Q8). _(e2e)_
- [x] **AC-13:** **Budgets:** 60 FPS on a mid-range laptop with time running; entry growth ≤ **5 KB gzipped**
      over 020's 146.5 KB (Q9); the Space stays well within 5 MB. _(build check; manual FPS note)_

## Scene / Content Notes

- **Data:** 020's `data.ts` already holds what this needs (D-022): planets' J2000 elements (a, e, I, L, ϖ, Ω),
  moons' mean elements (a, e, i, Ω, ω, M, P), rotation periods and tilts (IAU: tilt > 90° = backwards spin).
  021 adds the maths and, for AC-1/AC-3, a reference table of JPL positions read at dev time (nothing fetched at
  runtime). It may also need each body's pole direction (not only the tilt angle) to orient spin axes; the plan
  says if so.
- **Accuracy:** JPL's approximate elements are valid 1800–2050 to within a fraction of a degree for most planets;
  outside that range errors grow (Q7). Moon mean elements are referenced to each planet's Laplace plane; the plan
  states how that plane is approximated.
- **Scale choices (Constitution VII):** real scale keeps true ellipses; stylised scale keeps 020's rings with true
  angles (Q3). Spin is true to the simulated clock, but held still above one turn per second (Q6). Fast moons
  (Io circles Jupiter ~4 times a second at 1 week/s) move as fast as the clock says; their positions stay true.
- **Time** comes only from the frame delta (Constitution VI); the date is simulated, never read from the clock
  inside Space logic. The Space opens "today" (Q1): the core passes the start date in.

## Non-Functional Requirements

- **Performance:** solving Kepler's equation for ~15 bodies per frame costs ≪ 1 ms; no allocation per frame in
  the motion code. Markers keep 020's write-only-on-change rule (they now change every frame while time runs).
- **Accessibility:** time controls meet WCAG 2.2 AA (names, roles, states, focus visible, 44 px targets). The
  date is readable text. A running simulation is not announced continuously.
- **Determinism:** unit tests drive the simulated clock with explicit deltas; E2E can set or read the date through
  the test hook.

## Out of Scope

- Selecting a body, flying to it, facts and labels in stylised scale (023).
- Textures, rings, starfield, Sun glow (022).
- Precession, nutation, perturbations beyond the approximate elements' rates, relativistic effects.
- Dwarf planets, asteroids, comets, spacecraft trajectories.
- Deep links to a date.

## Resolved Questions

All resolved by the project lead on 2026-10-05 (D-025).

- **Q1 — Start date:** today; the core passes the wall-clock date in.
- **Q2 — Speeds:** 1 day, 1 week, 1 month, 1 year per second, forwards or backwards; default 1 week/s forwards.
- **Q3 — Stylised orbits:** circles on 020's rings at each body's true angle.
- **Q4 — Following:** a re-centred view follows its body until the visitor pans, resets or re-centres.
- **Q5 — Orbit paths:** faint lines for every orbit, at both scales.
- **Q6 — Fast spin:** held still above one turn per second.
- **Q7 — Date range:** 1800–2050; time pauses at a limit and says so.
- **Q8 — Remember:** no; each visit starts fresh (only the scale is remembered).
- **Q9 — Entry allowance:** ≤ 5 KB gzipped.

## Changelog

- 2026-10-05 — Created.
- 2026-10-05 — Q1–Q9 resolved (D-025); default speed 1 week/s. Approved.
- 2026-10-05 — Plan approved as drafted (core seams `startTime`/`savedState`, controls `follow`, NAIF poles, Laplace plane ≈ equator, spin hold at W0); tasks written. In Progress.
- 2026-10-05 — AC-3: Triton's allowance 30° (D-026). T013 measured the JPL satellite table's moons drifting
  far past 10°; mean-longitude rates now come from NAIF's synchronous spin rates and Titan's epoch angle from
  Horizons, which bring the other six moons within 5.3°. Triton stays up to 25.1° off (1850).
- 2026-10-06 — Implemented: all 13 ACs verified (766 unit + 159 E2E; entry 146.6 KB, +0.1; Space 17.3 KB; 60.2 fps under SwiftShader; gate-5 probe clean). D-026–D-028.
