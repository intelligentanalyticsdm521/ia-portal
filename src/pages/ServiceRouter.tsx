import { lazy, Suspense, useMemo } from 'react';
import { useParams, Navigate } from 'react-router-dom';

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

// ARION pages — lazy-loaded; each becomes its own chunk
const ArionOverviewPage = lazyNamed(() => import('./arion/ArionOverviewPage'), 'ArionOverviewPage');
// Website
const WebsiteOverview = lazyNamed(() => import('../arion/pages/website/WebsiteOverview'), 'WebsiteOverview');
const WebsiteContent = lazyNamed(() => import('../arion/pages/website/WebsiteContent'), 'WebsiteContent');
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
const IAInsightsCrossChannel = lazyNamed(() => import('../arion/pages/analytics/IAInsightsCrossChannel'), 'IAInsightsCrossChannel');
const IAInsightsReports = lazyNamed(() => import('../arion/pages/analytics/IAInsightsReports'), 'IAInsightsReports');
// SEO
const SeoOverview = lazyNamed(() => import('../arion/pages/seo/SeoOverview'), 'SeoOverview');
const SeoRankings = lazyNamed(() => import('../arion/pages/seo/SeoRankings'), 'SeoRankings');
const SeoSiteAudit = lazyNamed(() => import('../arion/pages/seo/SeoSiteAudit'), 'SeoSiteAudit');
const SeoCompetitors = lazyNamed(() => import('../arion/pages/seo/SeoCompetitors'), 'SeoCompetitors');
const SeoAiSearch = lazyNamed(() => import('../arion/pages/seo/SeoAiSearch'), 'SeoAiSearch');
const SeoMarketMonitor = lazyNamed(() => import('../arion/pages/seo/SeoMarketMonitor'), 'SeoMarketMonitor');
const SeoReports = lazyNamed(() => import('../arion/pages/seo/SeoReports'), 'SeoReports');
// Search
const SearchPerformance = lazyNamed(() => import('../arion/pages/search/SearchPerformance'), 'SearchPerformance');
const SearchIndexing = lazyNamed(() => import('../arion/pages/search/SearchIndexing'), 'SearchIndexing');
const SearchBingCopilot = lazyNamed(() => import('../arion/pages/search/SearchBingCopilot'), 'SearchBingCopilot');
const SearchBingIndexNow = lazyNamed(() => import('../arion/pages/search/SearchBingIndexNow'), 'SearchBingIndexNow');
// Business
const BusinessOverview = lazyNamed(() => import('../arion/pages/business/BusinessOverview'), 'BusinessOverview');
const BusinessReviews = lazyNamed(() => import('../arion/pages/business/BusinessReviews'), 'BusinessReviews');
const BusinessInsights = lazyNamed(() => import('../arion/pages/business/BusinessInsights'), 'BusinessInsights');
const BusinessPosts = lazyNamed(() => import('../arion/pages/business/BusinessPosts'), 'BusinessPosts');
const BusinessServices = lazyNamed(() => import('../arion/pages/business/BusinessServices'), 'BusinessServices');
const BusinessBingOverview = lazyNamed(() => import('../arion/pages/business/BusinessBingOverview'), 'BusinessBingOverview');
const BusinessAppleOverview = lazyNamed(() => import('../arion/pages/business/BusinessAppleOverview'), 'BusinessAppleOverview');
// Brand
const BrandPage = lazyNamed(() => import('../arion/pages/BrandPage'), 'BrandPage');
// v5.x IA Insights architecture
const ArionIAInsightsTrendsPage = lazyNamed(() => import('../arion/pages/iainsights/ArionIAInsightsTrendsPage'), 'ArionIAInsightsTrendsPage');
const ArionIAInsightsIntelligencePage = lazyNamed(() => import('../arion/pages/iainsights/ArionIAInsightsIntelligencePage'), 'ArionIAInsightsIntelligencePage');
const ArionServiceAreaPage = lazyNamed(() => import('../arion/pages/iainsights/ArionServiceAreaPage'), 'ArionServiceAreaPage');
const ArgusIAInsightsPage = lazyNamed(() => import('./argus/ArgusIAInsightsPage'), 'ArgusIAInsightsPage');
const SparkIAInsightsTrendsPage = lazyNamed(() => import('./spark/SparkIAInsightsTrendsPage'), 'SparkIAInsightsTrendsPage');
const SparkIAInsightsIntelligencePage = lazyNamed(() => import('./spark/SparkIAInsightsIntelligencePage'), 'SparkIAInsightsIntelligencePage');
const OliverIAInsightsTrendsPage = lazyNamed(() => import('./oliver/OliverIAInsightsTrendsPage'), 'OliverIAInsightsTrendsPage');
const OliverIAInsightsIntelligencePage = lazyNamed(() => import('./oliver/OliverIAInsightsIntelligencePage'), 'OliverIAInsightsIntelligencePage');

