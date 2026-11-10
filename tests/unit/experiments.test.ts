import { describe, expect, it } from 'vitest';
import { toSpec } from '../../src/domain/model/convert';
import { presetById, familyModel, ecaModel, trafficPattern } from '../../src/data/presets';
import type { Model } from '../../src/domain/contracts/model';
import {
  EXPERIMENT_FORMAT,
  SEED_DERIVATION,
  estimateWorkload,
  planRuns,
  validateExperiment,
  type ExperimentDefinition,
} from '../../src/domain/experiments/experiment';
import { executeRun, RunExecutor } from '../../src/domain/experiments/execute';
import { summarizeEvents } from '../../src/domain/stats/summary';

function def(model: Model, over: Partial<ExperimentDefinition> = {}): ExperimentDefinition {
  return {
    format: EXPERIMENT_FORMAT,
    schemaVersion: 1,
    id: 'exp-1',
    name: 'test',
    question: 'Q?',
    hypothesis: 'H',
    createdAt: '2026-11-10T00:00:00.000Z',
    projectId: 'p',
    baseRevisionId: 'r',
    baseModelHash: 'h',
    baseModel: toSpec(model, 'p', 'r'),
    factors: [],
    initialization: { kind: 'fixed' },
    replicates: 1,
    masterSeed: 'm',
    seedDerivation: SEED_DERIVATION,
    design: 'independent',
    horizon: 50,
    sampleInterval: 1,
    stop: { kind: 'horizon' },
    window: { from: 0, to: null },
    response: { metric: 'fraction:1', aggregate: 'final' },
    ...over,
  };
}
const sir = (beta = 0.3, gamma = 0.2, w = 24) =>
  familyModel('sir', { id: 'spatial-sir/v1', beta, gamma, neighborhood: 'moore-r1' }, w, w, [[w >> 1, w >> 1, 1]], { kind: 'periodic' });

describe('run manifest', () => {
  it('E2E-03: a 2 × 3 factor grid with 3 replicates assigns exactly 18 runs with full provenance', () => {
    const d = def(sir(), {
      replicates: 3,
      factors: [
        { id: 'b', label: 'β', target: { kind: 'rule', param: 'beta' }, values: [0.2, 0.4] },
        { id: 'g', label: 'γ', target: { kind: 'rule', param: 'gamma' }, values: [0.05, 0.1, 0.2] },
      ],
    });
    expect(validateExperiment(d).filter((i) => i.severity === 'error')).toEqual([]);
    const runs = planRuns(d);
    expect(runs).toHaveLength(18);
    expect(new Set(runs.map((r) => r.runId)).size).toBe(18);
    expect(new Set(runs.map((r) => r.seeds.transition)).size).toBe(18);
    expect(new Set(runs.map((r) => r.configurationKey)).size).toBe(6);
    // First factor outermost, replicate innermost; values applied to each run's model.
    expect(runs[0].factorValues).toEqual({ b: 0.2, g: 0.05 });
    expect(runs[3].factorValues).toEqual({ b: 0.2, g: 0.1 });
    expect(runs[17].factorValues).toEqual({ b: 0.4, g: 0.2 });
    expect(runs[17].model.rule).toMatchObject({ beta: 0.4, gamma: 0.2 });
    expect(runs[4].seeds.transition).toBe(JSON.stringify(['ca-studio-seed-v1', 'm', 'exp-1', runs[4].configurationKey, 1, 'transition']));
  });
  it("REP-05: executing runs in a different order leaves each run's outputs unchanged", () => {
    const d = def(sir(), { replicates: 3, horizon: 40, factors: [{ id: 'b', label: 'β', target: { kind: 'rule', param: 'beta' }, values: [0.2, 0.5] }] });
    const runs = planRuns(d);
    const forward = runs.map((r) => executeRun(d, r));
    const backward = [...runs]
      .reverse()
      .map((r) => executeRun(d, r))
      .reverse();
    for (let i = 0; i < runs.length; i++) {
      expect(backward[i].samples).toEqual(forward[i].samples);
      expect(backward[i].response).toEqual(forward[i].response);
    }
    // Planning twice gives the same manifest.
    expect(planRuns(d).map((r) => r.seeds)).toEqual(runs.map((r) => r.seeds));
  });
  it('REP-07: paired runs share streams across configurations; replicates differ', () => {
    const d = def(sir(), { design: 'paired', replicates: 2, factors: [{ id: 'g', label: 'γ', target: { kind: 'rule', param: 'gamma' }, values: [0.1, 0.3] }] });
    const runs = planRuns(d);
    expect(runs[0].seeds).toEqual(runs[2].seeds);
    expect(runs[1].seeds).toEqual(runs[3].seeds);
    expect(runs[0].seeds.transition).not.toBe(runs[1].seeds.transition);
  });
  it('regenerated initial conditions are drawn from the initialization stream and recorded', () => {
    const base = ecaModel('traffic', 184, trafficPattern(100), { kind: 'periodic' }, ['Empty', 'Car']);
    const d = def(base, {
      replicates: 2,
      initialization: { kind: 'regenerate', probabilities: [0.5, 0.5] },
      factors: [{ id: 'rho', label: 'density', target: { kind: 'init-probability', state: 1 }, values: [0.2, 0.8] }],
      response: { metric: 'flow', aggregate: 'window-mean' },
      window: { from: 50, to: null },
      horizon: 100,
    });
    expect(validateExperiment(d).filter((i) => i.severity === 'error')).toEqual([]);
    const r = planRuns(d).map((s) => executeRun(d, s));
    const density = (x: { initial: Uint8Array }) => x.initial.reduce((a, b) => a + b, 0) / 100;
    expect(density(r[0])).toBeLessThan(0.4);
    expect(density(r[2])).toBeGreaterThan(0.6);
    expect(r[0].initial).not.toEqual(r[1].initial);
    // Cars are conserved in every run (SIM-12 across experiment runs).
    for (const x of r) for (const s of x.samples) expect(s.counts[1]).toBe(x.samples[0].counts[1]);
    // Free flow at low density: every car moves once traffic settles, so flow = density.
    expect(r[0].response.value).toBeCloseTo(density(r[0]), 10);
    // Jammed at high density: flow = 1 − density.
    expect(r[2].response.value).toBeCloseTo(1 - density(r[2]), 10);
  });
});

