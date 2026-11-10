# ADR 0005: Versioned random streams with a fixed draw schedule

**Status:** accepted (2026-11-10)

## Context

Stochastic runs must be exactly reproducible across pause/resume, checkpoints, inspection and experiment ordering.

## Decision

- Wrap seedrandom 3.0.5's **Alea** generator in the adapter `ca-studio-prng/1` (`src/domain/random/prng.ts`). Alea was chosen over ARC4 because it is about 3× faster per draw, and its full state (four numbers) saves and restores exactly.
- Two streams per run: initialization and transition. Every stochastic generation consumes **exactly two transition draws per cell in row-major order**, whatever the cell's state or the probabilities.
- Seed strings are structured JSON arrays (no ad hoc concatenation) and are stored verbatim with every run.
- Checkpoints store the PRNG state. The inspector replays a cell's draws from the state saved at the start of the last step, never from the live stream.
- Editor random fills use the same adapter (one draw per cell); the seed is shown so a fill can be repeated.

## Consequences

Changing the generator, the library version or the draw schedule changes trajectories. Any such change needs a new adapter ID and engine version; old checkpoints are rejected with an explanation instead of silently continuing with a different stream.
