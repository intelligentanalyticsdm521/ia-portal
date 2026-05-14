import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Sparkles, ArrowUpRight, AlertCircle } from 'lucide-react';
import type { PortalService, ServiceStatus } from '../../config/serviceCatalog';
import { useAccessToken } from '../../auth/useAccessToken';
import { useAppState } from '../../app/AppState';
import { ArionApiError, getArionOverview, type OverviewResponse } from '../../lib/arionApi';
import { ArionCard, ArionServiceLayout, EmptyPanel } from './ArionServiceLayout';
import { useArionSites } from './useArionSites';
import { Sparkline } from '../../components/iainsights/Sparkline';


interface Props { service: PortalService; status: ServiceStatus }

export function ArionOverviewPage({ service, status }: Props) {
  const apiBaseUrl = import.meta.env.VITE_ARION_API_BASE_URL;
  const { activeTenantId } = useAppState();
  const { getToken } = useAccessToken();
  const { sites, selectedSite, selectedSiteId, setSelectedSiteId, loading: loadingSites, error: sitesError, refresh } = useArionSites();
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [iaTrendScore, setIaTrendScore] = useState<number | null>(null);
  const [iaTrendHistory, setIaTrendHistory] = useState<Array<{ period_end: string; score: number }>>([]);
  // Interactive features moved to ARION Client App

  useEffect(() => {
    async function run() {
      if (!activeTenantId || !apiBaseUrl || !selectedSiteId) {
        setData(null);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const token = await getToken();
        const res = await getArionOverview({ baseUrl: apiBaseUrl, bearerToken: token.accessToken, tenantId: activeTenantId, siteId: selectedSiteId });
        setData(res);
      } catch (err) {
        if (err instanceof ArionApiError) setError(`Unable to load overview (${err.status}).`);
        else setError('Unable to load overview.');
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    run();
  }, [activeTenantId, apiBaseUrl, getToken, selectedSiteId]);

  // v6.9 — IA Insights presence score + 12-period history for the at-a-glance strip.
  useEffect(() => {
    if (!activeTenantId || !apiBaseUrl || !selectedSiteId) {
      setIaTrendScore(null);
      setIaTrendHistory([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const token = await getToken();
        const headers: HeadersInit = {
          Authorization: `Bearer ${token.accessToken}`,
          "x-tenant-key": activeTenantId,
        };
        const today = new Date().toISOString().slice(0, 10);
        const [psRes, histRes] = await Promise.all([
          globalThis.fetch(`${apiBaseUrl}/arion/ia-insights/prior-scores?siteId=${encodeURIComponent(selectedSiteId)}&beforeDate=${today}`, { headers }),
          globalThis.fetch(`${apiBaseUrl}/arion/ia-insights/score-history?siteId=${encodeURIComponent(selectedSiteId)}&reportKey=presence&limit=12`, { headers }),
        ]);
        if (cancelled) return;
        if (psRes.ok) {
          const psBody = await psRes.json();
          setIaTrendScore(psBody?.data?.presence?.score ?? null);
        }
        if (histRes.ok) {
          const histBody = await histRes.json();
          setIaTrendHistory((histBody?.data || []).filter((r: any) => r && r.period_end));
        }
      } catch { /* swallow */ }
    })();
    return () => { cancelled = true; };
  }, [activeTenantId, apiBaseUrl, getToken, selectedSiteId]);

  const metrics = useMemo(() => [
    { label: 'Users', value: data?.overview.users ?? '—' },
    { label: 'Sessions', value: data?.overview.sessions ?? '—' },
    { label: 'Search Clicks', value: data?.overview.clicks ?? '—' },
    { label: 'Impressions', value: data?.overview.impressions ?? '—' },
    { label: 'CTR', value: formatPercent(data?.overview.ctr) },
    { label: 'Avg Position', value: formatNumber(data?.overview.avgPosition) },
    { label: 'Site Count', value: data?.permissions.siteCount ?? sites.length },
    { label: 'SEO Package', value: data?.seo.seoPackageCode ?? 'Not enabled' }
  ], [data, sites.length]);

  return (
    <ArionServiceLayout
      service={service}
      status={status}
      sites={sites}
      selectedSiteId={selectedSiteId}
      onSelectSite={setSelectedSiteId}
      loading={loadingSites || loading}
      error={sitesError || error}
    >
      {!selectedSite ? (
        <EmptyPanel title="No ARION sites found" body="Create your first ARION website to begin tracking analytics, console, hosting, maps, and SEO data." />
      ) : (
        <>
          {/* v6.9 — IA Insights at-a-glance strip */}
          <ArionIAInsightsGlance trendScore={iaTrendScore} trendHistory={iaTrendHistory} />

          {/* Compact 4x2 stat grid for overview */}
          <div className="grid gap-2 grid-cols-2 md:grid-cols-4 mb-4">
            {metrics.map((item) => (
              <div key={item.label} className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{item.label}</div>
                <div className="mt-1 text-lg font-semibold text-slate-900">{item.value}</div>
              </div>
            ))}
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            <ArionCard title="Integrations" subtitle="Connection status across Google, Bing, Apple, and SEO providers">
              <div className="grid gap-3 sm:grid-cols-2">
                {renderStatus('Google Analytics', data?.integrations.googleAnalytics)}
                {renderStatus('Search Console', data?.integrations.googleSearchConsole)}
                {renderStatus('Google Business', data?.integrations.googleBusinessProfile)}
                {renderStatus('Bing Webmaster', data?.integrations.bingWebmaster)}
                {renderStatus('Apple Business', data?.integrations.appleBusinessConnect)}
                {renderStatus('SEO Project', data?.integrations.seRankingProject)}
              </div>
            </ArionCard>
          </div>
          <div className="grid gap-4 xl:grid-cols-3">
            <ArionCard title="Hosting" subtitle="Website health and maintenance posture">
              <SimpleList rows={[
                ['Site status', data?.hosting.siteStatus || '—'],
                ['SSL', data?.hosting.sslStatus || '—'],
                ['WordPress', data?.hosting.wordpressVersion || '—'],
                ['PHP', data?.hosting.phpVersion || '—'],
                ['Plugin updates', formatNumber(data?.hosting.pluginUpdatesAvailable)],
                ['Performance score', formatNumber(data?.hosting.performanceScore)]
              ]} />
            </ArionCard>
            <ArionCard title="Console" subtitle="Search visibility summary from Google Search Console snapshots">
              <SimpleList rows={[
                ['Clicks', formatNumber(data?.overview.clicks)],
                ['Impressions', formatNumber(data?.overview.impressions)],
                ['CTR', formatPercent(data?.overview.ctr)],
                ['Average position', formatNumber(data?.overview.avgPosition)]
              ]} />
            </ArionCard>
            <ArionCard title="SEO" subtitle="SE Ranking package and most recent SEO snapshot">
              <SimpleList rows={[
                ['Package', data?.seo.seoPackageCode || '—'],
                ['Visibility', formatNumber(data?.seo.visibilityScore)],
                ['Audit score', formatNumber(data?.seo.auditScore)],
                ['Tracked keywords', formatNumber(data?.seo.trackedKeywords)],
                ['Tracked competitors', formatNumber(data?.seo.trackedCompetitors)],
                ['Tracked models', formatNumber(data?.seo.trackedModels)]
              ]} />
            </ArionCard>
          </div>
        </>
      )}
    </ArionServiceLayout>
  );
}

function renderStatus(label: string, connected?: boolean) {
  return (
    <div key={label} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
      <div className="text-sm font-medium text-slate-900">{label}</div>
      <div className={`mt-1 text-xs font-semibold ${connected ? 'text-emerald-600' : 'text-slate-500'}`}>{connected ? 'Connected' : 'Not connected'}</div>
    </div>
  );
}

function formatPercent(value?: number | null) { return value === null || value === undefined ? '—' : `${(value * 100).toFixed(1)}%`; }
function formatNumber(value?: number | null) { return value === null || value === undefined ? '—' : Number(value).toLocaleString(); }
function SimpleList({ rows }: { rows: Array<[string, string]> }) {
  return <div className="space-y-2">{rows.map(([label, value]) => <div key={label} className="flex items-center justify-between gap-4 text-sm"><span className="text-slate-500">{label}</span><span className="font-medium text-slate-900">{value}</span></div>)}</div>;
}

// ─ v6.9 — ARION IA Insights at-a-glance ────────────────────────────────────
function ArionIAInsightsGlance({
  trendScore,
  trendHistory,
}: {
  trendScore: number | null;
  trendHistory: Array<{ period_end: string; score: number }>;
}) {
  const score = trendScore ?? 0;
  const band = score >= 70 ? "green" : score >= 50 ? "amber" : score > 0 ? "red" : "gray";
  const bandColor = ({ green: "#16A34A", amber: "#EAB308", red: "#DC2626", gray: "#94A3B8" } as const)[band];
  return (
    <div
      className="mb-4 rounded-xl border border-slate-200 px-4 py-3"
      style={{ background: "linear-gradient(90deg, rgba(26,125,181,0.10), #ffffff)" }}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-[#1A7DB5]" />
          <span className="font-semibold text-slate-900 text-sm">ARION IA Insights at a glance</span>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/app/services/arion_ia_insights_trends" className="text-xs text-[#1A7DB5] hover:underline flex items-center gap-0.5">
            Open Trends <ArrowUpRight className="h-3 w-3" />
          </Link>
          <Link to="/app/services/argus_health" className="text-xs text-slate-600 hover:underline flex items-center gap-0.5">
            ARGUS <ArrowUpRight className="h-3 w-3" />
          </Link>
        </div>
      </div>
      <div className="flex items-center gap-4 flex-wrap">
        <div className="bg-white rounded-lg border border-slate-200 px-3 py-2 flex-shrink-0">
          <div className="text-[10px] uppercase font-semibold text-slate-500 tracking-wide mb-1">ARION Trend Score</div>
          <div className="flex items-center gap-2">
            <div className="text-2xl font-bold tabular-nums" style={{ color: bandColor }}>
              {trendScore != null ? trendScore : "—"}
            </div>
            {trendHistory.length > 1 && (
              <Sparkline data={trendHistory} color={bandColor} width={100} height={26} showBands={false} />
            )}
          </div>
          <div className="text-[9px] text-slate-400 mt-0.5">
            {trendScore != null
              ? `Band: ${band}`
              : (
                <span className="flex items-center gap-1">
                  <AlertCircle className="h-3 w-3 text-amber-600" />
                  No data yet — connect GA4, GSC, GBP
                </span>
              )}
          </div>
        </div>
        <div className="text-xs text-slate-600 flex-1 min-w-[260px]">
          Composite across <strong>Visibility &amp; Reach</strong>, <strong>Audience</strong>, <strong>Conversion</strong>,
          <strong> Search</strong>, <strong> Content</strong>, <strong> Local Presence</strong>, and <strong> Technical Health</strong>.
          Open the Trends page for per-report observations, recommended actions, and the 12-period score history.
        </div>
      </div>
    </div>
  );
}

export default ArionOverviewPage;
