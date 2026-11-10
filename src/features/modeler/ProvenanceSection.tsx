// Revisions, branching and result provenance (PLAN.md §3.4, §8.2). Every semantic change is a new
// revision with a parent link; experiments point at the exact revision and hash they froze.
import { useEffect, useState } from 'react';
import { GitBranch } from 'lucide-react';
import { branchFromRevision, listRevisions, projectExperiments, type ExperimentRecord, type RevisionRecord } from '../../storage/db';
import { navigate } from '../../app/router';
import { Badge } from '../../components/ui';

export function ProvenanceSection({ projectId, activeRevisionId }: { projectId: string; activeRevisionId: string }) {
  const [revs, setRevs] = useState<RevisionRecord[]>([]);
  const [exps, setExps] = useState<ExperimentRecord[]>([]);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    void listRevisions(projectId)
      .then(setRevs)
      .catch(() => {});
    void projectExperiments(projectId)
      .then(setExps)
      .catch(() => {});
  }, [open, projectId, activeRevisionId]);
  return (
    <section className="ws-section" aria-labelledby="prov-h">
      <h4 id="prov-h">
        <button className="btn btn-sm btn-ghost" aria-expanded={open} onClick={() => setOpen(!open)} style={{ padding: 0 }}>
          {open ? '▾' : '▸'} Revisions and experiments
        </button>
      </h4>
      {open && (
        <>
          <p className="hint" style={{ margin: '0 0 6px' }}>
            A new revision is saved whenever the rule, lattice, boundary or generation-0 cells change. Branching copies a revision into a new project; nothing
            here is ever overwritten.
          </p>
          <ol className="prov-list">
            {revs.slice(0, 30).map((r) => (
              <li key={r.id}>
                <div>
                  <span className="tabular">{new Date(r.createdAt).toLocaleString()}</span> {r.id === activeRevisionId && <Badge tone="primary">current</Badge>}
                </div>
                <div className="hint">
                  {r.reason} · hash <code>{r.hash.slice(0, 10)}</code>
                </div>
                <button className="btn btn-sm btn-ghost" onClick={async () => navigate(`/project/${await branchFromRevision(r.id)}`)}>
                  <GitBranch size={13} aria-hidden />
                  Branch
                </button>
              </li>
            ))}
          </ol>
          {revs.length > 30 && <p className="hint">Showing the latest 30 of {revs.length} revisions.</p>}
          <h5 style={{ margin: '10px 0 4px' }}>Experiments on this model</h5>
          {exps.length === 0 ? (
            <p className="hint" style={{ margin: 0 }}>
              None yet.
            </p>
          ) : (
            <ul className="prov-list">
              {exps.map((e) => (
                <li key={e.id}>
                  <a href={`#/experiment/${e.id}`}>{e.name}</a> <Badge tone={e.status === 'completed' ? 'success' : undefined}>{e.status}</Badge>
                  <div className="hint">
                    revision <code>{e.definition.baseRevisionId.slice(4, 14)}</code>
                    {e.definition.baseRevisionId === activeRevisionId ? ' (current)' : ' (earlier revision)'} · {e.completedRuns}/{e.totalRuns} runs
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
