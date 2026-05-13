// SparkScheduledReportsPage — saved report definitions with cadence.
import { useCallback, useEffect, useState } from "react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { SparkPageShell } from "../../components/spark/SparkPageShell";
import { Plus, Trash2, Play, Mail } from "lucide-react";

type Cadence = "daily" | "weekly" | "monthly";

interface ReportRow {
  id: number;
  name: string;
  report_type: string;
  config_json: string | null;
  cadence: Cadence;
  weekday: number | null;
  day_of_month: number | null;
  hour_utc: number;
  recipients: string;
  is_active: boolean;
  last_run_at: string | null;
  next_run_at: string | null;
  created_by: string | null;
}

const REPORT_TYPES: { key: string; label: string; desc: string }[] = [
  { key: "campaign_summary", label: "Campaign summary", desc: "Top 50 campaigns + opens/clicks" },
  { key: "lead_gen_digest",  label: "Lead Gen digest",  desc: "Top 20 leads by score" },
  { key: "deliverability",   label: "Deliverability",   desc: "Sent/delivered/open/click/bounce totals" },
  { key: "attribution",      label: "Attribution",      desc: "Channel touch counts" },
];

const DOW = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function fmt(d: string | null) { return d ? new Date(d).toLocaleString() : "—"; }
function hourLabel(h: number) { const am = h < 12; const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h; return `${h12}${am ? "am" : "pm"} UTC`; }

