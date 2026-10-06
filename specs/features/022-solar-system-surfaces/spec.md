# 022 — Solar System Surfaces: Textures, Saturn's Rings, Starfield, Sun Glow

**Status:** Implemented <!-- Draft | Approved | In Progress | Implemented | Superseded -->
**Roadmap phase:** 3 · **Created:** 2026-10-06 · **Owner:** project lead

## Summary

The Solar System now moves correctly (021), but every body is a plain-coloured sphere floating on black. This
feature gives it the look visitors expect: real surface imagery on every body, an Earth with clouds, city lights and
shining oceans, Saturn's rings with their shadows, the real night sky behind everything, and a glowing Sun. Because
021 already turns each body to its true orientation for the date, the imagery shows the right face: Earth's day side
over the right continents, the Moon's familiar near side towards Earth, and features visibly turning as time runs.
023 (selection and facts) builds on this.

## User Stories

- **US-1:** As a visitor, I want the Sun, planets and moons to show their real surfaces, so that I can recognise
  them and see what each one looks like.
- **US-2:** As a visitor, I want Earth to look alive (clouds, city lights at night, oceans catching the Sun), so that
  our own planet stands out.
- **US-3:** As a visitor, I want to see Saturn's rings, tilted and shadowed as they really are, so that the most
  famous feature of the Solar System is there.
- **US-4:** As a visitor, I want the real stars behind the Solar System, so that it feels like space and I can
  recognise constellations.
- **US-5:** As a visitor, I want the Sun to glow, so that it reads as the light source of the whole system.
- **US-6:** As a visitor on a slow connection, I want to use the Space straight away while the imagery arrives, so
  that I'm not left waiting.

## Acceptance Criteria

Each must be objectively testable. Note the test type that proves it.

### Surfaces

