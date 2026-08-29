import { lazy, Suspense, useMemo } from 'react';
import { ForgeLinePage } from './forge/ForgeLinePage';
import { LEGACY_FORGE_ROUTES } from './forge/forgeSoftware';
import { Navigate, useLocation, useParams } from 'react-router-dom';
import { useIsFounder } from '../hooks/useIsFounder';
import { SERVICE_VISIBILITY } from '../components/SubNav';
import { isGatedProduct, isRoutable, requirementLabel } from '../components/navVisibility';
import { useNavAddons } from '../hooks/useNavAddons';
import FeatureLocked from '../components/FeatureLocked';
import { productColor, productOfServiceKey } from '../config/productTheme';
import { useProductTier } from '../hooks/useProductTier';

// Lazy-load a named React export so it's compatible with React.lazy
// (which expects { default: Component }). Lets each service section
// code-split into its own chunk, keeping users who only visit one
// product (e.g. ARION-only) from downloading the others.
function lazyNamed<T extends Record<string, unknown>>(
  loader: () => Promise<T>,
  name: keyof T,
) {
  // Use `any` so callers can pass the original component's props through
  // at the JSX call site (e.g. <ArionOverviewPage service={...} />).
  // The underlying component is unchanged, so prop checks still happen
  // inside its own implementation.
  return lazy(() =>
    loader().then((m) => ({ default: m[name] as React.ComponentType<any> })),
  );
}
import { useAppState } from '../app/AppState';
import { SERVICE_CATALOG, resolveServiceStatus, type PortalService, type ServiceStatus } from '../config/serviceCatalog';
// ArionPageWrapper stays static — it's a small shared frame used by every
// ARION page below. Lazy-loading it would just add a network round-trip
// without saving bytes.
import { ArionPageWrapper } from '../arion/ArionPageWrapper';
import { PageErrorBoundary } from '../components/PageErrorBoundary';
import { ComingSoonBanner } from '../components/ComingSoonBanner';


// Business Profile un-gated 2026-07-22 — GBP Connect (client-owned OAuth +
// create + in-portal verification) shipped and walked; the 2026-06-28
// coming-soon wrapper is retired (Brandon's call during the GBP walk).

// IA Insights gated 2026-06-28 — entire stack behind Coming Soon pending model
// audit (SCOPE_WORKING.md F-Onb-D8). No tenant has 30+ days of data; model is
// mis-labeling Platform/Trend and producing math that doesn't reconcile.
// Target re-enable: EOM July 2026. IAInsightsHeader itself short-circuits to
// the same banner; this wrapper covers the page chrome so users see one
// consistent message even if a sub-section forgets to render the header.
function withInsightsComingSoon(page: React.ReactNode) {
  return (
    <>
      <ComingSoonBanner
        feature="Your IA Insights are collecting data"
        detail="Once we have 30 days of activity for your business, your insights will be available here. We'll let you know as soon as they're ready."
      />
      {page}
    </>
  );
}

// ARION pages — lazy-loaded; each becomes its own chunk
const ArionOverviewPage = lazyNamed(() => import('./arion/ArionOverviewPage'), 'ArionOverviewPage');
// ArionOnboardingPage removed 2026-06-17 — unified flow via UnifiedSetupCard on Command Center.
const ArionOnboardingPage = () => <Navigate to="/app" replace />;
// Website
const WebsiteOverview = lazyNamed(() => import('../arion/pages/website/WebsiteOverview'), 'WebsiteOverview');
const WebsiteContent = lazyNamed(() => import('../arion/pages/website/WebsiteContent'), 'WebsiteContent');
const WebsiteAiBuilder = lazyNamed(() => import('../arion/pages/website/WebsiteAiBuilder'), 'WebsiteAiBuilder');
const ContentSeoOverview = lazyNamed(() => import('../arion/pages/website/ContentSeoOverview'), 'ContentSeoOverview');
// ContentSeoPages / ContentSeoPosts / ContentSeoSchema removed 2026-04-21 —
// consolidated into the single Content SEO Overview storytelling page with
// an internal "See Full Details" modal (tabs for Pages, Posts, Issues).
const SecurityOverview = lazyNamed(() => import('../arion/pages/website/SecurityOverview'), 'SecurityOverview');
const SecurityVulnerabilities = lazyNamed(() => import('../arion/pages/website/SecurityVulnerabilities'), 'SecurityVulnerabilities');
const PerformanceCache = lazyNamed(() => import('../arion/pages/website/PerformanceCache'), 'PerformanceCache');
const PerformanceImages = lazyNamed(() => import('../arion/pages/website/PerformanceImages'), 'PerformanceImages');
const WebsiteUpdates = lazyNamed(() => import('../arion/pages/website/WebsiteUpdates'), 'WebsiteUpdates');
const WebsiteStaging = lazyNamed(() => import('../arion/pages/website/WebsiteStaging'), 'WebsiteStaging');
const WebsiteSupport = lazyNamed(() => import('../arion/pages/website/WebsiteSupport'), 'WebsiteSupport');
const WebsiteSettings = lazyNamed(() => import('../arion/pages/website/WebsiteSettings'), 'WebsiteSettings');
// Hosting
const HostingOverview = lazyNamed(() => import('../arion/pages/hosting/HostingOverview'), 'HostingOverview');
const HostingDomainDns = lazyNamed(() => import('../arion/pages/hosting/HostingDomainDns'), 'HostingDomainDns');
const HostingBackups = lazyNamed(() => import('../arion/pages/hosting/HostingBackups'), 'HostingBackups');
const HostingPerformance = lazyNamed(() => import('../arion/pages/hosting/HostingPerformance'), 'HostingPerformance');
// Analytics
const AnalyticsOverview = lazyNamed(() => import('../arion/pages/analytics/AnalyticsOverview'), 'AnalyticsOverview');
const AnalyticsTraffic = lazyNamed(() => import('../arion/pages/analytics/AnalyticsTraffic'), 'AnalyticsTraffic');
const AnalyticsAudience = lazyNamed(() => import('../arion/pages/analytics/AnalyticsAudience'), 'AnalyticsAudience');
const AnalyticsContent = lazyNamed(() => import('../arion/pages/analytics/AnalyticsContent'), 'AnalyticsContent');
const AnalyticsConversions = lazyNamed(() => import('../arion/pages/analytics/AnalyticsConversions'), 'AnalyticsConversions');
const AnalyticsPages = lazyNamed(() => import('../arion/pages/analytics/AnalyticsPages'), 'AnalyticsPages');
const AnalyticsReports = lazyNamed(() => import('../arion/pages/analytics/AnalyticsReports'), 'AnalyticsReports');
const IAInsightsCrossPlatform = lazyNamed(() => import('../arion/pages/analytics/IAInsightsCrossPlatform'), 'IAInsightsCrossPlatform');
const IAInsightsReports = lazyNamed(() => import('../arion/pages/analytics/IAInsightsReports'), 'IAInsightsReports');
// SEO
const SeoOverview = lazyNamed(() => import('../arion/pages/seo/SeoOverview'), 'SeoOverview');
const SeoRankings = lazyNamed(() => import('../arion/pages/seo/SeoRankings'), 'SeoRankings');
const SeoSiteAudit = lazyNamed(() => import('../arion/pages/seo/SeoSiteAudit'), 'SeoSiteAudit');
const SeoCompetitors = lazyNamed(() => import('../arion/pages/seo/SeoCompetitors'), 'SeoCompetitors');
const SeoAiSearch = lazyNamed(() => import('../arion/pages/seo/SeoAiSearch'), 'SeoAiSearch');
const SeoMarketMonitor = lazyNamed(() => import('../arion/pages/seo/SeoMarketMonitor'), 'SeoMarketMonitor');
const SeoReports = lazyNamed(() => import('../arion/pages/seo/SeoReports'), 'SeoReports');
const SeoKeywords = lazyNamed(() => import('../arion/pages/seo/SeoKeywords'), 'SeoKeywords');
const SeoAIPrompts = lazyNamed(() => import('../arion/pages/seo/SeoAIPrompts'), 'SeoAIPrompts');
// Search
const SearchPerformance = lazyNamed(() => import('../arion/pages/search/SearchPerformance'), 'SearchPerformance');
const SearchIndexing = lazyNamed(() => import('../arion/pages/search/SearchIndexing'), 'SearchIndexing');
const SearchBingCopilot = lazyNamed(() => import('../arion/pages/search/SearchBingCopilot'), 'SearchBingCopilot');
const SearchBingIndexNow = lazyNamed(() => import('../arion/pages/search/SearchBingIndexNow'), 'SearchBingIndexNow');
// Business
const BusinessOverview = lazyNamed(() => import('../arion/pages/business/BusinessOverview'), 'BusinessOverview');
const BusinessLocations = lazyNamed(() => import('../arion/pages/business/BusinessLocations'), 'BusinessLocations');
const BusinessReviews = lazyNamed(() => import('../arion/pages/business/BusinessReviews'), 'BusinessReviews');
const BusinessInsights = lazyNamed(() => import('../arion/pages/business/BusinessInsights'), 'BusinessInsights');
const BusinessPosts = lazyNamed(() => import('../arion/pages/business/BusinessPosts'), 'BusinessPosts');
const BusinessServices = lazyNamed(() => import('../arion/pages/business/BusinessServices'), 'BusinessServices');
const BusinessBingOverview = lazyNamed(() => import('../arion/pages/business/BusinessBingOverview'), 'BusinessBingOverview');
const BusinessAppleOverview = lazyNamed(() => import('../arion/pages/business/BusinessAppleOverview'), 'BusinessAppleOverview');
// Brand — the old BrandPage "Coming soon" stub is retired; arion_brand now
// redirects to Image Studio (no overview page — Brandon 2026-07-21).
// v5.x IA Insights architecture — Health, Trends, Intelligence, Cross-Platform (ARGUS)
const ArionIAInsightsHealthPage = lazyNamed(() => import('../arion/pages/iainsights/ArionIAInsightsHealthPage'), 'ArionIAInsightsHealthPage');
const ArionIAInsightsTrendsPage = lazyNamed(() => import('../arion/pages/iainsights/ArionIAInsightsTrendsPage'), 'ArionIAInsightsTrendsPage');
const ArionIAInsightsReportsPage = lazyNamed(() => import('../arion/pages/iainsights/ArionIAInsightsReportsPage'), 'ArionIAInsightsReportsPage');
const ArionIAInsightsIntelligencePage = lazyNamed(() => import('../arion/pages/iainsights/ArionIAInsightsIntelligencePage'), 'ArionIAInsightsIntelligencePage');
const ArionServiceAreaPage = lazyNamed(() => import('../arion/pages/iainsights/ArionServiceAreaPage'), 'ArionServiceAreaPage');
const ArgusIAInsightsPage = lazyNamed(() => import('./argus/ArgusIAInsightsPage'), 'ArgusIAInsightsPage');
const ArgusHealthPage = lazyNamed(() => import('./argus/ArgusHealthPage'), 'ArgusHealthPage');
const ArgusTrendsPage = lazyNamed(() => import('./argus/ArgusTrendsPage'), 'ArgusTrendsPage');
const ArgusIntelligencePage = lazyNamed(() => import('./argus/ArgusIntelligencePage'), 'ArgusIntelligencePage');
const ArgusWorkflowAutomationsPage = lazyNamed(() => import('./argus/ArgusWorkflowAutomationsPage'), 'ArgusWorkflowAutomationsPage');
// 2026-07-25 v13.0: the old platform-api grid page
// (ArgusIAInsightsIntelligencePage) is no longer routed — all ARGUS
// Intelligence keys (argus_intelligence / argus_cross_platform /
// argus_cross_channel) resolve to the mirror-model ArgusIntelligencePage.
const SparkIAInsightsHealthPage = lazyNamed(() => import('./spark/SparkIAInsightsHealthPage'), 'SparkIAInsightsHealthPage');
const SparkIAInsightsTrendsPage = lazyNamed(() => import('./spark/SparkIAInsightsTrendsPage'), 'SparkIAInsightsTrendsPage');
const SparkIAInsightsReportsPage = lazyNamed(() => import('./spark/SparkIAInsightsReportsPage'), 'SparkIAInsightsReportsPage');
const ReportsHubPage = lazyNamed(() => import('../components/insights/ReportsHubPage'), 'ReportsHubPage');
const SparkIAInsightsIntelligencePage = lazyNamed(() => import('./spark/SparkIAInsightsIntelligencePage'), 'SparkIAInsightsIntelligencePage');
const OliverIAInsightsHealthPage = lazyNamed(() => import('./oliver/OliverIAInsightsHealthPage'), 'OliverIAInsightsHealthPage');
const OliverIAInsightsTrendsPage = lazyNamed(() => import('./oliver/OliverIAInsightsTrendsPage'), 'OliverIAInsightsTrendsPage');
const OliverIAInsightsReportsPage = lazyNamed(() => import('./oliver/OliverIAInsightsReportsPage'), 'OliverIAInsightsReportsPage');
const OliverIAInsightsIntelligencePage = lazyNamed(() => import('./oliver/OliverIAInsightsIntelligencePage'), 'OliverIAInsightsIntelligencePage');

