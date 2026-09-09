import { LEADGEN_ENABLED, LEADGEN_LOCKED_KEYS } from './featureFlags';

export type ServiceStatus = 'enabled' | 'not_subscribed' | 'coming_soon';

export interface PortalService {
  key: string;
  displayName: string;
  section: 'Shared' | 'ARION' | 'STELLA' | 'OLIVER' | 'LUMEN' | 'FORGE' | 'ARGUS' | 'CONSULTING' | 'MY_BRAND';
  defaultStatus: ServiceStatus;
  route: string;
  description: string;
  /**
   * Optional tier gate for in-page rendering. The portal currently uses
   * defaultStatus + enabledServices for hard access control; this field is
   * informational metadata for landing pages and upsell prompts so each
   * surface can show "Standard+" / "Pro+" badges without duplicating the
   * rule.
   */
  tierGate?: 'Lite' | 'Standard' | 'Pro' | 'Business';
}

// Platform descriptors locked by Brandon 2026-07-22 (cosmetic pass) — one or
// two words per platform, used verbatim in IconRail taglines + SubNav headers.
export const LAYER_LABELS: Record<PortalService['section'], string> = {
  Shared: 'Overview',
  ARION: 'ARION — Digital Presence',
  STELLA: 'STELLA — Expenses & Data',
  OLIVER: 'OLIVER — Operations',
  LUMEN: 'SPARK — CRM',
  MY_BRAND: 'My Brand — Creative Studio',
  FORGE: 'FORGE — Integrations & Software',
  ARGUS: 'ARGUS — AI & Agents',
  CONSULTING: 'CONSULTING — Projects'
};

