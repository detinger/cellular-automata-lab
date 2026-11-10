// Time-series analytics. Display decimation never changes exported data.
import { useMemo, useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChevronDown, ChevronUp, Download } from 'lucide-react';
import type { Model } from '../../domain/contracts/model';
import type { GenerationMetrics } from '../../domain/metrics/basic';
import { decimate, metricsToCsv } from '../../interchange/metricsCsv';
import { useTokens } from '../../app/theme';
import { downloadText, safeFilename } from '../../components/ui';
import { stateTokens, useStatePalette } from '../../renderers/palette';

const MAX_POINTS = 2000;
const NICE = [0.01, 0.02, 0.05, 0.1, 0.2, 0.25, 0.5, 1];
/** Smallest "nice" fraction ≥ the data maximum, so small populations remain readable. */
const niceMax = (dataMax: number) => NICE.find((n) => n >= dataMax) ?? 1;
const fmtPct = (v: number) => `${+(v * 100).toFixed(v < 0.1 ? 1 : 0)}%`;
const TABLE_ROWS = 200;

interface Props {
  model: Model;
  name: string;
  rows: readonly GenerationMetrics[];
  version: number;
  truncatedAt: number | null;
  runId: string;
  modelHash: string;
  open: boolean;
  onToggle(): void;
}

