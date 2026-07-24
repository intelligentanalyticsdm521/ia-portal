// ArionIAInsightsTrendsPage — v11.0 SIX-REPORT model (Brandon, 2026-07-24).
//
// Three CHANNEL reports (where you show up) + three QUALITY reports (how
// well it works). Six is a ceiling, not a target — each must earn its place.
//
// Changed from the previous 8:
//   · visibility + search   → search_visibility
//   · audience + conversion → audience_conversion
//   · local                 → local_presence (absorbs GBP signals that were
//                             previously split across Visibility)
//   · social_presence       → NEW; social is a peer discovery channel, not a
//                             sub-metric of search
//   · presence              → REMOVED as a report. It was the composite of
//                             the others and was ALSO being persisted as a
//                             report row, so it got averaged in alongside its
//                             own components — a double count.
//
// Unmeasured reports (source not connected, or not in the plan) are excluded
// from the composite and the remaining weights renormalise. They are never
// scored 0. See computeTrendComposite().
import { useEffect, useMemo, useState } from "react";
import { useArionContext } from "../../useArionContext";
import { useAnalyticsData } from "../../analytics/useAnalyticsData";
import { useAccessToken } from "../../../auth/useAccessToken";
import { useAppState } from "../../../app/AppState";
import { runAllReports, computeTrendComposite, ARION_TREND_REPORTS, TREND_WEIGHTS, type AllReportScores, type ReportAnalysis } from "../../analytics/trendEngines";
// IAInsightsHeader moved to the dedicated Health page (arion_ia_insights_health) in v7.0.
// IAInsightsEmptyState moved to GetStartedCard on the Command Dashboard (v7.0).
import { bandFromScore } from "../../../components/iainsights/types";
import { Eye, Target, Search as SearchIcon, FileText, MapPin, ShieldCheck, Share2 } from "lucide-react";
import { MonthlyScoreBars, MIN_HISTORY_PERIODS } from "../../../components/iainsights/MonthlyScoreBars";
import { ArionReportDetailModal } from "../../../components/iainsights/ArionReportDetailModal";

const REPORT_META: Array<{
  key: keyof AllReportScores;
  label: string;
  question: string;
  icon: typeof Eye;
  weight: number;
  route?: string;
}> = [
  // ── Channel reports — where you show up ──
  { key: "search_visibility",   label: "Search Visibility",       question: "Am I found in search, and winning the searches that matter?",   icon: SearchIcon,  weight: TREND_WEIGHTS.search_visibility },
  { key: "local_presence",      label: "Local Presence",          question: "Am I found and trusted locally?",                               icon: MapPin,      weight: TREND_WEIGHTS.local_presence },
  { key: "social_presence",     label: "Social Presence",         question: "Is my brand growing socially?",                                 icon: Share2,      weight: TREND_WEIGHTS.social_presence },
  // ── Quality reports — how well it works ──
  { key: "audience_conversion", label: "Audience & Conversion",   question: "Do the right people arrive, and do they act?",                  icon: Target,      weight: TREND_WEIGHTS.audience_conversion },
  { key: "content",             label: "Content",                 question: "Is my content earning its place?",                              icon: FileText,    weight: TREND_WEIGHTS.content },
  { key: "technical",           label: "Technical & Site Health", question: "Is the foundation solid, and what's it costing me?",             icon: ShieldCheck, weight: TREND_WEIGHTS.technical },
];

