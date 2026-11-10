// elementary/v1: pattern = 4*left + 2*center + right; output = (ruleNumber >>> pattern) & 1.

export const NAMED_ECA_RULES: Record<number, string> = {
  0: 'Rule 0 — everything dies',
  30: 'Rule 30 — chaotic',
  90: 'Rule 90 — Sierpiński triangle',
  110: 'Rule 110 — complex structures',
  184: 'Rule 184 — traffic flow',
  255: 'Rule 255 — everything lives',
};

export const ecaOutput = (ruleNumber: number, left: number, center: number, right: number) => (ruleNumber >>> (4 * left + 2 * center + right)) & 1;

/** Eight outputs indexed by pattern 0..7. */
export function ecaTable(ruleNumber: number): Uint8Array {
  const t = new Uint8Array(8);
  for (let p = 0; p < 8; p++) t[p] = (ruleNumber >>> p) & 1;
  return t;
}

/** Neighborhoods in editor order: 111 first (most significant bit), 000 last. */
export const ECA_PATTERNS_DISPLAY = [7, 6, 5, 4, 3, 2, 1, 0] as const;
export const patternBits = (p: number) => [(p >> 2) & 1, (p >> 1) & 1, p & 1] as const;
export const toggleBit = (ruleNumber: number, pattern: number) => (ruleNumber ^ (1 << pattern)) & 255;
