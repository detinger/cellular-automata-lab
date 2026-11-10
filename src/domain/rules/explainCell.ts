// Cell inspector for every 2D family (PLAN.md §3.1, §3.4). Uses the same semantics as the engine.
// Deterministic families get the exact next state and clause; stochastic families get a probability
// preview, and — for an observed step — the recorded draws, without consuming any random values.
import type { Model, Neighborhood } from '../contracts/model';
import { MOORE_R1, sampleNeighbor, type Sample } from '../lattice/neighborhood';
import { explainTransition } from './explain';
import { clauseMatches, neighborCount } from './countTable';

export const VON_NEUMANN_R1: ReadonlyArray<readonly [number, number]> = [
  [0, -1],
  [-1, 0],
  [1, 0],
  [0, 1],
];

export const neighborhoodOf = (model: Model): Neighborhood => ('neighborhood' in model.rule ? model.rule.neighborhood : 'moore-r1');

export interface CellExplanation {
  x: number;
  y: number;
  current: number;
  neighborhood: Neighborhood;
  samples: Sample[];
  /** Neighbor count per state ID. */
  counts: number[];
  /** Deterministic: probability 1 on one state. Stochastic: probability per next state. */
  next: { kind: 'deterministic'; state: number } | { kind: 'stochastic'; probabilities: number[] };
  /** The rule clause that applies, in words. */
  clause: string;
  summary: string;
}

export interface ObservedTransition {
  /** Generation whose cells the explanation reads; the cell's observed state is in sourceGeneration + 1. */
  sourceGeneration: number;
  explanation: CellExplanation;
  draws: [number, number] | null;
  observedNext: number;
  /** How the recorded draw produced the observed outcome. */
  drawText: string | null;
}

const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toPrecision(4).replace(/\.?0+$/, ''));

export function explainCell(model: Model, cells: Uint8Array, x: number, y: number): CellExplanation | null {
  const { width, height, rule, stateLabels: L } = model;
  if (x < 0 || y < 0 || x >= width || y >= height || rule.id === 'elementary/v1') return null;
  const neighborhood = neighborhoodOf(model);
  const offsets = neighborhood === 'moore-r1' ? MOORE_R1 : VON_NEUMANN_R1;
  const samples = offsets.map(([dx, dy]) => sampleNeighbor(cells, width, height, model.boundary, x, y, dx, dy));
  const counts = new Array<number>(model.stateCount).fill(0);
  for (const s of samples) counts[s.state]++;
  const c = cells[y * width + x];
  const name = (s: number) => `${L[s] ?? `state ${s}`}`;
  const det = (state: number, clause: string, summary: string): CellExplanation => ({
    x,
    y,
    current: c,
    neighborhood,
    samples,
    counts,
    next: { kind: 'deterministic', state },
    clause,
    summary,
  });
  const sto = (probabilities: number[], clause: string, summary: string): CellExplanation => ({
    x,
    y,
    current: c,
    neighborhood,
    samples,
    counts,
    next: { kind: 'stochastic', probabilities },
    clause,
    summary,
  });
  const probs = (pairs: Array<[number, number]>) => {
    const p = new Array<number>(model.stateCount).fill(0);
    for (const [s, v] of pairs) p[s] += v;
    return p;
  };

  switch (rule.id) {
    case 'life-like/v1': {
      const e = explainTransition(model, cells, x, y)!;
      return det(e.next, e.clause, e.summary);
    }
    case 'brians-brain/v1': {
      if (c === 1) return det(2, `${name(1)} → ${name(2)}`, 'A firing cell always becomes refractory.');
      if (c === 2) return det(0, `${name(2)} → ${name(0)}`, 'A refractory cell always becomes ready.');
      const f = counts[1];
      return f === 2
        ? det(1, `Exactly 2 ${name(1).toLowerCase()} neighbors`, `A ready cell with exactly two firing neighbors fires. Refractory neighbors do not count.`)
        : det(
            0,
            `${f} ${name(1).toLowerCase()} neighbor${f === 1 ? '' : 's'}, not exactly 2`,
            `A ready cell fires only with exactly two firing neighbors, so it stays ready.`,
          );
    }
    case 'cyclic/v1': {
      const t = (c + 1) % rule.states,
        n = counts[t];
      return n >= rule.threshold
        ? det(
            t,
            `${n} neighbor${n === 1 ? '' : 's'} in the next state ${name(t)} ≥ threshold ${rule.threshold}`,
            `The cell advances one step around the cycle to ${name(t)}.`,
          )
        : det(
            c,
            `${n} neighbor${n === 1 ? '' : 's'} in the next state ${name(t)} < threshold ${rule.threshold}`,
            `Only neighbors in the next state count. The cell keeps ${name(c)}.`,
          );
    }
    case 'count-table/v1': {
      const i = rule.clauses.findIndex((cl) => clauseMatches(cl, c, counts));
      const n = neighborCount(rule.neighborhood);
      const tuple = counts.map((v, s) => `${v} ${name(s)}`).join(', ');
      if (i >= 0) {
        const cl = rule.clauses[i];
        const cond = cl.counts.length ? cl.counts.map((k) => `${k.min}–${k.max} × ${name(k.state)}`).join(', ') : 'any neighbors';
        return det(
          cl.nextState,
          `Clause ${i + 1}: current ∈ {${cl.currentStates.map(name).join(', ')}}, ${cond} → ${name(cl.nextState)}`,
          `The ${n} neighbors are ${tuple}. Exactly one clause applies (clauses never overlap).`,
        );
      }
      const next = rule.fallback.kind === 'keep-current' ? c : rule.fallback.state;
      return det(
        next,
        `No clause applies → default (${rule.fallback.kind === 'keep-current' ? 'keep current state' : name(next)})`,
        `The ${n} neighbors are ${tuple}.`,
      );
    }
    case 'forest-fire/v1': {
      const p = rule.growth,
        f = rule.ignition;
      if (c === 2) return det(0, `${name(2)} → ${name(0)}`, 'Fire lasts exactly one generation.');
      if (c === 0)
        return sto(
          probs([
            [1, p],
            [0, 1 - p],
          ]),
          `${name(0)} grows a tree with probability p = ${fmt(p)}`,
          'Growth uses draw u0. A new tree cannot ignite in the same generation.',
        );
      if (counts[2] > 0) return det(2, `${counts[2]} burning neighbor${counts[2] === 1 ? '' : 's'}`, 'A tree next to fire always ignites.');
      return sto(
        probs([
          [2, f],
          [1, 1 - f],
        ]),
        `No burning neighbor; lightning with probability f = ${fmt(f)}`,
        'Spontaneous ignition uses draw u1.',
      );
    }
    case 'spatial-sir/v1': {
      if (c === 2) return det(2, `${name(2)} stays ${name(2).toLowerCase()}`, 'There is no waning immunity in this model.');
      if (c === 1)
        return sto(
          probs([
            [2, rule.gamma],
            [1, 1 - rule.gamma],
          ]),
          `Recovery with probability γ = ${fmt(rule.gamma)}`,
          'Recovery uses draw u1.',
        );
      const k = counts[1];
      let keep = 1;
      for (let i = 0; i < k; i++) keep *= 1 - rule.beta; // same fixed multiplication sequence as the engine
      const pInf = k === 0 ? 0 : 1 - keep;
      return k === 0
        ? det(0, 'No infected neighbors', 'Infection needs at least one infected neighbor; there is no outside infection.')
        : sto(
            probs([
              [1, pInf],
              [0, 1 - pInf],
            ]),
            `${k} infected neighbor${k === 1 ? '' : 's'}: P = 1 − (1 − β)^${k} = ${fmt(pInf)}`,
            `With β = ${fmt(rule.beta)} per infected neighbor. Infection uses draw u0.`,
          );
    }
  }
}

