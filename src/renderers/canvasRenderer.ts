// Native Canvas 2D renderer (PLAN.md §4.6). Passive: it never changes simulation state.

export interface Camera {
  /** CSS pixels per cell. */
  scale: number;
  /** CSS pixel position of cell (0,0)'s top-left corner. */
  offsetX: number;
  offsetY: number;
}

export interface Overlay {
  hover?: { x: number; y: number } | null;
  inspect?: { x: number; y: number } | null;
  showGrid: boolean;
  gridLineColor: string;
  hoverColor: string;
  inspectColor: string;
  /** Stamp preview: live cells drawn translucent at (x, y), plus the bounding box. */
  ghost?: { x: number; y: number; width: number; height: number; cells: Uint8Array } | null;
  ghostColor?: string;
  /** Inclusive rectangular selection. */
  selection?: { x0: number; y0: number; x1: number; y1: number } | null;
  selectionColor?: string;
}

export interface Frame {
  width: number;
  height: number;
  cells: Uint8Array;
}

const parseColor = (css: string): [number, number, number, number] => {
  const m = /^#([0-9a-f]{6})$/i.exec(css.trim());
  if (m) {
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
  }
  return [128, 128, 128, 255];
};

export class CanvasRenderer {
  private ctx: CanvasRenderingContext2D | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private image: ImageData | null = null;
  private bitmap: HTMLCanvasElement | OffscreenCanvas | null = null;
  private bitmapCtx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null = null;
  private palette: Uint32Array = new Uint32Array(256);
  private cssWidth = 0;
  private cssHeight = 0;
  private dpr = 1;
  camera: Camera = { scale: 8, offsetX: 0, offsetY: 0 };

  mount(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
  }

  resize(cssWidth: number, cssHeight: number, dpr: number) {
    if (!this.canvas) return;
    this.cssWidth = cssWidth;
    this.cssHeight = cssHeight;
    this.dpr = dpr;
    this.canvas.width = Math.max(1, Math.round(cssWidth * dpr));
    this.canvas.height = Math.max(1, Math.round(cssHeight * dpr));
  }

  get viewport() {
    return { width: this.cssWidth, height: this.cssHeight };
  }

  /** `voidColor` paints display-only "no data" values (any value without a palette entry). */
  setPalette(colors: readonly string[], voidColor: string) {
    // ImageData is RGBA in memory; on little-endian platforms a Uint32 view reads as ABGR.
    const pack = (c: string) => {
      const [r, g, b, a] = parseColor(c);
      return ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
    };
    this.palette = new Uint32Array(256).fill(pack(voidColor));
    colors.forEach((c, i) => {
      this.palette[i] = pack(c);
    });
  }

  fit(width: number, height: number, margin = 12) {
    const scale = Math.max(0.25, Math.min((this.cssWidth - 2 * margin) / width, (this.cssHeight - 2 * margin) / height, 40));
    this.camera = { scale, offsetX: (this.cssWidth - width * scale) / 2, offsetY: (this.cssHeight - height * scale) / 2 };
  }

  zoomAt(factor: number, cssX: number, cssY: number) {
    const c = this.camera;
    const scale = Math.max(0.25, Math.min(64, c.scale * factor));
    const k = scale / c.scale;
    this.camera = { scale, offsetX: cssX - (cssX - c.offsetX) * k, offsetY: cssY - (cssY - c.offsetY) * k };
  }

  /** Inverts the same camera transform used by draw(). */
  screenToCell(cssX: number, cssY: number, width: number, height: number): { x: number; y: number } | null {
    const { scale, offsetX, offsetY } = this.camera;
    const x = Math.floor((cssX - offsetX) / scale);
    const y = Math.floor((cssY - offsetY) / scale);
    return x >= 0 && y >= 0 && x < width && y < height ? { x, y } : null;
  }

