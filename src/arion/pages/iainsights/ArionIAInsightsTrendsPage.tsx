// ArionIAInsightsTrendsPage — v5.x rebuild of ARION Trends.
//
// Replaces the shared insight template with 8 dedicated analytical
// engines per IA_Intelligence_Insights_Architecture_Handoff_v1_0.docx.
// Each engine reads its own data and emits a scored ReportAnalysis.
// The page renders the 4-gauge + 2 bar-chart header at top, then the
// 8 reports as cards below.
import { useEffect, useMemo, useState } from "react";
import { useArionContext } from "../../useArionContext";
import { useAnalyticsData } from "../../analytics/useAnalyticsData";
import { useAccessToken } from "../../../auth/useAccessToken";
import { useAppState } from "../../../app/AppState";
import { runAllReports, type AllReportScores, type ReportAnalysis } from "../../analytics/trendEngines";
import { IAInsightsHeader } from "../../../components/iainsights/IAInsightsHeader";
import { bandFromScore, type IAInsightsHeaderData } from "../../../components/iainsights/types";
import { Eye, Users, Target, Search as SearchIcon, FileText, MapPin, ShieldCheck, Award, ChevronDown, ChevronUp, Lock } from "lucide-react";
import { Sparkline } from "../../../components/iainsights/Sparkline";

const REPORT_META: Array<{
  key: keyof AllReportScores;
  label: string;
  question: string;
  icon: typeof Eye;
  weight: number;
  route?: string;
}> = [
  { key: "visibility",  label: "Visibility & Reach",          question: "Are people finding me?",                                                  icon: Eye,         weight: 0.20 },
  { key: "audience",    label: "Audience Intelligence",       question: "Who is actually visiting and are they the right people?",                icon: Users,       weight: 0.10 },
  { key: "conversion",  label: "Conversion Intelligence",     question: "Where does my funnel break?",                                             icon: Target,      weight: 0.20 },
  { key: "search",      label: "Search Intelligence",         question: "Am I winning the searches that matter?",                                  icon: SearchIcon,  weight: 0.15 },
  { key: "content",     label: "Content Intelligence",        question: "Is my content earning its place?",                                        icon: FileText,    weight: 0.12 },
  { key: "local",       label: "Local Presence & Reputation", question: "Do I look trustworthy to someone who finds me locally?",                 icon: MapPin,      weight: 0.15 },
  { key: "technical",   label: "Technical & Site Health",     question: "Is the foundation solid and what is the business cost of issues?",        icon: ShieldCheck, weight: 0.08 },
  { key: "presence",    label: "Business Presence Score",     question: "What does my complete online presence look like as a whole?",            icon: Award,       weight: 0 },
];

