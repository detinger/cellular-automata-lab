// Reference CPU engine (PLAN.md §7.1–§7.6). Synchronous, double-buffered, never updates in place.
// Stochastic families consume exactly two transition draws per cell per generation, row-major (§7.5).
import { ENGINE_VERSION, type Model, type Neighborhood } from '../contracts/model';
import { capabilityFor } from '../contracts/capabilities';
import { lifeLikeTable } from '../rules/lifeLike';
import { ecaTable } from '../rules/elementary';
import { compileCountTable, lookupCountTable, type CompiledCountTable } from '../rules/countTable';
import { emptyStepMetrics, histogramEntropy, initialMetrics, type GenerationMetrics } from '../metrics/basic';
import { createStream, restoreStream, sessionSeed, PRNG_ADAPTER, type PrngState, type Stream } from '../random/prng';

export class CapabilityError extends Error {
  constructor(
    message: string,
    readonly code = 'CAP_UNSUPPORTED_FAMILY',
  ) {
    super(message);
  }
}

export const CHECKPOINT_FORMAT = 'ca-studio-checkpoint/1';

/** Self-consistent engine state between generations (§7.6). */
export interface EngineCheckpoint {
  format: typeof CHECKPOINT_FORMAT;
  engineVersion: string;
  ruleId: string;
  prngAdapter: string | null;
  generation: number;
  cells: Uint8Array;
  /** Transition stream state; null for deterministic families. */
  transition: PrngState | null;
  metrics: GenerationMetrics;
}

export interface EngineOptions {
  /**
   * Full seed string of the transition stream (see prng.ts seed derivations). Required for
   * stochastic families; when omitted, `sessionSeed('0', 'transition')` is used.
   */
  transitionSeed?: string;
}

export interface Engine {
  readonly width: number;
  readonly height: number;
  readonly generation: number;
  /** Current generation. Borrowed view: copy before transferring or retaining. */
  readonly cells: Uint8Array;
  readonly metrics: GenerationMetrics;
  readonly stochastic: boolean;
  step(count?: number): GenerationMetrics;
  /** Restores generation 0: initial cells and the initial transition stream. */
  reset(): void;
  checkpoint(): EngineCheckpoint;
  restore(cp: EngineCheckpoint): void;
  transitionState(): PrngState | null;
  /**
   * The two draws (u0, u1) the last step consumed for cell `index`, replayed from the saved stream
   * state at the start of that step. Never advances the live stream (REP-06). Null when unavailable.
   */
  lastDraws(index: number): [number, number] | null;
  /** The previous generation's cells (borrowed), if the last operation was a step; else null. */
  previousCells(): Uint8Array | null;
}

/** Fills a (w+2)×(h+2) padded copy of `src` whose border holds the boundary samples. */
function fillPadded(src: Uint8Array, w: number, h: number, padded: Uint8Array, periodic: boolean, exterior: number) {
  const pw = w + 2;
  for (let y = 0; y < h; y++) {
    const row = (y + 1) * pw;
    padded.set(src.subarray(y * w, y * w + w), row + 1);
    padded[row] = periodic ? src[y * w + w - 1] : exterior;
    padded[row + pw - 1] = periodic ? src[y * w] : exterior;
  }
  const last = (h + 1) * pw;
  if (periodic) {
    padded.copyWithin(0, h * pw, h * pw + pw); // top border = last interior row (with its wrapped corners)
    padded.copyWithin(last, pw, pw + pw); // bottom border = first interior row
  } else {
    padded.fill(exterior, 0, pw);
    padded.fill(exterior, last, last + pw);
  }
}

/** Neighbor offsets inside a padded buffer of row width `pw`, in the documented order (§7.2). */
export function paddedOffsets(n: Neighborhood, pw: number): Int32Array {
  return n === 'moore-r1' ? Int32Array.from([-pw - 1, -pw, -pw + 1, -1, 1, pw - 1, pw, pw + 1]) : Int32Array.from([-pw, -1, 1, pw]);
}

abstract class BaseEngine implements Engine {
  readonly width: number;
  readonly height: number;
  readonly stochastic: boolean = false;
  generation = 0;
  cells: Uint8Array;
  metrics: GenerationMetrics;
  protected next: Uint8Array;
  private hasPrevious = false;
  protected readonly periodic: boolean;
  protected readonly exterior: number;
  protected readonly stateCount: number;

