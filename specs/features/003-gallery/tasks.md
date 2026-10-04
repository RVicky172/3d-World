# 003 — Gallery Page · Tasks

**Plan:** `./plan.md` (Approved)
Legend: `[P]` = can run in parallel with the previous task. Each task lists files and the proving test.
Test-first: each "tests" task must fail before its paired implementation task makes it pass.
Every task leaves `npm run check` **and** `npm run test:e2e` green: home only switches to the gallery in T030,
together with the E2E updates that this change requires.
Baseline for the size NFR: entry 130.8 KB gzipped (from 002).

## Gallery building blocks (not wired into the app yet)

- [x] **T010** — Starfield tests:
  - the point count matches `STARFIELD.count`;
  - all points lie within `[radius.min, radius.max]`;
  - the same seed gives identical positions across instances;
  - `update(elapsed)` changes rotation, except with `reducedMotion`;
  - it is a single `Points` object with no texture.

  files: `tests/unit/gallery/starfield.test.ts` · covers: AC-13

- [x] **T011** — Implement `STARFIELD`, the seeded PRNG and `createStarfield(reducedMotion)`.
      files: `src/gallery/starfield.ts` · test: T010
- [x] **T012** [P] — Card tests, using a test registry of 3 Spaces (one `multi`, one with a `thumbnail`, one with a broken thumbnail):
  - the output has an `h1`, then a `ul`, then one `li > a.card` per Space, in order, with `href="#/space/<id>"`;
  - each card has its title (`h2`), description and kind label;
  - `initialsOf`, `kindLabel` and `thumbnailUrl` (for `/` and `/3d-World/`) behave as specified;
  - a card with a thumbnail renders `img[loading=lazy][alt=""]`;
  - a card without one renders the placeholder (icon + initials);
  - an image `error` event swaps to the placeholder;
  - the error listener is removed when `signal` aborts.

  files: `tests/unit/gallery/cards.test.ts` · covers: AC-1, AC-2, AC-3, AC-12

- [x] **T013** — Implement `renderGallery`, the helpers and the placeholder SVG. Add gallery CSS:
  - a `--surface` token;
  - a grid using `repeat(auto-fill, minmax(…))`;
  - a scrollable gallery root;
  - a fixed-size preview box;
  - `:focus-visible` outlines.

  files: `src/gallery/cards.ts`, `src/styles/main.css` · test: T012

- [x] **T014** — Gallery view, test first: `createGalleryView({ spaces, baseUrl })` returns a factory that:
  - mounts the gallery DOM in `ctx.overlay`;
  - adds the starfield to the scene;
  - updates the starfield from `update()`;
  - sets the camera aspect in `resize()`;
  - in `dispose()`, removes the DOM and disposes the starfield's geometry and material.

  files: `src/gallery/index.ts`, `tests/unit/gallery/gallery-view.test.ts` · covers: AC-6 (unit), AC-12, AC-13

- [x] **T015** [P] — Back link, test first: `createBackLink(container)` adds an `a.back-to-gallery` with `href="#/"` and the accessible name "Back to gallery". Add CSS that hides it under `body[data-view="gallery"]`.
      files: `src/ui/back-link.ts`, `tests/unit/ui/back-link.test.ts`, `src/styles/main.css` · covers: AC-7 (unit)

## Core changes

- [x] **T020** — SpaceManager tests:
  - `openView('gallery', factory)` follows the same ordering as Spaces (fade out → dispose previous → create → setInstance → nextFrame → fade in);
  - `data-view` is `gallery` for the gallery and `space` for Spaces, including not-found and load-error;
  - `data-space-id` is set only for Spaces;
  - `activeView` and `activeId` are correct, with `activeId` null on the gallery;
  - rapid gallery → Space → gallery switching ends on the gallery, and the stale instance is disposed.

  files: `tests/unit/core/space-manager.test.ts` · covers: AC-6, AC-11

- [x] **T021** — Implement `openView`, `ViewName`, `activeView` and `data-view`; `open(id)` delegates to `openView`.
      files: `src/core/space-manager.ts` · test: T020