/** Explains the step that produced `observedNext` from `prevCells`, using the recorded draws. */
export function explainObserved(
  model: Model,
  prevCells: Uint8Array,
  x: number,
  y: number,
  draws: [number, number] | null,
  observedNext: number,
  sourceGeneration: number,
): ObservedTransition | null {
  const explanation = explainCell(model, prevCells, x, y);
  if (!explanation) return null;
  let drawText: string | null = null;
  if (draws && model.rule.id === 'forest-fire/v1') {
    const [u0, u1] = draws,
      c = explanation.current;
    if (c === 0)
      drawText = `u0 = ${fmt(u0)} ${u0 < model.rule.growth ? '<' : '≥'} p = ${fmt(model.rule.growth)}, so ${u0 < model.rule.growth ? 'a tree grew' : 'no tree grew'}.`;
    else if (c === 1 && explanation.counts[2] === 0)
      drawText = `u1 = ${fmt(u1)} ${u1 < model.rule.ignition ? '<' : '≥'} f = ${fmt(model.rule.ignition)}, so ${u1 < model.rule.ignition ? 'lightning struck' : 'no lightning'}.`;
    else drawText = 'This transition was certain; both draws were still consumed and discarded.';
  } else if (draws && model.rule.id === 'spatial-sir/v1') {
    const [u0, u1] = draws,
      c = explanation.current;
    const p = explanation.next.kind === 'stochastic' ? explanation.next.probabilities[c === 0 ? 1 : 2] : 0;
    if (c === 0 && explanation.counts[1] > 0)
      drawText = `u0 = ${fmt(u0)} ${u0 < p ? '<' : '≥'} ${fmt(p)}, so the cell ${u0 < p ? 'was infected' : 'stayed susceptible'}.`;
    else if (c === 1)
      drawText = `u1 = ${fmt(u1)} ${u1 < model.rule.gamma ? '<' : '≥'} γ = ${fmt(model.rule.gamma)}, so the cell ${u1 < model.rule.gamma ? 'recovered' : 'stayed infected'}.`;
    else drawText = 'This transition was certain; both draws were still consumed and discarded.';
  }
  return { sourceGeneration, explanation, draws, observedNext, drawText };
}