export function ArionIAInsightsTrendsPage() {
  const { activeSiteId, selectedSite, arionApi } = useArionContext();
  const tier = ((selectedSite?.arionTier || "standard") as "standard" | "pro" | "business");
  const { data, loading } = useAnalyticsData(activeSiteId, 90);
  const { activeTenantId } = useAppState();
  const { getToken } = useAccessToken();
  const [openReportKey, setOpenReportKey] = useState<string | null>(null);
  const [priorScores, setPriorScores] = useState<Record<string, number>>({});
  const [searchData, setSearchData] = useState<any>(null);
  const [gbpData, setGbpData] = useState<any>(null);
  const [gbpReviews, setGbpReviews] = useState<any>(null);
  const [gbpPosts, setGbpPosts] = useState<any>(null);
  const [gbpQanda, setGbpQanda] = useState<any>(null);
  const [bingData, setBingData] = useState<any>(null);
  const [pluginData, setPluginData] = useState<any>(null);
  const [seoData, setSeoData] = useState<any>(null);
  const [benchmarks, setBenchmarks] = useState<Record<string, number>>({});
  const [scoreHistories, setScoreHistories] = useState<Record<string, Array<{ period_end: string; score: number }>>>({});
  const [serviceCategory, setServiceCategory] = useState<string>("home_services");

  // Pull the additional data sources the engines accept.
  useEffect(() => {
    if (!activeSiteId) return;
    let cancelled = false;
    arionApi.getSearchPerformance('google', activeSiteId, { period: 90, groupBy: 'all' })
      .then((r: any) => { if (!cancelled) setSearchData(r); })
      .catch(() => { if (!cancelled) setSearchData(null); });
    Promise.all([
      (arionApi as any).getGbpBusiness?.(activeSiteId).catch(() => null),
      (arionApi as any).getGbpReviewsLive?.(activeSiteId).catch(() => null),
      (arionApi as any).getGbpPostsLive?.(activeSiteId).catch(() => null),
      (arionApi as any).getGbpQanda?.(activeSiteId).catch(() => null),
    ]).then(([b, r, p, q]) => {
      if (cancelled) return;
      setGbpData(b); setGbpReviews(r); setGbpPosts(p); setGbpQanda(q);
    });
    (arionApi as any).getBingPerformance?.(activeSiteId, 90)
      .then((r: any) => { if (!cancelled) setBingData(r); })
      .catch(() => { if (!cancelled) setBingData(null); });
    return () => { cancelled = true; };
  }, [activeSiteId, arionApi]);

  // Plugin + SE Ranking — best-effort.
  useEffect(() => {
    if (!activeSiteId) return;
    let cancelled = false;
    Promise.all([
      (arionApi as any).getPluginWordfenceFull?.(activeSiteId).catch(() => null),
      (arionApi as any).getPluginContentAgeDist?.(activeSiteId).catch(() => null),
      (arionApi as any).getPluginContentWordCountDist?.(activeSiteId).catch(() => null),
      (arionApi as any).getPagespeedHistory?.(activeSiteId).catch(() => null),
    ]).then(([wf, age, wc, psi]) => {
      if (cancelled) return;
      setPluginData({
        wfFull: (wf as any)?.data || null,
        age: (age as any)?.data || null,
        wordCount: (wc as any)?.data || null,
        psi: (psi as any)?.data?.snapshots || [],
      });
    });
    return () => { cancelled = true; };
  }, [activeSiteId, arionApi]);
  const [serviceArea, setServiceArea] = useState<{ city?: string; state?: string; regions?: string[]; zips?: string[] } | undefined>(undefined);

  // Fetch industry benchmarks once we know the site's service category.
  useEffect(() => {
    if (!activeTenantId || !serviceCategory) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await getToken();
        const baseUrl = import.meta.env.VITE_ARION_API_BASE_URL as string;
        const r = await globalThis.fetch(`${baseUrl}/arion/ia-insights/benchmarks?category=${encodeURIComponent(serviceCategory)}`, {
          headers: { Authorization: `Bearer ${token.accessToken}`, "x-tenant-key": activeTenantId },
        });
        if (r.ok && !cancelled) {
          const body = await r.json();
          const map: Record<string, number> = {};
          for (const row of body?.data || []) {
            if (row.metric_key && row.benchmark_value != null) {
              map[row.metric_key] = Number(row.benchmark_value);
            }
          }
          setBenchmarks(map);
        }
      } catch { /* swallow */ }
    })();
    return () => { cancelled = true; };
  }, [activeTenantId, getToken, serviceCategory]);

  // Fetch service area once per site.
  useEffect(() => {
    if (!activeSiteId || !activeTenantId) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await getToken();
        const baseUrl = import.meta.env.VITE_ARION_API_BASE_URL as string;
        const r = await globalThis.fetch(`${baseUrl}/arion/ia-insights/service-area?siteId=${encodeURIComponent(activeSiteId)}`, {
          headers: { Authorization: `Bearer ${token.accessToken}`, "x-tenant-key": activeTenantId },
        });
        if (r.ok && !cancelled) {
          const body = await r.json();
          setServiceArea(body?.data || undefined);
          if (body?.service_category) setServiceCategory(body.service_category);
        }
      } catch { /* swallow */ }
    })();
    return () => { cancelled = true; };
  }, [activeSiteId, activeTenantId, getToken]);

  // Run all 8 engines. Returns deterministic empty-state output when data isn't loaded yet.
  const reports: AllReportScores = useMemo(() => {
    return runAllReports({
      domain: selectedSite?.primaryDomain || undefined,
      d: data || {},
      searchData,
      gbpData,
      gbpReviews,
      gbpPosts,
      gbpQanda,
      bingData,
      seoData,
      pluginData,
      serviceArea,
      benchmarks,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, searchData, gbpData, gbpReviews, gbpPosts, gbpQanda, bingData, seoData, pluginData, serviceArea, benchmarks, selectedSite?.primaryDomain]);

  // Fetch 12-period score history per report once we have a site context.
  // Used by the inline sparklines on each report card.
  useEffect(() => {
    if (!activeSiteId || !activeTenantId) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await getToken();
        const baseUrl = import.meta.env.VITE_ARION_API_BASE_URL as string;
        const headers = { Authorization: `Bearer ${token.accessToken}`, "x-tenant-key": activeTenantId };
        const keys = [...ARION_TREND_REPORTS];
        const results = await Promise.all(keys.map((k) =>
          globalThis.fetch(`${baseUrl}/arion/ia-insights/score-history?siteId=${encodeURIComponent(activeSiteId)}&reportKey=${k}&limit=12`, { headers })
            .then(async (r) => r.ok ? { k, rows: ((await r.json()).data || []) as Array<{ period_end: string; score: number }> } : { k, rows: [] })
            .catch(() => ({ k, rows: [] }))
        ));
        if (cancelled) return;
        const map: Record<string, Array<{ period_end: string; score: number }>> = {};
        for (const { k, rows } of results) map[k] = rows;
        setScoreHistories(map);
      } catch { /* swallow */ }
    })();
    return () => { cancelled = true; };
  }, [activeSiteId, activeTenantId, getToken]);

  // Persist current scores + fetch prior period for ghost-bar comparison.
  useEffect(() => {
    if (!activeSiteId || !activeTenantId || loading || !data) return;
    const periodEnd = (data?.dateRange?.end || new Date().toISOString().slice(0, 10)).slice(0, 10);
    const periodStart = (data?.dateRange?.start || new Date(Date.now() - 90 * 86400_000).toISOString().slice(0, 10)).slice(0, 10);
    const scoresMap: Record<string, number> = {};
    for (const k of ARION_TREND_REPORTS) {
      // Unmeasured reports are NOT persisted. Writing a 0 for an unconnected
      // source is exactly the defect that made scores reflect integration
      // completeness rather than business performance.
      if (reports[k]?.unmeasured) continue;
      scoresMap[k] = reports[k].score;
    }
    let cancelled = false;
    (async () => {
      try {
        const token = await getToken();
        const baseUrl = import.meta.env.VITE_ARION_API_BASE_URL as string;
        const headers: HeadersInit = {
          Authorization: `Bearer ${token.accessToken}`,
          "x-tenant-key": activeTenantId,
          "Content-Type": "application/json",
        };
        // Persist current period (fire-and-forget)
        await globalThis.fetch(`${baseUrl}/arion/ia-insights/scores`, {
          method: "POST", headers,
          body: JSON.stringify({ siteId: activeSiteId, periodEnd, periodStart, scores: scoresMap }),
        }).catch(() => {});
        // Look up prior period scores
        const r = await globalThis.fetch(`${baseUrl}/arion/ia-insights/prior-scores?siteId=${encodeURIComponent(activeSiteId)}&beforeDate=${encodeURIComponent(periodEnd)}`, { headers });
        if (r.ok && !cancelled) {
          const body = await r.json();
          const prior: Record<string, number> = {};
          for (const [k, v] of Object.entries(body?.data || {})) {
            if (v && typeof (v as any).score === "number") prior[k] = (v as any).score;
          }
          setPriorScores(prior);
        }
      } catch { /* swallow */ }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSiteId, activeTenantId, loading, data]);

  // v7.0 — headerData removed; the dedicated Health page (arion_ia_insights_health) owns the gauges/bars.

  if (loading && !data) {
    return <div className="p-4 text-sm text-slate-500">Loading IA Insights…</div>;
  }

  return (
    <div className="p-4 max-w-7xl mx-auto">
      <div className="mb-3">
        <h1 className="text-2xl font-bold text-slate-900">IA Insights — Trends</h1>
        <p className="text-sm text-slate-500 mt-0.5">Six monthly reports — three channels (search, local, social) and three quality measures (audience &amp; conversion, content, technical).</p>
      </div>

      {/* IAInsightsHeader + Get Started checklist removed in v7.0 — see
          arion_ia_insights_health for the gauges/bars, and the Command
          Dashboard for the cross-product onboarding card. */}

      {/* v7.3 — 8 trend reports in a 2x4 grid (matches legacy IA Insights
          design). Each card shows MoM score bars + "View report" button
          that opens the deep-dive modal. */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        {REPORT_META.map((m) => {
          const report = reports[m.key];
          return (
            <ReportCard
              key={m.key}
              meta={m}
              report={report}
              history={scoreHistories[m.key] || []}
              onOpen={() => setOpenReportKey(m.key as string)}
            />
          );
        })}
      </div>

      {/* v7.5 — Rich legacy report content + ARGUS Intelligence box restored. */}
      {openReportKey && (
        <ArionReportDetailModal
          reportKey={openReportKey}
          history={scoreHistories[openReportKey as string] || []}
          data={data}
          searchData={searchData}
          gbpData={gbpData}
          gbpReviews={gbpReviews}
          gbpPosts={gbpPosts}
          gbpQanda={gbpQanda}
          bingData={bingData}
          seoData={seoData}
          pluginData={pluginData}
          periodLabel={data?.dateRange?.start && data?.dateRange?.end
            ? `${formatPeriod(data.dateRange.start)} – ${formatPeriod(data.dateRange.end)}`
            : undefined}
          onClose={() => setOpenReportKey(null)}
        />
      )}
    </div>
  );
}

function formatPeriod(d: string): string {
  try {
    return new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  } catch { return d; }
}

function ReportCard({
  meta,
  report,
  history,
  onOpen,
}: {
  meta: { key: string; label: string; question: string; icon: typeof Eye; weight: number };
  report: ReportAnalysis;
  history: Array<{ period_end: string; score: number }>;
  onOpen: () => void;
}) {
  const band = bandFromScore(report.score);
  const bandColor = ({ green: "#16A34A", amber: "#EAB308", red: "#DC2626", unknown: "#94A3B8" } as any)[band];
  const periodEnd = history[history.length - 1]?.period_end;
  const periodStart = history[0]?.period_end;
  const periodLabel = (periodStart && periodEnd)
    ? `${formatPeriod(periodStart)} – ${formatPeriod(periodEnd)}`
    : undefined;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 flex flex-col">
      {/* Header — title + subtitle */}
      <div className="mb-2">
        <h3 className="font-semibold text-sm text-slate-900 leading-tight">{meta.label}</h3>
        <p className="text-[11px] text-slate-500 leading-snug mt-0.5">{meta.question}</p>
      </div>

      {/* Status pill — "<period> · Ready" or "Collecting data" */}
      <div className="flex items-center gap-1.5 mb-3">
        <span className="h-2 w-2 rounded-full" style={{ background: history.length >= MIN_HISTORY_PERIODS ? bandColor : "#CBD5E1" }} />
        <span className="text-[10px] text-slate-600">
          {history.length >= MIN_HISTORY_PERIODS
            ? `Ready · score ${report.score}`
            : `Collecting · ${history.length}/${MIN_HISTORY_PERIODS} periods`}
        </span>
      </div>

      {/* MoM score bars */}
      <div className="flex-1 mb-2">
        <MonthlyScoreBars data={history} width={280} height={80} />
      </div>

      {periodLabel && (
        <div className="text-[10px] text-slate-400 mb-3">{periodLabel}</div>
      )}

      {/* View report button — opens modal */}
      <button
        onClick={onOpen}
        className="w-full py-2 px-3 rounded bg-slate-900 text-white text-xs font-medium hover:bg-slate-800 transition-colors"
      >
        View report
      </button>
    </div>
  );
}

export default ArionIAInsightsTrendsPage;
