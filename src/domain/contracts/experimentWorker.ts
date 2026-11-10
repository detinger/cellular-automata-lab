// Experiment worker messages: discriminated unions, job IDs reject stale replies.
import type { ExperimentDefinition } from '../experiments/experiment';
import type { RunResult, RunSnapshot } from '../experiments/execute';

export type ExperimentCommand =
  | { type: 'START'; jobId: string; definition: ExperimentDefinition; completedRunIds: string[]; resume?: RunSnapshot | null }
  | { type: 'CANCEL'; jobId: string; reason: string };

export type ExperimentResponse =
  | {
      type: 'PROGRESS';
      jobId: string;
      completedRuns: number;
      totalRuns: number;
      currentRunId: string;
      currentGeneration: number;
      horizon: number;
      elapsedMs: number;
    }
  | { type: 'RECOVERY'; jobId: string; snapshot: RunSnapshot }
  | { type: 'RUN_DONE'; jobId: string; result: RunResult; initialHash: string; completedRuns: number }
  | { type: 'DONE'; jobId: string; status: 'completed' | 'cancelled'; completedRuns: number; totalRuns: number; elapsedMs: number }
  | { type: 'ERROR'; jobId: string; message: string };
