/// <reference lib="webworker" />
// Simulation worker: owns the engine's current/next arrays; sends copies to the UI.
import { createEngine, CapabilityError, type Engine, type EngineCheckpoint } from '../domain/engine/engine';
import {
  CHECKPOINT_BUDGET_BYTES,
  CHECKPOINT_INTERVAL,
  METRICS_CAP,
  PROTOCOL_VERSION,
  type WorkerCommand,
  type WorkerResponse,
  type RunState,
} from '../domain/contracts/worker';
import type { GenerationMetrics } from '../domain/metrics/basic';
import { VOID_STATE, spacetimeRows, type Model } from '../domain/contracts/model';
import { explainObserved } from '../domain/rules/explainCell';

declare const self: DedicatedWorkerGlobalScope;

let engine: Engine | null = null;
let model: Model | null = null;
let sessionId = '';
let state: RunState = 'idle';
let rate = 10;
let sequence = 0;
let timer: ReturnType<typeof setTimeout> | null = null;
let runStart = 0;
let runStartGeneration = 0;
let rateWindow: Array<[number, number]> = [];

// Display snapshot pool: at most two unconsumed frames.
const MAX_PENDING = 2;
let pool: Map<number, ArrayBuffer> = new Map();
let pending = 0;
let nextBufferId = 1;
let frameDirty = false;

// 1D spacetime history: a ring of the most recent rows, oldest first when rendered.
let history: { rows: number; ring: Uint8Array; filled: number; head: number } | null = null;

function pushRow() {
  if (!history || !engine) return;
  const w = engine.width;
  history.ring.set(engine.cells, history.head * w);
  history.head = (history.head + 1) % history.rows;
  history.filled = Math.min(history.filled + 1, history.rows);
}

function initHistory() {
  history =
    engine && engine.height === 1
      ? { rows: spacetimeRows(engine.width), ring: new Uint8Array(spacetimeRows(engine.width) * engine.width), filled: 0, head: 0 }
      : null;
  pushRow();
}

// Measurements: every generation is recorded in the worker (charts sample from this, never from display frames).
let pendingRows: GenerationMetrics[] = [];
let recorded = 0;
let truncatedAt: number | null = null;
let seriesReset = true;
let lastMetricsPost = 0;

function startSeries() {
  pendingRows = [engine!.metrics];
  recorded = 1;
  truncatedAt = null;
  seriesReset = true;
}

function record() {
  if (recorded >= METRICS_CAP) {
    if (truncatedAt === null) truncatedAt = engine!.generation;
    return;
  }
  pendingRows.push(engine!.metrics);
  recorded++;
}

function flushMetrics(requestId: number, force: boolean) {
  const now = performance.now();
  if (!force && now - lastMetricsPost < 250) return; // at most 4 batches per second
  if (!pendingRows.length && !seriesReset && truncatedAt === null) return;
  post({ ...env(requestId), type: 'METRICS', reset: seriesReset, rows: pendingRows, truncatedAt });
  pendingRows = [];
  seriesReset = false;
  lastMetricsPost = now;
  if (historyDirty) postHistory(requestId);
}

// Checkpoint ring: every CHECKPOINT_INTERVAL generations, oldest evicted beyond the byte budget.
let checkpoints: EngineCheckpoint[] = [];
let checkpointBytes = 0;
const cpSize = (cp: EngineCheckpoint) => cp.cells.byteLength + 256;
let historyDirty = false;

function captureCheckpoint() {
  const g = engine!.generation;
  if (g === 0 || g % CHECKPOINT_INTERVAL !== 0 || checkpoints.some((c) => c.generation === g)) return;
  const cp = engine!.checkpoint();
  let i = checkpoints.length;
  while (i > 0 && checkpoints[i - 1].generation > g) i--;
  checkpoints.splice(i, 0, cp);
  checkpointBytes += cpSize(cp);
  while (checkpointBytes > CHECKPOINT_BUDGET_BYTES && checkpoints.length) checkpointBytes -= cpSize(checkpoints.shift()!);
  historyDirty = true;
}

function postHistory(requestId: number) {
  historyDirty = false;
  post({
    ...env(requestId),
    type: 'HISTORY',
    history: {
      interval: CHECKPOINT_INTERVAL,
      budgetBytes: CHECKPOINT_BUDGET_BYTES,
      usedBytes: checkpointBytes,
      generations: checkpoints.map((c) => c.generation),
    },
  });
}