describe('analysis', () => {
  it('STAT-05: the sample interval does not change window summaries', () => {
    const m = presetById('fire-regrowth')!.build();
    const base = { horizon: 120, window: { from: 20, to: 100 }, response: { metric: 'fraction:1', aggregate: 'window-mean' } } as const;
    const a = planRuns(def(m, { ...base, sampleInterval: 1 })).map((s) => executeRun(def(m, { ...base, sampleInterval: 1 }), s))[0];
    const b = planRuns(def(m, { ...base, sampleInterval: 7 })).map((s) => executeRun(def(m, { ...base, sampleInterval: 7 }), s))[0];
    expect(b.response.value).toBe(a.response.value);
    expect(b.samples.length).toBeLessThan(a.samples.length);
    expect(b.samples[b.samples.length - 1].generation).toBe(120); // the final state is always kept
  });
  it('absorbing stops carry values forward with a stated reason; censored runs stay censored', () => {
    const d = def(sir(0.15, 0.6, 16), { replicates: 12, horizon: 200, stop: { kind: 'absorbing' }, response: { metric: 'fraction:2', aggregate: 'final' } });
    expect(validateExperiment(d).filter((i) => i.severity === 'error')).toEqual([]);
    const res = planRuns(d).map((s) => executeRun(d, s));
    for (const r of res) {
      expect(r.status).toBe('completed');
      expect(r.stopReason).toBe('absorbing');
      expect(r.absorbing).toBe(true);
      expect(r.response.value).toBe(r.samples[r.samples.length - 1].counts[2] / 256);
      expect(r.response.reason).toMatch(/Absorbing/);
    }
    const short = def(sir(0.5, 0.05, 16), {
      replicates: 6,
      horizon: 5,
      stop: { kind: 'absorbing' },
      response: { metric: 'fraction:2', aggregate: 'event-time' },
    });
    const sr = planRuns(short).map((s) => executeRun(short, s));
    const ev = summarizeEvents(sr.map((r) => r.event!));
    expect(ev.censored).toBe(6);
    expect(ev.conditional.n).toBe(0);
    expect(sr.every((r) => r.response.value === null && /Censored/.test(r.response.reason!))).toBe(true);
  });
  it('a non-absorbing early stop makes later window values unavailable instead of inventing them', () => {
    const m = familyModel('fire', { id: 'forest-fire/v1', growth: 0.01, ignition: 0, neighborhood: 'moore-r1' }, 10, 10, [[5, 5, 2]], { kind: 'periodic' });
    const d = def(m, { horizon: 100, stop: { kind: 'first-no-fire' }, response: { metric: 'fraction:1', aggregate: 'window-mean' } });
    const r = executeRun(d, planRuns(d)[0]);
    expect(r.stopReason).toBe('first-no-fire');
    expect(r.event!.time).toBe(1);
    expect(r.response.value).toBeNull();
    expect(r.response.reason).toMatch(/inside the analysis window/);
  });
  it("recurrence detection finds the blinker's period-2 cycle and the block's fixed point", () => {
    const blink = executeRun(def(presetById('blinker')!.build(), { stop: { kind: 'recurrence' } }), planRuns(def(presetById('blinker')!.build()))[0]);
    expect(blink.stopReason).toBe('recurrence');
    expect(blink.stopDetail).toMatch(/period 2/);
    expect(blink.absorbing).toBe(false);
    const block = executeRun(def(presetById('block')!.build(), { stop: { kind: 'recurrence' } }), planRuns(def(presetById('block')!.build()))[0]);
    expect(block.stopDetail).toMatch(/Fixed point/);
    expect(block.absorbing).toBe(true);
  });
  it('cancellation marks a run cancelled with its last generation and no response', () => {
    const d = def(sir(), { horizon: 10_000 });
    const ex = new RunExecutor(d, planRuns(d)[0]);
    ex.advance(5);
    ex.cancel();
    const r = ex.result();
    expect(r.status).toBe('cancelled');
    expect(r.actualEnd).toBeLessThan(10_000);
    expect(r.response.value).toBeNull();
  });
  it('a resumed run (recovery snapshot) finishes identically to an uninterrupted one', () => {
    const d = def(sir(0.3, 0.1, 32), { horizon: 300, response: { metric: 'fraction:2', aggregate: 'window-mean' } });
    const spec = planRuns(d)[0];
    const full = executeRun(d, spec);
    const a = new RunExecutor(d, spec);
    while (a.generation < 137) a.advance(0.01);
    const snap = structuredClone(a.snapshot());
    const b = new RunExecutor(d, spec, snap);
    while (!b.advance(1000)) {
      /* run */
    }
    const rb = b.result();
    expect(rb.samples).toEqual(full.samples);
    expect(rb.response).toEqual(full.response);
  });
});

