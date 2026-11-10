// Family defaults and conversion between 2D families. Switching family keeps the
// lattice and maps out-of-range cells to state 0; the editor reports how many cells changed.
import type { Boundary, CountClause, Model, RuleSpec } from '../contracts/model';

export type TwoDFamily = Exclude<RuleSpec['id'], 'elementary/v1'>;

export const TWO_D_FAMILIES: ReadonlyArray<{ id: TwoDFamily; label: string; blurb: string }> = [
  { id: 'life-like/v1', label: 'Life-like (B/S)', blurb: 'Two states; birth and survival sets over 8 neighbors.' },
  { id: 'brians-brain/v1', label: "Brian's Brain", blurb: 'Ready, firing, refractory. Fires with exactly two firing neighbors.' },
  { id: 'cyclic/v1', label: 'Cyclic CA', blurb: 'K states in a cycle; advance when enough neighbors are one step ahead.' },
  { id: 'forest-fire/v1', label: 'Forest fire (stochastic)', blurb: 'Trees grow with probability p, ignite from neighbors or lightning f.' },
  { id: 'spatial-sir/v1', label: 'Spatial SIR (stochastic)', blurb: 'Susceptible, infected, recovered with per-neighbor infection β and recovery γ.' },
  { id: 'count-table/v1', label: 'Count rule table', blurb: 'Your own rule: clauses on neighbor counts by state.' },
];

export const DEFAULT_TABLE_CLAUSES: CountClause[] = [
  { currentStates: [0], counts: [{ state: 1, min: 3, max: 3 }], nextState: 1 },
  { currentStates: [1], counts: [{ state: 1, min: 2, max: 3 }], nextState: 1 },
];

export function defaultRule(id: TwoDFamily, states?: number): RuleSpec {
  switch (id) {
    case 'life-like/v1':
      return { id, birth: [3], survive: [2, 3] };
    case 'brians-brain/v1':
      return { id };
    case 'cyclic/v1':
      return { id, states: states ?? 8, threshold: 3, neighborhood: 'moore-r1' };
    case 'forest-fire/v1':
      return { id, growth: 0.01, ignition: 0.0001, neighborhood: 'moore-r1' };
    case 'spatial-sir/v1':
      return { id, beta: 0.25, gamma: 0.1, neighborhood: 'moore-r1' };
    case 'count-table/v1':
      return { id, states: states ?? 2, neighborhood: 'moore-r1', clauses: structuredClone(DEFAULT_TABLE_CLAUSES), fallback: { kind: 'state', state: 0 } };
  }
}

export function defaultLabels(rule: RuleSpec): string[] {
  switch (rule.id) {
    case 'life-like/v1':
      return ['Dead', 'Alive'];
    case 'elementary/v1':
      return ['Off', 'On'];
    case 'brians-brain/v1':
      return ['Ready', 'Firing', 'Refractory'];
    case 'forest-fire/v1':
      return ['Empty', 'Tree', 'Burning'];
    case 'spatial-sir/v1':
      return ['Susceptible', 'Infected', 'Recovered'];
    case 'cyclic/v1':
      return Array.from({ length: rule.states }, (_, s) => `State ${s}`);
    case 'count-table/v1':
      return Array.from({ length: rule.states }, (_, s) => (s === 0 ? 'Empty' : `State ${s}`));
  }
}

export const stateCountOf = (rule: RuleSpec): number =>
  rule.id === 'cyclic/v1' || rule.id === 'count-table/v1' ? rule.states : rule.id === 'life-like/v1' || rule.id === 'elementary/v1' ? 2 : 3;

/**
 * Returns `model` with `rule`, adjusting the state count, labels (kept where the count is unchanged
 * and the family is the same), cells and boundary. `changedCells` counts cells mapped to state 0.
 */
export function withRule(model: Model, rule: RuleSpec): { model: Model; changedCells: number; boundaryChanged: boolean } {
  const K = stateCountOf(rule);
  const sameFamily = model.rule.id === rule.id;
  let labels: string[];
  if (sameFamily && K === model.stateCount) labels = [...model.stateLabels];
  else if (sameFamily) labels = defaultLabels(rule).map((d, s) => model.stateLabels[s] ?? d);
  else labels = defaultLabels(rule);
  const initial = new Uint8Array(model.initial);
  let changedCells = 0;
  for (let i = 0; i < initial.length; i++)
    if (initial[i] >= K) {
      initial[i] = 0;
      changedCells++;
    }
  let boundary: Boundary = { ...model.boundary };
  let boundaryChanged = false;
  if (boundary.kind === 'fixed-exterior' && boundary.state >= K) {
    boundary = { kind: 'fixed-exterior', state: 0 };
    boundaryChanged = true;
  }
  return { model: { ...model, rule, stateCount: K, stateLabels: labels, initial, boundary }, changedCells, boundaryChanged };
}

const p = (v: number) => String(+v.toPrecision(4));
const nb = (n: string) => (n === 'moore-r1' ? 'Moore' : 'von Neumann');

/** Short human-readable rule summary for status panels, cards and reports. */
export function ruleSummary(rule: RuleSpec): string {
  switch (rule.id) {
    case 'life-like/v1':
      return `B${rule.birth.join('')}/S${rule.survive.join('')}`;
    case 'elementary/v1':
      return `Rule ${rule.ruleNumber}`;
    case 'brians-brain/v1':
      return "Brian's Brain";
    case 'cyclic/v1':
      return `Cyclic K=${rule.states}, T=${rule.threshold}, ${nb(rule.neighborhood)}`;
    case 'forest-fire/v1':
      return `Forest fire p=${p(rule.growth)}, f=${p(rule.ignition)}, ${nb(rule.neighborhood)}`;
    case 'spatial-sir/v1':
      return `SIR β=${p(rule.beta)}, γ=${p(rule.gamma)}, ${nb(rule.neighborhood)}`;
    case 'count-table/v1':
      return `Count table, ${rule.states} states, ${rule.clauses.length} clause${rule.clauses.length === 1 ? '' : 's'}, ${nb(rule.neighborhood)}`;
  }
}