// SPARK / LUMEN pages — lazy-loaded
const SparkOverviewPage = lazyNamed(() => import('./spark/SparkOverviewPage'), 'SparkOverviewPage');
const SparkContactsPage = lazyNamed(() => import('./spark/SparkContactsPage'), 'SparkContactsPage');
const SparkListsPage = lazyNamed(() => import('./spark/SparkListsPage'), 'SparkListsPage');
const SparkTagsPage = lazyNamed(() => import('./spark/SparkTagsPage'), 'SparkTagsPage');
const SparkSegmentsPage = lazyNamed(() => import('./spark/SparkSegmentsPage'), 'SparkSegmentsPage');
const SparkCampaignsPage = lazyNamed(() => import('./spark/SparkCampaignsPage'), 'SparkCampaignsPage');
const SparkFormsPage = lazyNamed(() => import('./spark/SparkFormsPage'), 'SparkFormsPage');
const SparkAutomationsPage = lazyNamed(() => import('./spark/SparkAutomationsPage'), 'SparkAutomationsPage');
const SparkLeadsPage = lazyNamed(() => import('./spark/SparkLeadsPage'), 'SparkLeadsPage');
const SparkSearchProfilesPage = lazyNamed(() => import('./spark/SparkSearchProfilesPage'), 'SparkSearchProfilesPage');
const SparkIntelligencePage = lazyNamed(() => import('./spark/SparkIntelligencePage'), 'SparkIntelligencePage');
const SparkUsagePage = lazyNamed(() => import('./spark/SparkUsagePage'), 'SparkUsagePage');
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
const SparkEmailTemplatesPage = lazyNamed(() => import('./spark/SparkEmailTemplatesPage'), 'SparkEmailTemplatesPage');
const SparkAutomationBuilderPage = lazyNamed(() => import('./spark/SparkAutomationBuilderPage'), 'SparkAutomationBuilderPage');
const SparkDeliverabilityPage = lazyNamed(() => import('./spark/SparkDeliverabilityPage'), 'SparkDeliverabilityPage');
const SparkAbTestsPage = lazyNamed(() => import('./spark/SparkAbTestsPage'), 'SparkAbTestsPage');
const SparkLeadSuppressionPage = lazyNamed(() => import('./spark/SparkLeadSuppressionPage'), 'SparkLeadSuppressionPage');
const SparkTerritoriesPage = lazyNamed(() => import('./spark/SparkTerritoriesPage'), 'SparkTerritoriesPage');
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
const SparkOnboardingPage = lazyNamed(() => import('./spark/SparkOnboardingPage'), 'SparkOnboardingPage');
const SparkApiKeysPage = lazyNamed(() => import('./spark/SparkApiKeysPage'), 'SparkApiKeysPage');
const SparkReviewWidgetPage = lazyNamed(() => import('./spark/SparkReviewWidgetPage'), 'SparkReviewWidgetPage');
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

