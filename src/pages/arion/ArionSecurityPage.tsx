// @deprecated 2026-06-12 — orphan after refactor. Superseded by arion/pages/security/ — split into Security Overview/Vulnerabilities/Performance. Confirm with founder before deletion (task #174).
import { useEffect, useState } from 'react';
import type { PortalService, ServiceStatus } from '../../config/serviceCatalog';
import { useAppState } from '../../app/AppState';
import { useAccessToken } from '../../auth/useAccessToken';
import { ArionApiError, getVulnerabilities } from '../../lib/arionApi';
import { ArionCard, ArionServiceLayout, EmptyPanel, StatGrid } from './ArionServiceLayout';
import { useArionSites } from './useArionSites';

const ARION_CLIENT_URL = import.meta.env.VITE_ARION_CLIENT_URL || 'https://arion.intelligentanalyticsdm.com';

interface Props { service: PortalService; status: ServiceStatus }

export function ArionSecurityPage({ service, status }: Props) {
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
        const res = await getVulnerabilities({ baseUrl: apiBaseUrl, bearerToken: token.accessToken, tenantId: activeTenantId, siteId: selectedSiteId });
        setData(res);
      } catch (err) {
        if (err instanceof ArionApiError) setError(`Unable to load security data (${err.status}).`);
        else setError('Unable to load security data.');
        console.error(err);
      } finally { setLoading(false); }
    }
    run();
  }, [activeTenantId, apiBaseUrl, getToken, selectedSiteId]);

  const openArionUrl = selectedSiteId
    ? `${ARION_CLIENT_URL}/website/security/overview?tenant=${activeTenantId}&siteId=${selectedSiteId}`
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
      {!selectedSite ? <EmptyPanel title="No sites connected" body="Create or connect an ARION site to view security data." /> : (
        <>
          <StatGrid items={[
            { label: 'Critical', value: formatNumber(data?.data?.critical) },
            { label: 'High', value: formatNumber(data?.data?.high) },
            { label: 'Medium', value: formatNumber(data?.data?.medium) },
            { label: 'Plugins Checked', value: formatNumber(data?.data?.plugins_checked) }
          ]} />
          <ArionCard title="Security Status" subtitle="Vulnerability summary from the latest security scan for this site.">
            <div className="space-y-2 text-sm">
              <SimpleRow label="Critical Vulnerabilities" value={formatNumber(data?.data?.critical)} />
              <SimpleRow label="High Vulnerabilities" value={formatNumber(data?.data?.high)} />
              <SimpleRow label="Medium Vulnerabilities" value={formatNumber(data?.data?.medium)} />
              <SimpleRow label="Plugins Checked" value={formatNumber(data?.data?.plugins_checked)} />
            </div>
          </ArionCard>
        </>
      )}
    </ArionServiceLayout>
  );
}

const formatNumber = (value?: number | null) => (value === null || value === undefined ? '--' : Number(value).toLocaleString());
function SimpleRow({ label, value }: { label: string; value: string }) { return <div className="flex items-center justify-between gap-4"><span className="text-slate-500">{label}</span><span className="font-medium text-slate-900">{value}</span></div>; }

export default ArionSecurityPage;
