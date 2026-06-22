import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Mail, MessageSquare, Users } from "lucide-react";
import { useSparkApi } from "../../hooks/useSparkApi";

// UsageChip — compact tier-usage chip rendered in the SparkPageHeader on
// every Spark*Page. Replaces the deleted "Tier usage" card on the old
// Overview dashboard. Three pills (Emails / SMS / Contacts) showing
// current / cap for the billing period. Clicks through to the Plans +
// Usage page where the full per-metric detail (progress bars + reset
// date) lives.
//
// Leads is intentionally OMITTED here — /api/v1/usage doesn't return a
// `leads_per_month` cap (it depends on the active Lead Gen add-on tier:
// essentials=50, growth=100, authority=150). Until the server surfaces
// the active Lead Gen subscription tier on req.platform.tenant we can't
// honestly show a cap, and showing usage without a cap is misleading.
// Plans + Usage page already lists leads_issued under "This month's
// usage" with a hardcoded 50 placeholder — that gap is tracked
// server-side; the chip stays narrowly correct.

interface UsageResponse {
  data: {
    tier: string;
    usage: { emails_sent: number; sms_sent: number; contacts_count: number; leads_issued: number };
    limits: { emails_per_month: number; sms_per_month: number; contacts_max: number };
  };
}

interface MetricProps {
  label: string;
  used: number;
  limit: number;
  icon: React.ComponentType<{ className?: string }>;
}

function pct(used: number, limit: number) {
  return limit === 0 ? 0 : Math.min(100, Math.round((used / limit) * 100));
}

function MetricPill({ label, used, limit, icon: Icon }: MetricProps) {
  const p = pct(used, limit);
  // Color the number itself by saturation so the chip telegraphs "near
  // cap" without needing a second visual element (kept compact for the
  // header bar).
  const color = p >= 90 ? "text-rose-600" : p >= 70 ? "text-amber-600" : "text-slate-700";
  return (
    <span className="inline-flex items-baseline gap-1 px-2 py-1 rounded-md bg-white border border-slate-200">
      <Icon className="h-3 w-3 text-slate-400 self-center" />
      <span className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">{label}</span>
      <span className={`text-[11px] font-bold tabular-nums ${color}`}>{used.toLocaleString()}</span>
      <span className="text-[10px] text-slate-400 tabular-nums">/ {limit.toLocaleString()}</span>
    </span>
  );
}

export function UsageChip() {
  const { get, ready } = useSparkApi();
  const [usage, setUsage] = useState<UsageResponse["data"] | null>(null);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    (async () => {
      try {
        const raw = await get<UsageResponse>("/api/v1/usage");
        if (!cancelled) setUsage(raw?.data ?? null);
      } catch {
        // Silent: a missing chip is better than a broken page header. The
        // Plans + Usage link is still reachable from the top nav.
        if (!cancelled) setUsage(null);
      }
    })();
    return () => { cancelled = true; };
  }, [get, ready]);

  if (!usage) return null;

  return (
    <Link
      to="/app/services/spark_usage"
      title="View your plan and full usage detail"
      className="inline-flex items-center gap-1.5 hover:opacity-90 transition"
    >
      <MetricPill label="Emails" used={usage.usage.emails_sent} limit={usage.limits.emails_per_month} icon={Mail} />
      <MetricPill label="SMS" used={usage.usage.sms_sent} limit={usage.limits.sms_per_month} icon={MessageSquare} />
      <MetricPill label="Contacts" used={usage.usage.contacts_count} limit={usage.limits.contacts_max} icon={Users} />
      <span className="text-[10px] text-[#EF6C33] font-semibold ml-1 hover:underline">View plan →</span>
    </Link>
  );
}

export default UsageChip;
