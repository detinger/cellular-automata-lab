// Experiment definitions, validation, run manifests and workload estimates.
// An experiment freezes one model revision; every run's concrete model and seed strings are derived
// deterministically, so execution order or concurrency can never change a run's outputs (REP-05).
import type { Model, ModelSpec } from '../contracts/model';
import type { ValidationIssue } from '../contracts/validation';
import { fromSpec } from '../model/convert';
import { validateModel } from '../model/validate';
import { isStochasticRule } from '../engine/engine';
import { independentSeed, pairedSeed } from '../random/prng';
import { normalizeProbabilities } from '../random/seeded';

export const EXPERIMENT_FORMAT = 'ca-studio-experiment';
export const SEED_DERIVATION = 'ca-studio-seed-v1';

/** What a factor changes. Numeric rule parameters, lattice side, boundary, or an initial-state probability. */
export type FactorTarget =
  | { kind: 'rule'; param: 'growth' | 'ignition' | 'beta' | 'gamma' | 'threshold' | 'ruleNumber' }
  | { kind: 'size' }
  | { kind: 'boundary' }
  | { kind: 'init-probability'; state: number };

export interface Factor {
  id: string;
  label: string;
  target: FactorTarget;
  /** Numbers for numeric targets; for boundary: 'periodic' or 'fixed-<state>'. */
  values: Array<number | string>;
}

export type Initialization =
  | { kind: 'fixed' }
  /** Draws a new initial grid per run from the initialization stream with these state probabilities. */
  | { kind: 'regenerate'; probabilities: number[] };

export type MetricId = `fraction:${number}` | 'activity' | 'entropy' | 'incidence' | 'flow' | 'changed';

export type StopPolicy =
  | { kind: 'horizon' }
  /** Family-specific absorbing state (SIR: no infected; Brain: all ready) or a fixed point. */
  | { kind: 'absorbing' }
  /** Forest fire: first generation without burning cells — a stopping policy, not permanent extinction. */
  | { kind: 'first-no-fire' }
  /** Deterministic models: first repeated full state within the retained window (fixed point or cycle). */
  | { kind: 'recurrence' };

export interface ResponseSpec {
  metric: MetricId;
  aggregate: 'final' | 'window-mean' | 'window-max' | 'event-time';
}

export interface ExperimentDefinition {
  format: typeof EXPERIMENT_FORMAT;
  schemaVersion: 1;
  id: string;
  name: string;
  question: string;
  hypothesis: string;
  createdAt: string;
  projectId: string;
  baseRevisionId: string;
  baseModelHash: string;
  baseModel: ModelSpec;
  factors: Factor[];
  initialization: Initialization;
  replicates: number;
  masterSeed: string;
  seedDerivation: typeof SEED_DERIVATION;
  /** Independent (default) or paired: paired runs share streams across configurations per replicate. */
  design: 'independent' | 'paired';
  /**
   * Identifier used in seed derivation instead of `id`. Two experiments of a paired comparison
   * share a scope so replicate i draws the same streams on both sides.
   */
  seedScope?: string;
  horizon: number;
  sampleInterval: number;
  stop: StopPolicy;
  /** Inclusive generation window for window aggregates; `to: null` means the actual end. */
  window: { from: number; to: number | null };
  response: ResponseSpec;
}

export interface RunSpec {
  runId: string;
  index: number;
  configurationKey: string;
  factorValues: Record<string, number | string>;
  replicateIndex: number;
  seeds: { initialization: string; transition: string };
  model: Model;
}

export const EXPERIMENT_LIMITS = {
  maxRuns: 250,
  maxCellUpdates: 2_000_000_000,
  maxSampleRows: 100_000,
  maxFactors: 2,
  maxValuesPerFactor: 25,
} as const;

