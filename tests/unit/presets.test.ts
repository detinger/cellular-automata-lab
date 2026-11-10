// Presets are checked against their stated behavior; names alone are not evidence (PLAN.md §3.2).
import { describe, expect, it } from 'vitest';
import { presetById, PRESETS } from '../../src/data/presets';
import { createEngine } from '../../src/domain/engine/engine';
import { sessionSeed } from '../../src/domain/random/prng';
import { validateModel } from '../../src/domain/model/validate';

describe('presets', () => {
  it('all presets validate without errors', () => {
    for (const p of PRESETS) expect(validateModel(p.build()).filter((i) => i.severity === 'error')).toEqual([]);
  });
  it('blinker has period 2 and is not a still life', () => {
    const m = presetById('blinker')!.build();
    const e = createEngine(m);
    e.step();
    expect(e.cells).not.toEqual(m.initial);
    e.step();
    expect(e.cells).toEqual(m.initial);
  });
  it('block is a still life', () => {
    const m = presetById('block')!.build();
    const e = createEngine(m);
    e.step(10);
    expect(e.cells).toEqual(m.initial);
  });
  it('glider returns to its start after 4 × 32 generations on the 32 × 32 torus', () => {
    const m = presetById('glider')!.build();
    const e = createEngine(m);
    e.step(4);
    const shifted = new Uint8Array(m.initial.length);
    m.initial.forEach((v, i) => {
      if (v) shifted[((((i / 32) | 0) + 1) % 32) * 32 + (((i % 32) + 1) % 32)] = 1;
    });
    expect(e.cells).toEqual(shifted);
    e.step(124);
    expect(e.cells).toEqual(m.initial);
  });
});

describe('more presets', () => {
  const period2 = (id: string) => {
    const m = presetById(id)!.build();
    const e = createEngine(m);
    e.step();
    expect(e.cells).not.toEqual(m.initial);
    e.step();
    expect(e.cells).toEqual(m.initial);
  };
  it('toad has period 2', () => period2('toad'));
  it('beacon has period 2', () => period2('beacon'));

  it('there are at least eight presets and every family has one (P0 inventory)', () => {
    expect(PRESETS.length).toBeGreaterThanOrEqual(8);
    expect(new Set(PRESETS.map((p) => p.family))).toEqual(
      new Set(['life-like', 'elementary', 'brians-brain', 'cyclic', 'forest-fire', 'spatial-sir', 'count-table']),
    );
  });

  it('Rule 30 and Rule 90 grow one cell per side per generation from a single seed', () => {
    for (const id of ['rule-30', 'rule-90']) {
      const m = presetById(id)!.build();
      const c = m.width >> 1;
      const e = createEngine(m);
      for (let g = 1; g <= 40; g++) {
        e.step();
        const live = [...e.cells.keys()].filter((i) => e.cells[i]);
        expect(Math.min(...live)).toBe(c - g);
        expect(Math.max(...live)).toBe(c + g);
      }
    }
  });

  it('Rule 90 is left XOR right (Sierpiński): row g has 2^(popcount g) live cells', () => {
    const e = createEngine(presetById('rule-90')!.build());
    for (let g = 1; g <= 64; g++) {
      e.step();
      const pop = g
        .toString(2)
        .split('')
        .filter((b) => b === '1').length;
      expect(e.metrics.counts[1]).toBe(2 ** pop);
    }
  });

  it('Rule 110 grows only to the left of the seed', () => {
    const m = presetById('rule-110')!.build();
    const seed = m.initial.indexOf(1);
    const e = createEngine(m);
    e.step(100);
    const live = [...e.cells.keys()].filter((i) => e.cells[i]);
    expect(Math.max(...live)).toBeLessThanOrEqual(seed);
    expect(Math.min(...live)).toBeLessThan(seed - 50);
  });

  it('Rule 184 traffic: 40% density and cars conserved', () => {
    const m = presetById('rule-184')!.build();
    expect(m.initial.reduce((a, b) => a + b, 0)).toBe(80);
    const e = createEngine(m);
    for (let g = 0; g < 300; g++) {
      e.step();
      expect(e.metrics.counts[1]).toBe(80);
    }
    // Density below 0.5 eventually flows freely: every car moves.
    expect(e.metrics.flow).toBeCloseTo(0.4, 10);
  });
});

