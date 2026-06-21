// ArionIAInsightsIntelligencePage — v10.0 SINGLE-SOURCE LIVE.
//
// Brandon's locked architecture (2026-06-21): 6 single-source ARION
// Intelligence reports rendered from arion-api's /arion/sites/:siteId/
// intelligence aggregator. Multi-platform reports (Lead Source Quality,
// Content ROI, Reputation → Revenue) have relocated to ARGUS Cross-
// Channel Intelligence and no longer render on this page.
//
// All scoring runs server-side; the page is a thin renderer with a 12h
// cached fetch + on-demand refresh button.
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useArionContext } from "../../useArionContext";
import { useAccessToken } from "../../../auth/useAccessToken";
import { useAppState } from "../../../app/AppState";
import { Lock, ArrowRight, X, RefreshCw, ShieldAlert, TrendingUp, Target, Compass, Code2, Gauge } from "lucide-react";
import {
  ARION_INTEL_META,
  ARION_INTEL_KEYS,
  normalizeAggregateResponse,
  type ArionIntelKey,
  type IntelligenceReport,
  type IntelReportMeta,
  type IntelligenceAggregateResponse,
} from "../../analytics/arionIntelligenceEngines";

const TIER_LABEL: Record<string, string> = {
  starter:    "Starter",
  essentials: "Essentials",
  growth:     "Growth",
  authority:  "Authority",
};

const ICON_BY_KEY: Record<ArionIntelKey, typeof TrendingUp> = {
  seo_authority:          ShieldAlert,
  visibility_trajectory:  TrendingUp,
  competitive_presence:   Target,
  crawl_depth:            Compass,
  schema_coverage:        Code2,
  pagespeed_distribution: Gauge,
};

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

