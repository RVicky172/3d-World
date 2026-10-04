# 3D World — Constitution

> The non-negotiable principles of this project. Every spec, plan, task, and line of code must comply.
> If a change needs to break a principle, amend this document first (see "Amendments").

**Version:** 1.0.0 · **Ratified:** 2026-10-04

---

## Mission

Build a browser-based website that showcases **3D Spaces** — self-contained interactive 3D experiences.
A Space can present a **single object** (e.g. a detailed model on a turntable) or **many objects sharing one world**
(e.g. a solar system with orbiting planets). The site is a gallery of these Spaces.

## Core Principles

### I. Spec Before Code

No feature code is written without an approved spec in `specs/features/NNN-name/`.
The flow is always **Specify → Plan → Tasks → Implement → Verify** (see `workflow.md`).
Bug fixes and refactors that do not change behavior may skip the spec but must still be logged in `memory/progress.md`.

### II. Browser-Only, Zero Backend

- The site is 100% static: HTML, JS, CSS, and assets served from a CDN/static host.
- No servers, databases, serverless functions, or runtime API calls we control.
- All state lives in the URL (routing, deep links) or `localStorage` (user preferences only).
- Third-party network calls at runtime are forbidden unless approved in an amendment.

### III. Every Space Is a Self-Contained Module

- A Space implements the `Space` contract (see `architecture.md`) and lives in `src/spaces/<space-id>/`.
- Spaces never import from other Spaces. Shared code goes into `src/core/` or `src/shared/`.
- Spaces are **lazy-loaded**; the gallery must not pay for Spaces the user has not opened.
- A Space must release **everything** it allocates (geometries, materials, textures, listeners, animation loops) on `dispose()`.

### IV. Performance Is a Feature

- Target **60 FPS** on a mid-range laptop (integrated GPU) and **30 FPS minimum** on a mid-range phone.
- Initial page load (gallery) JS budget: **≤ 250 KB gzipped**, including Three.js core.
- Each Space's own code + assets: **≤ 5 MB** compressed unless the spec justifies more.
- Use compressed assets (glTF/GLB with Draco/Meshopt, KTX2 textures) for anything non-trivial.
- Device pixel ratio is capped (default `min(devicePixelRatio, 2)`).

### V. Accessible and Resilient

- Every Space is controllable by **mouse, touch, and keyboard**.
- Respect `prefers-reduced-motion` (pause or slow auto-animations).
- If WebGL2 is unavailable, show a clear fallback message — never a blank screen.
- Every Space has a text title and description readable by screen readers.

### VI. Test-Gated Delivery

- No task is "done" until its tests pass: `npm run check` (types + lint + unit) and, for UI flows, `npm run test:e2e`.
- Pure logic (math, orbit calculations, routing, data parsing) must have unit tests.
- Every Space has at least one E2E smoke test: it loads, renders a non-blank canvas, and disposes without errors.
- Time is injectable: animation logic takes `elapsed`/`delta` as input so tests are deterministic.

### VII. Data-Driven Content

- Scene content (planet sizes, orbit radii, colors, model paths) lives in typed data files, not hard-coded in render logic.
- Scientific Spaces state their scale choices (real vs. stylised) in the spec.

### VIII. Simplicity and Small Dependencies

- Prefer Three.js primitives and our own small helpers over new libraries.
- Adding a runtime dependency requires a justification in `specs/tech-stack.md` (size, license, why not hand-rolled).
- YAGNI: build what the current roadmap phase needs, nothing more.

### IX. Licensed Assets Only

- Every 3D model, texture, font, and sound has its source and license recorded in `public/assets/CREDITS.md`.
- Only CC0, CC-BY (with attribution), public-domain (e.g. NASA imagery), or self-made assets.

### X. Memory Is Maintained

- The agent and humans keep `memory/` current: decisions, progress, and learnings (see `memory-management.md`).
- A session that changes direction or discovers a pitfall records it before ending.

## Quality Gates (Definition of Done)

A feature is **Done** when all are true:

1. Spec status is `Implemented` and all acceptance criteria are checked.
2. `npm run check` passes (typecheck, lint, unit tests).
3. `npm run test:e2e` passes.
4. `npm run build` succeeds and bundle budgets hold.
5. No console errors or WebGL warnings during the E2E run.
6. `memory/progress.md` and `specs/roadmap.md` are updated.

## Governance & Amendments

- This constitution supersedes all other docs. Conflicts are resolved in its favor.
- Amend by editing this file in a dedicated change: bump the version (MAJOR = principle removed/redefined,
  MINOR = principle added, PATCH = wording), and record the reason in `memory/decisions.md`.
