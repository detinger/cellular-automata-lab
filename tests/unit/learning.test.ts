// Lesson claims are verified against the engine; challenges accept valid solutions and reject wrong ones.
import { describe, expect, it } from 'vitest';
import { LESSONS, lessonById } from '../../src/data/learning/lessons';
import { CA01_NEXT, CA01_START, CA09_BROKEN, CHALLENGES, challengeById, evaluateChallenge } from '../../src/data/learning/challenges';
import { createEngine } from '../../src/domain/engine/engine';
import { validateModel } from '../../src/domain/model/validate';
import { sessionSeed } from '../../src/domain/random/prng';
import { lifeModel, presetById } from '../../src/data/presets';
import type { ChallengeContext } from '../../src/domain/learning/types';
import type { Model } from '../../src/domain/contracts/model';
import { planRuns, type ExperimentDefinition } from '../../src/domain/experiments/experiment';
import { executeRun } from '../../src/domain/experiments/execute';
import { draftExperiment } from '../../src/features/experiments/drafts';

const engine = (id: string) => {
  const l = lessonById(id)!;
  const m = l.demo.build();
  return { m, e: createEngine(m, { transitionSeed: sessionSeed(l.demo.seed ?? '1', 'transition') }) };
};
const ctx = (model: Model, over: Partial<ChallengeContext> = {}): ChallengeContext => ({ model, seed: '1', experiments: [], answers: {}, ...over });

describe('lesson inventory (PLAN.md §3.2)', () => {
  it('has twelve lessons over six levels, each with all eight parts', () => {
    expect(LESSONS).toHaveLength(12);
    expect(new Set(LESSONS.map((l) => l.level))).toEqual(new Set([1, 2, 3, 4, 5, 6]));
    expect(LESSONS.filter((l) => l.level <= 3).length).toBeGreaterThanOrEqual(6); // P0: six lessons on levels 1–3
    for (const l of LESSONS) {
      expect(
        l.objective &&
          l.explanation.length &&
          l.demo.caption &&
          l.prediction.options.length &&
          l.mistake.text &&
          l.exercise.text &&
          l.check.length &&
          l.reflection,
      ).toBeTruthy();
      for (const q of [l.prediction, ...l.check]) expect(q.answer).toBeLessThan(q.options.length);
      expect(validateModel(l.demo.build()).filter((i) => i.severity === 'error')).toEqual([]);
      if (l.exercise.challengeId) expect(challengeById(l.exercise.challengeId)).toBeDefined();
    }
  });
  it('validator lesson links point at real lessons', () => {
    for (const id of ['L08-stochastic-sir', 'L09-count-rules', 'L12-experiments']) expect(lessonById(id)).toBeDefined();
  });
});

