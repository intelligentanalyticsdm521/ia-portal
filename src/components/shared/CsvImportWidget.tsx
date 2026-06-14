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
 */

import { useMemo, useState } from 'react';
import { useSparkApi } from '../../hooks/useSparkApi';

type Row = Record<string, string>;
type FieldKey = 'first_name' | 'last_name' | 'email' | 'phone' | 'company' | 'title';

const TARGET_FIELDS: { key: FieldKey; label: string }[] = [
  { key: 'first_name', label: 'First name' },
  { key: 'last_name', label: 'Last name' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone' },
  { key: 'company', label: 'Company' },
  { key: 'title', label: 'Title' },
];

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
  const [fileName, setFileName] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [mapping, setMapping] = useState<Partial<Record<FieldKey, string>>>({});
  const [isImporting, setIsImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const noun = product === 'spark' ? 'contacts' : 'customers';
  const Noun = noun.charAt(0).toUpperCase() + noun.slice(1);

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
      setMapping(autoDetectMapping(parsed.headers));
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

    const contacts = rows.map((r) => {
      const out: Record<string, string | null> = {};
      for (const tf of TARGET_FIELDS) {
        const srcCol = mapping[tf.key];
        out[tf.key] = srcCol ? (r[srcCol] || '').trim() || null : null;
      }
      return out;
    });

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
        }>('/api/v1/contacts/import', {
          contacts: batch,
          source: source || (product === 'spark' ? 'spark_onboarding' : 'oliver_onboarding'),
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

/** Best-effort column → field auto-detection by name. */
function autoDetectMapping(headers: string[]): Partial<Record<FieldKey, string>> {
  const mapping: Partial<Record<FieldKey, string>> = {};
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');
  for (const h of headers) {
    const n = norm(h);
    if (!mapping.email && /email|mail|emailaddress/.test(n)) mapping.email = h;
    else if (!mapping.phone && /^(phone|mobile|cell|tel)/.test(n)) mapping.phone = h;
    else if (!mapping.first_name && /^(first|fname|firstname|given)/.test(n)) mapping.first_name = h;
    else if (!mapping.last_name && /^(last|lname|lastname|surname|family)/.test(n)) mapping.last_name = h;
    else if (!mapping.company && /^(company|organization|org|business)/.test(n)) mapping.company = h;
    else if (!mapping.title && /^(title|jobtitle|role|position)/.test(n)) mapping.title = h;
  }
  return mapping;
}

export default CsvImportWidget;