- [x] **T022** — Router tests: replace the default-Space cases.
  - `""`, `#` and `#/` call `openGallery`, not `openSpace`;
  - `#/foo` redirects and then opens the gallery;
  - gallery ↔ Space switching works both ways, with Back/Forward;
  - `navigate(id)` from the gallery adds one entry;
  - the gallery title is `"3D World"`;
  - after a gallery `load-error`, it can be retried;
  - stale results are still ignored.

  files: `tests/unit/core/router.test.ts` · covers: AC-1, AC-4 (unit), AC-8

- [x] **T023** — Implement the router change: `openGallery` replaces `defaultSpaceId`, with route keys `gallery` and `space/<id>`. To keep this task free of behaviour changes, `main.ts` temporarily passes `openGallery: () => manager.open(DEFAULT_SPACE_ID)`, so the app still behaves as it does today and E2E stays green.
      files: `src/core/router.ts`, `src/main.ts` · test: T022 + existing E2E
      _Done together with T030: the router's new semantics (home = gallery key, gallery title) failed two 002 E2E tests even with the temporary bridge, so the bridge could not keep E2E green on its own._

## Integration

- [x] **T030** — Switch home to the gallery, together with the E2E updates it requires:
  - `main.ts`: `openGallery: () => manager.openView('gallery', createGalleryView({ spaces, baseUrl: import.meta.env.BASE_URL }))`; mount the back link; remove `DEFAULT_SPACE_ID`;
  - CSS stacking: canvas → overlay → fader → back link;
  - `smoke.spec.ts`: boot shows the gallery;
  - `router.spec.ts`: home is the gallery; titles; `?space=` → gallery; redirect → gallery; the "home ↔ default" no-re-open tests become "gallery ↔ Space";
  - `space-framework.spec.ts`: the leak baseline is taken on the gallery;
  - `subpath.spec.ts`: home shows the gallery, and its card opens demo-cube under `/3d-World/`;
  - 002 `spec.md` changelog: AC-5 superseded by 003 (D-008).

  files: `src/main.ts`, `src/styles/main.css`, `tests/e2e/{smoke,router,space-framework,subpath}.spec.ts`, `specs/features/002-hash-router/spec.md` · test: full `npm run test:e2e` green

- [x] **T031** — Gallery E2E tests:
  - AC-1: gallery and card count;
  - AC-2: card content;
  - AC-3: "DC" placeholder;
  - AC-4: click, Enter, history and Back;
  - AC-5: no Space chunk is requested until a card opens;
  - AC-6: 10 round trips and memory back to the gallery baseline;
  - AC-7: back link hidden or visible by screen, keyboard-reachable;
  - AC-8: titles;
  - AC-9: roles, Tab order and focus outline;
  - AC-10: 360 px single column with no horizontal scroll; 1280 px grid tracks > 1; contrast ≥ 4.5;
  - AC-11: both switch directions without errors, and the fader stacks above the overlay;
  - AC-13: non-blank backdrop; still under reduced motion; moving otherwise.

  files: `tests/e2e/gallery.spec.ts` · covers: AC-1–AC-11, AC-13

## Docs

- [x] **T040** [P] — Update the architecture doc:
  - views: the gallery as a non-registry view, `openView` and `data-view`;
  - the gallery module;
  - the new stacking order;
  - the router's home rule (gallery);
  - new testability rows.

  files: `specs/architecture.md`

## Verify

- [x] **T090** — Run `npm run check`, `npm run build` (bundle check) and `npm run test:e2e` (both projects), and confirm all are green with Prettier clean.
  - Coverage: ≥ 80 % lines for `src/gallery/*`, `router.ts` and `space-manager.ts`.
  - NFR: entry growth ≤ 5 KB gzipped against the 130.8 KB baseline; record the number.
- [x] **T091** — Tick AC-1…AC-13 in `spec.md`, set Status `Implemented`, roadmap ✔️, add a `memory/progress.md` entry, and update `memory/MEMORY.md` (`/spec-verify 003`).

## AC Coverage

| AC    | Tasks            |
| ----- | ---------------- |
| AC-1  | T012, T022, T031 |
| AC-2  | T012, T031       |
| AC-3  | T012, T031       |
| AC-4  | T022, T031       |
| AC-5  | T031             |
| AC-6  | T014, T020, T031 |
| AC-7  | T015, T031       |
| AC-8  | T022, T031       |
| AC-9  | T031             |
| AC-10 | T013, T031       |
| AC-11 | T020, T030, T031 |
| AC-12 | T012, T014       |
| AC-13 | T010, T014, T031 |
