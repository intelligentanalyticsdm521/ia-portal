import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAppState } from '../app/AppState';
import { useAccessToken } from '../auth/useAccessToken';
import { getViewAsTenantId } from '../lib/viewAsTenant';
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
  markAppleClaimed as portalMarkAppleClaimed,
  connectGoogle as portalConnectGoogle,
  getEditorLink as portalGetEditorLink,
  getAdminLink as portalGetAdminLink,
  createSeoProject as portalCreateSeoProject,
  linkSeoProject as portalLinkSeoProject,
  createArionRequest,
  listArionRequests,
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
  getInsightsMetrics as portalGetInsightsMetrics,
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
  getGbpServices as portalGetGbpServices,
  draftGbpReviewReply as portalDraftGbpReviewReply,
  getGbpAutoReply as portalGetGbpAutoReply,
  setGbpAutoReply as portalSetGbpAutoReply,
  getGbpMedia as portalGetGbpMedia,
  addGbpMedia as portalAddGbpMedia,
  deleteGbpMedia as portalDeleteGbpMedia,
  saveGbpServices as portalSaveGbpServices,
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
  // Phase 3 — SE Ranking expanded
  getSeoRankings as portalGetSeoRankings,
  getSeoAudit as portalGetSeoAudit,
  getSeoAuditPage as portalGetSeoAuditPage,
  getSeoAiSearch as portalGetSeoAiSearch,
  addSeoCompetitor as portalAddSeoCompetitor,
  getSeoCompetitors as portalGetSeoCompetitors,
  getSeoMarketMonitor as portalGetSeoMarketMonitor,
  getMmWatchlist as portalGetMmWatchlist,
  saveMmWatchlist as portalSaveMmWatchlist,
  deleteMmWatch as portalDeleteMmWatch,
  getMmSuggestions as portalGetMmSuggestions,
  type MmSavePageInput,
  getSeoDecay as portalGetSeoDecay,
  getSeoDiagnostic as portalGetSeoDiagnostic,
  getSeoKeywordDetail as portalGetSeoKeywordDetail,
  getSeoOverview as portalGetSeoOverview,
  type SeoRangeCode,
  // IA Plugin data proxy
  getPluginStatus as portalGetPluginStatus,
  getPluginHealth as portalGetPluginHealth,
  getPluginSecurity as portalGetPluginSecurity,
  getPluginPerformance as portalGetPluginPerformance,
  getPluginContentAggregate as portalGetPluginContentAggregate,
  getPluginTheme as portalGetPluginTheme,
  getPluginFormsSummary as portalGetPluginFormsSummary,
  getPluginUpdates as portalGetPluginUpdates,
  getPluginPlugins as portalGetPluginPlugins,
  updatePluginByFile as portalUpdatePluginByFile,
  updateThemeByStylesheet as portalUpdateThemeByStylesheet,
  updateWpCore as portalUpdateWpCore,
  triggerImageOptimize as portalTriggerImageOptimize,
  getPluginWordfenceFull as portalGetPluginWordfenceFull,
  getPluginScanIssues as portalGetPluginScanIssues,
  setPluginWordfenceConfig as portalSetPluginWordfenceConfig,
  purgePluginCache as portalPurgePluginCache,
  getPluginLitespeedConfig as portalGetPluginLitespeedConfig,
  setPluginLitespeedConfig as portalSetPluginLitespeedConfig,
  applyPluginIADefaults as portalApplyPluginIADefaults,
  listGbpLocations as portalListGbpLocations,
  selectGbpLocation as portalSelectGbpLocation,
  disconnectGbp as portalDisconnectGbp,
  // GBP Connect Batch B — client-owned listing creation + verification
  createGbpListing as portalCreateGbpListing,
  getGbpVerificationOptions as portalGetGbpVerificationOptions,
  requestGbpVerification as portalRequestGbpVerification,
  completeGbpVerification as portalCompleteGbpVerification,
  getGbpVerificationStatus as portalGetGbpVerificationStatus,
  type GbpCreateListingInput,
  type GbpVerificationOption,
  // Onboarding V3 Phase 3 — tenant-scoped multi-location store
  listBusinessLocations as portalListBusinessLocations,
  setBusinessLocationPrimary as portalSetBusinessLocationPrimary,
  syncBusinessLocations as portalSyncBusinessLocations,
  getPluginContentPace as portalGetPluginContentPace,
  getPluginContentAgeDist as portalGetPluginContentAgeDist,
  getPluginContentAuthors as portalGetPluginContentAuthors,
  getPluginContentCategories as portalGetPluginContentCategories,
  getPluginContentWordCountDist as portalGetPluginContentWordCountDist,
  getPluginContentActivityCalendar as portalGetPluginContentActivityCalendar,
  getPluginContentSeoDetail as portalGetPluginContentSeoDetail,
  getPluginRiskAnalysis as portalGetPluginRiskAnalysis,
  getPluginSecurityEvents as portalGetPluginSecurityEvents,
  getPluginUpdatesLog as portalGetPluginUpdatesLog,
  getPluginAutoUpdateConfig as portalGetPluginAutoUpdateConfig,
  setPluginAutoUpdateConfig as portalSetPluginAutoUpdateConfig,
  type PluginAutoUpdateToggleBody,
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

  // 2026-06-20 — normalize on lowercase. SQL Server UNIQUEIDENTIFIER
  // round-trips uppercase through the mssql driver, but URL params/
  // localStorage may carry lowercase from copy/paste or older state.
  // A case-sensitive === comparison was causing selectedSite to fall
  // through to sites[0] silently — every dropdown click looked like
  // it "reverted" to intelligentanalyticsdm.com.
  const norm = (s?: string | null) => (s || '').toLowerCase();

  // Persist across page navigation. Brandon's complaint: selection
  // didn't survive clicking from Overview to SEO etc. because the
  // SubNav uses <NavLink to={item.route}> which drops query strings.
  // localStorage keyed on tenant_id is the cleanest fix — survives
  // bookmarks, navigation, and tab refreshes.
  //
  // Bug fix 2026-06-26: When the founder is in view-as mode, the
  // effective tenant is the client they're viewing, NOT
  // `useAppState().activeTenantId` (which stays pinned to the founder's
  // home tenant). Previously the key was always built from the founder
  // tenant id, so a site_id picked while view-as'ing client A got
  // persisted under the founder's slot — and the next session,
  // regardless of which client was being viewed, read that stale id.
  // The visible symptom was "every tenant ARION view shows Briarwood
  // Dental." Now we scope the key to the effective tenant so each
  // client gets its own slot.
  const effectiveTenantId = (getViewAsTenantId() || activeTenantId || '').toLowerCase();
  const storageKey = effectiveTenantId ? `arion.activeSiteId.${effectiveTenantId}` : null;
  const urlSiteId = searchParams.get('siteId');
  const storedSiteId = storageKey ? (typeof window !== 'undefined' ? localStorage.getItem(storageKey) : null) : null;
  const selectedSiteId = urlSiteId || storedSiteId;

  const selectedSite = useMemo(
    () => sites.find((site) => norm(site.siteId) === norm(selectedSiteId)) || sites[0] || null,
    [selectedSiteId, sites],
  );

  const setSelectedSiteId = useCallback(
    (siteId: string) => {
      const next = new URLSearchParams(searchParams);
      next.set('siteId', siteId);
      setSearchParams(next, { replace: true });
      if (storageKey && typeof window !== 'undefined') {
        try { localStorage.setItem(storageKey, siteId); } catch { /* quota or private mode — ok */ }
      }
    },
    [searchParams, setSearchParams, storageKey],
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

      // 2026-06-20 — also normalize on lowercase here. Match the
      // selectedSite memo above so a real stored selection isn't
      // mistakenly considered "missing" + reset to sites[0].
      const current = searchParams.get('siteId') || (storageKey ? localStorage.getItem(storageKey) : null);
      if (!current && nextSites[0]?.siteId) {
        const next = new URLSearchParams(searchParams);
        next.set('siteId', nextSites[0].siteId);
        setSearchParams(next, { replace: true });
        if (storageKey) {
          try { localStorage.setItem(storageKey, nextSites[0].siteId); } catch { /* ignore */ }
        }
      } else if (current && !nextSites.some((site) => norm(site.siteId) === norm(current)) && nextSites[0]?.siteId) {
        const next = new URLSearchParams(searchParams);
        next.set('siteId', nextSites[0].siteId);
        setSearchParams(next, { replace: true });
        if (storageKey) {
          try { localStorage.setItem(storageKey, nextSites[0].siteId); } catch { /* ignore */ }
        }
      } else if (current && !searchParams.get('siteId')) {
        // Hydrate URL from localStorage so deep-linkable URLs stay correct.
        const next = new URLSearchParams(searchParams);
        next.set('siteId', current);
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

      /**
       * Apple Business Connect — manual claim flow. No OAuth/API exists, so
       * the tenant (or founder helping them) clicks "Mark as Claimed" in
       * BusinessAppleOverview after finishing signup at register.apple.com/business.
       * Pass `claimed: false` to UNMARK (e.g. they lost ownership).
       */
      async markAppleClaimed(siteId: string, claimed: boolean = true) {
        const b = await base();
        return portalMarkAppleClaimed({ ...b, siteId, claimed });
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

      /* Phase 3 — SE Ranking expanded endpoints */
      async getSeoRankings(siteId: string, opts?: { range?: SeoRangeCode; provider?: 'all' | 'google' | 'bing'; device?: 'all' | 'desktop' | 'mobile' }) {
        const b = await base();
        return portalGetSeoRankings({ ...b, siteId, range: opts?.range, provider: opts?.provider, device: opts?.device });
      },

      async getSeoKeywordDetail(siteId: string, keywordId: string | number, range?: SeoRangeCode) {
        const b = await base();
        return portalGetSeoKeywordDetail({ ...b, siteId, keywordId, range });
      },

      async getSeoOverview(siteId: string, range?: SeoRangeCode) {
        const b = await base();
        return portalGetSeoOverview({ ...b, siteId, range });
      },

      async getSeoAudit(siteId: string) {
        const b = await base();
        return portalGetSeoAudit({ ...b, siteId });
      },

      async getSeoAuditPage(siteId: string, pageId: string) {
        const b = await base();
        return portalGetSeoAuditPage({ ...b, siteId, pageId });
      },

      async getSeoAiSearch(siteId: string, range?: string) {
        const b = await base();
        return portalGetSeoAiSearch({ ...b, siteId, range });
      },

      async addSeoCompetitor(siteId: string, domain: string) {
        const b = await base();
        return portalAddSeoCompetitor({ ...b, siteId, domain });
      },

      async getSeoCompetitors(siteId: string) {
        const b = await base();
        return portalGetSeoCompetitors({ ...b, siteId });
      },

      async getSeoMarketMonitor(siteId: string, windowDays?: number) {
        const b = await base();
        return portalGetSeoMarketMonitor({ ...b, siteId, windowDays });
      },

      async getMmWatchlist(siteId: string) {
        const b = await base();
        return portalGetMmWatchlist({ ...b, siteId });
      },

      async saveMmWatchlist(siteId: string, pages: MmSavePageInput[]) {
        const b = await base();
        return portalSaveMmWatchlist({ ...b, siteId, pages });
      },

      async deleteMmWatch(siteId: string, watchId: string) {
        const b = await base();
        return portalDeleteMmWatch({ ...b, siteId, watchId });
      },

      async getMmSuggestions(siteId: string) {
        const b = await base();
        return portalGetMmSuggestions({ ...b, siteId });
      },

      async getSeoDecay(siteId: string) {
        const b = await base();
        return portalGetSeoDecay({ ...b, siteId });
      },

      async getSeoDiagnostic(siteId: string) {
        const b = await base();
        return portalGetSeoDiagnostic({ ...b, siteId });
      },

      // ── IA Plugin data proxy ──
      async getPluginStatus(siteId: string) { const b = await base(); return portalGetPluginStatus({ ...b, siteId }); },
      async getPluginHealth(siteId: string) { const b = await base(); return portalGetPluginHealth({ ...b, siteId }); },
      async getPluginSecurity(siteId: string) { const b = await base(); return portalGetPluginSecurity({ ...b, siteId }); },
      async getPluginPerformance(siteId: string) { const b = await base(); return portalGetPluginPerformance({ ...b, siteId }); },
      async getPluginContentAggregate(siteId: string) { const b = await base(); return portalGetPluginContentAggregate({ ...b, siteId }); },
      async getPluginTheme(siteId: string) { const b = await base(); return portalGetPluginTheme({ ...b, siteId }); },
      async getPluginFormsSummary(siteId: string) { const b = await base(); return portalGetPluginFormsSummary({ ...b, siteId }); },
      async getPluginUpdates(siteId: string) { const b = await base(); return portalGetPluginUpdates({ ...b, siteId }); },
      async getPluginPlugins(siteId: string) { const b = await base(); return portalGetPluginPlugins({ ...b, siteId }); },
      async updatePluginByFile(siteId: string, pluginFile: string) { const b = await base(); return portalUpdatePluginByFile({ ...b, siteId, plugin: pluginFile }); },
      async updateThemeByStylesheet(siteId: string, stylesheet: string) { const b = await base(); return portalUpdateThemeByStylesheet({ ...b, siteId, stylesheet }); },
      async updateWpCore(siteId: string) { const b = await base(); return portalUpdateWpCore({ ...b, siteId }); },
      async triggerImageOptimize(siteId: string) { const b = await base(); return portalTriggerImageOptimize({ ...b, siteId }); },

      // v2.0.7 analytics-first plugin data
      async getPluginWordfenceFull(siteId: string) { const b = await base(); return portalGetPluginWordfenceFull({ ...b, siteId }); },
      async getPluginScanIssues(siteId: string) { const b = await base(); return portalGetPluginScanIssues({ ...b, siteId }); },
      async setPluginWordfenceConfig(siteId: string, body: Record<string, boolean>) { const b = await base(); return portalSetPluginWordfenceConfig({ ...b, siteId, body }); },
      async purgePluginCache(siteId: string) { const b = await base(); return portalPurgePluginCache({ ...b, siteId }); },
      async getPluginLitespeedConfig(siteId: string) { const b = await base(); return portalGetPluginLitespeedConfig({ ...b, siteId }); },
      async setPluginLitespeedConfig(siteId: string, body: { settings?: Record<string, any>; apply_ia_defaults?: boolean }) { const b = await base(); return portalSetPluginLitespeedConfig({ ...b, siteId, body }); },
      async applyPluginIADefaults(siteId: string) { const b = await base(); return portalApplyPluginIADefaults({ ...b, siteId }); },
      async listGbpLocations(siteId: string, showAll?: boolean) { const b = await base(); return portalListGbpLocations({ ...b, siteId, showAll }); },
      async selectGbpLocation(siteId: string, locationName: string) { const b = await base(); return portalSelectGbpLocation({ ...b, siteId, locationName }); },
      async disconnectGbp(siteId: string) { const b = await base(); return portalDisconnectGbp({ ...b, siteId }); },

      // GBP Connect Batch B — client-owned listing creation + in-ARION
      // verification (options → request → PIN complete → status poll).
      async createGbpListing(siteId: string, body: GbpCreateListingInput) { const b = await base(); return portalCreateGbpListing({ ...b, siteId, body }); },
      async getGbpVerificationOptions(siteId: string) { const b = await base(); return portalGetGbpVerificationOptions({ ...b, siteId }); },
      async requestGbpVerification(siteId: string, option: GbpVerificationOption | string) { const b = await base(); return portalRequestGbpVerification({ ...b, siteId, option }); },
      async completeGbpVerification(siteId: string, verificationName: string, pin: string) { const b = await base(); return portalCompleteGbpVerification({ ...b, siteId, verificationName, pin }); },
      async getGbpVerificationStatus(siteId: string) { const b = await base(); return portalGetGbpVerificationStatus({ ...b, siteId }); },
      // ── Onboarding V3 Phase 3 — tenant-wide multi-location store ──
      async listBusinessLocations() { const b = await base(); return portalListBusinessLocations(b); },
      async setBusinessLocationPrimary(locationId: string) { const b = await base(); return portalSetBusinessLocationPrimary({ ...b, locationId }); },
      async syncBusinessLocations(siteId?: string | null) { const b = await base(); return portalSyncBusinessLocations({ ...b, siteId: siteId || null }); },
      async getPluginContentPace(siteId: string) { const b = await base(); return portalGetPluginContentPace({ ...b, siteId }); },
      async getPluginContentAgeDist(siteId: string) { const b = await base(); return portalGetPluginContentAgeDist({ ...b, siteId }); },
      async getPluginContentAuthors(siteId: string) { const b = await base(); return portalGetPluginContentAuthors({ ...b, siteId }); },
      async getPluginContentCategories(siteId: string) { const b = await base(); return portalGetPluginContentCategories({ ...b, siteId }); },
      async getPluginContentWordCountDist(siteId: string) { const b = await base(); return portalGetPluginContentWordCountDist({ ...b, siteId }); },
      async getPluginContentActivityCalendar(siteId: string) { const b = await base(); return portalGetPluginContentActivityCalendar({ ...b, siteId }); },
      async getPluginContentSeoDetail(siteId: string) { const b = await base(); return portalGetPluginContentSeoDetail({ ...b, siteId }); },
      async getPluginRiskAnalysis(siteId: string) { const b = await base(); return portalGetPluginRiskAnalysis({ ...b, siteId }); },
      async getPluginSecurityEvents(siteId: string, limit?: number) { const b = await base(); return portalGetPluginSecurityEvents({ ...b, siteId, limit }); },
      async getPluginUpdatesLog(siteId: string) { const b = await base(); return portalGetPluginUpdatesLog({ ...b, siteId }); },
      async getPluginAutoUpdateConfig(siteId: string) { const b = await base(); return portalGetPluginAutoUpdateConfig({ ...b, siteId }); },
      async setPluginAutoUpdateConfig(siteId: string, body: PluginAutoUpdateToggleBody) { const b = await base(); return portalSetPluginAutoUpdateConfig({ ...b, siteId, body }); },

      async submitRequest(siteId: string, requestType: string, notes: string) {
        const b = await base();
        return createArionRequest({ ...b, siteId, requestType, notes });
      },

      async listRequests(siteId: string) {
        const b = await base();
        return listArionRequests({ ...b, siteId });
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

      async getInsightsMetrics(siteId: string, months?: number) {
        const b = await base();
        return portalGetInsightsMetrics({ ...b, siteId, months });
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
      async getGbpServices(siteId: string) {
        const b = await base();
        return portalGetGbpServices({ ...b, siteId });
      },
      async draftGbpReviewReply(siteId: string, review: { reviewId: string; reviewerName?: string; starRating?: number; comment?: string | null }) {
        const b = await base();
        return portalDraftGbpReviewReply({ ...b, siteId, ...review });
      },
      async getGbpAutoReply(siteId: string) {
        const b = await base();
        return portalGetGbpAutoReply({ ...b, siteId });
      },
      async setGbpAutoReply(siteId: string, enabled: boolean, minStars: number) {
        const b = await base();
        return portalSetGbpAutoReply({ ...b, siteId, enabled, minStars });
      },
      async getGbpMedia(siteId: string) {
        const b = await base();
        return portalGetGbpMedia({ ...b, siteId });
      },
      async addGbpMedia(siteId: string, sourceUrl: string, category?: string) {
        const b = await base();
        return portalAddGbpMedia({ ...b, siteId, sourceUrl, category });
      },
      async deleteGbpMedia(siteId: string, mediaId: string) {
        const b = await base();
        return portalDeleteGbpMedia({ ...b, siteId, mediaId });
      },
      async saveGbpServices(siteId: string, services: Array<Record<string, any>>) {
        const b = await base();
        return portalSaveGbpServices({ ...b, siteId, services });
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

      /* SE Ranking productization 2026-06-17 — keyword research, mgmt, AI prompts */
      async researchKeyword(siteId: string, seed: string, opts?: { region?: string; limit?: number }) {
        const b = await base();
        const { researchKeyword } = await import('../lib/arionApi');
        return researchKeyword({ ...b, siteId, seed, region: opts?.region, limit: opts?.limit });
      },

      async getTrackedKeywords(siteId: string) {
        const b = await base();
        const { getTrackedKeywords } = await import('../lib/arionApi');
        return getTrackedKeywords({ ...b, siteId });
      },

      async addTrackedKeywords(siteId: string, keywords: string[], groupId?: number) {
        const b = await base();
        const { addTrackedKeywords } = await import('../lib/arionApi');
        return addTrackedKeywords({ ...b, siteId, keywords, groupId });
      },

      async removeTrackedKeywords(siteId: string, keywordIds: number[]) {
        const b = await base();
        const { removeTrackedKeywords } = await import('../lib/arionApi');
        return removeTrackedKeywords({ ...b, siteId, keywordIds });
      },

      async getAIPrompts(siteId: string) {
        const b = await base();
        const { getAIPrompts } = await import('../lib/arionApi');
        return getAIPrompts({ ...b, siteId });
      },

      async setupAIPrompts(siteId: string, brand?: string) {
        const b = await base();
        const { setupAIPrompts } = await import('../lib/arionApi');
        return setupAIPrompts({ ...b, siteId, brand });
      },

      async addAIPrompt(siteId: string, prompt: string, engine: string) {
        const b = await base();
        const { addAIPrompt } = await import('../lib/arionApi');
        return addAIPrompt({ ...b, siteId, prompt, engine });
      },

      async removeAIPrompt(siteId: string, k2siteLlmId: string | number, llmId: string | number) {
        const b = await base();
        const { removeAIPrompt } = await import('../lib/arionApi');
        return removeAIPrompt({ ...b, siteId, k2siteLlmId, llmId });
      },

      /* AI Website Builder — Phase 1 (2026-06-20) */
      async generateBlock(siteId: string, kind: string, context?: Record<string, any>) {
        const b = await base();
        const { generateBlock } = await import('../lib/arionApi');
        return generateBlock({ ...b, siteId, kind: kind as any, context });
      },

      async listDrafts(siteId: string, opts?: { accepted?: boolean; kind?: string }) {
        const b = await base();
        const { listBlockDrafts } = await import('../lib/arionApi');
        return listBlockDrafts({ ...b, siteId, opts: opts as any });
      },

      async acceptDraft(siteId: string, draftBlockId: string) {
        const b = await base();
        const { acceptBlockDraft } = await import('../lib/arionApi');
        return acceptBlockDraft({ ...b, siteId, draftBlockId });
      },

      async assemblePage(siteId: string, params: { pageId?: string | number | null; draftBlockIds: string[] }) {
        const b = await base();
        const { assembleBlocks } = await import('../lib/arionApi');
        return assembleBlocks({ ...b, siteId, pageId: params.pageId, draftBlockIds: params.draftBlockIds });
      },

      /* Site builder — Pages + the section-list editor (Phase 1A, 2026-09-05).
         Reads and writes the live WordPress page through the plugin's site
         token. On every ARION tier (W-4); none of these spend credits. */
      async listSitePages(siteId: string) {
        const b = await base();
        const { listSitePages } = await import('../lib/arionApi');
        return listSitePages({ ...b, siteId });
      },

      async getSitePageSections(siteId: string, pageId: number) {
        const b = await base();
        const { getSitePageSections } = await import('../lib/arionApi');
        return getSitePageSections({ ...b, siteId, pageId });
      },

      async saveSitePageSections(
        siteId: string,
        pageId: number,
        params: {
          sections: Array<{ fields: any; node: any }>;
          title?: string;
          status?: string;
          /** ARGUS suggestions this save carries; stamped applied only if it lands. */
          proposalIds?: string[];
        },
      ) {
        const b = await base();
        const { saveSitePageSections } = await import('../lib/arionApi');
        return saveSitePageSections({ ...b, siteId, pageId, ...params });
      },

      async previewSitePage(
        siteId: string,
        pageId: number,
        params: { sections: Array<{ fields: any; node: any }>; title?: string },
      ) {
        const b = await base();
        const { previewSitePage } = await import('../lib/arionApi');
        return previewSitePage({ ...b, siteId, pageId, ...params });
      },

      async undoSitePage(siteId: string, pageId: number) {
        const b = await base();
        const { undoSitePage } = await import('../lib/arionApi');
        return undoSitePage({ ...b, siteId, pageId });
      },

      async createSitePage(siteId: string, params: { title: string; sections: Array<{ kind: string }> }) {
        const b = await base();
        const { createSitePage } = await import('../lib/arionApi');
        return createSitePage({ ...b, siteId, ...params });
      },

      /* Adoption (Phase 3) — making a section that was built on the website
         itself editable from here. The preview writes nothing; the adopt is
         refused without the fingerprint the preview handed back, so nothing
         can be adopted that nobody looked at. None of these spend credits. */
      async adoptSectionPreview(
        siteId: string, pageId: number, index: number, fixes?: Record<string, string>,
      ) {
        const b = await base();
        const { adoptSectionPreview } = await import('../lib/arionApi');
        return adoptSectionPreview({ ...b, siteId, pageId, index, fixes });
      },

      async adoptSection(
        siteId: string, pageId: number, index: number,
        params: { fingerprint: string; fixes?: Record<string, string> },
      ) {
        const b = await base();
        const { adoptSection } = await import('../lib/arionApi');
        return adoptSection({ ...b, siteId, pageId, index, ...params });
      },

      async undoSectionAdoption(siteId: string, pageId: number, adoptionId: string) {
        const b = await base();
        const { undoSectionAdoption } = await import('../lib/arionApi');
        return undoSectionAdoption({ ...b, siteId, pageId, adoptionId });
      },

      async listSectionAdoptions(siteId: string, pageId: number) {
        const b = await base();
        const { listSectionAdoptions } = await import('../lib/arionApi');
        return listSectionAdoptions({ ...b, siteId, pageId });
      },

      async buildSiteSection(siteId: string, kind: string, blueprintId?: string) {
        const b = await base();
        const { buildSiteSection } = await import('../lib/arionApi');
        return buildSiteSection({ ...b, siteId, kind, blueprintId });
      },

      async getSectionLibrary(siteId: string) {
        const b = await base();
        const { getSectionLibrary } = await import('../lib/arionApi');
        return getSectionLibrary({ ...b, siteId });
      },

      async uploadSiteMedia(
        siteId: string,
        params: { filename?: string; contentType?: string; dataBase64?: string; url?: string; alt?: string },
      ) {
        const b = await base();
        const { uploadSiteMedia } = await import('../lib/arionApi');
        return uploadSiteMedia({ ...b, siteId, ...params });
      },

      /* Pictures (Phase 2). The library read is what lets the picker offer
         what the site already has instead of sending a client to wp-admin. */
      async listSiteMedia(siteId: string, params: { page?: number; perPage?: number; search?: string } = {}) {
        const b = await base();
        const { listSiteMedia } = await import('../lib/arionApi');
        return listSiteMedia({ ...b, siteId, ...params });
      },

      async setSiteMediaAlt(siteId: string, attachmentId: number, alt: string) {
        const b = await base();
        const { setSiteMediaAlt } = await import('../lib/arionApi');
        return setSiteMediaAlt({ ...b, siteId, attachmentId, alt });
      },

      /* "Ask ARGUS to change it" (Phase 1B). These PROPOSE and cost credits;
         nothing here writes to the website. An approved proposal leaves via
         saveSitePageSections with its proposalIds, so the audit row is stamped
         only once the write has actually landed. */
      async aiEditSection(
        siteId: string,
        pageId: number,
        params: { handle: string; index: number; instruction: string; section: { fields: any; node: any } },
      ) {
        const b = await base();
        const { aiEditSection } = await import('../lib/arionApi');
        return aiEditSection({ ...b, siteId, pageId, ...params });
      },

      async aiEditPage(
        siteId: string,
        pageId: number,
        params: { instruction: string; sections: Array<{ fields: any; node: any }> },
      ) {
        const b = await base();
        const { aiEditPage } = await import('../lib/arionApi');
        return aiEditPage({ ...b, siteId, pageId, ...params });
      },

      async discardSiteProposal(siteId: string, proposalId: string) {
        const b = await base();
        const { discardSiteProposal } = await import('../lib/arionApi');
        return discardSiteProposal({ ...b, siteId, proposalId });
      },

      async getSiteAiPricing(siteId: string) {
        const b = await base();
        const { getSiteAiPricing } = await import('../lib/arionApi');
        return getSiteAiPricing({ ...b, siteId });
      },

      /* ARION pack 1 — the jobs that had no Portal home at all: a page's
         address and layout, which page is the home page, deleting a page, its
         SEO fields, swapping a section's look, and the two picture jobs. All of
         them go through the plugin on the site token; none of them spend
         credits. */
      async getSitePageSettings(siteId: string, pageId: number) {
        const b = await base();
        const { getSitePageSettings } = await import('../lib/arionApi');
        return getSitePageSettings({ ...b, siteId, pageId });
      },

      async saveSitePageSettings(
        siteId: string,
        pageId: number,
        params: { slug?: string; template?: string; parentId?: number; makeHomePage?: boolean },
      ) {
        const b = await base();
        const { saveSitePageSettings } = await import('../lib/arionApi');
        return saveSitePageSettings({ ...b, siteId, pageId, ...params });
      },

      async trashSitePage(siteId: string, pageId: number) {
        const b = await base();
        const { trashSitePage } = await import('../lib/arionApi');
        return trashSitePage({ ...b, siteId, pageId });
      },

      async restoreSitePage(siteId: string, pageId: number) {
        const b = await base();
        const { restoreSitePage } = await import('../lib/arionApi');
        return restoreSitePage({ ...b, siteId, pageId });
      },

      async getSitePageSeo(siteId: string, pageId: number) {
        const b = await base();
        const { getSitePageSeo } = await import('../lib/arionApi');
        return getSitePageSeo({ ...b, siteId, pageId });
      },

      async saveSitePageSeo(
        siteId: string,
        pageId: number,
        params: { title?: string; description?: string; focusKeyword?: string },
      ) {
        const b = await base();
        const { saveSitePageSeo } = await import('../lib/arionApi');
        return saveSitePageSeo({ ...b, siteId, pageId, ...params });
      },

      async swapSectionLook(
        siteId: string,
        params: { kind: string; blueprintId: string; fields: Record<string, any> },
      ) {
        const b = await base();
        const { swapSectionLook } = await import('../lib/arionApi');
        return swapSectionLook({ ...b, siteId, ...params });
      },

      async getSiteMediaUsage(siteId: string, attachmentId: number) {
        const b = await base();
        const { getSiteMediaUsage } = await import('../lib/arionApi');
        return getSiteMediaUsage({ ...b, siteId, attachmentId });
      },

      async deleteSiteMedia(siteId: string, attachmentId: number) {
        const b = await base();
        const { deleteSiteMedia } = await import('../lib/arionApi');
        return deleteSiteMedia({ ...b, siteId, attachmentId });
      },

      async replaceSiteMedia(
        siteId: string,
        attachmentId: number,
        params: { dataBase64?: string; url?: string; alt?: string },
      ) {
        const b = await base();
        const { replaceSiteMedia } = await import('../lib/arionApi');
        return replaceSiteMedia({ ...b, siteId, attachmentId, ...params });
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
