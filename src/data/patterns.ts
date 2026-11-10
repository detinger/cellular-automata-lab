// Stamp library. Behaviors claimed here are verified in tests/unit/patterns.test.ts.
import { parseRle } from '../interchange/rle';

export interface Pattern {
  id: string;
  name: string;
  description: string;
  width: number;
  height: number;
  cells: Uint8Array;
}

const DEFS: Array<{ id: string; name: string; description: string; rle: string }> = [
  { id: 'block', name: 'Block', description: 'Still life (2 × 2).', rle: 'x = 2, y = 2\n2o$2o!' },
  { id: 'blinker', name: 'Blinker', description: 'Period-2 oscillator.', rle: 'x = 3, y = 1\n3o!' },
  { id: 'toad', name: 'Toad', description: 'Period-2 oscillator.', rle: 'x = 4, y = 2\nb3o$3o!' },
  { id: 'beacon', name: 'Beacon', description: 'Period-2 oscillator (shown in its 8-cell phase).', rle: 'x = 4, y = 4\n2o$2o$2b2o$2b2o!' },
  {
    id: 'pulsar',
    name: 'Pulsar',
    description: 'Period-3 oscillator (13 × 13).',
    rle: 'x = 13, y = 13\n2b3o3b3o2$o4bobo4bo$o4bobo4bo$o4bobo4bo$2b3o3b3o2$2b3o3b3o$o4bobo4bo$o4bobo4bo$o4bobo4bo2$2b3o3b3o!',
  },
  { id: 'glider', name: 'Glider', description: 'Moves one cell diagonally every 4 generations.', rle: 'x = 3, y = 3\nbo$2bo$3o!' },
  { id: 'lwss', name: 'Lightweight spaceship', description: 'Moves two cells horizontally every 4 generations.', rle: 'x = 5, y = 4\nbo2bo$o4b$o3bo$4o!' },
  { id: 'r-pentomino', name: 'R-pentomino', description: 'Five cells with a long, chaotic evolution.', rle: 'x = 3, y = 3\nb2o$2o$bo!' },
  { id: 'diehard', name: 'Diehard', description: 'Vanishes completely after 130 generations (given enough room).', rle: 'x = 8, y = 3\n6bo$2o$bo3b3o!' },
  { id: 'acorn', name: 'Acorn', description: 'Seven cells that grow for thousands of generations on a large grid.', rle: 'x = 7, y = 3\nbo$3bo$2o2b3o!' },
  {
    id: 'gosper-gun',
    name: 'Gosper glider gun',
    description: 'Emits a new glider every 30 generations (36 × 9).',
    rle: 'x = 36, y = 9\n24bo$22bobo$12b2o6b2o12b2o$11bo3bo4b2o12b2o$2o8bo5bo3b2o$2o8bo3bob2o4bobo$10bo5bo7bo$11bo3bo$12b2o!',
  },
];

export const PATTERNS: readonly Pattern[] = DEFS.map((d) => {
  const r = parseRle(d.rle);
  if (!r.ok) throw new Error(`Bundled pattern ${d.id} is invalid: ${r.message}`);
  return { id: d.id, name: d.name, description: d.description, width: r.pattern.width, height: r.pattern.height, cells: r.pattern.cells };
});

/** Pattern transformations change cells, never the rule. */
export function rotateCW(p: Pattern): Pattern {
  const out = new Uint8Array(p.cells.length);
  for (let y = 0; y < p.height; y++) for (let x = 0; x < p.width; x++) out[x * p.height + (p.height - 1 - y)] = p.cells[y * p.width + x];
  return { ...p, width: p.height, height: p.width, cells: out };
}

export function flipHorizontal(p: Pattern): Pattern {
  const out = new Uint8Array(p.cells.length);
  for (let y = 0; y < p.height; y++) for (let x = 0; x < p.width; x++) out[y * p.width + (p.width - 1 - x)] = p.cells[y * p.width + x];
  return { ...p, cells: out };
}

/** Writes `p` into a copy of `grid` with its top-left at (ax, ay), overwriting its bounding box, clipped to the lattice. */
export function stamp(grid: Uint8Array, gw: number, gh: number, p: Pattern, ax: number, ay: number): Uint8Array {
  const out = new Uint8Array(grid);
  for (let y = 0; y < p.height; y++) {
    const ty = ay + y;
    if (ty < 0 || ty >= gh) continue;
    for (let x = 0; x < p.width; x++) {
      const tx = ax + x;
      if (tx >= 0 && tx < gw) out[ty * gw + tx] = p.cells[y * p.width + x];
    }
  }
  return out;
}

export function extract(grid: Uint8Array, gw: number, x0: number, y0: number, x1: number, y1: number, name = 'Selection'): Pattern {
  const w = x1 - x0 + 1,
    h = y1 - y0 + 1;
  const cells = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) cells.set(grid.subarray((y0 + y) * gw + x0, (y0 + y) * gw + x0 + w), y * w);
  return { id: 'clipboard', name, description: `${w} × ${h} region copied from the lattice.`, width: w, height: h, cells };
}
