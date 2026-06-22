// ArgusIAInsightsIntelligencePage — restyled 2026-06-21 to match the
// per-platform IA Insights Intelligence pages (ARION/SPARK/OLIVER).
//
// Replaces the old ArgusCrossChannelPage. The 6 reports were renamed to
// broader names (Acquisition Performance, Marketing Effectiveness,
// Reputation Impact, Channel Performance, Customer Lifetime Value,
// Business Health Trajectory). Backend keys + DB rows renamed via
// migration 100. Visual layout now mirrors the per-platform pattern:
//
//   - Single page heading "IA Insights — Intelligence"
//   - Blue aggregate header card with score + tier + freshness
//   - 6-card responsive grid (3 cols lg / 2 md / 1 sm)
//   - Gauge + tier badge + score breakdown bars per card
//   - Card footer: small muted line "Sources: <list>"
//   - Detail modal with score-breakdown, observations, actions
//   - Locked / partial / insufficient_data states identical to per-platform
//
// Endpoint: GET /argus/intelligence/:tenantId/reports
//   (back-compat aliases: /argus/cross-platform-intelligence/:tenantId/reports
//    and /argus/cross-channel-intelligence/:tenantId/reports)
//
// 2026-06-22: Cross-Channel → Cross-Platform rename. The page is now routed
// under the canonical serviceCatalog key `argus_cross_platform`; legacy
// `argus_cross_channel` remains a back-compat alias resolving to the same page.

import { useEffect, useMemo, useState } from "react";
import { useAccessToken } from "../../auth/useAccessToken";
import { useAppState } from "../../app/AppState";
import {
  Lock, TrendingUp, Users, DollarSign, BarChart3, Activity, MessageSquare, ArrowRight, X, RefreshCw,
  Wallet, UserMinus, LineChart, AlertTriangle, Sparkles, CircuitBoard, Coins,
} from "lucide-react";

// ── Shared types matching the platform-api payload shape ──────────────
interface IntelligenceComponent {
  key: string;
  value: number;
  weight: number;
  note?: string;
}

type ReportState = "ok" | "partial" | "insufficient_data" | "locked";

interface IntelligenceReport {
  reportKey: string;
  score: number | null;
  tier: "A" | "B" | "C" | "D" | null;
  state: ReportState;
  locked?: boolean;
  requiredTier?: string;
  components: IntelligenceComponent[];
  narrative: string;
  observations: string[];
  actions: string[];
  dataGap?: string;
  dataChain?: string;
  sources?: string[];
  last_calculated_at: string;
}

interface BundleResponse {
  reports: IntelligenceReport[];
  tier: string;
  intelligenceScore?: number | null;
  intelligenceTier?: "A" | "B" | "C" | "D" | null;
  activeReports?: number;
  totalReports?: number;
  cache_states: Record<string, string>;
  ttl_seconds: number;
  generated_at: string;
}

// ── Per-report metadata: icons, questions, source labels, tier gates ──
//
// Source labels are static here (mirror the canonical mapping from the
// task spec) so they always render — even when the backend payload's
// sources array is missing because the response was cached pre-rename.
// 2026-06-22 — Doc 64 §7.2 + §7.4 canonical ARGUS Intelligence shelves.
// Two sections live on this page:
//   - Cross-Platform Intelligence (7 reports, §7.2)
//   - ARGUS AI Intelligence (3 reports, §7.4)
// The May-spec 6-report shelf (acquisition_performance, marketing_effectiveness,
// reputation_impact, channel_performance, customer_lifetime_value,
// business_health_trajectory) is SUPERSEDED — those reports collapsed into
// the new §7.2 set per the doc-64 migration table. Legacy keys remain
// resolvable in the backend so any cached payload still renders.
type ReportSection = "cross_platform" | "argus_ai";

interface ReportMeta {
  label: string;
  question: string;
  icon: typeof Users;
  category: "kept" | "new" | "superseded";
  /** Doc-64 §2 tier philosophy: pro/business for Cross-Platform; std/pro/business for ARGUS AI. */
  minTier: "free" | "standard" | "pro" | "business" | "data_plan";
  sourceLabel: string;
  section: ReportSection;
  dataFloor: string;
}

