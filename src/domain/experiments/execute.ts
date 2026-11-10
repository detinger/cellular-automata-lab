// Headless run execution (PLAN.md §3.5, §7.6–§7.8). Uses the same engine as the workspace.
// A run is advanced in bounded slices so a worker can report progress and honor cancellation.
import { ENGINE_VERSION, type Model } from '../contracts/model';
import { createEngine, type Engine, type EngineCheckpoint } from '../engine/engine';
import type { GenerationMetrics } from '../metrics/basic';
import { PRNG_ADAPTER, createStream } from '../random/prng';
import { initializeFromStream } from '../random/seeded';
import type { ExperimentDefinition, MetricId, RunSpec } from './experiment';

export interface SampleRow {
  generation: number;
  counts: number[];
  activity: number | null;
  entropy: number;
  incidence: number | null;
  flow: number | null;
  changed: number | null;
}

export type StopReason = 'horizon' | 'absorbing' | 'first-no-fire' | 'recurrence' | 'cancelled' | 'error';

export interface RunResult {
  runId: string;
  index: number;
  configurationKey: string;
  factorValues: Record<string, number | string>;
  replicateIndex: number;
  seeds: { initialization: string; transition: string };
  status: 'completed' | 'cancelled' | 'error';
  error: string | null;
  requestedHorizon: number;
  /** Last generation actually computed. */
  actualEnd: number;
  stopReason: StopReason;
  stopDetail: string | null;
  /** True when the run stopped in a state that can never change again (values may be carried forward). */
  absorbing: boolean;
  /** For event-defining stops: event generation, or null when censored at `observedUntil`. */
  event: { time: number | null; observedUntil: number } | null;
  response: { value: number | null; reason: string | null };
  sampleInterval: number;
  samples: SampleRow[];
  /** The concrete generation-0 grid, kept so the run can be replayed and hashed. */
  initial: Uint8Array;
  width: number;
  height: number;
  engineVersion: string;
  prngAdapter: string;
  startedAt: string;
  endedAt: string | null;
  wallMs: number;
}

export function metricValue(m: GenerationMetrics, id: MetricId, sites: number): number | null {
  if (id.startsWith('fraction:')) return m.counts[Number(id.slice(9))] / sites;
  switch (id) {
    case 'activity':
      return m.activity;
    case 'entropy':
      return m.entropy;
    case 'incidence':
      return m.incidence;
    case 'flow':
      return m.flow;
    case 'changed':
      return m.changed;
  }
  return null;
}

/** After an absorbing stop, per-generation change metrics are 0 and state metrics keep their final value. */
function carriedValue(id: MetricId, final: number | null): number | null {
  return id === 'activity' || id === 'incidence' || id === 'changed' ? 0 : final;
}

const toSample = (m: GenerationMetrics): SampleRow => ({
  generation: m.generation,
  counts: [...m.counts],
  activity: m.activity,
  entropy: m.entropy,
  incidence: m.incidence,
  flow: m.flow,
  changed: m.changed,
});

/** Builds the concrete generation-0 model of a run (regenerating cells from the initialization stream if asked). */
export function concreteModel(def: ExperimentDefinition, spec: RunSpec): Model {
  const m: Model = { ...spec.model, initial: new Uint8Array(spec.model.initial) };
  if (def.initialization.kind === 'regenerate') {
    let probs = def.initialization.probabilities;
    const pf = def.factors.find((f) => f.target.kind === 'init-probability');
    if (pf) {
      const st = (pf.target as { state: number }).state;
      const p = [...probs];
      p[st] = Number(spec.factorValues[pf.id]);
      p[0] = Math.max(0, 1 - p.slice(1).reduce((a, b) => a + b, 0));
      probs = p;
    }
    m.initial = initializeFromStream(new Uint8Array(m.width * m.height), m.width, m.height, probs, createStream(spec.seeds.initialization));
  }
  return m;
}

/** Exact recurrence detection: hashes index candidates, byte equality confirms (§7.7). */
class RecurrenceDetector {
  private byHash = new Map<number, Array<{ generation: number; cells: Uint8Array }>>();
  private order: Array<{ hash: number; generation: number; bytes: number }> = [];
  private bytes = 0;
  constructor(
    private readonly maxStates = 256,
    private readonly maxBytes = 16 * 1024 * 1024,
  ) {}

