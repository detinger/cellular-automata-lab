// Inspector for multistate and stochastic 2D families (PLAN.md §3.1 contextual inspector, §3.4).
import { Info } from 'lucide-react';
import type { Model } from '../../domain/contracts/model';
import type { CellExplanation } from '../../domain/rules/explainCell';
import type { ObservedInfo } from './useSimulation';
import { textOn } from '../../renderers/palette';

const pctText = (p: number) => (p === 0 ? '0%' : p === 1 ? '100%' : `${+(p * 100).toPrecision(3)}%`);

function Stencil({ model, ex, palette }: { model: Model; ex: CellExplanation; palette: string[] }) {
  const moore = ex.neighborhood === 'moore-r1';
  return (
    <div className="stencil" role="table" aria-label={`${moore ? 'Moore' : 'von Neumann'} neighborhood`}>
      {[-1, 0, 1].flatMap((dy) =>
        [-1, 0, 1].map((dx) => {
          if (dx === 0 && dy === 0) {
            return (
              <div
                key="c"
                role="cell"
                className="center"
                style={{ background: palette[ex.current], color: textOn(palette[ex.current]) }}
                aria-label={`Center: ${model.stateLabels[ex.current]}`}
              >
                {ex.current}
              </div>
            );
          }
          const s = ex.samples.find((q) => q.dx === dx && q.dy === dy);
          if (!s) return <div key={`${dx},${dy}`} className="unused" aria-hidden />;
          const desc = s.source === null ? 'exterior' : s.wrapped ? `wrapped from (${s.source.x}, ${s.source.y})` : `(${s.source.x}, ${s.source.y})`;
          return (
            <div
              key={`${dx},${dy}`}
              role="cell"
              className={s.source === null ? 'exterior' : undefined}
              style={{ background: palette[s.state], color: textOn(palette[s.state]) }}
              title={desc}
              aria-label={`${model.stateLabels[s.state]}, ${desc}`}
            >
              {s.state}
              {s.wrapped ? '↻' : s.source === null ? '·' : ''}
            </div>
          );
        }),
      )}
    </div>
  );
}

export function ExplanationBody({ model, ex, palette }: { model: Model; ex: CellExplanation; palette: string[] }) {
  return (
    <>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <Stencil model={model} ex={ex} palette={palette} />
        <div style={{ fontSize: 13, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div>
            Now: <strong>{model.stateLabels[ex.current]}</strong>
          </div>
          {ex.counts.map(
            (c, s) =>
              c > 0 && (
                <div key={s} className="hint">
                  {c} × {model.stateLabels[s]}
                </div>
              ),
          )}
        </div>
      </div>
      <div className="callout">
        <Info aria-hidden />
        <div>
          <p>
            <strong>{ex.clause}.</strong>
          </p>
          <p>{ex.summary}</p>
          {ex.next.kind === 'deterministic' ? (
            <p>
              Next: <strong>{model.stateLabels[ex.next.state]}</strong> (certain).
            </p>
          ) : (
            <p>
              Next:{' '}
              {ex.next.probabilities.map(
                (p, s) =>
                  p > 0 && (
                    <span key={s}>
                      {model.stateLabels[s]} <strong>{pctText(p)}</strong>{' '}
                    </span>
                  ),
              )}
            </p>
          )}
        </div>
      </div>
    </>
  );
}

export function MultistateInspector({
  model,
  ex,
  generation,
  palette,
  stochastic,
  observed,
}: {
  model: Model;
  ex: CellExplanation;
  generation: number;
  palette: string[];
  stochastic: boolean;
  observed: ObservedInfo | null;
}) {
  const obs = observed && observed.x === ex.x && observed.y === ex.y && observed.generation === generation ? observed : null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="hint">
        Cell ({ex.x}, {ex.y}) at generation {generation}
        {stochastic ? ' — preview of the next step' : ''}
      </div>
      <ExplanationBody model={model} ex={ex} palette={palette} />
      {stochastic && (
        <div className="observed" aria-live="polite">
          <div className="label">Observed last step</div>
          {!obs ? (
            <p className="hint" style={{ margin: 0 }}>
              Loading…
            </p>
          ) : !obs.observed ? (
            <p className="hint" style={{ margin: 0 }}>
              {obs.reason}
            </p>
          ) : (
            <>
              <p style={{ margin: '2px 0', fontSize: 13 }}>
                Generation {obs.observed.sourceGeneration} → {obs.observed.sourceGeneration + 1}: {model.stateLabels[obs.observed.explanation.current]} →{' '}
                <strong>{model.stateLabels[obs.observed.observedNext]}</strong>
              </p>
              <p className="hint" style={{ margin: 0 }}>
                {obs.observed.explanation.clause}.
              </p>
              {obs.observed.draws && (
                <p style={{ margin: '2px 0', fontSize: 13 }} className="tabular">
                  Recorded draws: u0 = {obs.observed.draws[0].toFixed(6)}, u1 = {obs.observed.draws[1].toFixed(6)}
                </p>
              )}
              {obs.observed.drawText && (
                <p className="hint" style={{ margin: 0 }}>
                  {obs.observed.drawText}
                </p>
              )}
              <p className="hint" style={{ margin: '4px 0 0' }}>
                Draws are replayed from a saved stream state; inspecting never changes the run.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
