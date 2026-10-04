# Spec-Driven Workflow

Every feature moves through five gated stages. Each stage produces a file in `specs/features/NNN-short-name/`.
Do not start a stage until the previous one is approved.

```
 1. SPECIFY  ──►  2. PLAN  ──►  3. TASKS  ──►  4. IMPLEMENT  ──►  5. VERIFY
   spec.md        plan.md       tasks.md        code + tests       checklist, docs, memory
   (what/why)     (how)         (steps)
```

## Feature numbering

- `000–009` foundation & core, `010–019` single-object, `020–029` solar system/multi-object, `030+` polish.
  Match the numbers in `roadmap.md`. Folder name: `NNN-kebab-name` (e.g. `021-orbital-mechanics`).

## Stage 1 — Specify (`spec.md`)

Copy `templates/spec-template.md`. Describe **what** and **why**, never **how**:
user stories, acceptance criteria (testable, numbered `AC-1…`), out-of-scope, open questions.
Set `Status: Draft`. A human reviews and changes it to `Status: Approved`.
**Gate:** no `[NEEDS CLARIFICATION]` markers remain; every AC is testable.

## Stage 2 — Plan (`plan.md`)

Copy `templates/plan-template.md`. Describe **how**: files touched, data structures, Three.js techniques,
risks, test approach, and a **Constitution check** (each principle: ✅ / ⚠️ with justification).
**Gate:** constitution check passes; no new dependency without a `tech-stack.md` update.

## Stage 3 — Tasks (`tasks.md`)

Copy `templates/tasks-template.md`. Break the plan into small ordered tasks (≤ ~1 hour each), each naming the
files it touches and the test that proves it. Tests are written **before or with** the code they cover.
Mark tasks that can run in parallel with `[P]`.

## Stage 4 — Implement

Work one task at a time. After each task:

1. Run `npm run check` (and `npm run test:e2e` if UI changed).
2. Tick the task box in `tasks.md`.
3. If you learned something non-obvious, add it to `memory/learnings.md`.

## Stage 5 — Verify

Walk the Definition of Done in `constitution.md`. Then:

- Tick each AC in `spec.md`, set `Status: Implemented`.
- Update `roadmap.md` status, add an entry to `memory/progress.md`.

## Changing a spec mid-flight

Edit `spec.md`, add a line to its **Changelog** section, and re-check `plan.md`/`tasks.md` for impact.
Never silently diverge code from spec.

## Slash commands (Claude Code)

Shortcuts in `.claude/commands/`:

| Command                 | Does                                                            |
| ----------------------- | --------------------------------------------------------------- |
| `/spec-new <name>`      | Creates the next numbered feature folder with a draft `spec.md` |
| `/spec-plan <NNN>`      | Writes `plan.md` for an approved spec                           |
| `/spec-tasks <NNN>`     | Writes `tasks.md` from the plan                                 |
| `/spec-implement <NNN>` | Implements the next unchecked task(s), running tests            |
| `/spec-verify <NNN>`    | Runs the Definition-of-Done checklist and updates docs/memory   |
