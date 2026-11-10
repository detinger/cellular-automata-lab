// Run-level statistics fixtures STAT-01–STAT-08.
import { describe, expect, it } from 'vitest';
import { kaplanMeierMedian, relativeChange, summarize, summarizeEvents, tCdf, tQuantile } from '../../src/domain/stats/summary';
import { histogramEntropy } from '../../src/domain/metrics/basic';

describe('run-level statistics', () => {
  it('STAT-01: [1,2,3] → mean 2, sample SD 1, SE 1/√3', () => {
    const s = summarize([1, 2, 3]);
    expect(s.mean).toBe(2);
    expect(s.sd).toBeCloseTo(1, 15);
    expect(s.se).toBeCloseTo(1 / Math.sqrt(3), 15);
    expect(s.median).toBe(2);
    expect([s.min, s.max]).toEqual([1, 3]);
    // 2 ± t(0.975, 2) · 1/√3, t = 4.302652729911275
    expect(s.ci95![0]).toBeCloseTo(2 - 4.302652729911275 / Math.sqrt(3), 9);
  });
  it('STAT-02: one replicate has no SD or interval; constant outcomes have zero variance', () => {
    const one = summarize([5]);
    expect([one.sd, one.se, one.ci95]).toEqual([null, null, null]);
    expect(one.caveats.join(' ')).toMatch(/One run/);
    const c = summarize([4, 4, 4, 4]);
    expect(c.sd).toBe(0);
    expect(c.ci95).toEqual([4, 4]);
  });
  it('is numerically stable for large offsets', () => {
    const s = summarize([1e9 + 4, 1e9 + 7, 1e9 + 13, 1e9 + 16]);
    expect(s.sd).toBeCloseTo(Math.sqrt(30), 9);
  });
  it('STAT-03: a 50/50 histogram has entropy 1 bit; a uniform grid 0', () => {
    expect(histogramEntropy([50, 50])).toBe(1);
    expect(histogramEntropy([0, 100])).toBe(0);
    expect(histogramEntropy([25, 25, 25, 25])).toBe(2);
  });
  it('STAT-04: grids with the same histogram have the same entropy regardless of arrangement', () => {
    const a = [1, 1, 0, 0, 1, 0],
      b = [0, 1, 0, 1, 0, 1];
    const h = (g: number[]) => histogramEntropy([g.filter((v) => v === 0).length, g.filter((v) => v === 1).length]);
    expect(h(a)).toBe(h(b));
  });
  it('STAT-06: censored observations are kept apart and never averaged in', () => {
    const e = summarizeEvents([
      { time: 10, observedUntil: 10 },
      { time: 30, observedUntil: 30 },
      { time: null, observedUntil: 500 },
      { time: null, observedUntil: 500 },
    ]);
    expect([e.runs, e.observed, e.censored]).toEqual([4, 2, 2]);
    expect(e.conditional.mean).toBe(20); // not (10 + 30 + 500 + 500) / 4 and not (10 + 30 + 0 + 0) / 4
    expect(e.censoredAt).toEqual([500, 500]);
    expect(e.kmMedian).toBe(30); // S(10) = 3/4, S(30) = 3/4 · 2/3 = 1/2
    expect(
      kaplanMeierMedian([
        { time: null, observedUntil: 100 },
        { time: 5, observedUntil: 5 },
      ]),
    ).toBe(5); // S(5) = 1/2
    expect(
      kaplanMeierMedian([
        { time: null, observedUntil: 100 },
        { time: null, observedUntil: 100 },
        { time: 5, observedUntil: 5 },
      ]),
    ).toBeNull(); // S stays 2/3
    // A run censored before t is no longer at risk at t.
    expect(
      kaplanMeierMedian([
        { time: null, observedUntil: 3 },
        { time: 8, observedUntil: 8 },
        { time: 9, observedUntil: 9 },
      ]),
    ).toBe(8);
  });
  it('STAT-07: relative change with a zero baseline is N/A with an absolute difference', () => {
    expect(relativeChange(0, 3)).toEqual({ absolute: 3, percent: null });
    expect(relativeChange(-4, -2)).toEqual({ absolute: 2, percent: 50 });
    expect(relativeChange(10, 5)).toEqual({ absolute: -5, percent: -50 });
  });
  it('STAT-08: Student-t quantiles match an independent reference table', () => {
    // Two-sided 95% (p = 0.975) and one-sided 95% (p = 0.95) critical values, from standard printed tables.
    const table: Array<[number, number, number]> = [
      [0.975, 1, 12.706],
      [0.975, 2, 4.303],
      [0.975, 3, 3.182],
      [0.975, 4, 2.776],
      [0.975, 5, 2.571],
      [0.975, 10, 2.228],
      [0.975, 20, 2.086],
      [0.975, 30, 2.042],
      [0.975, 60, 2.0],
      [0.975, 120, 1.98],
      [0.95, 1, 6.314],
      [0.95, 5, 2.015],
      [0.95, 10, 1.812],
      [0.95, 30, 1.697],
      [0.995, 1, 63.657],
      [0.995, 5, 4.032],
      [0.995, 30, 2.75],
    ];
    for (const [p, df, t] of table) expect(tQuantile(p, df)).toBeCloseTo(t, 3);
    expect(tQuantile(0.025, 7)).toBeCloseTo(-tQuantile(0.975, 7), 12);
    expect(tCdf(0, 9)).toBeCloseTo(0.5, 15);
    // df = 1 is the Cauchy distribution: CDF(1) = 3/4.
    expect(tCdf(1, 1)).toBeCloseTo(0.75, 12);
  });
});
