// PNG snapshot of one identified generation with a legend and caption (PLAN.md §8.5).
// A picture is not a model: the caption says so, and the model file remains the resumable record.

export interface PngCaption {
  title: string;
  lines: string[];
  labels: string[];
}

export async function snapshotPng(
  cells: Uint8Array,
  width: number,
  height: number,
  palette: string[],
  voidColor: string,
  caption: PngCaption,
  colors: { bg: string; text: string; muted: string },
): Promise<Blob> {
  const scale = Math.max(1, Math.min(16, Math.floor(1024 / Math.max(width, height))));
  const gridW = width * scale,
    gridH = height * scale;
  const pad = 16,
    lineH = 18,
    legendH = 22 * Math.ceil(caption.labels.length / 4);
  const textH = pad + 22 + caption.lines.length * lineH + 8 + legendH + pad;
  const W = Math.max(gridW + 2 * pad, 520),
    H = gridH + 2 * pad + textH;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = colors.bg;
  ctx.fillRect(0, 0, W, H);
  const img = new ImageData(width, height);
  const rgb = (h: string) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const pal = palette.map(rgb),
    vc = rgb(voidColor);
  for (let i = 0; i < cells.length; i++) {
    const [r, g, b] = pal[cells[i]] ?? vc;
    img.data.set([r, g, b, 255], i * 4);
  }
  const tmp = document.createElement('canvas');
  tmp.width = width;
  tmp.height = height;
  tmp.getContext('2d')!.putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(tmp, pad, pad, gridW, gridH);
  let y = pad + gridH + pad + 16;
  ctx.fillStyle = colors.text;
  ctx.font = '600 16px Inter, system-ui, sans-serif';
  ctx.fillText(caption.title, pad, y);
  ctx.font = '13px Inter, system-ui, sans-serif';
  ctx.fillStyle = colors.muted;
  for (const l of caption.lines) {
    y += lineH;
    ctx.fillText(l, pad, y);
  }
  y += 14;
  caption.labels.forEach((label, i) => {
    const x = pad + (i % 4) * 130,
      yy = y + Math.floor(i / 4) * 22;
    ctx.fillStyle = palette[i];
    ctx.fillRect(x, yy, 14, 14);
    ctx.strokeStyle = colors.muted;
    ctx.strokeRect(x + 0.5, yy + 0.5, 13, 13);
    ctx.fillStyle = colors.text;
    ctx.fillText(label, x + 20, yy + 12);
  });
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG encoding failed.'))), 'image/png'));
}
