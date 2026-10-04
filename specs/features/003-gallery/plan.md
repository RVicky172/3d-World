# 003 — Gallery Page · Implementation Plan

**Spec:** `./spec.md` · **Status:** Approved <!-- Draft | Approved -->

## Approach

**Key idea: the gallery is a _view_ managed exactly like a Space, but it is not a Space.** It is built from the
same `SpaceFactory` contract: a scene (the starfield), plus DOM in `ctx.overlay` (the cards), plus `dispose()`.
The SpaceManager mounts it, which brings everything 001 already proved:

- the fade transition;
- disposal with an aborted signal;
- supersession when switching quickly;
- "first frame before fade-in";
- the GPU-memory leak test.

There is no second rendering path and no special cases in the Engine.

The gallery is **not** in the Space registry. Its code lives in `src/gallery/` and ships in the entry bundle,
because it is the landing page. So "showing the gallery downloads no Space code" (AC-5) holds by construction,
and the bundle check keeps verifying that Spaces stay lazy.

### Pieces

1. **SpaceManager gains views.**
   - `openView(name, factory)` mounts any factory under a view name.
   - `open(id)` becomes "look up the registry, then mount as view `space`". Not-found and load errors are still
     reported under view `space`, because they are Space screens.
   - The manager sets `<body data-view="gallery" | "space">` when mounting. `data-space-ready` keeps meaning "the
     current view finished opening", so existing tests keep working. `data-space-id` is set only for Spaces.
   - Supersession uses one sequence counter for all views, so rapid gallery ↔ Space switching ends on the latest
     request.
2. **HashRouter: home → gallery.**
   - The `defaultSpaceId` dependency is replaced by `openGallery(): Promise<OpenResult>`.
   - "Already showing" compares a route key: `gallery` or `space/<id>`. These cannot collide.
   - The gallery's title is `"3D World"` (AC-8).
   - Unknown routes still redirect to `#/`, which now shows the gallery.
3. **Gallery view (`src/gallery/`).**
   - `starfield.ts` builds `Points` from seeded pseudo-random positions on a shell around the camera, using one
     draw call and no textures. Rotation is `elapsed × speed`, with speed 0 under reduced motion (AC-13).
   - `cards.ts` renders the gallery DOM from a `SpaceMeta[]` (AC-1, AC-2, AC-12): a heading, a list, and a card per
     Space. Each card is a real `<a href="#/space/<id>">`, so click, tap and Enter work natively, and each
     activation adds one history entry and goes through the router (AC-4).
   - The preview shows the thumbnail `<img loading="lazy" alt="">` when there is one. If the image is missing or
     fails, it swaps to a generated placeholder: an inline-SVG kind icon plus initials (AC-3).
   - `index.ts` exports `createGalleryView({ spaces, baseUrl })` → `SpaceFactory`. It wires the starfield and the
     cards, and its `dispose()` removes the DOM and frees the scene.
4. **"Back to gallery" control (`src/ui/back-link.ts`).**
   - A permanent `<a class="back-to-gallery" href="#/">` in `#app`.
   - CSS shows it only when `body:not([data-view="gallery"])`. That covers every Space screen, including "Space
     not found" (AC-7). It is a real link, so it is keyboard-reachable and adds a history entry.
5. **Stacking order change.**
   - Currently the order is canvas → fader → overlay, so gallery cards in the overlay would stay visible during
     fades and then vanish abruptly.
   - New order: **canvas → overlay → fader → chrome (back link)**. The fader now hides the whole view, both its 3D
     and its DOM, so switches never flash half-removed content (AC-11).
   - Messages also fade in with the view. The back link stays steady above the fader.

### Open sequence for a view (unchanged from 001)

```text
fader.out → (load) → dispose previous view → factory(ctx) → setInstance → nextFrame → fader.in → data-view/ready
```

## Files

