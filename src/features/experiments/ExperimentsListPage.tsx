import { useEffect, useState } from 'react';
import { FlaskConical } from 'lucide-react';
import { db, type ExperimentRecord } from '../../storage/db';
import { Badge, EmptyState } from '../../components/ui';

export function ExperimentsListPage() {
  const [list, setList] = useState<ExperimentRecord[] | null>(null);
  const [projects, setProjects] = useState<Record<string, string>>({});
  useEffect(() => {
    void (async () => {
      setList(await db.experiments.orderBy('updatedAt').reverse().toArray());
      setProjects(Object.fromEntries((await db.projects.toArray()).map((p) => [p.id, p.name])));
    })().catch(() => setList([]));
  }, []);
  return (
    <div className="page">
      <header className="page-header">
        <div>
          <div className="eyebrow">Investigate</div>
          <h1>Experiments</h1>
          <p>
            Replications and parameter sweeps on a frozen model revision. Start one from a model with the <strong>Experiment</strong> button in its toolbar.
          </p>
        </div>
      </header>
      {list === null ? (
        <p className="hint">Loading…</p>
      ) : list.length === 0 ? (
        <div className="card">
          <EmptyState icon={<FlaskConical size={28} aria-hidden />} title="No experiments yet">
            <p className="hint">Open a model and choose Experiment in the toolbar.</p>
          </EmptyState>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Name</th>
                <th>Model</th>
                <th>Status</th>
                <th className="num">Runs</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {list.map((e) => (
                <tr key={e.id}>
                  <td>
                    <a href={`#/experiment/${e.id}`}>{e.name}</a>
                  </td>
                  <td>{projects[e.projectId] ?? <span className="hint">deleted model</span>}</td>
                  <td>
                    <Badge tone={e.status === 'completed' ? 'success' : e.status === 'running' ? 'accent' : e.status === 'draft' ? undefined : 'warning'}>
                      {e.status}
                    </Badge>
                  </td>
                  <td className="num">
                    {e.completedRuns}/{e.totalRuns}
                  </td>
                  <td className="tabular">{new Date(e.updatedAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