  constructor(protected readonly model: Model) {
    this.width = model.width;
    this.height = model.height;
    this.stateCount = model.stateCount;
    this.periodic = model.boundary.kind === 'periodic';
    this.exterior = model.boundary.kind === 'fixed-exterior' ? model.boundary.state : 0;
    this.cells = new Uint8Array(model.initial);
    this.next = new Uint8Array(this.cells.length);
    this.metrics = initialMetrics(this.cells, this.stateCount);
  }

  step(count = 1): GenerationMetrics {
    if (!Number.isInteger(count) || count < 1) throw new RangeError('Step count must be a positive integer.');
    for (let i = 0; i < count; i++) this.stepOnce();
    return this.metrics;
  }

  protected abstract stepOnce(): void;

  protected swap(m: GenerationMetrics) {
    m.entropy = histogramEntropy(m.counts);
    const old = this.cells;
    this.cells = this.next;
    this.next = old;
    this.generation++;
    this.metrics = m;
    this.hasPrevious = true;
  }

  previousCells(): Uint8Array | null {
    return this.hasPrevious ? this.next : null;
  }

  reset() {
    this.hasPrevious = false;
    this.cells = new Uint8Array(this.model.initial);
    this.next = new Uint8Array(this.cells.length);
    this.generation = 0;
    this.metrics = initialMetrics(this.cells, this.stateCount);
  }

  transitionState(): PrngState | null {
    return null;
  }
  lastDraws(_index: number): [number, number] | null {
    return null;
  }

  checkpoint(): EngineCheckpoint {
    return {
      format: CHECKPOINT_FORMAT,
      engineVersion: ENGINE_VERSION,
      ruleId: this.model.rule.id,
      prngAdapter: this.stochastic ? PRNG_ADAPTER.id : null,
      generation: this.generation,
      cells: new Uint8Array(this.cells),
      transition: this.transitionState(),
      metrics: structuredClone(this.metrics),
    };
  }

  restore(cp: EngineCheckpoint) {
    if (cp.format !== CHECKPOINT_FORMAT) throw new CapabilityError(`Unsupported checkpoint format “${cp.format}”.`, 'CHECKPOINT_FORMAT');
    if (cp.engineVersion !== ENGINE_VERSION)
      throw new CapabilityError(`The checkpoint was made by ${cp.engineVersion}; this build runs ${ENGINE_VERSION}.`, 'CHECKPOINT_VERSION');
    if (cp.ruleId !== this.model.rule.id) throw new CapabilityError('The checkpoint belongs to a different rule family.', 'CHECKPOINT_RULE');
    if (cp.cells.length !== this.cells.length) throw new CapabilityError('The checkpoint has a different lattice size.', 'CHECKPOINT_SIZE');
    if (this.stochastic && (!cp.transition || cp.prngAdapter !== PRNG_ADAPTER.id))
      throw new CapabilityError('The checkpoint lacks a compatible random-stream state, so the run cannot continue identically.', 'CHECKPOINT_PRNG');
    this.hasPrevious = false;
    this.cells = new Uint8Array(cp.cells);
    this.next = new Uint8Array(this.cells.length);
    this.generation = cp.generation;
    this.metrics = structuredClone(cp.metrics);
    this.restoreStream(cp.transition);
  }

  protected restoreStream(_state: PrngState | null) {
    /* deterministic families have no stream */
  }
}

class LifeLikeEngine extends BaseEngine {
  private padded: Uint8Array;
  private readonly table: Uint8Array;

  constructor(model: Model) {
    super(model);
    if (model.rule.id !== 'life-like/v1') throw new CapabilityError('Not a life-like rule.');
    this.table = lifeLikeTable(model.rule);
    this.padded = new Uint8Array((this.width + 2) * (this.height + 2));
  }

  protected stepOnce() {
    const { width: w, height: h, table, padded } = this;
    const old = this.cells;
    const next = this.next;
    fillPadded(old, w, h, padded, this.periodic, this.exterior);
    const pw = w + 2;
    const m = emptyStepMetrics(this.generation + 1, 2);
    let changed = 0,
      births = 0,
      deaths = 0,
      live = 0;
    for (let y = 0; y < h; y++) {
      const up = y * pw,
        mid = up + pw,
        down = mid + pw;
      const out = y * w;
      for (let x = 0; x < w; x++) {
        const n =
          padded[up + x] +
          padded[up + x + 1] +
          padded[up + x + 2] +
          padded[mid + x] +
          padded[mid + x + 2] +
          padded[down + x] +
          padded[down + x + 1] +
          padded[down + x + 2];
        const c = old[out + x];
        const v = table[c * 9 + n];
        next[out + x] = v;
        live += v;
        if (v !== c) {
          changed++;
          if (v === 1) births++;
          else deaths++;
        }
      }
    }
    m.counts[1] = live;
    m.counts[0] = w * h - live;
    m.changed = changed;
    m.activity = changed / (w * h);
    m.births = births;
    m.deaths = deaths;
    this.swap(m);
  }
}

