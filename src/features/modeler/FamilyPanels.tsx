// Left-panel model definition for 2D families: family and parameters, count-table clauses,
// state legend/labels/brush, and the random stream seed.
import { useEffect, useState } from 'react';
import { Dices, Plus, Trash2 } from 'lucide-react';
import type { CountClause, Model, Neighborhood, RuleSpec } from '../../domain/contracts/model';
import { NAMED_LIFE_RULES, formatLifeLike, parseLifeLike } from '../../domain/rules/lifeLike';
import { TWO_D_FAMILIES, defaultRule, type TwoDFamily } from '../../domain/model/families';
import { neighborCount, type CountTableRule } from '../../domain/rules/countTable';
import { isStochasticRule } from '../../domain/engine/engine';
import { PRNG_ADAPTER } from '../../domain/random/prng';
import { newSeed } from '../../domain/random/seeded';
import { textOn } from '../../renderers/palette';

/** Number input that commits on blur/Enter and shows its own validation message. */
function NumberField({
  id,
  label,
  value,
  min,
  max,
  step = 1,
  integer = false,
  disabled,
  hint,
  onCommit,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  integer?: boolean;
  disabled: boolean;
  hint?: string;
  onCommit(v: number): void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const n = Number(draft);
  const valid = draft.trim() !== '' && Number.isFinite(n) && n >= min && n <= max && (!integer || Number.isInteger(n));
  const commit = () => {
    if (valid && n !== value) onCommit(n);
    else if (!valid) setDraft(String(value));
  };
  return (
    <div className="field">
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className="input tabular"
        type="number"
        min={min}
        max={max}
        step={step}
        value={draft}
        disabled={disabled}
        aria-invalid={!valid}
        aria-describedby={`${id}-hint`}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && commit()}
      />
      <span id={`${id}-hint`} className="hint" style={!valid ? { color: 'var(--error)' } : undefined}>
        {!valid ? `Enter ${integer ? 'a whole number' : 'a number'} from ${min} to ${max}.` : hint}
      </span>
    </div>
  );
}

function NeighborhoodField({ value, disabled, onChange }: { value: Neighborhood; disabled: boolean; onChange(n: Neighborhood): void }) {
  return (
    <div className="field">
      <label className="label" htmlFor="nbhd">
        Neighborhood
      </label>
      <select id="nbhd" className="select" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value as Neighborhood)}>
        <option value="moore-r1">Moore — 8 neighbors (with diagonals)</option>
        <option value="von-neumann-r1">von Neumann — 4 neighbors (no diagonals)</option>
      </select>
    </div>
  );
}

function LifeRuleFields({ rule, disabled, onChange }: { rule: Extract<RuleSpec, { id: 'life-like/v1' }>; disabled: boolean; onChange(r: RuleSpec): void }) {
  const current = formatLifeLike(rule);
  const [draft, setDraft] = useState(current);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setDraft(current);
    setError(null);
  }, [current]);
  const apply = () => {
    const r = parseLifeLike(draft);
    if (!r.ok) return setError(r.message);
    setError(null);
    setDraft(r.canonical);
    if (r.canonical !== current) onChange({ id: 'life-like/v1', ...r.rule });
  };
  return (
    <>
      <div className="field">
        <label className="label" htmlFor="rule-preset">
          Named rule
        </label>
        <select
          id="rule-preset"
          className="select"
          disabled={disabled}
          value={NAMED_LIFE_RULES[current] ? current : ''}
          onChange={(e) => {
            if (e.target.value) {
              const r = parseLifeLike(e.target.value);
              if (r.ok) onChange({ id: 'life-like/v1', ...r.rule });
            }
          }}
        >
          {Object.entries(NAMED_LIFE_RULES).map(([k, v]) => (
            <option key={k} value={k}>
              {v} ({k})
            </option>
          ))}
          {!NAMED_LIFE_RULES[current] && <option value="">Custom life-like rule</option>}
        </select>
      </div>
      <div className="field">
        <label className="label" htmlFor="rule-bs">
          Birth/survival notation
        </label>
        <input
          id="rule-bs"
          className="input"
          style={{ fontFamily: 'var(--font-mono)' }}
          value={draft}
          disabled={disabled}
          aria-invalid={!!error}
          aria-describedby="rule-hint"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={apply}
          onKeyDown={(e) => e.key === 'Enter' && apply()}
        />
        <span id="rule-hint" className="hint" style={error ? { color: 'var(--error)' } : undefined}>
          {error ?? 'A dead cell is born when its live-neighbor count is in B; a live cell survives when it is in S. Counts use the 8 Moore neighbors.'}
        </span>
      </div>
    </>
  );
}

