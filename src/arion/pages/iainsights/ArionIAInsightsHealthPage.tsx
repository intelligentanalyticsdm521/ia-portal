// ArionIAInsightsHealthPage — IA Insights Health (v6.12).
//
// Per the May-2026 handoff doc as clarified by the user:
//   Health = the 4-gauge + 2 bar-chart header, full-width, by itself.
//   Drill into the Trend or Intelligence gauge to reach the report list.
//
// Score data is fetched the same way the Trends page fetches it — running
// the 8 engines client-side. We share that work via the engines module.
import { useEffect, useMemo, useState } from "react";
import { useArionContext } from "../../useArionContext";
import { useAnalyticsData } from "../../analytics/useAnalyticsData";
import { useAccessToken } from "../../../auth/useAccessToken";
import { useAppState } from "../../../app/AppState";
import { runAllReports, type AllReportScores } from "../../analytics/trendEngines";
import { IAInsightsHeader } from "../../../components/iainsights/IAInsightsHeader";
import { bandFromScore, type IAInsightsHeaderData } from "../../../components/iainsights/types";

// Weighted Platform Score: 60% Trend + 40% Intelligence when both unlocked;
// 100% Trend when Intelligence is locked (Standard tier or insufficient data).
function platformScore(trendScore: number, intelligenceScore: number | null, intelligenceLocked: boolean): number {
  if (intelligenceLocked || intelligenceScore == null) return trendScore;
  return Math.round(trendScore * 0.6 + intelligenceScore * 0.4);
}

