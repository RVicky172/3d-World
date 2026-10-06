# 023 — Selection & Focus: Fly to a Body, Show Its Facts

**Status:** Implemented <!-- Draft | Approved | In Progress | Implemented | Superseded -->
**Roadmap phase:** 3 · **Created:** 2026-10-06 · **Owner:** project lead

## Summary

The Solar System now moves correctly (021) and looks real (022), but the visitor can only look at it from afar.
Bodies can't be picked, getting close to a small planet means a lot of zooming, and the Space says nothing
about what each body is. This feature lets the visitor **select a body** (the Sun, a planet or a moon) and the
camera **flies to it** and keeps it in view as it moves, while a **facts card** shows what makes it remarkable:
its size, distance, day, year, tilt, moons and a short description. Bodies also get **name labels at stylised
scale** (020–022 deferred them here), so the visitor knows what they are looking at before they select it. Every
body can be selected by mouse, touch and keyboard, and a screen-reader user can tour the system body by body.
Phase 3 ends with this feature.

## User Stories

- **US-1:** As a visitor, I want to click or tap a planet to fly to it, so that I can see it up close without
  zooming and panning by hand.
- **US-2:** As a visitor, I want to read a few key facts about the body I selected, so that I learn what makes it
  special and how it compares with Earth.
- **US-3:** As a visitor, I want the camera to stay on the selected body while time runs, so that it doesn't
  drift out of view as it orbits.
- **US-4:** As a visitor, I want to see the bodies' names at stylised scale too, so that I know which planet is
  which before I pick one.
- **US-5:** As a visitor, I want an easy way back to the whole system, so that I can pick another body.
- **US-6:** As a keyboard or screen-reader user, I want to choose any body from a list and hear its facts, so
  that the tour isn't mouse-only.
- **US-7:** As a content author, I want the facts as sourced data, so that corrections need no render-code
  changes.

## Acceptance Criteria

Each must be objectively testable. Note the test type that proves it.

### Selecting

- [x] **AC-1:** **Click or tap a body to select it**, at both scales. A click counts only if the pointer barely
      moved (a drag still orbits the camera, as in 004). A body is easy to hit even when it is drawn only a few
      pixels wide: the hit area is at least **44 × 44 CSS px** around its on-screen centre, and where two
      overlap the one nearest the pointer wins (Q1). Clicking empty
      space does nothing (no accidental deselect while orbiting). _(unit for hit-testing; e2e)_
- [x] **AC-2:** **Every body can be chosen from a list in the info panel** (Q2): the Sun, the planets in order,
      each planet's moons under it, reachable by keyboard and announced as a list of buttons. Choosing one does
      the same as clicking the body. _(e2e, keyboard only)_
- [x] **AC-3:** **One selection at a time.** The selected body is marked as selected in the 3D view (e.g. its
      label highlighted) and in the list (`aria-pressed` / `aria-current`), and the selection is announced
      politely. Selecting another body moves the selection. _(e2e)_

### Flying and following

- [x] **AC-4:** **The camera flies to the selected body** in a smooth, eased move of at most **2 s** (Q3), ending with the body centred and filling about
      **a third** of the shorter viewport side, seen from its sunlit side where possible. With
      `prefers-reduced-motion` the move is instant. _(unit for the path and end pose; e2e for the final framing)_
- [x] **AC-5:** **The view follows the body** while time runs (extending 021's follow, AC-10): it stays centred
      within **4 px** as the body orbits, and the visitor can still orbit and zoom around it. Panning ends the
      follow, as in 021. _(e2e)_
- [x] **AC-6:** **The fly can be interrupted:** any orbit, zoom, pan, "Reset view" or new selection during the
      move cancels it at once, with no jump. _(e2e)_
- [x] **AC-7:** **Real scale works:** the fly reaches even the smallest body (e.g. Mercury, the Moon) without
      depth flicker or jitter, and zoom limits allow a close view of it. _(e2e: close-up of the Moon at real
      scale is non-blank and stable over several frames)_
- [x] **AC-8:** **Scale switch while selected:** the selection survives a scale switch and the camera re-frames
      the same body at the new scale (Q4). _(e2e)_

### Facts

- [x] **AC-9:** **A facts card** shows the selected body's name (as a heading), a one- or two-sentence
      description and its key facts (Q5): diameter, average distance from the Sun (or its planet), length of
      day, length of year (or orbit), axial tilt, number of known moons and mass, in metric units, with diameter
      and mass also as "× Earth" (Q6). The day is the sidereal rotation (one turn); the Sun's card omits distance
      and year, which don't apply (D-036).
      _(unit for formatting; e2e)_
- [x] **AC-10:** **Facts are live where they change:** the body's current distance from the Sun (a moon's: from its planet;
      Q7) updates with the simulated date, without announcing each change. _(unit; e2e)_
- [x] **AC-11:** **Placement:** the card appears in the info panel, in place of the Space description while a body is
      selected (Q8), never covers the selected body at the end of the fly, and at
      320 × 640 the card plus panel cover at most **35 %** of the viewport (as 012 AC-3). _(e2e)_
- [x] **AC-12:** **Closing:** Escape, a close control or "Reset view" clears the selection and closes the card.
      Escape and the close control leave the camera where it is (and end the follow); "Reset view" goes home as
      always (Q9). Focus returns to the control that made the selection (the list button, or the 3D view after a
      click). _(e2e)_
