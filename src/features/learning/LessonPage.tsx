// A lesson (PLAN.md §3.2): objective, explanation, runnable example, prediction, typical mistake,
// exercise, knowledge check and reflection. Completion needs the prediction, a correct check and a
// written reflection — time spent or clicks alone never count as mastery.
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, ExternalLink, TriangleAlert } from 'lucide-react';
import { LESSONS, lessonById } from '../../data/learning/lessons';
import type { ChoiceQuestion } from '../../domain/learning/types';
import { createProject, getProgress, saveProgress, type ProgressRecord } from '../../storage/db';
import { navigate } from '../../app/router';
import { Badge, Callout, useToast } from '../../components/ui';
import { LessonDemo } from './LessonDemo';

function Question({ q, chosen, onAnswer, name }: { q: ChoiceQuestion; chosen: number | null; onAnswer(i: number): void; name: string }) {
  const answered = chosen !== null;
  return (
    <fieldset className="question">
      <legend>{q.question}</legend>
      {q.options.map((o, i) => (
        <label key={i} className="option" data-state={answered && i === q.answer ? 'right' : answered && i === chosen ? 'wrong' : undefined}>
          <input type="radio" name={name} checked={chosen === i} onChange={() => onAnswer(i)} />
          {o}
        </label>
      ))}
      {answered && (
        <p className={`feedback ${chosen === q.answer ? 'ok' : 'no'}`} role="status">
          {chosen === q.answer ? 'Correct. ' : 'Not quite. '}
          {q.explanation}
        </p>
      )}
    </fieldset>
  );
}