describe('Phase 3 presets (behavior verified, stochastic ones for their stated seed)', () => {
  const engineFor = (id: string) => {
    const p = presetById(id)!;
    const m = p.build();
    return { m, e: createEngine(m, { transitionSeed: sessionSeed(p.seed ?? '1', 'transition') }) };
  };
  it('there are at least sixteen presets (P1 inventory)', () => expect(PRESETS.length).toBeGreaterThanOrEqual(16));
  it('every stochastic preset declares its seed', () => {
    for (const p of PRESETS) if (p.family === 'forest-fire' || p.family === 'spatial-sir') expect(p.seed).toBeDefined();
  });
  it('HighLife replicator: two copies at (19,19) and (23,23) after 12 generations', () => {
    const { m, e } = engineFor('highlife-replicator');
    e.step(12);
    const W = m.width;
    const pat = (ox: number, oy: number) => {
      const out: number[] = [];
      for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) out.push(e.cells[(oy + y) * W + ox + x]);
      return out;
    };
    const orig: number[] = [];
    for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) orig.push(m.initial[(21 + y) * W + 21 + x]);
    expect(pat(19, 19)).toEqual(orig);
    expect(pat(23, 23)).toEqual(orig);
    expect(e.metrics.counts[1]).toBe(24);
  });
  it("Brian's Brain excitation moves up one cell per generation", () => {
    const { m, e } = engineFor('brain-glider');
    for (let g = 1; g <= 10; g++) {
      e.step();
      const expected = new Uint8Array(m.initial.length);
      m.initial.forEach((v, i) => {
        if (v) {
          const x = i % 32,
            y = Math.floor(i / 32);
          expected[((y - g + 32) % 32) * 32 + x] = v;
        }
      });
      expect(e.cells).toEqual(expected);
    }
  });
  it('cyclic CA: activity starts near 13% and exceeds 80% by generation 300; cells only ever advance by one', () => {
    const { m, e } = engineFor('cyclic-waves');
    e.step();
    expect(e.metrics.activity!).toBeGreaterThan(0.1);
    expect(e.metrics.activity!).toBeLessThan(0.35);
    let prev = new Uint8Array(e.cells);
    let skips = 0;
    for (let g = 2; g <= 300; g++) {
      e.step();
      for (let i = 0; i < prev.length; i++) {
        const d = (e.cells[i] - prev[i] + 14) % 14;
        if (d > 1) skips++;
      }
      prev = new Uint8Array(e.cells);
    }
    expect(skips).toBe(0);
    expect(e.metrics.activity!).toBeGreaterThan(0.8);
    expect(m.stateCount).toBe(14);
  });
  it('forest-fire front moves one column per generation and burns out after 64', () => {
    const { m, e } = engineFor('fire-front');
    for (let g = 1; g <= 63; g++) {
      e.step();
      for (let y = 0; y < m.height; y++)
        for (let x = 0; x < m.width; x++) {
          expect(e.cells[y * m.width + x]).toBe(x < g ? 0 : x === g ? 2 : 1);
        }
    }
    e.step();
    expect(e.cells.every((v) => v === 0)).toBe(true);
  });
  it('forest-fire regrowth: fire persists and tree cover fluctuates between ~30% and ~55%', () => {
    const { m, e } = engineFor('fire-regrowth');
    let lo = 1,
      hi = 0,
      burning = 0;
    for (let g = 1; g <= 1500; g++) {
      e.step();
      if (e.metrics.counts[2] > 0) burning++;
      if (g > 200) {
        const t = e.metrics.counts[1] / (m.width * m.height);
        lo = Math.min(lo, t);
        hi = Math.max(hi, t);
      }
    }
    expect(burning).toBeGreaterThan(1490);
    expect(lo).toBeLessThan(0.33);
    expect(hi).toBeGreaterThan(0.5);
    expect(hi).toBeLessThan(0.6);
  });
  it('SIR outbreak: S+I+R constant, R never decreases, ends with everyone recovered', () => {
    const { e } = engineFor('sir-outbreak');
    let r = 0;
    for (let g = 1; g <= 300; g++) {
      e.step();
      const [S, I, R] = e.metrics.counts;
      expect(S + I + R).toBe(4096);
      expect(R).toBeGreaterThanOrEqual(r);
      r = R;
    }
    expect(e.metrics.counts).toEqual([0, 0, 4096]);
  });
  it('majority vote freezes within 20 generations', () => {
    const { e } = engineFor('majority-vote');
    let frozenAt = -1;
    for (let g = 1; g <= 20 && frozenAt < 0; g++) {
      e.step();
      if (e.metrics.changed === 0) frozenAt = g;
    }
    expect(frozenAt).toBeGreaterThan(0);
  });
});
