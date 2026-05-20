// ArionUsagePage — ARION Plan & Pricing.
//
// Shows the tenant's CURRENT plan (base tier + SEO add-on) as tagged cards
// and as billed line items; selecting a different tier previews the upgrade
// (current struck-through, new total). The platform-owner/founder always
// resolves to Business + SEO Authority (full access, never charged). No
// one-time setup fee — self-serve; onboarding help is a paid consultation.
import type { PortalService, ServiceStatus } from "../../config/serviceCatalog";
import { useEffect, useMemo, useState } from "react";
import { Check, AlertCircle, ChevronDown, ChevronUp, Search } from "lucide-react";
import { useAppState } from "../../app/AppState";
import { useAccessToken } from "../../auth/useAccessToken";
import { getArionOverview } from "../../lib/arionApi";
import { isPlatformOwner } from "../../lib/currentPlan";
import { changePlan } from "../../lib/billingApi";
import { PendingChangeBanner } from "../../components/PendingChangeBanner";

interface Props { service?: PortalService; status?: ServiceStatus; }

type BaseKey = "lite" | "standard" | "pro" | "business";
interface BaseTier { key: BaseKey; name: string; monthly: number; badge?: string; highlight?: boolean; sites: string; bullets: string[]; }

const BASE_TIERS: BaseTier[] = [
  { key: "lite", name: "Lite", monthly: 19.99, sites: "1 site",
    bullets: ["Managed WordPress + Elementor", "Hosting, SSL, domain & DNS", "Locked + maintained core plugins", "Basic contact form", "Support portal"] },
  { key: "standard", name: "Standard", monthly: 29.99, sites: "1 site",
    bullets: ["Everything in Lite", "Blog + advanced forms", "Form → SPARK auto-sync", "Google Analytics dashboard", "Basic SEO dashboard"] },
  { key: "pro", name: "Pro", monthly: 49.99, badge: "Most Popular", highlight: true, sites: "1 site + staging",
    bullets: ["Everything in Standard", "Staging environment + deploy controls", "Page-speed monitoring", "Form → OLIVER inquiry auto-flow", "Performance dashboard", "Priority support"] },
  { key: "business", name: "Business", monthly: 99.99, sites: "Up to 3 sites",
    bullets: ["Everything in Pro", "Multi-site management (up to 3)", "Role-based team access", "Centralized domain & SSL", "Additional sites: $29.99/mo each"] },
];

type SeoKey = "essentials" | "growth" | "authority";
interface SeoTier { key: SeoKey; name: string; monthly: number; keywords: number; badge?: string; highlight?: boolean; bullets: string[]; }

const SEO_TIERS: SeoTier[] = [
  { key: "essentials", name: "SEO Essentials", monthly: 49, keywords: 10,
    bullets: ["10 tracked keywords", "Monthly site audit", "Metadata optimization", "Rank tracking + monthly report", "Basic competitor view (top 3)"] },
  { key: "growth", name: "SEO Growth", monthly: 99, keywords: 50, badge: "Most Popular", highlight: true,
    bullets: ["50 tracked keywords", "Keyword strategy + content plans", "Technical SEO monitoring", "Backlink monitoring", "Google AI Mode result tracking", "Monthly strategy call"] },
  { key: "authority", name: "SEO Authority", monthly: 149, keywords: 150,
    bullets: ["150 tracked keywords", "All Growth features", "ChatGPT + Gemini AI result tracking", "Competitor monitoring (up to 20 domains)", "Market Monitor + IA Insights whitespace", "Quarterly strategy session"] },
];

const annualPrice = (m: number) => +(m * 0.9).toFixed(2);

function normBase(v: string | null | undefined): BaseKey | null {
  const s = String(v || "").toLowerCase();
  return (["lite", "standard", "pro", "business"] as BaseKey[]).find(k => s.includes(k)) || null;
}
function normSeo(v: string | null | undefined): SeoKey | null {
  const s = String(v || "").toLowerCase();
  if (!s) return null;
  return (["essentials", "growth", "authority"] as SeoKey[]).find(k => s.includes(k)) || null;
}

