import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
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

export function GooglePropertySelector({ siteId, onComplete }: { siteId: string; onComplete: () => void }) {
  const { activeTenantId } = useAppState();
  const { getToken } = useAccessToken();
  const [ga4Properties, setGa4Properties] = useState<GA4Property[]>([]);
  const [gscSites, setGscSites] = useState<GSCSite[]>([]);
  const [selectedGA4, setSelectedGA4] = useState('');
  const [selectedGSC, setSelectedGSC] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      if (!activeTenantId || !siteId) return;
      setLoading(true);
      try {
        const token = await getToken();
        const baseUrl = import.meta.env.VITE_ARION_API_BASE_URL as string;
        const res = await arionApi.getGoogleProperties({
          baseUrl, bearerToken: token.accessToken, tenantId: activeTenantId!, siteId
        });
        const data = (res as any).data;
        setGa4Properties(data.ga4Properties || []);
        setGscSites(data.gscSites || []);
        if (data.currentGa4PropertyId) setSelectedGA4(data.currentGa4PropertyId);
      } catch (err: any) {
        setError(err.message || 'Failed to load Google properties');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [activeTenantId, siteId, getToken]);

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
    } catch (err: any) {
      setError(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-lg border bg-white p-6">
        <p className="text-sm text-gray-600">Loading your Google properties...</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-gray-900">Connect Google Services</h2>
      <p className="mt-1 text-sm text-gray-600">
        Google authorization successful. Now select which properties to connect to this site.
      </p>

      {error && (
        <div className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>
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

      {/* Save */}
      <div className="mt-5 flex gap-3">
        <button
          onClick={handleSave}
          disabled={saving || (!selectedGA4 && !selectedGSC)}
          className="rounded-md bg-black px-5 py-2 text-sm font-medium text-white shadow-sm hover:bg-gray-900 disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Connect Selected Services'}
        </button>
        <button
          onClick={onComplete}
          className="rounded-md border border-gray-300 bg-white px-5 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
        >
          Skip for now
        </button>
      </div>
    </div>
  );
}
