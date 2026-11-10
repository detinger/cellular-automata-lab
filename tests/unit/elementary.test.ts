// ECA fixtures SIM-07..SIM-12. Expected values are hand-calculated or independently enumerated.
import { describe, expect, it } from 'vitest';
import { createEngine } from '../../src/domain/engine/engine';
import type { Boundary, Model } from '../../src/domain/contracts/model';
import { explainElementary } from '../../src/domain/rules/explain';
import { ecaOutput } from '../../src/domain/rules/elementary';

const eca = (ruleNumber: number, row: string, boundary: Boundary = { kind: 'fixed-exterior', state: 0 }): Model => ({
  name: 't',
  width: row.length,
  height: 1,
  stateCount: 2,
  stateLabels: ['0', '1'],
  boundary,
  schedule: 'synchronous',
  rule: { id: 'elementary/v1', ruleNumber },
  initial: Uint8Array.from(row, Number),
});
const str = (c: Uint8Array) => [...c].join('');
const ring: Boundary = { kind: 'periodic' };

describe('elementary/v1', () => {
  it('SIM-07: every rule and every three-bit input matches the rule bit (independent enumeration)', () => {
    const inputs = ['111', '110', '101', '100', '011', '010', '001', '000'];
    for (let rule = 0; rule < 256; rule++) {
      const bits = rule.toString(2).padStart(8, '0'); // bits[0] is the output for 111
      inputs.forEach((n, k) => {
        expect(ecaOutput(rule, +n[0], +n[1], +n[2])).toBe(+bits[k]);
        // Through the engine: a ring of width 3 sees exactly this neighborhood at its center.
        const e = createEngine(eca(rule, n, ring));
        e.step();
        expect(e.cells[1]).toBe(+bits[k]);
      });
    }
  });

  it('SIM-08: Rule 90 from 00100 gives 01010 then 10001', () => {
    const e = createEngine(eca(90, '00100'));
    e.step();
    expect(str(e.cells)).toBe('01010');
    e.step();
    expect(str(e.cells)).toBe('10001');
  });

  it('SIM-09: Rule 30 from 00100 gives 01110', () => {
    const e = createEngine(eca(30, '00100'));
    e.step();
    expect(str(e.cells)).toBe('01110');
  });

  it('SIM-10: Rules 0 and 255 give all zeros / all ones', () => {
    for (const row of ['10110', '00000', '11111', '0101101']) {
      const a = createEngine(eca(0, row));
      a.step();
      expect(str(a.cells)).toBe('0'.repeat(row.length));
      const b = createEngine(eca(255, row));
      b.step();
      expect(str(b.cells)).toBe('1'.repeat(row.length));
    }
  });

  it('SIM-11: Rule 184 ring 10100 → 01010, two moves, density 0.4, flow 0.4', () => {
    const e = createEngine(eca(184, '10100', ring));
    e.step();
    expect(str(e.cells)).toBe('01010');
    expect(e.metrics.counts[1] / 5).toBe(0.4);
    expect(e.metrics.flow).toBe(0.4);
  });

  it('SIM-12: Rule 184 conserves cars on periodic rings', () => {
    let s = 99;
    const rnd = () => (s = (s * 1103515245 + 12345) >>> 0) / 2 ** 32;
    for (let t = 0; t < 20; t++) {
      const w = 5 + Math.floor(rnd() * 60);
      const row = Array.from({ length: w }, () => (rnd() < 0.45 ? '1' : '0')).join('');
      const cars = [...row].filter((c) => c === '1').length;
      const e = createEngine(eca(184, row, ring));
      for (let g = 0; g < 50; g++) {
        e.step();
        expect(e.metrics.counts[1]).toBe(cars);
      }
    }
  });

  it('fixed exterior of 1 feeds the edges', () => {
    const e = createEngine(eca(254, '000', { kind: 'fixed-exterior', state: 1 })); // OR of neighborhood
    e.step();
    expect(str(e.cells)).toBe('101');
  });

  it('flow is null for other rules or non-periodic boundaries', () => {
    const a = createEngine(eca(184, '10100'));
    a.step();
    expect(a.metrics.flow).toBeNull();
    const b = createEngine(eca(30, '10100', ring));
    b.step();
    expect(b.metrics.flow).toBeNull();
    expect(b.metrics.births).toBeNull();
  });

  it('explains the exact rule bit, including wrapped neighbors', () => {
    const m = eca(30, '10001', ring);
    const ex = explainElementary(m, m.initial, 0)!;
    expect(ex.left).toMatchObject({ state: 1, source: 4, wrapped: true });
    expect(ex.pattern).toBe(0b110);
    expect(ex.next).toBe((30 >>> 6) & 1);
  });
});