export function FamilySection({ model, disabled, onRule }: { model: Model; disabled: boolean; onRule(rule: RuleSpec): void }) {
  const rule = model.rule;
  if (rule.id === 'elementary/v1') return null;
  const family = TWO_D_FAMILIES.find((f) => f.id === rule.id)!;
  return (
    <section className="ws-section ws-stack" aria-labelledby="rule-h">
      <h4 id="rule-h">Rule</h4>
      <div className="field">
        <label className="label" htmlFor="family">
          Family
        </label>
        <select id="family" className="select" value={rule.id} disabled={disabled} onChange={(e) => onRule(defaultRule(e.target.value as TwoDFamily))}>
          {TWO_D_FAMILIES.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label}
            </option>
          ))}
        </select>
        <span className="hint">
          {family.blurb} Rule ID <code>{rule.id}</code>.
        </span>
      </div>
      {rule.id === 'life-like/v1' && <LifeRuleFields rule={rule} disabled={disabled} onChange={onRule} />}
      {rule.id === 'brians-brain/v1' && (
        <p className="hint" style={{ margin: 0 }}>
          Ready → firing with exactly 2 firing Moore neighbors; firing → refractory; refractory → ready. No parameters.
        </p>
      )}
      {rule.id === 'cyclic/v1' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <NumberField
            id="cyc-k"
            label="Number of states K"
            value={rule.states}
            min={3}
            max={16}
            integer
            disabled={disabled}
            hint="States form a cycle 0 → 1 → … → K−1 → 0."
            onCommit={(v) => onRule({ ...rule, states: v })}
          />
          <NeighborhoodField
            value={rule.neighborhood}
            disabled={disabled}
            onChange={(n) => onRule({ ...rule, neighborhood: n, threshold: Math.min(rule.threshold, n === 'moore-r1' ? 8 : 4) })}
          />
          <NumberField
            id="cyc-t"
            label="Threshold T"
            value={rule.threshold}
            min={1}
            max={rule.neighborhood === 'moore-r1' ? 8 : 4}
            integer
            disabled={disabled}
            hint="A cell advances when at least T neighbors are already in its next state."
            onCommit={(v) => onRule({ ...rule, threshold: v })}
          />
        </div>
      )}
      {rule.id === 'forest-fire/v1' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <NumberField
            id="ff-p"
            label="Growth probability p"
            value={rule.growth}
            min={0}
            max={1}
            step={0.001}
            disabled={disabled}
            hint="Per empty cell per generation."
            onCommit={(v) => onRule({ ...rule, growth: v })}
          />
          <NumberField
            id="ff-f"
            label="Lightning probability f"
            value={rule.ignition}
            min={0}
            max={1}
            step={0.0001}
            disabled={disabled}
            hint="Per tree without a burning neighbor, per generation."
            onCommit={(v) => onRule({ ...rule, ignition: v })}
          />
          <NeighborhoodField value={rule.neighborhood} disabled={disabled} onChange={(n) => onRule({ ...rule, neighborhood: n })} />
          <p className="hint" style={{ margin: 0 }}>
            Burning → empty. A tree with any burning neighbor ignites. Probabilities are per cell per generation, not per minute or area.
          </p>
        </div>
      )}
      {rule.id === 'spatial-sir/v1' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <NumberField
            id="sir-b"
            label="Infection probability β (per infected neighbor)"
            value={rule.beta}
            min={0}
            max={1}
            step={0.01}
            disabled={disabled}
            hint="With k infected neighbors, P(infection) = 1 − (1 − β)^k."
            onCommit={(v) => onRule({ ...rule, beta: v })}
          />
          <NumberField
            id="sir-g"
            label="Recovery probability γ"
            value={rule.gamma}
            min={0}
            max={1}
            step={0.01}
            disabled={disabled}
            hint="Per infected cell per generation."
            onCommit={(v) => onRule({ ...rule, gamma: v })}
          />
          <NeighborhoodField value={rule.neighborhood} disabled={disabled} onChange={(n) => onRule({ ...rule, neighborhood: n })} />
          <p className="hint" style={{ margin: 0 }}>
            No movement, births, deaths, waning immunity or outside infection.
          </p>
        </div>
      )}
      {rule.id === 'count-table/v1' && <CountTableEditor rule={rule} labels={model.stateLabels} disabled={disabled} onChange={onRule} />}
    </section>
  );
}