const REPORT_META: Record<string, ReportMeta> = {
  // ── §7.2 Cross-Platform Intelligence — 7 reports ─────────────────
  customer_acquisition_cost_forecast: {
    label: "Customer Acquisition Cost Forecast",
    question: "What will CAC look like over the next 90 days, and which channels are getting expensive?",
    icon: Wallet,
    category: "new",
    minTier: "pro",
    sourceLabel: "Sources: ARION + SPARK + OLIVER (+ STELLA when joined)",
    section: "cross_platform",
    dataFloor: "90d + 100+ attributed contacts",
  },
  cross_product_churn_prediction: {
    label: "Cross-Product Churn Prediction",
    question: "Who is 60-90 days from full disengagement across every touchpoint?",
    icon: UserMinus,
    category: "new",
    minTier: "business",
    sourceLabel: "Sources: SPARK + OLIVER + ARION (Plugin signal)",
    section: "cross_platform",
    dataFloor: "180d + 200+ contacts w/ ≥1 paid job",
  },
  lifetime_value_prediction: {
    label: "Lifetime Value Prediction",
    question: "What is each contact's predicted LTV based on first-90-day signals?",
    icon: DollarSign,
    category: "new",
    minTier: "business",
    sourceLabel: "Sources: SPARK + OLIVER",
    section: "cross_platform",
    dataFloor: "12mo + 300+ contacts w/ ≥12mo history",
  },
  revenue_attribution_modeling: {
    label: "Revenue Attribution Modeling",
    question: "Which channels deserve credit for each paid job?",
    icon: Coins,
    category: "new",
    minTier: "business",
    sourceLabel: "Sources: ARION + SPARK + OLIVER",
    section: "cross_platform",
    dataFloor: "90d + 150+ paid conversions, ≥2 touchpoints each",
  },
  cross_platform_anomaly_detection: {
    label: "Cross-Platform Anomaly Detection",
    question: "Which cross-product KPI just broke pattern?",
    icon: AlertTriangle,
    category: "new",
    minTier: "pro",
    sourceLabel: "Sources: ARION + SPARK + OLIVER",
    section: "cross_platform",
    dataFloor: "60d daily granularity",
  },
  growth_trajectory_forecast: {
    label: "Growth Trajectory Forecast",
    question: "Where will revenue, contacts, jobs, and visibility be in 90 days?",
    icon: TrendingUp,
    category: "new",
    minTier: "pro",
    sourceLabel: "Sources: ARION + SPARK + OLIVER",
    section: "cross_platform",
    dataFloor: "90d weekly",
  },
  prescriptive_growth_recommendations: {
    label: "Prescriptive Growth Recommendations",
    question: "What are the top-3 highest-ROI actions to take this quarter?",
    icon: LineChart,
    category: "new",
    minTier: "business",
    sourceLabel: "Sources: composite (reports 1, 2, 3, 6 must have run)",
    section: "cross_platform",
    dataFloor: "Reports above must have completed at least once",
  },
  // ── §7.4 ARGUS AI Intelligence — 3 reports ───────────────────────
  ai_usage_forecast: {
    label: "AI Usage Forecast",
    question: "Will I run out of credits this cycle? When should I top up or upgrade?",
    icon: Sparkles,
    category: "new",
    minTier: "standard",
    sourceLabel: "Sources: argus.ai_token_ledger + data_plan_subscription",
    section: "argus_ai",
    dataFloor: "30d daily",
  },
  il_model_performance_anomaly: {
    label: "IL Model Performance Anomaly",
    question: "Is IL accuracy or hit rate degrading silently?",
    icon: CircuitBoard,
    category: "new",
    minTier: "pro",
    sourceLabel: "Sources: argus.il_invocation_log (confidence, fallback, acceptance)",
    section: "argus_ai",
    dataFloor: "60d + 500+ IL invocations per feature",
  },
  ai_cost_optimization_recommendations: {
    label: "Cost Optimization Recommendations",
    question: "What would lower AI spend without losing capability?",
    icon: Coins,
    category: "new",
    minTier: "business",
    sourceLabel: "Sources: argus.ai_token_ledger + il_invocation_log + data_plan",
    section: "argus_ai",
    dataFloor: "60d + ≥1 full billing cycle",
  },
};