// MY BRAND pages — re-added 2026-07-18 (Item 1 Task 3). The 10 pages under
// src/pages/myBrand/* were built + merged but unrouted since 2026-06-22;
// re-registered here + in serviceCatalog + the MY_BRAND dispatch block below.
// (No My Brand overview page — arion_brand redirects to Image Studio. 2026-07-21.)
const MyBrandImageStudioPage = lazyNamed(() => import('./myBrand/ImageStudioPage'), 'ImageStudioPage');
const MyBrandVoicePage = lazyNamed(() => import('./myBrand/VoicePage'), 'VoicePage');
const MyBrandTemplateStudioPage = lazyNamed(() => import('./myBrand/TemplateStudioPage'), 'TemplateStudioPage');
const MyBrandAssetLibraryPage = lazyNamed(() => import('./myBrand/AssetLibraryPage'), 'AssetLibraryPage');
const MyBrandSocialChannelsPage = lazyNamed(() => import('./myBrand/SocialChannelsPage'), 'SocialChannelsPage');
const MyBrandSocialComposerPage = lazyNamed(() => import('./myBrand/SocialComposerPage'), 'SocialComposerPage');
const MyBrandSocialCalendarPage = lazyNamed(() => import('./myBrand/SocialCalendarPage'), 'SocialCalendarPage');
const MyBrandSocialContentPage = lazyNamed(() => import('./myBrand/SocialContentPage'), 'SocialContentPage');
const MyBrandSocialReportPage = lazyNamed(() => import('./myBrand/SocialReportPage'), 'SocialReportPage');
// SocialAnalyticsPage + SocialApprovalsPage intentionally NOT routed (IA
// re-cut 2026-07-21): analytics → ARION IA Insights; approvals → Consulting.

