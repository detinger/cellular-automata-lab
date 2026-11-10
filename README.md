# Cellular Automata Studio

An interactive, local-first web application for the **Modelling and Simulation** course: students build cellular automaton models, run them on a real simulation engine, explain individual cell transitions, and export reproducible models.

The full specification is in [PLAN.md](PLAN.md) and the visual language in [STYLE.md](STYLE.md). This README describes what is **actually implemented**.

## Status

Phases 0–6 of PLAN.md are implemented (the P1 course release). Phase 7 (GPU kernels, Gray–Scott, hexagonal or 3D lattices and other P2 research extensions) is deliberately not implemented. Evidence and the remaining open checks are in [docs/acceptance/phase-2-6.md](docs/acceptance/phase-2-6.md); supported semantics and limits are in [docs/capabilities.md](docs/capabilities.md).

What students can do:

- **Model** seven rule families: Life-like (B/S), all 256 elementary rules, Brian's Brain, cyclic CA, forest fire, spatial SIR and custom count tables, on finite lattices with periodic or fixed-exterior boundaries. Paint with any state, stamp and transform patterns, select regions, fill randomly with a visible seed, import/export `.ca.json` and binary RLE, export PNG.
- **Run and explain** on a CPU engine in a Web Worker: Play/Step/Step N/Reset, jump to any generation (checkpoint replay), and inspect any cell — neighborhood, rule clause, probabilities and the exact random draws used.
- **Measure**: state fractions, activity, entropy, births/deaths, SIR incidence and Rule 184 flow, as charts, tables and CSV.
- **Experiment**: replications and one- or two-factor sweeps with derived seeds, progress and cancellation, analysis windows, censoring and labeled 95% intervals; export CSV, `.ca-experiment.json` and a Markdown report.
- **Compare** a baseline with an alternative: assumption diff, side-by-side runs, Hamming distance when meaningful, independent or paired replicated comparisons.
- **Learn**: 12 lessons (predict → try → check → reflect) and 10 checked challenges with hints and rubrics, with local progress.
- Works **offline** after one visit, in light and dark themes, by keyboard, and down to 390 px wide.

## Requirements

- Node.js 20.19 or newer (22 recommended; see `.nvmrc`)
- No backend, accounts, API keys or external services

## Commands

| Command | What it does |
| --- | --- |
| `npm install` | Install the exact dependency versions from the lockfile |
| `npm run dev` | Start the Vite dev server on http://localhost:3000 |
| `npm run build` | Compile JSON Schemas to validators, then build the static site into `dist/` |
| `npm start` | Serve `dist/` with the bundled zero-dependency Node server (`PORT`, default 3000) |
| `npm run typecheck` | Strict TypeScript check |
| `npm run lint` | Type check plus ESLint |
| `npm run format` / `npm run format:check` | Prettier |
| `npm run bench` | Engine throughput per rule and lattice size (see docs/performance.md) |
| `npm test` | Unit and fixture tests (Vitest) |
| `npm run test:e2e` | Browser workflow tests (Playwright) against the production build. `PERF=1` adds the performance budget test |
| `node scripts/make-examples.mjs` | Regenerate the files in `examples/` from the presets |

For browser tests, either run `npx playwright install` once (Chromium, Firefox and WebKit), or use an installed Chrome: `PW_CHANNEL=chrome npm run test:e2e`.

## Offline use

In a production build served over HTTPS (or localhost), the service worker caches the app after the first visit, so it opens and runs without a network. Projects are in the browser's IndexedDB either way. When a new version is deployed, a banner offers **Reload to update**; nothing reloads by itself, so pause running simulations first.

## Deployment

The build is a static site (`dist/`). Hash-based routes (`#/project/…`) mean no server rewrites are required, but both configurations include an SPA fallback anyway. Both send the same security headers, including a Content-Security-Policy without `unsafe-eval`. To make that possible, JSON Schemas are precompiled at build time ([scripts/compile-schemas.mjs](scripts/compile-schemas.mjs)).

### Netlify

Configured by [netlify.toml](netlify.toml): build command `npm run build`, publish directory `dist`, Node 22, immutable caching for hashed `/assets/*`.

1. In Netlify, choose **Add new site → Import an existing project** and pick this repository. The settings are read from `netlify.toml`.
2. Alternatively, use the CLI: `npx netlify-cli deploy --build --prod`.

### Railway

Configured by [railway.json](railway.json): Railpack builds with `npm run build`, then runs `npm start`. That starts [server.mjs](server.mjs), a dependency-free static server that listens on Railway's `PORT`, serves `dist/` with an SPA fallback, and answers the health check at `/healthz`.

1. In Railway, choose **New Project → Deploy from GitHub repo** and pick this repository.
2. Under **Settings → Networking**, generate a public domain. Railway provides HTTPS.

No environment variables are needed on either platform.

## Project structure

```text
src/
  domain/        pure semantics: contracts, rules, engine, metrics, random streams, statistics,
                 experiments (planning, execution, analysis), comparison, learning types
  workers/       simulation worker, experiment worker, typed client
  renderers/     Canvas 2D renderer, state palettes, PNG snapshot
  storage/       Dexie/IndexedDB: projects, revisions, experiments, runs, metric chunks, progress, comparisons
  interchange/   .ca.json, RLE, metrics CSV, experiment package and report
  schemas/       JSON Schemas (model v1, experiment package v1) and the generated validator
  data/          presets, patterns, lessons, challenges, templates
  features/      library, modeler workspace, experiments, compare, learning
  app/ components/ styles/
tests/unit/      fixtures and invariants (PLAN §9.1–§9.2), learning content checks
tests/e2e/       Playwright workflows (§9.3), accessibility, reliability, performance
examples/        example model files and an experiment package
docs/            ADRs, acceptance evidence, capabilities, performance, storage, instructor guide, dependencies
```

`src/domain/` imports nothing from React, the DOM, workers or storage. It runs unchanged in the workers and in Node tests.

## Documentation

- [docs/capabilities.md](docs/capabilities.md) — supported semantics and known limitations
- [docs/instructor-guide.md](docs/instructor-guide.md) — course path, submissions, rubric
- [docs/storage.md](docs/storage.md) — database versions, migrations, recovery
- [docs/performance.md](docs/performance.md) — measured budgets and benchmark
- [docs/dependency-audit.md](docs/dependency-audit.md) — dependencies, licenses, content provenance
- [docs/adr/](docs/adr/) — architecture decisions
- [docs/acceptance/](docs/acceptance/) — acceptance evidence per phase

## Data and privacy

Projects, experiments and learning progress are stored only in this browser's IndexedDB. Clearing site data deletes them, so use **Export** to keep a `.ca.json` copy. Imported files are treated as data only: they are validated against the schema and never executed.

## License

Application code: see repository license. Bundled fonts are under the SIL Open Font License 1.1 (see [docs/dependency-audit.md](docs/dependency-audit.md)).
