// IndexedDB repository via Dexie. Revision creation and the project pointer
// update happen in one transaction.
import Dexie, { type PromiseExtended, type Table } from 'dexie';
import type { Model, ModelSpec } from '../domain/contracts/model';
import { fromSpec, toSpec } from '../domain/model/convert';
import { modelHash } from '../domain/model/hash';
import type { ExperimentDefinition } from '../domain/experiments/experiment';
import type { RunResult, RunSnapshot, SampleRow } from '../domain/experiments/execute';

export interface ViewPrefs {
  scale: number;
  offsetX: number;
  offsetY: number;
  showGrid: boolean;
}

export interface ProjectRecord {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  activeRevisionId: string;
  revisionIds: string[];
  view: ViewPrefs | null;
  /** Preset or import the project started from, for display only. */
  origin: string;
  /** Seed of the interactive session's transition stream (stochastic families). */
  seed?: string;
}

export interface RevisionRecord {
  id: string;
  projectId: string;
  parentRevisionId: string | null;
  hash: string;
  createdAt: string;
  reason: string;
  spec: ModelSpec;
}

export type ExperimentStatus = 'draft' | 'running' | 'completed' | 'cancelled' | 'interrupted';

export interface ExperimentRecord {
  id: string;
  projectId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  status: ExperimentStatus;
  definition: ExperimentDefinition;
  /** Wall-clock recovery checkpoint of the run in progress; cleared when the run ends. */
  recovery: RunSnapshot | null;
  completedRuns: number;
  totalRuns: number;
  /** Student's written interpretation. */
  conclusion: string;
  /** Browser/runtime metadata of the session that executed the runs. */
  runtime: string | null;
}

/** A run's record without its sampled rows (those live in metric chunks). */
export type RunRecord = Omit<RunResult, 'samples'> & { id: string; experimentId: string; initialHash: string; runtime: string; retryOf?: string };

export interface MetricChunkRecord {
  id: string;
  runId: string;
  experimentId: string;
  firstGeneration: number;
  lastGeneration: number;
  metricSchemaVersion: 1;
  sampleInterval: number;
  rows: SampleRow[];
  /** SHA-256 of the JSON-encoded rows. */
  integrity: string;
}

export interface ProgressRecord {
  id: string;
  kind: 'lesson' | 'challenge';
  version: number;
  completed: boolean;
  /** Completed activities, e.g. 'prediction', 'check:c1', 'reflection'. */
  activities: string[];
  attempts: number;
  /** Student text (reflection, prediction choice), kept locally. */
  notes?: Record<string, string>;
  updatedAt: string;
}
export interface AssessmentRecord {
  id: string;
  challengeId: string;
  challengeVersion: number;
  projectId: string | null;
  modelHash: string | null;
  results: Array<{ id: string; passed: boolean; observed: string; expected: string; explanation: string }>;
  passed: boolean;
  hintsShown: number;
  reflection: string;
  createdAt: string;
}

/** Baseline vs. alternative comparison. The two experiments are ordinary experiment records. */
export interface ComparisonRecord {
  id: string;
  baselineProjectId: string;
  alternativeProjectId: string;
  baselineRevisionId: string;
  alternativeRevisionId: string;
  design: 'independent' | 'paired';
  baselineExperimentId: string | null;
  alternativeExperimentId: string | null;
  interpretation: string;
  createdAt: string;
  updatedAt: string;
}

export const DB_NAME = 'ca-studio';
/** Set when the stored database was written by a newer app version; nothing is opened then. */
let newerDatabaseVersion: number | null = null;
export const DB_VERSION = 3;

