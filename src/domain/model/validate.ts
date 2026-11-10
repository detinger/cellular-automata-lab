// Structural, semantic and capability validation of a decoded model.
import type { Model } from '../contracts/model';
import { LIMITS } from '../contracts/model';
import { capabilityFor } from '../contracts/capabilities';
import type { ValidationIssue } from '../contracts/validation';
import { validateCountTable } from '../rules/countTable';

const FAMILY_STATES: Record<string, number> = {
  'life-like/v1': 2,
  'elementary/v1': 2,
  'brians-brain/v1': 3,
  'forest-fire/v1': 3,
  'spatial-sir/v1': 3,
};

export function validateModel(model: Model): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const err = (code: string, category: ValidationIssue['category'], path: string, message: string, suggestion?: string) =>
    issues.push({ code, severity: 'error', category, path, message, suggestion });

  const { width, height, rule } = model;
  const oneD = rule.id === 'elementary/v1';
  if (oneD) {
    if (height !== 1) err('STRUCT_ECA_HEIGHT', 'structure', '/height', 'An elementary CA has height 1.', 'Set height to 1.');
    if (!Number.isInteger(width) || width < LIMITS.minWidth1d || width > LIMITS.maxWidth1d)
      err('STRUCT_DIMENSIONS', 'structure', '/width', `Elementary CA width must be ${LIMITS.minWidth1d}–${LIMITS.maxWidth1d} cells.`);
  } else {
    for (const [key, v] of [
      ['width', width],
      ['height', height],
    ] as const) {
      if (!Number.isInteger(v) || v < LIMITS.minSize2d || v > LIMITS.maxSize2d)
        err(
          'STRUCT_DIMENSIONS',
          'structure',
          `/${key}`,
          `${key[0].toUpperCase() + key.slice(1)} must be an integer from ${LIMITS.minSize2d} to ${LIMITS.maxSize2d}.`,
          'Smaller worlds let a periodic neighborhood map two offsets to the same cell.',
        );
    }
  }

  const expected = FAMILY_STATES[rule.id] ?? ('states' in rule ? rule.states : undefined);
  const neighborhoodOk = (n: unknown) => n === 'moore-r1' || n === 'von-neumann-r1';
  if ('neighborhood' in rule && !neighborhoodOk(rule.neighborhood))
    err('RULE_NEIGHBORHOOD', 'semantics', '/rule/neighborhood', 'Choose the Moore or von Neumann radius-1 neighborhood.');
  const prob = (key: string, v: number, label: string) => {
    if (!Number.isFinite(v) || v < 0 || v > 1) err('RULE_PROBABILITY', 'semantics', `/rule/${key}`, `${label} must be a probability from 0 to 1.`);
  };
  if (rule.id === 'cyclic/v1') {
    if (!Number.isInteger(rule.states) || rule.states < 3 || rule.states > 16)
      err('RULE_CYCLIC_STATES', 'semantics', '/rule/states', 'A cyclic CA has 3–16 states.');
    const n = rule.neighborhood === 'moore-r1' ? 8 : 4;
    if (!Number.isInteger(rule.threshold) || rule.threshold < 1 || rule.threshold > n)
      err('RULE_CYCLIC_THRESHOLD', 'semantics', '/rule/threshold', `The threshold must be a whole number from 1 to ${n} for this neighborhood.`);
  }
  if (rule.id === 'forest-fire/v1') {
    prob('growth', rule.growth, 'Growth probability p');
    prob('ignition', rule.ignition, 'Lightning probability f');
  }
  if (rule.id === 'spatial-sir/v1') {
    prob('beta', rule.beta, 'Infection probability β');
    prob('gamma', rule.gamma, 'Recovery probability γ');
  }
  if (rule.id === 'count-table/v1') issues.push(...validateCountTable(rule));
  if (expected !== undefined && model.stateCount !== expected)
    err('STRUCT_STATE_COUNT', 'structure', '/stateCount', `This rule family uses ${expected} states, but the model declares ${model.stateCount}.`);
  if (model.stateLabels.length !== model.stateCount)
    err('STRUCT_STATE_LABELS', 'structure', '/stateLabels', `Provide exactly ${model.stateCount} state labels (found ${model.stateLabels.length}).`);

  if (model.boundary.kind === 'fixed-exterior') {
    const s = model.boundary.state;
    if (!Number.isInteger(s) || s < 0 || s >= model.stateCount)
      err('STRUCT_BOUNDARY_STATE', 'structure', '/boundary/state', `The exterior state must be a valid state ID (0–${model.stateCount - 1}).`);
  }

  if (model.initial.length !== width * height) {
    err(
      'STRUCT_BYTE_LENGTH',
      'structure',
      '/initial/byteLength',
      `The initial grid has ${model.initial.length} cells; ${width} × ${height} needs ${width * height}.`,
    );
  } else {
    for (let i = 0; i < model.initial.length; i++) {
      if (model.initial[i] >= model.stateCount) {
        err(
          'STRUCT_CELL_RANGE',
          'structure',
          `/initial[${i}]`,
          `Cell (${i % width}, ${Math.floor(i / width)}) has state ${model.initial[i]}, outside 0–${model.stateCount - 1}.`,
        );
        break;
      }
    }
  }

  if (rule.id === 'life-like/v1') {
    for (const key of ['birth', 'survive'] as const) {
      const set = rule[key];
      if (set.some((d) => !Number.isInteger(d) || d < 0 || d > 8))
        err('RULE_BS_DIGIT', 'semantics', `/rule/${key}`, 'Life-like neighbor counts must be integers 0–8.');
      if (new Set(set).size !== set.length) err('RULE_BS_DUPLICATE', 'semantics', `/rule/${key}`, 'Each neighbor count may appear only once.');
    }
  }
  if (rule.id === 'elementary/v1' && (!Number.isInteger(rule.ruleNumber) || rule.ruleNumber < 0 || rule.ruleNumber > 255))
    err('RULE_ECA_RANGE', 'semantics', '/rule/ruleNumber', 'Elementary rule numbers are integers 0–255.');

  const cap = capabilityFor(rule.id);
  if (!cap?.executable) {
    issues.push({
      code: 'CAP_FAMILY_NOT_EXECUTABLE',
      severity: 'error',
      category: 'capability',
      path: '/rule/id',
      message: `${cap?.label ?? rule.id} models can be described but not run in this build.`,
      consequence: 'Run and Step are unavailable for this model.',
      suggestion: 'Choose a supported rule family.',
    });
  }

  if (rule.id === 'elementary/v1' && rule.ruleNumber === 184 && model.boundary.kind !== 'periodic') {
    issues.push({
      code: 'EDU_TRAFFIC_BOUNDARY',
      severity: 'recommendation',
      category: 'educational',
      path: '/boundary',
      message: 'Rule 184 is taught as traffic on a periodic ring.',
      consequence: 'With a fixed exterior, cars leave or enter at the ends, so the car count is not conserved and flow is not reported.',
      suggestion: 'Choose the periodic boundary to study density versus flow.',
    });
  }
  if (rule.id === 'life-like/v1' && model.boundary.kind === 'fixed-exterior' && model.boundary.state === 1) {
    issues.push({
      code: 'EDU_LIVE_EXTERIOR',
      severity: 'warning',
      category: 'educational',
      path: '/boundary/state',
      message: 'The exterior is alive, so every edge cell sees live neighbors outside the grid.',
      consequence: 'Edge behavior will differ sharply from an empty background.',
    });
  }
  if (rule.id === 'spatial-sir/v1' && model.boundary.kind === 'fixed-exterior' && model.boundary.state === 1) {
    issues.push({
      code: 'EDU_INFECTED_EXTERIOR',
      severity: 'warning',
      category: 'educational',
      path: '/boundary/state',
      lessonId: 'L08-stochastic-sir',
      message: 'The exterior is infected, so edge cells are exposed to infection from outside the lattice in every generation.',
      consequence: 'Infection inside the lattice can never die out for good, so “extinction” is not an absorbing state.',
      suggestion: 'Use a periodic boundary or a susceptible/recovered exterior to study outbreaks that end.',
    });
  }
  if (rule.id === 'forest-fire/v1' && model.boundary.kind === 'fixed-exterior' && model.boundary.state === 2) {
    issues.push({
      code: 'EDU_BURNING_EXTERIOR',
      severity: 'warning',
      category: 'educational',
      path: '/boundary/state',
      message: 'The exterior is burning, so every tree on the edge ignites in the next generation.',
      consequence: 'Fires restart from all four edges for as long as trees grow there.',
    });
  }
  if ((rule.id === 'spatial-sir/v1' || rule.id === 'forest-fire/v1') && !model.initial.some((v) => v === (rule.id === 'spatial-sir/v1' ? 1 : 2))) {
    const noSpontaneous = rule.id === 'spatial-sir/v1' || rule.ignition === 0;
    if (noSpontaneous && !(model.boundary.kind === 'fixed-exterior' && model.boundary.state === (rule.id === 'spatial-sir/v1' ? 1 : 2))) {
      issues.push({
        code: 'EDU_NO_SOURCE',
        severity: 'information',
        category: 'educational',
        path: '/initial',
        message: rule.id === 'spatial-sir/v1' ? 'No cell is infected at generation 0.' : 'No cell is burning at generation 0 and lightning probability f is 0.',
        consequence:
          rule.id === 'spatial-sir/v1'
            ? 'Nothing will ever be infected: this model has no external infection.'
            : 'No fire can start; only tree growth will happen.',
        suggestion: rule.id === 'spatial-sir/v1' ? 'Paint at least one infected cell.' : 'Paint a burning cell or set f above 0.',
      });
    }
  }
  return issues;
}
