// Typed client for the simulation worker. Ignores stale sessions and out-of-order frames.
import type { Model } from '../domain/contracts/model';
import type { GenerationMetrics } from '../domain/metrics/basic';
import {
  PROTOCOL_VERSION,
  type CommandBody,
  type FramePayload,
  type HistoryInfo,
  type RunState,
  type SeedSpec,
  type WorkerResponse,
} from '../domain/contracts/worker';
import type { EngineCheckpoint } from '../domain/engine/engine';
import type { ObservedTransition } from '../domain/rules/explainCell';

export interface SimulationListener {
  onFrame(frame: FramePayload): void;
  onMetrics(reset: boolean, rows: GenerationMetrics[], truncatedAt: number | null): void;
  onState(state: RunState, generation: number): void;
  onError(code: string, message: string): void;
  onHistory?(history: HistoryInfo): void;
  onTruncate?(generation: number): void;
  onExplanation?(e: { x: number; y: number; generation: number; observed: ObservedTransition | null; reason: string | null }): void;
  onCheckpoint?(cp: EngineCheckpoint): void;
}

export class SimulationClient {
  private worker: Worker;
  sessionId = '';
  private requestId = 0;
  private lastSequence = 0;

  constructor(private listener: SimulationListener) {
    this.worker = new Worker(new URL('./simulation.worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (e: MessageEvent<WorkerResponse>) => this.handle(e.data);
    this.worker.onerror = (e) => listener.onError('WORKER_CRASH', e.message || 'The simulation worker stopped unexpectedly.');
  }

  private send(body: CommandBody, transfer: Transferable[] = []) {
    this.worker.postMessage({ ...body, protocolVersion: PROTOCOL_VERSION, sessionId: this.sessionId, requestId: ++this.requestId }, transfer);
  }

  load(model: Model, seeds: SeedSpec, checkpoint?: EngineCheckpoint) {
    this.sessionId = crypto.randomUUID();
    this.lastSequence = 0;
    this.send({ type: 'LOAD', model, seeds, checkpoint });
  }
  seek(generation: number) {
    this.send({ type: 'SEEK', generation });
  }
  inspect(x: number, y: number) {
    this.send({ type: 'INSPECT', x, y });
  }
  requestCheckpoint() {
    this.send({ type: 'CHECKPOINT' });
  }
  cancel(reason: string) {
    this.send({ type: 'CANCEL', reason });
  }
  run(generationsPerSecond: number) {
    this.send({ type: 'RUN', generationsPerSecond });
  }
  pause() {
    this.send({ type: 'PAUSE' });
  }
  step(count = 1) {
    this.send({ type: 'STEP', count });
  }
  reset() {
    this.send({ type: 'RESET' });
  }

  /** Returns a drawn frame's buffer to the worker's pool. */
  recycle(frame: FramePayload) {
    const buffer = frame.cells.buffer as ArrayBuffer;
    this.send({ type: 'RECYCLE_FRAME', bufferId: frame.bufferId, buffer }, [buffer]);
  }

  dispose() {
    this.send({ type: 'DISPOSE' });
    setTimeout(() => this.worker.terminate(), 100);
  }

  private handle(msg: WorkerResponse) {
    if (msg.sessionId !== this.sessionId) {
      // Stale: return buffers but never let old acknowledgments change the UI.
      return;
    }
    switch (msg.type) {
      case 'READY':
        this.listener.onState('paused', msg.generation);
        return;
      case 'ACK':
        this.listener.onState(msg.state, msg.generation);
        return;
      case 'FRAME':
        if (msg.sequence <= this.lastSequence) {
          this.recycle(msg);
          return;
        }
        this.lastSequence = msg.sequence;
        this.listener.onFrame(msg);
        return;
      case 'METRICS':
        this.listener.onMetrics(msg.reset, msg.rows, msg.truncatedAt);
        return;
      case 'HISTORY':
        this.listener.onHistory?.(msg.history);
        return;
      case 'TRUNCATE':
        this.listener.onTruncate?.(msg.generation);
        return;
      case 'EXPLANATION':
        this.listener.onExplanation?.(msg);
        return;
      case 'CHECKPOINT_DATA':
        this.listener.onCheckpoint?.(msg.checkpoint);
        return;
      case 'ERROR':
        this.listener.onError(msg.code, msg.message);
        if (!msg.recoverable) this.listener.onState('error', msg.generation ?? 0);
        return;
      default: {
        const never: never = msg;
        void never;
      }
    }
  }
}
