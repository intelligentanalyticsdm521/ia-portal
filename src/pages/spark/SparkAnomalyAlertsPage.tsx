// SparkAnomalyAlertsPage — Anomaly detection rules + active alerts (v1.19).
import { useCallback, useEffect, useState } from "react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { SparkPageShell } from "../../components/spark/SparkPageShell";
import {
  AlertTriangle,
  AlertCircle,
  Info,
  Bell,
  BellOff,
  Check,
  X,
  Plus,
  Trash2,
  Mail,
} from "lucide-react";

type Severity = "info" | "warn" | "critical";
type Comparator = ">" | "<" | ">=" | "<=" | "spike" | "drop";

interface Rule {
  id: number;
  name: string;
  metric: string;
  comparator: Comparator;
  threshold: number;
  window_minutes: number;
  baseline_days: number;
  severity: Severity;
  is_active: boolean;
  last_evaluated_at: string | null;
  last_value: number | null;
  created_at: string;
}

interface Alert {
  id: number;
  rule_id: number;
  rule_name: string | null;
  severity: Severity;
  metric: string;
  observed: number;
  baseline: number | null;
  summary: string;
  status: "open" | "acknowledged" | "resolved" | "muted";
  acknowledged_by: string | null;
  acknowledged_at: string | null;
  occurred_at: string;
}

const METRICS = [
  { value: "sms_send_rate", label: "SMS send rate" },
  { value: "email_bounce_rate", label: "Email bounce rate" },
  { value: "unsubscribe_rate", label: "Email unsubscribe rate" },
  { value: "new_contact_rate", label: "New contact rate" },
  { value: "inbound_webhook_failures", label: "Inbound webhook failures" },
  { value: "activity_volume", label: "Activity volume" },
];

const SEV_META: Record<Severity, { color: string; icon: typeof AlertCircle; label: string }> = {
  info: { color: "#2563EB", icon: Info, label: "Info" },
  warn: { color: "#EAB308", icon: AlertTriangle, label: "Warn" },
  critical: { color: "#DC2626", icon: AlertCircle, label: "Critical" },
};

