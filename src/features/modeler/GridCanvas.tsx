// Interactive lattice view: Canvas rendering, camera, pointer painting and keyboard cursor.
// It never computes transitions; it only displays cells and reports edits/inspection.
import { useEffect, useImperativeHandle, useRef, type Ref } from 'react';
import { CanvasRenderer, type Camera } from '../../renderers/canvasRenderer';
import { useTokens } from '../../app/theme';
import { lineCells } from './history';
import { normalizeRect, type Rect } from '../../domain/random/seeded';

export interface StampShape {
  width: number;
  height: number;
  cells: Uint8Array;
}

/** Top-left anchor that centers a stamp on the pointer cell. */
export const stampAnchor = (cell: { x: number; y: number }, s: StampShape) => ({
  x: cell.x - Math.floor((s.width - 1) / 2),
  y: cell.y - Math.floor((s.height - 1) / 2),
});

export type Tool = 'paint' | 'erase' | 'inspect' | 'pan' | 'select' | 'stamp';

export interface GridCanvasHandle {
  draw(cells: Uint8Array): void;
  fit(): void;
  zoom(factor: number): void;
  camera(): Camera;
}

interface Props {
  ref?: Ref<GridCanvasHandle>;
  width: number;
  height: number;
  stateLabels: string[];
  /** #rrggbb color per state (index = state ID). */
  palette: string[];
  tool: Tool;
  showGrid: boolean;
  initialCamera: Camera | null;
  inspect: { x: number; y: number } | null;
  /** Where the keyboard cursor starts when nothing is selected. */
  defaultCursor?: { x: number; y: number };
  summary: string;
  getCells(): Uint8Array;
  onStrokeStart(): boolean;
  onStrokeCells(cells: Array<[number, number]>): void;
  onStrokeEnd(): void;
  onInspect(cell: { x: number; y: number }): void;
  onToggleCell(cell: { x: number; y: number }): void;
  onCameraChange(camera: Camera): void;
  onHover(cell: { x: number; y: number } | null): void;
  /** Pattern previewed under the pointer by the stamp tool. */
  stampPattern?: StampShape | null;
  selection?: Rect | null;
  /** Called while dragging a selection (final = pointer released); null clears it. */
  onSelect?(rect: Rect | null, final: boolean): void;
  /** Stamp tool: place the pattern with its top-left at `anchor`. */
  onStamp?(anchor: { x: number; y: number }): void;
}

