/**
 * ForgeImportModal — bring a spreadsheet into a HESTIA list.
 *
 * Preview first, always. This is the only screen in the product where one click
 * changes hundreds of a client's records, so the question it answers before the
 * Import button is live is "what is about to happen to my data" — in the row
 * numbers of the user's own file, with the reason spelled out for every row that
 * cannot come in.
 *
 * The round trip is the point: the columns this reads are the columns the export
 * writes, and the id column the export carries is what makes an edited file
 * UPDATE the records it came from instead of duplicating all of them. Say that
 * out loud in the modal, because nobody would assume it.
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import { IadmModal } from '../../components/IadmModal';
import { readSpreadsheet, SheetImportError, type Grid } from '../../lib/sheetImport';
import {
  IMPORT_BATCH, commitImport, previewImport,
  type EntityKey, type ImportPreview, type ImportResult, type ImportRow,
} from '../../lib/forgeApi';
import { Button } from './ForgeLayout';
import { FORGE_ENTITIES } from './forgeConfig';
import { describeError, useForgeApi } from './useForge';

/** Headers, however they were typed, compared on the same footing. */
const norm = (s: string) => s.trim().toLowerCase().replace(/[\s_-]+/g, ' ');

type Mapping = Record<number, string>;   // file column index -> field key ('' = ignore)

