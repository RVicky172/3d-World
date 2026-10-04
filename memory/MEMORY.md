# Project Memory — Index

> Read this first every session. Keep ≤ 40 lines. Rules: `specs/memory-management.md`.

## Current State (2026-10-04)

- **Phase:** 1 (Core Engine & Gallery Shell) — 001, 002, 003 done; 004 (camera controls) and 005 (WebGL/reduced-motion gaps) not started.
- **Active feature:** none. **003-gallery is Implemented** (2026-10-04): 13 ACs verified, 217 unit + 40 E2E, entry 132.8 KB gz. 001–003 are committed and pushed to github.com/RVicky172/3d-World (main).
- **Next step:** `/spec-new` for **004 — shared camera controls** (orbit/zoom/pan; mouse, touch, keyboard; OrbitControls from three/examples per tech-stack). Note for 005: WebGL fallback and reduced-motion fades already exist; its spec should cover only the gaps.
- **Blockers:** none

## Files

- [decisions.md](decisions.md) — append-only decision log (why we chose X)
- [progress.md](progress.md) — session log, newest first
- [learnings.md](learnings.md) — gotchas and non-obvious fixes
