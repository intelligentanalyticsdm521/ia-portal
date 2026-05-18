import { useEffect, useMemo, useState } from "react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { useAppState } from "../../app/AppState";
import { isPlatformOwner } from "../../lib/currentPlan";
import { changePlan } from "../../lib/billingApi";
import { useAccessToken } from "../../auth/useAccessToken";
import { SparkPageShell } from "../../components/spark/SparkPageShell";
import {
  Mail, MessageSquare, Users, Target, Check, AlertCircle, ChevronDown, ChevronUp,
} from "lucide-react";

interface UsageResponse {
  data: {
    tier: string;
    usage: { emails_sent: number; sms_sent: number; contacts_count: number; leads_issued: number };
    limits: { emails_per_month: number; sms_per_month: number; contacts_max: number };
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Pricing model — mirrors intelligentanalyticsdm.com/platforms/spark/spark-pricing
// ─────────────────────────────────────────────────────────────────────────────
// Email volume is the primary slider. Contacts + SMS follow as derived limits.
//
// Public page reference (https://intelligentanalyticsdm.com/platforms/spark/spark-pricing):
//   Slider range: 5,000 → 500,000 emails/month
//   At 5k:   1,000 contacts, 100 SMS, $19/mo monthly ($17/mo annual)
//   Pro add-on:      $49/mo monthly ($44/mo annual) — 10% annual savings
//   Business add-on: $89/mo monthly ($80/mo annual)
//   Enterprise:      $150/mo monthly ($135/mo annual)
//   Annual billing saves 10% (one discount, applied at total)
//
// Resource ratios at the 5k baseline: contacts = emails / 5, SMS = emails / 50

const EMAIL_STEPS = [5000, 10000, 25000, 50000, 100000, 250000, 500000];

function basePriceForEmails(emails: number, cycle: "monthly" | "annual"): number {
  // Monthly prices. Annual prices are 10% lower.
  const monthly =
    emails <= 5000   ? 19  :
    emails <= 10000  ? 29  :
    emails <= 25000  ? 49  :
    emails <= 50000  ? 79  :
    emails <= 100000 ? 129 :
    emails <= 250000 ? 239 :
                       399;
  return cycle === "annual" ? +(monthly * 0.9).toFixed(2) : monthly;
}

function contactsForEmails(emails: number): number { return Math.round(emails / 5); }
function smsForEmails(emails: number): number { return Math.round(emails / 50); }

// Tier add-ons — monthly rates. Annual = 10% off.
const TIER_ADDON_MONTHLY = { standard: 0, pro: 49, business: 89, enterprise: 150 } as const;
function tierAddOn(t: keyof typeof TIER_ADDON_MONTHLY, cycle: "monthly" | "annual"): number {
  const m = TIER_ADDON_MONTHLY[t];
  return cycle === "annual" ? +(m * 0.9).toFixed(2) : m;
}

// ─ Feature gating data (from public pricing page) ────────────────────────────

interface TierFeature {
  label: string;
  desc?: string;
  std: boolean;
  pro: boolean;
  biz: boolean;
  ent?: boolean;
  status?: "built" | "scaffold" | "v2";
}

const TIER_FEATURES: { section: string; rows: TierFeature[] }[] = [
  {
    section: "Core CRM & Contacts",
    rows: [
      { label: "Full CRM", desc: "Contacts, profiles, activity history, tags, custom fields", std: true, pro: true, biz: true, ent: true, status: "built" },
      { label: "Static lists + basic segmentation", std: true, pro: true, biz: true, ent: true, status: "built" },
      { label: "Forms + UTM source tracking", std: true, pro: true, biz: true, ent: true, status: "built" },
      { label: "ARION form → SPARK auto-flow", desc: "Website form submissions auto-create SPARK contacts", std: true, pro: true, biz: true, ent: true, status: "built" },
      { label: "Dynamic + behavioral segmentation", std: false, pro: true, biz: true, ent: true, status: "scaffold" },
      { label: "OLIVER data in segments", desc: "Filter by job history, open invoices — unique to IA", std: false, pro: false, biz: true, ent: true, status: "scaffold" },
      { label: "Web + event tracking segments", std: false, pro: false, biz: true, ent: true, status: "v2" },
    ],
  },
  {
    section: "Email & SMS",
    rows: [
      { label: "Email campaigns + builder", std: true, pro: true, biz: true, ent: true, status: "built" },
      { label: "SMS campaigns + 2-way replies", std: true, pro: true, biz: true, ent: true, status: "scaffold" },
      { label: "Transactional email", desc: "Automated OLIVER job confirmations, ARION receipts, reminders", std: true, pro: true, biz: true, ent: true, status: "scaffold" },
      { label: "A/B testing", std: false, pro: true, biz: true, ent: true, status: "v2" },
      { label: "AI content + subject line suggestions", std: false, pro: true, biz: true, ent: true, status: "v2" },
      { label: "STELLA-Powered Send Intelligence", std: false, pro: true, biz: true, ent: true, status: "v2" },
      { label: "Ecommerce automation", std: false, pro: false, biz: true, ent: true, status: "v2" },
    ],
  },
  {
    section: "Automations & Journeys",
    rows: [
      { label: "Basic automation — form triggers", std: true, pro: true, biz: true, ent: true, status: "scaffold" },
      { label: "Visual journey builder", std: false, pro: true, biz: true, ent: true, status: "v2" },
      { label: "Landing pages + popups", std: false, pro: true, biz: true, ent: true, status: "built" },
      { label: "Sales Pipeline via OLIVER Workflows", std: false, pro: true, biz: true, ent: true, status: "built" },
      { label: "Advanced routing rules", std: false, pro: false, biz: true, ent: true, status: "v2" },
      { label: "Approval workflows", std: false, pro: false, biz: true, ent: true, status: "v2" },
      { label: "Rules-based lead scoring", std: false, pro: false, biz: true, ent: true, status: "scaffold" },
    ],
  },
  {
    section: "Reporting & Analytics",
    rows: [
      { label: "Campaign performance reports", std: true, pro: true, biz: true, ent: true, status: "built" },
      { label: "Lead source attribution", std: true, pro: true, biz: true, ent: true, status: "built" },
      { label: "Deliverability dashboard", std: false, pro: true, biz: true, ent: true, status: "v2" },
      { label: "Automation performance reporting", std: false, pro: true, biz: true, ent: true, status: "v2" },
      { label: "Ad audience sync (Google/Meta)", std: false, pro: false, biz: true, ent: true, status: "v2" },
      { label: "Multi-touch revenue attribution", std: false, pro: false, biz: true, ent: true, status: "scaffold" },
      { label: "Custom reporting + scheduled exports", std: false, pro: false, biz: true, ent: true, status: "v2" },
    ],
  },
  {
    section: "Team & Admin",
    rows: [
      { label: "User seats", desc: "Standard: 1 · Pro: 3 · Business: 5 · Enterprise: ∞", std: true, pro: true, biz: true, ent: true, status: "scaffold" },
      { label: "Sender domain setup (SPF/DKIM)", std: true, pro: true, biz: true, ent: true, status: "v2" },
      { label: "Roles + permissions", std: false, pro: false, biz: true, ent: true, status: "scaffold" },
      { label: "Custom branded emails + domain", std: false, pro: false, biz: true, ent: true, status: "v2" },
      { label: "SSO / SAML", std: false, pro: false, biz: false, ent: true, status: "v2" },
      { label: "Dedicated IP for email sending", std: false, pro: false, biz: false, ent: true, status: "v2" },
      { label: "Audit logs + custom SLA", std: false, pro: false, biz: false, ent: true, status: "v2" },
    ],
  },
];

// ─ Lead Gen tier data ────────────────────────────────────────────────────────

interface LeadGenTier {
  key: "essentials" | "growth" | "authority";
  name: string;
  price: number;
  badge?: string;
  leadsIncluded: number;
  overage: number;
  cap: number;
  highlight?: boolean;
  features: { section: "Lead Generation" | "SPARK Enhancements"; items: string[] }[];
}

const LEAD_GEN_TIERS: LeadGenTier[] = [
  {
    key: "essentials", name: "Leads Essentials", price: 49.99, leadsIncluded: 50, overage: 1.25, cap: 75,
    features: [
      {
        section: "Lead Generation", items: [
          "1 search profile (category + location)",
          "Google / Bing / Yellow Pages scraping",
          "Hunter.io contact enrichment",
          "Intelligent Analytics custom scoring model",
          "Auto-injected to SPARK CRM with tags",
          "Lead inbox — accept / reject / assign",
          "Basic funnel tracking",
        ],
      },
      {
        section: "SPARK Enhancements", items: [
          "Full contact database scoring — your entire CRM scored on enrollment",
          "2 pre-built follow-up sequences (email + SMS)",
          "Lead source attribution dashboard",
        ],
      },
    ],
  },
  {
    key: "growth", name: "Leads Growth", price: 99.99, leadsIncluded: 100, overage: 1.15, cap: 100,
    badge: "Most Popular", highlight: true,
    features: [
      {
        section: "Lead Generation", items: [
          "3 search profiles, multi-category targeting",
          "Enhanced enrichment — job title, LinkedIn, phone",
          "Hot / Warm / Cold confidence tiers",
          "Territory routing + suppression list",
          "Monthly lead performance digest",
        ],
      },
      {
        section: "SPARK Enhancements", items: [
          "AI-powered outreach sequence builder",
          "Behavioral lead scoring — evolves on opens, clicks, replies",
          "Advanced A/B testing for sequences",
          "Ad audience sync — Google/Facebook auto-push",
        ],
      },
    ],
  },
  {
    key: "authority", name: "Leads Authority", price: 149.99, leadsIncluded: 150, overage: 1.00, cap: 150,
    features: [
      {
        section: "Lead Generation", items: [
          "Unlimited search profiles",
          "Full Hunter.io enrichment depth",
          "Custom scoring model tuning — quarterly",
          "Competitor domain monitoring — 3 domains/mo",
          "Quarterly strategy session (30 min)",
        ],
      },
      {
        section: "SPARK Enhancements", items: [
          "Sales Pipeline via OLIVER Workflows",
          "Call campaign builder — AI scripts + auto follow-up",
          "Revenue attribution dashboard",
          "STELLA audience intelligence",
          "API + webhook sync",
        ],
      },
    ],
  },
];

// ─ Page ──────────────────────────────────────────────────────────────────────

export function SparkUsagePage() {
  const { get, ready } = useSparkApi();
  const { getToken } = useAccessToken();
  const [acting, setActing] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [usage, setUsage] = useState<UsageResponse["data"] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);

  const [emailsIdx, setEmailsIdx] = useState(0);   // default to 5,000 — slider entry point
  const [tier, setTier] = useState<"standard" | "pro" | "business">("standard");
  const [leadGenTier, setLeadGenTier] = useState<LeadGenTier["key"] | null>(null);
  const [leadExtras, setLeadExtras] = useState<Record<LeadGenTier["key"], number>>({
    essentials: 0, growth: 0, authority: 0,
  });
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annual">("monthly");
  const [showFullFeatures, setShowFullFeatures] = useState(false);

  // Founder/platform-owner = always the top of SPARK (max volume + Business
  // feature tier + Authority Lead Gen), full access, never charged. Everyone
  // else shows their real current tier.
  const { activeTenantId } = useAppState();
  const owner = isPlatformOwner(activeTenantId);
  const currentTier: "standard" | "pro" | "business" = owner
    ? "business"
    : (usage?.tier === "pro" || usage?.tier === "business" ? usage.tier : "standard");
  const currentLeadGen: LeadGenTier["key"] | null = owner ? "authority" : null;

  // ─ Derived ───────────────────────────────────────────────────────────────
  const targetEmails = EMAIL_STEPS[emailsIdx];
  const targetContacts = contactsForEmails(targetEmails);
  const targetSms = smsForEmails(targetEmails);
  const basePrice = basePriceForEmails(targetEmails, billingCycle);
  const tierPrice = tierAddOn(tier as keyof typeof TIER_ADDON_MONTHLY, billingCycle);

  const lgTierObj = leadGenTier ? LEAD_GEN_TIERS.find(t => t.key === leadGenTier) : null;
  const lgExtras = lgTierObj ? leadExtras[lgTierObj.key] : 0;
  const lgExtrasCost = lgTierObj ? lgExtras * lgTierObj.overage : 0;
  // Lead Gen tier prices follow the same 10% annual discount as the rest of SPARK.
  const lgBasePrice = lgTierObj ? (billingCycle === "annual" ? +(lgTierObj.price * 0.9).toFixed(2) : lgTierObj.price) : 0;
  const lgPrice = lgBasePrice + lgExtrasCost;

  // basePrice, tierPrice, and lgBasePrice already have the annual discount applied
  // by their helper functions. Per-lead overage is NOT discounted (it's an a la
  // carte usage charge). So total is just the sum — no extra discount layer.
  const totalMonthly = basePrice + tierPrice + lgPrice;
  const totalAnnualBilled = totalMonthly * 12;

  // ─ Load ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    (async () => {
      setLoading(true); setError(null);
      try {
        const raw = await get<UsageResponse>("/api/v1/usage");
        if (!cancelled) {
          setUsage(raw.data || null);
          if (isPlatformOwner(activeTenantId)) {
            // Founder: max everything.
            setEmailsIdx(EMAIL_STEPS.length - 1);
            setTier("business");
            setLeadGenTier("authority");
          } else if (raw.data?.tier === "pro") setTier("pro");
          else if (raw.data?.tier === "business") setTier("business");
        }
      } catch (err) { if (!cancelled) setError(err); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [get, ready]);

  // ─ Current usage bars ────────────────────────────────────────────────────
  const bars = useMemo(() => usage ? [
    { label: "Emails sent", used: usage.usage.emails_sent, limit: usage.limits.emails_per_month, icon: Mail },
    { label: "SMS sent", used: usage.usage.sms_sent, limit: usage.limits.sms_per_month, icon: MessageSquare },
    { label: "Contacts", used: usage.usage.contacts_count, limit: usage.limits.contacts_max, icon: Users },
    { label: "Leads issued", used: usage.usage.leads_issued, limit: 50, icon: Target },
  ] : [], [usage]);

  function pct(used: number, limit: number) {
    return limit === 0 ? 0 : Math.min(100, Math.round((used / limit) * 100));
  }

  // ─ Render ────────────────────────────────────────────────────────────────
  return (
    <SparkPageShell
      title="Plan & Pricing"
      subtitle="Build your plan — drag the slider, pick a tier, add Lead Gen. Current usage shown at top for reference; full usage on the Usage page."
      help={
        <>
          <strong className="block mb-1">How pricing works:</strong>
          Your <strong>base price</strong> comes from the email-volume slider — pick how much you'll send per month and you get a matching number of contacts + SMS at no extra cost.
          <br /><br />
          <strong>Feature tier</strong> (Standard / Pro / Business) adds capability on top of the base. Pro adds Sales Pipeline, Newsletter Studio, advanced automations. Business adds AI Writer, OLIVER-cross segments, and revenue attribution.
          <br /><br />
          <strong>Lead Generation</strong> is a separate add-on — three tiers (Essentials / Growth / Authority) each with their own monthly lead allocation, overage rate, and unlocked extras. Available at any base tier.
          <br /><br />
          Annual billing saves 10%.
        </>
      }
      loading={loading}
      error={error}
    >
      {/* CURRENT USAGE STRIP */}
      {usage && (
        <div className="spark-mini-card mb-4">
          <div className="spark-mini-card-header">
            <span className="spark-mini-card-title">This month's usage</span>
            <span className="text-xs text-slate-500">Resets on the 1st</span>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {bars.map(b => {
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
                    {b.used.toLocaleString()} <span className="text-xs font-normal text-slate-400">/ {b.limit.toLocaleString()}</span>
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

      {/* ── PLAN BUILDER (SPARK-branded dark card) ─────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <div className="lg:col-span-2 space-y-4">
          {/* Email volume slider — primary control */}
          <div className="rounded-xl bg-[#0B1C24] text-white p-5 shadow-lg ring-1 ring-white/10">
            <div className="flex items-baseline justify-between mb-3">
              <div>
                <div className="text-[10px] uppercase tracking-wider font-bold text-[#EF6C33]">Email Volume</div>
                <div className="text-xs text-white/60 mt-0.5">Drag the slider — contacts &amp; SMS scale automatically</div>
              </div>
              <div className="text-right">
                <div className="text-3xl font-bold">{targetEmails.toLocaleString()}</div>
                <div className="text-[10px] uppercase tracking-wider text-white/60">emails / mo</div>
              </div>
            </div>
            <input
              type="range" min={0} max={EMAIL_STEPS.length - 1} step={1}
              value={emailsIdx}
              onChange={e => setEmailsIdx(Number(e.target.value))}
              className="w-full accent-[#EF6C33]"
            />
            <div className="flex justify-between text-[10px] text-white/40 mt-1.5 font-mono">
              {EMAIL_STEPS.map((s, i) => (
                <button key={s} type="button" onClick={() => setEmailsIdx(i)}
                  className={`hover:text-white transition ${i === emailsIdx ? "text-[#EF6C33] font-bold" : ""}`}>
                  {s >= 1000 ? `${s / 1000}k` : s}
                </button>
              ))}
            </div>
            {/* Sub-resource cards */}
            <div className="grid grid-cols-3 gap-2 mt-4">
              <div className="bg-white/5 border border-white/10 rounded-lg p-2.5 text-center">
                <Mail className="h-3.5 w-3.5 text-[#EF6C33] mx-auto" />
                <div className="text-xs text-white/60 mt-1 uppercase tracking-wide">Emails/mo</div>
                <div className="text-base font-bold mt-0.5">{targetEmails.toLocaleString()}</div>
              </div>
              <div className="bg-white/5 border border-white/10 rounded-lg p-2.5 text-center">
                <Users className="h-3.5 w-3.5 text-[#EF6C33] mx-auto" />
                <div className="text-xs text-white/60 mt-1 uppercase tracking-wide">Contacts</div>
                <div className="text-base font-bold mt-0.5">{targetContacts.toLocaleString()}</div>
              </div>
              <div className="bg-white/5 border border-white/10 rounded-lg p-2.5 text-center">
                <MessageSquare className="h-3.5 w-3.5 text-[#EF6C33] mx-auto" />
                <div className="text-xs text-white/60 mt-1 uppercase tracking-wide">SMS/mo</div>
                <div className="text-base font-bold mt-0.5">{targetSms.toLocaleString()}</div>
              </div>
            </div>
            <div className="flex items-center justify-between mt-4 pt-3 border-t border-white/10">
              <span className="text-sm text-white/70">Base price</span>
              <span className="text-xl font-bold">${basePrice}<span className="text-xs font-normal text-white/60">/mo</span></span>
            </div>
          </div>

          {/* Feature tier picker */}
          <div className="spark-mini-card">
            <div className="spark-mini-card-header">
              <span className="spark-mini-card-title">Feature tier</span>
              <button onClick={() => setShowFullFeatures(s => !s)} className="text-xs text-[#EF6C33] font-medium flex items-center gap-1 hover:underline">
                {showFullFeatures ? "Hide full comparison" : "See full feature comparison"}
                {showFullFeatures ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <TierCard
                title="Standard" subtitle="The CRM essentials" addOn={0}
                active={tier === "standard"} onClick={() => setTier("standard")}
                current={currentTier === "standard"}
                bullets={["Contacts / Lists / Tags / Segments", "Email + SMS campaigns", "Forms + UTM tracking", "Basic Insights"]}
              />
              <TierCard
                title="Pro" subtitle="Marketing power tools" addOn={tierAddOn("pro", billingCycle)}
                active={tier === "pro"} onClick={() => setTier("pro")} accent current={currentTier === "pro"}
                bullets={["Sales Pipeline + Deals (Kanban)", "Newsletter Studio + WP auto-publish", "Social Scheduler + Calendar", "Landing Pages, NPS, Referrals", "Reputation Hub"]}
                more={2}
              />
              <TierCard
                title="Business" subtitle="Pro + AI + B2B" addOn={tierAddOn("business", billingCycle)}
                active={tier === "business"} onClick={() => setTier("business")}
                current={currentTier === "business"}
                bullets={["Everything in Pro", "B2B Companies + account reporting", "AI Writer (full access)", "IA Intelligence monthly + on-demand", "Annual deep-dive AI report"]}
                more={2}
              />
            </div>

            {showFullFeatures && <FullFeatureTable />}
          </div>
        </div>

        {/* RIGHT: live total summary */}
        <div className="lg:col-span-1">
          <div className="rounded-xl bg-[#0B1C24] text-white p-5 shadow-lg ring-1 ring-white/10 sticky top-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-[10px] uppercase tracking-wider font-bold text-[#EF6C33]">Your plan</div>
              <div className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-white/5 text-white/60">Live</div>
            </div>

            {/* Billing toggle */}
            <div className="grid grid-cols-2 gap-1 p-1 bg-white/5 rounded-md mb-4">
              <button onClick={() => setBillingCycle("monthly")}
                className={`text-xs py-1.5 rounded transition ${billingCycle === "monthly" ? "bg-[#EF6C33] font-semibold" : "text-white/60"}`}>
                Monthly
              </button>
              <button onClick={() => setBillingCycle("annual")}
                className={`text-xs py-1.5 rounded transition flex items-center justify-center gap-1 ${billingCycle === "annual" ? "bg-[#EF6C33] font-semibold" : "text-white/60"}`}>
                Annual <span className="text-[9px] px-1 py-0.5 rounded bg-white/15">−10%</span>
              </button>
            </div>

            {/* Line items */}
            <div className="space-y-1.5 text-sm">
              <Line label={`Standard base (${targetEmails.toLocaleString()} emails)`} value={basePrice} />
              {tier !== "standard" && (
                <Line label={`+ ${tier === "pro" ? "Pro" : "Business"} features`} value={tierPrice} accent />
              )}
              {lgTierObj && (
                <>
                  <Line label={`+ ${lgTierObj.name} (${lgTierObj.leadsIncluded} leads)`} value={lgBasePrice} accent />
                  {lgExtras > 0 && (
                    <Line label={`  +${lgExtras} extra leads @ $${lgTierObj.overage.toFixed(2)}/lead`} value={lgExtrasCost} sub />
                  )}
                </>
              )}
              {billingCycle === "annual" && (
                <div className="flex items-center justify-between text-[11px] pt-1 text-emerald-400">
                  <span>Annual billing</span>
                  <span>−10% applied</span>
                </div>
              )}
            </div>

            <div className="mt-4 pt-4 border-t border-white/15 flex items-baseline justify-between">
              <span className="text-sm text-white/70">Total</span>
              <div className="text-right">
                <span className="text-3xl font-bold">${totalMonthly.toFixed(2)}</span>
                <span className="text-xs text-white/60 ml-1">/mo</span>
              </div>
            </div>
            {billingCycle === "annual" && (
              <p className="text-[11px] text-white/50 text-right mt-0.5">Billed as ${totalAnnualBilled.toFixed(2)}/yr</p>
            )}

            <button
              type="button"
              disabled={acting || owner}
              onClick={async () => {
                if (!activeTenantId) return;
                setActing(true); setMsg(null);
                try {
                  const tk = await getToken();
                  const volumeKey = targetEmails >= 1000 ? `${targetEmails / 1000}k` : `${targetEmails}`;
                  const includedMap: Record<string, number> = { essentials: 50, growth: 100, authority: 150 };
                  const leadsKey = lgTierObj?.key || null;
                  const leadsSelected = leadsKey
                    ? (includedMap[leadsKey] ?? 0) + (lgExtras || 0) : undefined;
                  const r = await changePlan({
                    token: tk.accessToken, tenantId: activeTenantId,
                    body: {
                      product: "spark", billing_cycle: billingCycle,
                      volume: volumeKey,
                      featureAddon: tier !== "standard" ? tier : null,
                      leads: leadsKey, leadsSelected,
                    },
                  });
                  if (r.mode === "checkout" && r.url) { window.location.href = r.url; return; }
                  setMsg(r.message || "Done.");
                } catch (e) {
                  setMsg(e instanceof Error ? e.message : "Could not process the change.");
                } finally { setActing(false); }
              }}
              className={`mt-4 w-full py-2.5 rounded-md font-semibold transition ${(acting || owner) ? "bg-white/10 text-white/50 cursor-default" : "bg-[#EF6C33] hover:bg-[#d75a25] text-white"}`}
            >
              {owner ? "Platform account — included" : acting ? "Working…" : usage?.tier === tier ? "Update plan" : `Purchase ${tier.toUpperCase()}`}
            </button>
            {msg && <div className="mt-2 text-[11px] text-emerald-300 text-center">{msg}</div>}
            <p className="text-[10px] text-white/50 mt-2 text-center">Cancel or downgrade anytime · No long-term contract · No setup fee</p>
          </div>
        </div>
      </div>

      {/* ── LEAD GENERATION ADD-ON (3 cards, SPARK-branded) ────────────────── */}
      <div className="mt-8 mb-4">
        <div className="flex items-baseline justify-between mb-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
              Lead Generation add-on
              <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">Separate subscription</span>
            </h2>
            <p className="text-xs text-slate-500 mt-1">Verified B2B leads — research, scoring, and enrichment delivered to your inbox. Available at any base tier; no free leads included with Standard/Pro/Business.</p>
          </div>
          {leadGenTier && (
            <button onClick={() => setLeadGenTier(null)} className="text-xs text-slate-500 hover:text-slate-700 underline">
              Remove
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          {LEAD_GEN_TIERS.map(lt => (
            <LeadGenCard
              key={lt.key}
              tier={lt}
              active={leadGenTier === lt.key}
              current={currentLeadGen === lt.key}
              extras={leadExtras[lt.key]}
              onActivate={() => setLeadGenTier(lt.key)}
              onExtrasChange={(n) => setLeadExtras(e => ({ ...e, [lt.key]: n }))}
            />
          ))}
        </div>

        <div className="mt-3 text-xs text-slate-500">
          <strong className="text-slate-700">One-time runs:</strong> $1.75/lead — no subscription needed for ad-hoc research. <a href="mailto:support@iadm.io" className="text-[#EF6C33] hover:underline">Talk to Intelligent Analytics</a>
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

// ─ Sub-components ────────────────────────────────────────────────────────────

function TierCard({ title, subtitle, addOn, active, onClick, bullets, accent, more, current }: {
  title: string; subtitle: string; addOn: number; active: boolean; onClick: () => void;
  bullets: string[]; accent?: boolean; more?: number; current?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left p-4 rounded-lg border transition-all ${
        active
          ? "ring-2 ring-[#EF6C33] border-[#EF6C33] bg-[#EF6C33]/5"
          : accent
            ? "border-slate-300 hover:border-[#EF6C33] bg-white"
            : "border-slate-200 hover:border-slate-300 bg-white"
      }`}
    >
      {current && <div className="text-[9px] uppercase font-bold text-emerald-600 mb-1">✓ Current plan</div>}
      <div className="flex items-baseline justify-between">
        <div>
          <div className={`text-sm font-bold ${active ? "text-[#EF6C33]" : "text-slate-900"}`}>{title}</div>
          <div className="text-[11px] text-slate-500 mt-0.5">{subtitle}</div>
        </div>
        <div className={`text-lg font-bold ${active ? "text-[#EF6C33]" : "text-slate-900"}`}>
          {addOn === 0 ? "Included" : `+$${addOn}`}
        </div>
      </div>
      <ul className="mt-3 space-y-1">
        {bullets.map(b => (
          <li key={b} className="flex items-start gap-1.5 text-[11px] text-slate-700">
            <Check className="h-3 w-3 text-emerald-600 mt-0.5 flex-shrink-0" />
            <span>{b}</span>
          </li>
        ))}
        {more && more > 0 && (
          <li className="text-[10px] text-slate-500 mt-1.5">+ {more} more features</li>
        )}
      </ul>
    </button>
  );
}

function FullFeatureTable() {
  return (
    <div className="mt-4 pt-4 border-t border-slate-200 overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-[10px] uppercase tracking-wide text-slate-500">
            <th className="text-left py-2 pr-3">Feature</th>
            <th className="text-center py-2 px-2 w-20">Standard</th>
            <th className="text-center py-2 px-2 w-20">Pro</th>
            <th className="text-center py-2 px-2 w-20">Business</th>
            <th className="text-center py-2 px-2 w-20">Enterprise</th>
          </tr>
        </thead>
        <tbody>
          {TIER_FEATURES.map(group => (
            <FeatureGroup key={group.section} group={group} />
          ))}
        </tbody>
      </table>
      <div className="mt-3 flex items-center gap-3 text-[10px] text-slate-500">
        <span className="flex items-center gap-1"><span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" /> Built</span>
        <span className="flex items-center gap-1"><span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500" /> In development</span>
        <span className="flex items-center gap-1"><span className="inline-block h-1.5 w-1.5 rounded-full bg-slate-300" /> v2 roadmap</span>
      </div>
    </div>
  );
}

function FeatureGroup({ group }: { group: { section: string; rows: TierFeature[] } }) {
  return (
    <>
      <tr><td colSpan={5} className="pt-3 pb-1 font-semibold text-slate-700 text-[11px] uppercase tracking-wide">{group.section}</td></tr>
      {group.rows.map(r => (
        <tr key={r.label} className="border-t border-slate-100">
          <td className="py-2 pr-3">
            <div className="text-sm">{r.label} <StatusDot status={r.status} /></div>
            {r.desc && <div className="text-[10px] text-slate-500 mt-0.5">{r.desc}</div>}
          </td>
          <td className="text-center px-2">{cell(r.std)}</td>
          <td className="text-center px-2">{cell(r.pro)}</td>
          <td className="text-center px-2">{cell(r.biz)}</td>
          <td className="text-center px-2">{cell(r.ent ?? r.biz)}</td>
        </tr>
      ))}
    </>
  );
}

function cell(included: boolean) {
  return included
    ? <Check className="h-3.5 w-3.5 text-emerald-600 inline" />
    : <span className="text-slate-300">—</span>;
}
function StatusDot({ status }: { status?: "built" | "scaffold" | "v2" }) {
  if (!status) return null;
  const color = status === "built" ? "bg-emerald-500" : status === "scaffold" ? "bg-amber-500" : "bg-slate-300";
  return <span className={`inline-block h-1.5 w-1.5 rounded-full ${color} ml-1 align-middle`} />;
}

function Line({ label, value, accent, discount, sub }: { label: string; value: number; accent?: boolean; discount?: boolean; sub?: boolean }) {
  return (
    <div className={`flex items-center justify-between ${sub ? "text-xs text-white/60" : "text-sm"}`}>
      <span className={accent ? "text-white" : "text-white/70"}>{label}</span>
      <span className={`font-semibold ${discount ? "text-emerald-400" : accent ? "text-[#EF6C33]" : "text-white"}`}>
        {value < 0 ? `−$${Math.abs(value).toFixed(2)}` : `$${value.toFixed(2)}`}
      </span>
    </div>
  );
}

function LeadGenCard({ tier, active, extras, onActivate, onExtrasChange, current }: {
  tier: LeadGenTier; active: boolean; extras: number;
  onActivate: () => void; onExtrasChange: (n: number) => void; current?: boolean;
}) {
  return (
    <div className={`rounded-xl bg-[#0B1C24] text-white p-5 shadow-lg ring-1 transition-all ${
      active ? "ring-2 ring-[#EF6C33]" : "ring-white/10 hover:ring-white/20"
    }`}>
      {current && <div className="text-[9px] uppercase font-bold text-emerald-300 mb-1">✓ Current plan</div>}
      <div className="flex items-baseline justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-wider font-bold text-[#EF6C33]">{tier.name.split(" ")[1]}</div>
          <div className="text-lg font-bold mt-0.5">{tier.name}</div>
        </div>
        {tier.badge && (
          <span className="text-[9px] uppercase font-bold px-2 py-0.5 rounded-full bg-[#EF6C33] text-white">{tier.badge}</span>
        )}
      </div>

      <div className="mt-3">
        <span className="text-3xl font-bold">${tier.price.toFixed(2)}</span>
        <span className="text-xs text-white/60 ml-1">/mo add-on</span>
        <div className="text-[10px] text-[#EF6C33] mt-0.5">Billed monthly</div>
      </div>

      <div className="mt-3 pb-3 border-b border-white/10">
        <div className="text-sm font-bold text-[#EF6C33]">{tier.leadsIncluded} verified B2B leads/mo included</div>
        <div className="text-[10px] text-white/60 mt-1">Extra leads: ${tier.overage.toFixed(2)}/lead</div>
        <div className="text-[10px] text-white/60">Monthly cap: {tier.leadsIncluded + tier.cap} leads</div>
      </div>

      {/* Extras slider */}
      <div className="mt-3 bg-white/5 border border-white/10 rounded-lg p-3">
        <div className="flex items-start justify-between mb-2">
          <span className="text-[10px] uppercase tracking-wider text-white/70">Extra leads</span>
          <div className="text-right">
            <div className="text-xs font-bold">
              +{extras} {extras === 1 ? "lead" : "leads"}
            </div>
            <div className="text-[10px] text-[#EF6C33] font-semibold mt-0.5">
              {extras === 0
                ? <span className="text-white/50 font-normal">No extras</span>
                : <>+${(extras * tier.overage).toFixed(2)} <span className="text-white/50 font-normal">(${tier.overage.toFixed(2)}/lead)</span></>
              }
            </div>
          </div>
        </div>
        <input
          type="range" min={0} max={tier.cap} step={5}
          value={extras}
          onChange={e => { onExtrasChange(Number(e.target.value)); if (!active) onActivate(); }}
          className="w-full accent-[#EF6C33]"
        />
        <div className="flex justify-between text-[9px] text-white/40 mt-1 font-mono">
          <span>+0</span>
          <span>+{tier.cap} (cap)</span>
        </div>
      </div>

      <button
        type="button"
        onClick={onActivate}
        className={`mt-3 w-full py-2 rounded-md font-semibold text-sm transition ${
          active
            ? "bg-emerald-600 text-white"
            : tier.highlight
              ? "bg-[#EF6C33] hover:bg-[#d75a25] text-white"
              : "border border-white/30 hover:bg-white/10 text-white"
        }`}
      >
        {active ? "✓ Added to SPARK" : "Add to SPARK"}
      </button>

      {/* Feature checkmarks */}
      {tier.features.map(section => (
        <div key={section.section} className="mt-3">
          <div className="text-[10px] uppercase tracking-wider font-bold text-[#EF6C33] mb-1.5">{section.section}</div>
          <ul className="space-y-1">
            {section.items.map(item => (
              <li key={item} className="flex items-start gap-1.5 text-[11px] text-white/80">
                <Check className="h-3 w-3 text-[#EF6C33] mt-0.5 flex-shrink-0" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

export default SparkUsagePage;
