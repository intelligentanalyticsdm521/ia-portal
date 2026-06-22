// SparkIAInsightsIntelligencePage — v9.5 LIVE.
//
// All 6 SPARK Intelligence reports now run on real engines, reading from
// the same /api/v1/ia-insights/inputs?product=spark feed the Trends page
// uses. Each engine returns a ReportAnalysis with a score + headline.
//
// Pages are clickable cards that open a deep-dive modal with the full
// observations + actions from the engine output. State decorations:
//   - "ok"                → green border, score shown
//   - "partial"           → amber border, data-gap callout
//   - "insufficient_data" → grey border, threshold-needed callout
//   - "locked"            → tier upgrade gate
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useSparkApi } from "../../hooks/useSparkApi";
import { useProductTier, tierMeets } from "../../hooks/useProductTier";
import { Sparkles, TrendingDown, BarChart3, DollarSign, Users, Repeat, PieChart, ArrowRight, X, Clock, ShieldAlert, Eraser, AlertTriangle, Activity } from "lucide-react";
import { runAllSparkIntelligence, type IntelligenceReport, type SparkIntelKey } from "../../spark/analytics/sparkIntelligenceEngines";
import type { SparkEngineInput } from "../../spark/analytics/sparkTrendEngines";
import { LockedIntelligenceCard, CollectingIntelligenceCard } from "../../components/iainsights/LockedIntelligenceCard";

// 2026-06-22 — Doc 64 §5.2 canonical 9-report SPARK Intelligence shelf.
// Migration:
//   contact_quality        → MOVED to ARGUS (LTV)         · shell renamed → score_trajectory
//   campaign_revenue       → MOVED to ARGUS (Marketing-to-Ops) · shell renamed → subject_line
//   lead_pipeline_forecast → MOVED to ARGUS (Web-to-Revenue)   · removed from shelf
//   churn_risk             → KEPT (SPARK signals only)
//   automation_effectiveness → renamed → automation_drift (NEW model)
//   audience_segmentation  → KEPT
//   NEW: engagement_decay, optimal_send, sender_reputation, list_hygiene
// Underlying engines stay wired so cached payloads still resolve; NEW
// entries render as pending_implementation cards in Phase 1.
type SparkIntelMetaKey =
  | "engagement_decay"
  | "subject_line"
  | "optimal_send"
  | "audience_segmentation"
  | "score_trajectory"
  | "churn_risk"
  | "sender_reputation"
  | "list_hygiene"
  | "automation_drift";

interface IntelReportMeta {
  /** Doc-64 shelf key (rendered identifier). */
  key: SparkIntelMetaKey;
  /** Underlying engine key in the SparkIntelligenceEngines registry.
   *  If absent, the card renders as pending_implementation. */
  engineKey?: SparkIntelKey;
  label: string;
  question: string;
  icon: typeof Sparkles;
  modelType: string;
  minTier: "standard" | "pro" | "business";
  dataFloor: string;
  status: "kept" | "new";
}

