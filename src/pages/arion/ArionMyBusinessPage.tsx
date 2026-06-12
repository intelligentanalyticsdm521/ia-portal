// @deprecated 2026-06-12 � orphan after refactor. Superseded by arion/pages/business/ � split into multiple business sections. Confirm with founder before deletion (task #174).
import { useEffect, useState } from 'react';
import type { PortalService, ServiceStatus } from '../../config/serviceCatalog';
import { useAppState } from '../../app/AppState';
import { useAccessToken } from '../../auth/useAccessToken';
import { ArionApiError, getMyBusiness, type BusinessProfileData } from '../../lib/arionApi';
import { ArionCard, ArionServiceLayout, ArionTabBar, EmptyPanel, SiteActionLink } from './ArionServiceLayout';
import { useArionSites } from './useArionSites';

const ARION_CLIENT_URL = import.meta.env.VITE_ARION_CLIENT_URL || 'https://arion.intelligentanalyticsdm.com';

interface Props { service: PortalService; status: ServiceStatus }

export function ArionMyBusinessPage({ service, status }: Props) {
  const apiBaseUrl = import.meta.env.VITE_ARION_API_BASE_URL;
  const { activeTenantId } = useAppState();
  const { getToken } = useAccessToken();
  const { sites, selectedSite, selectedSiteId, setSelectedSiteId, loading: loadingSites, error: sitesError } = useArionSites();
  const [tab, setTab] = useState<'google' | 'apple' | 'bing'>('google');
  const [profile, setProfile] = useState<BusinessProfileData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function run() {
      if (!activeTenantId || !apiBaseUrl || !selectedSiteId) { setProfile(null); return; }
      setLoading(true); setError(null);
      try {
        const token = await getToken();
        const res = await getMyBusiness({ baseUrl: apiBaseUrl, bearerToken: token.accessToken, tenantId: activeTenantId, siteId: selectedSiteId, provider: tab });
        setProfile(res.profile);
      } catch (err) {
        if (err instanceof ArionApiError) setError(`Unable to load ${tab} business profile (${err.status}).`);
        else setError('Unable to load business profile.');
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
      actions={<div className="flex flex-wrap gap-2"><ArionTabBar tabs={[{ key: 'google', label: 'Google' }, { key: 'apple', label: 'Apple' }, { key: 'bing', label: 'Bing' }]} activeTab={tab} onChange={(value) => setTab(value as 'google' | 'apple' | 'bing')} /> <SiteActionLink href={profile?.resourceUrl}>{tab === 'google' ? 'Go To Google Business Profile' : tab === 'apple' ? 'Go To Apple Business Connect' : 'Go To Bing Places'}</SiteActionLink> <a href={`${ARION_CLIENT_URL}/my-business?tenant=${activeTenantId}`} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-slate-800">Open in ARION</a></div>}
    >
      {!selectedSite ? <EmptyPanel title="No sites connected" body="Create or connect an ARION site to manage business listings." /> : (
        <div className="grid gap-4 xl:grid-cols-[1.3fr,0.7fr]">
          <ArionCard title={`${tab === 'google' ? 'Google' : tab === 'apple' ? 'Apple' : 'Bing'} Business Profile`} subtitle={tab === 'google' ? 'Google can be edited in ARION where provider permissions allow it.' : 'Apple and Bing launch with managed links and stored business details.'}>
            <div className="space-y-2 text-sm">
              <SimpleRow label="Display Name" value={profile?.displayName || '—'} />
              <SimpleRow label="Primary Category" value={profile?.primaryCategory || '—'} />
              <SimpleRow label="Website URL" value={profile?.websiteUrl || '—'} />
              <SimpleRow label="Maps URL" value={profile?.mapsUrl || '—'} />
              <SimpleRow label="Phone" value={profile?.phone || '—'} />
              <SimpleRow label="Manage Resource URL" value={profile?.resourceUrl || '—'} />
            </div>
          </ArionCard>
          <ArionCard title="Connection Status" subtitle="Current integration posture for this provider.">
            <div className="space-y-2 text-sm">
              <SimpleRow label="Connected" value={profile?.connected ? 'Yes' : 'No'} />
              <SimpleRow label="Editable in ARION" value={profile?.editable ? 'Yes' : 'No'} />
              <SimpleRow label="Display Name" value={profile?.displayName || '—'} />
              <SimpleRow label="Primary Category" value={profile?.primaryCategory || '—'} />
              <SimpleRow label="Phone" value={profile?.phone || '—'} />
            </div>
          </ArionCard>
        </div>
      )}
    </ArionServiceLayout>
  );
}

function SimpleRow({ label, value }: { label: string; value: string }) { return <div className="flex items-center justify-between gap-4"><span className="text-slate-500">{label}</span><span className="font-medium text-slate-900">{value}</span></div>; }

export default ArionMyBusinessPage;
