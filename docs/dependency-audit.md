# Dependency inventory

Recorded 2026-11-10 from `package-lock.json`. Versions are pinned exactly in `package.json`.

## Runtime (shipped to the browser)

| Package | Version | License | Purpose |
| --- | --- | --- | --- |
| react, react-dom | 19.2.4 | MIT | UI |
| dexie | 4.4.7 | Apache-2.0 | IndexedDB persistence |
| ajv | 8.20.0 | MIT | JSON Schema validation. Schemas are compiled at build time; only `ajv/dist/runtime/*` helpers ship |
| lucide-react | 0.546.0 | ISC | Outline icons |
| clsx | 2.1.1 | MIT | Class name joining |
| recharts (+ react-is 19.2.4, its peer) | 3.10.1 | MIT | Time-series, response and trajectory charts. Loaded with the workspace and experiment pages, not on first paint |
| seedrandom | 3.0.5 | MIT | Seeded random streams (Alea), wrapped by the versioned adapter `ca-studio-prng/1` (src/domain/random/prng.ts) |
| @fontsource-variable/inter | 5.3.0 | OFL-1.1 (font), MIT (package) | Self-hosted Inter |
| @fontsource/jetbrains-mono | 5.3.0 | OFL-1.1 (font), MIT (package) | Self-hosted JetBrains Mono |

## Build and test only

| Package | Version | License |
| --- | --- | --- |
| vite | 6.4.1 | MIT |
| @vitejs/plugin-react | 5.2.0 | MIT |
| tailwindcss, @tailwindcss/vite | 4.2.2 | MIT |
| typescript | 5.8.3 | Apache-2.0 |
| vitest | 3.2.7 | MIT |
| @playwright/test | 1.65.0 | Apache-2.0 |
| @types/node, @types/react, @types/react-dom, @types/seedrandom | 22.19.15, 19.2.18, 19.2.7, 3.0.8 | MIT |
| eslint, @eslint/js | 10.13.0, 10.0.1 | MIT |
| typescript-eslint | 8.72.1 | MIT |
| eslint-plugin-react-hooks | 7.1.1 | MIT |
| prettier | 3.9.10 | MIT |
| globals | 17.13.0 | MIT |

Lint and format tools added in Phase 6 were pinned to releases at least two weeks old at install time (2026-11-10).

## Runtime requirements

- Node.js ≥ 20.19 for building. Netlify and Railway use Node 22.
- Browsers need ES2022, module Web Workers, IndexedDB, `OffscreenCanvas` (optional; falls back to a DOM canvas) and `crypto.subtle` (secure context: HTTPS or localhost).
- Browser coverage: Chrome (desktop stable, 158) and Playwright WebKit pass the end-to-end suite. Firefox is configured but could not be launched in the development sandbox; run `npx playwright test --project=firefox` to verify it. Offline (service worker) needs a secure context.

## Removed from the AI Studio scaffold

`@google/genai`, `express`, `dotenv`, `motion` and `react-syntax-highlighter` were removed. The application needs no AI service or backend, and it never executes user-supplied JavaScript (PLAN.md §1.3, §7.3).

## Bundled content provenance and attribution

All bundled content was written for this app; nothing is copied from third-party sites.

- **Patterns** (block, blinker, toad, beacon, pulsar, glider, lightweight spaceship, R-pentomino, diehard, acorn, Gosper glider gun, HighLife replicator) are well-known Life patterns; their names and RLE are common knowledge in the Life community and documented, for example, in Golly's pattern collection and LifeWiki. Every behavior the app claims about them (periods, translations, populations, the replicator's copies) is verified by tests in `tests/unit/patterns.test.ts` and `tests/unit/presets.test.ts`, not taken on trust.
- **B/S notation and the named rules** (Life B3/S23, HighLife B36/S23, Seeds B2/S) follow Golly's documentation (PLAN.md §11).
- **Elementary rule numbering** follows Wolfram's convention (MathWorld, PLAN.md §11). The remark about Rule 30 and randomness cites *A New Kind of Science* (Wolfram, 2002) and is labeled as not tested by the app.
- **Brian's Brain** (Brian Silverman), **cyclic CA** (Griffeath and coworkers), **forest fire** (Drossel–Schwabl style) and **spatial SIR** are standard teaching models; the app's exact versions are defined in PLAN.md §7.3–§7.4 and documented in `docs/capabilities.md`.
- **Lessons, challenges, hints and rubrics** are original text. Factual claims about demo models are checked in `tests/unit/learning.test.ts`.
- **Fonts:** Inter and JetBrains Mono, both SIL Open Font License 1.1, self-hosted via Fontsource.
- **Icons:** Lucide, ISC license.
