# 001 — Space Framework

**Status:** Implemented
**Roadmap phase:** 1 · **Created:** 2026-10-04 · **Owner:** project lead

## Summary

A core engine that owns one WebGL renderer and can load, display, switch between, and fully dispose
"Spaces" — self-contained 3D experiences that show either a single object or many objects in one world.
This is the foundation every showcase (model viewer, solar system, …) plugs into.

## User Stories

- **US-1:** As a visitor, I can open a Space and see it render smoothly in a full-window canvas.
- **US-2:** As a visitor, I can switch from one Space to another without reloading the page or the browser slowing down.
- **US-3:** As a developer, I can add a new Space by creating one folder and one registry entry, without touching the engine.

## Acceptance Criteria

- [x] **AC-1:** A `Space` contract (`SpaceMeta`, `SpaceContext`, `SpaceInstance`, `SpaceFactory`) exists as described in `architecture.md`. _(typecheck)_
- [x] **AC-2:** `SpaceManager.open(id)` lazy-loads the Space module; the module's code is in a separate chunk in the build output. _(unit + build)_
- [x] **AC-3:** Opening a second Space calls `dispose()` on the first before the second renders. _(unit)_
- [x] **AC-4:** After opening and closing a Space 10 times, `renderer.info.memory.geometries` and `.textures` return to the baseline. _(e2e)_
- [x] **AC-5:** The canvas resizes with the window, and the active Space's camera aspect updates. _(e2e)_
- [x] **AC-6:** The render loop pauses while the tab is hidden and resumes when visible. _(unit with mocked visibility)_
- [x] **AC-7:** `update(delta, elapsed)` receives time from an injectable `Clock`; a fake clock produces identical output for identical input. _(unit)_
- [x] **AC-8:** Opening an unknown Space id shows a "Space not found" message and does not throw. _(unit)_
- [x] **AC-9:** A placeholder `demo-cube` Space ships with the framework to prove the contract, with an E2E smoke test. _(e2e)_
- [x] **AC-10:** Switching Spaces fades out to the background colour (~300 ms), swaps the Space, then fades in. With `prefers-reduced-motion`, the swap is instant. _(unit + e2e)_
- [x] **AC-11:** A Space may opt in to custom rendering (e.g. an `EffectComposer` for bloom) by providing its own `render()`; the engine then calls it instead of `renderer.render(scene, camera)`. Spaces without it render normally. _(unit)_

## Non-Functional Requirements

- Engine + gallery shell JS ≤ 250 KB gzipped (Constitution IV).
- No console errors or WebGL warnings when switching Spaces.

## Out of Scope

Router/URL deep links (002), gallery UI (003), camera controls (004).

## Resolved Questions

- Switching Spaces uses a **fade transition** in v1 (instant with reduced motion). → AC-10
- Spaces **may** opt in to post-processing via a custom `render()` hook in v1. → AC-11

## Changelog

- 2026-10-04 — Created (Draft).
- 2026-10-04 — Open questions resolved (fade transition, opt-in post-processing hook); added AC-10 and AC-11. Approved.
- 2026-10-04 — Plan approved; tasks.md written. In Progress.
- 2026-10-04 — Implemented. All 11 ACs verified: 105 unit tests, 7 E2E tests, bundle check (entry 130.3 KB gz). Line coverage 96.6 %.