export function LessonPage({ id }: { id: string }) {
  const lesson = lessonById(id);
  const toast = useToast();
  const [progress, setProgress] = useState<ProgressRecord | null>(null);
  const [prediction, setPrediction] = useState<number | null>(null);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [reflection, setReflection] = useState('');
  const model = useMemo(() => lesson?.demo.build(), [lesson]);

  useEffect(() => {
    if (!lesson) return;
    void getProgress(lesson.id).then((p) => {
      const base: ProgressRecord = p ?? {
        id: lesson.id,
        kind: 'lesson',
        version: lesson.version,
        completed: false,
        activities: [],
        attempts: 0,
        notes: {},
        updatedAt: '',
      };
      setProgress(base);
      if (base.notes?.prediction !== undefined) setPrediction(Number(base.notes.prediction));
      setReflection(base.notes?.reflection ?? '');
    });
  }, [lesson]);

  if (!lesson || !model)
    return (
      <div className="page">
        <Callout kind="error" title="Lesson not found">
          <p>
            <a href="#/learn">All lessons</a>
          </p>
        </Callout>
      </div>
    );
  const idx = LESSONS.indexOf(lesson);
  const prev = LESSONS[idx - 1],
    next = LESSONS[idx + 1];

  const update = (patch: Partial<ProgressRecord>, activity?: string) => {
    if (!progress) return;
    const activities = activity && !progress.activities.includes(activity) ? [...progress.activities, activity] : progress.activities;
    const merged: ProgressRecord = { ...progress, ...patch, activities, notes: { ...progress.notes, ...patch.notes } };
    const checksDone = lesson.check.every((q) => merged.activities.includes(`check:${q.id}`));
    merged.completed = merged.activities.includes('prediction') && checksDone && (merged.notes?.reflection ?? '').trim().length >= 10;
    if (merged.completed && !progress.completed) toast('success', `Lesson complete: ${lesson.title}`);
    setProgress(merged);
    void saveProgress(merged).catch(() => toast('error', 'Progress could not be saved in this browser.'));
  };

  const answerCheck = (q: ChoiceQuestion, i: number) => {
    setAnswers((a) => ({ ...a, [q.id]: i }));
    update({ attempts: (progress?.attempts ?? 0) + 1 }, i === q.answer ? `check:${q.id}` : undefined);
  };

  const openInWorkspace = async () => {
    const pid = await createProject({ ...lesson.demo.build(), name: `${lesson.title} — example` }, `lesson:${lesson.id}`, 'created', lesson.demo.seed);
    navigate(`/project/${pid}`);
  };

  return (
    <div className="page lesson">
      <header className="page-header">
        <div>
          <div className="eyebrow">
            <a href="#/learn">Learn</a> · Level {lesson.level} · Lesson {idx + 1} of {LESSONS.length}
          </div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {lesson.title}
            {progress?.completed && <Badge tone="success">Completed</Badge>}
          </h1>
          <p>
            <strong>Objective.</strong> {lesson.objective}
          </p>
        </div>
      </header>

      <section className="lesson-section">
        <h2>Explanation</h2>
        {lesson.explanation.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </section>

      <section className="lesson-section card">
        <h2>Predict first</h2>
        <Question
          q={lesson.prediction}
          name="prediction"
          chosen={prediction}
          onAnswer={(i) => {
            setPrediction(i);
            update({ notes: { prediction: String(i) } }, 'prediction');
          }}
        />
      </section>

      <section className="lesson-section card">
        <div className="card-title">
          <h2 style={{ margin: 0 }}>Try it</h2>
          <button className="btn btn-sm" onClick={() => void openInWorkspace()}>
            <ExternalLink size={14} aria-hidden />
            Open in workspace
          </button>
        </div>
        <p className="hint" style={{ marginTop: 0 }}>
          {lesson.demo.caption}
        </p>
        <LessonDemo
          model={model}
          seed={lesson.demo.seed}
          locked={prediction === null}
          lockedReason="Make your prediction above first, then step the example to check it."
        />
      </section>

      <section className="lesson-section">
        <div className="callout callout-warning">
          <TriangleAlert aria-hidden />
          <div>
            <p>
              <strong>Typical mistake: {lesson.mistake.title}.</strong>
            </p>
            <p>{lesson.mistake.text}</p>
          </div>
        </div>
      </section>

      <section className="lesson-section">
        <h2>Exercise</h2>
        <p>{lesson.exercise.text}</p>
        {lesson.exercise.challengeId && (
          <a className="btn btn-sm" href={`#/challenge/${lesson.exercise.challengeId}`}>
            Go to challenge {lesson.exercise.challengeId}
            <ArrowRight size={14} aria-hidden />
          </a>
        )}
      </section>

      <section className="lesson-section card">
        <h2>Knowledge check</h2>
        {lesson.check.map((q) => (
          <Question
            key={q.id}
            q={q}
            name={`check-${q.id}`}
            chosen={answers[q.id] ?? (progress?.activities.includes(`check:${q.id}`) ? q.answer : null)}
            onAnswer={(i) => answerCheck(q, i)}
          />
        ))}
      </section>

      <section className="lesson-section card">
        <h2>
          <label htmlFor="reflection">Reflection</label>
        </h2>
        <p style={{ marginTop: 0 }}>{lesson.reflection}</p>
        <textarea
          id="reflection"
          className="input textarea"
          rows={4}
          value={reflection}
          onChange={(e) => setReflection(e.target.value)}
          onBlur={() => update({ notes: { reflection } }, reflection.trim().length >= 10 ? 'reflection' : undefined)}
        />
        <p className="hint">Saved in this browser when you leave the field. There is no automatic grading of written answers.</p>
      </section>

      <section className="lesson-section">
        {progress?.completed ? (
          <Callout kind="success" title="Lesson complete">
            <p>Prediction made, knowledge check answered correctly and reflection written.</p>
          </Callout>
        ) : (
          <p className="hint">
            <CheckCircle2 size={14} aria-hidden style={{ verticalAlign: -2 }} /> To complete this lesson: make a prediction, answer every check question
            correctly and write a reflection (at least a sentence).
          </p>
        )}
        <nav className="lesson-nav" aria-label="Lessons">
          {prev ? (
            <a className="btn" href={`#/lesson/${prev.id}`}>
              <ArrowLeft size={16} aria-hidden />
              {prev.title}
            </a>
          ) : (
            <span />
          )}
          {next && (
            <a className="btn" href={`#/lesson/${next.id}`}>
              {next.title}
              <ArrowRight size={16} aria-hidden />
            </a>
          )}
        </nav>
      </section>
    </div>
  );
}
