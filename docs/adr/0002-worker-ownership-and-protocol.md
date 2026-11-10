# ADR 0002: Worker owns simulation state

**Status:** accepted

## Decision

One dedicated module worker per open project owns the engine's current and next arrays. The UI never receives these arrays. Each `FRAME` carries a **copy** in a pooled `ArrayBuffer` that is transferred to the UI. The UI copies it into its display buffer and returns it with `RECYCLE_FRAME`. At most two frames can be unconsumed. When the UI falls behind, display frames are skipped, but generations never are.

Every command carries `protocolVersion`, `sessionId` and `requestId`. `LOAD` starts a new session. The client ignores messages from stale sessions and frames whose sequence number is not newer than the last one it accepted.

Playback is scheduled from wall-clock time: the target generation is `elapsed × rate`. The worker runs bounded batches of about 16 ms, then yields. If the requested rate can't be sustained, the anchor is reset and the achieved rate is reported.

## Later additions

`SEEK` (replay to a generation from the nearest checkpoint), `INSPECT` (observed transition with the recorded random draws, replayed from the stream state saved at the start of the last step, so the live stream is never advanced), `CHECKPOINT` and `CANCEL` were added with the stochastic families. Deterministic explanations for the next step still run on the main thread from the displayed generation, using the same rule code as the engine.
