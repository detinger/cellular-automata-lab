// Random categorical initialization: one initialization draw per cell in
// row-major order against cumulative probabilities in ascending state order. The generated cells
// are stored with the model; the seed is shown so the fill can be reproduced.
import { createStream, sessionSeed, type Stream } from './prng';

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export const PROBABILITY_TOLERANCE = 1e-12;

/** Validates and normalizes state probabilities (nonnegative, finite, summing to 1 within 1e-12). */
export function normalizeProbabilities(p: readonly number[]): { ok: true; probabilities: number[] } | { ok: false; message: string } {
  if (p.length < 2) return { ok: false, message: 'Give a probability for every state.' };
  if (p.some((v) => !Number.isFinite(v) || v < 0)) return { ok: false, message: 'Probabilities must be finite and not negative.' };
  const sum = p.reduce((a, b) => a + b, 0);
  if (Math.abs(sum - 1) > PROBABILITY_TOLERANCE) return { ok: false, message: `Probabilities must add up to 1 (they add up to ${+sum.toFixed(6)}).` };
  return { ok: true, probabilities: p.map((v) => v / sum) };
}

/**
 * Returns a copy of `grid` where each cell inside `rect` (inclusive; whole lattice when omitted) gets
 * a state drawn from `probabilities`. Draws use strict `<` against the cumulative sums; any final
 * roundoff remainder falls to the last state. The result depends only on (seed, probabilities, rect size).
 */
export function randomInitialize(grid: Uint8Array, width: number, height: number, probabilities: readonly number[], seed: string, rect?: Rect): Uint8Array {
  return initializeFromStream(grid, width, height, probabilities, createStream(sessionSeed(seed, 'initialization')), rect);
}

/** As randomInitialize, drawing from an existing initialization stream (experiments pass derived seeds). */
export function initializeFromStream(
  grid: Uint8Array,
  width: number,
  height: number,
  probabilities: readonly number[],
  stream: Stream,
  rect?: Rect,
): Uint8Array {
  const n = normalizeProbabilities(probabilities);
  if (!n.ok) throw new RangeError(n.message);
  const cumulative: number[] = [];
  let acc = 0;
  for (const p of n.probabilities) cumulative.push((acc += p));
  const last = cumulative.length - 1;
  const r = rect ?? { x0: 0, y0: 0, x1: width - 1, y1: height - 1 };
  const out = new Uint8Array(grid);
  for (let y = r.y0; y <= r.y1; y++) {
    for (let x = r.x0; x <= r.x1; x++) {
      const u = stream.next();
      let s = 0;
      while (s < last && !(u < cumulative[s])) s++;
      out[y * width + x] = s;
    }
  }
  return out;
}

/** Binary convenience: each cell is 1 with probability `density`. */
export const randomFill = (grid: Uint8Array, width: number, height: number, density: number, seed: string, rect?: Rect) => {
  if (!(density >= 0 && density <= 1)) throw new RangeError('Density must be between 0 and 1.');
  return randomInitialize(grid, width, height, [1 - density, density], seed, rect);
};

/** A fresh seed for the "new seed" button. Recorded in the UI so the fill can be reproduced. */
export const newSeed = () => String(Math.floor(Math.random() * 1e9));

/** Sets every cell in `rect` (inclusive) to `state`. */
export function fillRect(grid: Uint8Array, width: number, rect: Rect, state: number): Uint8Array {
  const out = new Uint8Array(grid);
  for (let y = rect.y0; y <= rect.y1; y++) out.fill(state, y * width + rect.x0, y * width + rect.x1 + 1);
  return out;
}

/** Normalizes two corner cells into an inclusive rectangle clipped to the lattice. */
export function normalizeRect(a: { x: number; y: number }, b: { x: number; y: number }, width: number, height: number): Rect {
  const c = (v: number, hi: number) => Math.max(0, Math.min(hi - 1, v));
  return { x0: c(Math.min(a.x, b.x), width), y0: c(Math.min(a.y, b.y), height), x1: c(Math.max(a.x, b.x), width), y1: c(Math.max(a.y, b.y), height) };
}
