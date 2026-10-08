import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAppState } from '../../app/AppState';
import { useAccessToken } from '../../auth/useAccessToken';
import { ArionApiError, type ArionSiteSummary, listArionSites } from '../../lib/arionApi';

export function useArionSites() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { activeTenantId } = useAppState();
  const { getToken } = useAccessToken();
  const [sites, setSites] = useState<ArionSiteSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const apiBaseUrl = import.meta.env.VITE_ARION_API_BASE_URL;

  const selectedSiteId = searchParams.get('siteId');

  const selectedSite = useMemo(
    () => sites.find((site) => site.siteId === selectedSiteId) || sites[0] || null,
    [selectedSiteId, sites]
  );

  const setSelectedSiteId = useCallback(
    (siteId: string) => {
      const next = new URLSearchParams(searchParams);
      next.set('siteId', siteId);
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams]
  );

  const refresh = useCallback(async () => {
    if (!activeTenantId) {
      setSites([]);
      return;
    }
    if (!apiBaseUrl) {
      setError('VITE_ARION_API_BASE_URL is not configured.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      const response = await listArionSites({
        baseUrl: apiBaseUrl,
        bearerToken: token.accessToken,
        tenantId: activeTenantId
      });
      const nextSites = response.sites || [];
      setSites(nextSites);

      const current = searchParams.get('siteId');
      if (!current && nextSites[0]?.siteId) {
        const next = new URLSearchParams(searchParams);
        next.set('siteId', nextSites[0].siteId);
        setSearchParams(next, { replace: true });
      } else if (current && !nextSites.some((site) => site.siteId === current) && nextSites[0]?.siteId) {
        const next = new URLSearchParams(searchParams);
        next.set('siteId', nextSites[0].siteId);
        setSearchParams(next, { replace: true });
      }
    } catch (err) {
      if (err instanceof ArionApiError) {
        setError(err.status === 403 ? "ARION isn't part of this business's plan." : `ARION could not be reached (error ${err.status}). Reload the page to try again.`);
      } else {
        setError('Unexpected error while loading ARION sites.');
      }
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [activeTenantId, apiBaseUrl, getToken, searchParams, setSearchParams]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { sites, selectedSite, selectedSiteId: selectedSite?.siteId || null, setSelectedSiteId, loading, error, refresh };
}
