// OliverIAInsightsIntelligencePage — v9.5 LIVE.
//
// All 6 OLIVER Intelligence reports now run on real engines, reading
// from /api/v1/ia-insights/inputs?product=oliver (same as Trends).
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useSparkApi } from "../../hooks/useSparkApi";  // LUMEN-API hook — OLIVER lives in same backend
import { useProductTier, tierMeets } from "../../hooks/useProductTier";
import { TrendingUp, AlertCircle, UserMinus, DollarSign, Users, BarChart3, ArrowRight, X, UserCheck, Activity, Map, Repeat, FileWarning } from "lucide-react";
import { runAllOliverIntelligence, type IntelligenceReport, type OliverIntelKey } from "../../oliver/analytics/oliverIntelligenceEngines";
import type { OliverEngineInput } from "../../oliver/analytics/oliverTrendEngines";
import { LockedIntelligenceCard, CollectingIntelligenceCard } from "../../components/iainsights/LockedIntelligenceCard";

// 2026-06-22 — Doc 64 §6.2 canonical 13-report OLIVER Intelligence shelf.
// 6 KEPT (renamed where needed) + 7 NEW. NEW reports render as
// pending_implementation cards in Phase 1; calculators land in
// Phases 2-4 (doc 64 §8).
type OliverIntelMetaKey =
  | "demand_forecast"
  | "revenue_forecast"
  | "cash_pressure_forecast"
  | "quote_win_rate"
  | "customer_retention_risk"
  | "customer_churn_prediction"
  | "crew_efficiency"
  | "service_line_profitability"
  | "job_volume_anomaly"
  | "repeat_customer_prediction"
  | "route_optimization"
  | "subscription_renewal_risk"
  | "invoice_aging_forecast";

interface IntelReportMeta {
  /** Doc-64 shelf identifier (rendered key). */
  key: OliverIntelMetaKey;
  /** Maps onto the existing OliverIntelligenceEngines registry when
   *  the report's calculator already exists. NEW entries leave this
   *  unset and render as pending_implementation. */
  engineKey?: OliverIntelKey;
  label: string;
  question: string;
  icon: typeof TrendingUp;
  modelType: string;
  minTier: "standard" | "pro" | "business";
  dataFloor: string;
  status: "kept" | "new";
}

// Doc-64 §6.2 13-report shelf (7 Std · 5 Pro · 1 Business).
const OLIVER_INTEL: IntelReportMeta[] = [
  { key: "demand_forecast",            engineKey: "demand_forecast",         label: "Demand Forecast",             question: "What will my job volume look like in the next 60 days?",                       icon: TrendingUp,  modelType: "Holt-Winters on oliver.job scheduled/completed",                       minTier: "standard", dataFloor: "60d",                          status: "kept" },
  { key: "revenue_forecast",                                                  label: "Revenue Forecast",            question: "What will revenue look like in the next 90 days?",                             icon: DollarSign,  modelType: "Holt-Winters on oliver.invoice (paid) + payment",                       minTier: "standard", dataFloor: "90d",                          status: "new" },
  { key: "cash_pressure_forecast",     engineKey: "cash_pressure",            label: "Cash Pressure Forecast",      question: "When will I next hit a cash-flow gap and how large?",                          icon: AlertCircle, modelType: "Regression on payment-timing (due_date vs payment_date) · 90d horizon", minTier: "pro",      dataFloor: "90d",                          status: "kept" },
  { key: "quote_win_rate",             engineKey: "quote_win_rate_intel",     label: "Quote Win Rate Intelligence", question: "What predicts win vs loss for my quotes?",                                     icon: BarChart3,   modelType: "Logistic regression on oliver.quote features",                          minTier: "standard", dataFloor: "20+ decided quotes",           status: "kept" },
  { key: "customer_retention_risk",    engineKey: "customer_retention_risk",  label: "Customer Retention Risk",     question: "Which customers are disengaging?",                                             icon: UserMinus,   modelType: "RFM on oliver.job by customer_id",                                       minTier: "standard", dataFloor: "6mo",                          status: "kept" },
  { key: "customer_churn_prediction",                                         label: "Customer Churn Prediction",   question: "Which customers are 60+ days from going silent?",                              icon: UserMinus,   modelType: "Survival on oliver.job active vs churned cohorts",                       minTier: "pro",      dataFloor: "6mo",                          status: "new" },
  { key: "crew_efficiency",            engineKey: "crew_efficiency_model",    label: "Crew Efficiency Model",       question: "Which crew configurations complete jobs fastest?",                             icon: Users,       modelType: "Regression on oliver.job_assignment + job_status_events cycle times",   minTier: "pro",      dataFloor: "30+ completed jobs",           status: "kept" },
  { key: "service_line_profitability", engineKey: "service_line_profit",      label: "Service Line Profitability",  question: "Which services drive the most revenue per job?",                               icon: BarChart3,   modelType: "Aggregation + ranking on invoice_line_item × job.service_type",         minTier: "standard", dataFloor: "60d + 2 service lines",        status: "kept" },
  { key: "job_volume_anomaly",                                                label: "Job Volume Anomaly Detection",question: "Are there abnormal spikes or drops in daily job volume?",                      icon: Activity,    modelType: "Statistical outlier (z-score / IQR) on daily oliver.job counts",         minTier: "standard", dataFloor: "30d",                          status: "new" },
  { key: "repeat_customer_prediction",                                        label: "Repeat Customer Prediction",  question: "Which one-time customers will book again?",                                    icon: UserCheck,   modelType: "Logistic classification on customer-history features",                   minTier: "pro",      dataFloor: "6mo + repeat signal",         status: "new" },
  { key: "route_optimization",                                                label: "Route Optimization",          question: "What is the optimal dispatch sequence today?",                                 icon: Map,         modelType: "Prescriptive routing on scheduled_date + location + assignment",         minTier: "business", dataFloor: "Active jobs w/ location + assignment", status: "new" },
  { key: "subscription_renewal_risk",                                         label: "Subscription Renewal Risk",   question: "Which recurring customers are about to lapse?",                                icon: Repeat,      modelType: "Survival on recurring oliver.job patterns (recurring_schedule_id)",     minTier: "pro",      dataFloor: "90d recurring history",        status: "new" },
  { key: "invoice_aging_forecast",                                            label: "Invoice Aging Forecast",      question: "What does expected AR aging look like over the next 60 days?",                 icon: FileWarning, modelType: "Holt-Winters on invoice (amount_due, due_date) + payment aging buckets", minTier: "standard", dataFloor: "60d",                          status: "new" },
];