export class LabDb extends Dexie {
  projects!: Table<ProjectRecord, string>;
  revisions!: Table<RevisionRecord, string>;
  experiments!: Table<ExperimentRecord, string>;
  runs!: Table<RunRecord, string>;
  metricChunks!: Table<MetricChunkRecord, string>;
  progress!: Table<ProgressRecord, string>;
  assessments!: Table<AssessmentRecord, string>;
  comparisons!: Table<ComparisonRecord, string>;
  private readonly dbName: string;
  constructor(name = DB_NAME) {
    super(name);
    this.dbName = name;
    this.version(1).stores({ projects: 'id, updatedAt', revisions: 'id, projectId, hash' });
    // v2: experiments, runs, metric chunks, learning progress and assessments.
    // Existing projects and revisions are kept as they are.
    this.version(2)
      .stores({
        projects: 'id, updatedAt',
        revisions: 'id, projectId, hash',
        experiments: 'id, projectId, updatedAt, status',
        runs: 'id, experimentId',
        metricChunks: 'id, runId, experimentId',
        progress: 'id, kind',
        assessments: 'id, challengeId, createdAt',
      })
      .upgrade(async (tx) => {
        // Projects created before v2 have no transition seed; give them the documented default.
        await tx
          .table('projects')
          .toCollection()
          .modify((p: ProjectRecord) => {
            if (p.seed === undefined) p.seed = '1';
          });
      });
    // v3: baseline/alternative comparisons.
    this.version(3).stores({ comparisons: 'id, baselineProjectId, alternativeProjectId, updatedAt' });
  }

  /**
   * Refuses a database written by a newer app version before opening it, so nothing in it is read or
   * changed (Dexie would otherwise open and extend it). Uses indexedDB.databases(), which does not open.
   */
  override open(): PromiseExtended<Dexie> {
    const check = async () => {
      if (typeof indexedDB === 'undefined' || typeof indexedDB.databases !== 'function') return;
      const info = (await indexedDB.databases()).find((d) => d.name === this.dbName);
      if (info?.version && info.version > DB_VERSION * 10) {
        newerDatabaseVersion = info.version / 10;
        this.close({ disableAutoOpen: true });
        throw new DOMException(`Database version ${newerDatabaseVersion} is newer than ${DB_VERSION}.`, 'VersionError');
      }
    };
    return Dexie.Promise.resolve(check()).then(() => super.open()) as PromiseExtended<Dexie>;
  }
}

export const db = new LabDb();
const now = () => new Date().toISOString();
const newId = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;

export async function createProject(model: Model, origin: string, reason = 'created', seed?: string): Promise<string> {
  const projectId = newId('prj');
  const revisionId = newId('rev');
  const hash = await modelHash(model);
  const t = now();
  await db.transaction('rw', db.projects, db.revisions, async () => {
    await db.revisions.add({ id: revisionId, projectId, parentRevisionId: null, hash, createdAt: t, reason, spec: toSpec(model, projectId, revisionId) });
    await db.projects.add({
      id: projectId,
      name: model.name,
      createdAt: t,
      updatedAt: t,
      activeRevisionId: revisionId,
      revisionIds: [revisionId],
      view: null,
      origin,
      ...(seed ? { seed } : {}),
    });
  });
  return projectId;
}

export async function loadProject(id: string): Promise<{ project: ProjectRecord; model: Model; hash: string } | null> {
  const project = await db.projects.get(id);
  if (!project) return null;
  const rev = await db.revisions.get(project.activeRevisionId);
  if (!rev) throw new Error('The project’s active revision is missing from local storage.');
  const model = fromSpec(rev.spec);
  model.name = project.name;
  return { project, model, hash: rev.hash };
}

/** Saves the model; creates a new revision only when its semantic hash changed. */
export async function saveProject(id: string, model: Model, view: ViewPrefs | null, reason: string): Promise<{ hash: string; revisionId: string }> {
  const hash = await modelHash(model);
  let revisionId = '';
  await db.transaction('rw', db.projects, db.revisions, async () => {
    const project = await db.projects.get(id);
    if (!project) throw new Error('This project no longer exists in local storage.');
    const active = await db.revisions.get(project.activeRevisionId);
    const patch: Partial<ProjectRecord> = { name: model.name, updatedAt: now(), view };
    revisionId = project.activeRevisionId;
    if (!active || active.hash !== hash) {
      revisionId = newId('rev');
      await db.revisions.add({
        id: revisionId,
        projectId: id,
        parentRevisionId: project.activeRevisionId,
        hash,
        createdAt: now(),
        reason,
        spec: toSpec(model, id, revisionId),
      });
      patch.activeRevisionId = revisionId;
      patch.revisionIds = [...project.revisionIds, revisionId];
    }
    await db.projects.update(id, patch);
  });
  return { hash, revisionId };
}