describe('lesson claims', () => {
  it('L01: the blinker has 3 live cells in generation 1 and returns at generation 2', () => {
    const { m, e } = engine('L01-cells-states');
    e.step();
    expect(e.metrics.counts[1]).toBe(3);
    e.step();
    expect(e.cells).toEqual(m.initial);
  });
  it('L02: cell (2,1) is born', () => {
    const { m, e } = engine('L02-local-rules');
    e.step();
    expect(e.cells[1 * m.width + 2]).toBe(1);
  });
  it('L03: von Neumann spread forms a 25-cell diamond after 3 generations; Moore would give 49', () => {
    const { m, e } = engine('L03-neighborhoods');
    e.step(3);
    for (let i = 0; i < e.cells.length; i++) {
      const dx = Math.abs((i % 31) - 15),
        dy = Math.abs(Math.floor(i / 31) - 15);
      expect(e.cells[i]).toBe(dx + dy <= 3 ? 1 : 0);
    }
    const moore = createEngine({ ...m, rule: { id: 'spatial-sir/v1', beta: 1, gamma: 0, neighborhood: 'moore-r1' } }, { transitionSeed: 'x' });
    moore.step(3);
    expect(moore.metrics.counts[1]).toBe(49);
  });
  it('L04: the glider is back at its start after 128 generations; at a dead-exterior corner it becomes a block', () => {
    const { m, e } = engine('L04-boundaries');
    e.step(128);
    expect(e.cells).toEqual(m.initial);
    const c = createEngine(
      lifeModel('c', 12, 12, [
        [5, 4],
        [6, 5],
        [4, 6],
        [5, 6],
        [6, 6],
      ]),
    );
    c.step(40);
    expect([...c.cells.keys()].filter((i) => c.cells[i]).map((i) => [i % 12, Math.floor(i / 12)])).toEqual([
      [10, 10],
      [11, 10],
      [10, 11],
      [11, 11],
    ]);
  });
  it('L05: population stays 12 for 100 generations while cells keep changing; block and blinker are untouched', () => {
    const { m, e } = engine('L05-patterns');
    for (let g = 1; g <= 100; g++) {
      e.step();
      expect(e.metrics.counts[1]).toBe(12);
      expect(e.metrics.changed).toBeGreaterThan(0);
      for (const [x, y] of [
        [2, 18],
        [3, 18],
        [2, 19],
        [3, 19],
      ])
        expect(e.cells[y * m.width + x]).toBe(1);
      expect(e.cells[4 * m.width + 18]).toBe(1); // blinker center never changes
    }
  });
  it('L06: Rule 90 row 4 has 2 live cells; Rule 30 maps 100 to 1', () => {
    const { e } = engine('L06-elementary');
    e.step(4);
    expect(e.metrics.counts[1]).toBe(2);
    expect((30 >>> 4) & 1).toBe(1);
  });
  it('L07: at 40% density every car moves once jams dissolve (flow = 0.4)', () => {
    const { e } = engine('L07-traffic');
    e.step(400);
    expect(e.metrics.flow).toBeCloseTo(0.4, 12);
    e.step();
    expect(e.metrics.flow).toBeCloseTo(0.4, 12);
  });
  it('L08: seed 1 reaches 2,215 cells; seed 11 ends after one generation', () => {
    const { e } = engine('L08-stochastic-sir');
    e.step(400);
    expect(e.metrics.counts[2]).toBe(2215);
    const m = lessonById('L08-stochastic-sir')!.demo.build();
    const e11 = createEngine(m, { transitionSeed: sessionSeed('11', 'transition') });
    e11.step();
    expect(e11.metrics.counts[1]).toBe(0);
    expect(1 - (1 - 0.5) ** 2).toBe(0.75);
  });
  it('L09: a No cell with exactly 4 Yes neighbors stays No', () => {
    const m = presetById('majority-vote')!.build();
    const g = lifeModel('x', 5, 5, [
      [1, 1],
      [2, 1],
      [3, 1],
      [1, 2],
    ]);
    const e = createEngine({ ...m, width: 5, height: 5, initial: g.initial, boundary: { kind: 'fixed-exterior', state: 0 } });
    e.step();
    expect(e.cells[2 * 5 + 2]).toBe(0);
  });
  it('L10: the front moves one column per generation', () => {
    const { m, e } = engine('L10-forest-fire');
    e.step(5);
    for (let y = 0; y < m.height; y++) expect(e.cells[y * m.width + 5]).toBe(2);
  });
  it('L11: the Brian’s Brain structure moves up', () => {
    const { m, e } = engine('L11-excitable-cyclic');
    e.step();
    expect(e.cells[19 * m.width + 15]).toBe(1);
    expect(e.cells[20 * m.width + 15]).toBe(2);
  });
});

