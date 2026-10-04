# 3D World — Roadmap

> Phased plan. Each phase is a set of feature specs. Update statuses as work moves.
> Status legend: ⬜ Not started · 📝 Spec drafted · ✅ Spec approved · 🚧 In progress · ✔️ Done

**Last updated:** 2026-10-04

---

## Phase 0 — Foundation

_Goal: the project builds, tests run, and the spec workflow is in place._

| #   | Feature                                                                            | Spec                      | Status |
| --- | ---------------------------------------------------------------------------------- | ------------------------- | ------ |
| 000 | Project scaffold: Vite + TS + Three.js, lint, Vitest, Playwright, CI-ready scripts | `features/000-foundation` | ✔️     |

**Exit criteria:** `npm run check`, `npm run test:e2e`, and `npm run build` all pass on a clean clone.

## Phase 1 — Core Engine & Gallery Shell

_Goal: one renderer that can load, switch, and dispose Spaces; a gallery to pick them._

| #   | Feature                                                                          | Spec                           | Status |
| --- | -------------------------------------------------------------------------------- | ------------------------------ | ------ |
| 001 | Space framework: `Space` contract, `SpaceManager`, render loop, resize, disposal | `features/001-space-framework` | ✔️     |
| 002 | Hash router & deep links (`#/`, `#/space/<id>`)                                  | —                              | ⬜     |
| 003 | Gallery page: cards for each registered Space, lazy loading                      | —                              | ⬜     |
| 004 | Shared camera controls (orbit/zoom/pan; mouse, touch, keyboard)                  | —                              | ⬜     |
| 005 | WebGL capability check + fallback screen, reduced-motion support                 | —                              | ⬜     |

**Exit criteria:** navigate gallery → placeholder Space → back, with no memory growth across 10 round-trips.

## Phase 2 — Single-Object Showcase

_Goal: the "one object, many angles" experience._

| #   | Feature                                                                             | Spec | Status |
| --- | ----------------------------------------------------------------------------------- | ---- | ------ |
| 010 | Model viewer Space: load a GLB, auto-frame, turntable, environment lighting         | —    | ⬜     |
| 011 | Asset pipeline: GLB compression (Draco/Meshopt), KTX2 textures, loading progress UI | —    | ⬜     |
| 012 | Info panel: title, description, hotspots/annotations on the model                   | —    | ⬜     |

## Phase 3 — Multi-Object Space: Solar System

_Goal: many objects in one shared world, animated together._

| #   | Feature                                                                                            | Spec | Status |
| --- | -------------------------------------------------------------------------------------------------- | ---- | ------ |
| 020 | Solar system data model (Sun, 8 planets, major moons) with stylised + real scale modes             | —    | ⬜     |
| 021 | Orbital mechanics: circular → Keplerian orbits, axial tilt, rotation; time controls (pause, speed) | —    | ⬜     |
| 022 | Planet textures, Saturn rings, starfield background, Sun glow                                      | —    | ⬜     |
| 023 | Selection & focus: click a planet to fly the camera to it, show facts                              | —    | ⬜     |

## Phase 4 — Polish & Launch

| #   | Feature                                                                  | Spec | Status |
| --- | ------------------------------------------------------------------------ | ---- | ------ |
| 030 | Performance pass: LOD, instancing, budgets enforced in CI                | —    | ⬜     |
| 031 | Accessibility audit & keyboard tour                                      | —    | ⬜     |
| 032 | Static deployment (GitHub Pages / Netlify / Vercel static) + CI workflow | —    | ⬜     |

## Backlog (unscheduled ideas)

- More Spaces: Earth–Moon system, atom model, galaxy particle field, architectural walkthrough
- Post-processing (bloom, tone mapping presets)
- Screenshot / share-link with camera state in URL
- VR/AR via WebXR
- PWA offline support
