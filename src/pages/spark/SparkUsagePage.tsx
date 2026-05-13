import { useEffect, useState } from "react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { SparkPageShell } from "../../components/spark/SparkPageShell";
import { SparkStatStrip } from "../../components/spark/SparkStatStrip";
import { Mail, MessageSquare, Users, Target, Check, Sparkles, Coins, AlertCircle } from "lucide-react";

interface UsageResponse {
  data: {
    tier: string;
    usage: { emails_sent: number; sms_sent: number; contacts_count: number; leads_issued: number };
    limits: { emails_per_month: number; sms_per_month: number; contacts_max: number };
    remaining: { emails: number; sms: number; contacts: number };
  };
}

interface TierDef {
  key: string;
  name: string;
  monthly: number;
  highlight?: boolean;
  features: { label: string; value: string }[];
  perks: string[];
}

const TIERS: TierDef[] = [
  {
    key: "standard",
    name: "Standard",
    monthly: 0,
    features: [
      { label: "Contacts", value: "1,000" },
      { label: "Emails/mo", value: "500" },
      { label: "SMS/mo", value: "100" },
      { label: "Leads/mo", value: "50" },
    ],
    perks: [
      "Basic CRM (contacts, lists, tags, segments)",
      "Email + SMS campaigns",
      "Forms + QR codes",
      "Basic Insights (heuristic)",
    ],
  },
  {
    key: "pro",
    name: "Pro",
    monthly: 99,
    highlight: true,
    features: [
      { label: "Contacts", value: "10,000" },
      { label: "Emails/mo", value: "10,000" },
      { label: "SMS/mo", value: "1,000" },
      { label: "Leads/mo", value: "500" },
    ],
    perks: [
      "Everything in Standard",
      "Sales Pipeline + Deals (Kanban)",
      "Newsletter Studio + auto-publish to WP",
      "Social Scheduler + Content Calendar",
      "NPS, Referrals, Landing Pages, Reputation Hub",
      "Full IA Intelligence Layer — quarterly insights",
      "100 AI Credits/mo (v2)",
    ],
  },
  {
    key: "business",
    name: "Business",
    monthly: 199,
    features: [
      { label: "Contacts", value: "50,000" },
      { label: "Emails/mo", value: "50,000" },
      { label: "SMS/mo", value: "5,000" },
      { label: "Leads/mo", value: "2,500" },
    ],
    perks: [
      "Everything in Pro",
      "B2B Companies + account-based reporting",
      "AI Writer (full access)",
      "Full IA Intelligence Layer — monthly + on-demand",
      "Annual deep-dive AI report",
      "500 AI Credits/mo (v2)",
      "Priority support",
    ],
  },
];