function stepOne() {
  engine!.step();
  pushRow();
  record();
  captureCheckpoint();
}

const post = (msg: WorkerResponse, transfer: Transferable[] = []) => self.postMessage(msg, transfer);
const env = (requestId: number) => ({ protocolVersion: PROTOCOL_VERSION, sessionId, requestId }) as const;

function sendFrame(requestId: number, force = false) {
  if (!engine) return;
  if (pending >= MAX_PENDING && !force) {
    frameDirty = true; // skip a display frame, never a generation
    return;
  }
  const size = history ? history.rows * engine.width : engine.cells.length;
  let bufferId = 0;
  let buffer: ArrayBuffer | undefined;
  for (const [id, b] of pool) {
    if (b.byteLength === size) {
      bufferId = id;
      buffer = b;
      pool.delete(id);
      break;
    }
  }
  if (!buffer) {
    buffer = new ArrayBuffer(size);
    bufferId = nextBufferId++;
  }
  const cells = new Uint8Array(buffer);
  let height = engine.height;
  let firstGeneration = 0;
  if (history) {
    // Copy the ring oldest → newest, then pad unfilled rows with VOID_STATE.
    const w = engine.width,
      { rows, ring, filled, head } = history;
    const start = (head - filled + rows) % rows;
    for (let r = 0; r < filled; r++) cells.set(ring.subarray(((start + r) % rows) * w, ((start + r) % rows) * w + w), r * w);
    cells.fill(VOID_STATE, filled * w);
    height = rows;
    firstGeneration = engine.generation - filled + 1;
  } else {
    cells.set(engine.cells); // copy; the active simulation arrays are never transferred
  }
  pending++;
  frameDirty = false;
  post(
    {
      ...env(requestId),
      type: 'FRAME',
      width: engine.width,
      height,
      generation: engine.generation,
      firstGeneration,
      sequence: ++sequence,
      bufferId,
      cells,
      metrics: engine.metrics,
      achievedRate: state === 'running' ? achievedRate() : null,
    },
    [buffer],
  );
}

function achievedRate() {
  if (rateWindow.length < 2) return null;
  const [t0, g0] = rateWindow[0];
  const [t1, g1] = rateWindow[rateWindow.length - 1];
  return t1 > t0 ? ((g1 - g0) * 1000) / (t1 - t0) : null;
}

function stopTimer() {
  if (timer !== null) clearTimeout(timer);
  timer = null;
}

function fail(requestId: number, e: unknown) {
  stopTimer();
  state = 'error';
  const code = e instanceof CapabilityError ? e.code : 'ENGINE_ERROR';
  post({
    ...env(requestId),
    type: 'ERROR',
    code,
    message: (e as Error).message ?? String(e),
    recoverable: e instanceof CapabilityError,
    generation: engine?.generation ?? null,
  });
}

function tick(requestId: number) {
  if (state !== 'running' || !engine) return;
  const now = performance.now();
  const target = Math.floor(((now - runStart) / 1000) * rate) + runStartGeneration;
  // Bounded batch: catch up, but yield at least every ~16 ms.
  const deadline = now + 16;
  try {
    while (engine.generation < target && performance.now() < deadline) stepOne();
  } catch (e) {
    fail(requestId, e);
    return;
  }
  if (recorded >= METRICS_CAP) {
    // Retention cap reached: pause rather than silently discard measurements.
    stopTimer();
    state = 'paused';
    flushMetrics(requestId, true);
    post({ ...env(requestId), type: 'ACK', command: 'PAUSE', generation: engine.generation, state });
    sendFrame(requestId, true);
    return;
  }
  flushMetrics(requestId, false);
  rateWindow.push([performance.now(), engine.generation]);
  while (rateWindow.length > 2 && rateWindow[0][0] < now - 2000) rateWindow.shift();
  if (engine.generation < target - rate) {
    // Unsustainable: re-anchor so the backlog does not grow without bound. Achieved rate is reported.
    runStart = now;
    runStartGeneration = engine.generation;
  }
  sendFrame(requestId);
  const delay = Math.max(0, Math.min(16, 1000 / rate - (performance.now() - now)));
  timer = setTimeout(() => tick(requestId), delay);
}

// Seek/replay: chunked so PAUSE/CANCEL can interrupt; no frame per replayed generation.
let replay: { target: number; record: boolean; requestId: number } | null = null;