// SPARK / LUMEN pages — lazy-loaded
const SparkOverviewPage = lazyNamed(() => import('./spark/SparkOverviewPage'), 'SparkOverviewPage');
const SparkContactsPage = lazyNamed(() => import('./spark/SparkContactsPage'), 'SparkContactsPage');
const SparkListsPage = lazyNamed(() => import('./spark/SparkListsPage'), 'SparkListsPage');
const SparkSegmentsPage = lazyNamed(() => import('./spark/SparkSegmentsPage'), 'SparkSegmentsPage');
const SparkCampaignsPage = lazyNamed(() => import('./spark/SparkCampaignsPage'), 'SparkCampaignsPage');
const SparkFormsPage = lazyNamed(() => import('./spark/SparkFormsPage'), 'SparkFormsPage');
const SparkAutomationsPage = lazyNamed(() => import('./spark/SparkAutomationsPage'), 'SparkAutomationsPage');
// Unified Lead Inbox (2026-06-25) — single tabbed page hosting Lead Inbox +
// Suppressed Domains + Territories. The three legacy route keys
// (spark_leads, spark_lead_suppression, spark_lead_territories) all resolve
// to this component with the appropriate initial tab so deep links + ARGUS
// CTAs keep working without redirect hops. SparkLeadsPage / SparkLead-
// SuppressionPage / SparkTerritoriesPage files are retained on disk for
// reference but no longer mounted.
const SparkLeadInboxPage = lazyNamed(() => import('./spark/SparkLeadInboxPage'), 'SparkLeadInboxPage');
const SparkSearchProfilesPage = lazyNamed(() => import('./spark/SparkSearchProfilesPage'), 'SparkSearchProfilesPage');
const SparkIntelligencePage = lazyNamed(() => import('./spark/SparkIntelligencePage'), 'SparkIntelligencePage');
const SparkContactScoringPage = lazyNamed(() => import('./spark/SparkContactScoringPage'), 'SparkContactScoringPage');
const SparkUsagePage = lazyNamed(() => import('./spark/SparkUsagePage'), 'SparkUsagePage');
const SparkUsageReportPage = lazyNamed(() => import('./spark/SparkUsageReportPage'), 'SparkUsageReportPage');
// SPARK Pro
const SparkPipelinesPage = lazyNamed(() => import('./spark/SparkPipelinesPage'), 'SparkPipelinesPage');
const SparkDealsPage = lazyNamed(() => import('./spark/SparkDealsPage'), 'SparkDealsPage');
const SparkNpsPage = lazyNamed(() => import('./spark/SparkNpsPage'), 'SparkNpsPage');
const SparkQrCodesPage = lazyNamed(() => import('./spark/SparkQrCodesPage'), 'SparkQrCodesPage');
const SparkReferralsPage = lazyNamed(() => import('./spark/SparkReferralsPage'), 'SparkReferralsPage');
const SparkSocialPage = lazyNamed(() => import('./spark/SparkSocialPage'), 'SparkSocialPage');
const SparkNewsletterPage = lazyNamed(() => import('./spark/SparkNewsletterPage'), 'SparkNewsletterPage');
const SparkCalendarPage = lazyNamed(() => import('./spark/SparkCalendarPage'), 'SparkCalendarPage');
// SPARK Business
const SparkLandingPagesPage = lazyNamed(() => import('./spark/SparkLandingPagesPage'), 'SparkLandingPagesPage');
const SparkReviewsPage = lazyNamed(() => import('./spark/SparkReviewsPage'), 'SparkReviewsPage');
const SparkAccountsPage = lazyNamed(() => import('./spark/SparkAccountsPage'), 'SparkAccountsPage');
const SparkAiWriterPage = lazyNamed(() => import('./spark/SparkAiWriterPage'), 'SparkAiWriterPage');
// SPARK Insights
const SparkInsightsPage = lazyNamed(() => import('./spark/SparkInsightsPage'), 'SparkInsightsPage');
const SparkActivityStreamPage = lazyNamed(() => import('./spark/SparkActivityStreamPage'), 'SparkActivityStreamPage');
const SparkHealthScorePage = lazyNamed(() => import('./spark/SparkHealthScorePage'), 'SparkHealthScorePage');
const SparkDashboardsPage = lazyNamed(() => import('./spark/SparkDashboardsPage'), 'SparkDashboardsPage');
const SparkAnalyticsReportsPage = lazyNamed(() => import('./spark/SparkAnalyticsReportsPage'), 'SparkAnalyticsReportsPage');
const SparkContactBulkPage = lazyNamed(() => import('./spark/SparkContactBulkPage'), 'SparkContactBulkPage');
// SPARK v1.0 additions
const SparkApprovalsPage = lazyNamed(() => import('./spark/SparkApprovalsPage'), 'SparkApprovalsPage');
const SparkSmsInboxPage = lazyNamed(() => import('./spark/SparkSmsInboxPage'), 'SparkSmsInboxPage');
const SparkSmsCampaignsPage = lazyNamed(() => import('./spark/SparkSmsCampaignsPage'), 'SparkSmsCampaignsPage');
const SparkDeliverabilityPage = lazyNamed(() => import('./spark/SparkDeliverabilityPage'), 'SparkDeliverabilityPage');
const SparkAbTestsPage = lazyNamed(() => import('./spark/SparkAbTestsPage'), 'SparkAbTestsPage');
// SparkLeadSuppressionPage + SparkTerritoriesPage replaced by SparkLeadInboxPage
// tabs (2026-06-25). The standalone page files still exist on disk for
// reference / rollback; if you need to revert, re-add the lazyNamed imports
// here and point the spark_lead_suppression / spark_lead_territories cases
// at them again.
const SparkAutoTagRulesPage = lazyNamed(() => import('./spark/SparkAutoTagRulesPage'), 'SparkAutoTagRulesPage');
const SparkCompetitorWatchPage = lazyNamed(() => import('./spark/SparkCompetitorWatchPage'), 'SparkCompetitorWatchPage');
const SparkScoringRulesPage = lazyNamed(() => import('./spark/SparkScoringRulesPage'), 'SparkScoringRulesPage');
const SparkRoutingRulesPage = lazyNamed(() => import('./spark/SparkRoutingRulesPage'), 'SparkRoutingRulesPage');
const SparkAttributionPage = lazyNamed(() => import('./spark/SparkAttributionPage'), 'SparkAttributionPage');
const SparkStellaPage = lazyNamed(() => import('./spark/SparkStellaPage'), 'SparkStellaPage');
const SparkScheduledReportsPage = lazyNamed(() => import('./spark/SparkScheduledReportsPage'), 'SparkScheduledReportsPage');
const SparkAudienceSyncPage = lazyNamed(() => import('./spark/SparkAudienceSyncPage'), 'SparkAudienceSyncPage');
const SparkJourneyBuilderPage = lazyNamed(() => import('./spark/SparkJourneyBuilderPage'), 'SparkJourneyBuilderPage');
const SparkTrackingPage = lazyNamed(() => import('./spark/SparkTrackingPage'), 'SparkTrackingPage');
const SparkSenderDomainsPage = lazyNamed(() => import('./spark/SparkSenderDomainsPage'), 'SparkSenderDomainsPage');
// SPARK Composer v1.1 (2026-06-24) — Senders + Signatures CRUD live in
// the Settings hub alongside Sender Domains.
const SparkSendersPage = lazyNamed(() => import('./spark/SparkSendersPage'), 'SparkSendersPage');
const SparkSignaturesPage = lazyNamed(() => import('./spark/SparkSignaturesPage'), 'SparkSignaturesPage');
// SparkOnboardingPage removed 2026-06-17 — unified flow via UnifiedSetupCard on Command Center.
const SparkOnboardingPage = () => <Navigate to="/app" replace />;
const SparkAccountProfilePage = lazyNamed(() => import('./spark/SparkAccountProfilePage'), 'SparkAccountProfilePage');
const SparkTemplatesPage = lazyNamed(() => import('./spark/SparkTemplatesPage'), 'SparkTemplatesPage');
const SparkRulesPage = lazyNamed(() => import('./spark/SparkRulesPage'), 'SparkRulesPage');
// Phase 3A merger — unified Workflows + Rules list page.
const SparkWorkflowsAutomationsPage = lazyNamed(() => import('./spark/SparkWorkflowsAutomationsPage'), 'SparkWorkflowsAutomationsPage');
const SparkAutomationsSimplePage = lazyNamed(() => import('./spark/SparkAutomationsSimplePage'), 'SparkAutomationsSimplePage');
// F-CS.6 Phase 1 admin surface for lumen.spark_task rows (named sub-automations
// invoked via task_call). Backs the F-CS.3 dropdown in the IL Customize editor.
const SparkTasksPage = lazyNamed(() => import('./spark/SparkTasksPage'), 'SparkTasksPage');
const SparkApiKeysPage = lazyNamed(() => import('./spark/SparkApiKeysPage'), 'SparkApiKeysPage');
const SparkWebhooksPage = lazyNamed(() => import('./spark/SparkWebhooksPage'), 'SparkWebhooksPage');
const SparkSmsTemplatesPage = lazyNamed(() => import('./spark/SparkSmsTemplatesPage'), 'SparkSmsTemplatesPage');
const SparkContactImportPage = lazyNamed(() => import('./spark/SparkContactImportPage'), 'SparkContactImportPage');
const SparkInboundWebhooksPage = lazyNamed(() => import('./spark/SparkInboundWebhooksPage'), 'SparkInboundWebhooksPage');
const SparkSecretsPage = lazyNamed(() => import('./spark/SparkSecretsPage'), 'SparkSecretsPage');
const SparkAuditLogPage = lazyNamed(() => import('./spark/SparkAuditLogPage'), 'SparkAuditLogPage');
const SparkCalendarSyncPage = lazyNamed(() => import('./spark/SparkCalendarSyncPage'), 'SparkCalendarSyncPage');
const SparkAnomalyAlertsPage = lazyNamed(() => import('./spark/SparkAnomalyAlertsPage'), 'SparkAnomalyAlertsPage');
const SparkTemplateI18nPage = lazyNamed(() => import('./spark/SparkTemplateI18nPage'), 'SparkTemplateI18nPage');
const SparkContact360Page = lazyNamed(() => import('./spark/SparkContact360Page'), 'SparkContact360Page');
const SparkContactMergePage = lazyNamed(() => import('./spark/SparkContactMergePage'), 'SparkContactMergePage');
const SparkWebhookDeliveriesPage = lazyNamed(() => import('./spark/SparkWebhookDeliveriesPage'), 'SparkWebhookDeliveriesPage');
const SparkSavedSearchesPage = lazyNamed(() => import('./spark/SparkSavedSearchesPage'), 'SparkSavedSearchesPage');
const SparkQuietHoursPage = lazyNamed(() => import('./spark/SparkQuietHoursPage'), 'SparkQuietHoursPage');
const SparkNpsSchedulesPage = lazyNamed(() => import('./spark/SparkNpsSchedulesPage'), 'SparkNpsSchedulesPage');
const SparkCustomFieldsPage = lazyNamed(() => import('./spark/SparkCustomFieldsPage'), 'SparkCustomFieldsPage');
const SparkWorkflowTriggersPage = lazyNamed(() => import('./spark/SparkWorkflowTriggersPage'), 'SparkWorkflowTriggersPage');
const SparkConfigBackupPage = lazyNamed(() => import('./spark/SparkConfigBackupPage'), 'SparkConfigBackupPage');
const SparkServiceCategoryPage = lazyNamed(() => import('./spark/SparkServiceCategoryPage'), 'SparkServiceCategoryPage');
const SparkFormBuilderPage = lazyNamed(() => import('./spark/SparkFormBuilderPage'), 'SparkFormBuilderPage');
const SparkRealtimeMetricsPage = lazyNamed(() => import('./spark/SparkRealtimeMetricsPage'), 'SparkRealtimeMetricsPage');
const SparkApiReferencePage = lazyNamed(() => import('./spark/SparkApiReferencePage'), 'SparkApiReferencePage');
const SparkEngineDocsPage = lazyNamed(() => import('./spark/SparkEngineDocsPage'), 'SparkEngineDocsPage');
const SparkSmokeTestPage = lazyNamed(() => import('./spark/SparkSmokeTestPage'), 'SparkSmokeTestPage');

