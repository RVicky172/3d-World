# 005 — WebGL Resilience & Reduced Motion

**Status:** Implemented <!-- Draft | Approved | In Progress | Implemented | Superseded -->
**Roadmap phase:** 1 · **Created:** 2026-10-05 · **Owner:** project lead

## Summary

Constitution V says the site must respect `prefers-reduced-motion` and must never show a blank screen when 3D
cannot run. Much of this already exists: a "WebGL2 is not available" screen when the boot-time check fails
(000), and reduced-motion handling in the fade transition, gallery starfield, card hover, controls hint,
turntable and orbit damping (001, 003, 004). This feature closes the remaining gaps so that a visitor always
sees either a working Space or a clear, readable explanation, and so that motion preferences are honoured
consistently. It finishes Phase 1.

**Audit of what exists (2026-10-05):**

| Area                                                    | State                                                |
| ------------------------------------------------------- | ---------------------------------------------------- |
| WebGL2 missing at boot → fallback message               | ✅ Exists, unit-tested only — no E2E proves it       |
| WebGL2 reported available, but the renderer fails       | ❌ Not handled — uncaught error, blank page          |
| GPU context lost mid-session (driver reset, tab memory) | ❌ Not handled — frozen or blank canvas              |
| JavaScript disabled                                     | ❌ Not handled — empty page                          |
| Reduced motion read at boot                             | ✅ Fader, starfield, cards, hint, turntable, damping |
| Reduced motion changed while the page is open           | ❌ Ignored until reload                              |
| Machine-readable signal for tests (fallback shown)      | ❌ None — E2E can only wait on `data-space-ready`    |

## User Stories

- **US-1:** As a visitor whose browser or GPU cannot run WebGL2, I want a clear message telling me why
  nothing is drawn and what I can try, so that I am not left staring at a blank page.
- **US-2:** As a visitor whose graphics context is lost while I am viewing a Space, I want to be told and
  given a way to get back, so that a frozen picture does not look like a broken site.
- **US-3:** As a visitor with JavaScript disabled, I want to be told the site needs JavaScript, so that I
  understand the empty page.
- **US-4:** As a visitor who has asked my OS to reduce motion, I want every automatic animation on the site
  to stop or slow, including when I change the setting while the page is open, so that the site does not
  make me uncomfortable.
- **US-5:** As a developer, I want the fallback states exposed as page signals, so that E2E tests can prove
  them without fixed sleeps.

## Acceptance Criteria

Each must be objectively testable. Note the test type that proves it.

### Fallback when 3D cannot start

- [x] **AC-1:** Given a browser where WebGL2 is unavailable, when the site loads at any URL (`#/`,
      `#/space/<id>`, an unknown route), then the fallback message is shown, no canvas is present, and no
      uncaught error is logged. _(e2e — WebGL2 disabled via an init script)_
- [x] **AC-2:** Given the WebGL2 check passes but creating the renderer fails, when the site loads, then the
      same fallback message is shown instead of a blank page, and the error is not left uncaught.
      _(unit + e2e)_
- [x] **AC-3:** When the fallback message is shown, `<body>` carries a signal identifying the fallback state
      (distinct from the existing `data-space-status` values), so tests can wait on it. _(unit + e2e)_
- [x] **AC-4:** The fallback message is announced to assistive technology (`role="alert"`), uses a single
      level-1 heading, meets WCAG AA contrast against the page background, and is readable at 320 px width
      without horizontal scrolling. _(e2e)_
- [x] **AC-5:** Given JavaScript is disabled, when the page loads, then a readable message explains that the
      site needs JavaScript (and WebGL2). _(e2e — JavaScript disabled context)_

### Losing the graphics context mid-session

- [x] **AC-6:** Given a Space or the gallery is showing, when the WebGL context is lost, then within one
      second the visitor sees a message explaining that the 3D view stopped, and `<body>` carries a signal
      for that state. _(e2e — context loss forced with the `WEBGL_lose_context` extension)_
