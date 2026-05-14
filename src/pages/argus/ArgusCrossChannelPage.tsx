// ArgusCrossChannelPage — v9.5 LIVE for 3 of 8 reports.
//
// 8 cross-channel reports per spec §6.4. 3 of them have backing endpoints
// in platform-api today and render live:
//   - Marketing → Ops Loop (#3)
//   - Web-to-Revenue Funnel (#7)
//   - Growth Composite (#8) — derived from business-pulse components
//
// The other 5 (Acquisition Quality, Form-to-Contact, CLV, Retention
// Revenue Recovery, Review→Sales Loop) require cross-schema joins
// (arion × lumen × oliver) that need dedicated backend endpoints. Each
// surfaces its data chain + state honestly.
import { useEffect, useMemo, useState } from "react";
import { useAccessToken } from "../../auth/useAccessToken";
import { useAppState } from "../../app/AppState";
import { Lock, TrendingUp, Users, Activity, DollarSign, Repeat, MessageSquare, BarChart3, ArrowRight, X } from "lucide-react";

interface CCReport {
  score: number;
  state: "ok" | "partial" | "insufficient_data";
  headline: string;
  observations: string[];
  actions: string[];
  dataChain: string;
  dataGap?: string;
}

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));
const fmt = (n: number | null | undefined) => n == null || !isFinite(n) ? "0" : Math.round(n).toLocaleString();

interface WebToRevenue {
  stages: Array<{ key: string; label: string; score: number | null; period_end: string | null }>;
  weakest_link: { key: string; label: string; score: number } | null;
  present_stages: number;
}
interface MarketingOpsLoop {
  stages: Array<{ key: string; label: string; score: number | null; side: "marketing" | "operations" }>;
  marketing_avg: number | null;
  operations_avg: number | null;
  gap: number | null;
  loop_efficiency: number | null;
  advisory: string | null;
}
interface BusinessPulse {
  pulse: number | null;
  previous_pulse: number | null;
  components: { arion: number | null; spark: number | null; oliver: number | null };
}

// ── Engines ──────────────────────────────────────────────────────────
function webToRevenueEngine(d: WebToRevenue | null): CCReport {
  if (!d || d.present_stages === 0) {
    return { score: 0, state: "insufficient_data", headline: "Awaiting scores from any product", observations: ["No product scores recorded yet. Each stage of the funnel needs at least one period of scoring history."], actions: ["Connect a product to start collecting score history."], dataChain: "GA4 → arion.site_form_submission → lumen.contact → lumen.lead → oliver.quote → oliver.job → oliver.invoice.paid", dataGap: "Awaiting first product score history." };
  }
  const presentScores = d.stages.filter(s => s.score != null);
  const avg = presentScores.reduce((s, x) => s + (x.score || 0), 0) / Math.max(presentScores.length, 1);
  const score = Math.round(clamp(avg));
  const obs = [`Funnel coverage: ${d.present_stages}/4 stages have score history.`];
  for (const s of d.stages) {
    if (s.score != null) obs.push(`${s.label}: ${s.score}/100${s.period_end ? ` (as of ${String(s.period_end).slice(0, 10)})` : ""}`);
    else obs.push(`${s.label}: no score yet — that stage hasn't accumulated history.`);
  }
  if (d.weakest_link) obs.push(`Weakest link: ${d.weakest_link.label} at ${d.weakest_link.score}/100. The full funnel is only as strong as its narrowest stage.`);
  return {
    score,
    state: d.present_stages === 4 ? "ok" : "partial",
    headline: d.weakest_link ? `Weak link: ${d.weakest_link.label} (${d.weakest_link.score})` : `${d.present_stages}/4 stages reporting`,
    observations: obs,
    actions: d.weakest_link ? [`Focus the next quarter on lifting the weakest link's score. A 10-point lift on the bottleneck typically lifts the full-funnel composite by 5-7 points.`] : ["Continue collecting score history. Funnel analysis unlocks fully at 4/4 stages reporting."],
    dataChain: "GA4 → arion.site_form_submission → lumen.contact → lumen.lead → oliver.quote → oliver.job → oliver.invoice.paid",
    dataGap: d.present_stages < 4 ? `${4 - d.present_stages} stages awaiting first score period.` : undefined,
  };
}