// OLIVER pages — lazy-loaded (introduced 2026-05-11)
const OliverDashboardPage = lazyNamed(() => import('./oliver/OliverDashboardPage'), 'OliverDashboardPage');
const OliverJobBoardPage = lazyNamed(() => import('./oliver/OliverJobBoardPage'), 'OliverJobBoardPage');
const OliverSchedulePage = lazyNamed(() => import('./oliver/OliverSchedulePage'), 'OliverSchedulePage');
const OliverDispatchPage = lazyNamed(() => import('./oliver/OliverDispatchPage'), 'OliverDispatchPage');
const OliverWorkersPage = lazyNamed(() => import('./oliver/OliverWorkersPage'), 'OliverWorkersPage');
const OliverCrewPerformancePage = lazyNamed(() => import('./oliver/OliverCrewPerformancePage'), 'OliverCrewPerformancePage');
const OliverContactsPage = lazyNamed(() => import('./oliver/OliverContactsPage'), 'OliverContactsPage');
const OliverServiceRequestsPage = lazyNamed(() => import('./oliver/OliverServiceRequestsPage'), 'OliverServiceRequestsPage');
const OliverQuotesPage = lazyNamed(() => import('./oliver/OliverQuotesPage'), 'OliverQuotesPage');
const OliverInvoicesPage = lazyNamed(() => import('./oliver/OliverInvoicesPage'), 'OliverInvoicesPage');
const OliverPaymentsPage = lazyNamed(() => import('./oliver/OliverPaymentsPage'), 'OliverPaymentsPage');
const OliverRecurringPage = lazyNamed(() => import('./oliver/OliverRecurringPage'), 'OliverRecurringPage');
const OliverMessagesPage = lazyNamed(() => import('./oliver/OliverMessagesPage'), 'OliverMessagesPage');
const OliverNotificationsPage = lazyNamed(() => import('./oliver/OliverNotificationsPage'), 'OliverNotificationsPage');
const OliverReportsPage = lazyNamed(() => import('./oliver/OliverReportsPage'), 'OliverReportsPage');
const OliverActivityLogPage = lazyNamed(() => import('./oliver/OliverActivityLogPage'), 'OliverActivityLogPage');
const OliverSettingsPage = lazyNamed(() => import('./oliver/OliverSettingsPage'), 'OliverSettingsPage');
const OliverServiceCatalogPage = lazyNamed(() => import('./oliver/OliverServiceCatalogPage'), 'OliverServiceCatalogPage');
const OliverBillingOverviewPage = lazyNamed(() => import('./oliver/OliverBillingOverviewPage'), 'OliverBillingOverviewPage');
const OliverRemindersPage = lazyNamed(() => import('./oliver/OliverRemindersPage'), 'OliverRemindersPage');
const OliverOnboardingPage = lazyNamed(() => import('./oliver/OliverOnboardingPage'), 'OliverOnboardingPage');
const OliverTeamAccessPage = lazyNamed(() => import('./oliver/OliverTeamAccessPage'), 'OliverTeamAccessPage');
const OliverCouponsPage = lazyNamed(() => import('./oliver/OliverCouponsPage'), 'OliverCouponsPage');
const OliverInsightsPage = lazyNamed(() => import('./oliver/OliverInsightsPage'), 'OliverInsightsPage');
const OliverProjectsPage = lazyNamed(() => import('./oliver/OliverProjectsPage'), 'OliverProjectsPage');
const OliverDisputesPage = lazyNamed(() => import('./oliver/OliverDisputesPage'), 'OliverDisputesPage');
const OliverProposalsPage = lazyNamed(() => import('./oliver/OliverProposalsPage'), 'OliverProposalsPage');
const OliverUsagePage = lazyNamed(() => import('./oliver/OliverUsagePage'), 'OliverUsagePage');
// OLIVER v1.0 additions
const OliverWorkflowTemplatesPage = lazyNamed(() => import('./oliver/OliverWorkflowTemplatesPage'), 'OliverWorkflowTemplatesPage');
const OliverJobOffersPage = lazyNamed(() => import('./oliver/OliverJobOffersPage'), 'OliverJobOffersPage');
const OliverSupportTicketsPage = lazyNamed(() => import('./oliver/OliverSupportTicketsPage'), 'OliverSupportTicketsPage');
const OliverTimeTrackingPage = lazyNamed(() => import('./oliver/OliverTimeTrackingPage'), 'OliverTimeTrackingPage');
const OliverExpensesPage = lazyNamed(() => import('./oliver/OliverExpensesPage'), 'OliverExpensesPage');
const OliverRescheduleRequestsPage = lazyNamed(() => import('./oliver/OliverRescheduleRequestsPage'), 'OliverRescheduleRequestsPage');
const OliverQuoteOptionsPage = lazyNamed(() => import('./oliver/OliverQuoteOptionsPage'), 'OliverQuoteOptionsPage');
const OliverTerritoriesPage = lazyNamed(() => import('./oliver/OliverTerritoriesPage'), 'OliverTerritoriesPage');
const OliverSlaPoliciesPage = lazyNamed(() => import('./oliver/OliverSlaPoliciesPage'), 'OliverSlaPoliciesPage');
const OliverJobCostingPage = lazyNamed(() => import('./oliver/OliverJobCostingPage'), 'OliverJobCostingPage');
const OliverArgusPage = lazyNamed(() => import('./oliver/OliverArgusPage'), 'OliverArgusPage');
const OliverPayoutsPage = lazyNamed(() => import('./oliver/OliverPayoutsPage'), 'OliverPayoutsPage');
const ArionUsagePage = lazyNamed(() => import('./arion/ArionUsagePage'), 'ArionUsagePage');
const ArionPluginProvisioningPage = lazyNamed(() => import('./arion/ArionPluginProvisioningPage'), 'ArionPluginProvisioningPage');

