import { useMemo } from 'react';
import { useParams, Navigate } from 'react-router-dom';
import { useAppState } from '../app/AppState';
import { SERVICE_CATALOG, resolveServiceStatus, type PortalService, type ServiceStatus } from '../config/serviceCatalog';
import { ArionOverviewPage } from './arion/ArionOverviewPage';
import { ArionPageWrapper } from '../arion/ArionPageWrapper';
// Website pages
import { WebsiteOverview } from '../arion/pages/website/WebsiteOverview';
import { WebsiteContent } from '../arion/pages/website/WebsiteContent';
import { ContentSeoOverview } from '../arion/pages/website/ContentSeoOverview';
import { ContentSeoPages } from '../arion/pages/website/ContentSeoPages';
import { ContentSeoPosts } from '../arion/pages/website/ContentSeoPosts';
import { ContentSeoSchema } from '../arion/pages/website/ContentSeoSchema';
import { SecurityOverview } from '../arion/pages/website/SecurityOverview';
import { SecurityVulnerabilities } from '../arion/pages/website/SecurityVulnerabilities';
import { SecurityFirewall } from '../arion/pages/website/SecurityFirewall';
import { PerformanceCache } from '../arion/pages/website/PerformanceCache';
import { PerformanceImages } from '../arion/pages/website/PerformanceImages';
import { WebsiteUpdates } from '../arion/pages/website/WebsiteUpdates';
import { WebsiteStaging } from '../arion/pages/website/WebsiteStaging';
import { WebsiteSupport } from '../arion/pages/website/WebsiteSupport';
import { WebsiteSettings } from '../arion/pages/website/WebsiteSettings';
// Hosting pages
import { HostingOverview } from '../arion/pages/hosting/HostingOverview';
import { HostingDomainDns } from '../arion/pages/hosting/HostingDomainDns';
import { HostingBackups } from '../arion/pages/hosting/HostingBackups';
import { HostingPerformance } from '../arion/pages/hosting/HostingPerformance';
// Analytics pages
import { AnalyticsOverview } from '../arion/pages/analytics/AnalyticsOverview';
import { AnalyticsTraffic } from '../arion/pages/analytics/AnalyticsTraffic';
import { AnalyticsConversions } from '../arion/pages/analytics/AnalyticsConversions';
import { AnalyticsPages } from '../arion/pages/analytics/AnalyticsPages';
import { AnalyticsReports } from '../arion/pages/analytics/AnalyticsReports';
import { IAInsightsCrossChannel } from '../arion/pages/analytics/IAInsightsCrossChannel';
import { IAInsightsReports } from '../arion/pages/analytics/IAInsightsReports';
// SEO pages
import { SeoOverview } from '../arion/pages/seo/SeoOverview';
import { SeoRankings } from '../arion/pages/seo/SeoRankings';
import { SeoSiteAudit } from '../arion/pages/seo/SeoSiteAudit';
import { SeoCompetitors } from '../arion/pages/seo/SeoCompetitors';
import { SeoOpportunities } from '../arion/pages/seo/SeoOpportunities';
import { SeoReports } from '../arion/pages/seo/SeoReports';
// Search pages
import { SearchPerformance } from '../arion/pages/search/SearchPerformance';
import { SearchIndexing } from '../arion/pages/search/SearchIndexing';
import { SearchSitemaps } from '../arion/pages/search/SearchSitemaps';
import { SearchCoreWebVitals } from '../arion/pages/search/SearchCoreWebVitals';
import { SearchBingCopilot } from '../arion/pages/search/SearchBingCopilot';
import { SearchBingIndexNow } from '../arion/pages/search/SearchBingIndexNow';
// Business pages
import { BusinessOverview } from '../arion/pages/business/BusinessOverview';
import { BusinessReviews } from '../arion/pages/business/BusinessReviews';
import { BusinessInsights } from '../arion/pages/business/BusinessInsights';
import { BusinessPosts } from '../arion/pages/business/BusinessPosts';
import { BusinessServices } from '../arion/pages/business/BusinessServices';
import { BusinessBingOverview } from '../arion/pages/business/BusinessBingOverview';
import { BusinessAppleOverview } from '../arion/pages/business/BusinessAppleOverview';
// Brand page
import { BrandPage } from '../arion/pages/BrandPage';
import { SparkOverviewPage } from './spark/SparkOverviewPage';
import { SparkContactsPage } from './spark/SparkContactsPage';
import { SparkListsPage } from './spark/SparkListsPage';
import { SparkTagsPage } from './spark/SparkTagsPage';
import { SparkSegmentsPage } from './spark/SparkSegmentsPage';
import { SparkCampaignsPage } from './spark/SparkCampaignsPage';
import { SparkFormsPage } from './spark/SparkFormsPage';
import { SparkAutomationsPage } from './spark/SparkAutomationsPage';
import { SparkLeadsPage } from './spark/SparkLeadsPage';
import { SparkSearchProfilesPage } from './spark/SparkSearchProfilesPage';
import { SparkIntelligencePage } from './spark/SparkIntelligencePage';
import { SparkUsagePage } from './spark/SparkUsagePage';
import { OliverDashboardPage } from './oliver/OliverDashboardPage';
import { OliverJobBoardPage } from './oliver/OliverJobBoardPage';
import { OliverSchedulePage } from './oliver/OliverSchedulePage';
import { OliverDispatchPage } from './oliver/OliverDispatchPage';
import { OliverWorkersPage } from './oliver/OliverWorkersPage';
import { OliverCrewPerformancePage } from './oliver/OliverCrewPerformancePage';
import { OliverContactsPage } from './oliver/OliverContactsPage';
import { OliverServiceRequestsPage } from './oliver/OliverServiceRequestsPage';
import { OliverQuotesPage } from './oliver/OliverQuotesPage';
import { OliverInvoicesPage } from './oliver/OliverInvoicesPage';
import { OliverPaymentsPage } from './oliver/OliverPaymentsPage';
import { OliverRecurringPage } from './oliver/OliverRecurringPage';
import { OliverMessagesPage } from './oliver/OliverMessagesPage';
import { OliverNotificationsPage } from './oliver/OliverNotificationsPage';
import { OliverReportsPage } from './oliver/OliverReportsPage';
import { OliverActivityLogPage } from './oliver/OliverActivityLogPage';
import { OliverSettingsPage } from './oliver/OliverSettingsPage';
import { ConsultingOverviewPage } from './consulting/ConsultingOverviewPage';
import { ConsultingEngagementWrapper } from './consulting/ConsultingEngagementWrapper';
import { ConsultingCalendarPage } from './consulting/ConsultingCalendarPage';

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
    switch (service.key) {
      case 'arion_dashboard': return <ArionPageWrapper><ArionOverviewPage service={service} status={status} /></ArionPageWrapper>;
      case 'arion_website_overview': return <ArionPageWrapper><WebsiteOverview /></ArionPageWrapper>;
      case 'arion_website_content': return <ArionPageWrapper><WebsiteContent /></ArionPageWrapper>;
      case 'arion_website_content_seo_overview': return <ArionPageWrapper><ContentSeoOverview /></ArionPageWrapper>;
      case 'arion_website_content_seo_pages': return <ArionPageWrapper><ContentSeoPages /></ArionPageWrapper>;
      case 'arion_website_content_seo_posts': return <ArionPageWrapper><ContentSeoPosts /></ArionPageWrapper>;
      case 'arion_website_content_seo_schema': return <ArionPageWrapper><ContentSeoSchema /></ArionPageWrapper>;
      case 'arion_website_security_overview': return <ArionPageWrapper><SecurityOverview /></ArionPageWrapper>;
      case 'arion_website_security_vulnerabilities': return <ArionPageWrapper><SecurityVulnerabilities /></ArionPageWrapper>;
      case 'arion_website_security_firewall': return <Navigate to="/app/services/arion_website_security_overview" replace />;
      case 'arion_website_performance_cache': return <ArionPageWrapper><PerformanceCache /></ArionPageWrapper>;
      case 'arion_website_performance_images': return <ArionPageWrapper><PerformanceImages /></ArionPageWrapper>;
      case 'arion_website_updates': return <ArionPageWrapper><WebsiteUpdates /></ArionPageWrapper>;
      case 'arion_website_staging': return <ArionPageWrapper><WebsiteStaging /></ArionPageWrapper>;
      case 'arion_website_support': return <ArionPageWrapper><WebsiteSupport /></ArionPageWrapper>;
      case 'arion_website_settings': return <ArionPageWrapper><WebsiteSettings /></ArionPageWrapper>;
      case 'arion_hosting_overview': return <ArionPageWrapper><HostingOverview /></ArionPageWrapper>;
      case 'arion_hosting_domain_dns': return <ArionPageWrapper><HostingDomainDns /></ArionPageWrapper>;
      case 'arion_hosting_backups': return <ArionPageWrapper><HostingBackups /></ArionPageWrapper>;
      case 'arion_hosting_performance': return <ArionPageWrapper><HostingPerformance /></ArionPageWrapper>;
      case 'arion_analytics_overview': return <ArionPageWrapper><AnalyticsOverview /></ArionPageWrapper>;
      case 'arion_analytics_traffic': return <ArionPageWrapper><AnalyticsTraffic /></ArionPageWrapper>;
      case 'arion_analytics_conversions': return <ArionPageWrapper><AnalyticsConversions /></ArionPageWrapper>;
      case 'arion_analytics_pages': return <ArionPageWrapper><AnalyticsPages /></ArionPageWrapper>;
      case 'arion_analytics_reports': return <ArionPageWrapper><AnalyticsReports /></ArionPageWrapper>;
      case 'arion_analytics_ia_cross_channel': return <ArionPageWrapper><IAInsightsCrossChannel /></ArionPageWrapper>;
      case 'arion_analytics_ia_reports': return <ArionPageWrapper><IAInsightsReports /></ArionPageWrapper>;
      case 'arion_seo_overview': return <ArionPageWrapper><SeoOverview /></ArionPageWrapper>;
      case 'arion_seo_rankings': return <ArionPageWrapper><SeoRankings /></ArionPageWrapper>;
      case 'arion_seo_site_audit': return <ArionPageWrapper><SeoSiteAudit /></ArionPageWrapper>;
      case 'arion_seo_competitors': return <ArionPageWrapper><SeoCompetitors /></ArionPageWrapper>;
      case 'arion_seo_opportunities': return <ArionPageWrapper><SeoOpportunities /></ArionPageWrapper>;
      case 'arion_seo_reports': return <ArionPageWrapper><SeoReports /></ArionPageWrapper>;
      case 'arion_search_performance': return <ArionPageWrapper><SearchPerformance /></ArionPageWrapper>;
      case 'arion_search_indexing': return <ArionPageWrapper><SearchIndexing /></ArionPageWrapper>;
      case 'arion_search_sitemaps': return <Navigate to="/app/services/arion_search_indexing" replace />;
      case 'arion_search_core_web_vitals': return <Navigate to="/app/services/arion_website_performance_cache" replace />;
      case 'arion_search_bing_copilot': return <ArionPageWrapper><SearchBingCopilot /></ArionPageWrapper>;
      case 'arion_search_bing_indexnow': return <ArionPageWrapper><SearchBingIndexNow /></ArionPageWrapper>;
      case 'arion_business_overview': return <ArionPageWrapper><BusinessOverview /></ArionPageWrapper>;
      case 'arion_business_reviews': return <ArionPageWrapper><BusinessReviews /></ArionPageWrapper>;
      case 'arion_business_insights': return <ArionPageWrapper><BusinessInsights /></ArionPageWrapper>;
      case 'arion_business_posts': return <ArionPageWrapper><BusinessPosts /></ArionPageWrapper>;
      case 'arion_business_services': return <ArionPageWrapper><BusinessServices /></ArionPageWrapper>;
      case 'arion_business_bing_overview': return <ArionPageWrapper><BusinessBingOverview /></ArionPageWrapper>;
      case 'arion_business_apple_overview': return <ArionPageWrapper><BusinessAppleOverview /></ArionPageWrapper>;
      case 'arion_brand': return <ArionPageWrapper><BrandPage /></ArionPageWrapper>;
      default: break;
    }
  }

  if (service.section === 'OLIVER') {
    switch (service.key) {
      case 'oliver_dashboard': return <OliverDashboardPage />;
      case 'oliver_job_board': return <OliverJobBoardPage />;
      case 'oliver_schedule': return <OliverSchedulePage />;
      case 'oliver_dispatch': return <OliverDispatchPage />;
      case 'oliver_workers': return <OliverWorkersPage />;
      case 'oliver_crew_performance': return <OliverCrewPerformancePage />;
      case 'oliver_contacts': return <OliverContactsPage />;
      case 'oliver_service_requests': return <OliverServiceRequestsPage />;
      case 'oliver_quotes': return <OliverQuotesPage />;
      case 'oliver_invoices': return <OliverInvoicesPage />;
      case 'oliver_payments': return <OliverPaymentsPage />;
      case 'oliver_recurring': return <OliverRecurringPage />;
      case 'oliver_messages': return <OliverMessagesPage />;
      case 'oliver_notifications': return <OliverNotificationsPage />;
      case 'oliver_reports': return <OliverReportsPage />;
      case 'oliver_activity_log': return <OliverActivityLogPage />;
      case 'oliver_settings': return <OliverSettingsPage />;
      default: break;
    }
  }

  if (service.section === 'LUMEN') {
    switch (service.key) {
      case 'spark_overview': return <SparkOverviewPage />;
      case 'spark_contacts': return <SparkContactsPage />;
      case 'spark_lists': return <SparkListsPage />;
      case 'spark_tags': return <SparkTagsPage />;
      case 'spark_segments': return <SparkSegmentsPage />;
      case 'spark_campaigns': return <SparkCampaignsPage />;
      case 'spark_forms': return <SparkFormsPage />;
      case 'spark_automations': return <SparkAutomationsPage />;
      case 'spark_leads': return <SparkLeadsPage />;
      case 'spark_search_profiles': return <SparkSearchProfilesPage />;
      case 'spark_intelligence': return <SparkIntelligencePage />;
      case 'spark_usage': return <SparkUsagePage />;
      // Backward compat aliases for old lumen_* keys
      case 'lumen_overview': return <SparkOverviewPage />;
      case 'lumen_contacts': return <SparkContactsPage />;
      case 'lumen_campaigns': return <SparkCampaignsPage />;
      case 'lumen_leads': return <SparkLeadsPage />;
      default: break;
    }
  }

  if (service.section === 'CONSULTING') {
    switch (service.key) {
      case 'consulting_overview': return <ConsultingOverviewPage />;
      case 'consulting_brand_tasks': return <ConsultingEngagementWrapper engagementType="build_your_brand" view="tasks" />;
      case 'consulting_brand_deliverables': return <ConsultingEngagementWrapper engagementType="build_your_brand" view="deliverables" />;
      case 'consulting_foundation_tasks': return <ConsultingEngagementWrapper engagementType="build_your_foundation" view="tasks" />;
      case 'consulting_foundation_deliverables': return <ConsultingEngagementWrapper engagementType="build_your_foundation" view="deliverables" />;
      case 'consulting_clarity_tasks': return <ConsultingEngagementWrapper engagementType="build_your_clarity" view="tasks" />;
      case 'consulting_clarity_deliverables': return <ConsultingEngagementWrapper engagementType="build_your_clarity" view="deliverables" />;
      case 'consulting_engine_tasks': return <ConsultingEngagementWrapper engagementType="build_your_engine" view="tasks" />;
      case 'consulting_engine_deliverables': return <ConsultingEngagementWrapper engagementType="build_your_engine" view="deliverables" />;
      case 'consulting_calendar': return <ConsultingCalendarPage />;
      default: break;
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
