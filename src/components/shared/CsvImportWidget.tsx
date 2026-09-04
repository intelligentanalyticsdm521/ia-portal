/**
 * CsvImportWidget — drop a CSV of contacts/customers into the onboarding flow.
 *
 * Used by:
 *   - SPARK: import contacts → POST /api/v1/contacts/import
 *   - OLIVER: import customers → same endpoint (lumen.contact is the unified
 *     canonical contacts store per the F-31 ARCH cleanup; OLIVER references
 *     contacts via contact_id on jobs/customers)
 *
 * Flow:
 *   1. User picks a CSV file
 *   2. We parse on the client (vanilla string split — keeps the bundle slim
 *      and the parsed rows never leave the browser unless the user clicks
 *      Import)
 *   3. Show a 5-row preview + auto-detected column mapping
 *   4. User can edit the mapping
 *   5. Import → POST to /api/v1/contacts/import in batches of 1000
 *   6. Show import summary (imported / merged / skipped / errored)
 *
 * Skip button always available — the customer can come back to this later.
 *
 * 2026-09-04 (ops scope I1/I2) — the widget now has a VENDOR PRESET picker
 * (QuickBooks Online / Wave / Jobber / Housecall Pro, from csvPresets.ts) and
 * carries address, tags and notes through to POST /contacts/import. Auto-detect
 * consults the chosen preset first, then the generic name matching. Every
 * preset shows its "not yet confirmed against a real export" warning — see the
 * honesty note at the top of csvPresets.ts.
 *
 * OLIVER's full three-tab importer (jobs and invoices too) is its own page,
 * OliverCustomerImportPage; this widget stays the one-step onboarding flow and
 * SPARK's contact import.
 */

import { useMemo, useState } from 'react';
import { useSparkApi } from '../../hooks/useSparkApi';
import {
  TARGET_FIELDS as PRESET_TARGET_FIELDS, buildMapping, detectPreset,
  getPreset, presetsFor, presetWarning, projectRow,
  type ContactField, type CsvPreset, type Mapping,
} from './csvPresets';

type Row = Record<string, string>;
type FieldKey = ContactField;

/** The contact fields this widget maps — the full set from csvPresets. */
const TARGET_FIELDS: { key: FieldKey; label: string }[] =
  PRESET_TARGET_FIELDS.contacts.map((f) => ({ key: f.key as FieldKey, label: f.label }));

interface Props {
  product: 'spark' | 'oliver';
  source?: string;
  onDone?: (result: ImportResult) => void;
  onSkip?: () => void;
}

interface ImportResult {
  imported: number;
  merged: number;
  skipped: number;
  errored: number;
  total: number;
}