export function SparkUsagePage() {
  const { get, ready } = useSparkApi();
  const [usage, setUsage] = useState<UsageResponse["data"] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    async function load() {
      setLoading(true); setError(null);
      try {
        const raw = await get<UsageResponse>("/api/v1/usage");
        if (!cancelled) setUsage(raw.data || null);
      } catch (err) { if (!cancelled) setError(err); }
      finally { if (!cancelled) setLoading(false); }
    }
    load();
    return () => { cancelled = true; };
  }, [get, ready]);

  function pct(used: number, limit: number) {
    return limit === 0 ? 0 : Math.min(100, Math.round((used / limit) * 100));
  }
  function barColor(p: number) {
    if (p >= 90) return "bg-rose-500";
    if (p >= 70) return "bg-amber-500";
    return "bg-emerald-500";
  }

  const currentTier = usage?.tier || "standard";
  const bars = usage ? [
    { label: "Emails", used: usage.usage.emails_sent, limit: usage.limits.emails_per_month, icon: Mail },
    { label: "SMS", used: usage.usage.sms_sent, limit: usage.limits.sms_per_month, icon: MessageSquare },
    { label: "Contacts", used: usage.usage.contacts_count, limit: usage.limits.contacts_max, icon: Users },
    { label: "Leads", used: usage.usage.leads_issued, limit: 50, icon: Target },
  ] : [];
  const anyNearLimit = bars.some(b => pct(b.used, b.limit) >= 80);

  return (
    <SparkPageShell
      title="Usage & Billing"
      subtitle="Monitor usage, manage your tier, and top up when needed"
      stats={usage
        ? <SparkStatStrip stats={[
            { label: "Current tier", value: currentTier.toUpperCase(), accent: "blue" },
            { label: "Emails this month", value: usage.usage.emails_sent.toLocaleString() },
            { label: "Contacts", value: usage.usage.contacts_count.toLocaleString(), icon: Users },
            { label: "Leads issued", value: usage.usage.leads_issued.toLocaleString(), icon: Target },
          ]} />
        : undefined}
      loading={loading}
      error={error}
    >
      {/* USAGE BARS */}
      <div className="spark-mini-card mb-4">
        <div className="spark-mini-card-header">
          <span className="spark-mini-card-title">This month's usage</span>
          <span className="text-xs text-slate-500">Resets on the 1st</span>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {bars.map(b => {
            const p = pct(b.used, b.limit);
            const Icon = b.icon;
            return (
              <div key={b.label} className="border border-slate-200 rounded-md p-3 bg-white">
                <div className="flex items-center gap-2 mb-1">
                  <Icon className="h-3.5 w-3.5 text-slate-500" />
                  <span className="text-xs uppercase font-semibold text-slate-600">{b.label}</span>
                </div>
                <div className="text-lg font-bold text-slate-900">
                  {b.used.toLocaleString()} <span className="text-xs font-normal text-slate-400">/ {b.limit.toLocaleString()}</span>
                </div>
                <div className="mt-2 h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                  <div className={`h-full ${barColor(p)} transition-all`} style={{ width: `${p}%` }} />
                </div>
                <div className="mt-1 text-[10px] text-slate-500">
                  {p}% used · {(b.limit - b.used).toLocaleString()} left
                </div>
              </div>
            );
          })}
        </div>

        {anyNearLimit && (
          <div className="mt-3 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-amber-900">
              <strong>Approaching plan limits.</strong> Upgrade your tier or buy a top-up below before you run out.
            </div>
          </div>
        )}
      </div>

      {/* TIER COMPARISON */}
      <div className="spark-mini-card mb-4">
        <div className="spark-mini-card-header">
          <span className="spark-mini-card-title">Plans</span>
          <span className="text-xs text-slate-500">All annual. Cancel anytime.</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {TIERS.map(tier => {
            const isCurrent = tier.key === currentTier;
            return (
              <div
                key={tier.key}
                className={`rounded-lg p-4 border ${
                  isCurrent
                    ? "border-emerald-500 bg-emerald-50/40 ring-2 ring-emerald-500/20"
                    : tier.highlight
                      ? "border-slate-900 bg-slate-50"
                      : "border-slate-200 bg-white"
                }`}
              >
                <div className="flex items-baseline justify-between">
                  <div>
                    <h3 className="text-base font-semibold text-slate-900">{tier.name}</h3>
                    <div className="text-2xl font-bold mt-1">
                      ${tier.monthly}<span className="text-xs font-normal text-slate-500">/mo</span>
                    </div>
                  </div>
                  {isCurrent && <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded bg-emerald-100 text-emerald-700">Current</span>}
                  {tier.highlight && !isCurrent && <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded bg-slate-900 text-white">Recommended</span>}
                </div>
                <div className="mt-3 pt-3 border-t border-slate-200 space-y-1.5">
                  {tier.features.map(f => (
                    <div key={f.label} className="flex justify-between text-xs">
                      <span className="text-slate-500">{f.label}</span>
                      <span className="font-medium">{f.value}</span>
                    </div>
                  ))}
                </div>
                <ul className="mt-3 pt-3 border-t border-slate-200 space-y-1">
                  {tier.perks.map(p => (
                    <li key={p} className="flex items-start gap-1.5 text-xs text-slate-700">
                      <Check className="h-3 w-3 text-emerald-600 mt-0.5 flex-shrink-0" />
                      <span>{p}</span>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  disabled={isCurrent}
                  className={`mt-4 w-full spark-btn ${isCurrent ? "spark-btn-secondary cursor-default opacity-60" : "spark-btn-primary"}`}
                  onClick={() => alert("Tier change flow connects to Stripe — coming in v2. Email support@iadm.io to change tier today.")}
                >
                  {isCurrent ? "Current plan" : `Switch to ${tier.name}`}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* TOP-UPS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="spark-mini-card">
          <div className="spark-mini-card-header">
            <span className="spark-mini-card-title">One-time top-ups</span>
            <span className="text-xs text-slate-500">For this month only</span>
          </div>
          <div className="space-y-2">
            <TopUpOption label="+1,000 emails" price={9} icon={Mail} />
            <TopUpOption label="+100 SMS" price={5} icon={MessageSquare} />
            <TopUpOption label="+100 leads" price={29} icon={Target} />
          </div>
          <p className="text-[11px] text-slate-500 mt-3">Top-ups expire at month end and don't roll over.</p>
        </div>

        <div className="spark-mini-card">
          <div className="spark-mini-card-header">
            <span className="spark-mini-card-title flex items-center gap-1.5">
              <Sparkles className="h-3 w-3 text-violet-600" /> AI Credits
            </span>
            <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded bg-violet-100 text-violet-700">v2</span>
          </div>
          <div className="space-y-2">
            <TopUpOption label="+250 credits" price={20} icon={Coins} disabled />
            <TopUpOption label="+700 credits" price={50} icon={Coins} disabled />
          </div>
          <p className="text-[11px] text-slate-500 mt-3">
            1 credit ≈ $0.10. AI Writer email draft = 2 credits. Credits roll forward 30 days then expire.
          </p>
        </div>
      </div>

      {/* INVOICE HISTORY PLACEHOLDER */}
      <div className="spark-mini-card mt-4">
        <div className="spark-mini-card-header">
          <span className="spark-mini-card-title">Billing history</span>
        </div>
        <div className="py-8 text-center text-sm text-slate-500">
          Stripe invoice history coming with v2 billing integration.
        </div>
      </div>
    </SparkPageShell>
  );
}

function TopUpOption({ label, price, icon: Icon, disabled }: { label: string; price: number; icon: typeof Mail; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => alert(disabled ? "AI Credits launch with v2." : "Top-up flow connects to Stripe — coming in v2. Email support@iadm.io to add capacity today.")}
      className={`w-full flex items-center justify-between gap-3 px-3 py-2 border border-slate-200 rounded-md ${disabled ? "opacity-50 cursor-not-allowed" : "hover:bg-slate-50 hover:border-slate-300"} transition`}
    >
      <span className="flex items-center gap-2">
        <Icon className="h-3.5 w-3.5 text-slate-500" />
        <span className="text-sm font-medium">{label}</span>
      </span>
      <span className="text-sm font-semibold text-slate-900">${price}</span>
    </button>
  );
}

export default SparkUsagePage;
