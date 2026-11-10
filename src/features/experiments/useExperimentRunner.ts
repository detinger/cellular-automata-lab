// Drives the experiment worker and persists results as they arrive.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ExperimentResponse } from '../../domain/contracts/experimentWorker';
import type { ExperimentRecord } from '../../storage/db';
import { saveRun, updateExperiment } from '../../storage/db';
import type { RunResult } from '../../domain/experiments/execute';

export interface RunnerProgress {
  completedRuns: number;
  totalRuns: number;
  currentRunId: string;
  currentGeneration: number;
  horizon: number;
  elapsedMs: number;
}

export const runtimeDescription = () => `${navigator.userAgent}; ${navigator.hardwareConcurrency ?? '?'} logical CPUs`;

export function useExperimentRunner(onRun: (r: RunResult) => void, onStatus: (s: ExperimentRecord['status']) => void) {
  const worker = useRef<Worker | null>(null);
  const job = useRef('');
  const expId = useRef('');
  const [progress, setProgress] = useState<RunnerProgress | null>(null);
  const [active, setActive] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cbs = useRef({ onRun, onStatus });
  cbs.current = { onRun, onStatus };
  // Persist in order: each write waits for the previous one.
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const persist = (f: () => Promise<unknown>) => {
    chain.current = chain.current.then(f).catch((e) => setError(`Saving results failed: ${(e as Error).message}. Results stay on screen; export them now.`));
    return chain.current;
  };

  useEffect(
    () => () => {
      worker.current?.terminate();
    },
    [],
  );

  const start = useCallback((rec: ExperimentRecord, completedRunIds: string[]) => {
    worker.current?.terminate();
    const w = new Worker(new URL('../../workers/experiment.worker.ts', import.meta.url), { type: 'module' });
    worker.current = w;
    const jobId = crypto.randomUUID();
    job.current = jobId;
    expId.current = rec.id;
    setActive(true);
    setCancelling(false);
    setError(null);
    setProgress({
      completedRuns: completedRunIds.length,
      totalRuns: rec.totalRuns,
      currentRunId: '',
      currentGeneration: 0,
      horizon: rec.definition.horizon,
      elapsedMs: 0,
    });
    const runtime = runtimeDescription();
    void persist(() => updateExperiment(rec.id, { status: 'running', runtime }));
    cbs.current.onStatus('running');
    w.onmessage = (e: MessageEvent<ExperimentResponse>) => {
      const m = e.data;
      if (m.jobId !== job.current) return; // stale job
      switch (m.type) {
        case 'PROGRESS':
          setProgress({
            completedRuns: m.completedRuns,
            totalRuns: m.totalRuns,
            currentRunId: m.currentRunId,
            currentGeneration: m.currentGeneration,
            horizon: m.horizon,
            elapsedMs: m.elapsedMs,
          });
          return;
        case 'RECOVERY':
          void persist(() => updateExperiment(expId.current, { recovery: m.snapshot }));
          return;
        case 'RUN_DONE':
          cbs.current.onRun({ ...m.result, initialHash: m.initialHash } as RunResult);
          setProgress((p) => (p ? { ...p, completedRuns: m.completedRuns } : p));
          void persist(() => saveRun(expId.current, m.result, m.initialHash, runtime, m.completedRuns));
          return;
        case 'DONE':
          void persist(() => updateExperiment(expId.current, { status: m.status, recovery: null, completedRuns: m.completedRuns })).then(() =>
            cbs.current.onStatus(m.status),
          );
          setActive(false);
          setProgress((p) => (p ? { ...p, completedRuns: m.completedRuns, elapsedMs: m.elapsedMs } : p));
          w.terminate();
          worker.current = null;
          return;
        case 'ERROR':
          setError(m.message);
          void persist(() => updateExperiment(expId.current, { status: 'interrupted' })).then(() => cbs.current.onStatus('interrupted'));
          setActive(false);
          w.terminate();
          worker.current = null;
          return;
      }
    };
    w.onerror = (e) => {
      setError(e.message || 'The experiment worker stopped unexpectedly. Completed runs are saved; resume to continue.');
      void persist(() => updateExperiment(expId.current, { status: 'interrupted' })).then(() => cbs.current.onStatus('interrupted'));
      setActive(false);
    };
    w.postMessage({ type: 'START', jobId, definition: rec.definition, completedRunIds, resume: rec.recovery });
  }, []);

  const cancel = useCallback(() => {
    if (!worker.current) return;
    setCancelling(true);
    worker.current.postMessage({ type: 'CANCEL', jobId: job.current, reason: 'user' });
  }, []);

  return { start, cancel, progress, active, cancelling, error };
}
