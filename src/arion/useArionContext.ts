import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAppState } from '../app/AppState';
import { useAccessToken } from '../auth/useAccessToken';
import {
  ArionApiError,
  type ArionSiteSummary,
  listArionSites,
  getArionOverview,
  getHosting,
  getWebsiteAnalytics,
  getConsoleReport,
  getSeo,
  getMyBusiness,
  updateGoogleBusiness,
  updateLinkedBusinessProfile,
  connectGoogle as portalConnectGoogle,
  getEditorLink as portalGetEditorLink,
  getAdminLink as portalGetAdminLink,
  createSeoProject as portalCreateSeoProject,
  linkSeoProject as portalLinkSeoProject,
  createArionRequest,
  getForms as portalGetForms,
  getBookings as portalGetBookings,
  getGbpProfile as portalGetGbpProfile,
  getGbpInsights as portalGetGbpInsights,
  getGbpReviews as portalGetGbpReviews,
  replyToReview as portalReplyToReview,
  getGscData as portalGetGscData,
  getSeoSummary as portalGetSeoSummary,
  getSiteDetail as portalGetSiteDetail,
  getSearchPerformance as portalGetSearchPerformance,
  inspectUrl as portalInspectUrl,
  submitUrlForIndexing as portalSubmitUrlForIndexing,
  getSearchSitemaps as portalGetSearchSitemaps,
  submitSitemap as portalSubmitSitemap,
  getCoreWebVitals as portalGetCoreWebVitals,
  getBusinessOverview as portalGetBusinessOverview,
  getBusinessPosts as portalGetBusinessPosts,
  createBusinessPost as portalCreateBusinessPost,
  getBusinessServices as portalGetBusinessServices,
  getAnalyticsReport as portalGetAnalyticsReport,
  generateSitemap as portalGenerateSitemap,
  getBingIndexingStats as portalGetBingIndexingStats,
  verifyBingKey as portalVerifyBingKey,
  getBingStatus as portalGetBingStatus,
  disconnectBing as portalDisconnectBing,
  getBingPerformance as portalGetBingPerformance,
  getBingQueries as portalGetBingQueries,
  // GBP Phase 1 live routes
  getGbpBusiness as portalGetGbpBusiness,
  getGbpReviewsLive as portalGetGbpReviewsLive,
  getGbpInsightsLive as portalGetGbpInsightsLive,
  getGbpPostsLive as portalGetGbpPostsLive,
  getGbpQanda as portalGetGbpQanda,
  updateGbpBusiness as portalUpdateGbpBusiness,
  createGbpPost as portalCreateGbpPost,
  deleteGbpPost as portalDeleteGbpPost,
  replyGbpReview as portalReplyGbpReview,
  deleteGbpReviewReply as portalDeleteGbpReviewReply,
  answerGbpQuestion as portalAnswerGbpQuestion,
  getIndexNowStatus as portalGetIndexNowStatus,
  generateIndexNowKey as portalGenerateIndexNowKey,
  verifyIndexNowKey as portalVerifyIndexNowKey,
  deleteIndexNowKey as portalDeleteIndexNowKey,
  getIndexNowSubmissions as portalGetIndexNowSubmissions,
  createDnsRecords as portalCreateDnsRecords,
  deleteDnsRecords as portalDeleteDnsRecords,
  runPageSpeed as portalRunPageSpeed,
  getContentSeo as portalGetContentSeo,
  updateContentSeo as portalUpdateContentSeo,
  getVulnerabilities as portalGetVulnerabilities,
  submitConsultingInquiry as portalSubmitConsultingInquiry,
  getPagespeedHistory as portalGetPagespeedHistory,
} from '../lib/arionApi';

/**
 * Bridge hook: exposes the same interface as the standalone ARION `useArionSites()`
 * plus an `arionApi` object matching the standalone `createArionApi` shape so that
 * ARION pages can work unchanged inside the Portal.
 */
