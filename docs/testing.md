# Testing and verification

Last full run: 2026-11-10 on an Apple M1 MacBook (8 GiB, macOS 27.2.1), Node 26.13, Playwright 1.65, Chrome 158 stable.

## How to run

| Check | Command | Last result |
|---|---|---|
| Type check + lint | `npm run lint` | pass, 0 warnings |
| Formatting | `npm run format:check` | pass |
| Unit, fixture and statistics tests | `npm test` | 194 tests in 16 files pass |
| Browser workflows, Chrome | `PW_CHANNEL=chrome npm run test:e2e` | 22 pass, 1 skipped (opt-in performance test) |
| Browser workflows, WebKit | `npx playwright test --project=webkit` | 18 pass, 2 skipped (performance; offline is not supported by Playwright's WebKit) |
| Browser workflows, Firefox | `npx playwright test --project=firefox` | not yet run (Firefox would not start in the development sandbox) |
| Performance budgets | `PERF=1 PW_CHANNEL=chrome npx playwright test tests/e2e/perf.spec.ts`, `npm run bench` | pass — see [performance.md](performance.md) |
| Production build | `npm run build` | pass; first-load JS 444 kB (131 kB gzip) |

Run `npx playwright install` once for the bundled browsers, or use an installed Chrome with `PW_CHANNEL=chrome`.

## What the tests cover

Test IDs (SIM, REP, STAT, INT, E2E) appear in test names so failures are easy to trace.

| Area | IDs | Where |
|---|---|---|
| Life-like engine: empty grid, block, blinker, glider, corners under both boundaries, scrambled-order cross-check | SIM-01–06 | `tests/unit/engine.test.ts` |
| Elementary rules: every rule and input, Rules 0/30/90/255, Rule 184 moves and car conservation | SIM-07–12 | `elementary.test.ts`, `presets.test.ts` |
| Brian's Brain, cyclic, forest fire, SIR, probability 0/1 with draws still consumed, state range | SIM-13–20 | `multistate.test.ts` |
| Count tables: overlap, unreachable clauses, duplicates, default, limits; Life as a table equals Life | — | `multistate.test.ts`, `interchange.test.ts` |
| Reproducibility: 1,000 generations, 100 × 1 = 100, checkpoint → JSON → continue, inspection never advances the stream, run order, paired seeds | REP-01–07 | `multistate.test.ts`, `experiments.test.ts`, `compare.test.ts`, `seeded.test.ts`, `multistate.spec.ts` |
| Statistics: mean/SD/SE, entropy, sample-interval independence, censoring and Kaplan–Meier, zero-baseline relative change, Student-t against printed tables | STAT-01–08 | `stats.test.ts`, `experiments.test.ts` |
| Model JSON round trip and rejection of bad files | INT-01, INT-04 | `interchange.test.ts`, `slice.spec.ts` |
| Resumed experiment run equals an uninterrupted one | INT-02 | `experiments.test.ts` |
| RLE import/export | INT-03 | `rle.test.ts`, `editing.spec.ts` |
| Database migration; newer database refused and left untouched | INT-05 | `reliability.spec.ts` |
| Storage full: model stays usable, failure shown, export works | INT-06 | `reliability.spec.ts` |
| Stale worker messages, worker crash | INT-07, INT-08 | `workerClient.test.ts` |
| Create → step → explain → reset → undo → save → reopen | E2E-01 | `slice.spec.ts` |
| Lesson and challenge with the keyboard only; progress persists | E2E-02 | `learning.spec.ts` |
| 2 × 3 sweep with 3 replicates (18 runs); report reconciles with CSV | E2E-03, E2E-06 | `experiments.spec.ts` |
| Cancel a sweep, export, reload | E2E-04 | `experiments.spec.ts` |
| Baseline/alternative with a changed boundary | E2E-05 | `compare.spec.ts`, `compare.test.ts` |
| Offline after one visit | E2E-07 | `reliability.spec.ts` |
| Presets and lesson claims checked against the engine; challenges accept any valid solution | — | `presets.test.ts`, `patterns.test.ts`, `learning.test.ts` |
| Export schema for experiment packages; example files stay valid | — | `exportSchemas.test.ts` |
| Accessible names on every main page, no autoplay with reduced motion, no horizontal scroll at 390 px | — | `a11y.spec.ts` |

## Not yet verified

- Firefox, and a manual check in Safari.
- A manual screen-reader and 200% zoom review.
- The "new version available" banner (implemented; no test installs a second version).
- Wording of the teaching content by an instructor (factual claims are machine-checked).
- Performance on a low-end student device, and a leak check over many open/close cycles.
