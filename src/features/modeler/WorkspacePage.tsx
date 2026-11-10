// Phase 1 vertical slice: open → inspect rule → step → explain a cell → reset → edit → save → reload.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowLeftRight,
  ImageDown,
  Brush,
  CircleAlert,
  Download,
  Eraser,
  Grid3x3,
  Hand,
  Info,
  Maximize,
  Pause,
  Play,
  FlaskConical,
  Redo2,
  RotateCcw,
  Search,
  SkipForward,
  SquareDashed,
  Stamp,
  StepForward,
  Trash2,
  Undo2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { PATTERNS, extract, flipHorizontal, rotateCW, stamp, type Pattern } from '../../data/patterns';
import { fillRect, randomInitialize, type Rect } from '../../domain/random/seeded';
import { PRNG_ADAPTER } from '../../domain/random/prng';
import { writeRle } from '../../interchange/rle';
import { PatternSection, RandomSection, SelectionSection } from './EditingPanels';
import { FamilySection, StatesSection, StreamSection, needsStream } from './FamilyPanels';
import { MultistateInspector } from './CellInspector';
import { HistorySection } from './HistorySection';
import { ProvenanceSection } from './ProvenanceSection';
import { snapshotPng } from '../../renderers/pngExport';
import { ENGINE_VERSION } from '../../domain/contracts/model';
import { explainCell } from '../../domain/rules/explainCell';
import { useStatePalette } from '../../renderers/palette';
import { ruleSummary, withRule } from '../../domain/model/families';
import { sessionSeed } from '../../domain/random/prng';
import { normalizedEntropy } from '../../domain/metrics/basic';
import type { Boundary, Model } from '../../domain/contracts/model';
import { LIMITS, VOID_STATE, isOneDimensional } from '../../domain/contracts/model';
import { ECA_PATTERNS_DISPLAY, NAMED_ECA_RULES, patternBits, toggleBit } from '../../domain/rules/elementary';
import { explainElementary } from '../../domain/rules/explain';
import { hasErrors } from '../../domain/contracts/validation';
import { capabilityFor } from '../../domain/contracts/capabilities';
import { NAMED_LIFE_RULES } from '../../domain/rules/lifeLike';
import { explainTransition } from '../../domain/rules/explain';
import { validateModel } from '../../domain/model/validate';
import { cloneModel } from '../../domain/model/convert';
import { exportModelJson } from '../../interchange/modelJson';
import { createExperiment, describeStorageError, duplicateProject, loadProject, saveProject, saveProjectSeed, type ViewPrefs } from '../../storage/db';
import { draftExperiment } from '../experiments/drafts';
import { planRuns } from '../../domain/experiments/experiment';
import { navigate } from '../../app/router';
import { Badge, Callout, Kpi, downloadText, safeFilename, useToast } from '../../components/ui';
import { useTokens } from '../../app/theme';
import { GridCanvas, type GridCanvasHandle, type Tool } from './GridCanvas';
import { EditHistory, resizeCentered } from './history';
import { useSimulation } from './useSimulation';
import { displayDims, toDisplay } from './display';
import { AnalyticsPanel } from './AnalyticsPanel';
import { modelHash } from '../../domain/model/hash';

type SaveState = { kind: 'saved'; at: Date } | { kind: 'saving' } | { kind: 'unsaved' } | { kind: 'failed'; message: string };

const isTyping = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName));

