// Supported capabilities and known limitations. Mirrors docs/capabilities.md.
import { FAMILY_CAPABILITIES } from '../../domain/contracts/capabilities';
import { ENGINE_VERSION, LIMITS } from '../../domain/contracts/model';
import { PRNG_ADAPTER } from '../../domain/random/prng';
import { EXPERIMENT_LIMITS } from '../../domain/experiments/experiment';
import { COUNT_TABLE_LIMITS } from '../../domain/rules/countTable';
import { CHECKPOINT_BUDGET_BYTES, CHECKPOINT_INTERVAL, METRICS_CAP } from '../../domain/contracts/worker';
import { Badge } from '../../components/ui';

const SEMANTICS: Record<string, string> = {
  'life-like/v1': 'Dead cell born when its live-neighbor count (8 Moore neighbors) is in B; live cell survives when it is in S.',
  'elementary/v1': 'Output = bit (4·left + 2·center + right) of the rule number 0–255. Rule 184 reports traffic flow on a periodic ring.',
  'brians-brain/v1': 'Ready → firing with exactly 2 firing Moore neighbors; firing → refractory; refractory → ready.',
  'cyclic/v1': 'K = 3–16 states in a cycle; advance to (s+1) mod K when at least T neighbors are in that state.',
  'forest-fire/v1': 'Burning → empty; empty → tree with p; tree → burning if a neighbor burns, else with f. Two draws per cell per generation.',
  'spatial-sir/v1': 'S → I with 1 − (1−β)^k for k infected neighbors; I → R with γ; R stays. Two draws per cell per generation.',
  'count-table/v1': `2–${COUNT_TABLE_LIMITS.maxStates} states; up to ${COUNT_TABLE_LIMITS.maxClauses} non-overlapping clauses on neighbor counts, plus a default. No code or expressions.`,
};

export function CapabilitiesPage() {
  return (
    <div className="page">
      <header className="page-header">
        <div>
          <div className="eyebrow">Reference</div>
          <h1>Supported capabilities</h1>
          <p>What this build runs, the exact semantics it uses, and what it does not do.</p>
        </div>
      </header>

      <section style={{ marginBottom: 28 }}>
        <h2>Rule families</h2>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Family</th>
                <th>Rule ID</th>
                <th>States</th>
                <th>Semantics</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {FAMILY_CAPABILITIES.map((c) => (
                <tr key={c.id}>
                  <td>{c.label}</td>
                  <td>
                    <code>{c.id}</code>
                  </td>
                  <td className="num">{c.stateCount === 'declared' ? 'declared' : c.stateCount}</td>
                  <td style={{ minWidth: 260 }}>{SEMANTICS[c.id]}</td>
                  <td>{c.executable ? <Badge tone="success">Runs</Badge> : <Badge>Planned</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card" style={{ marginBottom: 16 }}>
        <h3>Simulation semantics</h3>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          <li>
            <strong>Synchronous updates</strong> for every family: each cell reads only the previous generation.
          </li>
          <li>
            <strong>Neighborhoods:</strong> Moore (8) or von Neumann (4), radius 1. Life-like rules and Brian’s Brain use Moore.
          </li>
          <li>
            <strong>Boundaries:</strong> periodic (torus) or a fixed exterior state. Edge cells still update; reflection and open boundaries are not supported.
          </li>
          <li>
            <strong>Lattices:</strong> 2D {LIMITS.minSize2d}–{LIMITS.maxSize2d} per axis; 1D {LIMITS.minWidth1d}–{LIMITS.maxWidth1d} cells. Finite: patterns
            interact with the boundary.
          </li>
          <li>
            <strong>Randomness:</strong> {PRNG_ADAPTER.algorithm} via {PRNG_ADAPTER.library} (adapter <code>{PRNG_ADAPTER.id}</code>). Separate initialization
            and transition streams; exactly two transition draws per cell per generation, row by row.
          </li>
          <li>
            <strong>History:</strong> checkpoints every {CHECKPOINT_INTERVAL} generations within {CHECKPOINT_BUDGET_BYTES / 1048576} MiB; jumping back replays
            forward from a checkpoint.
          </li>
          <li>
            <strong>Measurements:</strong> up to {METRICS_CAP.toLocaleString('en')} generations per interactive session; playback pauses rather than silently
            dropping measurements.
          </li>
          <li>
            <strong>Experiments:</strong> single runs, replications, one- and two-factor sweeps; at most {EXPERIMENT_LIMITS.maxRuns} runs and 2 billion cell
            updates; independent or paired designs.
          </li>
          <li>
            Engine version <code>{ENGINE_VERSION}</code>. Runs from a different engine or random-stream version are not guaranteed to match.
          </li>
        </ul>
      </section>

      <section className="card">
        <h3>Known limitations</h3>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          <li>CPU only (one simulation worker, one experiment worker). No GPU backend, no hexagonal or 3D lattices, no asynchronous updates, no Gray–Scott.</li>
          <li>
            RLE import/export covers the binary subset (<code>b</code>, <code>o</code>, <code>$</code>, <code>!</code>); RLE does not store boundary, size or
            seeds.
          </li>
          <li>No automatic pattern classification: no spaceship detection and no labels such as “chaotic” or “universal”.</li>
          <li>
            Data lives in this browser’s IndexedDB. Clearing site data deletes it; export important work. Progress and challenge results are local and not
            tamper-proof.
          </li>
          <li>Written answers are never graded automatically; challenge rubrics are for self-assessment or an instructor.</li>
          <li>
            Experiment packages (<code>.ca-experiment.json</code>) are exported but not imported back.
          </li>
          <li>Offline use needs one online visit first; updates wait until you reload.</li>
        </ul>
      </section>
    </div>
  );
}
