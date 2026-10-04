# 003 — Gallery Page

**Status:** Implemented
**Roadmap phase:** 1 · **Created:** 2026-10-04 · **Owner:** project lead

## Summary

Give visitors a front door: a gallery that lists every 3D Space the site offers, so they can see what exists and
pick one. Today the home route drops visitors straight into a default Space (decision D-007). The gallery replaces
that.

Each Space appears as a card with its title, a short description, and whether it shows a single object or many
objects in one world. Choosing a card opens that Space. A clear control inside every Space leads back to the
gallery.

The gallery must stay light: browsing it must not download any Space's code (Constitution III, IV).

## User Stories

- **US-1:** As a first-time visitor, I land on a page that shows me which 3D Spaces exist and what each one is.
- **US-2:** As a visitor, I can open a Space by clicking or tapping its card, or with the keyboard.
- **US-3:** As a visitor inside a Space, I can get back to the gallery in one obvious step, and the browser's Back button works too.
- **US-4:** As a visitor on a phone, the gallery is readable and usable without horizontal scrolling.
- **US-5:** As a screen-reader or keyboard user, I can understand and operate the gallery fully.
- **US-6:** As a developer, a Space I add to the registry appears in the gallery with no gallery code changes.

## Acceptance Criteria

- [x] **AC-1:** The home route (`""`, `#`, `#/`) shows the gallery, with one card per registered Space in registry order. _(unit + e2e)_
- [x] **AC-2:** Each card shows the Space's title, its description, and a label for its kind ("Single object" or "Multi-object"). _(unit + e2e)_
- [x] **AC-3:** Each card has a preview area:
  - if the Space defines a `thumbnail`, the area shows that image, loaded lazily and treated as decorative because the title already names the card;
  - if there is no `thumbnail`, or the image fails to load, the area shows a generated placeholder: an icon for the Space's kind plus its initials.
  - Either way, the card's size and layout do not change.

  _(unit + e2e: demo-cube has no thumbnail; a test registry entry has a broken one)_

- [x] **AC-4:** Activating a card by click, tap, or Enter on the focused card opens that Space at `#/space/<id>`. It adds one history entry, and browser Back returns to the gallery. _(e2e)_
- [x] **AC-5:** Showing the gallery downloads **no** Space code. A Space's code is fetched only when that Space is opened. _(e2e: network requests)_
- [x] **AC-6:** No Space is ever mounted while the gallery is showing. Returning to the gallery from a Space disposes that Space. After 10 gallery → Space → gallery round trips, GPU memory equals the gallery baseline: the backdrop alone (AC-13). This is the same check as 001 AC-4. _(e2e)_
- [x] **AC-7:** Every Space screen, including "Space not found", shows a visible "Back to gallery" control. It is reachable by keyboard and returns to the gallery (`#/`). _(e2e)_
- [x] **AC-8:** The page title on the gallery is `"3D World"`. Inside a Space, titles follow 002 AC-9. _(e2e)_
- [x] **AC-9:** Accessibility:
  - the gallery has a level-1 heading;
  - the cards form a list;
  - each card is a single focusable link whose accessible name includes the Space's title;
  - focus is clearly visible;
  - tab order follows visual order.

  _(e2e)_

- [x] **AC-10:** Layout:
  - at 360 px wide, the cards stack in one column with no horizontal scrolling;
  - at 1280 px wide, they form a multi-column grid;
  - text stays readable over the background in both cases.

  _(e2e)_

- [x] **AC-11:** Moving between the gallery and a Space uses the existing fade transition, which is instant with reduced motion. It never shows a half-disposed Space or a blank flash, and logs no console errors. _(e2e)_
- [x] **AC-12:** Adding a Space to the registry makes it appear in the gallery with no other code changes. _(unit: gallery rendered from a test registry)_
- [x] **AC-13:** Behind the cards, the gallery shows a subtle animated 3D backdrop: a slowly drifting starfield.
  - It is drawn with the site's single renderer; it does not create a second one.
  - It shows only on the gallery. Opening a Space removes it, and returning to the gallery brings it back.
  - With `prefers-reduced-motion` it is still, rendered as a static star field.
  - It uses no image or asset files.
  - It never reduces card text contrast below the accessibility NFR.

  _(unit + e2e: canvas is non-blank behind the gallery; with reduced motion two frames 500 ms apart are identical)_

## Changes to Earlier Features

- **002 AC-5 is superseded:** the home route shows the gallery instead of the default Space. The 002 tests that rely
  on "home = demo-cube" are updated in this feature.
- **D-007's default-Space rule ends:** decision D-008 records that the gallery replaces it.
- Unknown routes still redirect to `#/`, which is now the gallery.

## Non-Functional Requirements

- Performance:
  - the gallery, including the backdrop, adds ≤ 5 KB gzipped to the entry bundle, excluding thumbnail images;
  - the backdrop costs at most a few draw calls and stays at 60 FPS on a mid-range laptop;
  - the gallery is interactive within 1 s (test build, local server).
- Accessibility: WCAG 2.2 AA colour contrast for card text. Keyboard-only use is possible, and gallery motion respects `prefers-reduced-motion`.
- Content: any thumbnail image is a licensed asset recorded in `public/assets/CREDITS.md` (Constitution IX).

## Out of Scope

- Search, filtering or sorting the cards (for example by single/multi).
- Live animated 3D previews on each card.
- Camera controls inside Spaces (004).
- Site-wide navigation beyond "Back to gallery" (an about page, a header menu).

## Resolved Questions

- **Q1 → (a)** The gallery lives at the home route `#/`. The default-Space-on-home behaviour from 002 and D-007 is
  removed. → AC-1
- **Q2 → (b)** The gallery has a subtle animated 3D starfield backdrop, which is still under reduced motion.
  → AC-13. AC-6's memory baseline is therefore "gallery with backdrop".
- **Q3 → (b)** Cards show a per-Space thumbnail image, falling back to a generated placeholder when the image is
  missing or broken. → AC-3

## Changelog

- 2026-10-04 — Created (Draft).
- 2026-10-04 — Q1–Q3 resolved (gallery at `#/`, starfield backdrop, thumbnails with placeholder fallback).
  AC-6 baseline redefined to include the backdrop. Approved.
- 2026-10-04 — Plan approved; tasks.md written (15 tasks). In Progress.
- 2026-10-04 — AC-6 clarified (no behaviour change): the gallery baseline is taken after one warm-up visit to a Space. The first physically based material makes three.js create a shared DFG lookup texture that the renderer keeps for its lifetime. It is one texture, it never grows, and it is not a leak, so the baseline means "backdrop + renderer-owned shared resources".
- 2026-10-04 — Implemented. All 13 ACs verified: 217 unit tests, 40 E2E tests (incl. 3 sub-path). Entry 132.8 KB gz (+2.0 KB, NFR ≤ 5 KB). Coverage: gallery/router/back link 95–100 % lines. Not measured: the 60 FPS and "interactive within 1 s" NFRs (no real GPU in CI); supported by design (1 draw call, 1500 points) and fast E2E loads.
