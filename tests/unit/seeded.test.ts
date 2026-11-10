import { describe, expect, it } from 'vitest';
import { fillRect, normalizeProbabilities, normalizeRect, randomFill, randomInitialize } from '../../src/domain/random/seeded';
import { createStream, independentSeed, pairedSeed, restoreStream } from '../../src/domain/random/prng';

describe('PRNG adapter (seedrandom alea)', () => {
  it('is pinned: the first outputs for a known seed never change', () => {
    const s = createStream('ca-studio');
    const first = [s.next(), s.next(), s.next()].map((v) => v.toFixed(12));
    // Golden values for seedrandom@3.0.5 alea; a change here breaks reproducibility of saved runs.
    expect(first).toEqual(GOLDEN);
  });
  it('save/restore continues the identical sequence', () => {
    const a = createStream('x');
    for (let i = 0; i < 37; i++) a.next();
    const st = a.state();
    const ahead = Array.from({ length: 20 }, () => a.next());
    const b = restoreStream(st);
    expect(Array.from({ length: 20 }, () => b.next())).toEqual(ahead);
  });
  it('derives distinct structured seeds per replicate and stream, shared within a pair group (REP-07)', () => {
    const a = independentSeed('m', 'e', 'cfg', 0, 'transition');
    expect(a).toBe('["ca-studio-seed-v1","m","e","cfg",0,"transition"]');
    expect(independentSeed('m', 'e', 'cfg', 1, 'transition')).not.toBe(a);
    expect(independentSeed('m', 'e', 'cfg', 0, 'initialization')).not.toBe(a);
    // Structural encoding: no collisions from ad hoc concatenation.
    expect(independentSeed('m', 'e', 'a,b', 0, 'transition')).not.toBe(independentSeed('m', 'e,a', 'b', 0, 'transition'));
    expect(pairedSeed('m', 'e', 'g', 2, 'transition')).toBe(pairedSeed('m', 'e', 'g', 2, 'transition'));
  });
});

// Computed with plain `require('seedrandom').alea('ca-studio')` outside the adapter and checked in.
const GOLDEN = ['0.484381343704', '0.036525693256', '0.877631193260'];

describe('randomInitialize', () => {
  it('is reproducible from (seed, probabilities) and differs for another seed', () => {
    const g = new Uint8Array(64 * 64);
    expect(randomFill(g, 64, 64, 0.3, '7')).toEqual(randomFill(g, 64, 64, 0.3, '7'));
    expect(randomFill(g, 64, 64, 0.3, '7')).not.toEqual(randomFill(g, 64, 64, 0.3, '8'));
  });
  it('probabilities 0 and 1 are exact; proportions are close on a large grid', () => {
    const g = new Uint8Array(200 * 200);
    expect(randomFill(g, 200, 200, 0, '1').every((v) => v === 0)).toBe(true);
    expect(randomFill(g, 200, 200, 1, '1').every((v) => v === 1)).toBe(true);
    const out = randomInitialize(g, 200, 200, [0.5, 0.3, 0.2], '1');
    const c = [0, 0, 0];
    out.forEach((v) => c[v]++);
    expect(Math.abs(c[1] / g.length - 0.3)).toBeLessThan(0.01);
    expect(Math.abs(c[2] / g.length - 0.2)).toBeLessThan(0.01);
  });
  it('a state with probability 0 never appears, even the last one', () => {
    const out = randomInitialize(new Uint8Array(10000), 100, 100, [0.4, 0.6, 0], 's');
    expect(out.every((v) => v < 2)).toBe(true);
  });
  it('touches only the rectangle and does not mutate the input', () => {
    const g = new Uint8Array(10 * 10).fill(1);
    const out = randomFill(g, 10, 10, 0, '3', { x0: 2, y0: 3, x1: 4, y1: 5 });
    expect(g.every((v) => v === 1)).toBe(true);
    for (let y = 0; y < 10; y++)
      for (let x = 0; x < 10; x++) {
        const inside = x >= 2 && x <= 4 && y >= 3 && y <= 5;
        expect(out[y * 10 + x]).toBe(inside ? 0 : 1);
      }
  });
  it('validates probabilities', () => {
    expect(normalizeProbabilities([0.5, 0.5]).ok).toBe(true);
    expect(normalizeProbabilities([0.5, 0.4]).ok).toBe(false);
    expect(normalizeProbabilities([1.5, -0.5]).ok).toBe(false);
    expect(normalizeProbabilities([Number.NaN, 1]).ok).toBe(false);
    expect(() => randomFill(new Uint8Array(4), 2, 2, 1.5, '1')).toThrow();
  });
});

describe('region helpers', () => {
  it('normalizeRect orders and clips corners', () => {
    expect(normalizeRect({ x: 5, y: -2 }, { x: 1, y: 20 }, 8, 8)).toEqual({ x0: 1, y0: 0, x1: 5, y1: 7 });
  });
  it('fillRect fills inclusively', () => {
    const out = fillRect(new Uint8Array(16), 4, { x0: 1, y0: 1, x1: 2, y1: 2 }, 1);
    expect(Array.from(out)).toEqual([0, 0, 0, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 0, 0, 0]);
  });
});