const REPORT_ORDER = [
  // Cross-Platform Intelligence (§7.2)
  "customer_acquisition_cost_forecast",
  "cross_product_churn_prediction",
  "lifetime_value_prediction",
  "revenue_attribution_modeling",
  "cross_platform_anomaly_detection",
  "growth_trajectory_forecast",
  "prescriptive_growth_recommendations",
  // ARGUS AI Intelligence (§7.4)
  "ai_usage_forecast",
  "il_model_performance_anomaly",
  "ai_cost_optimization_recommendations",
];

// Silence unused-import warnings for icons not used after refactor.
void Activity; void MessageSquare; void BarChart3;

const TIER_LABEL: Record<string, string> = {
  free:       "Free",
  standard:   "Standard",
  pro:        "Pro",
  business:   "Business",
  data_plan:  "Data Plan",
};

// ── Visual helpers (match the per-platform pages) ─────────────────────
function stateColor(state: ReportState): string {
  switch (state) {
    case "ok": return "#16A34A";
    case "partial": return "#EAB308";
    case "insufficient_data": return "#94A3B8";
    case "locked": return "#94A3B8";
  }
}
function stateBg(state: ReportState): string {
  switch (state) {
    case "ok": return "border-emerald-200 bg-white";
    case "partial": return "border-amber-200 bg-amber-50/30";
    case "insufficient_data": return "border-slate-200 bg-slate-50";
    case "locked": return "border-slate-200 bg-slate-50";
  }
}
function stateLabel(state: ReportState, minTier: string): string {
  switch (state) {
    case "ok": return "Live";
    case "partial": return "Partial";
    case "insufficient_data": return "Collecting data";
    case "locked": return `Requires ${minTier}`;
  }
}

// Resolve which source-label to render. Prefer the backend's `sources`
// array (which is dynamic for business_health_trajectory — only the
// products that reported are listed). Fall back to the static label.
function resolveSourceLabel(report: IntelligenceReport, meta: ReportMeta): string {
  if (Array.isArray(report.sources) && report.sources.length > 0) {
    if (report.reportKey === "business_health_trajectory") {
      return `Sources: ${report.sources.map((s) => s.toUpperCase()).join(" + ")}`;
    }
    return `Sources: ${report.sources.map((s) => s.toUpperCase()).join(" + ")}`;
  }
  return meta.sourceLabel;
}

