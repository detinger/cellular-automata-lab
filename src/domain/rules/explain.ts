// Transition explanations (PLAN.md §3.1 inspector, §3.4). Uses the same table as the engine.
import type { Model } from '../contracts/model';
import { MOORE_R1, sampleNeighbor, type Sample } from '../lattice/neighborhood';
import { formatLifeLike, lifeLikeTable } from './lifeLike';

export interface TransitionExplanation {
  x: number;
  y: number;
  current: number;
  next: number;
  samples: Sample[];
  liveNeighbors: number;
  clause: string;
  summary: string;
}

export function explainTransition(model: Model, cells: Uint8Array, x: number, y: number): TransitionExplanation | null {
  if (model.rule.id !== 'life-like/v1') return null;
  if (x < 0 || y < 0 || x >= model.width || y >= model.height) return null;
  const rule = model.rule;
  const samples = MOORE_R1.map(([dx, dy]) => sampleNeighbor(cells, model.width, model.height, model.boundary, x, y, dx, dy));
  const n = samples.reduce((s, v) => s + v.state, 0);
  const current = cells[y * model.width + x];
  const next = lifeLikeTable(rule)[current * 9 + n];
  const notation = formatLifeLike(rule);
  let clause: string;
  if (current === 0) {
    clause =
      next === 1 ? `Birth: ${n} is in the birth set B{${rule.birth.join(',')}}` : `No birth: ${n} is not in the birth set B{${rule.birth.join(',') || '∅'}}`;
  } else {
    clause =
      next === 1
        ? `Survival: ${n} is in the survival set S{${rule.survive.join(',')}}`
        : `Death: ${n} is not in the survival set S{${rule.survive.join(',') || '∅'}}`;
  }
  const label = (s: number) => (model.stateLabels[s] ?? String(s)).toLowerCase();
  const article = /^[aeiou]/.test(label(current)) ? 'an' : 'a';
  const summary = `Under ${notation}, ${article} ${label(current)} cell with ${n} live neighbor${n === 1 ? '' : 's'} becomes ${label(next)}.`;
  return { x, y, current, next, samples, liveNeighbors: n, clause, summary };
}

export interface ElementaryExplanation {
  x: number;
  left: { state: number; source: number | null; wrapped: boolean };
  center: number;
  right: { state: number; source: number | null; wrapped: boolean };
  pattern: number;
  next: number;
  ruleNumber: number;
  summary: string;
}

/** Explains one ECA cell update from a source row (one generation) — the exact rule bit used. */
export function explainElementary(model: Model, row: Uint8Array, x: number): ElementaryExplanation | null {
  if (model.rule.id !== 'elementary/v1' || x < 0 || x >= model.width) return null;
  const w = model.width;
  const side = (nx: number) => {
    if (nx >= 0 && nx < w) return { state: row[nx], source: nx, wrapped: false };
    if (model.boundary.kind === 'periodic') {
      const s = (nx + w) % w;
      return { state: row[s], source: s, wrapped: true };
    }
    return { state: model.boundary.state, source: null, wrapped: false };
  };
  const left = side(x - 1),
    right = side(x + 1),
    center = row[x];
  const pattern = (left.state << 2) | (center << 1) | right.state;
  const ruleNumber = model.rule.ruleNumber;
  const next = (ruleNumber >>> pattern) & 1;
  const bits = `${left.state}${center}${right.state}`;
  const summary = `Neighborhood ${bits} is pattern ${pattern} (4×${left.state} + 2×${center} + ${right.state}). Bit ${pattern} of rule ${ruleNumber} (binary ${ruleNumber.toString(2).padStart(8, '0')}) is ${next}, so the cell becomes ${next}.`;
  return { x, left, center, right, pattern, next, ruleNumber, summary };
}
