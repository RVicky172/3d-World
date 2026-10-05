# 010 — Model Viewer Space

**Status:** Implemented <!-- Draft | Approved | In Progress | Implemented | Superseded -->
**Roadmap phase:** 2 · **Created:** 2026-10-05 · **Owner:** project lead

## Summary

The first real "one object, many angles" Space. A visitor opens it from the gallery and sees a detailed 3D
model, fully in view and lit so that every side reads clearly. They can turn it, zoom and pan with the shared
camera controls (004), and the model turns slowly by itself while they're idle. It replaces the demo cube as
the showcase of what the site is for, and it settles the known 004 issue: on narrow portrait phones a fixed
camera distance lets the subject overflow the screen. The model is framed to fit whatever screen it is shown on.

Asset compression, loading-progress UI (011) and annotations (012) come later. This feature only needs the
model to load, be framed, be lit and be explorable.

## User Stories

- **US-1:** As a visitor, I want to open a detailed 3D model from the gallery and see all of it at once, on a
  phone or a desktop, so that I immediately understand what I'm looking at.
- **US-2:** As a visitor, I want to orbit, zoom and pan around the model (mouse, touch or keyboard), so that I
  can look at it from any angle without losing it.
- **US-3:** As a visitor, I want the model lit realistically on every side, so that its materials and shape
  read well wherever I look from.
- **US-4:** As a visitor on a slow connection, I want to see that the model is loading, and to be told if it
  fails, so that I never stare at an empty screen.
- **US-5:** As the site owner, I want the model and its framing defined as data with its licence recorded, so
  that adding or swapping models later is a content change, not a code change.

## Acceptance Criteria

Each must be objectively testable. Note the test type that proves it.

### Showing the model

- [x] **AC-1:** The gallery shows a card for the model Space with its title, description and a preview.
      Opening it shows the model, the canvas is non-blank, `data-space-ready="true"` is set only once the
      model itself is visible, and the console stays clean. _(e2e)_
- [x] **AC-2:** **Auto-framing.** When the Space opens, the whole model is in view with a margin. Its projected
      bounds fill between 50 % and 90 % of the smaller viewport dimension. This holds at 1280 × 720
      (landscape), 768 × 1024 (tablet) and 320 × 640 (portrait phone). _(unit for the framing maths + e2e at
      the three sizes)_
- [x] **AC-3:** When the viewport is resized or rotated and the visitor has not moved the camera, the model is
      re-framed to satisfy AC-2 for the new size. Once the visitor has moved the camera, a resize doesn't
      override their view, but "Reset view" returns to the framed view for the current size. _(e2e)_
- [x] **AC-4:** **Lighting.** Seen from the front, back, left and right (via the keyboard controls), no view of
      the model renders as near-black: the average brightness of model pixels stays above a set threshold in
      every view. _(e2e)_

### Exploring

- [x] **AC-5:** The shared camera controls work as in 004: orbit, zoom and pan by mouse, touch and keyboard;
      the idle turntable; the hint, "?" help and "Reset view"; focus management. Zoom limits scale with the
      model's size, so the visitor can neither enter the model nor shrink its bounding sphere below 10 % of
      the smaller viewport dimension. The outline of an open shape can look smaller (about 7 % for the
      chair) but stays clearly visible. _(unit for the limits + e2e)_
- [x] **AC-6:** With `prefers-reduced-motion`, the turntable is off and the view moves only from input (005
      rules apply). _(e2e)_
- [x] **AC-7:** The focusable 3D view's accessible name names the model, and the Space's title and description
      are available to screen readers. _(e2e)_

### Loading and failure

- [x] **AC-8:** While the model is downloading, a visible, screen-reader-announced loading indication is
      shown. It disappears when the model appears. _(e2e — throttled or delayed model request)_
- [x] **AC-9:** If the model file fails to load (404 or network error), the visitor sees the existing "Failed
      to load" message. The back link still works, and no uncaught error occurs (the logged load error is
      expected). _(e2e — request blocked via route)_

### Lifecycle, budgets, licensing

- [x] **AC-10:** 10 gallery ↔ model round trips return GPU memory (geometries and textures) to the
      post-warm-up baseline. _(e2e)_
