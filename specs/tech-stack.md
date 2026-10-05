# 3D World — Tech Stack

> Approved technologies. Adding or replacing anything here requires updating this file and logging the
> decision in `memory/decisions.md` (Constitution VIII).

**Last updated:** 2026-10-04

---

## Runtime (shipped to the browser)

| Concern         | Choice                                                                               | Why                                                                                                                                                                                                            |
| --------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3D engine       | **Three.js** (WebGL2 renderer)                                                       | Most mature web 3D library, huge ecosystem, tree-shakable ES modules, no framework lock-in.                                                                                                                    |
| Language        | **TypeScript** (strict)                                                              | Type-safe Space contracts and scene data; catches errors before the browser.                                                                                                                                   |
| UI shell        | **Vanilla TS + DOM** (no UI framework)                                               | The UI is small (gallery, panels, controls). Keeps bundle small; avoids two render loops. Revisit if UI grows complex.                                                                                         |
| Styling         | Plain CSS with custom properties                                                     | No build-time CSS dependency needed.                                                                                                                                                                           |
| Camera controls | `three/examples/jsm/controls/OrbitControls`                                          | Ships with Three.js; covers mouse/touch. Keyboard added in our wrapper.                                                                                                                                        |
| Model loading   | `GLTFLoader` + `MeshoptDecoder` + `KTX2Loader` (from `three/examples/jsm`)           | Compressed assets from the 011 pipeline: Meshopt geometry, KTX2 textures (no Draco, D-017). The Basis transcoder is self-hosted: Vite emits it from `node_modules/three` as hashed build files (no CDN calls). |
| Model lighting  | `RoomEnvironment` baked by `PMREMGenerator` (from `three/examples/jsm` / three core) | Generated studio lighting with no HDRI asset (010, D-012).                                                                                                                                                     |
| Routing         | Tiny in-house hash router                                                            | Hash routing works on any static host with zero server config.                                                                                                                                                 |

## Tooling (dev only)

| Concern                  | Choice                                                                                                                                                                                                   |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Build / dev server       | **Vite**                                                                                                                                                                                                 |
| Package manager          | **npm** (lockfile committed)                                                                                                                                                                             |
| Node                     | **≥ 20** (developed on Node 24)                                                                                                                                                                          |
| Unit / integration tests | **Vitest** (`jsdom` environment for DOM logic)                                                                                                                                                           |
| E2E / visual tests       | **Playwright** (Chromium; WebGL via SwiftShader in headless; ≤ 4 workers, D-015)                                                                                                                         |
| Lint                     | **ESLint** (flat config) + `typescript-eslint`                                                                                                                                                           |
| Format                   | **Prettier**                                                                                                                                                                                             |
| Asset optimisation       | glTF-Transform library (`@gltf-transform/core`, `/extensions`, `/functions`) + `meshoptimizer` + `ktx2-encoder` (WASM Basis encoder) + `sharp` (PNG decode/resize), run by `npm run assets` (011, D-018) |

## Hosting

Any static host. Default target: **GitHub Pages** (Vite `base` configurable via `VITE_BASE`). No server-side code.

## Explicitly Not Used (and why)

| Rejected                        | Reason                                                                                                                       |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Backend / database / serverless | Constitution II — browser only.                                                                                              |
| React Three Fiber               | Adds React + reconciler (~45 KB gz) for a small UI; vanilla Three keeps one mental model. Reconsider if UI complexity grows. |
| Babylon.js                      | Heavier bundle; Three.js ecosystem fits better.                                                                              |
| CDN-loaded runtime scripts      | Constitution II — all code/decoders are bundled or self-hosted.                                                              |
| Heavy physics engines           | Not needed; orbital motion is analytic. Revisit per-Space if a spec needs it.                                                |

## Browser Support

Latest 2 versions of Chrome, Edge, Firefox, Safari (desktop + mobile). WebGL2 required; fallback message otherwise.
