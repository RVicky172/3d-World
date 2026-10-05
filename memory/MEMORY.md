# Project Memory — Index

> Read this first every session. Keep ≤ 40 lines. Rules: `specs/memory-management.md`.

## Current State (2026-10-06)

- **Phase:** 3 (Solar System, 020–023): **020 ✔️, 021 ✔️**; next **022** (planet textures, Saturn rings, starfield, Sun glow).
- **Active feature:** **022-solar-system-surfaces**: `spec.md` **In Progress** (13 ACs; D-029, D-030: Space ≤ 4 MB with the decoder), `plan.md` Approved, `tasks.md` written (26 tasks). No new dependencies.
- **Last done:** **021-orbital-mechanics is Implemented** (2026-10-06), not yet committed:
  - 13 ACs verified; 766 unit + 159 E2E; entry 146.6 KB (+0.1 of the 5 KB cap); Space 17.3 KB; 60.2 fps under SwiftShader.
  - Planets from JPL Table 1 + rates (≤ 0.17° of Horizons, 1800–2050); moons corrected per D-026 (Triton allowed 30°); NAIF spin with a fast-spin hold; time controls (4 speeds, backwards, 1800–2050); orbit lines at both scales (D-027); follow after a re-centre; saved time across context loss.
  - Core seams: `SpaceContext.startTime`/`savedState`, `SpaceInstance.saveState`/`simTime`/`setSimTime`, controls `follow`.
  - Decisions D-026 (moon corrections), D-027 (moon line refresh), D-028 (ambient 0.1, saved state = time, `.solar-bar`).
- **Next step:** `/spec-implement 022` T001 (source survey: stops for the lead's review), then T002–T003 spikes. 021 is still uncommitted.
- **Blockers:** none

## Files

- [decisions.md](decisions.md) — append-only decision log (why we chose X)
- [progress.md](progress.md) — session log, newest first
- [learnings.md](learnings.md) — gotchas and non-obvious fixes
