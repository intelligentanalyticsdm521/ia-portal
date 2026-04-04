import { useEffect, useMemo, useState } from 'react';
import type { PortalService, ServiceStatus } from '../../config/serviceCatalog';
import { useAppState } from '../../app/AppState';
import { useAccessToken } from '../../auth/useAccessToken';
import { ArionApiError, getHosting, type HostingResponse } from '../../lib/arionApi';
import { ArionCard, ArionServiceLayout, EmptyPanel, SiteActionLink, StatGrid } from './ArionServiceLayout';
import { useArionSites } from './useArionSites';

const ARION_CLIENT_URL = import.meta.env.VITE_ARION_CLIENT_URL || 'https://arion.intelligentanalyticsdm.com';

interface Props { service: PortalService; status: ServiceStatus }

export function ArionHostingPage({ service, status }: Props) {
  const apiBaseUrl = import.meta.env.VITE_ARION_API_BASE_URL;
  const { activeTenantId } = useAppState();
  const { getToken } = useAccessToken();
  const { sites, selectedSite, selectedSiteId, setSelectedSiteId, loading: loadingSites, error: sitesError } = useArionSites();
  const [data, setData] = useState<HostingResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function run() {
      if (!activeTenantId || !apiBaseUrl || !selectedSiteId) { setData(null); return; }
      setLoading(true); setError(null);
      try {
        const token = await getToken();
        const res = await getHosting({ baseUrl: apiBaseUrl, bearerToken: token.accessToken, tenantId: activeTenantId, siteId: selectedSiteId });
        setData(res);
      } catch (err) {
        if (err instanceof ArionApiError) setError(`Unable to load hosting data (${err.status}).`);
        else setError('Unable to load hosting data.');
        console.error(err);
      } finally { setLoading(false); }
    }
    run();
  }, [activeTenantId, apiBaseUrl, getToken, selectedSiteId]);

  const stats = useMemo(() => [
    { label: 'Site Status', value: data?.health?.siteStatus || '—' },
    { label: 'SSL', value: data?.health?.sslStatus || '—' },
    { label: 'Plugin Updates', value: formatNumber(data?.health?.pluginUpdatesAvailable) },
    { label: 'Theme Updates', value: formatNumber(data?.health?.themeUpdatesAvailable) },
    { label: 'WordPress', value: data?.health?.wordpressVersion || '—' },
    { label: 'PHP', value: data?.health?.phpVersion || '—' },
    { label: 'Performance', value: formatNumber(data?.health?.performanceScore) },
    { label: 'Forms', value: data?.health?.formDeliveryStatus || '—' }
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
      actions={<div className="flex flex-wrap gap-2"><SiteActionLink href={selectedSite?.wpUrl}>Go To Website</SiteActionLink> <a href={`${ARION_CLIENT_URL}/hosting?tenant=${activeTenantId}`} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-slate-800">Open in ARION</a></div>}
    >
      {!selectedSite ? (
        <EmptyPanel title="No sites connected" body="Create or connect an ARION site to view hosting details." />
      ) : (
        <>
          <StatGrid items={stats} />
          <div className="grid gap-4 xl:grid-cols-2">
            <ArionCard title="Plugins" subtitle="Out-of-date or required plugins tracked for this site.">
              {data?.plugins?.length ? (
                <div className="space-y-2">{data.plugins.map((plugin) => <div key={plugin.pluginKey} className="flex items-center justify-between gap-4 rounded-lg border border-slate-100 px-3 py-2 text-sm"><div><div className="font-medium text-slate-900">{plugin.pluginName || plugin.pluginKey}</div><div className="text-xs text-slate-500">{plugin.pluginVersion || 'Version unknown'}</div></div><div className="text-xs font-semibold text-slate-500">{plugin.isActive ? 'Active' : 'Inactive'}</div></div>)}</div>
              ) : <div className="text-sm text-slate-500">No plugin inventory has been reported yet.</div>}
            </ArionCard>
            <ArionCard title="Requests" subtitle="Support and change requests tied to this site.">
              {data?.requests?.length ? (
                <div className="space-y-2">{data.requests.map((request) => <div key={request.siteRequestId} className="rounded-lg border border-slate-100 px-3 py-2 text-sm"><div className="flex items-center justify-between gap-4"><span className="font-medium text-slate-900">{request.requestType}</span><span className="text-xs text-slate-500">{request.requestStatus}</span></div><div className="mt-1 text-slate-600">{request.notes || 'No notes supplied.'}</div></div>)}</div>
              ) : <div className="text-sm text-slate-500">No hosting or support requests yet.</div>}
            </ArionCard>
          </div>
        </>
      )}
    </ArionServiceLayout>
  );
}

const formatNumber = (value?: number | null) => (value === null || value === undefined ? '—' : Number(value).toLocaleString());

export default ArionHostingPage;
