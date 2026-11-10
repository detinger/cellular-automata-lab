// Learning overview (PLAN.md §3.2 levels, §3.7 challenges) with local progress.
import { useEffect, useState } from 'react';
import { GraduationCap } from 'lucide-react';
import { LESSONS } from '../../data/learning/lessons';
import { CHALLENGES } from '../../data/learning/challenges';
import { db, type ProgressRecord } from '../../storage/db';
import { Badge } from '../../components/ui';

const LEVELS = ['Foundations', 'Neighborhoods and boundaries', 'Deterministic dynamics', 'Modeling choices', 'Stochastic systems', 'Experimentation'];

export function LearnPage() {
  const [progress, setProgress] = useState<Record<string, ProgressRecord>>({});
  useEffect(() => {
    void db.progress
      .toArray()
      .then((ps) => setProgress(Object.fromEntries(ps.map((p) => [p.id, p]))))
      .catch(() => {});
  }, []);
  const done = (id: string) => progress[id]?.completed;
  const lessonsDone = LESSONS.filter((l) => done(l.id)).length,
    challengesDone = CHALLENGES.filter((c) => done(c.id)).length;
  return (
    <div className="page">
      <header className="page-header">
        <div>
          <div className="eyebrow">Learn</div>
          <h1>Lessons and challenges</h1>
          <p>
            {lessonsDone} of {LESSONS.length} lessons and {challengesDone} of {CHALLENGES.length} challenges completed in this browser. Progress is formative
            feedback stored locally, not an exam record.
          </p>
        </div>
      </header>
      {LEVELS.map((name, i) => {
        const lv = (i + 1) as 1 | 2 | 3 | 4 | 5 | 6;
        const ls = LESSONS.filter((l) => l.level === lv),
          cs = CHALLENGES.filter((c) => c.level === lv);
        return (
          <section key={name} style={{ marginBottom: 24 }} aria-labelledby={`lv-${lv}`}>
            <h2 id={`lv-${lv}`}>
              Level {lv}: {name}
            </h2>
            <div className="card-grid">
              {ls.map((l) => (
                <a key={l.id} className="card card-link learn-card" href={`#/lesson/${l.id}`}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <span className="eyebrow">Lesson</span>
                    {done(l.id) && <Badge tone="success">Done</Badge>}
                  </div>
                  <h3 style={{ margin: '4px 0' }}>{l.title}</h3>
                  <p className="hint" style={{ margin: 0 }}>
                    {l.objective}
                  </p>
                </a>
              ))}
              {cs.map((c) => (
                <a key={c.id} className="card card-link learn-card" href={`#/challenge/${c.id}`}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <span className="eyebrow" style={{ color: 'var(--accent)' }}>
                      <GraduationCap size={12} aria-hidden /> Challenge {c.id}
                    </span>
                    {done(c.id) && <Badge tone="success">Passed</Badge>}
                  </div>
                  <h3 style={{ margin: '4px 0' }}>{c.title}</h3>
                  <p className="hint" style={{ margin: 0 }}>
                    {c.task.length > 150 ? `${c.task.slice(0, 147)}…` : c.task}
                  </p>
                </a>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
