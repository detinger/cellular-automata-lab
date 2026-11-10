// Experiment designer. Every field from the plan's list of
// ten items is visible; validation and the workload estimate update as the student edits.
import { useMemo } from 'react';
import { CircleAlert, Plus, Play, Trash2, Dices } from 'lucide-react';
import { fromSpec } from '../../domain/model/convert';
import { ruleSummary } from '../../domain/model/families';
import { isStochasticRule } from '../../domain/engine/engine';
import { newSeed } from '../../domain/random/seeded';
import {
  FACTOR_TARGETS,
  estimateWorkload,
  metricLabel,
  targetKey,
  validateExperiment,
  type ExperimentDefinition,
  type Factor,
  type MetricId,
  type StopPolicy,
} from '../../domain/experiments/experiment';
import { hasErrors } from '../../domain/contracts/validation';

const parseValues = (text: string, boundary: boolean): Array<number | string> =>
  text
    .split(/[,;\s]+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => (boundary ? t : Number(t)));

export function ExperimentDesigner({ def, onChange, onRun }: { def: ExperimentDefinition; onChange(d: ExperimentDefinition): void; onRun(): void }) {
  const model = useMemo(() => fromSpec(def.baseModel), [def.baseModel]);
  const issues = useMemo(() => validateExperiment(def), [def]);
  const est = useMemo(() => estimateWorkload(def), [def]);
  const stochastic = isStochasticRule(model.rule.id);
  const set = (patch: Partial<ExperimentDefinition>) => onChange({ ...def, ...patch });
  const targets = FACTOR_TARGETS.filter((t) => t.applies(model));
  const metrics: MetricId[] = [
    ...model.stateLabels.map((_, i) => `fraction:${i}` as MetricId),
    'activity',
    'entropy',
    'changed',
    ...(model.rule.id === 'spatial-sir/v1' ? ['incidence' as MetricId] : []),
    ...(model.rule.id === 'elementary/v1' && model.rule.ruleNumber === 184 && model.boundary.kind === 'periodic' ? ['flow' as MetricId] : []),
  ];
  const stops: Array<{ v: StopPolicy['kind']; label: string }> = [
    { v: 'horizon', label: 'Fixed horizon (default)' },
    ...(model.rule.id !== 'forest-fire/v1'
      ? [
          {
            v: 'absorbing' as const,
            label:
              model.rule.id === 'spatial-sir/v1'
                ? 'Absorbing: no infected cells left'
                : model.rule.id === 'brians-brain/v1'
                  ? 'Absorbing: every cell ready'
                  : 'Absorbing: fixed point (grid stops changing)',
          },
        ]
      : []),
    ...(model.rule.id === 'forest-fire/v1' ? [{ v: 'first-no-fire' as const, label: 'First generation with no fire (policy)' }] : []),
    ...(!stochastic ? [{ v: 'recurrence' as const, label: 'First repeated grid (fixed point or cycle)' }] : []),
  ];
  const setFactor = (i: number, f: Factor) => set({ factors: def.factors.map((x, j) => (j === i ? f : x)) });
  const errors = hasErrors(issues);

  return (
    <div className="designer">
      <section className="card">
        <h3>1. Question and hypothesis</h3>
        <div className="form-grid">
          <div className="field span-2">
            <label className="label" htmlFor="x-name">
              Name
            </label>
            <input id="x-name" className="input" value={def.name} maxLength={200} onChange={(e) => set({ name: e.target.value })} />
          </div>
          <div className="field span-2">
            <label className="label" htmlFor="x-q">
              Research question
            </label>
            <textarea
              id="x-q"
              className="input textarea"
              rows={2}
              value={def.question}
              placeholder="For example: How does the recovery probability change the final share of recovered cells?"
              onChange={(e) => set({ question: e.target.value })}
            />
          </div>
          <div className="field span-2">
            <label className="label" htmlFor="x-h">
              Hypothesis
            </label>
            <textarea
              id="x-h"
              className="input textarea"
              rows={2}
              value={def.hypothesis}
              placeholder="What do you expect, and why?"
              onChange={(e) => set({ hypothesis: e.target.value })}
            />
          </div>
        </div>
      </section>

      <section className="card">
        <h3>2. Frozen model</h3>
        <p style={{ margin: 0 }}>
          <strong>{def.baseModel.name}</strong> — {ruleSummary(model.rule)}, {model.height === 1 ? `${model.width} cells` : `${model.width} × ${model.height}`},{' '}
          {model.boundary.kind === 'periodic' ? 'periodic boundary' : `fixed exterior (${model.stateLabels[model.boundary.state]})`}.
        </p>
        <p className="hint" style={{ margin: '4px 0 0' }}>
          Revision <code>{def.baseRevisionId.slice(0, 16)}…</code>, hash <code>{def.baseModelHash.slice(0, 12)}…</code>. Later edits to the project do not
          change this experiment.
        </p>
      </section>

      <section className="card">
        <h3>3. Factors</h3>
        <p className="hint" style={{ marginTop: 0 }}>
          Zero factors runs one configuration; one or two factors run every combination of their values.
        </p>
        {def.factors.map((f, i) => {
          const boundary = f.target.kind === 'boundary';
          return (
            <div key={f.id} className="factor-row">
              <div className="field">
                <label className="label" htmlFor={`f-t-${i}`}>
                  Factor {i + 1}
                </label>
                <select
                  id={`f-t-${i}`}
                  className="select"
                  value={targetKey(f.target)}
                  onChange={(e) => {
                    const t = targets.find((x) => targetKey(x.target) === e.target.value)!;
                    setFactor(i, { ...f, target: t.target, label: t.label, values: t.target.kind === 'boundary' ? ['periodic', 'fixed-0'] : [] });
                  }}
                >
                  {targets.map((t) => (
                    <option key={targetKey(t.target)} value={targetKey(t.target)}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label className="label" htmlFor={`f-v-${i}`}>
                  Values (comma-separated)
                </label>
                <input
                  id={`f-v-${i}`}
                  className="input tabular"
                  defaultValue={f.values.join(', ')}
                  key={targetKey(f.target)}
                  placeholder={boundary ? 'periodic, fixed-0' : '0.1, 0.2, 0.3'}
                  onBlur={(e) => setFactor(i, { ...f, values: parseValues(e.target.value, boundary) })}
                />
              </div>
              <button
                className="btn btn-sm btn-ghost btn-icon"
                style={{ alignSelf: 'flex-end', marginBottom: 3 }}
                aria-label={`Remove factor ${i + 1}`}
                onClick={() => set({ factors: def.factors.filter((_, j) => j !== i) })}
              >
                <Trash2 size={14} aria-hidden />
              </button>
            </div>
          );
        })}
        {def.factors.length < 2 && (
          <button
            className="btn btn-sm"
            onClick={() =>
              set({
                factors: [
                  ...def.factors,
                  {
                    id: `f${Date.now()}`,
                    label: targets[0].label,
                    target: targets[0].target,
                    values: targets[0].target.kind === 'boundary' ? ['periodic', 'fixed-0'] : [],
                  },
                ],
              })
            }
          >
            <Plus size={14} aria-hidden />
            Add factor
          </button>
        )}
      </section>

      <section className="card">
        <h3>4. Initial condition, replicates and seeds</h3>
        <div className="form-grid">
          <div className="field">
            <label className="label" htmlFor="x-init">
              Initial condition
            </label>
            <select
              id="x-init"
              className="select"
              value={def.initialization.kind}
              onChange={(e) =>
                set({
                  initialization:
                    e.target.value === 'fixed'
                      ? { kind: 'fixed' }
                      : { kind: 'regenerate', probabilities: model.stateLabels.map((_, i) => (i === 0 ? 0.5 : i === 1 ? 0.5 : 0)) },
                })
              }
            >
              <option value="fixed">Fixed: the saved grid for every run</option>
              <option value="regenerate">Regenerate per run (random grid)</option>
            </select>
          </div>
          {def.initialization.kind === 'regenerate' && (
            <div className="field">
              <span className="label">State probabilities</span>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {model.stateLabels.map((l, i) => (
                  <label key={i} className="hint" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    {l}
                    <input
                      className="input input-sm tabular"
                      style={{ width: 64 }}
                      type="number"
                      min={0}
                      max={1}
                      step={0.05}
                      aria-label={`Probability of ${l}`}
                      value={(def.initialization as { probabilities: number[] }).probabilities[i] ?? 0}
                      onChange={(e) => {
                        const p = [...(def.initialization as { probabilities: number[] }).probabilities];
                        p[i] = Number(e.target.value);
                        set({ initialization: { kind: 'regenerate', probabilities: p } });
                      }}
                    />
                  </label>
                ))}
              </div>
            </div>
          )}
          <div className="field">
            <label className="label" htmlFor="x-rep">
              Replicates per configuration
            </label>
            <input
              id="x-rep"
              className="input tabular"
              type="number"
              min={1}
              max={250}
              value={def.replicates}
              onChange={(e) => set({ replicates: Math.floor(Number(e.target.value)) })}
            />
          </div>
          <div className="field">
            <label className="label" htmlFor="x-seed">
              Master seed
            </label>
            <div style={{ display: 'flex', gap: 4 }}>
              <input id="x-seed" className="input tabular" value={def.masterSeed} maxLength={64} onChange={(e) => set({ masterSeed: e.target.value })} />
              <button className="btn btn-sm btn-icon" onClick={() => set({ masterSeed: newSeed() })} aria-label="New master seed">
                <Dices size={14} aria-hidden />
              </button>
            </div>
          </div>
          <div className="field">
            <label className="label" htmlFor="x-design">
              Design
            </label>
            <select id="x-design" className="select" value={def.design} onChange={(e) => set({ design: e.target.value as 'independent' | 'paired' })}>
              <option value="independent">Independent runs (default)</option>
              <option value="paired">Paired: replicate i shares random streams across configurations</option>
            </select>
          </div>
        </div>
        <p className="hint" style={{ marginBottom: 0 }}>
          Each run's seeds are derived from the master seed, the experiment ID, its configuration and its replicate number, so the order runs execute in never
          changes their results.
        </p>
      </section>

      <section className="card">
        <h3>5. Duration, stopping and measurement</h3>
        <div className="form-grid">
          <div className="field">
            <label className="label" htmlFor="x-h2">
              Horizon (generations)
            </label>
            <input
              id="x-h2"
              className="input tabular"
              type="number"
              min={1}
              value={def.horizon}
              onChange={(e) => set({ horizon: Math.floor(Number(e.target.value)) })}
            />
          </div>
          <div className="field">
            <label className="label" htmlFor="x-si">
              Sample interval
            </label>
            <input
              id="x-si"
              className="input tabular"
              type="number"
              min={1}
              value={def.sampleInterval}
              onChange={(e) => set({ sampleInterval: Math.floor(Number(e.target.value)) })}
            />
            <span className="hint">Stored rows only; summaries always use every generation.</span>
          </div>
          <div className="field span-2">
            <label className="label" htmlFor="x-stop">
              Stop condition
            </label>
            <select id="x-stop" className="select" value={def.stop.kind} onChange={(e) => set({ stop: { kind: e.target.value as StopPolicy['kind'] } })}>
              {stops.map((s) => (
                <option key={s.v} value={s.v}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="label" htmlFor="x-metric">
              Response metric
            </label>
            <select
              id="x-metric"
              className="select"
              value={def.response.metric}
              onChange={(e) => set({ response: { ...def.response, metric: e.target.value as MetricId } })}
            >
              {metrics.map((m) => (
                <option key={m} value={m}>
                  {metricLabel(m, model.stateLabels)}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="label" htmlFor="x-agg">
              Summarize each run by
            </label>
            <select
              id="x-agg"
              className="select"
              value={def.response.aggregate}
              onChange={(e) => set({ response: { ...def.response, aggregate: e.target.value as ExperimentDefinition['response']['aggregate'] } })}
            >
              <option value="final">Value at the end</option>
              <option value="window-mean">Mean over the analysis window</option>
              <option value="window-max">Maximum over the analysis window</option>
              <option value="event-time">Time until the stop event (with censoring)</option>
            </select>
          </div>
          <div className="field">
            <label className="label" htmlFor="x-wf">
              Analysis window from
            </label>
            <input
              id="x-wf"
              className="input tabular"
              type="number"
              min={0}
              value={def.window.from}
              onChange={(e) => set({ window: { ...def.window, from: Math.floor(Number(e.target.value)) } })}
            />
          </div>
          <div className="field">
            <label className="label" htmlFor="x-wt">
              to (empty = end)
            </label>
            <input
              id="x-wt"
              className="input tabular"
              type="number"
              min={0}
              value={def.window.to ?? ''}
              onChange={(e) => set({ window: { ...def.window, to: e.target.value === '' ? null : Math.floor(Number(e.target.value)) } })}
            />
          </div>
        </div>
        <p className="hint" style={{ marginBottom: 0 }}>
          A burn-in (window starting after 0) is a choice you must justify; it is never applied automatically.
        </p>
      </section>

      <section className="card" aria-labelledby="est-h">
        <h3 id="est-h">6. Check and run</h3>
        <p style={{ marginTop: 0 }}>
          <strong>{est.runs}</strong> run{est.runs === 1 ? '' : 's'} · about{' '}
          <strong>{(est.cellUpdates / 1e6).toFixed(est.cellUpdates < 1e7 ? 2 : 0)} million</strong> cell updates · {est.sampleRowsPerRun.toLocaleString()}{' '}
          stored rows per run · about {(est.storedBytes / 1048576).toFixed(1)} MiB of results
        </p>
        {issues.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
            {issues.map((i, k) => (
              <div key={k} className="issue" data-severity={i.severity}>
                <CircleAlert size={15} aria-hidden style={{ flex: 'none', marginTop: 2 }} />
                <div>
                  <div>{i.message}</div>
                  {i.consequence && <div className="hint">{i.consequence}</div>}
                  {i.suggestion && <div className="hint">{i.suggestion}</div>}
                </div>
              </div>
            ))}
          </div>
        )}
        <button className="btn btn-primary" disabled={errors} onClick={onRun}>
          <Play size={16} aria-hidden />
          Run {est.runs} run{est.runs === 1 ? '' : 's'}
        </button>
        {errors && (
          <span className="hint" style={{ marginLeft: 8 }}>
            Fix the errors above first.
          </span>
        )}
      </section>
    </div>
  );
}
