# 012 — Info Panel & Hotspots

**Status:** Implemented <!-- Draft | Approved | In Progress | Implemented | Superseded -->
**Roadmap phase:** 2 · **Created:** 2026-10-05 · **Owner:** project lead

## Summary

Inside a Space, the visitor currently sees the model but not what it is: the title and description exist only
on the gallery card and in the 3D view's accessible name. This feature adds an **info panel** with the Space's
title and description, readable without leaving the view. It also adds **hotspots**: markers attached to points
on the model that open short **annotations**, such as "Velvet with a sheen finish" on the seat or "Solid wood legs".
Hotspots turn "one object, many angles" into a guided look: the visitor learns what they are looking at while
they turn it. Phase 2 ends with this feature, and the solar system (023 "facts") can reuse the annotation UI.

## User Stories

- **US-1:** As a visitor, I want to read what a Space shows without going back to the gallery, so that I
  understand what I'm looking at.
- **US-2:** As a visitor, I want to hide the info panel, so that it doesn't cover the model while I explore.
- **US-3:** As a visitor, I want markers on interesting parts of the model that I can open for a short
  explanation, so that I notice details I would otherwise miss.
- **US-4:** As a keyboard or screen-reader user, I want to reach every hotspot and hear its annotation, so that
  the guided look isn't mouse-only.
- **US-5:** As a phone user, I want the panel and markers to fit a small screen and be easy to tap, so that they
  help rather than get in the way.
- **US-6:** As a content author, I want hotspots and descriptions defined as data, so that adding them to a new
  model needs no code.

## Acceptance Criteria

Each must be objectively testable. Note the test type that proves it.

### Info panel

- [x] **AC-1:** Every Space shows an info panel with its title (as a heading) and description, taken from the
      same data as its gallery card. It is **open** the first time; after that, the visitor's collapse/expand choice is
      remembered across Spaces and visits (a preference in `localStorage`, Constitution II). On wide screens it
      is a side panel, on narrow ones a bottom sheet (D-020). _(e2e; unit for the data link)_
- [x] **AC-2:** The panel can be collapsed and expanded with a clearly labelled control, by mouse, touch and
      keyboard. The control reports its state to assistive technology (expanded/collapsed). Keyboard focus is
      never lost or trapped when it toggles. _(e2e)_
- [x] **AC-3:** The panel doesn't block exploring. Interacting with it never moves the camera. At 320 × 640, when
      expanded, it covers at most **35 %** of the viewport. When collapsed, the
      model is framed as in 010 (AC-2's 50–90 % band). _(e2e)_
- [x] **AC-4:** The panel's content is exposed to screen readers as a named region whose heading is the Space's
      title, and it fits the existing Tab order: back link → 3D view → panel control → hotspots → "?" → "Reset
      view". _(e2e)_

### Hotspots

- [x] **AC-5:** A Space can define hotspots: points on its model, each with a short title and an annotation
      text. The Sheen Chair has **four**: the velvet seat, the wooden frame, the wooden legs and the
      printed label (copy in the plan, D-020, D-021). Each shows as a visible
      marker drawn over its point. _(unit for the data; e2e for markers)_
- [x] **AC-6:** **Markers stay attached.** As the camera orbits, zooms, pans, idles on the turntable and as the
      viewport resizes, each visible marker stays within **4 px** of its point's on-screen position. _(e2e:
      marker centre vs the point projected with the current camera, at several poses and two viewport sizes)_
- [x] **AC-7:** **Occlusion.** A marker whose point is hidden behind the model from the current view is
      **dimmed**: still visible, but it can't be activated or focused until its point faces the camera
      again. _(e2e at a front
      and a back view)_
- [x] **AC-8:** Activating a marker (click, tap, or Enter/Space when focused) opens its annotation: the title
      and text, near the marker or in the panel, and announced to screen readers. Only one annotation is open
      at a time. Escape, a close control or activating the marker again closes it, and focus returns to the
      marker. _(e2e)_
- [x] **AC-9:** Activating a hotspot **turns the camera to that hotspot's viewing direction** (from data) so
      its point faces the visitor, then opens the annotation. "Reset view" still returns home. With `prefers-reduced-motion`, any camera move is instant. _(e2e)_
- [x] **AC-10:** **Keyboard.** Every visible hotspot is reachable with Tab, in a stable order defined by the
      data, with a visible focus ring and an accessible name ("Hotspot: <title>"). While the 3D view itself has
      focus, the arrow keys still orbit (004). _(e2e)_
