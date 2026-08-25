// ScheduledReportsPage — reports that run themselves.
//
// Two things this page insists on:
//   "Run it now" — because waiting a month to discover the format was wrong is
//   not a test, and a schedule nobody has ever seen fire is a promise, not a
//   feature.
//   Visible failure — last_status/last_error are shown in the list. A schedule
//   that has been failing silently since March is the actual failure mode here.
import { useCallback, useEffect, useState } from "react";
import { Plus, Play, Trash2, Pause, CircleCheck, TriangleAlert } from "lucide-react";
import { StellaShell, STELLA_LAVENDER } from "../StellaShell";
import { useStellaApi } from "../../../hooks/useStellaApi";
import {
  DbCard, DbError, DbLoading, DbButton, DbSelect, DbField, DbTable,
  DbEmpty, DbNotice, useNotice, Pill, DbModal, CapLine,
} from "../dbmanager/DbManagerKit";

type Sched = {
  scheduled_report_id: string; saved_report_id: string; report_name: string | null; name: string | null;
  cadence: string; next_run_at: string | null; delivery_type: string; is_active: boolean;
  last_run_at: string | null; last_status: string | null; last_error: string | null;
  delivery: { format?: string; recipients?: string[] };
};
type Saved = { saved_report_id: string; name: string };
type Run = {
  report_run_id: string; report_name: string | null; run_at: string; status: string;
  row_count: number | null; format: string | null; file_name: string | null; error_message: string | null;
};

