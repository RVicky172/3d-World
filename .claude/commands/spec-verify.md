---
description: Run the Definition of Done for a feature and update docs and memory
argument-hint: <NNN>
---

Verify feature $ARGUMENTS against the Definition of Done in `specs/constitution.md`.

1. Run `npm run check`, `npm run test:e2e`, and `npm run build`; report results honestly.
2. Check every acceptance criterion in `spec.md` against its test; tick only the ones proven.
3. If all pass: set spec Status to `Implemented`, roadmap status to ✔️.
4. Add a `memory/progress.md` entry and update "Current State" in `memory/MEMORY.md` (next feature from the roadmap).
5. Report anything that failed or was skipped.