class ElementaryEngine extends BaseEngine {
  private readonly table: Uint8Array;
  private readonly traffic: boolean;

  constructor(model: Model) {
    super(model);
    if (model.rule.id !== 'elementary/v1') throw new CapabilityError('Not an elementary rule.');
    this.table = ecaTable(model.rule.ruleNumber);
    this.traffic = model.rule.ruleNumber === 184 && this.periodic;
  }

  protected stepOnce() {
    const w = this.width,
      old = this.cells,
      next = this.next,
      table = this.table;
    const leftEdge = this.periodic ? old[w - 1] : this.exterior;
    const rightEdge = this.periodic ? old[0] : this.exterior;
    let changed = 0,
      live = 0,
      moves = 0;
    for (let x = 0; x < w; x++) {
      const l = x === 0 ? leftEdge : old[x - 1];
      const c = old[x];
      const r = x === w - 1 ? rightEdge : old[x + 1];
      const v = table[(l << 2) | (c << 1) | r];
      next[x] = v;
      live += v;
      if (v !== c) changed++;
      if (c === 1 && r === 0) moves++;
    }
    const m = emptyStepMetrics(this.generation + 1, 2);
    m.counts[1] = live;
    m.counts[0] = w - live;
    m.changed = changed;
    m.activity = changed / w;
    m.births = null; // births/deaths are defined for Life-like rules only (§7.8)
    m.deaths = null;
    m.flow = this.traffic ? moves / w : null;
    this.swap(m);
  }
}

type MultiKind = 'brain' | 'cyclic' | 'fire' | 'sir' | 'table';

/** Brian's Brain, cyclic CA, forest fire, spatial SIR and count tables on a padded lattice. */
class MultiStateEngine extends BaseEngine {
  override readonly stochastic: boolean;
  private padded: Uint8Array;
  private readonly offsets: Int32Array;
  private readonly kind: MultiKind;
  private stream: Stream | null = null;
  private readonly seed: string;
  private stepStartState: PrngState | null = null;
  // Family parameters.
  private readonly threshold: number = 0;
  private readonly growth: number = 0;
  private readonly ignition: number = 0;
  private readonly gamma: number = 0;
  /** SIR infection probability by infected-neighbor count k: 1 − (1−β)^k, by fixed repeated multiplication. */
  private readonly infectP: Float64Array = new Float64Array(0);
  private readonly table: CompiledCountTable | null = null;

  constructor(model: Model, options: EngineOptions) {
    super(model);
    const r = model.rule;
    let neighborhood: Neighborhood = 'moore-r1';
    switch (r.id) {
      case 'brians-brain/v1':
        this.kind = 'brain';
        break;
      case 'cyclic/v1':
        this.kind = 'cyclic';
        neighborhood = r.neighborhood;
        this.threshold = r.threshold;
        break;
      case 'forest-fire/v1':
        this.kind = 'fire';
        neighborhood = r.neighborhood;
        this.growth = r.growth;
        this.ignition = r.ignition;
        break;
      case 'spatial-sir/v1': {
        this.kind = 'sir';
        neighborhood = r.neighborhood;
        this.gamma = r.gamma;
        const n = neighborhood === 'moore-r1' ? 8 : 4;
        this.infectP = new Float64Array(n + 1);
        let keep = 1; // (1−β)^k
        for (let k = 1; k <= n; k++) {
          keep *= 1 - r.beta;
          this.infectP[k] = 1 - keep;
        }
        break;
      }
      case 'count-table/v1':
        this.kind = 'table';
        neighborhood = r.neighborhood;
        this.table = compileCountTable(r);
        break;
      default:
        throw new CapabilityError(`Not a multistate rule: ${r.id}.`);
    }
    this.stochastic = this.kind === 'fire' || this.kind === 'sir';
    this.padded = new Uint8Array((this.width + 2) * (this.height + 2));
    this.offsets = paddedOffsets(neighborhood, this.width + 2);
    this.seed = options.transitionSeed ?? sessionSeed('0', 'transition');
    if (this.stochastic) this.stream = createStream(this.seed);
  }