export function SparkScheduledReportsPage() {
  const { get, post, del, ready } = useSparkApi();
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", report_type: "campaign_summary", cadence: "weekly" as Cadence, weekday: 1, day_of_month: 1, hour_utc: 13, recipients: "", days: 30 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const fetchList = useCallback(async () => {
    if (!ready) return;
    setLoading(true); setError(null);
    try {
      const r = await get<{ data: ReportRow[] }>("/api/v1/scheduled-reports");
      setRows(r?.data || []);
    } catch (err) { setError(err); }
    finally { setLoading(false); }
  }, [get, ready]);

  useEffect(() => { fetchList(); }, [fetchList]);

  async function create() {
    try {
      await post("/api/v1/scheduled-reports", {
        name: form.name, report_type: form.report_type,
        cadence: form.cadence,
        weekday: form.cadence === "weekly" ? form.weekday : null,
        day_of_month: form.cadence === "monthly" ? form.day_of_month : null,
        hour_utc: form.hour_utc,
        recipients: form.recipients.split(",").map(s => s.trim()).filter(Boolean),
        config: { days: form.days },
      });
      setCreating(false);
      setForm({ name: "", report_type: "campaign_summary", cadence: "weekly", weekday: 1, day_of_month: 1, hour_utc: 13, recipients: "", days: 30 });
      await fetchList();
    } catch (err) { alert(`Failed: ${(err as Error).message}`); }
  }

  async function runNow(id: number) {
    try {
      await post(`/api/v1/scheduled-reports/${id}/run-now`, {});
      alert("Report generated and emailed to recipients.");
      await fetchList();
    } catch (err) { alert(`Failed: ${(err as Error).message}`); }
  }

  async function remove(id: number) {
    if (!confirm("Delete this scheduled report?")) return;
    try { await del(`/api/v1/scheduled-reports/${id}`); await fetchList(); }
    catch (err) { alert(`Failed: ${(err as Error).message}`); }
  }

  return (
    <SparkPageShell
      title="Scheduled reports"
      subtitle={`${rows.length} report${rows.length === 1 ? "" : "s"}`}
      help="Save report configurations with a cadence (daily / weekly / monthly). The runner generates the report and emails it to the recipient list at the scheduled time. Use 'Run now' to send immediately for testing."
      actions={
        <button onClick={() => setCreating(true)} className="text-sm px-3 py-1.5 rounded bg-[#EF6C33] text-white flex items-center gap-1">
          <Plus className="h-4 w-4" /> New report
        </button>
      }
      loading={loading}
      error={error}
    >
      <div className="overflow-x-auto">
        <table className="spark-table">
          <thead><tr>
            <th>Name</th><th>Type</th><th>Cadence</th><th>Hour</th><th>Recipients</th><th>Last run</th><th>Next run</th><th></th>
          </tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={8} className="text-center text-sm text-slate-500 py-8">No scheduled reports yet.</td></tr>}
            {rows.map(r => (
              <tr key={r.id}>
                <td className="font-medium">{r.name}</td>
                <td className="text-xs"><span className="px-2 py-0.5 rounded bg-slate-100">{r.report_type}</span></td>
                <td className="text-xs capitalize">{r.cadence}{r.cadence === "weekly" && r.weekday ? ` (${DOW[r.weekday]})` : ""}{r.cadence === "monthly" && r.day_of_month ? ` (day ${r.day_of_month})` : ""}</td>
                <td className="text-xs">{hourLabel(r.hour_utc)}</td>
                <td className="text-xs text-slate-600 max-w-[200px] truncate" title={r.recipients}>{r.recipients}</td>
                <td className="text-xs text-slate-500">{fmt(r.last_run_at)}</td>
                <td className="text-xs text-slate-500">{fmt(r.next_run_at)}</td>
                <td>
                  <div className="flex items-center gap-1">
                    <button onClick={() => runNow(r.id)} className="text-xs px-2 py-0.5 rounded border border-[#EF6C33] text-[#EF6C33] flex items-center gap-1">
                      <Play className="h-3 w-3" /> Run
                    </button>
                    <button onClick={() => remove(r.id)} className="text-xs px-2 py-0.5 rounded text-rose-600 hover:bg-rose-50">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {creating && (
        <div className="fixed inset-0 bg-slate-900/30 z-50 flex items-center justify-center p-4" onClick={() => setCreating(false)}>
          <div className="bg-white rounded-xl w-full max-w-lg p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="text-base font-semibold">New scheduled report</div>
            <Input label="Name" value={form.name} onChange={v => setForm({ ...form, name: v })} />
            <div>
              <label className="text-[10px] uppercase text-slate-500 font-semibold">Report type</label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                {REPORT_TYPES.map(t => (
                  <button key={t.key} onClick={() => setForm({ ...form, report_type: t.key })}
                    className={`text-left p-2 rounded border ${form.report_type === t.key ? "border-[#EF6C33] bg-[#FFF6F0]" : "border-slate-200"}`}>
                    <div className="text-xs font-semibold">{t.label}</div>
                    <div className="text-[10px] text-slate-500">{t.desc}</div>
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] uppercase text-slate-500 font-semibold">Cadence</label>
                <select value={form.cadence} onChange={(e) => setForm({ ...form, cadence: e.target.value as Cadence })}
                  className="w-full text-sm border border-slate-300 rounded p-1.5">
                  <option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] uppercase text-slate-500 font-semibold">Window (days)</label>
                <input type="number" value={form.days} onChange={(e) => setForm({ ...form, days: Number(e.target.value) })}
                  className="w-full text-sm border border-slate-300 rounded p-1.5" />
              </div>
            </div>
            {form.cadence === "weekly" && (
              <div>
                <label className="text-[10px] uppercase text-slate-500 font-semibold">Day of week</label>
                <select value={form.weekday} onChange={(e) => setForm({ ...form, weekday: Number(e.target.value) })}
                  className="w-full text-sm border border-slate-300 rounded p-1.5">
                  {[1, 2, 3, 4, 5, 6, 7].map(d => <option key={d} value={d}>{DOW[d]}</option>)}
                </select>
              </div>
            )}
            {form.cadence === "monthly" && (
              <Input label="Day of month (1-28)" value={String(form.day_of_month)} onChange={v => setForm({ ...form, day_of_month: Math.min(28, Number(v) || 1) })} />
            )}
            <div>
              <label className="text-[10px] uppercase text-slate-500 font-semibold">Hour (UTC, 0-23)</label>
              <input type="number" min={0} max={23} value={form.hour_utc} onChange={(e) => setForm({ ...form, hour_utc: Number(e.target.value) })}
                className="w-full text-sm border border-slate-300 rounded p-1.5" />
            </div>
            <Input label="Recipients (comma-separated emails)" value={form.recipients} onChange={v => setForm({ ...form, recipients: v })} />
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setCreating(false)} className="text-sm px-3 py-1.5 rounded border border-slate-200">Cancel</button>
              <button disabled={!form.name || !form.recipients} onClick={create}
                className="text-sm px-3 py-1.5 rounded bg-[#EF6C33] text-white disabled:opacity-50 flex items-center gap-1">
                <Mail className="h-3 w-3" /> Schedule
              </button>
            </div>
          </div>
        </div>
      )}
    </SparkPageShell>
  );
}

function Input({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">{label}</label>
      <input value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full text-sm border border-slate-300 rounded p-1.5 mt-0.5" />
    </div>
  );
}

export default SparkScheduledReportsPage;
