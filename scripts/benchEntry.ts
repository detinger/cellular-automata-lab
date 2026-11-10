// Engine throughput benchmark. Bundled and run by scripts/bench.mjs.
import { createEngine } from '../src/domain/engine/engine';
import { randomInitialize } from '../src/domain/random/seeded';
import { familyModel } from '../src/data/presets';
import type { RuleSpec } from '../src/domain/contracts/model';

const cases: Array<{ name: string; rule: RuleSpec; probs: number[] }> = [
  { name: 'Life B3/S23', rule: { id: 'life-like/v1', birth: [3], survive: [2, 3] }, probs: [0.7, 0.3] },
  { name: "Brian's Brain", rule: { id: 'brians-brain/v1' }, probs: [0.8, 0.1, 0.1] },
  { name: 'Cyclic K=14 T=1 vN', rule: { id: 'cyclic/v1', states: 14, threshold: 1, neighborhood: 'von-neumann-r1' }, probs: Array(14).fill(1 / 14) },
  { name: 'Forest fire', rule: { id: 'forest-fire/v1', growth: 0.02, ignition: 0.0001, neighborhood: 'moore-r1' }, probs: [0.5, 0.5, 0] },
  { name: 'Spatial SIR', rule: { id: 'spatial-sir/v1', beta: 0.3, gamma: 0.1, neighborhood: 'moore-r1' }, probs: [0.99, 0.01, 0] },
  {
    name: 'Count table (Life)',
    rule: {
      id: 'count-table/v1',
      states: 2,
      neighborhood: 'moore-r1',
      clauses: [
        { currentStates: [0], counts: [{ state: 1, min: 3, max: 3 }], nextState: 1 },
        { currentStates: [1], counts: [{ state: 1, min: 2, max: 3 }], nextState: 1 },
      ],
      fallback: { kind: 'state', state: 0 },
    },
    probs: [0.7, 0.3],
  },
];

export function run(sizes: number[], seconds: number) {
  const rows: Array<{ rule: string; size: number; gensPerSecond: number; cellUpdatesPerSecond: number }> = [];
  for (const c of cases) {
    for (const n of sizes) {
      const m = familyModel('bench', c.rule, n, n, randomInitialize(new Uint8Array(n * n), n, n, c.probs, 'bench'), { kind: 'periodic' });
      const e = createEngine(m, { transitionSeed: 'bench' });
      e.step(3); // warm up
      let gens = 0;
      const t0 = performance.now();
      while (performance.now() - t0 < seconds * 1000) {
        e.step();
        gens++;
      }
      const s = (performance.now() - t0) / 1000;
      rows.push({ rule: c.name, size: n, gensPerSecond: gens / s, cellUpdatesPerSecond: (gens * n * n) / s });
    }
  }
  return rows;
}
