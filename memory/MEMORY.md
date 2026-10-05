# Project Memory — Index

> Read this first every session. Keep ≤ 40 lines. Rules: `specs/memory-management.md`.

## Current State (2026-10-05)

- **Phase:** 2 (Single-Object Showcase) in progress: **010 ✔️**; 011 (asset pipeline) is next on the roadmap.
- **Active feature:** none. Next: `/spec-new` for **011** (GLB compression with Draco/Meshopt, KTX2 textures, loading progress UI). Measure the entry again there: decoders/loaders may grow it (D-013 left ~105 KB headroom under 250 KB).
- **Last done:** **010-model-viewer is Implemented** (2026-10-05), **not yet committed**:
  - 14 ACs verified; 379 unit + 90 E2E; entry 144.8 KB gzipped (+9.9 KB, inside the ≤ 10 KB NFR, D-013).
  - sheen-chair (CC0, D-014): 21.2 KB code + 3.93 MB GLB; shared viewer in `src/shared/model-viewer/`; loading indicator in `SpaceManager`.
  - AC-5 clarified: the 10 % zoom-out floor is on the bounding sphere (D-016).
  - Fixed a PMREM render-target texture leak (+1 GPU texture per visit) found by the AC-10 E2E.
  - E2E workers capped at `min(4, cores/4)`, override `E2E_WORKERS` (D-015), after a full run crashed the machine.
- **Next step:** commit 010 (`feat(010): model viewer Space`), then `/spec-new` 011.
- **Blockers:** none

## Files

- [decisions.md](decisions.md) — append-only decision log (why we chose X)
- [progress.md](progress.md) — session log, newest first
- [learnings.md](learnings.md) — gotchas and non-obvious fixes
