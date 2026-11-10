/// <reference lib="webworker" />
// Batch experiment worker: one worker, runs executed one at a time in
// bounded slices so progress and cancellation stay responsive. Run order never affects outputs.
import { planRuns, type ExperimentDefinition } from '../domain/experiments/experiment';
import { RunExecutor, gridHash, type RunSnapshot } from '../domain/experiments/execute';
import type { ExperimentCommand, ExperimentResponse } from '../domain/contracts/experimentWorker';

declare const self: DedicatedWorkerGlobalScope;

let cancelRequested = false;
let current: RunExecutor | null = null;
let jobId = '';

const post = (m: ExperimentResponse) => self.postMessage(m);
const SLICE_MS = 30;
const PROGRESS_MS = 250;
const RECOVERY_MS = 10_000;

async function runAll(def: ExperimentDefinition, skip: Set<string>, resume: RunSnapshot | null, id: string) {
  const runs = planRuns(def);
  const t0 = performance.now();
  let completed = skip.size;
  let lastProgress = 0,
    lastRecovery = performance.now(),
    lastRecoveryGen = -1;
  for (const spec of runs) {
    if (skip.has(spec.runId)) continue;
    if (cancelRequested || id !== jobId) break;
    const snap = resume && resume.runId === spec.runId ? resume : undefined;
    let ex: RunExecutor;
    try {
      ex = new RunExecutor(def, spec, snap);
    } catch (e) {
      post({ type: 'ERROR', jobId: id, message: `Run ${spec.runId} could not start: ${(e as Error).message}` });
      return;
    }
    current = ex;
    while (!ex.advance(SLICE_MS)) {
      if (cancelRequested) {
        ex.cancel();
        break;
      }
      const now = performance.now();
      if (now - lastProgress > PROGRESS_MS) {
        lastProgress = now;
        post({
          type: 'PROGRESS',
          jobId: id,
          completedRuns: completed,
          totalRuns: runs.length,
          currentRunId: spec.runId,
          currentGeneration: ex.generation,
          horizon: def.horizon,
          elapsedMs: now - t0,
        });
      }
      if (now - lastRecovery > RECOVERY_MS && ex.generation !== lastRecoveryGen) {
        lastRecovery = now;
        lastRecoveryGen = ex.generation;
        post({ type: 'RECOVERY', jobId: id, snapshot: ex.snapshot() });
      }
      await new Promise((r) => setTimeout(r, 0)); // yield so CANCEL can arrive
      if (cancelRequested) {
        ex.cancel();
        break;
      }
    }
    const result = ex.result();
    current = null;
    if (result.status === 'completed') completed++;
    post({ type: 'RUN_DONE', jobId: id, result, initialHash: await gridHash(result.initial), completedRuns: completed });
    if (result.status !== 'completed') break;
  }
  post({
    type: 'DONE',
    jobId: id,
    status: cancelRequested ? 'cancelled' : 'completed',
    completedRuns: completed,
    totalRuns: runs.length,
    elapsedMs: performance.now() - t0,
  });
}

self.onmessage = (e: MessageEvent<ExperimentCommand>) => {
  const cmd = e.data;
  switch (cmd.type) {
    case 'START':
      cancelRequested = false;
      jobId = cmd.jobId;
      void runAll(cmd.definition, new Set(cmd.completedRunIds), cmd.resume ?? null, cmd.jobId);
      return;
    case 'CANCEL':
      if (cmd.jobId !== jobId) return;
      cancelRequested = true;
      current?.cancel();
      return;
    default: {
      const never: never = cmd;
      void never;
    }
  }
};
