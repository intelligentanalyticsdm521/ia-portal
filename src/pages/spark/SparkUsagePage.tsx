import { useEffect, useMemo, useState } from "react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { SparkPageShell } from "../../components/spark/SparkPageShell";
import { SparkStatStrip } from "../../components/spark/SparkStatStrip";
import {
  Mail, MessageSquare, Users, Target, Check, Sparkles, Coins, AlertCircle,
  Briefcase, Zap, ArrowRight,
} from "lucide-react";

interface UsageResponse {
  data: {
    tier: string;
    usage: { emails_sent: number; sms_sent: number; contacts_count: number; leads_issued: number };
    limits: { emails_per_month: number; sms_per_month: number; contacts_max: number };
  };
}

// ─ Pricing model ─────────────────────────────────────────────────────────────
// The base plan is contact-volume driven. Tier 'add-ons' layer on top with fixed
// monthly upcharges. Lead generation is its own slider with its own pricing.
//
// All numbers here are illustrative. Final pricing should come from Stripe
// product config (when wired in v2 billing) — this UI just visualizes it.

// Slider snap points for the contact slider — common tier breakpoints
const CONTACT_STEPS = [500, 1000, 2500, 5000, 10000, 25000, 50000, 100000];

// Base price from the contact slider. Standard tier is $17/mo base (per the
// public pricing page) with the 500-contact entry point free for trials.
function basePriceForContacts(contacts: number): number {
  if (contacts <= 500) return 17;
  if (contacts <= 1000) return 27;
  if (contacts <= 2500) return 39;
  if (contacts <= 5000) return 59;
  if (contacts <= 10000) return 89;
  if (contacts <= 25000) return 139;
  if (contacts <= 50000) return 209;
  return 309;                           // 100k
}

function emailVolumeForContacts(contacts: number): number {
  // Industry-standard: 10x contacts in monthly email send volume
  return contacts * 10;
}

const PRO_ADDON = 40;        // $/month (matches public pricing page)
const BUSINESS_ADDON = 71;   // $/month, layered on Standard (includes Pro features)

// Lead Generation add-on — three sub-tiers from the public pricing page:
// Essentials $49.99 (50 leads, +$1.25/lead overage)
// Growth     $99.99 (100 leads, +$1.15/lead overage)
// Authority  $149.99 (150 leads, +$1.00/lead overage)
// Steps maps slider index to a lead-volume tier.
const LEAD_GEN_TIERS = [
  { leads: 0,   price: 0,      overage: 1.75, label: "Off",              note: "On-demand at $1.75/lead" },
  { leads: 50,  price: 49.99,  overage: 1.25, label: "Essentials",       note: "$1.25/lead overage" },
  { leads: 100, price: 99.99,  overage: 1.15, label: "Growth",           note: "$1.15/lead overage" },
  { leads: 150, price: 149.99, overage: 1.00, label: "Authority",        note: "$1.00/lead overage · best rate" },
];

const PRO_FEATURES = [
  "Sales Pipeline + Deals (Kanban)",
  "Newsletter Studio + WP auto-publish",
  "Social Scheduler + Content Calendar",
  "NPS, Referrals, Landing Pages",
  "Reputation Hub (review aggregation)",
  "IA Intelligence — quarterly insights",
  "100 AI Credits/mo (v2)",
];

const BUSINESS_FEATURES = [
  "Everything in Pro",
  "B2B Companies + account-based reporting",
  "AI Writer (full access)",
  "IA Intelligence — monthly + on-demand",
  "Annual deep-dive AI report",
  "500 AI Credits/mo (v2)",
  "Priority support",
];

