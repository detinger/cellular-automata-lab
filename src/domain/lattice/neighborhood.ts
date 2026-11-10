// Neighborhood offsets and boundary sampling.
import type { Boundary } from '../contracts/model';

/** Moore radius 1, center excluded, in the documented order. */
export const MOORE_R1: ReadonlyArray<readonly [number, number]> = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
];

export const wrap = (v: number, n: number) => ((v % n) + n) % n;

export interface Sample {
  dx: number;
  dy: number;
  /** In-lattice coordinate actually read, or null when an exterior value was supplied. */
  source: { x: number; y: number } | null;
  state: number;
  wrapped: boolean;
}

/** Samples one neighbor exactly as the engine does. Used by the inspector, not by the hot loop. */
export function sampleNeighbor(cells: Uint8Array, width: number, height: number, boundary: Boundary, x: number, y: number, dx: number, dy: number): Sample {
  const nx = x + dx;
  const ny = y + dy;
  const inside = nx >= 0 && nx < width && ny >= 0 && ny < height;
  if (inside) return { dx, dy, source: { x: nx, y: ny }, state: cells[ny * width + nx], wrapped: false };
  if (boundary.kind === 'periodic') {
    const wx = wrap(nx, width);
    const wy = wrap(ny, height);
    return { dx, dy, source: { x: wx, y: wy }, state: cells[wy * width + wx], wrapped: true };
  }
  return { dx, dy, source: null, state: boundary.state, wrapped: false };
}