- [x] **AC-11:** **Touch and pointer.** Markers have a touch target of at least 44 × 44 CSS px. Clicking, tapping
      or dragging that starts on a marker or an annotation never orbits the camera, and dragging on the model
      still works between markers. _(e2e, including a touch context)_
- [x] **AC-12:** While an annotation is open, the idle turntable **pauses**. It resumes after the annotation closes,
      following its usual idle delay. With reduced motion the turntable is off anyway (005). _(e2e)_

### Content, lifecycle and budgets

- [x] **AC-13:** Titles, descriptions and hotspots (position on the model, title, text, order, and any view)
      live in the Space's typed data file. A unit test checks that every hotspot has non-empty text, a unique
      id, and a position on or near the model's surface (within its bounds). _(unit)_
- [x] **AC-14:** A Space with no hotspots (e.g. demo-cube) shows the panel and no markers, with no errors.
      _(e2e)_
- [x] **AC-15:** Leaving a Space removes the panel, markers, annotations and their listeners. 10 gallery ↔ chair
      round trips leave no extra DOM nodes and return GPU memory to the post-warm-up baseline. _(e2e)_
- [x] **AC-16:** After a WebGL context loss and restore (005), the panel and markers come back, attached to
      their points. _(e2e)_
- [x] **AC-17:** Entry bundle growth is at most **3 KB gzipped** over 011's
      145.6 KB, and the chair stays within its 5 MB Space budget. _(build check)_

## Scene / Content Notes

- **Panel text:** the registry already holds each Space's title and description (gallery card). The panel shows
  the same strings, so they can't drift apart. A longer description inside the Space is **out of scope**.
- **Hotspot content (chair):** candidates taken from the model itself: the velvet seat (sheen fabric), the wooden
  legs and frame, the brass/metal parts, the fabric label. Copy should be short (title ≤ 4 words, text ≤ 2
  sentences) and factual about what the visitor sees. No invented product claims. Final list in the plan, for review.
- **Positions** are in the model's own coordinates, so they stay correct when the viewer centres and frames the
  model. The model holds still; only the camera moves (D-009), so markers move only with the camera.

## Non-Functional Requirements

- **Performance:** updating markers costs no more than 1 ms per frame for ~10 hotspots on a mid-range laptop.
  No layout thrash: one batched DOM write per frame. Markers update only while the camera or viewport changes.
- **Accessibility:** WCAG 2.2 AA for the panel and markers: contrast, focus visible, target size, keyboard
  operable, and names, roles and states. The annotation is announced politely, not as an alert.
- **Resilience:** hotspot problems never break the Space. A hotspot whose point can't be projected (e.g. behind
  the camera) is simply hidden.

## Out of Scope

- Deep links to a hotspot (e.g. `#/space/sheen-chair/seat`): out of scope (Q5).
- Rich annotation content: images, video, links to other Spaces.
- Authoring tools: hotspots are written as data.
- Solar-system facts (023): it may reuse this UI, but it gets its own spec.
- Measuring tools, comparisons, AR.

## Resolved Questions

All resolved by the project lead on 2026-10-05 (D-020).

- **Q1 — Panel:** open the first time; the collapse/expand choice is remembered in `localStorage`. Side panel on
  wide screens, bottom sheet on phones.
- **Q2 — Occluded markers:** dimmed, and not activatable or focusable.
- **Q3 — Camera:** activating a hotspot turns the camera to the hotspot's stored viewing direction (instant under
  reduced motion).
- **Q4 — Chair hotspots:** four (seat, legs, frame and arms, label); copy is drafted in the plan for review.
- **Q5 — Deep links:** out of scope.
- **Q6 — Turntable:** pauses while an annotation is open.
- **Q7 — Entry allowance:** ≤ 3 KB gzipped, fixed.

## Changelog

- 2026-10-05 — Created.
- 2026-10-05 — Q1–Q7 resolved (D-020). Approved.
- 2026-10-05 — Plan approved (hotspot copy as drafted, pending T040's part check); tasks written. In Progress.
- 2026-10-05 — T040 probe: the chair has no arms, its legs are wood and the label is printed. AC-5's list is
  now seat, frame, legs, label; copy revised and approved (D-021).
- 2026-10-05 — Implemented: all 17 ACs verified (560 unit + 129 E2E; entry 146.0 KB, +0.4 KB; chair 1.87 MB).
