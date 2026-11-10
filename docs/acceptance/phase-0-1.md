# Acceptance evidence: Phase 0 and Phase 1

Recorded 2026-11-10 on macOS (Darwin 27.2), Node 26.13 locally, Chrome (installed stable) through Playwright 1.65.

## Automated checks

| Check | Command | Result |
| --- | --- | --- |
| Strict type check | `npm run typecheck` | pass |
| Unit and fixture tests | `npm test` | 35 tests pass |
| Production build | `npm run build` | pass. JS 398 kB (121 kB gzip). The worker is emitted as a separate chunk |
| Browser workflows | `PW_CHANNEL=chrome npm run test:e2e` | 3 tests pass in Chrome only |

### Fixtures covered (PLAN.md §9)

- SIM-01 through SIM-06 (empty grid, block, blinker, glider, corner under both boundaries, independent scrambled-order cross-check across three boundaries and three sizes)
- Deterministic part of REP-02: one 100-step call equals 100 single steps
- Import rejection: malformed JSON, missing or future version, unknown field, inconsistent byte count, bad base64, out-of-range cell, invalid B/S digit, too-small lattice, wrong state count, out-of-range exterior state
- INT-01: export → import preserves bytes, semantics and hash for every preset
- Presets: blinker has period 2, block is a still life, glider returns to its start after 128 generations on the 32×32 torus

### §1.2 first assignment (E2E-01)

`tests/e2e/slice.spec.ts`: open the bundled blinker → check rule B3/S23 → explain the birth at (2,1) → step exactly one generation (2 births, 2 deaths) → editing is refused at generation 1 with an explanation → reset → edit with the keyboard → undo/redo → save → reload → same cells and rule.

## Manual observations (Chrome, 1440×900 and 390×844, light and dark)

- Glider at 120 gen/s requested: about 119.9 gen/s achieved on the development laptop. This is a spot check, not the §9.4 benchmark.
- No horizontal page scroll at 390 px. Panels stack below the lattice under 1100 px.
- Switching themes redraws the canvas palette.

## Not yet done (items remain unchecked in PLAN.md)

- Checkpoint and run contracts. `INSPECT`, `CHECKPOINT` and `CANCEL` worker commands
- Playwright on Firefox and WebKit. Manual Safari check
- Lint and format tooling beyond `tsc` (ESLint and Prettier not configured)
- Performance budgets in §9.4 (not measured)
- Storage quota-failure test (INT-06). The UI shows "Save failed" and keeps the in-memory model, but this has not been exercised by a test
