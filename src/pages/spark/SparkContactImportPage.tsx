// SparkContactImportPage — 4-step CSV import wizard.
//   1. Upload — drag/drop or pick CSV
//   2. Map columns — auto-detected with override dropdowns
//   3. Preview — calls /contacts/import/preview, shows new/merge/invalid counts
//   4. Commit — calls /contacts/import, optionally adds to list + tags
import { useCallback, useState } from "react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { SparkPageShell } from "../../components/spark/SparkPageShell";
import { Upload, Check, AlertCircle, ArrowRight, FileText } from "lucide-react";

const TARGET_FIELDS = ["first_name", "last_name", "email", "phone", "company", "title", "source"] as const;
type TargetField = typeof TARGET_FIELDS[number];

interface PreviewSummary { total: number; new: number; merge: number; invalid: number; duplicate_in_batch: number; }
interface ImportResult { imported: number; merged: number; skipped: number; errored: number; total: number; errors: { idx: number; error: string }[]; }
interface ListRow { id: number; name: string; }

// RFC-4180-ish CSV parser (minimal — handles quoted fields, escaped quotes, commas).
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let cur = ""; let inQuote = false; let row: string[] = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]; const next = text[i + 1];
    if (inQuote) {
      if (ch === '"' && next === '"') { cur += '"'; i++; }
      else if (ch === '"') { inQuote = false; }
      else { cur += ch; }
    } else {
      if (ch === '"') { inQuote = true; }
      else if (ch === ",") { row.push(cur); cur = ""; }
      else if (ch === "\r") { /* skip */ }
      else if (ch === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; }
      else { cur += ch; }
    }
  }
  if (cur.length || row.length) { row.push(cur); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim() !== ""));
}

function autoDetect(header: string): TargetField | "" {
  const h = header.toLowerCase().trim().replace(/[\s_-]+/g, "");
  if (["firstname", "fname", "given", "givenname"].some(x => h === x || h.includes(x))) return "first_name";
  if (["lastname", "lname", "surname", "family", "familyname"].some(x => h === x || h.includes(x))) return "last_name";
  if (h === "email" || h.includes("mail")) return "email";
  if (h === "phone" || h.includes("mobile") || h.includes("tel") || h.includes("cell")) return "phone";
  if (h === "company" || h.includes("organisation") || h.includes("organization") || h === "org") return "company";
  if (h === "title" || h.includes("jobtitle") || h.includes("position")) return "title";
  if (h === "source") return "source";
  return "";
}

