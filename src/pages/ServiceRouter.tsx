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
    }
    if (oliverPage) {
      return <Suspense fallback={<RouteLoading />}>{oliverPage}</Suspense>;
    }
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
