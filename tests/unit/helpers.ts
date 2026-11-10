import type { Boundary, Model } from '../../src/domain/contracts/model';
import { lifeModel } from '../../src/data/presets';

export const live = (cells: Uint8Array, width: number) => {
  const out: Array<[number, number]> = [];
  cells.forEach((v, i) => v && out.push([i % width, Math.floor(i / width)]));
  return out;
};

export const life = (w: number, h: number, cells: Array<[number, number]>, boundary?: Boundary): Model => lifeModel('t', w, h, cells, boundary);

/** Independent, deliberately naive Life step used to cross-check the optimized engine (not the same algorithm). */
export function naiveStep(model: Model, cells: Uint8Array): Uint8Array {
  const { width: w, height: h, boundary } = model;
  if (model.rule.id !== 'life-like/v1') throw new Error('life only');
  const rule = model.rule;
  const at = (x: number, y: number) => {
    if (x >= 0 && y >= 0 && x < w && y < h) return cells[y * w + x];
    if (boundary.kind === 'periodic') return cells[((y + h) % h) * w + ((x + w) % w)];
    return boundary.state;
  };
  const out = new Uint8Array(w * h);
  // Traverse in a scrambled order to catch any in-place update (SIM-06).
  const order = [...out.keys()].sort((a, b) => ((a * 7919) % 104729) - ((b * 7919) % 104729));
  for (const i of order) {
    const x = i % w,
      y = Math.floor(i / w);
    let n = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) n += at(x + dx, y + dy);
    out[i] = cells[i] ? (rule.survive.includes(n) ? 1 : 0) : rule.birth.includes(n) ? 1 : 0;
  }
  return out;
}
