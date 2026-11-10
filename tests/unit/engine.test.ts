// Engine correctness fixtures SIM-01..SIM-06 (PLAN.md §9.1). Expected values are hand-calculated.
import { describe, expect, it } from 'vitest';
import { createEngine, CapabilityError } from '../../src/domain/engine/engine';
import { life, live, naiveStep } from './helpers';

const sorted = (a: Array<[number, number]>) => [...a].sort((p, q) => p[1] - q[1] || p[0] - q[0]);

describe('life-like/v1 engine', () => {
  it('SIM-01: empty grid with dead exterior stays empty', () => {
    const e = createEngine(life(10, 10, []));
    e.step(5);
    expect(live(e.cells, 10)).toEqual([]);
    expect(e.metrics.counts).toEqual([100, 0]);
  });

  it('SIM-02: interior block is unchanged after 1 and 100 steps', () => {
    const m = life(6, 6, [
      [2, 2],
      [3, 2],
      [2, 3],
      [3, 3],
    ]);
    const e = createEngine(m);
    e.step();
    expect(e.cells).toEqual(m.initial);
    e.step(99);
    expect(e.generation).toBe(100);
    expect(e.cells).toEqual(m.initial);
  });

  it('SIM-03: 5×5 blinker flips to vertical, then back', () => {
    const m = life(5, 5, [
      [1, 2],
      [2, 2],
      [3, 2],
    ]);
    const e = createEngine(m);
    e.step();
    expect(sorted(live(e.cells, 5))).toEqual([
      [2, 1],
      [2, 2],
      [2, 3],
    ]);
    expect(e.metrics).toMatchObject({ generation: 1, births: 2, deaths: 2, changed: 4, activity: 4 / 25 });
    e.step();
    expect(e.cells).toEqual(m.initial);
  });

  it('SIM-04: glider translates by (1,1) after 4 steps', () => {
    const glider: Array<[number, number]> = [
      [1, 0],
      [2, 1],
      [0, 2],
      [1, 2],
      [2, 2],
    ];
    const at = (ox: number, oy: number) => glider.map(([x, y]) => [x + ox, y + oy] as [number, number]);
    const e = createEngine(life(12, 12, at(3, 3)));
    e.step(4);
    expect(sorted(live(e.cells, 12))).toEqual(sorted(at(4, 4)));
  });

  it('SIM-05: corner cell survives on a torus and dies with a dead exterior', () => {
    const cells: Array<[number, number]> = [
      [0, 0],
      [4, 0],
      [0, 4],
    ];
    const torus = createEngine(life(5, 5, cells, { kind: 'periodic' }));
    torus.step();
    expect(torus.cells[0]).toBe(1);
    const fixed = createEngine(life(5, 5, cells, { kind: 'fixed-exterior', state: 0 }));
    fixed.step();
    expect(fixed.cells[0]).toBe(0);
  });

  it('SIM-06: matches an independent scrambled-order implementation on random grids', () => {
    let s = 12345;
    const rnd = () => (s = (s * 1103515245 + 12345) >>> 0) / 2 ** 32;
    for (const boundary of [{ kind: 'periodic' } as const, { kind: 'fixed-exterior', state: 0 } as const, { kind: 'fixed-exterior', state: 1 } as const]) {
      for (const [w, h] of [
        [3, 3],
        [7, 5],
        [16, 9],
      ]) {
        const m = life(w, h, [], boundary);
        for (let i = 0; i < m.initial.length; i++) m.initial[i] = rnd() < 0.4 ? 1 : 0;
        const e = createEngine(m);
        let ref = new Uint8Array(m.initial);
        for (let g = 0; g < 20; g++) {
          e.step();
          ref = naiveStep(m, ref);
          expect(e.cells).toEqual(ref);
        }
      }
    }
  });

  it('reset restores generation zero and the initial cells', () => {
    const m = life(5, 5, [
      [1, 2],
      [2, 2],
      [3, 2],
    ]);
    const e = createEngine(m);
    e.step(3);
    e.reset();
    expect(e.generation).toBe(0);
    expect(e.cells).toEqual(m.initial);
    expect(e.metrics.activity).toBeNull();
  });

  it('step(100) equals 100 single steps (REP-02, deterministic part)', () => {
    const m = life(
      20,
      20,
      [
        [5, 5],
        [6, 5],
        [7, 5],
        [7, 4],
        [6, 3],
      ],
      { kind: 'periodic' },
    );
    const a = createEngine(m),
      b = createEngine(m);
    a.step(100);
    for (let i = 0; i < 100; i++) b.step();
    expect(a.cells).toEqual(b.cells);
    expect(a.metrics).toEqual(b.metrics);
  });

  it('does not mutate the model initial grid', () => {
    const m = life(5, 5, [
      [1, 2],
      [2, 2],
      [3, 2],
    ]);
    const before = new Uint8Array(m.initial);
    createEngine(m).step(3);
    expect(m.initial).toEqual(before);
  });

  it('refuses an unknown rule family with a capability error', () => {
    const m = { ...life(5, 5, []), rule: { id: 'hexagonal/v9' } as never };
    expect(() => createEngine(m)).toThrow(CapabilityError);
  });
});
