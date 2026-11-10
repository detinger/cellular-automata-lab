// Editor undo/redo over whole-model snapshots with a byte budget. Separate from engine reset.
import type { Model } from '../../domain/contracts/model';

const BUDGET_BYTES = 32 * 1024 * 1024;

export class EditHistory {
  private past: Model[] = [];
  private future: Model[] = [];

  push(before: Model) {
    this.past.push(before);
    this.future = [];
    let bytes = this.past.reduce((s, m) => s + m.initial.length, 0);
    while (bytes > BUDGET_BYTES && this.past.length > 1) bytes -= this.past.shift()!.initial.length;
  }
  undo(current: Model): Model | null {
    const prev = this.past.pop();
    if (!prev) return null;
    this.future.push(current);
    return prev;
  }
  redo(current: Model): Model | null {
    const next = this.future.pop();
    if (!next) return null;
    this.past.push(current);
    return next;
  }
  get canUndo() {
    return this.past.length > 0;
  }
  get canRedo() {
    return this.future.length > 0;
  }
}

/** Centered crop/pad with state 0. Returns the new grid and how many nonzero cells were cropped. */
export function resizeCentered(cells: Uint8Array, w: number, h: number, nw: number, nh: number) {
  const out = new Uint8Array(nw * nh);
  const dx = Math.floor((nw - w) / 2);
  const dy = Math.floor((nh - h) / 2);
  let lost = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = cells[y * w + x];
      if (!v) continue;
      const tx = x + dx,
        ty = y + dy;
      if (tx >= 0 && ty >= 0 && tx < nw && ty < nh) out[ty * nw + tx] = v;
      else lost++;
    }
  }
  return { cells: out, lost };
}

/** Cells on the segment between two lattice points (Bresenham), so fast strokes leave no gaps. */
export function lineCells(x0: number, y0: number, x1: number, y1: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const dx = Math.abs(x1 - x0),
    dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1,
    sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    out.push([x0, y0]);
    if (x0 === x1 && y0 === y1) return out;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
}