export function WorkspacePage({ projectId }: { projectId: string }) {
  const toast = useToast();
  const [model, setModel] = useState<Model | null>(null);
  const [name, setName] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [initialView, setInitialView] = useState<ViewPrefs | null>(null);
  const [showGrid, setShowGrid] = useState(true);
  const [tool, setTool] = useState<Tool>('paint');
  const [rate, setRate] = useState(10);
  const [stepN, setStepN] = useState(10);
  const [inspect, setInspect] = useState<{ x: number; y: number } | null>(null);
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  const [save, setSave] = useState<SaveState>({ kind: 'saved', at: new Date() });
  const [revisionId, setRevisionId] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [announce, setAnnounce] = useState('');
  const [analyticsOpen, setAnalyticsOpen] = useState(true);
  const [hash, setHash] = useState('');
  const [, forceRender] = useState(0);
  const [pattern, setPattern] = useState<Pattern>(PATTERNS.find((p) => p.id === 'glider')!);
  const [clipboard, setClipboard] = useState<Pattern | null>(null);
  const [selection, setSelection] = useState<Rect | null>(null);
  const [brush, setBrush] = useState(1);
  const [runSeed, setRunSeed] = useState('1');
  const history = useRef(new EditHistory());
  const canvas = useRef<GridCanvasHandle>(null);
  const stroke = useRef<{ before: Model; cells: Uint8Array; view: Uint8Array; changed: boolean } | null>(null);
  const cameraRef = useRef<ViewPrefs | null>(null);
  const loaded = useRef(false);
  const tokens = useTokens(['sim-dead', 'sim-alive'] as const);

  // ---- Load ----
  useEffect(() => {
    let cancelled = false;
    loadProject(projectId)
      .then((r) => {
        if (cancelled) return;
        if (!r) return setLoadError('This project was not found in this browser’s storage.');
        setModel(r.model);
        setName(r.model.name);
        setRevisionId(r.project.activeRevisionId);
        setRunSeed(r.project.seed ?? '1');
        setInitialView(r.project.view);
        cameraRef.current = r.project.view;
        if (r.project.view) setShowGrid(r.project.view.showGrid);
        setSave({ kind: 'saved', at: new Date(r.project.updatedAt) });
        loaded.current = true;
      })
      .catch((e) => !cancelled && setLoadError((e as Error).message));
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const oneDim = !!model && isOneDimensional(model.rule);
  const issues = useMemo(() => (model ? validateModel(model) : []), [model]);
  const executable = !!model && !hasErrors(issues);
  const seeds = useMemo(() => ({ transition: sessionSeed(runSeed, 'transition') }), [runSeed]);
  const sim = useSimulation(model, executable, seeds, (frame) => canvas.current?.draw(frame.cells));
  const { status } = sim;
  const palette = useStatePalette(model ?? { rule: { id: 'life-like/v1', birth: [], survive: [] }, stateCount: 2 });
  useEffect(() => {
    if (model) void modelHash(model).then(setHash);
  }, [model]);
  const running = status.runState === 'running' || status.runState === 'replaying';
  const atZero = status.generation === 0;
  const canEdit = !!model && !running && (atZero || !executable);

  // ---- Autosave (500 ms debounce, PLAN.md §8.4) ----
  const saveNow = useCallback(
    async (m: Model, nm: string, reason: string) => {
      setSave({ kind: 'saving' });
      try {
        const view = cameraRef.current ? { ...cameraRef.current, showGrid } : null;
        const r = await saveProject(projectId, { ...m, name: nm.trim() || 'Untitled model' }, view, reason);
        setRevisionId(r.revisionId);
        setSave({ kind: 'saved', at: new Date() });
      } catch (e) {
        setSave({ kind: 'failed', message: describeStorageError(e) });
      }
    },
    [projectId, showGrid],
  );

  const dirty = useRef(0);
  useEffect(() => {
    if (!loaded.current || !model) return;
    if (dirty.current++ === 0) return; // skip the initial load
    setSave({ kind: 'unsaved' });
    const t = setTimeout(() => void saveNow(model, name, 'edit'), 500);
    return () => clearTimeout(t);
  }, [model, name, showGrid]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Edits ----
  const commit = useCallback(
    (next: Model) => {
      if (!model) return;
      history.current.push(model);
      setModel(next);
      forceRender((n) => n + 1);
    },
    [model],
  );

  const undo = () => {
    if (model && !running) {
      const m = history.current.undo(model);
      if (m) {
        setModel(m);
        forceRender((n) => n + 1);
      }
    }
  };
  const redo = () => {
    if (model && !running) {
      const m = history.current.redo(model);
      if (m) {
        setModel(m);
        forceRender((n) => n + 1);
      }
    }
  };

  const explainEditBlock = () => {
    if (running) setNotice('Pause the simulation before editing cells.');
    else setNotice(`Cell edits change generation 0. Reset, or use the generation ${status.generation} state as a new initial condition.`);
  };

  const onStrokeStart = () => {
    if (!model || !canEdit) {
      explainEditBlock();
      return false;
    }
    const cells = new Uint8Array(model.initial);
    stroke.current = { before: model, cells, view: isOneDimensional(model.rule) ? toDisplay(model, cells) : cells, changed: false };
    return true;
  };
  const onStrokeCells = (pts: Array<[number, number]>) => {
    const s = stroke.current;
    if (!s || !model) return;
    const v = tool === 'erase' ? 0 : Math.min(brush, model.stateCount - 1);
    const oneD = isOneDimensional(model.rule);
    for (const [x, y] of pts) {
      if (oneD && y !== 0) continue; // 1D: only the generation-0 row is editable
      const i = y * model.width + x;
      if (s.cells[i] !== v) {
        s.cells[i] = v;
        s.changed = true;
      }
    }
    if (oneD) s.view.set(s.cells);
    canvas.current?.draw(s.view);
  };
  const onStrokeEnd = () => {
    const s = stroke.current;
    stroke.current = null;
    if (s?.changed && model) commit({ ...cloneModel(model), initial: s.cells }); // one undo entry per gesture
  };
  const toggleCell = (c: { x: number; y: number }) => {
    if (!model) return;
    setInspect(c);
    if (isOneDimensional(model.rule) && c.y !== 0) return;
    if (!canEdit) return explainEditBlock();
    const cells = new Uint8Array(model.initial);
    const i = c.y * model.width + c.x;
    cells[i] = (cells[i] + 1) % model.stateCount;
    commit({ ...cloneModel(model), initial: cells });
    setAnnounce(`Cell (${c.x}, ${c.y}) set to ${model.stateLabels[cells[i]]}.`);
  };

  /** Replaces generation 0 with `cells` as one undoable edit, if editing is allowed now. */
  const applyCells = (cells: Uint8Array, message?: string) => {
    if (!model) return false;
    if (!canEdit) {
      explainEditBlock();
      return false;
    }
    commit({ ...cloneModel(model), initial: cells });
    if (message) setAnnounce(message);
    return true;
  };
  const changeRule = (rule: Model['rule']) => {
    if (!model) return;
    const r = withRule(cloneModel(model), rule);
    commit(r.model);
    if (brush >= r.model.stateCount) setBrush(1);
    if (r.model.rule.id !== 'life-like/v1' && tool === 'stamp') setTool('paint');
    const notes = [
      r.changedCells ? `${r.changedCells} cell${r.changedCells === 1 ? '' : 's'} outside the new state range became ${r.model.stateLabels[0]}.` : '',
      r.boundaryChanged ? `The fixed exterior became ${r.model.stateLabels[0]}.` : '',
    ].filter(Boolean);
    if (notes.length) toast('info', notes.join(' ') + ' Undo restores the previous model.');
  };
  const changeSeed = (seed: string) => {
    setRunSeed(seed);
    void saveProjectSeed(projectId, seed).catch(() => setSave({ kind: 'failed', message: 'The seed could not be saved.' }));
    toast('info', `Transition seed “${seed}”. The run restarts at generation 0.`);
  };
  const onStamp = (a: { x: number; y: number }) => {
    if (!model) return;
    applyCells(stamp(model.initial, model.width, model.height, pattern, a.x, a.y), `${pattern.name} placed with its top-left corner at (${a.x}, ${a.y}).`);
  };
  const copySelection = (cut: boolean) => {
    if (!model || !selection) return;
    const p = extract(model.initial, model.width, selection.x0, selection.y0, selection.x1, selection.y1);
    if (cut && !applyCells(fillRect(model.initial, model.width, selection, 0))) return;
    setClipboard(p);
    toast('success', `${cut ? 'Cut' : 'Copied'} ${p.width} × ${p.height} cells from generation 0. Paste to place them with the stamp tool.`);
  };
  const paste = () => {
    if (!clipboard) return;
    setPattern(clipboard);
    setTool('stamp');
    setSelection(null);
  };
  const transformPattern = (next: Pattern) => {
    setPattern(next);
    if (next.id === 'clipboard') setClipboard(next);
  };
  const applyRandom = (probabilities: number[], seed: string) => {
    if (!model) return;
    const rect = !oneDim && selection ? selection : undefined;
    // 1D: only the generation-0 row is editable, which is the whole model grid.
    if (applyCells(randomInitialize(model.initial, model.width, model.height, probabilities, seed, rect))) {
      const desc = probabilities.map((p, s) => `${model.stateLabels[s]} ${+(p * 100).toFixed(2)}%`).join(', ');
      toast('success', `Filled the ${rect ? 'selection' : 'lattice'} (${desc}) with seed “${seed}” (${PRNG_ADAPTER.id}, ${PRNG_ADAPTER.algorithm}).`);
    }
  };
  const startExperiment = async () => {
    if (!model || !executable) return;
    try {
      const m = { ...model, name: name.trim() || 'Untitled model' };
      const saved = await saveProject(projectId, m, cameraRef.current ? { ...cameraRef.current, showGrid } : null, 'experiment base');
      setSave({ kind: 'saved', at: new Date() });
      const def = draftExperiment(m, projectId, saved.revisionId, saved.hash);
      await createExperiment(def, planRuns(def).length);
      navigate(`/experiment/${def.id}`);
    } catch (e) {
      toast('error', `Could not start an experiment: ${(e as Error).message}`);
    }
  };
  const startComparison = async () => {
    if (!model) return;
    try {
      await saveProject(
        projectId,
        { ...model, name: name.trim() || 'Untitled model' },
        cameraRef.current ? { ...cameraRef.current, showGrid } : null,
        'comparison baseline',
      );
      const altId = await duplicateProject(projectId);
      if (!altId) throw new Error('The project could not be copied.');
      toast('info', 'Created an alternative copy. Open it, change one assumption, then come back to compare.');
      navigate(`/compare/${projectId}/${altId}`);
    } catch (e) {
      toast('error', `Could not start a comparison: ${(e as Error).message}`);
    }
  };
  const exportPng = async () => {
    if (!model) return;
    const d = sim.display.current;
    const cells = d?.cells ?? toDisplay(model, model.initial);
    const dd = displayDims(model);
    const style = getComputedStyle(document.documentElement);
    const v = (n: string) => style.getPropertyValue(`--${n}`).trim();
    const gen = status.generation;
    const lines = [
      `${ruleSummary(model.rule)} · ${isOneDimensional(model.rule) ? `${model.width} cells, rows are generations ${d?.firstGeneration ?? 0}–${gen} (time runs down)` : `${model.width} × ${model.height}`} · ${model.boundary.kind === 'periodic' ? 'periodic boundary' : `fixed exterior (${model.stateLabels[model.boundary.state]})`}`,
      `Generation ${gen} · model hash ${hash.slice(0, 16)} · ${ENGINE_VERSION}${stochastic ? ` · transition seed “${runSeed}”` : ''}`,
      'Picture only: open the .ca.json export to reproduce or continue this model.',
    ];
    try {
      const blob = await snapshotPng(
        cells,
        dd.width,
        dd.height,
        palette,
        v('canvas-bg') || '#ffffff',
        { title: `${name || 'Untitled model'} — generation ${gen}`, lines, labels: model.stateLabels },
        { bg: v('bg-elevated') || '#ffffff', text: v('text') || '#17202c', muted: v('text-subtle') || '#6b7787' },
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${safeFilename(name)}-gen${gen}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      toast('error', `PNG export failed: ${(e as Error).message}`);
    }
  };
  const exportRle = () => {
    if (!model || model.rule.id !== 'life-like/v1') return;
    const comments = [
      `#N ${name.trim() || 'Untitled model'}`,
      `#C Generation 0 exported from Cellular Automata Studio.`,
      `#C RLE keeps only cells and rule; boundary (${model.boundary.kind}) and lattice size are not part of RLE. Use .ca.json to keep them.`,
    ];
    downloadText(`${safeFilename(name)}.rle`, writeRle(model.width, model.height, model.initial, model.rule, comments), 'text/plain');
    toast('info', 'Exported RLE. It does not record the boundary or lattice size; export .ca.json to reproduce this model exactly.');
  };

  const getCells = useCallback(
    () => stroke.current?.view ?? sim.display.current?.cells ?? (model ? toDisplay(model, model.initial) : new Uint8Array(0)),
    [model, sim.display],
  );
  /** The current generation in model shape (for "use current state as initial condition"). */
  const currentCells = () => {
    const d = sim.display.current!;
    if (!model || !isOneDimensional(model.rule)) return new Uint8Array(d.cells);
    const row = d.generation - d.firstGeneration;
    return d.cells.slice(row * model.width, row * model.width + model.width);
  };

  // ---- Simulation controls ----
  const play = () => {
    setNotice(null);
    sim.run(rate);
  };
  const doStep = (n: number) => {
    setNotice(null);
    sim.step(n);
    setAnnounce('');
  };
  const doReset = () => {
    setNotice(null);
    sim.reset();
  };
  useEffect(() => {
    if (running) sim.run(rate);
  }, [rate]); // eslint-disable-line react-hooks/exhaustive-deps

  // Announce user-requested steps only (never every generation while playing).
  const lastAnnounced = useRef(-1);
  useEffect(() => {
    if (running || !status.metrics || status.generation === lastAnnounced.current) return;
    lastAnnounced.current = status.generation;
    const live = status.metrics.counts[1];
    setAnnounce(`Generation ${status.generation}: ${live} alive cell${live === 1 ? '' : 's'}.`);
  }, [status.generation, status.metrics, running]);

  // Stochastic inspector: ask the worker for the observed last transition of the selected cell.
  const stochastic = !!model && needsStream(model);
  useEffect(() => {
    if (stochastic && inspect && !running && status.runState !== 'loading') sim.inspect(inspect.x, inspect.y);
  }, [stochastic, inspect, status.generation, running, status.runState]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pause when the tab is hidden (§3.4 runtime behavior).
  useEffect(() => {
    const on = () => {
      if (document.hidden && running) {
        sim.pause();
        setNotice('Simulation paused because the tab was hidden. Press Play to continue.');
      }
    };
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, [running, sim]);

  // ---- Keyboard shortcuts (§9.5) ----
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.altKey) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
        return;
      }
      if (mod && !oneDim && e.key.toLowerCase() === 'c' && selection) {
        e.preventDefault();
        copySelection(false);
        return;
      }
      if (mod && !oneDim && e.key.toLowerCase() === 'x' && selection) {
        e.preventDefault();
        copySelection(true);
        return;
      }
      if (mod && !oneDim && e.key.toLowerCase() === 'v' && clipboard) {
        e.preventDefault();
        paste();
        return;
      }
      if (mod) return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && selection && model && !oneDim) {
        e.preventDefault();
        applyCells(fillRect(model.initial, model.width, selection, 0), 'Selection cleared.');
        return;
      }
      if (e.code === 'Space' && !(document.activeElement instanceof HTMLButtonElement)) {
        e.preventDefault();
        if (!executable) return;
        if (running) sim.pause();
        else play();
      } else if (e.key === 'n' || e.key === 'N') {
        if (executable && !running) doStep(1);
      } else if (e.key === 'f' || e.key === 'F') canvas.current?.fit();
      else if (e.key === 'Escape') {
        if (selection) setSelection(null);
        else {
          setTool('inspect');
          setNotice(null);
        }
      } else if (!oneDim && (e.key === 's' || e.key === 'S')) setTool('select');
      else if (model?.rule.id === 'life-like/v1' && (e.key === 't' || e.key === 'T')) setTool('stamp');
      else if (!oneDim && tool === 'stamp' && (e.key === 'r' || e.key === 'R')) transformPattern(rotateCW(pattern));
      else if (!oneDim && tool === 'stamp' && (e.key === 'm' || e.key === 'M')) transformPattern(flipHorizontal(pattern));
      else if (e.key === 'b' || e.key === 'B') setTool('paint');
      else if (e.key === 'e' || e.key === 'E') setTool('erase');
      else if (e.key === 'i' || e.key === 'I') setTool('inspect');
      else if (e.key === 'h' || e.key === 'H') setTool('pan');
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  });

  // Save on leaving if there are pending changes (best effort; not guaranteed by browsers).
  const latestRef = useRef({ model, name, save });
  latestRef.current = { model, name, save };
  useEffect(
    () => () => {
      const l = latestRef.current;
      if (l.model && l.save.kind === 'unsaved') void saveProject(projectId, { ...l.model, name: l.name }, cameraRef.current, 'edit');
    },
    [projectId],
  );

  if (loadError) {
    return (
      <div className="page">
        <Callout kind="error" title="Could not open the project">
          <p>{loadError}</p>
        </Callout>
        <p style={{ marginTop: 16 }}>
          <a href="#/">Back to models</a>
        </p>
      </div>
    );
  }
  if (!model)
    return (
      <div className="page">
        <p className="hint">Opening project…</p>
      </div>
    );

  const metrics = status.metrics;
  const n = model.width * model.height;
  const pct = (v: number) => `${(v * 100).toFixed(v > 0 && v < 0.001 ? 3 : 1)}%`;
  const ruleText = ruleSummary(model.rule);
  const ruleName = model.rule.id === 'elementary/v1' ? NAMED_ECA_RULES[model.rule.ruleNumber]?.split(' — ')[1] : NAMED_LIFE_RULES[ruleText];
  const oneD = isOneDimensional(model.rule);
  const dims = displayDims(model);
  const displayCells = getCells();
  const firstGeneration = stroke.current ? 0 : (sim.display.current?.firstGeneration ?? 0);
  const validDisplay = displayCells.length === dims.width * dims.height;
  const lifeRule = model.rule.id === 'life-like/v1';
  const explanation = lifeRule && inspect && validDisplay ? explainTransition(model, displayCells, inspect.x, inspect.y) : null;
  const multiExplanation = !lifeRule && !oneD && inspect && validDisplay ? explainCell(model, displayCells, inspect.x, inspect.y) : null;
  let ecaExplanation: { ex: NonNullable<ReturnType<typeof explainElementary>>; sourceGeneration: number; observed: number | null } | null = null;
  if (oneD && inspect && validDisplay && displayCells[inspect.y * model.width] !== VOID_STATE) {
    const row = displayCells.subarray(inspect.y * model.width, (inspect.y + 1) * model.width);
    const ex = explainElementary(model, row, inspect.x);
    const below = inspect.y + 1 < dims.height ? displayCells[(inspect.y + 1) * model.width + inspect.x] : VOID_STATE;
    if (ex) ecaExplanation = { ex, sourceGeneration: firstGeneration + inspect.y, observed: below === VOID_STATE ? null : below };
  }
  const summary = metrics
    ? `Generation ${status.generation}. ${metrics.counts[1]} of ${n} cells alive.`
    : `Generation 0. ${model.initial.reduce((a, b) => a + b, 0)} of ${n} cells alive.`;

  const saveLabel =
    save.kind === 'saved'
      ? `Saved ${save.at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
      : save.kind === 'saving'
        ? 'Saving…'
        : save.kind === 'unsaved'
          ? 'Unsaved changes'
          : 'Save failed';

  return (
    <div className="workspace">
      <div className="toolbar" role="toolbar" aria-label="Simulation and editing">
        <div className="toolbar-group">
          <a className="btn btn-sm btn-ghost btn-icon" href="#/" aria-label="Back to models" title="Back to models">
            <ArrowLeft size={16} aria-hidden />
          </a>
          {running ? (
            <button className="btn btn-accent" onClick={() => sim.pause()} title="Pause (Space)">
              <Pause size={16} aria-hidden />
              Pause
            </button>
          ) : (
            <button className="btn btn-primary" onClick={play} disabled={!executable || status.runState === 'loading'} title="Play (Space)">
              <Play size={16} aria-hidden />
              Play
            </button>
          )}
          <button className="btn" onClick={() => doStep(1)} disabled={!executable || running} title="Advance exactly one generation (N)">
            <StepForward size={16} aria-hidden />
            Step
          </button>
          <label className="sr-only" htmlFor="stepn">
            Generations to advance
          </label>
          <input
            id="stepn"
            className="input input-sm tabular"
            style={{ width: 64 }}
            type="number"
            min={1}
            max={100000}
            value={stepN}
            onChange={(e) => setStepN(Math.max(1, Math.min(100000, Math.floor(Number(e.target.value)) || 1)))}
          />
          <button className="btn btn-sm" onClick={() => doStep(stepN)} disabled={!executable || running} title={`Advance exactly ${stepN} generations`}>
            <SkipForward size={14} aria-hidden />
            Step {stepN}
          </button>
          <button className="btn" onClick={doReset} disabled={!executable || (atZero && !running)} title="Restore generation 0">
            <RotateCcw size={16} aria-hidden />
            Reset
          </button>
        </div>
        <div className="toolbar-group">
          <label className="label" htmlFor="rate">
            Speed
          </label>
          <input
            id="rate"
            type="range"
            min={0}
            max={7}
            step={1}
            value={[1, 2, 5, 10, 20, 30, 60, 120].indexOf(rate)}
            onChange={(e) => setRate([1, 2, 5, 10, 20, 30, 60, 120][Number(e.target.value)])}
            aria-valuetext={`${rate} generations per second`}
          />
          <span className="hint tabular" style={{ minWidth: 52 }}>
            {rate} gen/s
          </span>
        </div>
        <span className="toolbar-sep" aria-hidden />
        <div className="toolbar-group" role="group" aria-label="Tool">
          {(
            [
              ['paint', Brush, 'Paint (B)'],
              ['erase', Eraser, 'Erase (E)'],
              ['inspect', Search, 'Inspect (I)'],
              ['pan', Hand, 'Pan (H)'],
              ...(oneD ? [] : ([['select', SquareDashed, 'Select region (S)']] as const)),
              ...(model.rule.id === 'life-like/v1' ? ([['stamp', Stamp, 'Stamp pattern (T)']] as const) : []),
            ] as const
          ).map(([t, Icon, label]) => (
            <button key={t} className="btn btn-sm btn-icon" aria-pressed={tool === t} aria-label={label} title={label} onClick={() => setTool(t)}>
              <Icon size={15} aria-hidden />
            </button>
          ))}
        </div>
        <div className="toolbar-group">
          <button className="btn btn-sm btn-icon" onClick={undo} disabled={!history.current.canUndo || running} aria-label="Undo" title="Undo (Ctrl/⌘ Z)">
            <Undo2 size={15} aria-hidden />
          </button>
          <button className="btn btn-sm btn-icon" onClick={redo} disabled={!history.current.canRedo || running} aria-label="Redo" title="Redo (Ctrl/⌘ Shift Z)">
            <Redo2 size={15} aria-hidden />
          </button>
          <button
            className="btn btn-sm btn-icon"
            onClick={() => (canEdit ? commit({ ...cloneModel(model), initial: new Uint8Array(n) }) : explainEditBlock())}
            disabled={running}
            aria-label="Clear all cells"
            title="Clear all cells"
          >
            <Trash2 size={15} aria-hidden />
          </button>
        </div>
        <span className="toolbar-sep" aria-hidden />
        <div className="toolbar-group">
          <button className="btn btn-sm btn-icon" onClick={() => canvas.current?.zoom(1.25)} aria-label="Zoom in" title="Zoom in (+)">
            <ZoomIn size={15} aria-hidden />
          </button>
          <button className="btn btn-sm btn-icon" onClick={() => canvas.current?.zoom(0.8)} aria-label="Zoom out" title="Zoom out (−)">
            <ZoomOut size={15} aria-hidden />
          </button>
          <button className="btn btn-sm btn-icon" onClick={() => canvas.current?.fit()} aria-label="Fit to view" title="Fit (F)">
            <Maximize size={15} aria-hidden />
          </button>
          <button
            className="btn btn-sm btn-icon"
            aria-pressed={showGrid}
            onClick={() => setShowGrid((g) => !g)}
            aria-label="Show grid lines"
            title="Grid lines"
          >
            <Grid3x3 size={15} aria-hidden />
          </button>
        </div>
        <div className="toolbar-group" style={{ marginLeft: 'auto' }}>
          <span
            className={`badge ${save.kind === 'failed' ? 'badge-error' : save.kind === 'saved' ? 'badge-success' : ''}`}
            role="status"
            title={save.kind === 'failed' ? save.message : undefined}
          >
            {saveLabel}
          </span>
          <button className="btn btn-sm" onClick={() => void saveNow(model, name, 'explicit save')}>
            Save
          </button>
          <button
            className="btn btn-sm"
            onClick={() => void startExperiment()}
            disabled={!executable || running}
            title="Design replications or a parameter sweep on the current revision"
          >
            <FlaskConical size={14} aria-hidden />
            Experiment
          </button>
          <button
            className="btn btn-sm"
            onClick={() => void startComparison()}
            disabled={running}
            title="Duplicate this model as an alternative and compare the two"
          >
            <ArrowLeftRight size={14} aria-hidden />
            Compare
          </button>
          <button
            className="btn btn-sm"
            onClick={() => downloadText(`${safeFilename(name)}.ca.json`, exportModelJson({ ...model, name }, projectId, revisionId))}
          >
            <Download size={14} aria-hidden />
            Export
          </button>
          <button className="btn btn-sm" onClick={() => void exportPng()} disabled={running} title="Picture of the current generation with legend and caption">
            <ImageDown size={14} aria-hidden />
            PNG
          </button>
          {model.rule.id === 'life-like/v1' && (
            <button className="btn btn-sm" onClick={exportRle} title="Export generation 0 as binary RLE (cells and rule only)">
              <Download size={14} aria-hidden />
              RLE
            </button>
          )}
        </div>
      </div>

      <div className="ws-body">
        {/* ---- Left: model definition ---- */}
        <aside className="ws-panel left" aria-label="Model">
          <section className="ws-section">
            <div className="field">
              <label className="label" htmlFor="model-name">
                Model name
              </label>
              <input id="model-name" className="input" value={name} maxLength={200} onChange={(e) => setName(e.target.value)} />
            </div>
          </section>
          {oneD ? (
            <ElementaryRuleSection
              ruleNumber={(model.rule as { ruleNumber: number }).ruleNumber}
              disabled={running}
              onChange={(rule) => commit({ ...cloneModel(model), rule })}
            />
          ) : (
            <FamilySection model={model} disabled={running} onRule={changeRule} />
          )}
          {!oneD && (
            <StatesSection
              model={model}
              palette={palette}
              counts={metrics?.counts ?? null}
              brush={Math.min(brush, model.stateCount - 1)}
              disabled={running}
              onBrush={(s) => {
                setBrush(s);
                if (tool !== 'paint') setTool('paint');
              }}
              onLabels={(stateLabels) => commit({ ...cloneModel(model), stateLabels })}
            />
          )}
          {needsStream(model) && <StreamSection seed={runSeed} disabled={running} onSeed={changeSeed} />}
          <BoundarySection model={model} disabled={running} onChange={(boundary) => commit({ ...cloneModel(model), boundary })} />
          <SizeSection
            model={model}
            disabled={running}
            onApply={(w, h) => {
              const r = resizeCentered(model.initial, model.width, model.height, w, h);
              commit({ ...cloneModel(model), width: w, height: h, initial: r.cells });
              setInspect(null);
              setSelection(null);
            }}
          />
          {!oneD && (
            <>
              {model.rule.id === 'life-like/v1' && (
                <PatternSection
                  pattern={pattern}
                  clipboard={clipboard}
                  active={tool === 'stamp'}
                  disabled={running}
                  modelRule={model.rule.id === 'life-like/v1' ? model.rule : null}
                  onChoose={(p) => {
                    setPattern(p);
                    setTool('stamp');
                  }}
                  onTransform={transformPattern}
                  onActivate={() => setTool('stamp')}
                  onLoaded={(p, note) => {
                    setClipboard(p);
                    setPattern(p);
                    setTool('stamp');
                    toast(note ? 'info' : 'success', note ?? `Loaded “${p.name}” (${p.width} × ${p.height}). Click the lattice to place it.`);
                  }}
                  onError={(m) => toast('error', `The RLE file was not loaded. ${m}`)}
                />
              )}
              <SelectionSection
                selection={selection}
                disabled={running}
                hasClipboard={!!clipboard}
                onCopy={() => copySelection(false)}
                onCut={() => copySelection(true)}
                onDelete={() => selection && applyCells(fillRect(model.initial, model.width, selection, 0), 'Selection cleared.')}
                onFill={() => selection && applyCells(fillRect(model.initial, model.width, selection, 1), 'Selection filled.')}
                onPaste={paste}
                onDeselect={() => setSelection(null)}
              />
            </>
          )}
          <RandomSection key={model.stateCount} disabled={running} inSelection={!oneD && !!selection} stateLabels={model.stateLabels} onApply={applyRandom} />
          <section className="ws-section" aria-labelledby="val-h">
            <h4 id="val-h">Validation</h4>
            {issues.length === 0 ? (
              <p className="hint" style={{ margin: 0 }}>
                No problems found. The model is valid and runnable in this build.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {issues.map((i, k) => (
                  <div key={k} className="issue" data-severity={i.severity}>
                    <CircleAlert size={15} aria-hidden style={{ flex: 'none', marginTop: 2 }} />
                    <div>
                      <div>{i.message}</div>
                      {i.consequence && <div className="hint">{i.consequence}</div>}
                      {i.suggestion && <div className="hint">{i.suggestion}</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </aside>

        {/* ---- Center: lattice ---- */}
        <section className="ws-center" aria-label="Lattice">
          {save.kind === 'failed' && (
            <Callout kind="error" title="Not saved">
              <p>{save.message}</p>
              <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                <button
                  className="btn btn-sm"
                  onClick={() => downloadText(`${safeFilename(name)}.ca.json`, exportModelJson({ ...model, name }, projectId, revisionId))}
                >
                  Export this model now
                </button>
                <button className="btn btn-sm" onClick={() => void saveNow(model, name, 'retry')}>
                  Try saving again
                </button>
              </div>
            </Callout>
          )}
          {notice && (
            <Callout kind="warning">
              <p>{notice}</p>
              {!running && !atZero && notice.startsWith('Cell edits') && (
                <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                  <button className="btn btn-sm" onClick={doReset}>
                    Reset to generation 0
                  </button>
                  <button
                    className="btn btn-sm"
                    onClick={() => {
                      const cells = currentCells();
                      commit({ ...cloneModel(model), initial: cells });
                      setNotice(null);
                      toast('success', `Generation ${status.generation} is now the initial condition.`);
                    }}
                  >
                    Use current state as initial condition
                  </button>
                </div>
              )}
            </Callout>
          )}
          <GridCanvas
            ref={canvas}
            width={dims.width}
            height={dims.height}
            stateLabels={model.stateLabels}
            palette={palette}
            tool={tool}
            showGrid={showGrid}
            initialCamera={initialView}
            inspect={inspect}
            defaultCursor={oneD ? { x: model.width >> 1, y: Math.max(0, status.generation - firstGeneration) } : undefined}
            summary={summary}
            getCells={getCells}
            onStrokeStart={onStrokeStart}
            onStrokeCells={onStrokeCells}
            onStrokeEnd={onStrokeEnd}
            onInspect={setInspect}
            onToggleCell={toggleCell}
            onHover={setHover}
            stampPattern={!oneD && tool === 'stamp' ? pattern : null}
            selection={oneD ? null : selection}
            onSelect={(r) => setSelection(r)}
            onStamp={onStamp}
            onCameraChange={(c) => {
              cameraRef.current = { ...c, showGrid };
              if (save.kind === 'saved') void saveProject(projectId, { ...model, name }, cameraRef.current, 'view').catch(() => {});
            }}
          />
          <div className="canvas-status" aria-hidden>
            <span>
              Generation <strong>{status.generation}</strong>
            </span>
            <span>{oneD ? `${model.width} cells · each row is one generation, time runs down` : `${model.width} × ${model.height}`}</span>
            {oneD && firstGeneration > 0 && (
              <span>
                Showing generations {firstGeneration}–{firstGeneration + dims.height - 1}; earlier rows are not kept
              </span>
            )}
            <span>{hover ? (oneD ? `Cell ${hover.x}, generation ${firstGeneration + hover.y}` : `Cell (${hover.x}, ${hover.y})`) : 'Hover a cell'}</span>
            <span>
              {tool === 'inspect'
                ? 'Click a cell to explain its next transition'
                : tool === 'pan'
                  ? 'Drag to pan'
                  : tool === 'select'
                    ? 'Drag a rectangle · Ctrl/⌘ C copy · X cut · Delete clear · Esc deselect'
                    : tool === 'stamp'
                      ? `Click to place ${pattern.name} · R rotate · M mirror`
                      : oneD
                        ? 'Paint the top row (generation 0) · wheel to zoom'
                        : 'Drag to paint · Space-drag or right-drag to pan · wheel to zoom'}
            </span>
          </div>
          <AnalyticsPanel
            model={model}
            name={name}
            rows={sim.series.current}
            version={sim.seriesInfo.version}
            truncatedAt={sim.seriesInfo.truncatedAt}
            runId={sim.seriesInfo.sessionId}
            modelHash={hash}
            open={analyticsOpen}
            onToggle={() => setAnalyticsOpen((o) => !o)}
          />
          <div className="sr-only" aria-live="polite">
            {announce}
          </div>
        </section>

        {/* ---- Right: run status, inspector, metrics ---- */}
        <aside className="ws-panel right" aria-label="Inspector">
          <section className="ws-section">
            <h4>Run</h4>
            <table className="data" style={{ fontSize: 12 }}>
              <tbody>
                <tr>
                  <td>Status</td>
                  <td>
                    {status.runState === 'running' ? (
                      <Badge tone="accent">Running</Badge>
                    ) : status.runState === 'replaying' ? (
                      <Badge tone="accent">Replaying</Badge>
                    ) : status.runState === 'error' ? (
                      <Badge tone="error">Error</Badge>
                    ) : !executable ? (
                      <Badge tone="warning">Not runnable</Badge>
                    ) : (
                      <Badge>Paused</Badge>
                    )}
                  </td>
                </tr>
                <tr>
                  <td>Generation</td>
                  <td className="tabular">{status.generation}</td>
                </tr>
                <tr>
                  <td>Rule</td>
                  <td>
                    <code>{ruleText}</code> {ruleName && <span className="hint">({ruleName})</span>}
                  </td>
                </tr>
                <tr>
                  <td>Boundary</td>
                  <td>{model.boundary.kind === 'periodic' ? 'Periodic (torus)' : `Fixed exterior: ${model.stateLabels[model.boundary.state]}`}</td>
                </tr>
                <tr>
                  <td>Update</td>
                  <td>Synchronous</td>
                </tr>
                {stochastic && (
                  <tr>
                    <td>Stream</td>
                    <td>
                      Seed <code>{runSeed}</code>, 2 draws per cell
                    </td>
                  </tr>
                )}
                <tr>
                  <td>Speed</td>
                  <td className="tabular">
                    {rate} gen/s requested{running && status.achievedRate !== null ? `, ${status.achievedRate.toFixed(1)} achieved` : ''}
                  </td>
                </tr>
                <tr>
                  <td>Engine</td>
                  <td>CPU worker · Canvas 2D</td>
                </tr>
              </tbody>
            </table>
            {status.error && (
              <div style={{ marginTop: 8 }}>
                <Callout kind="error" title="Simulation stopped">
                  <p>{status.error.message}</p>
                </Callout>
              </div>
            )}
          </section>

          <section className="ws-section" aria-labelledby="insp-h">
            <h4 id="insp-h">Cell inspector</h4>
            {ecaExplanation ? (
              <EcaExplanationView model={model} data={ecaExplanation} tokens={tokens} />
            ) : multiExplanation ? (
              <MultistateInspector
                model={model}
                ex={multiExplanation}
                generation={status.generation}
                palette={palette}
                stochastic={stochastic}
                observed={sim.observed}
              />
            ) : !explanation ? (
              <p className="hint" style={{ margin: 0 }}>
                {capabilityFor(model.rule.id)?.executable ? (
                  <>
                    Choose the Inspect tool (<kbd>I</kbd>) and click a cell, or focus the lattice and use the arrow keys.
                  </>
                ) : (
                  'Transition explanations are available for runnable rule families.'
                )}
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div className="hint">
                  Cell ({explanation.x}, {explanation.y}) at generation {status.generation}
                </div>
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <div className="stencil" role="table" aria-label="Moore neighborhood">
                    {[-1, 0, 1].flatMap((dy) =>
                      [-1, 0, 1].map((dx) => {
                        if (dx === 0 && dy === 0) {
                          return (
                            <div
                              key="c"
                              role="cell"
                              className="center"
                              style={{
                                background: explanation.current ? tokens['sim-alive'] : tokens['sim-dead'],
                                color: explanation.current ? 'var(--bg-elevated)' : 'var(--text-muted)',
                              }}
                              aria-label={`Center: ${model.stateLabels[explanation.current]}`}
                            >
                              {explanation.current}
                            </div>
                          );
                        }
                        const s = explanation.samples.find((q) => q.dx === dx && q.dy === dy)!;
                        const desc =
                          s.source === null ? 'exterior' : s.wrapped ? `wrapped from (${s.source.x}, ${s.source.y})` : `(${s.source.x}, ${s.source.y})`;
                        return (
                          <div
                            key={`${dx},${dy}`}
                            role="cell"
                            className={s.source === null ? 'exterior' : undefined}
                            style={{
                              background: s.state ? tokens['sim-alive'] : tokens['sim-dead'],
                              color: s.state ? 'var(--bg-elevated)' : 'var(--text-muted)',
                            }}
                            title={desc}
                            aria-label={`${model.stateLabels[s.state]}, ${desc}`}
                          >
                            {s.state}
                            {s.wrapped ? '↻' : s.source === null ? '·' : ''}
                          </div>
                        );
                      }),
                    )}
                  </div>
                  <div style={{ fontSize: 13 }}>
                    <div>
                      Live neighbors: <strong className="tabular">{explanation.liveNeighbors}</strong>
                    </div>
                    <div>
                      Now: <strong>{model.stateLabels[explanation.current]}</strong>
                    </div>
                    <div>
                      Next: <strong>{model.stateLabels[explanation.next]}</strong>
                    </div>
                  </div>
                </div>
                <div className="callout">
                  <Info aria-hidden />
                  <div>
                    <p>
                      <strong>{explanation.clause}.</strong>
                    </p>
                    <p>{explanation.summary} The next state depends only on this cell’s old state and its old neighbor count.</p>
                  </div>
                </div>
                {explanation.samples.some((s) => s.source === null || s.wrapped) && (
                  <p className="hint" style={{ margin: 0 }}>
                    {model.boundary.kind === 'periodic'
                      ? '↻ marks neighbors read from the opposite edge (periodic boundary).'
                      : '· and dashed borders mark exterior samples supplied by the fixed boundary.'}
                  </p>
                )}
              </div>
            )}
          </section>

          <section className="ws-section" aria-labelledby="met-h">
            <h4 id="met-h">Measurements</h4>
            {metrics ? (
              <>
                <div className="kpi-grid">
                  {(model.stateCount === 2 ? [1, 0] : model.stateLabels.map((_, i) => i)).map((st) => (
                    <Kpi key={st} label={model.stateLabels[st]} swatch={palette[st]} value={metrics.counts[st]} detail={pct(metrics.counts[st] / n)} />
                  ))}
                  <Kpi
                    label="Activity"
                    value={metrics.activity === null ? '—' : pct(metrics.activity)}
                    detail={metrics.changed === null ? 'n/a at generation 0' : `${metrics.changed} cells changed`}
                  />
                  {lifeRule && (
                    <Kpi
                      label="Births / deaths"
                      value={metrics.births === null ? '—' : `${metrics.births} / ${metrics.deaths}`}
                      detail="since previous generation"
                    />
                  )}
                  {model.rule.id === 'spatial-sir/v1' && (
                    <Kpi
                      label="New infections"
                      value={metrics.incidence === null ? '—' : metrics.incidence}
                      detail={metrics.incidence === null ? 'n/a at generation 0' : 'S → I in the last step'}
                    />
                  )}
                  {model.stateCount > 2 && (
                    <Kpi
                      label="Entropy"
                      value={`${metrics.entropy.toFixed(3)} bits`}
                      detail={`${(normalizedEntropy(metrics.entropy, model.stateCount) * 100).toFixed(0)}% of log₂${model.stateCount}`}
                    />
                  )}
                  {model.rule.id === 'elementary/v1' && model.rule.ruleNumber === 184 && (
                    <Kpi
                      label="Flow"
                      value={metrics.flow === null ? '—' : metrics.flow.toFixed(3)}
                      detail={
                        metrics.flow === null
                          ? model.boundary.kind === 'periodic'
                            ? 'n/a at generation 0'
                            : 'needs a periodic ring'
                          : 'moves per cell per generation'
                      }
                    />
                  )}
                </div>
                <p className="hint" style={{ margin: '8px 0 0' }}>
                  Activity is the fraction of all {n} sites whose state changed in the last generation. Equal population does not mean an unchanged grid.
                  {model.rule.id === 'elementary/v1' &&
                    model.rule.ruleNumber === 184 &&
                    ' For traffic, density is the fraction of cells holding a car; flow counts cars that moved, divided by road length.'}
                  {model.stateCount > 2 && ' Entropy describes the mix of states only, not how they are arranged in space.'}
                </p>
              </>
            ) : (
              <p className="hint" style={{ margin: 0 }}>
                Measurements appear once the model is runnable.
              </p>
            )}
          </section>

          {executable && (
            <HistorySection
              generation={status.generation}
              runState={status.runState}
              history={sim.history}
              onSeek={(g) => {
                setNotice(null);
                sim.seek(g);
              }}
              onCancel={() => sim.pause()}
            />
          )}

          <ProvenanceSection projectId={projectId} activeRevisionId={revisionId} />

          <section className="ws-section">
            <h4>Shortcuts</h4>
            <p className="hint" style={{ margin: 0, lineHeight: 1.9 }}>
              <kbd>Space</kbd> play/pause · <kbd>N</kbd> step · <kbd>F</kbd> fit · <kbd>B</kbd>/<kbd>E</kbd>/<kbd>I</kbd>/<kbd>H</kbd>
              {!oneD && (
                <>
                  /<kbd>S</kbd>/<kbd>T</kbd>
                </>
              )}{' '}
              paint, erase, inspect, pan{!oneD && ', select, stamp'}
              {!oneD && (
                <>
                  {' '}
                  · <kbd>R</kbd>/<kbd>M</kbd> rotate/mirror stamp · <kbd>Ctrl/⌘ C</kbd>/<kbd>X</kbd>/<kbd>V</kbd> copy, cut, paste
                </>
              )}{' '}
              · <kbd>Ctrl/⌘ Z</kbd> undo · <kbd>Esc</kbd> inspect tool
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}

function BoundarySection({ model, disabled, onChange }: { model: Model; disabled: boolean; onChange(b: Boundary): void }) {
  const value = model.boundary.kind === 'periodic' ? 'periodic' : `fixed-${model.boundary.state}`;
  return (
    <section className="ws-section" aria-labelledby="bnd-h">
      <h4 id="bnd-h">Boundary</h4>
      <div className="field">
        <label className="label" htmlFor="boundary">
          Off-grid neighbors
        </label>
        <select
          id="boundary"
          className="select"
          value={value}
          disabled={disabled}
          onChange={(e) =>
            onChange(e.target.value === 'periodic' ? { kind: 'periodic' } : { kind: 'fixed-exterior', state: Number(e.target.value.split('-')[1]) })
          }
        >
          <option value="periodic">Periodic — wrap to the opposite edge (torus)</option>
          {model.stateLabels.map((l, s) => (
            <option key={s} value={`fixed-${s}`}>
              Fixed exterior — always {l.toLowerCase()}
            </option>
          ))}
        </select>
        <span className="hint">
          {model.boundary.kind === 'periodic'
            ? 'Patterns leaving one edge re-enter on the opposite edge.'
            : 'Neighbors outside the grid read a constant state. Edge cells still update normally; they are not frozen.'}
        </span>
      </div>
    </section>
  );
}

function SizeSection({ model, disabled, onApply }: { model: Model; disabled: boolean; onApply(w: number, h: number): void }) {
  const [w, setW] = useState(String(model.width));
  const [h, setH] = useState(String(model.height));
  useEffect(() => {
    setW(String(model.width));
    setH(String(model.height));
  }, [model.width, model.height]);
  const oneD = isOneDimensional(model.rule);
  const nw = Number(w),
    nh = oneD ? 1 : Number(h);
  const [lo, hi] = oneD ? [LIMITS.minWidth1d, LIMITS.maxWidth1d] : [LIMITS.minSize2d, LIMITS.maxSize2d];
  const valid = [nw, ...(oneD ? [] : [nh])].every((v) => Number.isInteger(v) && v >= lo && v <= hi);
  const changed = valid && (nw !== model.width || nh !== model.height);
  const lost = changed ? resizeCentered(model.initial, model.width, model.height, nw, nh).lost : 0;
  return (
    <section className="ws-section" aria-labelledby="size-h">
      <h4 id="size-h">Lattice size</h4>
      <div className="field-row">
        <div className="field">
          <label className="label" htmlFor="w">
            Width
          </label>
          <input
            id="w"
            className="input tabular"
            type="number"
            min={lo}
            max={hi}
            value={w}
            disabled={disabled}
            onChange={(e) => setW(e.target.value)}
            aria-invalid={!valid}
          />
        </div>
        {!oneD && (
          <div className="field" style={{ marginTop: 0 }}>
            <label className="label" htmlFor="h">
              Height
            </label>
            <input
              id="h"
              className="input tabular"
              type="number"
              min={LIMITS.minSize2d}
              max={LIMITS.maxSize2d}
              value={h}
              disabled={disabled}
              onChange={(e) => setH(e.target.value)}
              aria-invalid={!valid}
            />
          </div>
        )}
      </div>
      <p className="hint" style={{ margin: '6px 0 8px' }}>
        {!valid
          ? `Use whole numbers from ${lo} to ${hi}.`
          : changed
            ? `Resizes around the center to ${oneD ? `${nw} cells` : `${nw} × ${nh}`}, padding with ${model.stateLabels[0].toLowerCase()} cells.${lost ? ` ${lost} nonzero cell${lost === 1 ? '' : 's'} will be cropped.` : ''}`
            : oneD
              ? `${model.width} cells in one row; the view keeps the latest ${displayDims(model).height} generations.`
              : `${model.width * model.height} cells.`}
      </p>
      {changed && (
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-sm btn-primary" disabled={disabled} onClick={() => onApply(nw, nh)}>
            Apply size
          </button>
          <button
            className="btn btn-sm"
            onClick={() => {
              setW(String(model.width));
              setH(String(model.height));
            }}
          >
            Cancel
          </button>
        </div>
      )}
    </section>
  );
}

function ElementaryRuleSection({ ruleNumber, disabled, onChange }: { ruleNumber: number; disabled: boolean; onChange(rule: Model['rule']): void }) {
  const [draft, setDraft] = useState(String(ruleNumber));
  useEffect(() => setDraft(String(ruleNumber)), [ruleNumber]);
  const set = (r: number) => onChange({ id: 'elementary/v1', ruleNumber: r });
  const n = Number(draft);
  const valid = draft.trim() !== '' && Number.isInteger(n) && n >= 0 && n <= 255;
  const apply = () => {
    if (valid && n !== ruleNumber) set(n);
    else if (!valid) setDraft(String(ruleNumber));
  };
  return (
    <section className="ws-section" aria-labelledby="rule-h">
      <h4 id="rule-h">Rule</h4>
      <div className="field">
        <label className="label" htmlFor="eca-named">
          Named rules
        </label>
        <select
          id="eca-named"
          className="select"
          disabled={disabled}
          value={NAMED_ECA_RULES[ruleNumber] ? ruleNumber : ''}
          onChange={(e) => e.target.value !== '' && set(Number(e.target.value))}
        >
          {Object.entries(NAMED_ECA_RULES).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
          {!NAMED_ECA_RULES[ruleNumber] && <option value="">Rule {ruleNumber}</option>}
        </select>
      </div>
      <div className="field">
        <label className="label" htmlFor="eca-number">
          Rule number (0–255)
        </label>
        <input
          id="eca-number"
          className="input tabular"
          type="number"
          min={0}
          max={255}
          value={draft}
          disabled={disabled}
          aria-invalid={!valid}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={apply}
          onKeyDown={(e) => e.key === 'Enter' && apply()}
        />
      </div>
      <div className="field">
        <span className="label" id="eca-bits-label">
          Output for each neighborhood (left, center, right)
        </span>
        <div className="eca-bits" role="group" aria-labelledby="eca-bits-label">
          {ECA_PATTERNS_DISPLAY.map((p) => {
            const out = (ruleNumber >>> p) & 1;
            const bits = patternBits(p);
            return (
              <button
                key={p}
                type="button"
                className="eca-bit"
                disabled={disabled}
                onClick={() => set(toggleBit(ruleNumber, p))}
                aria-label={`Neighborhood ${bits.join('')} gives ${out}. Toggle.`}
                title={`Pattern ${p}: toggle output`}
              >
                <span className="eca-pattern" aria-hidden>
                  {bits.map((b, i) => (
                    <span key={i} data-on={b} />
                  ))}
                </span>
                <span className="eca-out" data-on={out} aria-hidden />
                <span className="eca-digit" aria-hidden>
                  {out}
                </span>
              </button>
            );
          })}
        </div>
        <span className="hint">
          Reading the outputs from <code>111</code> to <code>000</code> gives the rule in binary: <code>{ruleNumber.toString(2).padStart(8, '0')}</code> ={' '}
          {ruleNumber}. Click a neighborhood to flip its output.
        </span>
      </div>
    </section>
  );
}

function EcaExplanationView({
  model,
  data,
  tokens,
}: {
  model: Model;
  data: { ex: NonNullable<ReturnType<typeof explainElementary>>; sourceGeneration: number; observed: number | null };
  tokens: Record<'sim-dead' | 'sim-alive', string>;
}) {
  const { ex, sourceGeneration, observed } = data;
  const cell = (state: number, label: string, extra?: string) => (
    <div
      className={extra}
      style={{ background: state ? tokens['sim-alive'] : tokens['sim-dead'], color: state ? 'var(--bg-elevated)' : 'var(--text-muted)' }}
      aria-label={label}
      role="cell"
    >
      {state}
    </div>
  );
  const sideLabel = (s: typeof ex.left, name: string) =>
    `${name}: ${s.state}, ${s.source === null ? 'exterior (fixed boundary)' : s.wrapped ? `wrapped from cell ${s.source}` : `cell ${s.source}`}`;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="hint">
        Cell {ex.x}: generation {sourceGeneration} → {sourceGeneration + 1}
      </div>
      <div className="stencil" style={{ width: 132 }} role="table" aria-label="Neighborhood and result">
        {cell(ex.left.state, sideLabel(ex.left, 'Left'), ex.left.source === null ? 'exterior' : undefined)}
        {cell(ex.center, `Center: ${ex.center}`, 'center')}
        {cell(ex.right.state, sideLabel(ex.right, 'Right'), ex.right.source === null ? 'exterior' : undefined)}
        <div style={{ border: 0 }} aria-hidden />
        {cell(ex.next, `Next: ${ex.next}`)}
        <div style={{ border: 0 }} aria-hidden />
      </div>
      <div className="callout">
        <Info aria-hidden />
        <div>
          <p>{ex.summary}</p>
        </div>
      </div>
      {observed !== null && observed !== ex.next && (
        <Callout kind="error">
          <p>The row below shows {observed}, which does not match the rule. Please report this as a bug.</p>
        </Callout>
      )}
      {(ex.left.wrapped || ex.right.wrapped || ex.left.source === null || ex.right.source === null) && (
        <p className="hint" style={{ margin: 0 }}>
          {model.boundary.kind === 'periodic'
            ? 'This edge cell reads its missing neighbor from the opposite end of the ring.'
            : 'This edge cell reads its missing neighbor from the fixed exterior (dashed).'}
        </p>
      )}
    </div>
  );
}
