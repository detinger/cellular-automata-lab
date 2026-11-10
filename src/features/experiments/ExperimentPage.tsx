// One experiment: designer while a draft, then progress and results.
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Copy, RotateCcw, Square, Trash2 } from 'lucide-react';
import { db, deleteExperiment, loadRuns, createExperiment, updateExperiment, type ExperimentRecord } from '../../storage/db';
import { planRuns, validateExperiment, type ExperimentDefinition } from '../../domain/experiments/experiment';
import { hasErrors } from '../../domain/contracts/validation';
import type { StoredRun } from '../../interchange/experimentExport';
import { Badge, Callout, useToast } from '../../components/ui';
import { navigate } from '../../app/router';
import { ExperimentDesigner } from './ExperimentDesigner';
import { ExperimentResults } from './ExperimentResults';
import { useExperimentRunner } from './useExperimentRunner';

const STATUS_TONE: Record<string, 'primary' | 'accent' | 'success' | 'warning' | 'error' | undefined> = {
  draft: undefined,
  running: 'accent',
  completed: 'success',
  cancelled: 'warning',
  interrupted: 'warning',
};

export function ExperimentPage({ id }: { id: string }) {
  const toast = useToast();
  const [rec, setRec] = useState<ExperimentRecord | null | undefined>(undefined);
  const [runs, setRuns] = useState<StoredRun[]>([]);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const runner = useExperimentRunner(
    (r) => setRuns((old) => [...old.filter((x) => !(x.runId === r.runId && x.status !== 'completed')), r].sort((a, b) => a.index - b.index)),
    (status) => setRec((r) => (r ? { ...r, status } : r)),
  );

  const load = useCallback(async () => {
    const r = await db.experiments.get(id);
    setRec(r ?? null);
    if (r) setRuns(await loadRuns(id));
  }, [id]);
  useEffect(() => {
    void load();
  }, [load]);

  if (rec === undefined)
    return (
      <div className="page">
        <p className="hint">Loading…</p>
      </div>
    );
  if (rec === null)
    return (
      <div className="page">
        <Callout kind="error" title="Experiment not found">
          <p>It may have been deleted from this browser.</p>
        </Callout>
        <p>
          <a href="#/experiments">All experiments</a>
        </p>
      </div>
    );

  const onChange = (definition: ExperimentDefinition) => {
    setRec({ ...rec, definition, name: definition.name });
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void updateExperiment(id, { definition, name: definition.name, totalRuns: planRuns(definition).length }), 400);
  };
  const run = async () => {
    if (hasErrors(validateExperiment(rec.definition))) return;
    clearTimeout(saveTimer.current);
    const totalRuns = planRuns(rec.definition).length;
    const next = { ...rec, totalRuns, definition: { ...rec.definition, createdAt: new Date().toISOString() } };
    await updateExperiment(id, { definition: next.definition, totalRuns });
    setRec(next);
    setRuns([]);
    runner.start(next, []);
  };
  const resume = () =>
    runner.start(
      rec,
      runs.filter((r) => r.status === 'completed').map((r) => r.runId),
    );
  const duplicate = async () => {
    const def = {
      ...structuredClone(rec.definition),
      id: `exp-${crypto.randomUUID()}`,
      name: `${rec.definition.name} (copy)`,
      createdAt: new Date().toISOString(),
    };
    await createExperiment(def, planRuns(def).length);
    navigate(`/experiment/${def.id}`);
  };
  const remove = async () => {
    if (!confirm(`Delete “${rec.name}” and all its runs from this browser? This cannot be undone.`)) return;
    await deleteExperiment(id);
    navigate('/experiments');
  };

  const p = runner.progress;
  const running = runner.active;
  const completedIds = new Set(runs.filter((r) => r.status === 'completed').map((r) => r.runId));
  const pct = p ? Math.round(((p.completedRuns + p.currentGeneration / Math.max(1, p.horizon)) / Math.max(1, p.totalRuns)) * 100) : 0;

  return (
    <div className="page page-wide">
      <header className="page-header">
        <div>
          <div className="eyebrow">
            <a href={`#/project/${rec.projectId}`}>
              <ArrowLeft size={12} aria-hidden /> Back to the model
            </a>{' '}
            · <a href="#/experiments">All experiments</a>
          </div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {rec.definition.name} <Badge tone={STATUS_TONE[rec.status]}>{rec.status}</Badge>
          </h1>
          {rec.status !== 'draft' && rec.definition.question && (
            <p>
              <strong>Question:</strong> {rec.definition.question}
            </p>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {rec.status !== 'draft' && (
            <button className="btn" onClick={duplicate}>
              <Copy size={16} aria-hidden />
              Duplicate as new draft
            </button>
          )}
          <button className="btn btn-danger" onClick={remove} disabled={running}>
            <Trash2 size={16} aria-hidden />
            Delete
          </button>
        </div>
      </header>

      {runner.error && (
        <div style={{ marginBottom: 16 }}>
          <Callout kind="error" title="The experiment stopped">
            <p>{runner.error}</p>
          </Callout>
        </div>
      )}

      {(running || rec.status === 'interrupted' || rec.status === 'cancelled') && (
        <section className="card" style={{ marginBottom: 16 }} aria-live="polite">
          {running && p ? (
            <>
              <div className="card-title">
                <h3 style={{ margin: 0 }}>Running</h3>
                <button className="btn btn-sm" onClick={runner.cancel} disabled={runner.cancelling}>
                  <Square size={14} aria-hidden />
                  {runner.cancelling ? 'Cancelling…' : 'Cancel'}
                </button>
              </div>
              <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Experiment progress">
                <div style={{ width: `${pct}%` }} />
              </div>
              <p className="hint tabular" style={{ margin: '6px 0 0' }}>
                {p.completedRuns} of {p.totalRuns} runs complete ·{' '}
                {p.currentRunId ? `current run ${p.currentRunId.split('/').slice(1).join('/')}, generation ${p.currentGeneration} of ${p.horizon}` : 'starting'}{' '}
                · {(p.elapsedMs / 1000).toFixed(1)} s elapsed
              </p>
              <p className="hint" style={{ margin: '4px 0 0' }}>
                Completed runs are saved as they finish. A background tab may run slower; results do not depend on speed.
              </p>
            </>
          ) : (
            <>
              <h3 style={{ marginTop: 0 }}>{rec.status === 'cancelled' ? 'Cancelled' : 'Interrupted'}</h3>
              <p style={{ marginTop: 0 }}>
                {completedIds.size} of {rec.totalRuns} runs completed and saved. Partial runs are marked and excluded from every summary.
                {rec.recovery
                  ? ` A recovery checkpoint of run ${rec.recovery.runId.split('/').slice(1).join('/')} at generation ${rec.recovery.checkpoint.generation} is available.`
                  : ''}
              </p>
              <button className="btn btn-primary" onClick={resume}>
                <RotateCcw size={16} aria-hidden />
                Resume remaining {rec.totalRuns - completedIds.size} run{rec.totalRuns - completedIds.size === 1 ? '' : 's'}
              </button>
            </>
          )}
        </section>
      )}

      {rec.status === 'draft' && !running ? (
        <ExperimentDesigner def={rec.definition} onChange={onChange} onRun={() => void run()} />
      ) : (
        <ExperimentResults
          def={rec.definition}
          runs={runs}
          status={rec.status}
          conclusion={rec.conclusion}
          runtime={rec.runtime}
          onConclusion={(conclusion) => {
            setRec({ ...rec, conclusion });
            void updateExperiment(id, { conclusion }).then(() => toast('success', 'Interpretation saved.'));
          }}
        />
      )}
    </div>
  );
}
