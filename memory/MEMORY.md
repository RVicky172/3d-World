# Project Memory — Index

> Read this first every session. Keep ≤ 40 lines. Rules: `specs/memory-management.md`.

## Current State (2026-10-06)

- **Phase:** 3 (Solar System, 020–023) **complete**: 020 ✔️, 021 ✔️, 022 ✔️, **023 ✔️**. Next phase: 4 (030 performance pass).
- **Last done:** **023-selection-focus is Implemented and verified** (`/spec-verify`, 2026-10-06), **not committed**; 021 `bf0d3e4` and 022 `322b1b6` committed but **not pushed** (`origin/main` = `601c597`):
  - 17 ACs verified; 1034 unit + 200 E2E; entry 148.0 KB (+0.1 of 5 KB); Space 3.06 MB of 4 (code 51.2 KB).
  - Click/tap or list selection at both scales, van Wijk–Nuij flights (≤ 2 s) + follow, clear-area view offset beside/above the info panel, live facts card (sourced `FACTS`), labels at both scales (dot under 3 px, D-037), Escape/Close/Reset, selection survives scale switch and context loss.
  - Core seams: info-panel `InfoSlot` + `SpaceInstance.attachInfo`; controls `flyTo`/`reframe`/`onReset`; `__WORLD__.selection()`, `cameraProjection().view`.
  - Decisions D-035–D-040 (038: 4 096-point real planet lines rebuilt on stray; 040: their 256-point far copy, fine line only where the sag would show ≥ 0.5 px — restored SwiftShader fps).
  - SwiftShader: flights 60 fps except real-scale to Neptune (50); real whole-system view 47–52 (022's texture cost, D-034).
- **Next step:** commit 023 (`feat(023): …`) when asked; then push 021–023. Then `/spec-new` for 030 (notes on the roadmap: real-GPU fps, texture cost, D-039's own-orbit-line fade).
- **Blockers:** none

## Files

- [decisions.md](decisions.md) — append-only decision log (why we chose X)
- [progress.md](progress.md) — session log, newest first
- [learnings.md](learnings.md) — gotchas and non-obvious fixes
