// Basic per-generation metrics (PLAN.md §7.8).

export interface GenerationMetrics {
  generation: number;
  /** Count per state ID; sums to N. */
  counts: number[];
  /** Fraction of sites that changed since the previous generation; null at generation zero. */
  activity: number | null;
  changed: number | null;
  /** 0→1 and 1→0 transitions; binary life-like families only. */
  births: number | null;
  deaths: number | null;
  /** Rule 184 on a periodic ring: cars that moved in the last step / road length. Null otherwise. */
  flow: number | null;
  /** Histogram entropy in bits (state composition only, not spatial arrangement). */
  entropy: number;
  /** Spatial SIR: number of 0→1 (new infection) transitions in the last step. Null otherwise. */
  incidence: number | null;
}

export function countStates(cells: Uint8Array, stateCount: number): number[] {
  const counts = new Array<number>(stateCount).fill(0);
  for (let i = 0; i < cells.length; i++) counts[cells[i]]++;
  return counts;
}

/** Histogram entropy in bits, zero terms omitted. Describes state composition only. */
export function histogramEntropy(counts: readonly number[]): number {
  let n = 0;
  for (const c of counts) n += c;
  if (n === 0) return 0;
  let h = 0;
  for (const c of counts) if (c > 0) h -= (c / n) * Math.log2(c / n);
  return h === 0 ? 0 : h; // avoid −0
}

/** Entropy divided by log2(K) for the declared state count K (not the observed categories). */
export const normalizedEntropy = (entropy: number, stateCount: number) => (stateCount > 1 ? entropy / Math.log2(stateCount) : 0);

export const initialMetrics = (cells: Uint8Array, stateCount: number): GenerationMetrics => {
  const counts = countStates(cells, stateCount);
  return { generation: 0, counts, activity: null, changed: null, births: null, deaths: null, flow: null, entropy: histogramEntropy(counts), incidence: null };
};

export const emptyStepMetrics = (generation: number, stateCount: number): GenerationMetrics => ({
  generation,
  counts: new Array<number>(stateCount).fill(0),
  activity: 0,
  changed: 0,
  births: 0,
  deaths: 0,
  flow: null,
  entropy: 0,
  incidence: null,
});