export function GridCanvas(props: Props) {
  const { width, height, tool, showGrid, inspect, selection, stampPattern } = props;
  const frameRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderer = useRef(new CanvasRenderer());
  const hover = useRef<{ x: number; y: number } | null>(null);
  const propsRef = useRef(props);
  propsRef.current = props;
  const tokens = useTokens(['canvas-bg', 'sim-dead', 'sim-alive', 'sim-grid-line', 'sim-hover', 'sim-inspect'] as const);
  const tokensRef = useRef(tokens);
  tokensRef.current = tokens;
  const fittedFor = useRef('');

  const draw = (cells = propsRef.current.getCells()) => {
    const t = tokensRef.current;
    const p = propsRef.current;
    if (cells.length !== p.width * p.height) return;
    renderer.current.draw({ width: p.width, height: p.height, cells }, t['canvas-bg'], {
      hover: hover.current,
      inspect: p.inspect,
      showGrid: p.showGrid,
      gridLineColor: t['sim-grid-line'],
      hoverColor: t['sim-hover'],
      inspectColor: t['sim-inspect'],
      ghost:
        p.tool === 'stamp' && p.stampPattern && (hover.current ?? p.inspect)
          ? { ...stampAnchor((hover.current ?? p.inspect)!, p.stampPattern), ...p.stampPattern }
          : null,
      ghostColor: t['sim-alive'],
      selection: p.selection ?? null,
    });
  };

  const cameraChanged = () => propsRef.current.onCameraChange({ ...renderer.current.camera });

  useImperativeHandle(props.ref, () => ({
    draw: (cells) => draw(cells),
    fit: () => {
      renderer.current.fit(propsRef.current.width, propsRef.current.height);
      draw();
      cameraChanged();
    },
    zoom: (f) => {
      const v = renderer.current.viewport;
      renderer.current.zoomAt(f, v.width / 2, v.height / 2);
      draw();
      cameraChanged();
    },
    camera: () => ({ ...renderer.current.camera }),
  }));

  const paletteKey = props.palette.join(',');
  useEffect(() => {
    renderer.current.setPalette(props.palette, tokens['canvas-bg']);
    draw();
  }, [tokens, paletteKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    draw();
  }, [showGrid, inspect, selection, stampPattern, tool]);

  // Mount, resize and fit.
  useEffect(() => {
    const canvas = canvasRef.current!;
    const frame = frameRef.current!;
    const r = renderer.current;
    r.mount(canvas);
    const ro = new ResizeObserver(() => {
      const rect = frame.getBoundingClientRect();
      const before = r.viewport;
      const key = `${propsRef.current.width}x${propsRef.current.height}`;
      if (fittedFor.current !== key) {
        r.resize(rect.width, rect.height, window.devicePixelRatio || 1);
        fittedFor.current = key;
        const saved = propsRef.current.initialCamera;
        if (saved) {
          r.camera = { ...saved };
          // A saved camera that leaves the lattice off-screen (e.g. saved on a wider display) is refitted.
          const c = r.camera,
            p = propsRef.current;
          const visible = c.offsetX < rect.width && c.offsetY < rect.height && c.offsetX + p.width * c.scale > 0 && c.offsetY + p.height * c.scale > 0;
          if (!visible) r.fit(p.width, p.height);
        } else r.fit(propsRef.current.width, propsRef.current.height);
      } else {
        // If the whole lattice was visible, keep it fitted; otherwise keep the centered lattice point fixed.
        const c = r.camera,
          p = propsRef.current;
        const wasFitted =
          c.offsetX >= -1 && c.offsetY >= -1 && c.offsetX + p.width * c.scale <= before.width + 1 && c.offsetY + p.height * c.scale <= before.height + 1;
        r.resize(rect.width, rect.height, window.devicePixelRatio || 1);
        if (wasFitted) r.fit(p.width, p.height);
        else r.camera = { ...c, offsetX: c.offsetX + (rect.width - before.width) / 2, offsetY: c.offsetY + (rect.height - before.height) / 2 };
      }
      draw();
    });
    ro.observe(frame);
    return () => {
      ro.disconnect();
      r.dispose();
    };
  }, []);

  // Refit when the lattice size changes.
  useEffect(() => {
    const key = `${width}x${height}`;
    if (fittedFor.current && fittedFor.current !== key) {
      fittedFor.current = key;
      renderer.current.fit(width, height);
      draw();
      cameraChanged();
    }
  }, [width, height]);

  // Pointer + wheel interaction.
  useEffect(() => {
    const canvas = canvasRef.current!;
    const r = renderer.current;
    let mode: 'none' | 'pan' | 'paint' | 'select' = 'none';
    let selFrom = { x: 0, y: 0 };
    let selOutside = false,
      selMoved = false;
    const rawCell = (e: PointerEvent) => {
      const l = local(e);
      return { x: Math.floor((l.x - r.camera.offsetX) / r.camera.scale), y: Math.floor((l.y - r.camera.offsetY) / r.camera.scale) };
    };
    let last: { x: number; y: number } | null = null;
    let panFrom = { x: 0, y: 0, ox: 0, oy: 0 };
    let spaceHeld = false;
    const local = (e: PointerEvent | WheelEvent) => {
      const rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };
    const cellAt = (e: PointerEvent) => {
      const p = local(e);
      return r.screenToCell(p.x, p.y, propsRef.current.width, propsRef.current.height);
    };

    const down = (e: PointerEvent) => {
      const p = propsRef.current;
      if (e.button === 1 || e.button === 2 || p.tool === 'pan' || spaceHeld) {
        mode = 'pan';
        const l = local(e);
        panFrom = { x: l.x, y: l.y, ox: r.camera.offsetX, oy: r.camera.offsetY };
        canvas.setPointerCapture(e.pointerId);
        e.preventDefault();
        return;
      }
      if (e.button !== 0) return;
      const cell = cellAt(e);
      if (p.tool === 'inspect') {
        if (cell) p.onInspect(cell);
        return;
      }
      if (p.tool === 'stamp') {
        if (cell && p.stampPattern) p.onStamp?.(stampAnchor(cell, p.stampPattern));
        return;
      }
      if (p.tool === 'select') {
        // A drag may start outside the lattice (its corner is clipped); a plain click outside deselects.
        mode = 'select';
        selOutside = !cell;
        selMoved = false;
        selFrom = rawCell(e);
        canvas.setPointerCapture(e.pointerId);
        if (cell) p.onSelect?.(normalizeRect(cell, cell, p.width, p.height), false);
        return;
      }
      if (!p.onStrokeStart()) return;
      mode = 'paint';
      canvas.setPointerCapture(e.pointerId);
      last = cell;
      if (cell) p.onStrokeCells([[cell.x, cell.y]]);
    };
    const move = (e: PointerEvent) => {
      const p = propsRef.current;
      if (mode === 'pan') {
        const l = local(e);
        r.camera = { ...r.camera, offsetX: panFrom.ox + l.x - panFrom.x, offsetY: panFrom.oy + l.y - panFrom.y };
        draw();
        return;
      }
      const l = local(e);
      // Clip to the finite lattice even on a torus: brushes never wrap (§3.1).
      const raw = { x: Math.floor((l.x - r.camera.offsetX) / r.camera.scale), y: Math.floor((l.y - r.camera.offsetY) / r.camera.scale) };
      const cell = cellAt(e);
      if (mode === 'select' && (raw.x !== selFrom.x || raw.y !== selFrom.y || selMoved)) {
        selMoved = true;
        p.onSelect?.(normalizeRect(selFrom, raw, p.width, p.height), false);
      }
      if (mode === 'paint') {
        const from = last ?? raw;
        const pts = lineCells(from.x, from.y, raw.x, raw.y).filter(([x, y]) => x >= 0 && y >= 0 && x < p.width && y < p.height);
        if (pts.length) p.onStrokeCells(pts);
        last = raw;
      }
      if (cell?.x !== hover.current?.x || cell?.y !== hover.current?.y) {
        hover.current = cell;
        p.onHover(cell);
        if (mode !== 'paint') draw();
      }
    };
    const up = (e: PointerEvent) => {
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
      if (mode === 'paint') propsRef.current.onStrokeEnd();
      if (mode === 'select') {
        const p = propsRef.current;
        p.onSelect?.(selOutside && !selMoved ? null : normalizeRect(selFrom, rawCell(e), p.width, p.height), true);
      }
      if (mode === 'pan') cameraChanged();
      mode = 'none';
      last = null;
    };
    const leave = () => {
      if (mode === 'none') {
        hover.current = null;
        propsRef.current.onHover(null);
        draw();
      }
    };
    let wheelTimer: ReturnType<typeof setTimeout> | undefined;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const l = local(e);
      r.zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), l.x, l.y);
      draw();
      clearTimeout(wheelTimer);
      wheelTimer = setTimeout(cameraChanged, 250);
    };
    const key = (e: KeyboardEvent) => {
      if (e.code === 'Space' && e.target === canvas.parentElement) spaceHeld = e.type === 'keydown';
    };
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('pointerleave', leave);
    canvas.addEventListener('wheel', wheel, { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', key);
    window.addEventListener('keyup', key);
    return () => {
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', up);
      canvas.removeEventListener('pointerleave', leave);
      canvas.removeEventListener('wheel', wheel);
      window.removeEventListener('keydown', key);
      window.removeEventListener('keyup', key);
      clearTimeout(wheelTimer);
    };
  }, []);

  // Keyboard cursor: one focus target, arrows move the inspected cell, Enter toggles it (§9.5).
  const onKeyDown = (e: React.KeyboardEvent) => {
    const p = propsRef.current;
    const cur = p.inspect ?? p.defaultCursor ?? { x: Math.floor(p.width / 2), y: Math.floor(p.height / 2) };
    const moves: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const mv = moves[e.key];
    if (mv) {
      e.preventDefault();
      const step = e.shiftKey ? 8 : 1;
      p.onInspect({ x: Math.min(p.width - 1, Math.max(0, cur.x + mv[0] * step)), y: Math.min(p.height - 1, Math.max(0, cur.y + mv[1] * step)) });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (p.tool === 'stamp' && p.stampPattern) p.onStamp?.(stampAnchor(cur, p.stampPattern));
      else p.onToggleCell(cur);
    } else if (e.key === '+' || e.key === '=') {
      e.preventDefault();
      const v = renderer.current.viewport;
      renderer.current.zoomAt(1.25, v.width / 2, v.height / 2);
      draw();
      cameraChanged();
    } else if (e.key === '-') {
      e.preventDefault();
      const v = renderer.current.viewport;
      renderer.current.zoomAt(0.8, v.width / 2, v.height / 2);
      draw();
      cameraChanged();
    }
  };

  const cursor = tool === 'pan' ? 'grab' : tool === 'inspect' ? 'help' : tool === 'stamp' ? 'copy' : 'crosshair';
  return (
    <div
      ref={frameRef}
      className="canvas-frame"
      tabIndex={0}
      role="application"
      aria-roledescription="cellular automaton lattice"
      aria-label={`Lattice ${width} by ${height}. Arrow keys move the selected cell, Enter toggles it (or places the pattern with the Stamp tool), plus and minus zoom.`}
      aria-describedby="lattice-summary"
      onKeyDown={onKeyDown}
    >
      <canvas ref={canvasRef} style={{ cursor }} role="img" aria-label={props.summary} />
      <span id="lattice-summary" className="sr-only">
        {props.summary}
      </span>
    </div>
  );
}
