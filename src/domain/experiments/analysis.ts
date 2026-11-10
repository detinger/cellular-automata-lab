// Configuration-level summaries. Shared by the results view, the Markdown report and
// tests, so displayed and exported numbers always come from the same computation (E2E-06).
import { summarize, summarizeEvents, type Summary } from '../stats/summary';
import { configurations, type ExperimentDefinition } from './experiment';
import type { RunResult } from './execute';
import { fromSpec } from '../model/convert';
import { isStochasticRule } from '../engine/engine';

export interface ConfigurationSummary {
  key: string;
  values: Record<string, number | string>;
  planned: number;
  completed: number;
  cancelled: number;
  failed: number;
  /** Completed runs whose response is unavailable (e.g. stopped inside the window), with reasons. */
  unavailable: Array<{ runId: string; reason: string }>;
  summary: Summary;
  events: ReturnType<typeof summarizeEvents> | null;
  /** True when every run in this configuration is an identical deterministic repetition. */
  deterministic: boolean;
}

export function summarizeConfigurations(def: ExperimentDefinition, runs: readonly RunResult[]): ConfigurationSummary[] {
  const base = fromSpec(def.baseModel);
  const deterministic = !isStochasticRule(base.rule.id) && def.initialization.kind === 'fixed';
  const metric = def.response.metric;
  const bounded: [number, number] | undefined = metric.startsWith('fraction:') || metric === 'activity' || metric === 'flow' ? [0, 1] : undefined;
  return configurations(def.factors).map((c) => {
    const rs = runs.filter((r) => r.configurationKey === c.key);
    const done = rs.filter((r) => r.status === 'completed');
    const values = done.map((r) => r.response.value).filter((v): v is number => v !== null);
    const unavailable = done.filter((r) => r.response.value === null).map((r) => ({ runId: r.runId, reason: r.response.reason ?? 'Unavailable.' }));
    const events = def.response.aggregate === 'event-time' ? summarizeEvents(done.map((r) => r.event!).filter(Boolean)) : null;
    return {
      key: c.key,
      values: c.values,
      planned: def.replicates,
      completed: done.length,
      cancelled: rs.filter((r) => r.status === 'cancelled').length,
      failed: rs.filter((r) => r.status === 'error').length,
      unavailable: def.response.aggregate === 'event-time' ? [] : unavailable,
      summary: events ? events.conditional : summarize(values, { bounded }),
      events,
      deterministic,
    };
  });
}

/** Mean trajectory of a state fraction across completed runs at each sampled generation, with the run count used. */
export function meanTrajectory(runs: readonly RunResult[], state: number, sites: (r: RunResult) => number) {
  const byGen = new Map<number, { sum: number; n: number }>();
  for (const r of runs) {
    if (r.status !== 'completed') continue;
    for (const s of r.samples) {
      const e = byGen.get(s.generation) ?? { sum: 0, n: 0 };
      e.sum += s.counts[state] / sites(r);
      e.n++;
      byGen.set(s.generation, e);
    }
  }
  return [...byGen.entries()].sort((a, b) => a[0] - b[0]).map(([generation, e]) => ({ generation, mean: e.sum / e.n, n: e.n }));
}