export function ArionIAInsightsHealthPage() {
  const { activeSiteId, selectedSite, arionApi } = useArionContext();
  const tier = ((selectedSite?.arionTier || "standard") as "standard" | "pro" | "business");
  const intelligenceLocked = tier === "standard";
  const { data, loading } = useAnalyticsData(activeSiteId, 90);
  const { activeTenantId } = useAppState();
  const { getToken } = useAccessToken();

  // Additional data sources (mirrors the Trends page)
  const [searchData, setSearchData] = useState<any>(null);
  const [gbpData, setGbpData] = useState<any>(null);
  const [gbpReviews, setGbpReviews] = useState<any>(null);
  const [gbpPosts, setGbpPosts] = useState<any>(null);
  const [gbpQanda, setGbpQanda] = useState<any>(null);
  const [bingData, setBingData] = useState<any>(null);
  const [pluginData, setPluginData] = useState<any>(null);
  const [serviceArea, setServiceArea] = useState<any>(undefined);
  const [benchmarks, setBenchmarks] = useState<Record<string, number>>({});
  const [priorScores, setPriorScores] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!activeSiteId) return;
    let cancelled = false;
    (arionApi.getSearchPerformance?.('google', activeSiteId, { period: 90, groupBy: 'all' }) as any)
      ?.then((r: any) => { if (!cancelled) setSearchData(r); }).catch(() => {});
    Promise.all([
      (arionApi as any).getGbpBusiness?.(activeSiteId).catch(() => null),
      (arionApi as any).getGbpReviewsLive?.(activeSiteId).catch(() => null),
      (arionApi as any).getGbpPostsLive?.(activeSiteId).catch(() => null),
      (arionApi as any).getGbpQanda?.(activeSiteId).catch(() => null),
    ]).then(([b, r, p, q]) => {
      if (cancelled) return;
      setGbpData(b); setGbpReviews(r); setGbpPosts(p); setGbpQanda(q);
    });
    (arionApi as any).getBingPerformance?.(activeSiteId, 90)?.then((r: any) => { if (!cancelled) setBingData(r); }).catch(() => {});
    Promise.all([
      (arionApi as any).getPluginWordfenceFull?.(activeSiteId).catch(() => null),
      (arionApi as any).getPluginContentAgeDist?.(activeSiteId).catch(() => null),
      (arionApi as any).getPluginContentWordCountDist?.(activeSiteId).catch(() => null),
      (arionApi as any).getPagespeedHistory?.(activeSiteId).catch(() => null),
    ]).then(([wf, age, wc, psi]) => {
      if (cancelled) return;
      setPluginData({ wfFull: (wf as any)?.data || null, age: (age as any)?.data || null, wordCount: (wc as any)?.data || null, psi: (psi as any)?.data?.snapshots || [] });
    });
    return () => { cancelled = true; };
  }, [activeSiteId, arionApi]);

  // Service area + benchmarks
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
          const category = body?.service_category || "home_services";
          const br = await globalThis.fetch(`${baseUrl}/arion/ia-insights/benchmarks?category=${encodeURIComponent(category)}`, {
            headers: { Authorization: `Bearer ${token.accessToken}`, "x-tenant-key": activeTenantId },
          });
          if (br.ok && !cancelled) {
            const bbody = await br.json();
            const map: Record<string, number> = {};
            for (const row of bbody?.data || []) if (row.metric_key && row.benchmark_value != null) map[row.metric_key] = Number(row.benchmark_value);
            setBenchmarks(map);
          }
        }
      } catch { /* swallow */ }
    })();
    return () => { cancelled = true; };
  }, [activeSiteId, activeTenantId, getToken]);

  // Prior scores for ghost-bar deltas
  useEffect(() => {
    if (!activeSiteId || !activeTenantId) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await getToken();
        const baseUrl = import.meta.env.VITE_ARION_API_BASE_URL as string;
        const r = await globalThis.fetch(`${baseUrl}/arion/ia-insights/prior-scores?siteId=${encodeURIComponent(activeSiteId)}&beforeDate=${new Date().toISOString().slice(0,10)}`, {
          headers: { Authorization: `Bearer ${token.accessToken}`, "x-tenant-key": activeTenantId },
        });
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
  }, [activeSiteId, activeTenantId, getToken]);

  const reports: AllReportScores = useMemo(() => runAllReports({
    domain: selectedSite?.primaryDomain || undefined,
    d: data || {}, searchData, gbpData, gbpReviews, gbpPosts, gbpQanda, bingData, pluginData, serviceArea, benchmarks,
  }), [data, searchData, gbpData, gbpReviews, gbpPosts, gbpQanda, bingData, pluginData, serviceArea, benchmarks, selectedSite?.primaryDomain]);

  const trendScore = reports.presence.score;
  const intelligenceScoreVal = intelligenceLocked ? null : 0; // TODO when Intelligence engines wired

  const headerData: IAInsightsHeaderData = useMemo(() => ({
    product: "arion",
    overall: {
      score: trendScore, previousScore: priorScores.presence, band: bandFromScore(trendScore),
      state: "ok", message: "Composite from ARGUS across active products.",
      drillTo: "/app/services/argus_ia_insights",
    },
    platform: {
      score: platformScore(trendScore, intelligenceScoreVal, intelligenceLocked),
      previousScore: priorScores.presence, band: bandFromScore(platformScore(trendScore, intelligenceScoreVal, intelligenceLocked)),
      state: "ok",
      message: intelligenceLocked ? "Equals Trend Score on Standard tier." : "60% Trend + 40% Intelligence weighted.",
    },
    trend: { score: trendScore, previousScore: priorScores.presence, band: bandFromScore(trendScore), state: "ok", drillTo: "/app/services/arion_ia_insights_trends" },
    intelligence: {
      score: intelligenceScoreVal ?? 0, band: "unknown",
      state: intelligenceLocked ? "locked" : "insufficient_data",
      message: intelligenceLocked ? "Upgrade to Pro to unlock modelled insights." : "Collecting data — Intelligence reports populate ~90 days post-launch.",
      drillTo: "/app/services/arion_ia_insights_intelligence",
    },
    trendBreakdown: [
      { key: "visibility", label: "Visibility & Reach", score: reports.visibility.score, previousScore: priorScores.visibility, band: bandFromScore(reports.visibility.score), reportRoute: "/app/services/arion_ia_insights_trends" },
      { key: "audience", label: "Audience Intelligence", score: reports.audience.score, previousScore: priorScores.audience, band: bandFromScore(reports.audience.score), reportRoute: "/app/services/arion_ia_insights_trends" },
      { key: "conversion", label: "Conversion Intelligence", score: reports.conversion.score, previousScore: priorScores.conversion, band: bandFromScore(reports.conversion.score), reportRoute: "/app/services/arion_ia_insights_trends" },
      { key: "search", label: "Search Intelligence", score: reports.search.score, previousScore: priorScores.search, band: bandFromScore(reports.search.score), reportRoute: "/app/services/arion_ia_insights_trends" },
      { key: "content", label: "Content Intelligence", score: reports.content.score, previousScore: priorScores.content, band: bandFromScore(reports.content.score), reportRoute: "/app/services/arion_ia_insights_trends" },
      { key: "local", label: "Local Presence", score: reports.local.score, previousScore: priorScores.local, band: bandFromScore(reports.local.score), reportRoute: "/app/services/arion_ia_insights_trends" },
      { key: "technical", label: "Technical Health", score: reports.technical.score, previousScore: priorScores.technical, band: bandFromScore(reports.technical.score), reportRoute: "/app/services/arion_ia_insights_trends" },
    ],
    intelligenceBreakdown: ["acquisition", "lead_source", "content_roi", "rep_revenue", "visibility_traj", "competitive"].map((k) => ({
      key: k,
      label: ({ acquisition: "Acquisition Efficiency", lead_source: "Lead Source Quality", content_roi: "Content ROI", rep_revenue: "Reputation → Revenue", visibility_traj: "Visibility Trajectory", competitive: "Competitive Gap" } as any)[k],
      score: 0, band: "unknown" as const, locked: true,
      lockReason: intelligenceLocked ? "Pro tier required" : "Collecting data — 90 days minimum",
      reportRoute: "/app/services/arion_ia_insights_intelligence",
    })),
    banners: data?.connected === false
      ? [{ severity: "warn", message: "Connect Google Analytics 4 in Settings → Connected Accounts to populate Trend Score and observations.", action: { label: "Open Settings", route: "/app/settings/connections" } }]
      : [],
    meta: { generatedAt: new Date().toISOString(), periodStart: data?.dateRange?.start, periodEnd: data?.dateRange?.end, tier },
  }), [reports, data, tier, intelligenceLocked, intelligenceScoreVal, trendScore, priorScores]);

  if (loading && !data) return <div className="p-4 text-sm text-slate-500">Loading IA Insights…</div>;

  return (
    <div className="p-4 max-w-7xl mx-auto">
      <div className="mb-3">
        <h1 className="text-2xl font-bold text-slate-900">ARION IA Insights — Health</h1>
        <p className="text-sm text-slate-500 mt-0.5">Composite snapshot of your ARION presence. Drill into Trends or Intelligence for full per-report observations and actions.</p>
      </div>
      <IAInsightsHeader data={headerData} />
    </div>
  );
}

export default ArionIAInsightsHealthPage;