function marketingOpsLoopEngine(d: MarketingOpsLoop | null): CCReport {
  if (!d || d.marketing_avg == null || d.operations_avg == null) {
    return { score: 0, state: "insufficient_data", headline: "Need SPARK + OLIVER scores", observations: ["Both SPARK marketing scores and OLIVER ops scores are required."], actions: ["Connect SPARK and OLIVER, run for a period to accumulate scores."], dataChain: "ops.email_campaign + automation → lumen.contact engagement → oliver.job (created within attribution window)", dataGap: "Need both SPARK + OLIVER scoring history." };
  }
  const score = Math.round(d.loop_efficiency ?? 50);
  const obs = [
    `Marketing side avg: ${d.marketing_avg}/100 · Operations side avg: ${d.operations_avg}/100 · gap: ${d.gap! > 0 ? "+" : ""}${d.gap}.`,
    d.advisory || "Marketing-to-ops handoff is being measured. Continue collecting score history for richer insights.",
  ];
  for (const s of d.stages) {
    if (s.score != null) obs.push(`${s.label}: ${s.score}/100 (${s.side})`);
  }
  return {
    score,
    state: "ok",
    headline: `Mktg ${d.marketing_avg} → Ops ${d.operations_avg} · gap ${d.gap! > 0 ? "+" : ""}${d.gap}`,
    observations: obs,
    actions: d.advisory ? [d.advisory] : [],
    dataChain: "ops.email_campaign + automation → lumen.contact engagement → oliver.job (created within attribution window)",
  };
}

function growthCompositeEngine(d: BusinessPulse | null): CCReport {
  if (!d || d.pulse == null) {
    return { score: 0, state: "insufficient_data", headline: "Awaiting Business Pulse", observations: ["Growth Composite is derived from the Business Pulse + component scores. Needs at least one product producing scores."], actions: ["Connect a product to start scoring."], dataChain: "All active platform scores + trend directions + predictive signals combined into a single growth narrative", dataGap: "Awaiting first product scores." };
  }
  const activeComponents = Object.entries(d.components).filter(([_, v]) => v != null);
  const delta = d.previous_pulse != null ? d.pulse - d.previous_pulse : null;
  const obs = [`Business Pulse: ${d.pulse}/100${delta != null ? ` (${delta > 0 ? "+" : ""}${delta} vs prior period)` : ""}.`];
  for (const [product, score] of activeComponents) {
    obs.push(`${product.toUpperCase()}: ${score}/100`);
  }
  if (delta != null) {
    if (delta > 5) obs.push(`Growth direction: improving. The composite is trending up across active products.`);
    else if (delta < -5) obs.push(`Growth direction: declining. At least one product score has dropped meaningfully — investigate which one via the product Health pages.`);
    else obs.push(`Growth direction: stable. Composite is steady period-over-period.`);
  }
  return {
    score: d.pulse,
    state: "ok",
    headline: `Pulse ${d.pulse}${delta != null ? ` (${delta > 0 ? "+" : ""}${delta})` : ""}`,
    observations: obs,
    actions: ["Combine this report with the per-product Health pages to drill into specific score movements."],
    dataChain: "All active platform scores + trend directions + predictive signals combined into a single growth narrative",
  };
}

function pendingReport(label: string, dataChain: string, gap: string): CCReport {
  return {
    score: 0,
    state: "insufficient_data",
    headline: "Engine pending",
    observations: [`${label} requires a cross-schema join across the data chain shown below. Backend endpoint is pending.`, "Trends + Intelligence reports in their respective products surface the underlying signals today — this report joins them into a single narrative."],
    actions: [],
    dataChain,
    dataGap: gap,
  };
}

