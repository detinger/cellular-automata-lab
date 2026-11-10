// Bundled presets. Each preset's claimed behavior is verified in tests/unit/presets.test.ts.
import type { Boundary, Model, RuleSpec } from '../../domain/contracts/model';
import { randomInitialize } from '../../domain/random/seeded';
import { defaultLabels, stateCountOf } from '../../domain/model/families';

export interface Preset {
  id: string;
  name: string;
  family: 'life-like' | 'elementary' | 'brians-brain' | 'cyclic' | 'forest-fire' | 'spatial-sir' | 'count-table';
  /** Short rule label shown on cards. */
  ruleLabel: string;
  description: string;
  /** Behavior the test suite checks, stated for students. */
  expectedBehavior: string;
  build: () => Model;
  /** Transition seed for stochastic presets; their claimed behavior is verified for this seed only. */
  seed?: string;
}

/** A 2D model of any family from explicit (x, y, state) cells or a full grid. */
export function familyModel(
  name: string,
  rule: RuleSpec,
  width: number,
  height: number,
  cells: Array<[number, number, number]> | Uint8Array,
  boundary: Boundary = DEAD_EXT,
): Model {
  const initial = cells instanceof Uint8Array ? cells : new Uint8Array(width * height);
  if (!(cells instanceof Uint8Array)) for (const [x, y, st] of cells) initial[y * width + x] = st;
  return { name, width, height, stateCount: stateCountOf(rule), stateLabels: defaultLabels(rule), boundary, schedule: 'synchronous', rule, initial };
}
const DEAD_EXT: Boundary = { kind: 'fixed-exterior', state: 0 };
const TORUS: Boundary = { kind: 'periodic' };

/** HighLife replicator (B36/S23), 5 × 5, placed with its top-left corner at (21, 21). */
const REPLICATOR: Array<[number, number]> = [
  [2, 0],
  [3, 0],
  [4, 0],
  [1, 1],
  [4, 1],
  [0, 2],
  [4, 2],
  [0, 3],
  [3, 3],
  [0, 4],
  [1, 4],
  [2, 4],
];

const LIFE = { id: 'life-like/v1' as const, birth: [3], survive: [2, 3] };
const DEAD: Boundary = { kind: 'fixed-exterior', state: 0 };

export function lifeModel(name: string, width: number, height: number, live: Array<[number, number]>, boundary: Boundary = DEAD): Model {
  const initial = new Uint8Array(width * height);
  for (const [x, y] of live) initial[y * width + x] = 1;
  return {
    name,
    width,
    height,
    stateCount: 2,
    stateLabels: ['Dead', 'Alive'],
    boundary,
    schedule: 'synchronous',
    rule: { ...LIFE, birth: [...LIFE.birth], survive: [...LIFE.survive] },
    initial,
  };
}

export function ecaModel(name: string, ruleNumber: number, initial: Uint8Array, boundary: Boundary = DEAD, labels = ['Off', 'On']): Model {
  return {
    name,
    width: initial.length,
    height: 1,
    stateCount: 2,
    stateLabels: labels,
    boundary,
    schedule: 'synchronous',
    rule: { id: 'elementary/v1', ruleNumber },
    initial,
  };
}

const singleSeed = (width: number, at = Math.floor(width / 2)) => {
  const c = new Uint8Array(width);
  c[at] = 1;
  return c;
};

/** Fixed, documented traffic pattern: cell i holds a car when (i * 37 + 11) mod 100 < 40, i.e. exactly 40% of every 100 cells. */
export const trafficPattern = (width: number) => Uint8Array.from({ length: width }, (_, i) => ((i * 37 + 11) % 100 < 40 ? 1 : 0));

const offset = (cells: Array<[number, number]>, ox: number, oy: number) => cells.map(([x, y]) => [x + ox, y + oy] as [number, number]);

const L = { family: 'life-like' as const, ruleLabel: 'B3/S23' };

