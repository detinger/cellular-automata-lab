// Capability registry: what this engine build can actually execute.
import type { RuleId } from './model';

export interface FamilyCapability {
  id: RuleId;
  label: string;
  executable: boolean;
  stateCount: number | 'declared';
  dimensions: '1d' | '2d';
}

export const FAMILY_CAPABILITIES: readonly FamilyCapability[] = [
  { id: 'life-like/v1', label: 'Life-like (outer-totalistic)', executable: true, stateCount: 2, dimensions: '2d' },
  { id: 'elementary/v1', label: 'Elementary CA', executable: true, stateCount: 2, dimensions: '1d' },
  { id: 'brians-brain/v1', label: "Brian's Brain", executable: true, stateCount: 3, dimensions: '2d' },
  { id: 'cyclic/v1', label: 'Cyclic CA', executable: true, stateCount: 'declared', dimensions: '2d' },
  { id: 'forest-fire/v1', label: 'Forest fire', executable: true, stateCount: 3, dimensions: '2d' },
  { id: 'spatial-sir/v1', label: 'Spatial SIR', executable: true, stateCount: 3, dimensions: '2d' },
  { id: 'count-table/v1', label: 'Count-based rule table', executable: true, stateCount: 'declared', dimensions: '2d' },
];

export const capabilityFor = (id: string) => FAMILY_CAPABILITIES.find((c) => c.id === id);