export function AnalyticsPanel({ model, name, rows, version, truncatedAt, runId, modelHash, open, onToggle }: Props) {
  const [tab, setTab] = useState<'chart' | 'table'>('chart');
  const t = useTokens(['chart-1', 'chart-2', 'chart-3', 'chart-grid', 'chart-axis', 'chart-muted'] as const);
  const sites = model.width * model.height;
  const traffic = model.rule.id === 'elementary/v1' && model.rule.ruleNumber === 184 && model.boundary.kind === 'periodic';
  const label1 = model.stateLabels[1];
  const palette = useStatePalette(model);
  const binary = model.stateCount === 2;
  // Binary: the state-1 fraction. Multistate: one series per state, colored like the grid (STYLE.md §8).
  // A light state color that reads poorly as a line falls back to a categorical chart color.
  const stateSeries = binary
    ? [{ key: 's1', label: `${label1} fraction`, color: t['chart-1'] }]
    : model.stateLabels.map((l, i) => ({ key: `s${i}`, label: l, color: stateTokens(model)?.[i] === 'sim-dead' ? t['chart-muted'] : palette[i] }));
  const series = [
    ...stateSeries,
    { key: 'activity', label: 'Activity', color: binary ? t['chart-2'] : t['chart-muted'], dashed: !binary },
    ...(traffic ? [{ key: 'flow', label: 'Flow', color: t['chart-3'] }] : []),
  ];

  const { data, stride } = useMemo(() => {
    const d = decimate(rows, MAX_POINTS);
    return {
      stride: d.stride,
      data: d.rows.map((r) => {
        const o: Record<string, number | null> = { generation: r.generation, activity: r.activity, flow: r.flow };
        r.counts.forEach((c, i) => {
          o[`s${i}`] = c / sites;
        });
        return o;
      }),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, sites]);

  const exportCsv = () =>
    downloadText(
      `${safeFilename(name)}-metrics.csv`,
      metricsToCsv(rows, { runId: runId || 'unsaved-session', modelHash, stateLabels: model.stateLabels, sites }),
      'text/csv',
    );

  const tail = rows.slice(-TABLE_ROWS).reverse();
  const pct = (v: number | null) => (v === null ? '—' : (v * 100).toFixed(2));

  return (
    <section className="analytics" aria-label="Analytics">
      <div className="analytics-head">
        <button className="btn btn-sm btn-ghost" onClick={onToggle} aria-expanded={open}>
          {open ? <ChevronDown size={14} aria-hidden /> : <ChevronUp size={14} aria-hidden />}Analytics
        </button>
        {open && (
          <div className="tabs" role="tablist" aria-label="Analytics view">
            {(['chart', 'table'] as const).map((k) => (
              <button key={k} role="tab" className="tab" aria-selected={tab === k} onClick={() => setTab(k)}>
                {k === 'chart' ? 'Chart' : 'Table'}
              </button>
            ))}
          </div>
        )}
        <span className="hint tabular" style={{ marginLeft: 'auto' }}>
          {rows.length.toLocaleString()} generation{rows.length === 1 ? '' : 's'} recorded
          {stride > 1 && open && tab === 'chart' ? ` · chart shows every ${stride}th` : ''}
        </span>
        <button className="btn btn-sm" onClick={exportCsv} disabled={!rows.length}>
          <Download size={14} aria-hidden />
          Export CSV
        </button>
      </div>
      {open && (
        <div className="analytics-body">
          {truncatedAt !== null && (
            <p className="hint" style={{ color: 'var(--warning)', margin: '0 0 6px' }}>
              The record is full: generations after {truncatedAt - 1} were simulated but not measured. Export the CSV and press Reset to start a new record.
            </p>
          )}
          {!rows.length ? (
            <p className="hint">Measurements appear once the model is runnable.</p>
          ) : tab === 'chart' ? (
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div className="legend" aria-hidden>
                {series.map((s) => (
                  <span key={s.key}>
                    <i style={{ background: s.color }} />
                    {s.label}
                  </span>
                ))}
                <span style={{ marginLeft: 'auto' }}>Fraction of all {sites.toLocaleString()} sites, per generation · y-axis scaled to the data</span>
              </div>
              <div
                style={{ flex: 1, minHeight: 0 }}
                role="img"
                aria-label={`Line chart of ${series.map((s) => s.label).join(', ')} by generation. Use the Table tab for values.`}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data} margin={{ top: 6, right: 12, bottom: 0, left: 0 }}>
                    <CartesianGrid stroke={t['chart-grid']} vertical={false} />
                    <XAxis
                      dataKey="generation"
                      type="number"
                      domain={['dataMin', 'dataMax']}
                      allowDecimals={false}
                      tick={{ fontSize: 11, fill: t['chart-muted'] }}
                      tickLine={false}
                      axisLine={{ stroke: t['chart-axis'] }}
                    />
                    <YAxis
                      domain={[0, (dataMax: number) => niceMax(dataMax)]}
                      tick={{ fontSize: 11, fill: t['chart-muted'] }}
                      tickLine={false}
                      axisLine={false}
                      width={46}
                      tickFormatter={fmtPct}
                    />
                    <Tooltip
                      content={({ active, payload, label }) =>
                        active && payload?.length ? (
                          <div className="chart-tooltip tabular">
                            <div style={{ fontWeight: 600 }}>Generation {label}</div>
                            {payload.map((p) => (
                              <div key={String(p.dataKey)} style={{ color: p.color }}>
                                {series.find((s) => s.key === p.dataKey)?.label}:{' '}
                                {p.value === null || p.value === undefined ? '—' : `${(Number(p.value) * 100).toFixed(2)}%`}
                              </div>
                            ))}
                          </div>
                        ) : null
                      }
                    />
                    {series.map((s) => (
                      <Line
                        key={s.key}
                        dataKey={s.key}
                        stroke={s.color}
                        strokeWidth={2}
                        strokeDasharray={'dashed' in s && s.dashed ? '4 3' : undefined}
                        dot={false}
                        isAnimationActive={false}
                        type="stepAfter"
                        connectNulls={false}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          ) : (
            <>
              <p className="hint" style={{ margin: '0 0 6px' }}>
                Latest {Math.min(TABLE_ROWS, rows.length)} generations, newest first. Export CSV for the complete record.
              </p>
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th className="num">Generation</th>
                      {model.stateLabels.map((l) => (
                        <th key={l} className="num">
                          {l}
                        </th>
                      ))}
                      {binary && <th className="num">{label1} %</th>}
                      <th className="num">Activity %</th>
                      {!binary && <th className="num">Entropy (bits)</th>}
                      {model.rule.id === 'spatial-sir/v1' && <th className="num">New infections</th>}
                      {model.rule.id === 'life-like/v1' && (
                        <>
                          <th className="num">Births</th>
                          <th className="num">Deaths</th>
                        </>
                      )}
                      {traffic && <th className="num">Flow</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {tail.map((r) => (
                      <tr key={r.generation}>
                        <td className="num">{r.generation}</td>
                        {r.counts.map((c, i) => (
                          <td key={i} className="num">
                            {c}
                          </td>
                        ))}
                        {binary && <td className="num">{pct(r.counts[1] / sites)}</td>}
                        <td className="num">{pct(r.activity)}</td>
                        {!binary && <td className="num">{r.entropy.toFixed(3)}</td>}
                        {model.rule.id === 'spatial-sir/v1' && <td className="num">{r.incidence ?? '—'}</td>}
                        {model.rule.id === 'life-like/v1' && (
                          <>
                            <td className="num">{r.births ?? '—'}</td>
                            <td className="num">{r.deaths ?? '—'}</td>
                          </>
                        )}
                        {traffic && <td className="num">{r.flow === null ? '—' : r.flow.toFixed(3)}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