- [x] **AC-7:** After a context loss, the message offers a keyboard-reachable "Reload" button that reloads the
      page at the current URL. If the browser restores the context, the current view (gallery or Space)
      reopens by itself, the message is removed and the view-ready signal is set again. _(unit + e2e)_
- [x] **AC-8:** A context loss produces no uncaught errors, and the render loop does no work while the
      context is lost. _(unit + e2e)_

### Reduced motion

- [x] **AC-9:** Given `prefers-reduced-motion: reduce`, every automatic motion on the site (Space
      transition fade, gallery starfield, card hover transition, controls-hint animation, turntable,
      orbit damping) is stopped or slowed as each feature already specifies. This AC is a
      single E2E regression check over the existing behaviour, not new behaviour. _(e2e — emulated media)_
- [x] **AC-10:** Given the page is open, when the reduced-motion preference changes, then the new
      preference applies to every gallery or Space opened afterwards, without a page reload. CSS-driven
      motion (card hover, controls hint) follows the setting immediately. The JS-driven motion in the view
      that is already open (turntable, damping, starfield, fade) need not change until the next view is
      opened. _(unit + e2e — emulated media change)_
- [x] **AC-11:** The OS/browser `prefers-reduced-motion` setting is the only source of the motion
      preference; the site adds no on-page motion toggle. _(covered by AC-9/AC-10)_

### Hygiene

- [x] **AC-12:** All new listeners (context-loss, media-query change) are removed when their owner is
      disposed; the existing 10-round-trip memory check still passes. _(unit + e2e)_

## Scene / Content Notes

No new Space or scene content. Copy for the messages (draft, to be confirmed at review):

- WebGL2 unavailable (exists): "WebGL2 is not available — This site needs WebGL2 to show 3D spaces. Try a
  recent version of Chrome, Edge, Firefox, or Safari, and make sure hardware acceleration is enabled."
- Context lost: "The 3D view stopped — Your device's graphics were interrupted (this can happen after a
  driver update or when memory runs low)."
- No JavaScript: "3D World needs JavaScript and WebGL2 to show its 3D spaces."

## Non-Functional Requirements

- Performance: no measurable cost while things are healthy — the entry bundle grows by ≤ 2 KB gzipped;
  no per-frame work added.
- Accessibility: messages are text-only, `role="alert"`, keyboard-reachable actions with visible focus,
  WCAG AA contrast (Constitution V).
- Resilience: no state in this feature leaves the page blank or throws an uncaught error.

## Out of Scope

- A non-WebGL rendering path (2D/static images of Spaces, WebGL1 or WebGPU fallback).
- Low-power / "performance mode" quality switching (030).
- Full accessibility audit and keyboard tour (031).
- Detecting slow GPUs (`failIfMajorPerformanceCaveat`) and downgrading quality.
- An on-page reduce-motion toggle (Q3); listing Spaces on the fallback screen (Q4).
- Changing JS-driven motion in the already-open view when the preference changes (Q2).

## Open Questions

All resolved 2026-10-05 (D-011). The project lead delegated the choices, preferring simplicity because this is a learning project.

- **Q1 (AC-7):** Both. Recover automatically when the context is restored, and show a "Reload" button in case it isn't.
- **Q2 (AC-10):** The change applies from the next view opened; CSS-driven motion updates immediately.
- **Q3 (AC-11):** OS setting only, with no on-page toggle.
- **Q4:** The fallback stays a plain message.

## Changelog

- 2026-10-05 — Created.
- 2026-10-05 — Q1–Q4 resolved (D-011); AC-7, AC-10, AC-11 made concrete; demo-cube spin removed from AC-9 (it no longer self-rotates, per D-009). Approved.
- 2026-10-05 — Implemented. All 12 ACs verified: 327 unit + 73 E2E (12 in `resilience.spec.ts`), entry 134.9 KB gzipped (+0.7 KB, NFR ≤ 2 KB), no console errors or warnings across lose/restore.