export function ArionIAInsightsTrendsPage() {
  const { activeSiteId, selectedSite, arionApi } = useArionContext();
  const tier = ((selectedSite?.arionTier || "standard") as "standard" | "pro" | "business");
  const { data, loading } = useAnalyticsData(activeSiteId, 90);
  const { activeTenantId } = useAppState();
  const { getToken } = useAccessToken();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
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
        const keys = ["visibility", "audience", "conversion", "search", "content", "local", "technical", "presence"];
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
    for (const k of ["visibility", "audience", "conversion", "search", "content", "local", "technical", "presence"] as const) {
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

  const headerData: IAInsightsHeaderData = useMemo(() => {
    const trendScore = reports.presence.score;
    const intelligenceLocked = (tier || "standard") === "standard";
    return {
      product: "arion",
      overall: {
        score: trendScore,
        previousScore: priorScores.presence,
        band: bandFromScore(trendScore),
        state: "ok",
        message: "Composite from ARGUS across active products.",
        drillTo: "/app/services/argus_ia_insights",
      },
      platform: {
        score: trendScore,
        previousScore: priorScores.presence,
        band: bandFromScore(trendScore),
        state: "ok",
        message: intelligenceLocked ? "Equals Trend Score — Intelligence is locked on Standard tier." : "Weighted blend of Trend + Intelligence.",
      },
      trend: {
        score: trendScore,
        previousScore: priorScores.presence,
        band: bandFromScore(trendScore),
        state: "ok",
      },
      intelligence: {
        score: 0,
        band: "unknown",
        state: intelligenceLocked ? "locked" : "insufficient_data",
        message: intelligenceLocked ? "Upgrade to Pro to unlock modelled insights." : "Collecting data — Intelligence reports populate ~90 days post-launch.",
      },
      trendBreakdown: REPORT_META.filter((m) => m.key !== "presence").map((m) => ({
        key: m.key,
        label: m.label,
        score: reports[m.key].score,
        previousScore: priorScores[m.key],
        band: bandFromScore(reports[m.key].score),
        reportRoute: undefined,
      })),
      intelligenceBreakdown: ["acquisition", "lead_source", "content_roi", "rep_revenue", "visibility_traj", "competitive"].map((k) => ({
        key: k,
        label: ({
          acquisition: "Acquisition Efficiency",
          lead_source: "Lead Source Quality",
          content_roi: "Content ROI",
          rep_revenue: "Reputation → Revenue",
          visibility_traj: "Visibility Trajectory",
          competitive: "Competitive Presence Gap",
        } as any)[k],
        score: 0,
        band: "unknown" as const,
        locked: true,
        lockReason: intelligenceLocked ? "Pro tier required" : "Collecting data — 90 days minimum",
      })),
      banners: data?.connected === false
        ? [{ severity: "warn", message: "Connect Google Analytics 4 in Settings → Connected Accounts to populate Trend Score and observations.", action: { label: "Open Settings", route: "/app/settings/connections" } }]
        : [],
      meta: {
        generatedAt: new Date().toISOString(),
        periodStart: data?.dateRange?.start,
        periodEnd: data?.dateRange?.end,
        tier: (tier as any) || "standard",
      },
    };
  }, [reports, data, tier]);

  if (loading && !data) {
    return <div className="p-4 text-sm text-slate-500">Loading IA Insights…</div>;
  }

  return (
    <div className="p-4 max-w-7xl mx-auto">
      <div className="mb-3">
        <h1 className="text-2xl font-bold text-slate-900">IA Insights — Trends</h1>
        <p className="text-sm text-slate-500 mt-0.5">8 reports analysing how your online presence is performing across visibility, conversion, search, content, local, technical, and audience signals.</p>
      </div>

      <IAInsightsHeader data={headerData} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {REPORT_META.map((m) => {
          const report = reports[m.key];
          const isExpanded = !!expanded[m.key];
          return (
            <ReportCard
              key={m.key}
              meta={m}
              report={report}
              history={scoreHistories[m.key] || []}
              expanded={isExpanded}
              onToggle={() => setExpanded((curr) => ({ ...curr, [m.key]: !curr[m.key] }))}
            />
          );
        })}
      </div>
    </div>
  );
}

function ReportCard({
  meta,
  report,
  history,
  expanded,
  onToggle,
}: {
  meta: { key: string; label: string; question: string; icon: typeof Eye; weight: number };
  report: ReportAnalysis;
  history: Array<{ period_end: string; score: number }>;
  expanded: boolean;
  onToggle: () => void;
}) {
  const band = bandFromScore(report.score);
  const bandColor = ({ green: "#16A34A", amber: "#EAB308", red: "#DC2626", unknown: "#94A3B8" } as any)[band];
  const Icon = meta.icon;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <button onClick={onToggle} className="w-full text-left">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2 min-w-0 flex-1">
            <div className="flex-shrink-0 h-9 w-9 rounded-full flex items-center justify-center" style={{ background: `${bandColor}1A`, color: bandColor }}>
              <Icon className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-sm text-slate-900">{meta.label}</div>
              <div className="text-[10px] text-slate-500">{meta.question}</div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Sparkline data={history} color={bandColor} width={88} height={28} />
            <div className="font-bold tabular-nums text-lg" style={{ color: bandColor }}>{report.score}</div>
            {expanded ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
          </div>
        </div>
      </button>

      {expanded && (
        <div className="mt-3 space-y-3">
          <div>
            <div className="text-[10px] uppercase font-semibold tracking-wide text-slate-500 mb-1">Observations</div>
            <ul className="space-y-1.5 text-xs text-slate-700">
              {report.observations.filter(Boolean).map((o, i) => (
                <li key={i} className="flex items-start gap-1.5">
                  <span className="text-slate-400 font-bold mt-0.5">·</span>
                  <span>{o}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <div className="text-[10px] uppercase font-semibold tracking-wide text-slate-500 mb-1">Recommended actions</div>
            <ol className="space-y-1 text-xs text-slate-700 list-decimal list-inside">
              {report.actions.map((a, i) => <li key={i}>{a}</li>)}
            </ol>
          </div>
          <div className="border-t border-slate-100 pt-2">
            <div className="text-[9px] uppercase font-semibold tracking-wide text-slate-400 mb-1">Score inputs</div>
            <div className="grid grid-cols-2 gap-1">
              {report.scoreInputs.map((s) => (
                <div key={s.key} className="text-[10px] text-slate-600 flex items-center justify-between bg-slate-50 rounded px-1.5 py-0.5">
                  <span className="truncate">{s.key} ({Math.round(s.weight * 100)}%)</span>
                  <span className="tabular-nums font-mono">{s.value ?? "—"}</span>
                </div>
              ))}
            </div>
            {report.contextNote && <div className="mt-1.5 text-[10px] italic text-amber-700">{report.contextNote}</div>}
          </div>
        </div>
      )}
    </div>
  );
}

export default ArionIAInsightsTrendsPage;
