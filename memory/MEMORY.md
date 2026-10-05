# Project Memory — Index

> Read this first every session. Keep ≤ 40 lines. Rules: `specs/memory-management.md`.

## Current State (2026-10-05)

- **Phase:** 1 (Core Engine & Gallery Shell) is **complete** (001–005 ✔️). Phase 2 (Single-Object Showcase) is next.
- **Active feature:** none. **005-resilience-reduced-motion is Implemented** (2026-10-05):
  - 12 ACs verified; 327 unit + 73 E2E; entry 134.9 KB gzipped.
  - Covers the boot fallback (no WebGL2 / renderer fails, `data-webgl`), `<noscript>`, `ContextGuard` (suspend on loss, rebuild on restore, Reload), and the live reduced-motion preference.
  - 005 is **not committed yet**; 001–004 are committed and pushed (main).
  - Known, deferred: on narrow portrait phones demo-cube nearly fills the width; auto-framing is planned for 010.
- **Next step:** commit 005 (when asked), then `/spec-new` for **010 — Model viewer Space** (load a GLB, auto-frame, turntable, environment lighting). It needs a licensed GLB asset (Constitution IX) and must not create a second renderer.
- **Blockers:** none

## Files

- [decisions.md](decisions.md) — append-only decision log (why we chose X)
- [progress.md](progress.md) — session log, newest first
- [learnings.md](learnings.md) — gotchas and non-obvious fixes
