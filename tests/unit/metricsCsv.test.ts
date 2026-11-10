import { describe, expect, it } from 'vitest';
import { csvText, decimate, metricsToCsv } from '../../src/interchange/metricsCsv';
import { createEngine } from '../../src/domain/engine/engine';
import { presetById } from '../../src/data/presets';
import { histogramEntropy } from '../../src/domain/metrics/basic';

describe('metrics CSV', () => {
  it('writes every generation with explicit missing values', () => {
    const m = presetById('blinker')!.build();
    const e = createEngine(m);
    const rows = [e.metrics];
    for (let i = 0; i < 3; i++) rows.push(e.step());
    const csv = metricsToCsv(rows, { runId: 'run-1', modelHash: 'abc', stateLabels: m.stateLabels, sites: 25 }).trim().split('\r\n');
    expect(csv[0]).toBe(
      'run_id,model_hash,generation,count:Dead,count:Alive,fraction:Dead,fraction:Alive,changed_cells,activity,births,deaths,flow,entropy_bits,incidence',
    );
    expect(csv).toHaveLength(5);
    const h = histogramEntropy([22, 3]);
    expect(h).toBeCloseTo(-(0.88 * Math.log2(0.88) + 0.12 * Math.log2(0.12)), 12);
    expect(csv[1]).toBe(`run-1,abc,0,22,3,0.88,0.12,NA,NA,NA,NA,NA,${h},NA`);
    expect(csv[2]).toBe(`run-1,abc,1,22,3,0.88,0.12,4,0.16,2,2,NA,${h},NA`);
  });

  it('escapes formula prefixes and delimiters in text only', () => {
    expect(csvText('=SUM(A1)')).toBe(`"'=SUM(A1)"`);
    expect(csvText('a,b')).toBe('"a,b"');
    expect(csvText('say "hi"')).toBe('"say ""hi"""');
    expect(csvText('Alive')).toBe('Alive');
    const csv = metricsToCsv(
      [{ generation: 0, counts: [1, 2], activity: null, changed: null, births: null, deaths: null, flow: null, entropy: 0.9, incidence: null }],
      { runId: 'r', modelHash: 'h', stateLabels: ['-x', '@y'], sites: 3 },
    );
    expect(csv.split('\r\n')[0]).toContain(',count:-x,'); // prefix is not leading, so no escaping
    expect(csv.split('\r\n')[1]).toContain(',1,2,');
  });

  it('decimation keeps first and last and never exceeds max + 1 points', () => {
    const rows = Array.from({ length: 10_001 }, (_, i) => i);
    const d = decimate(rows, 2000);
    expect(d.rows[0]).toBe(0);
    expect(d.rows.at(-1)).toBe(10_000);
    expect(d.rows.length).toBeLessThanOrEqual(2001);
    expect(decimate([1, 2, 3], 10)).toEqual({ rows: [1, 2, 3], stride: 1 });
  });

  it('STAT-03: histogram entropy of a 50/50 split is 1 bit; uniform is 0', () => {
    expect(histogramEntropy([5, 5])).toBe(1);
    expect(histogramEntropy([10, 0])).toBe(0);
  });
});
