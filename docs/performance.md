# Performance results

Recorded 2026-11-10. These are measurements on one machine, not guarantees.

**Device:** Apple M1 MacBook (8 logical CPUs, 8 GiB RAM), macOS 27.2.1. Node 26.13.0. Chrome 158 (stable) driven by Playwright 1.65, viewport 1440 × 900. CPU worker + Canvas 2D backend only; no GPU path exists.

## Interactive budget (browser)

Workload: Life B3/S23, 256 × 256, periodic boundary, random 30% alive, basic metrics on, no cycle search, default history settings. Reproduce with `PERF=1 PW_CHANNEL=chrome npx playwright test tests/e2e/perf.spec.ts` (writes `test-results/perf-<browser>.json`).

| Target | Result | Status |
|---|---|---|
| ≥ 30 generations/s for 30 s at 256² (30 requested) | 29.93 gen/s achieved over 30 s | pass (the scheduler paces to the requested rate) |
| ≥ 30 displayed frames/s at 256² | 51.2 lattice draws/s (includes hover redraws) | pass |
| Pause acknowledgment p95 < 250 ms | 86 ms (20 samples, click → Play visible) | pass |
| Brush/edit update p95 < 100 ms | 45 ms (20 keyboard toggles → KPI updated, on 256²) | pass |
| At most two pending display snapshots | enforced in `simulation.worker.ts` (`MAX_PENDING = 2`) | by design |
| ≤ 2,000 chart points per series | enforced by `decimate()` (display only; exports keep every row) | by design |

## Engine throughput (single thread, Node)

`npm run bench` — the same engine code the worker runs. Lattice sizes 128² to 1024².

| Rule | Lattice | Generations/s | Cell updates/s |
|---|---|---:|---:|
| Life B3/S23 | 128 × 128 | 12890.3 | 211.2 M |
| Life B3/S23 | 256 × 256 | 3067.0 | 201.0 M |
| Life B3/S23 | 512 × 512 | 747.8 | 196.0 M |
| Life B3/S23 | 1024 × 1024 | 169.0 | 177.2 M |
| Brian's Brain | 128 × 128 | 4221.9 | 69.2 M |
| Brian's Brain | 256 × 256 | 1086.0 | 71.2 M |
| Brian's Brain | 512 × 512 | 274.0 | 71.8 M |
| Brian's Brain | 1024 × 1024 | 67.5 | 70.7 M |
| Cyclic K=14 T=1 vN | 128 × 128 | 5651.8 | 92.6 M |
| Cyclic K=14 T=1 vN | 256 × 256 | 1375.7 | 90.2 M |
| Cyclic K=14 T=1 vN | 512 × 512 | 329.7 | 86.4 M |
| Cyclic K=14 T=1 vN | 1024 × 1024 | 85.3 | 89.5 M |
| Forest fire | 128 × 128 | 3423.4 | 56.1 M |
| Forest fire | 256 × 256 | 765.2 | 50.1 M |
| Forest fire | 512 × 512 | 187.1 | 49.1 M |
| Forest fire | 1024 × 1024 | 45.9 | 48.1 M |
| Spatial SIR | 128 × 128 | 3290.2 | 53.9 M |
| Spatial SIR | 256 × 256 | 782.3 | 51.3 M |
| Spatial SIR | 512 × 512 | 192.4 | 50.4 M |
| Spatial SIR | 1024 × 1024 | 47.2 | 49.5 M |
| Count table (Life) | 128 × 128 | 3460.6 | 56.7 M |
| Count table (Life) | 256 × 256 | 881.8 | 57.8 M |
| Count table (Life) | 512 × 512 | 215.6 | 56.5 M |
| Count table (Life) | 1024 × 1024 | 52.9 | 55.4 M |

At 1024 × 1024 every family exceeds 48 generations/s on this machine, so all advertised sizes (3–1024 per axis) pass the responsiveness check here. Stochastic families cost about 4× Life per cell because of two random draws per cell per generation.

## Optimizations made from measurements

- **Bundle size:** the first-load JavaScript was 1,093 kB (322 kB gzip). Lazy-loading the workspace, experiment, comparison and learning pages cut it to 444 kB (131 kB gzip).
- **Engine:** Life uses a padded buffer and an 18-entry lookup table; multistate families use precomputed neighbor offsets; count tables compile to a dense lookup (or a map above 4 M entries).
- **PixiJS** was not evaluated further: Canvas 2D already meets every rendering target above, so a second renderer is not justified.

## Not measured

Firefox and Safari timings; a low-end student device; lifecycle leak checks over many open/close cycles (workers are terminated on page unmount, but no automated leak test exists).
