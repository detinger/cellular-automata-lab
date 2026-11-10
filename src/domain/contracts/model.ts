// Versioned model contracts (PLAN.md §8.1). Pure types: no browser or React imports.

export type Neighborhood = 'moore-r1' | 'von-neumann-r1';

export type Boundary = { kind: 'periodic' } | { kind: 'fixed-exterior'; state: number };

export interface CountClause {
  currentStates: number[];
  counts: Array<{ state: number; min: number; max: number }>;
  nextState: number;
}

export type RuleSpec =
  | { id: 'life-like/v1'; birth: number[]; survive: number[] }
  | { id: 'elementary/v1'; ruleNumber: number }
  | { id: 'brians-brain/v1' }
  | { id: 'cyclic/v1'; states: number; threshold: number; neighborhood: Neighborhood }
  | { id: 'forest-fire/v1'; growth: number; ignition: number; neighborhood: Neighborhood }
  | { id: 'spatial-sir/v1'; beta: number; gamma: number; neighborhood: Neighborhood }
  | {
      id: 'count-table/v1';
      states: number;
      neighborhood: Neighborhood;
      clauses: CountClause[];
      fallback: { kind: 'keep-current' } | { kind: 'state'; state: number };
    };

export type RuleId = RuleSpec['id'];

export interface EncodedGrid {
  encoding: 'base64-u8';
  byteLength: number;
  data: string;
}

export interface ModelSpec {
  format: 'ca-studio-model';
  schemaVersion: 1;
  projectId: string;
  revisionId: string;
  name: string;
  width: number;
  height: number;
  stateCount: number;
  stateLabels: string[];
  boundary: Boundary;
  schedule: 'synchronous';
  rule: RuleSpec;
  initial: EncodedGrid;
}

/** Decoded, in-memory form used by the editor and engine. */
export interface Model {
  name: string;
  width: number;
  height: number;
  stateCount: number;
  stateLabels: string[];
  boundary: Boundary;
  schedule: 'synchronous';
  rule: RuleSpec;
  initial: Uint8Array;
}

/** Lattice limits (§7.1). */
export const LIMITS = {
  minSize2d: 3,
  maxSize2d: 1024,
  defaultSize2d: 128,
  minWidth1d: 3,
  maxWidth1d: 4096,
  defaultWidth1d: 255,
} as const;

export const isOneDimensional = (rule: RuleSpec) => rule.id === 'elementary/v1';

/** Semantics version reported in run provenance; bump when any rule behavior changes. */
export const ENGINE_VERSION = 'ca-studio-engine/1.0.0';

/** State value used in display buffers for "no data" (e.g. spacetime rows not yet computed). Never a model state. */
export const VOID_STATE = 255;

/** Rows retained in a 1D spacetime view: roughly square, bounded to 512 KiB per snapshot (§7.3, §9.4). */
export const spacetimeRows = (width: number) => Math.max(64, Math.min(width, 1024, Math.floor(524288 / width)));
