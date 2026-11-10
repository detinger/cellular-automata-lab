import { useCallback, useEffect, useRef, useState } from 'react';
import { Copy, FilePlus2, FolderOpen, Trash2, Upload } from 'lucide-react';
import { PRESETS, blankElementary, blankModel } from '../../data/presets';
import { importModelJson } from '../../interchange/modelJson';
import { createProject, db, deleteProject, describeStorageError, duplicateProject, type ProjectRecord } from '../../storage/db';
import { navigate } from '../../app/router';
import { Badge, Callout, EmptyState, useToast } from '../../components/ui';
import type { ValidationIssue } from '../../domain/contracts/validation';
import { GridPreview } from './GridPreview';
import { parseRle, modelFromRle, MAX_RLE_BYTES, type RlePattern } from '../../interchange/rle';
import { formatLifeLike, parseLifeLike, type LifeLikeRule } from '../../domain/rules/lifeLike';

const rleIssue = (path: string, message: string): ValidationIssue => ({ code: 'import.rle', severity: 'error', category: 'schema', path, message });

const PRESET_MODELS = PRESETS.map((p) => ({ p, m: p.build() }));

export function LibraryPage() {
  const toast = useToast();
  const [projects, setProjects] = useState<ProjectRecord[] | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [importIssues, setImportIssues] = useState<ValidationIssue[] | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [pendingRle, setPendingRle] = useState<{ pattern: RlePattern; file: string } | null>(null);
  const [rleRule, setRleRule] = useState('B3/S23');

  const refresh = useCallback(async () => {
    try {
      await db.open(); // surfaces version and availability errors instead of waiting
      setProjects(await db.projects.orderBy('updatedAt').reverse().toArray());
    } catch (e) {
      setStorageError(describeStorageError(e));
      setProjects([]);
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const open = async (make: () => Promise<string>) => {
    try {
      navigate(`/project/${await make()}`);
    } catch (e) {
      toast('error', `Could not create the project: ${(e as Error).message}`);
    }
  };

  const importRle = async (p: RlePattern, file: string, rule: LifeLikeRule) => {
    const m = modelFromRle(p, rule, file.replace(/\.rle$/i, ''));
    setPendingRle(null);
    toast(
      'info',
      `Imported ${p.width} × ${p.height} cells onto a ${m.width} × ${m.height} lattice with a dead fixed boundary. RLE does not store size or boundary; change them in the workspace.`,
    );
    await open(() => createProject(m, `import:${file}`, 'imported'));
  };

  const onImport = async (file: File) => {
    setImportIssues(null);
    setPendingRle(null);
    if (file.size > MAX_RLE_BYTES) {
      setImportIssues([rleIssue('', 'The file exceeds the 32 MiB import limit.')]);
      return;
    }
    const text = await file.text();
    if (/\.rle$/i.test(file.name) || !text.trimStart().startsWith('{')) {
      const r = parseRle(text);
      if (!r.ok) {
        setImportIssues([rleIssue(r.line ? `line ${r.line}` : '', r.message)]);
        return;
      }
      if (r.pattern.rule) await importRle(r.pattern, file.name, r.pattern.rule);
      else setPendingRle({ pattern: r.pattern, file: file.name });
      return;
    }
    const result = importModelJson(text);
    if (!result.ok) {
      setImportIssues(result.issues);
      return;
    }
    await open(() => createProject(result.model, `import:${file.name}`, 'imported'));
  };

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <div className="eyebrow">Cellular Automata Studio</div>
          <h1>Models</h1>
          <p>
            Open a verified example or start from a blank 2D lattice or 1D elementary CA. Models are saved in this browser; export a <code>.ca.json</code> file
            to keep or share one. Import accepts <code>.ca.json</code> and binary <code>.rle</code> patterns.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn" onClick={() => fileInput.current?.click()}>
            <Upload size={16} aria-hidden />
            Import model
          </button>
          <button className="btn" onClick={() => open(() => createProject(blankElementary(), 'blank'))}>
            <FilePlus2 size={16} aria-hidden />
            New elementary CA
          </button>
          <button className="btn btn-primary" onClick={() => open(() => createProject(blankModel(), 'blank'))}>
            <FilePlus2 size={16} aria-hidden />
            New 2D Life-like model
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".json,.ca.json,.rle,application/json,text/plain"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void onImport(f);
            }}
          />
        </div>
      </header>

      {importIssues && (
        <div style={{ marginBottom: 20 }}>
          <Callout kind="error" title="The file was not imported">
            <p>Your existing projects are unchanged. Fix these problems and import again:</p>
            <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
              {importIssues.map((i, k) => (
                <li key={k}>
                  <code>{i.path || '/'}</code> — {i.message}
                </li>
              ))}
            </ul>
          </Callout>
        </div>
      )}
      {pendingRle &&
        (() => {
          const parsed = parseLifeLike(rleRule);
          return (
            <div style={{ marginBottom: 20 }}>
              <Callout kind="info" title={`Choose a rule for ${pendingRle.file}`}>
                <p>
                  This RLE file ({pendingRle.pattern.width} × {pendingRle.pattern.height}) does not declare a rule. Pick the rule to run it with before
                  importing.
                </p>
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap', marginTop: 8 }}>
                  <div className="field">
                    <label className="label" htmlFor="rle-rule">
                      Rule (B/S notation)
                    </label>
                    <input
                      id="rle-rule"
                      className="input"
                      style={{ fontFamily: 'var(--font-mono)', width: 140 }}
                      value={rleRule}
                      onChange={(e) => setRleRule(e.target.value)}
                      aria-invalid={!parsed.ok}
                    />
                  </div>
                  <button className="btn btn-sm" onClick={() => setRleRule('B3/S23')}>
                    Life (B3/S23)
                  </button>
                  <button
                    className="btn btn-sm btn-primary"
                    disabled={!parsed.ok}
                    onClick={() => parsed.ok && void importRle(pendingRle.pattern, pendingRle.file, parsed.rule)}
                  >
                    Import with {parsed.ok ? formatLifeLike(parsed.rule) : 'this rule'}
                  </button>
                  <button className="btn btn-sm btn-ghost" onClick={() => setPendingRle(null)}>
                    Cancel
                  </button>
                </div>
                {!parsed.ok && (
                  <p className="hint" style={{ marginTop: 6 }}>
                    {parsed.message}
                  </p>
                )}
              </Callout>
            </div>
          );
        })()}
      {storageError && (
        <div style={{ marginBottom: 20 }}>
          <Callout kind="warning" title="Local storage is unavailable">
            <p>{storageError} You can still open examples, but saving will fail; use Export to keep your work.</p>
          </Callout>
        </div>
      )}

      <section aria-labelledby="examples-h" style={{ marginBottom: 32 }}>
        <h2 id="examples-h">Examples</h2>
        <div className="card-grid">
          {PRESET_MODELS.map(({ p, m }) => {
            return (
              <article key={p.id} className="card preview-card card-link">
                <div className="preview">
                  <GridPreview model={m} />
                </div>
                <div className="body">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <h3 style={{ margin: 0 }}>{p.name}</h3>
                    <Badge tone="primary">{p.ruleLabel}</Badge>
                  </div>
                  <p className="hint" style={{ margin: 0 }}>
                    {p.description}
                  </p>
                  <p style={{ fontSize: 13, margin: 0 }}>{p.expectedBehavior}</p>
                  <div style={{ marginTop: 'auto', paddingTop: 8 }}>
                    <button className="btn btn-sm" onClick={() => open(() => createProject(p.build(), `preset:${p.id}`, 'created', p.seed))}>
                      Open as new project
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="projects-h">
        <h2 id="projects-h">Your projects</h2>
        {projects === null ? (
          <p className="hint">Loading…</p>
        ) : projects.length === 0 ? (
          <div className="card">
            <EmptyState icon={<FolderOpen size={28} aria-hidden />} title="No saved projects yet">
              <p className="hint" style={{ margin: '0 auto' }}>
                Open an example above or create a blank model. Edits save automatically.
              </p>
            </EmptyState>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Started from</th>
                  <th>Revisions</th>
                  <th>Last saved</th>
                  <th>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {projects.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <a href={`#/project/${p.id}`}>{p.name}</a>
                    </td>
                    <td className="hint">{p.origin.replace(/^preset:/, 'Example: ').replace(/^import:/, 'Import: ')}</td>
                    <td className="num">{p.revisionIds.length}</td>
                    <td className="tabular">{new Date(p.updatedAt).toLocaleString()}</td>
                    <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                      <button
                        className="btn btn-sm btn-ghost btn-icon"
                        aria-label={`Duplicate ${p.name}`}
                        title="Duplicate"
                        onClick={async () => {
                          await duplicateProject(p.id);
                          toast('success', `Duplicated “${p.name}”.`);
                          void refresh();
                        }}
                      >
                        <Copy size={14} aria-hidden />
                      </button>
                      <button
                        className="btn btn-sm btn-ghost btn-icon btn-danger"
                        aria-label={`Delete ${p.name}`}
                        title="Delete"
                        onClick={async () => {
                          if (!confirm(`Delete “${p.name}” and all its revisions from this browser? This cannot be undone.`)) return;
                          await deleteProject(p.id);
                          void refresh();
                        }}
                      >
                        <Trash2 size={14} aria-hidden />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