export const PRESETS: readonly Preset[] = [
  {
    ...L,
    id: 'blinker',
    name: 'Blinker',
    description: 'Three live cells in a row on a 5 × 5 grid with a dead exterior.',
    expectedBehavior: 'Period-2 oscillator: horizontal and vertical phases alternate.',
    build: () =>
      lifeModel('Blinker', 5, 5, [
        [1, 2],
        [2, 2],
        [3, 2],
      ]),
  },
  {
    ...L,
    id: 'block',
    name: 'Block',
    description: 'A 2 × 2 square in the middle of an 8 × 8 grid.',
    expectedBehavior: 'Still life: every live cell has 3 live neighbors, so nothing changes.',
    build: () =>
      lifeModel('Block', 8, 8, [
        [3, 3],
        [4, 3],
        [3, 4],
        [4, 4],
      ]),
  },
  {
    ...L,
    id: 'toad',
    name: 'Toad',
    description: 'Two offset rows of three cells on an 8 × 8 grid with a dead exterior.',
    expectedBehavior: 'Period-2 oscillator: the rows shift apart and back.',
    build: () =>
      lifeModel('Toad', 8, 8, [
        [3, 3],
        [4, 3],
        [5, 3],
        [2, 4],
        [3, 4],
        [4, 4],
      ]),
  },
  {
    ...L,
    id: 'beacon',
    name: 'Beacon',
    description: 'Two diagonal blocks on an 8 × 8 grid with a dead exterior.',
    expectedBehavior: 'Period-2 oscillator: the two touching corners blink on and off.',
    build: () =>
      lifeModel('Beacon', 8, 8, [
        [2, 2],
        [3, 2],
        [2, 3],
        [5, 4],
        [4, 5],
        [5, 5],
      ]),
  },
  {
    ...L,
    id: 'glider',
    name: 'Glider',
    description: 'The standard glider on a 32 × 32 torus (periodic boundary).',
    expectedBehavior: 'Moves one cell right and one cell down every 4 generations, wrapping at the edges.',
    build: () =>
      lifeModel(
        'Glider',
        32,
        32,
        offset(
          [
            [1, 0],
            [2, 1],
            [0, 2],
            [1, 2],
            [2, 2],
          ],
          2,
          2,
        ),
        { kind: 'periodic' },
      ),
  },
  {
    family: 'elementary',
    ruleLabel: 'Rule 30',
    id: 'rule-30',
    name: 'Rule 30',
    description: 'One live cell in the middle of a 255-cell row with a dead exterior.',
    expectedBehavior: 'An irregular, asymmetric triangle grows one cell per side per generation.',
    build: () => ecaModel('Rule 30', 30, singleSeed(255)),
  },
  {
    family: 'elementary',
    ruleLabel: 'Rule 90',
    id: 'rule-90',
    name: 'Rule 90',
    description: 'One live cell in the middle of a 255-cell row with a dead exterior.',
    expectedBehavior: 'Each cell becomes left XOR right, drawing a Sierpiński triangle.',
    build: () => ecaModel('Rule 90', 90, singleSeed(255)),
  },
  {
    family: 'elementary',
    ruleLabel: 'Rule 110',
    id: 'rule-110',
    name: 'Rule 110',
    description: 'One live cell near the right end of a 255-cell row with a dead exterior.',
    expectedBehavior: 'Structures grow toward the left only; the right side stays empty.',
    build: () => ecaModel('Rule 110', 110, singleSeed(255, 250)),
  },
  {
    family: 'elementary',
    ruleLabel: 'Rule 184',
    id: 'rule-184',
    name: 'Rule 184 traffic',
    description: 'A 200-cell periodic ring where 40% of cells hold a car (a fixed, documented pattern).',
    expectedBehavior: 'A car moves right only if the cell ahead was empty; the number of cars never changes.',
    build: () => ecaModel('Rule 184 traffic', 184, trafficPattern(200), { kind: 'periodic' }, ['Empty road', 'Car']),
  },
  {
    family: 'life-like',
    ruleLabel: 'B36/S23',
    id: 'highlife-replicator',
    name: 'HighLife replicator',
    description: 'A 12-cell seed under HighLife (B36/S23) on a 48 × 48 grid with a dead exterior.',
    expectedBehavior: 'After 12 generations, two exact copies of the seed sit 2 cells up-left and 2 cells down-right of where it started.',
    build: () => ({ ...lifeModel('HighLife replicator', 48, 48, offset(REPLICATOR, 21, 21)), rule: { id: 'life-like/v1', birth: [3, 6], survive: [2, 3] } }),
  },
  {
    family: 'brians-brain',
    ruleLabel: "Brian's Brain",
    id: 'brain-glider',
    name: "Brian's Brain excitation",
    description: 'Two firing cells with two refractory cells behind them, on a 32 × 32 torus.',
    expectedBehavior: 'The firing pair excites the ready cells in front of it, so the 2 × 2 shape moves up one cell every generation.',
    build: () =>
      familyModel(
        "Brian's Brain excitation",
        { id: 'brians-brain/v1' },
        32,
        32,
        [
          [15, 20, 1],
          [16, 20, 1],
          [15, 21, 2],
          [16, 21, 2],
        ],
        TORUS,
      ),
  },
  {
    family: 'cyclic',
    ruleLabel: 'K=14, T=1',
    id: 'cyclic-waves',
    name: 'Cyclic CA from noise',
    description: '14 states, threshold 1, von Neumann neighbors, random start (seed “cyc”) on a 128 × 128 torus.',
    expectedBehavior: 'Activity starts near 13% and rises above 80% by generation 300 as traveling waves and spirals take over.',
    build: () =>
      familyModel(
        'Cyclic CA from noise',
        { id: 'cyclic/v1', states: 14, threshold: 1, neighborhood: 'von-neumann-r1' },
        128,
        128,
        randomInitialize(new Uint8Array(128 * 128), 128, 128, Array(14).fill(1 / 14), 'cyc'),
        TORUS,
      ),
  },
  {
    family: 'forest-fire',
    ruleLabel: 'p=0, f=0',
    id: 'fire-front',
    name: 'Forest-fire front',
    description: 'A full forest with the left column burning; no growth and no lightning (p = f = 0), 64 × 32, empty exterior.',
    expectedBehavior: 'The front moves exactly one column per generation and leaves empty ground; after 64 generations the forest is gone.',
    build: () => {
      const w = 64,
        h = 32,
        g = new Uint8Array(w * h).fill(1);
      for (let y = 0; y < h; y++) g[y * w] = 2;
      return familyModel('Forest-fire front', { id: 'forest-fire/v1', growth: 0, ignition: 0, neighborhood: 'von-neumann-r1' }, w, h, g);
    },
    seed: '1',
  },
  {
    family: 'forest-fire',
    ruleLabel: 'p=0.02, f=0.0001',
    id: 'fire-regrowth',
    name: 'Forest-fire regrowth',
    description:
      'Half the cells start as trees (seed “forest”); trees regrow with p = 0.02 and lightning strikes with f = 0.0001. 96 × 96 torus, transition seed 1.',
    expectedBehavior: 'In this seeded run fire never fully dies out, and tree cover keeps rising and falling between about 30% and 55% instead of settling.',
    build: () =>
      familyModel(
        'Forest-fire regrowth',
        { id: 'forest-fire/v1', growth: 0.02, ignition: 0.0001, neighborhood: 'von-neumann-r1' },
        96,
        96,
        randomInitialize(new Uint8Array(96 * 96), 96, 96, [0.5, 0.5, 0], 'forest'),
        TORUS,
      ),
    seed: '1',
  },
  {
    family: 'spatial-sir',
    ruleLabel: 'β=0.3, γ=0.1',
    id: 'sir-outbreak',
    name: 'Isolated SIR infection',
    description: 'One infected cell in the middle of a 64 × 64 torus; β = 0.3 per infected neighbor, γ = 0.1, Moore neighbors, transition seed 1.',
    expectedBehavior:
      'In this seeded run the infection spreads as a ring and ends after reaching everyone. S + I + R stays 4,096 and recovered never decreases. Other seeds can die out early.',
    build: () => familyModel('Isolated SIR infection', { id: 'spatial-sir/v1', beta: 0.3, gamma: 0.1, neighborhood: 'moore-r1' }, 64, 64, [[32, 32, 1]], TORUS),
    seed: '1',
  },
  {
    family: 'count-table',
    ruleLabel: 'Majority vote',
    id: 'majority-vote',
    name: 'Majority vote (count table)',
    description: 'A custom count rule: become 1 with 5–8 neighbors in state 1, 0 with 0–3, otherwise keep. Random 50/50 start (seed “vote”), 64 × 64 torus.',
    expectedBehavior: 'Noise coarsens into solid blobs and the lattice stops changing completely within 20 generations.',
    build: () => {
      const m = familyModel(
        'Majority vote',
        {
          id: 'count-table/v1',
          states: 2,
          neighborhood: 'moore-r1',
          clauses: [
            { currentStates: [0, 1], counts: [{ state: 1, min: 5, max: 8 }], nextState: 1 },
            { currentStates: [0, 1], counts: [{ state: 1, min: 0, max: 3 }], nextState: 0 },
          ],
          fallback: { kind: 'keep-current' },
        },
        64,
        64,
        randomInitialize(new Uint8Array(64 * 64), 64, 64, [0.5, 0.5], 'vote'),
        TORUS,
      );
      m.stateLabels = ['No', 'Yes'];
      return m;
    },
  },
];

export const presetById = (id: string) => PRESETS.find((p) => p.id === id);

export function blankModel(width = 64, height = 64): Model {
  return lifeModel('Untitled model', width, height, [], { kind: 'periodic' });
}

export function blankElementary(width = 255): Model {
  return ecaModel('Untitled elementary CA', 30, singleSeed(width));
}
