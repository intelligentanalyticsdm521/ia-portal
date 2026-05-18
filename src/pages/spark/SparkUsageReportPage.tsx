// SparkUsageReportPage — standalone usage reporting (split out from the
// Plan & Pricing page). Shows consumption vs. plan limits; the picker lives
// on Plan & Pricing (spark_usage).
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useSparkApi } from "../../hooks/useSparkApi";
import { SparkPageShell } from "../../components/spark/SparkPageShell";
import { Mail, MessageSquare, Users, Target, ArrowRight } from "lucide-react";

interface UsageResponse {
  data: {
    tier: string;
    usage: { emails_sent: number; sms_sent: number; contacts_count: number; leads_issued: number };
    limits: { emails_per_month: number; sms_per_month: number; contacts_max: number };
  };
}

function fmt(n: number | null | undefined) {
  if (n == null) return "∞";
  return n.toLocaleString();
}

export function SparkUsageReportPage() {
  const { get, ready } = useSparkApi();
  const [data, setData] = useState<UsageResponse["data"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(async () => {
    if (!ready) return;
    setLoading(true); setError(null);
    try {
      const r = await get<UsageResponse>("/api/v1/usage");
      setData(r?.data || null);
    } catch (err) { setError(err); }
    finally { setLoading(false); }
  }, [get, ready]);

  useEffect(() => { load(); }, [load]);

  const bars = data ? [
    { label: "Emails sent", used: data.usage.emails_sent, limit: data.limits.emails_per_month, icon: Mail },
    { label: "SMS sent", used: data.usage.sms_sent, limit: data.limits.sms_per_month, icon: MessageSquare },
    { label: "Contacts", used: data.usage.contacts_count, limit: data.limits.contacts_max, icon: Users },
    { label: "Leads issued", used: data.usage.leads_issued, limit: null as number | null, icon: Target },
  ] : [];

  function pct(used: number, limit: number | null) {
    if (limit == null || limit === 0) return 0;
    return Math.min(100, Math.round((used / limit) * 100));
  }

  return (
    <SparkPageShell
      title="Usage"
      subtitle="Consumption against your current plan limits"
      help="This resets monthly. To change your volume, feature tier, or Lead Generation, go to Plan & Pricing."
      loading={loading}
      error={error}
    >
      <div className="mb-4 flex items-center justify-between">
        <div className="text-sm text-slate-600">
          Current tier: <strong className="text-slate-900">{data?.tier || "—"}</strong>
        </div>
        <Link to="/app/services/spark_usage"
          className="text-sm text-[#EF6C33] font-medium inline-flex items-center gap-1 hover:underline">
          Change plan <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {bars.map((b) => {
          const p = pct(b.used, b.limit);
          const color = p >= 90 ? "bg-rose-500" : p >= 70 ? "bg-amber-500" : "bg-emerald-500";
          const Icon = b.icon;
          return (
            <div key={b.label} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-center gap-2 mb-2">
                <Icon className="h-4 w-4 text-slate-500" />
                <span className="text-xs uppercase font-semibold text-slate-600">{b.label}</span>
              </div>
              <div className="text-2xl font-bold text-slate-900">
                {b.used.toLocaleString()}
                <span className="text-sm font-normal text-slate-400"> / {fmt(b.limit)}</span>
              </div>
              <div className="mt-3 h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                <div className={`h-full ${color} transition-all`} style={{ width: `${p}%` }} />
              </div>
              {b.limit != null && p >= 90 && (
                <div className="mt-2 text-xs text-rose-600">
                  You're near your limit — <Link to="/app/services/spark_usage" className="underline">upgrade your volume</Link>.
                </div>
              )}
            </div>
          );
        })}
      </div>
    </SparkPageShell>
  );
}

export default SparkUsageReportPage;
