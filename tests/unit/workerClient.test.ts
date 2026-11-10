// PLAN.md §9.3 INT-07 (stale worker messages after a model switch) and INT-08 (worker error).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SimulationClient, type SimulationListener } from '../../src/workers/client';
import { PROTOCOL_VERSION, type WorkerResponse } from '../../src/domain/contracts/worker';
import { presetById } from '../../src/data/presets';

class StubWorker {
  static last: StubWorker;
  sent: Array<{ type: string; sessionId: string }> = [];
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;
  constructor() {
    StubWorker.last = this;
  }
  postMessage(m: { type: string; sessionId: string }) {
    this.sent.push(m);
  }
  terminate() {}
  emit(m: WorkerResponse) {
    this.onmessage?.({ data: m } as MessageEvent);
  }
}

const listener = (): SimulationListener & Record<string, ReturnType<typeof vi.fn>> => ({
  onFrame: vi.fn(),
  onMetrics: vi.fn(),
  onState: vi.fn(),
  onError: vi.fn(),
});
const frame = (sessionId: string, sequence: number): WorkerResponse => ({
  protocolVersion: PROTOCOL_VERSION,
  sessionId,
  requestId: 1,
  type: 'FRAME',
  width: 5,
  height: 5,
  generation: sequence,
  firstGeneration: 0,
  sequence,
  bufferId: sequence,
  cells: new Uint8Array(25),
  metrics: { generation: sequence, counts: [22, 3], activity: null, changed: null, births: null, deaths: null, flow: null, entropy: 0, incidence: null },
  achievedRate: null,
});

beforeEach(() => {
  (globalThis as unknown as { Worker: unknown }).Worker = StubWorker;
});

describe('SimulationClient', () => {
  it('INT-07: after a model switch, old frames and acknowledgments never reach the new session', () => {
    const l = listener();
    const c = new SimulationClient(l);
    const m = presetById('blinker')!.build();
    c.load(m, { transition: 's' });
    const old = c.sessionId;
    c.load(m, { transition: 's' });
    const w = StubWorker.last;
    w.emit(frame(old, 9));
    w.emit({ protocolVersion: PROTOCOL_VERSION, sessionId: old, requestId: 2, type: 'ACK', command: 'STEP', generation: 9, state: 'paused' });
    w.emit({ protocolVersion: PROTOCOL_VERSION, sessionId: old, requestId: 3, type: 'ERROR', code: 'X', message: 'old', recoverable: false, generation: 9 });
    expect(l.onFrame).not.toHaveBeenCalled();
    expect(l.onState).not.toHaveBeenCalled();
    expect(l.onError).not.toHaveBeenCalled();
    w.emit(frame(c.sessionId, 2));
    expect(l.onFrame).toHaveBeenCalledTimes(1);
  });
  it('INT-07: out-of-order frames are dropped and their buffers recycled', () => {
    const l = listener();
    const c = new SimulationClient(l);
    c.load(presetById('blinker')!.build(), { transition: 's' });
    const w = StubWorker.last;
    w.emit(frame(c.sessionId, 5));
    w.emit(frame(c.sessionId, 3));
    expect(l.onFrame).toHaveBeenCalledTimes(1);
    expect(w.sent.filter((m) => m.type === 'RECYCLE_FRAME')).toHaveLength(1);
  });
  it('INT-08: a crashed worker and a non-recoverable error stop the session visibly', () => {
    const l = listener();
    const c = new SimulationClient(l);
    c.load(presetById('blinker')!.build(), { transition: 's' });
    const w = StubWorker.last;
    w.onerror?.({ message: '' } as ErrorEvent);
    expect(l.onError).toHaveBeenCalledWith('WORKER_CRASH', expect.stringMatching(/stopped unexpectedly/));
    w.emit({
      protocolVersion: PROTOCOL_VERSION,
      sessionId: c.sessionId,
      requestId: 4,
      type: 'ERROR',
      code: 'ENGINE_ERROR',
      message: 'boom',
      recoverable: false,
      generation: 7,
    });
    expect(l.onState).toHaveBeenCalledWith('error', 7);
  });
});
