# Agent Memory Management

AI agents (Claude Code and others) start every session with no recollection of previous ones.
This project keeps **durable, version-controlled memory** in the repo so any agent — or human — can pick up where
the last session stopped.

## Memory Layers

| Layer                     | Where                                                            | Scope                          | Who writes it                | Committed?       |
| ------------------------- | ---------------------------------------------------------------- | ------------------------------ | ---------------------------- | ---------------- |
| **Rules**                 | `CLAUDE.md`, `specs/constitution.md`                             | How to work; non-negotiables   | Humans (agent proposes)      | Yes              |
| **Specs**                 | `specs/`                                                         | What to build and why          | Agent drafts, humans approve | Yes              |
| **Project memory**        | `memory/`                                                        | Decisions, progress, learnings | Agent + humans               | Yes              |
| **Personal agent memory** | `~/.claude/projects/<project>/memory/` (Claude Code auto-memory) | One user's preferences         | Claude Code                  | No (per-machine) |
| **Session context**       | The conversation                                                 | One session only               | —                            | No               |

Rule of thumb: if the **next agent on a different machine** would need it, it belongs in `memory/` or `specs/`,
not in personal memory.

## The `memory/` Folder

| File           | Purpose                                                                            | Write when…                                                  |
| -------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `MEMORY.md`    | Index + "current state" snapshot (≤ 40 lines). Read first every session.           | Current focus changes                                        |
| `decisions.md` | Append-only decision log (ADR-lite): context, decision, alternatives, consequences | Choosing a library, pattern, or changing a spec/constitution |
| `progress.md`  | Reverse-chronological session log: what was done, what's next, blockers            | End of every working session                                 |
| `learnings.md` | Gotchas and non-obvious facts (Three.js quirks, test tricks, perf findings)        | You lost >10 min to something, or found a non-obvious fix    |

## Session Protocol

**Start of session**

1. Read `CLAUDE.md` → `memory/MEMORY.md` → latest entry in `memory/progress.md`.
2. Open the active feature folder named in `MEMORY.md` and find the next unchecked task.

**During the session**

- Record decisions in `decisions.md` _when they are made_, not at the end.
- Add gotchas to `learnings.md` immediately.

**End of session** (or before context runs out)

1. Add a `progress.md` entry: date, feature, done, next, blockers.
2. Update the "Current State" block in `MEMORY.md`.
3. Make sure `tasks.md` checkboxes reflect reality.

## Hygiene

- **Don't duplicate.** Don't copy code or git history into memory; link to files/specs instead.
- **Keep it true.** If a memory entry turns out to be wrong, fix or delete it — stale memory is worse than none.
- **Keep it short.** `MEMORY.md` ≤ 40 lines. Prune `progress.md` older than ~30 entries into `memory/archive/`.
- **Absolute dates** (`2026-10-04`), never "yesterday" or "last week".
- **Decisions are append-only.** Supersede an old decision with a new entry that references it; don't rewrite history.
- **No secrets** in any memory file (there shouldn't be any — the project has no backend).