export async function saveProjectSeed(id: string, seed: string) {
  await db.projects.update(id, { seed, updatedAt: now() });
}

export async function duplicateProject(id: string): Promise<string | null> {
  const loaded = await loadProject(id);
  if (!loaded) return null;
  return createProject({ ...loaded.model, name: `${loaded.model.name} (copy)` }, loaded.project.origin, `duplicated from ${id}`, loaded.project.seed);
}

export async function deleteProject(id: string) {
  await db.transaction('rw', [db.projects, db.revisions, db.experiments, db.runs, db.metricChunks], async () => {
    const exps = await db.experiments.where('projectId').equals(id).primaryKeys();
    for (const e of exps) await deleteExperimentData(e);
    await db.revisions.where('projectId').equals(id).delete();
    await db.projects.delete(id);
  });
}

// ---- Experiments ----

export async function createExperiment(def: ExperimentDefinition, totalRuns: number): Promise<string> {
  const t = now();
  await db.experiments.add({
    id: def.id,
    projectId: def.projectId,
    name: def.name,
    createdAt: t,
    updatedAt: t,
    status: 'draft',
    definition: def,
    recovery: null,
    completedRuns: 0,
    totalRuns,
    conclusion: '',
    runtime: null,
  });
  return def.id;
}

export async function updateExperiment(id: string, patch: Partial<ExperimentRecord>) {
  await db.experiments.update(id, { ...patch, updatedAt: now() });
}

async function sha256(text: string) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Stores a finished run: its metric chunk first, then the run record, in one transaction. */
export async function saveRun(experimentId: string, result: RunResult, initialHash: string, runtime: string, completedRuns: number) {
  const { samples, ...rest } = result;
  const chunk: MetricChunkRecord = {
    id: `${result.runId}#0`,
    runId: result.runId,
    experimentId,
    firstGeneration: samples[0]?.generation ?? 0,
    lastGeneration: samples[samples.length - 1]?.generation ?? 0,
    metricSchemaVersion: 1,
    sampleInterval: result.sampleInterval,
    rows: samples,
    integrity: await sha256(JSON.stringify(samples)),
  };
  await db.transaction('rw', [db.metricChunks, db.runs, db.experiments], async () => {
    // An earlier interrupted attempt of the same run is kept under its own ID and linked.
    const prev = await db.runs.get(result.runId);
    let retryOf: string | undefined;
    if (prev && prev.status !== 'completed') {
      const n = await db.runs
        .where('experimentId')
        .equals(experimentId)
        .filter((r) => r.runId === result.runId)
        .count();
      retryOf = `${result.runId}~attempt${n}`;
      await db.runs.put({ ...prev, id: retryOf });
      const oldChunk = await db.metricChunks.get(`${result.runId}#0`);
      if (oldChunk) await db.metricChunks.put({ ...oldChunk, id: `${retryOf}#0`, runId: result.runId });
    }
    await db.metricChunks.put(chunk);
    await db.runs.put({ ...rest, id: result.runId, experimentId, initialHash, runtime, ...(retryOf ? { retryOf } : {}) });
    await db.experiments.update(experimentId, { completedRuns, updatedAt: now(), recovery: null });
  });
}

