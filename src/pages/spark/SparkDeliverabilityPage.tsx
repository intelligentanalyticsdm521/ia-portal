// SparkDeliverabilityPage — Email deliverability dashboard (SPARK Pro)
//
// Pulls aggregated metrics from /api/v1/email/deliverability/dashboard and
// per-day delivery/open/click/bounce trend. Includes suppression list view and
// release controls. Also shows the SPF/DKIM/DMARC verifier widget.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { SparkPageShell } from "../../components/spark/SparkPageShell";
import { TimeRangeSelector, rangeForPreset } from "../../components/oliver/ui";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { Mail, AlertCircle, Shield, Check, X, RefreshCw } from "lucide-react";

interface Dashboard {
  overall: {
    sent: number; delivered: number; opened: number; clicked: number;
    bounced: number; hard_bounced: number; complained: number; unsubscribed: number;
    delivery_rate: number; open_rate: number; click_rate: number;
    bounce_rate: number; complaint_rate: number; unsubscribe_rate: number;
  };
  daily: { day: string; delivered: number; opened: number; clicked: number; bounced: number }[];
  suppression_count: number;
  period_days: number;
}

interface Suppression {
  id: number; email: string; reason: string; created_at: string;
}

interface VerifyResp {
  domain: string;
  status: "ready" | "incomplete";
  checks: Record<string, { found: boolean; ok?: boolean; value: unknown; expected_target?: string; expected_include?: string; includes_acs?: boolean }>;
}

