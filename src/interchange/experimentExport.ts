// Experiment exports (PLAN.md §3.5 results and exports, §8.5): raw metrics CSV, experiment JSON
// package (.ca-experiment.json) and a Markdown report. Charts are reconstructible from these files.
import { ENGINE_VERSION } from '../domain/contracts/model';
import { fromSpec } from '../domain/model/convert';
import { ruleSummary } from '../domain/model/families';
import { metricLabel, planRuns, targetKey, type ExperimentDefinition } from '../domain/experiments/experiment';
import type { RunResult } from '../domain/experiments/execute';
import { summarizeConfigurations, type ConfigurationSummary } from '../domain/experiments/analysis';
import { PRNG_ADAPTER } from '../domain/random/prng';
import { MISSING, csvText } from './metricsCsv';

export type StoredRun = RunResult & { initialHash?: string; runtime?: string };

const num = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(v) ? MISSING : String(v));

export function experimentCsv(def: ExperimentDefinition, runs: readonly StoredRun[]): string {
  const labels = def.baseModel.stateLabels;
  const header = [
    'experiment_id',
    'run_id',
    'configuration',
    'replicate',
    ...def.factors.map((f) => csvText(`factor:${f.label}`)),
    'run_status',
    'stop_reason',
    'base_model_hash',
    'initial_grid_hash',
    'generation',
    ...labels.map((l) => csvText(`count:${l}`)),
    ...labels.map((l) => csvText(`fraction:${l}`)),
    'changed_cells',
    'activity',
    'entropy_bits',
    'incidence',
    'flow',
  ];
  const lines = [header.join(',')];
  for (const r of runs) {
    const sites = r.width * r.height;
    const pre = [
      csvText(def.id),
      csvText(r.runId),
      csvText(r.configurationKey),
      String(r.replicateIndex),
      ...def.factors.map((f) => {
        const v = r.factorValues[f.id];
        return typeof v === 'number' ? num(v) : csvText(String(v));
      }),
      r.status,
      r.stopReason,
      csvText(def.baseModelHash),
      csvText(r.initialHash ?? MISSING),
    ];
    for (const s of r.samples) {
      lines.push(
        [
          ...pre,
          String(s.generation),
          ...s.counts.map(num),
          ...s.counts.map((c) => num(c / sites)),
          num(s.changed),
          num(s.activity),
          num(s.entropy),
          num(s.incidence),
          num(s.flow),
        ].join(','),
      );
    }
  }
  return lines.join('\r\n') + '\r\n';
}

/** Experiment package. Sampled rows are included only when asked; run-level results always are. */
export function experimentJson(
  def: ExperimentDefinition,
  runs: readonly StoredRun[],
  opts: { includeSamples: boolean; conclusion: string; runtime: string | null; status: string },
): string {
  const manifest = planRuns(def).map((r) => ({
    runId: r.runId,
    configurationKey: r.configurationKey,
    factorValues: r.factorValues,
    replicateIndex: r.replicateIndex,
    seeds: r.seeds,
  }));
  const summaries = summarizeConfigurations(def, runs).map((c) => ({ ...c, summary: { ...c.summary } }));
  const pkg = {
    format: 'ca-studio-experiment-package',
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    status: opts.status,
    engineVersion: ENGINE_VERSION,
    prngAdapter: PRNG_ADAPTER,
    runtime: opts.runtime,
    definition: def,
    manifest,
    runs: runs.map(({ samples, initial, ...r }) => ({
      ...r,
      initialEncoding: 'base64-u8',
      initialBase64: toBase64(initial),
      ...(opts.includeSamples ? { samples } : { samples: null, samplesNote: 'Sampled rows are in the metrics CSV export.' }),
    })),
    summaries,
    conclusion: opts.conclusion,
  };
  return JSON.stringify(pkg, (_k, v) => (typeof v === 'number' && !Number.isFinite(v) ? null : v), 2) + '\n';
}

function toBase64(bytes: Uint8Array) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

