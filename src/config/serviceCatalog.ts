export type ServiceStatus = 'enabled' | 'not_subscribed' | 'coming_soon';

export interface PortalService {
  key: string;
  displayName: string;
  section: 'Shared' | 'ARION' | 'STELLA' | 'OLIVER' | 'LUMEN' | 'FORGE' | 'ARGUS';
  defaultStatus: ServiceStatus;
  route: string;
  description: string;
}

export const LAYER_LABELS: Record<PortalService['section'], string> = {
  Shared: 'Overview',
  ARION: 'ARION — Web & Digital Presence',
  STELLA: 'STELLA — Reporting & BI',
  OLIVER: 'OLIVER — Operations & Portals',
  LUMEN: 'SPARK — Growth Platform',
  FORGE: 'FORGE — Software & Integrations',
  ARGUS: 'ARGUS — Orchestration & Automation'
};

export const SERVICE_CATALOG: PortalService[] = [
  {
    key: 'portal_overview',
    displayName: 'Overview',
    section: 'Shared',
    defaultStatus: 'enabled',
    route: '/app/overview',
    description: 'High-level account overview and shortcuts into each Intelligence Layer.'
  },
  {
    key: 'arion_overview',
    displayName: 'Overview',
    section: 'ARION',
    defaultStatus: 'coming_soon',
    route: '/app/services/arion_overview',
    description: 'High-level website, hosting, console, maps, and SEO status.'
  },
  {
    key: 'arion_website_analytics',
    displayName: 'Website Analytics',
    section: 'ARION',
    defaultStatus: 'coming_soon',
    route: '/app/services/arion_website_analytics',
    description: 'Google and Bing website analytics with site-level performance.'
  },
  {
    key: 'arion_hosting',
    displayName: 'Hosting',
    section: 'ARION',
    defaultStatus: 'coming_soon',
    route: '/app/services/arion_hosting',
    description: 'Hosting details, health, WordPress, PHP, and plugin update readiness.'
  },
  {
    key: 'arion_seo',
    displayName: 'SEO',
    section: 'ARION',
    defaultStatus: 'coming_soon',
    route: '/app/services/arion_seo',
    description: 'SE Ranking powered SEO package visibility, reporting, and project status.'
  },
  {
    key: 'arion_console',
    displayName: 'Console',
    section: 'ARION',
    defaultStatus: 'coming_soon',
    route: '/app/services/arion_console',
    description: 'Google Search Console and Bing Webmaster reporting and setup.'
  },
  {
    key: 'arion_my_business',
    displayName: 'My Business',
    section: 'ARION',
    defaultStatus: 'coming_soon',
    route: '/app/services/arion_my_business',
    description: 'Google, Apple, and Bing business profile management.'
  },
  {
    key: 'arion_brand',
    displayName: 'Your Brand',
    section: 'ARION',
    defaultStatus: 'coming_soon',
    route: '/app/services/arion_brand',
    description: 'Brand management tools — assets, style guides, and digital brand presence.'
  },
  {
    key: 'stella_dashboards',
    displayName: 'Dashboards',
    section: 'STELLA',
    defaultStatus: 'coming_soon',
    route: '/app/services/stella_dashboards',
    description: 'KPI dashboards and operational performance panels (placeholder).'
  },
  // OLIVER — Full FSM suite (16 pages)
  { key: 'oliver_dashboard', displayName: 'Dashboard', section: 'OLIVER', defaultStatus: 'not_subscribed', route: '/app/services/oliver_dashboard', description: 'KPI overview: active jobs, revenue, open invoices, and recent activity.' },
  { key: 'oliver_job_board', displayName: 'Job Board', section: 'OLIVER', defaultStatus: 'not_subscribed', route: '/app/services/oliver_job_board', description: 'List and Kanban views of all jobs with status filtering.' },
  { key: 'oliver_schedule', displayName: 'Schedule', section: 'OLIVER', defaultStatus: 'not_subscribed', route: '/app/services/oliver_schedule', description: 'Calendar view of scheduled jobs and assignments.' },
  { key: 'oliver_dispatch', displayName: 'Dispatch', section: 'OLIVER', defaultStatus: 'not_subscribed', route: '/app/services/oliver_dispatch', description: 'Worker assignment, offer/accept dispatch flow.' },
  { key: 'oliver_workers', displayName: 'Workers', section: 'OLIVER', defaultStatus: 'not_subscribed', route: '/app/services/oliver_workers', description: 'Manage field workers and crew members.' },
  { key: 'oliver_crew_performance', displayName: 'Crew Performance', section: 'OLIVER', defaultStatus: 'not_subscribed', route: '/app/services/oliver_crew_performance', description: 'Per-worker job completion stats and assignment counts.' },
  { key: 'oliver_contacts', displayName: 'Contacts', section: 'OLIVER', defaultStatus: 'not_subscribed', route: '/app/services/oliver_contacts', description: 'Customer contact list from SPARK CRM cache.' },
  { key: 'oliver_service_requests', displayName: 'Service Requests', section: 'OLIVER', defaultStatus: 'not_subscribed', route: '/app/services/oliver_service_requests', description: 'Inbound job inquiries from the customer portal.' },
  { key: 'oliver_quotes', displayName: 'Quotes', section: 'OLIVER', defaultStatus: 'not_subscribed', route: '/app/services/oliver_quotes', description: 'Create, send, and track quotes. Convert accepted quotes to invoices.' },
  { key: 'oliver_invoices', displayName: 'Invoices', section: 'OLIVER', defaultStatus: 'not_subscribed', route: '/app/services/oliver_invoices', description: 'Invoice management with Stripe payment links.' },
  { key: 'oliver_payments', displayName: 'Payments', section: 'OLIVER', defaultStatus: 'not_subscribed', route: '/app/services/oliver_payments', description: 'Payment history and received payment overview.' },
  { key: 'oliver_recurring', displayName: 'Recurring & Subscriptions', section: 'OLIVER', defaultStatus: 'not_subscribed', route: '/app/services/oliver_recurring', description: 'Stripe subscriptions and recurring job templates.' },
  { key: 'oliver_messages', displayName: 'Messages', section: 'OLIVER', defaultStatus: 'not_subscribed', route: '/app/services/oliver_messages', description: '2-way messaging with customers and crew.' },
  { key: 'oliver_notifications', displayName: 'Notifications', section: 'OLIVER', defaultStatus: 'not_subscribed', route: '/app/services/oliver_notifications', description: 'ACS email notification history.' },
  { key: 'oliver_reports', displayName: 'Reports', section: 'OLIVER', defaultStatus: 'not_subscribed', route: '/app/services/oliver_reports', description: 'Revenue, job volume, and completion analytics with charts.' },
  { key: 'oliver_activity_log', displayName: 'Activity Log', section: 'OLIVER', defaultStatus: 'not_subscribed', route: '/app/services/oliver_activity_log', description: 'Full audit trail of all job status transitions.' },
  { key: 'oliver_settings', displayName: 'Settings', section: 'OLIVER', defaultStatus: 'not_subscribed', route: '/app/services/oliver_settings', description: 'Tenant settings and Stripe configuration.' },
  {
    key: 'lumen_overview',
    displayName: 'Overview — Standard',
    section: 'LUMEN',
    defaultStatus: 'not_subscribed',
    route: '/app/services/lumen_overview',
    description: 'High-level SPARK growth summary: email & SMS usage, active audiences, and recent performance.'
  },
  {
    key: 'lumen_contacts',
    displayName: 'CRM — Standard',
    section: 'LUMEN',
    defaultStatus: 'not_subscribed',
    route: '/app/services/lumen_contacts',
    description: 'Read-only CRM view into SPARK contacts, segments, and basic engagement.'
  },
  {
    key: 'lumen_campaigns',
    displayName: 'Campaigns & Messaging',
    section: 'LUMEN',
    defaultStatus: 'not_subscribed',
    route: '/app/services/lumen_campaigns',
    description: 'Recent and upcoming SPARK email & SMS campaigns.'
  },
  {
    key: 'lumen_leads',
    displayName: 'Leads — Preview',
    section: 'LUMEN',
    defaultStatus: 'coming_soon',
    route: '/app/services/lumen_leads',
    description: 'Future lead capture and routing surfaces for SPARK + OLIVER. Placeholder only in v1.'
  },
  {
    key: 'forge_integrations',
    displayName: 'Integrations',
    section: 'FORGE',
    defaultStatus: 'coming_soon',
    route: '/app/services/forge_integrations',
    description: 'Integration health and sync status (placeholder).'
  },
  {
    key: 'argus_automation',
    displayName: 'Automation',
    section: 'ARGUS',
    defaultStatus: 'coming_soon',
    route: '/app/services/argus_automation',
    description: 'Automation orchestration and Intelligence Layer wiring (placeholder).'
  }
];

export function resolveServiceStatus(service: PortalService, enabledKeys: Set<string>): ServiceStatus {
  if (service.defaultStatus === 'enabled') return 'enabled';
  if (enabledKeys.has(service.key)) return 'enabled';
  return service.defaultStatus;
}
