// OliverUsagePage — OLIVER tier picker + live plan total
//
// Mirrors the SPARK Usage & Billing page pattern. The base price is a per-tier
// flat fee (not a slider) because OLIVER pricing is tier-driven, not volume-
// driven. Public pricing reference:
//   https://intelligentanalyticsdm.com/platforms/oliver/oliver-pricing
//
// Tiers + monthly prices come LIVE from oliver-api GET /tier-limits/plan-pricing
// (canonical source: lib/tierFeatures.js PLAN_PRICING — Lite $29 / Standard $39
// / Pro $69 / Business $129 / Enterprise $249). Each card also shows ONE
// combined processing-fee line (Stripe + IA blended); the cap + full split
// live only on the standalone Fees page (owner decision 2026-05-18).
import { useEffect, useMemo, useState } from "react";
import { useOliverApi } from "../../hooks/useOliverApi";
import { useAccessToken } from "../../auth/useAccessToken";
import { useAppState } from "../../app/AppState";
import { isPlatformOwner } from "../../lib/currentPlan";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";
import { PendingChangeBanner } from "../../components/PendingChangeBanner";
import { Check, AlertCircle, ChevronDown, ChevronUp, Users, Briefcase, RotateCw } from "lucide-react";

interface UsageResponse {
  data: {
    tier: string;
    usage: {
      seats: { used: number; limit: number | null };
      active_jobs: { used: number; limit: number | null };
      jobs_per_month: { used: number; limit: number | null };
      active_recurring: { used: number; limit: number | null };
      pricebook_items: { used: number; limit: number | null };
      workflow_templates: { used: number; limit: number | null };
    };
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Pricing model — matches oliver-api/lib/tierLimits.js defaults + public site.
// ─────────────────────────────────────────────────────────────────────────────
type TierKey = "lite" | "standard" | "pro" | "business";

interface TierDef {
  key: TierKey;
  name: string;
  monthly: number;
  badge?: string;
  highlight?: boolean;
  oneLiner: string;
  caps: {
    seats: number;
    active_jobs: number;
    jobs_per_month: number;
    active_recurring: number;
    pricebook_items: number;
    workflow_templates: number;
  };
  bullets: string[];
}

// Caps mirror oliver-api/lib/tierFeatures.js TIER_CAPS (9999 sentinel renders
// as "Unlimited"). Monthly price is overlaid live from the API; the `monthly`
// here is only a pre-load fallback.
const TIERS: TierDef[] = [
  {
    key: "lite",
    name: "Lite",
    monthly: 29,
    oneLiner: "You do the steps",
    caps: { seats: 1, active_jobs: 9999, jobs_per_month: 50, active_recurring: 0, pricebook_items: 25, workflow_templates: 0 },
    bullets: [
      "Full job lifecycle (manual)",
      "Calendar + scheduling",
      "Invoices + Stripe Connect payments",
      "View & pay customer portal",
      "Service catalog + price book",
    ],
  },
  {
    key: "standard",
    name: "Standard",
    monthly: 39,
    oneLiner: "Standard does it for you",
    caps: { seats: 5, active_jobs: 9999, jobs_per_month: 9999, active_recurring: 25, pricebook_items: 100, workflow_templates: 25 },
    bullets: [
      "Everything in Lite",
      "Recurring jobs (approval queue)",
      "Worker dispatch + assignments",
      "Workflow template library",
      "Support tickets + job offers",
      "Reminders + automated nudges",
    ],
  },
  {
    key: "pro",
    name: "Pro",
    monthly: 69,
    badge: "Most Popular",
    highlight: true,
    oneLiner: "Growing operation",
    caps: { seats: 10, active_jobs: 9999, jobs_per_month: 9999, active_recurring: 100, pricebook_items: 500, workflow_templates: 100 },
    bullets: [
      "Everything in Standard",
      "Auto-scheduled recurring (no approval)",
      "Multi-option (good/better/best) quoting",
      "Time tracking — timer + billable rollup",
      "Expense tracking + reimbursements",
      "Customer self-service reschedule",
      "Branded proposals + e-signatures",
    ],
  },
  {
    key: "business",
    name: "Business",
    monthly: 129,
    oneLiner: "Multi-location operators",
    caps: { seats: 25, active_jobs: 9999, jobs_per_month: 9999, active_recurring: 500, pricebook_items: 9999, workflow_templates: 9999 },
    bullets: [
      "Everything in Pro",
      "Job costing + margin reporting",
      "Territories with primary + backup workers",
      "SLA policies + breach reporting",
      "BNPL / financing toggle",
      "Stripe Connect tenant payouts",
      "Advanced dispatch board",
    ],
  },
];

function annualPrice(monthly: number): number {
  return +(monthly * 0.9).toFixed(2);
}

// Live pricing from the API (single source of truth).
interface PlanPricingRow {
  tier: string;
  label: string;
  monthly: number | null;
  processingFee: string;
  processingFeePercent: number;
  processingFeeFlat: number;
}

// ─ Feature comparison table ──────────────────────────────────────────────────
interface FeatureRow { label: string; desc?: string; lite: boolean; std: boolean; pro: boolean; biz: boolean; status?: "built" | "scaffold" | "v2"; }

const FEATURE_SECTIONS: { section: string; rows: FeatureRow[] }[] = [
  {
    section: "Job lifecycle",
    rows: [
      { label: "Full job lifecycle (status flow)", lite: true, std: true, pro: true, biz: true, status: "built" },
      { label: "Customer portal — view + accept", lite: true, std: true, pro: true, biz: true, status: "built" },
      { label: "2-way messaging", lite: true, std: true, pro: true, biz: true, status: "built" },
      { label: "Calendar + scheduling", lite: true, std: true, pro: true, biz: true, status: "built" },
      { label: "Recurring jobs", lite: false, std: true, pro: true, biz: true, status: "built" },
      { label: "Workflow template library", lite: false, std: true, pro: true, biz: true, status: "built" },
      { label: "Support tickets w/ convert-to-job", lite: false, std: true, pro: true, biz: true, status: "built" },
      { label: "Job offer broadcast (first to accept)", lite: false, std: true, pro: true, biz: true, status: "built" },
    ],
  },
  {
    section: "Quoting & invoicing",
    rows: [
      { label: "Quotes + send to customer", lite: true, std: true, pro: true, biz: true, status: "built" },
      { label: "Invoices + Stripe Connect", lite: true, std: true, pro: true, biz: true, status: "built" },
      { label: "Coupons + discounts", lite: false, std: true, pro: true, biz: true, status: "built" },
      { label: "Multi-option (good/better/best) quotes", lite: false, std: false, pro: true, biz: true, status: "built" },
      { label: "Partial payments + deposits", lite: false, std: false, pro: true, biz: true, status: "built" },
      { label: "Branded proposals w/ e-signatures", lite: false, std: false, pro: true, biz: true, status: "built" },
      { label: "BNPL / Affirm financing", lite: false, std: false, pro: false, biz: true, status: "scaffold" },
    ],
  },
  {
    section: "Team & operations",
    rows: [
      { label: "User seats", desc: "Lite 1 · Std 5 · Pro 10 · Business 25", lite: true, std: true, pro: true, biz: true, status: "built" },
      { label: "Worker dispatch + assignments", lite: false, std: true, pro: true, biz: true, status: "built" },
      { label: "Roles + permissions (Admin / Accountant)", lite: false, std: true, pro: true, biz: true, status: "built" },
      { label: "Time tracking (timer + billable)", lite: false, std: false, pro: true, biz: true, status: "built" },
      { label: "Expense tracking + reimbursements", lite: false, std: false, pro: true, biz: true, status: "built" },
      { label: "Customer self-service reschedule", lite: false, std: false, pro: true, biz: true, status: "built" },
      { label: "Projects (multi-job engagements)", lite: false, std: false, pro: true, biz: true, status: "built" },
      { label: "Territories + backup workers", lite: false, std: false, pro: false, biz: true, status: "built" },
      { label: "SLA policies + breach reports", lite: false, std: false, pro: false, biz: true, status: "built" },
    ],
  },
  {
    section: "Reporting & insights",
    rows: [
      { label: "Job + revenue reports", lite: true, std: true, pro: true, biz: true, status: "built" },
      { label: "Billing overview dashboard", lite: false, std: true, pro: true, biz: true, status: "built" },
      { label: "Customer health + retention insights", lite: false, std: false, pro: true, biz: true, status: "built" },
      { label: "Job costing + margin analysis", lite: false, std: false, pro: false, biz: true, status: "built" },
      { label: "ARGUS AI insight reports", lite: false, std: false, pro: true, biz: true, status: "scaffold" },
    ],
  },
];

const STATUS_PILL: Record<string, { label: string; cls: string }> = {
  built:    { label: "Available",  cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  scaffold: { label: "Beta",       cls: "bg-amber-50 text-amber-700 border-amber-200" },
  v2:       { label: "v2 roadmap", cls: "bg-slate-100 text-slate-600 border-slate-200" },
};

function fmtNum(n: number | null | undefined): string {
  if (n == null) return "∞";
  return n.toLocaleString();
}

export function OliverUsagePage() {
  const { get, post, ready } = useOliverApi();
  const [usage, setUsage] = useState<UsageResponse["data"] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);

  const [tier, setTier] = useState<TierKey>("standard");
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annual">("monthly");
  const [showFullFeatures, setShowFullFeatures] = useState(false);
  const [acting, setActing] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [pricing, setPricing] = useState<Record<string, PlanPricingRow>>({});
  const [cx, setCx] = useState<{ cxTier: string; pricing: Record<string, { price: number; label: string }> } | null>(null);

  // ─ Derived ─────────────────────────────────────────────────────────────
  const tierDef = useMemo(() => TIERS.find(t => t.key === tier) || TIERS[1], [tier]);
  // Live price wins; static `monthly` is only a pre-load fallback.
  const baseMonthly = (k: TierKey) => pricing[k]?.monthly ?? (TIERS.find(t => t.key === k)?.monthly ?? 0);
  const feeLine = (k: TierKey) => pricing[k]?.processingFee || "";
  const monthlyPrice = billingCycle === "annual" ? annualPrice(baseMonthly(tier)) : baseMonthly(tier);

  // Current subscription. Founder/platform-owner = always Business + CX
  // Authority (full access, never charged). Everyone else = their real tier.
  const { activeTenantId } = useAppState();
  const { getToken } = useAccessToken();
  const owner = isPlatformOwner(activeTenantId);
  const currentTier: TierKey = owner
    ? "business"
    : ((["lite", "standard", "pro", "business"] as TierKey[]).includes(
        String(usage?.tier || "").toLowerCase() as TierKey)
        ? (String(usage?.tier).toLowerCase() as TierKey) : "lite");
  const currentCx = owner ? "authority" : (cx?.cxTier || "none");
  const cxPx = (k: string) => {
    const p = cx?.pricing?.[k]?.price ?? 0;
    return billingCycle === "annual" ? annualPrice(p) : p;
  };
  const curBasePrice = billingCycle === "annual" ? annualPrice(baseMonthly(currentTier)) : baseMonthly(currentTier);
  const curCxPrice = currentCx && currentCx !== "none" ? cxPx(currentCx) : 0;
  const curTotal = curBasePrice + curCxPrice;
  const selCxPrice = currentCx && currentCx !== "none" ? cxPx(currentCx) : 0; // CX not changed on this page
  const selTotal = monthlyPrice + selCxPrice;
  const changed = tier !== currentTier;
  const hasCurrent = owner || !!(usage && usage.tier);

  // ─ Load usage ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    (async () => {
      setLoading(true); setError(null);
      try {
        // /tier-limits/usage returns { data: { tier, usage: { seats: {used, limit}, … } } }
        const [raw, priceRes, cxRes] = await Promise.all([
          get<UsageResponse>("/tier-limits/usage"),
          get<{ data: PlanPricingRow[] }>("/tier-limits/plan-pricing").catch(() => ({ data: [] as PlanPricingRow[] })),
          get<{ data: { cxTier: string; pricing: Record<string, { price: number; label: string }> } }>("/client-experience").catch(() => null),
        ]);
        if (!cancelled) {
          setUsage(raw?.data || null);
          const pmap: Record<string, PlanPricingRow> = {};
          (priceRes?.data || []).forEach((r) => { pmap[r.tier] = r; });
          setPricing(pmap);
          if (cxRes?.data) setCx({ cxTier: cxRes.data.cxTier, pricing: cxRes.data.pricing });
          const live = raw?.data?.tier?.toLowerCase();
          if (isPlatformOwner(activeTenantId)) setTier("business");
          else if (live === "lite" || live === "standard" || live === "pro" || live === "business") setTier(live);
        }
      } catch (err) { if (!cancelled) setError(err); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [get, ready]);

  // ─ Usage strip data ────────────────────────────────────────────────────
  const usageBars = useMemo(() => usage ? [
    { label: "Seats",         used: usage.usage.seats.used,             limit: usage.usage.seats.limit,             icon: Users },
    { label: "Active jobs",   used: usage.usage.active_jobs.used,       limit: usage.usage.active_jobs.limit,       icon: Briefcase },
    { label: "Jobs this mo.", used: usage.usage.jobs_per_month.used,    limit: usage.usage.jobs_per_month.limit,    icon: Briefcase },
    { label: "Recurring",     used: usage.usage.active_recurring.used,  limit: usage.usage.active_recurring.limit,  icon: RotateCw },
  ] : [], [usage]);

  function pct(used: number, limit: number | null) {
    if (limit == null || limit === 0) return 0;
    return Math.min(100, Math.round((used / limit) * 100));
  }

  return (
    <OliverPageWrapper title="Plan & Pricing" subtitle={usage?.tier ? `You're on the ${String(usage.tier).replace(/^\w/, c => c.toUpperCase())} plan` : "Pick your tier — usage tracked live"} error={error} loading={loading}>
      <PendingChangeBanner getToken={getToken} tenantId={activeTenantId} />
      {/* ── CURRENT USAGE STRIP ─────────────────────────────────────────── */}
      {usage && (
        <div className="card mb-4">
          <div className="card-hdr">
            <div>
              <div className="card-ttl">Live usage</div>
              <div className="card-sub">Current tier: <strong>{usage.tier || "—"}</strong></div>
            </div>
            <span className="text-xs text-slate-500">Resets on the 1st</span>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 px-4 pb-4">
            {usageBars.map(b => {
              const p = pct(b.used, b.limit);
              const color = p >= 90 ? "bg-rose-500" : p >= 70 ? "bg-amber-500" : "bg-emerald-500";
              const Icon = b.icon;
              return (
                <div key={b.label} className="border border-slate-200 rounded-md p-3 bg-white">
                  <div className="flex items-center gap-2 mb-1">
                    <Icon className="h-3.5 w-3.5 text-slate-500" />
                    <span className="text-xs uppercase font-semibold text-slate-600">{b.label}</span>
                  </div>
                  <div className="text-lg font-bold text-slate-900">
                    {b.used.toLocaleString()} <span className="text-xs font-normal text-slate-400">/ {fmtNum(b.limit)}</span>
                  </div>
                  <div className="mt-2 h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                    <div className={`h-full ${color} transition-all`} style={{ width: `${p}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── PLAN BUILDER ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <div className="lg:col-span-2 space-y-4">
          {/* Tier picker — OLIVER-branded dark card (#1A3A4A / #FEC82C accent) */}
          <div className="rounded-xl bg-[#1A3A4A] text-white p-5 shadow-lg ring-1 ring-white/10">
            <div className="flex items-baseline justify-between mb-3">
              <div>
                <div className="text-[10px] uppercase tracking-wider font-bold text-[#FEC82C]">Choose your tier</div>
                <div className="text-xs text-white/60 mt-0.5">Caps shown are monthly</div>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {TIERS.map(t => (
                <button key={t.key} type="button" onClick={() => setTier(t.key)}
                  className={`text-left rounded-lg p-3 transition border-2 ${tier === t.key ? "border-[#FEC82C] bg-white/10" : "border-white/10 bg-white/5 hover:bg-white/10"}`}>
                  {currentTier === t.key
                    ? <div className="text-[9px] uppercase font-bold text-emerald-300 mb-1">✓ Current plan</div>
                    : t.badge && <div className="text-[9px] uppercase font-bold text-[#FEC82C] mb-1">{t.badge}</div>}
                  <div className="font-bold text-base">{t.name}</div>
                  <div className="text-[11px] text-white/60 mb-2">{t.oneLiner}</div>
                  <div className="text-xl font-bold">${billingCycle === "annual" ? annualPrice(baseMonthly(t.key)) : baseMonthly(t.key)}<span className="text-xs font-normal text-white/60">/mo</span></div>
                  {billingCycle === "annual" && <div className="text-[10px] text-emerald-300 mt-0.5">−10% saved</div>}
                  {feeLine(t.key) && <div className="text-[10px] text-white/55 mt-1 leading-tight">+ {feeLine(t.key)}</div>}
                </button>
              ))}
            </div>
          </div>

          {/* Selected tier inclusions */}
          <div className="card">
            <div className="card-hdr">
              <div>
                <div className="card-ttl">{tierDef.name} — included</div>
                <div className="card-sub">{tierDef.oneLiner}</div>
              </div>
              <button onClick={() => setShowFullFeatures(s => !s)} className="text-xs text-[#1A7DB5] font-medium flex items-center gap-1 hover:underline">
                {showFullFeatures ? "Hide full comparison" : "See full feature comparison"}
                {showFullFeatures ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </button>
            </div>
            <div className="px-4 pb-3">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-3">
                <CapPill label="Seats" value={tierDef.caps.seats} />
                <CapPill label="Active jobs" value={tierDef.caps.active_jobs} />
                <CapPill label="Jobs / month" value={tierDef.caps.jobs_per_month} />
                <CapPill label="Recurring" value={tierDef.caps.active_recurring} />
                <CapPill label="Pricebook items" value={tierDef.caps.pricebook_items} />
                <CapPill label="Workflow templates" value={tierDef.caps.workflow_templates} />
              </div>
              <ul className="text-sm text-slate-700 space-y-1">
                {tierDef.bullets.map(b => (
                  <li key={b} className="flex items-start gap-2">
                    <Check className="h-3.5 w-3.5 text-emerald-600 mt-0.5 flex-shrink-0" />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </div>

            {showFullFeatures && <FullFeatureTable />}
          </div>

          {/* Enterprise call-out */}
          <div className="card">
            <div className="card-hdr">
              <div>
                <div className="card-ttl">Enterprise</div>
                <div className="card-sub">Custom pricing for 50+ seats, multi-region, dedicated SLAs</div>
              </div>
            </div>
            <div className="px-4 pb-4 text-sm text-slate-700 space-y-1">
              <div className="flex items-start gap-2"><Check className="h-3.5 w-3.5 text-emerald-600 mt-0.5" /> Unlimited seats, jobs, and recurring services</div>
              <div className="flex items-start gap-2"><Check className="h-3.5 w-3.5 text-emerald-600 mt-0.5" /> SSO / SAML + custom audit retention</div>
              <div className="flex items-start gap-2"><Check className="h-3.5 w-3.5 text-emerald-600 mt-0.5" /> Bespoke integrations via FORGE</div>
              <div className="flex items-start gap-2"><Check className="h-3.5 w-3.5 text-emerald-600 mt-0.5" /> Dedicated success manager + custom SLA</div>
              <a href="mailto:support@iadm.io?subject=OLIVER Enterprise inquiry" className="inline-block mt-3 text-xs font-semibold text-[#1A7DB5] hover:underline">Talk to sales →</a>
            </div>
          </div>

          {/* Client Experience add-on — real cards */}
          <div className="card">
            <div className="card-hdr">
              <div>
                <div className="card-ttl">Client Experience add-on</div>
                <div className="card-sub">
                  {cx && cx.cxTier !== "none"
                    ? <>Active: <strong className="text-emerald-600">{(cx.pricing[cx.cxTier]?.label) || cx.cxTier}</strong></>
                    : "Optional — white-label portal, automations & retention tools"}
                </div>
              </div>
              <a href="/app/services/oliver_client_experience" className="text-xs text-[#1A7DB5] font-medium hover:underline">Manage →</a>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 px-4 pb-4">
              {(["essentials", "growth", "authority"] as const).map((k) => {
                const p = cx?.pricing?.[k];
                const active = currentCx === k;
                return (
                  <div key={k} className={`rounded-lg border-2 p-3 ${active ? "border-emerald-400 bg-emerald-50" : "border-slate-200 bg-white"}`}>
                    {active && <div className="text-[9px] uppercase font-bold text-emerald-600 mb-1">✓ Current</div>}
                    <div className="text-sm font-bold text-slate-800 capitalize">{k}</div>
                    <div className="text-lg font-bold text-slate-900">
                      ${p ? p.price.toFixed(2) : (k === "essentials" ? "19.99" : k === "growth" ? "49.99" : "99.99")}
                      <span className="text-xs font-normal text-slate-400">/mo</span>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="px-4 pb-4">
              <a href="/app/services/oliver_fees" className="flex items-center gap-2 text-xs text-[#1A7DB5] hover:underline">
                <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                <span>See the full fee breakdown (Stripe + platform, including caps) →</span>
              </a>
            </div>
          </div>
        </div>

        {/* RIGHT: live total summary */}
        <div className="lg:col-span-1">
          <div className="rounded-xl bg-[#1A3A4A] text-white p-5 shadow-lg ring-1 ring-white/10 sticky top-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-[10px] uppercase tracking-wider font-bold text-[#FEC82C]">Your plan</div>
              <div className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-white/5 text-white/60">Live</div>
            </div>

            {/* Billing toggle */}
            <div className="grid grid-cols-2 gap-1 p-1 bg-white/5 rounded-md mb-4">
              <button onClick={() => setBillingCycle("monthly")}
                className={`text-xs py-1.5 rounded transition ${billingCycle === "monthly" ? "bg-[#FEC82C] text-[#1A3A4A] font-semibold" : "text-white/60"}`}>
                Monthly
              </button>
              <button onClick={() => setBillingCycle("annual")}
                className={`text-xs py-1.5 rounded transition flex items-center justify-center gap-1 ${billingCycle === "annual" ? "bg-[#FEC82C] text-[#1A3A4A] font-semibold" : "text-white/60"}`}>
                Annual <span className="text-[9px] px-1 py-0.5 rounded bg-white/15">−10%</span>
              </button>
            </div>

            {/* Current plan line items */}
            <div className="space-y-1.5 text-sm">
              <div className="text-[10px] uppercase tracking-wider text-white/50 mb-1">Current</div>
              <Line label={`OLIVER ${TIERS.find(t => t.key === currentTier)?.name || currentTier}`} value={curBasePrice} struck={changed} />
              {currentCx !== "none" && cx?.pricing?.[currentCx] && (
                <Line label={`Client Experience ${cx.pricing[currentCx].label?.replace(/^Client Experience /, "") || currentCx}`} value={curCxPrice} accent struck={changed} />
              )}
              {feeLine(currentTier) && !changed && (
                <div className="flex items-center justify-between text-[11px] pt-1 text-white/60">
                  <span>Card processing</span><span>{feeLine(currentTier)}</span>
                </div>
              )}
              {!changed && (
                <div className="mt-2 pt-2 border-t border-white/15 flex items-baseline justify-between">
                  <span className="text-sm text-white/70">Total</span>
                  <div className="text-right"><span className="text-3xl font-bold">${curTotal.toFixed(2)}</span><span className="text-xs text-white/60 ml-1">/mo</span></div>
                </div>
              )}
            </div>

            {/* Upgrade preview */}
            {changed && (
              <div className="space-y-1.5 text-sm mt-3">
                <div className="text-[10px] uppercase tracking-wider text-[#FEC82C] mb-1">New plan</div>
                <Line label={`OLIVER ${tierDef.name}`} value={monthlyPrice} />
                {currentCx !== "none" && cx?.pricing?.[currentCx] && (
                  <Line label={`Client Experience ${cx.pricing[currentCx].label?.replace(/^Client Experience /, "") || currentCx}`} value={selCxPrice} accent />
                )}
                {feeLine(tier) && (
                  <div className="flex items-center justify-between text-[11px] pt-1 text-white/60"><span>Card processing</span><span>{feeLine(tier)}</span></div>
                )}
                <div className="mt-2 pt-2 border-t border-white/15 flex items-baseline justify-between">
                  <span className="text-sm text-white/70">New total</span>
                  <div className="text-right"><span className="text-3xl font-bold">${selTotal.toFixed(2)}</span><span className="text-xs text-white/60 ml-1">/mo</span></div>
                </div>
                {billingCycle === "annual" && <p className="text-[11px] text-white/50 text-right mt-0.5">Billed as ${(selTotal * 12).toFixed(2)}/yr</p>}
              </div>
            )}

            <button
              type="button"
              disabled={(!changed && hasCurrent) || acting}
              onClick={async () => {
                setActing(true); setMsg(null);
                try {
                  const r = await post<{ mode: string; url?: string; message?: string }>(
                    "/billing/change", { product: "oliver", billing_cycle: billingCycle, plan: tier });
                  if (r?.mode === "checkout" && r.url) { window.location.href = r.url; return; }
                  setMsg(r?.message || "Done.");
                } catch (e) { setMsg(e instanceof Error ? e.message : "Could not process the change."); }
                finally { setActing(false); }
              }}
              className={`mt-4 w-full py-2.5 rounded-md font-semibold transition ${((!changed && hasCurrent) || acting) ? "bg-white/10 text-white/50 cursor-default" : "bg-[#FEC82C] hover:bg-[#e3b424] text-[#1A3A4A]"}`}
            >
              {acting ? "Working…" : (!changed && hasCurrent) ? "This is your current plan" : hasCurrent ? `Upgrade to ${tierDef.name.toUpperCase()}` : `Purchase ${tierDef.name.toUpperCase()}`}
            </button>
            {msg && <div className="mt-2 text-[11px] text-emerald-300 text-center">{msg}</div>}
            <p className="text-[10px] text-white/50 mt-2 text-center">Cancel or downgrade anytime · No long-term contract · No setup fee</p>
          </div>
        </div>
      </div>
    </OliverPageWrapper>
  );
}

function CapPill({ label, value }: { label: string; value: number }) {
  return (
    <div className="border border-slate-200 rounded-md p-2 bg-slate-50">
      <div className="text-[10px] uppercase font-semibold text-slate-500">{label}</div>
      <div className="text-base font-bold text-slate-800">{value >= 9999 ? "Unlimited" : value.toLocaleString()}</div>
    </div>
  );
}

function Line({ label, value, accent, sub, struck }: { label: string; value: number; accent?: boolean; sub?: boolean; struck?: boolean }) {
  return (
    <div className={`flex items-center justify-between ${sub ? "text-[11px] text-white/60 pl-3" : "text-sm"}`}>
      <span className={`${accent ? "text-[#FEC82C]" : "text-white/80"} ${struck ? "line-through opacity-50" : ""}`}>{label}</span>
      <span className={`font-semibold ${accent ? "text-[#FEC82C]" : ""} ${struck ? "line-through opacity-50" : ""}`}>${value.toFixed(2)}</span>
    </div>
  );
}

function FullFeatureTable() {
  return (
    <div className="border-t border-slate-200 pt-3 px-4 pb-4 mt-2">
      <div className="text-xs text-slate-500 mb-3 italic">
        <strong className="text-slate-700 not-italic">Status legend:</strong>{" "}
        <span className="inline-block px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] mx-1">Available</span> shipped in v1.0 ·
        <span className="inline-block px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 text-[10px] mx-1">Beta</span> wired up, polish in progress ·
        <span className="inline-block px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200 text-[10px] mx-1">v2 roadmap</span> deferred to next release
      </div>
      <div className="overflow-x-auto -mx-1">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-slate-600 border-b border-slate-200">
              <th className="py-2 pl-1 font-semibold">Feature</th>
              <th className="text-center px-2 font-semibold">Lite</th>
              <th className="text-center px-2 font-semibold">Standard</th>
              <th className="text-center px-2 font-semibold">Pro</th>
              <th className="text-center px-2 font-semibold">Business</th>
              <th className="text-center pl-2 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {FEATURE_SECTIONS.map(section => (
              <>
                <tr key={`h-${section.section}`}><td colSpan={6} className="pt-3 pb-1 text-[10px] uppercase tracking-wide font-bold text-slate-700">{section.section}</td></tr>
                {section.rows.map(row => {
                  const status = row.status ? STATUS_PILL[row.status] : null;
                  return (
                    <tr key={row.label} className="border-b border-slate-100">
                      <td className="py-2 pl-1">
                        <div className="font-medium text-slate-800">{row.label}</div>
                        {row.desc && <div className="text-[10px] text-slate-500">{row.desc}</div>}
                      </td>
                      <td className="text-center px-2">{row.lite ? <Check className="h-3.5 w-3.5 text-emerald-600 inline" /> : <span className="text-slate-300">—</span>}</td>
                      <td className="text-center px-2">{row.std ? <Check className="h-3.5 w-3.5 text-emerald-600 inline" /> : <span className="text-slate-300">—</span>}</td>
                      <td className="text-center px-2">{row.pro ? <Check className="h-3.5 w-3.5 text-emerald-600 inline" /> : <span className="text-slate-300">—</span>}</td>
                      <td className="text-center px-2">{row.biz ? <Check className="h-3.5 w-3.5 text-emerald-600 inline" /> : <span className="text-slate-300">—</span>}</td>
                      <td className="text-center pl-2">
                        {status && <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] border ${status.cls}`}>{status.label}</span>}
                      </td>
                    </tr>
                  );
                })}
              </>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default OliverUsagePage;
