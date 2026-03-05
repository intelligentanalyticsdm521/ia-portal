import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAppState } from '../../app/AppState';
import { useAccessToken } from '../../auth/useAccessToken';
import {
  ArionApiError,
  type ArionSiteDashboard,
  type ArionSiteSummary,
  createArionRequest,
  getArionDashboard,
  listArionSites
} from '../../lib/arionApi';

export function useArionSiteData() {
  const { activeTenantId } = useAppState();
  const { getToken } = useAccessToken();

  const [sites, setSites] = useState<ArionSiteSummary[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<ArionSiteDashboard | null>(null);
  const [loadingSites, setLoadingSites] = useState(false);
  const [loadingDashboard, setLoadingDashboard] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submittingRequest, setSubmittingRequest] = useState(false);

  const apiBaseUrl = import.meta.env.VITE_ARION_API_BASE_URL;

  const refreshSites = useCallback(async () => {
    if (!activeTenantId) {
      setSites([]);
      setSelectedSiteId(null);
      setDashboard(null);
      return;
    }
    if (!apiBaseUrl) {
      setError('VITE_ARION_API_BASE_URL is not configured for the portal build.');
      return;
    }

    setLoadingSites(true);
    setError(null);
    try {
      const token = await getToken();
      const response = await listArionSites({
        baseUrl: apiBaseUrl,
        bearerToken: token.accessToken,
        tenantId: activeTenantId
      });
      setSites(response.sites || []);
      setSelectedSiteId((current) => {
        if (current && response.sites.some((site) => site.siteId === current)) return current;
        return response.sites[0]?.siteId || null;
      });
    } catch (err) {
      if (err instanceof ArionApiError) {
        setError(err.status === 403 ? 'ARION is not enabled for this tenant yet.' : `ARION API error (${err.status}).`);
        console.error('arion-api error body:', err.body);
      } else {
        console.error(err);
        setError('Unexpected error while loading ARION sites.');
      }
      setSites([]);
      setSelectedSiteId(null);
      setDashboard(null);
    } finally {
      setLoadingSites(false);
    }
  }, [activeTenantId, apiBaseUrl, getToken]);

  const refreshDashboard = useCallback(
    async (siteId: string | null) => {
      if (!siteId || !activeTenantId || !apiBaseUrl) {
        setDashboard(null);
        return;
      }

      setLoadingDashboard(true);
      setError(null);
      try {
        const token = await getToken();
        const response = await getArionDashboard({
          baseUrl: apiBaseUrl,
          bearerToken: token.accessToken,
          tenantId: activeTenantId,
          siteId
        });
        setDashboard(response);
      } catch (err) {
        if (err instanceof ArionApiError) {
          setError(err.status === 404 ? 'The selected ARION site was not found.' : `ARION API error (${err.status}).`);
          console.error('arion-api error body:', err.body);
        } else {
          console.error(err);
          setError('Unexpected error while loading the ARION site dashboard.');
        }
        setDashboard(null);
      } finally {
        setLoadingDashboard(false);
      }
    },
    [activeTenantId, apiBaseUrl, getToken]
  );

  useEffect(() => {
    refreshSites();
  }, [refreshSites]);

  useEffect(() => {
    if (!selectedSiteId) {
      setDashboard(null);
      return;
    }
    refreshDashboard(selectedSiteId);
  }, [selectedSiteId, refreshDashboard]);

  const selectedSite = useMemo(
    () => sites.find((site) => site.siteId === selectedSiteId) || null,
    [selectedSiteId, sites]
  );

  const submitRequest = useCallback(
    async (params: { siteId: string; requestType: string; notes: string }) => {
      if (!activeTenantId || !apiBaseUrl) return;
      setSubmittingRequest(true);
      setError(null);
      try {
        const token = await getToken();
        await createArionRequest({
          baseUrl: apiBaseUrl,
          bearerToken: token.accessToken,
          tenantId: activeTenantId,
          siteId: params.siteId,
          requestType: params.requestType,
          notes: params.notes
        });
        await refreshDashboard(params.siteId);
        await refreshSites();
      } catch (err) {
        if (err instanceof ArionApiError) {
          setError(`Unable to create request (${err.status}).`);
          console.error('arion-api error body:', err.body);
        } else {
          console.error(err);
          setError('Unexpected error while creating the ARION request.');
        }
        throw err;
      } finally {
        setSubmittingRequest(false);
      }
    },
    [activeTenantId, apiBaseUrl, getToken, refreshDashboard, refreshSites]
  );

  return {
    sites,
    selectedSiteId,
    selectedSite,
    setSelectedSiteId,
    dashboard,
    loading: loadingSites || loadingDashboard,
    error,
    refresh: async () => {
      await refreshSites();
      if (selectedSiteId) await refreshDashboard(selectedSiteId);
    },
    submitRequest,
    submittingRequest
  };
}
