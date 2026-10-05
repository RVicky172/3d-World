// @ts-check
// Models that `npm run assets` turns into web-ready files (spec 011). Rules: scripts/asset-pipeline.mjs.

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
];
