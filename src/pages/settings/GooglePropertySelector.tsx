import { useCallback, useEffect, useState } from 'react';
import { useAppState } from '../../app/AppState';
import { useAccessToken } from '../../auth/useAccessToken';
import * as arionApi from '../../lib/arionApi';

interface GA4Property {
  propertyId: string;
  displayName: string;
  account: string;
}

interface GSCSite {
  siteUrl: string;
  permissionLevel: string;
}

interface PropsResponse {
  ga4Properties: GA4Property[];
  gscSites: GSCSite[];
  ga4Properties_total?: number;
  gscSites_total?: number;
  domain_filter_active?: boolean;
  site_domain?: string | null;
  no_matching_properties?: boolean;
  can_auto_provision?: boolean;
  currentGa4PropertyId?: string | null;
  currentGscSiteUrl?: string | null;
}

export function GooglePropertySelector({ siteId, onComplete }: { siteId: string; onComplete: () => void }) {
  const { activeTenantId } = useAppState();
  const { getToken } = useAccessToken();
  const [ga4Properties, setGa4Properties] = useState<GA4Property[]>([]);
  const [gscSites, setGscSites] = useState<GSCSite[]>([]);
  const [meta, setMeta] = useState<{ domain: string | null; ga4Total: number; gscTotal: number; filterActive: boolean; noMatches: boolean; canAutoProvision: boolean }>({
    domain: null, ga4Total: 0, gscTotal: 0, filterActive: true, noMatches: false, canAutoProvision: false,
  });
  const [selectedGA4, setSelectedGA4] = useState('');
  const [selectedGSC, setSelectedGSC] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [provisioning, setProvisioning] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [provisionResult, setProvisionResult] = useState<string | null>(null);

  const load = useCallback(async (opts?: { showAll?: boolean }) => {
    if (!activeTenantId || !siteId) return;
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      const baseUrl = import.meta.env.VITE_ARION_API_BASE_URL as string;
      const res = await arionApi.getGoogleProperties({
        baseUrl, bearerToken: token.accessToken, tenantId: activeTenantId!, siteId,
        showAll: !!opts?.showAll,
      });
      const data = ((res as { data: PropsResponse }).data) || ({} as PropsResponse);
      setGa4Properties(data.ga4Properties || []);
      setGscSites(data.gscSites || []);
      setMeta({
        domain: data.site_domain || null,
        ga4Total: data.ga4Properties_total ?? data.ga4Properties?.length ?? 0,
        gscTotal: data.gscSites_total ?? data.gscSites?.length ?? 0,
        filterActive: data.domain_filter_active !== false,
        noMatches: !!data.no_matching_properties,
        canAutoProvision: !!data.can_auto_provision,
      });
      if (data.currentGa4PropertyId) setSelectedGA4(data.currentGa4PropertyId);
      if (data.currentGscSiteUrl) setSelectedGSC(data.currentGscSiteUrl);
    } catch (err) {
      setError((err as Error).message || 'Failed to load Google properties');
    } finally {
      setLoading(false);
    }
  }, [activeTenantId, siteId, getToken]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    if (!activeTenantId || !siteId) return;
    setSaving(true);
    try {
      const token = await getToken();
      const baseUrl = import.meta.env.VITE_ARION_API_BASE_URL as string;
      await arionApi.selectGoogleProperties({
        baseUrl, bearerToken: token.accessToken, tenantId: activeTenantId,
        siteId, ga4PropertyId: selectedGA4, gscSiteUrl: selectedGSC,
      });
      onComplete();
    } catch (err) {
      setError((err as Error).message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleAutoProvision = async () => {
    if (!activeTenantId || !siteId) return;
    setProvisioning(true); setError(null); setProvisionResult(null);
    try {
      const token = await getToken();
      const baseUrl = import.meta.env.VITE_ARION_API_BASE_URL as string;
      const r = await arionApi.autoProvisionGoogle({
        baseUrl, bearerToken: token.accessToken, tenantId: activeTenantId, siteId,
      }) as { data?: { summary?: string } };
      setProvisionResult(r?.data?.summary || 'Provisioned. The client will receive admin invitations on each property.');
      await load();
    } catch (err) {
      setError((err as Error).message || 'Auto-provision failed');
    } finally {
      setProvisioning(false);
    }
  };

  const toggleShowAll = () => {
    const next = !showAll;
    setShowAll(next);
    load({ showAll: next });
  };

  if (loading) {
    return (
      <div className="rounded-lg border bg-white p-6">
        <p className="text-sm text-gray-600">Loading Google properties for {meta.domain || 'this site'}…</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-gray-900">Connect Google Services</h2>
      <p className="mt-1 text-sm text-gray-600">
        {meta.domain ? <>Connecting Google for <strong>{meta.domain}</strong>.</> : 'Google authorization successful.'}
        {meta.filterActive && !showAll && (meta.ga4Total > 0 || meta.gscTotal > 0) && (
          <> Filtered to properties matching this domain
            {' '}({ga4Properties.length} of {meta.ga4Total} GA4 · {gscSites.length} of {meta.gscTotal} GSC).
          </>
        )}
      </p>

      {error && (
        <div className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}
      {provisionResult && (
        <div className="mt-3 rounded-md bg-emerald-50 p-3 text-sm text-emerald-800">{provisionResult}</div>
      )}

      {/* NO-MATCH FAST PATH — offer auto-provision, hide the dropdowns */}
      {meta.noMatches && !showAll && (
        <div className="mt-5 rounded-lg bg-blue-50 border border-blue-200 p-4">
          <p className="text-sm font-semibold text-blue-900">
            No GA4 / Search Console / Business Profile found for {meta.domain || 'this site'}.
          </p>
          <p className="mt-1 text-xs text-blue-800">
            We didn't find any Google properties tied to this domain on the connecting account.
            {meta.canAutoProvision
              ? ' We can create new ones under our master account and invite the client as Admin — zero further clicks for them.'
              : ' Provision GOOGLE-MASTER-SERVICE-ACCOUNT-JSON in Key Vault to enable auto-create, or use "Show all properties" below if you genuinely have the right property under another account name.'}
          </p>
          {meta.canAutoProvision && (
            <button
              type="button"
              onClick={handleAutoProvision}
              disabled={provisioning}
              className="mt-3 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
            >
              {provisioning ? 'Provisioning…' : `Create new for ${meta.domain || 'this site'}`}
            </button>
          )}
          <button
            type="button"
            onClick={toggleShowAll}
            className="ml-3 text-xs font-medium text-blue-700 underline hover:text-blue-900"
          >
            Show all properties anyway (advanced — risk of picking another business's data)
          </button>
        </div>
      )}

      {/* PICKER — only render when there ARE properties to pick OR operator opted into showAll */}
      {(ga4Properties.length > 0 || gscSites.length > 0 || showAll) && (
        <>
          {showAll && (
            <div className="mt-4 rounded-md bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900">
              <strong>⚠ Showing all properties on the connecting Google account.</strong> Make absolutely sure you pick the one belonging to {meta.domain || 'this site'}.
              {' '}
              <button type="button" onClick={toggleShowAll} className="ml-1 underline font-semibold">
                Re-enable domain filter
              </button>
            </div>
          )}

          {/* GA4 Property Selector */}
          <div className="mt-5">
            <label className="block text-sm font-medium text-gray-700">Google Analytics 4 Property</label>
            <p className="text-xs text-gray-500 mt-0.5">Select the GA4 property for this site's analytics data.</p>
            <select
              value={selectedGA4}
              onChange={(e) => setSelectedGA4(e.target.value)}
              className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 shadow-sm"
            >
              <option value="">— Select a GA4 property —</option>
              {ga4Properties.map((p) => (
                <option key={p.propertyId} value={p.propertyId}>
                  {p.displayName} ({p.account}) — ID: {p.propertyId}
                </option>
              ))}
            </select>
          </div>

          {/* GSC Site Selector */}
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700">Google Search Console Site</label>
            <p className="text-xs text-gray-500 mt-0.5">Select the Search Console property for this site's search data.</p>
            <select
              value={selectedGSC}
              onChange={(e) => setSelectedGSC(e.target.value)}
              className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 shadow-sm"
            >
              <option value="">— Select a GSC site —</option>
              {gscSites.map((s) => (
                <option key={s.siteUrl} value={s.siteUrl}>
                  {s.siteUrl} ({s.permissionLevel === 'siteOwner' ? 'Owner' : 'User'})
                </option>
              ))}
            </select>
          </div>

          <div className="mt-5 flex gap-3">
            <button
              onClick={handleSave}
              disabled={saving || (!selectedGA4 && !selectedGSC)}
              className="rounded-md bg-black px-5 py-2 text-sm font-medium text-white shadow-sm hover:bg-gray-900 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Connect Selected Services'}
            </button>
            <button
              onClick={onComplete}
              className="rounded-md border border-gray-300 bg-white px-5 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
            >
              Skip for now
            </button>
          </div>
        </>
      )}
    </div>
  );
}
