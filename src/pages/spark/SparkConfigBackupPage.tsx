// SparkConfigBackupPage — Tenant configuration export / import (v4.4).
//
// Pulls the user-defined SPARK configuration as a single JSON file
// (dashboards, reports, custom fields, anomaly rules, templates, etc.)
// and lets the admin upload a previously exported file to restore.
import { useState } from "react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { SparkPageShell } from "../../components/spark/SparkPageShell";
import { Download, Upload, Check, AlertCircle, FileJson } from "lucide-react";

/** Per-section outcome from POST /config/import. `inserted` is rows actually
 *  written; `skipped_existing` already existed; `failed` threw. Before
 *  2026-09-01 the API swallowed every insert error and echoed the count of
 *  items in the FILE, so a restore that wrote nothing still read as a success. */
interface SectionTally {
  inserted: number;
  skipped_existing: number;
  failed: number;
  first_error?: string;
}

interface ImportResult {
  ok: boolean;
  imported?: Record<string, SectionTally>;
  /** Sections present in the file that this endpoint has no importer for. */
  not_imported?: Array<{ section: string; in_file: number }>;
  failed_total?: number;
  error?: string;
}

export function SparkConfigBackupPage() {
  const { get, post, ready } = useSparkApi();
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importPreview, setImportPreview] = useState<Record<string, unknown> | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  async function exportConfig() {
    if (!ready) return;
    setExporting(true);
    try {
      const r = await get<Record<string, unknown>>("/api/v1/config/export");
      const blob = new Blob([JSON.stringify(r, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `iadm-spark-config-${new Date().toISOString().slice(0,10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) { alert(`Export failed: ${(err as Error).message}`); }
    finally { setExporting(false); }
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setImportError(null);
    setImportResult(null);
    setImportPreview(null);
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const obj = JSON.parse(String(ev.target?.result || ""));
        if (!obj.version) throw new Error("missing version — not a valid IADM SPARK export");
        setImportPreview(obj);
      } catch (err) {
        setImportError(`Could not parse file: ${(err as Error).message}`);
      }
    };
    reader.readAsText(file);
  }

  async function runImport() {
    if (!importPreview) return;
    setImporting(true);
    setImportResult(null);
    try {
      const r = await post<ImportResult>("/api/v1/config/import", importPreview);
      setImportResult(r);
    } catch (err) {
      setImportResult({ ok: false, error: (err as Error).message });
    } finally { setImporting(false); }
  }

  const previewKeys = importPreview
    ? Object.keys(importPreview).filter((k) => Array.isArray(importPreview[k]))
    : [];

  return (
    <SparkPageShell
      title="Configuration Backup"
      subtitle="Export and import tenant configuration"
      help="Download your tenant's SPARK configuration as a JSON file: dashboards, reports, custom fields, saved searches, workflow triggers, anomaly rules, templates, quiet hours, and rate-limit settings. Import is additive — it skips items whose name/key already exists."
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Export card */}
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-2 mb-2">
            <Download className="h-5 w-5 text-[#EF6C33]" />
            <h3 className="text-sm font-bold text-slate-900">Export</h3>
          </div>
          <p className="text-xs text-slate-600 mb-4">
            Download all user-defined SPARK configuration for this tenant as a single JSON file.
            Contact/activity data is NOT included.
          </p>
          <button
            onClick={exportConfig}
            disabled={exporting || !ready}
            className="w-full text-sm px-3 py-2 rounded bg-[#EF6C33] text-white disabled:opacity-50 flex items-center justify-center gap-1"
          >
            <Download className="h-4 w-4" /> {exporting ? "Building export…" : "Download configuration backup"}
          </button>
        </div>

        {/* Import card */}
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-2 mb-2">
            <Upload className="h-5 w-5 text-[#EF6C33]" />
            <h3 className="text-sm font-bold text-slate-900">Import</h3>
          </div>
          <p className="text-xs text-slate-600 mb-4">
            Upload a previously exported file. Existing items keep their settings — only new items are added.
          </p>
          <label className="block w-full cursor-pointer rounded border border-dashed border-slate-300 bg-slate-50 p-3 text-center text-xs text-slate-600 hover:bg-slate-100 mb-2">
            <FileJson className="h-5 w-5 mx-auto text-slate-400 mb-1" />
            Click to choose a backup file
            <input type="file" accept="application/json" onChange={onFileChange} className="hidden" />
          </label>

          {importError && (
            <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1.5 flex items-center gap-1 mb-2">
              <AlertCircle className="h-3.5 w-3.5" /> {importError}
            </div>
          )}

          {importPreview && (
            <div className="rounded border border-slate-200 bg-slate-50 p-2 text-xs text-slate-700">
              <div className="font-semibold mb-1">Backup contents:</div>
              <ul className="space-y-0.5">
                {previewKeys.map((k) => (
                  <li key={k}>{k}: <span className="font-mono">{(importPreview[k] as unknown[]).length}</span></li>
                ))}
              </ul>
              <button
                onClick={runImport}
                disabled={importing}
                className="mt-2 w-full text-xs px-2 py-1.5 rounded bg-[#EF6C33] text-white disabled:opacity-50 flex items-center justify-center gap-1"
              >
                <Upload className="h-3.5 w-3.5" /> {importing ? "Importing…" : "Run import"}
              </button>
            </div>
          )}

          {importResult && (
            <div className={`mt-2 text-xs rounded border px-2 py-1.5 flex items-start gap-1 ${importResult.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-700"}`}>
              {importResult.ok ? <Check className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" /> : <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />}
              {importResult.error ? (
                <div>{importResult.error}</div>
              ) : (
                <div>
                  {importResult.ok ? "Import complete." : `Import finished with ${importResult.failed_total} failure(s).`}
                  <ul className="mt-0.5 space-y-0.5 font-mono">
                    {Object.entries(importResult.imported || {}).map(([k, v]) => (
                      <li key={k}>
                        {k}: added {v?.inserted ?? 0}
                        {v?.skipped_existing ? `, already there ${v.skipped_existing}` : ""}
                        {v?.failed ? `, FAILED ${v.failed}` : ""}
                        {v?.first_error ? ` — ${v.first_error}` : ""}
                      </li>
                    ))}
                  </ul>
                  {!!importResult.not_imported?.length && (
                    <div className="mt-1 not-italic">
                      Not restored (no importer for these yet — they stay in your file):{" "}
                      <span className="font-mono">
                        {importResult.not_imported.map((n) => `${n.section} (${n.in_file})`).join(", ")}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </SparkPageShell>
  );
}

export default SparkConfigBackupPage;
