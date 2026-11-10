// Twelve lessons over six levels. Every factual claim about a demo is checked in
// tests/unit/learning.test.ts against the engine; formal results from outside sources are named as such.
import type { Lesson } from '../../domain/learning/types';
import { ecaModel, familyModel, lifeModel, presetById, trafficPattern } from '../presets';

const single = (w: number) => {
  const c = new Uint8Array(w);
  c[w >> 1] = 1;
  return c;
};

export const LESSONS: readonly Lesson[] = [
  {
    id: 'L01-cells-states',
    version: 1,
    level: 1,
    title: 'Cells, states and generations',
    objective: 'Describe a cellular automaton as a lattice of cells, each in one state, updated in discrete generations from an initial condition.',
    explanation: [
      'A cellular automaton (CA) is a grid of cells. Each cell holds one state from a short list, such as dead or alive.',
      'Time moves in whole steps called generations. Generation 0 is the initial condition you paint. Each step computes generation t + 1 from generation t, all cells at once.',
      'A generation is part of the model. A frame is just a picture on screen: playback speed changes how often you see frames, never what the next generation is.',
    ],
    demo: {
      build: () => presetById('blinker')!.build(),
      caption: 'Life (B3/S23), 5 × 5 lattice, fixed dead exterior, three live cells in a row at (1,2), (2,2), (3,2).',
    },
    prediction: {
      id: 'p',
      question: 'Before stepping: how many live cells will there be in generation 1?',
      options: ['0', '2', '3', '9'],
      answer: 2,
      explanation: 'Two end cells die and two new cells are born above and below the middle, so there are still 3 live cells — now in a vertical line.',
    },
    mistake: {
      title: 'Updating cells one at a time',
      text: 'If you update cells left to right and let later cells read already-updated neighbors, you get a different (wrong) result. Every cell must read only the previous generation.',
    },
    exercise: { text: 'Paint your own three-cell line in a blank model, step it twice, and check that generation 2 equals generation 0.' },
    check: [
      {
        id: 'c1',
        question: 'What is generation 0?',
        options: ['The first frame drawn on screen', 'The initial condition you set', 'The state after one step'],
        answer: 1,
        explanation: 'Generation 0 is the concrete initial grid; every later generation is computed from it.',
      },
      {
        id: 'c2',
        question: 'You double the playback speed. What changes?',
        options: ['The rule', 'How quickly generations are shown', 'Which cells are alive in generation 10'],
        answer: 1,
        explanation: 'Speed only changes scheduling. Generation 10 is the same at any speed.',
      },
    ],
    reflection: 'In your own words: what is the difference between a generation and a frame?',
  },
  {
    id: 'L02-local-rules',
    version: 1,
    level: 1,
    title: 'Local rules: predicting the next state',
    objective: 'Apply a local rule by hand: count a cell’s neighbors and use its old state to predict its next state.',
    explanation: [
      'A rule looks only at a small neighborhood. In Life-like rules a cell counts how many of its 8 surrounding cells are alive.',
      'B3/S23 means: a dead cell is Born with exactly 3 live neighbors; a live cell Survives with 2 or 3. Every other case gives a dead cell.',
      'Use the Inspect tool in the workspace: it shows the neighborhood, the count, and the exact clause of the rule that applies.',
    ],
    demo: { build: () => presetById('blinker')!.build(), caption: 'Life (B3/S23), 5 × 5, fixed dead exterior; horizontal blinker in row 2.' },
    prediction: {
      id: 'p',
      question: 'Cell (2,1) is dead and sits just above the middle of the line. What will it be in generation 1?',
      options: ['Dead: it has 2 live neighbors', 'Alive: it has 3 live neighbors', 'Alive: it has 1 live neighbor'],
      answer: 1,
      explanation: '(1,2), (2,2) and (3,2) all touch (2,1), so it has 3 live neighbors and is born.',
    },
    mistake: {
      title: 'Counting the cell itself',
      text: 'In Life-like rules the center is not one of its own 8 neighbors. Its old state decides whether B or S applies, but it is never added to the count.',
    },
    exercise: { text: 'Predict one full Life generation by hand, then check it.', challengeId: 'CA-01' },
    check: [
      {
        id: 'c1',
        question: 'Under B3/S23 a live cell has 4 live neighbors. Next it is…',
        options: ['alive', 'dead'],
        answer: 1,
        explanation: '4 is not in the survival set {2, 3}.',
      },
      {
        id: 'c2',
        question: 'Under B36/S23 (HighLife) a dead cell has 6 live neighbors. Next it is…',
        options: ['alive', 'dead'],
        answer: 0,
        explanation: '6 is in the birth set {3, 6}.',
      },
    ],
    reflection: 'Explain one birth and one death in the blinker using neighbor counts.',
  },
  {
    id: 'L03-neighborhoods',
    version: 1,
    level: 2,
    title: 'Neighborhoods: Moore and von Neumann',
    objective: 'Distinguish the 8-cell Moore and 4-cell von Neumann neighborhoods and predict how the choice changes spreading.',
    explanation: [
      'The Moore neighborhood includes the 8 cells around a cell, diagonals included. The von Neumann neighborhood has only the 4 cells that share an edge.',
      'The demo is a spatial SIR model with β = 1 and γ = 0: every susceptible neighbor of an infected cell is infected for certain, and nobody recovers. With probabilities of exactly 0 and 1 the random draws cannot change anything, so the spread is deterministic.',
      'Switch the neighborhood in the workspace and compare the shapes after a few generations.',
    ],
    demo: {
      build: () =>
        familyModel('Spread with von Neumann neighbors', { id: 'spatial-sir/v1', beta: 1, gamma: 0, neighborhood: 'von-neumann-r1' }, 31, 31, [[15, 15, 1]]),
      seed: '1',
      caption: 'Spatial SIR, β = 1, γ = 0, von Neumann neighbors, 31 × 31, fixed susceptible exterior, one infected cell at (15,15).',
    },
    prediction: {
      id: 'p',
      question: 'After 3 generations, what shape do the infected cells form?',
      options: ['A 7 × 7 square', 'A diamond of 25 cells', 'A plus sign of 13 cells'],
      answer: 1,
      explanation:
        'With 4 edge neighbors, infection reaches every cell within 3 steps along rows and columns: |dx| + |dy| ≤ 3, a diamond of 25 cells. Moore neighbors would give the 7 × 7 square (49 cells).',
    },
    mistake: {
      title: 'Assuming diagonals always count',
      text: 'Whether diagonal cells are neighbors is a modeling choice. The same rule with different neighborhoods can behave very differently.',
    },
    exercise: { text: 'Change the demo to Moore neighbors and count the infected cells after 3 generations.' },
    check: [
      {
        id: 'c1',
        question: 'How many von Neumann neighbors does an interior cell have?',
        options: ['4', '8', '9'],
        answer: 0,
        explanation: 'Up, down, left and right.',
      },
      {
        id: 'c2',
        question: 'Live cells sit at (1,1) and (3,3). How many von Neumann neighbors of (2,2) are alive?',
        options: ['0', '1', '2'],
        answer: 0,
        explanation: 'Both are diagonal, so they are Moore neighbors but not von Neumann neighbors.',
      },
    ],
    reflection: 'Why might a modeler of disease spread prefer one neighborhood over the other? What does the choice assume about contact?',
  },
  {
    id: 'L04-boundaries',
    version: 1,
    level: 2,
    title: 'Boundaries: periodic and fixed exterior',
    objective: 'Explain how a periodic (torus) boundary and a fixed exterior change what cells see at the edges of a finite lattice.',
    explanation: [
      'A finite lattice has edges. Edge cells still need 8 neighbors, so the model must say what lies outside.',
      'Periodic: the lattice wraps around like a torus — off the right edge is the left edge, off the bottom is the top.',
      'Fixed exterior: every off-grid neighbor reads one constant state, such as dead. The edge cells themselves still update normally.',
    ],
    demo: { build: () => presetById('glider')!.build(), caption: 'Life (B3/S23), glider on a 32 × 32 torus (periodic boundary).' },
    prediction: {
      id: 'p',
      question: 'The glider moves one cell diagonally every 4 generations. Where is it after 128 generations?',
      options: ['Gone: it fell off the edge', 'Back exactly where it started', 'Stuck in a corner'],
      answer: 1,
      explanation: '128 generations move it 32 cells right and 32 down; on a 32 × 32 torus that is a full lap back to the start.',
    },
    mistake: {
      title: 'Thinking a fixed exterior freezes the border',
      text: 'A fixed exterior is about sampling outside the grid. The outermost cells inside the grid keep updating; only the imaginary cells beyond them are constant. With a dead exterior, a glider that reaches a corner of a 12 × 12 grid turns into a 2 × 2 block.',
    },
    exercise: { text: 'Diagnose a boundary difference and predict an edge transition.', challengeId: 'CA-04' },
    check: [
      {
        id: 'c1',
        question: 'On a 5 × 5 torus, which cell is the left neighbor of (0,2)?',
        options: ['(4,2)', 'none', 'the exterior state'],
        answer: 0,
        explanation: 'Periodic wrapping maps x = −1 to x = 4.',
      },
      {
        id: 'c2',
        question: 'Does a finite periodic lattice behave like an infinite plane?',
        options: ['Yes, always', 'No: patterns can meet themselves after wrapping'],
        answer: 1,
        explanation: 'A torus is finite. Anything that spreads eventually interacts with its own wrapped copy.',
      },
    ],
    reflection: 'Name one situation where a periodic boundary would mislead you, and one where a fixed exterior would.',
  },
  {
    id: 'L05-patterns',
    version: 1,
    level: 3,
    title: 'Still lifes, oscillators and gliders',
    objective: 'Recognize a still life, an oscillator and a moving pattern, and test the claim with exact state comparisons.',
    explanation: [
      'A still life never changes: generation 1 equals generation 0. A block (2 × 2) is the smallest.',
      'An oscillator returns to its starting state after a fixed period. The blinker has period 2: generation 2 equals generation 0, but generation 1 differs.',
      'A glider repeats its shape every 4 generations, shifted one cell diagonally. On a finite torus, the whole grid only repeats once the glider has also returned to its starting position.',
      'Equal population is not equal state: the blinker always has 3 live cells, but its cells change every generation.',
    ],
    demo: {
      build: () =>
        lifeModel(
          'Block, blinker and glider',
          24,
          24,
          [
            [2, 18],
            [3, 18],
            [2, 19],
            [3, 19],
            [17, 4],
            [18, 4],
            [19, 4],
            [13, 12],
            [14, 13],
            [12, 14],
            [13, 14],
            [14, 14],
          ],
          { kind: 'periodic' },
        ),
      caption:
        'Life (B3/S23), 24 × 24 torus: a block at (2–3, 18–19), a blinker at (17–19, 4) and a glider near (13, 13). The glider’s path never touches the other two.',
    },
    prediction: {
      id: 'p',
      question: 'The population stays at 12 for the first 100 generations. Does that mean nothing changes?',
      options: ['Yes — same count, same grid', 'No — the blinker flips and the glider moves'],
      answer: 1,
      explanation: 'Activity measures changed cells. Population can be constant while cells keep changing.',
    },
    mistake: { title: 'Using population to detect a still life', text: 'Compare whole grids, not counts. Use the Activity measure or exact state comparison.' },
    exercise: { text: 'Build a still life and a period-2 oscillator of your own.', challengeId: 'CA-02' },
    check: [
      {
        id: 'c1',
        question: 'Which statement defines a period-2 oscillator?',
        options: ['S0 = S1', 'S0 = S2 and S0 ≠ S1', 'Population(S0) = Population(S2)'],
        answer: 1,
        explanation: 'Exact state equality two steps apart, and a different state in between.',
      },
      { id: 'c2', question: 'Is the glider a still life?', options: ['Yes', 'No'], answer: 1, explanation: 'Its cells change every generation and it moves.' },
    ],
    reflection: 'How would you convince a classmate that your pattern is a still life, using only exact comparisons?',
  },
  {
    id: 'L06-elementary',
    version: 1,
    level: 3,
    title: 'Elementary rules: Rules 30 and 90',
    objective: 'Read an elementary rule number as eight output bits and compare Rules 30 and 90 from a single live cell.',
    explanation: [
      'An elementary CA is one row of cells. Each cell looks at its left neighbor, itself and its right neighbor: 3 bits, so 8 possible patterns.',
      'Write the outputs for patterns 111, 110, …, 000 as one 8-bit binary number: that is the rule number. Rule 90 = 01011010: the new cell is left XOR right.',
      'The picture shows time going down: each row is the next generation.',
      'Rule 90 from one cell draws a Sierpiński triangle: row g has 2^(number of 1-bits in g) live cells. Rule 30 grows an irregular, asymmetric pattern. Rule 30’s center column has been studied as a source of randomness (Wolfram, A New Kind of Science, 2002); this app does not test that claim.',
    ],
    demo: {
      build: () => ecaModel('Rule 90 from one cell', 90, single(129)),
      caption: 'Elementary Rule 90, 129 cells, fixed dead exterior, one live cell in the middle.',
    },
    prediction: {
      id: 'p',
      question: 'How many live cells are in generation 4?',
      options: ['2', '4', '5', '9'],
      answer: 0,
      explanation: '4 is 100 in binary: one 1-bit, so 2¹ = 2 live cells (at the two ends of the triangle).',
    },
    mistake: {
      title: 'Reading the bits in the wrong order',
      text: 'Bit 0 of the rule number is the output for 000, bit 7 is for 111. The editor lists 111 first, matching the binary number read left to right.',
    },
    exercise: { text: 'Encode a rule from its description.', challengeId: 'CA-05' },
    check: [
      {
        id: 'c1',
        question: 'Rule 0 applied to any row gives…',
        options: ['the same row', 'all zeros', 'all ones'],
        answer: 1,
        explanation: 'Every output bit is 0.',
      },
      {
        id: 'c2',
        question: 'Under Rule 30 (00011110), what does neighborhood 100 become?',
        options: ['0', '1'],
        answer: 1,
        explanation: '100 is pattern 4; bit 4 of 30 (binary 00011110) is 1.',
      },
    ],
    reflection: 'Rule 30 and Rule 90 differ in only a few output bits. What does that suggest about predicting behavior from the rule number?',
  },
  {
    id: 'L07-traffic',
    version: 1,
    level: 4,
    title: 'Synchronous updates and conservation: Rule 184 traffic',
    objective: 'Interpret Rule 184 as traffic, verify car conservation on a ring, and relate density to flow.',
    explanation: [
      'Read state 1 as a car and 0 as empty road. Rule 184 moves a car one cell right only if the cell ahead was empty in the old generation.',
      'All cars decide at the same time from the old road. Because a car can only move into a cell that was empty, cars never collide or vanish: on a periodic ring the car count is conserved.',
      'Flow is the number of cars that moved divided by the road length. Below half density, jams dissolve and every car moves, so flow equals density. Above half, flow is 1 − density.',
    ],
    demo: {
      build: () => ecaModel('Rule 184 traffic, 40% cars', 184, trafficPattern(200), { kind: 'periodic' }, ['Empty road', 'Car']),
      caption: 'Elementary Rule 184 on a 200-cell periodic ring, 40% cars in a fixed pattern.',
    },
    prediction: {
      id: 'p',
      question: 'At 40% density, after the jams dissolve, what fraction of cars move each step?',
      options: ['About 40%', 'All of them', 'None'],
      answer: 1,
      explanation: 'With fewer than half the cells occupied, every car eventually has an empty cell ahead, so flow settles at 0.4 = density: all cars move.',
    },
    mistake: {
      title: 'Using a fixed exterior for a ring road',
      text: 'With a fixed exterior, cars leave at one end and appear at the other only if the exterior supplies them. The car count is no longer conserved, and flow is not comparable.',
    },
    exercise: { text: 'Run a density sweep and plot flow.', challengeId: 'CA-07' },
    check: [
      {
        id: 'c1',
        question: 'Why are cars conserved on the ring?',
        options: ['Because updates are synchronous and a car only moves into a cell that was empty', 'Because the rule number is even'],
        answer: 0,
        explanation: 'Every move empties one cell and fills one cell that was empty.',
      },
      {
        id: 'c2',
        question: 'At density 0.8 in steady state, flow is about…',
        options: ['0.8', '0.2', '0.5'],
        answer: 1,
        explanation: 'Above half density only the empty cells (1 − 0.8) let a car move.',
      },
    ],
    reflection: 'What would change if cars updated one at a time from left to right instead of all at once?',
  },
  {
    id: 'L08-stochastic-sir',
    version: 1,
    level: 5,
    title: 'Randomness, seeds and replication: spatial SIR',
    objective: 'Explain how a seed makes a random run reproducible, and why one run cannot show how variable the outcome is.',
    explanation: [
      'In spatial SIR, a susceptible cell with k infected neighbors becomes infected with probability 1 − (1 − β)^k; an infected cell recovers with probability γ each generation.',
      'The app draws exactly two random numbers per cell per generation from a stream started by the transition seed. The same seed and the same starting grid always give the same run.',
      'Different seeds give different runs. With β = 0.15 and γ = 0.3, the outbreak sometimes dies out in the first few generations and sometimes reaches most of the lattice. One run tells you what can happen, not how often.',
    ],
    demo: {
      build: () =>
        familyModel('SIR: does it spread?', { id: 'spatial-sir/v1', beta: 0.15, gamma: 0.3, neighborhood: 'moore-r1' }, 48, 48, [[24, 24, 1]], {
          kind: 'periodic',
        }),
      seed: '1',
      caption:
        'Spatial SIR, β = 0.15, γ = 0.3, Moore neighbors, 48 × 48 torus, one infected cell at (24,24), transition seed 1. With seed 1 the outbreak reaches 2,215 cells; with seed 11 it ends after one generation.',
    },
    prediction: {
      id: 'p',
      question: 'You rerun the demo with seed 11 instead of 1. What happens?',
      options: ['Exactly the same run', 'A different run — this one dies out almost immediately', 'The model refuses to run'],
      answer: 1,
      explanation: 'A new seed is a new random stream. With seed 11 the single infected cell recovers before infecting anyone.',
    },
    mistake: {
      title: 'Treating generations as replications',
      text: 'Ten generations of one run are not ten independent observations. To measure variability, run independent replicates with different seeds.',
    },
    exercise: { text: 'Reproduce a classmate’s stochastic run exactly.', challengeId: 'CA-06' },
    check: [
      {
        id: 'c1',
        question: 'With 2 infected neighbors and β = 0.5, what is the infection probability?',
        options: ['0.5', '0.75', '1'],
        answer: 1,
        explanation: '1 − (1 − 0.5)² = 0.75.',
      },
      {
        id: 'c2',
        question: 'Is “no infected cells” permanent when the exterior is fixed as infected?',
        options: ['Yes', 'No — the exterior keeps infecting edge cells'],
        answer: 1,
        explanation: 'Extinction is only absorbing without an outside source of infection.',
      },
    ],
    reflection: 'What exactly would someone need from you to reproduce one of your stochastic runs?',
  },
  {
    id: 'L09-count-rules',
    version: 1,
    level: 4,
    title: 'Writing your own rule as a count table',
    objective: 'Write a complete, non-overlapping count rule and explain how the validator finds conflicts.',
    explanation: [
      'A count table lists clauses: “if the cell is in one of these states, and these neighbor counts are in range, it becomes state X”.',
      'Clauses must not overlap — even when they agree. There is no first-match-wins. A default (keep the current state, or become a given state) covers every case no clause matches.',
      'The validator enumerates every possible neighbor count for every state and reports overlapping clauses and clauses that can never apply.',
      'The demo is majority vote: become Yes with 5–8 Yes neighbors, No with 0–3, otherwise keep the current state.',
    ],
    demo: {
      build: () => presetById('majority-vote')!.build(),
      caption: 'Count table (2 states, Moore): 5–8 Yes → Yes; 0–3 Yes → No; default keep. 64 × 64 torus, random 50/50 start (seed “vote”).',
    },
    prediction: {
      id: 'p',
      question: 'A No cell has exactly 4 Yes neighbors. What happens?',
      options: ['It becomes Yes', 'It stays No', 'The rule is invalid'],
      answer: 1,
      explanation: '4 matches no clause, so the default applies: keep the current state.',
    },
    mistake: {
      title: 'Relying on clause order',
      text: 'Two clauses that match the same case are an error here, even if one appears first. Narrow the ranges so each case has at most one clause.',
    },
    exercise: { text: 'Repair an invalid rule table.', challengeId: 'CA-09' },
    check: [
      {
        id: 'c1',
        question: 'Clause 1: state 0 with 2–4 neighbors in state 1 → 1. Clause 2: state 0 with 4–6 neighbors in state 1 → 1. Valid?',
        options: ['Yes, they agree', 'No, they overlap at 4'],
        answer: 1,
        explanation: 'Agreement does not excuse overlap; the case “4 neighbors” has two clauses.',
      },
      {
        id: 'c2',
        question: 'With von Neumann neighbors, can a clause require 3 neighbors in state 1 and 2 in state 2?',
        options: ['Yes', 'No — that needs 5 neighbors'],
        answer: 1,
        explanation: 'There are only 4 neighbors, so the clause can never apply.',
      },
    ],
    reflection: 'Why might “no first-match-wins” make rules easier to read and check?',
  },
  {
    id: 'L10-forest-fire',
    version: 1,
    level: 5,
    title: 'Forest fire: probabilities per cell and per generation',
    objective: 'Explain the forest-fire rule, the meaning of p and f, and why “no fire right now” is not the same as “fire is gone forever”.',
    explanation: [
      'States: empty, tree, burning. Burning becomes empty. An empty cell grows a tree with probability p. A tree next to fire ignites; otherwise lightning ignites it with probability f.',
      'p and f are per cell per generation — not per minute or per hectare. They have no real-world units unless you calibrate them.',
      'With p = f = 0 the model is deterministic: a fire front moves exactly one cell per generation through a full forest. With f > 0 a lattice without fire can catch fire again later, so “first generation with no fire” is a stopping policy, not extinction.',
    ],
    demo: {
      build: () => presetById('fire-front')!.build(),
      seed: '1',
      caption: 'Forest fire, p = 0, f = 0, von Neumann neighbors, 64 × 32 full forest with the left column burning, fixed empty exterior.',
    },
    prediction: {
      id: 'p',
      question: 'How far does the front move per generation?',
      options: ['One column', 'Two columns', 'It depends on the seed'],
      answer: 0,
      explanation: 'Each burning cell ignites its neighbors for certain and burns out; nothing is random when p = f = 0.',
    },
    mistake: {
      title: 'Calling a quiet moment “extinction”',
      text: 'If lightning can strike (f > 0), zero burning cells now says nothing about later. Use a fixed horizon, or label the no-fire stop as a policy.',
    },
    exercise: { text: 'Open the forest-fire regrowth preset and watch tree cover rise and fall. Then design a replicated experiment on f.' },
    check: [
      {
        id: 'c1',
        question: 'Can a tree that just grew ignite in the same generation?',
        options: ['Yes', 'No'],
        answer: 1,
        explanation: 'All transitions read the old generation, where that cell was empty.',
      },
      {
        id: 'c2',
        question: 'p = 0.01 means…',
        options: ['1% of the forest grows per minute', 'each empty cell grows a tree with probability 0.01 per generation'],
        answer: 1,
        explanation: 'Probabilities are per cell per generation.',
      },
    ],
    reflection: 'How would you decide whether a model generation should represent a day, a week or nothing in particular?',
  },
  {
    id: 'L11-excitable-cyclic',
    version: 1,
    level: 3,
    title: 'Excitable and cyclic media: Brian’s Brain and cyclic CA',
    objective: 'Describe refractory states and cyclic succession, and explain how they produce moving structures and waves.',
    explanation: [
      'Brian’s Brain has three states: ready, firing and refractory. A ready cell fires with exactly 2 firing neighbors; firing becomes refractory; refractory becomes ready. Refractory cells do not count as firing.',
      'The refractory state stops waves from flowing backwards, so structures move. In the demo, two firing cells with two refractory cells behind them travel one cell per generation.',
      'In a cyclic CA, states form a cycle 0 → 1 → … → K−1 → 0. A cell advances when enough neighbors are already in its next state. From random noise, waves and spirals can organize; on a small lattice one phase may take over instead.',
    ],
    demo: {
      build: () => presetById('brain-glider')!.build(),
      caption: 'Brian’s Brain, 32 × 32 torus: firing cells at (15,20) and (16,20), refractory cells at (15,21) and (16,21).',
    },
    prediction: {
      id: 'p',
      question: 'Which way does the 2 × 2 structure move?',
      options: ['Up, away from the refractory cells', 'Down, toward the refractory cells', 'It stays in place'],
      answer: 0,
      explanation: 'The ready cells above the firing pair each see exactly 2 firing neighbors and fire; the cells below are refractory and cannot fire.',
    },
    mistake: { title: 'Counting refractory cells as active', text: 'Only firing cells count. A ready cell surrounded by refractory cells stays ready.' },
    exercise: { text: 'Open “Cyclic CA from noise” and watch activity in the Analytics panel as waves form.' },
    check: [
      {
        id: 'c1',
        question: 'In a cyclic CA with K = 4, which state does state 3 advance to?',
        options: ['4', '0', '2'],
        answer: 1,
        explanation: 'The cycle wraps: (3 + 1) mod 4 = 0.',
      },
      {
        id: 'c2',
        question: 'A ready Brian’s Brain cell has 3 firing neighbors. Next it is…',
        options: ['firing', 'ready'],
        answer: 1,
        explanation: 'It needs exactly 2.',
      },
    ],
    reflection: 'Why does a refractory state make a wave travel in one direction?',
  },
  {
    id: 'L12-experiments',
    version: 1,
    level: 6,
    title: 'Designing a computational experiment',
    objective: 'Plan a sweep with a question, a hypothesis, independent replicates and a stated analysis window, and report uncertainty honestly.',
    explanation: [
      'Start with a question and a hypothesis. Choose one factor to vary (or two) and keep everything else fixed — the experiment freezes one model revision.',
      'Use independent replicates for random models: each run gets its own derived seed. Summaries describe variation across runs, never across generations of one run.',
      'Choose how each run is summarized: its final value, its mean over a window, or the time until an event. If some runs never reach the event, they are censored — counted separately, not averaged in.',
      'Report the mean, spread and a 95% interval, but also say what the interval assumes, how many runs you had, and what you did not test.',
    ],
    demo: {
      build: () => presetById('sir-outbreak')!.build(),
      seed: '1',
      caption:
        'Spatial SIR preset, β = 0.3, γ = 0.1, 64 × 64 torus, transition seed 1. Use the Experiment button in the workspace to sweep β with 10 replicates.',
    },
    prediction: {
      id: 'p',
      question: 'You record 10 generations of one run. Is that 10 replications?',
      options: ['Yes', 'No — they are correlated steps of one run'],
      answer: 1,
      explanation: 'Replications are independent runs with different seeds.',
    },
    mistake: {
      title: 'Changing two things at once',
      text: 'If the baseline and the alternative differ in both β and boundary, you cannot tell which caused the difference.',
    },
    exercise: { text: 'Compare two spread assumptions with replicated experiments.', challengeId: 'CA-08' },
    check: [
      {
        id: 'c1',
        question: 'A deterministic model run 10 times from the same grid gives…',
        options: ['10 independent outcomes', 'the same outcome 10 times, with no statistical uncertainty'],
        answer: 1,
        explanation: 'Only varying the seed or initial grid creates variation.',
      },
      {
        id: 'c2',
        question: '3 of 10 runs did not reach extinction by the horizon. Their extinction time is…',
        options: ['the horizon', 'zero', 'censored: unknown but later than the horizon'],
        answer: 2,
        explanation: 'Censored runs are reported separately; averaging them in as any number would be fabricated.',
      },
    ],
    reflection: 'Write one limitation that any conclusion from your experiment must mention.',
  },
];

export const lessonById = (id: string) => LESSONS.find((l) => l.id === id);
