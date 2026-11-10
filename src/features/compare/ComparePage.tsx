// Baseline vs. alternative: changed assumptions, side-by-side runs with optional
// generation lock and independent pan/zoom, Hamming distance when meaningful, and a replicated
// comparison (independent or paired) with labeled uncertainty and a written interpretation.
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeftRight, Lock, Play, RotateCcw, StepForward, Unlock } from 'lucide-react';
import type { Model } from '../../domain/contracts/model';
import { compatibility, diffModels, hamming, compareIndependent, comparePaired } from '../../domain/compare/compare';
import { isStochasticRule } from '../../domain/engine/engine';
import { sessionSeed } from '../../domain/random/prng';
import { newSeed } from '../../domain/random/seeded';
import { modelHash } from '../../domain/model/hash';
import { toSpec } from '../../domain/model/convert';
import { metricLabel, EXPERIMENT_FORMAT, SEED_DERIVATION, planRuns, type ExperimentDefinition, type MetricId } from '../../domain/experiments/experiment';
import {
  createExperiment,
  db,
  latestComparison,
  loadProject,
  loadRuns,
  putComparison,
  type ComparisonRecord,
  type ExperimentRecord,
  type ProjectRecord,
} from '../../storage/db';
import { Callout, Kpi, useToast } from '../../components/ui';
import { useStatePalette } from '../../renderers/palette';
import { GridCanvas, type GridCanvasHandle } from '../modeler/GridCanvas';
import { useSimulation } from '../modeler/useSimulation';
import { displayDims } from '../modeler/display';
import { useExperimentRunner } from '../experiments/useExperimentRunner';
import type { RunResult } from '../../domain/experiments/execute';
import { navigate } from '../../app/router';
import { ruleSummary } from '../../domain/model/families';

interface Side {
  project: ProjectRecord;
  model: Model;
  hash: string;
}

function SideView({ side, label, simRef, onChange }: { side: Side; label: string; simRef: (s: ReturnType<typeof useSimulation>) => void; onChange(): void }) {
  const canvas = useRef<GridCanvasHandle>(null);
  const seeds = useMemo(() => ({ transition: sessionSeed(side.project.seed ?? '1', 'transition') }), [side.project.seed]);
  const sim = useSimulation(side.model, true, seeds, (f) => canvas.current?.draw(f.cells));
  simRef(sim);
  useEffect(onChange, [sim.status.generation, sim.status.runState]); // eslint-disable-line react-hooks/exhaustive-deps
  const palette = useStatePalette(side.model);
  const dims = displayDims(side.model);
  const m = sim.status.metrics,
    n = side.model.width * side.model.height;
  return (
    <div className="compare-side">
      <div className="compare-side-head">
        <strong>{label}</strong> <a href={`#/project/${side.project.id}`}>{side.project.name}</a>{' '}
        <span className="hint">
          · {ruleSummary(side.model.rule)} · generation {sim.status.generation}
        </span>
      </div>
      <div className="compare-canvas">
        <GridCanvas
          ref={canvas}
          width={dims.width}
          height={dims.height}
          stateLabels={side.model.stateLabels}
          palette={palette}
          tool="pan"
          showGrid={false}
          initialCamera={null}
          inspect={null}
          summary={`${label}: generation ${sim.status.generation}`}
          getCells={() => sim.display.current?.cells ?? new Uint8Array(0)}
          onStrokeStart={() => false}
          onStrokeCells={() => {}}
          onStrokeEnd={() => {}}
          onInspect={() => {}}
          onToggleCell={() => {}}
          onCameraChange={() => {}}
          onHover={() => {}}
        />
      </div>
      <div className="kpi-grid">
        {m &&
          side.model.stateLabels.map((l, s) => (
            <Kpi key={s} label={l} swatch={palette[s]} value={`${((m.counts[s] / n) * 100).toFixed(1)}%`} detail={`${m.counts[s]} of ${n}`} />
          ))}
      </div>
    </div>
  );
}