function stateColor(state: IntelligenceReport["state"]): string {
  switch (state) {
    case "ok": return "#16A34A";
    case "partial": return "#EAB308";
    case "insufficient_data": return "#94A3B8";
    case "locked": return "#94A3B8";
  }
}
function stateBg(state: IntelligenceReport["state"]): string {
  switch (state) {
    case "ok": return "border-emerald-200 bg-white";
    case "partial": return "border-amber-200 bg-amber-50/30";
    case "insufficient_data": return "border-slate-200 bg-slate-50";
    case "locked": return "border-slate-200 bg-slate-50";
  }
}
function stateLabel(state: IntelligenceReport["state"]): string {
  switch (state) {
    case "ok": return "Live";
    case "partial": return "Partial";
    case "insufficient_data": return "Collecting data";
    case "locked": return "Tier locked";
  }
}

export function OliverIAInsightsIntelligencePage() {
  const { get, ready } = useSparkApi();  // OLIVER lives in LUMEN-API
  const { tier, ready: tierReady } = useProductTier("oliver");
  const [inputs, setInputs] = useState<OliverEngineInput | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [open, setOpen] = useState<OliverIntelMetaKey | null>(null);

  const fetchInputs = useCallback(async () => {
    if (!ready) return;
    setLoading(true); setError(null);
    try {
      const r = await get<OliverEngineInput>("/api/v1/ia-insights/inputs?product=oliver&days=90");
      setInputs(r);
    } catch (err) { setError(err); }
    finally { setLoading(false); }
  }, [get, ready]);

  useEffect(() => { fetchInputs(); }, [fetchInputs]);

  const reports = useMemo(() => {
    if (!inputs) return null;
    return runAllOliverIntelligence(inputs);
  }, [inputs]);

  return (
    <div className="p-4 max-w-7xl mx-auto">
      <div className="mb-3">
        <h1 className="text-2xl font-bold text-slate-900">OLIVER IA Insights — Intelligence</h1>
        <p className="text-sm text-slate-500 mt-0.5">Thirteen modelled OLIVER-only reports per doc-64 §6.2. Cross-product reports (Web-to-Revenue, LTV, Marketing-to-Ops) live in ARGUS.</p>
      </div>

      <div className="mb-4 rounded-md border-l-4 border-blue-400 bg-blue-50 px-4 py-3 text-sm text-blue-900">
        <strong>How reports unlock:</strong> Each engine has its own data threshold. Demand Forecast needs 30+ jobs + 4 months history. Cash Pressure needs 20+ payments. Win Rate Intelligence needs 20+ decided quotes. Reports show "Collecting · {"{X}"}/{"{Y}"}" until the gate is met, then auto-promote to "Live".
      </div>

      {loading && !reports && <div className="text-sm text-slate-500 py-8 text-center">Loading OLIVER intelligence engines…</div>}
      {Boolean(error) && !loading && <div className="rounded-md border-l-4 border-rose-400 bg-rose-50 px-4 py-3 text-sm text-rose-900">Failed to load engine inputs: {String((error as Error)?.message || "unknown error")}</div>}

      {reports && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {OLIVER_INTEL.map((m) => {
            // Doc-64 shelf entries map onto engine outputs via engineKey.
            // NEW reports without an engineKey render the pending stub.
            const isPending = !m.engineKey;
            const r: IntelligenceReport = (m.engineKey && reports[m.engineKey]) ?? {
              score: 0, state: "insufficient_data",
              headline: isPending
                ? `Pending implementation — ${m.dataFloor}`
                : "Collecting data — check back in 24 hours",
              scoreInputs: [], observations: [], actions: [],
              dataGap: isPending
                ? `Shell registered — calculator ships in doc-64 Phase 2-4.`
                : "Awaiting first data refresh.",
            };
            // v10.0 — Scope §8.4 split: tier-locked vs data-collecting are
            // distinct user states. Standard tier with Pro report = locked
            // (upsell). Pro tier with thin data = collecting (wait it out).
            const tierLocked = tierReady && !tierMeets(tier, m.minTier);
            if (tierLocked) {
              return (
                <LockedIntelligenceCard
                  key={m.key}
                  name={m.label}
                  description={m.question}
                  icon={m.icon}
                  minTier={m.minTier}
                  lockReason={`Upgrade to ${m.minTier === "business" ? "Business" : "Pro"} to unlock ${m.modelType.toLowerCase()}.`}
                  ctaTarget="/pricing?platform=oliver"
                  onOpen={() => setOpen(m.key)}
                />
              );
            }
            if (r.state === "insufficient_data") {
              return (
                <CollectingIntelligenceCard
                  key={m.key}
                  name={m.label}
                  description={m.question}
                  icon={m.icon}
                  dataFloor={r.dataGap}
                  onOpen={() => setOpen(m.key)}
                />
              );
            }
            const Icon = m.icon;
            const color = stateColor(r.state);
            const bg = stateBg(r.state);
            return (
              <button key={m.key} onClick={() => setOpen(m.key)} className={`text-left rounded-lg border-2 p-4 transition-shadow hover:shadow-md ${bg}`}>
                <div className="flex items-start gap-2 mb-2">
                  <div className="flex-shrink-0 h-10 w-10 rounded-full flex items-center justify-center" style={{ background: `${color}1A`, color }}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-semibold text-sm text-slate-900">{m.label}</span>
                      <span className={`text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded ${m.minTier === "business" ? "bg-violet-100 text-violet-700" : m.minTier === "pro" ? "bg-blue-100 text-blue-700" : "bg-slate-200 text-slate-700"}`}>{m.minTier}</span>
                      {m.status === "new" && (
                        <span className="text-[9px] font-bold uppercase px-1 py-0.5 bg-blue-100 text-blue-700 rounded">NEW</span>
                      )}
                    </div>
                    <p className="text-[10px] text-slate-500 mt-0.5 line-clamp-2">{m.question}</p>
                  </div>
                </div>

                <div className="flex items-center justify-between mt-3 mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-3xl font-bold tabular-nums" style={{ color }}>{(r.score ?? 0).toFixed(0)}</span>
                    <span className="flex items-center gap-1 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded" style={{ background: `${color}1A`, color }}>
                      {r.state === "ok" && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />}
                      {r.state === "partial" && <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />}
                      {stateLabel(r.state)}
                    </span>
                  </div>
                  <ArrowRight className="h-4 w-4 text-slate-400" />
                </div>

                <p className="text-xs text-slate-700 leading-snug line-clamp-2">
                  {r.headline || "Collecting data — check back in 24 hours"}
                </p>

                {r.dataGap && <div className="mt-2 text-[10px] text-amber-800 italic">→ {r.dataGap}</div>}
              </button>
            );
          })}
        </div>
      )}

      {open && reports && (() => {
        const m = OLIVER_INTEL.find((x) => x.key === open);
        if (!m) return null;
        const r: IntelligenceReport = (m.engineKey && reports[m.engineKey]) ?? {
          score: 0, state: "insufficient_data",
          headline: !m.engineKey
            ? `Pending implementation — ${m.dataFloor}`
            : "Collecting data — check back in 24 hours",
          scoreInputs: [], observations: [], actions: [],
          dataGap: !m.engineKey
            ? `Shell registered — calculator ships in doc-64 Phase 2-4.`
            : "Awaiting first data refresh.",
        };
        const tierLocked = tierReady && !tierMeets(tier, m.minTier);
        return <IntelligenceModal meta={m} report={r} tierLocked={tierLocked} onClose={() => setOpen(null)} />;
      })()}
    </div>
  );
}

