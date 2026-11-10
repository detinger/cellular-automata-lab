import type { Model, ModelSpec } from '../contracts/model';
import { decodeGrid, encodeGrid } from './encoding';

export function toSpec(model: Model, projectId: string, revisionId: string): ModelSpec {
  return {
    format: 'ca-studio-model',
    schemaVersion: 1,
    projectId,
    revisionId,
    name: model.name,
    width: model.width,
    height: model.height,
    stateCount: model.stateCount,
    stateLabels: [...model.stateLabels],
    boundary: { ...model.boundary },
    schedule: 'synchronous',
    rule: structuredClone(model.rule),
    initial: encodeGrid(model.initial),
  };
}

/** Assumes the spec has passed schema validation. */
export function fromSpec(spec: ModelSpec): Model {
  return {
    name: spec.name,
    width: spec.width,
    height: spec.height,
    stateCount: spec.stateCount,
    stateLabels: [...spec.stateLabels],
    boundary: { ...spec.boundary },
    schedule: spec.schedule,
    rule: structuredClone(spec.rule),
    initial: decodeGrid(spec.initial),
  };
}

export const cloneModel = (m: Model): Model => ({
  ...m,
  stateLabels: [...m.stateLabels],
  boundary: { ...m.boundary },
  rule: structuredClone(m.rule),
  initial: new Uint8Array(m.initial),
});
