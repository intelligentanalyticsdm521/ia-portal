// @deprecated 2026-06-12 — orphan after refactor. Superseded by arion/pages/dashboard/ — consolidated into ArionOverviewPage. Confirm with founder before deletion (task #174).
import { useEffect, useState } from 'react';
import type { PortalService, ServiceStatus } from '../../config/serviceCatalog';
import { useAppState } from '../../app/AppState';
import { useAccessToken } from '../../auth/useAccessToken';
import { ArionApiError, getConsoleReport, type ConsoleResponse } from '../../lib/arionApi';
import { ArionCard, ArionServiceLayout, ArionTabBar, EmptyPanel, StatGrid } from './ArionServiceLayout';
import { useArionSites } from './useArionSites';

const ARION_CLIENT_URL = import.meta.env.VITE_ARION_CLIENT_URL || 'https://arion.intelligentanalyticsdm.com';

interface Props { service: PortalService; status: ServiceStatus }

export function ArionConsolePage({ service, status }: Props) {
  const apiBaseUrl = import.meta.env.VITE_ARION_API_BASE_URL;
  const { activeTenantId } = useAppState();
  const { getToken } = useAccessToken();
  const { sites, selectedSite, selectedSiteId, setSelectedSiteId, loading: loadingSites, error: sitesError } = useArionSites();
  const [tab, setTab] = useState<'google' | 'bing'>('google');
  const [data, setData] = useState<ConsoleResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function run() {
      if (!activeTenantId || !apiBaseUrl || !selectedSiteId) { setData(null); return; }
      setLoading(true); setError(null);
      try {
        const token = await getToken();
        const res = await getConsoleReport({ baseUrl: apiBaseUrl, bearerToken: token.accessToken, tenantId: activeTenantId, siteId: selectedSiteId, provider: tab, periodCode: '28D' });
        setData(res);
      } catch (err) {
        if (err instanceof ArionApiError) setError(`Unable to load console reporting (${err.status}).`);
        else setError('Unable to load console reporting.');
        console.error(err);
      } finally { setLoading(false); }
    }
    run();
  }, [activeTenantId, apiBaseUrl, getToken, selectedSiteId, tab]);

  return (
    <ArionServiceLayout
      service={service}
      status={status}
      sites={sites}
      selectedSiteId={selectedSiteId}
      onSelectSite={setSelectedSiteId}
      loading={loadingSites || loading}
      error={sitesError || error}
      actions={<div className="flex flex-wrap gap-2"><ArionTabBar tabs={[{ key: 'google', label: 'Google' }, { key: 'bing', label: 'Bing' }]} activeTab={tab} onChange={(value) => setTab(value as 'google' | 'bing')} /><a href={`${ARION_CLIENT_URL}/search-console?tenant=${activeTenantId}`} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-slate-800">Open in ARION</a></div>}
    >
      {!selectedSite ? <EmptyPanel title="No sites connected" body="Create or connect an ARION site to view console reporting." /> : (
        <>
          <StatGrid items={[
            { label: 'Clicks', value: formatNumber(data?.summary.clicks) },
            { label: 'Impressions', value: formatNumber(data?.summary.impressions) },
            { label: 'CTR', value: formatPercent(data?.summary.ctr) },
            { label: 'Avg Position', value: formatNumber(data?.summary.avgPosition) }
          ]} />
          <div className="grid gap-4 xl:grid-cols-2">
            <ArionCard title="Top Queries" subtitle="The most visible search queries for the selected period."><JsonTable rows={data?.breakdowns.queries} fallback={`${tab === 'google' ? 'Connect Search Console' : 'Set up Bing Webmaster'} to view query data.`} /></ArionCard>
            <ArionCard title="Top Pages" subtitle="Pages receiving the most search impressions and clicks."><JsonTable rows={data?.breakdowns.pages} fallback="No page-level console data yet." /></ArionCard>
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            <ArionCard title="Devices" subtitle="Console reporting by device type."><JsonTable rows={data?.breakdowns.devices} fallback="No device breakdown yet." /></ArionCard>
            <ArionCard title="Countries" subtitle="Console reporting by country."><JsonTable rows={data?.breakdowns.countries} fallback="No country breakdown yet." /></ArionCard>
          </div>
          {tab === 'bing' && !data?.connected && <EmptyPanel title="Bing Webmaster not linked" body="Set up your site in Bing Webmaster Tools, then return here and link it into ARION for Bing console reporting." />}
        </>
      )}
    </ArionServiceLayout>
  );
}

function JsonTable({ rows, fallback }: { rows?: Array<Record<string, unknown>>; fallback: string }) {
  if (!rows || rows.length === 0) return <div className="text-sm text-slate-500">{fallback}</div>;
  const keys = Object.keys(rows[0]).slice(0, 4);
  return <div className="overflow-x-auto"><table className="min-w-full text-left text-xs text-slate-600"><thead><tr>{keys.map((key) => <th key={key} className="py-2 pr-3 font-semibold text-slate-500">{prettyKey(key)}</th>)}</tr></thead><tbody>{rows.slice(0, 10).map((row, idx) => <tr key={idx} className="border-t border-slate-100">{keys.map((key) => <td key={key} className="py-2 pr-3">{String(row[key] ?? 'â€”')}</td>)}</tr>)}</tbody></table></div>;
}
const prettyKey = (key: string) => key.replace(/([A-Z])/g, ' $1').replace(/[_-]/g, ' ').replace(/^./, (c) => c.toUpperCase());
const formatNumber = (value?: number | null) => (value === null || value === undefined ? 'â€”' : Number(value).toLocaleString());
const formatPercent = (value?: number | null) => (value === null || value === undefined ? 'â€”' : `${(value * 100).toFixed(1)}%`);

export default ArionConsolePage;