export function useArionContext() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { activeTenantId } = useAppState();
  const { getToken } = useAccessToken();
  const [sites, setSites] = useState<ArionSiteSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const apiBaseUrl = import.meta.env.VITE_ARION_API_BASE_URL as string;

  const selectedSiteId = searchParams.get('siteId');

  const selectedSite = useMemo(
    () => sites.find((site) => site.siteId === selectedSiteId) || sites[0] || null,
    [selectedSiteId, sites],
  );

  const setSelectedSiteId = useCallback(
    (siteId: string) => {
      const next = new URLSearchParams(searchParams);
      next.set('siteId', siteId);
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
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
        tenantId: activeTenantId,
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
        setError(err.status === 403 ? 'ARION is not enabled for this tenant.' : `ARION API error (${err.status}).`);
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

  // ---------------------------------------------------------------------------
  // Build the arionApi object that mirrors the standalone createArionApi shape.
  // Token is cached for 4 minutes to prevent concurrent MSAL iframe acquisitions.
  // ---------------------------------------------------------------------------
  const arionApi = useMemo(() => {
    let cachedToken: string | null = null;
    let tokenExpiresAt = 0;
    let tokenPromise: Promise<string> | null = null;

    async function getTokenCached(): Promise<string> {
      if (cachedToken && Date.now() < tokenExpiresAt) return cachedToken;
      // Deduplicate concurrent token requests
      if (tokenPromise) return tokenPromise;
      tokenPromise = (async () => {
        try {
          const result = await getToken();
          cachedToken = result.accessToken;
          tokenExpiresAt = Date.now() + 4 * 60 * 1000; // cache 4 min
          return cachedToken;
        } finally {
          tokenPromise = null;
        }
      })();
      return tokenPromise;
    }

    async function base() {
      const bearerToken = await getTokenCached();
      return { baseUrl: apiBaseUrl, bearerToken, tenantId: activeTenantId! };
    }

    return {
      async listSites() {
        const b = await base();
        return listArionSites(b);
      },

      async getOverview(siteId?: string) {
        const b = await base();
        return getArionOverview({ ...b, siteId });
      },

      async getHosting(siteId: string) {
        const b = await base();
        return getHosting({ ...b, siteId });
      },

      async getAnalytics(provider: string, siteId: string) {
        const b = await base();
        return getWebsiteAnalytics({ ...b, siteId, provider: provider as 'google' | 'bing' });
      },

      async getConsole(provider: string, siteId: string) {
        const b = await base();
        return getConsoleReport({ ...b, siteId, provider: provider as 'google' | 'bing' });
      },

      async getSeo(siteId: string) {
        const b = await base();
        return getSeo({ ...b, siteId });
      },

      async getMyBusiness(provider: string, siteId: string) {
        const b = await base();
        return getMyBusiness({ ...b, siteId, provider: provider as 'google' | 'apple' | 'bing' });
      },

      async updateMyBusiness(provider: string, siteId: string, body: Record<string, any>) {
        const b = await base();
        if (provider === 'google') {
          return updateGoogleBusiness({ ...b, siteId, body });
        }
        return updateLinkedBusinessProfile({ ...b, siteId, provider: provider as 'apple' | 'bing', body });
      },

      async connectGoogle(siteId: string, returnUrl: string) {
        const b = await base();
        return portalConnectGoogle({ ...b, siteId, setupMode: 'ARION_AUTO_SETUP', returnUrl });
      },

      async getEditorLink(siteId: string) {
        const b = await base();
        return portalGetEditorLink({ ...b, siteId });
      },

      async getAdminLink(siteId: string) {
        const b = await base();
        return portalGetAdminLink({ ...b, siteId });
      },

      async createSeoProject(siteId: string, projectName?: string) {
        const b = await base();
        return portalCreateSeoProject({ ...b, siteId, body: projectName ? { projectName } : {} });
      },

      async linkSeoProject(siteId: string, projectId: string) {
        const b = await base();
        return portalLinkSeoProject({ ...b, siteId, body: { projectId } });
      },

      async submitRequest(siteId: string, requestType: string, notes: string) {
        const b = await base();
        return createArionRequest({ ...b, siteId, requestType, notes });
      },

      async getForms(siteId: string) {
        const b = await base();
        return portalGetForms({ ...b, siteId });
      },

      async getBookings(siteId: string) {
        const b = await base();
        return portalGetBookings({ ...b, siteId });
      },

      async getGbpProfile(siteId: string) {
        const b = await base();
        return portalGetGbpProfile({ ...b, siteId });
      },

      async getGbpInsights(siteId: string) {
        const b = await base();
        return portalGetGbpInsights({ ...b, siteId });
      },

      async getGbpReviews(siteId: string) {
        const b = await base();
        return portalGetGbpReviews({ ...b, siteId });
      },

      async replyToReview(siteId: string, reviewId: string, replyText: string) {
        const b = await base();
        return portalReplyToReview({ ...b, siteId, reviewId, replyText });
      },

      async getGscData(siteId: string, days?: number) {
        const b = await base();
        return portalGetGscData({ ...b, siteId, days });
      },

      async getSeoSummary(siteId: string) {
        const b = await base();
        return portalGetSeoSummary({ ...b, siteId });
      },

      async getSiteDetail(siteId: string) {
        const b = await base();
        return portalGetSiteDetail({ ...b, siteId });
      },

      async getSearchPerformance(provider: string, siteId: string, opts?: { period?: number; groupBy?: string; days?: number }) {
        const b = await base();
        return portalGetSearchPerformance({ ...b, siteId, provider, period: opts?.period, groupBy: opts?.groupBy, days: opts?.days });
      },

      async inspectUrl(siteId: string, url: string) {
        const b = await base();
        return portalInspectUrl({ ...b, siteId, url });
      },

      async submitUrlForIndexing(siteId: string, url: string) {
        const b = await base();
        return portalSubmitUrlForIndexing({ ...b, siteId, url });
      },

      async getSearchSitemaps(provider: string, siteId: string) {
        const b = await base();
        return portalGetSearchSitemaps({ ...b, siteId, provider });
      },

      async submitSitemap(siteId: string, sitemapUrl: string) {
        const b = await base();
        return portalSubmitSitemap({ ...b, siteId, sitemapUrl });
      },

      async getCoreWebVitals(siteId: string) {
        const b = await base();
        return portalGetCoreWebVitals({ ...b, siteId });
      },

      async getBingIndexingStats(siteId: string) {
        const b = await base();
        return portalGetBingIndexingStats({ ...b, siteId });
      },
      // Bing Phase 2
      async verifyBingKey(siteId: string, apiKey: string, siteUrl?: string) {
        const b = await base();
        return portalVerifyBingKey({ ...b, siteId, apiKey, siteUrl });
      },
      async getBingStatus(siteId: string) {
        const b = await base();
        return portalGetBingStatus({ ...b, siteId });
      },
      async disconnectBing(siteId: string) {
        const b = await base();
        return portalDisconnectBing({ ...b, siteId });
      },
      async getBingPerformance(siteId: string, period?: number) {
        const b = await base();
        return portalGetBingPerformance({ ...b, siteId, period });
      },
      async getBingQueries(siteId: string) {
        const b = await base();
        return portalGetBingQueries({ ...b, siteId });
      },

      // GBP Phase 1 live routes
      async getGbpBusiness(siteId: string) {
        const b = await base();
        return portalGetGbpBusiness({ ...b, siteId });
      },
      async getGbpReviewsLive(siteId: string) {
        const b = await base();
        return portalGetGbpReviewsLive({ ...b, siteId });
      },
      async getGbpInsightsLive(siteId: string, period?: number) {
        const b = await base();
        return portalGetGbpInsightsLive({ ...b, siteId, period });
      },
      async getGbpPostsLive(siteId: string) {
        const b = await base();
        return portalGetGbpPostsLive({ ...b, siteId });
      },
      async getGbpQanda(siteId: string) {
        const b = await base();
        return portalGetGbpQanda({ ...b, siteId });
      },
      async updateGbpBusiness(siteId: string, body: Record<string, any>) {
        const b = await base();
        return portalUpdateGbpBusiness({ ...b, siteId, body });
      },
      async createGbpPost(siteId: string, body: Record<string, any>) {
        const b = await base();
        return portalCreateGbpPost({ ...b, siteId, body });
      },
      async deleteGbpPost(siteId: string, postId: string) {
        const b = await base();
        return portalDeleteGbpPost({ ...b, siteId, postId });
      },
      async replyGbpReview(siteId: string, reviewId: string, comment: string) {
        const b = await base();
        return portalReplyGbpReview({ ...b, siteId, reviewId, comment });
      },
      async deleteGbpReviewReply(siteId: string, reviewId: string) {
        const b = await base();
        return portalDeleteGbpReviewReply({ ...b, siteId, reviewId });
      },
      async answerGbpQuestion(siteId: string, questionId: string, text: string) {
        const b = await base();
        return portalAnswerGbpQuestion({ ...b, siteId, questionId, text });
      },
      async getIndexNowStatus(siteId: string) {
        const b = await base();
        return portalGetIndexNowStatus({ ...b, siteId });
      },
      async generateIndexNowKey(siteId: string) {
        const b = await base();
        return portalGenerateIndexNowKey({ ...b, siteId });
      },
      async verifyIndexNowKey(siteId: string) {
        const b = await base();
        return portalVerifyIndexNowKey({ ...b, siteId });
      },
      async deleteIndexNowKey(siteId: string) {
        const b = await base();
        return portalDeleteIndexNowKey({ ...b, siteId });
      },
      async getIndexNowSubmissions(siteId: string, limit?: number) {
        const b = await base();
        return portalGetIndexNowSubmissions({ ...b, siteId, limit });
      },

      async getBusinessOverview(provider: string, siteId: string) {
        const b = await base();
        return portalGetBusinessOverview({ ...b, siteId, provider });
      },

      async getBusinessPosts(siteId: string) {
        const b = await base();
        return portalGetBusinessPosts({ ...b, siteId });
      },

      async createBusinessPost(siteId: string, body: Record<string, any>) {
        const b = await base();
        return portalCreateBusinessPost({ ...b, siteId, body });
      },

      async getBusinessServices(siteId: string) {
        const b = await base();
        return portalGetBusinessServices({ ...b, siteId });
      },

      async getAnalyticsReport(siteId: string, reportType: string) {
        const b = await base();
        return portalGetAnalyticsReport({ ...b, siteId, reportType });
      },

      async generateSitemap(siteId: string) {
        const b = await base();
        return portalGenerateSitemap({ ...b, siteId });
      },

      async createDnsRecords(siteId: string, records: Array<{ type: string; name: string; content: string; ttl?: number }>, overwrite?: boolean) {
        const b = await base();
        return portalCreateDnsRecords({ ...b, siteId, records, overwrite });
      },

      async deleteDnsRecords(siteId: string, records: Array<{ type: string; name: string; content: string }>) {
        const b = await base();
        return portalDeleteDnsRecords({ ...b, siteId, records });
      },

      async runPageSpeed(siteId: string, strategy?: string) {
        const b = await base();
        return portalRunPageSpeed({ ...b, siteId, strategy });
      },

      async getContentSeo(siteId: string) {
        const b = await base();
        return portalGetContentSeo({ ...b, siteId });
      },

      async updateContentSeo(siteId: string, postId: string, fields: Record<string, string>) {
        const b = await base();
        return portalUpdateContentSeo({ ...b, siteId, postId, fields });
      },

      async getVulnerabilities(siteId: string) {
        const b = await base();
        return portalGetVulnerabilities({ ...b, siteId });
      },

      async submitConsultingInquiry(siteId: string, serviceType: string, description: string, triggerPage: string, contactPref?: string) {
        const b = await base();
        return portalSubmitConsultingInquiry({ ...b, siteId, serviceType, description, triggerPage, contactPref });
      },

      async getPagespeedHistory(siteId: string) {
        const b = await base();
        return portalGetPagespeedHistory({ ...b, siteId });
      },
    };
  }, [activeTenantId, apiBaseUrl, getToken]);

  return {
    sites,
    selectedSite,
    selectedSiteId: selectedSite?.siteId || null,
    activeSiteId: selectedSite?.siteId || null,
    setActiveSiteId: setSelectedSiteId,
    setSelectedSiteId,
    loading,
    error,
    refresh,
    arionApi,
  };
}

export type ArionApi = ReturnType<typeof useArionContext>['arionApi'];