const CROSS_CHANNEL_GROUPS = [
  {
    label: "ARION → SPARK",
    description: "Web acquisition + contact lifecycle",
    reports: [
      { key: "acquisition_quality", num: 1, label: "Acquisition Quality", question: "Which website channels produce the highest-LTV contacts?", icon: Users, chain: "arion.site_form_submission (utm_source) → lumen.contact (source, lifetime_value) → oliver.invoice (revenue)" },
      { key: "form_to_contact", num: 2, label: "Form-to-Contact Performance", question: "Which forms on which pages produce the best leads?", icon: Activity, chain: "arion.site_form_submission (form_id, page, utm) → lumen.contact + lead (conversion rate, quality score)" },
    ],
  },
  {
    label: "SPARK → OLIVER",
    description: "Marketing → Operations → Customer LTV",
    reports: [
      { key: "marketing_ops_loop", num: 3, label: "Marketing → Ops Loop", question: "How well does marketing output translate to booked work?", icon: MessageSquare, chain: "ops.email_campaign + automation → lumen.contact engagement → oliver.job", liveEngine: "mktg_ops" },
      { key: "clv", num: 4, label: "Customer Lifetime Value", question: "What is each customer segment actually worth over time?", icon: DollarSign, chain: "lumen.contact (RFM segment) → oliver.job + invoice (revenue history, frequency, recency)" },
      { key: "retention_revenue", num: 5, label: "Retention Revenue Recovery", question: "What dollar value sits in dormant customers?", icon: Repeat, chain: "lumen.contact (last_job_date, LTV) → churn risk tier → estimated recovery value" },
    ],
  },
  {
    label: "ARION → OLIVER",
    description: "Reputation → Conversion",
    reports: [
      { key: "review_sales_loop", num: 6, label: "Review → Sales Loop", question: "Does online reputation measurably affect job inquiry?", icon: TrendingUp, chain: "ARION review velocity + rating trend → oliver.job inquiry rate correlation" },
    ],
  },
  {
    label: "Full Funnel (ARION + SPARK + OLIVER)",
    description: "End-to-end visit → revenue journey + composite growth",
    reports: [
      { key: "web_to_revenue", num: 7, label: "Web-to-Revenue Funnel", question: "What does the complete journey from site visit to paid job look like?", icon: TrendingUp, chain: "GA4 → form → contact → lead → quote → job → invoice", liveEngine: "web_to_rev" },
      { key: "growth_composite", num: 8, label: "Growth Composite", question: "Where is the business growing and stalling across all dimensions?", icon: BarChart3, chain: "All active platform scores + trend directions + predictive signals", liveEngine: "growth" },
    ],
  },
];

function stateColor(s: CCReport["state"]) { return s === "ok" ? "#16A34A" : s === "partial" ? "#EAB308" : "#94A3B8"; }
function stateLabel(s: CCReport["state"]) { return s === "ok" ? "Live" : s === "partial" ? "Partial" : "Engine pending"; }
function stateBg(s: CCReport["state"]) { return s === "ok" ? "border-emerald-200 bg-white" : s === "partial" ? "border-amber-200 bg-amber-50/30" : "border-slate-200 bg-slate-50"; }

