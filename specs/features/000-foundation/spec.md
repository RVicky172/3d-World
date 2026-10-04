# 000 — Project Foundation

**Status:** Implemented
**Roadmap phase:** 0 · **Created:** 2026-10-04 · **Owner:** project lead

## Summary

Set up a browser-only TypeScript + Three.js project with build, lint, unit tests, and E2E tests so every
later feature can follow the spec-driven, test-gated workflow.

## User Stories

- **US-1:** As a developer, I can run one command to start a dev server and see a WebGL canvas.
- **US-2:** As a developer (or agent), I can run one command that type-checks, lints, and unit-tests the project.
- **US-3:** As a developer, I can run E2E tests against a production build in a headless browser.

## Acceptance Criteria

- [x] **AC-1:** `npm run dev` serves a page that renders a Three.js scene in a full-window canvas. _(e2e)_
- [x] **AC-2:** `npm run check` runs `tsc --noEmit`, ESLint, and Vitest; all pass. _(cli)_
- [x] **AC-3:** `npm run test:e2e` builds, previews, and runs Playwright; the smoke test confirms the canvas exists and no console errors occur. _(e2e)_
- [x] **AC-4:** `npm run build` outputs a static `dist/` deployable to any static host. _(cli)_
- [x] **AC-5:** If WebGL2 is unavailable, a readable fallback message is shown instead of a blank page. _(unit)_

## Out of Scope

Space framework, router, gallery (feature 001+).

## Changelog

- 2026-10-04 — Created and implemented as part of project initiation.