- [x] **AC-11:** After a WebGL context loss and restore (005), the model view comes back framed and lit.
      _(e2e)_
- [x] **AC-12:** The model's assets are served from the site itself (no third-party requests while the Space
      opens). The Space's code plus assets total ≤ 5 MB compressed. _(e2e request log + build check)_
- [x] **AC-13:** Every asset the Space uses (model, any textures, any environment map) has a source, author and
      licence line in `public/assets/CREDITS.md`, and each licence is CC0, CC-BY or public domain. For CC-BY
      assets, the attribution (title, author, licence) is also visible to visitors inside the Space.
      _(unit — test that reads the Space's data and CREDITS; e2e for the visible attribution)_
- [x] **AC-14:** The model and how it is shown (file path, title, description, initial view direction,
      turntable settings) are defined in a typed data file, not in render code. _(unit — data validation)_

## Scene / Content Notes

- **Model:** Khronos glTF sample "SheenChair" (© 2020 Wayfair, LLC; model and textures by Eric Chadwick;
  CC0 1.0), a 4.1 MB single GLB. It uses velvet "sheen" fabric, a good test of the lighting. No attribution
  is required, but a credit is shown anyway (AC-13). The scale is irrelevant because the view is auto-framed.
  The model holds still; only the camera's idle turntable moves (D-009).
- **Lighting:** image-based lighting from a **generated** studio environment, with no environment asset file.
  It lights and reflects on the model only; the background stays the site's dark `--bg`.
- **Camera:** initial direction comes from data (e.g. front three-quarter view); the distance comes from
  auto-framing.
- **Controls:** the shared 004 controls, with limits derived from the model's size.

## Non-Functional Requirements

- **Performance:** 60 FPS on a mid-range laptop and ≥ 30 FPS on a mid-range phone (Constitution IV). The
  entry bundle grows by ≤ 10 KB gzipped (D-013): the loader code belongs in the Space's lazy chunk, but the
  three core classes it uses join the shared `three` chunk (measured +8.3 KB). The gallery downloads none of
  the model's files.
- **Accessibility:** controls by mouse, touch and keyboard (from 004); the loading indication is announced; the
  failure message is reused from 001.
- **Size:** the Space's code plus assets is ≤ 5 MB compressed.

## Out of Scope

- Draco/Meshopt/KTX2 compression and a real progress bar (011). 010 ships the uncompressed GLB, which fits the
  5 MB budget.
- Hotspots, annotations, an info panel (012).
- More than one model, and an in-Space model picker. Each future model will be its own Space.
- Animated models (skeletal or morph animation playback).
- Post-processing (bloom, tone-mapping presets).

## Open Questions

All resolved on 2026-10-05 (D-012). The project lead delegated the choices: a learning project, so prefer
simple and well documented.

- **Q1:** Khronos "SheenChair" (CC0, 4.1 MB). Originally "DamagedHelmet", which was rejected in T002: its
  files are also licensed CC-BY-NC 4.0, which Constitution IX forbids (D-014).
- **Q2:** One Space per model, with the reusable viewer in `src/shared/` (Spaces never import each other).
  Each model gets its own gallery card and URL.
- **Q3:** A generated studio environment (no asset); the site's dark background stays.
- **Q4:** Keep the demo cube's card as the framework demo; the model Space is listed first.
- **Q5:** The uncompressed GLB is acceptable in 010 (≤ 5 MB); compression comes in 011.

## Changelog

- 2026-10-05 — Created.
- 2026-10-05 — Q1–Q5 resolved (D-012); added visible CC-BY attribution to AC-13. Approved.
- 2026-10-05 — NFR amended: entry growth ≤ 1 KB → ≤ 10 KB (D-013) after the T001 spike measured +8.3 KB from GLTFLoader's core imports.
- 2026-10-05 — Model changed from DamagedHelmet to SheenChair (D-014): DamagedHelmet is also CC-BY-NC 4.0, which Constitution IX forbids.
- 2026-10-05 — AC-5 clarified (D-016): the 10 % zoom-out floor applies to the model's bounding sphere, not its outline (T072 measured ~7 % outline for the chair at the limit).
- 2026-10-05 — Verified: all 14 ACs proven (379 unit + 90 E2E, build green, entry 144.8 KB). Implemented.
