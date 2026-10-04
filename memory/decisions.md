# Decision Log

Append-only. Newest at the bottom. To reverse a decision, add a new entry that says `Supersedes D-00X`.

Format:

```
## D-00X — Title (YYYY-MM-DD)
**Context:** … **Decision:** … **Alternatives:** … **Consequences:** …
```

---

## D-001 — Browser-only static site (2026-10-04)

**Context:** Project is a 3D showcase; no user accounts or shared data.
**Decision:** No backend of any kind. Static hosting only. Codified as Constitution II.
**Alternatives:** Serverless functions for asset listing — unnecessary; registry is static.
**Consequences:** All content is bundled or in `public/`. Deep links use hash routing.

## D-002 — Vanilla Three.js + TypeScript, no UI framework (2026-10-04)

**Context:** UI surface is small (gallery, info panels); 3D is the core.
**Decision:** Three.js + strict TS + vanilla DOM, built with Vite.
**Alternatives:** React Three Fiber (bigger bundle, two mental models), Babylon.js (heavier).
**Consequences:** We write a small router and DOM helpers ourselves. Revisit if UI grows complex.

## D-003 — Vitest + Playwright for testing (2026-10-04)

**Context:** Need fast unit tests for math and real-browser checks for WebGL.
**Decision:** Vitest for unit/integration, Playwright (Chromium headless, SwiftShader WebGL) for E2E.
**Consequences:** Pure logic must be WebGL-free to be unit-testable; time must be injectable.

## D-004 — Project memory lives in the repo (2026-10-04)

**Context:** Agent sessions are stateless; multiple machines/agents may work on the project.
**Decision:** Version-controlled `memory/` folder (index, decisions, progress, learnings). Personal Claude auto-memory only for user preferences.
**Consequences:** Session start/end protocol in `CLAUDE.md`.

## D-005 — Fade transition and opt-in post-processing hook in v1 (2026-10-04)

**Context:** Spec 001 open questions: how Spaces switch, and whether Spaces can use post-processing.
**Decision:** Switching uses a ~300 ms DOM-overlay fade (instant with `prefers-reduced-motion`). Spaces may define an optional `render()` on `SpaceInstance` and own their `EffectComposer`; the engine calls it instead of `renderer.render`.
**Alternatives:** Instant switch (deferred polish); engine-managed composer (couples the engine to post-processing and pulls it into the main bundle).
**Consequences:** No new dependency; `EffectComposer` stays in the lazy chunks of the Spaces that use it. The Space is responsible for resizing and disposing its composer.

## D-006 — Failed opens close the current Space (2026-10-04)

**Context:** What should the screen show when `open(id)` gets an unknown id or the Space fails to load while another Space is showing?
**Decision:** Close the current Space, then show the "Space not found" / "Failed to load" message over the empty canvas. `<body data-space-status>` records the outcome (`opened` | `not-found` | `load-error`). Load errors also go to `console.error`; unknown ids don't (not a bug).
**Alternatives:** Keep the previous Space visible behind the message — rejected: the screen would not match the requested id/URL once routing (002) lands.
**Consequences:** E2E tests can assert outcomes via `data-space-status`. E2E's "no console errors" rule still holds for unknown ids.

## D-007 — Routing behaviour for 002 (2026-10-04)

**Context:** Spec 002 open questions on the home route, the temporary `?space=` parameter, and unknown routes.
**Decision:** The home route (`#/`) opens the default Space (demo-cube) until the gallery (003) exists. `?space=<id>` is dropped with no redirect. Unrecognised routes redirect to `#/`, replacing the history entry. The page title follows whichever Space is showing, including the default on home.
**Alternatives:** A placeholder link list on home; keeping `?space=` as a redirecting alias; a "Page not found" page for bad routes.
**Consequences:** 003 must redefine the home route. Bad links fail quietly to home rather than visibly, so broken links won't be obvious to visitors.