export const FACTOR_TARGETS: ReadonlyArray<{ target: FactorTarget; label: string; applies(m: Model): boolean; integer?: boolean; min: number; max: number }> = [
  { target: { kind: 'rule', param: 'growth' }, label: 'Growth probability p', applies: (m) => m.rule.id === 'forest-fire/v1', min: 0, max: 1 },
  { target: { kind: 'rule', param: 'ignition' }, label: 'Lightning probability f', applies: (m) => m.rule.id === 'forest-fire/v1', min: 0, max: 1 },
  { target: { kind: 'rule', param: 'beta' }, label: 'Infection probability β', applies: (m) => m.rule.id === 'spatial-sir/v1', min: 0, max: 1 },
  { target: { kind: 'rule', param: 'gamma' }, label: 'Recovery probability γ', applies: (m) => m.rule.id === 'spatial-sir/v1', min: 0, max: 1 },
  { target: { kind: 'rule', param: 'threshold' }, label: 'Cyclic threshold T', applies: (m) => m.rule.id === 'cyclic/v1', integer: true, min: 1, max: 8 },
  {
    target: { kind: 'rule', param: 'ruleNumber' },
    label: 'Elementary rule number',
    applies: (m) => m.rule.id === 'elementary/v1',
    integer: true,
    min: 0,
    max: 255,
  },
  { target: { kind: 'size' }, label: 'Lattice side (square) / 1D width', applies: () => true, integer: true, min: 3, max: 4096 },
  { target: { kind: 'boundary' }, label: 'Boundary', applies: () => true, min: 0, max: 0 },
  { target: { kind: 'init-probability', state: 1 }, label: 'Initial probability of state 1', applies: () => true, min: 0, max: 1 },
];

export const targetKey = (t: FactorTarget) => (t.kind === 'rule' ? `rule.${t.param}` : t.kind === 'init-probability' ? `init.p${t.state}` : t.kind);

export const metricLabel = (m: MetricId, labels: string[]) =>
  m.startsWith('fraction:')
    ? `Fraction ${labels[Number(m.slice(9))] ?? m.slice(9)}`
    : ((
        { activity: 'Activity', entropy: 'Histogram entropy (bits)', incidence: 'New infections', flow: 'Flow (Rule 184)', changed: 'Changed cells' } as Record<
          string,
          string
        >
      )[m] ?? m);

export const isStochasticModel = (m: Pick<Model, 'rule'>) => isStochasticRule(m.rule.id);

/** Applies one configuration's factor values to the frozen base model. Pure. */
export function applyFactors(
  base: Model,
  factors: readonly Factor[],
  values: Record<string, number | string>,
  init: Initialization,
): { model: Model; init: Initialization } {
  const m: Model = {
    ...base,
    rule: structuredClone(base.rule),
    boundary: { ...base.boundary },
    stateLabels: [...base.stateLabels],
    initial: new Uint8Array(base.initial),
  };
  let initOut: Initialization = init.kind === 'regenerate' ? { kind: 'regenerate', probabilities: [...init.probabilities] } : init;
  for (const f of factors) {
    const v = values[f.id];
    const t = f.target;
    if (t.kind === 'rule') (m.rule as unknown as Record<string, unknown>)[t.param] = v;
    else if (t.kind === 'boundary') m.boundary = v === 'periodic' ? { kind: 'periodic' } : { kind: 'fixed-exterior', state: Number(String(v).split('-')[1]) };
    else if (t.kind === 'size') {
      const side = Number(v);
      if (m.height === 1) {
        m.width = side;
      } else {
        m.width = side;
        m.height = side;
      }
      m.initial = new Uint8Array(m.width * m.height); // a size factor requires regenerated initial conditions
    } else if (t.kind === 'init-probability' && initOut.kind === 'regenerate') {
      const p = [...initOut.probabilities];
      const pv = Number(v);
      // The factor sets state t.state's probability; state 0 takes the remainder.
      p[t.state] = pv;
      const rest = 1 - p.slice(1).reduce((a, b) => a + b, 0);
      p[0] = Math.max(0, rest);
      initOut = { kind: 'regenerate', probabilities: p };
    }
  }
  return { model: m, init: initOut };
}

/** Cartesian configurations, first factor outermost, in the order values were listed. */
export function configurations(factors: readonly Factor[]): Array<{ key: string; values: Record<string, number | string> }> {
  let out: Array<Record<string, number | string>> = [{}];
  for (const f of factors) out = out.flatMap((o) => f.values.map((v) => ({ ...o, [f.id]: v })));
  return out.map((values, i) => ({ key: factors.length ? `c${i}:` + factors.map((f) => `${f.id}=${values[f.id]}`).join(',') : 'c0:base', values }));
}