// ── Main page ────────────────────────────────────────────────────────
export function ArgusIAInsightsIntelligencePage() {
  const { activeTenantId } = useAppState();
  const { getToken } = useAccessToken();
  const [bundle, setBundle] = useState<BundleResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const apiBase = (import.meta.env.VITE_PLATFORM_API_BASE_URL as string)?.replace(/\/$/, "");

  const load = async (forceRefresh: boolean) => {
    if (!activeTenantId || !apiBase) return;
    setError(null);
    if (forceRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const token = await getToken();
      const qs = forceRefresh ? "?refresh=true" : "";
      // New canonical alias path. The legacy /cross-platform-intelligence
      // and /cross-channel-intelligence paths still work and serve the same
      // payload (back-compat).
      const url = `${apiBase}/argus/intelligence/${encodeURIComponent(activeTenantId)}/reports${qs}`;
      const r = await globalThis.fetch(url, {
        headers: {
          Authorization: `Bearer ${token.accessToken}`,
          "x-tenant-key": activeTenantId,
        },
      });
      if (!r.ok) {
        setError(`Failed to load IA Insights — Intelligence (HTTP ${r.status}).`);
        return;
      }
      const json = await r.json();
      setBundle(json?.data || null);
    } catch (e) {
      setError((e as Error).message || "Unknown error");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTenantId]);

  const reportsByKey = useMemo(() => {
    const m: Record<string, IntelligenceReport> = {};
    for (const r of bundle?.reports ?? []) m[r.reportKey] = r;
    return m;
  }, [bundle]);

  const tier = bundle?.tier || "free";

  const intelligenceScoreDisplay = useMemo(() => {
    if (!bundle) return "—";
    if (bundle.intelligenceScore == null) return "—";
    return String(bundle.intelligenceScore);
  }, [bundle]);

  return (
    <div className="p-4 max-w-7xl mx-auto">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">IA Insights — Intelligence</h1>
          <p className="text-sm text-slate-500 mt-0.5">Cross-Platform Intelligence (7 reports, §7.2) plus ARGUS AI Intelligence (3 reports, §7.4). All cross-product reports consolidate here per doc 64.</p>
        </div>
        <button
          onClick={() => void load(true)}
          disabled={refreshing || loading}
          className="inline-flex items-center gap-1.5 rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
          {refreshing ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {/* Aggregate header card — matches the per-platform Intelligence pages */}
      <div className="mb-4 rounded-md border-l-4 border-blue-400 bg-blue-50 px-4 py-3 text-sm text-blue-900 flex items-center gap-4">
        <div className="flex-1">
          <strong>ARGUS Intelligence Score: {intelligenceScoreDisplay}</strong>
          {bundle?.intelligenceTier && (
            <span className="ml-2 inline-flex items-center text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-blue-100 text-blue-800">
              Tier {bundle.intelligenceTier}
            </span>
          )}
          <span className="ml-3 text-xs text-blue-800">
            {bundle
              ? `${bundle.activeReports ?? 0} of ${bundle.totalReports ?? 6} reports active`
              : "Loading..."}
          </span>
          {tier && <span className="ml-3 text-xs text-blue-800">ARGUS tier: {TIER_LABEL[tier] || tier.toUpperCase()}</span>}
        </div>
        <div className="text-xs text-blue-800">
          {loading ? "Loading…" : refreshing ? "Refreshing…" : (bundle?.generated_at ? "Cached (12h TTL)" : "")}
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-md border-l-4 border-red-400 bg-red-50 px-4 py-3 text-sm text-red-900">
          Failed to load Intelligence reports: {error}
        </div>
      )}

      {/* §7.2 Cross-Platform Intelligence */}
      <div className="mt-2 mb-2">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-600">Cross-Platform Intelligence</h2>
        <p className="text-xs text-slate-500">Doc 64 §7.2 · 7 reports that combine signals across ARION + SPARK + OLIVER (plus STELLA where joined).</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {REPORT_ORDER.filter((key) => REPORT_META[key]?.section === "cross_platform").map((key) => {
          const meta = REPORT_META[key];
          const report: IntelligenceReport = reportsByKey[key] ?? {
            reportKey: key,
            score: null,
            tier: null,
            state: loading ? "insufficient_data" : "insufficient_data",
            components: [],
            narrative: loading ? "Loading…" : `Pending implementation — ${meta?.dataFloor || "calculator queued"}.`,
            observations: [],
            actions: [],
            dataGap: loading ? undefined : `Shell registered — calculator ships in doc-64 Phase 5.`,
            last_calculated_at: new Date().toISOString(),
          };
          return (
            <ReportCard
              key={key}
              meta={meta}
              report={report}
              onOpen={() => setOpen(key)}
            />
          );
        })}
      </div>

      {/* §7.4 ARGUS AI Intelligence */}
      <div className="mt-6 mb-2">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-600">ARGUS AI Intelligence</h2>
        <p className="text-xs text-slate-500">Doc 64 §7.4 · Modelled reports on AI Credit / IL Model usage. Requires ARGUS AI v1 metering tables (overnight-report doc 41).</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {REPORT_ORDER.filter((key) => REPORT_META[key]?.section === "argus_ai").map((key) => {
          const meta = REPORT_META[key];
          const report: IntelligenceReport = reportsByKey[key] ?? {
            reportKey: key,
            score: null,
            tier: null,
            state: loading ? "insufficient_data" : "insufficient_data",
            components: [],
            narrative: loading ? "Loading…" : `Pending implementation — ${meta?.dataFloor || "calculator queued"}.`,
            observations: [],
            actions: [],
            dataGap: loading ? undefined : `Shell registered — calculator ships in doc-64 Phase 6 (needs ARGUS AI metering layer).`,
            last_calculated_at: new Date().toISOString(),
          };
          return (
            <ReportCard
              key={key}
              meta={meta}
              report={report}
              onOpen={() => setOpen(key)}
            />
          );
        })}
      </div>

      {open && (() => {
        const meta = REPORT_META[open];
        if (!meta) return null;
        const report: IntelligenceReport = reportsByKey[open] ?? {
          reportKey: open,
          score: null,
          tier: null,
          state: "insufficient_data",
          components: [],
          narrative: `Pending implementation — ${meta.dataFloor}.`,
          observations: [
            `Shell registered as a Phase-1 card per doc 64 §8. Calculator ships in ${meta.section === "argus_ai" ? "Phase 6 (requires ARGUS AI metering)" : "Phase 5"}.`,
          ],
          actions: [],
          dataGap: `Shell registered — calculator queued.`,
          last_calculated_at: new Date().toISOString(),
        };
        return <IntelligenceModal meta={meta} report={report} onClose={() => setOpen(null)} />;
      })()}
    </div>
  );
}