- [x] **AC-13:** **Facts are sourced data:** every body has a description and every listed fact, in the Space's
      typed data, with sources and the date taken; numbers that 020 already holds (radius, periods, tilt) are not
      duplicated. A unit test checks completeness, positivity and agreement with 020's values. _(unit)_

### Labels

- [x] **AC-14:** **Stylised-scale labels:** each body has a name label drawn next to it (within 4 px of its
      anchor as it moves), following 020 AC-8a's declutter rules (a moon's label only when it is far enough from
      its planet's; the larger body keeps its name where two overlap; labels stay in view). They
      are always shown (Q10). Labels
      never block dragging on the canvas except where they are click targets (AC-1). _(unit for the rules; e2e)_

### Integration, lifecycle and budgets

- [x] **AC-15:** **Time is unaffected:** selecting, flying and closing never pause or change the simulated clock
      or speed (Q11). The idle turntable stays paused while a body is selected (as 012
      AC-12). _(e2e)_
- [x] **AC-16:** **Lifecycle:** leaving frees everything (10 round trips back to the baseline, no extra DOM).
      After a WebGL context loss and restore, the same body is still selected and followed. A new visit starts
      with nothing selected. _(e2e)_
- [x] **AC-17:** **Budgets:** entry growth ≤ **5 KB gzipped** over 022's 147.9 KB (Q12);
      the Space stays ≤ 4 MB (022 AC-13); 60 FPS on a mid-range laptop during a fly with time running (SwiftShader
      floor as D-034). _(build check; manual FPS note)_ — 2026-10-06: entry 148.0 KB (+0.1); Space 3.06 MB;
      SwiftShader: every flight and follow 60 fps except real-scale flying to Neptune (50, it starts at the
      whole-system view) and the real-scale whole-system view (47–52, level with 022; D-034's texture cost), after
      D-040's line level of detail.

## Scene / Content Notes

- **Bodies:** all 16 from 020 are selectable, the Sun included.
- **Camera:** builds on 004's controls, 020's `focusOn` (D-023) and 021's follow. 020 noted that re-centring is
  instant and "an eased version can come with 023's flying"; whether the real-scale wheel re-centre also becomes
  eased is a plan question.
- **Facts copy:** short and factual, written for a general visitor (no jargon without explanation), each number
  traceable to a source (NASA planetary/satellite fact sheets, public domain). Draft copy goes in the plan for
  review, as 012's hotspot copy did.
- **Reuse:** 012's annotation/panel UI and 020's marker layer where they fit; the plan decides.
- **Scale (Constitution VII):** facts always state real values, whatever the scale shown.

## Non-Functional Requirements

- **Performance:** picking costs ≪ 1 ms per click; labels keep the write-only-on-change rule (one batched DOM
  write per frame). No allocation per frame during a fly.
- **Accessibility:** WCAG 2.2 AA: every selectable body reachable by keyboard, names/roles/states, focus visible,
  44 px targets, polite announcements, no keyboard trap. Arrow keys still orbit while the 3D view has focus (004).
- **Determinism:** the fly is driven by the frame delta (Constitution VI); E2E can read the selection and fly
  state through the test hook and wait on a "fly finished" signal, not a sleep.

## Out of Scope

- Deep links to a body (e.g. `#/space/solar-system/mars`) (Q13).
- Comparing two bodies side by side; search.
- Rich content in the card (images, video, links).
- Dwarf planets, asteroids, comets, spacecraft.
- A guided automatic tour (031 may add a keyboard tour).

## Resolved Questions

All resolved by the project lead on 2026-10-06, accepting the drafted proposals (D-035).

- **Q1 — Hit targets:** click the body itself, with a ≥ 44 px hit area around its on-screen centre.
- **Q2 — Body list:** in the info panel.
- **Q3 — Fly:** ≤ 2 s, eased; the body ends about a third of the shorter side, seen from its sunlit side.
- **Q4 — Scale switch:** the selection survives and the camera re-frames the same body.
- **Q5 — Facts:** description plus diameter, distance, day, year, tilt, number of moons, mass.
- **Q6 — Units:** metric only; diameter and mass also as "× Earth".
- **Q7 — Live distance:** current distance from the Sun (a moon's from its planet).
- **Q8 — Card placement:** in the info panel, in place of the Space description while selected.
- **Q9 — On close:** the camera stays; "Reset view" goes home.
- **Q10 — Stylised labels:** always shown, with 020's declutter rules.
- **Q11 — Time:** keeps running; selecting never pauses it.
- **Q12 — Entry allowance:** ≤ 5 KB gzipped.
- **Q13 — Deep links:** out of scope.

## Changelog

- 2026-10-06 — Created.
- 2026-10-06 — Q1–Q13 resolved with the drafted proposals (D-035). Approved.
- 2026-10-06 — Plan approved; review points resolved (D-036): the Sun's card omits distance and year; "day" is
  the sidereal rotation; a real-scale re-centre keeps the selection. AC-9 notes the first two. Tasks written. In
  Progress.
- 2026-10-06 — T091 found D-038's 4 096-point planet lines cost ~10 fps on SwiftShader at real scale; the lead
  chose a far/near level of detail (D-040, plan §10a, T054). No AC text changes; AC-17's evidence is re-measured.
- 2026-10-06 — All 17 ACs verified (T091). Implemented.