/** The complete, deterministic run manifest. */
export function planRuns(def: ExperimentDefinition): RunSpec[] {
  const base = fromSpec(def.baseModel);
  const runs: RunSpec[] = [];
  const configs = configurations(def.factors);
  configs.forEach((cfg, ci) => {
    for (let r = 0; r < def.replicates; r++) {
      const seed = (kind: 'initialization' | 'transition') =>
        def.design === 'paired'
          ? pairedSeed(def.masterSeed, def.seedScope ?? def.id, 'pair', r, kind)
          : independentSeed(def.masterSeed, def.seedScope ?? def.id, cfg.key, r, kind);
      const { model } = applyFactors(base, def.factors, cfg.values, def.initialization);
      runs.push({
        runId: `${def.id}/c${ci}/r${r}`,
        index: runs.length,
        configurationKey: cfg.key,
        factorValues: cfg.values,
        replicateIndex: r,
        seeds: { initialization: seed('initialization'), transition: seed('transition') },
        model,
      });
    }
  });
  return runs;
}

export interface WorkloadEstimate {
  runs: number;
  cellUpdates: number;
  sampleRowsPerRun: number;
  storedBytes: number;
  overLimits: string[];
}

export function estimateWorkload(def: ExperimentDefinition): WorkloadEstimate {
  const base = fromSpec(def.baseModel);
  const configs = configurations(def.factors);
  let cells = 0;
  for (const c of configs) {
    const { model } = applyFactors(base, def.factors, c.values, def.initialization);
    cells += model.width * model.height;
  }
  const runs = configs.length * def.replicates;
  const cellUpdates = cells * def.replicates * def.horizon;
  const sampleRowsPerRun = Math.floor(def.horizon / def.sampleInterval) + 1;
  // Each stored sample row: generation + state counts + ~6 metrics, as 8-byte numbers, plus overhead.
  const storedBytes = runs * sampleRowsPerRun * (8 * (base.stateCount + 8) + 32);
  const overLimits: string[] = [];
  if (runs > EXPERIMENT_LIMITS.maxRuns)
    overLimits.push(`${runs} runs exceed the limit of ${EXPERIMENT_LIMITS.maxRuns}. Use fewer factor values or replicates.`);
  if (cellUpdates > EXPERIMENT_LIMITS.maxCellUpdates)
    overLimits.push(
      `About ${(cellUpdates / 1e9).toFixed(2)} billion cell updates exceed the limit of 2 billion. Use a smaller lattice, a shorter horizon or fewer runs. A wider sample interval stores less but does not reduce the simulation work.`,
    );
  if (sampleRowsPerRun > EXPERIMENT_LIMITS.maxSampleRows)
    overLimits.push(
      `${sampleRowsPerRun.toLocaleString('en')} sample rows per run exceed ${EXPERIMENT_LIMITS.maxSampleRows.toLocaleString('en')}. Widen the sample interval.`,
    );
  return { runs, cellUpdates, sampleRowsPerRun, storedBytes, overLimits };
}