export function SparkAnomalyAlertsPage() {
  const { get, post, patch, del, ready } = useSparkApi();
  const [rules, setRules] = useState<Rule[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [subs, setSubs] = useState<Array<{ id: number; email: string; min_severity: Severity; created_at: string }>>([]);
  const [tab, setTab] = useState<"alerts" | "rules" | "subs">("alerts");
  const [subEmail, setSubEmail] = useState("");
  const [subMinSev, setSubMinSev] = useState<Severity>("warn");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [alertStatus, setAlertStatus] = useState<"open" | "acknowledged" | "resolved" | "muted" | "all">("open");

  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    name: "",
    metric: "sms_send_rate",
    comparator: ">" as Comparator,
    threshold: 100,
    window_minutes: 60,
    baseline_days: 7,
    severity: "warn" as Severity,
  });

  const fetchAll = useCallback(async () => {
    if (!ready) return;
    setLoading(true); setError(null);
    try {
      const [r, a, s] = await Promise.all([
        get<{ data: Rule[] }>("/api/v1/anomaly-rules"),
        get<{ data: Alert[] }>(`/api/v1/anomaly-alerts?status=${alertStatus}`),
        get<{ data: typeof subs }>("/api/v1/anomaly-subscribers").catch(() => ({ data: [] })),
      ]);
      setRules(r?.data || []);
      setAlerts(a?.data || []);
      setSubs(s?.data || []);
    } catch (err) { setError(err); }
    finally { setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [get, ready, alertStatus]);
  useEffect(() => { fetchAll(); }, [fetchAll]);

  async function addSubscriber() {
    if (!/^[^@]+@[^@]+\.[^@]+$/.test(subEmail.trim())) return;
    try {
      await post("/api/v1/anomaly-subscribers", { email: subEmail.trim(), min_severity: subMinSev });
      setSubEmail("");
      await fetchAll();
    } catch (err) { alert(`Failed: ${(err as Error).message}`); }
  }
  async function removeSubscriber(id: number) {
    if (!confirm("Remove this subscriber?")) return;
    try { await del(`/api/v1/anomaly-subscribers/${id}`); await fetchAll(); }
    catch (err) { alert(`Failed: ${(err as Error).message}`); }
  }

  async function createRule() {
    if (!form.name.trim()) return;
    try {
      await post("/api/v1/anomaly-rules", form);
      setCreating(false);
      setForm({ name: "", metric: "sms_send_rate", comparator: ">", threshold: 100, window_minutes: 60, baseline_days: 7, severity: "warn" });
      await fetchAll();
    } catch (err) { alert(`Failed: ${(err as Error).message}`); }
  }
  async function toggleRule(r: Rule) {
    try { await patch(`/api/v1/anomaly-rules/${r.id}`, { is_active: !r.is_active }); await fetchAll(); }
    catch (err) { alert(`Failed: ${(err as Error).message}`); }
  }
  async function deleteRule(id: number) {
    if (!confirm("Delete this rule? Existing alerts stay.")) return;
    try { await del(`/api/v1/anomaly-rules/${id}`); await fetchAll(); }
    catch (err) { alert(`Failed: ${(err as Error).message}`); }
  }

  async function alertAction(id: number, action: "ack" | "resolve" | "mute") {
    try { await post(`/api/v1/anomaly-alerts/${id}/${action}`, {}); await fetchAll(); }
    catch (err) { alert(`Failed: ${(err as Error).message}`); }
  }

  const openCount = alerts.filter(a => a.status === "open").length;

  return (
    <SparkPageShell
      title="Anomaly Alerts"
      subtitle={`${rules.filter(r => r.is_active).length} active rules · ${openCount} open alerts`}
      help="Define rules to flag unexpected metric movements (e.g. SMS sends >3× baseline, bounce rate >5%). The detector runs every minute and raises alerts you can acknowledge / resolve / mute."
      actions={
        tab === "rules" && (
          <button onClick={() => setCreating(true)} className="text-sm px-3 py-1.5 rounded bg-[#EF6C33] text-white flex items-center gap-1">
            <Plus className="h-4 w-4" /> New rule
          </button>
        )
      }
      loading={loading}
      error={error}
    >
      <div className="mb-4 flex gap-1 border-b border-slate-200">
        <button onClick={() => setTab("alerts")} className={`px-3 py-2 text-sm border-b-2 -mb-px ${tab === "alerts" ? "border-[#EF6C33] text-[#EF6C33] font-semibold" : "border-transparent text-slate-600"}`}>
          <Bell className="inline h-4 w-4 mr-1" /> Alerts ({openCount} open)
        </button>
        <button onClick={() => setTab("rules")} className={`px-3 py-2 text-sm border-b-2 -mb-px ${tab === "rules" ? "border-[#EF6C33] text-[#EF6C33] font-semibold" : "border-transparent text-slate-600"}`}>
          Rules ({rules.length})
        </button>
        <button onClick={() => setTab("subs")} className={`px-3 py-2 text-sm border-b-2 -mb-px ${tab === "subs" ? "border-[#EF6C33] text-[#EF6C33] font-semibold" : "border-transparent text-slate-600"}`}>
          <Mail className="inline h-4 w-4 mr-1" /> Notifications ({subs.length})
        </button>
      </div>

      {tab === "subs" ? (
        <>
          <div className="rounded-lg border border-slate-200 bg-white p-4 mb-4">
            <div className="text-sm font-semibold text-slate-900 mb-2">Subscribe an email to anomaly notifications</div>
            <div className="text-xs text-slate-600 mb-2">When a rule fires that meets or exceeds the chosen severity, this address receives an email.</div>
            <div className="flex gap-2">
              <input
                value={subEmail}
                onChange={(e) => setSubEmail(e.target.value)}
                placeholder="alerts@example.com"
                type="email"
                className="flex-1 text-sm border border-slate-300 rounded px-2 py-1.5 focus:border-[#EF6C33]"
              />
              <select value={subMinSev} onChange={(e) => setSubMinSev(e.target.value as Severity)} className="text-sm border border-slate-300 rounded px-2 py-1.5">
                <option value="info">≥ info</option>
                <option value="warn">≥ warn</option>
                <option value="critical">≥ critical</option>
              </select>
              <button onClick={addSubscriber} disabled={!/^[^@]+@[^@]+\.[^@]+$/.test(subEmail.trim())} className="text-sm px-3 py-1.5 rounded bg-[#EF6C33] text-white disabled:opacity-50 flex items-center gap-1">
                <Plus className="h-4 w-4" /> Add
              </button>
            </div>
          </div>

          {subs.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 py-10 text-center">
              <Mail className="h-8 w-8 mx-auto text-slate-300 mb-2" />
              <div className="text-sm font-medium text-slate-700">No subscribers yet.</div>
              <div className="text-xs text-slate-500 mt-1">Anomaly alerts will still be recorded — they just won't send email.</div>
            </div>
          ) : (
            <ul className="space-y-2">
              {subs.map((s) => {
                const meta = SEV_META[s.min_severity];
                return (
                  <li key={s.id} className="rounded-lg border border-slate-200 bg-white p-3 flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="font-mono text-sm text-slate-900 truncate">{s.email}</div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        Receives alerts at <span className="font-semibold" style={{ color: meta.color }}>{meta.label}</span> and above · added {new Date(s.created_at).toLocaleDateString()}
                      </div>
                    </div>
                    <button onClick={() => removeSubscriber(s.id)} className="text-[10px] px-2 py-1 rounded border border-red-200 bg-white text-red-600 hover:bg-red-50 flex items-center gap-1">
                      <Trash2 className="h-3 w-3" /> Remove
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      ) : tab === "alerts" ? (
        <>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[10px] uppercase font-semibold text-slate-500 tracking-wide">Show</span>
            {(["open", "acknowledged", "resolved", "muted", "all"] as const).map((s) => (
              <button key={s} onClick={() => setAlertStatus(s)} className={`text-xs px-2 py-0.5 rounded ${alertStatus === s ? "bg-[#EF6C33] text-white" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                {s}
              </button>
            ))}
          </div>

          {alerts.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 py-10 text-center">
              <BellOff className="h-8 w-8 mx-auto text-slate-300 mb-2" />
              <div className="text-sm font-medium text-slate-700">No alerts matching this filter.</div>
            </div>
          ) : (
            <ul className="space-y-2">
              {alerts.map((a) => {
                const meta = SEV_META[a.severity];
                const Icon = meta.icon;
                return (
                  <li key={a.id} className="rounded-lg border border-slate-200 bg-white p-3 flex items-start gap-3">
                    <div className="flex-shrink-0 mt-0.5 h-8 w-8 rounded-full flex items-center justify-center" style={{ background: meta.color, color: "white" }}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span className="font-semibold text-slate-900 text-sm">{a.rule_name || `Rule #${a.rule_id}`}</span>
                        <code className="text-[10px] text-slate-500 bg-slate-100 px-1 py-0.5 rounded">{a.metric}</code>
                        <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded text-white" style={{ background: meta.color }}>
                          {meta.label}
                        </span>
                        {a.status !== "open" && (
                          <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-slate-200 text-slate-700">
                            {a.status}
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 text-xs text-slate-700">{a.summary}</div>
                      <div className="mt-1 text-[10px] text-slate-400">
                        {new Date(a.occurred_at).toLocaleString()}
                        {a.acknowledged_by && (
                          <span> · ack by {a.acknowledged_by} at {a.acknowledged_at ? new Date(a.acknowledged_at).toLocaleString() : "—"}</span>
                        )}
                      </div>
                    </div>
                    {a.status === "open" && (
                      <div className="flex flex-col gap-1 flex-shrink-0">
                        <button onClick={() => alertAction(a.id, "ack")} className="text-[10px] px-2 py-1 rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 flex items-center gap-1">
                          <Check className="h-3 w-3" /> Ack
                        </button>
                        <button onClick={() => alertAction(a.id, "resolve")} className="text-[10px] px-2 py-1 rounded border border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50 flex items-center gap-1">
                          <Check className="h-3 w-3" /> Resolve
                        </button>
                        <button onClick={() => alertAction(a.id, "mute")} className="text-[10px] px-2 py-1 rounded border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 flex items-center gap-1">
                          <X className="h-3 w-3" /> Mute
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      ) : (
        <>
          {creating && (
            <div className="mb-4 rounded-lg border-2 border-[#EF6C33] bg-orange-50 p-4">
              <div className="text-sm font-bold text-slate-900 mb-3">New anomaly rule</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <label className="text-xs">
                  <div className="text-[10px] font-semibold text-slate-600 uppercase tracking-wide mb-1">Name *</div>
                  <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full text-sm border border-slate-300 rounded px-2 py-1.5" autoFocus />
                </label>
                <label className="text-xs">
                  <div className="text-[10px] font-semibold text-slate-600 uppercase tracking-wide mb-1">Severity</div>
                  <select value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value as Severity })} className="w-full text-sm border border-slate-300 rounded px-2 py-1.5">
                    {(["info", "warn", "critical"] as Severity[]).map((s) => <option key={s} value={s}>{SEV_META[s].label}</option>)}
                  </select>
                </label>
                <label className="text-xs">
                  <div className="text-[10px] font-semibold text-slate-600 uppercase tracking-wide mb-1">Metric</div>
                  <select value={form.metric} onChange={(e) => setForm({ ...form, metric: e.target.value })} className="w-full text-sm border border-slate-300 rounded px-2 py-1.5">
                    {METRICS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </label>
                <label className="text-xs">
                  <div className="text-[10px] font-semibold text-slate-600 uppercase tracking-wide mb-1">Comparator</div>
                  <select value={form.comparator} onChange={(e) => setForm({ ...form, comparator: e.target.value as Comparator })} className="w-full text-sm border border-slate-300 rounded px-2 py-1.5">
                    <option value=">">{">"} (above value)</option>
                    <option value="<">{"<"} (below value)</option>
                    <option value=">=">≥</option>
                    <option value="<=">≤</option>
                    <option value="spike">spike (× baseline)</option>
                    <option value="drop">drop (÷ baseline)</option>
                  </select>
                </label>
                <label className="text-xs">
                  <div className="text-[10px] font-semibold text-slate-600 uppercase tracking-wide mb-1">Threshold</div>
                  <input type="number" step="any" value={form.threshold} onChange={(e) => setForm({ ...form, threshold: parseFloat(e.target.value) || 0 })} className="w-full text-sm border border-slate-300 rounded px-2 py-1.5" />
                </label>
                <label className="text-xs">
                  <div className="text-[10px] font-semibold text-slate-600 uppercase tracking-wide mb-1">Window (min)</div>
                  <input type="number" min={5} value={form.window_minutes} onChange={(e) => setForm({ ...form, window_minutes: parseInt(e.target.value) || 60 })} className="w-full text-sm border border-slate-300 rounded px-2 py-1.5" />
                </label>
                <label className="text-xs">
                  <div className="text-[10px] font-semibold text-slate-600 uppercase tracking-wide mb-1">Baseline (days)</div>
                  <input type="number" min={1} value={form.baseline_days} onChange={(e) => setForm({ ...form, baseline_days: parseInt(e.target.value) || 7 })} className="w-full text-sm border border-slate-300 rounded px-2 py-1.5" />
                </label>
              </div>
              <div className="flex justify-end gap-2 mt-3">
                <button onClick={() => setCreating(false)} className="text-xs px-3 py-1.5 rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-50">Cancel</button>
                <button onClick={createRule} disabled={!form.name.trim()} className="text-xs px-3 py-1.5 rounded bg-[#EF6C33] text-white disabled:opacity-50">Create rule</button>
              </div>
            </div>
          )}
          {rules.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 py-10 text-center">
              <AlertCircle className="h-8 w-8 mx-auto text-slate-300 mb-2" />
              <div className="text-sm font-medium text-slate-700">No rules yet.</div>
              <div className="text-xs text-slate-500 mt-1">Create your first rule to start receiving anomaly alerts.</div>
            </div>
          ) : (
            <ul className="space-y-2">
              {rules.map((r) => {
                const meta = SEV_META[r.severity];
                return (
                  <li key={r.id} className="rounded-lg border border-slate-200 bg-white p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm text-slate-900 truncate">{r.name}</span>
                          <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded text-white" style={{ background: meta.color }}>
                            {meta.label}
                          </span>
                          {!r.is_active && (
                            <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-slate-200 text-slate-700">Disabled</span>
                          )}
                        </div>
                        <div className="text-xs text-slate-600 mt-0.5">
                          <code className="font-mono">{r.metric}</code> {r.comparator} {r.threshold}
                          {(r.comparator === "spike" || r.comparator === "drop") && <span> × baseline ({r.baseline_days}-day)</span>}
                          {" "}· window {r.window_minutes}m
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          Last evaluated {r.last_evaluated_at ? new Date(r.last_evaluated_at).toLocaleString() : "never"}
                          {r.last_value != null && <span> · last value {r.last_value.toFixed(2)}</span>}
                        </div>
                      </div>
                      <div className="flex flex-col gap-1 flex-shrink-0">
                        <button onClick={() => toggleRule(r)} className="text-[10px] px-2 py-1 rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-50">
                          {r.is_active ? "Disable" : "Enable"}
                        </button>
                        <button onClick={() => deleteRule(r.id)} className="text-[10px] px-2 py-1 rounded border border-red-200 bg-white text-red-600 hover:bg-red-50 flex items-center gap-1">
                          <Trash2 className="h-3 w-3" /> Delete
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </SparkPageShell>
  );
}

export default SparkAnomalyAlertsPage;
