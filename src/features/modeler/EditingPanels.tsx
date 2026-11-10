// Left-panel editing sections: pattern stamps, region selection actions and seeded random fill (PLAN.md §3.1).
import { useRef, useState } from 'react';
import { ClipboardPaste, Copy, Dices, FlipHorizontal2, PaintBucket, RotateCw, Scissors, Stamp, Upload, X, Eraser } from 'lucide-react';
import { PATTERNS, flipHorizontal, rotateCW, type Pattern } from '../../data/patterns';
import { newSeed, type Rect } from '../../domain/random/seeded';
import { MAX_RLE_BYTES, parseRle } from '../../interchange/rle';
import { formatLifeLike, type LifeLikeRule } from '../../domain/rules/lifeLike';

export function PatternPreview({ p, size = 96 }: { p: Pattern; size?: number }) {
  const cell = Math.max(1, Math.min(12, Math.floor(size / Math.max(p.width, p.height))));
  const rects: React.ReactElement[] = [];
  for (let i = 0; i < p.cells.length; i++) {
    if (p.cells[i]) rects.push(<rect key={i} x={(i % p.width) * cell} y={Math.floor(i / p.width) * cell} width={cell} height={cell} fill="var(--sim-alive)" />);
  }
  return (
    <svg
      width={p.width * cell}
      height={p.height * cell}
      role="img"
      aria-label={`${p.name}: ${p.width} by ${p.height}, ${rects.length} live cells`}
      style={{ display: 'block' }}
    >
      <rect width={p.width * cell} height={p.height * cell} fill="var(--sim-dead)" />
      {rects}
    </svg>
  );
}

export function PatternSection({
  pattern,
  clipboard,
  active,
  disabled,
  modelRule,
  onChoose,
  onTransform,
  onActivate,
  onLoaded,
  onError,
}: {
  pattern: Pattern;
  clipboard: Pattern | null;
  active: boolean;
  disabled: boolean;
  modelRule: LifeLikeRule | null;
  onChoose(p: Pattern): void;
  onTransform(p: Pattern): void;
  onActivate(): void;
  onLoaded(p: Pattern, note: string | null): void;
  onError(message: string): void;
}) {
  const file = useRef<HTMLInputElement>(null);
  const options = clipboard ? [clipboard, ...PATTERNS] : PATTERNS;
  const base = options.find((o) => o.id === pattern.id) ?? null;

  const load = async (f: File) => {
    if (f.size > MAX_RLE_BYTES) return onError('The file exceeds the 32 MiB import limit.');
    const r = parseRle(await f.text());
    if (!r.ok) return onError(`${f.name}${r.line ? `, line ${r.line}` : ''}: ${r.message}`);
    const { width, height, cells, rule, name } = r.pattern;
    const differs = rule && modelRule && formatLifeLike(rule) !== formatLifeLike(modelRule);
    const note = differs
      ? `The file declares ${formatLifeLike(rule)}; this model keeps its own rule ${formatLifeLike(modelRule!)}. Only the cells were loaded.`
      : null;
    onLoaded(
      {
        id: 'clipboard',
        name: name ?? f.name.replace(/\.rle$/i, ''),
        description: `${width} × ${height} pattern loaded from ${f.name}.`,
        width,
        height,
        cells,
      },
      note,
    );
  };

  return (
    <section className="ws-section" aria-labelledby="pat-h">
      <h4 id="pat-h">Pattern stamp</h4>
      <div className="field">
        <label className="label" htmlFor="pat-select">
          Pattern
        </label>
        <select
          id="pat-select"
          className="input"
          value={pattern.id}
          disabled={disabled}
          onChange={(e) => onChoose(options.find((o) => o.id === e.target.value)!)}
        >
          {clipboard && <option value="clipboard">Clipboard: {clipboard.name}</option>}
          {PATTERNS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      <p className="hint" style={{ margin: '6px 0' }}>
        {(base ?? pattern).description}
      </p>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <div style={{ maxWidth: 120, overflow: 'hidden' }}>
          <PatternPreview p={pattern} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <button className="btn btn-sm" disabled={disabled} onClick={() => onTransform(rotateCW(pattern))} title="Rotate 90° clockwise (R)">
            <RotateCw size={14} aria-hidden />
            Rotate
          </button>
          <button className="btn btn-sm" disabled={disabled} onClick={() => onTransform(flipHorizontal(pattern))} title="Mirror left–right (M)">
            <FlipHorizontal2 size={14} aria-hidden />
            Mirror
          </button>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
        <button
          className="btn btn-sm"
          aria-pressed={active}
          disabled={disabled}
          onClick={onActivate}
          title="Stamp tool (T). Click the lattice to place; Enter places at the keyboard cursor."
        >
          <Stamp size={14} aria-hidden />
          {active ? 'Stamping' : 'Use stamp tool'}
        </button>
        <button className="btn btn-sm" disabled={disabled} onClick={() => file.current?.click()} title="Load a binary RLE pattern as the stamp">
          <Upload size={14} aria-hidden />
          Load .rle
        </button>
        <input
          ref={file}
          type="file"
          accept=".rle,text/plain"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) void load(f);
          }}
        />
      </div>
      <p className="hint" style={{ margin: '6px 0 0' }}>
        {pattern.width} × {pattern.height}. A stamp overwrites its whole box, dead cells included, and is clipped at the lattice edge (it never wraps).
      </p>
    </section>
  );
}