interface FeatureRow { label: string; lite: boolean; std: boolean; pro: boolean; biz: boolean; status?: "built" | "scaffold" | "v2"; }
const FEATURE_SECTIONS: { section: string; rows: FeatureRow[] }[] = [
  { section: "Hosting & WordPress", rows: [
    { label: "Managed WordPress + hosting", lite: true, std: true, pro: true, biz: true, status: "built" },
    { label: "SSL + domain + DNS", lite: true, std: true, pro: true, biz: true, status: "built" },
    { label: "Locked core plugins + auto-updates", lite: true, std: true, pro: true, biz: true, status: "built" },
    { label: "Daily backups + restore points", lite: true, std: true, pro: true, biz: true, status: "built" },
    { label: "Staging environment", lite: false, std: false, pro: true, biz: true, status: "built" },
    { label: "Multi-site management (up to 3)", lite: false, std: false, pro: false, biz: true, status: "built" } ] },
  { section: "Content & Forms", rows: [
    { label: "Pages + posts + media", lite: true, std: true, pro: true, biz: true, status: "built" },
    { label: "Basic contact form", lite: true, std: true, pro: true, biz: true, status: "built" },
    { label: "Blog + categories + tags", lite: false, std: true, pro: true, biz: true, status: "built" },
    { label: "Advanced multi-step forms", lite: false, std: true, pro: true, biz: true, status: "built" },
    { label: "Form → SPARK auto-sync", lite: false, std: true, pro: true, biz: true, status: "built" },
    { label: "Form → OLIVER auto-flow", lite: false, std: false, pro: true, biz: true, status: "built" } ] },
  { section: "Analytics & SEO", rows: [
    { label: "Google Analytics dashboard", lite: false, std: true, pro: true, biz: true, status: "built" },
    { label: "Basic SEO dashboard (Rank Math)", lite: false, std: true, pro: true, biz: true, status: "built" },
    { label: "Page-speed monitoring", lite: false, std: false, pro: true, biz: true, status: "built" },
    { label: "Performance dashboard", lite: false, std: false, pro: true, biz: true, status: "built" } ] },
  { section: "Team & Admin", rows: [
    { label: "Support portal", lite: true, std: true, pro: true, biz: true, status: "built" },
    { label: "Priority support SLA", lite: false, std: false, pro: true, biz: true, status: "built" },
    { label: "Role-based team access", lite: false, std: false, pro: false, biz: true, status: "built" },
    { label: "Centralized domain & SSL", lite: false, std: false, pro: false, biz: true, status: "built" } ] },
];
const STATUS_PILL: Record<string, { label: string; cls: string }> = {
  built: { label: "Available", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  scaffold: { label: "Beta", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  v2: { label: "v2 roadmap", cls: "bg-slate-100 text-slate-600 border-slate-200" },
};

export function ArionUsagePage(_: Props) {
  const { activeTenantId } = useAppState();
  const { getToken } = useAccessToken();
  const apiBase = import.meta.env.VITE_ARION_API_BASE_URL as string;
  const owner = isPlatformOwner(activeTenantId);

  // Current subscription (real, or founder = max).
  const [curBase, setCurBase] = useState<BaseKey | null>(owner ? "business" : null);
  const [curSeo, setCurSeo] = useState<SeoKey | null>(owner ? "authority" : null);
  const [loaded, setLoaded] = useState(owner);

  // Picker selection (starts at current).
  const [base, setBase] = useState<BaseKey>(owner ? "business" : "standard");
  const [seo, setSeo] = useState<SeoKey | null>(owner ? "authority" : null);
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annual">("monthly");
  const [showFullFeatures, setShowFullFeatures] = useState(false);
  const [acting, setActing] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function purchase() {
    if (!activeTenantId) return;
    setActing(true); setMsg(null);
    try {
      const t = await getToken();
      const r = await changePlan({
        token: t.accessToken, tenantId: activeTenantId,
        body: { product: "arion", billing_cycle: billingCycle, plan: base, seo: seo || null },
      });
      if (r.mode === "checkout" && r.url) { window.location.href = r.url; return; }
      setMsg(r.message || "Done.");
    } catch (e) {
      setMsg((e as Error).message || "Could not process the change.");
    } finally { setActing(false); }
  }

  useEffect(() => {
    if (owner) {
      setCurBase("business"); setCurSeo("authority");
      setBase("business"); setSeo("authority"); setLoaded(true);
      return;
    }
    if (!activeTenantId || !apiBase) return;
    let cancelled = false;
    (async () => {
      try {
        const t = await getToken();
        const ov = await getArionOverview({ baseUrl: apiBase, bearerToken: t.accessToken, tenantId: activeTenantId });
        if (cancelled) return;
        const b = normBase(ov?.site?.arionTier);
        const s = normSeo(ov?.site?.seoAddonTier);
        setCurBase(b); setCurSeo(s);
        if (b) setBase(b);
        setSeo(s);
      } catch { /* no site yet → no current plan; picker stays at defaults */ }
      finally { if (!cancelled) setLoaded(true); }
    })();
    return () => { cancelled = true; };
  }, [owner, activeTenantId, apiBase, getToken]);

  const baseDef = useMemo(() => BASE_TIERS.find(t => t.key === base) || BASE_TIERS[1], [base]);
  const seoDef = useMemo(() => seo ? SEO_TIERS.find(t => t.key === seo) || null : null, [seo]);
  const curBaseDef = useMemo(() => curBase ? BASE_TIERS.find(t => t.key === curBase) || null : null, [curBase]);
  const curSeoDef = useMemo(() => curSeo ? SEO_TIERS.find(t => t.key === curSeo) || null : null, [curSeo]);

  const px = (m: number) => billingCycle === "annual" ? annualPrice(m) : m;
  const basePrice = px(baseDef.monthly);
  const seoPrice = seoDef ? px(seoDef.monthly) : 0;
  const newTotal = basePrice + seoPrice;
  const curTotal = (curBaseDef ? px(curBaseDef.monthly) : 0) + (curSeoDef ? px(curSeoDef.monthly) : 0);
  const changed = base !== curBase || (seo || null) !== (curSeo || null);
  const hasCurrent = !!curBaseDef;

  return (
    <div className="arion-page">
      <PendingChangeBanner getToken={getToken} tenantId={activeTenantId} />
      <div className="card">
        <div className="card-hdr">
          <div>
            <div className="card-ttl">Plan &amp; Pricing</div>
            <div className="card-sub">
              {hasCurrent
                ? <>You're on <strong>ARION {curBaseDef!.name}</strong>{curSeoDef ? <> + <strong>{curSeoDef.name}</strong></> : ""}</>
                : "Pick your hosting tier and SEO add-on"}
            </div>
          </div>
        </div>
        <div className="px-1 pb-2 text-xs text-slate-600">
          <strong className="text-slate-800">How pricing works:</strong>{" "}
          Your <strong>base tier</strong> covers managed WordPress, hosting, security, and the ARION dashboard.{" "}
          The <strong>SEO add-on</strong> is optional — three tiers unlock more keywords, AI-search tracking, and competitor monitoring.{" "}
          Annual billing saves 10% on both. Self-serve — no setup fee (need hands-on onboarding? add a one-time consultation).
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <div className="lg:col-span-2 space-y-4">
          {/* Base tier picker */}
          <div className="rounded-xl bg-gradient-to-br from-[#1A7DB5] to-[#0C4A60] text-white p-5 shadow-lg ring-1 ring-white/10">
            <div className="text-[10px] uppercase tracking-wider font-bold text-[#FFD166]">Base Hosting Tier</div>
            <div className="text-xs text-white/70 mt-0.5 mb-3">All plans include managed WordPress, SSL, and core plugins</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {BASE_TIERS.map(t => {
                const isCurrent = curBase === t.key;
                return (
                  <button key={t.key} type="button" onClick={() => setBase(t.key)}
                    className={`text-left rounded-lg p-3 transition border-2 ${base === t.key ? "border-[#FFD166] bg-white/15" : "border-white/10 bg-white/5 hover:bg-white/10"}`}>
                    {isCurrent
                      ? <div className="text-[9px] uppercase font-bold text-emerald-300 mb-1">✓ Current plan</div>
                      : t.badge && <div className="text-[9px] uppercase font-bold text-[#FFD166] mb-1">{t.badge}</div>}
                    <div className="font-bold text-base">{t.name}</div>
                    <div className="text-[11px] text-white/70 mb-2">{t.sites}</div>
                    <div className="text-xl font-bold">${px(t.monthly)}<span className="text-xs font-normal text-white/60">/mo</span></div>
                    {billingCycle === "annual" && <div className="text-[10px] text-emerald-300 mt-0.5">−10% saved</div>}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Selected tier inclusions */}
          <div className="card">
            <div className="card-hdr">
              <div>
                <div className="card-ttl">{baseDef.name} — included{curBase === base && <span className="ml-2 text-[10px] uppercase font-bold text-emerald-600">Current</span>}</div>
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
                  <li key={b} className="flex items-start gap-2"><Check className="h-3.5 w-3.5 text-emerald-600 mt-0.5 flex-shrink-0" /><span>{b}</span></li>
                ))}
              </ul>
            </div>
            {showFullFeatures && <FullFeatureTable />}
          </div>

          {/* SEO add-on */}
          <div className="mt-2">
            <div className="flex items-baseline justify-between mb-3">
              <div>
                <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                  <Search className="h-4 w-4 text-[#1A7DB5]" /> SEO add-on
                  <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">Optional</span>
                </h2>
                <p className="text-xs text-slate-500 mt-1">SE Ranking-powered keyword tracking, AI-search visibility, and competitor intelligence. Available at any base tier.</p>
              </div>
              {seo && <button onClick={() => setSeo(null)} className="text-xs text-slate-500 hover:text-slate-700 underline">Remove</button>}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {SEO_TIERS.map(t => {
                const isCurrent = curSeo === t.key;
                return (
                  <button key={t.key} type="button" onClick={() => setSeo(t.key)}
                    className={`text-left rounded-lg p-4 transition border-2 bg-white ${seo === t.key ? "border-[#1A7DB5] ring-2 ring-[#1A7DB5]/30" : "border-slate-200 hover:border-[#2D9CDB]"} ${t.highlight ? "shadow-md" : ""}`}>
                    {isCurrent
                      ? <div className="text-[9px] uppercase font-bold text-emerald-600 mb-1">✓ Current plan</div>
                      : t.badge && <div className="text-[9px] uppercase font-bold text-[#1A7DB5] mb-1">{t.badge}</div>}
                    <div className="font-bold text-slate-900">{t.name}</div>
                    <div className="mt-1"><span className="text-2xl font-bold text-slate-900">${px(t.monthly)}</span><span className="text-xs text-slate-500">/mo</span></div>
                    {billingCycle === "annual" && <div className="text-[10px] text-emerald-700 font-medium">−10% applied</div>}
                    <div className="text-[11px] text-slate-500 mt-1 mb-2">{t.keywords} keywords tracked</div>
                    <ul className="space-y-1">
                      {t.bullets.map(b => <li key={b} className="flex items-start gap-1.5 text-[11px] text-slate-700"><Check className="h-3 w-3 text-emerald-600 mt-0.5 flex-shrink-0" /><span>{b}</span></li>)}
                    </ul>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="card">
            <div className="card-hdr"><div><div className="card-ttl">Enterprise</div><div className="card-sub">Custom hosting + SLAs for high-traffic sites</div></div></div>
            <div className="px-4 pb-4 text-sm text-slate-700 space-y-1">
              <div className="flex items-start gap-2"><Check className="h-3.5 w-3.5 text-emerald-600 mt-0.5" /> SSO / SAML + custom SLA</div>
              <div className="flex items-start gap-2"><Check className="h-3.5 w-3.5 text-emerald-600 mt-0.5" /> Unlimited sites under one tenant</div>
              <a href="mailto:support@iadm.io?subject=ARION Enterprise inquiry" className="inline-block mt-3 text-xs font-semibold text-[#1A7DB5] hover:underline">Talk to sales →</a>
            </div>
          </div>
        </div>

        {/* RIGHT: Your plan */}
        <div className="lg:col-span-1">
          <div className="rounded-xl bg-gradient-to-br from-[#1A7DB5] to-[#0C4A60] text-white p-5 shadow-lg ring-1 ring-white/10 sticky top-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-[10px] uppercase tracking-wider font-bold text-[#FFD166]">Your plan</div>
              <div className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-white/5 text-white/60">{changed ? "Preview" : "Live"}</div>
            </div>

            <div className="grid grid-cols-2 gap-1 p-1 bg-white/10 rounded-md mb-4">
              <button onClick={() => setBillingCycle("monthly")} className={`text-xs py-1.5 rounded transition ${billingCycle === "monthly" ? "bg-[#FFD166] text-[#0C4A60] font-semibold" : "text-white/70"}`}>Monthly</button>
              <button onClick={() => setBillingCycle("annual")} className={`text-xs py-1.5 rounded transition flex items-center justify-center gap-1 ${billingCycle === "annual" ? "bg-[#FFD166] text-[#0C4A60] font-semibold" : "text-white/70"}`}>Annual <span className="text-[9px] px-1 py-0.5 rounded bg-white/15">−10%</span></button>
            </div>

            {/* Current plan line items */}
            {hasCurrent && (
              <div className="space-y-1.5 text-sm">
                <div className="text-[10px] uppercase tracking-wider text-white/50 mb-1">Current</div>
                <Line label={`ARION ${curBaseDef!.name}`} value={px(curBaseDef!.monthly)} struck={changed} />
                {curSeoDef && <Line label={curSeoDef.name} value={px(curSeoDef.monthly)} accent struck={changed} />}
                {!changed && (
                  <div className="mt-2 pt-2 border-t border-white/15 flex items-baseline justify-between">
                    <span className="text-sm text-white/70">Total</span>
                    <div className="text-right"><span className="text-3xl font-bold">${curTotal.toFixed(2)}</span><span className="text-xs text-white/60 ml-1">/mo</span></div>
                  </div>
                )}
              </div>
            )}

            {/* Upgrade preview */}
            {(changed || !hasCurrent) && (
              <div className="space-y-1.5 text-sm mt-3">
                <div className="text-[10px] uppercase tracking-wider text-[#FFD166] mb-1">{hasCurrent ? "New plan" : "Selected"}</div>
                <Line label={`ARION ${baseDef.name}`} value={basePrice} />
                {seoDef && <Line label={seoDef.name} value={seoPrice} accent />}
                {billingCycle === "annual" && (
                  <div className="flex items-center justify-between text-[11px] pt-1 text-emerald-300"><span>Annual billing</span><span>−10% applied</span></div>
                )}
                <div className="mt-2 pt-2 border-t border-white/15 flex items-baseline justify-between">
                  <span className="text-sm text-white/70">{hasCurrent ? "New total" : "Total"}</span>
                  <div className="text-right"><span className="text-3xl font-bold">${newTotal.toFixed(2)}</span><span className="text-xs text-white/60 ml-1">/mo</span></div>
                </div>
                {billingCycle === "annual" && <p className="text-[11px] text-white/50 text-right mt-0.5">Billed as ${(newTotal * 12).toFixed(2)}/yr</p>}
              </div>
            )}

            <button
              type="button"
              disabled={(!changed && hasCurrent) || acting}
              onClick={purchase}
              className={`mt-4 w-full py-2.5 rounded-md font-semibold transition ${((!changed && hasCurrent) || acting) ? "bg-white/10 text-white/50 cursor-default" : "bg-[#FFD166] hover:bg-[#e6bb5c] text-[#0C4A60]"}`}>
              {acting ? "Working…" : (!changed && hasCurrent) ? "This is your current plan" : hasCurrent ? `Upgrade to ${baseDef.name}${seoDef ? ` + ${seoDef.name.replace("SEO ", "")}` : ""}` : `Purchase ${baseDef.name}${seoDef ? ` + ${seoDef.name.replace("SEO ", "")}` : ""}`}
            </button>
            {msg && <div className="mt-2 text-[11px] text-emerald-300 text-center">{msg}</div>}
            <p className="text-[10px] text-white/50 mt-2 text-center">Cancel or downgrade anytime · No long-term contract · No setup fee</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Line({ label, value, accent, struck }: { label: string; value: number; accent?: boolean; struck?: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className={`${accent ? "text-[#FFD166]" : "text-white/80"} ${struck ? "line-through opacity-50" : ""}`}>{label}</span>
      <span className={`font-semibold ${accent ? "text-[#FFD166]" : ""} ${struck ? "line-through opacity-50" : ""}`}>${value.toFixed(2)}</span>
    </div>
  );
}

function FullFeatureTable() {
  return (
    <div className="border-t border-slate-200 pt-3 px-4 pb-4 mt-2">
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
                  const st = row.status ? STATUS_PILL[row.status] : null;
                  return (
                    <tr key={row.label} className="border-b border-slate-100">
                      <td className="py-2 pl-1"><div className="font-medium text-slate-800">{row.label}</div></td>
                      <td className="text-center px-2">{row.lite ? <Check className="h-3.5 w-3.5 text-emerald-600 inline" /> : <span className="text-slate-300">—</span>}</td>
                      <td className="text-center px-2">{row.std ? <Check className="h-3.5 w-3.5 text-emerald-600 inline" /> : <span className="text-slate-300">—</span>}</td>
                      <td className="text-center px-2">{row.pro ? <Check className="h-3.5 w-3.5 text-emerald-600 inline" /> : <span className="text-slate-300">—</span>}</td>
                      <td className="text-center px-2">{row.biz ? <Check className="h-3.5 w-3.5 text-emerald-600 inline" /> : <span className="text-slate-300">—</span>}</td>
                      <td className="text-center pl-2">{st && <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] border ${st.cls}`}>{st.label}</span>}</td>
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
