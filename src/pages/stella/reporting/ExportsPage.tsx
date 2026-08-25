// ExportsPage — export any saved report, and see everything that has ever run.
//
// One history for manual exports AND scheduled runs, because "what did we send
// and when" should have one answer rather than two places to check.
import { useCallback, useEffect, useState } from "react";
import { Download, FileSpreadsheet, FileText, Table2 } from "lucide-react";
import { StellaShell, STELLA_INDIGO, STELLA_LAVENDER } from "../StellaShell";
import { useStellaApi } from "../../../hooks/useStellaApi";
import { stellaExportDownload } from "./exportDownload";
import { useMsal } from "@azure/msal-react";
import { useActiveAccount } from "../../../auth/useAccessToken";
import { useClientTenantIdOverride } from "../../../lib/clientTenantContext";
import {
  DbCard, DbError, DbLoading, DbButton, DbTable, DbEmpty, DbNotice, useNotice, Pill,
} from "../dbmanager/DbManagerKit";

type Saved = { saved_report_id: string; name: string; folder: string | null; summary: string | null };
type Run = {
  report_run_id: string; report_name: string | null; run_at: string; status: string;
  row_count: number | null; format: string | null; file_name: string | null;
  scheduled_report_id: string | null; error_message: string | null;
};

const FORMATS = [
  { key: "csv", label: "CSV", icon: Table2, note: "Opens anywhere" },
  { key: "xlsx", label: "Excel", icon: FileSpreadsheet, note: "Formatted, filterable" },
  { key: "pdf", label: "PDF", icon: FileText, note: "For sending on" },
];

export function StellaExportsPage() {
  const api = useStellaApi();
  const { instance } = useMsal();
  const account = useActiveAccount();
  const tenantOverride = useClientTenantIdOverride();

  const [reports, setReports] = useState<Saved[] | null>(null);
  const [runs, setRuns] = useState<Run[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [notice, showNotice] = useNotice();
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!api.ready) return;
    api.getFull<{ data: Saved[] }>("/reporting/saved").then((r) => setReports(r.data)).catch(setError);
    api.get<Run[]>("/reporting/runs").then(setRuns).catch(() => setRuns([]));
  }, [api]);
  useEffect(() => { load(); }, [load]);

  async function download(rep: Saved, format: string) {
    setBusy(`${rep.saved_report_id}:${format}`); setError(null);
    try {
      await stellaExportDownload(instance, account, { saved_report_id: rep.saved_report_id, format }, `${rep.name}.${format}`, tenantOverride);
      showNotice(`Exported “${rep.name}” as ${format.toUpperCase()}.`);
      load();
    } catch (e) { setError(e); } finally { setBusy(null); }
  }

  return (
    <StellaShell
      title="Exports"
      subtitle="Take any saved report out as a spreadsheet or a PDF — and see everything that has run."
    >
      <DbNotice text={notice} />
      <DbError error={error} />

      <DbCard title="Export a report">
        <div style={{ fontSize: 11, color: "#5A7A8A", marginBottom: 12 }}>
          Charts are exported as pictures from the report itself — open a report in the library and use its
          Export menu for that. Here you get the data behind it.
        </div>
        {!reports ? <DbLoading /> : reports.length === 0 ? (
          <DbEmpty title="No saved reports yet" reason="Build and save a report first, then export it from here." />
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {reports.map((r) => (
              <div key={r.saved_report_id} style={{
                display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
                border: `1px solid ${STELLA_LAVENDER}`, borderRadius: 8,
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#0B1C24" }}>{r.name}</div>
                  <div style={{ fontSize: 10, color: "#94A3B8" }}>{r.summary || r.folder || ""}</div>
                </div>
                {FORMATS.map((f) => (
                  <DbButton
                    key={f.key} variant="ghost" title={f.note}
                    onClick={() => download(r, f.key)}
                    disabled={busy === `${r.saved_report_id}:${f.key}`}
                  >
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                      <f.icon size={12} /> {busy === `${r.saved_report_id}:${f.key}` ? "…" : f.label}
                    </span>
                  </DbButton>
                ))}
              </div>
            ))}
          </div>
        )}
      </DbCard>

      <div style={{ height: 16 }} />

      <DbCard title="Everything that has run">
        {!runs ? <DbLoading /> : (
          <DbTable
            columns={[
              { key: "run_at", label: "When", type: "datetime" },
              { key: "report_name", label: "Report" },
              { key: "kind", label: "Kind" },
              { key: "format", label: "Format" },
              { key: "row_count", label: "Rows", type: "int" },
              { key: "state", label: "Status" },
            ]}
            rows={runs.map((r) => ({
              ...r,
              report_name: r.report_name || <span style={{ color: "#C7D0DB" }}>(deleted report)</span>,
              kind: r.scheduled_report_id ? <Pill tone="brand">scheduled</Pill> : <Pill>manual</Pill>,
              format: r.format ? <Pill>{r.format.toUpperCase()}</Pill> : null,
              state: r.status === "ok"
                ? <Pill tone="good">ok</Pill>
                : <span title={r.error_message || undefined}><Pill tone="bad">failed</Pill></span>,
            })) as never}
            empty={<DbEmpty title="Nothing has run yet" reason="Export a report above, or set one on a schedule." />}
          />
        )}
      </DbCard>
    </StellaShell>
  );
}
