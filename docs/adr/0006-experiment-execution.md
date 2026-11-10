# ADR 0006: Experiment execution and persistence

**Status:** accepted (2026-11-10)

## Decision

- An experiment freezes one model revision (spec and hash) at creation. Its run manifest (configurations × replicates, with derived seeds) is a pure function of the definition, so execution order cannot change any run (REP-05).
- One dedicated experiment worker runs runs sequentially in 30 ms slices, reports progress every 250 ms and checks for cancellation between slices. A pool was not needed: one worker meets the budgets (docs/performance.md).
- Analysis accumulators (window means and maxima) are computed from every generation inside the run, independent of the stored sample interval (STAT-05).
- Early stops are only allowed with a defined treatment: absorbing stops carry values forward and say so; non-absorbing stops make later window values unavailable rather than estimated. Event-time responses keep censored runs separate.
- A run is stored as one transaction of {metric chunk with SHA-256, run record}; recovery checkpoints every 10 s allow resuming an interrupted run.

## Consequences

Very large sweeps are refused before launch (250 runs, 2 × 10⁹ cell updates, 100,000 rows per run) with a suggestion; the app never silently reduces the requested work.
