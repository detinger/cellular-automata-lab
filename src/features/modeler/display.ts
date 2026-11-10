// Display shapes: 2D models display their lattice; 1D models display a spacetime block.
import { VOID_STATE, isOneDimensional, spacetimeRows, type Model } from '../../domain/contracts/model';

export const displayDims = (m: Model) => (isOneDimensional(m.rule) ? { width: m.width, height: spacetimeRows(m.width) } : { width: m.width, height: m.height });

/** Display buffer for a model-shaped grid: identity for 2D, row 0 of an otherwise empty spacetime for 1D. */
export function toDisplay(m: Model, cells: Uint8Array): Uint8Array {
  if (!isOneDimensional(m.rule)) return cells;
  const { width, height } = displayDims(m);
  const out = new Uint8Array(width * height).fill(VOID_STATE);
  out.set(cells.subarray(0, width));
  return out;
}
