import { describe, expect, it } from 'vitest';
import { compareIndependent, comparePaired, compatibility, diffModels, hamming } from '../../src/domain/compare/compare';
import { presetById, familyModel } from '../../src/data/presets';
import { toSpec } from '../../src/domain/model/convert';
import { EXPERIMENT_FORMAT, SEED_DERIVATION, planRuns, type ExperimentDefinition } from '../../src/domain/experiments/experiment';
import type { Model } from '../../src/domain/contracts/model';

describe('assumption diff', () => {
  it('E2E-05 (domain): a changed boundary is listed, and Hamming stays available for equal sizes', () => {
    const a = presetById('glider')!.build();
    const b = { ...a, boundary: { kind: 'fixed-exterior' as const, state: 0 } };
    const d = diffModels(a, b);
    expect(d).toEqual([{ field: 'Boundary', baseline: 'Periodic (torus)', alternative: 'Fixed exterior (Dead)' }]);
    expect(compatibility(a, b)).toMatchObject({ hamming: true, normalize: false, paired: true });
  });
  it('a different size disables Hamming and requires normalization', () => {
    const a = presetById('glider')!.build();
    const b = { ...a, width: 40, height: 40, initial: new Uint8Array(1600) };
    const c = compatibility(a, b);
    expect(c.hamming).toBe(false);
    expect(c.hammingReason).toMatch(/same size/);
    expect(c.normalize).toBe(true);
    expect(c.paired).toBe(false);
    expect(diffModels(a, b).map((x) => x.field)).toEqual(['Lattice size', 'Initial condition']);
  });
  it('different families or labels disable unsupported comparisons instead of guessing', () => {
    const a = presetById('sir-outbreak')!.build();
    const b = familyModel('f', { id: 'forest-fire/v1', growth: 0.1, ignition: 0, neighborhood: 'moore-r1' }, 64, 64, [], { kind: 'periodic' });
    expect(compatibility(a, b).hamming).toBe(false);
    expect(compatibility(a, b).paired).toBe(false);
    expect(diffModels(a, b).map((x) => x.field)).toContain('State labels');
  });
  it('lists cell differences and seeds of stochastic models', () => {
    const a = presetById('sir-outbreak')!.build();
    const b: Model = { ...a, initial: new Uint8Array(a.initial) };
    b.initial[0] = 1;
    expect(diffModels(a, b, { a: '1', b: '2' }).map((x) => x.field)).toEqual(['Initial condition', 'Transition seed']);
  });
  it('Hamming distance is the fraction of unequal aligned sites', () => {
    expect(hamming(Uint8Array.from([0, 1, 1, 0]), Uint8Array.from([0, 0, 1, 1]))).toBe(0.5);
    expect(() => hamming(new Uint8Array(2), new Uint8Array(3))).toThrow();
  });
});

describe('outcome differences', () => {
  it('independent: Welch interval; relative change N/A at a zero baseline', () => {
    const d = compareIndependent([1, 2, 3], [4, 5, 6]);
    expect(d.mean).toBe(3);
    // Equal variances 1 and n = 3: se = √(2/3), df = 4, t(0.975, 4) = 2.776445…
    expect(d.ci95![0]).toBeCloseTo(3 - 2.7764451051977987 * Math.sqrt(2 / 3), 9);
    expect(compareIndependent([0, 0], [1, 1]).relative).toEqual({ absolute: 1, percent: null });
  });
  it('paired: summarizes per-pair differences', () => {
    const d = comparePaired([
      [1, 2],
      [3, 5],
      [5, 8],
    ]);
    expect(d.mean).toBe(2);
    expect(d.n).toBe(3);
    expect(d.method).toMatch(/paired/);
  });
  it('REP-07: paired comparison experiments share streams via the seed scope', () => {
    const m = presetById('sir-outbreak')!.build();
    const def = (id: string, beta: number): ExperimentDefinition => ({
      format: EXPERIMENT_FORMAT,
      schemaVersion: 1,
      id,
      name: id,
      question: '',
      hypothesis: '',
      createdAt: '',
      projectId: 'p',
      baseRevisionId: 'r',
      baseModelHash: 'h',
      baseModel: toSpec({ ...m, rule: { id: 'spatial-sir/v1', beta, gamma: 0.1, neighborhood: 'moore-r1' } }, 'p', 'r'),
      factors: [],
      initialization: { kind: 'fixed' },
      replicates: 3,
      masterSeed: 'm',
      seedDerivation: SEED_DERIVATION,
      design: 'paired',
      seedScope: 'cmp-1',
      horizon: 10,
      sampleInterval: 1,
      stop: { kind: 'horizon' },
      window: { from: 0, to: null },
      response: { metric: 'fraction:2', aggregate: 'final' },
    });
    const a = planRuns(def('exp-a', 0.2)),
      b = planRuns(def('exp-b', 0.4));
    expect(a.map((r) => r.seeds)).toEqual(b.map((r) => r.seeds));
    const ia = planRuns({ ...def('exp-a', 0.2), design: 'independent', seedScope: undefined }),
      ib = planRuns({ ...def('exp-b', 0.2), design: 'independent', seedScope: undefined });
    expect(ia[0].seeds.transition).not.toBe(ib[0].seeds.transition);
  });
});
