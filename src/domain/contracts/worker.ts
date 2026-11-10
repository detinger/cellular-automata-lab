// Worker message contract (PLAN.md §8.3). Discriminated unions with exhaustive handlers.
import type { Model } from './model';
import type { GenerationMetrics } from '../metrics/basic';
import type { EngineCheckpoint } from '../engine/engine';
import type { ObservedTransition } from '../rules/explainCell';

export const PROTOCOL_VERSION = 1;

interface Envelope {
  protocolVersion: typeof PROTOCOL_VERSION;
  sessionId: string;
  requestId: number;
}

export type WorkerCommand = Envelope &
  (
    | { type: 'LOAD'; model: Model; seeds: SeedSpec; checkpoint?: EngineCheckpoint }
    | { type: 'RUN'; generationsPerSecond: number }
    | { type: 'PAUSE' }
    | { type: 'STEP'; count: number }
    | { type: 'RESET' }
    /** Replays to an exact earlier or later generation from the nearest retained checkpoint. */
    | { type: 'SEEK'; generation: number }
    /** Explains the last observed transition of one cell (stochastic draws included). */
    | { type: 'INSPECT'; x: number; y: number }
    | { type: 'CHECKPOINT' }
    | { type: 'CANCEL'; reason: string }
    | { type: 'RECYCLE_FRAME'; bufferId: number; buffer: ArrayBuffer }
    | { type: 'DISPOSE' }
  );

export type RunState = 'idle' | 'loading' | 'paused' | 'running' | 'replaying' | 'error';

/** Full seed strings for the session's random streams (§7.5). Deterministic families ignore them. */
export interface SeedSpec {
  transition: string;
}

/** Retained checkpoint history (§3.4): default every 100 generations within a 16 MiB ring. */
export interface HistoryInfo {
  interval: number;
  budgetBytes: number;
  usedBytes: number;
  /** Generations with a retained checkpoint, ascending. Generation 0 is always reproducible by reset. */
  generations: number[];
}

export const CHECKPOINT_INTERVAL = 100;
export const CHECKPOINT_BUDGET_BYTES = 16 * 1024 * 1024;

export interface FramePayload {
  /** Display dimensions. For 1D models this is the spacetime block (width × retained rows). */
  width: number;
  height: number;
  generation: number;
  /** Generation shown in display row 0 (1D spacetime); 0 for 2D. */
  firstGeneration: number;
  sequence: number;
  bufferId: number;
  cells: Uint8Array;
  metrics: GenerationMetrics;
  /** Achieved generations per second over the last measurement window, while running. */
  achievedRate: number | null;
}

/** Per-generation measurement retention cap for one session (§9.4 sampled data). */
export const METRICS_CAP = 100_000;

export type WorkerResponse = Envelope &
  (
    | { type: 'READY'; generation: number; executable: true }
    /** Every generation's metrics, in order. `reset` starts a new series (load or reset). */
    | { type: 'METRICS'; reset: boolean; rows: GenerationMetrics[]; truncatedAt: number | null }
    | { type: 'ACK'; command: WorkerCommand['type']; generation: number; state: RunState }
    | ({ type: 'FRAME' } & FramePayload)
    | { type: 'ERROR'; code: string; message: string; recoverable: boolean; generation: number | null }
    | { type: 'HISTORY'; history: HistoryInfo }
    /** Metrics rows after `generation` are no longer part of this session's record (after a backward seek). */
    | { type: 'TRUNCATE'; generation: number }
    | { type: 'EXPLANATION'; x: number; y: number; generation: number; observed: ObservedTransition | null; reason: string | null }
    | { type: 'CHECKPOINT_DATA'; checkpoint: EngineCheckpoint }
  );

export type CommandBody = WorkerCommand extends infer C ? (C extends WorkerCommand ? Omit<C, keyof Envelope> : never) : never;
