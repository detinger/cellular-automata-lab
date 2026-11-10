import { describe, expect, it } from 'vitest';
import { modelFromRle, parseRle, writeRle } from '../../src/interchange/rle';
import { PRESETS } from '../../src/data/presets';

describe('RLE subset', () => {
  it('parses comments, header, rule, wrapping and blank rows', () => {
    const r = parseRle('#N Glider\n#C test\nx = 3, y = 4, rule = b3/s23\nbo$2bo$\n3o!\n');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.pattern.name).toBe('Glider');
    expect(r.pattern.rule).toEqual({ birth: [3], survive: [2, 3] });
    expect([...r.pattern.cells].join('')).toBe('010' + '001' + '111' + '000');
  });

  it('accepts run counts on $ and line breaks inside runs', () => {
    const r = parseRle('x = 2, y = 4\no2$\nbo!');
    expect(r.ok && [...r.pattern.cells].join('')).toBe('10' + '00' + '01' + '00');
  });

  const rejects: Array<[string, string, RegExp]> = [
    ['missing terminator', 'x = 2, y = 1\n2o', /terminator/],
    ['multistate token', 'x = 2, y = 1\nAB!', /not supported/],
    ['row too long', 'x = 2, y = 1\n3o!', /longer than/],
    ['too many rows', 'x = 1, y = 1\no$o!', /more rows/],
    ['trailing data', 'x = 1, y = 1\no!\nooo', /after the/],
    ['bounded-grid suffix', 'x = 1, y = 1, rule = B3/S23:T10,10\no!', /suffixes/],
    ['other rule notation', 'x = 1, y = 1, rule = 23/3\no!', /Unsupported rule/],
    ['zero count', 'x = 2, y = 1\n0o!', /positive/],
    ['huge size', 'x = 99999, y = 99999\no!', /largest supported/],
    ['bad header', 'X: 3\no!', /Invalid header/],
  ];
  it.each(rejects)('rejects %s', (_n, text, msg) => {
    const r = parseRle(text);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(msg);
  });

  it('INT-03: write → parse round-trips every 2D preset', () => {
    for (const p of PRESETS.filter((q) => q.family === 'life-like')) {
      const m = p.build();
      if (m.rule.id !== 'life-like/v1') continue;
      const text = writeRle(m.width, m.height, m.initial, m.rule, ['#N ' + m.name]);
      const r = parseRle(text);
      expect(r.ok).toBe(true);
      if (!r.ok) continue;
      expect(r.pattern.cells).toEqual(m.initial);
      expect(r.pattern.rule).toEqual({ birth: m.rule.birth, survive: m.rule.survive });
      expect(r.pattern.name).toBe(m.name);
      expect(text.split('\n').every((l) => l.length <= 70)).toBe(true);
    }
  });
});

describe('modelFromRle', () => {
  const LIFE = { birth: [3], survive: [2, 3] };
  it('centers the pattern on a padded lattice with a dead fixed boundary', () => {
    const r = parseRle('#N Glider\nx = 3, y = 3\nbo$2bo$3o!');
    if (!r.ok) throw new Error(r.message);
    const m = modelFromRle(r.pattern, LIFE, 'file');
    expect(m.name).toBe('Glider');
    expect([m.width, m.height]).toEqual([64, 64]);
    expect(m.boundary).toEqual({ kind: 'fixed-exterior', state: 0 });
    expect(m.rule).toEqual({ id: 'life-like/v1', ...LIFE });
    const live: Array<[number, number]> = [];
    m.initial.forEach((v, i) => {
      if (v) live.push([i % 64, Math.floor(i / 64)]);
    });
    // The 3×3 box's top-left is at (30, 30).
    expect(live).toEqual([
      [31, 30],
      [32, 31],
      [30, 32],
      [31, 32],
      [32, 32],
    ]);
  });
  it('never exceeds the maximum lattice side and falls back to the file name', () => {
    const m = modelFromRle({ width: 1020, height: 3, cells: new Uint8Array(3060), rule: null, name: null, comments: [] }, LIFE, 'big');
    expect(m.width).toBe(1024);
    expect(m.height).toBe(64);
    expect(m.name).toBe('big');
  });
});