export async function loadRuns(experimentId: string): Promise<RunResult[]> {
  const [runs, chunks] = await Promise.all([
    db.runs.where('experimentId').equals(experimentId).toArray(),
    db.metricChunks.where('experimentId').equals(experimentId).toArray(),
  ]);
  const byChunk = new Map<string, SampleRow[]>();
  for (const c of chunks) byChunk.set(c.id.replace(/#0$/, ''), c.rows);
  return runs.map((r) => ({ ...r, samples: byChunk.get(r.id) ?? [] })).sort((a, b) => a.index - b.index || (a.id < b.id ? -1 : 1));
}

/** Verifies stored metric chunks against their integrity hashes. Returns the IDs of damaged chunks. */
export async function verifyChunks(experimentId: string): Promise<string[]> {
  const chunks = await db.metricChunks.where('experimentId').equals(experimentId).toArray();
  const bad: string[] = [];
  for (const c of chunks) if ((await sha256(JSON.stringify(c.rows))) !== c.integrity) bad.push(c.id);
  return bad;
}

async function deleteExperimentData(id: string) {
  await db.metricChunks.where('experimentId').equals(id).delete();
  await db.runs.where('experimentId').equals(id).delete();
  await db.experiments.delete(id);
}

export async function deleteExperiment(id: string) {
  await db.transaction('rw', [db.experiments, db.runs, db.metricChunks], () => deleteExperimentData(id));
}

/** Marks experiments that were running when the page closed as interrupted (crash recovery). */
export async function markInterrupted() {
  await db.experiments.where('status').equals('running').modify({ status: 'interrupted' });
}

// ---- Learning progress and assessments. Local, formative, not tamper-proof. ----

export async function getProgress(id: string): Promise<ProgressRecord | undefined> {
  try {
    return await db.progress.get(id);
  } catch {
    return undefined;
  }
}

export async function saveProgress(rec: Omit<ProgressRecord, 'updatedAt'>) {
  await db.progress.put({ ...rec, updatedAt: now() });
}

export async function addAssessment(a: Omit<AssessmentRecord, 'id' | 'createdAt'>) {
  const rec: AssessmentRecord = { ...a, id: newId('asm'), createdAt: now() };
  await db.assessments.add(rec);
  return rec;
}

export async function latestAssessment(challengeId: string) {
  return (await db.assessments.where('challengeId').equals(challengeId).sortBy('createdAt')).pop();
}

// ---- Comparisons ----

export async function latestComparison(a: string, b: string) {
  const list = await db.comparisons
    .where('baselineProjectId')
    .equals(a)
    .filter((c) => c.alternativeProjectId === b)
    .toArray();
  return list.sort((x, y) => (x.updatedAt < y.updatedAt ? 1 : -1))[0];
}

export async function putComparison(c: Omit<ComparisonRecord, 'updatedAt'>) {
  await db.comparisons.put({ ...c, updatedAt: now() });
}

// ---- Revisions and branching ----

export async function listRevisions(projectId: string) {
  return (await db.revisions.where('projectId').equals(projectId).toArray()).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

/** Creates a new project from any stored revision; the original project and its runs are untouched. */
export async function branchFromRevision(revisionId: string): Promise<string> {
  const rev = await db.revisions.get(revisionId);
  if (!rev) throw new Error('That revision is no longer stored.');
  const project = await db.projects.get(rev.projectId);
  const model = fromSpec(rev.spec);
  model.name = `${project?.name ?? model.name} (branch)`;
  return createProject(model, project?.origin ?? 'branch', `branched from revision ${revisionId}`, project?.seed);
}

export async function projectExperiments(projectId: string) {
  return (await db.experiments.where('projectId').equals(projectId).toArray()).sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

/** Plain-language explanation of a storage failure. */
export function describeStorageError(e: unknown): string {
  const err = e as { name?: string; message?: string; inner?: { name?: string } };
  const name = err?.name === 'DatabaseClosedError' || err?.name === 'OpenFailedError' ? (err.inner?.name ?? err.name) : err?.name;
  if (newerDatabaseVersion !== null || name === 'VersionError')
    return `This browser holds data from a newer version of Cellular Automata Lab. This version reads database versions up to ${DB_VERSION} and will not change newer data. Open the newer version of the app, or export your work there.`;
  if (name === 'QuotaExceededError')
    return 'Browser storage is full. Your work is still open in this tab: export it now, or delete old projects or experiments to free space. Nothing was deleted automatically.';
  if (name === 'VersionError')
    return `This browser holds data from a newer version of Cellular Automata Lab. This version reads database versions up to ${DB_VERSION} and will not change newer data. Open the newer version of the app, or export your work there.`;
  if (name === 'InvalidStateError' || name === 'SecurityError' || name === 'MissingAPIError')
    return 'Browser storage is unavailable (for example in some private windows). You can still work, but nothing is saved: use Export to keep your work.';
  return err?.message ?? String(e);
}
