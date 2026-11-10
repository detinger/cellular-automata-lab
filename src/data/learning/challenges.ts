// Ten guided challenges. Predicates assess behavior and declared constraints, not one
// exact drawing, and run the same engine as the app. Each returns observed vs expected with an explanation.
import type { Model } from '../../domain/contracts/model';
import { createEngine } from '../../domain/engine/engine';
import { validateModel } from '../../domain/model/validate';
import { compileCountTable, countTuples, lookupCountTable, validateCountTable } from '../../domain/rules/countTable';
import { lifeLikeTable } from '../../domain/rules/lifeLike';
import { sessionSeed } from '../../domain/random/prng';
import { fail, pass, type Challenge, type ChallengeContext, type Predicate } from '../../domain/learning/types';
import { ecaModel, familyModel, lifeModel, presetById } from '../presets';
import { ruleSummary } from '../../domain/model/families';

const isLife = (m: Model) => m.rule.id === 'life-like/v1' && m.rule.birth.join() === '3' && m.rule.survive.join() === '2,3';
const lifeRule: Predicate = {
  id: 'rule',
  description: 'The rule is Life (B3/S23)',
  check: ({ model }) =>
    isLife(model)
      ? pass('B3/S23', 'B3/S23', 'The rule was not changed.')
      : fail(ruleSummary(model.rule), 'B3/S23', 'This challenge is about Life. Set the rule back to B3/S23.'),
};
const after = (m: Model, steps: number, seed?: string) => {
  const e = createEngine(m, seed ? { transitionSeed: sessionSeed(seed, 'transition') } : {});
  if (steps) e.step(steps);
  return new Uint8Array(e.cells);
};
const diff = (a: Uint8Array, b: Uint8Array) => {
  let n = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) n++;
  return n;
};
const live = (c: Uint8Array) => c.reduce((s, v) => s + (v ? 1 : 0), 0);
const answerNum = (ctx: ChallengeContext, id: string) => {
  const v = Number(String(ctx.answers[id] ?? '').replace(',', '.'));
  return String(ctx.answers[id] ?? '').trim() === '' || !Number.isFinite(v) ? null : v;
};

// CA-01 fixture: T-tetromino on a 7 × 7 dead-exterior grid.
export const CA01_START: Array<[number, number]> = [
  [2, 2],
  [3, 2],
  [4, 2],
  [3, 3],
];
/** Every original cell has 2 or 3 live neighbors (survives); (3,1), (2,3), (4,3) have exactly 3 (born). */
export const CA01_NEXT: Array<[number, number]> = [
  [3, 1],
  [2, 2],
  [3, 2],
  [4, 2],
  [2, 3],
  [3, 3],
  [4, 3],
];

const CA04_GLIDER: Array<[number, number]> = [
  [5, 4],
  [6, 5],
  [4, 6],
  [5, 6],
  [6, 6],
];

/** Broken Life-as-table for CA-09: clauses 2 and 3 overlap at 3 neighbors; clause 4 needs 9 neighbors. */
export const CA09_BROKEN = {
  id: 'count-table/v1' as const,
  states: 2,
  neighborhood: 'moore-r1' as const,
  clauses: [
    { currentStates: [0], counts: [{ state: 1, min: 3, max: 3 }], nextState: 1 },
    { currentStates: [1], counts: [{ state: 1, min: 2, max: 3 }], nextState: 1 },
    { currentStates: [1], counts: [{ state: 1, min: 3, max: 4 }], nextState: 1 },
    {
      currentStates: [0],
      counts: [
        { state: 1, min: 6, max: 8 },
        { state: 0, min: 3, max: 8 },
      ],
      nextState: 1,
    },
  ],
  fallback: { kind: 'state' as const, state: 0 },
};

const completedExperiments = (ctx: ChallengeContext, family: string) =>
  ctx.experiments.filter((e) => e.status === 'completed' && e.definition.baseModel.rule.id === family);