export function SparkContactImportPage() {
  const { get, post, ready } = useSparkApi();
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [dataRows, setDataRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<number, TargetField | "">>({});
  const [preview, setPreview] = useState<PreviewSummary | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [lists, setLists] = useState<ListRow[]>([]);
  const [listId, setListId] = useState<number | "">("");
  const [tagNames, setTagNames] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function handleFile(f: File) {
    setErr(null);
    setFileName(f.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = String(e.target?.result || "");
      const rows = parseCsv(text);
      if (!rows.length) { setErr("CSV is empty"); return; }
      const head = rows[0].map(c => c.trim());
      const data = rows.slice(1).filter(r => r.some(c => c.trim() !== ""));
      setHeaders(head);
      setDataRows(data);
      // Auto-map
      const m: Record<number, TargetField | ""> = {};
      head.forEach((h, i) => { m[i] = autoDetect(h); });
      setMapping(m);
      setStep(2);
    };
    reader.readAsText(f);
  }

  function buildContacts() {
    return dataRows.map(row => {
      const c: Record<string, string> = {};
      headers.forEach((_, i) => {
        const target = mapping[i];
        if (!target) return;
        const val = (row[i] ?? "").toString().trim();
        if (val) c[target] = val;
      });
      return c;
    });
  }

  async function runPreview() {
    setBusy(true); setErr(null);
    try {
      const contacts = buildContacts();
      const r = await post<{ data: { summary: PreviewSummary } }>("/api/v1/contacts/import/preview", { contacts });
      setPreview(r.data.summary);
      // Load lists for the commit step
      try {
        const ls = await get<{ data: ListRow[] }>("/api/v1/lists");
        setLists(ls?.data || []);
      } catch { /* no-op */ }
      setStep(3);
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  }

  async function commit() {
    setBusy(true); setErr(null);
    try {
      const contacts = buildContacts();
      const r = await post<{ data: ImportResult }>("/api/v1/contacts/import", {
        contacts,
        source: "csv_import",
        list_id: listId === "" ? null : listId,
        tag_names: tagNames.split(",").map(s => s.trim()).filter(Boolean),
      });
      setResult(r.data);
      setStep(4);
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  }

  function reset() {
    setStep(1); setFileName(""); setHeaders([]); setDataRows([]); setMapping({});
    setPreview(null); setResult(null); setListId(""); setTagNames(""); setErr(null);
  }

  return (
    <SparkPageShell
      title="Import contacts (CSV)"
      subtitle={step === 1 ? "Upload a CSV file" : step === 2 ? `Map ${headers.length} columns` : step === 3 ? `Preview ${dataRows.length} rows` : "Import complete"}
      help="Upload up to 10,000 contacts at a time. The wizard auto-detects column types (email, phone, name, etc.) — you can override before previewing. Existing emails get merged; invalid rows are flagged before commit."
      loading={!ready}
    >
      {/* Step ribbon */}
      <div className="flex items-center gap-2 mb-4 text-xs">
        {[1, 2, 3, 4].map(n => (
          <div key={n} className={`flex items-center gap-2 ${step === n ? "text-[#EF6C33] font-bold" : step > n ? "text-emerald-700" : "text-slate-400"}`}>
            <div className={`w-6 h-6 rounded-full flex items-center justify-center ${step === n ? "bg-[#EF6C33] text-white" : step > n ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-400"}`}>
              {step > n ? <Check className="h-3 w-3" /> : n}
            </div>
            {["Upload", "Map", "Preview", "Done"][n - 1]}
            {n < 4 && <ArrowRight className="h-3 w-3 text-slate-300" />}
          </div>
        ))}
      </div>

      {err && (
        <div className="mb-3 p-3 rounded border border-rose-200 bg-rose-50 text-sm text-rose-800 flex items-center gap-2">
          <AlertCircle className="h-4 w-4" /> {err}
        </div>
      )}

      {step === 1 && (
        <label className="block border-2 border-dashed border-slate-300 rounded-xl p-12 text-center cursor-pointer hover:border-[#EF6C33] transition">
          <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
          <Upload className="h-10 w-10 text-slate-400 mx-auto mb-2" />
          <div className="text-base font-semibold text-slate-900">Pick a CSV file</div>
          <div className="text-xs text-slate-500 mt-1">First row must be the header. Max 10,000 contacts per upload.</div>
          <div className="text-[10px] text-slate-400 mt-3">Expected columns: email, first_name, last_name, phone, company, title (any subset)</div>
        </label>
      )}

      {step === 2 && (
        <div className="space-y-3">
          <div className="text-sm text-slate-600">
            <FileText className="h-3.5 w-3.5 inline mr-1" />
            <strong>{fileName}</strong> · {dataRows.length} rows · {headers.length} columns
          </div>
          <div className="border border-slate-200 rounded overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-slate-50">
                <tr>
                  <th className="text-left p-2 font-semibold">CSV column</th>
                  <th className="text-left p-2 font-semibold">Sample value</th>
                  <th className="text-left p-2 font-semibold">Map to field</th>
                </tr>
              </thead>
              <tbody>
                {headers.map((h, i) => (
                  <tr key={i} className="border-t border-slate-100">
                    <td className="p-2 font-mono">{h || `(column ${i + 1})`}</td>
                    <td className="p-2 text-slate-500 truncate max-w-[300px]">{dataRows[0]?.[i] || ""}</td>
                    <td className="p-2">
                      <select value={mapping[i] || ""} onChange={(e) => setMapping(m => ({ ...m, [i]: e.target.value as TargetField | "" }))}
                        className="text-xs border border-slate-300 rounded p-1">
                        <option value="">(skip)</option>
                        {TARGET_FIELDS.map(f => <option key={f} value={f}>{f}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-between">
            <button onClick={() => setStep(1)} className="text-sm px-3 py-1.5 rounded border border-slate-200">← Back</button>
            <button disabled={busy} onClick={runPreview} className="text-sm px-4 py-1.5 rounded bg-[#EF6C33] text-white disabled:opacity-50">
              {busy ? "Analyzing…" : "Preview →"}
            </button>
          </div>
        </div>
      )}

      {step === 3 && preview && (
        <div className="space-y-4">
          <div className="grid grid-cols-4 gap-2">
            <Stat label="Total" value={preview.total} />
            <Stat label="New" value={preview.new} accent="emerald" />
            <Stat label="Merge (existing email)" value={preview.merge} accent="blue" />
            <Stat label="Invalid" value={preview.invalid + preview.duplicate_in_batch} accent="amber" />
          </div>
          <div className="border border-slate-200 rounded p-4 bg-slate-50 space-y-3">
            <div className="text-sm font-semibold">Optional: add imported contacts to a list and/or tag them</div>
            <div>
              <label className="text-[10px] uppercase font-semibold text-slate-500">Add to list</label>
              <select value={listId} onChange={(e) => setListId(e.target.value === "" ? "" : Number(e.target.value))}
                className="w-full text-sm border border-slate-300 rounded p-1.5 mt-0.5">
                <option value="">(no list)</option>
                {lists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] uppercase font-semibold text-slate-500">Tags (comma-separated)</label>
              <input value={tagNames} onChange={(e) => setTagNames(e.target.value)}
                placeholder="e.g. imported, q4-event" className="w-full text-sm border border-slate-300 rounded p-1.5 mt-0.5" />
            </div>
          </div>
          <div className="flex justify-between">
            <button onClick={() => setStep(2)} className="text-sm px-3 py-1.5 rounded border border-slate-200">← Back</button>
            <button disabled={busy} onClick={commit} className="text-sm px-4 py-1.5 rounded bg-[#EF6C33] text-white disabled:opacity-50">
              {busy ? "Importing…" : `Import ${preview.new + preview.merge} contacts →`}
            </button>
          </div>
        </div>
      )}

      {step === 4 && result && (
        <div className="space-y-3">
          <div className="text-center text-6xl">✅</div>
          <div className="text-center text-xl font-bold text-emerald-800">Import complete</div>
          <div className="grid grid-cols-4 gap-2">
            <Stat label="Total rows" value={result.total} />
            <Stat label="Imported" value={result.imported} accent="emerald" />
            <Stat label="Merged" value={result.merged} accent="blue" />
            <Stat label="Skipped/Errored" value={result.skipped + result.errored} accent="amber" />
          </div>
          {result.errors.length > 0 && (
            <div className="border border-amber-200 bg-amber-50 rounded p-3 text-xs">
              <div className="font-semibold mb-1">First {result.errors.length} errors:</div>
              <ul className="space-y-0.5">
                {result.errors.map((e, i) => <li key={i}>Row {e.idx + 1}: {e.error}</li>)}
              </ul>
            </div>
          )}
          <div className="flex justify-center gap-2">
            <button onClick={reset} className="text-sm px-4 py-1.5 rounded bg-[#EF6C33] text-white">Import another file</button>
            <a href="/app/services/spark_contacts" className="text-sm px-4 py-1.5 rounded border border-slate-200">View contacts →</a>
          </div>
        </div>
      )}
    </SparkPageShell>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: "emerald" | "blue" | "amber" }) {
  const color = accent === "emerald" ? "text-emerald-700 border-emerald-200 bg-emerald-50"
              : accent === "blue" ? "text-blue-700 border-blue-200 bg-blue-50"
              : accent === "amber" ? "text-amber-700 border-amber-200 bg-amber-50"
              : "text-slate-900 border-slate-200 bg-white";
  return (
    <div className={`p-3 rounded border ${color}`}>
      <div className="text-[10px] uppercase font-semibold opacity-80">{label}</div>
      <div className="text-2xl font-bold">{value.toLocaleString()}</div>
    </div>
  );
}

export default SparkContactImportPage;
