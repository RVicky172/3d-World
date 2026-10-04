# Project Memory — Index

> Read this first every session. Keep ≤ 40 lines. Rules: `specs/memory-management.md`.

## Current State (2026-10-04)

- **Phase:** 1 (Core Engine & Gallery Shell) — 001–004 done; only 005 (WebGL fallback / reduced-motion gaps) left in Phase 1.
- **Active feature:** none. **004-camera-controls is Implemented** (2026-10-04): 13 ACs verified, 293 unit + 61 E2E, entry 134.2 KB gzipped. 001–004 are committed and pushed to github.com/RVicky172/3d-World (main). Known, deferred: on narrow portrait phones demo-cube nearly fills the width (fixed camera distance); auto-framing is planned for 010.
- **Next step:** (next session) `/spec-new` for **005 — WebGL capability check + fallback, reduced motion**. Much already exists (WebGL2 fallback screen from 000; reduced motion in Fader, starfield, turntable and damping), so the spec should audit and cover only the gaps (e.g. context loss, a runtime motion toggle?). Phase 1 then ends.
- **Blockers:** none

## Files

- [decisions.md](decisions.md) — append-only decision log (why we chose X)
- [progress.md](progress.md) — session log, newest first
- [learnings.md](learnings.md) — gotchas and non-obvious fixes
