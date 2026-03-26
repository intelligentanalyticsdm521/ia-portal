import { useEffect, useState } from 'react';
import type { PortalService, ServiceStatus } from '../../config/serviceCatalog';
import { useAppState } from '../../app/AppState';
import { useAccessToken } from '../../auth/useAccessToken';
import { ArionApiError, getMyBusiness, type BusinessProfileData, updateGoogleBusiness, updateLinkedBusinessProfile } from '../../lib/arionApi';
import { ArionCard, ArionServiceLayout, ArionTabBar, EmptyPanel, SiteActionLink } from './ArionServiceLayout';
import { useArionSites } from './useArionSites';

interface Props { service: PortalService; status: ServiceStatus }

export function ArionMyBusinessPage({ service, status }: Props) {
  const apiBaseUrl = import.meta.env.VITE_ARION_API_BASE_URL;
  const { activeTenantId } = useAppState();
  const { getToken } = useAccessToken();
  const { sites, selectedSite, selectedSiteId, setSelectedSiteId, loading: loadingSites, error: sitesError } = useArionSites();
  const [tab, setTab] = useState<'google' | 'apple' | 'bing'>('google');
  const [profile, setProfile] = useState<BusinessProfileData | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string>>({ displayName: '', primaryCategory: '', websiteUrl: '', mapsUrl: '', phone: '', resourceUrl: '' });

  useEffect(() => {
    async function run() {
      if (!activeTenantId || !apiBaseUrl || !selectedSiteId) { setProfile(null); return; }
      setLoading(true); setError(null);
      try {
        const token = await getToken();
        const res = await getMyBusiness({ baseUrl: apiBaseUrl, bearerToken: token.accessToken, tenantId: activeTenantId, siteId: selectedSiteId, provider: tab });
        setProfile(res.profile);
        setForm({
          displayName: String(res.profile.displayName || ''),
          primaryCategory: String(res.profile.primaryCategory || ''),
          websiteUrl: String(res.profile.websiteUrl || ''),
          mapsUrl: String(res.profile.mapsUrl || ''),
          phone: String(res.profile.phone || ''),
          resourceUrl: String(res.profile.resourceUrl || '')
        });
      } catch (err) {
        if (err instanceof ArionApiError) setError(`Unable to load ${tab} business profile (${err.status}).`);
        else setError('Unable to load business profile.');
        console.error(err);
      } finally { setLoading(false); }
    }
    run();
  }, [activeTenantId, apiBaseUrl, getToken, selectedSiteId, tab]);

  async function handleSave() {
    if (!activeTenantId || !apiBaseUrl || !selectedSiteId) return;
    setSaving(true); setError(null);
    try {
      const token = await getToken();
      if (tab === 'google') {
        const res = await updateGoogleBusiness({ baseUrl: apiBaseUrl, bearerToken: token.accessToken, tenantId: activeTenantId, siteId: selectedSiteId, body: form });
        setProfile(res.profile);
      } else {
        const res = await updateLinkedBusinessProfile({ baseUrl: apiBaseUrl, bearerToken: token.accessToken, tenantId: activeTenantId, siteId: selectedSiteId, provider: tab, body: form });
        setProfile(res.profile);
      }
    } catch (err) {
      console.error(err);
      setError('Unable to save the business profile details.');
    } finally { setSaving(false); }
  }

  return (
    <ArionServiceLayout
      service={service}
      status={status}
      sites={sites}
      selectedSiteId={selectedSiteId}
      onSelectSite={setSelectedSiteId}
      loading={loadingSites || loading}
      error={sitesError || error}
      actions={<div className="flex flex-wrap gap-2"><ArionTabBar tabs={[{ key: 'google', label: 'Google' }, { key: 'apple', label: 'Apple' }, { key: 'bing', label: 'Bing' }]} activeTab={tab} onChange={(value) => setTab(value as 'google' | 'apple' | 'bing')} /> <SiteActionLink href={profile?.resourceUrl}>{tab === 'google' ? 'Go To Google Business Profile' : tab === 'apple' ? 'Go To Apple Business Connect' : 'Go To Bing Places'}</SiteActionLink></div>}
    >
      {!selectedSite ? <EmptyPanel title="No sites connected" body="Create or connect an ARION site to manage business listings." /> : (
        <div className="grid gap-4 xl:grid-cols-[1.3fr,0.7fr]">
          <ArionCard title={`${tab === 'google' ? 'Google' : tab === 'apple' ? 'Apple' : 'Bing'} Business Profile`} subtitle={tab === 'google' ? 'Google can be edited in ARION where provider permissions allow it.' : 'Apple and Bing launch with managed links and stored business details.'}>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Display Name" value={form.displayName} onChange={(value) => setForm((p) => ({ ...p, displayName: value }))} />
              <Field label="Primary Category" value={form.primaryCategory} onChange={(value) => setForm((p) => ({ ...p, primaryCategory: value }))} />
              <Field label="Website URL" value={form.websiteUrl} onChange={(value) => setForm((p) => ({ ...p, websiteUrl: value }))} />
              <Field label="Maps URL" value={form.mapsUrl} onChange={(value) => setForm((p) => ({ ...p, mapsUrl: value }))} />
              <Field label="Phone" value={form.phone} onChange={(value) => setForm((p) => ({ ...p, phone: value }))} />
              <Field label="Manage Resource URL" value={form.resourceUrl} onChange={(value) => setForm((p) => ({ ...p, resourceUrl: value }))} />
            </div>
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={handleSave} disabled={saving} className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-slate-800">{saving ? 'Saving…' : 'Save'}</button>
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

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}<input value={value} onChange={(e) => onChange(e.target.value)} className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal text-slate-800" /></label>;
}
function SimpleRow({ label, value }: { label: string; value: string }) { return <div className="flex items-center justify-between gap-4"><span className="text-slate-500">{label}</span><span className="font-medium text-slate-900">{value}</span></div>; }

export default ArionMyBusinessPage;
