# Cellular Automata Lab

A local-first web app for teaching **modelling and simulation with cellular automata**. Students build models, run them on a real simulation engine, see exactly why each cell changes, run reproducible experiments, compare assumptions, and work through lessons and checked challenges. It needs no backend and no accounts, and it works offline.

## Features

- **Seven rule families:** Life-like rules (`B…/S…`), all 256 elementary rules, Brian's Brain, cyclic CA, forest fire, spatial SIR, and custom count-table rules. They run on finite lattices with a periodic or fixed-exterior boundary.
- **Editing:** paint with any state, stamp and rotate patterns, select, copy and move regions, fill randomly with a visible seed, undo and redo.
- **Run and explain:** Play, Step, Step N and Reset; jump to any generation by exact replay. The inspector shows a cell's neighborhood, the rule clause that applies, the probabilities, and the random draws actually used.
- **Measure:** state fractions, activity, entropy, births and deaths, new infections and traffic flow, shown as charts and tables and exported to CSV.
- **Experiments:** replications and one- or two-factor parameter sweeps with derived seeds, progress, cancellation and resume. Results include 95% intervals and handle runs that never reached their event (censoring). Exports: CSV, an experiment package (`.ca-experiment.json`), and a Markdown report.
- **Compare** a baseline with an alternative: every changed assumption is listed, the two run side by side, and you can run independent or paired replicated comparisons.
- **Learn:** 12 lessons (predict, try, check, reflect) and 10 automatically checked challenges with hints and rubrics. Progress is stored locally.
- **Files:** `.ca.json` models (versioned JSON Schema), binary RLE patterns, and PNG snapshots with a caption.
- **Usability:** light and dark themes, full keyboard operation, layouts down to 390 px wide, and offline use after one visit.

The exact semantics and limits are in [docs/capabilities.md](docs/capabilities.md). The same information appears on the in-app **Capabilities** page.

## Getting started

Requires Node.js 20.19 or newer (22 recommended; see `.nvmrc`).

```bash
npm install
npm run dev        # http://localhost:3000
```

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server on port 3000 |
| `npm run build` | Compile the JSON Schemas, then build the static site into `dist/` |
| `npm start` | Serve `dist/` with the zero-dependency Node server (`PORT`, default 3000) |
| `npm run lint` | Strict TypeScript check plus ESLint |
| `npm run format` / `format:check` | Prettier |
| `npm test` | Unit, fixture and statistics tests (Vitest) |
| `npm run test:e2e` | Browser tests (Playwright) against the production build; `PERF=1` adds the performance test |
| `npm run bench` | Engine throughput per rule and lattice size |
| `node scripts/make-examples.mjs` | Regenerate `examples/` from the presets |

For browser tests, run `npx playwright install` once, or use an installed Chrome with `PW_CHANNEL=chrome npm run test:e2e`. The test coverage and the last results are listed in [docs/testing.md](docs/testing.md).

## Deployment

The build is a static site. Hash routes (`#/project/…`) need no server rewrites. Both hosting configurations send the same security headers, including a Content-Security-Policy without `unsafe-eval`; JSON Schemas are precompiled at build time to make that possible. No environment variables are needed.

- **Netlify:** [netlify.toml](netlify.toml) builds with `npm run build` and publishes `dist/`. Import the repository in Netlify, or run `npx netlify-cli deploy --build --prod`.
- **Railway:** [railway.json](railway.json) builds, then runs `npm start` ([server.mjs](server.mjs)), with a health check at `/healthz`. Deploy from GitHub, then generate a public domain under **Settings → Networking**.

**Offline use:** served over HTTPS (or on localhost), a service worker caches the app after the first visit. When a new version is deployed, a banner offers **Reload to update**. Nothing reloads by itself, so pause running simulations first.

## Project structure

```text
src/
  domain/        pure logic: contracts, rules, engine, metrics, random streams, statistics,
                 experiments, comparison, learning types (no React, DOM or storage imports)
  workers/       simulation worker, experiment worker, typed client
  renderers/     Canvas 2D renderer, state palettes, PNG snapshots
  storage/       IndexedDB (Dexie): projects, revisions, experiments, runs, progress, comparisons
  interchange/   .ca.json, RLE, CSV, experiment package and report
  schemas/       JSON Schemas and the generated validator
  data/          presets, patterns, lessons, challenges, templates
  features/      library, modeling workspace, experiments, compare, learning
  app/ components/ styles/
tests/unit/      engine fixtures, reproducibility, statistics, interchange, learning content
tests/e2e/       Playwright workflows, accessibility, reliability, performance
examples/        example models and an experiment package
docs/            documentation (below)
```

## Documentation

- [docs/capabilities.md](docs/capabilities.md): supported semantics and known limitations
- [docs/instructor-guide.md](docs/instructor-guide.md): course path, what students submit, rubric
- [docs/testing.md](docs/testing.md): how to run the checks, what they cover, what isn't verified yet
- [docs/performance.md](docs/performance.md): measured budgets and engine benchmark
- [docs/storage.md](docs/storage.md): database versions, migrations, failure handling
- [docs/dependency-audit.md](docs/dependency-audit.md): dependencies, licenses, content provenance
- [docs/adr/](docs/adr/): architecture decisions
- [STYLE.md](STYLE.md): visual design language (shared with a sibling app; some of its file paths refer to that app)

## Data and privacy

Projects, experiments and learning progress are stored only in the browser's IndexedDB; nothing is sent anywhere. Clearing site data deletes them, so export anything you want to keep. Imported files are treated as data only: they are validated and never executed.

## License

No license file has been added yet. Bundled fonts (Inter, JetBrains Mono) are under the SIL Open Font License 1.1, and Lucide icons under ISC; see [docs/dependency-audit.md](docs/dependency-audit.md).