const RAW_SERVICE_CATALOG: PortalService[] = [
  {
    key: 'portal_overview',
    displayName: 'Overview',
    section: 'Shared',
    defaultStatus: 'enabled',
    route: '/app/overview',
    description: 'High-level account overview and shortcuts into each Intelligence Layer.'
  },
  // ARION — Full Web & Digital Presence suite (46 pages)
  { key: 'arion_onboarding', displayName: 'Get Started', section: 'ARION', defaultStatus: 'not_subscribed', route: '/app/services/arion_onboarding', description: 'Guided onboarding — site, GA4, Search Console, Business Profile, Bing, SEO add-on.' },
  // Agents (2026-09-05) — one Agents page per product, in that product's
  // Settings group. ARION's Content & Social Agent is not on this line yet,
  // so the page shows it as coming and offers no button.
  { key: 'arion_agents', displayName: 'Agents', section: 'ARION', defaultStatus: 'enabled', route: '/app/services/arion_agents', description: "What your ARION agents did, and anything waiting on you." },
  { key: 'arion_dashboard', displayName: 'Dashboard', section: 'ARION', defaultStatus: 'coming_soon', route: '/app/services/arion_dashboard', description: 'High-level ARION dashboard with website, hosting, SEO, and business profile status.' },
  { key: 'arion_website_overview', displayName: 'Website Overview', section: 'ARION', defaultStatus: 'coming_soon', route: '/app/services/arion_website_overview', description: 'Website health summary — uptime, WordPress version, plugin status, and quick actions.' },
  { key: 'arion_website_content', displayName: 'Website Content', section: 'ARION', defaultStatus: 'coming_soon', route: '/app/services/arion_website_content', description: 'Page and post content inventory with last-modified dates and publish status.' },
  // Site builder Phase 1A (2026-09-05) — edit the words and pictures on a page
  // from the Portal instead of opening WordPress. Every ARION tier (W-4).
  { key: 'arion_website_pages', displayName: 'Pages', section: 'ARION', defaultStatus: 'coming_soon', route: '/app/services/arion_website_pages', description: 'Every page on your website. Open one, change the wording or a picture, preview it, and publish — without opening WordPress.' },
  // F-AI-WB (re-added 2026-06-28) — catalog entry was lost during a scope flip;
  // SubNav + ServiceRouter case were re-added but this entry was missed,
  // causing the URL to render "Service not found". Scope: overnight-report/
  // 38_AI_WEBSITE_BUILDER_v2_SCOPE.md + FEATURE_AI_BUILDER.md.
  { key: 'arion_website_ai_builder', displayName: 'AI Builder', section: 'ARION', defaultStatus: 'coming_soon', route: '/app/services/arion_website_ai_builder', description: 'AI Website Builder — spend ARGUS Data Credits to generate pages, rewrite sections, generate media, or rebuild whole sites.' },
  // Site builder pack 2 (2026-09-09) — the two jobs that are the same on every
  // page and could only be done by signing into WordPress. Every ARION tier.
  { key: 'arion_website_menus', displayName: 'Menus', section: 'ARION', defaultStatus: 'coming_soon', route: '/app/services/arion_website_menus', description: 'What people click to get around your website. Add a page you just built, reorder it, and choose where it shows.' },
  { key: 'arion_website_design', displayName: 'Brand & layout', section: 'ARION', defaultStatus: 'coming_soon', route: '/app/services/arion_website_design', description: 'Your colours and fonts, and what sits at the top and bottom of every page.' },
  { key: 'arion_website_content_seo_overview', displayName: 'Content SEO', section: 'ARION', defaultStatus: 'coming_soon', route: '/app/services/arion_website_content_seo_overview', description: 'Rank Math SEO coverage — per-page and per-post scores, focus keywords, schema, and top optimization opportunities.' },
  { key: 'arion_website_security_overview', displayName: 'Security Overview', section: 'ARION', defaultStatus: 'coming_soon', route: '/app/services/arion_website_security_overview', description: 'Shield Security scan results, threat level, and overall security posture.' },
  { key: 'arion_website_security_vulnerabilities', displayName: 'Security Vulnerabilities', section: 'ARION', defaultStatus: 'coming_soon', route: '/app/services/arion_website_security_vulnerabilities', description: 'Known plugin and theme vulnerabilities with severity and patch status.' },
  { key: 'arion_website_security_firewall', displayName: 'Security Firewall', section: 'ARION', defaultStatus: 'coming_soon', route: '/app/services/arion_website_security_firewall', description: 'Shield Security firewall rules, blocked IPs, and brute-force protection status.' },
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
  { key: 'arion_analytics_ia_cross_platform', displayName: 'IA Cross-Platform Insights', section: 'ARION', defaultStatus: 'coming_soon', route: '/app/services/arion_analytics_ia_cross_platform', description: 'Cross-platform analytics funnel combining web, search, and business data.' },
  // Back-compat alias — old route /arion_analytics_ia_cross_channel still
  // resolves to the same page so existing bookmarks/deep links keep working.
  { key: 'arion_analytics_ia_cross_channel', displayName: 'IA Cross-Platform Insights', section: 'ARION', defaultStatus: 'coming_soon', route: '/app/services/arion_analytics_ia_cross_channel', description: 'Legacy alias — see arion_analytics_ia_cross_platform.' },
  { key: 'arion_analytics_ia_reports', displayName: 'IA Insight Reports', section: 'ARION', defaultStatus: 'coming_soon', route: '/app/services/arion_analytics_ia_reports', description: 'ARGUS-powered automated insight reports with AI-generated recommendations.' },
  // v5.x — new IA Insights architecture (top-level)
  // v7.0 — Health pages own the 4-gauge + 2 bar-chart composite; Trends/Intelligence host the report engines.
  { key: 'arion_ia_insights_health', displayName: 'IA Insights — Health', section: 'ARION', defaultStatus: 'enabled', route: '/app/services/arion_ia_insights_health', description: 'ARION Health composite — Overall Business Score, ARION Score, Trend Score, Intelligence Score, plus the trend/intelligence breakdown bars.' },
  { key: 'arion_ia_insights_trends', displayName: 'IA Insights — Trends', section: 'ARION', defaultStatus: 'enabled', route: '/app/services/arion_ia_insights_trends', description: '8 ARION Trend reports with dedicated analytical engines per business question — Visibility, Audience, Conversion, Search, Content, Local, Technical, Business Presence Score.' },
  { key: 'arion_ia_insights_reports', displayName: 'IA Insights — Reports', section: 'ARION', defaultStatus: 'enabled', route: '/app/services/arion_ia_insights_reports', description: 'The catalog of every report produced for this site, grouped by the part of the digital presence it covers. Third door into the same report definition the operational pages and the Trends drill-down render.' },
  { key: 'arion_ia_insights_intelligence', displayName: 'IA Insights — Intelligence', section: 'ARION', defaultStatus: 'coming_soon', route: '/app/services/arion_ia_insights_intelligence', description: 'Modelled cross-product Intelligence reports — Acquisition Efficiency, Lead Source Quality, Content ROI, Reputation→Revenue, Visibility Trajectory, Competitive Gap.' },
  { key: 'arion_service_area', displayName: 'Service Area', section: 'ARION', defaultStatus: 'enabled', route: '/app/services/arion_service_area', description: 'Service area config (city, state, regions, ZIPs). Drives the geographic relevance check in the Visibility & Reach trend engine.' },
  { key: 'spark_ia_insights_health', displayName: 'IA Insights — Health', section: 'LUMEN', defaultStatus: 'enabled', route: '/app/services/spark_ia_insights_health', description: 'SPARK Health composite — Overall Business Score, SPARK Score, Trend Score, Intelligence Score, plus the trend/intelligence breakdown bars.' },
  { key: 'spark_ia_insights_trends', displayName: 'IA Insights — Trends', section: 'LUMEN', defaultStatus: 'enabled', route: '/app/services/spark_ia_insights_trends', description: 'SPARK Trend reports — Contact Health, Lead Pipeline, Campaign Performance, Marketing Attribution, Customer Segmentation, Automation Effectiveness, Retention Risk, Revenue Attribution.' },
  { key: 'spark_ia_insights_intelligence', displayName: 'IA Insights — Intelligence', section: 'LUMEN', defaultStatus: 'coming_soon', route: '/app/services/spark_ia_insights_intelligence', description: 'Modelled SPARK Intelligence reports — Churn Prediction, LTV Cohorts, Campaign ROI, Optimal Send Time, Segment Forecast.' },
  { key: 'spark_what_worked', displayName: 'What Worked', section: 'LUMEN', defaultStatus: 'enabled', route: '/app/services/spark_what_worked', description: 'The monthly report: which source produced paid jobs, what each lead cost, which campaign got a response — every sentence with the figures behind it, plus 2-4 step next moves that only ever deep-link.' },
  { key: 'spark_service_category', displayName: 'Service Category', section: 'LUMEN', defaultStatus: 'enabled', route: '/app/services/spark_service_category', description: 'Industry classification (home services, legal, health, b2b) that drives benchmark selection in SPARK + OLIVER IA Insights.' },
  { key: 'oliver_ia_insights_health', displayName: 'IA Insights — Health', section: 'OLIVER', defaultStatus: 'enabled', route: '/app/services/oliver_ia_insights_health', description: 'OLIVER Health composite — Overall Business Score, OLIVER Score, Trend Score, Intelligence Score, plus the trend/intelligence breakdown bars.' },
  { key: 'oliver_ia_insights_trends', displayName: 'IA Insights — Trends', section: 'OLIVER', defaultStatus: 'enabled', route: '/app/services/oliver_ia_insights_trends', description: 'OLIVER Trend reports — Operations Health, Revenue Performance, Cash Flow, Quote Win Rate, Customer Retention, Crew Capacity, Service Line, Seasonal Planning.' },
  { key: 'oliver_ia_insights_intelligence', displayName: 'IA Insights — Intelligence', section: 'OLIVER', defaultStatus: 'coming_soon', route: '/app/services/oliver_ia_insights_intelligence', description: 'Modelled OLIVER Intelligence reports — Demand Forecast, Cash Pressure, Churn Prediction, Pipeline Revenue, Crew Utilisation, Margin Analysis.' },
  { key: 'argus_ia_insights', displayName: 'ARGUS IA Insights', section: 'ARGUS', defaultStatus: 'enabled', route: '/app/services/argus_ia_insights', description: 'Cross-platform intelligence. Business Pulse composite gauge plus 6 cross-platform reports — Web-to-Revenue Funnel, Acquisition Quality, Marketing→Ops Loop, CLV, Retention Recovery, Growth Composite.' },
  // v9.0 — ARGUS as full product (Health/Trends/Intelligence/Cross-Platform) per Platform Intelligence & ARGUS spec.
  { key: 'argus_health', displayName: 'ARGUS — Health', section: 'ARGUS', defaultStatus: 'enabled', route: '/app/services/argus_health', description: 'ARGUS Health composite — Business Pulse, ARGUS Platform Score, Trend Score, Intelligence Score, plus active-products indicator and 2 bar charts.' },
  { key: 'argus_trends', displayName: 'ARGUS — Trends', section: 'ARGUS', defaultStatus: 'enabled', route: '/app/services/argus_trends', description: 'ARGUS Trend reports — Automation Health, Event Flow, Workflow Performance, Cross-Product Trigger Chains.' },
  { key: 'argus_intelligence', displayName: 'ARGUS — Intelligence', section: 'ARGUS', defaultStatus: 'coming_soon', route: '/app/services/argus_intelligence', description: '5 ARGUS Intelligence reports — Platform Connectivity Health, Automation ROI, Event Volume Anomaly Detection, Cross-Platform Data Quality, Workflow Optimisation.' },
  // 2026-06-21: page renamed to "IA Insights — Intelligence" to align with
  // the per-platform Insights pattern.
  // 2026-06-22: canonical service key renamed to `argus_cross_platform`.
  // Legacy `argus_cross_channel` retained as a back-compat alias below.
  { key: 'argus_cross_platform', displayName: 'IA Insights — Intelligence', section: 'ARGUS', defaultStatus: 'enabled', route: '/app/services/argus_cross_platform', description: 'Six ARGUS Intelligence reports — Acquisition Performance, Marketing Effectiveness, Reputation Impact, Channel Performance, Customer Lifetime Value, Business Health Trajectory.' },
  { key: 'argus_workflows', displayName: 'ARGUS — Workflow & Automations', section: 'ARGUS', defaultStatus: 'enabled', route: '/app/services/argus_workflows', description: 'Observe the onboarding workflows (node timelines), the business automation rules, and live onboarding runs across your platforms.' },
  { key: 'argus_cross_channel', displayName: 'IA Insights — Intelligence', section: 'ARGUS', defaultStatus: 'enabled', route: '/app/services/argus_cross_channel', description: 'Legacy alias — see argus_cross_platform.' },
  { key: 'arion_seo_overview', displayName: 'SEO Overview', section: 'ARION', defaultStatus: 'coming_soon', route: '/app/services/arion_seo_overview', description: 'SE Ranking SEO project summary — visibility score, tracked keywords, and trends.' },
  { key: 'arion_seo_keywords', displayName: 'SEO Keywords', section: 'ARION', defaultStatus: 'coming_soon', route: '/app/services/arion_seo_keywords', description: 'Keyword research wizard plus tracked-keyword management — add, remove, run suggestions/related/longtail/questions.' },
  { key: 'arion_seo_rankings', displayName: 'SEO Rankings', section: 'ARION', defaultStatus: 'coming_soon', route: '/app/services/arion_seo_rankings', description: 'Keyword ranking positions, movement history, and SERP feature tracking.' },
  { key: 'arion_seo_site_audit', displayName: 'SEO Site Audit', section: 'ARION', defaultStatus: 'coming_soon', route: '/app/services/arion_seo_site_audit', description: 'Technical SEO audit results — crawl errors, broken links, and issue severity.' },
  { key: 'arion_seo_competitors', displayName: 'SEO Competitors', section: 'ARION', defaultStatus: 'coming_soon', route: '/app/services/arion_seo_competitors', description: 'Competitor visibility comparison, shared keywords, and gap analysis.' },
  { key: 'arion_seo_ai_search', displayName: 'AI Search Results', section: 'ARION', defaultStatus: 'coming_soon', route: '/app/services/arion_seo_ai_search', description: 'Track brand presence across Google AI Overviews, Google AI Mode, ChatGPT, and Gemini — mentions, competitors, and cited sources. SEO add-on (Growth+).' },
  { key: 'arion_seo_ai_prompts', displayName: 'AI Search Prompts', section: 'ARION', defaultStatus: 'coming_soon', route: '/app/services/arion_seo_ai_prompts', description: 'SEO add-on, Growth/Authority only — manage the AI search prompts SE Ranking tracks per engine for brand mention analytics.' },
  { key: 'arion_seo_market_monitor', displayName: 'Market Monitor', section: 'ARION', defaultStatus: 'coming_soon', route: '/app/services/arion_seo_market_monitor', description: 'SEO add-on, Authority tier only — new/lost backlinks, competitor page changes, and large ranking moves.' },
  { key: 'arion_seo_opportunities', displayName: 'SEO Opportunities', section: 'ARION', defaultStatus: 'coming_soon', route: '/app/services/arion_seo_opportunities', description: 'Keyword and content opportunities identified by SE Ranking analysis.' },
  { key: 'arion_seo_reports', displayName: 'SEO Reports', section: 'ARION', defaultStatus: 'coming_soon', route: '/app/services/arion_seo_reports', description: 'Scheduled SEO reports with ranking snapshots and audit summaries.' },
  { key: 'arion_search_performance', displayName: 'Search Performance', section: 'ARION', defaultStatus: 'coming_soon', route: '/app/services/arion_search_performance', description: 'Google Search Console performance — clicks, impressions, CTR, and position.' },
  { key: 'arion_search_indexing', displayName: 'Search Indexing', section: 'ARION', defaultStatus: 'coming_soon', route: '/app/services/arion_search_indexing', description: 'Index coverage status, crawl errors, and URL inspection results.' },
  { key: 'arion_search_sitemaps', displayName: 'Search Sitemaps', section: 'ARION', defaultStatus: 'coming_soon', route: '/app/services/arion_search_sitemaps', description: 'Sitemap submission status, indexed URL counts, and sitemap errors.' },
  { key: 'arion_search_core_web_vitals', displayName: 'Core Web Vitals', section: 'ARION', defaultStatus: 'coming_soon', route: '/app/services/arion_search_core_web_vitals', description: 'LCP, FID, CLS, and INP scores from CrUX with mobile and desktop breakdowns.' },
  { key: 'arion_search_bing_copilot', displayName: 'Bing Copilot', section: 'ARION', defaultStatus: 'coming_soon', route: '/app/services/arion_search_bing_copilot', description: 'Bing Copilot AI appearance tracking and citation monitoring.' },
  { key: 'arion_search_bing_indexnow', displayName: 'Bing IndexNow', section: 'ARION', defaultStatus: 'coming_soon', route: '/app/services/arion_search_bing_indexnow', description: 'IndexNow submission history, accepted URLs, and instant indexing status.' },
  { key: 'arion_business_overview', displayName: 'Business Overview', section: 'ARION', defaultStatus: 'enabled', route: '/app/services/arion_business_overview', description: 'Google Business Profile summary — listing status, hours, and categories.' },
  { key: 'arion_business_locations', displayName: 'Business Locations', section: 'ARION', defaultStatus: 'enabled', route: '/app/services/arion_business_locations', description: 'All Google Business Profile locations imported for this tenant — pick which is the primary and re-sync from Google.' },
  { key: 'arion_business_reviews', displayName: 'Business Reviews', section: 'ARION', defaultStatus: 'enabled', route: '/app/services/arion_business_reviews', description: 'Customer reviews across Google, Bing, and Apple with sentiment tracking.' },
  { key: 'arion_business_insights', displayName: 'Business Performance', section: 'ARION', defaultStatus: 'enabled', route: '/app/services/arion_business_insights', description: 'GBP performance metrics — searches, views, direction requests, and calls.' },
  { key: 'arion_business_posts', displayName: 'Business Posts', section: 'ARION', defaultStatus: 'enabled', route: '/app/services/arion_business_posts', description: 'Google Business Profile posts — updates, offers, and event announcements.' },
  { key: 'arion_business_services', displayName: 'Business Services', section: 'ARION', defaultStatus: 'enabled', route: '/app/services/arion_business_services', description: 'GBP services and product catalog management.' },
  { key: 'arion_business_bing_overview', displayName: 'Bing Places', section: 'ARION', defaultStatus: 'enabled', route: '/app/services/arion_business_bing_overview', description: 'Bing Places for Business listing status and profile management.' },
  { key: 'arion_business_apple_overview', displayName: 'Apple Business Connect', section: 'ARION', defaultStatus: 'enabled', route: '/app/services/arion_business_apple_overview', description: 'Apple Business Connect listing and Apple Maps presence management.' },
  { key: 'arion_brand', displayName: 'Your Brand', section: 'ARION', defaultStatus: 'coming_soon', route: '/app/services/arion_brand', description: 'Brand management tools — assets, style guides, and digital brand presence.' },
  // (My Brand entries live under the MY_BRAND section block further down —
  // sibling Wave 2 agent owns the full taxonomy. Don't add LUMEN-scoped
  // duplicates here.)
  { key: 'arion_usage', displayName: 'Plan & Pricing', section: 'ARION', defaultStatus: 'not_subscribed', route: '/app/services/arion_usage', description: 'ARION hosting tier comparison + SEO add-on picker with live total.' },
  { key: 'arion_plugin_provisioning', displayName: 'Plugin Provisioning', section: 'ARION', defaultStatus: 'not_subscribed', route: '/app/services/arion_plugin_provisioning', description: 'Mint plugin provisioning codes — WP-CLI zero-touch, magic link, or manual paste install paths.' },
  // ── STELLA — Ledger + Unit Economics 4-nav shell (August build) ────────────
  // Supersedes the parked 0.1.0 MLP (stella_coming Overview + stella_expenses_coming
  // Expenses), which read oliver-api /expenses + /stella/pnl. This is the full
  // product shape: Ledger + Unit Economics LIVE, Database Manager + Custom
  // Reporting LOCKED (coming-soon). See STELLA_Ledger_And_UnitEconomics_Scope_v1_0.
  //
  // LEDGER (Layer 1 — LIVE)
  // 2026-07-30 consolidation — founder capped every sub-nav at 8 items.
  // Ledger collapsed 18 → 6: Income + Recurring became Transactions tabs,
  // Receipts became a modal hint on Transactions (OCR ships in the Ingestion
  // phase), Mileage + Materials merged into one two-tab page, the seven
  // reports collapsed into ONE Reports page (P&L live, rest land P2), and
  // Bank Connections + Period Close moved to the SETTINGS hub — they are
  // settings, not daily-work nav (see stella_settings_* below).
  // Overview is FIRST — it is the Ledger landing page (first-item-wins makes
  // it STELLA's default landing; see AppShell defaultRouteFor).
  { key: 'stella_ledger_overview', displayName: 'Overview', section: 'STELLA', defaultStatus: 'enabled', route: '/app/services/stella_ledger_overview', description: 'Your bookkeeping at a glance — month money in/out/net, cash-flow trend, bank balances, what needs review, and what you\'re owed.' },
  { key: 'stella_ledger_inbox', displayName: 'Inbox', section: 'STELLA', defaultStatus: 'enabled', route: '/app/services/stella_ledger_inbox', description: 'Needs-review queue — uncategorized, flagged and duplicate transactions with one-tap accept/reject.' },
  { key: 'stella_ledger_transactions', displayName: 'Transactions', section: 'STELLA', defaultStatus: 'enabled', route: '/app/services/stella_ledger_transactions', description: 'The canonical ledger — every money-in and money-out line with income, expense, and recurring views, manual record entry, and personal-card reimbursement tracking (what the business owes you).' },
  { key: 'stella_ledger_vendors', displayName: 'Vendors & Customers', section: 'STELLA', defaultStatus: 'enabled', route: '/app/services/stella_ledger_vendors', description: 'Counterparties — vendors, subcontractors, customers, and employees with W-9 / 1099 tracking.' },
  { key: 'stella_ledger_coa', displayName: 'Chart of Accounts', section: 'STELLA', defaultStatus: 'enabled', route: '/app/services/stella_ledger_coa', description: 'Your seeded, customizable service-business chart of accounts.' },
  { key: 'stella_ledger_mileage_materials', displayName: 'Mileage & Materials', section: 'STELLA', defaultStatus: 'enabled', route: '/app/services/stella_ledger_mileage_materials', description: 'Job-cost capture — business miles at the IRS deduction rate, and job materials that feed per-job margin.' },
  { key: 'stella_ledger_receipts', displayName: 'Receipts', section: 'STELLA', defaultStatus: 'enabled', route: '/app/services/stella_ledger_receipts', description: 'Snap or upload a receipt, type the vendor, date, amount and tax, and book it — the file stays attached to the transaction.' },
  { key: 'stella_ledger_accounting', displayName: 'Accounting', section: 'STELLA', defaultStatus: 'enabled', route: '/app/services/stella_ledger_accounting', description: 'Journal entries, bank reconciliation with CSV statement import, and a record of who changed what.' },
  { key: 'stella_ledger_reports', displayName: 'Reports', section: 'STELLA', defaultStatus: 'enabled', route: '/app/services/stella_ledger_reports', description: 'Financial statements in one place — P&L, Balance Sheet, Cash Flow, AR/AP Aging, Sales Tax, the 1099 worksheet, and the accountant hand-off pack.' },
  // UNIT ECONOMICS (Layer 2 — LIVE). Allocation Rules + Runs merged into one
  // two-tab Allocations page in the same consolidation.
  { key: 'stella_ue_margins', displayName: 'Margins', section: 'STELLA', defaultStatus: 'enabled', route: '/app/services/stella_ue_margins', description: 'Profitability per job, per customer, per employee, and per service line.' },
  { key: 'stella_ue_allocations', displayName: 'Allocations', section: 'STELLA', defaultStatus: 'enabled', route: '/app/services/stella_ue_allocations', description: 'Allocation rules (seven methods) and batch run history, together on one page.' },
  { key: 'stella_ue_reconciliation', displayName: 'Reconciliation', section: 'STELLA', defaultStatus: 'enabled', route: '/app/services/stella_ue_reconciliation', description: 'Reconcile allocated costs against OLIVER, SPARK, and ARION source data.' },
  // STELLA IA Insights (2026-07-30) — reports + insights follow the platform
  // IA Insights pattern. Trends/Intelligence build AFTER the Aug-6 insights
  // redesign lands, following THAT structure (founder direction).
  { key: 'stella_ia_insights_trends', displayName: 'Trends', section: 'STELLA', defaultStatus: 'coming_soon', route: '/app/services/stella_ia_insights_trends', description: 'Income vs expenses, spend trajectory, and margin trends over time. Follows the platform insights redesign.', tierGate: 'Standard' },
  { key: 'stella_ia_insights_intelligence', displayName: 'Intelligence', section: 'STELLA', defaultStatus: 'coming_soon', route: '/app/services/stella_ia_insights_intelligence', description: 'IL-generated financial insights — anomalies, cost variance, and cash-flow signals. Follows the platform insights redesign.', tierGate: 'Standard' },
  // DATABASE MANAGER (Layer 3a — LOCKED / Coming Soon)
  { key: 'stella_db_registry', displayName: 'View Registry', section: 'STELLA', defaultStatus: 'enabled', route: '/app/services/stella_db_registry', description: 'Data catalog of every reportable view, filterable by product and access role.', tierGate: 'Standard' },
  { key: 'stella_db_entry', displayName: 'Manual Entry', section: 'STELLA', defaultStatus: 'enabled', route: '/app/services/stella_db_entry', description: 'Structured manual data entry from view metadata.', tierGate: 'Standard' },
  { key: 'stella_db_upload', displayName: 'CSV / XLSX Upload', section: 'STELLA', defaultStatus: 'enabled', route: '/app/services/stella_db_upload', description: 'Bulk import via CSV/XLSX with validation, commit, and rollback.', tierGate: 'Standard' },
  { key: 'stella_db_tags', displayName: 'Tags', section: 'STELLA', defaultStatus: 'enabled', route: '/app/services/stella_db_tags', description: 'Tag CRUD and assignment across your data.', tierGate: 'Standard' },
  { key: 'stella_db_custom_fields', displayName: 'Custom Fields', section: 'STELLA', defaultStatus: 'enabled', route: '/app/services/stella_db_custom_fields', description: 'Per-entity custom-field definitions.', tierGate: 'Standard' },
  { key: 'stella_db_import_history', displayName: 'Import History', section: 'STELLA', defaultStatus: 'enabled', route: '/app/services/stella_db_import_history', description: 'Import batch history with status, row counts, and rollback.', tierGate: 'Standard' },
  { key: 'stella_db_documents', displayName: 'Documents', section: 'STELLA', defaultStatus: 'enabled', route: '/app/services/stella_db_documents', description: 'Document library — folders, upload, tag, and link-to-entity.', tierGate: 'Standard' },
  { key: 'stella_db_compliance', displayName: 'Compliance Reminders', section: 'STELLA', defaultStatus: 'enabled', route: '/app/services/stella_db_compliance', description: 'Compliance and renewal reminders on a calendar + list.', tierGate: 'Standard' },
  { key: 'stella_db_warnings', displayName: 'Data Engineer Warnings', section: 'STELLA', defaultStatus: 'enabled', route: '/app/services/stella_db_warnings', description: 'Review queue for trust-flag warnings raised during ingestion.', tierGate: 'Standard' },
  // CUSTOM REPORTING (Layer 3b — LOCKED / Coming Soon)
  { key: 'stella_report_library', displayName: 'Report Library', section: 'STELLA', defaultStatus: 'enabled', route: '/app/services/stella_report_library', description: 'Saved reports you can re-run and share.', tierGate: 'Standard' },
  { key: 'stella_report_builder', displayName: 'Report Builder', section: 'STELLA', defaultStatus: 'enabled', route: '/app/services/stella_report_builder', description: 'Field-picker report builder on top of the view registry.', tierGate: 'Standard' },
  { key: 'stella_report_dashboards', displayName: 'Dashboards', section: 'STELLA', defaultStatus: 'enabled', route: '/app/services/stella_report_dashboards', description: 'Composable dashboard grid with view and edit modes.', tierGate: 'Standard' },
  { key: 'stella_report_scheduled', displayName: 'Scheduled Reports', section: 'STELLA', defaultStatus: 'enabled', route: '/app/services/stella_report_scheduled', description: 'Schedule reports to run and deliver on a cadence.', tierGate: 'Standard' },
  { key: 'stella_report_sql', displayName: 'SQL Editor', section: 'STELLA', defaultStatus: 'enabled', route: '/app/services/stella_report_sql', description: 'Sandboxed SQL editor with a daily counter and syntax help.', tierGate: 'Pro' },
  { key: 'stella_report_exports', displayName: 'Exports', section: 'STELLA', defaultStatus: 'enabled', route: '/app/services/stella_report_exports', description: 'Export history and downloads.', tierGate: 'Standard' },
  // STELLA settings (Settings hub only — NEVER add these keys to STELLA_NAV:
  // SETTINGS_KEYS membership flips deriveProduct into Settings mode, so a key
  // listed in both navs would hijack the STELLA SubNav. Replaces the old
  // stella_settings_coming placeholder.)
  { key: 'stella_settings_bank', displayName: 'Bank and card accounts', section: 'STELLA', defaultStatus: 'enabled', route: '/app/services/stella_settings_bank', description: 'Link the accounts your business runs on — bank and card feeds, plus the personal-card business-use designation.' },
  { key: 'stella_settings_period_close', displayName: 'Period Close', section: 'STELLA', defaultStatus: 'enabled', route: '/app/services/stella_settings_period_close', description: 'Close a month, lock prior periods, and post adjusting entries.' },
  // Back-compat aliases for the retired 0.1.0 MLP deep links. Not shown in any
  // nav (coming_soon keeps them out of GlobalSearch); ServiceRouter redirects
  // them to the live Ledger equivalents so old bookmarks / email CTAs don't 404.
  { key: 'stella_coming', displayName: 'STELLA', section: 'STELLA', defaultStatus: 'coming_soon', route: '/app/services/stella_coming', description: 'Legacy alias — redirects to STELLA Overview.' },
  { key: 'stella_expenses_coming', displayName: 'STELLA', section: 'STELLA', defaultStatus: 'coming_soon', route: '/app/services/stella_expenses_coming', description: 'Legacy alias — redirects to STELLA Overview.' },
  // OLIVER — Full FSM suite (16 pages)
  { key: 'oliver_dashboard', displayName: 'Dashboard', section: 'OLIVER', defaultStatus: 'not_subscribed', route: '/app/services/oliver_dashboard', description: 'KPI overview: active jobs, revenue, open invoices, and recent activity.' },
  { key: 'oliver_job_board', displayName: 'Job Board', section: 'OLIVER', defaultStatus: 'not_subscribed', route: '/app/services/oliver_job_board', description: 'List and Kanban views of all jobs with status filtering.' },
  { key: 'oliver_jobs_archive', displayName: 'Jobs Archive', section: 'OLIVER', defaultStatus: 'not_subscribed', route: '/app/services/oliver_jobs_archive', description: 'Closed jobs (paid + cancelled) with date-range filter. Surfaces older records than the rolling 7-day window on the Job Board.' },
  { key: 'oliver_schedule', displayName: 'Schedule', section: 'OLIVER', defaultStatus: 'not_subscribed', route: '/app/services/oliver_schedule', description: 'Calendar view of scheduled jobs and assignments.' },
  { key: 'oliver_dispatch', displayName: 'Dispatch', section: 'OLIVER', defaultStatus: 'not_subscribed', route: '/app/services/oliver_dispatch', description: 'Worker assignment, offer/accept dispatch flow.' },
  { key: 'oliver_workers', displayName: 'Team', section: 'OLIVER', defaultStatus: 'not_subscribed', route: '/app/services/oliver_workers', description: 'Manage team members and contractors.' },
  { key: 'oliver_crew_performance', displayName: 'Team Performance', section: 'OLIVER', defaultStatus: 'not_subscribed', route: '/app/services/oliver_crew_performance', description: 'Per-member job completion stats and assignment counts.' },
  { key: 'oliver_contacts', displayName: 'Contacts', section: 'OLIVER', defaultStatus: 'not_subscribed', route: '/app/services/oliver_contacts', description: 'Customer contact list from SPARK CRM cache.' },
  { key: 'oliver_service_requests', displayName: 'Service Requests', section: 'OLIVER', defaultStatus: 'not_subscribed', route: '/app/services/oliver_service_requests', description: 'Inbound job inquiries from the customer portal.' },
  { key: 'oliver_booking', displayName: 'Booking', section: 'OLIVER', defaultStatus: 'not_subscribed', route: '/app/services/oliver_booking', description: 'Public scheduling page — configure your subdomain, availability, and what customers can book.' },
  { key: 'oliver_quotes', displayName: 'Quotes & Proposals', section: 'OLIVER', defaultStatus: 'not_subscribed', route: '/app/services/oliver_quotes', description: 'Create, send, and track quotes & proposals (one place). Convert accepted ones to invoices.' },
  { key: 'oliver_invoices', displayName: 'Invoices', section: 'OLIVER', defaultStatus: 'not_subscribed', route: '/app/services/oliver_invoices', description: 'Invoice management with Stripe payment links.' },
  { key: 'oliver_payments', displayName: 'Payments', section: 'OLIVER', defaultStatus: 'not_subscribed', route: '/app/services/oliver_payments', description: 'Payment history and received payment overview.' },
  { key: 'oliver_recurring', displayName: 'Recurring & Subscriptions', section: 'OLIVER', defaultStatus: 'not_subscribed', route: '/app/services/oliver_recurring', description: 'Stripe subscriptions and recurring job templates.' },
  { key: 'oliver_messages', displayName: 'Messages', section: 'OLIVER', defaultStatus: 'not_subscribed', route: '/app/services/oliver_messages', description: '2-way messaging with customers and team.' },
  { key: 'oliver_notifications', displayName: 'Notifications', section: 'OLIVER', defaultStatus: 'not_subscribed', route: '/app/services/oliver_notifications', description: 'ACS email notification history.' },
  { key: 'oliver_reports', displayName: 'Reports', section: 'OLIVER', defaultStatus: 'not_subscribed', route: '/app/services/oliver_reports', description: 'Revenue, job volume, and completion analytics with charts.' },
  { key: 'oliver_activity_log', displayName: 'Activity Log', section: 'OLIVER', defaultStatus: 'not_subscribed', route: '/app/services/oliver_activity_log', description: 'Full audit trail of all job status transitions.' },
  { key: 'oliver_catalog', displayName: 'Products & Services', section: 'OLIVER', defaultStatus: 'not_subscribed', route: '/app/services/oliver_catalog', description: 'Define your products and services and pricing. Each offering syncs to Stripe.' },
  { key: 'oliver_categories', displayName: 'Categories', section: 'OLIVER', defaultStatus: 'not_subscribed', route: '/app/services/oliver_categories', description: 'Create and manage product/service categories.' },
  // F-74 Service Categories (worker skill taxonomy) — drives the
  // auto_assign_worker 'skill_match' strategy + customer worker preferences.
  { key: 'oliver_service_categories', displayName: 'Service Categories', section: 'OLIVER', defaultStatus: 'not_subscribed', route: '/app/services/oliver_service_categories', description: 'Define service categories (Plumbing, Electrical, Cleaning…) and tag workers with the categories they cover. Used by auto-assignment + customer worker preferences.' },
  { key: 'oliver_billing_overview', displayName: 'Billing Overview', section: 'OLIVER', defaultStatus: 'not_subscribed', route: '/app/services/oliver_billing_overview', description: 'Stripe-style billing dashboard: gross volume, outstanding, MRR, and recent payments.' },
  { key: 'oliver_usage', displayName: 'Plan & Pricing', section: 'OLIVER', defaultStatus: 'not_subscribed', route: '/app/services/oliver_usage', description: 'OLIVER tier comparison + live plan total. See your current seats/jobs usage and switch tiers.' },
  { key: 'oliver_fees', displayName: 'Fees', section: 'OLIVER', defaultStatus: 'not_subscribed', route: '/app/services/oliver_fees', description: 'Full processing-fee breakdown by tier — Stripe portion, platform portion, and per-transaction caps.' },
  { key: 'oliver_client_experience', displayName: 'Client Experience', section: 'OLIVER', defaultStatus: 'not_subscribed', route: '/app/services/oliver_client_experience', description: 'Client Experience add-on — Essentials / Growth / Authority. White-label design editor, automations, retention tools.' },
  { key: 'oliver_portal_designer', displayName: 'Portal Designer', section: 'OLIVER', defaultStatus: 'not_subscribed', route: '/app/services/oliver_portal_designer', description: 'White Label Design Editor — control portal buttons, labels, fonts, header/footer, and custom CSS (Client Experience add-on).' },
  // LOCKED 2026-05-26 r2 — Workflow & Automations is the new nav home for
  // the Automations engine (Pro+ rule library + tenant message customization).
  // Replaces the deprecated Client Experience add-on stub; routes to the
  // re-implemented OliverAutomationsPage that talks to /automations/* API.
  { key: 'oliver_automations', displayName: 'Workflow & Automations', section: 'OLIVER', defaultStatus: 'not_subscribed', route: '/app/services/oliver_automations', description: 'Pre-built automation rules (booking confirmations, job reminders, auto-invoicing, on-the-way SMS, auto-assign workers) + customizable message templates. Pro+ unlocks the orchestration rules; comms rules work on all tiers.' },
  { key: 'oliver_addons', displayName: 'Add-ons', section: 'OLIVER', defaultStatus: 'not_subscribed', route: '/app/services/oliver_addons', description: 'Stack-on subscriptions: SMS Essentials/Growth/Authority for operational notifications. Future: per-tenant native mobile apps.' },
  { key: 'oliver_portal_domains', displayName: 'Portals & Domains', section: 'OLIVER', defaultStatus: 'not_subscribed', route: '/app/services/oliver_portal_domains', description: 'Customer + crew portal URLs. Default subdomains (xxx.customer.ia-dm.com) free; bring your own domain on Pro+.' },
  // F-114 — Unified Customer & Crew portals hub (replaces 3 scattered surfaces).
  { key: 'oliver_portals_hub', displayName: 'Customer & Crew Portals', section: 'OLIVER', defaultStatus: 'not_subscribed', route: '/app/services/oliver_portals_hub', description: 'Single hub to manage both portals — design, signup form, domain binding, and workflow rules.' },
  // F-70 + F-72 + F-63 — Workflow Settings (reschedule policy, post-booking
  // actions, customer signup form config).
  { key: 'oliver_workflow_settings', displayName: 'Workflow Settings', section: 'OLIVER', defaultStatus: 'not_subscribed', route: '/app/services/oliver_workflow_settings', description: 'Reschedule policy + after-booking actions (auto-invoice, confirmation email, auto-assign) + the customer signup form library.' },
  // OLIVER v1.0 additions
  // Workflow Templates DEPRECATED 2026-05-26 — redundant with service catalog
  // (preset durations/prices) and customer.internal_notes (per-customer
  // recurring details). Page + route stay reachable by URL but removed from
  // nav. Real "Proposal Templates" feature will land later as a sibling of
  // the Quotes feature when that gets full-feature treatment.
  // { key: 'oliver_workflow_templates', displayName: 'Workflow Templates', section: 'OLIVER', defaultStatus: 'not_subscribed', route: '/app/services/oliver_workflow_templates', description: 'Pre-built job templates (HVAC, plumbing, mobile pet, cleaning, etc.) with default checklists, durations, and prices.' },
  { key: 'oliver_job_offers', displayName: 'Job Offers', section: 'OLIVER', defaultStatus: 'not_subscribed', route: '/app/services/oliver_job_offers', description: 'Broadcast a job to multiple workers — first to accept claims it.' },
  { key: 'oliver_support_tickets', displayName: 'Support Tickets', section: 'OLIVER', defaultStatus: 'not_subscribed', route: '/app/services/oliver_support_tickets', description: 'Customer-facing support tickets with threaded replies + convert-to-job.' },
  { key: 'oliver_time_tracking', displayName: 'Time Tracking', section: 'OLIVER', defaultStatus: 'not_subscribed', route: '/app/services/oliver_time_tracking', description: 'Worker time entries — clock in/out + manual + billable rollup (Pro).' },
  // F-116 — OLIVER Expenses deprecated; rebuilds expansively in STELLA.
  // Status set to coming_soon so it surfaces in the platform service
  // catalog but never appears as an active OLIVER feature. Route kept for
  // deep-link safety but page redirects to STELLA placeholder (see
  // ServiceRouter).
  { key: 'oliver_expenses', displayName: 'Expenses (moved to STELLA)', section: 'OLIVER', defaultStatus: 'coming_soon', route: '/app/services/oliver_expenses', description: 'Deprecated — Expenses moves to STELLA for the expanded build. Existing data preserved.' },
  // F-116 — the STELLA 0.1.0 Expenses MLP (stella_expenses_coming) is retired;
  // superseded by the STELLA Ledger (Transactions + Inbox) rows above.
  { key: 'oliver_reschedule_requests', displayName: 'Reschedule Queue', section: 'OLIVER', defaultStatus: 'not_subscribed', route: '/app/services/oliver_reschedule_requests', description: 'Customer self-service reschedule requests with admin approval (Pro).' },
  { key: 'oliver_quote_options', displayName: 'Quote Options', section: 'OLIVER', defaultStatus: 'not_subscribed', route: '/app/services/oliver_quote_options', description: 'Multi-option (good/better/best) pricing tiers on a quote (Pro). Open from a quote.' },
  { key: 'oliver_territories', displayName: 'Territories', section: 'OLIVER', defaultStatus: 'not_subscribed', route: '/app/services/oliver_territories', description: 'Service area rules + primary/backup workers (Business).' },
  { key: 'oliver_sla_policies', displayName: 'SLA Policies', section: 'OLIVER', defaultStatus: 'not_subscribed', route: '/app/services/oliver_sla_policies', description: 'Service-level commitments + breach reporting (Business).' },
  { key: 'oliver_job_costing', displayName: 'Job Costing', section: 'OLIVER', defaultStatus: 'not_subscribed', route: '/app/services/oliver_job_costing', description: 'Per-job revenue vs cost margin analysis. Sync from time entries + expenses (Business).' },
  { key: 'oliver_argus', displayName: 'ARGUS Insights', section: 'OLIVER', defaultStatus: 'not_subscribed', route: '/app/services/oliver_argus', description: 'AI-generated weekly business insights — margin alerts, ticket triage, cash flow flags (Business).' },
  { key: 'oliver_payouts', displayName: 'Stripe Payouts', section: 'OLIVER', defaultStatus: 'not_subscribed', route: '/app/services/oliver_payouts', description: 'Stripe Connect payout dashboard: account status, balance, schedule, recent transfers (Pro).' },
  { key: 'oliver_reminders', displayName: 'Reminders', section: 'OLIVER', defaultStatus: 'not_subscribed', route: '/app/services/oliver_reminders', description: 'Overdue invoice tracker. See which automated reminders have fired and send manual nudges.' },
  { key: 'oliver_onboarding', displayName: 'Get Started', section: 'OLIVER', defaultStatus: 'not_subscribed', route: '/app/services/oliver_onboarding', description: 'Guided 5-step setup wizard for new tenants.' },
  { key: 'oliver_agents', displayName: 'Agents', section: 'OLIVER', defaultStatus: 'enabled', route: '/app/services/oliver_agents', description: 'What your OLIVER agents did, anything waiting on you, and the switch for each one.' },
  { key: 'oliver_settings', displayName: 'Business Setup', section: 'OLIVER', defaultStatus: 'not_subscribed', route: '/app/services/oliver_settings', description: 'Deprecated — profile moved to Organization Settings, templates to Template Library, connections to Connected Accounts.' },
  { key: 'oliver_templates', displayName: 'Document Design', section: 'OLIVER', defaultStatus: 'not_subscribed', route: '/app/services/oliver_templates', description: 'How your invoices, quotes and proposals look. Lives in Business Setup with the invoice template.' },
  { key: 'oliver_team_access', displayName: 'Team Access', section: 'OLIVER', defaultStatus: 'not_subscribed', route: '/app/services/oliver_team_access', description: 'Assign Admin or Accountant roles to OLIVER users. Accountants get a read-only Billing/Reports view.' },
  { key: 'oliver_locations', displayName: 'Locations', section: 'OLIVER', defaultStatus: 'not_subscribed', route: '/app/services/oliver_locations', description: 'Business locations — scope jobs, team, invoices and reports per location. A second location needs OLIVER Business.' },
  { key: 'oliver_coupons', displayName: 'Coupons', section: 'OLIVER', defaultStatus: 'not_subscribed', route: '/app/services/oliver_coupons', description: 'Discount codes & promotion codes, synced bidirectionally with Stripe.' },
  { key: 'oliver_insights', displayName: 'Insights', section: 'OLIVER', defaultStatus: 'not_subscribed', route: '/app/services/oliver_insights', description: 'Customer health, service profitability, and cash flow forecast.' },
  { key: 'oliver_projects', displayName: 'Projects', section: 'OLIVER', defaultStatus: 'not_subscribed', route: '/app/services/oliver_projects', description: 'Group multiple jobs into a single multi-stage customer engagement.' },
  { key: 'oliver_disputes', displayName: 'Disputes', section: 'OLIVER', defaultStatus: 'not_subscribed', route: '/app/services/oliver_disputes', description: 'Stripe chargebacks pulled in with deep-links to respond on Stripe.' },
  { key: 'oliver_proposals', displayName: 'Proposals', section: 'OLIVER', defaultStatus: 'not_subscribed', route: '/app/services/oliver_proposals', description: 'Branded proposals with tracked send + click-to-accept. Accepted proposals auto-create OLIVER quotes.' },
  // SPARK — Full CRM + Lead Gen + Intelligence suite
  { key: 'spark_overview', displayName: 'Overview', section: 'LUMEN', defaultStatus: 'not_subscribed', route: '/app/services/spark_overview', description: 'Setup hints + jump-off to the rest of SPARK. Tier usage now lives in the page header chip on every SPARK page.' },
  { key: 'spark_contacts', displayName: 'Contacts', section: 'LUMEN', defaultStatus: 'not_subscribed', route: '/app/services/spark_contacts', description: 'Contact management with dedup, search, import, and activity history.' },
  { key: 'spark_lists', displayName: 'Lists', section: 'LUMEN', defaultStatus: 'not_subscribed', route: '/app/services/spark_lists', description: 'Static contact lists for campaign targeting.' },
  { key: 'spark_segments', displayName: 'Segments', section: 'LUMEN', defaultStatus: 'not_subscribed', route: '/app/services/spark_segments', description: 'Dynamic contact segments with filter rules.' },
  { key: 'spark_agents', displayName: 'Agents', section: 'LUMEN', defaultStatus: 'enabled', route: '/app/services/spark_agents', description: 'What your SPARK agents did, anything waiting on you, and the switch for each one.' },
  { key: 'spark_campaigns', displayName: 'Campaigns', section: 'LUMEN', defaultStatus: 'not_subscribed', route: '/app/services/spark_campaigns', description: 'Email and SMS campaign management with analytics.' },
  { key: 'spark_forms', displayName: 'Forms', section: 'LUMEN', defaultStatus: 'not_subscribed', route: '/app/services/spark_forms', description: 'Form builder with hosted URLs and embedded widgets.' },
  { key: 'spark_form_builder', displayName: 'Form Builder', section: 'LUMEN', defaultStatus: 'not_subscribed', route: '/app/services/spark_form_builder', description: 'Visual drag-and-drop designer for form fields (text, email, phone, select, radio, checkbox, date, number, hidden) with live preview and hosted submit URL.' },
  { key: 'spark_realtime_metrics', displayName: 'Real-Time Activity', section: 'LUMEN', defaultStatus: 'enabled', route: '/app/services/spark_realtime_metrics', description: 'Live tenant activity dashboard with auto-refreshing tiles + 60-minute sparklines (emails, SMS, forms, contacts, leads, activity events, webhooks, anomaly alerts).' },
  { key: 'spark_api_reference', displayName: 'API Reference', section: 'LUMEN', defaultStatus: 'enabled', route: '/app/services/spark_api_reference', description: 'Self-service API reference: all SPARK endpoints grouped by feature with example bodies, method colors, tier requirements, and copy buttons.' },
  { key: 'spark_engine_docs', displayName: 'IA Insights Engine Docs', section: 'LUMEN', defaultStatus: 'enabled', route: '/app/services/spark_engine_docs', description: 'Per-report documentation for ARION/SPARK/OLIVER trend engines: business question, score inputs, weights, data sources, and industry benchmarks.' },
  { key: 'spark_smoke_test', displayName: 'Tenant Smoke Test', section: 'LUMEN', defaultStatus: 'enabled', route: '/app/services/spark_smoke_test', description: '24-test read-only smoke test of every major SPARK + IA Insights endpoint. Results persist per-tenant in localStorage. Useful for manual-testing sessions and post-deploy verification.' },
  { key: 'spark_automations', displayName: 'Automations', section: 'LUMEN', defaultStatus: 'not_subscribed', route: '/app/services/spark_automations', description: 'Welcome and re-engagement email sequences.' },
  // Unified Lead Inbox (2026-06-25) — single page with three tabs:
  // Lead Inbox, Suppressed Domains, Territories. `spark_lead_inbox` is the
  // canonical key; `spark_leads` is retained as a back-compat alias.
  { key: 'spark_lead_inbox', displayName: 'Lead Inbox', section: 'LUMEN', defaultStatus: 'not_subscribed', route: '/app/services/spark_lead_inbox', description: 'B2B Lead Inbox with Hot/Warm/Cold scoring, plus tabs for Suppressed Domains and Territories.' },
  { key: 'spark_leads', displayName: 'Lead Inbox', section: 'LUMEN', defaultStatus: 'not_subscribed', route: '/app/services/spark_leads', description: 'B2B lead inbox with Hot/Warm/Cold scoring.' },
  // Intake connectors (G-2, 2026-09-04): the platforms a business already has
  // collecting enquiries for it. Sits beside the Lead Inbox those leads land in.
  { key: 'spark_lead_sources', displayName: 'Lead sources', section: 'LUMEN', defaultStatus: 'not_subscribed', route: '/app/services/spark_lead_sources', description: 'Connect Google Ads lead forms (and, as they open up, Local Services Ads, Facebook and Instagram) so their leads land in the Lead Inbox automatically.' },
  { key: 'spark_search_profiles', displayName: 'Search Profiles', section: 'LUMEN', defaultStatus: 'not_subscribed', route: '/app/services/spark_search_profiles', description: 'Saved lead search configurations.' },
  // SPARK Lead Gen V1 (F-150/F-163) — Option 3 live-preview lead search flow
  { key: 'spark_leadgen_new', displayName: 'New B2B Lead Search', section: 'LUMEN', defaultStatus: 'not_subscribed', route: '/app/spark/leadgen/b2b_new', description: 'Build a B2B lead search with a live preview panel — see expanded keywords, resolved cities, estimated cost, and runtime before you pay.' },
  { key: 'spark_leadgen_saved', displayName: 'Saved Lead Searches', section: 'LUMEN', defaultStatus: 'not_subscribed', route: '/app/spark/leadgen/saved', description: 'Saved Lead Gen profiles. Re-run any with one click.' },
  { key: 'spark_intelligence', displayName: 'Contact Scoring', section: 'LUMEN', defaultStatus: 'not_subscribed', route: '/app/services/spark_intelligence', description: 'X/Y/Z contact intelligence with OLIVER cross-platform signals.' },
  // Tenant-level tuning surface for the 6-dimension contact score weights.
  // Six sliders that must sum to 100; live re-rank preview of the top 20
  // contacts. Routes to the dedicated /app/spark/contact-scoring page via
  // ServiceRouter (NOT a generic feature page).
  { key: 'spark_contact_scoring', displayName: 'Contact Score Tuning', section: 'LUMEN', defaultStatus: 'enabled', route: '/app/spark/contact-scoring', description: 'Tune the 6-dimension contact intelligence weights (engagement, lifecycle, revenue, recency, channel diversity, quality flags). Sliders must sum to 100; preview shows how the top 20 contacts re-rank under the new weights.' },
  { key: 'spark_usage', displayName: 'Plan & Pricing', section: 'LUMEN', defaultStatus: 'not_subscribed', route: '/app/services/spark_usage', description: 'SPARK volume + feature tier + Lead Gen picker with live total. Current usage shown at top for reference.' },
  { key: 'spark_usage_report', displayName: 'Usage', section: 'LUMEN', defaultStatus: 'not_subscribed', route: '/app/services/spark_usage_report', description: 'Email, SMS, contact, and lead usage vs your plan limits.' },
  // SPARK Pro tier
  { key: 'spark_pipelines', displayName: 'Sales Pipeline', section: 'LUMEN', defaultStatus: 'not_subscribed', route: '/app/services/spark_pipelines', description: 'Multi-stage sales pipelines with Kanban board (Pro).' },
  { key: 'spark_deals', displayName: 'Deals', section: 'LUMEN', defaultStatus: 'not_subscribed', route: '/app/services/spark_deals', description: 'Opportunity tracking, value forecasting, win/loss analysis (Pro).' },
  { key: 'spark_nps', displayName: 'NPS', section: 'LUMEN', defaultStatus: 'not_subscribed', route: '/app/services/spark_nps', description: 'Net Promoter Score tracking, promoters/detractors, review routing (Pro).' },
  { key: 'spark_qr_codes', displayName: 'QR Codes', section: 'LUMEN', defaultStatus: 'not_subscribed', route: '/app/services/spark_qr_codes', description: 'Dynamic QR generator with UTM + scan analytics (Pro).' },
  { key: 'spark_referrals', displayName: 'Referrals', section: 'LUMEN', defaultStatus: 'not_subscribed', route: '/app/services/spark_referrals', description: 'Customer referral programs, tracking, rewards, leaderboard (Pro).' },
  { key: 'spark_social', displayName: 'Social Scheduler', section: 'LUMEN', defaultStatus: 'not_subscribed', route: '/app/services/spark_social', description: 'Schedule + analyze posts across FB/IG/LI/X/GBP (Pro).' },
  { key: 'spark_newsletter', displayName: 'Newsletter Studio', section: 'LUMEN', defaultStatus: 'not_subscribed', route: '/app/services/spark_newsletter', description: 'Newsletter editions with auto-publish to WordPress (Pro).' },
  { key: 'spark_calendar', displayName: 'Content Calendar', section: 'LUMEN', defaultStatus: 'not_subscribed', route: '/app/services/spark_calendar', description: 'Unified content calendar: campaigns, social, newsletters (Pro).' },
  // SPARK Business tier
  { key: 'spark_landing_pages', displayName: 'Landing Pages', section: 'LUMEN', defaultStatus: 'not_subscribed', route: '/app/services/spark_landing_pages', description: 'Hosted landing page builder with submission capture (Business).' },
  { key: 'spark_reviews', displayName: 'Reputation Hub', section: 'LUMEN', defaultStatus: 'not_subscribed', route: '/app/services/spark_reviews', description: 'Aggregated reviews across Google/Yelp/Facebook + response workflow (Business).' },
  { key: 'spark_accounts', displayName: 'Companies', section: 'LUMEN', defaultStatus: 'not_subscribed', route: '/app/services/spark_accounts', description: 'Group contacts under company entities with auto-domain matching + health scoring.' },
  { key: 'spark_ai_writer', displayName: 'AI Writer', section: 'LUMEN', defaultStatus: 'not_subscribed', route: '/app/services/spark_ai_writer', description: 'Write an email, five subject lines, or improve copy you already have. Each one shows what it costs before you press it.' },
  // Cross-platform
  { key: 'spark_insights', displayName: 'Insights', section: 'LUMEN', defaultStatus: 'not_subscribed', route: '/app/services/spark_insights', description: 'Cross-platform SPARK insights — 7 categories with ARGUS observation boxes.' },
  { key: 'spark_activity_stream', displayName: 'Activity Stream', section: 'LUMEN', defaultStatus: 'not_subscribed', route: '/app/services/spark_activity_stream', description: 'Unified contact activity timeline across SPARK, OLIVER, and ARION with filterable feed and 30-day summary.' },
  { key: 'spark_health_score', displayName: 'Health Score', section: 'LUMEN', defaultStatus: 'not_subscribed', route: '/app/services/spark_health_score', description: 'Customer health score 0-100 from engagement, recency, tenure, behavioral score, and negative signals. Distribution + per-contact breakdown.' },
  { key: 'spark_dashboards', displayName: 'Dashboards', section: 'LUMEN', defaultStatus: 'not_subscribed', route: '/app/services/spark_dashboards', description: 'Saved widget layouts you can return to. Pin a default; share with the whole tenant.' },
  { key: 'spark_analytics_reports', displayName: 'Analytics Reports', section: 'LUMEN', defaultStatus: 'not_subscribed', route: '/app/services/spark_analytics_reports', description: 'Build and run saved analytics reports across activity, health, SMS, email, contacts, and anomalies.' },
  { key: 'spark_contact_bulk', displayName: 'Bulk Operations', section: 'LUMEN', defaultStatus: 'not_subscribed', route: '/app/services/spark_contact_bulk', description: 'Apply the same change to many contacts at once: locale, tag, list, opt-out, soft-delete.' },
  // v1.0 additions — shared platform + Business-tier admin
  { key: 'spark_approvals', displayName: 'Approvals', section: 'LUMEN', defaultStatus: 'not_subscribed', route: '/app/services/spark_approvals', description: 'Business-tier approval workflow queue (campaigns, posts, large sends).' },
  // spark_sms_inbox REMOVED 2026-09-08 (SPARK pack 1): one inbox, and it is the
  // Lead Inbox. ServiceRouter redirects the old route so bookmarks land somewhere.
  { key: 'spark_email_templates', displayName: 'Email Templates', section: 'LUMEN', defaultStatus: 'not_subscribed', route: '/app/services/spark_email_templates', description: 'Transactional + marketing email template library with visual block builder.' },
  { key: 'spark_automation_builder', displayName: 'Automation Builder', section: 'LUMEN', defaultStatus: 'not_subscribed', route: '/app/services/spark_automation_builder', description: 'Visual multi-step automation builder with email/SMS/wait/tag/branch steps + run log.' },
  { key: 'spark_deliverability', displayName: 'Deliverability', section: 'LUMEN', defaultStatus: 'not_subscribed', route: '/app/services/spark_deliverability', description: 'Open/click/bounce/complaint dashboard, suppression list, SPF/DKIM/DMARC verifier (Pro).' },
  { key: 'spark_ab_tests', displayName: 'A/B Tests', section: 'LUMEN', defaultStatus: 'not_subscribed', route: '/app/services/spark_ab_tests', description: 'Head-to-head campaign A/B tests with winner declaration (Pro).' },
  { key: 'spark_lead_suppression', displayName: 'Lead Suppression', section: 'LUMEN', defaultStatus: 'not_subscribed', route: '/app/services/spark_lead_suppression', description: 'Suppressed domains and email addresses for the Lead Gen pipeline.' },
  { key: 'spark_lead_territories', displayName: 'Lead Territories', section: 'LUMEN', defaultStatus: 'not_subscribed', route: '/app/services/spark_lead_territories', description: 'Geographic and industry-based rules to auto-assign new leads.' },
  { key: 'spark_autotag_rules', displayName: 'Auto-Tag Rules', section: 'LUMEN', defaultStatus: 'not_subscribed', route: '/app/services/spark_autotag_rules', description: 'Rules that auto-tag leads based on score, industry, geography, etc.' },
  { key: 'spark_competitor_watch', displayName: 'Competitor Watch', section: 'LUMEN', defaultStatus: 'not_subscribed', route: '/app/services/spark_competitor_watch', description: 'Track competitor domains for new-hire and funding signals.' },
  { key: 'spark_scoring_rules', displayName: 'Scoring Rules', section: 'LUMEN', defaultStatus: 'not_subscribed', route: '/app/services/spark_scoring_rules', description: 'Rules-based lead scoring engine — assign points on event triggers (Business).' },
  { key: 'spark_routing_rules', displayName: 'Routing Rules', section: 'LUMEN', defaultStatus: 'not_subscribed', route: '/app/services/spark_routing_rules', description: 'Round-robin / weighted / territory routing for new leads (Business).' },
  // Sept-A F5: spark_attribution retired as a standalone service — attribution is a
  // tabbed report group under IA Insights Trends > Lead Pipeline (route redirects).
  // 2026-07-26 — spark_stella stays routable (deep links) but is out of the
  // nav: its analysis ships as the spark_send_times report in SPARK
  // Intelligence. The Reports hubs are the IA Insights "general reporting" bucket.
  { key: 'spark_stella', displayName: 'STELLA Send Intelligence', section: 'LUMEN', defaultStatus: 'not_subscribed', route: '/app/services/spark_stella', description: 'Best-time-to-send heatmap and per-contact recommendation, learned from your historical engagement data.' },
  { key: 'spark_ia_insights_reports', displayName: 'Reports', section: 'LUMEN', defaultStatus: 'not_subscribed', route: '/app/services/spark_ia_insights_reports', description: 'Operational reports — real-time activity, usage, and the audit log.' },
  { key: 'oliver_ia_insights_reports', displayName: 'Reports', section: 'OLIVER', defaultStatus: 'not_subscribed', route: '/app/services/oliver_ia_insights_reports', description: 'Operational reports — the activity log behind your scored insights.' },
  { key: 'spark_scheduled_reports', displayName: 'Scheduled Reports', section: 'LUMEN', defaultStatus: 'not_subscribed', route: '/app/services/spark_scheduled_reports', description: 'Save report configurations and have them emailed on a daily/weekly/monthly cadence (Business).' },
  { key: 'spark_audience_sync', displayName: 'Audience Sync', section: 'LUMEN', defaultStatus: 'not_subscribed', route: '/app/services/spark_audience_sync', description: 'Export hashed audiences for Google Ads Customer Match + Meta Custom Audiences (Business).' },
  { key: 'spark_journey_builder', displayName: 'Journey Builder', section: 'LUMEN', defaultStatus: 'not_subscribed', route: '/app/services/spark_journey_builder', description: 'Visual graph editor for branching automation journeys with yes/no edge wiring.' },
  { key: 'spark_tracking', displayName: 'Visitor Tracking', section: 'LUMEN', defaultStatus: 'not_subscribed', route: '/app/services/spark_tracking', description: 'One-line tracking snippet for your website: visitor identification, pageview attribution, page-visit scoring triggers (Business).' },
  // 2026-09-01 — 'spark_sender_domains' (Sender Setup) merged into 'spark_senders'.
  // Its route still resolves so existing links and tours keep working, but it is
  // no longer a separate thing in the menu.
  // SPARK Composer v1.1 (2026-06-24) — Senders + Signatures CRUD.
  { key: 'spark_senders', displayName: 'Senders', section: 'LUMEN', defaultStatus: 'not_subscribed', route: '/app/services/spark_senders', description: 'The addresses your email goes out from (hello@, support@, welcome@). Adding one walks you through the whole setup, including the domain.' },
  { key: 'spark_signatures', displayName: 'Signatures', section: 'LUMEN', defaultStatus: 'not_subscribed', route: '/app/services/spark_signatures', description: 'Reusable closing blocks (signatures) picked from the SPARK Composer Signature dropdown.' },
  { key: 'spark_onboarding', displayName: 'Get Started', section: 'LUMEN', defaultStatus: 'not_subscribed', route: '/app/services/spark_onboarding', description: 'Guided onboarding checklist — profile, sender domain, contact import, first campaign, first automation.' },
  { key: 'spark_account_profile', displayName: 'Business Profile', section: 'LUMEN', defaultStatus: 'not_subscribed', route: '/app/services/spark_account_profile', description: 'Review-and-save your shared business profile (name, contact, address, branding). One source of truth across every product.' },
  { key: 'spark_templates', displayName: 'Templates', section: 'LUMEN', defaultStatus: 'enabled', route: '/app/services/spark_templates', description: 'Unified Email + SMS template library. Click any row to edit; click + New to start one. The advanced visual block editor is one click deep inside any email template.' },
  // Phase 3A (2026-06-16) — kept for back-compat deep links; routes to the
  // new unified Workflows & Automations page.
  { key: 'spark_rules', displayName: 'Rules', section: 'LUMEN', defaultStatus: 'enabled', route: '/app/services/spark_rules', description: 'Unified scoring + routing + auto-tag rules library. Replaces 3 separate pages.' },
  // Phase 3A merger — one page for Automations (triggers) + Rules.
  { key: 'spark_workflows_automations', displayName: 'Workflows & Automations', section: 'LUMEN', defaultStatus: 'enabled', route: '/app/services/spark_workflows_automations', description: 'Single inventory for trigger-based automations + passive rules (scoring, routing, auto-tag). One New Workflow button opens the unified chooser modal.' },
  // F-CS.6 — admin surface for the lumen.spark_task rows referenced by
  // automation steps of kind `task_call`. Backs the F-CS.3 dropdown in
  // the IL Customize editor. Phase 1: create/rename/delete + read-only
  // step list. Step editing ships in Phase 2.
  { key: 'spark_tasks', displayName: 'Tasks', section: 'LUMEN', defaultStatus: 'enabled', route: '/app/services/spark_tasks', description: 'Reusable named sub-automations. Any IL automation step of kind `task_call` invokes a row from this list by id.' },
  { key: 'spark_api_keys', displayName: 'API Keys', section: 'LUMEN', defaultStatus: 'not_subscribed', route: '/app/services/spark_api_keys', description: 'Issue API keys for Zapier / n8n / custom integrations. Scoped + revocable.' },
  // Phase 3A (2026-06-16) — UI now shows a Coming Soon banner pending our
  // own webhook stack in v1.5. Pulled from main nav.
  // 'coming_soon' → 'not_subscribed' 2026-09-08 (SPARK pack 1): the page is real
  // now, and coming_soon also kept it out of the global search box.
  { key: 'spark_webhooks', displayName: 'Webhooks', section: 'LUMEN', defaultStatus: 'not_subscribed', route: '/app/services/spark_webhooks', description: 'Tell another system when something happens here — signed, retried, with a log of every message we sent.' },
  { key: 'spark_sms_templates', displayName: 'SMS Templates', section: 'LUMEN', defaultStatus: 'not_subscribed', route: '/app/services/spark_sms_templates', description: 'Reusable SMS templates with {{vars}}. System templates (review request, appointment reminder, etc.) included.' },
  { key: 'spark_sms_campaigns', displayName: 'SMS Campaigns', section: 'LUMEN', defaultStatus: 'not_subscribed', route: '/app/services/spark_sms_campaigns', description: 'Bulk SMS broadcasts to lists/segments/tags with scheduling, audience preview, and delivery log.' },
  { key: 'spark_contact_import', displayName: 'Import Contacts', section: 'LUMEN', defaultStatus: 'not_subscribed', route: '/app/services/spark_contact_import', description: '4-step CSV import wizard: upload, map columns, preview, commit with optional list + tags.' },
  { key: 'spark_inbound_webhooks', displayName: 'Inbound Webhooks', section: 'LUMEN', defaultStatus: 'not_subscribed', route: '/app/services/spark_inbound_webhooks', description: 'Publish URLs that accept inbound POSTs (Stripe, Typeform, Zapier) and auto-create/merge contacts or fire events.' },
  { key: 'spark_secrets', displayName: 'Secrets Vault', section: 'LUMEN', defaultStatus: 'not_subscribed', route: '/app/services/spark_secrets', description: 'AES-256-GCM encrypted vault for tenant-supplied API tokens. Reveal is audit-logged.' },
  { key: 'spark_audit_log', displayName: 'Audit Log', section: 'LUMEN', defaultStatus: 'not_subscribed', route: '/app/services/spark_audit_log', description: 'Tenant-wide audit log with filters, summary metrics, and top actions/users dashboard (Business).' },
  { key: 'spark_calendar_sync', displayName: 'Calendar Sync', section: 'LUMEN', defaultStatus: 'not_subscribed', route: '/app/services/spark_calendar_sync', description: 'Two-way iCal calendar sync: publish your content calendar to Google/Outlook + import external iCal feeds.' },
  { key: 'spark_anomaly_alerts', displayName: 'Anomaly Alerts', section: 'LUMEN', defaultStatus: 'not_subscribed', route: '/app/services/spark_anomaly_alerts', description: 'Rule-based anomaly detection for SMS sends, bounce rates, signup spikes, and webhook failures.' },
  { key: 'spark_template_i18n', displayName: 'Template Translations', section: 'LUMEN', defaultStatus: 'not_subscribed', route: '/app/services/spark_template_i18n', description: 'Per-locale variants of your email and SMS templates with automatic per-contact locale fallback.' },
  { key: 'spark_contact_360', displayName: 'Contact 360°', section: 'LUMEN', defaultStatus: 'not_subscribed', route: '/app/services/spark_contact_360', description: 'Unified cross-product contact view aggregating SPARK, OLIVER, and ARION data into one read-only timeline.' },
  { key: 'spark_contact_merge', displayName: 'Contact Merge', section: 'LUMEN', defaultStatus: 'not_subscribed', route: '/app/services/spark_contact_merge', description: 'Find and merge duplicate contacts grouped by shared email or phone. Pick a canonical contact and consolidate the rest into it.' },
  { key: 'spark_webhook_deliveries', displayName: 'Webhook Deliveries', section: 'LUMEN', defaultStatus: 'not_subscribed', route: '/app/services/spark_webhook_deliveries', description: 'Outbound webhook delivery history with payload + response inspection, per-event filtering, and one-click retry of failures.' },
  { key: 'spark_saved_searches', displayName: 'Saved Searches', section: 'LUMEN', defaultStatus: 'not_subscribed', route: '/app/services/spark_saved_searches', description: 'Reusable named filter sets across Contacts, Deals, Leads, and Campaigns. Pin and share with your tenant.' },
  { key: 'spark_quiet_hours', displayName: 'Quiet Hours', section: 'LUMEN', defaultStatus: 'not_subscribed', route: '/app/services/spark_quiet_hours', description: 'Tenant-wide outbound-SMS quiet window. Block, queue, or reject sends during the configured hours with a live 24-segment clock view.' },
  { key: 'spark_nps_schedules', displayName: 'NPS Schedules', section: 'LUMEN', defaultStatus: 'not_subscribed', route: '/app/services/spark_nps_schedules', description: 'Recurring NPS or CSAT surveys on a once/weekly/monthly/quarterly cadence with fire-now and pause controls.' },
  { key: 'spark_custom_fields', displayName: 'Custom Fields', section: 'LUMEN', defaultStatus: 'not_subscribed', route: '/app/services/spark_custom_fields', description: 'Tenant-defined extra fields on contacts, deals, and accounts with string/number/date/boolean/enum types.' },

  // ── Coming-Soon placeholders for FORGE / ARGUS ─────────────────────────────
  // These keys are referenced from SubNav and from in-page links (IA Insights
  // header sub-routes, etc.). They render the generic "Coming soon" placeholder
  // in ServiceRouter — no dedicated page component needed.
  // (STELLA's old stella_coming Overview MLP is retired — see the STELLA block
  // above; legacy /app/services/stella_coming links redirect to the Ledger
  // Overview landing.)
  { key: 'forge_coming', displayName: 'FORGE Overview', section: 'FORGE', defaultStatus: 'coming_soon', route: '/app/services/forge_coming', description: 'FORGE integration hub — coming soon. The home for cross-product integrations and data plumbing.' },
  { key: 'argus_coming', displayName: 'ARGUS Overview', section: 'ARGUS', defaultStatus: 'coming_soon', route: '/app/services/argus_coming', description: 'ARGUS AI agents — coming soon. Autonomous AI doing work on your behalf under your guardrails.' },
  { key: 'spark_workflow_triggers', displayName: 'Workflow Triggers', section: 'LUMEN', defaultStatus: 'not_subscribed', route: '/app/services/spark_workflow_triggers', description: 'Per-contact triggers (health tier change / lead score threshold / activity silence / tag added) that fire an action.' },
  { key: 'spark_config_backup', displayName: 'Configuration Backup', section: 'LUMEN', defaultStatus: 'not_subscribed', route: '/app/services/spark_config_backup', description: 'Export and import the tenant SPARK configuration (dashboards, reports, fields, rules, templates).' },
  // ── FORGE › HESTIA — non-profit case management (MS Moments is tenant #1) ──
  // Gated on the per-software key `forge_hestia`, not the `forge` line key.
  { key: 'forge_overview', displayName: 'Overview', section: 'FORGE', defaultStatus: 'coming_soon', route: '/app/services/forge_overview', description: 'Case management at a glance — people served, services delivered, funding pipeline.' },
  { key: 'forge_clients', displayName: 'Clients', section: 'FORGE', defaultStatus: 'coming_soon', route: '/app/services/forge_clients', description: 'People your organization serves.' },
  { key: 'forge_assistance', displayName: 'Assistance', section: 'FORGE', defaultStatus: 'coming_soon', route: '/app/services/forge_assistance', description: 'Financial assistance committed to a client over a period.' },
  { key: 'forge_services', displayName: 'Services', section: 'FORGE', defaultStatus: 'coming_soon', route: '/app/services/forge_services', description: 'A client receiving a service from a provider, paid from their assistance.' },
  { key: 'forge_providers', displayName: 'Providers', section: 'FORGE', defaultStatus: 'coming_soon', route: '/app/services/forge_providers', description: 'Vendors delivering services to clients.' },
  { key: 'forge_funders', displayName: 'Funders', section: 'FORGE', defaultStatus: 'coming_soon', route: '/app/services/forge_funders', description: 'Foundations and grantors your organization applies to.' },
  { key: 'forge_applications', displayName: 'Funding Applications', section: 'FORGE', defaultStatus: 'coming_soon', route: '/app/services/forge_applications', description: 'Applications your organization has made to funders.' },
  { key: 'forge_volunteers', displayName: 'Volunteers', section: 'FORGE', defaultStatus: 'coming_soon', route: '/app/services/forge_volunteers', description: 'People who give their time.' },
  // Phase 2 — fundraising, acknowledgements and reporting. Same gating as the
  // rest of HESTIA: the per-software `forge_hestia` key, not the FORGE line.
  { key: 'forge_people', displayName: 'People', section: 'FORGE', defaultStatus: 'coming_soon', route: '/app/services/forge_people', description: 'One record per person or organization — donor, volunteer, board member, or someone you serve.' },
  { key: 'forge_donations', displayName: 'Donations', section: 'FORGE', defaultStatus: 'coming_soon', route: '/app/services/forge_donations', description: 'Every gift received, with what is deductible and where it was designated.' },
  { key: 'forge_campaigns', displayName: 'Campaigns', section: 'FORGE', defaultStatus: 'coming_soon', route: '/app/services/forge_campaigns', description: 'Appeals and events — what you asked for, what it cost, what came in.' },
  { key: 'forge_funds', displayName: 'Funds', section: 'FORGE', defaultStatus: 'coming_soon', route: '/app/services/forge_funds', description: 'Where gifts are designated, and whether the donor restricted them.' },
  { key: 'forge_pledges', displayName: 'Pledges', section: 'FORGE', defaultStatus: 'coming_soon', route: '/app/services/forge_pledges', description: 'Promises to give, and how much of each is still outstanding.' },
  { key: 'forge_recurring', displayName: 'Recurring Gifts', section: 'FORGE', defaultStatus: 'coming_soon', route: '/app/services/forge_recurring', description: 'Standing gifts, when each next runs, and which ones have failed.' },
  { key: 'forge_receipts', displayName: 'Acknowledgements', section: 'FORGE', defaultStatus: 'coming_soon', route: '/app/services/forge_receipts', description: 'Written acknowledgements and year-end giving statements, to the IRS rules.' },
  { key: 'forge_reports', displayName: 'Reports', section: 'FORGE', defaultStatus: 'coming_soon', route: '/app/services/forge_reports', description: 'Fundraising, program and financial reporting — the questions a board, a funder and the IRS ask.' },
  { key: 'forge_setup', displayName: 'Organization Setup', section: 'FORGE', defaultStatus: 'coming_soon', route: '/app/services/forge_setup', description: 'Legal identity, fiscal year, receipt wording and payment setup.' },
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
  // @deprecated 2026-06-12 (M11): 8 legacy "Build Your X Tasks/Deliverables"
  // entries below all currently route to the same unfiltered Service Requests board.
  // Superseded by consulting_tickets + consulting_projects + consulting_deliverables
  // (new flat nav structure). Hidden from nav already via SubNav.tsx — these
  // entries stay in the catalog so any old bookmarks render the Coming Soon
  // placeholder instead of the unfiltered board. Confirm with founder before deletion (task #174).
  { key: 'consulting_brand_tasks', displayName: 'Brand Tasks', section: 'CONSULTING', defaultStatus: 'coming_soon', route: '/app/services/consulting_brand_tasks', description: '(Deprecated) See Service Requests for active brand work.' },
  { key: 'consulting_brand_deliverables', displayName: 'Brand Deliverables', section: 'CONSULTING', defaultStatus: 'coming_soon', route: '/app/services/consulting_brand_deliverables', description: '(Deprecated) See Deliverables library.' },
  { key: 'consulting_foundation_tasks', displayName: 'Foundation Tasks', section: 'CONSULTING', defaultStatus: 'coming_soon', route: '/app/services/consulting_foundation_tasks', description: '(Deprecated) See Service Requests.' },
  { key: 'consulting_foundation_deliverables', displayName: 'Foundation Deliverables', section: 'CONSULTING', defaultStatus: 'coming_soon', route: '/app/services/consulting_foundation_deliverables', description: '(Deprecated) See Deliverables library.' },
  { key: 'consulting_clarity_tasks', displayName: 'Clarity Tasks', section: 'CONSULTING', defaultStatus: 'coming_soon', route: '/app/services/consulting_clarity_tasks', description: '(Deprecated) See Service Requests.' },
  { key: 'consulting_clarity_deliverables', displayName: 'Clarity Deliverables', section: 'CONSULTING', defaultStatus: 'coming_soon', route: '/app/services/consulting_clarity_deliverables', description: '(Deprecated) See Deliverables library.' },
  { key: 'consulting_engine_tasks', displayName: 'Engine Tasks', section: 'CONSULTING', defaultStatus: 'coming_soon', route: '/app/services/consulting_engine_tasks', description: '(Deprecated) See Service Requests.' },
  { key: 'consulting_engine_deliverables', displayName: 'Engine Deliverables', section: 'CONSULTING', defaultStatus: 'coming_soon', route: '/app/services/consulting_engine_deliverables', description: '(Deprecated) See Deliverables library.' },
  { key: 'consulting_calendar', displayName: 'Calendar & Events', section: 'CONSULTING', defaultStatus: 'enabled', route: '/app/services/consulting_calendar', description: 'Scheduled events — discovery calls, QBRs, strategy sessions, reviews.' },
  // 2026-06-29 — Founder-side Consulting URLs relocated to /app/admin/consulting/*.
  // The catalog rows kept the original service_key values (other surfaces
  // reference them) but the route now points at the new admin URL so
  // GlobalSearch + GetStartedCard send the user directly to the canonical
  // location without bouncing through the ServiceRouter redirect.
  { key: 'consulting_workspace', displayName: 'Clients', section: 'CONSULTING', defaultStatus: 'enabled', route: '/app/admin/consulting/clients', description: 'List of every client tenant. Click a row to open their workspace modal — scoped to their tenant for ongoing consulting work.' },
  { key: 'consulting_access_log', displayName: 'IA Access Log', section: 'CONSULTING', defaultStatus: 'enabled', route: '/app/services/consulting_access_log', description: 'Transparency: whether Intelligent Analytics manages this account and a full log of everything IA has done in it.' },
  { key: 'consulting_onboard_client', displayName: 'Onboard Client', section: 'CONSULTING', defaultStatus: 'enabled', route: '/app/admin/consulting/onboard-client', description: 'Founder-only — onboard a new or existing client onto the IA platform (creates tenant, links/creates Stripe customer, sets up ARION site + plugin provisioning).' },
  { key: 'consulting_tickets', displayName: 'Service Requests', section: 'CONSULTING', defaultStatus: 'enabled', route: '/app/admin/consulting/requests', description: 'Recurring Build-Your-Business work — blog posts, monthly SEO reviews, quarterly content refreshes. Auto-generates next instance on close based on cadence. Founder sees all clients; clients see only their own.' },
  { key: 'consulting_projects', displayName: 'Projects', section: 'CONSULTING', defaultStatus: 'enabled', route: '/app/admin/consulting/projects', description: 'Project list — filterable by status / client / category, sorted by most recent activity. Click a row to open the full project modal.' },
  { key: 'consulting_deliverables', displayName: 'Deliverables', section: 'CONSULTING', defaultStatus: 'enabled', route: '/app/services/consulting_deliverables', description: 'Unified artifact library — logos, code, copy, designs. Tagged by Build Your Series. Sourced from Projects + standalone uploads.' },
  { key: 'consulting_documents', displayName: 'Document Library', section: 'CONSULTING', defaultStatus: 'enabled', route: '/app/admin/consulting/document-library', description: 'Founder-only library of intake form + proposal + report + scope-of-work + custom templates. Drag-drop intake builder with scoring; rich-text editor with merge-tag autocomplete for the rest.' },

  // MY_BRAND — Creative Studio (re-added 2026-07-18, Item 1 Task 2). The 10
  // pages under Portal/src/pages/myBrand/* were built + merged but the catalog
  // rows were removed 2026-06-22, so ServiceRouter (dispatches by service.key)
  // rendered "Service not found". The hub is reached via `arion_brand`
  // (ARION > Your Brand), now routed to MyBrandLandingPage; these rows register
  // the 9 sub-page routes the hub tiles deep-link to. Backend access is
  // fail-closed via MY_BRAND_LAUNCHED (LUMEN lib/myBrand/tierCheck.js) until launch.
  { key: 'my_brand_image_studio', displayName: 'Image Studio', section: 'MY_BRAND', defaultStatus: 'coming_soon', route: '/app/services/my_brand_image_studio', description: 'Generate on-brand images from a prompt — uses your brand colors, fonts, and logo.', tierGate: 'Standard' },
  { key: 'my_brand_voice', displayName: 'Brand Voice', section: 'MY_BRAND', defaultStatus: 'coming_soon', route: '/app/services/my_brand_voice', description: 'Capture your voice profile and check any copy for drift before you publish.' },
  // Renames 2026-07-22 (Brandon's re-cut, MY_BRAND_RECUT doc): Template
  // Studio → Design Studio, Asset Library → Media Library, Calendar+Composer
  // → Social Hub. Keys stay stable — routes and deep links are unchanged.
  { key: 'my_brand_templates', displayName: 'Design Studio', section: 'MY_BRAND', defaultStatus: 'coming_soon', route: '/app/services/my_brand_templates', description: 'Design social posts, ads, and email banners from brand-locked templates.', tierGate: 'Standard' },
  { key: 'my_brand_assets', displayName: 'Media Library', section: 'MY_BRAND', defaultStatus: 'coming_soon', route: '/app/services/my_brand_assets', description: 'Central library for logos, photos, generated images, and finished designs.' },
  { key: 'my_brand_social_channels', displayName: 'Social Channels', section: 'MY_BRAND', defaultStatus: 'coming_soon', route: '/app/services/my_brand_social_channels', description: 'Connect Facebook, Instagram, LinkedIn, X, TikTok, YouTube, and Google Business.', tierGate: 'Standard' },
  { key: 'my_brand_compose', displayName: 'Composer', section: 'MY_BRAND', defaultStatus: 'coming_soon', route: '/app/services/my_brand_compose', description: 'Compose once, publish to every connected channel with per-channel preview.', tierGate: 'Standard' },
  { key: 'my_brand_calendar', displayName: 'Social Hub', section: 'MY_BRAND', defaultStatus: 'coming_soon', route: '/app/services/my_brand_calendar', description: 'Compose, schedule, and re-arrange posts across every connected channel.', tierGate: 'Standard' },
  { key: 'my_brand_social_content', displayName: 'Social Content', section: 'MY_BRAND', defaultStatus: 'coming_soon', route: '/app/services/my_brand_social_content', description: 'Every published and scheduled post with per-post metrics, filters, and the full social report.', tierGate: 'Standard' },
  { key: 'my_brand_social_report', displayName: 'Social Report', section: 'MY_BRAND', defaultStatus: 'coming_soon', route: '/app/services/my_brand_social_report', description: 'Totals and daily trends across connected platforms. Reached from Social Content, not the nav.', tierGate: 'Standard' },
  // IA re-cut 2026-07-21 (Brandon): my_brand_analytics REMOVED — social
  // reporting lives in ARION IA Insights (Trends/Intelligence); the router
  // redirects the old key. my_brand_approvals REMOVED — the approval queue is
  // the IA↔client project workflow (Consulting domain), not a My Brand page.
  // my_brand_voice + my_brand_social_channels rows are KEPT (routes must
  // resolve — they are settings surfaces linked from Brand Identity /
  // integrations, not nav features).
];

// Feature-flag filter: while LEADGEN_ENABLED is false, the Lead Gen search
// keys are removed from the catalog entirely, so SidebarNav and any catalog
// consumer stop surfacing them. Dedicated Lead Gen routes are additionally
// gated in App.tsx for direct-URL access. See featureFlags.ts.
export const SERVICE_CATALOG: PortalService[] = LEADGEN_ENABLED
  ? RAW_SERVICE_CATALOG
  : RAW_SERVICE_CATALOG.filter((s) => !LEADGEN_LOCKED_KEYS.includes(s.key));

export function resolveServiceStatus(service: PortalService, enabledKeys: Set<string>): ServiceStatus {
  if (service.defaultStatus === 'enabled') return 'enabled';
  if (enabledKeys.has(service.key)) return 'enabled';
  return service.defaultStatus;
}
