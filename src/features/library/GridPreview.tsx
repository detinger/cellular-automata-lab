import { isOneDimensional, type Model } from '../../domain/contracts/model';
import { createEngine } from '../../domain/engine/engine';
import { useStatePalette } from '../../renderers/palette';

/** Static SVG thumbnail. 2D: initial cells. 1D: the first generations computed by the reference engine. */
export function GridPreview({ model, size = 120 }: { model: Model; size?: number }) {
  const palette = useStatePalette(model);
  let { width: w, height: h, initial } = model;
  if (isOneDimensional(model.rule)) {
    const crop = Math.min(w, 121),
      rows = 60,
      x0 = Math.floor((w - crop) / 2) + (model.rule.id === 'elementary/v1' && model.rule.ruleNumber === 110 ? Math.floor((w - crop) / 2) : 0);
    const e = createEngine(model);
    const grid = new Uint8Array(crop * rows);
    for (let r = 0; r < rows; r++) {
      grid.set(e.cells.subarray(x0, x0 + crop), r * crop);
      e.step();
    }
    w = crop;
    h = rows;
    initial = grid;
  }
  const cell = size / Math.max(w, h);
  const rects: React.ReactElement[] = [];
  for (let i = 0; i < initial.length; i++) {
    if (initial[i]) rects.push(<rect key={i} x={(i % w) * cell} y={Math.floor(i / w) * cell} width={cell} height={cell} fill={palette[initial[i]]} />);
  }
  return (
    <svg width={w * cell} height={h * cell} role="img" aria-label={`${w} by ${h} grid with ${rects.length} cells not in state ${model.stateLabels[0]}`}>
      <rect width={w * cell} height={h * cell} fill={palette[0]} />
      {rects}
    </svg>
  );
}
