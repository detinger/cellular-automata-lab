# Storage, migrations and recovery

All user data is in one IndexedDB database, `ca-studio`, accessed through Dexie 4 (`src/storage/db.ts`). Application files are cached separately by the service worker (`public/sw.js`), which never touches user data.

## Schema versions

| Version | Added | Migration |
|---|---|---|
| 1 | `projects`, `revisions` | — |
| 2 | `experiments`, `runs`, `metricChunks`, `progress`, `assessments` | Projects without a transition seed get the documented default `"1"`. |
| 3 | `comparisons` | none needed |

Dexie stores schema version *n* as IndexedDB version 10·*n*. Upgrades run in one transaction; tested by `tests/e2e/reliability.spec.ts` (INT-05), which builds a raw version-1 database and checks that it opens, migrates and keeps its data.

A database written by a **newer** app version is detected before opening (`indexedDB.databases()`), left untouched, and explained on the Models page. Unknown model-file versions are rejected on import with the detected and supported versions.

## What is written when

- **Edits:** autosaved 500 ms after the last change, and on Save. A new revision (with parent link and canonical hash) is created only when semantics change; the project pointer and revision are written in one transaction. Leaving the page triggers a best-effort save; browsers do not guarantee it completes.
- **Experiments:** each run's metric chunk (with SHA-256 integrity hash) and its run record are written in one transaction, so a run is marked complete only once its data is stored. While a run is in progress, a recovery checkpoint (engine state, PRNG state, samples and accumulators so far) is stored every 10 s of progress.
- **Learning:** progress and assessments after each answer or check.

## Failure handling

| Situation | Behavior |
|---|---|
| Storage full (`QuotaExceededError`) | The model stays open and runnable; a "Not saved" callout explains the problem and offers Export and Retry. Nothing is deleted automatically (INT-06 test). |
| Storage unavailable (private window, blocked) | Models page warns; examples still open; Export works. |
| Page closed or crashed during an experiment | On next start, experiments still marked running become **interrupted**. Completed runs are kept; **Resume** reruns the rest, continuing the in-progress run from its recovery checkpoint. A retried run keeps the interrupted attempt as a separate, linked record. |
| Simulation worker error | The run stops with an error message; the model and its saved revisions are unaffected (INT-08 test). |
| Stale worker messages after switching models | Ignored by session ID; out-of-order frames dropped (INT-07 test). |

## Backups

Export `.ca.json` for models and the experiment package, metrics CSV and report for experiments. Clearing site data removes everything in this browser.
