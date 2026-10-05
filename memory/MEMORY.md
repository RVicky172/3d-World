# Project Memory — Index

> Read this first every session. Keep ≤ 40 lines. Rules: `specs/memory-management.md`.

## Current State (2026-10-05)

- **Phase:** 2 (Single-Object Showcase): **010 ✔️, 011 ✔️**; 012 (info panel: title, description, hotspots/annotations) is next on the roadmap.
- **Active feature:** none. Next: `/spec-new` for **012**.
- **Last done:** **011-asset-pipeline is Implemented** (2026-10-05), **not yet committed**:
  - 15 ACs verified; 475 unit + 99 E2E (~44 s at 4 workers); entry 145.6 KB (+0.8 KB).
  - Chair 4.1 → 1.26 MB (Meshopt + KTX2 via `npm run assets`; originals in `assets-src/`); Space 1.86 MB incl. the 571 KB transcoder.
  - Download progress bar + %, spoken at 25/50/75 %, then "<title> loaded" (D-019); decoder failure → "Failed to load"; workers freed after load.
  - Decisions D-017 (choices), D-018 (+ sharp addendum, tooling), D-019 (pixel-diff parity ≤ 2.0, "loaded" announcement).
- **Next step:** commit 011 (`feat(011): asset pipeline`), then `/spec-new` 012. Measure the entry again in 012 (145.6 KB of 250 KB used).
- **Blockers:** none

## Files

- [decisions.md](decisions.md) — append-only decision log (why we chose X)
- [progress.md](progress.md) — session log, newest first
- [learnings.md](learnings.md) — gotchas and non-obvious fixes
