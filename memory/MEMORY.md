# Project Memory — Index

> Read this first every session. Keep ≤ 40 lines. Rules: `specs/memory-management.md`.

## Current State (2026-10-06)

- **Phase:** 3 (Solar System, 020–023): **020 ✔️, 021 ✔️, 022 ✔️**; next **023** (selection & focus: click a planet to fly the camera to it, show facts). No spec yet: start with `/spec-new`.
- **Last done:** **022-solar-system-surfaces is Implemented** (2026-10-06), **not committed yet** (all 022 work is in the working tree on `main`; 021 is `bf0d3e4`):
  - 13 ACs verified; 902 unit + 177 E2E; entry 147.9 KB (+1.3 of 5 KB); Space 3.06 MB of 4 (code 45.5 KB + imagery/stars 2.46 MB + decoder 571 KB).
  - Real surfaces on all 16 bodies (KTX2 via the asset pipeline's texture entries), Earth's clouds / city lights / ocean glint, Saturn's rings with both shadows, the Yale BSC sky at infinity, the Sun's glow; imagery loads after the view opens with compact background progress.
  - Core seams: `SpaceContext.reportBackgroundProgress`, `data-space-background` (D-032); shared `src/shared/ktx2.ts`.
  - Decisions D-029–D-034 (034: AC-13 accepted on SwiftShader, 53–56 fps at whole-system views; revisit in 030).
  - Fixed on the way: Earth's spin 180° off before 2000 (021 bug, T021).
- **Next step:** commit 022 when the lead asks; then `/spec-new` for 023.
- **Blockers:** none

## Files

- [decisions.md](decisions.md) — append-only decision log (why we chose X)
- [progress.md](progress.md) — session log, newest first
- [learnings.md](learnings.md) — gotchas and non-obvious fixes