export function SparkDeliverabilityPage() {
  const { get, del, ready } = useSparkApi();
  const [dash, setDash] = useState<Dashboard | null>(null);
  const [suppressions, setSuppressions] = useState<Suppression[]>([]);
  const [verify, setVerify] = useState<VerifyResp | null>(null);
  const [domain, setDomain] = useState("");
  const [range, setRange] = useState(() => rangeForPreset("last_30_days"));
  const days = useMemo(() => {
    if (!range.fromISO || !range.toISO) return 3650; // all-time
    const d = Math.round((new Date(range.toISO).getTime() - new Date(range.fromISO).getTime()) / 86400000);
    return Math.max(1, d);
  }, [range]);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const fetchData = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    setError(null);
    try {
      const [d, s] = await Promise.all([
        get<Dashboard>(`/api/v1/email/deliverability/dashboard?days=${days}`),
        get<{ data: Suppression[] }>("/api/v1/email/suppressions"),
      ]);
      setDash(d || null);
      setSuppressions(s?.data || []);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [get, ready, days]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Try to load the tenant's saved sending domain on mount
  useEffect(() => {
    if (!ready) return;
    (async () => {
      try {
        const r = await get<{ domain: string | null }>("/api/v1/email/deliverability/domain");
        if (r?.domain) setDomain(r.domain);
      } catch { /* no-op */ }
    })();
  }, [get, ready]);

  async function runVerify() {
    if (!domain.trim()) return;
    setVerifying(true);
    try {
      const r = await get<VerifyResp>(`/api/v1/email/deliverability/verify?domain=${encodeURIComponent(domain.trim())}`);
      setVerify(r);
    } catch (err) {
      alert(`Verification failed: ${(err as Error).message}`);
    } finally {
      setVerifying(false);
    }
  }

  async function release(id: number) {
    if (!confirm("Release this suppression? The address will be able to receive email again.")) return;
    try {
      await del(`/api/v1/email/suppressions/${id}`);
      setSuppressions(prev => prev.filter(s => s.id !== id));
    } catch (err) {
      alert(`Failed: ${(err as Error).message}`);
    }
  }

  const stats = useMemo(() => {
    if (!dash) return null;
    const o = dash.overall || {};
    const cards = [
      { label: "Sent",        value: o.sent || 0,       icon: Mail },
      { label: "Delivery %",  value: `${o.delivery_rate || 0}%`, icon: Check },
      { label: "Open %",      value: `${o.open_rate || 0}%`,     icon: Mail },
      { label: "Click %",     value: `${o.click_rate || 0}%`,    icon: Mail },
      { label: "Bounce %",    value: `${o.bounce_rate || 0}%`,   icon: AlertCircle, alert: (o.bounce_rate || 0) > 2 },
      { label: "Complaint %", value: `${o.complaint_rate || 0}%`,icon: AlertCircle, alert: (o.complaint_rate || 0) > 0.1 },
    ];
    return (
      <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
        {cards.map(c => (
          <div key={c.label} className={`p-2 rounded border ${c.alert ? "border-rose-200 bg-rose-50" : "border-slate-200 bg-white"}`}>
            <div className="text-[10px] uppercase font-semibold text-slate-500 flex items-center gap-1"><c.icon className="h-3 w-3" />{c.label}</div>
            <div className={`text-base font-bold ${c.alert ? "text-rose-700" : "text-slate-900"}`}>{c.value}</div>
          </div>
        ))}
      </div>
    );
  }, [dash]);

  return (
    <SparkPageShell
      title="Deliverability"
      subtitle={`${range.label} · ${dash?.overall.sent.toLocaleString() || 0} sent`}
      help="Track how your emails are landing. Bounce, complaint, and unsubscribe rates feed back into the auto-suppression list. Keep complaint rate under 0.1% and hard bounce rate under 2% to maintain sender reputation."
      stats={stats || undefined}
      filters={
        <div className="flex items-center gap-2">
          <TimeRangeSelector value={range} onChange={setRange} />
          <button onClick={fetchData} className="text-xs px-3 py-1 rounded-full border border-slate-200 flex items-center gap-1">
            <RefreshCw className="h-3 w-3" /> Refresh
          </button>
        </div>
      }
      loading={loading}
      error={error}
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Trend chart */}
        <div className="lg:col-span-2 spark-mini-card">
          <div className="spark-mini-card-header">
            <span className="spark-mini-card-title">Daily volume + engagement</span>
          </div>
          {dash?.daily?.length ? (
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={dash.daily}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Area type="monotone" dataKey="delivered" stroke="#10B981" fill="#D1FAE5" />
                <Area type="monotone" dataKey="opened"    stroke="#3B82F6" fill="#DBEAFE" />
                <Area type="monotone" dataKey="clicked"   stroke="#EF6C33" fill="#FFEDD5" />
                <Area type="monotone" dataKey="bounced"   stroke="#F43F5E" fill="#FEE2E2" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="text-center text-sm text-slate-500 py-8">No event data in this window yet.</div>
          )}
        </div>

        {/* SPF/DKIM/DMARC verifier */}
        <div className="spark-mini-card">
          <div className="spark-mini-card-header">
            <span className="spark-mini-card-title flex items-center gap-1"><Shield className="h-4 w-4" /> Sender domain auth</span>
          </div>
          <div className="space-y-2">
            <div className="flex gap-2">
              <input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="yourdomain.com"
                className="flex-1 text-sm border border-slate-300 rounded p-1.5" />
              <button disabled={verifying} onClick={runVerify}
                className="text-sm px-3 py-1.5 rounded bg-[#0B1C24] text-white disabled:opacity-50">
                {verifying ? "..." : "Verify"}
              </button>
            </div>
            {verify && (
              <div className="text-xs space-y-1.5 mt-2">
                <div className={`p-1.5 rounded ${verify.status === "ready" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                  Status: <strong>{verify.status === "ready" ? "Ready" : "Needs setup"}</strong>
                </div>
                {Object.entries(verify.checks).map(([k, v]) => (
                  <div key={k} className="flex items-start gap-1">
                    {v.found && (v.ok !== false) ? <Check className="h-3 w-3 text-emerald-600 mt-0.5" /> : <X className="h-3 w-3 text-rose-600 mt-0.5" />}
                    <div className="flex-1">
                      <div className="font-medium uppercase tracking-wide text-[10px]">{k}</div>
                      <div className="text-[10px] text-slate-500 truncate">{v.found ? "Found" : "Not published"}{v.includes_acs === false ? " · missing ACS include" : ""}</div>
                    </div>
                  </div>
                ))}
                <a href={`/api/v1/email/deliverability/records?domain=${encodeURIComponent(verify.domain)}`} target="_blank" rel="noreferrer"
                  className="text-xs text-[#EF6C33] hover:underline">View records to publish →</a>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Suppression list */}
      <div className="spark-mini-card mt-4">
        <div className="spark-mini-card-header">
          <span className="spark-mini-card-title">Suppressed addresses</span>
          <span className="text-xs text-slate-500">{suppressions.length} addresses</span>
        </div>
        <div className="overflow-x-auto">
          <table className="spark-table">
            <thead>
              <tr><th>Email</th><th>Reason</th><th>Suppressed at</th><th></th></tr>
            </thead>
            <tbody>
              {suppressions.length === 0 && (
                <tr><td colSpan={4} className="text-center text-sm text-slate-500 py-6">No suppressions. Hard bounces, complaints, and unsubscribes get added here automatically.</td></tr>
              )}
              {suppressions.map(s => (
                <tr key={s.id}>
                  <td className="font-medium">{s.email}</td>
                  <td><span className="px-2 py-0.5 rounded text-[11px] border border-slate-200 bg-slate-50">{s.reason}</span></td>
                  <td className="text-xs text-slate-500">{new Date(s.created_at).toLocaleString()}</td>
                  <td><button onClick={() => release(s.id)} className="text-xs text-rose-600 hover:underline">Release</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </SparkPageShell>
  );
}

export default SparkDeliverabilityPage;