export function SelectionSection({
  selection,
  disabled,
  hasClipboard,
  onCopy,
  onCut,
  onDelete,
  onFill,
  onPaste,
  onDeselect,
}: {
  selection: Rect | null;
  disabled: boolean;
  hasClipboard: boolean;
  onCopy(): void;
  onCut(): void;
  onDelete(): void;
  onFill(): void;
  onPaste(): void;
  onDeselect(): void;
}) {
  const w = selection ? selection.x1 - selection.x0 + 1 : 0,
    h = selection ? selection.y1 - selection.y0 + 1 : 0;
  return (
    <section className="ws-section" aria-labelledby="sel-h">
      <h4 id="sel-h">Selection</h4>
      {selection ? (
        <>
          <p className="hint" style={{ margin: '0 0 6px' }}>
            ({selection.x0}, {selection.y0}) to ({selection.x1}, {selection.y1}) · {w} × {h} cells
          </p>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button className="btn btn-sm" onClick={onCopy} title="Copy (Ctrl/⌘ C)">
              <Copy size={14} aria-hidden />
              Copy
            </button>
            <button className="btn btn-sm" disabled={disabled} onClick={onCut} title="Cut (Ctrl/⌘ X). Paste it elsewhere to move the region.">
              <Scissors size={14} aria-hidden />
              Cut
            </button>
            <button className="btn btn-sm" disabled={disabled} onClick={onDelete} title="Set to dead (Delete)">
              <Eraser size={14} aria-hidden />
              Clear
            </button>
            <button className="btn btn-sm" disabled={disabled} onClick={onFill} title="Set to alive">
              <PaintBucket size={14} aria-hidden />
              Fill
            </button>
            <button className="btn btn-sm btn-ghost" onClick={onDeselect} title="Deselect">
              <X size={14} aria-hidden />
              Deselect
            </button>
          </div>
        </>
      ) : (
        <p className="hint" style={{ margin: 0 }}>
          Choose the Select tool (<kbd>S</kbd>) and drag a rectangle on the lattice.
        </p>
      )}
      {hasClipboard && (
        <div style={{ marginTop: 8 }}>
          <button className="btn btn-sm" disabled={disabled} onClick={onPaste} title="Paste (Ctrl/⌘ V): place the copied region with the stamp tool">
            <ClipboardPaste size={14} aria-hidden />
            Paste
          </button>
        </div>
      )}
    </section>
  );
}

export function RandomSection({
  disabled,
  inSelection,
  stateLabels,
  onApply,
}: {
  disabled: boolean;
  inSelection: boolean;
  stateLabels: string[];
  onApply(probabilities: number[], seed: string): void;
}) {
  const K = stateLabels.length;
  const [pcts, setPcts] = useState<string[]>(() => Array.from({ length: K }, (_, s) => (s === 0 ? '' : String(K === 2 ? 30 : Math.floor(100 / K)))));
  const [seed, setSeed] = useState(() => newSeed());
  // Keep one entry per state when the family changes.
  const values = Array.from({ length: K }, (_, s) => (s === 0 ? '' : (pcts[s] ?? '0')));
  const nums = values.map((v, s) => (s === 0 ? 0 : Number(v)));
  const restPct = 100 - nums.slice(1).reduce((a, b) => a + b, 0);
  const valid = values.slice(1).every((v, i) => v.trim() !== '' && nums[i + 1] >= 0 && nums[i + 1] <= 100) && restPct >= -1e-9 && seed.trim() !== '';
  const apply = () => {
    const p = nums.map((v, s) => (s === 0 ? Math.max(0, restPct) : v) / 100);
    const sum = p.reduce((a, b) => a + b, 0);
    onApply(
      p.map((v) => v / sum),
      seed.trim(),
    );
  };
  return (
    <section className="ws-section" aria-labelledby="rnd-h">
      <h4 id="rnd-h">Random initial state</h4>
      <div className="field-row">
        {stateLabels.map((label, s) =>
          s === 0 ? null : (
            <div className="field" key={s}>
              <label className="label" htmlFor={`rnd-p${s}`}>
                {label} (%)
              </label>
              <input
                id={`rnd-p${s}`}
                className="input tabular"
                type="number"
                min={0}
                max={100}
                step={1}
                value={values[s]}
                disabled={disabled}
                onChange={(e) =>
                  setPcts((old) => {
                    const n = [...old];
                    n[s] = e.target.value;
                    return n;
                  })
                }
                aria-invalid={!(nums[s] >= 0 && nums[s] <= 100)}
              />
            </div>
          ),
        )}
      </div>
      <p className="hint" style={{ margin: '4px 0 0' }} role={restPct < -1e-9 ? 'alert' : undefined}>
        {restPct < -1e-9 ? 'The percentages add up to more than 100.' : `${stateLabels[0]}: ${+restPct.toFixed(4)}% (the rest).`}
      </p>
      <div className="field" style={{ marginTop: 6 }}>
        <label className="label" htmlFor="rnd-seed">
          Seed
        </label>
        <div style={{ display: 'flex', gap: 4 }}>
          <input
            id="rnd-seed"
            className="input tabular"
            value={seed}
            maxLength={64}
            disabled={disabled}
            onChange={(e) => setSeed(e.target.value)}
            aria-invalid={seed.trim() === ''}
          />
          <button className="btn btn-sm btn-icon" disabled={disabled} onClick={() => setSeed(newSeed())} aria-label="New random seed" title="New seed">
            <Dices size={14} aria-hidden />
          </button>
        </div>
      </div>
      <button className="btn btn-sm" style={{ marginTop: 8 }} disabled={disabled || !valid} onClick={apply}>
        Fill {inSelection ? 'selection' : 'lattice'} randomly
      </button>
      <p className="hint" style={{ margin: '6px 0 0' }}>
        Each cell gets a state independently with these probabilities. The same seed, percentages and region size always give the same cells, so note the seed
        to reproduce them. Changing the seed does nothing until you fill again.
      </p>
    </section>
  );
}
