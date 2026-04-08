import { useEffect, useState } from "react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";

interface UsageData {
  emailsSent: number;
  emailsLimit: number;
  smsSent: number;
  smsLimit: number;
  contactsUsed: number;
  contactsLimit: number;
  leadsUsed: number;
  leadsLimit: number;
}

export function SparkUsagePage() {
  const { get, ready } = useSparkApi();
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await get<UsageData>("/api/v1/usage");
        if (!cancelled) setUsage(res);
      } catch (err) {
        if (!cancelled) setError(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [get, ready]);

  function pct(used: number, limit: number) {
    if (limit === 0) return 0;
    return Math.min(100, Math.round((used / limit) * 100));
  }

  function barColor(percent: number) {
    if (percent >= 90) return "bg-red-500";
    if (percent >= 70) return "bg-amber-500";
    return "bg-blue-500";
  }

  function statusText(percent: number) {
    if (percent >= 90) return "Near limit";
    if (percent >= 70) return "Moderate usage";
    return "Healthy";
  }

  function statusColor(percent: number) {
    if (percent >= 90) return "text-red-600";
    if (percent >= 70) return "text-amber-600";
    return "text-green-600";
  }

  const bars = usage
    ? [
        { label: "Emails Sent", used: usage.emailsSent, limit: usage.emailsLimit, icon: "envelope" },
        { label: "SMS Sent", used: usage.smsSent, limit: usage.smsLimit, icon: "chat" },
        { label: "Contacts", used: usage.contactsUsed, limit: usage.contactsLimit, icon: "users" },
        { label: "Leads", used: usage.leadsUsed, limit: usage.leadsLimit, icon: "target" },
      ]
    : [];

  const anyNearLimit = bars.some((b) => pct(b.used, b.limit) >= 90);

  return (
    <OliverPageWrapper title="Usage & Billing" subtitle="Monitor your SPARK usage against plan limits" error={error} loading={loading}>
      <div className="p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {bars.map((b) => {
            const p = pct(b.used, b.limit);
            return (
              <div key={b.label} className="rounded-xl bg-white ring-1 ring-gray-200 p-5">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium text-slate-700">{b.label}</h3>
                  <span className={`text-xs font-medium ${statusColor(p)}`}>{statusText(p)}</span>
                </div>
                <p className="mt-2 text-2xl font-bold text-slate-900">
                  {b.used.toLocaleString()} <span className="text-base font-normal text-slate-400">/ {b.limit.toLocaleString()}</span>
                </p>
                <div className="mt-3 h-2.5 w-full rounded-full bg-gray-100">
                  <div className={`h-2.5 rounded-full transition-all ${barColor(p)}`} style={{ width: `${p}%` }} />
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  {p}% used &middot; {(b.limit - b.used).toLocaleString()} remaining
                </p>
              </div>
            );
          })}
        </div>

        {anyNearLimit && (
          <div className="rounded-xl bg-amber-50 ring-1 ring-amber-200 p-5">
            <h3 className="text-sm font-semibold text-amber-800">Approaching plan limits</h3>
            <p className="mt-1 text-sm text-amber-700">
              One or more usage categories are at 90% or above. Consider upgrading your plan to avoid service interruptions.
            </p>
            <button className="mt-3 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700">
              Upgrade Plan
            </button>
          </div>
        )}
      </div>
    </OliverPageWrapper>
  );
}