| File                                      | Change | Purpose                                                                                                          |
| ----------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------- |
| `src/core/space-manager.ts`               | modify | `openView(name, factory)`; `open(id)` delegates; `data-view`; `activeView` getter                                |
| `src/core/router.ts`                      | modify | `openGallery` replaces `defaultSpaceId`; route keys; gallery title                                               |
| `src/gallery/starfield.ts`                | new    | `STARFIELD` config, `createStarfield(reducedMotion)` → `{ object, update(elapsed) }`, seeded PRNG                |
| `src/gallery/cards.ts`                    | new    | `renderGallery(spaces, { baseUrl, signal })`, `initialsOf`, `kindLabel`, `thumbnailUrl`, placeholder SVG         |
| `src/gallery/index.ts`                    | new    | `createGalleryView({ spaces, baseUrl })` → `SpaceFactory`                                                        |
| `src/ui/back-link.ts`                     | new    | `createBackLink(container)`                                                                                      |
| `src/styles/main.css`                     | modify | New stacking order; gallery grid and cards; `--surface` token; `:focus-visible`; back link; hide via `data-view` |
| `src/main.ts`                             | modify | Create the gallery view, back link and router (`openGallery`)                                                    |
| `tests/unit/core/space-manager.test.ts`   | modify | `openView` ordering, `data-view`, gallery ↔ Space supersession                                                   |
| `tests/unit/core/router.test.ts`          | modify | Home → `openGallery`; title; gallery ↔ Space; remove default-Space cases                                         |
| `tests/unit/gallery/starfield.test.ts`    | new    | Point count, determinism (seeded), drift vs reduced motion, single draw object                                   |
| `tests/unit/gallery/cards.test.ts`        | new    | Structure, order, labels, initials, thumbnail vs placeholder, broken-image fallback, test registry               |
| `tests/unit/gallery/gallery-view.test.ts` | new    | Factory mounts DOM in overlay plus starfield in scene; `dispose()` removes both                                  |
| `tests/unit/ui/back-link.test.ts`         | new    | Link to `#/`, accessible name                                                                                    |
| `tests/e2e/gallery.spec.ts`               | new    | AC-1–AC-13 in the browser                                                                                        |
| `tests/e2e/smoke.spec.ts`                 | modify | Boot lands on the gallery                                                                                        |
| `tests/e2e/router.spec.ts`                | modify | Home = gallery (002 AC-5 superseded); titles; `?space=` → gallery; redirect → gallery                            |
| `tests/e2e/space-framework.spec.ts`       | modify | AC-4 leak test baseline taken on the gallery                                                                     |
| `tests/e2e/subpath.spec.ts`               | modify | Home under `/3d-World/` shows the gallery; card link opens a Space                                               |
| `specs/features/002-hash-router/spec.md`  | modify | Changelog: AC-5 superseded by 003 (D-008)                                                                        |
| `specs/architecture.md`                   | modify | Views, gallery, stacking order, router home rule                                                                 |

## Data Structures & Interfaces

```ts
// src/core/space-manager.ts
export type ViewName = 'gallery' | 'space';
class SpaceManager {
  open(id: string): Promise<OpenResult>; // registry Space, view 'space'
  openView(name: ViewName, factory: SpaceFactory): Promise<OpenResult>; // e.g. the gallery
  get activeView(): ViewName | null;
  get activeId(): string | null; // Space id; null on the gallery
}

// src/core/router.ts (RouterDeps change)
interface RouterDeps {
  openSpace(id: string): Promise<OpenResult>;
  openGallery(): Promise<OpenResult>; // replaces defaultSpaceId
  // …location, history, events, titleOf, setTitle unchanged
}

// src/gallery/cards.ts
export function renderGallery(
  spaces: readonly SpaceMeta[],
  options: { baseUrl: string; signal: AbortSignal },
): HTMLElement;
export function initialsOf(title: string): string; // "Demo Cube" → "DC", "Galaxy" → "GA"
export function kindLabel(kind: SpaceMeta['kind']): string; // "Single object" | "Multi-object"
export function thumbnailUrl(baseUrl: string, path: string): string; // base-aware (sub-path hosting)

// src/gallery/starfield.ts
export const STARFIELD = {
  count: 1500,
  radius: { min: 40, max: 90 },
  size: 1.6,
  speed: 0.01,
  seed: 0x3d,
  color: 0xcfd8ff,
};
export function createStarfield(reducedMotion: boolean): { object: Points; update(elapsed: number): void };

// src/gallery/index.ts
export function createGalleryView(options: { spaces: readonly SpaceMeta[]; baseUrl: string }): SpaceFactory;
```

