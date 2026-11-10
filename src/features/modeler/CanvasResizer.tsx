// Height-resizable host for the lattice. Drag the bottom edge or the corner grip; double-click (or
// press Home) to return to automatic height. Arrow keys resize from the keyboard. The chosen height
// is a per-browser preference, so it is kept in localStorage and the page works without it.
import { useRef, useState, type ReactNode } from 'react';

const KEY = 'ca-lab-canvas-height';
const MIN = 200;
const MAX = 4000;
const clamp = (h: number) => Math.round(Math.max(MIN, Math.min(MAX, h)));

function readHeight(): number | null {
  try {
    const v = Number(localStorage.getItem(KEY));
    return Number.isFinite(v) && v >= MIN ? clamp(v) : null;
  } catch {
    return null;
  }
}

function storeHeight(h: number | null) {
  try {
    if (h === null) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, String(h));
  } catch {
    /* storage unavailable: the height lasts for this page only */
  }
}

export function CanvasResizer({ children }: { children: ReactNode }) {
  const host = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | null>(readHeight);
  const drag = useRef<{ startY: number; startH: number } | null>(null);

  const apply = (h: number | null) => {
    setHeight(h);
    storeHeight(h);
  };
  const current = () => height ?? host.current?.getBoundingClientRect().height ?? 400;

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { startY: e.clientY, startH: current() };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    setHeight(clamp(drag.current.startH + e.clientY - drag.current.startY));
  };
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    drag.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    storeHeight(height);
  };
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 80 : 20;
    if (e.key === 'ArrowDown') apply(clamp(current() + step));
    else if (e.key === 'ArrowUp') apply(clamp(current() - step));
    else if (e.key === 'Home') apply(null);
    else return;
    e.preventDefault();
  };

  return (
    <div ref={host} className="canvas-host" data-sized={height !== null} style={height !== null ? { height } : undefined}>
      {children}
      <div
        className="canvas-resize"
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize lattice height"
        aria-valuemin={MIN}
        aria-valuemax={MAX}
        aria-valuenow={Math.round(current())}
        aria-valuetext={height === null ? 'Automatic height' : `${height} pixels`}
        title="Drag to change the height · double-click to reset"
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={() => apply(null)}
        onKeyDown={onKeyDown}
      >
        <span className="canvas-grip" aria-hidden />
      </div>
    </div>
  );
}
