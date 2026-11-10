// The experiment package export validates against its versioned schema; example files stay valid.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import Ajv from 'ajv';
import { presetById } from '../../src/data/presets';
import { draftExperiment } from '../../src/features/experiments/drafts';
import { planRuns } from '../../src/domain/experiments/experiment';
import { executeRun } from '../../src/domain/experiments/execute';
import { experimentJson } from '../../src/interchange/experimentExport';
import { importModelJson } from '../../src/interchange/modelJson';

const read = (p: string) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));

describe('export schemas', () => {
  const ajv = new Ajv({ allErrors: true, strict: false, validateFormats: false });
  ajv.addSchema(read('../../src/schemas/model.v1.schema.json'));
  const validatePackage = ajv.compile(read('../../src/schemas/experiment-package.v1.schema.json'));

  it('a real experiment export validates', () => {
    const m = presetById('sir-outbreak')!.build();
    const small = { ...m, width: 16, height: 16, initial: new Uint8Array(256) };
    small.initial[8 * 16 + 8] = 1;
    const def = { ...draftExperiment(small, 'p', 'r', 'h'), replicates: 2, horizon: 20 };
    const runs = planRuns(def).map((s) => executeRun(def, s));
    const pkg = JSON.parse(experimentJson(def, runs, { includeSamples: false, conclusion: '', runtime: null, status: 'completed' }));
    expect(validatePackage(pkg), JSON.stringify(validatePackage.errors)).toBe(true);
    expect(JSON.stringify(pkg)).not.toMatch(/NaN|Infinity/);
  });
  it('the bundled example files are valid', () => {
    expect(validatePackage(read('../../examples/sir-beta-sweep.ca-experiment.json')), JSON.stringify(validatePackage.errors)).toBe(true);
    for (const f of ['glider-torus.ca.json', 'sir-outbreak.ca.json', 'majority-vote.ca.json']) {
      const r = importModelJson(readFileSync(new URL(`../../examples/${f}`, import.meta.url), 'utf8'));
      expect(r.ok, f).toBe(true);
    }
  });
});