Card markup (one per Space):

```html
<li>
  <a class="card" href="#/space/demo-cube">
    <div class="card-preview">…img or placeholder…</div>
    <h2>Demo Cube</h2>
    <p>…description…</p>
    <span class="card-kind">Single object</span>
  </a>
</li>
```

## Three.js Techniques

- **Starfield:**
  - **Geometry:** `Points` + `BufferGeometry` (one `Float32Array` position attribute) + `PointsMaterial` with
    `sizeAttenuation` and slight transparency. One draw call and zero textures. The memory baseline is 1 geometry
    and 0 textures.
  - **Positions:** random directions scaled to a radius between `min` and `max`, generated by a seeded
    mulberry32-style PRNG, so frames are reproducible across runs (AC-13 test).
  - **Motion:** `object.rotation.y = elapsed * speed` (and a little on x). This is a pure function of Space time;
    under reduced motion the speed is 0.
- **Camera:** a perspective camera at the origin. `resize()` updates its aspect, as demo-cube's does.
- **Disposal:** `disposeObject3D(scene)`.
- **Cost:** about 1500 points is trivial even on SwiftShader. No post-processing.

## Test Approach

| AC    | Test file                                            | Type       | How                                                                                                                                                                                                                                             |
| ----- | ---------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC-1  | `cards.test.ts`, `router.test.ts`, `gallery.spec.ts` | unit + e2e | Test registry of 3 → 3 cards in order; `""`, `#` and `#/` call `openGallery`; E2E `goto('/')` → `data-view="gallery"`, 1 card                                                                                                                   |
| AC-2  | `cards.test.ts`, `gallery.spec.ts`                   | unit + e2e | Title, description and kind label present; both kinds labelled correctly                                                                                                                                                                        |
| AC-3  | `cards.test.ts`, `gallery.spec.ts`                   | unit + e2e | With `thumbnail` → `<img loading="lazy" alt="">` with a base-aware src; without → placeholder (icon + initials); `error` event → placeholder; preview box size identical. E2E: demo-cube shows the "DC" placeholder                             |
| AC-4  | `gallery.spec.ts`                                    | e2e        | Click card → `#/space/demo-cube` opened, `history.length +1`, `goBack()` → gallery. Keyboard: focus card, press Enter → opened                                                                                                                  |
| AC-5  | `gallery.spec.ts`                                    | e2e        | Record requests while on the gallery: no `demo-cube-*.js`. Open the card: exactly one such request                                                                                                                                              |
| AC-6  | `gallery.spec.ts`, `space-framework.spec.ts`         | e2e        | Baseline `memory()` on the gallery; 10 × (navigate Space → `#/`); memory equals baseline; `activeId()` null on the gallery                                                                                                                      |
| AC-7  | `back-link.test.ts`, `gallery.spec.ts`               | unit + e2e | Back link hidden on the gallery, visible in demo-cube and on `#/space/nope`; Tab reaches it; click → gallery                                                                                                                                    |
| AC-8  | `router.test.ts`, `gallery.spec.ts`                  | unit + e2e | Gallery title `'3D World'`; Space title still `'Demo Cube — 3D World'`                                                                                                                                                                          |
| AC-9  | `gallery.spec.ts`                                    | e2e        | `getByRole('heading', { level: 1 })`; `getByRole('list')` with `listitem`s; `getByRole('link', { name: /Demo Cube/ })`; first Tab focuses the first card; `:focus-visible` outline width > 0                                                    |
| AC-10 | `gallery.spec.ts`                                    | e2e        | At 360 × 800: one column (cards share x), `scrollWidth <= clientWidth`. At 1280 × 800 with a 3-card layout probe: columns > 1. Contrast ratio of card text vs `--surface` ≥ 4.5 (computed in-page)                                              |
| AC-11 | `space-manager.test.ts`, `gallery.spec.ts`           | unit + e2e | Unit: view switch order fade → dispose → mount → fade in. E2E: gallery ↔ Space both directions with no errors; the fader covers the overlay (computed z-index order)                                                                            |
| AC-12 | `cards.test.ts`, `gallery-view.test.ts`              | unit       | Gallery built from an injected test registry, no code change → its entries render                                                                                                                                                               |
| AC-13 | `starfield.test.ts`, `gallery.spec.ts`               | unit + e2e | Unit: same seed → same positions; `update` changes rotation, except under reduced motion; 1 `Points`. E2E: `canvasCoverage > 0` behind the gallery; reduced motion → two `toDataURL()` captures 500 ms apart are equal; with motion they differ |

