# ADR 0002: Worker owns simulation state

**Status:** accepted (Phase 1)

## Decision

One dedicated module worker per open project owns the engine's current and next arrays. The UI never receives these arrays. Each `FRAME` carries a **copy** in a pooled `ArrayBuffer` that is transferred to the UI. The UI copies it into its display buffer and returns it with `RECYCLE_FRAME`. At most two frames can be unconsumed. When the UI falls behind, display frames are skipped, but generations never are.

Every command carries `protocolVersion`, `sessionId` and `requestId`. `LOAD` starts a new session. The client ignores messages from stale sessions and frames whose sequence number is not newer than the last one it accepted.

Playback is scheduled from wall-clock time: the target generation is `elapsed × rate`. The worker runs bounded batches of about 16 ms, then yields. If the requested rate can't be sustained, the anchor is reset and the achieved rate is reported.

## Not yet implemented (contract reserved)

`INSPECT`, `CHECKPOINT` and `CANCEL` are not implemented yet. Transition explanations currently call the pure `domain/rules/explain.ts` on the main thread with the displayed generation. They use the same rule table as the engine, so there is no second copy of the rule logic. Stochastic families (Phase 3) will need explanations served by the worker, so that recorded random draws are reported without consuming new ones.