export function StellaScheduledReportsPage() {
  const api = useStellaApi();
  const [rows, setRows] = useState<Sched[] | null>(null);
  const [meta, setMeta] = useState<{ limit: number | null; used: number; cadences: string[] } | null>(null);
  const [reports, setReports] = useState<Saved[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [notice, showNotice] = useNotice();
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ saved_report_id: "", cadence: "monthly", format: "xlsx", delivery_type: "portal" });

  const load = useCallback(() => {
    if (!api.ready) return;
    api.getFull<{ data: Sched[]; meta: typeof meta }>("/reporting/scheduled")
      .then((r) => { setRows(r.data); setMeta(r.meta); }).catch(setError);
    api.get<Run[]>("/reporting/runs").then(setRuns).catch(() => setRuns([]));
  }, [api]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!api.ready) return;
    api.getFull<{ data: Saved[] }>("/reporting/saved").then((r) => setReports(r.data)).catch(() => setReports([]));
  }, [api]);

  async function create() {
    setBusy(true); setError(null);
    try {
      await api.post("/reporting/scheduled", form);
      showNotice("Schedule created. Use “Run it now” to check it does what you expect.");
      setCreating(false); setForm({ saved_report_id: "", cadence: "monthly", format: "xlsx", delivery_type: "portal" });
      load();
    } catch (e) { setError(e); } finally { setBusy(false); }
  }

  async function runNow(s: Sched) {
    setBusy(true); setError(null);
    try {
      const r = await api.post<{ row_count: number; file_name: string; note: string }>(`/reporting/scheduled/${s.scheduled_report_id}/run-now`, {});
      showNotice(`Ran now — ${r.row_count} rows into ${r.file_name}. ${r.note}`);
      load();
    } catch (e) { setError(e); } finally { setBusy(false); }
  }

  async function toggle(s: Sched) {
    try { await api.patch(`/reporting/scheduled/${s.scheduled_report_id}`, { is_active: !s.is_active }); load(); }
    catch (e) { setError(e); }
  }

  async function remove(s: Sched) {
    if (!window.confirm("Delete this schedule? The report itself is kept.")) return;
    setBusy(true);
    try { await api.del(`/reporting/scheduled/${s.scheduled_report_id}`); showNotice("Schedule deleted."); load(); }
    catch (e) { setError(e); } finally { setBusy(false); }
  }

  return (
    <StellaShell
      title="Scheduled Reports"
      subtitle="Reports that run on their own — daily, weekly, monthly or quarterly."
      actions={<DbButton onClick={() => setCreating(true)}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Plus size={13} /> Schedule a report</span>
      </DbButton>}
    >
      <DbNotice text={notice} />
      <DbError error={error} />

      <DbCard
        title="Schedules"
        actions={meta ? <CapLine used={meta.used} limit={meta.limit} noun="schedules" /> : null}
      >
        <div style={{ fontSize: 11, color: "#5A7A8A", marginBottom: 12 }}>
          Runs land in <strong>Report history</strong> below, ready to download. Use <strong>Run it now</strong> on a new
          schedule rather than waiting a month to find out it wasn't what you wanted.
        </div>
        {!rows ? <DbLoading /> : rows.length === 0 ? (
          <DbEmpty title="Nothing scheduled" reason="Pick a saved report and a cadence, and STELLA will run it for you." />
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {rows.map((s) => (
              <div key={s.scheduled_report_id} style={{
                display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
                border: `1px solid ${STELLA_LAVENDER}`, borderRadius: 8,
                opacity: s.is_active ? 1 : 0.6,
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#0B1C24" }}>{s.report_name || s.name}</div>
                  <div style={{ fontSize: 10, color: "#94A3B8" }}>
                    {s.cadence} · {(s.delivery?.format || "csv").toUpperCase()} ·
                    {s.next_run_at ? ` next ${String(s.next_run_at).slice(0, 10)}` : " not scheduled"}
                  </div>
                </div>
                {/* A failing schedule says so here rather than only in a log. */}
                {s.last_status === "failed" ? (
                  <span title={s.last_error || undefined} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                    <TriangleAlert size={13} color="#B42318" />
                    <Pill tone="bad">last run failed</Pill>
                  </span>
                ) : s.last_status === "ok" ? (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                    <CircleCheck size={13} color="#027A48" />
                    <Pill tone="good">ran {String(s.last_run_at).slice(0, 10)}</Pill>
                  </span>
                ) : <Pill>never run</Pill>}
                {!s.is_active && <Pill tone="warn">paused</Pill>}
                <DbButton variant="ghost" onClick={() => runNow(s)} disabled={busy}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><Play size={12} /> Run it now</span>
                </DbButton>
                <DbButton variant="ghost" onClick={() => toggle(s)} disabled={busy} title={s.is_active ? "Pause" : "Resume"}>
                  <Pause size={12} />
                </DbButton>
                <DbButton variant="danger" onClick={() => remove(s)} disabled={busy}><Trash2 size={12} /></DbButton>
              </div>
            ))}
          </div>
        )}
        {rows?.some((s) => s.last_status === "failed") && (
          <div style={{
            marginTop: 12, padding: "9px 12px", borderRadius: 8,
            background: "#FEF3F2", border: "1px solid #FDA29B", fontSize: 11, color: "#B42318", lineHeight: 1.5,
          }}>
            {rows.filter((s) => s.last_status === "failed").map((s) => (
              <div key={s.scheduled_report_id}>
                <strong>{s.report_name || s.name}</strong>: {s.last_error || "the last run failed"}
              </div>
            ))}
          </div>
        )}
      </DbCard>

      <div style={{ height: 16 }} />

      <DbCard title="Report history">
        <DbTable
          columns={[
            { key: "run_at", label: "When", type: "datetime" },
            { key: "report_name", label: "Report" },
            { key: "format", label: "Format" },
            { key: "row_count", label: "Rows", type: "int" },
            { key: "state", label: "Status" },
            { key: "file_name", label: "File" },
          ]}
          rows={runs.map((r) => ({
            ...r,
            format: r.format ? <Pill>{r.format.toUpperCase()}</Pill> : null,
            state: r.status === "ok"
              ? <Pill tone="good">ok</Pill>
              : <span title={r.error_message || undefined}><Pill tone="bad">failed</Pill></span>,
          })) as never}
          empty={<DbEmpty title="No runs yet" reason="Exports and scheduled runs both show up here." />}
        />
      </DbCard>

      {creating && (
        <DbModal title="Schedule a report" onClose={() => setCreating(false)} width={460}>
          <div style={{ display: "grid", gap: 12 }}>
            <DbField label="Which report?">
              <DbSelect value={form.saved_report_id} onChange={(e) => setForm({ ...form, saved_report_id: e.target.value })}>
                <option value="">— pick a saved report —</option>
                {reports.map((r) => <option key={r.saved_report_id} value={r.saved_report_id}>{r.name}</option>)}
              </DbSelect>
            </DbField>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <DbField label="How often">
                <DbSelect value={form.cadence} onChange={(e) => setForm({ ...form, cadence: e.target.value })}>
                  {(meta?.cadences || ["daily", "weekly", "monthly", "quarterly"]).map((c) => <option key={c} value={c}>{c}</option>)}
                </DbSelect>
              </DbField>
              <DbField label="Format">
                <DbSelect value={form.format} onChange={(e) => setForm({ ...form, format: e.target.value })}>
                  <option value="xlsx">Excel</option>
                  <option value="csv">CSV</option>
                  <option value="pdf">PDF</option>
                </DbSelect>
              </DbField>
            </div>
            <div style={{ fontSize: 11, color: "#5A7A8A", lineHeight: 1.5 }}>
              Runs are saved to <strong>Report history</strong> where you can download them. Email delivery uses the
              platform notification path when it is set up — the file is kept here either way.
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              <DbButton onClick={create} disabled={busy || !form.saved_report_id}>{busy ? "Scheduling…" : "Schedule it"}</DbButton>
              <DbButton variant="ghost" onClick={() => setCreating(false)}>Cancel</DbButton>
            </div>
          </div>
        </DbModal>
      )}
    </StellaShell>
  );
}
