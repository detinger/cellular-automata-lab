// Baseline vs. alternative comparison: assumption diffs, compatibility of direct
// comparisons, Hamming distance and paired/independent outcome differences.
import type { Model } from '../contracts/model';
import { ruleSummary } from '../model/families';
import { isStochasticRule } from '../engine/engine';
import { summarize, tQuantile, relativeChange, type Summary } from '../stats/summary';

export interface AssumptionChange {
  field: string;
  baseline: string;
  alternative: string;
  note?: string;
}

const boundaryText = (m: Model) =>
  m.boundary.kind === 'periodic' ? 'Periodic (torus)' : `Fixed exterior (${m.stateLabels[m.boundary.state] ?? m.boundary.state})`;

/** Every semantic difference between two models, plus seeds. Names are excluded (not assumptions). */
export function diffModels(a: Model, b: Model, seeds?: { a: string; b: string }): AssumptionChange[] {
  const out: AssumptionChange[] = [];
  if (a.rule.id !== b.rule.id)
    out.push({
      field: 'Rule family',
      baseline: a.rule.id,
      alternative: b.rule.id,
      note: 'Different families: only normalized, family-independent measures can be compared.',
    });
  else if (JSON.stringify(a.rule) !== JSON.stringify(b.rule)) out.push({ field: 'Rule', baseline: ruleSummary(a.rule), alternative: ruleSummary(b.rule) });
  if (a.width !== b.width || a.height !== b.height)
    out.push({
      field: 'Lattice size',
      baseline: `${a.width} × ${a.height}`,
      alternative: `${b.width} × ${b.height}`,
      note: 'Different sizes: compare fractions, not counts. Cell-by-cell distance is unavailable.',
    });
  if (JSON.stringify(a.boundary) !== JSON.stringify(b.boundary)) out.push({ field: 'Boundary', baseline: boundaryText(a), alternative: boundaryText(b) });
  if (a.stateLabels.join('\u0000') !== b.stateLabels.join('\u0000'))
    out.push({
      field: 'State labels',
      baseline: a.stateLabels.join(', '),
      alternative: b.stateLabels.join(', '),
      note: 'Labels differ: the app will not guess which states correspond.',
    });
  if (a.width === b.width && a.height === b.height) {
    let d = 0;
    for (let i = 0; i < a.initial.length; i++) if (a.initial[i] !== b.initial[i]) d++;
    if (d)
      out.push({
        field: 'Initial condition',
        baseline: 'generation 0 grid',
        alternative: `${d} cell${d === 1 ? '' : 's'} differ`,
        note: 'Starting grids differ.',
      });
  } else
    out.push({
      field: 'Initial condition',
      baseline: `${a.width * a.height} cells`,
      alternative: `${b.width * b.height} cells`,
      note: 'Grids of different sizes cannot be compared cell by cell.',
    });
  if (seeds && seeds.a !== seeds.b && (isStochasticRule(a.rule.id) || isStochasticRule(b.rule.id)))
    out.push({ field: 'Transition seed', baseline: seeds.a, alternative: seeds.b, note: 'Different random streams.' });
  return out;
}

export interface Compatibility {
  hamming: boolean;
  hammingReason: string | null;
  /** Direct state-count comparison is meaningful (same state meanings). */
  sameStates: boolean;
  paired: boolean;
  pairedReason: string | null;
  normalize: boolean;
}

export function compatibility(a: Model, b: Model): Compatibility {
  const sameSize = a.width === b.width && a.height === b.height;
  const sameStates = a.stateCount === b.stateCount && a.stateLabels.join('\u0000') === b.stateLabels.join('\u0000');
  const sameFamily = a.rule.id === b.rule.id;
  const hamming = sameSize && sameStates;
  const hammingReason = hamming
    ? null
    : !sameSize
      ? 'Hamming distance needs lattices of the same size.'
      : 'Hamming distance needs the same states with the same meanings.';
  const paired = sameFamily && sameSize && a.stateCount === b.stateCount;
  const pairedReason = paired
    ? null
    : 'Paired runs need the same rule family, lattice size and state count, so that both sides consume the random streams in the same way. Use independent runs.';
  return { hamming, hammingReason, sameStates, paired, pairedReason, normalize: !sameSize };
}

/** Fraction of aligned sites with unequal states. */
export function hamming(a: Uint8Array, b: Uint8Array): number {
  if (a.length !== b.length) throw new RangeError('Hamming distance needs aligned lattices of equal size.');
  let d = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++;
  return a.length ? d / a.length : 0;
}

export interface Difference {
  method: string;
  /** Alternative − baseline. */
  mean: number | null;
  ci95: [number, number] | null;
  n: number;
  relative: { absolute: number; percent: number | null } | null;
  baseline: Summary;
  alternative: Summary;
  note: string | null;
}

/** Independent groups: difference of means with a Welch t interval (labeled as such). */
export function compareIndependent(base: number[], alt: number[]): Difference {
  const A = summarize(base),
    B = summarize(alt);
  const rel = A.mean !== null && B.mean !== null ? relativeChange(A.mean, B.mean) : null;
  if (A.mean === null || B.mean === null)
    return {
      method: 'Difference of means (independent runs)',
      mean: null,
      ci95: null,
      n: 0,
      relative: null,
      baseline: A,
      alternative: B,
      note: 'One side has no completed runs.',
    };
  const diff = B.mean - A.mean;
  if (A.n < 2 || B.n < 2)
    return {
      method: 'Difference of means (independent runs)',
      mean: diff,
      ci95: null,
      n: A.n + B.n,
      relative: rel,
      baseline: A,
      alternative: B,
      note: 'Each side needs at least 2 runs for an interval.',
    };
  const va = A.sd! ** 2 / A.n,
    vb = B.sd! ** 2 / B.n;
  const se = Math.sqrt(va + vb);
  if (se === 0)
    return {
      method: 'Difference of means, Welch t interval',
      mean: diff,
      ci95: [diff, diff],
      n: A.n + B.n,
      relative: rel,
      baseline: A,
      alternative: B,
      note: 'No spread on either side.',
    };
  const df = (va + vb) ** 2 / (va ** 2 / (A.n - 1) + vb ** 2 / (B.n - 1));
  const t = tQuantile(0.975, df);
  return {
    method: `Difference of means, Welch t interval (df ≈ ${df.toFixed(1)})`,
    mean: diff,
    ci95: [diff - t * se, diff + t * se],
    n: A.n + B.n,
    relative: rel,
    baseline: A,
    alternative: B,
    note: null,
  };
}

/** Paired runs: summary of per-pair differences (alternative − baseline). */
export function comparePaired(pairs: Array<[number, number]>): Difference {
  const base = pairs.map((p) => p[0]),
    alt = pairs.map((p) => p[1]);
  const d = summarize(pairs.map(([x, y]) => y - x));
  const A = summarize(base),
    B = summarize(alt);
  return {
    method: 'Mean of paired differences, t interval on the differences',
    mean: d.mean,
    ci95: d.ci95,
    n: d.n,
    relative: A.mean !== null && B.mean !== null ? relativeChange(A.mean, B.mean) : null,
    baseline: A,
    alternative: B,
    note: d.n < 2 ? 'At least 2 pairs are needed for an interval.' : null,
  };
}