export function CsvImportWidget({ product, source, onDone, onSkip }: Props) {
  const sparkApi = useSparkApi();
  const [presetKey, setPresetKey] = useState<string>('');
  const [autoDetected, setAutoDetected] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [mapping, setMapping] = useState<Mapping>({});
  const [isImporting, setIsImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const noun = product === 'spark' ? 'contacts' : 'customers';
  const Noun = noun.charAt(0).toUpperCase() + noun.slice(1);

  const preset = useMemo(() => (presetKey ? getPreset(presetKey) : null), [presetKey]);
  const presetOptions = useMemo(() => presetsFor('contacts'), []);
  const warning = preset ? presetWarning(preset) : null;

  function onPresetChange(key: string) {
    setPresetKey(key);
    setAutoDetected(false);
    if (headers.length) setMapping(buildMapping(headers, 'contacts', key ? getPreset(key) : null));
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setResult(null);
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = String(ev.target?.result || '');
      const parsed = parseCsv(text);
      if (parsed.headers.length === 0) {
        setError('CSV looks empty or unreadable.');
        return;
      }
      setHeaders(parsed.headers);
      setRows(parsed.rows);
      // Preset first (if one is chosen or the headers clearly name a vendor),
      // then the generic name matching for whatever the preset did not claim.
      let chosen: CsvPreset | null = presetKey ? getPreset(presetKey) : null;
      if (!chosen) {
        chosen = detectPreset(parsed.headers, 'contacts');
        if (chosen) { setPresetKey(chosen.preset_key); setAutoDetected(true); }
      }
      setMapping(buildMapping(parsed.headers, 'contacts', chosen));
    };
    reader.onerror = () => setError('Could not read that file.');
    reader.readAsText(file);
  }

  async function handleImport() {
    if (!rows.length) return;
    if (!mapping.email && !mapping.phone) {
      setError('We need at least an email or phone column mapped — those are how we dedupe.');
      return;
    }
    setIsImporting(true);
    setError(null);

    // projectRow also splits a one-cell "Full Name" / "Billing Address" the
    // way QuickBooks Online exports them.
    const contacts = rows.map((r) => projectRow(r, mapping, 'contacts', preset));

    // Batch in 1000s — the backend caps at 10,000 per request anyway.
    const totals: ImportResult = { imported: 0, merged: 0, skipped: 0, errored: 0, total: contacts.length };
    try {
      for (let i = 0; i < contacts.length; i += 1000) {
        const batch = contacts.slice(i, i + 1000);
        const res = await sparkApi.post<{
          imported: number;
          merged: number;
          skipped: number;
          errored: number;
          addresses_saved?: number;
          tags_linked?: number;
        }>('/api/v1/contacts/import', {
          contacts: batch,
          source: source || (product === 'spark' ? 'spark_onboarding' : 'oliver_onboarding'),
          // The OLIVER customer list IS `WHERE is_oliver_customer = 1`. Without
          // this an OLIVER import lands in the CRM and the customer list stays
          // empty (Rolling In It, 2026-08-13).
          is_oliver_customer: product === 'oliver',
        });
        totals.imported += res?.imported || 0;
        totals.merged += res?.merged || 0;
        totals.skipped += res?.skipped || 0;
        totals.errored += res?.errored || 0;
      }
      setResult(totals);
      onDone?.(totals);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsImporting(false);
    }
  }

  const preview = useMemo(() => rows.slice(0, 5), [rows]);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 md:p-8 space-y-5">
      <header>
        <h2 className="text-lg font-semibold text-iadm-ink">
          Do you already have a {noun} list?
        </h2>
        <p className="text-sm text-slate-600 mt-1">
          Upload a CSV and we&apos;ll bring them in now. Take 30 seconds, or skip and add them later.
        </p>
      </header>

      <div>
        <label htmlFor="csv-import-preset" className="block text-xs font-medium text-slate-600 mb-1">
          Which system is this list coming from?
        </label>
        <select
          id="csv-import-preset"
          className="block w-full rounded-lg border border-slate-300 text-sm px-3 py-2"
          value={presetKey}
          onChange={(e) => onPresetChange(e.target.value)}
        >
          <option value="">Something else — I&apos;ll check the columns myself</option>
          {presetOptions.map((p) => (
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

      {warning && (
        <div className="bg-amber-50 border border-amber-200 text-amber-900 text-sm rounded-lg px-4 py-3">
          <span className="font-medium">Check the preview. </span>{warning}
        </div>
      )}

      {!fileName && (
        <label className="block border-2 border-dashed border-slate-300 rounded-xl p-8 text-center cursor-pointer hover:bg-slate-50">
          <input type="file" accept=".csv,text/csv" className="hidden" onChange={handleFile} />
          <div className="text-sm text-slate-600">
            <div className="font-medium text-iadm-ink mb-1">Choose a CSV file</div>
            <div>One row per {noun.slice(0, -1)}. Headers should include at least email or phone.</div>
          </div>
        </label>
      )}

      {fileName && !result && (
        <div className="space-y-4">
          <div className="text-sm text-slate-700">
            <span className="font-medium">{fileName}</span>{' '}
            <span className="text-slate-500">— {rows.length} rows detected</span>
          </div>

          {/* Column mapping */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {TARGET_FIELDS.map((tf) => (
              <div key={tf.key}>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  {tf.label}{(tf.key === 'email' || tf.key === 'phone') && <span className="text-slate-400"> (need one)</span>}
                </label>
                <select
                  className="block w-full rounded-lg border border-slate-300 text-sm px-3 py-2"
                  value={mapping[tf.key] || ''}
                  onChange={(e) => setMapping({ ...mapping, [tf.key]: e.target.value || undefined })}
                >
                  <option value="">— not in CSV —</option>
                  {headers.map((h) => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          {/* Preview */}
          <div className="overflow-auto border border-slate-200 rounded-lg">
            <table className="min-w-full text-xs">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  {headers.map((h) => <th key={h} className="px-3 py-2 text-left font-medium">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {preview.map((row, i) => (
                  <tr key={i} className="border-t border-slate-100">
                    {headers.map((h) => <td key={h} className="px-3 py-1.5 text-slate-700">{row[h] || ''}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length > 5 && (
            <div className="text-xs text-slate-500">Showing 5 of {rows.length} rows.</div>
          )}

          {error && (
            <div className="bg-rose-50 border border-rose-200 text-rose-800 text-sm rounded-lg px-4 py-3">
              {error}
            </div>
          )}

          <div className="flex flex-wrap gap-3 justify-end">
            <button
              type="button"
              onClick={() => { setFileName(null); setHeaders([]); setRows([]); setMapping({}); setError(null); }}
              className="px-4 py-2 rounded-lg text-sm text-slate-600 hover:bg-slate-50"
            >
              Choose a different file
            </button>
            <button
              type="button"
              onClick={handleImport}
              disabled={isImporting}
              className="px-5 py-2 rounded-lg bg-iadm-gold text-iadm-ink font-medium text-sm hover:opacity-90 disabled:opacity-50"
            >
              {isImporting ? `Importing ${rows.length} ${noun}...` : `Import ${rows.length} ${noun}`}
            </button>
          </div>
        </div>
      )}

      {result && (
        <div className="space-y-4">
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
            <div className="text-sm font-medium text-emerald-800 mb-2">
              {Noun} imported.
            </div>
            <ul className="text-sm text-emerald-700 space-y-0.5">
              <li>• {result.imported} new</li>
              <li>• {result.merged} merged with existing</li>
              {result.skipped > 0 && <li>• {result.skipped} skipped (missing email + phone)</li>}
              {result.errored > 0 && <li className="text-rose-700">• {result.errored} errored</li>}
            </ul>
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => onDone?.(result)}
              className="px-5 py-2 rounded-lg bg-iadm-ink text-white font-medium text-sm hover:opacity-90"
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {!result && onSkip && (
        <div className="border-t border-slate-100 pt-4 flex justify-end">
          <button
            type="button"
            onClick={onSkip}
            className="text-sm text-slate-500 hover:text-iadm-ink"
          >
            Skip — I&apos;ll add {noun} later
          </button>
        </div>
      )}
    </div>
  );
}

/** Minimal CSV parser. Handles quoted fields with commas + escaped quotes. */
function parseCsv(text: string): { headers: string[]; rows: Row[] } {
  const lines = text.replace(/\r\n?/g, '\n').split('\n').filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };
  const headers = parseLine(lines[0]);
  const rows: Row[] = [];
  for (let i = 1; i < lines.length; i++) {
    const fields = parseLine(lines[i]);
    const row: Row = {};
    headers.forEach((h, j) => { row[h] = (fields[j] || '').trim(); });
    rows.push(row);
  }
  return { headers, rows };
}

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
    } else {
      if (c === '"') inQuote = true;
      else if (c === ',') { out.push(cur); cur = ''; }
      else cur += c;
    }
  }
  out.push(cur);
  return out;
}

export default CsvImportWidget;
