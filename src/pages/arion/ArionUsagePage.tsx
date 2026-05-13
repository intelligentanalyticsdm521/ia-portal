// ArionUsagePage — ARION tier picker + SEO add-on selector
//
// Mirrors SparkUsagePage / OliverUsagePage. ARION has two billing components:
//   1. Base hosting tier (Lite / Standard / Pro / Business / Enterprise)
//   2. Optional SEO add-on (Essentials / Growth / Authority)
//
// Public pricing reference:
//   https://intelligentanalyticsdm.com/platforms/arion/arion-pricing
//
// Base tiers (monthly · annual is −10%):
//   Lite       $19.99   1 site  · managed WordPress + hosting
//   Standard   $29.99   1 site  · + blog, forms, GA, SEO dashboard
//   Pro        $49.99   1 + staging · + speed monitoring + priority support
//   Business   $99.99   up to 3 sites · + multi-site + role-based team access
//   Enterprise Custom    · SSO/SAML + custom SLAs
//
// SEO add-on (monthly · annual is −10%):
//   Essentials $49      10 keywords · audit + metadata + rank tracking
//   Growth     $99      50 keywords · + content plans + technical monitoring
//   Authority  $149     150 keywords · + AI search tracking + competitor pool
//
// Content Update Service and SEM Management add-ons are deferred to v2.
import type { PortalService, ServiceStatus } from "../../config/serviceCatalog";
import { useEffect, useMemo, useState } from "react";
import { Check, AlertCircle, ChevronDown, ChevronUp, Globe, Users, Search, Activity } from "lucide-react";

interface Props { service?: PortalService; status?: ServiceStatus; }

// ─────────────────────────────────────────────────────────────────────────────
// Base hosting tiers
// ─────────────────────────────────────────────────────────────────────────────
type BaseKey = "lite" | "standard" | "pro" | "business";

interface BaseTier {
  key: BaseKey;
  name: string;
  monthly: number;
  setup: number;
  badge?: string;
  highlight?: boolean;
  sites: string;
  bullets: string[];
}

