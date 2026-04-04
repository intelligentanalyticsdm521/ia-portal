import { useEffect, useMemo, useState } from 'react';
import type { PortalService, ServiceStatus } from '../../config/serviceCatalog';
import { useAppState } from '../../app/AppState';
import { useAccessToken } from '../../auth/useAccessToken';
import { ArionApiError, getSeo, type SeoResponse } from '../../lib/arionApi';
import { ArionCard, ArionServiceLayout, EmptyPanel, StatGrid } from './ArionServiceLayout';
import { useArionSites } from './useArionSites';

const ARION_CLIENT_URL = import.meta.env.VITE_ARION_CLIENT_URL || 'https://arion.intelligentanalyticsdm.com';

interface Props { service: PortalService; status: ServiceStatus }

export function ArionSeoPage({ service, status }: Props) {
  const apiBaseUrl = import.meta.env.VITE_ARION_API_BASE_URL;
  const { activeTenantId } = useAppState();
  const { getToken } = useAccessToken();
  const { sites, selectedSite, selectedSiteId, setSelectedSiteId, loading: loadingSites, error: sitesError } = useArionSites();
  const [data, setData] = useState<SeoResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    async function run() {
      if (!activeTenantId || !apiBaseUrl || !selectedSiteId) { setData(null); return; }
      setLoading(true); setError(null);
      try {
        const token = await getToken();
        const res = await getSeo({ baseUrl: apiBaseUrl, bearerToken: token.accessToken, tenantId: activeTenantId, siteId: selectedSiteId });
        setData(res);
      } catch (err) {
        if (err instanceof ArionApiError) setError(`Unable to load SEO data (${err.status}).`);
        else setError('Unable to load SEO data.');
        console.error(err);
      } finally { setLoading(false); }
    }
    run();
  }, [activeTenantId, apiBaseUrl, getToken, selectedSiteId]);

  const packageRows = useMemo(() => [
    { label: 'Package', value: data?.package.label || 'Not enabled' },
    { label: 'Keyword Limit', value: formatNumber(data?.package.keywordLimit) },
    { label: 'Competitors', value: formatNumber(data?.package.competitorLimit) },
    { label: 'Models', value: formatNumber(data?.package.modelLimit) },
    { label: 'Groups', value: formatNumber(data?.package.groupLimit) },
    { label: 'AI Enabled', value: data?.package.aiEnabled ? 'Yes' : 'No' },
    { label: 'Data API', value: data?.package.dataApiEnabled ? 'Enabled' : 'Not enabled' },
    { label: 'Project Linked', value: data?.connected ? 'Yes' : 'No' }
  ], [data]);

  return (
    <ArionServiceLayout service={service} status={status} sites={sites} selectedSiteId={selectedSiteId} onSelectSite={setSelectedSiteId} loading={loadingSites || loading} error={sitesError || error} actions={<a href={`${ARION_CLIENT_URL}/seo-tools?tenant=${activeTenantId}`} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-slate-800">Open in ARION</a>}>
      {!selectedSite ? <EmptyPanel title="No sites connected" body="Create or connect an ARION site to enable SEO packages." /> : (
        <>
          <StatGrid items={packageRows} />
          <div className="grid gap-4 xl:grid-cols-2">
            <ArionCard title="SEO Snapshot" subtitle="Most recent SE Ranking project summary for this site.">
              <div className="space-y-2 text-sm">
                <SimpleRow label="Visibility" value={formatNumber(data?.snapshot.visibilityScore)} />
                <SimpleRow label="Audit Score" value={formatNumber(data?.snapshot.auditScore)} />
                <SimpleRow label="Tracked Keywords" value={formatNumber(data?.snapshot.trackedKeywords)} />
                <SimpleRow label="Tracked Competitors" value={formatNumber(data?.snapshot.trackedCompetitors)} />
                <SimpleRow label="Tracked Models" value={formatNumber(data?.snapshot.trackedModels)} />
                <SimpleRow label="Critical Issues" value={formatNumber(data?.snapshot.criticalIssues)} />
                <SimpleRow label="Warning Issues" value={formatNumber(data?.snapshot.warningIssues)} />
              </div>
            </ArionCard>
            <ArionCard title="SE Ranking Project" subtitle="Manage SE Ranking projects in ARION.">
              <div className="space-y-2 text-sm">
                <SimpleRow label="Project Linked" value={data?.connected ? 'Yes' : 'No'} />
              </div>
            </ArionCard>
          </div>
          <ArionCard title="SEO Detail" subtitle="Additional SEO trend and issue detail pulled from the latest snapshot.">
            <pre className="overflow-x-auto rounded-lg bg-slate-50 p-3 text-xs text-slate-700">{JSON.stringify(data?.breakdowns || {}, null, 2)}</pre>
          </ArionCard>
        </>
      )}
    </ArionServiceLayout>
  );
}

const formatNumber = (value?: number | null) => (value === null || value === undefined ? '—' : Number(value).toLocaleString());
function SimpleRow({ label, value }: { label: string; value: string }) { return <div className="flex items-center justify-between gap-4"><span className="text-slate-500">{label}</span><span className="font-medium text-slate-900">{value}</span></div>; }

export default ArionSeoPage;