describe('experiment validation', () => {
  const codes = (d: ExperimentDefinition) => validateExperiment(d).map((i) => i.code);
  it('rejects identical deterministic replicates', () =>
    expect(codes(def(presetById('glider')!.build(), { replicates: 3 }))).toContain('EXP_DETERMINISTIC_REPLICATES'));
  it('rejects recurrence detection for stochastic models', () => expect(codes(def(sir(), { stop: { kind: 'recurrence' } }))).toContain('EXP_STOP_RECURRENCE'));
  it('rejects an absorbing stop when the exterior is infected', () => {
    const m = sir();
    m.boundary = { kind: 'fixed-exterior', state: 1 };
    expect(codes(def(m, { stop: { kind: 'absorbing' } }))).toContain('EXP_STOP_NOT_ABSORBING');
  });
  it('rejects absorbing stops for forest fire and explains the no-fire policy', () => {
    const m = presetById('fire-regrowth')!.build();
    expect(codes(def(m, { stop: { kind: 'absorbing' } }))).toContain('EXP_STOP_FAMILY');
    expect(codes(def(m, { stop: { kind: 'first-no-fire' } }))).toContain('EDU_NOFIRE_POLICY');
  });
  it('rejects zero runs, bad sample intervals, bad windows and size factors on fixed grids', () => {
    const m = sir();
    expect(codes(def(m, { replicates: 0 }))).toContain('EXP_ZERO_RUNS');
    expect(codes(def(m, { sampleInterval: 100, horizon: 50 }))).toContain('EXP_SAMPLE_INTERVAL');
    expect(codes(def(m, { window: { from: 40, to: 20 } }))).toContain('EXP_WINDOW');
    expect(codes(def(m, { factors: [{ id: 's', label: 'size', target: { kind: 'size' }, values: [16, 32] }] }))).toContain('EXP_FACTOR_NEEDS_INIT');
    expect(codes(def(m, { factors: [{ id: 'b', label: 'β', target: { kind: 'rule', param: 'beta' }, values: [0.2, 1.5] }] }))).toContain('EXP_FACTOR_VALUE');
    expect(codes(def(m, { factors: [{ id: 'p', label: 'p', target: { kind: 'rule', param: 'growth' }, values: [0.1] }] }))).toContain('EXP_FACTOR_TARGET');
  });
  it('preflights workload limits before launch', () => {
    const big = familyModel('big', { id: 'spatial-sir/v1', beta: 0.3, gamma: 0.1, neighborhood: 'moore-r1' }, 1024, 1024, [[1, 1, 1]], { kind: 'periodic' });
    const d = def(big, { replicates: 50, horizon: 1000 });
    const est = estimateWorkload(d);
    expect(est.cellUpdates).toBe(1024 * 1024 * 50 * 1000);
    expect(est.overLimits.join(' ')).toMatch(/billion cell updates/);
    expect(codes(d)).toContain('EXP_WORKLOAD');
    expect(estimateWorkload(def(sir(), { replicates: 300 })).overLimits.join(' ')).toMatch(/300 runs/);
  });
  it('recommends more replicates and warns against burn-in for outbreaks', () => {
    expect(codes(def(sir(), { replicates: 3 }))).toContain('EDU_FEW_REPLICATES');
    expect(codes(def(sir(), { window: { from: 10, to: null }, response: { metric: 'fraction:1', aggregate: 'window-mean' } }))).toContain(
      'EDU_BURNIN_TRANSIENT',
    );
  });
});
