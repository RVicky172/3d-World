# Project Memory — Index

> Read this first every session. Keep ≤ 40 lines. Rules: `specs/memory-management.md`.

## Current State (2026-10-05)

- **Phase:** 2 (Single-Object Showcase) **complete: 010 ✔️, 011 ✔️, 012 ✔️**. Phase 3 (Solar System, 020–023) is next on the roadmap.
- **Active feature:** none. 012 is **Implemented** but **not yet committed** (all work is in the working tree).
- **Last done:** **012-info-panel is Implemented** (2026-10-05):
  - 17 ACs verified; 560 unit + 129 E2E (~1.1 min at 4 workers); entry 146.0 KB (+0.4 KB of the 3 KB cap); chair 1.87 MB.
  - Info panel in every Space (core; registry strings; collapse remembered in `localStorage`; side panel / bottom sheet).
  - Hotspots (`src/shared/hotspots/`): markers within 4 px, dimmed when hidden (own any-hit occlusion, D-021), annotation turns the camera (`turnTo`) and pauses the turntable (`holdTurntable`). Chair: seat, frame, legs, label.
  - Decisions D-020 (choices), D-021 (copy after the probe, occlusion test). Architecture doc updated.
- **Next step:** commit 012 when the lead asks (`feat(012): info panel and hotspots`), then `/spec-new 020`. Open question to the lead: the chair's registry description says "armchair" but it has no arms.
- **Blockers:** none

## Files

- [decisions.md](decisions.md) — append-only decision log (why we chose X)
- [progress.md](progress.md) — session log, newest first
- [learnings.md](learnings.md) — gotchas and non-obvious fixes