function IntelligenceModal({ meta, report, tierLocked, onClose }: { meta: IntelReportMeta; report: IntelligenceReport; tierLocked?: boolean; onClose: () => void }) {
  const Icon = meta.icon;
  const effectiveState: IntelligenceReport["state"] = tierLocked ? "locked" : report.state;
  const color = stateColor(effectiveState);
  const scoreInputs = report.scoreInputs ?? [];
  const observations = report.observations ?? [];
  const actions = report.actions ?? [];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-6 py-4 flex-shrink-0">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <div className="flex-shrink-0 h-10 w-10 rounded-full flex items-center justify-center" style={{ background: `${color}1A`, color }}>
              <Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-slate-900">{meta.label}</h2>
              <p className="text-xs text-slate-500 mt-0.5">{meta.question}</p>
              <p className="text-[10px] text-slate-400 mt-1 italic">Model: {meta.modelType}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="text-right">
              {!tierLocked && (effectiveState === "ok" || effectiveState === "partial") ? (
                <div className="text-2xl font-bold tabular-nums" style={{ color }}>{(report.score ?? 0).toFixed(0)}</div>
              ) : (
                <div className="text-xl text-slate-300">—</div>
              )}
              <div className="text-[9px] uppercase text-slate-400">{tierLocked ? `Requires ${meta.minTier}` : stateLabel(effectiveState)}</div>
            </div>
            <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded text-slate-500" aria-label="Close"><X className="h-5 w-5" /></button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {tierLocked && (
            <div className="rounded-md border-l-4 border-violet-400 bg-violet-50 px-4 py-3">
              <div className="text-xs font-semibold uppercase text-violet-800 tracking-wide mb-1">Tier locked</div>
              <p className="text-sm text-slate-800 mb-2">This report is part of the <strong>{meta.minTier === "business" ? "Business" : "Pro"}</strong> tier. Upgrade to unlock the full engine output.</p>
              <Link to="/pricing?platform=oliver" className="inline-flex items-center gap-1 text-xs font-semibold text-violet-700 hover:underline">
                Upgrade to unlock <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          )}
          {!tierLocked && report.dataGap && (
            <div className="rounded-md border-l-4 border-amber-400 bg-amber-50 px-4 py-3">
              <div className="text-xs font-semibold uppercase text-amber-800 tracking-wide mb-1">Data gap</div>
              <p className="text-sm text-slate-800">{report.dataGap}</p>
            </div>
          )}
          {!tierLocked && !report.dataGap && effectiveState === "insufficient_data" && (
            <div className="rounded-md border-l-4 border-slate-300 bg-slate-50 px-4 py-3">
              <div className="text-xs font-semibold uppercase text-slate-600 tracking-wide mb-1">Collecting data</div>
              <p className="text-sm text-slate-700">No data yet — check back in 24 hours.</p>
            </div>
          )}
          {!tierLocked && scoreInputs.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {scoreInputs.filter((i) => i?.value !== null && i?.value !== undefined).slice(0, 4).map((k) => (
                <div key={k.key} className="rounded-md border border-slate-200 bg-white px-3 py-2" style={{ borderTopWidth: 3, borderTopColor: color }}>
                  <div className="text-[10px] uppercase font-semibold text-slate-500 tracking-wide">{(k.key ?? "").replace(/_/g, " ")}</div>
                  <div className="text-lg font-bold text-slate-900 tabular-nums mt-0.5">{String(k.value)}</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">{(k.weight ?? 0) > 0 ? `${Math.round((k.weight ?? 0) * 100)}% of score` : (k.note || "")}</div>
                </div>
              ))}
            </div>
          )}
          {!tierLocked && observations.length > 0 && (
            <div className="rounded-lg bg-slate-900 text-slate-100 p-5">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded" style={{ background: "#84CC1620", color: "#A3E635" }}>ARGUS</span>
                <span className="text-sm">Intelligence · {meta.label}</span>
              </div>
              <ol className="space-y-3">
                {observations.map((obs, i) => (
                  <li key={i} className="flex items-start gap-3 text-xs leading-relaxed text-slate-200">
                    <span className="flex-shrink-0 mt-0.5 h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold" style={{ background: "#EA580C", color: "white" }}>{i + 1}</span>
                    <span>{obs}</span>
                  </li>
                ))}
              </ol>
              {actions.length > 0 && (
                <div className="border-t border-slate-700 mt-4 pt-3">
                  <div className="text-[10px] font-bold uppercase tracking-wide mb-2" style={{ color: "#A3E635" }}>Recommended actions</div>
                  <ul className="space-y-2">
                    {actions.map((act, i) => (
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
          <div className="text-[11px] text-slate-500">
            Generated by <span className="font-semibold" style={{ color: "#A3E635" }}>ARGUS</span>
          </div>
          <button onClick={onClose} className="px-4 py-1.5 text-xs bg-slate-900 text-white rounded hover:bg-slate-800">Close</button>
        </div>
      </div>
    </div>
  );
}

export default OliverIAInsightsIntelligencePage;