- **AC-10's multi-column check needs more than one card.** Only demo-cube exists, so the E2E test measures the
  grid's computed `grid-template-columns` track count at 1280 px rather than the card positions.
- **Coverage target:** ≥ 80 % lines for `src/gallery/*`, `router.ts` and `space-manager.ts`.
- **NFR "≤ 5 KB gzipped":** measured with the bundle-check line against the 130.8 KB baseline.

## Risks & Mitigations

- **Existing tests assume home = demo-cube** (smoke, router, subpath, the 001 leak test). They are updated in the
  same task that switches home to the gallery, so E2E is never red between tasks. 002's spec gets a changelog note.
- **The stacking change could hide messages or Space UI during fades.** That is intended: they fade with their view.
  The 001 E2E tests don't depend on overlay-over-fader. A unit or CSS check confirms the back link stays above the
  fader.
- **The overlay has `pointer-events: none`:** the gallery root opts back in through the existing `.overlay > *`
  rule. A test clicks a real card to prove it.
- **Thumbnail paths under a sub-path:** paths are joined with `import.meta.env.BASE_URL`. A unit test covers `/`
  and `/3d-World/`. The sub-path E2E test still passes because demo-cube has no image.
- **The backdrop costs GPU while browsing (choice Q2-b):** one draw call, about 1500 points, and the loop already
  pauses on hidden tabs. If profiling ever shows a cost, `STARFIELD.count` is one constant to change.
- **Contrast over an animated backdrop:** cards sit on a solid `--surface` colour, so text contrast doesn't depend
  on what the stars are doing. The test checks text against `--surface`.
- **Entry size:** `PointsMaterial` and the gallery DOM code are small, and the shader chunks are already bundled.
  If the 5 KB NFR is exceeded, the gallery could become a lazy chunk preloaded at boot. That would need a plan
  amendment.

## Constitution Check

| Principle                 | Status | Notes                                                                                                                       |
| ------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------- |
| I. Spec before code       | ✅     | 003 approved; every AC mapped; 002 AC-5 supersession recorded (D-008)                                                       |
| II. Browser-only          | ✅     | Static DOM plus a generated starfield; thumbnails are static files under `public/`                                          |
| III. Self-contained Space | ✅     | Spaces untouched and still lazy; the gallery is not a Space and imports no Space modules (registry metadata only)           |
| IV. Performance budgets   | ✅     | ≤ 5 KB gzipped (NFR); 1 draw call; pixel-ratio cap and hidden-tab pause inherited                                           |
| V. Accessible & resilient | ✅     | Real links and a list; heading; focus-visible; contrast check; reduced motion freezes the backdrop; broken images fall back |
| VI. Test-gated            | ✅     | Pure helpers (initials, labels, URLs, PRNG) unit-tested first; view lifecycle reuses 001's tested machinery                 |
| VII. Data-driven          | ✅     | Cards come from registry metadata; starfield parameters in `STARFIELD`                                                      |
| VIII. Small dependencies  | ✅     | **No new dependencies.** Inline SVG icons, hand-written PRNG                                                                |
| IX. Licensed assets       | ✅     | No images added now (demo-cube uses the placeholder); future thumbnails must be listed in `CREDITS.md`                      |
| X. Memory maintained      | ✅     | D-008 recorded; the stacking change goes into the architecture doc and learnings                                            |
