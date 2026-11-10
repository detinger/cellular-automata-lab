// Import rejection fixtures and JSON round trip (PLAN.md §8.1, INT-01, INT-04).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { exportModelJson, importModelJson } from '../../src/interchange/modelJson';
import { modelHash } from '../../src/domain/model/hash';
import { createEngine } from '../../src/domain/engine/engine';
import { decodeGrid, encodeGrid } from '../../src/domain/model/encoding';
import { PRESETS } from '../../src/data/presets';
import { live } from './helpers';

const fixture = readFileSync(new URL('../fixtures/blinker-5x5.ca.json', import.meta.url), 'utf8');
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- fixtures are mutated freely to build invalid inputs
const mutate = (fn: (d: any) => void) => {
  const d = JSON.parse(fixture);
  fn(d);
  return JSON.stringify(d);
};

describe('model JSON import', () => {
  it('imports the §8.1 blinker fixture with live cells at (1,2),(2,2),(3,2)', () => {
    const r = importModelJson(fixture);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(live(r.model.initial, 5)).toEqual([
      [1, 2],
      [2, 2],
      [3, 2],
    ]);
    const e = createEngine(r.model);
    e.step();
    expect(live(e.cells, 5)).toEqual([
      [2, 1],
      [2, 2],
      [2, 3],
    ]);
  });

  const rejects: Array<[string, string, string]> = [
    ['malformed JSON', '{"format":', 'SCHEMA_JSON_PARSE'],
    ['missing version', mutate((d) => delete d.schemaVersion), 'SCHEMA_INVALID'],
    ['future version', mutate((d) => (d.schemaVersion = 2)), 'SCHEMA_VERSION_UNSUPPORTED'],
    ['unknown field', mutate((d) => (d.script = 'alert(1)')), 'SCHEMA_INVALID'],
    ['inconsistent byte count', mutate((d) => (d.initial.byteLength = 24)), 'SCHEMA_BYTE_LENGTH'],
    ['bad base64', mutate((d) => (d.initial.data = '!!!!')), 'SCHEMA_INVALID'],
    ['cell out of range', mutate((d) => (d.initial.data = encodeGrid(new Uint8Array(25).fill(2)).data)), 'STRUCT_CELL_RANGE'],
    ['B/S digit 9', mutate((d) => (d.rule.birth = [9])), 'SCHEMA_INVALID'],
    [
      'forest fire without parameters',
      mutate((d) => {
        d.rule = { id: 'forest-fire/v1' };
        d.stateCount = 3;
        d.stateLabels = ['E', 'T', 'B'];
      }),
      'SCHEMA_INVALID',
    ],
    [
      'probability above 1',
      mutate((d) => {
        d.rule = { id: 'spatial-sir/v1', beta: 2, gamma: 0.1, neighborhood: 'moore-r1' };
        d.stateCount = 3;
        d.stateLabels = ['S', 'I', 'R'];
      }),
      'SCHEMA_INVALID',
    ],
    [
      'count table without default',
      mutate((d) => {
        d.rule = { id: 'count-table/v1', states: 2, neighborhood: 'moore-r1', clauses: [] };
      }),
      'SCHEMA_INVALID',
    ],
    [
      'count table with code in a clause',
      mutate((d) => {
        d.rule = {
          id: 'count-table/v1',
          states: 2,
          neighborhood: 'moore-r1',
          clauses: [{ currentStates: [0], counts: [], nextState: 1, when: 'x > 1' }],
          fallback: { kind: 'keep-current' },
        };
      }),
      'SCHEMA_INVALID',
    ],
    [
      'overlapping count table',
      mutate((d) => {
        d.rule = {
          id: 'count-table/v1',
          states: 2,
          neighborhood: 'moore-r1',
          clauses: [
            { currentStates: [0], counts: [], nextState: 1 },
            { currentStates: [0], counts: [], nextState: 1 },
          ],
          fallback: { kind: 'keep-current' },
        };
      }),
      'RULE_TABLE_OVERLAP',
    ],
    [
      'too small',
      mutate((d) => {
        d.width = 2;
        d.height = 2;
        d.initial = encodeGrid(new Uint8Array(4));
      }),
      'STRUCT_DIMENSIONS',
    ],
    [
      'wrong state count',
      mutate((d) => {
        d.stateCount = 3;
        d.stateLabels.push('X');
      }),
      'STRUCT_STATE_COUNT',
    ],
    ['exterior state out of range', mutate((d) => (d.boundary.state = 5)), 'STRUCT_BOUNDARY_STATE'],
  ];
  it.each(rejects)('rejects %s', (_name, text, code) => {
    const r = importModelJson(text);
    expect(r.ok).toBe(false);
    expect(r.issues.map((i) => i.code)).toContain(code);
    expect(r.issues.every((i) => i.message.length > 0 && typeof i.path === 'string')).toBe(true);
  });

  it('imports a multistate family without issues', () => {
    const r = importModelJson(
      mutate((d) => {
        d.rule = { id: 'brians-brain/v1' };
        d.stateCount = 3;
        d.stateLabels = ['Ready', 'Firing', 'Refractory'];
      }),
    );
    expect(r.ok).toBe(true);
    expect(r.issues.filter((i) => i.severity === 'error')).toEqual([]);
  });
});

describe('round trips', () => {
  it('INT-01: export → import preserves semantics, bytes and hash for every preset', async () => {
    for (const p of PRESETS) {
      const m = p.build();
      const r = importModelJson(exportModelJson(m, 'p', 'r'));
      expect(r.ok).toBe(true);
      if (!r.ok) continue;
      expect(r.model).toEqual(m);
      expect(await modelHash(r.model)).toBe(await modelHash(m));
    }
  });

  it('hash ignores names but changes with cells or rule', async () => {
    const m = PRESETS[0].build();
    const h = await modelHash(m);
    expect(await modelHash({ ...m, name: 'Other' })).toBe(h);
    const cells = new Uint8Array(m.initial);
    cells[0] = 1;
    expect(await modelHash({ ...m, initial: cells })).not.toBe(h);
    expect(await modelHash({ ...m, rule: { id: 'life-like/v1', birth: [3, 6], survive: [2, 3] } })).not.toBe(h);
    expect(await modelHash({ ...m, rule: { id: 'life-like/v1', birth: [3], survive: [3, 2] } })).toBe(h);
  });

  it('base64 encoding round-trips large grids', () => {
    const g = new Uint8Array(1024 * 1024).map((_, i) => i % 2);
    expect(decodeGrid(encodeGrid(g))).toEqual(g);
  });
});
