// Bridges the worker client to React. High-frequency frames stay outside React state;
// status updates are throttled while running.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Model } from '../../domain/contracts/model';
import type { FramePayload, HistoryInfo, RunState, SeedSpec } from '../../domain/contracts/worker';
import type { ObservedTransition } from '../../domain/rules/explainCell';
import type { EngineCheckpoint } from '../../domain/engine/engine';
import type { GenerationMetrics } from '../../domain/metrics/basic';
import { SimulationClient } from '../../workers/client';
import { displayDims, toDisplay } from './display';

export interface SimStatus {
  runState: RunState;
  generation: number;
  metrics: GenerationMetrics | null;
  achievedRate: number | null;
  error: { code: string; message: string } | null;
}

export interface DisplayFrame {
  width: number;
  height: number;
  generation: number;
  /** Generation shown in display row 0 (1D spacetime). */
  firstGeneration: number;
  cells: Uint8Array;
}

export interface ObservedInfo {
  x: number;
  y: number;
  generation: number;
  observed: ObservedTransition | null;
  reason: string | null;
}

export function useSimulation(model: Model | null, executable: boolean, seeds: SeedSpec, onDisplay: (frame: DisplayFrame) => void) {
  const [history, setHistory] = useState<HistoryInfo | null>(null);
  const [observed, setObserved] = useState<ObservedInfo | null>(null);
  const checkpointWaiters = useRef<Array<(cp: EngineCheckpoint) => void>>([]);
  const clientRef = useRef<SimulationClient | null>(null);
  const display = useRef<DisplayFrame | null>(null);
  const onDisplayRef = useRef(onDisplay);
  onDisplayRef.current = onDisplay;
  /** Every generation's metrics for the current session (generation 0 first). */
  const series = useRef<GenerationMetrics[]>([]);
  const [seriesInfo, setSeriesInfo] = useState<{ version: number; truncatedAt: number | null; sessionId: string }>({
    version: 0,
    truncatedAt: null,
    sessionId: '',
  });
  const [status, setStatus] = useState<SimStatus>({ runState: 'idle', generation: 0, metrics: null, achievedRate: null, error: null });
  const latest = useRef<{ generation: number; metrics: GenerationMetrics; achievedRate: number | null } | null>(null);
  const runStateRef = useRef<RunState>('idle');
  const lastUiUpdate = useRef(0);
  const rafRef = useRef(0);

  useEffect(() => {
    const flush = () => {
      if (!latest.current) return;
      const l = latest.current;
      setStatus((s) => ({ ...s, generation: l.generation, metrics: l.metrics, achievedRate: l.achievedRate }));
    };
    const client = new SimulationClient({
      onFrame(frame: FramePayload) {
        let d = display.current;
        if (!d || d.cells.length !== frame.cells.length)
          d = { width: frame.width, height: frame.height, generation: 0, firstGeneration: 0, cells: new Uint8Array(frame.cells.length) };
        d.width = frame.width;
        d.height = frame.height;
        d.generation = frame.generation;
        d.firstGeneration = frame.firstGeneration;
        d.cells.set(frame.cells);
        display.current = d;
        client.recycle(frame); // copied, so the buffer can return to the pool now
        latest.current = { generation: frame.generation, metrics: frame.metrics, achievedRate: frame.achievedRate };
        cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(() => onDisplayRef.current(d!));
        const now = performance.now();
        if (runStateRef.current !== 'running' || now - lastUiUpdate.current > 120) {
          lastUiUpdate.current = now;
          flush();
        }
      },
      onMetrics(reset, rows, truncatedAt) {
        if (reset) series.current = [];
        for (const r of rows) series.current.push(r);
        setSeriesInfo((s) => ({ version: s.version + 1, truncatedAt, sessionId: client.sessionId }));
      },
      onState(runState, generation) {
        runStateRef.current = runState;
        setStatus((s) => ({ ...s, runState, generation: runState === 'running' ? s.generation : generation, error: runState === 'error' ? s.error : null }));
        if (runState !== 'running') flush();
      },
      onError(code, message) {
        setStatus((s) => ({ ...s, error: { code, message } }));
      },
      onHistory: setHistory,
      onTruncate(generation) {
        series.current = series.current.filter((r) => r.generation <= generation);
        setSeriesInfo((s) => ({ ...s, version: s.version + 1 }));
      },
      onExplanation: setObserved,
      onCheckpoint(cp) {
        const w = checkpointWaiters.current;
        checkpointWaiters.current = [];
        for (const f of w) f(cp);
      },
    });
    clientRef.current = client;
    return () => {
      cancelAnimationFrame(rafRef.current);
      client.dispose();
      clientRef.current = null;
    };
  }, []);

  // Reload the engine whenever the model's semantics change (new session; stale frames are ignored).
  useEffect(() => {
    if (!model || !clientRef.current) return;
    if (!executable) {
      runStateRef.current = 'idle';
      setStatus({ runState: 'idle', generation: 0, metrics: null, achievedRate: null, error: null });
      display.current = { ...displayDims(model), generation: 0, firstGeneration: 0, cells: new Uint8Array(toDisplay(model, model.initial)) };
      series.current = [];
      setSeriesInfo((s) => ({ version: s.version + 1, truncatedAt: null, sessionId: '' }));
      onDisplayRef.current(display.current);
      return;
    }
    runStateRef.current = 'loading';
    setStatus((s) => ({ ...s, runState: 'loading', error: null }));
    setObserved(null);
    setHistory(null);
    clientRef.current.load(model, seeds);
  }, [model, executable, seeds.transition]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = useCallback((rate: number) => clientRef.current?.run(rate), []);
  const pause = useCallback(() => clientRef.current?.pause(), []);
  const step = useCallback((n = 1) => clientRef.current?.step(n), []);
  const reset = useCallback(() => clientRef.current?.reset(), []);
  const seek = useCallback((g: number) => clientRef.current?.seek(g), []);
  const inspect = useCallback((x: number, y: number) => clientRef.current?.inspect(x, y), []);
  const checkpoint = useCallback(
    () =>
      new Promise<EngineCheckpoint>((resolve) => {
        checkpointWaiters.current.push(resolve);
        clientRef.current?.requestCheckpoint();
      }),
    [],
  );

  return { status, display, series, seriesInfo, history, observed, run, pause, step, reset, seek, inspect, checkpoint };
}
