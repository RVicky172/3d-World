# NNN — <Feature Name> · Tasks

**Plan:** `./plan.md`
Legend: `[P]` = can run in parallel with the previous task. Each task lists files and the proving test.
When a task is done, tick it and add an indented **Result (YYYY-MM-DD):** note: what was done, numbers measured,
anything surprising or deferred.

## Setup

- [ ] T001 — … · files: `…` · test: `…`

## Tests First

- [ ] T010 — Write failing unit tests for … · files: `tests/unit/...`

## Core

- [ ] T020 — Implement … · files: `src/...` · test: T010

## Integration & UI

- [ ] T030 — …

## Verify

- [ ] T090 — `npm run check` and `npm run test:e2e` green
- [ ] T091 — Tick ACs in `spec.md`, update `roadmap.md`, `memory/progress.md`

## AC coverage

| AC   | Tasks      |
| ---- | ---------- |
| AC-1 | T010, T020 |
