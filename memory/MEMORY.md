# Project Memory — Index

> Read this first every session. Keep ≤ 40 lines. Rules: `specs/memory-management.md`.

## Current State (2026-10-05)

- **Phase:** 3 (Solar System, 020–023): **020 ✔️**; 021 (orbital mechanics, time controls) is next on the roadmap.
- **Active feature:** none. 020 is **Implemented** but **not yet committed** (all work is in the working tree; 012 was committed as `dbd4882`, not pushed).
- **Last done:** **020-solar-system-data is Implemented** (2026-10-05):
  - 14 ACs verified; 652 unit + 145 E2E; entry 146.5 KB (+0.5 KB of the 3 KB cap); Space 12.7 KB.
  - 16 bodies from JPL with sources (NSSDC was unreachable); stylised (packed rings, exponent 0.25) and real (10⁶ km/unit) scales; one shared sphere, pivot groups ready for 021; dynamic near plane.
  - Real scale: name markers with moon rule + declutter (D-024); a zoom starting on a body re-centres on it (D-023: controls `focusOn(point, { minDistance })`, `zoomSpeed`).
  - Decisions D-022 (choices), D-023 (+ addendum), D-024. Chair description now "velvet lounge chair".
- **Next step:** commit 020 when the lead asks (`feat(020): solar system data and scale modes`), then `/spec-new 021`.
- **Blockers:** none

## Files

- [decisions.md](decisions.md) — append-only decision log (why we chose X)
- [progress.md](progress.md) — session log, newest first
- [learnings.md](learnings.md) — gotchas and non-obvious fixes