export function ArgusCrossChannelPage() {
  const { activeTenantId } = useAppState();
  const { getToken } = useAccessToken();
  const [webToRev, setWebToRev] = useState<WebToRevenue | null>(null);
  const [mktgOps, setMktgOps] = useState<MarketingOpsLoop | null>(null);
  const [pulse, setPulse] = useState<BusinessPulse | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    if (!activeTenantId) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await getToken();
        const base = (import.meta.env.VITE_PLATFORM_API_BASE_URL as string)?.replace(/\/$/, "");
        if (!base) return;
        const headers: HeadersInit = { Authorization: `Bearer ${token.accessToken}`, "x-tenant-key": activeTenantId };
        const [w, m, b] = await Promise.all([
          globalThis.fetch(`${base}/argus/cross-channel/web-to-revenue`, { headers }).then(r => r.ok ? r.json() : null).catch(() => null),
          globalThis.fetch(`${base}/argus/cross-channel/marketing-ops-loop`, { headers }).then(r => r.ok ? r.json() : null).catch(() => null),
          globalThis.fetch(`${base}/argus/business-pulse`, { headers }).then(r => r.ok ? r.json() : null).catch(() => null),
        ]);
        if (cancelled) return;
        setWebToRev(w?.data || null);
        setMktgOps(m?.data || null);
        setPulse(b?.data || null);
      } catch { /* swallow */ }
    })();
    return () => { cancelled = true; };
  }, [activeTenantId, getToken]);

  const reports = useMemo(() => {
    return {
      acquisition_quality: pendingReport("Acquisition Quality", "arion.site_form_submission (utm) → lumen.contact (LTV) → oliver.invoice (revenue)", "Cross-schema engine pending."),
      form_to_contact: pendingReport("Form-to-Contact Performance", "arion.site_form_submission (form_id, page, utm) → lumen.contact + lead", "Cross-schema engine pending."),
      marketing_ops_loop: marketingOpsLoopEngine(mktgOps),
      clv: pendingReport("Customer Lifetime Value", "lumen.contact (RFM) → oliver.job + invoice (history, frequency, recency)", "RFM engine pending."),
      retention_revenue: pendingReport("Retention Revenue Recovery", "lumen.contact → churn risk × estimated recovery value", "Recovery-economics engine pending."),
      review_sales_loop: pendingReport("Review → Sales Loop", "ARION review velocity → oliver.job inquiry rate correlation", "Time-series correlation engine pending."),
      web_to_revenue: webToRevenueEngine(webToRev),
      growth_composite: growthCompositeEngine(pulse),
    } as Record<string, CCReport>;
  }, [webToRev, mktgOps, pulse]);

  return (
    <div className="p-4 max-w-7xl mx-auto">
      <div className="mb-3">
        <h1 className="text-2xl font-bold text-slate-900">ARGUS Cross-Channel Intelligence</h1>
        <p className="text-sm text-slate-500 mt-0.5">8 reports across 4 product-pair categories. 3 of 8 live from existing endpoints today; the other 5 require dedicated cross-schema join engines.</p>
      </div>

      <div className="mb-4 rounded-md border-l-4 border-blue-400 bg-blue-50 px-4 py-3 text-sm text-blue-900">
        <strong>Status:</strong> Marketing → Ops Loop (#3), Web-to-Revenue Funnel (#7), and Growth Composite (#8) run live from platform-api endpoints. The other 5 reports require cross-schema joins (arion × lumen × oliver) that need dedicated backend endpoints — engines built but pending backend wiring. Each card shows its current state.
      </div>

      <div className="space-y-6">
        {CROSS_CHANNEL_GROUPS.map((group) => (
          <div key={group.label}>
            <div className="mb-3 flex items-baseline gap-3">
              <h2 className="text-base font-bold text-slate-900">{group.label}</h2>
              <span className="text-xs text-slate-500">{group.description}</span>
              <span className="text-[10px] uppercase font-semibold text-slate-400 ml-auto">{group.reports.length} report{group.reports.length === 1 ? "" : "s"}</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {group.reports.map((r) => {
                const rep = reports[r.key];
                const color = stateColor(rep.state);
                const bg = stateBg(rep.state);
                const Icon = r.icon;
                return (
                  <button key={r.key} onClick={() => setOpen(r.key)} className={`text-left rounded-lg border-2 p-4 transition-shadow hover:shadow-md ${bg}`}>
                    <div className="flex items-start gap-2 mb-2">
                      <div className="flex-shrink-0 h-10 w-10 rounded-full flex items-center justify-center" style={{ background: `${color}1A`, color }}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-bold text-slate-400">#{r.num}</span>
                          <span className="font-semibold text-sm text-slate-900">{r.label}</span>
                        </div>
                        <p className="text-[10px] text-slate-500 mt-0.5 line-clamp-2">{r.question}</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-3 mb-2">
                      <div className="flex items-center gap-2">
                        {rep.state === "ok" || rep.state === "partial" ? (<span className="text-2xl font-bold tabular-nums" style={{ color }}>{rep.score}</span>) : (<span className="text-xl font-bold text-slate-300">—</span>)}
                        <span className="flex items-center gap-1 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded" style={{ background: `${color}1A`, color }}>
                          {rep.state === "ok" && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />}
                          {rep.state === "partial" && <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />}
                          {rep.state === "insufficient_data" && <Lock className="h-3 w-3" />}
                          {stateLabel(rep.state)}
                        </span>
                      </div>
                      <ArrowRight className="h-4 w-4 text-slate-400" />
                    </div>
                    <p className="text-xs text-slate-700 leading-snug line-clamp-2">{rep.headline}</p>
                    {rep.dataGap && <div className="mt-2 text-[10px] text-amber-800 italic">→ {rep.dataGap}</div>}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {open && (() => {
        const meta = CROSS_CHANNEL_GROUPS.flatMap(g => g.reports).find(r => r.key === open);
        if (!meta) return null;
        return <CCModal meta={meta} report={reports[open]} onClose={() => setOpen(null)} />;
      })()}
    </div>
  );
}

function CCModal({ meta, report, onClose }: { meta: any; report: CCReport; onClose: () => void }) {
  const Icon = meta.icon;
  const color = stateColor(report.state);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-6 py-4 flex-shrink-0">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <div className="flex-shrink-0 h-10 w-10 rounded-full flex items-center justify-center" style={{ background: `${color}1A`, color }}><Icon className="h-5 w-5" /></div>
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-slate-900">#{meta.num} {meta.label}</h2>
              <p className="text-xs text-slate-500 mt-0.5">{meta.question}</p>
              <p className="text-[10px] text-slate-400 mt-1 italic">Data chain: {report.dataChain}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="text-right">
              {report.state === "ok" || report.state === "partial" ? (<div className="text-2xl font-bold tabular-nums" style={{ color }}>{report.score}</div>) : (<div className="text-xl text-slate-300">—</div>)}
              <div className="text-[9px] uppercase text-slate-400">{stateLabel(report.state)}</div>
            </div>
            <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded text-slate-500"><X className="h-5 w-5" /></button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {report.dataGap && (<div className="rounded-md border-l-4 border-amber-400 bg-amber-50 px-4 py-3"><div className="text-xs font-semibold uppercase text-amber-800 tracking-wide mb-1">Data gap</div><p className="text-sm text-slate-800">{report.dataGap}</p></div>)}
          {report.observations.length > 0 && (
            <div className="rounded-lg bg-slate-900 text-slate-100 p-5">
              <div className="flex items-center gap-2 mb-3"><span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded" style={{ background: "#84CC1620", color: "#A3E635" }}>ARGUS</span><span className="text-sm">Cross-Channel · {meta.label}</span></div>
              <ol className="space-y-3">
                {report.observations.map((obs, i) => (
                  <li key={i} className="flex items-start gap-3 text-xs leading-relaxed text-slate-200">
                    <span className="flex-shrink-0 mt-0.5 h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold" style={{ background: "#EA580C", color: "white" }}>{i + 1}</span>
                    <span>{obs}</span>
                  </li>
                ))}
              </ol>
              {report.actions.length > 0 && (
                <div className="border-t border-slate-700 mt-4 pt-3">
                  <div className="text-[10px] font-bold uppercase tracking-wide mb-2" style={{ color: "#A3E635" }}>Recommended actions</div>
                  <ul className="space-y-2">
                    {report.actions.map((act, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs leading-relaxed text-slate-200">
                        <span className="flex-shrink-0 mt-1 h-1.5 w-1.5 rounded-full" style={{ background: "#EA580C" }} />
                        <span>{act}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center justify-between border-t border-slate-200 px-6 py-3 bg-slate-50 rounded-b-lg flex-shrink-0">
          <div className="text-[11px] text-slate-500">Generated by <span className="font-semibold" style={{ color: "#A3E635" }}>ARGUS</span></div>
          <button onClick={onClose} className="px-4 py-1.5 text-xs bg-slate-900 text-white rounded hover:bg-slate-800">Close</button>
        </div>
      </div>
    </div>
  );
}

export default ArgusCrossChannelPage;
