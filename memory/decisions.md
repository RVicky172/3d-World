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

## D-008 — Gallery replaces the default Space on home (2026-10-04)

**Context:** Spec 003 open questions on where the gallery lives, its background, and card previews.
**Decision:** The gallery is the home route `#/`, ending D-007's "home shows the default Space" rule (supersedes that part of D-007). Behind the cards is a subtle animated starfield drawn with the single renderer, which is still under `prefers-reduced-motion` and is removed whenever a Space is open. Cards show the Space's `thumbnail` image, or a generated placeholder (kind icon plus initials) if it is missing or broken.
**Alternatives:** Gallery at `#/gallery`; a plain background (lighter, no GPU while browsing); generated placeholders only; text-only cards.
**Consequences:** 002's "home = demo-cube" tests change. The GPU memory baseline for leak tests is "gallery + backdrop". Thumbnails need licensed images recorded in `CREDITS.md`. demo-cube uses the placeholder for now.

## D-009 — Camera controls behaviour for 004 (2026-10-04)

**Context:** Spec 004 open questions on idle motion, panning, keyboard scope and discoverability.
**Decision:** Idle Spaces with controls use a camera turntable that stops on any interaction and resumes after a Space-defined delay; the subject holds still, and reduced motion disables all automatic movement. Panning is on everywhere, clamped to a Space-defined pan limit. Keyboard controls work only while the focusable 3D view has focus. Discoverability comes from a fading hint, a persistent "?" help panel and a "Reset view" button.
**Alternatives:** Subject keeps its own animation; no automatic motion; per-Space or no panning; page-wide keys; hint-only or buttons-only.
**Consequences:** demo-cube stops self-rotating (a 001 behaviour change). The canvas becomes focusable inside Spaces, so Tab order must be back link → 3D view → help/reset. Touch users get an on-screen reset because they have no `R` key.

## D-010 — Focus management on view switches; 1.5 KB entry allowance for 004 (2026-10-04)

**Context:** During 004 T022, activating a gallery card removed the focused element, so keyboard focus was lost and Tab reached the help buttons before "Back to gallery" and the 3D view. Separately, the controls grew the entry by 1.2 KB against a 0.5 KB NFR.
**Decision:** (1) New 004 AC-13: when focus would otherwise be lost on a view switch (never on the first page view, and never from a still-visible focused element), focus moves to the new view's start. That is the 3D view for a Space, and on the gallery the card of the Space just left (or the heading). This clarifies 002's "focus is not stolen". (2) The 004 entry NFR is amended to ≤ 1.5 KB.
**Alternatives:** Gallery heading instead of the card (loses the visitor's place); no focus management (keyboard users lose focus). Restructuring chunks to save size (no real saving, since startup loads `three` anyway).
**Consequences:** `SpaceInstance` gains an optional `focusTarget()`. The size growth comes from `three` core classes being shared with lazy chunks: any Space importing new parts of three core can grow the entry, so watch the bundle-check line.

## D-011 — Resilience and reduced-motion behaviour for 005 (2026-10-05)

**Context:** Spec 005 open questions. The project lead delegated the choices and asked for simple ones, because this is a learning project.
**Decision:** (1) After a WebGL context loss, show a message with a "Reload" button, and if the browser restores the context, reopen the current view automatically. (2) A change to `prefers-reduced-motion` applies from the next view opened (CSS rules update live). (3) There is no on-page motion toggle; the OS setting is the only source. (4) The WebGL fallback stays a plain message without a list of Spaces.
**Alternatives:** Reload button only, or auto-recovery only; live reconfiguration of the open view's turntable, damping and starfield; a persisted on-page toggle; a text-only list of Spaces on the fallback.
**Consequences:** No reactive motion state has to be threaded through Spaces or controls. Context restore reuses `SpaceManager`'s open path. AC-11 becomes a no-op constraint.
