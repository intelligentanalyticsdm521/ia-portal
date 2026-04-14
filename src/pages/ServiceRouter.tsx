import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useAppState } from '../app/AppState';
import { SERVICE_CATALOG, resolveServiceStatus, type PortalService, type ServiceStatus } from '../config/serviceCatalog';
import { ArionOverviewPage } from './arion/ArionOverviewPage';
import { ArionWebsiteAnalyticsPage } from './arion/ArionWebsiteAnalyticsPage';
import { ArionHostingPage } from './arion/ArionHostingPage';
import { ArionSeoPage } from './arion/ArionSeoPage';
import { ArionConsolePage } from './arion/ArionConsolePage';
import { ArionMyBusinessPage } from './arion/ArionMyBusinessPage';
import { ArionContentSeoPage } from './arion/ArionContentSeoPage';
import { ArionSecurityPage } from './arion/ArionSecurityPage';
import { ArionPerformancePage } from './arion/ArionPerformancePage';
import { ArionBingPage } from './arion/ArionBingPage';
import { ArionIAInsightsPage } from './arion/ArionIAInsightsPage';
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
      case 'arion_overview': return <ArionOverviewPage service={service} status={status} />;
      case 'arion_website_analytics': return <ArionWebsiteAnalyticsPage service={service} status={status} />;
      case 'arion_hosting': return <ArionHostingPage service={service} status={status} />;
      case 'arion_seo': return <ArionSeoPage service={service} status={status} />;
      case 'arion_console': return <ArionConsolePage service={service} status={status} />;
      case 'arion_my_business': return <ArionMyBusinessPage service={service} status={status} />;
      case 'arion_content_seo': return <ArionContentSeoPage service={service} status={status} />;
      case 'arion_security': return <ArionSecurityPage service={service} status={status} />;
      case 'arion_performance': return <ArionPerformancePage service={service} status={status} />;
      case 'arion_bing': return <ArionBingPage service={service} status={status} />;
      case 'arion_ia_insights': return <ArionIAInsightsPage service={service} status={status} />;
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