describe('challenges (PLAN.md §3.7)', () => {
  it('there are ten challenges CA-01 … CA-10 with hints and rubrics', () => {
    expect(CHALLENGES.map((c) => c.id)).toEqual(Array.from({ length: 10 }, (_, i) => `CA-${String(i + 1).padStart(2, '0')}`));
    for (const c of CHALLENGES) {
      expect(c.hints.length).toBeGreaterThan(0);
      expect(c.reflection.rubric.length).toBeGreaterThan(0);
    }
  });
  it('CA-01: the hand-calculated fixture equals the engine’s next generation', () => {
    const e = createEngine(lifeModel('t', 7, 7, CA01_START));
    e.step();
    expect(e.cells).toEqual(lifeModel('n', 7, 7, CA01_NEXT).initial);
    const ch = challengeById('CA-01')!;
    expect(evaluateChallenge(ch, ctx(ch.start!())).passed).toBe(false);
    expect(evaluateChallenge(ch, ctx(lifeModel('n', 7, 7, CA01_NEXT))).passed).toBe(true);
  });
  it('CA-02/03 accept any valid pattern and reject empty or wrong ones', () => {
    const c2 = challengeById('CA-02')!,
      c3 = challengeById('CA-03')!;
    const beehive = lifeModel('b', 16, 16, [
      [5, 4],
      [6, 4],
      [4, 5],
      [7, 5],
      [5, 6],
      [6, 6],
    ]);
    expect(evaluateChallenge(c2, ctx(beehive)).passed).toBe(true);
    expect(evaluateChallenge(c2, ctx(lifeModel('e', 16, 16, []))).passed).toBe(false);
    expect(evaluateChallenge(c2, ctx(presetById('blinker')!.build())).passed).toBe(false);
    expect(evaluateChallenge(c3, ctx(presetById('toad')!.build())).passed).toBe(true);
    expect(evaluateChallenge(c3, ctx(beehive)).passed).toBe(false); // still life: S0 = S2 but S0 = S1
  });
  it('CA-04 needs the right answer and a periodic boundary with the original glider', () => {
    const ch = challengeById('CA-04')!;
    const m = ch.start!();
    expect(evaluateChallenge(ch, ctx({ ...m, boundary: { kind: 'periodic' } }, { answers: { dead40: '4' } })).passed).toBe(true);
    expect(evaluateChallenge(ch, ctx(m, { answers: { dead40: '4' } })).passed).toBe(false);
    expect(evaluateChallenge(ch, ctx({ ...m, boundary: { kind: 'periodic' } }, { answers: { dead40: '5' } })).passed).toBe(false);
  });
  it('CA-05 accepts exactly Rule 90 and names the wrong patterns', () => {
    const ch = challengeById('CA-05')!,
      m = ch.start!();
    expect(evaluateChallenge(ch, ctx({ ...m, rule: { id: 'elementary/v1', ruleNumber: 90 } })).passed).toBe(true);
    const r = evaluateChallenge(ch, ctx({ ...m, rule: { id: 'elementary/v1', ruleNumber: 30 } }));
    expect(r.passed).toBe(false);
    expect(r.results.find((x) => x.id === 'bits')!.observed).toMatch(/wrong for/);
  });
  it('CA-06 requires the exact spec, seed and reproduced count', () => {
    const ch = challengeById('CA-06')!;
    const m = ch.start!();
    const fixed: Model = { ...m, rule: { id: 'spatial-sir/v1', beta: 0.3, gamma: 0.1, neighborhood: 'moore-r1' } };
    const e = createEngine(fixed, { transitionSeed: sessionSeed('lab-7', 'transition') });
    e.step(40);
    expect(evaluateChallenge(ch, ctx(fixed, { seed: 'lab-7', answers: { r40: String(e.metrics.counts[2]) } })).passed).toBe(true);
    expect(evaluateChallenge(ch, ctx(fixed, { seed: '1', answers: { r40: String(e.metrics.counts[2]) } })).passed).toBe(false);
    expect(evaluateChallenge(ch, ctx(m, { seed: 'lab-7', answers: { r40: String(e.metrics.counts[2]) } })).passed).toBe(false);
  });
  it('CA-07 passes with the default traffic experiment draft and a correct answer', () => {
    const ch = challengeById('CA-07')!;
    const m = ch.start!();
    const def: ExperimentDefinition = draftExperiment(m, 'p', 'r', 'h');
    const runs = planRuns(def).map((s) => executeRun(def, s));
    const ex = [{ definition: def, status: 'completed', conclusion: '', runs }];
    expect(evaluateChallenge(ch, ctx(m, { experiments: ex, answers: { peak: '0.5' } })).passed).toBe(true);
    expect(evaluateChallenge(ch, ctx(m, { experiments: ex, answers: { peak: '0.9' } })).passed).toBe(false);
    expect(evaluateChallenge(ch, ctx(m, { answers: { peak: '0.5' } })).passed).toBe(false);
  });
  it('CA-08 needs one factor, ≥ 10 replicates, all runs and written reasoning', () => {
    const ch = challengeById('CA-08')!;
    const m = presetById('sir-outbreak')!.build();
    const small = { ...m, width: 16, height: 16, initial: new Uint8Array(256) };
    small.initial[8 * 16 + 8] = 1;
    const def: ExperimentDefinition = { ...draftExperiment(small, 'p', 'r', 'h'), replicates: 10, horizon: 30, hypothesis: 'Higher β spreads further.' };
    const runs = planRuns(def).map((s) => executeRun(def, s));
    const words = Array.from({ length: 45 }, (_, i) => `word${i}`).join(' ');
    expect(evaluateChallenge(ch, ctx(m, { experiments: [{ definition: def, status: 'completed', conclusion: words, runs }] })).passed).toBe(true);
    expect(evaluateChallenge(ch, ctx(m, { experiments: [{ definition: def, status: 'completed', conclusion: 'short', runs }] })).passed).toBe(false);
    expect(
      evaluateChallenge(ch, ctx(m, { experiments: [{ definition: { ...def, replicates: 3 }, status: 'completed', conclusion: words, runs }] })).passed,
    ).toBe(false);
  });
  it('CA-09: the broken table is rejected for overlap and an unreachable clause; the repair passes', () => {
    const ch = challengeById('CA-09')!;
    const m = ch.start!();
    const codes = validateModel(m).map((i) => i.code);
    expect(codes).toContain('RULE_TABLE_OVERLAP');
    expect(codes).toContain('RULE_TABLE_UNREACHABLE');
    expect(evaluateChallenge(ch, ctx(m)).passed).toBe(false);
    const fixed: Model = { ...m, rule: { ...CA09_BROKEN, clauses: CA09_BROKEN.clauses.slice(0, 2) } };
    expect(evaluateChallenge(ch, ctx(fixed)).passed).toBe(true);
    const wrong: Model = {
      ...m,
      rule: { ...CA09_BROKEN, clauses: [CA09_BROKEN.clauses[0], { currentStates: [1], counts: [{ state: 1, min: 2, max: 4 }], nextState: 1 }] },
    };
    expect(evaluateChallenge(ch, ctx(wrong)).results.find((r) => r.id === 'life')!.passed).toBe(false);
  });
  it('CA-10 checks evidence fields, not prose quality', () => {
    const ch = challengeById('CA-10')!;
    const m = presetById('blinker')!.build();
    const def: ExperimentDefinition = { ...draftExperiment(m, 'p', 'r', 'h'), question: 'Q', hypothesis: 'H', horizon: 10 };
    const runs = planRuns(def).map((s) => executeRun(def, s));
    const long = Array.from({ length: 101 }, () => 'w').join(' ');
    expect(evaluateChallenge(ch, ctx(m, { experiments: [{ definition: def, status: 'completed', conclusion: long, runs }] })).passed).toBe(true);
    expect(evaluateChallenge(ch, ctx(m, { experiments: [{ definition: { ...def, question: '' }, status: 'completed', conclusion: long, runs }] })).passed).toBe(
      false,
    );
  });
});