export function validateExperiment(def: ExperimentDefinition): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const add = (severity: ValidationIssue['severity'], code: string, path: string, message: string, suggestion?: string, consequence?: string) =>
    issues.push({
      code,
      severity,
      category: severity === 'error' || severity === 'warning' ? 'experiment' : 'educational',
      path,
      message,
      suggestion,
      consequence,
      lessonId: 'L12-experiments',
    });
  const base = fromSpec(def.baseModel);
  const stochastic = isStochasticModel(base);
  if (!def.question.trim()) add('warning', 'EXP_NO_QUESTION', '/question', 'State the research question this experiment answers.');
  if (!Number.isInteger(def.replicates) || def.replicates < 1) add('error', 'EXP_ZERO_RUNS', '/replicates', 'Use at least one replicate.');
  if (!Number.isInteger(def.horizon) || def.horizon < 1)
    add('error', 'EXP_HORIZON', '/horizon', 'The horizon must be a whole number of generations, at least 1.');
  if (!Number.isInteger(def.sampleInterval) || def.sampleInterval < 1)
    add('error', 'EXP_SAMPLE_INTERVAL', '/sampleInterval', 'The sample interval must be a whole number of generations, at least 1.');
  else if (def.sampleInterval > def.horizon)
    add('error', 'EXP_SAMPLE_INTERVAL', '/sampleInterval', 'The sample interval is longer than the horizon, so only generation 0 would be sampled.');
  if (!def.masterSeed.trim()) add('error', 'EXP_SEED', '/masterSeed', 'Enter a master seed.');
  if (def.factors.length > EXPERIMENT_LIMITS.maxFactors) add('error', 'EXP_FACTORS', '/factors', 'Use at most two factors (a one- or two-factor design).');
  const w = def.window;
  if (!Number.isInteger(w.from) || w.from < 0 || (w.to !== null && (!Number.isInteger(w.to) || w.to < w.from || w.to > def.horizon)))
    add('error', 'EXP_WINDOW', '/window', 'The analysis window must satisfy 0 ≤ from ≤ to ≤ horizon.');
  if (w.from > 0 && base.rule.id === 'spatial-sir/v1' && def.response.aggregate.startsWith('window'))
    add(
      'recommendation',
      'EDU_BURNIN_TRANSIENT',
      '/window/from',
      'A burn-in skips the start of the run. For an outbreak, the start is usually the part you want to measure.',
      'Use from = 0 unless you have a reason to discard the beginning.',
    );
  def.factors.forEach((f, i) => {
    const spec = FACTOR_TARGETS.find((t) => targetKey(t.target) === targetKey(f.target));
    if (!spec || !spec.applies(base)) add('error', 'EXP_FACTOR_TARGET', `/factors/${i}`, `“${f.label}” does not apply to this model's rule family.`);
    if (!f.values.length) add('error', 'EXP_FACTOR_EMPTY', `/factors/${i}/values`, `Give “${f.label}” at least one value.`);
    if (f.values.length > EXPERIMENT_LIMITS.maxValuesPerFactor)
      add('error', 'EXP_FACTOR_VALUES', `/factors/${i}/values`, `Use at most ${EXPERIMENT_LIMITS.maxValuesPerFactor} values per factor.`);
    if (new Set(f.values.map(String)).size !== f.values.length)
      add('error', 'EXP_FACTOR_DUPLICATE', `/factors/${i}/values`, `“${f.label}” lists a value twice.`);
    if (spec && f.target.kind !== 'boundary') {
      for (const v of f.values) {
        const n = Number(v);
        if (!Number.isFinite(n) || n < spec.min || n > spec.max || (spec.integer && !Number.isInteger(n))) {
          add(
            'error',
            'EXP_FACTOR_VALUE',
            `/factors/${i}/values`,
            `“${f.label}” value ${v} is outside ${spec.min}–${spec.max}${spec.integer ? ' or not a whole number' : ''}.`,
          );
          break;
        }
      }
    }
    if (f.target.kind === 'boundary') {
      for (const v of f.values)
        if (!(v === 'periodic' || (/^fixed-\d+$/.test(String(v)) && Number(String(v).slice(6)) < base.stateCount)))
          add('error', 'EXP_FACTOR_VALUE', `/factors/${i}/values`, `Boundary value “${v}” must be “periodic” or “fixed-<state>”.`);
    }
    if ((f.target.kind === 'size' || f.target.kind === 'init-probability') && def.initialization.kind !== 'regenerate')
      add(
        'error',
        'EXP_FACTOR_NEEDS_INIT',
        `/factors/${i}`,
        `“${f.label}” needs a regenerated initial condition, because a fixed grid cannot change ${f.target.kind === 'size' ? 'size' : 'its density'}.`,
        'Choose “Regenerate per run” for the initial condition.',
      );
  });
  if (def.factors.some((f) => f.target.kind === 'size'))
    add('information', 'EDU_SIZE_NORMALIZE', '/factors', 'Lattice size changes the number of sites. Compare fractions or per-site measures, not raw counts.');
  if (def.initialization.kind === 'regenerate') {
    const n = normalizeProbabilities(def.initialization.probabilities);
    if (!n.ok || def.initialization.probabilities.length !== base.stateCount)
      add('error', 'EXP_INIT_PROBABILITIES', '/initialization', n.ok ? `Give one probability per state (${base.stateCount}).` : n.message);
  }
  const variesInit = def.initialization.kind === 'regenerate';
  if (!stochastic && !variesInit && def.replicates > 1)
    add(
      'error',
      'EXP_DETERMINISTIC_REPLICATES',
      '/replicates',
      'This model is deterministic and starts from the same grid every time, so all replicates would be identical.',
      'Use 1 replicate, or regenerate the initial condition per run to study variation across starting grids.',
      'Repeating an identical deterministic run does not create statistical uncertainty.',
    );
  if ((stochastic || variesInit) && def.replicates > 1 && def.replicates < 5)
    add(
      'recommendation',
      'EDU_FEW_REPLICATES',
      '/replicates',
      `${def.replicates} replicates give a very rough picture of run-to-run variation.`,
      'Use 10 or more replicates for a summary you want to rely on.',
    );
  if ((stochastic || variesInit) && def.replicates === 1)
    add('recommendation', 'EDU_ONE_REPLICATE', '/replicates', 'One run of a random model cannot tell you how much the result varies.', 'Add replicates.');
  // Stop policies must match the family and boundary.
  const s = def.stop;
  if (s.kind === 'first-no-fire' && base.rule.id !== 'forest-fire/v1')
    add('error', 'EXP_STOP_FAMILY', '/stop', '“First no-fire generation” applies to forest fire only.');
  if (s.kind === 'recurrence' && stochastic)
    add(
      'error',
      'EXP_STOP_RECURRENCE',
      '/stop',
      'Repeated grids do not mean repeated futures when the rule is random, so recurrence detection is off for stochastic models.',
    );
  if (s.kind === 'absorbing') {
    if (base.rule.id === 'forest-fire/v1')
      add(
        'error',
        'EXP_STOP_FAMILY',
        '/stop',
        'Forest fire has no absorbing state when p or f is above zero. Use “first no-fire generation” (a stopping policy) instead.',
      );
    if (base.rule.id === 'spatial-sir/v1') {
      const boundaries = def.factors.find((f) => f.target.kind === 'boundary')?.values ?? [
        base.boundary.kind === 'periodic' ? 'periodic' : `fixed-${base.boundary.state}`,
      ];
      if (boundaries.includes('fixed-1'))
        add(
          'error',
          'EXP_STOP_NOT_ABSORBING',
          '/stop',
          'With an infected exterior, “no infected cells” is not absorbing: edge cells can be infected again.',
          'Use a horizon stop, or a periodic or non-infected exterior.',
        );
    }
  }
  if (def.response.aggregate === 'event-time' && s.kind === 'horizon')
    add('error', 'EXP_EVENT_NEEDS_STOP', '/response', 'A time-to-event response needs a stop condition that defines the event.');
  if (s.kind === 'first-no-fire')
    add(
      'information',
      'EDU_NOFIRE_POLICY',
      '/stop',
      'Stopping at the first no-fire generation is a policy. Fire can restart later through lightning, so this is not permanent extinction.',
    );
  if (def.response.metric === 'incidence' && base.rule.id !== 'spatial-sir/v1')
    add('error', 'EXP_METRIC', '/response/metric', 'New infections are measured for spatial SIR only.');
  if (def.response.metric === 'flow' && !(base.rule.id === 'elementary/v1'))
    add('error', 'EXP_METRIC', '/response/metric', 'Flow is measured for Rule 184 traffic on a periodic ring only.');
  if (def.response.metric.startsWith('fraction:') && Number(def.response.metric.slice(9)) >= base.stateCount)
    add('error', 'EXP_METRIC', '/response/metric', 'That state does not exist in this model.');
  for (const run of safePlan(def)) {
    const problems = validateModel(run.model).filter((i) => i.severity === 'error');
    if (problems.length) {
      add('error', 'EXP_CONFIG_INVALID', '/factors', `Configuration ${run.configurationKey} is not a valid model: ${problems[0].message}`);
      break;
    }
  }
  const est = estimateWorkload(def);
  for (const o of est.overLimits) add('error', 'EXP_WORKLOAD', '/', o);
  return issues;
}

function safePlan(def: ExperimentDefinition): RunSpec[] {
  try {
    const seen = new Set<string>();
    return planRuns({ ...def, replicates: 1 }).filter((r) => (seen.has(r.configurationKey) ? false : (seen.add(r.configurationKey), true)));
  } catch {
    return [];
  }
}