const BASE_TIERS: BaseTier[] = [
  {
    key: "lite",
    name: "Lite",
    monthly: 19.99,
    setup: 199,
    sites: "1 site",
    bullets: [
      "Managed WordPress + Elementor",
      "Hosting, SSL, domain & DNS",
      "Locked + maintained core plugins",
      "Basic contact form",
      "Support portal",
    ],
  },
  {
    key: "standard",
    name: "Standard",
    monthly: 29.99,
    setup: 299,
    sites: "1 site",
    bullets: [
      "Everything in Lite",
      "Blog + advanced forms",
      "Form → SPARK auto-sync",
      "Google Analytics dashboard",
      "Basic SEO dashboard",
    ],
  },
  {
    key: "pro",
    name: "Pro",
    monthly: 49.99,
    setup: 499,
    badge: "Most Popular",
    highlight: true,
    sites: "1 site + staging",
    bullets: [
      "Everything in Standard",
      "Staging environment + deploy controls",
      "Page-speed monitoring",
      "Form → OLIVER inquiry auto-flow",
      "Performance dashboard",
      "Priority support",
    ],
  },
  {
    key: "business",
    name: "Business",
    monthly: 99.99,
    setup: 799,
    sites: "Up to 3 sites",
    bullets: [
      "Everything in Pro",
      "Multi-site management (up to 3)",
      "Role-based team access",
      "Centralized domain & SSL",
      "Additional sites: $29.99/mo each",
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// SEO add-on — corrected per user direction (different from public page)
// ─────────────────────────────────────────────────────────────────────────────
type SeoKey = "essentials" | "growth" | "authority";

interface SeoTier {
  key: SeoKey;
  name: string;
  monthly: number;
  keywords: number;
  badge?: string;
  highlight?: boolean;
  bullets: string[];
}

const SEO_TIERS: SeoTier[] = [
  {
    key: "essentials",
    name: "SEO Essentials",
    monthly: 49,
    keywords: 10,
    bullets: [
      "10 tracked keywords",
      "Monthly site audit",
      "Metadata optimization",
      "Rank tracking + monthly report",
      "Basic competitor view (top 3)",
    ],
  },
  {
    key: "growth",
    name: "SEO Growth",
    monthly: 99,
    keywords: 50,
    badge: "Most Popular",
    highlight: true,
    bullets: [
      "50 tracked keywords",
      "Keyword strategy + content plans",
      "Technical SEO monitoring",
      "Backlink monitoring",
      "Google AI Mode result tracking",
      "Monthly strategy call",
    ],
  },
  {
    key: "authority",
    name: "SEO Authority",
    monthly: 149,
    keywords: 150,
    bullets: [
      "150 tracked keywords",
      "All Growth features",
      "ChatGPT + Gemini AI result tracking",
      "Competitor monitoring (up to 20 domains)",
      "Market Monitor + IA Insights whitespace",
      "Quarterly strategy session",
    ],
  },
];

function annualPrice(monthly: number): number {
  return +(monthly * 0.9).toFixed(2);
}

// ─────────────────────────────────────────────────────────────────────────────
// Feature matrix
// ─────────────────────────────────────────────────────────────────────────────
interface FeatureRow { label: string; desc?: string; lite: boolean; std: boolean; pro: boolean; biz: boolean; status?: "built" | "scaffold" | "v2"; }

const FEATURE_SECTIONS: { section: string; rows: FeatureRow[] }[] = [
  {
    section: "Hosting & WordPress",
    rows: [
      { label: "Managed WordPress + hosting", lite: true, std: true, pro: true, biz: true, status: "built" },
      { label: "SSL + domain + DNS", lite: true, std: true, pro: true, biz: true, status: "built" },
      { label: "Locked core plugins + auto-updates", lite: true, std: true, pro: true, biz: true, status: "built" },
      { label: "Daily backups + restore points", lite: true, std: true, pro: true, biz: true, status: "built" },
      { label: "Staging environment", lite: false, std: false, pro: true, biz: true, status: "built" },
      { label: "Multi-site management (up to 3)", lite: false, std: false, pro: false, biz: true, status: "built" },
    ],
  },
  {
    section: "Content & Forms",
    rows: [
      { label: "Pages + posts + media", lite: true, std: true, pro: true, biz: true, status: "built" },
      { label: "Basic contact form", lite: true, std: true, pro: true, biz: true, status: "built" },
      { label: "Blog + categories + tags", lite: false, std: true, pro: true, biz: true, status: "built" },
      { label: "Advanced multi-step forms", lite: false, std: true, pro: true, biz: true, status: "built" },
      { label: "Form → SPARK auto-sync (contacts)", lite: false, std: true, pro: true, biz: true, status: "built" },
      { label: "Form → OLIVER auto-flow (inquiries)", lite: false, std: false, pro: true, biz: true, status: "built" },
    ],
  },
  {
    section: "Analytics & SEO",
    rows: [
      { label: "Google Analytics dashboard", lite: false, std: true, pro: true, biz: true, status: "built" },
      { label: "Basic SEO dashboard (Rank Math)", lite: false, std: true, pro: true, biz: true, status: "built" },
      { label: "Page-speed monitoring", lite: false, std: false, pro: true, biz: true, status: "built" },
      { label: "Performance dashboard", lite: false, std: false, pro: true, biz: true, status: "built" },
      { label: "SE Ranking integration (add-on)", lite: false, std: false, pro: false, biz: false, status: "built" },
    ],
  },
  {
    section: "Team & Admin",
    rows: [
      { label: "Support portal", lite: true, std: true, pro: true, biz: true, status: "built" },
      { label: "Priority support SLA", lite: false, std: false, pro: true, biz: true, status: "built" },
      { label: "Role-based team access", lite: false, std: false, pro: false, biz: true, status: "built" },
      { label: "Centralized domain & SSL", lite: false, std: false, pro: false, biz: true, status: "built" },
      { label: "SSO / SAML", lite: false, std: false, pro: false, biz: false, status: "v2" },
      { label: "Custom SLA + dedicated support", lite: false, std: false, pro: false, biz: false, status: "v2" },
    ],
  },
];

const STATUS_PILL: Record<string, { label: string; cls: string }> = {
  built:    { label: "Available",  cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  scaffold: { label: "Beta",       cls: "bg-amber-50 text-amber-700 border-amber-200" },
  v2:       { label: "v2 roadmap", cls: "bg-slate-100 text-slate-600 border-slate-200" },
};

// ─────────────────────────────────────────────────────────────────────────────
export function ArionUsagePage(_: Props) {
  const [base, setBase] = useState<BaseKey>("standard");
  const [seo, setSeo] = useState<SeoKey | null>(null);
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annual">("monthly");
  const [showFullFeatures, setShowFullFeatures] = useState(false);

  // ─ Derived ─────────────────────────────────────────────────────────────
  const baseDef = useMemo(() => BASE_TIERS.find(t => t.key === base) || BASE_TIERS[1], [base]);
  const seoDef = useMemo(() => seo ? SEO_TIERS.find(t => t.key === seo) || null : null, [seo]);

  const basePrice = billingCycle === "annual" ? annualPrice(baseDef.monthly) : baseDef.monthly;
  const seoPrice = seoDef ? (billingCycle === "annual" ? annualPrice(seoDef.monthly) : seoDef.monthly) : 0;
  const totalMonthly = basePrice + seoPrice;
  const totalAnnual = totalMonthly * 12;

  // ─ Render ──────────────────────────────────────────────────────────────
  return (
    <div className="arion-page">
      <div className="card">
        <div className="card-hdr">
          <div>
            <div className="card-ttl">Usage & Plan</div>
            <div className="card-sub">Pick your hosting tier and SEO add-on — see the live total</div>
          </div>
        </div>
        <div className="px-1 pb-2 text-xs text-slate-600">
          <strong className="text-slate-800">How pricing works:</strong>{" "}
          Your <strong>base tier</strong> covers managed WordPress, hosting, security, and the ARION dashboard.{" "}
          The <strong>SEO add-on</strong> is optional — three tiers unlock more keywords, AI-search tracking, and competitor monitoring.{" "}
          Annual billing saves 10% on both. One-time setup fees apply per tier.
        </div>
      </div>

      {/* ── PLAN BUILDER ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <div className="lg:col-span-2 space-y-4">
          {/* Base tier picker — ARION-branded dark card */}
          <div className="rounded-xl bg-gradient-to-br from-[#1A7DB5] to-[#0C4A60] text-white p-5 shadow-lg ring-1 ring-white/10">
            <div className="flex items-baseline justify-between mb-3">
              <div>
                <div className="text-[10px] uppercase tracking-wider font-bold text-[#FFD166]">Base Hosting Tier</div>
                <div className="text-xs text-white/70 mt-0.5">All plans include managed WordPress, SSL, and core plugins</div>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {BASE_TIERS.map(t => (
                <button key={t.key} type="button" onClick={() => setBase(t.key)}
                  className={`text-left rounded-lg p-3 transition border-2 ${base === t.key ? "border-[#FFD166] bg-white/15" : "border-white/10 bg-white/5 hover:bg-white/10"}`}>
                  {t.badge && <div className="text-[9px] uppercase font-bold text-[#FFD166] mb-1">{t.badge}</div>}
                  <div className="font-bold text-base">{t.name}</div>
                  <div className="text-[11px] text-white/70 mb-2">{t.sites}</div>
                  <div className="text-xl font-bold">${billingCycle === "annual" ? annualPrice(t.monthly) : t.monthly}<span className="text-xs font-normal text-white/60">/mo</span></div>
                  {billingCycle === "annual" && <div className="text-[10px] text-emerald-300 mt-0.5">−10% saved</div>}
                  <div className="text-[10px] text-white/50 mt-1">+${t.setup} one-time setup</div>
                </button>
              ))}
            </div>
          </div>

          {/* Selected tier inclusions */}
          <div className="card">
            <div className="card-hdr">
              <div>
                <div className="card-ttl">{baseDef.name} — included</div>
                <div className="card-sub">{baseDef.sites}</div>
              </div>
              <button onClick={() => setShowFullFeatures(s => !s)} className="text-xs text-[#1A7DB5] font-medium flex items-center gap-1 hover:underline">
                {showFullFeatures ? "Hide full comparison" : "See full feature comparison"}
                {showFullFeatures ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </button>
            </div>
            <div className="px-4 pb-3">
              <ul className="text-sm text-slate-700 space-y-1">
                {baseDef.bullets.map(b => (
                  <li key={b} className="flex items-start gap-2">
                    <Check className="h-3.5 w-3.5 text-emerald-600 mt-0.5 flex-shrink-0" />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </div>
            {showFullFeatures && <FullFeatureTable />}
          </div>

          {/* ─── SEO ADD-ON (3 cards) ──────────────────────────────────── */}
          <div className="mt-2">
            <div className="flex items-baseline justify-between mb-3">
              <div>
                <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                  <Search className="h-4 w-4 text-[#1A7DB5]" />
                  SEO add-on
                  <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">Optional</span>
                </h2>
                <p className="text-xs text-slate-500 mt-1">SE Ranking-powered keyword tracking, technical SEO monitoring, AI-search visibility, and competitor intelligence. Available at any base tier.</p>
              </div>
              {seo && (
                <button onClick={() => setSeo(null)} className="text-xs text-slate-500 hover:text-slate-700 underline">
                  Remove
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {SEO_TIERS.map(t => (
                <button key={t.key} type="button" onClick={() => setSeo(t.key)}
                  className={`text-left rounded-lg p-4 transition border-2 bg-white ${seo === t.key ? "border-[#1A7DB5] ring-2 ring-[#1A7DB5]/30" : "border-slate-200 hover:border-[#2D9CDB]"} ${t.highlight ? "shadow-md" : ""}`}>
                  {t.badge && <div className="text-[9px] uppercase font-bold text-[#1A7DB5] mb-1">{t.badge}</div>}
                  <div className="font-bold text-slate-900">{t.name}</div>
                  <div className="mt-1">
                    <span className="text-2xl font-bold text-slate-900">${billingCycle === "annual" ? annualPrice(t.monthly) : t.monthly}</span>
                    <span className="text-xs text-slate-500">/mo</span>
                  </div>
                  {billingCycle === "annual" && <div className="text-[10px] text-emerald-700 font-medium">−10% applied</div>}
                  <div className="text-[11px] text-slate-500 mt-1 mb-2">{t.keywords} keywords tracked</div>
                  <ul className="space-y-1">
                    {t.bullets.map(b => (
                      <li key={b} className="flex items-start gap-1.5 text-[11px] text-slate-700">
                        <Check className="h-3 w-3 text-emerald-600 mt-0.5 flex-shrink-0" />
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>
                </button>
              ))}
            </div>
          </div>

          {/* Enterprise call-out */}
          <div className="card">
            <div className="card-hdr">
              <div>
                <div className="card-ttl">Enterprise</div>
                <div className="card-sub">Custom hosting + SLAs for high-traffic sites</div>
              </div>
            </div>
            <div className="px-4 pb-4 text-sm text-slate-700 space-y-1">
              <div className="flex items-start gap-2"><Check className="h-3.5 w-3.5 text-emerald-600 mt-0.5" /> SSO / SAML</div>
              <div className="flex items-start gap-2"><Check className="h-3.5 w-3.5 text-emerald-600 mt-0.5" /> Custom SLA + dedicated support</div>
              <div className="flex items-start gap-2"><Check className="h-3.5 w-3.5 text-emerald-600 mt-0.5" /> Bespoke integrations via FORGE</div>
              <div className="flex items-start gap-2"><Check className="h-3.5 w-3.5 text-emerald-600 mt-0.5" /> Unlimited sites under one tenant</div>
              <a href="mailto:support@iadm.io?subject=ARION Enterprise inquiry" className="inline-block mt-3 text-xs font-semibold text-[#1A7DB5] hover:underline">Talk to sales →</a>
            </div>
          </div>

          {/* Deferred add-ons */}
          <div className="card">
            <div className="card-hdr">
              <div>
                <div className="card-ttl">Coming in v2</div>
                <div className="card-sub">Add-on packs deferred for post-launch</div>
              </div>
            </div>
            <div className="px-4 pb-4 text-sm text-slate-600 space-y-1">
              <div className="flex items-start gap-2"><AlertCircle className="h-3.5 w-3.5 text-slate-400 mt-0.5" /> Content Update Service — managed monthly content updates</div>
              <div className="flex items-start gap-2"><AlertCircle className="h-3.5 w-3.5 text-slate-400 mt-0.5" /> SEM (Paid Search) Management — Google &amp; Meta Ads</div>
            </div>
          </div>
        </div>

        {/* RIGHT: live total summary */}
        <div className="lg:col-span-1">
          <div className="rounded-xl bg-gradient-to-br from-[#1A7DB5] to-[#0C4A60] text-white p-5 shadow-lg ring-1 ring-white/10 sticky top-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-[10px] uppercase tracking-wider font-bold text-[#FFD166]">Your plan</div>
              <div className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-white/5 text-white/60">Live</div>
            </div>

            {/* Billing toggle */}
            <div className="grid grid-cols-2 gap-1 p-1 bg-white/10 rounded-md mb-4">
              <button onClick={() => setBillingCycle("monthly")}
                className={`text-xs py-1.5 rounded transition ${billingCycle === "monthly" ? "bg-[#FFD166] text-[#0C4A60] font-semibold" : "text-white/70"}`}>
                Monthly
              </button>
              <button onClick={() => setBillingCycle("annual")}
                className={`text-xs py-1.5 rounded transition flex items-center justify-center gap-1 ${billingCycle === "annual" ? "bg-[#FFD166] text-[#0C4A60] font-semibold" : "text-white/70"}`}>
                Annual <span className="text-[9px] px-1 py-0.5 rounded bg-white/15">−10%</span>
              </button>
            </div>

            <div className="space-y-1.5 text-sm">
              <Line label={`${baseDef.name} hosting`} value={basePrice} />
              {seoDef && <Line label={`+ ${seoDef.name}`} value={seoPrice} accent />}
              {billingCycle === "annual" && (
                <div className="flex items-center justify-between text-[11px] pt-1 text-emerald-300">
                  <span>Annual billing</span>
                  <span>−10% applied</span>
                </div>
              )}
              <div className="flex items-center justify-between text-[11px] pt-1 text-white/60">
                <span>One-time setup</span>
                <span>${baseDef.setup}</span>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-white/15 flex items-baseline justify-between">
              <span className="text-sm text-white/70">Total</span>
              <div className="text-right">
                <span className="text-3xl font-bold">${totalMonthly.toFixed(2)}</span>
                <span className="text-xs text-white/60 ml-1">/mo</span>
              </div>
            </div>
            {billingCycle === "annual" && (
              <p className="text-[11px] text-white/50 text-right mt-0.5">Billed as ${totalAnnual.toFixed(2)}/yr</p>
            )}

            <button
              type="button"
              onClick={() => {
                window.location.href = "mailto:support@iadm.io?subject=ARION plan change&body=" + encodeURIComponent(
                  `Please switch my ARION plan to ${baseDef.name} (${billingCycle})${seoDef ? ` with ${seoDef.name}` : ""}.`
                );
              }}
              className="mt-4 w-full py-2.5 rounded-md bg-[#FFD166] hover:bg-[#e6bb5c] font-semibold text-[#0C4A60] transition"
            >
              Switch to {baseDef.name.toUpperCase()}{seoDef ? ` + ${seoDef.name.replace("SEO ", "")}` : ""}
            </button>
            <p className="text-[10px] text-white/50 mt-2 text-center">Cancel or downgrade anytime · No long-term contract</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Line({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className={accent ? "text-[#FFD166]" : "text-white/80"}>{label}</span>
      <span className={`font-semibold ${accent ? "text-[#FFD166]" : ""}`}>${value.toFixed(2)}</span>
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

export default ArionUsagePage;
