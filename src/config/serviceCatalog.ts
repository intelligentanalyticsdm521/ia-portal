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
  // ARION — Full Web & Digital Presence suite (46 pages)
  { key: 'arion_dashboard', displayName: 'Dashboard', section: 'ARION', defaultStatus: 'coming_soon', route: '/app/services/arion_dashboard', description: 'High-level ARION dashboard with website, hosting, SEO, and business profile status.' },
  { key: 'arion_website_overview', displayName: 'Website Overview', section: 'ARION', defaultStatus: 'coming_soon', route: '/app/services/arion_website_overview', description: 'Website health summary — uptime, WordPress version, plugin status, and quick actions.' },
  { key: 'arion_website_content', displayName: 'Website Content', section: 'ARION', defaultStatus: 'coming_soon', route: '/app/services/arion_website_content', description: 'Page and post content inventory with last-modified dates and publish status.' },
  { key: 'arion_website_content_seo_overview', displayName: 'Content SEO Overview', section: 'ARION', defaultStatus: 'coming_soon', route: '/app/services/arion_website_content_seo_overview', description: 'Rank Math SEO score summary across all pages and posts.' },
  { key: 'arion_website_content_seo_pages', displayName: 'Content SEO — Pages', section: 'ARION', defaultStatus: 'coming_soon', route: '/app/services/arion_website_content_seo_pages', description: 'Per-page Rank Math SEO scores, focus keywords, and meta tag status.' },
  { key: 'arion_website_content_seo_posts', displayName: 'Content SEO — Posts', section: 'ARION', defaultStatus: 'coming_soon', route: '/app/services/arion_website_content_seo_posts', description: 'Per-post Rank Math SEO scores, focus keywords, and meta tag status.' },
  { key: 'arion_website_content_seo_schema', displayName: 'Content SEO — Schema', section: 'ARION', defaultStatus: 'coming_soon', route: '/app/services/arion_website_content_seo_schema', description: 'Structured data and schema markup status for pages and posts.' },
  { key: 'arion_website_security_overview', displayName: 'Security Overview', section: 'ARION', defaultStatus: 'coming_soon', route: '/app/services/arion_website_security_overview', description: 'Wordfence scan results, threat level, and overall security posture.' },
  { key: 'arion_website_security_vulnerabilities', displayName: 'Security Vulnerabilities', section: 'ARION', defaultStatus: 'coming_soon', route: '/app/services/arion_website_security_vulnerabilities', description: 'Known plugin and theme vulnerabilities with severity and patch status.' },
  { key: 'arion_website_security_firewall', displayName: 'Security Firewall', section: 'ARION', defaultStatus: 'coming_soon', route: '/app/services/arion_website_security_firewall', description: 'Wordfence firewall rules, blocked IPs, and brute-force protection status.' },
  { key: 'arion_website_performance_cache', displayName: 'Performance — Cache', section: 'ARION', defaultStatus: 'coming_soon', route: '/app/services/arion_website_performance_cache', description: 'Cache configuration, hit rates, and purge controls.' },
  { key: 'arion_website_performance_images', displayName: 'Performance — Images', section: 'ARION', defaultStatus: 'coming_soon', route: '/app/services/arion_website_performance_images', description: 'Image optimization status, WebP conversion, and lazy-load settings.' },
  { key: 'arion_website_updates', displayName: 'Website Updates', section: 'ARION', defaultStatus: 'coming_soon', route: '/app/services/arion_website_updates', description: 'Pending WordPress core, plugin, and theme updates with compatibility notes.' },
  { key: 'arion_website_staging', displayName: 'Website Staging', section: 'ARION', defaultStatus: 'coming_soon', route: '/app/services/arion_website_staging', description: 'Staging environment status, sync actions, and deploy history.' },
  { key: 'arion_website_support', displayName: 'Website Support', section: 'ARION', defaultStatus: 'coming_soon', route: '/app/services/arion_website_support', description: 'Support ticket history and quick-request submission for website issues.' },
  { key: 'arion_website_settings', displayName: 'Website Settings', section: 'ARION', defaultStatus: 'coming_soon', route: '/app/services/arion_website_settings', description: 'Site-level configuration — PHP version, WP settings, and environment variables.' },
  { key: 'arion_hosting_overview', displayName: 'Hosting Overview', section: 'ARION', defaultStatus: 'coming_soon', route: '/app/services/arion_hosting_overview', description: 'Hosting plan summary — server health, resource usage, and uptime.' },
  { key: 'arion_hosting_domain_dns', displayName: 'Domain & DNS', section: 'ARION', defaultStatus: 'coming_soon', route: '/app/services/arion_hosting_domain_dns', description: 'Domain registration, DNS records, SSL certificate status, and propagation checks.' },
  { key: 'arion_hosting_backups', displayName: 'Backups', section: 'ARION', defaultStatus: 'coming_soon', route: '/app/services/arion_hosting_backups', description: 'Backup schedule, retention, restore points, and download options.' },
  { key: 'arion_hosting_performance', displayName: 'Hosting Performance', section: 'ARION', defaultStatus: 'coming_soon', route: '/app/services/arion_hosting_performance', description: 'Server response times, PHP workers, bandwidth, and resource utilization.' },
  { key: 'arion_analytics_overview', displayName: 'Analytics Overview', section: 'ARION', defaultStatus: 'coming_soon', route: '/app/services/arion_analytics_overview', description: 'Google Analytics summary — sessions, users, bounce rate, and top pages.' },
  { key: 'arion_analytics_traffic', displayName: 'Analytics Traffic', section: 'ARION', defaultStatus: 'coming_soon', route: '/app/services/arion_analytics_traffic', description: 'Traffic sources, channels, referrals, and acquisition trends.' },
  { key: 'arion_analytics_audience', displayName: 'Analytics Audience', section: 'ARION', defaultStatus: 'coming_soon', route: '/app/services/arion_analytics_audience', description: 'New vs returning users, browser breakdown, hourly and daily patterns.' },
  { key: 'arion_analytics_content', displayName: 'Analytics Content', section: 'ARION', defaultStatus: 'coming_soon', route: '/app/services/arion_analytics_content', description: 'Top pages by views and engagement, landing page performance.' },
  { key: 'arion_analytics_conversions', displayName: 'Analytics Conversions', section: 'ARION', defaultStatus: 'coming_soon', route: '/app/services/arion_analytics_conversions', description: 'Form submissions, engagement metrics, and conversion tracking.' },
  { key: 'arion_analytics_pages', displayName: 'Analytics Pages', section: 'ARION', defaultStatus: 'coming_soon', route: '/app/services/arion_analytics_pages', description: 'Per-page analytics — pageviews, time on page, and exit rates.' },
  { key: 'arion_analytics_reports', displayName: 'Analytics Reports', section: 'ARION', defaultStatus: 'coming_soon', route: '/app/services/arion_analytics_reports', description: 'Scheduled and on-demand analytics reports with PDF export.' },
  { key: 'arion_analytics_ia_cross_channel', displayName: 'IA Cross-Channel Insights', section: 'ARION', defaultStatus: 'coming_soon', route: '/app/services/arion_analytics_ia_cross_channel', description: 'Cross-channel analytics funnel combining web, search, and business data.' },
  { key: 'arion_analytics_ia_reports', displayName: 'IA Insight Reports', section: 'ARION', defaultStatus: 'coming_soon', route: '/app/services/arion_analytics_ia_reports', description: 'ARGUS-powered automated insight reports with AI-generated recommendations.' },
  { key: 'arion_seo_overview', displayName: 'SEO Overview', section: 'ARION', defaultStatus: 'coming_soon', route: '/app/services/arion_seo_overview', description: 'SE Ranking SEO project summary — visibility score, tracked keywords, and trends.' },
  { key: 'arion_seo_rankings', displayName: 'SEO Rankings', section: 'ARION', defaultStatus: 'coming_soon', route: '/app/services/arion_seo_rankings', description: 'Keyword ranking positions, movement history, and SERP feature tracking.' },
  { key: 'arion_seo_site_audit', displayName: 'SEO Site Audit', section: 'ARION', defaultStatus: 'coming_soon', route: '/app/services/arion_seo_site_audit', description: 'Technical SEO audit results — crawl errors, broken links, and issue severity.' },
  { key: 'arion_seo_competitors', displayName: 'SEO Competitors', section: 'ARION', defaultStatus: 'coming_soon', route: '/app/services/arion_seo_competitors', description: 'Competitor visibility comparison, shared keywords, and gap analysis.' },
  { key: 'arion_seo_ai_search', displayName: 'AI Search Results', section: 'ARION', defaultStatus: 'coming_soon', route: '/app/services/arion_seo_ai_search', description: 'Track brand presence across ChatGPT, Gemini, AI Overview, and Perplexity — mentions, competitors, and cited sources.' },
  { key: 'arion_seo_market_monitor', displayName: 'Market Monitor', section: 'ARION', defaultStatus: 'coming_soon', route: '/app/services/arion_seo_market_monitor', description: 'Authority-tier market watch — new/lost backlinks, competitor page changes, and large ranking moves.' },
  { key: 'arion_seo_opportunities', displayName: 'SEO Opportunities', section: 'ARION', defaultStatus: 'coming_soon', route: '/app/services/arion_seo_opportunities', description: 'Keyword and content opportunities identified by SE Ranking analysis.' },
  { key: 'arion_seo_reports', displayName: 'SEO Reports', section: 'ARION', defaultStatus: 'coming_soon', route: '/app/services/arion_seo_reports', description: 'Scheduled SEO reports with ranking snapshots and audit summaries.' },
  { key: 'arion_search_performance', displayName: 'Search Performance', section: 'ARION', defaultStatus: 'coming_soon', route: '/app/services/arion_search_performance', description: 'Google Search Console performance — clicks, impressions, CTR, and position.' },
  { key: 'arion_search_indexing', displayName: 'Search Indexing', section: 'ARION', defaultStatus: 'coming_soon', route: '/app/services/arion_search_indexing', description: 'Index coverage status, crawl errors, and URL inspection results.' },
  { key: 'arion_search_sitemaps', displayName: 'Search Sitemaps', section: 'ARION', defaultStatus: 'coming_soon', route: '/app/services/arion_search_sitemaps', description: 'Sitemap submission status, indexed URL counts, and sitemap errors.' },
  { key: 'arion_search_core_web_vitals', displayName: 'Core Web Vitals', section: 'ARION', defaultStatus: 'coming_soon', route: '/app/services/arion_search_core_web_vitals', description: 'LCP, FID, CLS, and INP scores from CrUX with mobile and desktop breakdowns.' },
  { key: 'arion_search_bing_copilot', displayName: 'Bing Copilot', section: 'ARION', defaultStatus: 'coming_soon', route: '/app/services/arion_search_bing_copilot', description: 'Bing Copilot AI appearance tracking and citation monitoring.' },
  { key: 'arion_search_bing_indexnow', displayName: 'Bing IndexNow', section: 'ARION', defaultStatus: 'coming_soon', route: '/app/services/arion_search_bing_indexnow', description: 'IndexNow submission history, accepted URLs, and instant indexing status.' },
  { key: 'arion_business_overview', displayName: 'Business Overview', section: 'ARION', defaultStatus: 'coming_soon', route: '/app/services/arion_business_overview', description: 'Google Business Profile summary — listing status, hours, and categories.' },
  { key: 'arion_business_reviews', displayName: 'Business Reviews', section: 'ARION', defaultStatus: 'coming_soon', route: '/app/services/arion_business_reviews', description: 'Customer reviews across Google, Bing, and Apple with sentiment tracking.' },
  { key: 'arion_business_insights', displayName: 'Business Insights', section: 'ARION', defaultStatus: 'coming_soon', route: '/app/services/arion_business_insights', description: 'GBP performance metrics — searches, views, direction requests, and calls.' },
  { key: 'arion_business_posts', displayName: 'Business Posts', section: 'ARION', defaultStatus: 'coming_soon', route: '/app/services/arion_business_posts', description: 'Google Business Profile posts — updates, offers, and event announcements.' },
  { key: 'arion_business_services', displayName: 'Business Services', section: 'ARION', defaultStatus: 'coming_soon', route: '/app/services/arion_business_services', description: 'GBP services and product catalog management.' },
  { key: 'arion_business_bing_overview', displayName: 'Bing Places', section: 'ARION', defaultStatus: 'coming_soon', route: '/app/services/arion_business_bing_overview', description: 'Bing Places for Business listing status and profile management.' },
  { key: 'arion_business_apple_overview', displayName: 'Apple Business Connect', section: 'ARION', defaultStatus: 'coming_soon', route: '/app/services/arion_business_apple_overview', description: 'Apple Business Connect listing and Apple Maps presence management.' },
  { key: 'arion_brand', displayName: 'Your Brand', section: 'ARION', defaultStatus: 'coming_soon', route: '/app/services/arion_brand', description: 'Brand management tools — assets, style guides, and digital brand presence.' },
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
