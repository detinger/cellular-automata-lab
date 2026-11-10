// History replay: jump to an exact generation by replaying from
// the nearest retained checkpoint. Rules are not reversible; going back means recomputing forward.
import { useEffect, useState } from 'react';
import { ChevronLeft, History } from 'lucide-react';
import type { HistoryInfo, RunState } from '../../domain/contracts/worker';

export function HistorySection({
  generation,
  runState,
  history,
  onSeek,
  onCancel,
}: {
  generation: number;
  runState: RunState;
  history: HistoryInfo | null;
  onSeek(g: number): void;
  onCancel(): void;
}) {
  const [target, setTarget] = useState(String(generation));
  useEffect(() => setTarget(String(generation)), [generation]);
  const t = Number(target);
  const valid = target.trim() !== '' && Number.isInteger(t) && t >= 0 && t <= generation + 1_000_000;
  const busy = runState === 'running' || runState === 'loading' || runState === 'error';
  const replaying = runState === 'replaying';
  const kept = history?.generations ?? [];
  const from = valid && t < generation ? ([...kept].reverse().find((g) => g <= t) ?? 0) : null;
  return (
    <section className="ws-section" aria-labelledby="hist-h">
      <h4 id="hist-h">History</h4>
      <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <button
          className="btn btn-sm"
          disabled={busy || replaying || generation === 0}
          onClick={() => onSeek(generation - 1)}
          title="Back one generation (replays from a checkpoint)"
        >
          <ChevronLeft size={14} aria-hidden />
          Back 1
        </button>
        <div className="field" style={{ width: 96 }}>
          <label className="label" htmlFor="seek-gen">
            Generation
          </label>
          <input
            id="seek-gen"
            className="input input-sm tabular"
            type="number"
            min={0}
            value={target}
            disabled={busy || replaying}
            onChange={(e) => setTarget(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && valid && t !== generation && onSeek(t)}
            aria-invalid={!valid}
          />
        </div>
        {replaying ? (
          <button className="btn btn-sm" onClick={onCancel}>
            Cancel replay
          </button>
        ) : (
          <button className="btn btn-sm" disabled={busy || !valid || t === generation} onClick={() => onSeek(t)}>
            <History size={14} aria-hidden />
            Go
          </button>
        )}
      </div>
      <p className="hint" style={{ margin: '6px 0 0' }}>
        {replaying
          ? 'Replaying…'
          : from !== null
            ? `Replays from ${from === 0 ? 'generation 0' : `the checkpoint at generation ${from}`} to ${t}.`
            : valid && t > generation
              ? `Steps forward ${t - generation} generations.`
              : ''}{' '}
        Rules here are not reversible: going back recomputes forward from a checkpoint, including the random stream, so the result is identical.
        {history &&
          ` Checkpoints every ${history.interval} generations; ${kept.length ? `kept: ${kept[0]}–${kept[kept.length - 1]}` : 'none yet'} (${(history.usedBytes / 1048576).toFixed(1)} of ${history.budgetBytes / 1048576} MiB).`}
      </p>
    </section>
  );
}