// ── Single Report Card ────────────────────────────────────────────────
// Matches ArionIAInsightsIntelligencePage's card pattern exactly, with
// one addition: a small muted footer line ("Sources: …") that names
// the platforms feeding that gauge.
function ReportCard({ meta, report, onOpen }: {
  meta: ReportMeta;
  report: IntelligenceReport;
  onOpen: () => void;
}) {
  const color = stateColor(report.state);
  const bg = stateBg(report.state);
  const Icon = meta.icon;
  const isLocked = report.state === "locked";
  const isInsuf = report.state === "insufficient_data";
  const sourceLabel = resolveSourceLabel(report, meta);
  const tierBadgeClass =
    meta.minTier === "business" || meta.minTier === "data_plan"
      ? "bg-violet-100 text-violet-700"
      : meta.minTier === "pro"
        ? "bg-blue-100 text-blue-700"
        : meta.minTier === "standard"
          ? "bg-emerald-100 text-emerald-700"
          : "bg-slate-200 text-slate-700";

  return (
    <button
      onClick={onOpen}
      className={`text-left rounded-lg border-2 p-4 transition-shadow hover:shadow-md ${bg}`}
    >
      <div className="flex items-start gap-2 mb-2">
        <div className="flex-shrink-0 h-10 w-10 rounded-full flex items-center justify-center" style={{ background: `${color}1A`, color }}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-semibold text-sm text-slate-900">{meta.label}</span>
            <span className={`text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded ${tierBadgeClass}`}>
              {meta.minTier === "data_plan" ? "data plan" : meta.minTier}
            </span>
            {meta.category === "new" && (
              <span className="text-[9px] font-bold uppercase px-1 py-0.5 bg-blue-100 text-blue-700 rounded">NEW</span>
            )}
          </div>
          <p className="text-[10px] text-slate-500 mt-0.5 line-clamp-2">{meta.question}</p>
        </div>
      </div>

      <div className="flex items-center justify-between mt-3 mb-2">
        <div className="flex items-center gap-2">
          {!isLocked && report.score != null ? (
            <span className="text-3xl font-bold tabular-nums" style={{ color }}>{report.score}</span>
          ) : (
            <span className="text-2xl font-bold text-slate-300">—</span>
          )}
          <span className="flex items-center gap-1 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded" style={{ background: `${color}1A`, color }}>
            {report.state === "ok" && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />}
            {report.state === "partial" && <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />}
            {(isInsuf || isLocked) && <Lock className="h-3 w-3" />}
            {stateLabel(report.state, meta.minTier)}
          </span>
        </div>
        <ArrowRight className="h-4 w-4 text-slate-400" />
      </div>

      {/* Score-breakdown bars (matches per-platform pattern when present). */}
      {report.components && report.components.length > 0 && (
        <div className="space-y-1 mb-2">
          {report.components.map((c) => (
            <div key={c.key} className="flex items-center gap-2">
              <div className="flex-1 h-1.5 rounded-full bg-slate-200 overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${c.value}%`, background: color }} />
              </div>
              <span className="text-[9px] text-slate-500 w-20 truncate">{c.note || c.key}</span>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-slate-700 leading-snug line-clamp-2">
        {isLocked
          ? `Upgrade to ARGUS ${(report.requiredTier || meta.minTier).toUpperCase()}+ to unlock this report.`
          : (report.narrative || "Awaiting first calculation.")}
      </p>
      {!isLocked && report.dataGap && (
        <div className="mt-2 text-[10px] text-amber-800 italic">→ {report.dataGap}</div>
      )}
      {isInsuf && !report.dataGap && (
        <div className="mt-2 text-[10px] text-slate-500 italic">Activate the relevant platforms to enable this report.</div>
      )}

      {/* Card footer — small caps muted source list. */}
      <div className="mt-2 pt-2 border-t border-slate-200/70 text-[10px] uppercase tracking-wide text-slate-500">
        {sourceLabel}
      </div>
    </button>
  );
}

// ── Detail Modal ──────────────────────────────────────────────────────
// Same structure as ArionIAInsightsIntelligencePage's IntelligenceModal,
// with one extra section: "Data sources" listing the platforms feeding
// this report.
function IntelligenceModal({ meta, report, onClose }: {
  meta: ReportMeta;
  report: IntelligenceReport;
  onClose: () => void;
}) {
  const Icon = meta.icon;
  const isLocked = report.state === "locked";
  const color = stateColor(report.state);
  const components = report.components ?? [];
  const observations = report.observations ?? [];
  const actions = report.actions ?? [];
  const sourceLabel = resolveSourceLabel(report, meta);

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
              {report.dataChain && (
                <p className="text-[10px] text-slate-400 mt-1 italic">Data chain: {report.dataChain}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="text-right">
              {!isLocked && report.score != null ? (
                <div className="text-2xl font-bold tabular-nums" style={{ color }}>{report.score}</div>
              ) : (
                <div className="text-xl text-slate-300">—</div>
              )}
              <div className="text-[9px] uppercase text-slate-400">{stateLabel(report.state, meta.minTier)}</div>
            </div>
            <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded text-slate-500" aria-label="Close">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Locked / data-gap / collecting banners */}
          {isLocked && (
            <div className="rounded-md border-l-4 border-violet-400 bg-violet-50 px-4 py-3">
              <div className="text-xs font-semibold uppercase text-violet-800 tracking-wide mb-1">Tier locked</div>
              <p className="text-sm text-slate-800 mb-2">
                This report unlocks at the <strong>{(report.requiredTier || meta.minTier).toUpperCase()}</strong> ARGUS tier.
              </p>
            </div>
          )}
          {!isLocked && report.dataGap && (
            <div className="rounded-md border-l-4 border-amber-400 bg-amber-50 px-4 py-3">
              <div className="text-xs font-semibold uppercase text-amber-800 tracking-wide mb-1">Data gap</div>
              <p className="text-sm text-slate-800">{report.dataGap}</p>
            </div>
          )}
          {!isLocked && !report.dataGap && report.state === "insufficient_data" && (
            <div className="rounded-md border-l-4 border-slate-300 bg-slate-50 px-4 py-3">
              <div className="text-xs font-semibold uppercase text-slate-600 tracking-wide mb-1">Collecting data</div>
              <p className="text-sm text-slate-700">No data yet — check back in 24 hours or trigger a manual refresh.</p>
            </div>
          )}

          {/* Data sources callout (this is the ARGUS-specific add). */}
          <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="text-[10px] font-bold uppercase text-slate-600 tracking-wide mb-1">Data sources</div>
            <p className="text-sm text-slate-800">{sourceLabel}</p>
            {report.reportKey === "business_health_trajectory" && (
              <p className="text-[10px] text-slate-500 mt-1 italic">Resolved at calculation time from the products that emitted Pulse history in the window.</p>
            )}
          </div>

          {/* Score breakdown (gauge inputs) */}
          {!isLocked && components.length > 0 && (
            <div>
              <div className="text-[10px] font-bold uppercase text-slate-500 tracking-wide mb-2">Score breakdown</div>
              <div className="space-y-2">
                {components.map((c) => (
                  <div key={c.key}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-700 capitalize">{c.key.replace(/_/g, " ")}</span>
                        {c.note && <span className="text-slate-500">· {c.note}</span>}
                      </div>
                      <div className="text-slate-700 font-mono">
                        {c.value} <span className="text-slate-400">× {(c.weight * 100).toFixed(0)}%</span>
                      </div>
                    </div>
                    <div className="h-2 rounded-full bg-slate-200 overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${c.value}%`, background: color }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ARGUS narration block (matches per-platform modals). */}
          {!isLocked && observations.length > 0 && (
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
            Generated by <span className="font-semibold" style={{ color: "#A3E635" }}>ARGUS</span> · category: <span className="font-semibold">{meta.category}</span> · min tier: <span className="font-semibold uppercase">{meta.minTier === "data_plan" ? "Data Plan" : meta.minTier}</span>
          </div>
          <button onClick={onClose} className="px-4 py-1.5 text-xs bg-slate-900 text-white rounded hover:bg-slate-800">Close</button>
        </div>
      </div>
    </div>
  );
}

export default ArgusIAInsightsIntelligencePage;
