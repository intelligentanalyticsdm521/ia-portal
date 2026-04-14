export type ServiceStatus = 'enabled' | 'not_subscribed' | 'coming_soon';

export interface PortalService {
  key: string;
  displayName: string;
  section: 'Shared' | 'ARION' | 'STELLA' | 'OLIVER' | 'LUMEN' | 'FORGE' | 'ARGUS' | 'CONSULTING';
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
  ARGUS: 'ARGUS — Orchestration & Automation',
  CONSULTING: 'CONSULTING — IA Work & Deliverables'
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
    key: 'arion_content_seo',
    displayName: 'Content SEO',
    section: 'ARION',
    defaultStatus: 'coming_soon',
    route: '/app/services/arion_content_seo',
    description: 'Rank Math SEO scores, meta tags, focus keywords, and schema status for all pages and posts.'
  },
  {
    key: 'arion_security',
    displayName: 'Security',
    section: 'ARION',
    defaultStatus: 'coming_soon',
    route: '/app/services/arion_security',
    description: 'Wordfence scan results, vulnerability checks, firewall status, and login security.'
  },
  {
    key: 'arion_performance',
    displayName: 'Performance',
    section: 'ARION',
    defaultStatus: 'coming_soon',
    route: '/app/services/arion_performance',
    description: 'PageSpeed scores, Core Web Vitals history, cache management, and image optimization.'
  },
  {
    key: 'arion_bing',
    displayName: 'Bing & Copilot',
    section: 'ARION',
    defaultStatus: 'coming_soon',
    route: '/app/services/arion_bing',
    description: 'Bing Webmaster, Copilot AI appearances, IndexNow status, and Bing Places management.'
  },
  {
    key: 'arion_ia_insights',
    displayName: 'IA Insights',
    section: 'ARION',
    defaultStatus: 'coming_soon',
    route: '/app/services/arion_ia_insights',
    description: 'Cross-channel analytics funnel and ARGUS-powered automated reports.'
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
  { key: 'oliver_workers', displayName: 'Team', section: 'OLIVER', defaultStatus: 'not_subscribed', route: '/app/services/oliver_workers', description: 'Manage team members and contractors.' },
  { key: 'oliver_crew_performance', displayName: 'Team Performance', section: 'OLIVER', defaultStatus: 'not_subscribed', route: '/app/services/oliver_crew_performance', description: 'Per-member job completion stats and assignment counts.' },
  { key: 'oliver_contacts', displayName: 'Contacts', section: 'OLIVER', defaultStatus: 'not_subscribed', route: '/app/services/oliver_contacts', description: 'Customer contact list from SPARK CRM cache.' },
  { key: 'oliver_service_requests', displayName: 'Service Requests', section: 'OLIVER', defaultStatus: 'not_subscribed', route: '/app/services/oliver_service_requests', description: 'Inbound job inquiries from the customer portal.' },
  { key: 'oliver_quotes', displayName: 'Quotes', section: 'OLIVER', defaultStatus: 'not_subscribed', route: '/app/services/oliver_quotes', description: 'Create, send, and track quotes. Convert accepted quotes to invoices.' },
  { key: 'oliver_invoices', displayName: 'Invoices', section: 'OLIVER', defaultStatus: 'not_subscribed', route: '/app/services/oliver_invoices', description: 'Invoice management with Stripe payment links.' },
  { key: 'oliver_payments', displayName: 'Payments', section: 'OLIVER', defaultStatus: 'not_subscribed', route: '/app/services/oliver_payments', description: 'Payment history and received payment overview.' },
  { key: 'oliver_recurring', displayName: 'Recurring & Subscriptions', section: 'OLIVER', defaultStatus: 'not_subscribed', route: '/app/services/oliver_recurring', description: 'Stripe subscriptions and recurring job templates.' },
  { key: 'oliver_messages', displayName: 'Messages', section: 'OLIVER', defaultStatus: 'not_subscribed', route: '/app/services/oliver_messages', description: '2-way messaging with customers and team.' },
  { key: 'oliver_notifications', displayName: 'Notifications', section: 'OLIVER', defaultStatus: 'not_subscribed', route: '/app/services/oliver_notifications', description: 'ACS email notification history.' },
  { key: 'oliver_reports', displayName: 'Reports', section: 'OLIVER', defaultStatus: 'not_subscribed', route: '/app/services/oliver_reports', description: 'Revenue, job volume, and completion analytics with charts.' },
  { key: 'oliver_activity_log', displayName: 'Activity Log', section: 'OLIVER', defaultStatus: 'not_subscribed', route: '/app/services/oliver_activity_log', description: 'Full audit trail of all job status transitions.' },
  { key: 'oliver_settings', displayName: 'Settings', section: 'OLIVER', defaultStatus: 'not_subscribed', route: '/app/services/oliver_settings', description: 'Tenant settings and Stripe configuration.' },
  // SPARK — Full CRM + Lead Gen + Intelligence suite
  { key: 'spark_overview', displayName: 'Overview', section: 'LUMEN', defaultStatus: 'not_subscribed', route: '/app/services/spark_overview', description: 'SPARK CRM summary: contacts, campaigns, leads pipeline, usage.' },
  { key: 'spark_contacts', displayName: 'Contacts', section: 'LUMEN', defaultStatus: 'not_subscribed', route: '/app/services/spark_contacts', description: 'Contact management with dedup, search, import, and activity history.' },
  { key: 'spark_lists', displayName: 'Lists', section: 'LUMEN', defaultStatus: 'not_subscribed', route: '/app/services/spark_lists', description: 'Static contact lists for campaign targeting.' },
  { key: 'spark_tags', displayName: 'Tags', section: 'LUMEN', defaultStatus: 'not_subscribed', route: '/app/services/spark_tags', description: 'Color-coded contact tags for organization.' },
  { key: 'spark_segments', displayName: 'Segments', section: 'LUMEN', defaultStatus: 'not_subscribed', route: '/app/services/spark_segments', description: 'Dynamic contact segments with filter rules.' },
  { key: 'spark_campaigns', displayName: 'Campaigns', section: 'LUMEN', defaultStatus: 'not_subscribed', route: '/app/services/spark_campaigns', description: 'Email and SMS campaign management with analytics.' },
  { key: 'spark_forms', displayName: 'Forms', section: 'LUMEN', defaultStatus: 'not_subscribed', route: '/app/services/spark_forms', description: 'Form builder with hosted URLs and embedded widgets.' },
  { key: 'spark_automations', displayName: 'Automations', section: 'LUMEN', defaultStatus: 'not_subscribed', route: '/app/services/spark_automations', description: 'Welcome and re-engagement email sequences.' },
  { key: 'spark_leads', displayName: 'Lead Inbox', section: 'LUMEN', defaultStatus: 'not_subscribed', route: '/app/services/spark_leads', description: 'B2B lead inbox with Hot/Warm/Cold scoring.' },
  { key: 'spark_search_profiles', displayName: 'Search Profiles', section: 'LUMEN', defaultStatus: 'not_subscribed', route: '/app/services/spark_search_profiles', description: 'Saved lead search configurations.' },
  { key: 'spark_intelligence', displayName: 'Contact Scoring', section: 'LUMEN', defaultStatus: 'not_subscribed', route: '/app/services/spark_intelligence', description: 'X/Y/Z contact intelligence with OLIVER cross-platform signals.' },
  { key: 'spark_usage', displayName: 'Usage & Billing', section: 'LUMEN', defaultStatus: 'not_subscribed', route: '/app/services/spark_usage', description: 'Email, SMS, contact, and lead usage vs tier limits.' },
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
  },
  // CONSULTING — IA Work & Deliverables (platform-level, always enabled for all tenants)
  { key: 'consulting_overview', displayName: 'Overview', section: 'CONSULTING', defaultStatus: 'enabled', route: '/app/services/consulting_overview', description: 'Summary of active engagements, tasks, deliverables, and upcoming events.' },
  { key: 'consulting_brand_tasks', displayName: 'Brand Tasks', section: 'CONSULTING', defaultStatus: 'enabled', route: '/app/services/consulting_brand_tasks', description: 'Build Your Brand engagement tasks — logo, identity, website, GBP, SEO.' },
  { key: 'consulting_brand_deliverables', displayName: 'Brand Deliverables', section: 'CONSULTING', defaultStatus: 'enabled', route: '/app/services/consulting_brand_deliverables', description: 'Build Your Brand deliverables for review and approval.' },
  { key: 'consulting_foundation_tasks', displayName: 'Foundation Tasks', section: 'CONSULTING', defaultStatus: 'enabled', route: '/app/services/consulting_foundation_tasks', description: 'Build Your Foundation tasks — OLIVER setup, CRM config, process design.' },
  { key: 'consulting_foundation_deliverables', displayName: 'Foundation Deliverables', section: 'CONSULTING', defaultStatus: 'enabled', route: '/app/services/consulting_foundation_deliverables', description: 'Build Your Foundation deliverables for review and approval.' },
  { key: 'consulting_clarity_tasks', displayName: 'Clarity Tasks', section: 'CONSULTING', defaultStatus: 'enabled', route: '/app/services/consulting_clarity_tasks', description: 'Build Your Clarity tasks — analytics, reporting, dashboards.' },
  { key: 'consulting_clarity_deliverables', displayName: 'Clarity Deliverables', section: 'CONSULTING', defaultStatus: 'enabled', route: '/app/services/consulting_clarity_deliverables', description: 'Build Your Clarity deliverables for review and approval.' },
  { key: 'consulting_engine_tasks', displayName: 'Engine Tasks', section: 'CONSULTING', defaultStatus: 'enabled', route: '/app/services/consulting_engine_tasks', description: 'Build Your Engine tasks — custom development, automation, integrations.' },
  { key: 'consulting_engine_deliverables', displayName: 'Engine Deliverables', section: 'CONSULTING', defaultStatus: 'enabled', route: '/app/services/consulting_engine_deliverables', description: 'Build Your Engine deliverables for review and approval.' },
  { key: 'consulting_calendar', displayName: 'Calendar & Events', section: 'CONSULTING', defaultStatus: 'enabled', route: '/app/services/consulting_calendar', description: 'Scheduled events — discovery calls, QBRs, strategy sessions, reviews.' },
];

export function resolveServiceStatus(service: PortalService, enabledKeys: Set<string>): ServiceStatus {
  if (service.defaultStatus === 'enabled') return 'enabled';
  if (enabledKeys.has(service.key)) return 'enabled';
  return service.defaultStatus;
}