export function ForgeImportModal({
  entity, open, onClose, onImported,
}: {
  entity: EntityKey;
  open: boolean;
  onClose: () => void;
  /** The list behind the modal refreshes on anything that landed. */
  onImported: () => void;
}) {
  const cfg = FORGE_ENTITIES[entity];
  const { withParams } = useForgeApi();
  const fileInput = useRef<HTMLInputElement | null>(null);

  const [fileName, setFileName] = useState<string | null>(null);
  const [grid, setGrid] = useState<Grid>([]);
  const [mapping, setMapping] = useState<Mapping>({});
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState<null | 'reading' | 'checking' | 'importing'>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);

  /* What a column can be mapped to: the entity's own fields, plus its id column,
     which is not a field (nothing may write it) but IS how a row says which
     record it is. */
  const targets = useMemo(() => ([
    { key: cfg.pk, label: `${cfg.singular} id (updates an existing record)` },
    ...cfg.fields.map((f) => ({ key: f.key, label: f.label })),
  ]), [cfg]);

  const reset = useCallback(() => {
    setFileName(null); setGrid([]); setMapping({});
    setPreview(null); setResult(null); setError(null); setProgress(null);
  }, []);

  const close = useCallback(() => {
    if (busy === 'importing') return;    // never mid-write
    reset();
    onClose();
  }, [busy, reset, onClose]);

  /* Auto-mapping matches the export's own headers first — an exported file maps
     with no clicks at all — then falls back to a normalised comparison so
     "Full Name", "full_name" and "FULL NAME" all land on the same field. */
  const autoMap = useCallback((headers: string[]): Mapping => {
    const byLabel = new Map(targets.map((t) => [norm(t.label), t.key]));
    const byKey = new Map(targets.map((t) => [norm(t.key), t.key]));
    const taken = new Set<string>();
    const next: Mapping = {};
    headers.forEach((h, i) => {
      const n = norm(h);
      const hit = byLabel.get(n) ?? byKey.get(n)
        ?? (n.endsWith(' id') ? byKey.get(n.replace(/ id$/, '_id')) : undefined);
      if (hit && !taken.has(hit)) { next[i] = hit; taken.add(hit); }
      else next[i] = '';
    });
    return next;
  }, [targets]);

  const onFile = useCallback(async (file: File) => {
    setBusy('reading'); setError(null); setPreview(null); setResult(null);
    try {
      const g = await readSpreadsheet(file);
      if (g.length < 2) throw new SheetImportError('That file has headers but no rows under them.');
      setGrid(g);
      setFileName(file.name);
      setMapping(autoMap(g[0]));
    } catch (e) {
      setError(e instanceof SheetImportError ? e.message : describeError(e, 'that file'));
      console.error(e);
    } finally { setBusy(null); }
  }, [autoMap]);

  /* Rows as the API wants them: field key -> value, and a BLANK cell left out
     entirely. The API reads an absent column as "leave this alone", which is
     what keeps a sheet holding three maintained columns from wiping the rest of
     a record. Sending '' instead would mean "set it to empty". */
  const rows: ImportRow[] = useMemo(() => {
    if (grid.length < 2) return [];
    return grid.slice(1).map((cells) => {
      const row: ImportRow = {};
      cells.forEach((cell, i) => {
        const key = mapping[i];
        if (!key) return;
        const v = (cell ?? '').trim();
        if (v !== '') row[key] = v;
      });
      return row;
    });
  }, [grid, mapping]);

  const mappedCount = useMemo(() => Object.values(mapping).filter(Boolean).length, [mapping]);
  const idMapped = useMemo(() => Object.values(mapping).includes(cfg.pk), [mapping, cfg.pk]);

  const check = useCallback(async () => {
    setBusy('checking'); setError(null); setResult(null);
    try {
      /* Preview the first batch. Anything past it is classified at commit time
         by the same code, and saying "we checked 500 of your 1,200 rows" is
         honest where a silent partial check is not. */
      const p = await withParams((pp) => previewImport(pp, entity, rows.slice(0, IMPORT_BATCH)));
      setPreview(p);
    } catch (e) { setError(describeError(e, 'that file')); console.error(e); }
    finally { setBusy(null); }
  }, [withParams, entity, rows]);

  const run = useCallback(async () => {
    if (busy) return;
    setBusy('importing'); setError(null);
    const totals: ImportResult = { created: 0, updated: 0, failed: 0, errors: [], ignoredColumns: [] };
    try {
      for (let i = 0; i < rows.length; i += IMPORT_BATCH) {
        const batch = rows.slice(i, i + IMPORT_BATCH);
        setProgress(rows.length > IMPORT_BATCH
          ? `Importing rows ${i + 1}–${Math.min(i + batch.length, rows.length)} of ${rows.length}…`
          : `Importing ${rows.length} row${rows.length === 1 ? '' : 's'}…`);
        const r = await withParams((pp) => commitImport(pp, entity, batch));
        totals.created += r.created;
        totals.updated += r.updated;
        totals.failed += r.failed;
        // Row numbers stay the FILE's, not the batch's.
        totals.errors.push(...r.errors.map((e) => ({ ...e, index: e.index + i })));
        totals.ignoredColumns = r.ignoredColumns ?? totals.ignoredColumns;
      }
      setResult(totals);
      setPreview(null);
      onImported();
    } catch (e) {
      setError(describeError(e, 'the import'));
      console.error(e);
      onImported();      // whatever landed before the failure is real; show it
    } finally { setBusy(null); setProgress(null); }
  }, [busy, rows, withParams, entity, onImported]);

  const headers = grid[0] ?? [];
  const sample = grid.slice(1, 4);

  return (
    <IadmModal
      open={open}
      onClose={close}
      product="forge"
      eyebrow={`HESTIA · ${cfg.title.toUpperCase()}`}
      title={`Import ${cfg.title.toLowerCase()}`}
      subtitle="Bring a spreadsheet in. Nothing is saved until you press Import."
      size="info"
      z={60}
      footer={(
        <>
          <Button onClick={close} disabled={busy === 'importing'}>
            {result ? 'Done' : 'Cancel'}
          </Button>
          {!result && (
            <Button
              variant="primary"
              onClick={preview ? run : check}
              disabled={Boolean(busy) || !fileName || mappedCount === 0
                || (preview !== null && preview.counts.create + preview.counts.update === 0)}
            >
              {busy === 'checking' ? 'Checking…'
                : busy === 'importing' ? 'Importing…'
                  : preview
                    ? `Import ${(preview.counts.create + preview.counts.update).toLocaleString()} row${
                      preview.counts.create + preview.counts.update === 1 ? '' : 's'}`
                    : 'Check the file'}
            </Button>
          )}
        </>
      )}
    >
      <div className="space-y-4 px-5 py-4 text-sm text-slate-700">
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-700">{error}</div>
        )}

        {!fileName && !result && (
          <>
            <label className="block cursor-pointer rounded-xl border-2 border-dashed border-slate-300 px-6 py-8 text-center hover:bg-slate-50">
              <input
                ref={fileInput}
                type="file"
                accept=".csv,.tsv,.txt,.xlsx"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }}
              />
              <span className="block font-medium text-slate-900">Choose a file</span>
              <span className="mt-1 block text-slate-600">
                Excel (.xlsx) or CSV. One row per {cfg.singular.toLowerCase()}, with a header row on top.
              </span>
            </label>
            <p className="text-slate-600">
              <span className="font-medium text-slate-900">Want the exact template?</span>{' '}
              Close this and press Export CSV — the file that comes out has the headings this
              expects. Keep its <span className="font-medium">{cfg.singular} id</span> column and
              re-importing will UPDATE those records instead of adding copies of them.
            </p>
          </>
        )}

        {fileName && !result && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-slate-900">{fileName}</span>
              <span className="text-slate-500">
                — {(grid.length - 1).toLocaleString()} row{grid.length - 1 === 1 ? '' : 's'}, {headers.length} columns
              </span>
              <button
                type="button"
                className="text-slate-500 underline underline-offset-2 hover:text-slate-800"
                onClick={() => { reset(); fileInput.current?.click(); }}
                disabled={Boolean(busy)}
              >
                choose a different file
              </button>
            </div>

            <div>
              <div className="mb-1 font-medium text-slate-900">Which column is which</div>
              <div className="max-h-56 overflow-y-auto rounded-lg border border-slate-200">
                <table className="min-w-full text-xs">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold">Column in your file</th>
                      <th className="px-3 py-2 text-left font-semibold">First value</th>
                      <th className="px-3 py-2 text-left font-semibold">Becomes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {headers.map((h, i) => (
                      <tr key={`${h}-${i}`}>
                        <td className="px-3 py-1.5 text-slate-800">{h || <em className="text-slate-400">(no heading)</em>}</td>
                        <td className="px-3 py-1.5 text-slate-500">{sample[0]?.[i] || '—'}</td>
                        <td className="px-3 py-1.5">
                          <select
                            className="w-full rounded border border-slate-200 px-2 py-1"
                            value={mapping[i] ?? ''}
                            onChange={(e) => {
                              setPreview(null);
                              setMapping((m) => ({ ...m, [i]: e.target.value }));
                            }}
                          >
                            <option value="">— don&apos;t import this —</option>
                            {targets.map((t) => (
                              <option key={t.key} value={t.key}>{t.label}</option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {idMapped
                  ? `Rows carrying a ${cfg.singular.toLowerCase()} id will update those records; the rest will be added.`
                  : `No id column, so rows that match an existing ${cfg.title.toLowerCase().replace(/s$/, '')} on email or name will update it, and the rest will be added.`}
                {' '}An empty cell never overwrites what is already saved.
              </p>
            </div>

            {preview && (
              <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
                <div className="font-medium text-slate-900">
                  {preview.counts.create.toLocaleString()} to add
                  {' · '}{preview.counts.update.toLocaleString()} existing record{preview.counts.update === 1 ? '' : 's'} to update
                  {preview.counts.error > 0 && (
                    <span className="text-red-700">
                      {' · '}{preview.counts.error.toLocaleString()} row{preview.counts.error === 1 ? '' : 's'} that cannot come in
                    </span>
                  )}
                </div>
                {rows.length > IMPORT_BATCH && (
                  <div className="text-xs text-slate-600">
                    Checked the first {IMPORT_BATCH.toLocaleString()} of {rows.length.toLocaleString()} rows.
                    The rest are checked the same way as they are imported.
                  </div>
                )}
                {preview.ignoredColumns.length > 0 && (
                  <div className="text-xs text-slate-600">
                    Not imported (no home for them here): {preview.ignoredColumns.join(', ')}
                  </div>
                )}
                {preview.rows.some((r) => r.errors.length || r.warnings.length) && (
                  <ul className="max-h-40 space-y-1 overflow-y-auto text-xs">
                    {preview.rows.filter((r) => r.errors.length || r.warnings.length).slice(0, 60).map((r) => (
                      <li key={r.index} className={r.errors.length ? 'text-red-700' : 'text-amber-700'}>
                        {/* +2: the header is row 1 in the user's spreadsheet. */}
                        Row {r.index + 2}: {(r.errors.length ? r.errors : r.warnings).join('; ')}
                      </li>
                    ))}
                  </ul>
                )}
                {preview.counts.error > 0 && (
                  <div className="text-xs text-slate-600">
                    Rows with a problem are skipped — the rest still come in. Fix those rows in your
                    file and import it again; the ones that already landed will update rather than
                    duplicate.
                  </div>
                )}
              </div>
            )}

            {progress && <div className="text-slate-600">{progress}</div>}
          </>
        )}

        {result && (
          <div className="space-y-2">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3 text-emerald-900">
              <div className="font-medium">
                {result.created.toLocaleString()} added
                {' · '}{result.updated.toLocaleString()} updated
                {result.failed > 0 && ` · ${result.failed.toLocaleString()} could not be imported`}
              </div>
            </div>
            {result.errors.length > 0 && (
              <ul className="max-h-40 space-y-1 overflow-y-auto text-xs text-red-700">
                {result.errors.slice(0, 60).map((e) => (
                  <li key={e.index}>Row {e.index + 2}: {e.message}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </IadmModal>
  );
}

export default ForgeImportModal;
