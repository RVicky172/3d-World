# assets-src

Original, uncompressed source files for the site's 3D assets (spec 011, D-017). **Not deployed:** only `public/`
is served, and Vite never copies this folder into `dist/`.

`npm run assets` turns each source listed in `scripts/assets.config.mjs` into its web-ready file in
`public/assets/<space-id>/`: Meshopt-compressed geometry and KTX2 textures. Commit both the source and the
generated file. The build, the tests and the deploy only read the generated one.

| Source                       | Licence | Origin                                                                                                       |
| ---------------------------- | ------- | ------------------------------------------------------------------------------------------------------------ |
| `sheen-chair/SheenChair.glb` | CC0 1.0 | [Khronos glTF-Sample-Assets](https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/SheenChair) |

Licences and credits for everything shipped are in `public/assets/CREDITS.md`.