  protected stepOnce() {
    const { width: w, height: h, padded, offsets, kind } = this;
    const K = this.stateCount;
    const old = this.cells,
      next = this.next;
    fillPadded(old, w, h, padded, this.periodic, this.exterior);
    const pw = w + 2,
      nOff = offsets.length;
    const m = emptyStepMetrics(this.generation + 1, K);
    const counts = m.counts;
    let changed = 0,
      incidence = 0;
    const stream = this.stream;
    if (stream) this.stepStartState = stream.state();
    const table = this.table;
    const infectP = this.infectP,
      growth = this.growth,
      ignition = this.ignition,
      gamma = this.gamma,
      threshold = this.threshold;

    for (let y = 0; y < h; y++) {
      let p = (y + 1) * pw + 1;
      const out = y * w;
      for (let x = 0; x < w; x++, p++) {
        const c = old[out + x];
        let v = c;
        switch (kind) {
          case 'brain': {
            if (c === 1) v = 2;
            else if (c === 2) v = 0;
            else {
              let firing = 0;
              for (let k = 0; k < nOff; k++) if (padded[p + offsets[k]] === 1) firing++;
              v = firing === 2 ? 1 : 0;
            }
            break;
          }
          case 'cyclic': {
            const target = c + 1 === K ? 0 : c + 1;
            let n = 0;
            for (let k = 0; k < nOff; k++) if (padded[p + offsets[k]] === target) n++;
            v = n >= threshold ? target : c;
            break;
          }
          case 'table': {
            let code = 0;
            for (let k = 0; k < nOff; k++) code += table!.weights[padded[p + offsets[k]]];
            v = lookupCountTable(table!, code, c);
            break;
          }
          case 'fire': {
            const u0 = stream!.next(),
              u1 = stream!.next(); // always two draws (§7.5)
            if (c === 2) v = 0;
            else if (c === 0) v = u0 < growth ? 1 : 0;
            else {
              let burning = false;
              for (let k = 0; k < nOff; k++)
                if (padded[p + offsets[k]] === 2) {
                  burning = true;
                  break;
                }
              v = burning || u1 < ignition ? 2 : 1;
            }
            break;
          }
          case 'sir': {
            const u0 = stream!.next(),
              u1 = stream!.next();
            if (c === 0) {
              let infected = 0;
              for (let k = 0; k < nOff; k++) if (padded[p + offsets[k]] === 1) infected++;
              if (infected > 0 && u0 < infectP[infected]) {
                v = 1;
                incidence++;
              }
            } else if (c === 1) v = u1 < gamma ? 2 : 1;
            break;
          }
        }
        next[out + x] = v;
        counts[v]++;
        if (v !== c) changed++;
      }
    }
    m.changed = changed;
    m.activity = changed / (w * h);
    m.births = null;
    m.deaths = null;
    m.incidence = kind === 'sir' ? incidence : null;
    this.swap(m);
  }

  override reset() {
    super.reset();
    this.stepStartState = null;
    if (this.stochastic) this.stream = createStream(this.seed);
  }

  override transitionState() {
    return this.stream ? this.stream.state() : null;
  }

  protected override restoreStream(state: PrngState | null) {
    this.stepStartState = null;
    if (this.stochastic && state) this.stream = restoreStream(state);
  }

  override lastDraws(index: number): [number, number] | null {
    if (!this.stochastic || !this.stepStartState || index < 0 || index >= this.cells.length) return null;
    const s = restoreStream(this.stepStartState);
    for (let i = 0; i < index; i++) {
      s.next();
      s.next();
    }
    return [s.next(), s.next()];
  }
}

/** Creates the reference engine for a validated model, or throws CapabilityError. */
export function createEngine(model: Model, options: EngineOptions = {}): Engine {
  switch (model.rule.id) {
    case 'life-like/v1':
      return new LifeLikeEngine(model);
    case 'elementary/v1':
      return new ElementaryEngine(model);
    case 'brians-brain/v1':
    case 'cyclic/v1':
    case 'forest-fire/v1':
    case 'spatial-sir/v1':
    case 'count-table/v1':
      return new MultiStateEngine(model, options);
    default: {
      const cap = capabilityFor((model.rule as { id: string }).id);
      throw new CapabilityError(`${cap?.label ?? 'This rule family'} is not executable in this build.`);
    }
  }
}

export const isStochasticRule = (id: string) => id === 'forest-fire/v1' || id === 'spatial-sir/v1';