export function SparkUsagePage() {
  const { get, ready } = useSparkApi();
  const [usage, setUsage] = useState<UsageResponse["data"] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);

  // Slider state (drives the live price preview)
  const [contactsIdx, setContactsIdx] = useState(2);             // index into CONTACT_STEPS, default 2500
  const [tier, setTier] = useState<"standard" | "pro" | "business">("standard");
  const [leadsIdx, setLeadsIdx] = useState(0);                   // index into LEAD_GEN_TIERS, default Off
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annual">("monthly");

  const targetContacts = CONTACT_STEPS[contactsIdx];
  const leadTier = LEAD_GEN_TIERS[leadsIdx];
  const targetLeads = leadTier.leads;
  const targetEmails = emailVolumeForContacts(targetContacts);
  const basePrice = basePriceForContacts(targetContacts);
  const tierPrice = tier === "pro" ? PRO_ADDON : tier === "business" ? BUSINESS_ADDON : 0;
  const leadPrice = leadTier.price;
  const subtotal = basePrice + tierPrice + leadPrice;
  // Annual = 10% off (per pricing page)
  const annualDiscount = billingCycle === "annual" ? subtotal * 0.10 : 0;
  const totalPrice = subtotal - annualDiscount;

  // Load current usage
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    async function load() {
      setLoading(true); setError(null);
      try {
        const raw = await get<UsageResponse>("/api/v1/usage");
        if (!cancelled) {
          setUsage(raw.data || null);
          // Initialize slider near current usage
          if (raw.data?.limits.contacts_max) {
            const idx = CONTACT_STEPS.findIndex(s => s >= raw.data!.limits.contacts_max);
            if (idx >= 0) setContactsIdx(idx);
          }
          if (raw.data?.tier === "pro") setTier("pro");
          else if (raw.data?.tier === "business") setTier("business");
        }
      } catch (err) { if (!cancelled) setError(err); }
      finally { if (!cancelled) setLoading(false); }
    }
    load();
    return () => { cancelled = true; };
  }, [get, ready]);

  // Usage bars (current consumption)
  const bars = useMemo(() => usage ? [
    { label: "Emails sent", used: usage.usage.emails_sent, limit: usage.limits.emails_per_month, icon: Mail },
    { label: "SMS sent", used: usage.usage.sms_sent, limit: usage.limits.sms_per_month, icon: MessageSquare },
    { label: "Contacts", used: usage.usage.contacts_count, limit: usage.limits.contacts_max, icon: Users },
    { label: "Leads issued", used: usage.usage.leads_issued, limit: 50, icon: Target },
  ] : [], [usage]);

  function pct(used: number, limit: number) {
    return limit === 0 ? 0 : Math.min(100, Math.round((used / limit) * 100));
  }
  function barColor(p: number) {
    if (p >= 90) return "bg-rose-500";
    if (p >= 70) return "bg-amber-500";
    return "bg-emerald-500";
  }
  const anyNearLimit = bars.some(b => pct(b.used, b.limit) >= 80);

  return (
    <SparkPageShell
      title="Usage & Billing"
      subtitle="Adjust your plan with sliders — pricing updates live"
      stats={usage
        ? <SparkStatStrip stats={[
            { label: "Current tier", value: usage.tier.toUpperCase(), accent: "blue" },
            { label: "Emails this month", value: usage.usage.emails_sent.toLocaleString() },
            { label: "Contacts", value: usage.usage.contacts_count.toLocaleString(), icon: Users },
            { label: "Leads issued", value: usage.usage.leads_issued.toLocaleString(), icon: Target },
          ]} />
        : undefined}
      loading={loading}
      error={error}
    >
      {/* CURRENT USAGE */}
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
                <div className="mt-1 text-[10px] text-slate-500">{p}% used</div>
              </div>
            );
          })}
        </div>
        {anyNearLimit && (
          <div className="mt-3 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-amber-900">
              <strong>Approaching plan limits.</strong> Adjust the sliders below to right-size your plan.
            </div>
          </div>
        )}
      </div>

      {/* ── PLAN BUILDER (the big new thing) ───────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        {/* Left: sliders */}
        <div className="lg:col-span-2 space-y-4">
          {/* CONTACTS SLIDER */}
          <div className="spark-mini-card">
            <div className="spark-mini-card-header">
              <span className="spark-mini-card-title flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5 text-blue-600" /> Contacts + email volume
              </span>
              <span className="text-xs text-slate-500">Drives your base plan price</span>
            </div>
            <div className="px-1 py-2">
              <div className="flex items-baseline justify-between mb-2">
                <div>
                  <span className="text-3xl font-bold text-slate-900">{targetContacts.toLocaleString()}</span>
                  <span className="text-sm text-slate-500 ml-1">contacts</span>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold text-slate-700">{targetEmails.toLocaleString()}</div>
                  <div className="text-[10px] uppercase text-slate-500">emails/mo included</div>
                </div>
              </div>
              <input
                type="range"
                min={0}
                max={CONTACT_STEPS.length - 1}
                step={1}
                value={contactsIdx}
                onChange={e => setContactsIdx(Number(e.target.value))}
                className="w-full accent-blue-600"
              />
              <div className="flex justify-between text-[10px] text-slate-400 mt-1 font-mono">
                {CONTACT_STEPS.map((s, i) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setContactsIdx(i)}
                    className={`hover:text-slate-700 transition ${i === contactsIdx ? "text-blue-600 font-semibold" : ""}`}
                  >
                    {s >= 1000 ? `${s / 1000}k` : s}
                  </button>
                ))}
              </div>
              <div className="mt-3 flex items-center justify-between text-sm">
                <span className="text-slate-600">Base price</span>
                <span className="font-semibold text-slate-900">${basePrice}/mo</span>
              </div>
            </div>
          </div>

          {/* TIER ADD-ONS */}
          <div className="spark-mini-card">
            <div className="spark-mini-card-header">
              <span className="spark-mini-card-title flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-violet-600" /> Feature tier
              </span>
              <span className="text-xs text-slate-500">Adds to the base price</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <TierCard
                title="Standard" subtitle="Just the CRM" price="+$0" active={tier === "standard"} onClick={() => setTier("standard")}
                bullets={["Contacts, Lists, Tags, Segments", "Email + SMS campaigns", "Forms + QR codes", "Basic Insights"]}
              />
              <TierCard
                title="Pro" subtitle="Add Pro features" price={`+$${PRO_ADDON}`} active={tier === "pro"} onClick={() => setTier("pro")}
                accent="violet" bullets={PRO_FEATURES.slice(0, 4)} more={PRO_FEATURES.length - 4}
              />
              <TierCard
                title="Business" subtitle="Pro + AI Writer" price={`+$${BUSINESS_ADDON}`} active={tier === "business"} onClick={() => setTier("business")}
                accent="emerald" bullets={BUSINESS_FEATURES.slice(0, 4)} more={BUSINESS_FEATURES.length - 4}
              />
            </div>
          </div>

          {/* LEAD GEN SLIDER */}
          <div className="spark-mini-card">
            <div className="spark-mini-card-header">
              <span className="spark-mini-card-title flex items-center gap-1.5">
                <Briefcase className="h-3.5 w-3.5 text-amber-600" /> Lead Generation add-on
              </span>
              <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">Optional</span>
            </div>
            <div className="px-1 py-2">
              <div className="flex items-baseline justify-between mb-2">
                <div>
                  <span className="text-3xl font-bold text-slate-900">{targetLeads.toLocaleString()}</span>
                  <span className="text-sm text-slate-500 ml-1">leads/mo · {leadTier.label}</span>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold text-amber-700">${leadPrice}/mo</div>
                  <div className="text-[10px] uppercase text-slate-500">{leadTier.note}</div>
                </div>
              </div>
              <input
                type="range"
                min={0}
                max={LEAD_GEN_TIERS.length - 1}
                step={1}
                value={leadsIdx}
                onChange={e => setLeadsIdx(Number(e.target.value))}
                className="w-full accent-amber-600"
              />
              <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                {LEAD_GEN_TIERS.map((t, i) => (
                  <button
                    key={t.label}
                    type="button"
                    onClick={() => setLeadsIdx(i)}
                    className={`hover:text-slate-700 transition flex flex-col items-center ${i === leadsIdx ? "text-amber-700 font-semibold" : ""}`}
                  >
                    <span>{t.leads === 0 ? "Off" : t.leads}</span>
                    <span className="text-[9px]">{t.label}</span>
                  </button>
                ))}
              </div>
              <div className="mt-3 text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-md p-2">
                <strong className="text-slate-900">Pure add-on, available at any tier.</strong> No free leads are included with Standard/Pro/Business — the lead-gen subscription is independent. Overage is billed per-lead at the rate shown.
              </div>
            </div>
          </div>
        </div>

        {/* Right: live price summary */}
        <div className="lg:col-span-1">
          <div className="spark-mini-card sticky top-4">
            <div className="spark-mini-card-header">
              <span className="spark-mini-card-title">Your plan</span>
              <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">Live preview</span>
            </div>

            {/* Billing cycle toggle */}
            <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-md mb-3">
              <button
                type="button"
                onClick={() => setBillingCycle("monthly")}
                className={`text-xs py-1.5 rounded transition ${billingCycle === "monthly" ? "bg-white shadow-sm font-semibold text-slate-900" : "text-slate-600"}`}
              >Monthly</button>
              <button
                type="button"
                onClick={() => setBillingCycle("annual")}
                className={`text-xs py-1.5 rounded transition flex items-center justify-center gap-1 ${billingCycle === "annual" ? "bg-white shadow-sm font-semibold text-slate-900" : "text-slate-600"}`}
              >
                Annual
                <span className="text-[9px] px-1 py-0.5 rounded bg-emerald-100 text-emerald-700">−10%</span>
              </button>
            </div>

            <div className="space-y-2 text-sm">
              <Line label={`Contacts (${targetContacts.toLocaleString()})`} value={basePrice} />
              <Line label={`Emails included`} value={null} note={`${targetEmails.toLocaleString()}/mo`} />
              {tier !== "standard" && (
                <Line label={`${tier === "pro" ? "Pro" : "Business"} features`} value={tierPrice} />
              )}
              {leadPrice > 0 && (
                <Line label={`Lead Gen ${leadTier.label} (${targetLeads}/mo)`} value={leadPrice} />
              )}
              {billingCycle === "annual" && annualDiscount > 0 && (
                <Line label="Annual discount" value={-annualDiscount} accent="emerald" />
              )}
            </div>
            <div className="border-t border-slate-200 mt-3 pt-3 flex items-baseline justify-between">
              <span className="text-sm text-slate-600">Total</span>
              <span className="text-2xl font-bold text-slate-900">
                ${totalPrice.toFixed(2)}<span className="text-sm font-normal text-slate-500">/mo</span>
              </span>
            </div>
            {billingCycle === "annual" && (
              <p className="text-[11px] text-slate-500 text-right mt-0.5">Billed as ${(totalPrice * 12).toFixed(2)}/yr</p>
            )}
            <button
              type="button"
              onClick={() => alert("Stripe checkout flow ships with v2 billing. Email support@iadm.io to change your plan today.")}
              className="mt-3 w-full spark-btn spark-btn-primary"
            >
              {usage?.tier === tier ? "Update plan" : `Switch to ${tier.toUpperCase()}`}
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
            <p className="text-[11px] text-slate-500 mt-2 text-center">Cancel or downgrade anytime · No long-term contract</p>
          </div>
        </div>
      </div>

      {/* TIER FEATURE COMPARISON (full lists, expandable) */}
      <div className="spark-mini-card mb-4">
        <div className="spark-mini-card-header">
          <span className="spark-mini-card-title">What's in each tier</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-2">
          <FeatureList title="Standard ($0)" features={["Everyone gets these", "Contacts / Lists / Tags / Segments", "Email + SMS campaigns", "Forms + QR codes", "Basic heuristic Insights"]} />
          <FeatureList title={`Pro (+$${PRO_ADDON})`} features={PRO_FEATURES} accent="violet" />
          <FeatureList title={`Business (+$${BUSINESS_ADDON})`} features={BUSINESS_FEATURES} accent="emerald" />
        </div>
      </div>

      {/* INVOICE HISTORY PLACEHOLDER */}
      <div className="spark-mini-card">
        <div className="spark-mini-card-header">
          <span className="spark-mini-card-title">Billing history</span>
        </div>
        <div className="py-8 text-center text-sm text-slate-500">
          Stripe invoice history connects with v2 billing.
        </div>
      </div>
    </SparkPageShell>
  );
}