// OLIVER pages — lazy-loaded (introduced 2026-05-11)
const OliverDashboardPage = lazyNamed(() => import('./oliver/OliverDashboardPage'), 'OliverDashboardPage');
const OliverJobBoardPage = lazyNamed(() => import('./oliver/OliverJobBoardPage'), 'OliverJobBoardPage');
const OliverJobsArchivePage = lazyNamed(() => import('./oliver/OliverJobsArchivePage'), 'OliverJobsArchivePage');
const OliverSchedulePage = lazyNamed(() => import('./oliver/OliverSchedulePage'), 'OliverSchedulePage');
const OliverDispatchPage = lazyNamed(() => import('./oliver/OliverDispatchPage'), 'OliverDispatchPage');
const OliverWorkersPage = lazyNamed(() => import('./oliver/OliverWorkersPage'), 'OliverWorkersPage');
const OliverCrewPerformancePage = lazyNamed(() => import('./oliver/OliverCrewPerformancePage'), 'OliverCrewPerformancePage');
const OliverContactsPage = lazyNamed(() => import('./oliver/OliverContactsPage'), 'OliverContactsPage');
const OliverCustomerImportPage = lazyNamed(() => import('./oliver/OliverCustomerImportPage'), 'OliverCustomerImportPage');
const OliverServiceRequestsPage = lazyNamed(() => import('./oliver/OliverServiceRequestsPage'), 'OliverServiceRequestsPage');
const OliverBookingPage = lazyNamed(() => import('./oliver/OliverBookingPage'), 'OliverBookingPage');
const OliverQuotesPage = lazyNamed(() => import('./oliver/OliverQuotesPage'), 'OliverQuotesPage');
const OliverQuotesProposalsPage = lazyNamed(() => import('./oliver/OliverQuotesProposalsPage'), 'OliverQuotesProposalsPage');
const OliverInvoicesPage = lazyNamed(() => import('./oliver/OliverInvoicesPage'), 'OliverInvoicesPage');
const OliverPaymentsPage = lazyNamed(() => import('./oliver/OliverPaymentsPage'), 'OliverPaymentsPage');
const OliverRecurringPage = lazyNamed(() => import('./oliver/OliverRecurringPage'), 'OliverRecurringPage');
const OliverMessagesPage = lazyNamed(() => import('./oliver/OliverMessagesPage'), 'OliverMessagesPage');
const OliverNotificationsPage = lazyNamed(() => import('./oliver/OliverNotificationsPage'), 'OliverNotificationsPage');
const OliverReportsPage = lazyNamed(() => import('./oliver/OliverReportsPage'), 'OliverReportsPage');
const OliverActivityLogPage = lazyNamed(() => import('./oliver/OliverActivityLogPage'), 'OliverActivityLogPage');
const OliverSettingsPage = lazyNamed(() => import('./oliver/OliverSettingsPage'), 'OliverSettingsPage');
const OliverTemplateLibraryPage = lazyNamed(() => import('./oliver/OliverTemplateLibraryPage'), 'OliverTemplateLibraryPage');
const OliverServiceCatalogPage = lazyNamed(() => import('./oliver/OliverServiceCatalogPage'), 'OliverServiceCatalogPage');
const OliverCategoriesPage = lazyNamed(() => import('./oliver/OliverCategoriesPage'), 'OliverCategoriesPage');
const OliverServiceCategoriesPage = lazyNamed(() => import('./oliver/OliverServiceCategoriesPage'), 'OliverServiceCategoriesPage');
const OliverWorkflowSettingsPage = lazyNamed(() => import('./oliver/OliverWorkflowSettingsPage'), 'OliverWorkflowSettingsPage');
const OliverBillingOverviewPage = lazyNamed(() => import('./oliver/OliverBillingOverviewPage'), 'OliverBillingOverviewPage');
const OliverRemindersPage = lazyNamed(() => import('./oliver/OliverRemindersPage'), 'OliverRemindersPage');
// OliverOnboardingPage removed 2026-06-17 — unified flow via UnifiedSetupCard on Command Center.
const OliverOnboardingPage = () => <Navigate to="/app" replace />;
const OliverTeamAccessPage = lazyNamed(() => import('./oliver/OliverTeamAccessPage'), 'OliverTeamAccessPage');
const OliverLocationsPage = lazyNamed(() => import('./oliver/OliverLocationsPage'), 'OliverLocationsPage');
const OliverCouponsPage = lazyNamed(() => import('./oliver/OliverCouponsPage'), 'OliverCouponsPage');
const OliverInsightsPage = lazyNamed(() => import('./oliver/OliverInsightsPage'), 'OliverInsightsPage');
const OliverProjectsPage = lazyNamed(() => import('./oliver/OliverProjectsPage'), 'OliverProjectsPage');
const OliverDisputesPage = lazyNamed(() => import('./oliver/OliverDisputesPage'), 'OliverDisputesPage');
const OliverProposalsPage = lazyNamed(() => import('./oliver/OliverProposalsPage'), 'OliverProposalsPage');
const OliverUsagePage = lazyNamed(() => import('./oliver/OliverUsagePage'), 'OliverUsagePage');
const OliverFeesPage = lazyNamed(() => import('./oliver/OliverFeesPage'), 'OliverFeesPage');
const OliverClientExperiencePage = lazyNamed(() => import('./oliver/OliverClientExperiencePage'), 'OliverClientExperiencePage');
const OliverPortalDesignerPage = lazyNamed(() => import('./oliver/OliverPortalDesignerPage'), 'OliverPortalDesignerPage');
const OliverAutomationsPage = lazyNamed(() => import('./oliver/OliverAutomationsPage'), 'OliverAutomationsPage');
const OliverAddonsPage = lazyNamed(() => import('./oliver/OliverAddonsPage'), 'OliverAddonsPage');
const OliverPortalDomainsPage = lazyNamed(() => import('./oliver/OliverPortalDomainsPage'), 'OliverPortalDomainsPage');
// F-114 — unified portals hub
const OliverPortalsHubPage = lazyNamed(() => import('./oliver/OliverPortalsHubPage'), 'OliverPortalsHubPage');
// #290 Onboarding V3 Phase 3 — constrained WYSIWYG portal customization
// (welcome copy / hero image / brand colors). Scaffolded page; full editor
// ships in the next pass — see file header for what's stubbed.
const PortalCustomizationPage = lazyNamed(() => import('./oliver/PortalCustomizationPage'), 'PortalCustomizationPage');
// OLIVER v1.0 additions
const OliverWorkflowTemplatesPage = lazyNamed(() => import('./oliver/OliverWorkflowTemplatesPage'), 'OliverWorkflowTemplatesPage');
const OliverJobOffersPage = lazyNamed(() => import('./oliver/OliverJobOffersPage'), 'OliverJobOffersPage');
const OliverSupportTicketsPage = lazyNamed(() => import('./oliver/OliverSupportTicketsPage'), 'OliverSupportTicketsPage');
const OliverTimeTrackingPage = lazyNamed(() => import('./oliver/OliverTimeTrackingPage'), 'OliverTimeTrackingPage');
// STELLA — Ledger + Unit Economics 4-nav shell (supersedes the 0.1.0 MLP).
// Five most-complete Ledger surfaces are their own chunks; the remaining live
// shells + Unit Economics share a chunk each; locked Layer-3 keys render the
// STELLA coming-soon sheet.
const StellaOverviewPage = lazyNamed(() => import('./stella/StellaOverviewPage'), 'StellaOverviewPage');
const StellaLedgerInboxPage = lazyNamed(() => import('./stella/StellaLedgerInboxPage'), 'StellaLedgerInboxPage');
const StellaTransactionsPage = lazyNamed(() => import('./stella/StellaTransactionsPage'), 'StellaTransactionsPage');
const StellaCoaPage = lazyNamed(() => import('./stella/StellaCoaPage'), 'StellaCoaPage');
const StellaVendorsPage = lazyNamed(() => import('./stella/StellaVendorsPage'), 'StellaVendorsPage');
const StellaReportsPage = lazyNamed(() => import('./stella/StellaReportsPage'), 'StellaReportsPage');
const StellaComingSoonPage = lazyNamed(() => import('./stella/StellaComingSoonPage'), 'StellaComingSoonPage');
// Live Ledger shells (2026-07-30 consolidation — 8-item nav cap): Mileage &
// Materials is one two-tab page; Bank + Period Close are Settings-hub pages.
const StellaMileageMaterialsPage = lazyNamed(() => import('./stella/StellaLedgerShellPages'), 'StellaMileageMaterialsPage');
const StellaBankPage = lazyNamed(() => import('./stella/StellaBankPage'), 'StellaBankPage');
const StellaPeriodClosePage = lazyNamed(() => import('./stella/StellaLedgerShellPages'), 'StellaPeriodClosePage');
// Unit Economics (Layer 2 — live, scaffolded). Rules + Runs merged into one
// two-tab Allocations page.
const StellaAllocationsPage = lazyNamed(() => import('./stella/StellaUnitEconomicsPages'), 'StellaAllocationsPage');
const StellaMarginsPage = lazyNamed(() => import('./stella/StellaUnitEconomicsPages'), 'StellaMarginsPage');
const StellaReconciliationPage = lazyNamed(() => import('./stella/StellaUnitEconomicsPages'), 'StellaReconciliationPage');
const OliverRescheduleRequestsPage = lazyNamed(() => import('./oliver/OliverRescheduleRequestsPage'), 'OliverRescheduleRequestsPage');
const OliverQuoteOptionsPage = lazyNamed(() => import('./oliver/OliverQuoteOptionsPage'), 'OliverQuoteOptionsPage');
const OliverTerritoriesPage = lazyNamed(() => import('./oliver/OliverTerritoriesPage'), 'OliverTerritoriesPage');
const OliverSlaPoliciesPage = lazyNamed(() => import('./oliver/OliverSlaPoliciesPage'), 'OliverSlaPoliciesPage');
const OliverJobCostingPage = lazyNamed(() => import('./oliver/OliverJobCostingPage'), 'OliverJobCostingPage');
const OliverArgusPage = lazyNamed(() => import('./oliver/OliverArgusPage'), 'OliverArgusPage');
const OliverPayoutsPage = lazyNamed(() => import('./oliver/OliverPayoutsPage'), 'OliverPayoutsPage');
const ArionUsagePage = lazyNamed(() => import('./arion/ArionUsagePage'), 'ArionUsagePage');
const ArionPluginProvisioningPage = lazyNamed(() => import('./arion/ArionPluginProvisioningPage'), 'ArionPluginProvisioningPage');

// CONSULTING — lazy-loaded. 2026-06-29: the founder-side pages
// (ConsultingClientsPage / ConsultingTicketsBoardPage / ConsultingProjectsPage /
// ConsultingOnboardClientPageV2 / ConsultingDocumentLibraryPage) moved to
// /app/admin/consulting/* and are imported by App.tsx directly. Only the
// shared/client-readable consulting surfaces remain in this dispatcher.
const ConsultingOverviewPage = lazyNamed(() => import('./consulting/ConsultingOverviewPage'), 'ConsultingOverviewPage');
// Founder-only agency Overview. The shared page above still serves CLIENTS
// unchanged — this is a branch, not a replacement.
const ConsultingWorkOverviewPage = lazyNamed(() => import('./consulting/ConsultingWorkOverviewPage'), 'ConsultingWorkOverviewPage');
const ConsultingCalendarPage = lazyNamed(() => import('./consulting/ConsultingCalendarPage'), 'ConsultingCalendarPage');
const ConsultingAccessLogPage = lazyNamed(() => import('./consulting/ConsultingAccessLogPage'), 'ConsultingAccessLogPage');
const ConsultingDeliverablesPage = lazyNamed(() => import('./consulting/ConsultingDeliverablesPage'), 'ConsultingDeliverablesPage');