const f = (v: number | null, d = 4) => (v === null ? 'N/A' : Number.isInteger(v) ? String(v) : v.toFixed(d));
const md = (s: string) => s.replace(/([\\`*_{}[\]<>#|])/g, '\\$1');

export function metricDefinition(def: ExperimentDefinition): string {
  const m = def.response.metric;
  const what = m.startsWith('fraction:')
    ? `the fraction of all sites in state “${def.baseModel.stateLabels[Number(m.slice(9))]}”, c_s(t)/N`
    : m === 'activity'
      ? 'activity: the fraction of sites whose state changed since the previous generation (undefined at generation 0)'
      : m === 'entropy'
        ? 'histogram entropy H = −Σ p_s log₂ p_s over state fractions (state composition only, not spatial arrangement)'
        : m === 'incidence'
          ? 'SIR incidence: the number of susceptible → infected transitions in the generation'
          : m === 'flow'
            ? 'Rule 184 flow: cars that moved in the generation divided by road length'
            : 'changed cells: the number of sites whose state changed since the previous generation';
  const w = def.window;
  const agg =
    def.response.aggregate === 'final'
      ? 'its value at the final generation (the horizon)'
      : def.response.aggregate === 'window-mean'
        ? `its mean over generations ${w.from}–${w.to ?? 'end'} (inclusive), computed from every generation, not only sampled ones`
        : def.response.aggregate === 'window-max'
          ? `its maximum over generations ${w.from}–${w.to ?? 'end'}`
          : 'the generation at which the stop condition (the event) was first observed; runs without the event are right-censored';
  return `Response = ${agg}, where the metric is ${what}.`;
}

export function experimentReport(
  def: ExperimentDefinition,
  runs: readonly StoredRun[],
  opts: { conclusion: string; runtime: string | null; status: string },
): string {
  const model = fromSpec(def.baseModel);
  const sums = summarizeConfigurations(def, runs);
  const factorCols = def.factors.map((x) => md(x.label));
  const isEvent = def.response.aggregate === 'event-time';
  const lines: string[] = [];
  lines.push(`# ${md(def.name)}`, '', `Experiment \`${def.id}\` · status: **${opts.status}** · exported ${new Date().toISOString()}`, '');
  lines.push(
    '## Question and hypothesis',
    '',
    `**Question.** ${md(def.question || '(not stated)')}`,
    '',
    `**Hypothesis.** ${md(def.hypothesis || '(not stated)')}`,
    '',
  );
  lines.push(
    '## Model and assumptions',
    '',
    `- Rule: ${md(ruleSummary(model.rule))} (\`${model.rule.id}\`), states: ${model.stateLabels.map(md).join(', ')}`,
    `- Lattice: ${model.height === 1 ? `${model.width} cells (1D)` : `${model.width} × ${model.height}`}, boundary: ${model.boundary.kind === 'periodic' ? 'periodic (torus)' : `fixed exterior, always “${md(model.stateLabels[model.boundary.state])}”`}`,
    '- Update: synchronous (every cell reads only the previous generation)',
    `- Initial condition: ${def.initialization.kind === 'fixed' ? 'the same saved grid for every run' : `regenerated for every run with probabilities ${def.initialization.probabilities.map((p, i) => `${md(model.stateLabels[i])} ${p}`).join(', ')}`}`,
    `- Base revision: \`${def.baseRevisionId}\`, model hash \`${def.baseModelHash}\``,
    '- Finite lattice: results include boundary and finite-size effects; it does not represent an infinite world.',
    '',
  );
  lines.push(
    '## Design',
    '',
    `- Factors: ${def.factors.length ? def.factors.map((x) => `${md(x.label)} (\`${targetKey(x.target)}\`) ∈ {${x.values.join(', ')}}`).join('; ') : 'none (single configuration)'}`,
    `- Replicates per configuration: ${def.replicates} (${def.design} design)`,
    `- Horizon: ${def.horizon} generations; sample interval: ${def.sampleInterval}; stop: ${def.stop.kind === 'horizon' ? 'fixed horizon' : def.stop.kind === 'first-no-fire' ? 'first generation with no burning cells (a stopping policy, not permanent extinction)' : def.stop.kind === 'absorbing' ? 'absorbing state' : 'first repeated grid (fixed point or cycle)'}`,
    `- Seeds: master seed \`${md(def.masterSeed)}\`, derivation \`${def.seedDerivation}\` — each run's seed strings are listed below.`,
    `- Execution: ${ENGINE_VERSION}; random streams ${PRNG_ADAPTER.id} (${PRNG_ADAPTER.algorithm}, ${PRNG_ADAPTER.library}), two draws per cell per generation; runtime: ${md(opts.runtime ?? 'unknown')}`,
    '',
  );
  lines.push('## Measurement', '', metricDefinition(def), '');
  lines.push('## Results', '');
  const head = isEvent
    ? [...factorCols, 'Runs', 'Event observed', 'Censored', 'Mean time (observed only)', 'Median time (Kaplan–Meier)']
    : [...factorCols, 'Completed', 'Mean', 'SD', 'Median', 'Min', 'Max', '95% CI (t)'];
  lines.push(`| ${(head.length ? head : ['Configuration']).join(' | ')} |`, `|${head.map(() => '---').join('|')}|`);
  for (const c of sums) {
    const fv = def.factors.map((x) => String(c.values[x.id]));
    const row = isEvent
      ? [
          ...fv,
          String(c.completed),
          String(c.events?.observed ?? 0),
          String(c.events?.censored ?? 0),
          f(c.summary.mean, 2),
          c.events?.kmMedian === null || !c.events ? 'not reached' : String(c.events.kmMedian),
        ]
      : [
          ...fv,
          `${c.summary.n}/${c.planned}`,
          f(c.summary.mean),
          f(c.summary.sd),
          f(c.summary.median),
          f(c.summary.min),
          f(c.summary.max),
          c.summary.ci95 ? `${f(c.summary.ci95[0])} to ${f(c.summary.ci95[1])}` : 'N/A',
        ];
    lines.push(`| ${row.join(' | ')} |`);
  }
  lines.push(
    '',
    `Response metric: ${md(metricLabel(def.response.metric, model.stateLabels))}. Values come from ${runs.filter((r) => r.status === 'completed').length} completed runs; cancelled or failed runs are excluded from every summary.`,
    '',
  );
  lines.push(
    '## Uncertainty method',
    '',
    sums.some((c) => c.deterministic)
      ? 'This model is deterministic and every run started from the same grid, so there is one outcome per configuration and no statistical uncertainty.'
      : 'Each configuration is summarized across independent runs (never across generations of one run): mean, sample standard deviation (n − 1), median and range. The 95% interval is a Student-t interval for the mean with n − 1 degrees of freedom; it assumes roughly normal run outcomes and is only a rough guide for small, skewed or bounded samples.' +
          (isEvent
            ? ' For time-to-event responses, runs without the event by the horizon are right-censored: they are counted separately and never averaged in. The mean is over observed events only; the Kaplan–Meier median uses censored runs correctly.'
            : ''),
    '',
  );
  lines.push('## Limitations', '');
  const lim = limitations(def, sums, runs);
  lines.push(...(lim.length ? lim.map((l) => `- ${l}`) : ['- None detected automatically; review the design yourself.']), '');
  lines.push('## Interpretation', '', opts.conclusion.trim() ? md(opts.conclusion) : '_Not written yet._', '');
  lines.push(
    '## Run manifest',
    '',
    '| Run | Configuration | Replicate | Status | Stop | End | Response | Transition seed |',
    '|---|---|---|---|---|---|---|---|',
  );
  for (const r of runs)
    lines.push(
      `| \`${r.runId}\` | ${md(r.configurationKey)} | ${r.replicateIndex} | ${r.status} | ${r.stopReason} | ${r.actualEnd} | ${r.response.value === null ? `N/A (${md(r.response.reason ?? '')})` : f(r.response.value, 6)} | \`${md(r.seeds.transition)}\` |`,
    );
  lines.push('', 'Raw sampled metrics: see the metrics CSV export. Full definition and per-run records: see the .ca-experiment.json export.', '');
  return lines.join('\n');
}

export function limitations(def: ExperimentDefinition, sums: readonly ConfigurationSummary[], runs: readonly StoredRun[]): string[] {
  const out: string[] = [];
  const minN = Math.min(...sums.map((s) => s.summary.n));
  if (!sums.some((s) => s.deterministic) && minN < 10) out.push(`Small samples: some configurations have only ${minN} usable runs.`);
  if (runs.some((r) => r.status === 'cancelled')) out.push('The experiment was cancelled before every run finished; incomplete runs are excluded.');
  if (sums.some((s) => s.unavailable.length))
    out.push('Some runs stopped before the end of the analysis window, so their response is unavailable rather than estimated.');
  if (sums.some((s) => (s.events?.censored ?? 0) > 0))
    out.push('Some runs reached the horizon without the event (censored); a longer horizon would tell more.');
  if (def.stop.kind === 'first-no-fire') out.push('“No fire” was a stopping policy: lightning could restart fires after the run stopped.');
  if (def.factors.some((x) => x.target.kind === 'size')) out.push('Lattice size varies across configurations; compare per-site fractions only.');
  if (def.window.from > 0) out.push(`Generations before ${def.window.from} were excluded from window summaries (burn-in chosen by the investigator).`);
  out.push('One rule family, one neighborhood and one boundary type were studied; conclusions may not transfer to other assumptions.');
  return out;
}