- [x] **AC-1:** **Real surfaces on all 16 bodies** (Q1): the Sun, the planets and the moons are drawn with surface
      imagery at both scales. Every image has a source and licence line in `public/assets/CREDITS.md`: public
      domain (NASA/USGS) where a good map exists, otherwise CC-BY 4.0 with attribution (Q2). _(unit: every body has
      an image and a credit; e2e: a close view of each body differs clearly from its plain colour at the same view,
      and shows surface detail a plain sphere doesn't, except Uranus and Neptune, whose maps are near-featureless)_
- [x] **AC-2:** **The right face shows:** each image's 0° longitude sits on the body's prime meridian (IAU), so the
      surface matches the date shown:
  - the hemisphere of Earth facing the Sun is the real one for the date and time (sub-solar longitude within
    **5°**);
  - the Moon shows its near side to Earth (the sub-Earth point within **10°** of 0° longitude, 0° latitude);
  - surface features turn with the body in the right direction as time runs (Venus and Uranus backwards).

  _(unit; e2e for a visible turn)_

- [x] **AC-3:** **Lighting still reads:** with imagery, the side facing the Sun is clearly brighter than the far
      side (020 AC-10), and a night side seen against black is still visible (D-028). _(e2e)_

### Earth (Q4)

- [x] **AC-4:** **Clouds:** a cloud layer just above Earth's surface, lit by the Sun like the surface, turning with
      Earth. _(unit for the layer; e2e: Earth's day side differs from the surface map alone)_
- [x] **AC-5:** **City lights:** Earth's night side shows city lights, which fade out across the day/night line and
      are absent on the day side. _(e2e: night-side pixels over a lit region brighter than over ocean; day side
      unaffected)_
- [x] **AC-6:** **Ocean shine:** oceans reflect the Sun as a highlight; land does not. _(e2e: near the sub-solar
      point an ocean is brighter than with the shine off; land unchanged)_

### Saturn's rings (Q5)

- [x] **AC-7:** **Saturn has its rings:** a semi-transparent ring band between the real inner and outer ring radii
      (as multiples of Saturn's radius), with a radial opacity and colour profile from a sourced image, in Saturn's
      equatorial plane, so they tilt and open and close over Saturn's 29-year orbit (nearly edge-on in 2025, wide
      open around 2032). At stylised scale they scale with Saturn's drawn size, and 020's "nothing overlaps" still
      holds (Titan clears the rings). Only Saturn has rings. _(unit for size and plane; e2e for ring pixels around
      Saturn at a close view)_
- [x] **AC-8:** **Lit and shadowed rings:** the rings' sunlit face is brighter than the face turned away; Saturn's
      shadow darkens the part of the rings behind it from the Sun, and the rings' shadow darkens a band on Saturn,
      wherever the geometry for the date puts them. _(unit for the shadow geometry; e2e: darker pixels where the
      shadows fall on a date with the rings open)_

### Sky and Sun

- [x] **AC-9:** **The real night sky** (Q6): the catalogue's stars brighter than about magnitude 6.5, at their true
      positions and relative brightness, so constellations are recognisable (e.g. Sirius, Betelgeuse and Polaris
      within **0.5°** of their true directions). The catalogue is public domain or CC-BY (no share-alike). Stars
      are infinitely far, at both scales: turning the camera turns the sky, but panning and zooming don't move it.
      Bodies, rings, orbit lines and markers always draw over the stars, and the stars never catch pointer events.
      _(unit for positions; e2e for behaviour)_
- [x] **AC-10:** **The Sun glows** (Q7): a soft, static halo around the Sun at both scales, visible at the home view.
      It never hides a body, ring or marker in front of it and never catches pointer events. _(e2e)_

### Loading and lifecycle

- [x] **AC-11:** **Opens at once; imagery arrives** (Q8): the Space opens in its 021 plain colours, ready to use,
      and each body's imagery fades in as it arrives (instantly under reduced motion). The loading indicator shows
      the imagery's progress meanwhile. If an image fails to load, that body keeps its plain colour and the Space
      still works. _(unit; e2e with a slow and a failing image)_
- [x] **AC-12:** **Lifecycle:** leaving frees every texture, the rings, the sky and the glow (10 round trips back to
      the baseline, GPU textures included), even if it happens while imagery is still arriving. After a WebGL
      context loss and restore, the Space comes back with its imagery, at the same date and state as 021 AC-12.
      _(e2e)_
- [x] **AC-13:** **Budgets** (Q3, Q9): imagery and star data together **≤ 3 MB** compressed (2K maps for the
      planets, 1K for the Sun, moons and Earth's extra layers); the Space's code, assets and the shared image decoder **≤ 4 MB** (D-030; constitution
      cap 5 MB); entry growth **≤ 5 KB** gzipped over 021's 146.6 KB; 60 FPS on a mid-range laptop with time
      running. _(build check; manual FPS note)_

## Scene / Content Notes

- **Bodies:** all 16 from 020. Moons are synchronous, so their imagery needs no extra data (021 already faces them
  at their planet).
- **Imagery:** equirectangular (longitude × latitude) maps; each source's longitude convention is recorded so AC-2
  can be checked. Public-domain NASA/USGS mosaics first; CC-BY 4.0 where none fits (Q2). Compressed through the 011
  asset pipeline (KTX2).
- **Earth:** surface, clouds, night lights and an ocean mask (Q4), at 1K for the extra layers within the budget.
- **Saturn's rings:** radii from a sourced value (the C ring's inner edge to the A ring's outer edge, ~1.24–2.27
  equatorial radii, 1.28–2.35 × the mean radius the sphere is drawn with), opacity and colour from a sourced radial profile; plane = Saturn's equator (021's pole).
- **Sky:** a star catalogue in the J2000 equatorial frame, turned into 021's ecliptic scene frame; never clipped by
  real scale's far plane.
- **Sun:** imagery plus a static glow; the glow is decoration, not a light source.

## Non-Functional Requirements

- **Performance:** 60 FPS with time running at both scales (021 AC-13). Textures are uploaded once; nothing is
  re-created per frame or on a scale switch.
- **Download:** the Space opens without waiting for imagery; the indicator shows its progress (011).
- **Accessibility:** no new controls. The sky and glow are decorative. Under reduced motion nothing animates on its
  own (imagery appears without a fade).
- **Licences:** only public-domain or CC-BY imagery and data, each with a `CREDITS.md` line; no runtime
  third-party fetches.

## Out of Scope

- Selection, flying to a body, facts, stylised-scale labels (023).
- Higher-resolution imagery on zoom, LOD (030).
- Bloom or other post-processing (backlog); terrain relief and normal maps.
- Rings of Jupiter, Uranus and Neptune; atmospheres other than Earth's clouds; comets, asteroids, dwarf planets;
  the Milky Way as an image.

## Open Questions

All resolved by the project lead on 2026-10-06 (D-029):

- **Q1 — Bodies:** all 16 get imagery.
- **Q2 — Source:** public-domain NASA/USGS first; CC-BY 4.0 with attribution where none fits.
- **Q3 — Budget:** ~3 MB; 2K for the planets, 1K for the rest.
- **Q4 — Earth extras:** clouds, city lights and ocean shine.
- **Q5 — Rings:** Saturn only, with Saturn's shadow on the rings and the rings' shadow on Saturn.
- **Q6 — Stars:** a real catalogue to about magnitude 6.5.
- **Q7 — Sun glow:** static.
- **Q8 — Loading:** open at once in plain colours; imagery fades in as it arrives.
- **Q9 — Entry cap:** ≤ 5 KB.

## Changelog

- 2026-10-06 — Created.
- 2026-10-06 — Q1–Q9 resolved (D-029); ACs for Earth's layers (AC-4–AC-6) and ring shadows (AC-8) added.
- 2026-10-06 — Approved by the project lead.
- 2026-10-06 — AC-13: the Space's total, counted with the shared 0.57 MB image decoder as the bundle check does, is ≤ 4 MB (was 3.5 MB); imagery stays ≤ 3 MB (D-030).
- 2026-10-06 — Plan approved (D-030); tasks written (26 tasks). In Progress.
- 2026-10-06 — Content notes: ring radii also given in mean radii (the drawn sphere), 1.28–2.35 (T020).
- 2026-10-06 — AC-1's E2E note: all 16 differ from their plain colour; the detail check excludes Uranus and Neptune, whose maps are near-featureless (T060, D-033).
- 2026-10-06 — AC-13's frame rate settled on the software floor: SwiftShader 53.5–56.5 fps at the whole-system views with time running (60 with the maps blocked; software texture sampling), accepted by the lead (D-034). Implemented.
- 2026-10-06 — Implemented: all 13 ACs verified (902 unit + 177 E2E; entry 147.9 KB, +1.3 of 5; Space 3.06 MB of 4:
  code 45.5 KB + imagery and stars 2.46 MB + decoder 571 KB). D-029–D-034. Committed `322b1b6`.