// Doc-64 §5.2 9-report shelf. Each `engineKey` (when set) maps onto an
// existing engine so cached payloads display under the new shelf entry.
const SPARK_INTEL: IntelReportMeta[] = [
  { key: "engagement_decay",      engineKey: "churn_risk",            label: "Engagement Decay Detection",         question: "When is engagement decaying faster than baseline?",                icon: TrendingDown,  modelType: "Anomaly · statistical baseline + z-score",                       minTier: "standard", dataFloor: "30d + 4 campaigns",      status: "kept" },
  { key: "subject_line",          engineKey: "campaign_revenue",      label: "Subject Line Performance",           question: "Which subject-line patterns reliably win?",                       icon: BarChart3,     modelType: "Classification · token/pattern → open & click bands",            minTier: "pro",      dataFloor: "20+ sent campaigns",     status: "kept" },
  { key: "optimal_send",                                              label: "Optimal Send Time",                  question: "When should I send to each segment?",                              icon: Clock,         modelType: "Statistical · distribution by hour/day per-segment",             minTier: "standard", dataFloor: "12+ campaigns, 60d",     status: "new" },
  { key: "audience_segmentation", engineKey: "audience_segmentation", label: "Audience Segmentation Intelligence", question: "What natural clusters am I not segmenting on?",                   icon: PieChart,      modelType: "k-means clustering",                                              minTier: "pro",      dataFloor: "100+ contacts",          status: "kept" },
  { key: "score_trajectory",      engineKey: "contact_quality",       label: "Contact Quality Score Trajectory",   question: "Is list quality compounding or eroding?",                          icon: Activity,      modelType: "Time-series · per-contact slope + tenant aggregate",             minTier: "pro",      dataFloor: "60d score history",      status: "kept" },
  { key: "churn_risk",            engineKey: "churn_risk",            label: "Churn Risk Model",                   question: "Which contacts will disengage in the next 60-90 days?",            icon: Users,         modelType: "Survival / logistic on engagement-only signals",                  minTier: "business", dataFloor: "6mo history",            status: "kept" },
  { key: "sender_reputation",                                         label: "Sender Reputation Anomaly",          question: "Is deliverability quietly degrading?",                             icon: ShieldAlert,   modelType: "Anomaly on bounce/spam/unsub vs rolling baseline",               minTier: "pro",      dataFloor: "30d",                    status: "new" },
  { key: "list_hygiene",                                              label: "List Hygiene Decay",                 question: "Is my list rotting underneath?",                                   icon: Eraser,        modelType: "Statistical · hard-bounce, role-address, dedup, opt-out drift",  minTier: "standard", dataFloor: "30d + 500+ contacts",   status: "new" },
  { key: "automation_drift",      engineKey: "automation_effectiveness", label: "Automation Drift Detection",      question: "Any automation misfiring silently?",                              icon: AlertTriangle, modelType: "Anomaly on run-volume / error-rate / downstream-engagement",     minTier: "pro",      dataFloor: "30d, automation ≥14d active", status: "new" },
];

// Silence unused-import errors on icons still in scope after refactor.
void DollarSign; void Repeat;

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
    case "partial": return "Partial · OLIVER needed";
    case "insufficient_data": return "Collecting data";
    case "locked": return "Tier locked";
  }
}

