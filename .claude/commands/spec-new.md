---
description: Create the next numbered feature folder with a draft spec.md
argument-hint: <feature-name> [short description]
---

Create a new feature spec for: $ARGUMENTS

1. Read `specs/roadmap.md` and `specs/workflow.md`. Pick the feature number from the roadmap if the feature is listed; otherwise use the next free number in the right range.
2. Create `specs/features/NNN-<kebab-name>/spec.md` from `specs/templates/spec-template.md`.
3. Fill in summary, user stories, and testable acceptance criteria (WHAT/WHY only — no implementation details). Mark anything ambiguous with `[NEEDS CLARIFICATION]`.
4. Set `Status: Draft`, update `specs/roadmap.md` status to 📝, and update `memory/MEMORY.md` "Current State".
5. Stop and list the open questions for the user. Do NOT write a plan or code.
