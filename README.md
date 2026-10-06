# 3D World

Interactive 3D **Spaces** in the browser — from a single object you can inspect from every angle, to whole worlds
of objects moving together (like a solar system). Static site, no backend.

## Spaces

| Space        | What it shows                                                                                                                                                        |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Solar System | The Sun, 8 planets and 7 major moons at stylised or true scale on their real orbits, with time controls, real surfaces, and click-to-fly selection with a facts card |
| Sheen Chair  | One model from every angle, with a turntable, environment lighting and hotspots                                                                                      |
| Demo Cube    | The minimal Space the framework is tested with                                                                                                                       |

## Quick start

```bash
npm install
npx playwright install chromium   # once, for E2E tests
npm run dev                       # http://localhost:5173
```

## Scripts

| Command            | Does                                     |
| ------------------ | ---------------------------------------- |
| `npm run dev`      | Dev server with hot reload               |
| `npm run check`    | Typecheck + lint + unit tests            |
| `npm run test:e2e` | Build, preview, and run Playwright tests |
| `npm run build`    | Static production build in `dist/`       |

## How this project works

Development is **spec-driven**: every feature starts as a spec in [`specs/features/`](specs/features/) and moves
through Specify → Plan → Tasks → Implement → Verify. Start with [`specs/README.md`](specs/README.md).

- Principles: [`specs/constitution.md`](specs/constitution.md)
- Roadmap: [`specs/roadmap.md`](specs/roadmap.md)
- AI agent guidance: [`CLAUDE.md`](CLAUDE.md) · project memory: [`memory/`](memory/)