// MY BRAND lazy imports live in the consolidated block near the top of
// this file (the "MY BRAND pages — wave-2 lazy imports" section just below
// the SPARK / OLIVER imports). No additional MY BRAND import lines here —
// sibling-agent attempts to re-import the same modules were collapsed into
// the canonical block to keep the file free of duplicate declarations.

// Shared loading fallback used by every Suspense boundary in this router.
function RouteLoading() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 60, color: '#5A7A8A', fontSize: 13 }}>
      Loading…
    </div>
  );
}

// 2026-06-29 — Founder-side Consulting pages relocated under /app/admin/consulting/*.
// Founders hitting the old /app/services/consulting_* URLs get a 301-style
// redirect; non-founders get bounced to /app/overview (clients have no
// equivalent admin surface).
const CONSULTING_FOUNDER_RELOCATIONS: Record<string, string> = {
  consulting_workspace: '/app/admin/consulting/clients',
  consulting_tickets: '/app/admin/consulting/requests',
  consulting_projects: '/app/admin/consulting/projects',
  consulting_onboard_client: '/app/admin/consulting/onboard-client',
  consulting_documents: '/app/admin/consulting/document-library',
};

function ServiceRouterInner() {
  const { serviceKey } = useParams<{ serviceKey: string }>();
  const { enabledServices } = useAppState();
  const isFounder = useIsFounder();
  const { pathname } = useLocation();
  const actingAsClient = /^\/c\/[0-9a-f-]{8,}/i.test(pathname);
  const effectiveIsFounder = isFounder && !actingAsClient;

  // Old founder-side consulting URLs — relocate to /app/admin/consulting/*.
  // Done before the SERVICE_CATALOG lookup so the redirect fires even if the
  // catalog row gets pruned later.
  if (serviceKey && CONSULTING_FOUNDER_RELOCATIONS[serviceKey]) {
    if (effectiveIsFounder) {
      return <Navigate to={CONSULTING_FOUNDER_RELOCATIONS[serviceKey]} replace />;
    }
    // Non-founders (and founders acting-as-client) bounce to /overview —
    // mirrors RequireFounderRoute behaviour and matches the spec's
    // "404 for clients" choice (we don't render a 404 inside the app shell;
    // overview is the consistent fallback).
    return <Navigate to="/app/overview" replace />;
  }

  const service: PortalService | null = useMemo(
    () => SERVICE_CATALOG.find((s) => s.key === serviceKey) ?? null,
    [serviceKey]
  );

  if (!service) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold text-slate-900">Service not found</h1>
        <p className="mt-2 text-sm text-slate-600">We couldn&apos;t find that service in your portal.</p>
      </div>
    );
  }

  // ── Feature wall (SPARK simplification, 2026-07-30) ──────────────────────
  // The nav hides these, but hiding a LINK doesn't stop a URL. Bookmarks, old
  // deep links and the engagement alerts all navigate by route, so the route
  // has to enforce the same rules or the "cut" surfaces stay reachable.
  // Same declarations the nav reads (SERVICE_VISIBILITY), so the two can't
  // disagree about what a tenant is allowed to see.
  // Locked surfaces still RENDER — ServiceRouter (the exported wrapper below)
  // greys the real page out and floats an explanation card over it. Rendering
  // the genuine UI is the point: a customer should see the thing they don't
  // have, not a placeholder. The API still 403s every call underneath, which
  // is why the overlay blocks interaction.

  const status: ServiceStatus = resolveServiceStatus(service, enabledServices);

  if (service.section === 'ARION') {
    let arionPage: React.ReactNode = null;
    switch (service.key) {
      case 'arion_dashboard': arionPage = <ArionOverviewPage service={service} status={status} />; break;
      case 'arion_onboarding': arionPage = <ArionOnboardingPage />; break;
      case 'arion_website_overview': arionPage = <WebsiteOverview />; break;
      case 'arion_website_content': arionPage = <WebsiteContent />; break;
      case 'arion_website_ai_builder': arionPage = <WebsiteAiBuilder />; break;
      case 'arion_website_content_seo_overview': arionPage = <ContentSeoOverview />; break;
      // Legacy sub-routes — redirect to the consolidated Content SEO Overview
      case 'arion_website_content_seo_pages':
      case 'arion_website_content_seo_posts':
      case 'arion_website_content_seo_schema':
        return <Navigate to="/app/services/arion_website_content_seo_overview" replace />;
      case 'arion_website_security_overview': arionPage = <SecurityOverview />; break;
      case 'arion_website_security_vulnerabilities': arionPage = <SecurityVulnerabilities />; break;
      case 'arion_website_security_firewall': return <Navigate to="/app/services/arion_website_security_overview" replace />;
      case 'arion_website_performance_cache': arionPage = <PerformanceCache />; break;
      case 'arion_website_performance_images': arionPage = <PerformanceImages />; break;
      case 'arion_website_updates': arionPage = <WebsiteUpdates />; break;
      case 'arion_website_staging': arionPage = <WebsiteStaging />; break;
      case 'arion_website_support': arionPage = <WebsiteSupport />; break;
      case 'arion_website_settings': arionPage = <WebsiteSettings />; break;
      case 'arion_hosting_overview': arionPage = <HostingOverview />; break;
      case 'arion_hosting_domain_dns': arionPage = <HostingDomainDns />; break;
      case 'arion_hosting_backups': arionPage = <HostingBackups />; break;
      case 'arion_hosting_performance': arionPage = <HostingPerformance />; break;
      case 'arion_analytics_overview': arionPage = <AnalyticsOverview />; break;
      case 'arion_analytics_traffic': arionPage = <AnalyticsTraffic />; break;
      case 'arion_analytics_audience': arionPage = <AnalyticsAudience />; break;
      case 'arion_analytics_content': arionPage = <AnalyticsContent />; break;
      case 'arion_analytics_conversions': arionPage = <AnalyticsConversions />; break;
      case 'arion_analytics_pages': arionPage = <AnalyticsPages />; break;
      case 'arion_analytics_reports': arionPage = <AnalyticsReports />; break;
      case 'arion_analytics_ia_cross_platform':
      case 'arion_analytics_ia_cross_channel': // legacy alias
        arionPage = <IAInsightsCrossPlatform />; break;
      case 'arion_analytics_ia_reports': arionPage = <IAInsightsReports />; break;
      case 'arion_seo_overview': arionPage = <SeoOverview />; break;
      case 'arion_seo_rankings': arionPage = <SeoRankings />; break;
      case 'arion_seo_site_audit': arionPage = <SeoSiteAudit />; break;
      case 'arion_seo_competitors': arionPage = <SeoCompetitors />; break;
      case 'arion_seo_ai_search': arionPage = <SeoAiSearch />; break;
      case 'arion_seo_keywords': arionPage = <SeoKeywords />; break;
      case 'arion_seo_ai_prompts': arionPage = <SeoAIPrompts />; break;
      case 'arion_seo_market_monitor': arionPage = <SeoMarketMonitor />; break;
      // Opportunities was folded into IA Insights Search Intelligence modal
      // (whitespace + SERP-feature gap sections). Old links redirect to the
      // IA Insights page rather than 404.
      case 'arion_seo_opportunities': return <Navigate to="/app/services/arion_analytics_ia_reports" replace />;
      case 'arion_seo_reports': arionPage = <SeoReports />; break;
      case 'arion_search_performance': arionPage = <SearchPerformance />; break;
      case 'arion_search_indexing': arionPage = <SearchIndexing />; break;
      case 'arion_search_sitemaps': return <Navigate to="/app/services/arion_search_indexing" replace />;
      case 'arion_search_core_web_vitals': return <Navigate to="/app/services/arion_website_performance_cache" replace />;
      case 'arion_search_bing_copilot': arionPage = <SearchBingCopilot />; break;
      case 'arion_search_bing_indexnow': arionPage = <SearchBingIndexNow />; break;
      case 'arion_business_overview': arionPage = <BusinessOverview />; break;
      case 'arion_business_locations': arionPage = <BusinessLocations />; break;
      case 'arion_business_reviews': arionPage = <BusinessReviews />; break;
      case 'arion_business_insights': arionPage = <BusinessInsights />; break;
      case 'arion_business_posts': arionPage = <BusinessPosts />; break;
      case 'arion_business_services': arionPage = <BusinessServices />; break;
      case 'arion_business_bing_overview': arionPage = <BusinessBingOverview />; break;
      case 'arion_business_apple_overview': arionPage = <BusinessAppleOverview />; break;
      // My Brand has NO overview page (Brandon 2026-07-21) — the section
      // lands on Image Studio. arion_brand kept as a redirect so old links,
      // the catalog row, and Settings-era bookmarks keep working.
      case 'arion_brand':
        return <Navigate to="/app/services/my_brand_image_studio" replace />;
      // v5.x IA Insights architecture
      case 'arion_ia_insights_health': arionPage = <ArionIAInsightsHealthPage />; break;
      case 'arion_ia_insights_trends': arionPage = <ArionIAInsightsTrendsPage />; break;
      case 'arion_ia_insights_reports': arionPage = <ArionIAInsightsReportsPage />; break;
      case 'arion_ia_insights_intelligence': arionPage = <ArionIAInsightsIntelligencePage />; break;
      case 'arion_service_area': arionPage = <ArionServiceAreaPage />; break;
      case 'arion_usage': arionPage = <ArionUsagePage service={service} status={status} />; break;
      case 'arion_plugin_provisioning': arionPage = <ArionPluginProvisioningPage service={service} status={status} />; break;
      default: break;
    }
    if (arionPage) {
      return (
        <PageErrorBoundary scope={`arion/${service.key}`}>
          <Suspense fallback={<RouteLoading />}>
            <ArionPageWrapper>{arionPage}</ArionPageWrapper>
          </Suspense>
        </PageErrorBoundary>
      );
    }
  }

  // MY_BRAND — Creative Studio (Item 1 Task 3). Hub is reached via arion_brand
  // (ARION section, above); these are the sub-page routes the hub tiles link to.
  if (service.section === 'MY_BRAND') {
    let page: React.ReactNode = null;
    switch (service.key) {
      case 'my_brand_image_studio': page = <MyBrandImageStudioPage />; break;
      case 'my_brand_voice': page = <MyBrandVoicePage />; break;
      case 'my_brand_templates': page = <MyBrandTemplateStudioPage />; break;
      case 'my_brand_assets': page = <MyBrandAssetLibraryPage />; break;
      case 'my_brand_social_channels': page = <MyBrandSocialChannelsPage />; break;
      case 'my_brand_compose': page = <MyBrandSocialComposerPage />; break;
      case 'my_brand_calendar': page = <MyBrandSocialCalendarPage />; break;
      // Re-cut item 5 (2026-07-22): Social Content view + its full-report page.
      case 'my_brand_social_content': page = <MyBrandSocialContentPage />; break;
      case 'my_brand_social_report': page = <MyBrandSocialReportPage />; break;
      // IA re-cut 2026-07-21: analytics is a REPORT → ARION IA Insights;
      // approvals is the IA↔client project workflow → removed from My Brand.
      case 'my_brand_analytics': return <Navigate to="/app/services/arion_ia_insights_trends" replace />;
      default: break;
    }
    if (page) {
      return (
        <PageErrorBoundary scope={`my-brand/${service.key}`}>
          <Suspense fallback={<RouteLoading />}>{page}</Suspense>
        </PageErrorBoundary>
      );
    }
  }

  if (service.section === 'STELLA') {
    // Legacy 0.1.0 MLP routes — the old Overview P&L + Expenses pages are
    // retired. Redirect old deep links to the NEW Ledger Overview landing.
    if (service.key === 'stella_coming') return <Navigate to="/app/services/stella_ledger_overview" replace />;
    if (service.key === 'stella_expenses_coming') return <Navigate to="/app/services/stella_ledger_overview" replace />;

    let stellaPage: React.ReactNode = null;
    switch (service.key) {
      // Ledger (Layer 1 — live; 2026-07-30 consolidation, 8-item nav cap)
      case 'stella_ledger_overview': stellaPage = <StellaOverviewPage />; break;
      case 'stella_ledger_inbox': stellaPage = <StellaLedgerInboxPage />; break;
      case 'stella_ledger_transactions': stellaPage = <StellaTransactionsPage />; break;
      case 'stella_ledger_vendors': stellaPage = <StellaVendorsPage />; break;
      case 'stella_ledger_coa': stellaPage = <StellaCoaPage />; break;
      case 'stella_ledger_mileage_materials': stellaPage = <StellaMileageMaterialsPage />; break;
      case 'stella_ledger_reports': stellaPage = <StellaReportsPage />; break;
      // Unit Economics (Layer 2 — live)
      case 'stella_ue_margins': stellaPage = <StellaMarginsPage />; break;
      case 'stella_ue_allocations': stellaPage = <StellaAllocationsPage />; break;
      case 'stella_ue_reconciliation': stellaPage = <StellaReconciliationPage />; break;
      // Settings hub (SETTINGS_NAV → STELLA group). These keys live in
      // SETTINGS_KEYS so deriveProduct renders them in Settings mode; the
      // pages themselves stay STELLA-branded.
      case 'stella_settings_bank': stellaPage = <StellaBankPage />; break;
      case 'stella_settings_period_close': stellaPage = <StellaPeriodClosePage />; break;
      // IA Insights — Trends + Intelligence build AFTER the Aug-6 insights
      // redesign, following that structure (founder direction 2026-07-30).
      // Reports (stella_ledger_reports) is the live financial-statements page.
      case 'stella_ia_insights_trends':
      case 'stella_ia_insights_intelligence':
      // Database Manager + Custom Reporting (Layer 3 — locked / coming soon).
      // Every db_/report_ key renders the STELLA coming-soon sheet (padlock +
      // tier badge driven by the catalog row).
      case 'stella_db_registry':
      case 'stella_db_entry':
      case 'stella_db_upload':
      case 'stella_db_tags':
      case 'stella_db_custom_fields':
      case 'stella_db_import_history':
      case 'stella_db_documents':
      case 'stella_db_compliance':
      case 'stella_db_warnings':
      case 'stella_report_library':
      case 'stella_report_builder':
      case 'stella_report_dashboards':
      case 'stella_report_scheduled':
      case 'stella_report_sql':
      case 'stella_report_exports':
        stellaPage = <StellaComingSoonPage service={service} />; break;
      default: break;
    }
    if (stellaPage) {
      return (
        <PageErrorBoundary scope={`stella/${service.key}`}>
          <Suspense fallback={<RouteLoading />}>{stellaPage}</Suspense>
        </PageErrorBoundary>
      );
    }
  }

  // FORGE › HESTIA — the first FORGE software.
  if (service.section === 'FORGE') {
    // FORGE software no longer lives behind service keys — it lives under
    // /app/services/forge/<software>/<screen> (see forgeSoftware.ts), which is
    // what lets one product line host a build per client. What remains here is
    // the LINE landing page: an invitation to commission software, plus a way
    // into whatever builds this tenant owns. It reads no client data, so every
    // tenant may see it.
    if (service.key === 'forge_overview') return <ForgeLinePage />;
    // Every other legacy forge_* key is a screen that moved under
    // /app/services/forge/<software>/. Redirect so an old bookmark or an
    // emailed link lands on the real page instead of a generic stub.
    const moved = LEGACY_FORGE_ROUTES[service.key];
    if (moved) return <Navigate to={moved} replace />;
  }

  if (service.section === 'OLIVER') {
    let oliverPage: React.ReactNode = null;
    switch (service.key) {
      case 'oliver_dashboard': oliverPage = <OliverDashboardPage />; break;
      case 'oliver_job_board': oliverPage = <OliverJobBoardPage />; break;
      case 'oliver_jobs_archive': oliverPage = <OliverJobsArchivePage />; break;
      case 'oliver_schedule': oliverPage = <OliverSchedulePage />; break;
      case 'oliver_dispatch': oliverPage = <OliverDispatchPage />; break;
      case 'oliver_workers': oliverPage = <OliverWorkersPage />; break;
      case 'oliver_crew_performance': oliverPage = <OliverCrewPerformancePage />; break;
      case 'oliver_contacts': oliverPage = <OliverContactsPage />; break;
      case 'oliver_customer_import': oliverPage = <OliverCustomerImportPage />; break;
      case 'oliver_service_requests': oliverPage = <OliverServiceRequestsPage />; break;
      case 'oliver_booking': oliverPage = <OliverBookingPage />; break;
      case 'oliver_quotes': oliverPage = <OliverQuotesProposalsPage />; break;
      case 'oliver_invoices': oliverPage = <OliverInvoicesPage />; break;
      case 'oliver_payments': oliverPage = <OliverPaymentsPage />; break;
      case 'oliver_recurring': oliverPage = <OliverRecurringPage />; break;
      case 'oliver_messages': oliverPage = <OliverMessagesPage />; break;
      case 'oliver_notifications': oliverPage = <OliverNotificationsPage />; break;
      case 'oliver_reports': oliverPage = <OliverReportsPage />; break;
      case 'oliver_activity_log': oliverPage = <OliverActivityLogPage />; break;
      case 'oliver_settings': oliverPage = <OliverSettingsPage />; break;
      case 'oliver_templates': oliverPage = <OliverTemplateLibraryPage />; break;
      case 'oliver_catalog': oliverPage = <OliverServiceCatalogPage />; break;
      case 'oliver_categories': oliverPage = <OliverCategoriesPage />; break;
      case 'oliver_service_categories': oliverPage = <OliverServiceCategoriesPage />; break;
      case 'oliver_workflow_settings': oliverPage = <OliverWorkflowSettingsPage />; break;
      case 'oliver_billing_overview': oliverPage = <OliverBillingOverviewPage />; break;
      case 'oliver_reminders': oliverPage = <OliverRemindersPage />; break;
      case 'oliver_onboarding': oliverPage = <OliverOnboardingPage />; break;
      case 'oliver_team_access': oliverPage = <OliverTeamAccessPage />; break;
      case 'oliver_locations': oliverPage = <OliverLocationsPage />; break;
      case 'oliver_coupons': oliverPage = <OliverCouponsPage />; break;
      case 'oliver_insights': oliverPage = <OliverInsightsPage />; break;
      case 'oliver_projects': oliverPage = <OliverProjectsPage />; break;
      case 'oliver_disputes': oliverPage = <OliverDisputesPage />; break;
      case 'oliver_proposals': oliverPage = <OliverProposalsPage />; break;
      case 'oliver_usage': oliverPage = <OliverUsagePage />; break;
      case 'oliver_fees': oliverPage = <OliverFeesPage />; break;
      case 'oliver_client_experience': oliverPage = <OliverClientExperiencePage />; break;
      case 'oliver_portal_designer': oliverPage = <OliverPortalDesignerPage />; break;
      case 'oliver_automations': oliverPage = <OliverAutomationsPage />; break;
      case 'oliver_addons': oliverPage = <OliverAddonsPage />; break;
      case 'oliver_portal_domains': oliverPage = <OliverPortalDomainsPage />; break;
      case 'oliver_portals_hub': oliverPage = <OliverPortalsHubPage />; break;
      case 'oliver_portal_customization': oliverPage = <PortalCustomizationPage />; break;
      // v1.0 additions
      case 'oliver_workflow_templates': oliverPage = <OliverWorkflowTemplatesPage />; break;
      case 'oliver_job_offers': oliverPage = <OliverJobOffersPage />; break;
      case 'oliver_support_tickets': oliverPage = <OliverSupportTicketsPage />; break;
      case 'oliver_time_tracking': oliverPage = <OliverTimeTrackingPage />; break;
      // F-116 — Expenses moved to STELLA and rebuilt as the Ledger. The 0.1.0
      // Expenses MLP is retired; deep links to the deprecated oliver_expenses
      // route redirect to the STELLA Transactions ledger.
      case 'oliver_expenses': return <Navigate to="/app/services/stella_ledger_transactions" replace />;
      case 'oliver_reschedule_requests': oliverPage = <OliverRescheduleRequestsPage />; break;
      case 'oliver_quote_options': oliverPage = <OliverQuoteOptionsPage />; break;
      case 'oliver_territories': oliverPage = <OliverTerritoriesPage />; break;
      case 'oliver_sla_policies': oliverPage = <OliverSlaPoliciesPage />; break;
      case 'oliver_job_costing': oliverPage = <OliverJobCostingPage />; break;
      case 'oliver_argus': oliverPage = <OliverArgusPage />; break;
      case 'oliver_payouts': oliverPage = <OliverPayoutsPage />; break;
      // v5.x IA Insights architecture
      case 'oliver_ia_insights_health': oliverPage = <OliverIAInsightsHealthPage />; break;
      case 'oliver_ia_insights_trends': oliverPage = <OliverIAInsightsTrendsPage />; break;
      case 'oliver_ia_insights_reports': oliverPage = <OliverIAInsightsReportsPage />; break;
      case 'oliver_ia_insights_intelligence': oliverPage = <OliverIAInsightsIntelligencePage />; break;
      // ARGUS pages also routed via OLIVER section since ARGUS doesn't have its own section yet
      case 'argus_ia_insights': oliverPage = <ArgusIAInsightsPage />; break;
    }
    if (oliverPage) {
      return (
        <PageErrorBoundary scope={`oliver/${service.key}`}>
          <Suspense fallback={<RouteLoading />}>{oliverPage}</Suspense>
        </PageErrorBoundary>
      );
    }
  }

  // ARGUS routes — handled here so the page is reachable regardless of which
  // product section a tenant is currently inside.
  if (service.key === 'argus_ia_insights') {
    return <Suspense fallback={<RouteLoading />}><ArgusIAInsightsPage /></Suspense>;
  }
  // v9.0 — ARGUS as full product (Health/Trends/Intelligence/Cross-Platform).
  if (service.key === 'argus_health') {
    return <Suspense fallback={<RouteLoading />}><ArgusHealthPage /></Suspense>;
  }
  if (service.key === 'argus_trends') {
    return <Suspense fallback={<RouteLoading />}><ArgusTrendsPage /></Suspense>;
  }
  // v13.0 (2026-07-25) — every ARGUS Intelligence key routes to the mirror
  // page (business-question dashboards → sections → modeled deep detail).
  // The old platform-api grid page (ArgusIAInsightsIntelligencePage) is
  // unrouted; the nav's canonical "Cross-Platform Intelligence" entry must
  // show the new model, not the legacy 6-card grid.
  if (service.key === 'argus_intelligence' || service.key === 'argus_cross_platform' || service.key === 'argus_cross_channel') {
    return <Suspense fallback={<RouteLoading />}><ArgusIntelligencePage /></Suspense>;
  }
  // P0-7 (Agency Foundation) — ARGUS Workflow & Automations observe surface.
  if (service.key === 'argus_workflows' || service.key === 'argus_workflow_automations') {
    return <Suspense fallback={<RouteLoading />}><ArgusWorkflowAutomationsPage /></Suspense>;
  }

  if (service.section === 'LUMEN') {
    let sparkPage: React.ReactNode = null;
    switch (service.key) {
      case 'spark_overview': sparkPage = <SparkOverviewPage />; break;
      case 'spark_contacts': sparkPage = <SparkContactsPage />; break;
      case 'spark_lists': sparkPage = <SparkListsPage />; break;
      case 'spark_segments': sparkPage = <SparkSegmentsPage />; break;
      case 'spark_campaigns': sparkPage = <SparkCampaignsPage />; break;
      case 'spark_forms': sparkPage = <SparkFormsPage />; break;
      // Phase 3A — unified Workflows & Automations list page. The old
      // automation/rules/workflow-triggers keys redirect here for back-compat.
      // 2026-07-30 — the four builders collapse into ONE page of prebuilt
      // toggles (feature map: "ONE page: ~4 prebuilt toggle-on automations").
      // The old builder is still imported and reachable at
      // /spark_automation_builder for anything already wired up; it is no
      // longer what a client meets when they click Automations.
      case 'spark_workflows_automations':
      case 'spark_automations':
      case 'spark_workflow_triggers':
        sparkPage = <SparkAutomationsSimplePage />; break;
      // F-CS.6 — named-task admin (lumen.spark_task)
      case 'spark_tasks': sparkPage = <SparkTasksPage />; break;
      // Unified Lead Inbox (2026-06-25). `spark_lead_inbox` is the new canonical
      // key the SubNav points at; `spark_leads` is back-compat for old links
      // and ARGUS intents — both render the same tabbed page (default tab = inbox).
      case 'spark_lead_inbox':
      case 'spark_leads': sparkPage = <SparkLeadInboxPage />; break;
      case 'spark_search_profiles': sparkPage = <SparkSearchProfilesPage />; break;
      case 'spark_intelligence': sparkPage = <SparkIntelligencePage />; break;
      case 'spark_contact_scoring': sparkPage = <SparkContactScoringPage />; break;
      case 'spark_usage': sparkPage = <SparkUsagePage />; break;
      case 'spark_usage_report': sparkPage = <SparkUsageReportPage />; break;
      // SPARK Pro
      case 'spark_pipelines': sparkPage = <SparkPipelinesPage />; break;
      case 'spark_deals': sparkPage = <SparkDealsPage />; break;
      case 'spark_nps': sparkPage = <SparkNpsPage />; break;
      case 'spark_qr_codes': sparkPage = <SparkQrCodesPage />; break;
      case 'spark_referrals': sparkPage = <SparkReferralsPage />; break;
      case 'spark_social': sparkPage = <SparkSocialPage />; break;
      case 'spark_newsletter': sparkPage = <SparkNewsletterPage />; break;
      case 'spark_calendar': sparkPage = <SparkCalendarPage />; break;
      // SPARK Business
      case 'spark_landing_pages': sparkPage = <SparkLandingPagesPage />; break;
      case 'spark_reviews': sparkPage = <SparkReviewsPage />; break;
      case 'spark_accounts': sparkPage = <SparkAccountsPage />; break;
      case 'spark_ai_writer': sparkPage = <SparkAiWriterPage />; break;
      // Insights
      case 'spark_insights': sparkPage = <SparkInsightsPage />; break;
      case 'spark_activity_stream': sparkPage = <SparkActivityStreamPage />; break;
      case 'spark_health_score': sparkPage = <SparkHealthScorePage />; break;
      case 'spark_dashboards': sparkPage = <SparkDashboardsPage />; break;
      case 'spark_analytics_reports': sparkPage = <SparkAnalyticsReportsPage />; break;
      case 'spark_contact_bulk': sparkPage = <SparkContactBulkPage />; break;
      // v1.0 additions
      case 'spark_approvals': sparkPage = <SparkApprovalsPage />; break;
      case 'spark_sms_inbox': sparkPage = <SparkSmsInboxPage />; break;
      // SP-6 — orphaned pre-unification routes redirect to their canonical
      // replacements (unified Templates page + Workflow & Automations page) so
      // old deep links land somewhere sensible instead of a dead page. The
      // standalone SparkEmailTemplatesPage / SparkAutomationBuilderPage files
      // were deleted (superseded by SparkTemplateEditorModal + SparkAutomationModal).
      case 'spark_email_templates': sparkPage = <SparkTemplatesPage />; break;
      case 'spark_automation_builder': sparkPage = <SparkWorkflowsAutomationsPage />; break;
      case 'spark_deliverability': sparkPage = <SparkDeliverabilityPage />; break;
      case 'spark_ab_tests': sparkPage = <SparkAbTestsPage />; break;
      // Back-compat for the pre-unification routes. Render the unified Lead
      // Inbox page with the matching tab pre-selected so old deep links land
      // on the right surface. The standalone SparkLeadSuppressionPage /
      // SparkTerritoriesPage files are retained for now as a safety net but
      // are no longer mounted by the router.
      case 'spark_lead_suppression': sparkPage = <SparkLeadInboxPage initialTab="suppressed" />; break;
      case 'spark_lead_territories': sparkPage = <SparkLeadInboxPage initialTab="territories" />; break;
      case 'spark_autotag_rules': sparkPage = <SparkAutoTagRulesPage />; break;
      case 'spark_competitor_watch': sparkPage = <SparkCompetitorWatchPage />; break;
      case 'spark_scoring_rules': sparkPage = <SparkScoringRulesPage />; break;
      case 'spark_routing_rules': sparkPage = <SparkRoutingRulesPage />; break;
      case 'spark_attribution': sparkPage = <SparkAttributionPage />; break;
      case 'spark_stella': sparkPage = <SparkStellaPage />; break;
      case 'spark_scheduled_reports': sparkPage = <SparkScheduledReportsPage />; break;
      case 'spark_audience_sync': sparkPage = <SparkAudienceSyncPage />; break;
      case 'spark_journey_builder': sparkPage = <SparkJourneyBuilderPage />; break;
      case 'spark_tracking': sparkPage = <SparkTrackingPage />; break;
      case 'spark_sender_domains': sparkPage = <SparkSenderDomainsPage />; break;
      // SPARK Composer v1.1 (2026-06-24)
      case 'spark_senders': sparkPage = <SparkSendersPage />; break;
      case 'spark_signatures': sparkPage = <SparkSignaturesPage />; break;
      case 'spark_onboarding': sparkPage = <SparkOnboardingPage />; break;
      case 'spark_account_profile': sparkPage = <SparkAccountProfilePage />; break;
      case 'spark_templates': sparkPage = <SparkTemplatesPage />; break;
      // Phase 3A — back-compat: deep links to /spark_rules redirect to
      // the unified Workflows & Automations page (rules tab).
      case 'spark_rules': sparkPage = <SparkWorkflowsAutomationsPage />; break;
      case 'spark_api_keys': sparkPage = <SparkApiKeysPage />; break;
      case 'spark_webhooks': sparkPage = <SparkWebhooksPage />; break;
      case 'spark_sms_templates': sparkPage = <SparkSmsTemplatesPage />; break;
      case 'spark_sms_campaigns': sparkPage = <SparkSmsCampaignsPage />; break;
      case 'spark_contact_import': sparkPage = <SparkContactImportPage />; break;
      case 'spark_inbound_webhooks': sparkPage = <SparkInboundWebhooksPage />; break;
      case 'spark_secrets': sparkPage = <SparkSecretsPage />; break;
      case 'spark_audit_log': sparkPage = <SparkAuditLogPage />; break;
      case 'spark_calendar_sync': sparkPage = <SparkCalendarSyncPage />; break;
      case 'spark_anomaly_alerts': sparkPage = <SparkAnomalyAlertsPage />; break;
      case 'spark_template_i18n': sparkPage = <SparkTemplateI18nPage />; break;
      case 'spark_contact_360': sparkPage = <SparkContact360Page />; break;
      case 'spark_contact_merge': sparkPage = <SparkContactMergePage />; break;
      case 'spark_webhook_deliveries': sparkPage = <SparkWebhookDeliveriesPage />; break;
      case 'spark_saved_searches': sparkPage = <SparkSavedSearchesPage />; break;
      case 'spark_quiet_hours': sparkPage = <SparkQuietHoursPage />; break;
      case 'spark_nps_schedules': sparkPage = <SparkNpsSchedulesPage />; break;
      case 'spark_custom_fields': sparkPage = <SparkCustomFieldsPage />; break;
      // spark_workflow_triggers handled at top via unified Workflows page;
      // SparkWorkflowTriggersPage component retained for back-compat imports.
      case 'spark_config_backup': sparkPage = <SparkConfigBackupPage />; break;
      // v5.x IA Insights architecture
      case 'spark_ia_insights_health': sparkPage = <SparkIAInsightsHealthPage />; break;
      case 'spark_ia_insights_trends': sparkPage = <SparkIAInsightsTrendsPage />; break;
      case 'spark_ia_insights_reports': sparkPage = <SparkIAInsightsReportsPage />; break;
      case 'spark_ia_insights_intelligence': sparkPage = <SparkIAInsightsIntelligencePage />; break;
      case 'spark_service_category': sparkPage = <SparkServiceCategoryPage />; break;
      case 'spark_form_builder': sparkPage = <SparkFormBuilderPage />; break;
      case 'spark_realtime_metrics': sparkPage = <SparkRealtimeMetricsPage />; break;
      case 'spark_api_reference': sparkPage = <SparkApiReferencePage />; break;
      case 'spark_engine_docs': sparkPage = <SparkEngineDocsPage />; break;
      case 'spark_smoke_test': sparkPage = <SparkSmokeTestPage />; break;
      // Backward compat aliases for old lumen_* keys
      case 'lumen_overview': sparkPage = <SparkOverviewPage />; break;
      case 'lumen_contacts': sparkPage = <SparkContactsPage />; break;
      case 'lumen_campaigns': sparkPage = <SparkCampaignsPage />; break;
      case 'lumen_leads': sparkPage = <SparkLeadInboxPage />; break;
      default: break;
    }
    if (sparkPage) {
      return (
        <PageErrorBoundary scope={`spark/${service.key}`}>
          <Suspense fallback={<RouteLoading />}>{sparkPage}</Suspense>
        </PageErrorBoundary>
      );
    }
  }

  if (service.section === 'CONSULTING') {
    let consultingPage: React.ReactNode = null;
    switch (service.key) {
      // F-140 — Consulting dispatch. NOTE: consulting_workspace / _tickets /
      // _projects / _onboard_client / _documents are intercepted by the
      // CONSULTING_FOUNDER_RELOCATIONS table at the top of this component
      // (founders → /app/admin/consulting/*; non-founders → /overview),
      // so they never reach this switch.
      // 2026-08-29 — clients are OFF the legacy surface entirely. Rolling In
      // It's owner was living on these pages (Overview + Deliverables nav, no
      // Service Requests, a dead intake-submissions call erroring the page)
      // because the 2026-06-29 relocation only intercepted the five founder
      // keys and left the client keys serving the pre-rework pages. Every
      // client entry point (FeatureLocked link, old bookmarks, stale nav)
      // now lands on the real client surface at /app/consulting/*.
      case 'consulting_overview':
        if (!effectiveIsFounder) return <Navigate to="/app/consulting/projects" replace />;
        consultingPage = <ConsultingWorkOverviewPage />;
        break;
      case 'consulting_deliverables':
        if (!effectiveIsFounder) return <Navigate to="/app/consulting/deliverables" replace />;
        consultingPage = <ConsultingDeliverablesPage />;
        break;
      case 'consulting_calendar':
        if (!effectiveIsFounder) return <Navigate to="/app/consulting/projects" replace />;
        consultingPage = <ConsultingCalendarPage />;
        break;
      // Founder-only utility surfaces (still accessible by URL)
      case 'consulting_access_log':
        if (!effectiveIsFounder) return <Navigate to="/app/consulting/projects" replace />;
        consultingPage = <ConsultingAccessLogPage />;
        break;
      // Legacy "Build Your X" per-engagement task/deliverable pages —
      // forwarded to the relocated Requests Board (founder admin). The
      // CONSULTING_FOUNDER_RELOCATIONS table only matches the canonical
      // consulting_tickets key, so we redirect explicitly here for the
      // legacy aliases that still exist in old emails / saved links.
      case 'consulting_brand_tasks':
      case 'consulting_brand_deliverables':
      case 'consulting_foundation_tasks':
      case 'consulting_foundation_deliverables':
      case 'consulting_clarity_tasks':
      case 'consulting_clarity_deliverables':
      case 'consulting_engine_tasks':
      case 'consulting_engine_deliverables':
        return effectiveIsFounder
          ? <Navigate to="/app/admin/consulting/requests" replace />
          : <Navigate to="/app/consulting/requests" replace />;
      default: break;
    }
    if (consultingPage) {
      return (
        <PageErrorBoundary scope={`consulting/${service.key}`}>
          <Suspense fallback={<RouteLoading />}>{consultingPage}</Suspense>
        </PageErrorBoundary>
      );
    }
  }

  // MY_BRAND dispatch block REMOVED 2026-06-22 — Q4 2026 deferred product.
  // Page files under src/pages/myBrand/* are intentionally kept on disk
  // for the eventual build, but unreachable from nav and not registered
  // in serviceCatalog any more so this branch is unreachable.

  return <GenericServicePage service={service} status={status} />;
}

