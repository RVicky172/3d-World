# 002 — Hash Router & Deep Links

**Status:** Implemented
**Roadmap phase:** 1 · **Created:** 2026-10-04 · **Owner:** project lead

## Summary

Give every Space its own shareable address, so a visitor can bookmark or send a link that opens straight into
that Space. Use the browser's back and forward buttons to move between Spaces they visited. Addresses use the
URL hash (`#/space/solar-system`), which works on any static host, including a GitHub Pages sub-path, with no
server configuration (Constitution II, `tech-stack.md`). This replaces the temporary `?space=<id>` lookup from
feature 001 and gives the gallery (003) a way to navigate.

## User Stories

- **US-1:** As a visitor, I can open a link like `…/#/space/demo-cube` and land directly in that Space.
- **US-2:** As a visitor, I can copy the address while viewing a Space and share it, and the recipient sees the same Space.
- **US-3:** As a visitor, I can use the browser's back and forward buttons to return to Spaces I visited, without the page reloading.
- **US-4:** As a visitor using a screen reader or many tabs, the page title tells me which Space I am in.
- **US-5:** As a developer, I can navigate to a Space from code (e.g. a gallery card) without hand-building URLs.

## Acceptance Criteria

- [x] **AC-1:** Loading the site with `#/space/<id>` for a registered Space opens that Space. _(e2e)_
- [x] **AC-2:** Changing the hash while the site is open (typed in the address bar, a link, or code) switches to the new Space **without a full page reload**. _(e2e)_
- [x] **AC-3:** After visiting Space A then Space B, browser **Back** returns to A and **Forward** returns to B, each without a reload. _(e2e)_
- [x] **AC-4:** `#/space/<id>` with an unregistered id shows the existing "Space not found" message (feature 001, AC-8) and does not throw. _(e2e)_
- [x] **AC-5:** The home route (no hash, `#`, or `#/`) opens the default Space (`demo-cube`) while the address stays on the home route. Moving between `#/` and `#/space/<default id>` does not re-open the Space, because it is already showing. _(e2e)_
- [x] **AC-6:** An unrecognised route (e.g. `#/foo`, `#/space`, `#/space/a/b`) redirects to the home route and **replaces** the bad history entry, so Back does not return to it. It never throws, and the page never goes blank. _(unit + e2e)_
- [x] **AC-7:** Route parsing is lenient where it doesn't hurt:
  - a trailing slash is ignored (`#/space/demo-cube/` = `#/space/demo-cube`);
  - percent-encoded ids are decoded;
  - malformed encoding (e.g. `%E0%A4%A`) is treated as an unknown Space rather than throwing.

  _(unit)_

- [x] **AC-8:** Navigating from code to a Space updates the address and adds one history entry. Navigating to the Space that is already open does nothing: no reload of the Space and no duplicate history entry. _(unit + e2e)_
- [x] **AC-9:** The document title is `"<Space title> — 3D World"` whenever a Space is showing, including the default Space on the home route, and `"3D World"` when no Space is showing (e.g. "Space not found"). _(unit + e2e)_
- [x] **AC-10:** Rapidly changing the hash several times ends on the Space named by the **last** hash, with no console errors. _(e2e)_
- [x] **AC-11:** Deep links work when the site is served from a sub-path (e.g. GitHub Pages `/3d-World/`). _(e2e against a build with a non-root base)_
- [x] **AC-12:** The temporary `?space=<id>` query parameter from 001 is no longer supported and is ignored: `/?space=nope` behaves exactly like `/` (opens the default Space, no error). _(e2e)_

## Non-Functional Requirements

- Performance: the router adds ≤ 2 KB gzipped to the entry bundle. Switching Spaces via the router is no slower than calling the SpaceManager directly.
- Accessibility: page titles update per AC-9. Focus is not stolen on navigation.
- Resilience: no route input, however malformed, can throw or leave a blank screen.

## Out of Scope

- The gallery UI itself (003). This feature only provides the home route and code navigation it will use.
- Camera position or view state in the URL (backlog: "share-link with camera state").
- History-API (path-based) routing. Hash routing is the approved choice (`tech-stack.md`).
- Per-Space sub-routes (e.g. `#/space/solar-system/mars`). These are a later feature (023 selection & focus may want them).

## Resolved Questions

- **Q1 → (a)** Until the gallery (003) exists, the home route opens the default Space (demo-cube) as today. → AC-5.
  Feature 003 will redefine what the home route shows.
- **Q2 → (a)** The temporary `?space=<id>` parameter is removed; only hash routes are supported. → AC-12
- **Q3 → (a)** Unrecognised routes redirect to the home route, replacing the history entry. → AC-6

## Changelog

- 2026-10-04 — Created (Draft).
- 2026-10-04 — Q1–Q3 resolved (default Space on home, drop `?space=`, redirect unknown routes home). As a result,
  AC-9 now titles the page after whichever Space is showing, including on the home route. Approved.
- 2026-10-04 — Plan approved; tasks.md written (13 tasks). In Progress.
- 2026-10-04 — Implemented. All 12 ACs verified: 173 unit tests, 23 E2E tests (incl. 3 on a /3d-World/ sub-path build), entry 130.8 KB gz (+0.5 KB). Router/routes 100 % line coverage.
- 2026-10-04 — AC-5 (home route opens the default Space) **superseded by 003**: the home route now shows the gallery (D-008). The rest of 002 is unchanged; its E2E tests now expect the gallery on home.