  draw(frame: Frame, background: string, overlay: Overlay) {
    const ctx = this.ctx;
    if (!ctx || !this.canvas) return;
    const { width, height, cells } = frame;
    if (!this.image || this.image.width !== width || this.image.height !== height) {
      this.image = new ImageData(width, height);
      if (typeof OffscreenCanvas !== 'undefined') this.bitmap = new OffscreenCanvas(width, height);
      else {
        const c = document.createElement('canvas');
        c.width = width;
        c.height = height;
        this.bitmap = c;
      }
      this.bitmapCtx = this.bitmap.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
    }
    const px = new Uint32Array(this.image.data.buffer);
    const pal = this.palette;
    for (let i = 0; i < cells.length; i++) px[i] = pal[cells[i]];
    this.bitmapCtx!.putImageData(this.image, 0, 0);

    const { scale, offsetX, offsetY } = this.camera;
    const dpr = this.dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.bitmap as CanvasImageSource, offsetX, offsetY, width * scale, height * scale);

    if (overlay.showGrid && scale >= 6) {
      ctx.beginPath();
      ctx.strokeStyle = overlay.gridLineColor;
      ctx.lineWidth = 1 / dpr;
      const x0 = Math.max(0, Math.floor(-offsetX / scale));
      const x1 = Math.min(width, Math.ceil((this.cssWidth - offsetX) / scale));
      const y0 = Math.max(0, Math.floor(-offsetY / scale));
      const y1 = Math.min(height, Math.ceil((this.cssHeight - offsetY) / scale));
      for (let x = x0; x <= x1; x++) {
        const sx = Math.round((offsetX + x * scale) * dpr) / dpr;
        ctx.moveTo(sx, offsetY + y0 * scale);
        ctx.lineTo(sx, offsetY + y1 * scale);
      }
      for (let y = y0; y <= y1; y++) {
        const sy = Math.round((offsetY + y * scale) * dpr) / dpr;
        ctx.moveTo(offsetX + x0 * scale, sy);
        ctx.lineTo(offsetX + x1 * scale, sy);
      }
      ctx.stroke();
    }
    ctx.lineWidth = 2;
    if (overlay.inspect) {
      const { x, y } = overlay.inspect;
      ctx.strokeStyle = overlay.inspectColor;
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(offsetX + (x - 1) * scale, offsetY + (y - 1) * scale, 3 * scale, 3 * scale);
      ctx.setLineDash([]);
      ctx.strokeRect(offsetX + x * scale + 1, offsetY + y * scale + 1, scale - 2, scale - 2);
    }
    if (overlay.ghost) {
      const g = overlay.ghost;
      ctx.save();
      ctx.beginPath();
      ctx.rect(offsetX, offsetY, width * scale, height * scale); // stamps clip to the lattice
      ctx.clip();
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = overlay.ghostColor ?? overlay.hoverColor;
      for (let y = 0; y < g.height; y++)
        for (let x = 0; x < g.width; x++) {
          if (g.cells[y * g.width + x]) ctx.fillRect(offsetX + (g.x + x) * scale, offsetY + (g.y + y) * scale, scale, scale);
        }
      ctx.restore();
      ctx.strokeStyle = overlay.hoverColor;
      ctx.setLineDash([3, 3]);
      ctx.strokeRect(offsetX + g.x * scale, offsetY + g.y * scale, g.width * scale, g.height * scale);
      ctx.setLineDash([]);
    }
    if (overlay.selection) {
      const r = overlay.selection;
      ctx.strokeStyle = overlay.selectionColor ?? overlay.inspectColor;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(offsetX + r.x0 * scale, offsetY + r.y0 * scale, (r.x1 - r.x0 + 1) * scale, (r.y1 - r.y0 + 1) * scale);
      ctx.setLineDash([]);
    }
    if (overlay.hover && !overlay.ghost) {
      ctx.strokeStyle = overlay.hoverColor;
      ctx.strokeRect(offsetX + overlay.hover.x * scale, offsetY + overlay.hover.y * scale, scale, scale);
    }
    ctx.strokeStyle = overlay.gridLineColor;
    ctx.lineWidth = 1;
    ctx.strokeRect(offsetX - 0.5, offsetY - 0.5, width * scale + 1, height * scale + 1);
  }

  dispose() {
    this.ctx = null;
    this.canvas = null;
    this.image = null;
    this.bitmap = null;
    this.bitmapCtx = null;
  }
}
