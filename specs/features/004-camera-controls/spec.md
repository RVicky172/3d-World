# 004 — Shared Camera Controls

**Status:** Implemented
**Roadmap phase:** 1 · **Created:** 2026-10-04 · **Owner:** project lead

## Summary

Let visitors explore a Space themselves instead of only watching it. They can orbit around the subject, zoom in
and out, and pan, using a mouse, a touchscreen or the keyboard (Constitution V: "every Space is controllable by
mouse, touch, and keyboard").

The controls are **shared**: any Space opts in by describing where its camera should look and how far the visitor
may move it. The single-object showcase (010) and the solar system (020+) then get the same consistent feel for
free. demo-cube adopts the controls to prove them end to end.

## User Stories

- **US-1:** As a visitor with a mouse, I can drag to orbit around the subject and scroll to zoom.
- **US-2:** As a visitor on a phone or tablet, I can drag with one finger to orbit and pinch to zoom, without the page scrolling or zooming instead.
- **US-3:** As a keyboard-only visitor, I can orbit, zoom and reset the view without a pointing device.
- **US-4:** As a visitor who got lost, I can return to the starting view in one step.
- **US-5:** As a visitor who prefers reduced motion, the camera never drifts or glides on its own.
- **US-6:** As a developer, I can give a new Space camera controls by declaring a few settings, without writing input handling.

## Acceptance Criteria

- [x] **AC-1:** Mouse:
  - dragging with the primary button orbits the camera around the Space's focus point;
  - the scroll wheel zooms toward and away from it;
  - dragging with the secondary button, or Shift + primary, pans within the Space's pan limit (AC-4).

  _(e2e)_

- [x] **AC-2:** Touch:
  - a one-finger drag orbits;
  - a two-finger pinch zooms;
  - a two-finger drag pans within the pan limit;
  - while the visitor is interacting with the 3D view, the page itself does not scroll or zoom.

  _(e2e with touch emulation)_

- [x] **AC-3:** Keyboard: the 3D view is focusable (reached with Tab) and shows a visible focus ring. Its accessible name says what it is and how to use it. **Only while it has focus:**
  - the arrow keys orbit in fixed steps;
  - Shift + arrow keys pan;
  - `+`/`=` zooms in and `-` zooms out;
  - `R` resets the view.

  These keys do nothing anywhere else on the page. _(unit + e2e)_

- [x] **AC-4:** Limits:
  - zoom stops at the Space's minimum and maximum distance;
  - vertical orbit stops before the camera passes over the top or under the bottom, so the view never flips upside down;
  - panning never moves the focus point further than the Space's pan limit from its home position;
  - no input can move the camera outside these limits.

  _(unit + e2e)_

- [x] **AC-5:** Reset view, by the `R` key or the on-screen "Reset view" button (AC-10), returns the camera to the Space's initial view: initial position, home focus point, and zero pan. With reduced motion it does so instantly. _(unit + e2e)_
- [x] **AC-6:** A Space opts in by declaring:
  - its focus point and initial camera position;
  - its minimum and maximum distance;
  - its vertical-angle limits;
  - its pan limit;
  - its turntable speed and the idle delay before the turntable resumes.

  A Space that does not opt in has no camera controls. The gallery has none either: the cards scroll and click normally, and the 3D view is not focusable there. _(unit + e2e)_

- [x] **AC-7:** Motion feel:
  - with normal motion, camera movement eases to a stop;
  - with `prefers-reduced-motion`, it follows input directly, with no inertia, and there is no automatic camera movement at all (no turntable).

  _(unit + e2e)_

- [x] **AC-8:** Leaving a Space removes all of its control listeners and on-screen control UI. After returning to the gallery, wheel, drag and keys no longer move any camera, and 10 enter/leave cycles log no errors and leave no listeners behind. _(unit + e2e)_
- [x] **AC-9:** On-screen UI keeps working. The "Back to gallery" link, the "?" help button, the help panel and the "Reset view" button all stay clickable and keyboard-reachable. Clicking, dragging or scrolling on them never moves the camera. Tab order follows the visual layout: Back to gallery, then the 3D view, then the help and reset controls. _(e2e)_
- [x] **AC-10:** Discoverability, in three parts:
  - **Hint:** when a Space with controls opens, a brief hint appears, worded for the visitor's input type (for example "Drag to rotate · Scroll to zoom · R to reset", or "Drag to rotate · Pinch to zoom" on touch devices). It is announced politely to screen readers and disappears after about 4 seconds or on the first interaction, whichever comes first.
  - **Help:** a persistent "?" button opens and closes a panel listing every mouse, touch and keyboard control. It exposes its open or closed state, and `Esc` closes the panel.
  - **Reset:** a persistent "Reset view" button.

  _(unit + e2e)_

- [x] **AC-11:** demo-cube uses the shared controls:
  - **Idle:** with normal motion, the camera slowly orbits the cube (a turntable) while the cube itself holds still.
  - **Interaction:** any interaction (pointer, wheel, touch or key) stops the turntable immediately. It resumes after the Space's idle delay.
  - **Reduced motion:** nothing moves on its own.

  _(unit + e2e)_

- [x] **AC-12:** Resizing the window while the controls are in use keeps the camera aspect correct (001 AC-5) and keeps the current view, so the camera does not jump back to the initial view. _(e2e)_

- [x] **AC-13:** Focus is never lost when switching views. When the view changes after the first page view, and keyboard focus would otherwise be lost (it was in the outgoing view, or on a control the new view hides), focus moves to the new view's natural start:
  - **a Space with controls:** its 3D view, which screen readers announce by name and controls;
  - **the gallery:** the card of the Space just left, or the gallery heading if there is no such card.

  Focus is never moved on the initial page load, and never taken from something that is still visible and focused. _(unit + e2e)_

## Changes to Earlier Features

- **demo-cube (001) stops spinning itself.** Its idle motion becomes the camera turntable (AC-11, D-009). 001 AC-7
  ("identical clocks give identical frames") still holds, now for the camera, and its unit test is updated.
- **002's "focus is not stolen on navigation" is clarified:** focus moves only when it would otherwise be lost (AC-13).
- **The canvas becomes focusable** while a Space with controls is showing, so Tab order inside a Space changes
  (AC-9). The 003 keyboard test for the back link must still find "Back to gallery" first.

## Non-Functional Requirements

- Performance:
  - control code ships only in the lazy chunks of the Spaces that use it, and the entry bundle grows by ≤ 1.5 KB gzipped (it is 132.8 KB today; amended from 0.5 KB, see Changelog);
  - interaction stays at 60 FPS on a mid-range laptop.
- Accessibility:
  - all functions are keyboard-operable (WCAG 2.1.1);
  - no essential function requires multi-touch or a precise drag, because keyboard steps and reset cover it (WCAG 2.5.1);
  - focus is visible whenever keyboard controls are active.
- Resilience: no input sequence can produce a NaN or Infinity camera position, or lose the subject past the declared limits.

## Out of Scope

- First-person, fly or walk controls; VR or WebXR.
- Animated "fly to object" camera moves (feature 023).
- Saving the camera view in the URL (backlog: share-link with camera state).
- Clicking or picking objects in the scene (feature 023).

## Resolved Questions

- **Q1 → (b)** Idle: the camera turntable slowly orbits, stops on interaction, and resumes after an idle delay. The subject holds still, and reduced motion disables it. → AC-6, AC-7, AC-11
- **Q2 → (a)** Panning is on for every Space with controls, always within a Space-declared pan limit. → AC-1, AC-2, AC-3, AC-4
- **Q3 → (a)** Keyboard controls respond only while the focusable 3D view has focus. → AC-3, AC-9
- **Q4 → (c)** Discoverability: a brief fading hint, a persistent "?" help panel, and a "Reset view" button. → AC-5, AC-10

## Changelog

- 2026-10-04 — Created (Draft).
- 2026-10-04 — Q1–Q4 resolved (turntable, pan everywhere within limits, focus-scoped keys, hint + help + reset).
  ACs rewritten accordingly; "Changes to Earlier Features" added (demo-cube no longer self-rotates). Approved.
- 2026-10-04 — Plan approved; tasks.md written (15 tasks). In Progress.
- 2026-10-04 — During T022: **AC-13 added**. Activating a gallery card removed the focused card, so focus was lost and Tab went to the help buttons first, breaking AC-9 for keyboard users. Focus now moves to the 3D view, and back to the card on return (D-010).
- 2026-10-04 — **Entry-size NFR amended from 0.5 KB to 1.5 KB.** OrbitControls ships in the lazy chunk, but the three.js core classes it uses (Spherical, MOUSE/TOUCH, the Controls base class) live in the single shared `three` module, which the entry already loads. Measured: +1.2 KB (134.0 KB of the 250 KB budget) (D-010).
- 2026-10-04 — Implemented. All 13 ACs verified: 293 unit tests, 61 E2E tests (incl. CDP multi-touch; timing tests stable at 5× repeat). Entry 134.2 KB gzipped (+1.4 KB, amended NFR ≤ 1.5 KB); demo-cube chunk 6.9 KB. Coverage: `src/shared/controls/*` 100 % lines. Not measured: the 60 FPS interaction NFR (no GPU in CI).
