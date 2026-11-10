// Sensible starting experiment for a model. Students edit every field before running.
import type { Model } from '../../domain/contracts/model';
import { toSpec } from '../../domain/model/convert';
import { isStochasticRule } from '../../domain/engine/engine';
import { newSeed } from '../../domain/random/seeded';
import { EXPERIMENT_FORMAT, SEED_DERIVATION, type ExperimentDefinition } from '../../domain/experiments/experiment';

export function draftExperiment(model: Model, projectId: string, revisionId: string, hash: string): ExperimentDefinition {
  const stochastic = isStochasticRule(model.rule.id);
  const r = model.rule;
  const base: ExperimentDefinition = {
    format: EXPERIMENT_FORMAT,
    schemaVersion: 1,
    id: `exp-${crypto.randomUUID()}`,
    name: `${model.name} experiment`,
    question: '',
    hypothesis: '',
    createdAt: new Date().toISOString(),
    projectId,
    baseRevisionId: revisionId,
    baseModelHash: hash,
    baseModel: toSpec(model, projectId, revisionId),
    factors: [],
    initialization: { kind: 'fixed' },
    replicates: stochastic ? 10 : 1,
    masterSeed: newSeed(),
    seedDerivation: SEED_DERIVATION,
    design: 'independent',
    horizon: 200,
    sampleInterval: 1,
    stop: { kind: 'horizon' },
    window: { from: 0, to: null },
    response: { metric: 'fraction:1', aggregate: 'final' },
  };
  if (r.id === 'spatial-sir/v1')
    return {
      ...base,
      response: { metric: 'fraction:2', aggregate: 'final' },
      factors: [{ id: 'f1', label: 'Infection probability β', target: { kind: 'rule', param: 'beta' }, values: [0.1, 0.2, 0.3] }],
    };
  if (r.id === 'forest-fire/v1')
    return { ...base, horizon: 500, window: { from: 100, to: null }, response: { metric: 'fraction:1', aggregate: 'window-mean' } };
  if (r.id === 'elementary/v1' && r.ruleNumber === 184 && model.boundary.kind === 'periodic')
    return {
      ...base,
      replicates: 5,
      initialization: { kind: 'regenerate', probabilities: [0.5, 0.5] },
      horizon: 300,
      window: { from: 100, to: null },
      response: { metric: 'flow', aggregate: 'window-mean' },
      factors: [{ id: 'f1', label: 'Car density', target: { kind: 'init-probability', state: 1 }, values: [0.1, 0.3, 0.5, 0.7, 0.9] }],
    };
  return base;
}