  static fnv(cells: Uint8Array) {
    let h = 0x811c9dc5;
    for (let i = 0; i < cells.length; i++) {
      h ^= cells[i];
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  }

  /** Returns the earlier generation with an identical state, or null; then remembers this one. */
  check(generation: number, cells: Uint8Array): number | null {
    const h = RecurrenceDetector.fnv(cells);
    const bucket = this.byHash.get(h);
    if (bucket) {
      for (const c of bucket) {
        if (c.cells.length === cells.length && c.cells.every((v, i) => v === cells[i])) return c.generation;
      }
    }
    const copy = new Uint8Array(cells);
    if (bucket) bucket.push({ generation, cells: copy });
    else this.byHash.set(h, [{ generation, cells: copy }]);
    this.order.push({ hash: h, generation, bytes: copy.length });
    this.bytes += copy.length;
    while (this.order.length > this.maxStates || this.bytes > this.maxBytes) {
      const old = this.order.shift()!;
      this.bytes -= old.bytes;
      const b = this.byHash.get(old.hash)!;
      b.splice(
        b.findIndex((x) => x.generation === old.generation),
        1,
      );
      if (!b.length) this.byHash.delete(old.hash);
    }
    return null;
  }

  get window() {
    return this.order.length;
  }
}

/** Resumable snapshot of a partially executed run (recovery checkpoint, §8.4). */
export interface RunSnapshot {
  runId: string;
  checkpoint: EngineCheckpoint;
  samples: SampleRow[];
  acc: { sum: number; count: number; max: number | null };
  initial: Uint8Array;
  startedAt: string;
  wallMs: number;
}

export class RunExecutor {
  readonly model: Model;
  readonly engine: Engine;
  private readonly def: ExperimentDefinition;
  private readonly spec: RunSpec;
  private readonly sites: number;
  private samples: SampleRow[] = [];
  private acc = { sum: 0, count: 0, max: null as number | null };
  private readonly detector: RecurrenceDetector | null;
  private stop: { reason: StopReason; detail: string | null; absorbing: boolean; event: number | null } | null = null;
  private readonly startedAt: string;
  private wallMs = 0;
  private cancelled = false;
  private failed: string | null = null;

  constructor(def: ExperimentDefinition, spec: RunSpec, resume?: RunSnapshot) {
    this.def = def;
    this.spec = spec;
    this.model = resume ? { ...spec.model, initial: resume.initial } : concreteModel(def, spec);
    this.sites = this.model.width * this.model.height;
    this.engine = createEngine(this.model, { transitionSeed: spec.seeds.transition });
    this.detector = def.stop.kind === 'recurrence' ? new RecurrenceDetector() : null;
    this.startedAt = resume?.startedAt ?? new Date().toISOString();
    if (resume) {
      this.engine.restore(resume.checkpoint);
      this.samples = resume.samples.map((s) => ({ ...s, counts: [...s.counts] }));
      this.acc = { ...resume.acc };
      this.wallMs = resume.wallMs;
      // A resumed recurrence search restarts its window (documented as a state-replay checkpoint, §7.6).
    } else {
      this.observe(this.engine.metrics);
      this.detector?.check(0, this.engine.cells);
      this.checkStop();
    }
  }

  get generation() {
    return this.engine.generation;
  }
  get done() {
    return this.stop !== null || this.cancelled || this.failed !== null || this.engine.generation >= this.def.horizon;
  }

  private inWindow(g: number) {
    const w = this.def.window;
    return g >= w.from && (w.to === null || g <= w.to);
  }

  private observe(m: GenerationMetrics) {
    const g = m.generation;
    if (g % this.def.sampleInterval === 0) this.samples.push(toSample(m));
    if (this.inWindow(g)) {
      const v = metricValue(m, this.def.response.metric, this.sites);
      if (v !== null && Number.isFinite(v)) {
        this.acc.sum += v;
        this.acc.count++;
        this.acc.max = this.acc.max === null ? v : Math.max(this.acc.max, v);
      }
    }
  }

  private checkStop() {
    const m = this.engine.metrics,
      g = m.generation,
      rule = this.model.rule,
      s = this.def.stop;
    if (s.kind === 'absorbing') {
      let abs = false;
      if (rule.id === 'spatial-sir/v1') abs = m.counts[1] === 0;
      else if (rule.id === 'brians-brain/v1') abs = m.counts[1] === 0 && m.counts[2] === 0;
      else if (rule.id !== 'forest-fire/v1') abs = g > 0 && m.changed === 0;
      if (abs)
        this.stop = {
          reason: 'absorbing',
          detail:
            rule.id === 'spatial-sir/v1'
              ? 'No infected cells remain.'
              : rule.id === 'brians-brain/v1'
                ? 'Every cell is ready; nothing can fire again.'
                : 'Fixed point: the grid did not change.',
          absorbing: true,
          event: g,
        };
    } else if (s.kind === 'first-no-fire') {
      if (g > 0 && m.counts[2] === 0)
        this.stop = { reason: 'first-no-fire', detail: `No burning cells at generation ${g}. Lightning may restart fires later.`, absorbing: false, event: g };
    } else if (s.kind === 'recurrence' && g > 0 && this.detector) {
      const earlier = this.detector.check(g, this.engine.cells);
      if (earlier !== null) {
        const period = g - earlier;
        this.stop = {
          reason: 'recurrence',
          detail: period === 1 ? `Fixed point from generation ${earlier}.` : `Cycle of period ${period}: generation ${g} repeats generation ${earlier}.`,
          absorbing: period === 1,
          event: earlier,
        };
      }
    }
  }

