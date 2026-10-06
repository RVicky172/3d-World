// @ts-check
// Models and textures that `npm run assets` turns into web-ready files (specs 011, 022). Rules:
// scripts/asset-pipeline.mjs.

import { IMAGERY, outputPath } from './solar-imagery.mjs';

/** Byte caps per Solar System map (D-029: ~3 MB in all; the T002 trial measured ≤ 290 KB at 2K, ≤ 95 KB at 1K). */
const MAP_CAP = { planet: 450 * 1024, other: 200 * 1024 };
const PLANETS = new Set(['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune']);
/** Data maps stay linear: the ocean mask feeds roughness, the clouds feed alpha. */
const LINEAR = new Set(['earth-ocean', 'earth-clouds']);

/** @type {import('./asset-pipeline.mjs').AssetManifest} */
export default [
  {
    id: 'sheen-chair',
    source: 'assets-src/sheen-chair/SheenChair.glb',
    output: 'public/assets/sheen-chair/SheenChair.glb',
    maxBytes: 1.5 * 1024 * 1024, // spec 011, AC-1
    // ETC1S for colour; UASTC + Zstandard for data maps, where ETC1S artefacts show (normals).
    textures: { color: 'etc1s', data: 'uastc' },
    // The 1024² normal map was 838 KB of UASTC. At 512 px (it tiles 2×2 at strength 0.6) the model is
    // 1.27 MB instead of 1.83 MB (T003 spike).
    maxSize: { normalTexture: 512 },
  },
  // Spec 022: every Solar System map (sources fetched by scripts/fetch-solar-imagery.mjs). ETC1S throughout, the
  // ocean mask included: a two-level mask survives it, and UASTC would cost ~0.3–0.5 MB (T002).
  ...IMAGERY.map(
    ({ id }) =>
      /** @type {const} */ ({
        kind: 'texture',
        id: `solar-system-${id}`,
        source: outputPath(id),
        output: `public/assets/solar-system/${id}.ktx2`,
        maxBytes: PLANETS.has(id) ? MAP_CAP.planet : MAP_CAP.other,
        mode: 'etc1s',
        color: !LINEAR.has(id),
      }),
  ),
];
