// A guided challenge: task, the student's project, questions, explainable predicate
// results, progressive hints, and a reflection with its rubric. Results are formative and local.
import { useEffect, useState } from 'react';
import { ArrowRight, Check, Lightbulb, Play, X } from 'lucide-react';
import { challengeById } from '../../data/learning/challenges';
import { evaluateChallenge } from '../../data/learning/challenges';
import { lessonById } from '../../data/learning/lessons';
import { addAssessment, createProject, db, getProgress, latestAssessment, loadProject, loadRuns, saveProgress, type ProjectRecord } from '../../storage/db';
import { modelHash } from '../../domain/model/hash';
import { Badge, Callout, downloadText, useToast } from '../../components/ui';
import { investigationTemplate } from '../../data/learning/templates';
import { navigate } from '../../app/router';

type Results = ReturnType<typeof evaluateChallenge>['results'];

export function ChallengePage({ id }: { id: string }) {
  const ch = challengeById(id);
  const toast = useToast();
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [projectId, setProjectId] = useState('');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [results, setResults] = useState<Results | null>(null);
  const [hints, setHints] = useState(0);
  const [reflection, setReflection] = useState('');
  const [rubric, setRubric] = useState<boolean[]>([]);
  const [completed, setCompleted] = useState(false);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (!ch) return;
    void (async () => {
      const all = await db.projects.orderBy('updatedAt').reverse().toArray();
      const mine = all.filter((p) => p.origin === `challenge:${ch.id}`);
      const list = ch.start ? mine : all;
      setProjects(list);
      setProjectId((cur) => cur || list[0]?.id || '');
      const prog = await getProgress(ch.id);
      setCompleted(!!prog?.completed);
      setHints(Number(prog?.notes?.hints ?? 0));
      setReflection(prog?.notes?.reflection ?? '');
      setRubric(JSON.parse(prog?.notes?.rubric ?? '[]'));
      const last = await latestAssessment(ch.id);
      if (last) setResults(last.results.map((r) => ({ ...r, description: ch.predicates.find((p) => p.id === r.id)?.description ?? r.id })));
    })();
  }, [ch]);

  if (!ch)
    return (
      <div className="page">
        <Callout kind="error" title="Challenge not found">
          <p>
            <a href="#/learn">All challenges</a>
          </p>
        </Callout>
      </div>
    );

  const persist = (patch: { completed?: boolean; notes?: Record<string, string> }) =>
    void getProgress(ch.id)
      .then((p) =>
        saveProgress({
          id: ch.id,
          kind: 'challenge',
          version: ch.version,
          completed: patch.completed ?? p?.completed ?? false,
          activities: p?.activities ?? [],
          attempts: p?.attempts ?? 0,
          notes: { ...p?.notes, ...patch.notes },
        }),
      )
      .catch(() => {});

  const start = async () => {
    const pid = await createProject({ ...ch.start!(), name: `${ch.id} ${ch.title}` }, `challenge:${ch.id}`, 'created', ch.startSeed);
    navigate(`/project/${pid}`);
  };

  const check = async () => {
    if (!projectId) return;
    setChecking(true);
    try {
      const loaded = await loadProject(projectId);
      if (!loaded) throw new Error('The project was not found.');
      const exps = await db.experiments.where('projectId').equals(projectId).toArray();
      const experiments = await Promise.all(
        exps.map(async (e) => ({ definition: e.definition, status: e.status, conclusion: e.conclusion, runs: await loadRuns(e.id) })),
      );
      const r = evaluateChallenge(ch, { model: loaded.model, seed: loaded.project.seed ?? '1', experiments, answers });
      setResults(r.results);
      const p = await getProgress(ch.id);
      await saveProgress({
        id: ch.id,
        kind: 'challenge',
        version: ch.version,
        completed: (p?.completed ?? false) || r.passed,
        activities: p?.activities ?? [],
        attempts: (p?.attempts ?? 0) + 1,
        notes: p?.notes ?? {},
      });
      await addAssessment({
        challengeId: ch.id,
        challengeVersion: ch.version,
        projectId,
        modelHash: await modelHash(loaded.model),
        results: r.results.map(({ id: rid, passed, observed, expected, explanation }) => ({ id: rid, passed, observed, expected, explanation })),
        passed: r.passed,
        hintsShown: hints,
        reflection,
      });
      if (r.passed) {
        setCompleted(true);
        toast('success', `${ch.id} passed.`);
      }
    } catch (e) {
      toast('error', `Could not check: ${(e as Error).message}`);
    } finally {
      setChecking(false);
    }
  };

  const lesson = ch.lessonId ? lessonById(ch.lessonId) : undefined;
  return (
    <div className="page lesson">
      <header className="page-header">
        <div>
          <div className="eyebrow">
            <a href="#/learn">Learn</a> · Challenge {ch.id} · Level {ch.level}
          </div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {ch.title}
            {completed && <Badge tone="success">Passed</Badge>}
          </h1>
          <p>{ch.task}</p>
          {lesson && (
            <p className="hint">
              Related lesson: <a href={`#/lesson/${lesson.id}`}>{lesson.title}</a>
            </p>
          )}
          {ch.id === 'CA-10' && (
            <p>
              <button className="btn btn-sm" onClick={() => downloadText('investigation-template.md', investigationTemplate(), 'text/markdown')}>
                Download the investigation template
              </button>
            </p>
          )}
        </div>
      </header>

      <section className="lesson-section card">
        <h2>Your model</h2>
        {ch.start && (
          <p style={{ marginTop: 0 }}>
            <button className="btn btn-primary" onClick={() => void start()}>
              <Play size={16} aria-hidden />
              Start a new attempt
            </button>{' '}
            <span className="hint">Creates a project from the challenge’s starting model and opens it.</span>
          </p>
        )}
        {projects.length ? (
          <div className="field" style={{ maxWidth: 420 }}>
            <label className="label" htmlFor="ch-project">
              Project to check
            </label>
            <select id="ch-project" className="select" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — saved {new Date(p.updatedAt).toLocaleString()}
                </option>
              ))}
            </select>
            {projectId && (
              <a className="hint" href={`#/project/${projectId}`}>
                Open this project <ArrowRight size={12} aria-hidden style={{ verticalAlign: -1 }} />
              </a>
            )}
          </div>
        ) : (
          <p className="hint">{ch.start ? 'No attempt yet.' : 'Create or open a model first.'}</p>
        )}
      </section>

      {ch.questions.length > 0 && (
        <section className="lesson-section card">
          <h2>Questions</h2>
          {ch.questions.map((q) => (
            <div key={q.id} className="field" style={{ maxWidth: 420, marginBottom: 8 }}>
              <label className="label" htmlFor={`q-${q.id}`}>
                {q.prompt}
              </label>
              <input
                id={`q-${q.id}`}
                className="input"
                inputMode={q.kind === 'number' ? 'decimal' : undefined}
                value={answers[q.id] ?? ''}
                onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
              />
            </div>
          ))}
        </section>
      )}

      <section className="lesson-section card">
        <div className="card-title">
          <h2 style={{ margin: 0 }}>Check</h2>
          <button className="btn btn-primary" disabled={!projectId || checking} onClick={() => void check()}>
            {checking ? 'Checking…' : 'Check my work'}
          </button>
        </div>
        <p className="hint" style={{ marginTop: 0 }}>
          Checks run the same engine as the workspace on the project’s saved generation 0 and its experiments. Save your project first.
        </p>
        {results && (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Requirement</th>
                  <th>Result</th>
                  <th>Observed</th>
                  <th>Expected</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <tr key={r.id}>
                    <td>
                      {r.description}
                      {r.explanation && <div className="hint">{r.explanation}</div>}
                    </td>
                    <td>
                      {r.passed ? (
                        <span className="pass">
                          <Check size={14} aria-hidden /> Passed
                        </span>
                      ) : (
                        <span className="fail">
                          <X size={14} aria-hidden /> Not yet
                        </span>
                      )}
                    </td>
                    <td>{r.observed}</td>
                    <td>{r.expected}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="lesson-section card">
        <h2>Hints</h2>
        {ch.hints.slice(0, hints).map((h, i) => (
          <p key={i}>
            <Lightbulb size={14} aria-hidden style={{ verticalAlign: -2, color: 'var(--accent)' }} /> Hint {i + 1}: {h}
          </p>
        ))}
        {hints < ch.hints.length ? (
          <button
            className="btn btn-sm"
            onClick={() => {
              setHints(hints + 1);
              persist({ notes: { hints: String(hints + 1) } });
            }}
          >
            Show hint {hints + 1} of {ch.hints.length}
          </button>
        ) : (
          <p className="hint">No more hints.</p>
        )}
      </section>

      <section className="lesson-section card">
        <h2>
          <label htmlFor="ch-reflection">Reflection</label>
        </h2>
        <p style={{ marginTop: 0 }}>{ch.reflection.prompt}</p>
        <textarea
          id="ch-reflection"
          className="input textarea"
          rows={4}
          value={reflection}
          onChange={(e) => setReflection(e.target.value)}
          onBlur={() => persist({ notes: { reflection } })}
        />
        <h3 style={{ marginBottom: 4 }}>Rubric</h3>
        <p className="hint" style={{ marginTop: 0 }}>
          Check what your reflection does. Your instructor reviews written reasoning; it is not graded automatically.
        </p>
        {ch.reflection.rubric.map((r, i) => (
          <label key={i} className="option">
            <input
              type="checkbox"
              checked={!!rubric[i]}
              onChange={(e) => {
                const n = [...rubric];
                n[i] = e.target.checked;
                setRubric(n);
                persist({ notes: { rubric: JSON.stringify(n) } });
              }}
            />
            {r}
          </label>
        ))}
      </section>
    </div>
  );
}
