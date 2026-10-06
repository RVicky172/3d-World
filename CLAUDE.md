# CLAUDE.md

Guidance for Claude Code (and any AI agent) working in this repository.

## Project

**3D World** — a browser-only website (no backend) that showcases interactive 3D **Spaces**: single-object
showcases (one model, many angles) and multi-object worlds (e.g. a solar system). Built with
**Three.js + TypeScript + Vite**; tested with **Vitest + Playwright**.

## Start Every Session

1. Read `memory/MEMORY.md` (current state + active feature).
2. Read the newest entry in `memory/progress.md`.
3. Open the active feature in `specs/features/NNN-*/` and find the next unchecked task.
4. If the task touches principles, re-read `specs/constitution.md`.

## Spec-Driven Workflow (mandatory)

**Specify → Plan → Tasks → Implement → Verify.** Full rules: `specs/workflow.md`.

- Never write feature code without an **Approved** `spec.md`. If none exists, draft one and stop for review.
- Never plan from a spec that still has `[NEEDS CLARIFICATION]` markers — ask the user.
- Work one task from `tasks.md` at a time; tick it only after its tests pass.
- If code must diverge from the spec, update the spec (and its Changelog) first.
- Slash commands: `/spec-new`, `/spec-plan`, `/spec-tasks`, `/spec-implement`, `/spec-verify`.
- `.claude/skills/sdd-setup/` packages this workflow (templates + `scaffold.py`) to set it up in another repo.

## Key Docs

| Doc                         | Read when                                               |
| --------------------------- | ------------------------------------------------------- |
| `specs/constitution.md`     | Before any design decision; contains Definition of Done |
| `specs/architecture.md`     | Before touching `src/core` or creating a Space          |
| `specs/tech-stack.md`       | Before adding any dependency                            |
| `specs/testing-strategy.md` | Before writing tests                                    |
| `specs/roadmap.md`          | Choosing what's next                                    |

## Commands

```bash
npm run dev            # dev server (http://localhost:5173)
npm run check          # typecheck + lint + unit tests — must pass before marking any task done
npm test               # unit tests only (npm run test:watch for watch mode)
npm run test:e2e       # Playwright E2E against a production build
npm run build          # static build to dist/
npm run format         # Prettier
```

## Code Rules

- TypeScript strict; no `any` without a comment explaining why.
- Each Space lives in `src/spaces/<id>/`, implements the `Space` contract, never imports another Space.
- Scene content goes in typed `data.ts` files, not inline in render code.
- Space logic must not read `Date.now()`/`performance.now()` — use the `delta`/`elapsed` passed to `update()`.
- Everything a Space allocates must be freed in `dispose()` (geometries, materials, textures, listeners, DOM).
- No runtime network calls to third parties; no new runtime dependency without updating `specs/tech-stack.md`
  and `memory/decisions.md`.
- Every asset gets a source + license line in `public/assets/CREDITS.md`.

## Testing Rules

- Pure logic (math, orbits, routing, data) → unit test in `tests/unit/`, written first.
- Every Space → E2E smoke test in `tests/e2e/` (loads, non-blank canvas, no console errors, disposes).
- Wait on app signals (e.g. `body[data-space-ready="true"]`), never fixed sleeps.

## Memory Management (project memory in `memory/`)

Full rules: `specs/memory-management.md`.

- **Decision made** (library, pattern, spec change) → append to `memory/decisions.md` right away.
- **Gotcha found** (lost >10 min, non-obvious fix) → add to `memory/learnings.md`.
- **End of session** → add an entry to `memory/progress.md` and update "Current State" in `memory/MEMORY.md`.
- Shared project knowledge goes in `memory/` (committed). Personal Claude auto-memory is only for this user's
  preferences — never the only place a project fact lives.
- Use absolute dates. Fix or delete memory that becomes wrong.

## Git

- Commit only when asked. Conventional-style messages referencing the feature: `feat(001): add SpaceManager`.
- Run `npm run check` before committing.
