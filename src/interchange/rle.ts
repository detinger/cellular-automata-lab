// Binary RLE subset: `#` comments, `x = m, y = n[, rule = B…/S…]` header, run counts,
// `b` dead, `o` live, `$` row advance, required `!` terminator. Stricter than some tools by design.
import { LIMITS, type Model } from '../domain/contracts/model';
import { formatLifeLike, parseLifeLike, type LifeLikeRule } from '../domain/rules/lifeLike';

export interface RlePattern {
  width: number;
  height: number;
  /** Row-major, 1 = live. */
  cells: Uint8Array;
  rule: LifeLikeRule | null;
  name: string | null;
  comments: string[];
}

export type RleResult = { ok: true; pattern: RlePattern } | { ok: false; line: number; message: string };

export const MAX_RLE_BYTES = 32 * 1024 * 1024;

export function parseRle(text: string, maxSide: number = LIMITS.maxSize2d): RleResult {
  if (text.length > MAX_RLE_BYTES) return { ok: false, line: 0, message: 'The file exceeds the 32 MiB import limit.' };
  const lines = text.split(/\r\n|\n|\r/);
  const comments: string[] = [];
  let name: string | null = null;
  let i = 0;
  for (; i < lines.length; i++) {
    const l = lines[i].trim();
    if (l === '') continue;
    if (!l.startsWith('#')) break;
    comments.push(l);
    if (/^#N\s/.test(l)) name = l.slice(2).trim();
  }
  const fail = (message: string, line = i + 1): RleResult => ({ ok: false, line, message });
  if (i >= lines.length) return fail('Missing header line such as “x = 3, y = 3, rule = B3/S23”.');

  const header = lines[i].trim();
  const m = /^x\s*=\s*(\d+)\s*,\s*y\s*=\s*(\d+)\s*(?:,\s*rule\s*=\s*(\S+)\s*)?$/i.exec(header);
  if (!m) return fail('Invalid header. Expected “x = <width>, y = <height>” with an optional “, rule = B…/S…”.');
  const width = Number(m[1]),
    height = Number(m[2]);
  if (width < 1 || height < 1) return fail('Width and height must be at least 1.');
  if (width > maxSide || height > maxSide) return fail(`The pattern is ${width} × ${height}; the largest supported lattice is ${maxSide} × ${maxSide}.`);
  let rule: LifeLikeRule | null = null;
  if (m[3] !== undefined) {
    if (/[:]/.test(m[3]))
      return fail(`Rule suffixes such as “${m[3].slice(m[3].indexOf(':'))}” (bounded grids) are not supported; boundaries are set in the app.`);
    const r = parseLifeLike(m[3]);
    if (!r.ok) return fail(`Unsupported rule “${m[3]}”. Only B…/S… Life-like notation is supported.`);
    rule = r.rule;
  }

  const cells = new Uint8Array(width * height); // size validated above, so allocation is bounded
  let x = 0,
    y = 0,
    count = '';
  let done = false;
  for (i = i + 1; i < lines.length; i++) {
    const line = lines[i];
    if (done) {
      const t = line.trim();
      if (t !== '' && !t.startsWith('#')) return fail('Unexpected data after the “!” terminator.');
      continue;
    }
    for (let k = 0; k < line.length; k++) {
      const ch = line[k];
      if (ch === ' ' || ch === '\t') {
        if (count) return fail('A run count must be followed directly by b, o or $.');
        continue;
      }
      if (ch >= '0' && ch <= '9') {
        if (count === '' && ch === '0') return fail('Run counts must be positive.');
        count += ch;
        if (count.length > 7) return fail('Run count is too large.');
        continue;
      }
      const n = count === '' ? 1 : Number(count);
      count = '';
      if (ch === 'b' || ch === 'o') {
        if (y >= height) return fail(`The pattern has more rows than the declared height ${height}.`);
        if (x + n > width) return fail(`Row ${y} is longer than the declared width ${width}.`);
        if (ch === 'o') cells.fill(1, y * width + x, y * width + x + n);
        x += n;
      } else if (ch === '$') {
        y += n;
        x = 0;
        if (y > height) return fail(`The pattern has more rows than the declared height ${height}.`);
      } else if (ch === '!') {
        done = true;
        const rest = line.slice(k + 1).trim();
        if (rest !== '' && !rest.startsWith('#')) return fail('Unexpected data after the “!” terminator.');
        break;
      } else {
        return fail(`“${ch}” is not supported. This importer reads two-state patterns only (b, o, $, !).`);
      }
    }
  }
  if (count) return fail('The file ends with an unused run count.');
  if (!done) return fail('Missing “!” terminator. This importer requires it, even though some tools do not.', lines.length);
  return { ok: true, pattern: { width, height, cells, rule, name, comments } };
}

/** Writes the pattern; trailing dead cells and blank rows are compressed, lines are wrapped at 70 characters. */
export function writeRle(width: number, height: number, cells: Uint8Array, rule: LifeLikeRule | null, comments: string[] = []): string {
  const tokens: string[] = [];
  let blankRows = 0;
  const run = (n: number, c: string) => (n === 1 ? c : `${n}${c}`);
  for (let y = 0; y < height; y++) {
    const row = cells.subarray(y * width, y * width + width);
    let end = width;
    while (end > 0 && row[end - 1] === 0) end--;
    if (y > 0) blankRows++;
    if (end === 0) continue;
    if (blankRows) {
      tokens.push(run(blankRows, '$'));
      blankRows = 0;
    }
    let x = 0;
    while (x < end) {
      const v = row[x];
      let n = 1;
      while (x + n < end && row[x + n] === v) n++;
      tokens.push(run(n, v ? 'o' : 'b'));
      x += n;
    }
  }
  tokens.push('!');
  const body: string[] = [];
  let line = '';
  for (const t of tokens) {
    if (line.length + t.length > 70) {
      body.push(line);
      line = '';
    }
    line += t;
  }
  body.push(line);
  const header = `x = ${width}, y = ${height}${rule ? `, rule = ${formatLifeLike(rule)}` : ''}`;
  return [...comments.map((c) => (c.startsWith('#') ? c : `#C ${c}`)), header, ...body].join('\n') + '\n';
}

/** Places an RLE pattern centered on a lattice with a dead margin (RLE carries no lattice size or boundary). */
export function modelFromRle(p: RlePattern, rule: LifeLikeRule, fallbackName: string): Model {
  const side = (n: number) => Math.min(LIMITS.maxSize2d, Math.max(64, n + 2 * Math.max(8, Math.ceil(n / 4))));
  const width = side(p.width),
    height = side(p.height);
  const ox = Math.floor((width - p.width) / 2),
    oy = Math.floor((height - p.height) / 2);
  const initial = new Uint8Array(width * height);
  for (let y = 0; y < p.height; y++) initial.set(p.cells.subarray(y * p.width, (y + 1) * p.width), (oy + y) * width + ox);
  return {
    name: p.name ?? fallbackName,
    width,
    height,
    stateCount: 2,
    stateLabels: ['Dead', 'Alive'],
    boundary: { kind: 'fixed-exterior', state: 0 },
    schedule: 'synchronous',
    rule: { id: 'life-like/v1', birth: [...rule.birth], survive: [...rule.survive] },
    initial,
  };
}