// ─ Helpers ─────────────────────────────────────────────────────────────────

interface TierCardProps {
  title: string; subtitle: string; price: string;
  active: boolean; onClick: () => void;
  bullets: string[]; more?: number;
  accent?: "violet" | "emerald";
}
function TierCard({ title, subtitle, price, active, onClick, bullets, more, accent }: TierCardProps) {
  const colors: Record<string, string> = {
    violet: "ring-violet-500/30 bg-violet-50/40 border-violet-300",
    emerald: "ring-emerald-500/30 bg-emerald-50/40 border-emerald-300",
  };
  const accentClass = accent ? colors[accent] : "ring-slate-500/30 bg-slate-50/40 border-slate-300";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left p-3 rounded-lg border transition-all ${active ? `ring-2 ${accentClass}` : "border-slate-200 hover:border-slate-300 bg-white"}`}
    >
      <div className="flex items-baseline justify-between">
        <div>
          <div className="text-sm font-semibold text-slate-900">{title}</div>
          <div className="text-[11px] text-slate-500">{subtitle}</div>
        </div>
        <div className="text-base font-bold text-slate-900">{price}</div>
      </div>
      <ul className="mt-2 space-y-0.5">
        {bullets.map(b => (
          <li key={b} className="flex items-start gap-1.5 text-[11px] text-slate-700">
            <Check className="h-3 w-3 text-emerald-600 mt-0.5 flex-shrink-0" />
            <span className="truncate">{b}</span>
          </li>
        ))}
        {more && more > 0 && (
          <li className="text-[10px] text-slate-500 mt-1">+ {more} more</li>
        )}
      </ul>
    </button>
  );
}

function Line({ label, value, note, accent }: { label: string; value: number | null; note?: string; accent?: "emerald" }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-slate-600">{label}</span>
      {value != null ? (
        <span className={`font-medium ${accent === "emerald" ? "text-emerald-700" : "text-slate-900"}`}>
          {value < 0 ? `−$${Math.abs(value).toFixed(2)}` : `$${value.toFixed(2)}`}
        </span>
      ) : (
        <span className="text-[11px] text-slate-500">{note}</span>
      )}
    </div>
  );
}

function FeatureList({ title, features, accent }: { title: string; features: string[]; accent?: "violet" | "emerald" }) {
  const headerColor = accent === "violet" ? "text-violet-700" : accent === "emerald" ? "text-emerald-700" : "text-slate-900";
  const Icon = accent === "violet" ? Sparkles : accent === "emerald" ? Zap : Coins;
  return (
    <div>
      <div className={`flex items-center gap-1.5 text-sm font-semibold mb-2 ${headerColor}`}>
        <Icon className="h-3.5 w-3.5" /> {title}
      </div>
      <ul className="space-y-1.5">
        {features.map(f => (
          <li key={f} className="flex items-start gap-1.5 text-xs text-slate-700">
            <Check className="h-3 w-3 text-emerald-600 mt-0.5 flex-shrink-0" />
            <span>{f}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default SparkUsagePage;