function finishReplay(requestId: number, cancelled: boolean) {
  if (!engine) return;
  stopTimer();
  replay = null;
  state = 'paused';
  if (cancelled) {
    pendingRows = pendingRows.filter((r) => r.generation <= engine!.generation);
    post({ ...env(requestId), type: 'TRUNCATE', generation: engine.generation });
    recorded = Math.min(recorded, engine.generation + 1);
  }
  flushMetrics(requestId, true);
  postHistory(requestId);
  post({ ...env(requestId), type: 'ACK', command: cancelled ? 'CANCEL' : 'SEEK', generation: engine.generation, state });
  sendFrame(requestId, true);
}

function replayChunk() {
  if (!replay || !engine) return;
  const deadline = performance.now() + 16;
  try {
    while (engine.generation < replay.target && performance.now() < deadline) {
      if (replay.record) stepOne();
      else {
        engine.step();
        pushRow();
        captureCheckpoint();
      }
    }
  } catch (e) {
    replay = null;
    fail(0, e);
    return;
  }
  if (engine.generation >= replay.target) finishReplay(replay.requestId, false);
  else {
    flushMetrics(replay.requestId, false);
    timer = setTimeout(replayChunk, 0);
  }
}

function seek(requestId: number, target: number) {
  if (!engine) return;
  const current = engine.generation;
  if (target < current) {
    flushMetrics(requestId, true);
    const cp = [...checkpoints].reverse().find((c) => c.generation <= target);
    if (cp) engine.restore(cp);
    else engine.reset();
    initHistory();
    // Rows 0..target remain valid: the replay follows the identical trajectory (same PRNG state).
    post({ ...env(requestId), type: 'TRUNCATE', generation: target });
    recorded = Math.min(recorded, target + 1);
    if (truncatedAt !== null && truncatedAt > target) truncatedAt = null;
    replay = { target, record: false, requestId };
  } else {
    replay = { target, record: true, requestId };
  }
  state = 'replaying';
  post({ ...env(requestId), type: 'ACK', command: 'SEEK', generation: engine.generation, state });
  timer = setTimeout(replayChunk, 0);
}

