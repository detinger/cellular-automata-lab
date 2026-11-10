// Run-level statistics (PLAN.md §3.5 scientific correctness, §7.8). Uncertainty is computed across
// independent run outcomes only, never across correlated generations of one run.

export interface Summary {
  n: number;
  mean: number | null;
  /** Sample standard deviation (n − 1); null when n < 2. */
  sd: number | null;
  /** Standard error s/√n; null when n < 2. */
  se: number | null;
  median: number | null;
  min: number | null;
  max: number | null;
  /** 95% Student-t interval for the mean (assumption-dependent); null when n < 2. */
  ci95: [number, number] | null;
  /** Small-sample or bounded/skewed-outcome caveats to show with the numbers. */
  caveats: string[];
}

/** Welford's numerically stable mean and sum of squared deviations. */
function welford(xs: readonly number[]) {
  let mean = 0,
    m2 = 0,
    n = 0;
  for (const x of xs) {
    n++;
    const d = x - mean;
    mean += d / n;
    m2 += d * (x - mean);
  }
  return { n, mean, m2 };
}

export function summarize(values: readonly number[], opts: { bounded?: [number, number] } = {}): Summary {
  const xs = values.filter((v) => Number.isFinite(v));
  const n = xs.length;
  if (n === 0) return { n: 0, mean: null, sd: null, se: null, median: null, min: null, max: null, ci95: null, caveats: ['No completed runs.'] };
  const { mean, m2 } = welford(xs);
  const sorted = [...xs].sort((a, b) => a - b);
  const median = n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
  const caveats: string[] = [];
  let sd: number | null = null,
    se: number | null = null,
    ci95: [number, number] | null = null;
  if (n >= 2) {
    sd = Math.sqrt(Math.max(0, m2 / (n - 1)));
    se = sd / Math.sqrt(n);
    const t = tQuantile(0.975, n - 1);
    ci95 = [mean - t * se, mean + t * se];
    if (n < 5) caveats.push(`Only ${n} runs: the interval is very wide and depends strongly on the normality assumption.`);
    if (sd === 0) caveats.push('Every run gave the same value, so there is no spread to estimate.');
    if (opts.bounded && sd > 0) {
      const [lo, hi] = opts.bounded;
      if (sorted[0] === lo || sorted[n - 1] === hi || ci95[0] < lo || ci95[1] > hi)
        caveats.push(`Outcomes are bounded to [${lo}, ${hi}] and pile up at a bound or the interval crosses it; the t interval is only a rough guide.`);
    }
    const skew = sd > 0 ? xs.reduce((a, x) => a + ((x - mean) / sd!) ** 3, 0) / n : 0;
    if (Math.abs(skew) > 1 && n >= 3) caveats.push('Outcomes are visibly skewed; compare the median with the mean.');
  } else {
    caveats.push('One run: no spread or interval can be estimated.');
  }
  return { n, mean, sd, se, median, min: sorted[0], max: sorted[n - 1], ci95, caveats };
}

// ---- Student t distribution ----

/** ln Γ(x) by the Lanczos approximation (g = 7, n = 9), accurate to ~1e-15 for x > 0. */
function lnGamma(x: number): number {
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012,
    9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lnGamma(1 - x);
  x -= 1;
  let a = c[0];
  const t = x + 7.5;
  for (let i = 1; i < 9; i++) a += c[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

/** Continued fraction for the regularized incomplete beta function (modified Lentz). */
function betacf(a: number, b: number, x: number): number {
  const TINY = 1e-300;
  let c = 1,
    d = 1 - ((a + b) * x) / (a + 1);
  if (Math.abs(d) < TINY) d = TINY;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 300; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((a + m2 - 1) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < TINY) d = TINY;
    c = 1 + aa / c;
    if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (a + b + m) * x) / ((a + m2) * (a + m2 + 1));
    d = 1 + aa * d;
    if (Math.abs(d) < TINY) d = TINY;
    c = 1 + aa / c;
    if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-15) break;
  }
  return h;
}

/** Regularized incomplete beta I_x(a, b). */
export function incompleteBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(lnGamma(a + b) - lnGamma(a) - lnGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2) ? (bt * betacf(a, b, x)) / a : 1 - (bt * betacf(b, a, 1 - x)) / b;
}

/** P(T ≤ t) for Student's t with `df` degrees of freedom. */
export function tCdf(t: number, df: number): number {
  const x = df / (df + t * t);
  const tail = 0.5 * incompleteBeta(x, df / 2, 0.5);
  return t >= 0 ? 1 - tail : tail;
}

/** Quantile of Student's t: the t with P(T ≤ t) = p. Bisection on the CDF to 1e-12. */
export function tQuantile(p: number, df: number): number {
  if (!(p > 0 && p < 1) || !(df > 0)) throw new RangeError('tQuantile needs 0 < p < 1 and df > 0.');
  if (p === 0.5) return 0;
  if (p < 0.5) return -tQuantile(1 - p, df);
  let lo = 0,
    hi = 1;
  while (tCdf(hi, df) < p) hi *= 2;
  for (let i = 0; i < 200 && hi - lo > 1e-12 * Math.max(1, hi); i++) {
    const mid = (lo + hi) / 2;
    if (tCdf(mid, df) < p) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

// ---- Comparisons and censored outcomes ----

/** (alternative − baseline) / |baseline| × 100; N/A (null) when the baseline is zero (§3.6). */
export function relativeChange(baseline: number, alternative: number): { absolute: number; percent: number | null } {
  return { absolute: alternative - baseline, percent: baseline === 0 ? null : ((alternative - baseline) / Math.abs(baseline)) * 100 };
}

export interface EventObservation {
  /** Generation of the event, or null when the run reached its horizon first (right-censored). */
  time: number | null;
  /** The generation up to which the run was observed. */
  observedUntil: number;
}

/**
 * Time-to-event summary that keeps censored runs separate (STAT-06). The conditional summary uses
 * only runs where the event occurred; censored runs are never averaged in as 0 or as the horizon.
 */
export function summarizeEvents(obs: readonly EventObservation[]) {
  const events = obs.filter((o) => o.time !== null).map((o) => o.time!);
  const censored = obs.filter((o) => o.time === null);
  return {
    runs: obs.length,
    observed: events.length,
    censored: censored.length,
    censoredAt: censored.map((c) => c.observedUntil),
    fractionObserved: obs.length ? events.length / obs.length : null,
    /** Summary of event times among runs where the event happened (a conditional, not overall, statistic). */
    conditional: summarize(events),
    /** Kaplan–Meier median time to event, or null if the survival curve never drops to 0.5. */
    kmMedian: kaplanMeierMedian(obs),
  };
}

export function kaplanMeierMedian(obs: readonly EventObservation[]): number | null {
  const times = [...new Set(obs.filter((o) => o.time !== null).map((o) => o.time!))].sort((a, b) => a - b);
  let s = 1;
  for (const t of times) {
    const atRisk = obs.filter((o) => (o.time ?? o.observedUntil) >= t).length;
    const d = obs.filter((o) => o.time === t).length;
    if (atRisk === 0) break;
    s *= 1 - d / atRisk;
    if (s <= 0.5) return t;
  }
  return null;
}
