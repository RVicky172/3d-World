# Learnings & Gotchas

Non-obvious facts discovered while building. Keep entries short; group by topic. Delete entries that become wrong.

## Three.js

- Disposing a mesh does not dispose its material's textures — traverse materials and dispose each texture map explicitly. `disposeObject3D` (src/shared/dispose.ts) handles this, plus `ShaderMaterial` uniform textures and `scene.background`/`environment`.

## Three.js — renderer sizing

- Call `renderer.setSize(w, h, false)` when a `ResizeObserver` watches the container: with the default `updateStyle=true` Three writes inline px sizes onto the canvas, which then fights the CSS `100%` sizing. Let CSS size the canvas; set only the drawing buffer.
- Never pass a 0 width/height to a Space's `resize()` — `camera.aspect` becomes NaN/Infinity. `Engine` skips it.

## Testing

- E2E: import `test`/`expect` from `tests/e2e/fixtures.ts`, not `@playwright/test` — the fixture fails any test with console errors. `gotoSpace()` and `distinctCanvasColours()` live there too.
- Use Playwright's `test.use({ reducedMotion: "reduce" })` to make Space switches instant (fast loops) or to test the reduced-motion path.
- To check a test can fail, sabotage the code temporarily — but keep it compiling: `noUnusedLocals` makes the test build (and the Playwright web server) fail if you just comment out the only use of an import. `void importedThing;` keeps it used. Verified AC-4 this way: skipping dispose gives 11 geometries vs baseline 1.
- Scripts in `scripts/*.mjs` are type-checked (`allowJs` + `checkJs` + `// @ts-check`, JSDoc types) and unit-tested from `tests/unit/scripts/`.
- jsdom has no 2D canvas: `canvas.getContext("2d")` returns null and logs "Not implemented". For generated textures use `DataTexture` (bytes in a `Uint8Array`) — works in Node and on the GPU. `createFakeContext()` in `tests/helpers/fakes.ts` builds a `SpaceContext` for factory tests.
- Shared fakes (`FakeScheduler`, `FakeVisibility`, `createFakeRenderer`) live in `tests/helpers/fakes.ts`.
- A test factory that spreads `Partial<SpaceInstance>` overrides loses the `Mock` type on its methods; use `vi.mocked(instance.resize)` to get it back.
- Headless Chromium renders WebGL via SwiftShader (software). It's slow, so E2E scenes should allow a `?quality=low` mode; don't assert on FPS in CI.

## DOM / CSS

- `Fader`: a second `out()` while an `out()` is still running must wait for that same fade, not resolve early; requesting the state it is already in resolves immediately. It starts `covered` at boot so the first Space only fades in.
- Don't wait on `transitionend` for fades: it never fires if the property value doesn't change, if the element is `display: none`, or in jsdom. `Fader` resolves on a `setTimeout` of the same duration instead.

## Tooling

- To strip dev/test-only code from production, guard the **call site** with a literal `if (import.meta.env.MODE !== "production")`. Vite inlines MODE, the branch becomes dead code, and the imported module is tree-shaken. Passing MODE as a runtime argument alone would keep the module in the bundle. Verified: `__WORLD__` absent from `npm run build`, present in `npm run build:test`.
- `vite build --mode test` is still a minified production-style build (`import.meta.env.PROD` is true); only `MODE` differs.
- `vi.spyOn(obj, "dispose")` fails to typecheck when `obj` is a generic `T extends { dispose(): void }`; type the helper parameter structurally as `{ dispose(): void }` instead.

- Vite warns "chunks larger than 500 kB" for any Three.js bundle — that's the raw size; gzip is ~130 KB. The budget is measured gzipped (Constitution IV), so `chunkSizeWarningLimit` is set to 700.
- Typecheck includes `vite.config.ts`/`playwright.config.ts`, so `@types/node` + `"node"` in tsconfig `types` is required.
