// Declarative count rule — count-table/v1. Data only: no expressions or code.
// Validation enumerates every reachable (center state, neighbor count tuple) case, rejects
// overlapping or unreachable clauses, and compiles the result to a bounded lookup.
import type { CountClause, Neighborhood, RuleSpec } from '../contracts/model';
import type { ValidationIssue } from '../contracts/validation';

export type CountTableRule = Extract<RuleSpec, { id: 'count-table/v1' }>;

export const COUNT_TABLE_LIMITS = { minStates: 2, maxStates: 8, maxClauses: 256, maxCases: 65_536 } as const;

export const neighborCount = (n: Neighborhood) => (n === 'moore-r1' ? 8 : 4);

/** Weight of one neighbor in state s inside the mixed-radix count code: (n+1)^s. */
export const countWeights = (states: number, n: number) => Array.from({ length: states }, (_, s) => (n + 1) ** s);

export interface CompiledCountTable {
  states: number;
  neighbors: number;
  weights: Int32Array;
  /** Next state for key = code * states + center; 255 = unreachable. Dense when small, else a Map. */
  dense: Uint8Array | null;
  sparse: Map<number, number> | null;
  /** Clause index used per key (−1 = default). Same keying; used by the inspector only. */
  clauseOf: Map<number, number>;
  cases: number;
}

/** All count tuples (length `states`) of non-negative integers summing to `n`. */
export function* countTuples(states: number, n: number): Generator<number[]> {
  const t = new Array<number>(states).fill(0);
  function* rec(i: number, left: number): Generator<number[]> {
    if (i === states - 1) {
      t[i] = left;
      yield [...t];
      return;
    }
    for (let v = 0; v <= left; v++) {
      t[i] = v;
      yield* rec(i + 1, left - v);
    }
  }
  yield* rec(0, n);
}

const binom = (n: number, k: number) => {
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return Math.round(r);
};
/** Number of (center, tuple) cases: states × C(n + states − 1, states − 1). */
export const caseCount = (states: number, n: number) => states * binom(n + states - 1, states - 1);

export const clauseMatches = (c: CountClause, center: number, counts: readonly number[]) =>
  c.currentStates.includes(center) && c.counts.every((k) => counts[k.state] >= k.min && counts[k.state] <= k.max);

const describeTuple = (counts: readonly number[]) => counts.map((v, s) => `${v}×state ${s}`).join(', ');

