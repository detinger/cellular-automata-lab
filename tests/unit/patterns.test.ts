import { describe, expect, it } from 'vitest';
import { PATTERNS, extract, flipHorizontal, rotateCW, stamp, type Pattern } from '../../src/data/patterns';
import { lifeModel } from '../../src/data/presets';
import { createEngine } from '../../src/domain/engine/engine';

const pat = (id: string) => PATTERNS.find((p) => p.id === id)!;
/** Places a pattern on an empty w×h grid (dead exterior) at (ax, ay) and returns an engine. */
const place = (p: Pattern, w: number, h: number, ax: number, ay: number) => {
  const m = lifeModel('t', w, h, []);
  m.initial = stamp(m.initial, w, h, p, ax, ay);
  return { m, e: createEngine(m) };
};
const pop = (c: Uint8Array) => c.reduce((a, b) => a + b, 0);
const shifted = (cells: Uint8Array, w: number, h: number, dx: number, dy: number) => {
  const out = new Uint8Array(cells.length);
  cells.forEach((v, i) => {
    if (v) {
      const x = (i % w) + dx,
        y = Math.floor(i / w) + dy;
      if (x >= 0 && y >= 0 && x < w && y < h) out[y * w + x] = 1;
    }
  });
  return out;
};

describe('bundled patterns', () => {
  it('have the documented populations', () => {
    expect(Object.fromEntries(PATTERNS.map((p) => [p.id, pop(p.cells)]))).toMatchObject({
      block: 4,
      blinker: 3,
      toad: 6,
      beacon: 8,
      pulsar: 48,
      glider: 5,
      lwss: 9,
      'r-pentomino': 5,
      diehard: 7,
      acorn: 7,
      'gosper-gun': 36,
    });
  });
  it('pulsar has period 3', () => {
    const { m, e } = place(pat('pulsar'), 21, 21, 4, 4);
    e.step();
    expect(e.cells).not.toEqual(m.initial);
    e.step(2);
    expect(e.cells).toEqual(m.initial);
  });
  it('glider moves (1,1) in 4 generations; LWSS moves 2 cells in 4', () => {
    const g = place(pat('glider'), 12, 12, 2, 2);
    g.e.step(4);
    expect(g.e.cells).toEqual(shifted(g.m.initial, 12, 12, 1, 1));
    const l = place(pat('lwss'), 20, 10, 10, 3);
    l.e.step(4);
    const left = shifted(l.m.initial, 20, 10, -2, 0),
      right = shifted(l.m.initial, 20, 10, 2, 0);
    expect(l.e.cells.join() === left.join() || l.e.cells.join() === right.join()).toBe(true);
  });
  it('diehard vanishes after 130 generations', () => {
    const { e } = place(pat('diehard'), 60, 60, 26, 28);
    e.step(129);
    expect(pop(e.cells)).toBeGreaterThan(0);
    e.step(1);
    expect(pop(e.cells)).toBe(0);
  });
  it('Gosper gun has emitted gliders after 60 generations (population grows by 5 per period)', () => {
    const { e } = place(pat('gosper-gun'), 60, 40, 2, 2);
    e.step(30);
    const p30 = pop(e.cells);
    e.step(30);
    expect(pop(e.cells)).toBe(p30 + 5);
  });
  it('rotations and flips are exact and invertible', () => {
    const g = pat('lwss');
    const r4 = rotateCW(rotateCW(rotateCW(rotateCW(g))));
    expect(r4.cells).toEqual(g.cells);
    expect(rotateCW(g)).toMatchObject({ width: g.height, height: g.width });
    expect(flipHorizontal(flipHorizontal(g)).cells).toEqual(g.cells);
    const gl = rotateCW(pat('glider')); // still a glider: moves diagonally
    const { m, e } = place(gl, 12, 12, 4, 4);
    e.step(4);
    expect(e.cells).toEqual(shifted(m.initial, 12, 12, -1, 1));
  });
  it('stamp clips at edges and extract copies a region', () => {
    const grid = new Uint8Array(16);
    const out = stamp(grid, 4, 4, pat('block'), 3, 3);
    expect(pop(out)).toBe(1);
    expect(grid.every((v) => v === 0)).toBe(true); // not mutated
    const ex = extract(out, 4, 2, 2, 3, 3);
    expect([...ex.cells]).toEqual([0, 0, 0, 1]);
  });
});