// CONSULTING — lazy-loaded
const ConsultingOverviewPage = lazyNamed(() => import('./consulting/ConsultingOverviewPage'), 'ConsultingOverviewPage');
const ConsultingEngagementWrapper = lazyNamed(() => import('./consulting/ConsultingEngagementWrapper'), 'ConsultingEngagementWrapper');
const ConsultingCalendarPage = lazyNamed(() => import('./consulting/ConsultingCalendarPage'), 'ConsultingCalendarPage');

// Shared loading fallback used by every Suspense boundary in this router.
function RouteLoading() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 60, color: '#5A7A8A', fontSize: 13 }}>
      Loading…
    </div>
  );
}

export function ServiceRouter() {
  const { serviceKey } = useParams<{ serviceKey: string }>();
  const { enabledServices } = useAppState();

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

  const status: ServiceStatus = resolveServiceStatus(service, enabledServices);

  if (service.section === 'ARION') {
    let arionPage: React.ReactNode = null;
    switch (service.key) {
      case 'arion_dashboard': arionPage = <ArionOverviewPage service={service} status={status} />; break;
      case 'arion_website_overview': arionPage = <WebsiteOverview />; break;
      case 'arion_website_content': arionPage = <WebsiteContent />; break;
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
      case 'arion_analytics_ia_cross_channel': arionPage = <IAInsightsCrossChannel />; break;
      case 'arion_analytics_ia_reports': arionPage = <IAInsightsReports />; break;
      case 'arion_seo_overview': arionPage = <SeoOverview />; break;
      case 'arion_seo_rankings': arionPage = <SeoRankings />; break;
      case 'arion_seo_site_audit': arionPage = <SeoSiteAudit />; break;
      case 'arion_seo_competitors': arionPage = <SeoCompetitors />; break;
      case 'arion_seo_ai_search': arionPage = <SeoAiSearch />; break;
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
      case 'arion_business_reviews': arionPage = <BusinessReviews />; break;
      case 'arion_business_insights': arionPage = <BusinessInsights />; break;
      case 'arion_business_posts': arionPage = <BusinessPosts />; break;
      case 'arion_business_services': arionPage = <BusinessServices />; break;
      case 'arion_business_bing_overview': arionPage = <BusinessBingOverview />; break;
      case 'arion_business_apple_overview': arionPage = <BusinessAppleOverview />; break;
      case 'arion_brand': arionPage = <BrandPage />; break;
      // v5.x IA Insights architecture
      case 'arion_ia_insights_trends': arionPage = <ArionIAInsightsTrendsPage />; break;
      case 'arion_ia_insights_intelligence': arionPage = <ArionIAInsightsIntelligencePage />; break;
      case 'arion_service_area': arionPage = <ArionServiceAreaPage />; break;
      case 'arion_usage': arionPage = <ArionUsagePage service={service} status={status} />; break;
      case 'arion_plugin_provisioning': arionPage = <ArionPluginProvisioningPage service={service} status={status} />; break;
      default: break;
    }
    if (arionPage) {
      return (
        <Suspense fallback={<RouteLoading />}>
          <ArionPageWrapper>{arionPage}</ArionPageWrapper>
        </Suspense>
      );
    }
  }

  if (service.section === 'OLIVER') {
    let oliverPage: React.ReactNode = null;
    switch (service.key) {
      case 'oliver_dashboard': oliverPage = <OliverDashboardPage />; break;
      case 'oliver_job_board': oliverPage = <OliverJobBoardPage />; break;
      case 'oliver_schedule': oliverPage = <OliverSchedulePage />; break;
      case 'oliver_dispatch': oliverPage = <OliverDispatchPage />; break;
      case 'oliver_workers': oliverPage = <OliverWorkersPage />; break;
      case 'oliver_crew_performance': oliverPage = <OliverCrewPerformancePage />; break;
      case 'oliver_contacts': oliverPage = <OliverContactsPage />; break;
      case 'oliver_service_requests': oliverPage = <OliverServiceRequestsPage />; break;
      case 'oliver_quotes': oliverPage = <OliverQuotesPage />; break;
      case 'oliver_invoices': oliverPage = <OliverInvoicesPage />; break;
      case 'oliver_payments': oliverPage = <OliverPaymentsPage />; break;
      case 'oliver_recurring': oliverPage = <OliverRecurringPage />; break;
      case 'oliver_messages': oliverPage = <OliverMessagesPage />; break;
      case 'oliver_notifications': oliverPage = <OliverNotificationsPage />; break;
      case 'oliver_reports': oliverPage = <OliverReportsPage />; break;
      case 'oliver_activity_log': oliverPage = <OliverActivityLogPage />; break;
      case 'oliver_settings': oliverPage = <OliverSettingsPage />; break;
      case 'oliver_catalog': oliverPage = <OliverServiceCatalogPage />; break;
      case 'oliver_billing_overview': oliverPage = <OliverBillingOverviewPage />; break;
      case 'oliver_reminders': oliverPage = <OliverRemindersPage />; break;
      case 'oliver_onboarding': oliverPage = <OliverOnboardingPage />; break;
      case 'oliver_team_access': oliverPage = <OliverTeamAccessPage />; break;
      case 'oliver_coupons': oliverPage = <OliverCouponsPage />; break;
      case 'oliver_insights': oliverPage = <OliverInsightsPage />; break;
      case 'oliver_projects': oliverPage = <OliverProjectsPage />; break;
      case 'oliver_disputes': oliverPage = <OliverDisputesPage />; break;
      case 'oliver_proposals': oliverPage = <OliverProposalsPage />; break;
      case 'oliver_usage': oliverPage = <OliverUsagePage />; break;
      // v1.0 additions
      case 'oliver_workflow_templates': oliverPage = <OliverWorkflowTemplatesPage />; break;
      case 'oliver_job_offers': oliverPage = <OliverJobOffersPage />; break;
      case 'oliver_support_tickets': oliverPage = <OliverSupportTicketsPage />; break;
      case 'oliver_time_tracking': oliverPage = <OliverTimeTrackingPage />; break;
      case 'oliver_expenses': oliverPage = <OliverExpensesPage />; break;
      case 'oliver_reschedule_requests': oliverPage = <OliverRescheduleRequestsPage />; break;
      case 'oliver_quote_options': oliverPage = <OliverQuoteOptionsPage />; break;
      case 'oliver_territories': oliverPage = <OliverTerritoriesPage />; break;
      case 'oliver_sla_policies': oliverPage = <OliverSlaPoliciesPage />; break;
      case 'oliver_job_costing': oliverPage = <OliverJobCostingPage />; break;
      case 'oliver_argus': oliverPage = <OliverArgusPage />; break;
      case 'oliver_payouts': oliverPage = <OliverPayoutsPage />; break;
      // v5.x IA Insights architecture
      case 'oliver_ia_insights_trends': oliverPage = <OliverIAInsightsTrendsPage />; break;
      case 'oliver_ia_insights_intelligence': oliverPage = <OliverIAInsightsIntelligencePage />; break;
      // ARGUS pages also routed via OLIVER section since ARGUS doesn't have its own section yet
      case 'argus_ia_insights': oliverPage = <ArgusIAInsightsPage />; break;
    }
    if (oliverPage) {
      return <Suspense fallback={<RouteLoading />}>{oliverPage}</Suspense>;
    }
  }

  // ARGUS routes — handled here so the page is reachable regardless of which
  // product section a tenant is currently inside.
  if (service.key === 'argus_ia_insights') {
    return <Suspense fallback={<RouteLoading />}><ArgusIAInsightsPage /></Suspense>;
  }

  if (service.section === 'LUMEN') {
    let sparkPage: React.ReactNode = null;
    switch (service.key) {
      case 'spark_overview': sparkPage = <SparkOverviewPage />; break;
      case 'spark_contacts': sparkPage = <SparkContactsPage />; break;
      case 'spark_lists': sparkPage = <SparkListsPage />; break;
      case 'spark_tags': sparkPage = <SparkTagsPage />; break;
      case 'spark_segments': sparkPage = <SparkSegmentsPage />; break;
      case 'spark_campaigns': sparkPage = <SparkCampaignsPage />; break;
      case 'spark_forms': sparkPage = <SparkFormsPage />; break;
      case 'spark_automations': sparkPage = <SparkAutomationsPage />; break;
      case 'spark_leads': sparkPage = <SparkLeadsPage />; break;
      case 'spark_search_profiles': sparkPage = <SparkSearchProfilesPage />; break;
      case 'spark_intelligence': sparkPage = <SparkIntelligencePage />; break;
      case 'spark_usage': sparkPage = <SparkUsagePage />; break;
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
      case 'spark_email_templates': sparkPage = <SparkEmailTemplatesPage />; break;
      case 'spark_automation_builder': sparkPage = <SparkAutomationBuilderPage />; break;
      case 'spark_deliverability': sparkPage = <SparkDeliverabilityPage />; break;
      case 'spark_ab_tests': sparkPage = <SparkAbTestsPage />; break;
      case 'spark_lead_suppression': sparkPage = <SparkLeadSuppressionPage />; break;
      case 'spark_lead_territories': sparkPage = <SparkTerritoriesPage />; break;
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
      case 'spark_onboarding': sparkPage = <SparkOnboardingPage />; break;
      case 'spark_api_keys': sparkPage = <SparkApiKeysPage />; break;
      case 'spark_review_widget': sparkPage = <SparkReviewWidgetPage />; break;
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
      case 'spark_workflow_triggers': sparkPage = <SparkWorkflowTriggersPage />; break;
      case 'spark_config_backup': sparkPage = <SparkConfigBackupPage />; break;
      // v5.x IA Insights architecture
      case 'spark_ia_insights_trends': sparkPage = <SparkIAInsightsTrendsPage />; break;
      case 'spark_ia_insights_intelligence': sparkPage = <SparkIAInsightsIntelligencePage />; break;
      case 'spark_service_category': sparkPage = <SparkServiceCategoryPage />; break;
      case 'spark_form_builder': sparkPage = <SparkFormBuilderPage />; break;
      case 'spark_realtime_metrics': sparkPage = <SparkRealtimeMetricsPage />; break;
      case 'spark_api_reference': sparkPage = <SparkApiReferencePage />; break;
      case 'spark_engine_docs': sparkPage = <SparkEngineDocsPage />; break;
      // Backward compat aliases for old lumen_* keys
      case 'lumen_overview': sparkPage = <SparkOverviewPage />; break;
      case 'lumen_contacts': sparkPage = <SparkContactsPage />; break;
      case 'lumen_campaigns': sparkPage = <SparkCampaignsPage />; break;
      case 'lumen_leads': sparkPage = <SparkLeadsPage />; break;
      default: break;
    }
    if (sparkPage) {
      return <Suspense fallback={<RouteLoading />}>{sparkPage}</Suspense>;
    }
  }

  if (service.section === 'CONSULTING') {
    let consultingPage: React.ReactNode = null;
    switch (service.key) {
      case 'consulting_overview': consultingPage = <ConsultingOverviewPage />; break;
      case 'consulting_brand_tasks': consultingPage = <ConsultingEngagementWrapper engagementType="build_your_brand" view="tasks" />; break;
      case 'consulting_brand_deliverables': consultingPage = <ConsultingEngagementWrapper engagementType="build_your_brand" view="deliverables" />; break;
      case 'consulting_foundation_tasks': consultingPage = <ConsultingEngagementWrapper engagementType="build_your_foundation" view="tasks" />; break;
      case 'consulting_foundation_deliverables': consultingPage = <ConsultingEngagementWrapper engagementType="build_your_foundation" view="deliverables" />; break;
      case 'consulting_clarity_tasks': consultingPage = <ConsultingEngagementWrapper engagementType="build_your_clarity" view="tasks" />; break;
      case 'consulting_clarity_deliverables': consultingPage = <ConsultingEngagementWrapper engagementType="build_your_clarity" view="deliverables" />; break;
      case 'consulting_engine_tasks': consultingPage = <ConsultingEngagementWrapper engagementType="build_your_engine" view="tasks" />; break;
      case 'consulting_engine_deliverables': consultingPage = <ConsultingEngagementWrapper engagementType="build_your_engine" view="deliverables" />; break;
      case 'consulting_calendar': consultingPage = <ConsultingCalendarPage />; break;
      default: break;
    }
    if (consultingPage) {
      return <Suspense fallback={<RouteLoading />}>{consultingPage}</Suspense>;
    }
  }

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