function CountTableEditor({ rule, labels, disabled, onChange }: { rule: CountTableRule; labels: string[]; disabled: boolean; onChange(r: RuleSpec): void }) {
  const n = neighborCount(rule.neighborhood);
  const K = rule.states;
  const setClause = (i: number, c: CountClause) => onChange({ ...rule, clauses: rule.clauses.map((x, j) => (j === i ? c : x)) });
  const name = (s: number) => labels[s] ?? `State ${s}`;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <NumberField
        id="ct-k"
        label="Number of states"
        value={K}
        min={2}
        max={8}
        integer
        disabled={disabled}
        hint="Cells and clauses that use removed states must be fixed before running."
        onCommit={(v) => onChange({ ...rule, states: v })}
      />
      <NeighborhoodField value={rule.neighborhood} disabled={disabled} onChange={(nb) => onChange({ ...rule, neighborhood: nb })} />
      <p className="hint" style={{ margin: 0 }}>
        Each clause: if the cell is in one of the chosen states and every neighbor count is in range, it becomes the next state. Clauses may not overlap. Counts
        are out of {n} neighbors.
      </p>
      {rule.clauses.map((c, i) => (
        <fieldset key={i} className="clause" disabled={disabled}>
          <legend>Clause {i + 1}</legend>
          <div className="label">If the cell is</div>
          <div className="chips" role="group" aria-label={`Clause ${i + 1} current states`}>
            {Array.from({ length: K }, (_, s) => (
              <label key={s} className="chip">
                <input
                  type="checkbox"
                  checked={c.currentStates.includes(s)}
                  onChange={(e) =>
                    setClause(i, {
                      ...c,
                      currentStates: e.target.checked ? [...c.currentStates, s].sort((a, b) => a - b) : c.currentStates.filter((x) => x !== s),
                    })
                  }
                />
                {name(s)}
              </label>
            ))}
          </div>
          <div className="label">and its neighbors include</div>
          {c.counts.map((k, j) => (
            <div key={j} className="clause-count">
              <input
                className="input input-sm tabular"
                type="number"
                min={0}
                max={n}
                value={k.min}
                aria-label={`Clause ${i + 1} minimum count`}
                onChange={(e) => setClause(i, { ...c, counts: c.counts.map((q, m) => (m === j ? { ...q, min: Number(e.target.value) } : q)) })}
              />
              <span>to</span>
              <input
                className="input input-sm tabular"
                type="number"
                min={0}
                max={n}
                value={k.max}
                aria-label={`Clause ${i + 1} maximum count`}
                onChange={(e) => setClause(i, { ...c, counts: c.counts.map((q, m) => (m === j ? { ...q, max: Number(e.target.value) } : q)) })}
              />
              <select
                className="select input-sm"
                value={k.state}
                aria-label={`Clause ${i + 1} counted state`}
                onChange={(e) => setClause(i, { ...c, counts: c.counts.map((q, m) => (m === j ? { ...q, state: Number(e.target.value) } : q)) })}
              >
                {Array.from({ length: K }, (_, s) => (
                  <option key={s} value={s}>
                    {name(s)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn btn-sm btn-ghost btn-icon"
                aria-label={`Remove count condition ${j + 1} of clause ${i + 1}`}
                onClick={() => setClause(i, { ...c, counts: c.counts.filter((_, m) => m !== j) })}
              >
                <Trash2 size={13} aria-hidden />
              </button>
            </div>
          ))}
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            style={{ alignSelf: 'flex-start' }}
            onClick={() => setClause(i, { ...c, counts: [...c.counts, { state: Math.min(1, K - 1), min: 0, max: n }] })}
          >
            <Plus size={13} aria-hidden />
            Count condition
          </button>
          <div className="field">
            <label className="label" htmlFor={`ct-next-${i}`}>
              then it becomes
            </label>
            <select id={`ct-next-${i}`} className="select" value={c.nextState} onChange={(e) => setClause(i, { ...c, nextState: Number(e.target.value) })}>
              {Array.from({ length: K }, (_, s) => (
                <option key={s} value={s}>
                  {name(s)}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            className="btn btn-sm btn-ghost btn-danger"
            style={{ alignSelf: 'flex-start' }}
            onClick={() => onChange({ ...rule, clauses: rule.clauses.filter((_, j) => j !== i) })}
          >
            <Trash2 size={13} aria-hidden />
            Remove clause
          </button>
        </fieldset>
      ))}
      <button
        type="button"
        className="btn btn-sm"
        disabled={disabled || rule.clauses.length >= 256}
        onClick={() => onChange({ ...rule, clauses: [...rule.clauses, { currentStates: [0], counts: [], nextState: 0 }] })}
      >
        <Plus size={14} aria-hidden />
        Add clause
      </button>
      <div className="field">
        <label className="label" htmlFor="ct-default">
          When no clause applies
        </label>
        <select
          id="ct-default"
          className="select"
          disabled={disabled}
          value={rule.fallback.kind === 'keep-current' ? 'keep' : String(rule.fallback.state)}
          onChange={(e) =>
            onChange({ ...rule, fallback: e.target.value === 'keep' ? { kind: 'keep-current' } : { kind: 'state', state: Number(e.target.value) } })
          }
        >
          <option value="keep">Keep the current state</option>
          {Array.from({ length: K }, (_, s) => (
            <option key={s} value={s}>
              Become {name(s)}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

export function StatesSection({
  model,
  palette,
  counts,
  brush,
  disabled,
  onBrush,
  onLabels,
}: {
  model: Model;
  palette: string[];
  counts: number[] | null;
  brush: number;
  disabled: boolean;
  onBrush(s: number): void;
  onLabels(labels: string[]): void;
}) {
  const [drafts, setDrafts] = useState(model.stateLabels);
  useEffect(() => setDrafts(model.stateLabels), [model.stateLabels]);
  const n = model.width * model.height;
  const commit = (s: number) => {
    const v = drafts[s].trim();
    if (!v || v === model.stateLabels[s]) {
      setDrafts(model.stateLabels);
      return;
    }
    onLabels(model.stateLabels.map((l, i) => (i === s ? v.slice(0, 60) : l)));
  };
  return (
    <section className="ws-section" aria-labelledby="states-h">
      <h4 id="states-h">States</h4>
      <div className="state-list" role="radiogroup" aria-label="Paint with state">
        {model.stateLabels.map((_, s) => (
          <div key={s} className="state-row" data-selected={brush === s}>
            <input
              type="radio"
              name="brush"
              id={`brush-${s}`}
              checked={brush === s}
              onChange={() => onBrush(s)}
              aria-label={`Paint with ${model.stateLabels[s]}`}
            />
            <label htmlFor={`brush-${s}`} className="state-swatch" style={{ background: palette[s], color: textOn(palette[s]) }}>
              {s}
            </label>
            <input
              className="input input-sm"
              value={drafts[s] ?? ''}
              maxLength={60}
              disabled={disabled}
              aria-label={`Label of state ${s}`}
              onChange={(e) => setDrafts((d) => d.map((x, i) => (i === s ? e.target.value : x)))}
              onBlur={() => commit(s)}
              onKeyDown={(e) => e.key === 'Enter' && commit(s)}
            />
            <span className="hint tabular" style={{ minWidth: 48, textAlign: 'right' }} title={counts ? `${counts[s]} of ${n} cells` : undefined}>
              {counts ? `${((counts[s] / n) * 100).toFixed(1)}%` : ''}
            </span>
          </div>
        ))}
      </div>
      <p className="hint" style={{ margin: '6px 0 0' }}>
        The paint tool uses the selected state; erase sets {model.stateLabels[0]}. With the keyboard, Enter cycles the focused cell through the states.
        {model.rule.id === 'cyclic/v1' ? ' State order matters: each state advances to the next one.' : ''}
      </p>
    </section>
  );
}

export function StreamSection({ seed, disabled, onSeed }: { seed: string; disabled: boolean; onSeed(seed: string): void }) {
  const [draft, setDraft] = useState(seed);
  useEffect(() => setDraft(seed), [seed]);
  const apply = () => {
    const v = draft.trim();
    if (v && v !== seed) onSeed(v);
    else setDraft(seed);
  };
  return (
    <section className="ws-section" aria-labelledby="stream-h">
      <h4 id="stream-h">Random stream</h4>
      <div className="field">
        <label className="label" htmlFor="run-seed">
          Transition seed
        </label>
        <div style={{ display: 'flex', gap: 4 }}>
          <input
            id="run-seed"
            className="input tabular"
            value={draft}
            maxLength={64}
            disabled={disabled}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={apply}
            onKeyDown={(e) => e.key === 'Enter' && apply()}
          />
          <button className="btn btn-sm btn-icon" disabled={disabled} onClick={() => onSeed(newSeed())} aria-label="New transition seed" title="New seed">
            <Dices size={14} aria-hidden />
          </button>
        </div>
      </div>
      <p className="hint" style={{ margin: '6px 0 0' }}>
        Every generation uses exactly two random draws per cell (u0, u1), in row order, from this seed. Same seed and same generation-0 cells give the same run;
        a new seed restarts at generation 0. Stream: {PRNG_ADAPTER.algorithm} via {PRNG_ADAPTER.library}.
      </p>
    </section>
  );
}

export const needsStream = (m: Model) => isStochasticRule(m.rule.id);