self.onmessage = (event: MessageEvent<WorkerCommand>) => {
  const cmd = event.data;
  if (cmd.protocolVersion !== PROTOCOL_VERSION) return;
  if (cmd.type === 'LOAD') {
    stopTimer();
    sessionId = cmd.sessionId;
    state = 'loading';
    pool = new Map();
    pending = 0;
    replay = null;
    checkpoints = [];
    checkpointBytes = 0;
    try {
      engine = createEngine(cmd.model, { transitionSeed: cmd.seeds.transition });
      model = cmd.model;
      if (cmd.checkpoint) engine.restore(cmd.checkpoint);
    } catch (e) {
      engine = null;
      fail(cmd.requestId, e);
      return;
    }
    initHistory();
    startSeries();
    state = 'paused';
    post({ ...env(cmd.requestId), type: 'READY', generation: engine.generation, executable: true });
    flushMetrics(cmd.requestId, true);
    postHistory(cmd.requestId);
    sendFrame(cmd.requestId, true);
    return;
  }
  if (cmd.sessionId !== sessionId) return; // stale session
  const ack = () => post({ ...env(cmd.requestId), type: 'ACK', command: cmd.type, generation: engine?.generation ?? 0, state });

  switch (cmd.type) {
    case 'RECYCLE_FRAME':
      pending = Math.max(0, pending - 1);
      if (engine && cmd.buffer.byteLength === engine.cells.length) pool.set(cmd.bufferId, cmd.buffer);
      if (frameDirty && state !== 'running') sendFrame(cmd.requestId);
      return;
    case 'RUN':
      if (!engine || state === 'error') return fail(cmd.requestId, new Error('No runnable model is loaded.'));
      if (replay) return; // a replay is in progress; its ACK will report the final generation
      if (recorded >= METRICS_CAP) {
        post({
          ...env(cmd.requestId),
          type: 'ERROR',
          code: 'METRICS_CAP',
          message: `The measurement record is full (${METRICS_CAP.toLocaleString('en')} generations). Export the CSV, then Reset to start a new record.`,
          recoverable: true,
          generation: engine.generation,
        });
        return;
      }
      rate = Math.max(0.5, Math.min(1000, cmd.generationsPerSecond));
      runStart = performance.now();
      runStartGeneration = engine.generation;
      rateWindow = [[runStart, engine.generation]];
      if (state !== 'running') {
        state = 'running';
        ack();
        stopTimer();
        timer = setTimeout(() => tick(cmd.requestId), 0);
      } else ack();
      return;
    case 'PAUSE':
      if (replay) return finishReplay(cmd.requestId, true);
      stopTimer();
      if (state === 'running') state = 'paused';
      flushMetrics(cmd.requestId, true);
      ack();
      sendFrame(cmd.requestId, true);
      return;
    case 'STEP':
      if (!engine || state === 'error') return fail(cmd.requestId, new Error('No runnable model is loaded.'));
      if (!Number.isInteger(cmd.count) || cmd.count < 1 || cmd.count > 1_000_000) {
        post({
          ...env(cmd.requestId),
          type: 'ERROR',
          code: 'CMD_INVALID_COUNT',
          message: 'Step count must be a whole number from 1 to 1,000,000.',
          recoverable: true,
          generation: engine.generation,
        });
        return;
      }
      if (state === 'running' || state === 'replaying') {
        post({
          ...env(cmd.requestId),
          type: 'ERROR',
          code: 'CMD_STEP_WHILE_RUNNING',
          message: 'Pause before stepping.',
          recoverable: true,
          generation: engine.generation,
        });
        return;
      }
      try {
        for (let i = 0; i < cmd.count; i++) stepOne();
      } catch (e) {
        return fail(cmd.requestId, e);
      }
      flushMetrics(cmd.requestId, true);
      ack();
      sendFrame(cmd.requestId, true);
      return;
    case 'RESET':
      stopTimer();
      replay = null;
      if (!engine) return;
      engine.reset();
      initHistory();
      startSeries();
      state = 'paused';
      flushMetrics(cmd.requestId, true);
      ack();
      sendFrame(cmd.requestId, true);
      return;
    case 'SEEK':
      if (!engine || state === 'error') return fail(cmd.requestId, new Error('No runnable model is loaded.'));
      if (state === 'running' || state === 'replaying') {
        post({
          ...env(cmd.requestId),
          type: 'ERROR',
          code: 'CMD_SEEK_WHILE_RUNNING',
          message: 'Pause before jumping to a generation.',
          recoverable: true,
          generation: engine.generation,
        });
        return;
      }
      if (!Number.isInteger(cmd.generation) || cmd.generation < 0 || cmd.generation > engine.generation + 1_000_000) {
        post({
          ...env(cmd.requestId),
          type: 'ERROR',
          code: 'CMD_INVALID_GENERATION',
          message: 'Choose a whole-number generation from 0 to 1,000,000 beyond the current one.',
          recoverable: true,
          generation: engine.generation,
        });
        return;
      }
      if (cmd.generation === engine.generation) {
        ack();
        return;
      }
      seek(cmd.requestId, cmd.generation);
      return;
    case 'INSPECT': {
      if (!engine || !model) return;
      const prev = engine.previousCells();
      const { x, y } = cmd;
      const inside = Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < engine.width && y < engine.height;
      const base = { ...env(cmd.requestId), type: 'EXPLANATION' as const, x, y, generation: engine.generation };
      if (!inside || engine.height === 1) {
        post({ ...base, observed: null, reason: 'Observed transitions are available for cells of a 2D lattice.' });
        return;
      }
      if (!prev) {
        post({
          ...base,
          observed: null,
          reason:
            engine.generation === 0
              ? 'No step has happened yet.'
              : 'The previous generation is not kept after a reset or jump; step once to see an observed transition.',
        });
        return;
      }
      const i = y * engine.width + x;
      post({ ...base, observed: explainObserved(model, prev, x, y, engine.lastDraws(i), engine.cells[i], engine.generation - 1), reason: null });
      return;
    }
    case 'CHECKPOINT':
      if (!engine || state === 'running' || state === 'replaying') return;
      post({ ...env(cmd.requestId), type: 'CHECKPOINT_DATA', checkpoint: engine.checkpoint() });
      return;
    case 'CANCEL':
      if (replay) return finishReplay(cmd.requestId, true);
      stopTimer();
      if (state === 'running') state = 'paused';
      flushMetrics(cmd.requestId, true);
      ack();
      sendFrame(cmd.requestId, true);
      return;
    case 'DISPOSE':
      stopTimer();
      engine = null;
      state = 'idle';
      ack();
      self.close();
      return;
    default: {
      const never: never = cmd;
      void never;
    }
  }
};
