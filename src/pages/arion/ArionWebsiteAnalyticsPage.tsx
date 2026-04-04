import { useEffect, useMemo, useState } from 'react';
import type { PortalService, ServiceStatus } from '../../config/serviceCatalog';
import { useAppState } from '../../app/AppState';
import { useAccessToken } from '../../auth/useAccessToken';
import { ArionApiError, getWebsiteAnalytics, type WebsiteAnalyticsResponse } from '../../lib/arionApi';
import { ArionCard, ArionServiceLayout, ArionTabBar, EmptyPanel, SiteActionLink, StatGrid } from './ArionServiceLayout';
import { useArionSites } from './useArionSites';

const ARION_CLIENT_URL = import.meta.env.VITE_ARION_CLIENT_URL || 'https://arion.intelligentanalyticsdm.com';

interface Props { service: PortalService; status: ServiceStatus }

export function ArionWebsiteAnalyticsPage({ service, status }: Props) {
  const apiBaseUrl = import.meta.env.VITE_ARION_API_BASE_URL;
  const { activeTenantId } = useAppState();
  const { getToken } = useAccessToken();
  const { sites, selectedSite, selectedSiteId, setSelectedSiteId, loading: loadingSites, error: sitesError } = useArionSites();
  const [tab, setTab] = useState<'google' | 'bing'>('google');
  const [data, setData] = useState<WebsiteAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function run() {
      if (!activeTenantId || !apiBaseUrl || !selectedSiteId) { setData(null); return; }
      setLoading(true); setError(null);
      try {
        const token = await getToken();
        const res = await getWebsiteAnalytics({ baseUrl: apiBaseUrl, bearerToken: token.accessToken, tenantId: activeTenantId, siteId: selectedSiteId, provider: tab, periodCode: '28D' });
        setData(res);
      } catch (err) {
        if (err instanceof ArionApiError) setError(`Unable to load website analytics (${err.status}).`);
        else setError('Unable to load website analytics.');
        console.error(err);
      } finally { setLoading(false); }
    }
    run();
  }, [activeTenantId, apiBaseUrl, getToken, selectedSiteId, tab]);

  const stats = useMemo(() => [
    { label: 'Users', value: formatNumber(data?.summary.users) },
    { label: 'Sessions', value: formatNumber(data?.summary.sessions) },
    { label: 'Views', value: formatNumber(data?.summary.views) },
    { label: 'Engagement', value: formatPercent(data?.summary.engagementRate) },
    { label: 'Conversions', value: formatNumber(data?.summary.conversions) },
    { label: 'Revenue', value: formatCurrency(data?.summary.revenueUsd) }
  ], [data]);

  return (
    <ArionServiceLayout
      service={service}
      status={status}
      sites={sites}
      selectedSiteId={selectedSiteId}
      onSelectSite={setSelectedSiteId}
      loading={loadingSites || loading}
      error={sitesError || error}
      actions={<div className="flex flex-wrap gap-2"><ArionTabBar tabs={[{ key: 'google', label: 'Google' }, { key: 'bing', label: 'Bing' }]} activeTab={tab} onChange={(value) => setTab(value as 'google' | 'bing')} /> <SiteActionLink href={selectedSite?.wpUrl}>Go To Website</SiteActionLink> <a href={`${ARION_CLIENT_URL}/analytics?tenant=${activeTenantId}`} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-slate-800">Open in ARION</a></div>}
    >
      {!selectedSite ? (
        <EmptyPanel title="No sites connected" body="Create or connect an ARION site to view website analytics." />
      ) : (
        <>
          <StatGrid items={stats} />
          <div className="grid gap-4 xl:grid-cols-2">
            <ArionCard title="Top Pages" subtitle="Highest visibility pages in the selected period">
              <JsonTable rows={data?.breakdowns.topPages} fallback="No page data yet." />
            </ArionCard>
            <ArionCard title="Traffic Sources" subtitle="Primary traffic sources from the current provider snapshot">
              <JsonTable rows={data?.breakdowns.topSources} fallback="No source data yet." />
            </ArionCard>
          </div>
          {tab === 'google' && (
            <div className="grid gap-4 xl:grid-cols-2">
              <ArionCard title="Devices" subtitle="Device mix for the selected period">
                <JsonTable rows={data?.breakdowns.devices} fallback="No device data yet." />
              </ArionCard>
              <ArionCard title="Geography" subtitle="Top geographies from Google Analytics snapshots">
                <JsonTable rows={data?.breakdowns.geos} fallback="No geography data yet." />
              </ArionCard>
            </div>
          )}
          {tab === 'bing' && !data?.connected && (
            <EmptyPanel title="Bing analytics not connected" body="Set up Bing Webmaster Tools, then return here and link it inside ARION to view Bing reporting." />
          )}
        </>
      )}
    </ArionServiceLayout>
  );
}

function JsonTable({ rows, fallback }: { rows?: Array<Record<string, unknown>>; fallback: string }) {
  if (!rows || rows.length === 0) return <div className="text-sm text-slate-500">{fallback}</div>;
  const keys = Object.keys(rows[0]).slice(0, 4);
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-xs text-slate-600">
        <thead>
          <tr>{keys.map((key) => <th key={key} className="py-2 pr-3 font-semibold text-slate-500">{prettyKey(key)}</th>)}</tr>
        </thead>
        <tbody>
          {rows.slice(0, 10).map((row, idx) => (
            <tr key={idx} className="border-t border-slate-100">{keys.map((key) => <td key={key} className="py-2 pr-3">{String(row[key] ?? '—')}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const prettyKey = (key: string) => key.replace(/([A-Z])/g, ' $1').replace(/[_-]/g, ' ').replace(/^./, (c) => c.toUpperCase());
const formatNumber = (value?: number | null) => (value === null || value === undefined ? '—' : Number(value).toLocaleString());
const formatPercent = (value?: number | null) => (value === null || value === undefined ? '—' : `${(value * 100).toFixed(1)}%`);
const formatCurrency = (value?: number | null) => (value === null || value === undefined ? '—' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value));

export default ArionWebsiteAnalyticsPage;