export function ComparePage({ a, b }: { a: string; b: string }) {
  const toast = useToast();
  const [base, setBase] = useState<Side | null>(null);
  const [alt, setAlt] = useState<Side | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [locked, setLocked] = useState(true);
  const [stepN, setStepN] = useState(10);
  const simA = useRef<ReturnType<typeof useSimulation> | null>(null);
  const simB = useRef<ReturnType<typeof useSimulation> | null>(null);
  const [, tick] = useState(0);
  const [cmp, setCmp] = useState<ComparisonRecord | null>(null);
  const [exps, setExps] = useState<{ a: ExperimentRecord | null; b: ExperimentRecord | null; runsA: RunResult[]; runsB: RunResult[] }>({
    a: null,
    b: null,
    runsA: [],
    runsB: [],
  });
  const queue = useRef<ExperimentRecord[]>([]);

  const reloadExperiments = async (c: ComparisonRecord | null) => {
    if (!c?.baselineExperimentId || !c.alternativeExperimentId) return;
    const [ea, eb] = await Promise.all([db.experiments.get(c.baselineExperimentId), db.experiments.get(c.alternativeExperimentId)]);
    setExps({ a: ea ?? null, b: eb ?? null, runsA: ea ? await loadRuns(ea.id) : [], runsB: eb ? await loadRuns(eb.id) : [] });
  };
  const runner = useExperimentRunner(
    () => tick((t) => t + 1),
    (status) => {
      if (status === 'completed' && queue.current.length) runner.start(queue.current.shift()!, []);
      else if (status !== 'running') void reloadExperiments(cmpRef.current);
    },
  );
  const cmpRef = useRef(cmp);
  cmpRef.current = cmp;

  useEffect(() => {
    void (async () => {
      try {
        const [la, lb] = await Promise.all([loadProject(a), loadProject(b)]);
        if (!la || !lb) throw new Error('One of the two projects is missing from this browser.');
        setBase({ project: la.project, model: la.model, hash: la.hash });
        setAlt({ project: lb.project, model: lb.model, hash: lb.hash });
        setProjects(await db.projects.orderBy('updatedAt').reverse().toArray());
        const c = (await latestComparison(a, b)) ?? null;
        setCmp(c);
        await reloadExperiments(c);
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, [a, b]);

  const changes = useMemo(
    () => (base && alt ? diffModels(base.model, alt.model, { a: base.project.seed ?? '1', b: alt.project.seed ?? '1' }) : []),
    [base, alt],
  );
  const compat = useMemo(() => (base && alt ? compatibility(base.model, alt.model) : null), [base, alt]);

  // Replicated comparison settings.
  const stochastic = !!base && (isStochasticRule(base.model.rule.id) || isStochasticRule(alt!.model.rule.id));
  const [reps, setReps] = useState(10);
  const [horizon, setHorizon] = useState(200);
  const [metric, setMetric] = useState<MetricId>('fraction:1');
  const [aggregate, setAggregate] = useState<'final' | 'window-mean'>('final');
  const [design, setDesign] = useState<'independent' | 'paired'>('independent');
  const [masterSeed, setMasterSeed] = useState(newSeed);
  useEffect(() => {
    if (!stochastic) setReps(1);
  }, [stochastic]);

  if (error)
    return (
      <div className="page">
        <Callout kind="error" title="Cannot compare">
          <p>{error}</p>
        </Callout>
      </div>
    );
  if (!base || !alt || !compat)
    return (
      <div className="page">
        <p className="hint">Loading…</p>
      </div>
    );

  const gA = simA.current?.status.generation ?? 0,
    gB = simB.current?.status.generation ?? 0;
  const cellsA = simA.current?.display.current?.cells,
    cellsB = simB.current?.display.current?.cells;
  const ham = compat.hamming && gA === gB && cellsA && cellsB && cellsA.length === cellsB.length ? hamming(cellsA, cellsB) : null;
  const metrics: MetricId[] = compat.sameStates
    ? [...base.model.stateLabels.map((_, i) => `fraction:${i}` as MetricId), 'activity', 'entropy']
    : ['activity', 'entropy'];

  const both = (f: (s: ReturnType<typeof useSimulation>) => void) => {
    if (simA.current) f(simA.current);
    if (simB.current) f(simB.current);
  };

  const runComparison = async () => {
    const id = `cmp-${crypto.randomUUID()}`;
    const mk = async (side: Side, which: string): Promise<ExperimentDefinition> => ({
      format: EXPERIMENT_FORMAT,
      schemaVersion: 1,
      id: `exp-${crypto.randomUUID()}`,
      name: `${which}: ${side.project.name}`,
      question: `Baseline “${base.project.name}” vs alternative “${alt.project.name}”`,
      hypothesis: '',
      createdAt: new Date().toISOString(),
      projectId: side.project.id,
      baseRevisionId: side.project.activeRevisionId,
      baseModelHash: await modelHash(side.model),
      baseModel: toSpec(side.model, side.project.id, side.project.activeRevisionId),
      factors: [],
      initialization: { kind: 'fixed' },
      replicates: reps,
      masterSeed,
      seedDerivation: SEED_DERIVATION,
      design,
      seedScope: design === 'paired' ? id : undefined,
      horizon,
      sampleInterval: Math.max(1, Math.floor(horizon / 500)),
      stop: { kind: 'horizon' },
      window: { from: 0, to: null },
      response: { metric, aggregate },
    });
    const da = await mk(base, 'Baseline'),
      dbb = await mk(alt, 'Alternative');
    await createExperiment(da, planRuns(da).length);
    await createExperiment(dbb, planRuns(dbb).length);
    const rec: ComparisonRecord = {
      id,
      baselineProjectId: a,
      alternativeProjectId: b,
      baselineRevisionId: base.project.activeRevisionId,
      alternativeRevisionId: alt.project.activeRevisionId,
      design,
      baselineExperimentId: da.id,
      alternativeExperimentId: dbb.id,
      interpretation: cmp?.interpretation ?? '',
      createdAt: new Date().toISOString(),
      updatedAt: '',
    };
    await putComparison(rec);
    setCmp(rec);
    const ra = await db.experiments.get(da.id),
      rb = await db.experiments.get(dbb.id);
    queue.current = [rb!];
    runner.start(ra!, []);
  };

  const done = exps.a?.status === 'completed' && exps.b?.status === 'completed';
  const valsA = exps.runsA.filter((r) => r.status === 'completed' && r.response.value !== null);
  const valsB = exps.runsB.filter((r) => r.status === 'completed' && r.response.value !== null);
  const diff = done
    ? cmp?.design === 'paired'
      ? comparePaired(
          valsA
            .map((r) => [r.response.value!, valsB.find((x) => x.replicateIndex === r.replicateIndex)?.response.value ?? NaN] as [number, number])
            .filter((p) => Number.isFinite(p[1])),
        )
      : compareIndependent(
          valsA.map((r) => r.response.value!),
          valsB.map((r) => r.response.value!),
        )
    : null;
  const f = (v: number | null | undefined, d = 4) => (v === null || v === undefined ? '—' : v.toFixed(d));

  return (
    <div className="page page-wide">
      <header className="page-header">
        <div>
          <div className="eyebrow">Compare assumptions</div>
          <h1>Baseline vs. alternative</h1>
          <p>Change one assumption in the alternative, then compare. Neither side is “better” unless you state an objective.</p>
        </div>
        <div className="field" style={{ minWidth: 260 }}>
          <label className="label" htmlFor="alt-pick">
            Alternative
          </label>
          <select id="alt-pick" className="select" value={b} onChange={(e) => navigate(`/compare/${a}/${e.target.value}`)}>
            {projects
              .filter((p) => p.id !== a)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>
        </div>
      </header>

      <section className="card" style={{ marginBottom: 16 }} aria-labelledby="diff-h">
        <h3 id="diff-h">Changed assumptions</h3>
        {changes.length === 0 ? (
          <p style={{ margin: 0 }}>No differences: both models are identical, so any difference you see can only come from the random stream.</p>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Assumption</th>
                  <th>Baseline</th>
                  <th>Alternative</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {changes.map((c) => (
                  <tr key={c.field}>
                    <td>{c.field}</td>
                    <td>{c.baseline}</td>
                    <td>{c.alternative}</td>
                    <td className="hint">{c.note ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {changes.filter((c) => c.field !== 'Transition seed').length > 1 && (
          <p className="hint" style={{ color: 'var(--warning)', margin: '8px 0 0' }}>
            More than one assumption differs, so an observed difference cannot be attributed to any single change.
          </p>
        )}
        {!compat.hamming && (
          <p className="hint" style={{ margin: '8px 0 0' }}>
            {compat.hammingReason}
            {compat.normalize ? ' All comparisons below use fractions of each lattice.' : ''}
          </p>
        )}
      </section>

      <section className="card" style={{ marginBottom: 16 }} aria-labelledby="sbs-h">
        <div className="card-title">
          <h3 id="sbs-h" style={{ margin: 0 }}>
            Side by side
          </h3>
          <div className="toolbar-group">
            <button className="btn btn-sm" aria-pressed={locked} onClick={() => setLocked(!locked)} title="When locked, controls act on both sides">
              {locked ? <Lock size={14} aria-hidden /> : <Unlock size={14} aria-hidden />}
              {locked ? 'Generations locked' : 'Unlocked'}
            </button>
            {locked && (
              <>
                <button className="btn btn-sm" onClick={() => both((s) => s.step(1))}>
                  <StepForward size={14} aria-hidden />
                  Step both
                </button>
                <label className="sr-only" htmlFor="cmp-n">
                  Generations
                </label>
                <input
                  id="cmp-n"
                  className="input input-sm tabular"
                  style={{ width: 64 }}
                  type="number"
                  min={1}
                  value={stepN}
                  onChange={(e) => setStepN(Math.max(1, Math.floor(Number(e.target.value)) || 1))}
                />
                <button className="btn btn-sm" onClick={() => both((s) => s.step(stepN))}>
                  Step both {stepN}
                </button>
                <button className="btn btn-sm" onClick={() => both((s) => s.reset())}>
                  <RotateCcw size={14} aria-hidden />
                  Reset both
                </button>
              </>
            )}
            {!locked && (
              <>
                <button className="btn btn-sm" onClick={() => simA.current?.step(1)}>
                  Step baseline
                </button>
                <button className="btn btn-sm" onClick={() => simB.current?.step(1)}>
                  Step alternative
                </button>
              </>
            )}
          </div>
        </div>
        <p className="hint tabular" style={{ marginTop: 0 }} aria-live="polite">
          {ham !== null
            ? `Hamming distance at generation ${gA}: ${(ham * 100).toFixed(2)}% of sites differ.`
            : compat.hamming
              ? 'Hamming distance is shown when both sides are at the same generation.'
              : compat.hammingReason}{' '}
          Pan and zoom each side independently (drag, wheel).
        </p>
        <div className="compare-grid">
          <SideView
            side={base}
            label="Baseline"
            simRef={(s) => {
              simA.current = s;
            }}
            onChange={() => tick((t) => t + 1)}
          />
          <SideView
            side={alt}
            label="Alternative"
            simRef={(s) => {
              simB.current = s;
            }}
            onChange={() => tick((t) => t + 1)}
          />
        </div>
      </section>

      <section className="card" style={{ marginBottom: 16 }} aria-labelledby="rep-h">
        <h3 id="rep-h">Replicated comparison</h3>
        <div className="form-grid">
          <div className="field">
            <label className="label" htmlFor="c-reps">
              Runs per side
            </label>
            <input
              id="c-reps"
              className="input tabular"
              type="number"
              min={1}
              max={125}
              value={reps}
              disabled={!stochastic}
              onChange={(e) => setReps(Math.max(1, Math.min(125, Math.floor(Number(e.target.value)) || 1)))}
            />
            {!stochastic && <span className="hint">Deterministic models give one outcome per side.</span>}
          </div>
          <div className="field">
            <label className="label" htmlFor="c-h">
              Horizon
            </label>
            <input
              id="c-h"
              className="input tabular"
              type="number"
              min={1}
              value={horizon}
              onChange={(e) => setHorizon(Math.max(1, Math.floor(Number(e.target.value)) || 1))}
            />
          </div>
          <div className="field">
            <label className="label" htmlFor="c-m">
              Outcome
            </label>
            <select id="c-m" className="select" value={metric} onChange={(e) => setMetric(e.target.value as MetricId)}>
              {metrics.map((m) => (
                <option key={m} value={m}>
                  {metricLabel(m, base.model.stateLabels)}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="label" htmlFor="c-a">
              Per run
            </label>
            <select id="c-a" className="select" value={aggregate} onChange={(e) => setAggregate(e.target.value as 'final' | 'window-mean')}>
              <option value="final">Value at the horizon</option>
              <option value="window-mean">Mean over all generations</option>
            </select>
          </div>
          <div className="field">
            <label className="label" htmlFor="c-d">
              Design
            </label>
            <select id="c-d" className="select" value={design} onChange={(e) => setDesign(e.target.value as 'independent' | 'paired')}>
              <option value="independent">Independent runs</option>
              <option value="paired" disabled={!compat.paired || !stochastic}>
                Paired: replicate i uses the same random streams on both sides
              </option>
            </select>
            <span className="hint">
              {compat.paired ? 'Pairing reduces noise only when both sides use the random draws the same way.' : compat.pairedReason}
            </span>
          </div>
          <div className="field">
            <label className="label" htmlFor="c-s">
              Master seed
            </label>
            <input id="c-s" className="input tabular" value={masterSeed} onChange={(e) => setMasterSeed(e.target.value)} />
          </div>
        </div>
        <p style={{ margin: '12px 0 0' }}>
          <button className="btn btn-primary" disabled={runner.active || !masterSeed.trim()} onClick={() => void runComparison()}>
            <Play size={16} aria-hidden />
            {runner.active
              ? `Running… ${runner.progress?.completedRuns ?? 0} of ${runner.progress?.totalRuns ?? '?'} on this side`
              : `Run ${reps} + ${reps} runs`}
          </button>
          {cmp?.baselineExperimentId && (
            <span className="hint">
              {' '}
              · <a href={`#/experiment/${cmp.baselineExperimentId}`}>baseline runs</a> ·{' '}
              <a href={`#/experiment/${cmp.alternativeExperimentId}`}>alternative runs</a>
            </span>
          )}
        </p>
        {diff && (
          <div style={{ marginTop: 12 }}>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th></th>
                    <th className="num">n</th>
                    <th className="num">Mean</th>
                    <th className="num">SD</th>
                    <th className="num">Median</th>
                    <th className="num">Min – max</th>
                  </tr>
                </thead>
                <tbody>
                  {(
                    [
                      ['Baseline', diff.baseline],
                      ['Alternative', diff.alternative],
                    ] as const
                  ).map(([l, s]) => (
                    <tr key={l}>
                      <td>{l}</td>
                      <td className="num">{s.n}</td>
                      <td className="num">{f(s.mean)}</td>
                      <td className="num">{f(s.sd)}</td>
                      <td className="num">{f(s.median)}</td>
                      <td className="num">{s.min === null ? '—' : `${f(s.min)} – ${f(s.max)}`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p style={{ margin: '10px 0 4px' }}>
              <strong>Alternative − baseline:</strong> {f(diff.mean)}
              {diff.ci95 ? ` (95% interval ${f(diff.ci95[0])} to ${f(diff.ci95[1])})` : ''}. Relative change:{' '}
              {diff.relative
                ? diff.relative.percent === null
                  ? `N/A (baseline is 0; absolute change ${f(diff.relative.absolute)})`
                  : `${diff.relative.percent.toFixed(1)}%`
                : '—'}
              .
            </p>
            <p className="hint" style={{ margin: 0 }}>
              {diff.method}. {diff.note ?? ''} {cmp?.design === 'paired' ? 'Pairs are matched by replicate number.' : 'The two groups are independent.'}{' '}
              Intervals assume roughly normal outcomes.
            </p>
          </div>
        )}
        {cmp && exps.a && !done && !runner.active && (
          <p className="hint">
            The comparison runs are {exps.a.status} / {exps.b?.status}. Open each experiment to resume.
          </p>
        )}
      </section>

      <section className="card" aria-labelledby="int-h">
        <h3 id="int-h">
          <ArrowLeftRight size={16} aria-hidden style={{ verticalAlign: -2 }} /> Interpretation
        </h3>
        <ul className="hint" style={{ marginTop: 0 }}>
          <li>Did the effect persist across seeds?</li>
          <li>Did the boundary create the effect?</li>
          <li>Was only one assumption changed?</li>
          <li>Would a larger grid change the conclusion?</li>
          <li>Does a steady population count hide ongoing activity?</li>
          <li>Does the evidence justify the claim?</li>
        </ul>
        <label className="sr-only" htmlFor="cmp-int">
          Interpretation
        </label>
        <textarea
          id="cmp-int"
          className="input textarea"
          rows={5}
          defaultValue={cmp?.interpretation ?? ''}
          key={cmp?.id ?? 'none'}
          disabled={!cmp}
          placeholder={cmp ? 'What changed, how sure are you, and why?' : 'Run a replicated comparison first.'}
          onBlur={(e) => {
            if (cmp) {
              const next = { ...cmp, interpretation: e.target.value };
              setCmp(next);
              void putComparison(next).then(() => toast('success', 'Interpretation saved.'));
            }
          }}
        />
      </section>
    </div>
  );
}
