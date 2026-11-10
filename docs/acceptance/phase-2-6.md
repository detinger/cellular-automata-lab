# Acceptance evidence: Phases 2–6

Recorded 2026-11-10 on an Apple M1 MacBook (8 GiB, macOS 27.2.1), Node 26.13, Playwright 1.65, Chrome 158 stable. Every item below names its evidence; anything not verified is listed under **Open**.

## Automated checks

| Check | Command | Result |
|---|---|---|
| Type check + lint | `npm run lint` (tsc strict + ESLint) | pass, 0 warnings |
| Formatting | `npm run format:check` | pass |
| Unit, fixture and statistics tests | `npm test` | 194 tests in 16 files pass |
| Browser workflows, Chrome | `PW_CHANNEL=chrome npm run test:e2e` | 22 pass, 1 skipped (opt-in perf) |
| Browser workflows, WebKit | `npx playwright test --project=webkit` | 18 pass, 2 skipped (perf; offline test is skipped on WebKit) |
| Browser workflows, Firefox | `npx playwright test --project=firefox` | **not run**: Firefox would not start inside the development sandbox ("Could not find profile folder") |
| Performance budgets | `PERF=1 PW_CHANNEL=chrome npx playwright test tests/e2e/perf.spec.ts`, `npm run bench` | pass — see [docs/performance.md](../performance.md) |
| Production build | `npm run build` | pass; first-load JS 444 kB (131 kB gzip) |

## Plan §9 fixture map

| ID | Evidence |
|---|---|
| SIM-07–SIM-12 (ECA, Rule 184) | `tests/unit/elementary.test.ts`, `presets.test.ts` |
| SIM-13–SIM-20 (Brain, cyclic, fire, SIR, probability bounds, state range) | `tests/unit/multistate.test.ts` |
| Count-table validation (overlap, unreachable, duplicates, default, limits) | `multistate.test.ts`, `interchange.test.ts` (schema rejects missing default and code-like fields) |
| REP-01, 02, 04, 06 | `multistate.test.ts` (1,000 generations; 100 × 1 = 100; checkpoint 123 → JSON → 250; draws replayed without advancing) |
| REP-03 | `tests/e2e/multistate.spec.ts` (replay back and forth gives identical counts); worker skips frames, never generations (ADR 0002) |
| REP-05, REP-07 | `tests/unit/experiments.test.ts`, `compare.test.ts`, `seeded.test.ts` |
| STAT-01–STAT-08 | `tests/unit/stats.test.ts` (t quantiles checked against printed tables), STAT-05 in `experiments.test.ts` |
| INT-01, INT-04 | `interchange.test.ts`, `slice.spec.ts`, `editing.spec.ts` |
| INT-02 | `experiments.test.ts` (resumed run equals uninterrupted run, including accumulators) |
| INT-03 | `rle.test.ts`, `editing.spec.ts` |
| INT-05 | `reliability.spec.ts` (v1 database migrates; newer database refused and untouched) |
| INT-06 | `reliability.spec.ts` (quota error: model usable, failure shown, export works) |
| INT-07, INT-08 | `tests/unit/workerClient.test.ts` |
| E2E-01 | `slice.spec.ts` |
| E2E-02 | `learning.spec.ts` (lesson and challenge with keyboard only; progress persists) |
| E2E-03, E2E-06 | `experiments.spec.ts` (18 runs, unique seeds; report means recomputed from the CSV) |
| E2E-04 | `experiments.spec.ts` (cancel → export → reload; no summary from cancelled runs) |
| E2E-05 | `compare.spec.ts`, `compare.test.ts` |
| E2E-07 | `reliability.spec.ts` (Chrome) |

## Phase gates

**Phase 2 (P0).** All 256 ECA rules with bit editor and spacetime view; RLE subset with explicit rule choice; region selection, stamps with rotate/mirror preview, seeded random fill; contextual validation with stable codes and lesson links; charts with table view and CSV; keyboard cursor editing. Six lessons on levels 1–3, four challenges, eight verified presets exceeded (16). A student can finish a lesson, build and run a model, explain a transition, pass a challenge and export without source access (E2E-01, E2E-02).

**Phase 3.** Brian's Brain, cyclic, forest fire, SIR and count tables run on the CPU engine with the fixed two-draw schedule (ADR 0005). Multistate palettes (STYLE.md §9 tokens), state legend with paint state, per-family inspector with probability preview and recorded draws, checkpoint ring with replay. Save/resume gives identical state and metrics (REP-04); speed and frame skipping do not change results.

**Phase 4.** Immutable definitions with frozen revision and hash; single runs, replications, one- and two-factor sweeps; derived seeds; one worker with progress, cancellation and 10-second recovery checkpoints; summaries with labeled t intervals; censoring with Kaplan–Meier median; CSV, `.ca-experiment.json` (schema `src/schemas/experiment-package.v1.schema.json`, validated in `exportSchemas.test.ts`) and Markdown report; workload preflight (ADR 0006).

**Phase 5.** Compare page: assumption diff, side-by-side runs with generation lock and independent pan/zoom, Hamming distance only when compatible, fractions when sizes differ, independent (Welch) and paired comparisons, relative change with N/A at zero baseline, saved interpretation. Twelve lessons, ten challenges with explainable predicates, progressive hints and rubrics; multiple valid solutions accepted (`learning.test.ts`). Investigation template; revisions panel with branching and experiment provenance.

**Phase 6.** Performance budgets measured ([performance.md](../performance.md)); offline after one visit (E2E-07) with a user-controlled update banner (ADR 0007); migrations, quota failure, crash recovery and worker errors tested; dependency, provenance and attribution recorded ([dependency-audit.md](../dependency-audit.md)); capabilities and limitations published ([capabilities.md](../capabilities.md), in-app page); [storage.md](../storage.md) and [instructor-guide.md](../instructor-guide.md) added; README updated.

## Accessibility

Automated (`tests/e2e/a11y.spec.ts`): every visible control on the library, five workspace families, experiment designer, learn, lesson, challenge, experiments and capabilities pages has an accessible name; lessons do not autoplay with reduced motion; no horizontal page scroll at 390 px. Keyboard-only lesson and challenge completion (E2E-02). Charts have table alternatives; the lattice has one focus target with arrow-key navigation and a text summary.

## Open

- **Firefox**: run `npx playwright test --project=firefox` on a normal machine.
- **Manual Safari check** and a **manual screen-reader / 200% zoom review** have not been done.
- **Update banner**: implemented, but no automated test installs a second version.
- **Teaching content review**: lesson claims about demos are machine-checked, but an instructor should review the wording before a course run.
- **Low-end device** performance and a lifecycle leak test over many open/close cycles.
