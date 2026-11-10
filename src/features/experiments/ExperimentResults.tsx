// Experiment results: progress, configuration summaries with labeled uncertainty,
// censoring, response and trajectory charts with table alternatives, run manifest and exports.
import { useMemo, useState } from 'react';
import { CartesianGrid, ComposedChart, ErrorBar, Line, LineChart, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis } from 'recharts';
import { Download, FileJson, FileText } from 'lucide-react';
import type { ExperimentDefinition } from '../../domain/experiments/experiment';
import { metricLabel } from '../../domain/experiments/experiment';
import { summarizeConfigurations, meanTrajectory } from '../../domain/experiments/analysis';
import { experimentCsv, experimentJson, experimentReport, metricDefinition, type StoredRun } from '../../interchange/experimentExport';
import { downloadText, safeFilename } from '../../components/ui';
import { useTokens } from '../../app/theme';
import { decimate } from '../../interchange/metricsCsv';

/** “Infection probability β” → “β”; keeps legends short. */
const shortLabel = (l: string) => {
  const last = l.trim().split(/\s+/).pop() ?? l;
  return last.length <= 3 ? last : l;
};
const fx = (v: number | null, d = 4) => (v === null ? '—' : Number.isInteger(v) ? String(v) : v.toFixed(d));

export function ExperimentResults({
  def,
  runs,
  status,
  conclusion,
  runtime,
  onConclusion,
}: {
  def: ExperimentDefinition;
  runs: StoredRun[];
  status: string;
  conclusion: string;
  runtime: string | null;
  onConclusion(text: string): void;
}) {
  const t = useTokens(['chart-1', 'chart-2', 'chart-3', 'chart-grid', 'chart-axis', 'chart-muted', 'accent'] as const);
  const [view, setView] = useState<'chart' | 'table'>('chart');
  const sums = useMemo(() => summarizeConfigurations(def, runs), [def, runs]);
  const isEvent = def.response.aggregate === 'event-time';
  const labels = def.baseModel.stateLabels;
  const f1 = def.factors[0],
    f2 = def.factors[1];
  const numericX = !!f1 && f1.values.every((v) => typeof v === 'number');
  const colors = [t['chart-1'], t['chart-2'], t['chart-3'], t.accent, t['chart-muted']];
  const groups = useMemo(() => (f2 ? f2.values : [null]), [f2]);

  const chartData = useMemo(
    () =>
      groups.map((g2) =>
        sums
          .filter((c) => !f2 || c.values[f2.id] === g2)
          .map((c) => ({
            x: f1 ? c.values[f1.id] : 'all',
            mean: c.summary.mean,
            err: c.summary.ci95 && c.summary.mean !== null ? [c.summary.mean - c.summary.ci95[0], c.summary.ci95[1] - c.summary.mean] : [0, 0],
          })),
      ),
    [sums, f1, f2, groups],
  );
  const points = useMemo(
    () =>
      runs
        .filter((r) => r.status === 'completed' && r.response.value !== null)
        .map((r) => ({ x: f1 ? r.factorValues[f1.id] : 'all', y: r.response.value, g: f2 ? r.factorValues[f2.id] : null })),
    [runs, f1, f2],
  );

  const trajState = def.response.metric.startsWith('fraction:') ? Number(def.response.metric.slice(9)) : 1;
  const trajectories = useMemo(
    () =>
      sums.slice(0, 8).map((c) => ({
        key: c.key,
        label: def.factors.map((f) => `${shortLabel(f.label)} = ${c.values[f.id]}`).join(', ') || 'All runs',
        data: decimate(
          meanTrajectory(
            runs.filter((r) => r.configurationKey === c.key),
            trajState,
            (r) => r.width * r.height,
          ),
          400,
        ).rows,
      })),
    [sums, runs, trajState, def.factors],
  );

  const exportBase = safeFilename(def.name);
  const m = def.response.metric;
  const bounded = m.startsWith('fraction:') || m === 'activity' || m === 'flow';
  const completed = runs.filter((r) => r.status === 'completed').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <section className="card">
        <div className="card-title">
          <h3 style={{ margin: 0 }}>Results by configuration</h3>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button
              className="btn btn-sm"
              disabled={!runs.length}
              onClick={() => downloadText(`${exportBase}-metrics.csv`, experimentCsv(def, runs), 'text/csv')}
            >
              <Download size={14} aria-hidden />
              Metrics CSV
            </button>
            <button
              className="btn btn-sm"
              onClick={() =>
                downloadText(`${exportBase}.ca-experiment.json`, experimentJson(def, runs, { includeSamples: false, conclusion, runtime, status }))
              }
            >
              <FileJson size={14} aria-hidden />
              Experiment JSON
            </button>
            <button
              className="btn btn-sm"
              onClick={() => downloadText(`${exportBase}-report.md`, experimentReport(def, runs, { conclusion, runtime, status }), 'text/markdown')}
            >
              <FileText size={14} aria-hidden />
              Report
            </button>
          </div>
        </div>
        <p className="hint" style={{ marginTop: 0 }}>
          {metricDefinition(def)} {completed} completed run{completed === 1 ? '' : 's'}; cancelled or failed runs are never included in a summary.
        </p>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                {def.factors.map((f) => (
                  <th key={f.id}>{f.label}</th>
                ))}
                {isEvent ? (
                  <>
                    <th className="num">Runs</th>
                    <th className="num">Event seen</th>
                    <th className="num">Censored</th>
                    <th className="num">Mean time (events only)</th>
                    <th className="num">Median time (Kaplan–Meier)</th>
                  </>
                ) : (
                  <>
                    <th className="num">n</th>
                    <th className="num">Mean</th>
                    <th className="num">SD</th>
                    <th className="num">Median</th>
                    <th className="num">Min – max</th>
                    <th className="num">95% CI (t)</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {sums.map((c) => (
                <tr key={c.key}>
                  {def.factors.map((f) => (
                    <td key={f.id} className="tabular">
                      {String(c.values[f.id])}
                    </td>
                  ))}
                  {isEvent ? (
                    <>
                      <td className="num">
                        {c.completed}/{c.planned}
                      </td>
                      <td className="num">{c.events?.observed ?? 0}</td>
                      <td className="num">{c.events?.censored ?? 0}</td>
                      <td className="num">{fx(c.summary.mean, 1)}</td>
                      <td className="num">{c.events?.kmMedian ?? (c.completed ? 'not reached' : '—')}</td>
                    </>
                  ) : (
                    <>
                      <td className="num">
                        {c.summary.n}/{c.planned}
                      </td>
                      <td className="num">{fx(c.summary.mean)}</td>
                      <td className="num">{c.deterministic ? 'n/a' : fx(c.summary.sd)}</td>
                      <td className="num">{fx(c.summary.median)}</td>
                      <td className="num">{c.summary.min === null ? '—' : `${fx(c.summary.min)} – ${fx(c.summary.max)}`}</td>
                      <td className="num">{c.deterministic ? 'n/a' : c.summary.ci95 ? `${fx(c.summary.ci95[0])} – ${fx(c.summary.ci95[1])}` : '—'}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {sums.some((c) => c.summary.caveats.length) && sums.length > 1 && (
          <p className="hint" style={{ margin: '8px 0 0' }}>
            Caveats that apply to at least one configuration:
          </p>
        )}
        {[
          ...new Set(
            sums.flatMap((c) => [
              ...c.summary.caveats,
              ...(c.unavailable.length ? [`${c.unavailable.length} run(s) have no response: ${c.unavailable[0].reason}`] : []),
            ]),
          ),
        ]
          .slice(0, 6)
          .map((c) => (
            <p key={c} className="hint" style={{ margin: '6px 0 0' }}>
              ⚠ {c}
            </p>
          ))}
        {sums.some((c) => c.deterministic) && (
          <p className="hint" style={{ margin: '6px 0 0' }}>
            This model is deterministic and starts from the same grid, so each configuration has exactly one outcome and no statistical uncertainty.
          </p>
        )}
        {!isEvent && !sums.some((c) => c.deterministic) && (
          <p className="hint" style={{ margin: '6px 0 0' }}>
            Uncertainty is computed across independent runs. The 95% interval assumes roughly normal outcomes (Student t, n − 1 degrees of freedom)
            {bounded ? '; intervals reaching outside 0–1 are cut off in the chart' : ''}.
          </p>
        )}
      </section>

      {f1 && !isEvent && (
        <section className="card" aria-labelledby="resp-h">
          <div className="card-title">
            <h3 id="resp-h" style={{ margin: 0 }}>
              {metricLabel(def.response.metric, labels)} by {f1.label}
            </h3>
            <div className="tabs" role="tablist" aria-label="Response view">
              {(['chart', 'table'] as const).map((k) => (
                <button key={k} role="tab" className="tab" aria-selected={view === k} onClick={() => setView(k)}>
                  {k === 'chart' ? 'Chart' : 'Points'}
                </button>
              ))}
            </div>
          </div>
          {view === 'chart' ? (
            <>
              <div className="legend">
                {groups.map((g, i) => (
                  <span key={String(g)}>
                    <i style={{ background: colors[i % colors.length] }} />
                    {f2 ? `${shortLabel(f2.label)} = ${g}` : 'Mean ± 95% CI'}
                  </span>
                ))}
                <span>
                  <i style={{ background: t['chart-muted'], opacity: 0.5 }} />
                  Individual runs
                </span>
              </div>
              <div
                style={{ height: 280 }}
                role="img"
                aria-label={`Mean response with 95% intervals for each ${f1.label} value. The Points tab lists every run.`}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                    <CartesianGrid stroke={t['chart-grid']} vertical={false} />
                    <XAxis
                      dataKey="x"
                      type={numericX ? 'number' : 'category'}
                      domain={numericX ? ['dataMin', 'dataMax'] : undefined}
                      ticks={numericX ? (f1.values as number[]) : undefined}
                      allowDuplicatedCategory={false}
                      tick={{ fontSize: 11, fill: t['chart-muted'] }}
                      tickLine={false}
                      axisLine={{ stroke: t['chart-axis'] }}
                      padding={numericX ? undefined : { left: 20, right: 20 }}
                    />
                    <YAxis
                      domain={bounded ? [0, 1] : ['auto', 'auto']}
                      allowDataOverflow={bounded}
                      tick={{ fontSize: 11, fill: t['chart-muted'] }}
                      tickLine={false}
                      axisLine={false}
                      width={52}
                    />
                    <Tooltip contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12 }} />
                    <Scatter data={points} dataKey="y" fill={t['chart-muted']} fillOpacity={0.45} isAnimationActive={false} name="Run" />
                    {chartData.map((d, i) => (
                      <Line
                        key={i}
                        data={d}
                        dataKey="mean"
                        stroke={colors[i % colors.length]}
                        strokeWidth={2}
                        dot={{ r: 3 }}
                        isAnimationActive={false}
                        name={f2 ? `${f2.label} = ${groups[i]}` : 'Mean'}
                      >
                        <ErrorBar dataKey="err" width={6} stroke={colors[i % colors.length]} />
                      </Line>
                    ))}
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </>
          ) : (
            <div className="table-wrap" style={{ maxHeight: 280, overflow: 'auto' }}>
              <table className="data">
                <thead>
                  <tr>
                    <th>{f1.label}</th>
                    {f2 && <th>{f2.label}</th>}
                    <th className="num">Response</th>
                  </tr>
                </thead>
                <tbody>
                  {points.map((p, i) => (
                    <tr key={i}>
                      <td className="tabular">{String(p.x)}</td>
                      {f2 && <td>{String(p.g)}</td>}
                      <td className="num">{fx(p.y, 6)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {runs.some((r) => r.samples.length) && (
        <section className="card" aria-labelledby="traj-h">
          <h3 id="traj-h">Mean {labels[trajState]} fraction over time</h3>
          <p className="hint" style={{ marginTop: 0 }}>
            Averaged over completed runs at each sampled generation (every {def.sampleInterval}). Runs that stopped early drop out, so later points may average
            fewer runs.{sums.length > 8 ? ' Showing the first 8 configurations.' : ''}
          </p>
          <div className="legend">
            {trajectories.map((tr, i) => (
              <span key={tr.key}>
                <i style={{ background: colors[i % colors.length] }} />
                {tr.label}
              </span>
            ))}
          </div>
          <div style={{ height: 240 }} role="img" aria-label="Mean trajectory per configuration. Export the metrics CSV for the values.">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                <CartesianGrid stroke={t['chart-grid']} vertical={false} />
                <XAxis
                  dataKey="generation"
                  type="number"
                  domain={[0, 'dataMax']}
                  allowDuplicatedCategory={false}
                  tick={{ fontSize: 11, fill: t['chart-muted'] }}
                  tickLine={false}
                  axisLine={{ stroke: t['chart-axis'] }}
                />
                <YAxis
                  domain={[0, 1]}
                  tickFormatter={(v: number) => `${Math.round(v * 100)}%`}
                  tick={{ fontSize: 11, fill: t['chart-muted'] }}
                  tickLine={false}
                  axisLine={false}
                  width={46}
                />
                {trajectories.length <= 4 && (
                  <Tooltip
                    labelFormatter={(g) => `Generation ${g}`}
                    formatter={(v) => `${(Number(v) * 100).toFixed(2)}%`}
                    contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12 }}
                  />
                )}
                {trajectories.map((tr, i) => (
                  <Line
                    key={tr.key}
                    data={tr.data}
                    dataKey="mean"
                    name={tr.label}
                    stroke={colors[i % colors.length]}
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                    type="stepAfter"
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      <section className="card" aria-labelledby="concl-h">
        <h3 id="concl-h">Interpretation</h3>
        <p className="hint" style={{ marginTop: 0 }}>
          Did the effect persist across seeds? Could the boundary or lattice size explain it? Was only one assumption changed? Does the evidence justify your
          claim?
        </p>
        <label className="sr-only" htmlFor="conclusion">
          Your interpretation
        </label>
        <textarea
          id="conclusion"
          className="input textarea"
          rows={5}
          defaultValue={conclusion}
          onBlur={(e) => onConclusion(e.target.value)}
          placeholder="Write what the results show, how certain they are, and what they do not show."
        />
      </section>

      <section className="card" aria-labelledby="runs-h">
        <h3 id="runs-h">Runs ({runs.length})</h3>
        <div className="table-wrap" style={{ maxHeight: 360, overflow: 'auto' }}>
          <table className="data">
            <thead>
              <tr>
                <th>Run</th>
                <th>Replicate</th>
                <th>Status</th>
                <th>Stop</th>
                <th className="num">End</th>
                <th className="num">Response</th>
                <th>Transition seed</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={(r as { id?: string }).id ?? r.runId}>
                  <td>
                    <code title={r.runId}>{r.runId.split('/').slice(1).join('/')}</code>
                    {(r as { retryOf?: string }).retryOf && <span className="hint"> (retry)</span>}
                  </td>
                  <td className="num">{r.replicateIndex}</td>
                  <td>{r.status}</td>
                  <td title={r.stopDetail ?? undefined}>{r.stopReason}</td>
                  <td className="num">{r.actualEnd}</td>
                  <td className="num" title={r.response.reason ?? undefined}>
                    {r.response.value === null ? 'N/A' : fx(r.response.value, 6)}
                  </td>
                  <td>
                    <code style={{ fontSize: 11 }} title={r.seeds.transition}>
                      {r.seeds.transition.length > 40 ? `${r.seeds.transition.slice(0, 40)}…` : r.seeds.transition}
                    </code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