export const CHALLENGES: readonly Challenge[] = [
  {
    id: 'CA-01',
    version: 1,
    level: 1,
    lessonId: 'L02-local-rules',
    title: 'Predict one Life generation',
    task: 'The starting grid holds four live cells in a T shape. Without pressing Step, edit generation 0 so it shows what the grid will look like after one generation of Life. Then check your answer.',
    start: () => lifeModel('CA-01 prediction', 7, 7, CA01_START),
    questions: [],
    predicates: [
      lifeRule,
      {
        id: 'next',
        description: 'Your grid equals the true next generation of the T shape',
        check: ({ model }) => {
          if (model.width !== 7 || model.height !== 7) return fail(`${model.width} × ${model.height}`, '7 × 7', 'Keep the 7 × 7 lattice.');
          const expected = lifeModel('x', 7, 7, CA01_NEXT).initial;
          const d = diff(model.initial, expected);
          return d === 0
            ? pass('all 49 cells match', 'the next generation', 'Every cell matches.')
            : fail(
                `${d} cell${d === 1 ? '' : 's'} differ`,
                'the next generation (7 live cells)',
                'Count each cell’s 8 neighbors in the T shape: survivors need 2 or 3, births need exactly 3.',
              );
        },
      },
    ],
    hints: [
      'Start with the four live cells: count each one’s live neighbors. Do they survive?',
      'Now look at the empty cells that touch three of the live cells. There are three of them.',
      'The answer has 7 live cells.',
    ],
    reflection: {
      prompt: 'Explain one birth and one survival in your prediction using neighbor counts.',
      rubric: ['Names a specific cell and its neighbor count', 'Uses the correct B3/S23 clause for a birth', 'Uses the correct clause for a survival or death'],
    },
  },
  {
    id: 'CA-02',
    version: 1,
    level: 3,
    lessonId: 'L05-patterns',
    title: 'Build a still life',
    task: 'Paint a nonempty pattern that never changes under Life. Any still life counts — it does not have to be a block.',
    start: () => lifeModel('CA-02 still life', 16, 16, []),
    questions: [],
    predicates: [
      lifeRule,
      {
        id: 'nonempty',
        description: 'At least one live cell',
        check: ({ model }) => {
          const n = live(model.initial);
          return n > 0
            ? pass(`${n} live cells`, '≥ 1', 'The pattern is not empty.')
            : fail('0 live cells', '≥ 1', 'An empty grid trivially never changes; build a real pattern.');
        },
      },
      {
        id: 'still',
        description: 'Generation 1 equals generation 0 (exact state)',
        check: ({ model }) => {
          const d = diff(after(model, 1), model.initial);
          return d === 0
            ? pass('no cell changed', 'S1 = S0', 'Every live cell has 2 or 3 live neighbors and no dead cell has exactly 3.')
            : fail(`${d} cell${d === 1 ? '' : 's'} changed`, 'S1 = S0', 'Inspect a changing cell to see its neighbor count.');
        },
      },
    ],
    hints: [
      'A 2 × 2 block is the smallest still life.',
      'Each live cell needs 2 or 3 live neighbors; no dead cell may have exactly 3.',
      'Try a “beehive”: six cells in a hexagon shape.',
    ],
    reflection: {
      prompt: 'Why does every cell of your pattern survive, and why are no new cells born?',
      rubric: [
        'Refers to the survival set S{2,3}',
        'Explains why surrounding dead cells do not reach 3 neighbors',
        'Uses exact state, not population, as evidence',
      ],
    },
  },
  {
    id: 'CA-03',
    version: 1,
    level: 3,
    lessonId: 'L05-patterns',
    title: 'Build a period-two oscillator',
    task: 'Paint a pattern that returns to exactly the same state after two generations but is different after one.',
    start: () => lifeModel('CA-03 oscillator', 16, 16, []),
    questions: [],
    predicates: [
      lifeRule,
      {
        id: 'returns',
        description: 'S0 = S2',
        check: ({ model }) => {
          const d = diff(after(model, 2), model.initial);
          return d === 0
            ? pass('S2 matches S0', 'S0 = S2', 'The pattern returns after two generations.')
            : fail(`${d} cells differ`, 'S0 = S2', 'After two steps the grid must be identical to generation 0.');
        },
      },
      {
        id: 'changes',
        description: 'S0 ≠ S1',
        check: ({ model }) => {
          const d = diff(after(model, 1), model.initial);
          return d > 0
            ? pass(`${d} cells change`, 'S0 ≠ S1', 'The pattern really oscillates.')
            : fail('nothing changes', 'S0 ≠ S1', 'A still life (or an empty grid) also satisfies S0 = S2. Build something that changes.');
        },
      },
    ],
    hints: ['Three cells in a row is the classic example.', 'The toad (two offset rows of three) and the beacon also work.'],
    reflection: {
      prompt: 'Describe the two phases of your oscillator and why each turns into the other.',
      rubric: ['Describes both phases', 'Explains at least one birth and one death per phase', 'Distinguishes period 2 from a still life'],
    },
  },
  {
    id: 'CA-04',
    version: 1,
    level: 2,
    lessonId: 'L04-boundaries',
    title: 'Diagnose a boundary difference',
    task: 'This glider on a 12 × 12 lattice with a dead exterior stops being a glider when it reaches the corner. First, run the starting model and answer the question. Then change only the boundary so the glider keeps flying forever.',
    start: () => lifeModel('CA-04 boundary', 12, 12, CA04_GLIDER),
    questions: [{ id: 'dead40', prompt: 'With the original dead exterior, how many live cells are left after 40 generations?', kind: 'number', tolerance: 0 }],
    predicates: [
      lifeRule,
      {
        id: 'answer',
        description: 'Correct edge prediction',
        check: (ctx) => {
          const expected = live(after(lifeModel('x', 12, 12, CA04_GLIDER), 40));
          const a = answerNum(ctx, 'dead40');
          return a === expected
            ? pass(String(a), String(expected), 'At the corner the dead exterior turns the glider into a 2 × 2 block.')
            : fail(
                a === null ? 'no answer' : String(a),
                'the count after 40 generations',
                'Run the original model to generation 40 (Step N) and read the live count.',
              );
        },
      },
      {
        id: 'periodic',
        description: 'Boundary is periodic',
        check: ({ model }) =>
          model.boundary.kind === 'periodic'
            ? pass('periodic', 'periodic', 'Off-grid neighbors now wrap to the opposite edge.')
            : fail(`fixed exterior (state ${model.boundary.state})`, 'periodic', 'A fixed exterior always ends the glider at an edge.'),
      },
      {
        id: 'flies',
        description: 'The glider returns to its start after 48 generations',
        check: ({ model }) => {
          const d = diff(after(model, 48), model.initial);
          return d === 0 && live(model.initial) === 5
            ? pass('S48 = S0', 'S48 = S0', 'On a 12 × 12 torus the glider completes a lap in 4 × 12 generations.')
            : fail(
                d === 0 ? `${live(model.initial)} live cells` : `${d} cells differ`,
                'the original glider back at its start',
                'Keep the original five glider cells and change only the boundary.',
              );
        },
      },
    ],
    hints: [
      'Use Step N with 40, then read the live count in Measurements.',
      'A fixed exterior supplies dead neighbors at the edge; periodic wrapping supplies the cells from the other side.',
      'Change “Off-grid neighbors” to periodic and do not touch the cells.',
    ],
    reflection: {
      prompt: 'Explain what wraparound does to the glider at the corner, and why the dead exterior gives a different result.',
      rubric: [
        'Explains wrapping to the opposite edge',
        'Explains that a fixed exterior is sampled, not frozen',
        'Connects the boundary choice to the observed outcome',
      ],
    },
  },
  {
    id: 'CA-05',
    version: 1,
    level: 3,
    lessonId: 'L06-elementary',
    title: 'Encode an elementary rule',
    task: 'Build the elementary rule in which a cell becomes 1 exactly when one — and only one — of its left and right neighbors is 1. Its own old state does not matter. Use the rule-bit editor.',
    start: () =>
      ecaModel(
        'CA-05 encode',
        0,
        (() => {
          const c = new Uint8Array(129);
          c[64] = 1;
          return c;
        })(),
      ),
    questions: [],
    predicates: [
      {
        id: 'family',
        description: 'The model is an elementary CA',
        check: ({ model }) =>
          model.rule.id === 'elementary/v1'
            ? pass('elementary', 'elementary', 'One row, three-cell neighborhoods.')
            : fail(model.rule.id, 'elementary/v1', 'Start from the challenge model.'),
      },
      {
        id: 'bits',
        description: 'All eight outputs are correct',
        check: ({ model }) => {
          if (model.rule.id !== 'elementary/v1') return fail('not elementary', '8 correct outputs', '');
          const wrong: string[] = [];
          for (let p = 7; p >= 0; p--) {
            const want = ((p >> 2) & 1) ^ (p & 1);
            if (((model.rule.ruleNumber >>> p) & 1) !== want) wrong.push(p.toString(2).padStart(3, '0'));
          }
          return wrong.length === 0
            ? pass('8 of 8 correct', 'left XOR right', 'Each output is left XOR right.')
            : fail(
                `wrong for ${wrong.join(', ')}`,
                'left XOR right for all 8 patterns',
                'For each pattern, look only at the first and last digit: output 1 when exactly one is 1.',
              );
        },
      },
      {
        id: 'number',
        description: 'The rule number is 90',
        check: ({ model }) =>
          model.rule.id === 'elementary/v1' && model.rule.ruleNumber === 90
            ? pass('90', '90', 'Binary 01011010 read from 111 down to 000.')
            : fail(model.rule.id === 'elementary/v1' ? String(model.rule.ruleNumber) : '—', '90', 'Read the outputs from 111 to 000 as a binary number.'),
      },
    ],
    hints: [
      'Write the eight patterns 111 … 000 and, for each, compare only the outer two digits.',
      'Patterns 110, 100, 011 and 001 should give 1.',
      'The binary number is 01011010.',
    ],
    reflection: {
      prompt: 'Explain how the eight outputs combine into one rule number, and why the order matters.',
      rubric: ['Bit p is the output for pattern p = 4L + 2C + R', 'Reads 111 as the most significant bit', 'Verifies the number from the outputs'],
    },
  },
  {
    id: 'CA-06',
    version: 1,
    level: 5,
    lessonId: 'L08-stochastic-sir',
    title: 'Reproduce a stochastic run',
    task: 'A classmate reports: spatial SIR, β = 0.3, γ = 0.1, Moore neighbors, 64 × 64 periodic lattice, one infected cell at (32, 32), transition seed “lab-7”. Set up exactly that model (the starting model is close but not identical) and report how many cells are recovered at generation 40.',
    start: () =>
      familyModel('CA-06 reproduce', { id: 'spatial-sir/v1', beta: 0.3, gamma: 0.2, neighborhood: 'moore-r1' }, 64, 64, [[32, 32, 1]], { kind: 'periodic' }),
    startSeed: '1',
    questions: [{ id: 'r40', prompt: 'Recovered cells at generation 40', kind: 'number', tolerance: 0 }],
    predicates: [
      {
        id: 'spec',
        description: 'Rule, neighborhood, lattice and boundary match the report',
        check: ({ model: m }) => {
          const ok =
            m.rule.id === 'spatial-sir/v1' &&
            m.rule.beta === 0.3 &&
            m.rule.gamma === 0.1 &&
            m.rule.neighborhood === 'moore-r1' &&
            m.width === 64 &&
            m.height === 64 &&
            m.boundary.kind === 'periodic';
          return ok
            ? pass(ruleSummary(m.rule), 'SIR β=0.3, γ=0.1, Moore, 64 × 64 periodic', 'The model matches.')
            : fail(
                `${ruleSummary(m.rule)}, ${m.width} × ${m.height}, ${m.boundary.kind}`,
                'SIR β=0.3, γ=0.1, Moore, 64 × 64 periodic',
                'Check every parameter against the report.',
              );
        },
      },
      {
        id: 'initial',
        description: 'Exactly one infected cell, at (32, 32)',
        check: ({ model: m }) => {
          const inf = [...m.initial.keys()].filter((i) => m.initial[i] === 1);
          const others = [...m.initial].filter((v) => v === 2).length;
          return inf.length === 1 && inf[0] === 32 * m.width + 32 && others === 0
            ? pass('one infected cell at (32, 32)', 'one infected cell at (32, 32)', 'Same initial condition.')
            : fail(`${inf.length} infected, ${others} recovered`, 'one infected cell at (32, 32)', 'The initial grid must match exactly.');
        },
      },
      {
        id: 'seed',
        description: 'Transition seed is “lab-7”',
        check: ({ seed }) =>
          seed === 'lab-7' ? pass('lab-7', 'lab-7', 'Same random stream.') : fail(seed, 'lab-7', 'Set the transition seed in the Random stream panel.'),
      },
      {
        id: 'answer',
        description: 'Reported recovered count matches the reproduced run',
        check: (ctx) => {
          const ref = familyModel('x', { id: 'spatial-sir/v1', beta: 0.3, gamma: 0.1, neighborhood: 'moore-r1' }, 64, 64, [[32, 32, 1]], { kind: 'periodic' });
          const expected = after(ref, 40, 'lab-7').filter((v) => v === 2).length;
          const a = answerNum(ctx, 'r40');
          return a === expected
            ? pass(String(a), String(expected), 'You reproduced the run exactly.')
            : fail(
                a === null ? 'no answer' : String(a),
                'the recovered count of the reproduced run',
                'Step to generation 40 (Step N) and read the Recovered count.',
              );
        },
      },
    ],
    hints: [
      'Compare β, γ, neighborhood, size and boundary one by one with the report.',
      'The seed lives in the Random stream panel, not in the random-fill panel.',
      'Use Step N = 40 from generation 0.',
    ],
    reflection: {
      prompt: 'What would break exact reproduction even with the same seed?',
      rubric: [
        'Mentions changed parameters or initial grid',
        'Mentions a different engine or random-stream version',
        'Distinguishes reproducing one run from generalizing across seeds',
      ],
    },
  },
  {
    id: 'CA-07',
    version: 1,
    level: 6,
    lessonId: 'L07-traffic',
    title: 'Investigate traffic density',
    task: 'On the Rule 184 ring, run an experiment that sweeps car density (at least 5 values, some below and some above 0.5), regenerates the road for every run, and measures flow. Then answer the question.',
    start: () => presetById('rule-184')!.build(),
    questions: [{ id: 'peak', prompt: 'At which car density is flow highest?', kind: 'number', tolerance: 0.1 }],
    predicates: [
      {
        id: 'experiment',
        description: 'A completed density sweep on Rule 184 with regenerated roads, measuring flow',
        check: (ctx) => {
          const e = completedExperiments(ctx, 'elementary/v1').find(
            (x) =>
              x.definition.factors.some((f) => f.target.kind === 'init-probability') &&
              x.definition.initialization.kind === 'regenerate' &&
              x.definition.response.metric === 'flow',
          );
          return e
            ? pass(e.definition.name, 'a completed sweep', 'Found it.')
            : fail(
                'none',
                'a completed experiment: density factor, regenerated initial grids, flow response',
                'Use Experiment in the workspace; the default traffic draft is a good start.',
              );
        },
      },
      {
        id: 'range',
        description: 'At least 5 densities, below and above 0.5',
        check: (ctx) => {
          const e = completedExperiments(ctx, 'elementary/v1').find((x) => x.definition.factors.some((f) => f.target.kind === 'init-probability'));
          const vals = (e?.definition.factors.find((f) => f.target.kind === 'init-probability')?.values ?? []).map(Number);
          const ok = vals.length >= 5 && vals.some((v) => v < 0.5) && vals.some((v) => v > 0.5);
          return ok
            ? pass(vals.join(', '), '≥ 5 values on both sides of 0.5', 'The sweep covers free flow and jams.')
            : fail(vals.join(', ') || 'none', '≥ 5 values on both sides of 0.5', 'Add densities on both sides of one half.');
        },
      },
      {
        id: 'conservation',
        description: 'Car count is conserved in every run',
        check: (ctx) => {
          const e = completedExperiments(ctx, 'elementary/v1').find((x) => x.definition.response.metric === 'flow');
          if (!e) return fail('no runs', 'conservation in every run', '');
          const bad = e.runs.filter((r) => r.status === 'completed' && r.samples.some((s) => s.counts[1] !== r.samples[0].counts[1]));
          const periodic = e.definition.baseModel.boundary.kind === 'periodic';
          return !bad.length && periodic
            ? pass(`${e.runs.length} runs conserved`, 'constant car count', 'On a periodic ring cars only move into empty cells.')
            : fail(
                periodic ? `${bad.length} runs changed their car count` : 'fixed boundary',
                'constant car count on a periodic ring',
                'Use the periodic boundary.',
              );
        },
      },
      {
        id: 'answer',
        description: 'Peak flow density identified',
        check: (ctx) => {
          const a = answerNum(ctx, 'peak');
          return a !== null && Math.abs(a - 0.5) <= 0.1
            ? pass(String(a), 'about 0.5', 'Flow is density below one half and 1 − density above it, so it peaks at 0.5.')
            : fail(a === null ? 'no answer' : String(a), 'the density where flow peaks', 'Read the response chart: where is the highest point?');
        },
      },
    ],
    hints: [
      'Open the Rule 184 model and press Experiment: the draft already sweeps density.',
      'Use a window that skips the first generations only if you can justify it: jams take time to dissolve.',
      'Below half density every car eventually moves; above it, only the empty cells let cars move.',
    ],
    reflection: {
      prompt: 'Interpret the density–flow curve: why does flow rise and then fall?',
      rubric: ['Explains free flow below 0.5', 'Explains jams above 0.5', 'Mentions conservation and the periodic ring assumption'],
    },
  },
  {
    id: 'CA-08',
    version: 1,
    level: 6,
    lessonId: 'L12-experiments',
    title: 'Compare spread assumptions',
    task: 'Using spatial SIR, compare two or more values of one assumption (for example β or the boundary) with at least 10 independent replicates per value. Write an interpretation that names a confounder or limitation and the uncertainty.',
    start: () => presetById('sir-outbreak')!.build(),
    startSeed: '1',
    questions: [],
    predicates: [
      {
        id: 'design',
        description: 'Completed SIR experiment: one factor, ≥ 2 values, ≥ 10 independent replicates',
        check: (ctx) => {
          const e = completedExperiments(ctx, 'spatial-sir/v1').find(
            (x) =>
              x.definition.factors.length === 1 &&
              x.definition.factors[0].values.length >= 2 &&
              x.definition.replicates >= 10 &&
              x.definition.design === 'independent',
          );
          return e
            ? pass(
                `${e.definition.factors[0].label}: ${e.definition.factors[0].values.join(', ')}, ${e.definition.replicates} replicates`,
                'one factor, ≥ 2 values, ≥ 10 replicates',
                'A clean one-assumption comparison.',
              )
            : fail('none found', 'one factor, ≥ 2 values, ≥ 10 independent replicates, completed', 'Change only one assumption, and replicate.');
        },
      },
      {
        id: 'all-runs',
        description: 'Every planned run completed',
        check: (ctx) => {
          const e = completedExperiments(ctx, 'spatial-sir/v1')[0];
          if (!e) return fail('—', 'all runs completed', '');
          const n = e.runs.filter((r) => r.status === 'completed').length,
            planned = e.definition.replicates * e.definition.factors.reduce((a, f) => a * f.values.length, 1);
          return n >= planned ? pass(`${n} / ${planned}`, 'all', 'No missing runs.') : fail(`${n} / ${planned}`, 'all', 'Resume or rerun the experiment.');
        },
      },
      {
        id: 'writing',
        description: 'Hypothesis and an interpretation of at least 40 words',
        check: (ctx) => {
          const e = completedExperiments(ctx, 'spatial-sir/v1')[0];
          const words = e?.conclusion.trim().split(/\s+/).filter(Boolean).length ?? 0;
          return e && e.definition.hypothesis.trim() && words >= 40
            ? pass(`${words} words`, '≥ 40 words and a hypothesis', 'Your reasoning will be reviewed with the rubric.')
            : fail(
                `${words} words${e?.definition.hypothesis.trim() ? '' : ', no hypothesis'}`,
                '≥ 40 words and a hypothesis',
                'Write the interpretation on the experiment page.',
              );
        },
      },
    ],
    hints: [
      'Use the Experiment button on the SIR model; keep one factor.',
      'Ten replicates per value is the minimum here; more gives tighter intervals.',
      'Ask: did the effect persist across seeds? Could the boundary or lattice size explain it?',
    ],
    reflection: {
      prompt: 'Which confounders could explain the difference you saw, and how certain is your conclusion?',
      rubric: [
        'States the effect with its uncertainty (interval or spread)',
        'Names at least one confounder or untested assumption',
        'Avoids claiming more than the design supports',
      ],
    },
  },
  {
    id: 'CA-09',
    version: 1,
    level: 4,
    lessonId: 'L09-count-rules',
    title: 'Repair an invalid rule table',
    task: 'This count table was meant to be Life (birth with 3, survival with 2 or 3), but the validator rejects it. Repair it so it is valid and behaves exactly like B3/S23 in every case.',
    start: () =>
      familyModel(
        'CA-09 repair',
        structuredClone(CA09_BROKEN),
        32,
        32,
        [
          [10, 10, 1],
          [11, 10, 1],
          [12, 10, 1],
        ],
        { kind: 'periodic' },
      ),
    questions: [],
    predicates: [
      {
        id: 'valid',
        description: 'The table is complete and has no overlapping or unreachable clauses',
        check: ({ model: m }) => {
          if (m.rule.id !== 'count-table/v1') return fail(m.rule.id, 'count-table/v1', 'Keep the count-table family.');
          const issues = validateCountTable(m.rule);
          return issues.length === 0
            ? pass('no problems', 'no validation errors', 'Every case has at most one clause, and the default covers the rest.')
            : fail(issues[0].message, 'no validation errors', 'Read the validation messages: each names the clauses involved.');
        },
      },
      {
        id: 'life',
        description: 'Same result as B3/S23 for all 18 cases',
        check: ({ model: m }) => {
          if (m.rule.id !== 'count-table/v1' || m.rule.states !== 2 || m.rule.neighborhood !== 'moore-r1' || validateCountTable(m.rule).length)
            return fail('table not usable', 'Life for every case', 'Fix validation first; keep 2 states and Moore neighbors.');
          const t = compileCountTable(m.rule),
            life = lifeLikeTable({ birth: [3], survive: [2, 3] });
          const wrong: string[] = [];
          for (const counts of countTuples(2, 8))
            for (let c = 0; c < 2; c++) {
              const code = counts[0] * t.weights[0] + counts[1] * t.weights[1];
              if (lookupCountTable(t, code, c) !== life[c * 9 + counts[1]]) wrong.push(`${c ? 'alive' : 'dead'} with ${counts[1]}`);
            }
          return wrong.length === 0
            ? pass('18 / 18 cases', 'Life', 'Identical to B3/S23.')
            : fail(`differs for: ${wrong.slice(0, 4).join('; ')}${wrong.length > 4 ? '…' : ''}`, 'Life for every case', 'Check each clause against B3/S23.');
        },
      },
      {
        id: 'cells',
        description: 'The model is otherwise runnable',
        check: ({ model }) => {
          const e = validateModel(model).filter((i) => i.severity === 'error');
          return e.length ? fail(e[0].message, 'no errors', '') : pass('runnable', 'runnable', '');
        },
      },
    ],
    hints: [
      'Two clauses both apply to a live cell with 3 live neighbors.',
      'One clause needs 6 live and 3 dead neighbors — that is 9 of 8.',
      'Remove clauses 3 and 4. Clauses 1 and 2 plus the default “become state 0” are exactly Life.',
    ],
    reflection: {
      prompt: 'Explain the original conflict and why “first match wins” is not allowed here.',
      rubric: [
        'Identifies the overlapping case (alive with 3)',
        'Identifies the unreachable clause (counts sum above 8)',
        'Explains why overlap is an error even when outputs agree',
      ],
    },
  },
  {
    id: 'CA-10',
    version: 1,
    level: 6,
    lessonId: 'L12-experiments',
    title: 'Submit a modeling investigation',
    task: 'Choose any model and question. Run a completed experiment with a stated question and hypothesis, write an interpretation of at least 100 words, and export the report. Your instructor assesses the reasoning with the rubric below.',
    questions: [],
    predicates: [
      {
        id: 'experiment',
        description: 'A completed experiment with a question and hypothesis',
        check: (ctx) => {
          const e = ctx.experiments.find((x) => x.status === 'completed' && x.definition.question.trim() && x.definition.hypothesis.trim());
          return e
            ? pass(e.definition.name, 'completed, with question and hypothesis', '')
            : fail('none', 'completed, with question and hypothesis', 'State both before running.');
        },
      },
      {
        id: 'replication',
        description: 'Replication fits the model',
        check: (ctx) => {
          const e = ctx.experiments.find((x) => x.status === 'completed');
          if (!e) return fail('—', '', '');
          const stoch = ['forest-fire/v1', 'spatial-sir/v1'].includes(e.definition.baseModel.rule.id) || e.definition.initialization.kind === 'regenerate';
          return !stoch || e.definition.replicates >= 10
            ? pass(`${e.definition.replicates} replicate(s)`, stoch ? '≥ 10 for a random model' : '1 for a deterministic model', '')
            : fail(`${e.definition.replicates}`, '≥ 10 replicates', 'Random models need replication.');
        },
      },
      {
        id: 'writing',
        description: 'Interpretation of at least 100 words',
        check: (ctx) => {
          const e = ctx.experiments.find((x) => x.status === 'completed');
          const words = e?.conclusion.trim().split(/\s+/).filter(Boolean).length ?? 0;
          return words >= 100
            ? pass(`${words} words`, '≥ 100 words', '')
            : fail(`${words} words`, '≥ 100 words', 'Write the interpretation on the experiment page.');
        },
      },
    ],
    hints: ['Any model works — a preset is fine.', 'Use the report export: it collects assumptions, seeds, results and limitations for you.'],
    reflection: {
      prompt: 'Summarize your investigation in three sentences: question, evidence, limitation.',
      rubric: [
        'Question is specific and answerable with the model',
        'Hypothesis is stated before results',
        'Design isolates one assumption and replicates appropriately',
        'Results are reported with uncertainty, censoring or early stops handled honestly',
        'Limitations and model assumptions (boundary, finite size, units) are discussed',
        'Conclusion does not claim more than the evidence supports',
      ],
    },
  },
];

export const challengeById = (id: string) => CHALLENGES.find((c) => c.id === id);

export function evaluateChallenge(ch: Challenge, ctx: ChallengeContext) {
  const results = ch.predicates.map((p) => {
    try {
      return { id: p.id, description: p.description, ...p.check(ctx) };
    } catch (e) {
      return { id: p.id, description: p.description, passed: false, observed: 'error', expected: '', explanation: (e as Error).message };
    }
  });
  return { results, passed: results.every((r) => r.passed) };
}
