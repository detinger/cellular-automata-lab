// Small runnable example embedded in a lesson. Uses the reference engine directly on
// the main thread (demo lattices are small). Starts paused; playing is always an explicit choice.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pause, Play, RotateCcw, SkipForward, StepForward } from 'lucide-react';
import type { Model } from '../../domain/contracts/model';
import { isOneDimensional } from '../../domain/contracts/model';
import { createEngine } from '../../domain/engine/engine';
import { sessionSeed } from '../../domain/random/prng';
import { useStatePalette } from '../../renderers/palette';
import { ruleSummary } from '../../domain/model/families';

const ROWS_1D = 64;

export function LessonDemo({ model, seed, locked, lockedReason }: { model: Model; seed?: string; locked: boolean; lockedReason?: string }) {
  const engine = useMemo(() => createEngine(model, { transitionSeed: sessionSeed(seed ?? '1', 'transition') }), [model, seed]);
  const palette = useStatePalette(model);
  const canvas = useRef<HTMLCanvasElement>(null);
  const oneD = isOneDimensional(model.rule);
  const rows = useRef<Uint8Array[]>([]);
  const [gen, setGen] = useState(0);
  const [playing, setPlaying] = useState(false);
  const w = model.width,
    h = oneD ? ROWS_1D : model.height;

  const draw = () => {
    const c = canvas.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const img = ctx.createImageData(w, h);
    const rgb = palette.map((p) => [parseInt(p.slice(1, 3), 16), parseInt(p.slice(3, 5), 16), parseInt(p.slice(5, 7), 16)]);
    const put = (i: number, s: number) => {
      const [r, g, b] = rgb[s] ?? [128, 128, 128];
      img.data[i * 4] = r;
      img.data[i * 4 + 1] = g;
      img.data[i * 4 + 2] = b;
      img.data[i * 4 + 3] = s === 255 ? 0 : 255;
    };
    if (oneD) {
      const rs = rows.current;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) put(y * w + x, y < rs.length ? rs[y][x] : 255);
    } else {
      for (let i = 0; i < engine.cells.length; i++) put(i, engine.cells[i]);
    }
    ctx.putImageData(img, 0, 0);
  };

  const reset = () => {
    engine.reset();
    rows.current = [new Uint8Array(engine.cells)];
    setGen(0);
    setPlaying(false);
    draw();
  };
  useEffect(reset, [engine]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(draw, [palette]); // eslint-disable-line react-hooks/exhaustive-deps

  const step = (n: number) => {
    for (let i = 0; i < n; i++) {
      engine.step();
      if (oneD) {
        rows.current.push(new Uint8Array(engine.cells));
        if (rows.current.length > ROWS_1D) rows.current.shift();
      }
    }
    setGen(engine.generation);
    draw();
  };

  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => step(1), 120);
    return () => clearInterval(t);
  });

  const counts = engine.metrics.counts;
  const summary = `Generation ${gen}. ${counts.map((c, s) => `${c} ${model.stateLabels[s]}`).join(', ')}.`;
  const scale = Math.max(2, Math.min(12, Math.floor(360 / Math.max(w, h))));
  return (
    <div className="lesson-demo">
      <div className="lesson-demo-canvas">
        <canvas ref={canvas} width={w} height={h} style={{ width: w * scale, height: h * scale, maxWidth: '100%' }} role="img" aria-label={summary} />
      </div>
      <div className="lesson-demo-side">
        <div className="toolbar-group" role="group" aria-label="Demo controls">
          {playing ? (
            <button className="btn btn-sm" onClick={() => setPlaying(false)}>
              <Pause size={14} aria-hidden />
              Pause
            </button>
          ) : (
            <button className="btn btn-sm" onClick={() => setPlaying(true)} disabled={locked}>
              <Play size={14} aria-hidden />
              Play
            </button>
          )}
          <button className="btn btn-sm" onClick={() => step(1)} disabled={locked || playing}>
            <StepForward size={14} aria-hidden />
            Step
          </button>
          <button className="btn btn-sm" onClick={() => step(10)} disabled={locked || playing}>
            <SkipForward size={14} aria-hidden />
            Step 10
          </button>
          <button className="btn btn-sm" onClick={reset} disabled={gen === 0 && !playing}>
            <RotateCcw size={14} aria-hidden />
            Reset
          </button>
        </div>
        <p className="tabular" style={{ margin: 0 }} aria-live="polite">
          {playing ? `Generation ${gen}` : summary}
        </p>
        {locked && (
          <p className="hint" style={{ margin: 0 }}>
            {lockedReason}
          </p>
        )}
        <p className="hint" style={{ margin: 0 }}>
          {ruleSummary(model.rule)} · {oneD ? `${w} cells, time runs down` : `${w} × ${h}`} ·{' '}
          {model.boundary.kind === 'periodic' ? 'periodic' : 'fixed exterior'}
          {seed ? ` · seed ${seed}` : ''}
        </p>
      </div>
    </div>
  );
}