  /** Advances until done or until `budgetMs` of wall time has passed. Returns true when the run is finished. */
  advance(budgetMs: number): boolean {
    const t0 = performance.now();
    try {
      while (!this.done && performance.now() - t0 < budgetMs) {
        for (let k = 0; k < 64 && !this.done; k++) {
          this.engine.step();
          this.observe(this.engine.metrics);
          this.checkStop();
        }
      }
    } catch (e) {
      this.failed = (e as Error).message;
    }
    this.wallMs += performance.now() - t0;
    return this.done;
  }

  cancel() {
    this.cancelled = true;
  }

  snapshot(): RunSnapshot {
    return {
      runId: this.spec.runId,
      checkpoint: this.engine.checkpoint(),
      samples: this.samples.map((s) => ({ ...s, counts: [...s.counts] })),
      acc: { ...this.acc },
      initial: new Uint8Array(this.model.initial),
      startedAt: this.startedAt,
      wallMs: this.wallMs,
    };
  }

  result(): RunResult {
    const def = this.def,
      m = this.engine.metrics,
      end = this.engine.generation;
    if (this.samples[this.samples.length - 1]?.generation !== end) this.samples.push(toSample(m)); // always keep the final state
    const status: RunResult['status'] = this.failed ? 'error' : this.cancelled && !this.stop && end < def.horizon ? 'cancelled' : 'completed';
    const stopReason: StopReason = this.failed ? 'error' : status === 'cancelled' ? 'cancelled' : (this.stop?.reason ?? 'horizon');
    const eventStop = def.stop.kind !== 'horizon';
    const event = eventStop && status === 'completed' ? { time: this.stop?.event ?? null, observedUntil: end } : null;
    return {
      runId: this.spec.runId,
      index: this.spec.index,
      configurationKey: this.spec.configurationKey,
      factorValues: this.spec.factorValues,
      replicateIndex: this.spec.replicateIndex,
      seeds: this.spec.seeds,
      status,
      error: this.failed,
      requestedHorizon: def.horizon,
      actualEnd: end,
      stopReason,
      stopDetail: this.stop?.detail ?? null,
      absorbing: this.stop?.absorbing ?? false,
      event,
      response:
        status === 'completed'
          ? this.response(end)
          : { value: null, reason: status === 'cancelled' ? 'The run was cancelled before it finished.' : `The run failed: ${this.failed}` },
      sampleInterval: def.sampleInterval,
      samples: this.samples,
      initial: new Uint8Array(this.model.initial),
      width: this.model.width,
      height: this.model.height,
      engineVersion: ENGINE_VERSION,
      prngAdapter: `${PRNG_ADAPTER.id} (${PRNG_ADAPTER.algorithm}, ${PRNG_ADAPTER.library})`,
      startedAt: this.startedAt,
      endedAt: new Date().toISOString(),
      wallMs: Math.round(this.wallMs),
    };
  }

  private response(end: number): RunResult['response'] {
    const { metric, aggregate } = this.def.response;
    const final = metricValue(this.engine.metrics, metric, this.sites);
    if (aggregate === 'event-time') {
      return this.stop?.event !== undefined && this.stop?.event !== null
        ? { value: this.stop.event, reason: null }
        : { value: null, reason: `Censored: no event by generation ${end}.` };
    }
    const absorbing = this.stop?.absorbing ?? false;
    if (aggregate === 'final') {
      if (end < this.def.horizon && !absorbing)
        return {
          value: null,
          reason: `The run stopped at generation ${end} (${this.stop?.reason}), before the horizon ${this.def.horizon}; the final value at the horizon is unknown.`,
        };
      return {
        value: absorbing && end < this.def.horizon ? (carriedValue(metric, final) ?? final) : final,
        reason: absorbing && end < this.def.horizon ? `Absorbing state from generation ${end}; the value at the horizon equals the value then.` : null,
      };
    }
    const w = this.def.window;
    const windowEnd = w.to ?? this.def.horizon;
    let sum = this.acc.sum,
      count = this.acc.count,
      max = this.acc.max;
    if (end < windowEnd) {
      if (!absorbing)
        return {
          value: null,
          reason: `The run stopped at generation ${end}, inside the analysis window (to ${windowEnd}); the window summary is unavailable.`,
        };
      const carried = carriedValue(metric, final);
      const missing = windowEnd - Math.max(end + 1, w.from) + 1;
      if (carried !== null && missing > 0) {
        sum += carried * missing;
        count += missing;
        max = max === null ? carried : Math.max(max, carried);
      }
    }
    if (count === 0) return { value: null, reason: 'The metric is not defined inside the analysis window.' };
    return {
      value: aggregate === 'window-mean' ? sum / count : max,
      reason: end < windowEnd ? `Absorbing state from generation ${end}; later generations carried forward.` : null,
    };
  }
}

/** Runs a whole run synchronously (tests and small jobs). */
export function executeRun(def: ExperimentDefinition, spec: RunSpec): RunResult {
  const ex = new RunExecutor(def, spec);
  while (!ex.advance(1_000)) {
    /* bounded slices */
  }
  return ex.result();
}

export async function gridHash(cells: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', cells as BufferSource);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
