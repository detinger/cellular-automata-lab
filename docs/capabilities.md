# Supported capabilities and known limitations

Engine `ca-studio-engine/1.0.0`. The in-app **Capabilities** page shows the same information. Normative semantics are in PLAN.md §7; this page states what this build implements.

## Rule families

| Family | Rule ID | States | Semantics |
|---|---|---|---|
| Life-like | `life-like/v1` | 2 | Dead → alive when the live-neighbor count (8 Moore neighbors) is in B; alive stays alive when it is in S. `B…/S…` digits 0–8, empty sets allowed. |
| Elementary CA | `elementary/v1` | 2 | Output = bit (4·L + 2·C + R) of the rule number 0–255. 1D row, 3–4,096 cells; the view keeps a bounded spacetime history. Rule 184 reports flow on a periodic ring. |
| Brian's Brain | `brians-brain/v1` | 3 | Ready → firing with exactly 2 firing Moore neighbors; firing → refractory; refractory → ready. |
| Cyclic CA | `cyclic/v1` | 3–16 | Advance to (s + 1) mod K when at least T neighbors are in that state. Moore or von Neumann. |
| Forest fire | `forest-fire/v1` | 3 | Burning → empty; empty → tree if u0 < p; tree → burning if any neighbor burns, else if u1 < f. |
| Spatial SIR | `spatial-sir/v1` | 3 | S → I if u0 < 1 − (1 − β)^k (k infected neighbors, computed by repeated multiplication); I → R if u1 < γ; R stays. |
| Count table | `count-table/v1` | 2–8 | Clauses: current states + inclusive count ranges per neighbor state → next state. No overlap (even when outputs agree), every clause reachable, explicit default, ≤ 256 clauses, ≤ 65,536 cases. No expressions or code. |

All families update synchronously. Boundaries: periodic (torus) or a fixed exterior state; edge cells still update. 2D lattices are 3–1,024 cells per axis.

## Randomness and reproducibility

- Adapter `ca-studio-prng/1`: seedrandom 3.0.5, Alea algorithm, state save/restore. Global `Math.random` is never replaced or used for simulation.
- Two streams per run: initialization (one draw per cell, row-major, cumulative probabilities with strict `<`) and transition (exactly two draws per cell per generation, u0 then u1, row-major, always consumed).
- Seeds: interactive sessions use `["ca-studio-session-v1", seed, stream]`; experiments use `["ca-studio-seed-v1", master, experiment, configuration, replicate, stream]` or the paired form (PLAN.md §7.5). The exact strings are stored with every run.
- Checkpoints (cells, generation, PRNG state, metrics) every 100 generations in a 16 MiB ring; jumping to a generation replays forward from the nearest checkpoint. Inspecting a stochastic cell replays its recorded draws without touching the live stream.

## Measurements

State counts and fractions, changed cells and activity, births/deaths (Life-like only), histogram entropy (state mix only), SIR incidence, Rule 184 flow. Up to 100,000 generations are measured per interactive session; playback pauses at the cap instead of dropping rows. Charts show at most 2,000 points per series; CSV exports contain every row.

## Experiments and comparison

Single run, replications, one- and two-factor sweeps over rule parameters, lattice side, boundary or an initial-state probability. Stops: fixed horizon (default), absorbing state (SIR without infected cells, Brian's Brain all ready, fixed point), first no-fire generation (a policy, not extinction), or first repeated grid (deterministic models; 256 states / 16 MiB window). Censored runs are counted separately; Kaplan–Meier median for event times. Summaries: n, mean, sample SD, median, range, 95% Student-t interval (labeled). Limits: 250 runs, 2 × 10⁹ cell updates, 100,000 stored rows per run. Comparisons: assumption diff, Hamming distance for same-size same-state lattices, independent (Welch) or paired designs.

## Import and export

| Format | Import | Export |
|---|---|---|
| Model `.ca.json` (schema v1, `src/schemas/model.v1.schema.json`) | yes, validated; 32 MiB cap | yes |
| Binary RLE (`b`, `o`, `$`, `!` required) | yes; asks for a rule when absent | yes (Life-like); boundary and size are not stored |
| Metrics CSV | — | session and experiment |
| Experiment package `.ca-experiment.json` (`src/schemas/experiment-package.v1.schema.json`) | no | yes |
| Markdown report | — | yes |
| PNG | — | yes, one identified generation with legend and caption |

## Known limitations

- CPU only; no GPU kernels, Gray–Scott, hexagonal/3D lattices or asynchronous schedules (P2, not implemented).
- No automatic pattern classification or spaceship detection; no labels like "chaotic" or "universal".
- Data is stored in the browser (IndexedDB). Clearing site data deletes it. Learning progress is local and not tamper-proof.
- Written answers are never auto-graded.
- Experiment packages cannot be imported back.
- Offline use requires one prior online visit; updates wait for the user to reload.
- Browser coverage: Chrome and WebKit verified by the automated suite; Firefox not yet verified (see docs/acceptance/phase-2-6.md).
