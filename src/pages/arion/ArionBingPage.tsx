// @deprecated 2026-06-12 — orphan after refactor. Superseded by arion/pages/analytics/Bing — moved under analytics. Confirm with founder before deletion (task #174).
import { useEffect, useState } from 'react';
import type { PortalService, ServiceStatus } from '../../config/serviceCatalog';
import { useAppState } from '../../app/AppState';
import { useAccessToken } from '../../auth/useAccessToken';
import { ArionApiError, getConsoleReport } from '../../lib/arionApi';
import { ArionCard, ArionServiceLayout, EmptyPanel, StatGrid } from './ArionServiceLayout';
import { useArionSites } from './useArionSites';

const ARION_CLIENT_URL = import.meta.env.VITE_ARION_CLIENT_URL || 'https://arion.intelligentanalyticsdm.com';

interface Props { service: PortalService; status: ServiceStatus }

export function ArionBingPage({ service, status }: Props) {
  const apiBaseUrl = import.meta.env.VITE_ARION_API_BASE_URL;
  const { activeTenantId } = useAppState();
  const { getToken } = useAccessToken();
  const { sites, selectedSite, selectedSiteId, setSelectedSiteId, loading: loadingSites, error: sitesError } = useArionSites();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function run() {
      if (!activeTenantId || !apiBaseUrl || !selectedSiteId) { setData(null); return; }
      setLoading(true); setError(null);
      try {
        const token = await getToken();
        const res = await getConsoleReport({ baseUrl: apiBaseUrl, bearerToken: token.accessToken, tenantId: activeTenantId, siteId: selectedSiteId, provider: 'bing' });
        setData(res);
      } catch (err) {
        if (err instanceof ArionApiError) setError(`Unable to load Bing data (${err.status}).`);
        else setError('Unable to load Bing data.');
        console.error(err);
      } finally { setLoading(false); }
    }
    run();
  }, [activeTenantId, apiBaseUrl, getToken, selectedSiteId]);

  const openArionUrl = selectedSiteId
    ? `${ARION_CLIENT_URL}/search/bing-copilot?tenant=${activeTenantId}&siteId=${selectedSiteId}`
    : ARION_CLIENT_URL;

  return (
    <ArionServiceLayout
      service={service}
      status={status}
      sites={sites}
      selectedSiteId={selectedSiteId}
      onSelectSite={setSelectedSiteId}
      loading={loadingSites || loading}
      error={sitesError || error}
      actions={<a href={openArionUrl} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-slate-800">Open in ARION</a>}
    >
      {!selectedSite ? <EmptyPanel title="No sites connected" body="Create or connect an ARION site to view Bing Webmaster data." /> : (
        <>
          <StatGrid items={[
            { label: 'Clicks', value: formatNumber(data?.summary?.clicks) },
            { label: 'Impressions', value: formatNumber(data?.summary?.impressions) },
            { label: 'CTR', value: formatPercent(data?.summary?.ctr) },
            { label: 'Avg Position', value: formatNumber(data?.summary?.avgPosition) }
          ]} />
          <ArionCard title="Bing Webmaster & Copilot" subtitle="Search console summary from Bing Webmaster Tools.">
            <div className="space-y-2 text-sm">
              <SimpleRow label="Clicks" value={formatNumber(data?.summary?.clicks)} />
              <SimpleRow label="Impressions" value={formatNumber(data?.summary?.impressions)} />
              <SimpleRow label="Click-Through Rate" value={formatPercent(data?.summary?.ctr)} />
              <SimpleRow label="Average Position" value={formatNumber(data?.summary?.avgPosition)} />
            </div>
          </ArionCard>
        </>
      )}
    </ArionServiceLayout>
  );
}

const formatNumber = (value?: number | null) => (value === null || value === undefined ? '--' : Number(value).toLocaleString());
const formatPercent = (value?: number | null) => (value === null || value === undefined ? '--' : `${(value * 100).toFixed(1)}%`);
function SimpleRow({ label, value }: { label: string; value: string }) { return <div className="flex items-center justify-between gap-4"><span className="text-slate-500">{label}</span><span className="font-medium text-slate-900">{value}</span></div>; }

export default ArionBingPage;
