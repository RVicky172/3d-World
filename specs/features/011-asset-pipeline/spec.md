# 011 — Asset Pipeline

**Status:** Implemented <!-- Draft | Approved | In Progress | Implemented | Superseded -->
**Roadmap phase:** 2 · **Created:** 2026-10-05 · **Owner:** project lead

## Summary

The Sheen Chair Space (010) ships an uncompressed 4.1 MB model, so visitors on slow or metered connections wait
and pay for bytes they don't need. This feature makes 3D assets small: models are delivered with compressed
geometry and GPU-compressed (KTX2) textures, produced from their original source files by a repeatable,
documented step. While a model downloads, the visitor sees **how far along** it is instead of a bare "Loading…".
The chair must look the same as before. Every later Space (solar system textures, more models) reuses the
pipeline, so Constitution IV's "use compressed assets for anything non-trivial" becomes the default.

## User Stories

- **US-1:** As a visitor on a phone connection, I want the model to arrive quickly and use little data, so that I
  can start exploring sooner.
- **US-2:** As a visitor waiting for a model, I want to see how much of it has loaded, so that I know the page is
  working and roughly how long to wait.
- **US-3:** As a visitor using a screen reader, I want loading progress announced at a calm pace, so that I know
  what is happening without being flooded.
- **US-4:** As a visitor, I want the compressed model to look as good as the original, so that smaller files don't
  cost quality.
- **US-5:** As a maintainer, I want one documented command that turns an original model into its web-ready version,
  so that adding or updating a model is repeatable and reviewable.

## Acceptance Criteria

Each must be objectively testable. Note the test type that proves it.

### Smaller assets

- [x] **AC-1:** The Sheen Chair Space loads a compressed version of the model: Meshopt-compressed geometry and
      KTX2 textures. The model file (with its embedded textures) is at most **1.5 MB**, down from the 4.1 MB
      original. Decoders count towards AC-6's Space budget, not this limit. _(e2e request log and build check)_
- [x] **AC-2:** **Visual parity.** The compressed chair still meets 010's AC-2 (framing 50–90 % at 1280 × 720,
      768 × 1024 and 320 × 640) and AC-4 (lit from all four sides). Its average model brightness differs from the
      uncompressed original by no more than **10 %**, from the same view. Its rendered pixels also match: the
      mean absolute RGB difference over model pixels is at most **2.0** (of 255) from the same view, which a
      model that lost its textures fails (D-019).
      _(e2e)_
- [x] **AC-3:** Every 010 acceptance criterion still passes with the compressed model: controls, reduced motion,
      accessible name, failure path, memory round trips, context loss and restore, same-origin requests, and
      credits. _(e2e — the existing 010 suite)_

### Self-hosted decoders

- [x] **AC-4:** Everything needed to decode the compressed model (geometry decoder, texture transcoder) is served
      from the site itself. No third-party request is made while the Space opens. _(e2e request log)_
- [x] **AC-5:** The gallery does not download any decoder: decoders are fetched only when a Space that needs them
      opens. _(e2e request log on the gallery)_
- [x] **AC-6:** Entry bundle growth over 010's 144.8 KB stays within an allowance set by a first-task spike:
      **≤ 5 KB gzipped**, or, if the spike measures more, a number the project lead approves (spec Changelog and
      a decision entry). Also, the Space's code + assets + decoders total ≤ 5 MB (Constitution IV). _(build check)_
- [x] **AC-7:** The model works on devices that lack some GPU texture formats: the textures are transcoded to a
      format the device supports, or to an uncompressed fallback, and the chair still renders lit and
      non-blank. _(e2e in headless Chromium/SwiftShader, which supports few compressed formats; unit for the
      format choice if it is our code)_

### Loading progress

- [x] **AC-8:** While the model downloads, the loading indication shows progress: a bar and a percentage
      ("Loading Sheen Chair… 42 %") that advance from 0 to 100 % as bytes arrive. If the total size is unknown, it falls back to 010's
      indeterminate "Loading <title>…". _(e2e with a throttled response; unit for the progress maths)_
- [x] **AC-9:** Progress is exposed to assistive technology as a progress indicator with a name and current
      value. Spoken updates come only at 25 %, 50 % and 75 %, so screen readers are not flooded.
      When a view whose loading indication was shown is ready, "<title> loaded" is announced once; a
      fast open stays silent (D-019). _(unit + e2e for roles and attributes)_
- [x] **AC-10:** With `prefers-reduced-motion`, the progress indicator still updates its value, but nothing
      pulses or animates. _(e2e)_