function GenericServicePage({ service, status }: { service: PortalService; status: ServiceStatus }) {
  const title = status === 'coming_soon' ? 'Coming soon' : status === 'not_subscribed' ? 'Not subscribed yet' : service.displayName;
  const body =
    status === 'coming_soon'
      ? 'This surface is planned but not available yet in your portal.'
      : status === 'not_subscribed'
        ? 'This feature is available for IADM clients but has not been added to your subscription yet.'
        : 'This area will surface read-only views from the underlying service once the module is implemented.';

  return (
    <div className="flex flex-col gap-4 p-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">{service.displayName}</h1>
        <p className="mt-1 text-sm text-slate-600">{service.description}</p>
      </div>
      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
        <p className="mx-auto mt-2 max-w-xl text-sm text-slate-600">{body}</p>
      </div>
    </div>
  );
}


/**
 * Public ServiceRouter. Renders the real page, and when the tenant's plan
 * doesn't include it, greys that page out behind a FeatureLocked card.
 *
 * Kept as a wrapper so the ~500-line section switch below stays untouched —
 * it has many return points, and threading a "locked" flag through all of
 * them would be far more fragile than composing at the boundary.
 */
export function ServiceRouter() {
  const { serviceKey } = useParams<{ serviceKey: string }>();
  // Resolve the tier + add-ons of the PRODUCT this route belongs to. Until
  // the 2026-08-21 pricing rework only SPARK carried rules, so the guard read
  // the SPARK tier for everything; OLIVER (Invoicing) and ARION (SEO add-on)
  // rules would have been judged against the wrong subscription. Hooks run
  // unconditionally — non-gated products resolve but are never applied.
  const product = productOfServiceKey(serviceKey);
  const gatingActive = isGatedProduct(product);
  const { tier } = useProductTier(gatingActive ? product : "spark");
  const { addons, seoAddonTier } = useNavAddons(gatingActive ? product : undefined);
  const service = useMemo(
    () => SERVICE_CATALOG.find((s) => s.key === serviceKey) ?? null,
    [serviceKey]
  );
  const rules = serviceKey ? SERVICE_VISIBILITY[serviceKey] : undefined;
  const locked = !isRoutable(rules, { tier, addons, seoAddonTier, gatingActive });

  if (!locked || !service) return <ServiceRouterInner />;

  return (
    <FeatureLocked
      name={service.displayName}
      description={service.description}
      requiredPlan={requirementLabel(rules, product)}
      accent={productColor(product)}
    >
      <ServiceRouterInner />
    </FeatureLocked>
  );
}
