# Asset Credits

Every 3D model, texture, font, and sound used by the site. Constitution IX: only CC0, CC-BY, public-domain, or self-made.

| Asset                                                                               | Path                                | Source                                                                                                                   | Author                             | License |
| ----------------------------------------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------- | ------- |
| SheenChair (converted: Meshopt + KTX2, `npm run assets`; original in `assets-src/`) | `assets/sheen-chair/SheenChair.glb` | [Khronos glTF-Sample-Assets: SheenChair](https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/SheenChair) | Eric Chadwick, © 2020 Wayfair, LLC | CC0 1.0 |

## Third-party code served as files

Decoders that ship with three.js and are served from the site itself (spec 011), not assets but listed for
completeness. Vite emits the transcoder from `node_modules/three` as hashed build files; the Meshopt decoder is
bundled into the Space's lazy chunk.

| Code                                                        | Source                                                                        | Author            | License    |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------- | ----------------- | ---------- |
| Basis Universal transcoder (`basis_transcoder.js`, `.wasm`) | [BinomialLLC/basis_universal](https://github.com/BinomialLLC/basis_universal) | Binomial LLC      | Apache-2.0 |
| Meshopt decoder (`meshopt_decoder.module.js`)               | [zeux/meshoptimizer](https://github.com/zeux/meshoptimizer)                   | Arseny Kapoulkine | MIT        |

## Data

Numbers bundled with the site's code (no files, nothing fetched at runtime), listed for provenance.

| Data                                                                                             | Used by                           | Source                                                                                                                                                                                                                                                                                        | Author   | License       |
| ------------------------------------------------------------------------------------------------ | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------- |
| Sun, planets and major moons: radii, GM, rotation, obliquity, orbital elements (read 2026-10-05) | `src/spaces/solar-system/data.ts` | [JPL Horizons](https://ssd.jpl.nasa.gov/horizons/), [planetary physical parameters](https://ssd.jpl.nasa.gov/planets/phys_par.html), [approximate planet positions](https://ssd.jpl.nasa.gov/planets/approx_pos.html), [satellite mean elements](https://ssd.jpl.nasa.gov/sats/elem/sep.html) | NASA/JPL | Public domain |
