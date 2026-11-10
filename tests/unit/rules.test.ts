import { describe, expect, it } from 'vitest';
import { parseLifeLike } from '../../src/domain/rules/lifeLike';
import { explainTransition } from '../../src/domain/rules/explain';
import { life } from './helpers';

describe('B/S parsing', () => {
  it('normalizes case, whitespace, ordering and duplicates', () => {
    expect(parseLifeLike('  b32/s3322 ')).toMatchObject({ ok: true, canonical: 'B23/S23' });
    expect(parseLifeLike('B36/S23')).toMatchObject({ ok: true, rule: { birth: [3, 6], survive: [2, 3] } });
  });
  it('accepts empty sets', () => {
    expect(parseLifeLike('B2/S')).toMatchObject({ ok: true, rule: { birth: [2], survive: [] } });
    expect(parseLifeLike('B/S')).toMatchObject({ ok: true, canonical: 'B/S' });
  });
  it('rejects invalid digits and other notations', () => {
    for (const bad of ['B9/S23', 'B3/S2a', '23/3', 'B3/S23/G4', 'B3 S23', '']) expect(parseLifeLike(bad).ok).toBe(false);
  });
});

describe('transition explanation', () => {
  it('explains a blinker birth with the exact neighborhood', () => {
    const m = life(5, 5, [
      [1, 2],
      [2, 2],
      [3, 2],
    ]);
    const ex = explainTransition(m, m.initial, 2, 1)!;
    expect(ex.current).toBe(0);
    expect(ex.liveNeighbors).toBe(3);
    expect(ex.next).toBe(1);
    expect(ex.clause).toMatch(/^Birth/);
  });
  it('reports exterior samples on a fixed boundary and wrapped sources on a torus', () => {
    const fixed = life(5, 5, [[4, 4]]);
    const ex = explainTransition(fixed, fixed.initial, 0, 0)!;
    expect(ex.samples.filter((s) => s.source === null)).toHaveLength(5);
    expect(ex.liveNeighbors).toBe(0);
    const torus = life(5, 5, [[4, 4]], { kind: 'periodic' });
    const ex2 = explainTransition(torus, torus.initial, 0, 0)!;
    expect(ex2.liveNeighbors).toBe(1);
    expect(ex2.samples.find((s) => s.dx === -1 && s.dy === -1)).toMatchObject({ wrapped: true, source: { x: 4, y: 4 } });
  });
});
