// Metrics CSV: run ID, model hash, generation, metric columns, explicit missing values,
// locale-independent numbers, and formula-safe text.
import type { GenerationMetrics } from '../domain/metrics/basic';

export const MISSING = 'NA';

/** Quotes a text field and neutralizes spreadsheet formula prefixes. Never used for numeric values. */
export function csvText(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) || safe !== value ? `"${safe.replace(/"/g, '""')}"` : safe;
}

const num = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(v) ? MISSING : String(v));

export interface CsvContext {
  runId: string;
  modelHash: string;
  stateLabels: string[];
  sites: number;
}

export function metricsToCsv(rows: readonly GenerationMetrics[], ctx: CsvContext): string {
  const header = [
    'run_id',
    'model_hash',
    'generation',
    ...ctx.stateLabels.map((l) => csvText(`count:${l}`)),
    ...ctx.stateLabels.map((l) => csvText(`fraction:${l}`)),
    'changed_cells',
    'activity',
    'births',
    'deaths',
    'flow',
    'entropy_bits',
    'incidence',
  ];
  const lines = [header.join(',')];
  const id = csvText(ctx.runId),
    hash = csvText(ctx.modelHash);
  for (const r of rows) {
    lines.push(
      [
        id,
        hash,
        String(r.generation),
        ...r.counts.map(num),
        ...r.counts.map((c) => num(c / ctx.sites)),
        num(r.changed),
        num(r.activity),
        num(r.births),
        num(r.deaths),
        num(r.flow),
        num(r.entropy),
        num(r.incidence),
      ].join(','),
    );
  }
  return lines.join('\r\n') + '\r\n';
}

/** Even-stride decimation for display only; always keeps the first and last rows. Exports never use this. */
export function decimate<T>(rows: readonly T[], max: number): { rows: T[]; stride: number } {
  if (rows.length <= max) return { rows: [...rows], stride: 1 };
  const stride = Math.ceil(rows.length / max);
  const out: T[] = [];
  for (let i = 0; i < rows.length; i += stride) out.push(rows[i]);
  if (out[out.length - 1] !== rows[rows.length - 1]) out.push(rows[rows.length - 1]);
  return { rows: out, stride };
}
