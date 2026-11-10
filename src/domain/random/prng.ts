// Versioned random-stream adapter (PLAN.md §7.5). Wraps an *instantiated* seedrandom generator;
// never touches global Math.random. The adapter ID, library version and saved states are part of
// run provenance, so changing any of them requires a new adapter version.
import seedrandom from 'seedrandom';

export const PRNG_ADAPTER = {
  id: 'ca-studio-prng/1',
  algorithm: 'alea',
  library: 'seedrandom@3.0.5',
} as const;

/** Alea's complete internal state; restoring it continues the identical sequence. */
export interface PrngState {
  c: number;
  s0: number;
  s1: number;
  s2: number;
}

export interface Stream {
  /** Uniform draw in [0, 1). */
  next(): number;
  state(): PrngState;
}

type AleaPrng = (() => number) & { state(): PrngState };

const wrapPrng = (p: AleaPrng): Stream => ({ next: () => p(), state: () => ({ ...p.state() }) });

export function createStream(seed: string): Stream {
  return wrapPrng(seedrandom.alea(seed, { state: true }) as unknown as AleaPrng);
}

export function restoreStream(state: PrngState): Stream {
  return wrapPrng(seedrandom.alea('', { state: { ...state } } as never) as unknown as AleaPrng);
}

export const isPrngState = (v: unknown): v is PrngState =>
  !!v && typeof v === 'object' && ['c', 's0', 's1', 's2'].every((k) => Number.isFinite((v as Record<string, unknown>)[k]));

export type StreamKind = 'initialization' | 'transition';

/** Independent-run seed string (§7.5). Stored verbatim in run metadata. */
export const independentSeed = (masterSeed: string, experimentId: string, configurationKey: string, replicateIndex: number, kind: StreamKind) =>
  JSON.stringify(['ca-studio-seed-v1', masterSeed, experimentId, configurationKey, replicateIndex, kind]);

/** Paired-run seed string (§7.5): runs in the same pair group share both streams. */
export const pairedSeed = (masterSeed: string, experimentId: string, pairGroupId: string, replicateIndex: number, kind: StreamKind) =>
  JSON.stringify(['ca-studio-paired-v1', masterSeed, experimentId, pairGroupId, replicateIndex, kind]);

/** Seed string for an interactive (workspace) session's streams. */
export const sessionSeed = (seed: string, kind: StreamKind) => JSON.stringify(['ca-studio-session-v1', seed, kind]);
