/**
 * OliverCustomerImportPage — "Import from another system" (ops scope §3.5, I4).
 *
 * Three tabs (Customers · Jobs · Invoices), a vendor preset picker with the
 * unconfirmed-preset warning, a file drop, a 20-row mapping preview, a DRY RUN
 * that writes nothing, then Import — plus the history of past imports with
 * "Bring imported invoices into your books" (decision O-4) per invoice batch.
 *
 * The component keeps its old name and route key (`oliver_customer_import`) so
 * the existing nav entry keeps working; only what it renders changed.
 *
 * Backend: oliver-api POST /imports/{contacts|jobs|invoices},
 * GET /imports, POST /imports/:batchId/include-in-books.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { OliverPageWrapper } from '../../components/OliverPageWrapper';
import { PageHeader } from '../../components/oliver/ui';
import { useOliverApi } from '../../hooks/useOliverApi';
import {
  CSV_PRESETS, TARGET_FIELDS, buildMapping, detectPreset, getPreset,
  missingRequired, presetsFor, presetWarning, projectRow,
  type CsvPreset, type CsvRow, type ImportEntity, type Mapping,
} from '../../components/shared/csvPresets';

// ─── types ───────────────────────────────────────────────────────────────

interface RowResult {
  row: number;
  action: 'create' | 'update' | 'skip' | 'error';
  reason?: string;
  warnings?: string[];
  job_number?: string;
  invoice_number?: string;
}

interface ImportResponse {
  batch_id: string;
  entity: ImportEntity;
  dry_run: boolean;
  replayed?: boolean;
  message?: string;
  summary: { total: number; created: number; updated: number; skipped: number; errored: number };
  rows: RowResult[];
  rows_truncated?: number;
}

interface BatchRow {
  batch_id: string;
  entity: ImportEntity;
  source_vendor: string;
  preset_key: string | null;
  file_name: string | null;
  row_count: number;
  status: string;
  created_count: number;
  updated_count: number;
  skipped_count: number;
  errored_count: number;
  included_in_books_at: string | null;
  invoices_held_from_books: number;
  invoices_in_books: number;
  created_at: string;
}

const TABS: { key: ImportEntity; label: string; blurb: string }[] = [
  { key: 'contacts', label: 'Customers', blurb: 'Your customer list — names, contact details and addresses.' },
  { key: 'jobs', label: 'Jobs', blurb: 'Past and upcoming work. Each job needs a customer and a service address.' },
  { key: 'invoices', label: 'Invoices', blurb: 'Invoice history. Paid invoices stay out of your books until you say otherwise.' },
];

const MAX_ROWS = 5000;
const PREVIEW_ROWS = 20;

// ─── CSV parsing (same minimal parser as CsvImportWidget) ────────────────

function parseLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuote) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') inQuote = false;
      else cur += c;
    } else if (c === '"') inQuote = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

function parseCsv(text: string): { headers: string[]; rows: CsvRow[] } {
  const lines = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n').filter((l) => l.trim().length > 0);
  if (!lines.length) return { headers: [], rows: [] };
  const headers = parseLine(lines[0]).map((h) => h.trim());
  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const fields = parseLine(lines[i]);
    const row: CsvRow = {};
    headers.forEach((h, j) => { row[h] = (fields[j] || '').trim(); });
    rows.push(row);
  }
  return { headers, rows };
}

function uuid(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c?.randomUUID) return c.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// ─── page ────────────────────────────────────────────────────────────────

export function OliverCustomerImportPage() {
  const api = useOliverApi();
  const [entity, setEntity] = useState<ImportEntity>('contacts');
  const [history, setHistory] = useState<BatchRow[]>([]);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(true);

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const rows = await api.get<BatchRow[]>('/imports');
      setHistory(Array.isArray(rows) ? rows : []);
      setHistoryError(null);
    } catch (e) {
      setHistoryError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingHistory(false);
    }
  }, [api]);

  useEffect(() => { void loadHistory(); }, [loadHistory]);

  return (
    <OliverPageWrapper title="Import from another system" loading={false} error={null}>
      <PageHeader
        title="Import from another system"
        subtitle="Bring your customers, jobs and invoices across from QuickBooks Online, Wave, Jobber or Housecall Pro."
      />

      <div className="max-w-5xl mx-auto space-y-6">
        <nav className="flex gap-1 border-b border-slate-200" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={entity === t.key}
              onClick={() => setEntity(t.key)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px ${
                entity === t.key
                  ? 'border-iadm-gold text-iadm-ink'
                  : 'border-transparent text-slate-500 hover:text-iadm-ink'
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <ImportPanel
          key={entity}
          entity={entity}
          blurb={TABS.find((t) => t.key === entity)!.blurb}
          onImported={loadHistory}
        />

        <HistoryPanel
          rows={history}
          loading={loadingHistory}
          error={historyError}
          onChanged={loadHistory}
        />
      </div>
    </OliverPageWrapper>
  );
}

// ─── one entity's import flow ────────────────────────────────────────────

function ImportPanel({ entity, blurb, onImported }: {
  entity: ImportEntity;
  blurb: string;
  onImported: () => void;
}) {
  const api = useOliverApi();
  const [presetKey, setPresetKey] = useState<string>('');
  const [autoDetected, setAutoDetected] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<CsvRow[]>([]);
  const [mapping, setMapping] = useState<Mapping>({});
  const [batchId, setBatchId] = useState<string>('');
  const [dryResult, setDryResult] = useState<ImportResponse | null>(null);
  const [finalResult, setFinalResult] = useState<ImportResponse | null>(null);
  const [busy, setBusy] = useState<'' | 'dry' | 'import'>('');
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const preset = useMemo(() => (presetKey ? getPreset(presetKey) : null), [presetKey]);
  const options = useMemo(() => presetsFor(entity), [entity]);
  const warning = preset ? presetWarning(preset) : null;
  const missing = useMemo(() => missingRequired(mapping, entity), [mapping, entity]);

  function reset() {
    setFileName(null); setHeaders([]); setRows([]); setMapping({});
    setBatchId(''); setDryResult(null); setFinalResult(null); setError(null);
    setAutoDetected(false);
    if (fileInput.current) fileInput.current.value = '';
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null); setDryResult(null); setFinalResult(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const parsed = parseCsv(String(ev.target?.result || ''));
      if (!parsed.headers.length) { setError('That file looks empty, or it is not a CSV.'); return; }
      if (parsed.rows.length > MAX_ROWS) {
        setError(`That file has ${parsed.rows.length.toLocaleString()} rows. We import up to ${MAX_ROWS.toLocaleString()} at a time — split it and import the parts.`);
        return;
      }
      setFileName(file.name);
      setHeaders(parsed.headers);
      setRows(parsed.rows);
      setBatchId(uuid());

      // Auto-detect the vendor when the header row is unambiguous, but never
      // overrule a preset the owner picked themselves.
      let chosen: CsvPreset | null = preset;
      if (!chosen) {
        chosen = detectPreset(parsed.headers, entity);
        if (chosen) { setPresetKey(chosen.preset_key); setAutoDetected(true); }
      }
      setMapping(buildMapping(parsed.headers, entity, chosen));
    };
    reader.onerror = () => setError('We could not read that file.');
    reader.readAsText(file);
  }

  function onPresetChange(key: string) {
    setPresetKey(key);
    setAutoDetected(false);
    setDryResult(null); setFinalResult(null);
    if (headers.length) setMapping(buildMapping(headers, entity, key ? getPreset(key) : null));
  }

  function setField(field: string, column: string) {
    setDryResult(null); setFinalResult(null);
    setMapping((m) => {
      const next: Mapping = { ...m };
      if (!column) delete next[field as keyof Mapping];
      else next[field as keyof Mapping] = column;
      return next;
    });
  }

  async function run(dry: boolean) {
    if (!rows.length || !batchId) return;
    setBusy(dry ? 'dry' : 'import');
    setError(null);
    try {
      const payload = {
        batch_id: batchId,
        source_vendor: preset?.vendor || 'generic',
        preset_key: preset?.preset_key || null,
        file_name: fileName,
        mapping,
        dry_run: dry,
        rows: rows.map((r) => projectRow(r, mapping, entity, preset)),
      };
      const res = await api.post<ImportResponse>(`/imports/${entity}`, payload);
      if (dry) setDryResult(res);
      else { setFinalResult(res); onImported(); }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy('');
    }
  }

  const preview = rows.slice(0, PREVIEW_ROWS);
  const mappedColumns = new Set(Object.values(mapping).filter(Boolean) as string[]);
  const unmapped = headers.filter((h) => !mappedColumns.has(h));

  return (
    <section className="bg-white rounded-2xl border border-slate-200 p-6 space-y-5">
      <p className="text-sm text-slate-600">{blurb}</p>

      {/* Preset picker */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label htmlFor={`preset-${entity}`} className="block text-xs font-medium text-slate-600 mb-1">
            Which system are you coming from?
          </label>
          <select
            id={`preset-${entity}`}
            className="block w-full rounded-lg border border-slate-300 text-sm px-3 py-2"
            value={presetKey}
            onChange={(e) => onPresetChange(e.target.value)}
          >
            <option value="">Something else — I&apos;ll map the columns myself</option>
            {options.map((p) => (
              <option key={p.preset_key} value={p.preset_key}>{p.label}</option>
            ))}
          </select>
          {preset && (
            <p className="text-xs text-slate-500 mt-1">
              Where to get the file: {preset.export_path}
              {autoDetected && <span className="ml-1 text-emerald-700">· we recognised this from your column names</span>}
            </p>
          )}
        </div>
        <div className="flex items-end">
          <label className="block w-full border-2 border-dashed border-slate-300 rounded-xl px-4 py-3 text-center cursor-pointer hover:bg-slate-50">
            <input ref={fileInput} type="file" accept=".csv,text/csv" className="hidden" onChange={handleFile} />
            <span className="text-sm text-slate-600">
              {fileName ? <><span className="font-medium text-iadm-ink">{fileName}</span> — {rows.length.toLocaleString()} rows</> : 'Choose a CSV file'}
            </span>
          </label>
        </div>
      </div>

      {warning && (
        <div className="bg-amber-50 border border-amber-200 text-amber-900 text-sm rounded-lg px-4 py-3">
          <span className="font-medium">Check the preview. </span>{warning}
        </div>
      )}
      {preset?.notes && !preset.vendor_has_no_native_export && (
        <p className="text-xs text-slate-500">{preset.notes}</p>
      )}

      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 text-sm rounded-lg px-4 py-3">{error}</div>
      )}

      {!!rows.length && (
        <>
          {/* Mapping */}
          <div>
            <h3 className="text-sm font-semibold text-iadm-ink mb-2">How we read your columns</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {TARGET_FIELDS[entity].map((f) => (
                <div key={f.key}>
                  <label htmlFor={`map-${entity}-${f.key}`} className="block text-xs font-medium text-slate-600 mb-1">
                    {f.label}
                    {f.hint && <span className="text-slate-400 font-normal"> — {f.hint}</span>}
                  </label>
                  <select
                    id={`map-${entity}-${f.key}`}
                    className="block w-full rounded-lg border border-slate-300 text-sm px-2.5 py-1.5"
                    value={mapping[f.key] || ''}
                    onChange={(e) => setField(f.key, e.target.value)}
                  >
                    <option value="">— not in this file —</option>
                    {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
              ))}
            </div>
            {!!unmapped.length && (
              <p className="text-xs text-slate-500 mt-2">
                Not used: {unmapped.join(', ')}. Nothing is lost in your original file.
              </p>
            )}
            {!!missing.length && (
              <p className="text-xs text-rose-700 mt-2">
                Still needed before we can import: {missing.join('; ')}.
              </p>
            )}
          </div>

          {/* Preview */}
          <div>
            <h3 className="text-sm font-semibold text-iadm-ink mb-2">
              First {Math.min(PREVIEW_ROWS, rows.length)} rows, as we read them
            </h3>
            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="min-w-full text-xs">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-2 py-2 text-left font-medium">#</th>
                    {TARGET_FIELDS[entity].filter((f) => mapping[f.key]).map((f) => (
                      <th key={f.key} className="px-3 py-2 text-left font-medium whitespace-nowrap">{f.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.map((r, i) => {
                    const projected = projectRow(r, mapping, entity, preset) as Record<string, unknown>;
                    return (
                      <tr key={i} className="border-t border-slate-100">
                        <td className="px-2 py-1.5 text-slate-400">{i + 1}</td>
                        {TARGET_FIELDS[entity].filter((f) => mapping[f.key]).map((f) => {
                          const v = projected[f.key];
                          const rawKey = `${f.key}_raw`;
                          const unreadable = v === null && projected[rawKey] !== undefined;
                          return (
                            <td key={f.key} className={`px-3 py-1.5 whitespace-nowrap ${unreadable ? 'text-rose-700' : 'text-slate-700'}`}>
                              {unreadable
                                ? <span title="We could not read this value">{String(projected[rawKey])} ⚠</span>
                                : Array.isArray(v) ? v.join(', ') : (v === null || v === undefined ? '' : String(v))}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap gap-3 justify-end items-center">
            <button type="button" onClick={reset} className="px-4 py-2 rounded-lg text-sm text-slate-600 hover:bg-slate-50">
              Start over
            </button>
            <button
              type="button"
              onClick={() => run(true)}
              disabled={!!busy || !!missing.length}
              className="px-5 py-2 rounded-lg border border-slate-300 text-sm font-medium text-iadm-ink hover:bg-slate-50 disabled:opacity-50"
            >
              {busy === 'dry' ? 'Checking…' : 'Check without importing'}
            </button>
            <button
              type="button"
              onClick={() => run(false)}
              disabled={!!busy || !!missing.length || !dryResult || !!finalResult}
              title={!dryResult ? 'Run the check first so you can see what will happen' : undefined}
              className="px-5 py-2 rounded-lg bg-iadm-gold text-iadm-ink font-medium text-sm hover:opacity-90 disabled:opacity-50"
            >
              {busy === 'import' ? 'Importing…' : `Import ${rows.length.toLocaleString()} rows`}
            </button>
          </div>
        </>
      )}

      {dryResult && !finalResult && <ResultBlock title="Nothing has been imported yet — this is what will happen" result={dryResult} />}
      {finalResult && <ResultBlock title={finalResult.replayed ? 'This file was already imported' : 'Import finished'} result={finalResult} done />}
    </section>
  );
}

// ─── result summary ──────────────────────────────────────────────────────

function ResultBlock({ title, result, done }: { title: string; result: ImportResponse; done?: boolean }) {
  const s = result.summary;
  const problems = result.rows.filter((r) => r.action === 'error');
  const skipped = result.rows.filter((r) => r.action === 'skip');
  const warned = result.rows.filter((r) => r.warnings?.length);

  return (
    <div className={`rounded-xl border p-4 space-y-3 ${done && !s.errored ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
      <div className="text-sm font-semibold text-iadm-ink">{title}</div>
      {result.message && <p className="text-sm text-slate-700">{result.message}</p>}
      <div className="flex flex-wrap gap-4 text-sm">
        <Stat label={done ? 'added' : 'will be added'} value={s.created} tone="good" />
        <Stat label={done ? 'updated' : 'will be updated'} value={s.updated} tone="good" />
        <Stat label="skipped" value={s.skipped} />
        <Stat label="could not be imported" value={s.errored} tone={s.errored ? 'bad' : undefined} />
      </div>

      {!!problems.length && (
        <details open className="text-sm">
          <summary className="cursor-pointer font-medium text-rose-800">
            {problems.length} row{problems.length === 1 ? '' : 's'} we could not import
          </summary>
          <ul className="mt-2 space-y-1 text-rose-800 max-h-56 overflow-y-auto">
            {problems.slice(0, 100).map((r) => <li key={r.row}>Row {r.row}: {r.reason}</li>)}
          </ul>
        </details>
      )}
      {!!skipped.length && (
        <details className="text-sm">
          <summary className="cursor-pointer font-medium text-slate-700">
            {skipped.length} row{skipped.length === 1 ? '' : 's'} skipped
          </summary>
          <ul className="mt-2 space-y-1 text-slate-600 max-h-56 overflow-y-auto">
            {skipped.slice(0, 100).map((r) => <li key={r.row}>Row {r.row}: {r.reason}</li>)}
          </ul>
        </details>
      )}
      {!!warned.length && (
        <details className="text-sm">
          <summary className="cursor-pointer font-medium text-amber-800">
            {warned.length} row{warned.length === 1 ? '' : 's'} worth a look
          </summary>
          <ul className="mt-2 space-y-1 text-amber-900 max-h-56 overflow-y-auto">
            {warned.slice(0, 100).map((r) => <li key={r.row}>Row {r.row}: {r.warnings!.join('; ')}</li>)}
          </ul>
        </details>
      )}
      {!!result.rows_truncated && (
        <p className="text-xs text-slate-500">{result.rows_truncated.toLocaleString()} more rows are recorded in the import history.</p>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'good' | 'bad' }) {
  const colour = tone === 'bad' ? 'text-rose-700' : tone === 'good' ? 'text-emerald-700' : 'text-slate-700';
  return (
    <span className={colour}>
      <span className="font-semibold tabular-nums">{value.toLocaleString()}</span> {label}
    </span>
  );
}

// ─── history + "bring into your books" (decision O-4) ────────────────────

function HistoryPanel({ rows, loading, error, onChanged }: {
  rows: BatchRow[]; loading: boolean; error: string | null; onChanged: () => void;
}) {
  const api = useOliverApi();
  const [working, setWorking] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  async function includeInBooks(batchId: string) {
    setWorking(batchId); setMessage(null); setFailure(null);
    try {
      const res = await api.post<{ message?: string; invoices_released?: number; income_sync_error?: string }>(
        `/imports/${batchId}/include-in-books`, {},
      );
      // The API tells us plainly when the flags cleared but STELLA did not
      // update. Repeating that here is the point — a green tick over a silent
      // failure is the bug this platform keeps shipping.
      if (res?.income_sync_error) setFailure(res.message || res.income_sync_error);
      else setMessage(res?.message || 'Done.');
      onChanged();
    } catch (e) {
      setFailure(e instanceof Error ? e.message : String(e));
    } finally {
      setWorking(null);
    }
  }

  return (
    <section className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
      <h2 className="text-base font-semibold text-iadm-ink">Past imports</h2>

      {message && <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm rounded-lg px-4 py-3">{message}</div>}
      {failure && <div className="bg-rose-50 border border-rose-200 text-rose-800 text-sm rounded-lg px-4 py-3">{failure}</div>}
      {error && <div className="bg-rose-50 border border-rose-200 text-rose-800 text-sm rounded-lg px-4 py-3">Could not load your import history: {error}</div>}

      {loading && <p className="text-sm text-slate-500">Loading…</p>}
      {!loading && !rows.length && !error && (
        <p className="text-sm text-slate-500">Nothing imported yet.</p>
      )}

      {!!rows.length && (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-slate-600 border-b border-slate-200">
              <tr>
                <th className="px-3 py-2 text-left font-medium">When</th>
                <th className="px-3 py-2 text-left font-medium">What</th>
                <th className="px-3 py-2 text-left font-medium">File</th>
                <th className="px-3 py-2 text-right font-medium">Added</th>
                <th className="px-3 py-2 text-right font-medium">Updated</th>
                <th className="px-3 py-2 text-right font-medium">Skipped</th>
                <th className="px-3 py-2 text-right font-medium">Problems</th>
                <th className="px-3 py-2 text-left font-medium">Books</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => (
                <tr key={b.batch_id} className="border-b border-slate-100">
                  <td className="px-3 py-2 whitespace-nowrap text-slate-600">
                    {new Date(b.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {entityLabel(b.entity)}
                    <span className="text-slate-400"> · {vendorLabel(b.source_vendor)}</span>
                  </td>
                  <td className="px-3 py-2 max-w-[16rem] truncate text-slate-600" title={b.file_name || ''}>{b.file_name || '—'}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{b.created_count}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{b.updated_count}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{b.skipped_count}</td>
                  <td className={`px-3 py-2 text-right tabular-nums ${b.errored_count ? 'text-rose-700 font-medium' : 'text-slate-400'}`}>
                    {b.errored_count}
                  </td>
                  <td className="px-3 py-2">
                    {b.entity !== 'invoices' ? (
                      <span className="text-slate-300">—</span>
                    ) : b.invoices_held_from_books > 0 ? (
                      <button
                        type="button"
                        disabled={working === b.batch_id}
                        onClick={() => includeInBooks(b.batch_id)}
                        className="text-xs px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-50 disabled:opacity-50"
                      >
                        {working === b.batch_id
                          ? 'Working…'
                          : `Bring ${b.invoices_held_from_books} into your books`}
                      </button>
                    ) : (
                      <span className="text-xs text-emerald-700">In your books</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-slate-500">
        Invoices you import are history from your old system, so they are kept out of your STELLA
        income until you bring them in here. That stops the same money being counted twice in the
        month you switch over.
      </p>
    </section>
  );
}

function entityLabel(e: string): string {
  return e === 'contacts' ? 'Customers' : e === 'jobs' ? 'Jobs' : e === 'invoices' ? 'Invoices' : e;
}

function vendorLabel(v: string): string {
  const hit = CSV_PRESETS.find((p) => p.vendor === v);
  return hit ? hit.vendor_label : 'Another system';
}

export default OliverCustomerImportPage;
