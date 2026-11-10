// life-like/v1 (PLAN.md §7.3): outer-totalistic binary rule over the Moore radius-1 neighborhood.

export interface LifeLikeRule {
  birth: number[];
  survive: number[];
}

export type ParseResult = { ok: true; rule: LifeLikeRule; canonical: string } | { ok: false; message: string };

const digitsOf = (s: string) => [...new Set([...s].map(Number))].sort((a, b) => a - b);

/** Parses canonical `B<digits>/S<digits>` notation, case-insensitive with surrounding whitespace trimmed. */
export function parseLifeLike(input: string): ParseResult {
  const text = input.trim();
  const m = /^B([0-8]*)\/S([0-8]*)$/i.exec(text);
  if (!m) {
    if (/^B[^/]*\/S/i.test(text)) return { ok: false, message: 'Neighbor counts must be digits 0–8, for example B3/S23.' };
    return { ok: false, message: 'Use B/S notation such as B3/S23 (birth digits, then survival digits).' };
  }
  const rule = { birth: digitsOf(m[1]), survive: digitsOf(m[2]) };
  return { ok: true, rule, canonical: formatLifeLike(rule) };
}

export const formatLifeLike = (r: LifeLikeRule) => `B${r.birth.join('')}/S${r.survive.join('')}`;

export const NAMED_LIFE_RULES: Record<string, string> = {
  'B3/S23': "Conway's Life",
  'B36/S23': 'HighLife',
  'B2/S': 'Seeds',
};

/** Lookup table indexed by `state * 9 + liveNeighborCount`. */
export function lifeLikeTable(rule: LifeLikeRule): Uint8Array {
  const table = new Uint8Array(18);
  for (const n of rule.birth) table[n] = 1;
  for (const n of rule.survive) table[9 + n] = 1;
  return table;
}
