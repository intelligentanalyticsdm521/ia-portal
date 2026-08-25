// ReportLibraryPage — saved reports, grouped by folder, runnable in place.
//
// Opening a report RUNS it rather than showing a config, because the question
// someone has when they click "Spend by month" is "what is it", not "how was it
// built". Editing is a link back to the builder.
import { useCallback, useEffect, useState } from "react";
import { Star, Play, Trash2, Download, FolderOpen, Pencil } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { StellaShell, STELLA_INDIGO, STELLA_LAVENDER } from "../StellaShell";
import { useStellaApi } from "../../../hooks/useStellaApi";
import { stellaExportDownload } from "./exportDownload";
import { useMsal } from "@azure/msal-react";
import { useActiveAccount } from "../../../auth/useAccessToken";
import { useClientTenantIdOverride } from "../../../lib/clientTenantContext";
import {
  DbCard, DbError, DbLoading, DbButton, DbSelect, DbEmpty, DbNotice, useNotice, Pill, CapLine,
} from "../dbmanager/DbManagerKit";
import { ReportChart, CHART_LABEL, type RunResult } from "./ReportKit";

type Saved = {
  saved_report_id: string; name: string; description: string | null; folder: string | null;
  chart_type: string | null; visibility: string; is_favorite: boolean;
  base_view_key: string; summary: string | null; last_run_at: string | null;
};

export function StellaReportLibraryPage() {
  const api = useStellaApi();
  const nav = useNavigate();
  const { instance } = useMsal();
  const account = useActiveAccount();
  const tenantOverride = useClientTenantIdOverride();

  const [rows, setRows] = useState<Saved[] | null>(null);
  const [meta, setMeta] = useState<{ folders: string[]; limit: number | null; used: number } | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [notice, showNotice] = useNotice();
  const [open, setOpen] = useState<Saved | null>(null);
  const [result, setResult] = useState<RunResult | null>(null);
  const [chart, setChart] = useState("bar");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    if (!api.ready) return;
    api.getFull<{ data: Saved[]; meta: typeof meta }>("/reporting/saved")
      .then((r) => { setRows(r.data); setMeta(r.meta); }).catch(setError);
  }, [api]);
  useEffect(() => { load(); }, [load]);

  const run = useCallback(async (rep: Saved) => {
    setOpen(rep); setResult(null); setError(null);
    setChart(rep.chart_type || "bar");
    try {
      setResult(await api.postFull<RunResult>(`/reporting/saved/${rep.saved_report_id}/run`, {}));
    } catch (e) { setError(e); }
  }, [api]);

  async function toggleFav(rep: Saved) {
    try { await api.patch(`/reporting/saved/${rep.saved_report_id}`, { is_favorite: !rep.is_favorite }); load(); }
    catch (e) { setError(e); }
  }

  async function remove(rep: Saved) {
    if (!window.confirm(`Delete “${rep.name}”?`)) return;
    setBusy(true); setError(null);
    try {
      await api.del(`/reporting/saved/${rep.saved_report_id}`);
      showNotice(`Deleted “${rep.name}”.`);
      if (open?.saved_report_id === rep.saved_report_id) setOpen(null);
      load();
    } catch (e) {
      const d = (e as { details?: string })?.details;
      setError(d ? { message: d } : e);
    } finally { setBusy(false); }
  }

  async function download(rep: Saved, format: string) {
    setError(null);
    try {
      await stellaExportDownload(instance, account, { saved_report_id: rep.saved_report_id, format }, `${rep.name}.${format}`, tenantOverride);
    } catch (e) { setError(e); }
  }

  const folders = rows ? [...new Set(rows.map((r) => r.folder || "Ungrouped"))].sort() : [];

  return (
    <StellaShell
      title="Report Library"
      subtitle="Reports you've saved — run them, share them, schedule them, or export what they show."
      actions={<DbButton onClick={() => nav("/app/services/stella_report_builder")}>Build a new report</DbButton>}
    >
      <DbNotice text={notice} />
      <DbError error={error} />

      {open ? (
        <DbCard
          title={open.name}
          actions={
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <DbSelect value={chart} onChange={(e) => setChart(e.target.value)} style={{ width: 128 }}>
                {Object.entries(CHART_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </DbSelect>
              <DbSelect defaultValue="" style={{ width: 122 }}
                onChange={(e) => { if (e.target.value) { download(open, e.target.value); e.target.value = ""; } }}>
                <option value="">Export…</option>
                <option value="csv">CSV</option>
                <option value="xlsx">Excel</option>
                <option value="pdf">PDF</option>
              </DbSelect>
              <DbButton variant="ghost" onClick={() => setOpen(null)}>Back to library</DbButton>
            </div>
          }
        >
          {open.description && <div style={{ fontSize: 11, color: "#5A7A8A", marginBottom: 12 }}>{open.description}</div>}
          {!result ? <DbLoading /> : <ReportChart result={result} chartType={chart} height={340} />}
        </DbCard>
      ) : !rows ? <DbLoading /> : rows.length === 0 ? (
        <DbCard>
          <DbEmpty
            title="No saved reports yet"
            reason="Build one in the Report Builder and save it here — then it can be scheduled, exported, or pinned to a dashboard."
          />
        </DbCard>
      ) : (
        <>
          {meta && <div style={{ marginBottom: 12 }}><CapLine used={meta.used} limit={meta.limit} noun="saved reports" /></div>}
          <div style={{ display: "grid", gap: 16 }}>
            {folders.map((folder) => (
              <DbCard key={folder} title={folder === "Ungrouped" ? "Ungrouped" : folder}>
                <div style={{ display: "grid", gap: 8 }}>
                  {rows.filter((r) => (r.folder || "Ungrouped") === folder).map((r) => (
                    <div key={r.saved_report_id} style={{
                      display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
                      border: `1px solid ${STELLA_LAVENDER}`, borderRadius: 8,
                    }}>
                      <button onClick={() => toggleFav(r)} title={r.is_favorite ? "Remove from favourites" : "Add to favourites"}
                        style={{ background: "none", border: 0, cursor: "pointer", padding: 0, lineHeight: 1 }}>
                        <Star size={15} color={r.is_favorite ? "#F79009" : "#CBD5E1"} fill={r.is_favorite ? "#F79009" : "none"} />
                      </button>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#0B1C24" }}>{r.name}</div>
                        <div style={{ fontSize: 10, color: "#94A3B8" }}>{r.summary || r.description || r.base_view_key}</div>
                      </div>
                      {r.visibility === "private" && <Pill>only me</Pill>}
                      {r.last_run_at && <Pill>last run {String(r.last_run_at).slice(0, 10)}</Pill>}
                      <DbButton onClick={() => run(r)}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><Play size={12} /> Run</span>
                      </DbButton>
                      <DbButton variant="danger" onClick={() => remove(r)} disabled={busy}><Trash2 size={12} /></DbButton>
                    </div>
                  ))}
                </div>
              </DbCard>
            ))}
          </div>
        </>
      )}
    </StellaShell>
  );
}
