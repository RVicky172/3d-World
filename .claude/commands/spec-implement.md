---
description: Implement the next unchecked task(s) of a feature
argument-hint: <NNN> [task-id]
---

Implement feature $ARGUMENTS.

1. Read `memory/MEMORY.md`, `memory/learnings.md`, and the feature's `spec.md`, `plan.md`, `tasks.md`.
2. Take the next unchecked task (or the one named). Write/adjust its test first, then the code.
3. Run `npm run check` (and `npm run test:e2e` if UI/rendering changed). Fix until green.
4. Tick the task in `tasks.md`. Record any non-obvious gotcha in `memory/learnings.md` and any decision in `memory/decisions.md`.
5. Continue with the next task only if it is small and in the same area; otherwise stop and report.
   If the code must diverge from the spec, stop and propose a spec change first.