export function ArionIAInsightsIntelligencePage() {
  const { activeSiteId } = useArionContext();
  const { activeTenantId } = useAppState();
  const { getToken } = useAccessToken();
  const [data, setData] = useState<IntelligenceAggregateResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<ArionIntelKey | null>(null);

  const apiBase = (import.meta.env.VITE_ARION_API_BASE_URL as string)?.replace(/\/$/, "");

  // Fetch — used by initial load + manual refresh.
  const load = async (forceRefresh: boolean) => {
    if (!activeSiteId || !activeTenantId || !apiBase) return;
    setError(null);
    if (forceRefresh) setRefreshing(true); else setLoading(true);
    try {
      const token = await getToken();
      const url = forceRefresh
        ? `${apiBase}/arion/sites/${activeSiteId}/intelligence/refresh`
        : `${apiBase}/arion/sites/${activeSiteId}/intelligence`;
      const res = await globalThis.fetch(url, {
        method: forceRefresh ? "POST" : "GET",
        headers: { Authorization: `Bearer ${token.accessToken}`, "x-tenant-key": activeTenantId },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      const normalized = normalizeAggregateResponse(body?.data ?? body);
      setData(normalized);
    } catch (e: any) {
      setError(e?.message || "Failed to load Intelligence reports.");
      console.error("[ArionIntelligencePage]", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSiteId, activeTenantId]);

  const reports = data?.reports;
  const tier = data?.tier || null;

  const intelligenceScoreDisplay = useMemo(() => {
    if (!data) return "—";
    if (data.intelligenceScore == null) return "—";
    return String(data.intelligenceScore);
  }, [data]);

  return (
    <div className="p-4 max-w-7xl mx-auto">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">IA Insights — Intelligence</h1>
          <p className="text-sm text-slate-500 mt-0.5">Six single-source ARION reports. Each runs on one ARION-owned data feed — no cross-platform blends. Cross-channel intelligence lives in ARGUS.</p>
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

      <div className="mb-4 rounded-md border-l-4 border-blue-400 bg-blue-50 px-4 py-3 text-sm text-blue-900 flex items-center gap-4">
        <div className="flex-1">
          <strong>ARION Intelligence Score: {intelligenceScoreDisplay}</strong>
          {data?.intelligenceTier && (
            <span className="ml-2 inline-flex items-center text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-blue-100 text-blue-800">Tier {data.intelligenceTier}</span>
          )}
          <span className="ml-3 text-xs text-blue-800">{data ? `${data.activeReports} of ${data.totalReports} reports active` : "Loading..."}</span>
          {tier && <span className="ml-3 text-xs text-blue-800">SEO tier: {TIER_LABEL[tier] || tier}</span>}
        </div>
        <div className="text-xs text-blue-800">
          {data?.source === "cache" ? "Cached (12h TTL)" : data?.source === "fresh" ? "Just calculated" : ""}
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-md border-l-4 border-red-400 bg-red-50 px-4 py-3 text-sm text-red-900">
          Failed to load Intelligence reports: {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {ARION_INTEL_META.map((m) => {
          const r: IntelligenceReport = reports?.[m.key] ?? {
            score: null, state: loading ? "insufficient_data" : "insufficient_data",
            headline: loading ? "Loading..." : "Not yet calculated",
            scoreInputs: [], observations: [], actions: [],
            dataGap: loading ? undefined : "Awaiting first calculation.",
          };
          const Icon = ICON_BY_KEY[m.key];
          const color = stateColor(r.state);
          const bg = stateBg(r.state);
          const isLocked = r.state === "locked";
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
                    <span className={`text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded ${
                      m.minTier === "authority" ? "bg-violet-100 text-violet-700"
                      : m.minTier === "growth" ? "bg-blue-100 text-blue-700"
                      : m.minTier === "essentials" ? "bg-emerald-100 text-emerald-700"
                      : "bg-slate-200 text-slate-700"
                    }`}>{m.minTier}</span>
                  </div>
                  <p className="text-[10px] text-slate-500 mt-0.5 line-clamp-2">{m.question}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5 italic">Source: {m.source}</p>
                </div>
              </div>

              <div className="flex items-center justify-between mt-3 mb-2">
                <div className="flex items-center gap-2">
                  {!isLocked && r.score != null ? (
                    <span className="text-3xl font-bold tabular-nums" style={{ color }}>{r.score}</span>
                  ) : (
                    <span className="text-2xl font-bold text-slate-300">—</span>
                  )}
                  <span className="flex items-center gap-1 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded" style={{ background: `${color}1A`, color }}>
                    {r.state === "ok" && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />}
                    {r.state === "partial" && <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />}
                    {(r.state === "insufficient_data" || r.state === "locked") && <Lock className="h-3 w-3" />}
                    {isLocked ? `Requires ${m.minTier}` : stateLabel(r.state)}
                  </span>
                </div>
                <ArrowRight className="h-4 w-4 text-slate-400" />
              </div>

              <p className="text-xs text-slate-700 leading-snug line-clamp-2">
                {isLocked
                  ? `Upgrade to the ${TIER_LABEL[m.minTier] || m.minTier} SEO tier to unlock this report.`
                  : (r.headline || "Awaiting first calculation.")}
              </p>
              {isLocked ? (
                <Link to="/pricing?platform=arion" onClick={(e) => e.stopPropagation()} className="mt-2 inline-flex items-center gap-1 text-[10px] font-semibold text-violet-700 hover:underline">
                  Upgrade to unlock <ArrowRight className="h-3 w-3" />
                </Link>
              ) : (
                r.dataGap && <div className="mt-2 text-[10px] text-amber-800 italic">→ {r.dataGap}</div>
              )}
            </button>
          );
        })}
      </div>

      {open && (() => {
        const m = ARION_INTEL_META.find((x) => x.key === open);
        if (!m) return null;
        const r: IntelligenceReport = reports?.[open] ?? {
          score: null, state: "insufficient_data",
          headline: "Not yet calculated",
          scoreInputs: [], observations: [], actions: [],
          dataGap: "Awaiting first calculation.",
        };
        return <IntelligenceModal meta={m} report={r} onClose={() => setOpen(null)} />;
      })()}
    </div>
  );
}

function IntelligenceModal({ meta, report, onClose }: { meta: IntelReportMeta; report: IntelligenceReport; onClose: () => void }) {
  const Icon = ICON_BY_KEY[meta.key];
  const isLocked = report.state === "locked";
  const color = stateColor(report.state);
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
              <p className="text-[10px] text-slate-400 mt-1 italic">Single source: {meta.source}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="text-right">
              {!isLocked && report.score != null ? (
                <div className="text-2xl font-bold tabular-nums" style={{ color }}>{report.score}</div>
              ) : (
                <div className="text-xl text-slate-300">—</div>
              )}
              <div className="text-[9px] uppercase text-slate-400">{isLocked ? `Requires ${meta.minTier}` : stateLabel(report.state)}</div>
            </div>
            <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded text-slate-500" aria-label="Close"><X className="h-5 w-5" /></button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {isLocked && (
            <div className="rounded-md border-l-4 border-violet-400 bg-violet-50 px-4 py-3">
              <div className="text-xs font-semibold uppercase text-violet-800 tracking-wide mb-1">Tier locked</div>
              <p className="text-sm text-slate-800 mb-2">This report unlocks at the <strong>{TIER_LABEL[meta.minTier] || meta.minTier}</strong> SEO tier.</p>
              <Link to="/pricing?platform=arion" className="inline-flex items-center gap-1 text-xs font-semibold text-violet-700 hover:underline">
                Upgrade to unlock <ArrowRight className="h-3 w-3" />
              </Link>
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
          {!isLocked && scoreInputs.length > 0 && (
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
            Generated by <span className="font-semibold" style={{ color: "#A3E635" }}>ARGUS</span> · single-source: {meta.source}
          </div>
          <button onClick={onClose} className="px-4 py-1.5 text-xs bg-slate-900 text-white rounded hover:bg-slate-800">Close</button>
        </div>
      </div>
    </div>
  );
}

export default ArionIAInsightsIntelligencePage;