export function SparkIAInsightsIntelligencePage() {
  const { get, ready } = useSparkApi();
  const { tier, ready: tierReady } = useProductTier("spark");
  const [inputs, setInputs] = useState<SparkEngineInput | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [open, setOpen] = useState<SparkIntelMetaKey | null>(null);

  const fetchInputs = useCallback(async () => {
    if (!ready) return;
    setLoading(true); setError(null);
    try {
      const r = await get<SparkEngineInput>("/api/v1/ia-insights/inputs?product=spark&days=90");
      setInputs(r);
    } catch (err) { setError(err); }
    finally { setLoading(false); }
  }, [get, ready]);

  useEffect(() => { fetchInputs(); }, [fetchInputs]);

  const reports = useMemo(() => {
    if (!inputs) return null;
    // Null-defence — engines accept null SparkEngineInput sub-sections, but
    // a null root would crash the destructure. We've already early-returned
    // above, so this cast is safe.
    return runAllSparkIntelligence(inputs);
  }, [inputs]);

  return (
    <div className="p-4 max-w-7xl mx-auto">
      <div className="mb-3">
        <h1 className="text-2xl font-bold text-slate-900">SPARK IA Insights — Intelligence</h1>
        <p className="text-sm text-slate-500 mt-0.5">Nine modelled SPARK-only reports per doc-64 §5.2. Cross-product reports (LTV, attribution, web-to-revenue) live in ARGUS.</p>
      </div>

      <div className="mb-4 rounded-md border-l-4 border-blue-400 bg-blue-50 px-4 py-3 text-sm text-blue-900">
        <strong>How reports unlock:</strong> Each engine has its own data threshold (typically 20-50 records of the right type). When data is below the threshold, the card shows "Collecting data" with the exact gap. When OLIVER cross-product data is missing, the card shows "Partial" and scores what it can. When all data is present, the card shows "Live" with the full report.
      </div>

      {loading && !reports && <div className="text-sm text-slate-500 py-8 text-center">Loading SPARK intelligence engines…</div>}
      {Boolean(error) && !loading && <div className="rounded-md border-l-4 border-rose-400 bg-rose-50 px-4 py-3 text-sm text-rose-900">Failed to load engine inputs: {String((error as Error)?.message || "unknown error")}</div>}

      {reports && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {SPARK_INTEL.map((m) => {
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
            // v10.0 — Scope §8.4 split: tier-insufficient → LockedIntelligenceCard
            // (Standard tenant sees Pro/Business reports), data-insufficient
            // (but tier sufficient) → CollectingIntelligenceCard (Pro tenant
            // waiting for the data floor). These are distinct user states and
            // must render distinct UX, per overnight-report doc 64.
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
                  ctaTarget="/pricing?platform=spark"
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
            // Live + Partial states keep their existing rich card chrome —
            // colour, gauge, headline. Engines own the per-report behaviour.
            const Icon = m.icon;
            const color = stateColor(r.state);
            const bg = stateBg(r.state);
            return (
              <button
                key={m.key}
                onClick={() => setOpen(m.key)}
                className={`text-left rounded-lg border-2 p-4 transition-shadow hover:shadow-md ${bg}`}
              >
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
        const m = SPARK_INTEL.find((x) => x.key === open);
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

// ── Modal ────────────────────────────────────────────────────────────
function IntelligenceModal({ meta, report, tierLocked, onClose }: { meta: IntelReportMeta; report: IntelligenceReport; tierLocked?: boolean; onClose: () => void }) {
  const Icon = meta.icon;
  const effectiveState: IntelligenceReport["state"] = tierLocked ? "locked" : report.state;
  const color = stateColor(effectiveState);
  // Null-guard arrays — older engines may not populate every collection.
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
          {/* Tier-locked callout */}
          {tierLocked && (
            <div className="rounded-md border-l-4 border-violet-400 bg-violet-50 px-4 py-3">
              <div className="text-xs font-semibold uppercase text-violet-800 tracking-wide mb-1">Tier locked</div>
              <p className="text-sm text-slate-800 mb-2">This report is part of the <strong>{meta.minTier === "business" ? "Business" : "Pro"}</strong> tier. Upgrade to unlock the full engine output.</p>
              <Link to="/pricing?platform=spark" className="inline-flex items-center gap-1 text-xs font-semibold text-violet-700 hover:underline">
                Upgrade to unlock <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          )}

          {/* Data gap callout (if any) */}
          {!tierLocked && report.dataGap && (
            <div className="rounded-md border-l-4 border-amber-400 bg-amber-50 px-4 py-3">
              <div className="text-xs font-semibold uppercase text-amber-800 tracking-wide mb-1">Data gap</div>
              <p className="text-sm text-slate-800">{report.dataGap}</p>
            </div>
          )}

          {/* Empty-state callout (no data, no gap text) */}
          {!tierLocked && !report.dataGap && effectiveState === "insufficient_data" && (
            <div className="rounded-md border-l-4 border-slate-300 bg-slate-50 px-4 py-3">
              <div className="text-xs font-semibold uppercase text-slate-600 tracking-wide mb-1">Collecting data</div>
              <p className="text-sm text-slate-700">No data yet — check back in 24 hours.</p>
            </div>
          )}

          {/* Score inputs (numeric tiles) */}
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

          {/* Observations */}
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

export default SparkIAInsightsIntelligencePage;