export function validateCountTable(rule: CountTableRule, path = '/rule'): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const err = (code: string, p: string, message: string, suggestion?: string, consequence?: string) =>
    issues.push({ code, severity: 'error', category: 'semantics', path: p, message, suggestion, consequence, lessonId: 'L09-count-rules' });
  const K = rule.states;
  if (!Number.isInteger(K) || K < COUNT_TABLE_LIMITS.minStates || K > COUNT_TABLE_LIMITS.maxStates) {
    err('RULE_TABLE_STATES', `${path}/states`, `A count table has ${COUNT_TABLE_LIMITS.minStates}–${COUNT_TABLE_LIMITS.maxStates} states.`);
    return issues;
  }
  if (rule.neighborhood !== 'moore-r1' && rule.neighborhood !== 'von-neumann-r1') {
    err('RULE_TABLE_NEIGHBORHOOD', `${path}/neighborhood`, 'Choose the Moore or von Neumann radius-1 neighborhood.');
    return issues;
  }
  const n = neighborCount(rule.neighborhood);
  if (rule.clauses.length > COUNT_TABLE_LIMITS.maxClauses)
    err('RULE_TABLE_CLAUSE_LIMIT', `${path}/clauses`, `At most ${COUNT_TABLE_LIMITS.maxClauses} clauses are allowed (found ${rule.clauses.length}).`);
  const validState = (s: unknown) => Number.isInteger(s) && (s as number) >= 0 && (s as number) < K;
  if (rule.fallback.kind === 'state' && !validState(rule.fallback.state))
    err('RULE_TABLE_FALLBACK', `${path}/fallback/state`, `The default next state must be a state ID 0–${K - 1}.`);

  rule.clauses.forEach((c, i) => {
    const p = `${path}/clauses/${i}`;
    if (!c.currentStates.length)
      err('RULE_TABLE_CURRENT_EMPTY', `${p}/currentStates`, `Clause ${i + 1} applies to no current state.`, 'Select at least one current state.');
    if (c.currentStates.some((s) => !validState(s)))
      err('RULE_TABLE_STATE_RANGE', `${p}/currentStates`, `Clause ${i + 1} names a current state outside 0–${K - 1}.`);
    if (new Set(c.currentStates).size !== c.currentStates.length)
      err('RULE_TABLE_DUPLICATE_STATE', `${p}/currentStates`, `Clause ${i + 1} lists a current state twice.`);
    if (!validState(c.nextState)) err('RULE_TABLE_STATE_RANGE', `${p}/nextState`, `Clause ${i + 1} has a next state outside 0–${K - 1}.`);
    const seen = new Set<number>();
    c.counts.forEach((k, j) => {
      const q = `${p}/counts/${j}`;
      if (!validState(k.state)) err('RULE_TABLE_STATE_RANGE', `${q}/state`, `Clause ${i + 1} counts a neighbor state outside 0–${K - 1}.`);
      if (seen.has(k.state))
        err('RULE_TABLE_DUPLICATE_COUNT', `${q}/state`, `Clause ${i + 1} constrains neighbor state ${k.state} twice.`, 'Merge the two ranges into one.');
      seen.add(k.state);
      if (!Number.isInteger(k.min) || !Number.isInteger(k.max) || k.min < 0 || k.max > n || k.min > k.max)
        err('RULE_TABLE_COUNT_RANGE', q, `Clause ${i + 1}: a count range must satisfy 0 ≤ min ≤ max ≤ ${n} (got ${k.min}–${k.max}).`);
    });
  });
  if (issues.length) return issues;

  const cases = caseCount(K, n);
  if (cases > COUNT_TABLE_LIMITS.maxCases) {
    err('RULE_TABLE_TOO_LARGE', path, `This table has ${cases.toLocaleString('en')} cases; the limit is ${COUNT_TABLE_LIMITS.maxCases.toLocaleString('en')}.`);
    return issues;
  }

  const used = new Array<number>(rule.clauses.length).fill(0);
  const overlapReported = new Set<string>();
  for (const counts of countTuples(K, n)) {
    for (let center = 0; center < K; center++) {
      let first = -1;
      for (let i = 0; i < rule.clauses.length; i++) {
        if (!clauseMatches(rule.clauses[i], center, counts)) continue;
        used[i]++;
        if (first === -1) {
          first = i;
          continue;
        }
        const key = `${first}:${i}`;
        if (!overlapReported.has(key)) {
          overlapReported.add(key);
          err(
            'RULE_TABLE_OVERLAP',
            `${path}/clauses/${i}`,
            `Clauses ${first + 1} and ${i + 1} both apply to a cell in state ${center} with neighbors ${describeTuple(counts)}.`,
            'Narrow one clause so the two never apply to the same case. Clauses are not first-match-wins, even when they give the same next state.',
          );
        }
      }
    }
  }
  used.forEach((u, i) => {
    if (u === 0)
      err(
        'RULE_TABLE_UNREACHABLE',
        `${path}/clauses/${i}`,
        `Clause ${i + 1} can never apply: no neighborhood of ${n} cells satisfies all of its count ranges together.`,
        `Ranges for different states must be satisfiable with counts that add up to ${n}.`,
      );
  });
  return issues;
}

/** Compiles a validated table. Throws if the table is invalid; call validateCountTable first. */
export function compileCountTable(rule: CountTableRule): CompiledCountTable {
  const issues = validateCountTable(rule);
  if (issues.length) throw new Error(issues[0].message);
  const K = rule.states,
    n = neighborCount(rule.neighborhood);
  const weights = Int32Array.from(countWeights(K, n));
  const codeSpace = (n + 1) ** K * K;
  const dense = codeSpace <= 1 << 22 ? new Uint8Array(codeSpace).fill(255) : null;
  const sparse = dense ? null : new Map<number, number>();
  const clauseOf = new Map<number, number>();
  for (const counts of countTuples(K, n)) {
    let code = 0;
    for (let s = 0; s < K; s++) code += counts[s] * weights[s];
    for (let center = 0; center < K; center++) {
      const i = rule.clauses.findIndex((c) => clauseMatches(c, center, counts));
      const next = i >= 0 ? rule.clauses[i].nextState : rule.fallback.kind === 'keep-current' ? center : rule.fallback.state;
      const key = code * K + center;
      if (dense) dense[key] = next;
      else sparse!.set(key, next);
      clauseOf.set(key, i);
    }
  }
  return { states: K, neighbors: n, weights, dense, sparse, clauseOf, cases: caseCount(K, n) };
}

export const lookupCountTable = (t: CompiledCountTable, code: number, center: number) =>
  t.dense ? t.dense[code * t.states + center] : t.sparse!.get(code * t.states + center)!;