- [x] **AC-11:** Progress never moves backwards, and the indicator is gone once the model is drawn (010 AC-8
      timing rules still apply: nothing shows for loads under 250 ms). _(unit + e2e)_

### Failure

- [x] **AC-12:** If a decoder file fails to load, or the compressed model is corrupt, the visitor sees the existing
      "Failed to load" message. The back link works, nothing is left allocated, and the only console error is the
      expected logged load error. _(e2e — decoder request blocked via route; unit for the viewer's rejection
      path)_

### Lifecycle

- [x] **AC-13:** 10 gallery ↔ chair round trips return GPU memory to the post-warm-up baseline, and leave no
      growing number of decoder workers behind. _(e2e)_

### Repeatable pipeline and licensing

- [x] **AC-14:** One documented command regenerates every web-ready model from its original source. Running it
      twice gives files of the same size, and it fails with a clear message if a source file is missing.
      _(unit for the pipeline's settings and checks; documented in `README` or `specs/architecture.md`)_
- [x] **AC-15:** `CREDITS.md` records, for every shipped asset, its original source and licence and notes that it
      was converted. The 010 credit unit test still passes for the converted files. _(unit)_

## Scene / Content Notes

- **Model:** the same Khronos "SheenChair" (CC0 1.0). It uses `KHR_materials_sheen` and
  `KHR_texture_transform`; both must survive compression. CC0 allows modified versions.
- **What "the same" means:** framing, lighting and colour as measured by 010's E2E checks, plus a brightness
  comparison with the original (AC-2). Tiny texture compression artefacts are acceptable; visible banding or
  colour shifts on the velvet are not.
- **Progress UI:** extends 010's loading indicator (same place, z-order and wording) rather than adding a second
  one.

## Non-Functional Requirements

- **Performance:**
  - Entry growth per AC-6.
  - Decoding must not freeze the page: the gallery and back link stay responsive while the model decodes.
  - Time from opening the Space to the model drawn must be no worse than 010 on a typical connection.
- **Accessibility:** progress per AC-9 and AC-10. The loading indication keeps `role`/`aria-live` behaviour that
  010 tested.
- **Repository:** original source models live in the repo under `assets-src/`, which is not deployed (Q3).

## Out of Scope

- New models or Spaces. The pipeline is proven on the existing chair.
- Solar-system textures (Phase 3 uses this pipeline later).
- Streaming or level-of-detail loading (030 performance pass).
- Caching across visits beyond what the browser's HTTP cache does.
- Hotspots, annotations or an info panel (012).

## Resolved Questions

All resolved by the project lead on 2026-10-05 (D-017).

- **Q1 — Geometry compression:** Meshopt only. Its decoder is small and also covers animation later. No Draco.
- **Q2 — Targets:** the model file is ≤ 1.5 MB (AC-1); average brightness is within 10 % of the original (AC-2).
- **Q3 — Source files:** originals are kept in the repo under `assets-src/` (not deployed), so the pipeline is
  reproducible offline.
- **Q4 — Progress display:** a bar plus a percentage. Screen readers hear 25 %, 50 % and 75 %, then the model
  appearing (AC-8, AC-9).
- **Q5 — Entry allowance:** a first-task spike measures it. ≤ 5 KB → the cap is 5 KB. More → stop and propose a
  number for approval (AC-6).

## Changelog

- 2026-10-05 — Created.
- 2026-10-05 — Q1–Q5 resolved (D-017): Meshopt only, ≤ 1.5 MB and 10 %, sources in `assets-src/`, bar + % announced every 25 %, entry allowance set by a spike. Approved.
- 2026-10-05 — T001 spike: entry +0.2 KB, so the AC-6 allowance is 5 KB (D-017 rule).
- 2026-10-05 — T003 spike: chair at 1.27 MB (normal map capped at 512 px); ktx2-encoder works in Node; output is deterministic.
- 2026-10-05 — Plan approved (with the D-018 dev dependencies); tasks written. In Progress.
- 2026-10-05 — AC-2 strengthened with a pixel-difference limit (≤ 2.0 mean RGB): mean brightness alone moved only 3.4 % when every texture was stripped. AC-9 now announces "<title> loaded" after a visible load (D-019).
- 2026-10-05 — Verified: all 15 ACs proven (475 unit + 99 E2E, build green). Entry 145.6 KB (+0.8 KB), chair 1.26 MB (from 4.1 MB), Space 1.86 MB. NFRs measured: ~1.85 s to drawn at 10 Mbit/s vs ~3.4 s for the original; longest main-thread task ~80 ms either way. Implemented.
