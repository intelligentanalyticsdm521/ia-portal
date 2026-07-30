import { useState, type ComponentType } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  Monitor, Server, ShieldCheck, BarChart2, TrendingUp,
  Search as SearchIcon, MapPin, Star, ChevronDown, Settings,
  Users, Megaphone, Briefcase, Heart, Target, Sparkles,
  Wrench, UserCircle, CreditCard, MessageSquare, LineChart, Zap,
} from "lucide-react";
import type { ProductKey } from "./IconRail";

export interface SubNavItem {
  key: string;
  label: string;
  route: string;
  gated?: boolean;
  intelligence?: boolean; // (legacy) — no longer changes the label color; harmless if set.
  crossPlatform?: boolean; // (legacy) — no longer changes the label color; harmless if set.
  /** @deprecated 2026-06-22 — use `crossPlatform`. Kept for back-compat with older callers. */
  crossChannel?: boolean;
  /**
   * v7.4 — Optional platform/brand tag rendered to the right of the label.
   * The label text always uses the standard sidebar color; only the tag
   * pill carries the brand color. Use this for ARION/SPARK/OLIVER trend +
   * intelligence items, ARGUS Cross-Platform links, STELLA, etc.
   */
  tag?: { label: string; color: string };
}

export interface SubNavGroup {
  label: string;
  items: SubNavItem[];
  collapsible?: boolean;
  icon?: ComponentType<{ className?: string }>;
  sectionId?: string; // used for auto-collapse matching
  /**
   * Optional explicit "landing" route for this section. When a user clicks the
   * collapsible section header, they navigate here AND the section expands.
   * If omitted we fall back to the first item's route (which by convention is
   * the section's Overview).
   */
  landingRoute?: string;
}

export interface SubNavConfig {
  productName: string;
  tagline: string;
  groups: SubNavGroup[];
}

// ── Navigation configs per product ────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// OLIVER navigation — simplified per founder decision 2026-05-25.
//
// SHAPE:
//   - 9 top-level sections (down from 11)
//   - ~18 sub-pages (down from ~30)
//   - Operations + Communication index pages removed entirely
//   - Communications now live in Job + Customer modals (contextual, not global)
//   - All settings (Team Access, Templates, Booking, Territories, SLA,
//     Plan & Pricing, etc.) moved to the hamburger menu (one route per setting)
//   - Gear icon reserved for SUPER_ADMIN platform admin (separate concern)
//
// Recurring jobs surface as a filter/tag inside the Job Board, not a
// separate page. Subscriptions stay in Billing because they're a billing
// concern (when do I get paid).
// ─────────────────────────────────────────────────────────────────────────────
const OLIVER_NAV: SubNavConfig = {
  productName: "OLIVER",
  tagline: "Field Service & Job Lifecycle",
  groups: [
    {
      label: "",
      items: [{ key: "oliver_dashboard", label: "Dashboard", route: "/app/services/oliver_dashboard" }],
    },
    {
      label: "Customers", icon: UserCircle, collapsible: true, sectionId: "oliver_customers",
      items: [
        { key: "oliver_contacts", label: "Contacts", route: "/app/services/oliver_contacts" },
        { key: "oliver_service_requests", label: "Service Requests", route: "/app/services/oliver_service_requests" },
        { key: "oliver_booking", label: "Booking", route: "/app/services/oliver_booking" },
      ],
    },
    {
      // Single Jobs page with the 5-bucket board (Quotes, Scheduled, In Progress,
      // Job Completed, Job Closed) + tag/substatus filters + Recurring filter.
      // Schedule/Dispatch/Projects/Quotes-as-page absorbed into this board's
      // filters + the unified job modal (Phase 2). Archive lives as a
      // sub-page reached via a link from the board.
      label: "Jobs", icon: Wrench, collapsible: true, sectionId: "oliver_jobs",
      items: [
        { key: "oliver_job_board", label: "Job Board", route: "/app/services/oliver_job_board" },
        { key: "oliver_schedule", label: "Schedule", route: "/app/services/oliver_schedule" },
        { key: "oliver_jobs_archive", label: "Archive", route: "/app/services/oliver_jobs_archive" },
      ],
    },
    {
      label: "Products & Services", icon: Briefcase, collapsible: true, sectionId: "oliver_products",
      items: [
        { key: "oliver_catalog", label: "Products & Services", route: "/app/services/oliver_catalog" },
        { key: "oliver_categories", label: "Categories", route: "/app/services/oliver_categories" },
        // F-74 — separate taxonomy for crew skills (Plumbing, Electrical, etc.).
        // Distinct from product categories; drives auto-assign + customer
        // worker preferences.
        { key: "oliver_service_categories", label: "Service Categories", route: "/app/services/oliver_service_categories" },
        { key: "oliver_coupons", label: "Coupons", route: "/app/services/oliver_coupons" },
      ],
    },
    {
      // Billing — money in + the templates you use to bill (invoice, quote,
      // proposal). F-93: oliver_templates was previously in Settings; it's
      // a feature (library you create/edit/use), so it belongs in main nav.
      // Placed in Billing because the templates ARE billing artefacts.
      label: "Billing", icon: CreditCard, collapsible: true, sectionId: "oliver_billing",
      items: [
        { key: "oliver_quotes", label: "Quotes & Proposals", route: "/app/services/oliver_quotes" },
        // #77 — Proposal Templates. Sits directly under Quotes & Proposals
        // because it's the templates library for that surface.
        { key: "oliver_proposal_templates", label: "Templates", route: "/app/oliver/quotes/templates" },
        { key: "oliver_invoices", label: "Invoices", route: "/app/services/oliver_invoices" },
        { key: "oliver_recurring", label: "Subscriptions", route: "/app/services/oliver_recurring" },
        { key: "oliver_payments", label: "Payments", route: "/app/services/oliver_payments" },
        { key: "oliver_templates", label: "Templates", route: "/app/services/oliver_templates" },
      ],
    },
    {
      label: "Team", icon: Users, collapsible: true, sectionId: "oliver_team",
      items: [
        { key: "oliver_workers", label: "Workers", route: "/app/services/oliver_workers" },
        // F-44 (2026-05-26) — Time Tracking removed from nav per founder lock
        // "no time tracking until payroll later". Page + route still reachable
        // by URL for legacy data; not surfaced in OLIVER nav.
        { key: "oliver_crew_performance", label: "Performance", route: "/app/services/oliver_crew_performance", gated: true },
      ],
    },
    {
      // F-43 (2026-05-26) — Workflow & Automations nav group. Page exists at
      // /app/services/oliver_automations but was missing from SubNav.
      label: "Workflow & Automations", icon: Zap, collapsible: true, sectionId: "oliver_workflow",
      items: [
        { key: "oliver_automations", label: "Automations", route: "/app/services/oliver_automations" },
        { key: "oliver_addons", label: "Add-ons", route: "/app/services/oliver_addons" },
        // F-114 — Portals hub replaces the standalone Portals & Domains page;
        // the old page stays reachable by URL but no longer surfaces in nav.
        { key: "oliver_portals_hub", label: "Customer & Crew Portals", route: "/app/services/oliver_portals_hub" },
        // F-70 + F-72 + F-63 — reschedule policy, post-booking actions, signup form
        { key: "oliver_workflow_settings", label: "Workflow Settings", route: "/app/services/oliver_workflow_settings" },
      ],
    },
    // F-116 — Expenses removed from OLIVER nav; rebuilds in STELLA. The
    // routes/page/backend table stay in place (deprecated) so deep links
    // don't 500 if anyone hits them.
    {
      label: "IA Insights", icon: Sparkles, collapsible: true, sectionId: "oliver_ia_insights",
      items: [
        { key: "oliver_ia_insights_health", label: "Health", route: "/app/services/oliver_ia_insights_health" },
        { key: "oliver_ia_insights_trends", label: "Trends", route: "/app/services/oliver_ia_insights_trends", tag: { label: "OLIVER", color: "#FEC82C" } },
        { key: "oliver_ia_insights_intelligence", label: "Intelligence", route: "/app/services/oliver_ia_insights_intelligence", tag: { label: "OLIVER", color: "#FEC82C" } },
      ],
    },
    {
      label: "Reports", icon: BarChart2, collapsible: true, sectionId: "oliver_reporting",
      items: [
        { key: "oliver_reports", label: "Reports", route: "/app/services/oliver_reports" },
        { key: "oliver_activity_log", label: "Activity Log", route: "/app/services/oliver_activity_log" },
      ],
    },
  ],
};

const ARION_NAV: SubNavConfig = {
  productName: "ARION",
  tagline: "Web & Digital Presence",
  groups: [
    {
      label: "",
      items: [
        // F-87-arion: "Get Started" removed from nav (matches SPARK/OLIVER pattern).
        // Onboarding now lives as a dashboard banner + modal on the ARION home
        // command center. A permanent "Get Started" nav entry was clutter once
        // onboarding completed.
        { key: "arion_dashboard", label: "Dashboard", route: "/app/services/arion_dashboard" },
      ],
    },
    {
      label: "Website", icon: Monitor, collapsible: true, sectionId: "website",
      items: [
        { key: "arion_website_overview", label: "Overview", route: "/app/services/arion_website_overview" },
        { key: "arion_website_content", label: "Content", route: "/app/services/arion_website_content" },
        { key: "arion_website_ai_builder", label: "AI Builder", route: "/app/services/arion_website_ai_builder", tag: { label: "IL", color: "#38BDF8" } },
        { key: "arion_website_content_seo_overview", label: "Content SEO", route: "/app/services/arion_website_content_seo_overview" },
        { key: "arion_website_staging", label: "Staging", route: "/app/services/arion_website_staging" },
      ],
    },
    {
      label: "Hosting", icon: Server, collapsible: true, sectionId: "hosting",
      items: [
        { key: "arion_hosting_overview", label: "Overview", route: "/app/services/arion_hosting_overview" },
        { key: "arion_hosting_domain_dns", label: "Domain & DNS", route: "/app/services/arion_hosting_domain_dns" },
        { key: "arion_hosting_backups", label: "Backups", route: "/app/services/arion_hosting_backups" },
      ],
    },
    {
      label: "Security & Performance", icon: ShieldCheck, collapsible: true, sectionId: "security",
      items: [
        { key: "arion_website_security_overview", label: "Security: Overview", route: "/app/services/arion_website_security_overview" },
        { key: "arion_website_security_vulnerabilities", label: "Security: Vulnerabilities", route: "/app/services/arion_website_security_vulnerabilities" },
        { key: "arion_website_performance_cache", label: "Core Web Vitals", route: "/app/services/arion_website_performance_cache" },
        { key: "arion_website_performance_images", label: "Media", route: "/app/services/arion_website_performance_images" },
        { key: "arion_website_updates", label: "Plugins", route: "/app/services/arion_website_updates" },
      ],
    },
    {
      // v5.x — renamed from "Analytics & Intelligence" to "Search Engine Analytics"
      // to clarify the section is external data (GA4 / GSC / GBP / Bing), not
      // platform analytics. IA Insights is now its own top-level section below.
      label: "Search Engine Analytics", icon: BarChart2, collapsible: true, sectionId: "analytics",
      items: [
        { key: "arion_analytics_overview", label: "Overview", route: "/app/services/arion_analytics_overview" },
        { key: "arion_analytics_traffic", label: "Traffic", route: "/app/services/arion_analytics_traffic" },
        { key: "arion_analytics_audience", label: "Audience", route: "/app/services/arion_analytics_audience" },
        { key: "arion_analytics_content", label: "Content", route: "/app/services/arion_analytics_content" },
        { key: "arion_analytics_conversions", label: "Conversions", route: "/app/services/arion_analytics_conversions" },
      ],
    },
    {
      label: "IA Insights", icon: Sparkles, collapsible: true, sectionId: "ia_insights",
      items: [
        { key: "arion_ia_insights_health", label: "Health", route: "/app/services/arion_ia_insights_health" },
        { key: "arion_ia_insights_trends", label: "Trends", route: "/app/services/arion_ia_insights_trends", tag: { label: "ARION", color: "#38BDF8" } },
        { key: "arion_ia_insights_intelligence", label: "Intelligence", route: "/app/services/arion_ia_insights_intelligence", tag: { label: "ARION", color: "#38BDF8" } },
        { key: "arion_service_area", label: "Service Area Config", route: "/app/services/arion_service_area" },
      ],
    },
    {
      label: "SEO", icon: TrendingUp, collapsible: true, sectionId: "seo",
      items: [
        { key: "arion_seo_overview", label: "Overview", route: "/app/services/arion_seo_overview" },
        { key: "arion_seo_keywords", label: "Keywords", route: "/app/services/arion_seo_keywords" },
        { key: "arion_seo_rankings", label: "Rankings", route: "/app/services/arion_seo_rankings" },
        { key: "arion_seo_site_audit", label: "Site Audit", route: "/app/services/arion_seo_site_audit" },
        { key: "arion_seo_competitors", label: "Competitors", route: "/app/services/arion_seo_competitors" },
        { key: "arion_seo_ai_search", label: "AI Search Results", route: "/app/services/arion_seo_ai_search" },
        { key: "arion_seo_ai_prompts", label: "AI Prompts", route: "/app/services/arion_seo_ai_prompts" },
        { key: "arion_seo_market_monitor", label: "Market Monitor", route: "/app/services/arion_seo_market_monitor" },
      ],
    },
    {
      label: "Search", icon: SearchIcon, collapsible: true, sectionId: "search", landingRoute: "/app/services/arion_search_performance",
      items: [
        { key: "arion_search_performance", label: "Search Performance", route: "/app/services/arion_search_performance" },
        { key: "arion_search_indexing", label: "Indexing", route: "/app/services/arion_search_indexing" },
        { key: "arion_search_bing_copilot", label: "Bing: Copilot AI", route: "/app/services/arion_search_bing_copilot" },
      ],
    },
    {
      // Business Profile gated 2026-06-28 — entire section behind Coming Soon
      // pending Google Workspace migration + GBP auto-provision rework
      // (see SCOPE_WORKING.md F-Onb-D3). All items show the lock icon; routes
      // still render the underlying pages with a ComingSoonBanner at top.
      label: "Business Profile", icon: MapPin, collapsible: true, sectionId: "business",
      items: [
        { key: "arion_business_overview", label: "Overview", route: "/app/services/arion_business_overview", gated: true },
        { key: "arion_business_locations", label: "Locations", route: "/app/services/arion_business_locations", gated: true },
        { key: "arion_business_reviews", label: "Reviews", route: "/app/services/arion_business_reviews", gated: true },
        { key: "arion_business_insights", label: "Insights", route: "/app/services/arion_business_insights", gated: true },
        { key: "arion_business_posts", label: "Posts", route: "/app/services/arion_business_posts", gated: true },
        { key: "arion_business_services", label: "Services", route: "/app/services/arion_business_services", gated: true },
        { key: "arion_business_bing_overview", label: "Bing Places", route: "/app/services/arion_business_bing_overview", gated: true },
        { key: "arion_business_apple_overview", label: "Apple Maps", route: "/app/services/arion_business_apple_overview", gated: true },
      ],
    },
    {
      label: "", icon: Star,
      items: [
        { key: "arion_brand", label: "My Brand", route: "/app/services/arion_brand" },
        { key: "arion_plugin_provisioning", label: "Plugin Provisioning", route: "/app/services/arion_plugin_provisioning" },
        { key: "arion_usage", label: "Plan & Pricing", route: "/app/services/arion_usage" },
      ],
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// SPARK navigation — F-84 re-alignment 2026-05-28 (mirrors OLIVER pattern).
//
// What changed vs v7.1:
//   - Admin section removed from main nav entirely. API Keys, Webhooks,
//     Secrets, Audit Log, Config Backup, Custom Fields, Calendar Sync,
//     and Approvals now live under the gear (SparkSettingsPage hub).
//   - Bottom standalone strip removed. Real-Time Activity + Usage moved
//     into Reporting. Plan & Pricing + API Reference + Engine Docs +
//     Smoke Test moved into the Settings hub (Ops & admin group).
//   - Service Category moved out of IA Insights into Settings (it's a
//     tenant config that drives benchmark selection, not a report).
//   - Sender Domains + Tracking + Audience Sync + Quiet Hours + Saved
//     Searches surfaced in Settings (not in main nav).
//
// SHAPE after refactor:
//   - 8 main-nav sections (down from 11) + Get Started/Overview at top
//   - Settings reached via the gear in the IconRail → SparkSettingsPage hub
//   - Lean main nav covers the daily-work surfaces only
// ─────────────────────────────────────────────────────────────────────────────
const SPARK_NAV: SubNavConfig = {
  productName: "SPARK",
  tagline: "Growth Platform",
  groups: [
    {
      // F-87 — "Get Started" removed from nav. Onboarding now lives as a
      // dashboard banner (SparkSetupCard on SparkOverviewPage) that opens
      // SparkOnboardingWizard as a modal. A permanent "Get Started" nav
      // item told returning users "you're a beginner here forever" — the
      // banner self-hides when the required steps are complete.
      label: "",
      items: [
        { key: "spark_overview", label: "Dashboard", route: "/app/services/spark_overview" },
      ],
    },
    {
      label: "CRM", icon: Users, collapsible: true, sectionId: "spark_crm",
      items: [
        { key: "spark_contacts", label: "Contacts", route: "/app/services/spark_contacts" },
        { key: "spark_contact_import", label: "Import (CSV)", route: "/app/services/spark_contact_import" },
        { key: "spark_accounts", label: "Companies", route: "/app/services/spark_accounts" },
        { key: "spark_lists", label: "Lists", route: "/app/services/spark_lists" },
        { key: "spark_segments", label: "Segments", route: "/app/services/spark_segments" },
        { key: "spark_tags", label: "Tags", route: "/app/services/spark_tags" },
        { key: "spark_contact_360", label: "Contact 360°", route: "/app/services/spark_contact_360", intelligence: true },
        { key: "spark_health_score", label: "Health Score", route: "/app/services/spark_health_score", intelligence: true },
      ],
    },
    {
      // Outreach = the act of sending a message. Active work. Anything
      // that runs on a schedule or by trigger is in Workflow & Automations.
      // Templates lives here (a feature with a library, not a setting) —
      // single entry covering Email + SMS + Translations via tabs inside.
      label: "Outreach", icon: Megaphone, collapsible: true, sectionId: "spark_outreach",
      items: [
        { key: "spark_campaigns", label: "Campaigns", route: "/app/services/spark_campaigns" },
        // F-91 + 2026-05-28 — Templates moved DOWN to Workflow & Automations
        // per founder decision. Library is configuration-like, used BY
        // campaigns rather than alongside them. Keeping reference here so
        // the move is documented.
        { key: "spark_newsletter", label: "Newsletter Studio", route: "/app/services/spark_newsletter" },
        { key: "spark_social", label: "Social & Calendar", route: "/app/services/spark_social" },
        { key: "spark_sms_inbox", label: "SMS Inbox", route: "/app/services/spark_sms_inbox" },
        { key: "spark_deliverability", label: "Deliverability", route: "/app/services/spark_deliverability" },
      ],
    },
    {
      label: "Capture", icon: Target, collapsible: true, sectionId: "spark_capture",
      items: [
        { key: "spark_forms", label: "Forms", route: "/app/services/spark_forms" },
        { key: "spark_form_builder", label: "Form Builder", route: "/app/services/spark_form_builder" },
        { key: "spark_landing_pages", label: "Landing Pages", route: "/app/services/spark_landing_pages" },
        { key: "spark_qr_codes", label: "QR Codes", route: "/app/services/spark_qr_codes" },
      ],
    },
    {
      // F-89 — Workflow & Automations group, recognition-mirror of OLIVER's
      // same-named group. The mental model is "set it and forget it" — things
      // SPARK runs on its own, without you sending the message.
      //
      // Two sub-flavors live here:
      //   - Multi-step processes: Automations, Journeys, A/B Tests, Approvals,
      //     Workflow Triggers (the event sources that fire automations).
      //   - Always-on rules: Scoring, Routing, Auto-Tag, Anomaly Alerts
      //     (data-driven notifications).
      //
      // Lead Suppression + Lead Territories moved out of this group on
      // 2026-06-25 — they were absorbed into the unified Lead Inbox page
      // (Sales group) as tabs alongside the inbox itself.
      //
      // Keeping them in one group rather than two avoids the user having to
      // decide which sub-bucket their thing lives in — they all share the
      // mental model "configurable behavior that fires automatically".
      label: "Workflow & Automations", icon: Zap, collapsible: true, sectionId: "spark_workflow",
      items: [
        // Phase 3A merger (2026-06-16) — Automations + Rules + Workflow
        // Triggers consolidated into ONE list page. The page exposes a
        // segmented filter for "All / Automations / Rules" and a single
        // "New workflow" button that opens the unified chooser modal.
        { key: "spark_workflows_automations", label: "Workflows & Automations", route: "/app/services/spark_workflows_automations" },
        // F-CS.6 — admin for the lumen.spark_task rows that `task_call`
        // steps reference. Sits next to Workflows & Automations because
        // tasks ARE workflow building blocks — same mental model, same
        // group home.
        { key: "spark_tasks", label: "Tasks", route: "/app/services/spark_tasks" },
        { key: "spark_journey_builder", label: "Journeys", route: "/app/services/spark_journey_builder" },
        { key: "spark_ab_tests", label: "A/B Tests", route: "/app/services/spark_ab_tests" },
        { key: "spark_approvals", label: "Approvals", route: "/app/services/spark_approvals" },
        { key: "spark_anomaly_alerts", label: "Anomaly Alerts", route: "/app/services/spark_anomaly_alerts" },
        // Templates moved here from Outreach (2026-05-28 founder decision).
        // It's a library used by other features — configuration-like, not
        // an active send surface.
        { key: "spark_templates", label: "Templates", route: "/app/services/spark_templates" },
        // Phase 3A (2026-06-16) — Webhooks pulled from nav until our own
        // implementation ships in SPARK v1.5 (page shows Coming Soon banner).
        { key: "spark_audience_sync", label: "Audience Sync", route: "/app/services/spark_audience_sync" },
        // Lead Suppression + Lead Territories used to live here as separate
        // entries; both were absorbed into the unified Lead Inbox page
        // (Sales group) as tabs on 2026-06-25.
      ],
    },
    {
      // Sales = active human work on leads/deals. Sales rules (scoring,
      // routing) moved up to Workflow & Automations. Lead suppression +
      // territories now live as tabs inside the Lead Inbox page below.
      label: "Sales", icon: Briefcase, collapsible: true, sectionId: "spark_sales",
      items: [
        // Unified Lead Inbox page (2026-06-25) — single entry that points at
        // /app/services/spark_lead_inbox; the page itself hosts three tabs
        // (Lead Inbox, Suppressed Domains, Territories). Legacy routes
        // /spark_leads, /spark_lead_suppression, /spark_lead_territories
        // still resolve and pre-select the correct tab.
        { key: "spark_lead_inbox", label: "Lead Inbox", route: "/app/services/spark_lead_inbox" },
        { key: "spark_pipelines", label: "Pipelines", route: "/app/services/spark_pipelines" },
        { key: "spark_deals", label: "Deals", route: "/app/services/spark_deals" },
        { key: "spark_attribution", label: "Attribution", route: "/app/services/spark_attribution" },
      ],
    },
    {
      label: "Customer Success", icon: Heart, collapsible: true, sectionId: "spark_customer_success",
      items: [
        { key: "spark_nps", label: "NPS", route: "/app/services/spark_nps" },
        { key: "spark_nps_schedules", label: "NPS Schedules", route: "/app/services/spark_nps_schedules" },
        { key: "spark_reviews", label: "Reputation Hub", route: "/app/services/spark_reviews" },
        { key: "spark_referrals", label: "Referrals", route: "/app/services/spark_referrals" },
      ],
    },
    {
      // IA Insights — pure analytics. Service Category moved to Settings.
      label: "IA Insights", icon: Sparkles, collapsible: true, sectionId: "spark_ia_insights",
      items: [
        { key: "spark_ia_insights_health", label: "Health", route: "/app/services/spark_ia_insights_health" },
        { key: "spark_ia_insights_trends", label: "Trends", route: "/app/services/spark_ia_insights_trends", tag: { label: "SPARK", color: "#EF6C33" } },
        { key: "spark_ia_insights_intelligence", label: "Intelligence", route: "/app/services/spark_ia_insights_intelligence", tag: { label: "SPARK", color: "#EF6C33" } },
        { key: "spark_stella", label: "STELLA Send Intelligence", route: "/app/services/spark_stella", tag: { label: "STELLA", color: "#EF6C33" } },
      ],
    },
    {
      label: "AI Tools", icon: Sparkles, collapsible: true, sectionId: "spark_intelligence",
      items: [
        // D-12 (2026-05-28): AI Writer dropped from nav. It's a 121-LOC
        // "coming with v2" placeholder, no API calls, all static copy.
        // Surfacing it as a nav item misleads users into thinking it
        // works. Page route remains so deep-links don't 404 and the
        // marketing/coming-soon preview is still reachable.
        { key: "spark_intelligence", label: "Contact Scoring", route: "/app/services/spark_intelligence" },
        { key: "spark_activity_stream", label: "Activity Stream", route: "/app/services/spark_activity_stream" },
      ],
    },
    {
      // Reporting absorbed the formerly-standalone Real-Time Activity + Usage.
      // Plan & Pricing left to Settings (it's a tenant admin concern, not a report).
      label: "Reporting", icon: BarChart2, collapsible: true, sectionId: "spark_reporting",
      items: [
        { key: "spark_dashboards", label: "Dashboards", route: "/app/services/spark_dashboards" },
        { key: "spark_analytics_reports", label: "Analytics Reports", route: "/app/services/spark_analytics_reports" },
        { key: "spark_scheduled_reports", label: "Scheduled Reports", route: "/app/services/spark_scheduled_reports" },
        { key: "spark_realtime_metrics", label: "Real-Time Activity", route: "/app/services/spark_realtime_metrics" },
        { key: "spark_usage_report", label: "Usage", route: "/app/services/spark_usage_report" },
        // F-93 — Audit Log moved here from Settings. It's a viewer feature
        // (you READ the log), not a configuration toggle.
        { key: "spark_audit_log", label: "Audit Log", route: "/app/services/spark_audit_log" },
      ],
    },
  ],
};

// CONSULTING_NAV — F1.1 + F1.7 + F1.10
//   - F1.1: "Requests Board" → "Service Requests"
//   - F1.10: Calendar & Events removed (timeline rendered inside Project Workspace)
//   - F1.9: "Onboard Client" is filtered out for non-founders by
//           applyConsultingNavFilter (AppShell.tsx)
const CONSULTING_NAV: SubNavConfig = {
  productName: "Consulting",
  tagline: "IA Work & Deliverables",
  groups: [
    {
      label: "",
      items: [
        // 2026-06-29 — Founder-only surfaces relocated to /app/admin/consulting/*.
        // Overview / Deliverables remain client-readable at the legacy
        // /app/services/consulting_* paths. applyConsultingNavFilter in
        // AppShell continues to drop founder-only items for non-founders;
        // the URL move means founders + clients no longer share a nav row.
        { key: "consulting_overview",          label: "Overview",          route: "/app/services/consulting_overview" },
        { key: "consulting_tickets",           label: "Service Requests",  route: "/app/admin/consulting/requests" },
        { key: "consulting_projects",          label: "Projects",          route: "/app/admin/consulting/projects" },
        { key: "consulting_deliverables",      label: "Deliverables",      route: "/app/services/consulting_deliverables" },
        { key: "consulting_documents",         label: "Document Library",  route: "/app/admin/consulting/document-library" },
        { key: "consulting_workspace",         label: "Clients",           route: "/app/admin/consulting/clients" },
        // Onboard Client wizard reachable at /app/admin/consulting/onboard-client
        // but intentionally NOT in the SubNav — launched from the Projects page
        // / Clients picker. Kept routable for deep links + email CTAs.
      ],
    },
  ],
};

const PLACEHOLDER_NAV = (name: string, tagline: string): SubNavConfig => ({
  productName: name,
  tagline,
  groups: [
    {
      label: "",
      items: [{ key: `${name.toLowerCase()}_coming`, label: "Coming Soon", route: `/app/services/${name.toLowerCase()}_coming` }],
    },
  ],
});

// STELLA — Ledger + Unit Economics 4-nav shell (August build). Two live layers
// (Ledger, Unit Economics) + two locked/coming-soon layers (Database Manager,
// Custom Reporting) that render a padlock + tier badge. Supersedes the parked
// 0.1.0 MLP (Overview P&L + Expenses over oliver.expense).
// STELLA Indigo #4C5BD4 drives the tier/lock badges.
const STELLA_TAG = "#4C5BD4";
const STELLA_NAV: SubNavConfig = {
  productName: "STELLA",
  tagline: "Ledger & Unit Economics",
  groups: [
    {
      // 2026-07-30 consolidation — founder capped every sub-nav at 8 items.
      // 18 → 6: Income/Recurring are Transactions tabs, Receipts is a modal
      // hint on Transactions, Mileage + Materials merged (two tabs), the
      // seven reports collapsed into ONE Reports page (P&L live, rest P2),
      // and Bank Connections + Period Close moved to the SETTINGS hub.
      label: "Ledger", icon: CreditCard, collapsible: true, sectionId: "stella_ledger",
      items: [
        { key: "stella_ledger_inbox", label: "Inbox", route: "/app/services/stella_ledger_inbox" },
        { key: "stella_ledger_transactions", label: "Transactions", route: "/app/services/stella_ledger_transactions" },
        { key: "stella_ledger_vendors", label: "Vendors & Customers", route: "/app/services/stella_ledger_vendors" },
        { key: "stella_ledger_coa", label: "Chart of Accounts", route: "/app/services/stella_ledger_coa" },
        { key: "stella_ledger_mileage_materials", label: "Mileage & Materials", route: "/app/services/stella_ledger_mileage_materials" },
        { key: "stella_ledger_reports", label: "Reports", route: "/app/services/stella_ledger_reports" },
      ],
    },
    {
      label: "Unit Economics", icon: LineChart, collapsible: true, sectionId: "stella_ue",
      items: [
        { key: "stella_ue_margins", label: "Margins", route: "/app/services/stella_ue_margins" },
        { key: "stella_ue_allocations", label: "Allocations", route: "/app/services/stella_ue_allocations" },
        { key: "stella_ue_reconciliation", label: "Reconciliation", route: "/app/services/stella_ue_reconciliation" },
      ],
    },
    {
      // Layer 3a — LOCKED. Every item shows a padlock + Standard tier badge and
      // opens the STELLA coming-soon sheet (StellaComingSoonPage).
      label: "Database Manager", icon: Server, collapsible: true, sectionId: "stella_db",
      items: [
        { key: "stella_db_registry", label: "View Registry", route: "/app/services/stella_db_registry", gated: true, tag: { label: "S", color: STELLA_TAG } },
        { key: "stella_db_entry", label: "Manual Entry", route: "/app/services/stella_db_entry", gated: true, tag: { label: "S", color: STELLA_TAG } },
        // Import History folded into the Upload surface (batch list + rollback
        // live on the same page per master §5.3) — keeps this group at the 8 cap.
        { key: "stella_db_upload", label: "Uploads & Import History", route: "/app/services/stella_db_upload", gated: true, tag: { label: "S", color: STELLA_TAG } },
        { key: "stella_db_tags", label: "Tags", route: "/app/services/stella_db_tags", gated: true, tag: { label: "S", color: STELLA_TAG } },
        { key: "stella_db_custom_fields", label: "Custom Fields", route: "/app/services/stella_db_custom_fields", gated: true, tag: { label: "S", color: STELLA_TAG } },
        { key: "stella_db_documents", label: "Documents", route: "/app/services/stella_db_documents", gated: true, tag: { label: "S", color: STELLA_TAG } },
        { key: "stella_db_compliance", label: "Compliance Reminders", route: "/app/services/stella_db_compliance", gated: true, tag: { label: "S", color: STELLA_TAG } },
        { key: "stella_db_warnings", label: "Data Engineer Warnings", route: "/app/services/stella_db_warnings", gated: true, tag: { label: "S", color: STELLA_TAG } },
      ],
    },
    {
      // Layer 3b — LOCKED.
      label: "Custom Reporting", icon: BarChart2, collapsible: true, sectionId: "stella_report",
      items: [
        { key: "stella_report_library", label: "Report Library", route: "/app/services/stella_report_library", gated: true, tag: { label: "S", color: STELLA_TAG } },
        { key: "stella_report_builder", label: "Report Builder", route: "/app/services/stella_report_builder", gated: true, tag: { label: "S", color: STELLA_TAG } },
        { key: "stella_report_dashboards", label: "Dashboards", route: "/app/services/stella_report_dashboards", gated: true, tag: { label: "S", color: STELLA_TAG } },
        { key: "stella_report_scheduled", label: "Scheduled Reports", route: "/app/services/stella_report_scheduled", gated: true, tag: { label: "S", color: STELLA_TAG } },
        { key: "stella_report_sql", label: "SQL Editor", route: "/app/services/stella_report_sql", gated: true, tag: { label: "Pro", color: STELLA_TAG } },
        { key: "stella_report_exports", label: "Exports", route: "/app/services/stella_report_exports", gated: true, tag: { label: "S", color: STELLA_TAG } },
      ],
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// F-86 + F-93 — Settings as its own IconRail destination.
//
// F-93 TAXONOMY (locked 2026-05-28):
//
//   FEATURE = distinct piece of functionality. Library of items. Users
//             *create*, *edit*, *use*. Example: Templates, Webhooks, Campaigns.
//             → Lives in MAIN NAV, with modal-driven CRUD.
//
//   SETTING = customization option. Toggle / on-off / single value /
//             pure config. Example: Quiet Hours, Custom Fields schema,
//             Service Category. → Lives in this Settings SubNav.
//
//   GLOBAL  = set once across the whole platform. → Lives in the
//             hamburger ☰ (Business Profile, Plan & Pricing, Team Members).
//
// Earlier I dumped ~22 SPARK items here without distinguishing. Founder
// called it: Templates and Webhooks are features (with libraries), not
// settings. Business Profile + Plan & Pricing are GLOBAL — already in
// the hamburger, never in here. This rewrite applies the taxonomy
// strictly.
// ─────────────────────────────────────────────────────────────────────────────
const SETTINGS_NAV: SubNavConfig = {
  productName: "Settings",
  tagline: "Per-product configuration",
  groups: [
    {
      label: "ARION", icon: Monitor, collapsible: true, sectionId: "settings_arion",
      items: [
        // Brand = brand colors/logos config (setting).
        // Service Area = single-value config (setting).
        // REMOVED: arion_plugin_provisioning (feature → main nav).
        // REMOVED: arion_usage Plan & Pricing (global → hamburger).
        { key: "arion_brand", label: "Brand", route: "/app/services/arion_brand" },
        { key: "arion_service_area", label: "Service Area", route: "/app/services/arion_service_area" },
      ],
    },
    {
      label: "OLIVER", icon: Wrench, collapsible: true, sectionId: "settings_oliver",
      items: [
        // Business Setup = foundational config + Stripe connect (mixed
        // but mostly setup — kept as setting).
        // Workflow Settings = toggles for reschedule/no-show policy (setting).
        // Service Categories = taxonomy config for worker skills (setting).
        // Team Access = role assignment config (borderline; kept here for
        // now — moving it out would force a separate Team Management page
        // that doesn't justify its own main-nav slot).
        // REMOVED: oliver_booking (feature, in main nav)
        // REMOVED: oliver_portal_domains (feature, in main nav W&A)
        // REMOVED: oliver_coupons (feature, in main nav Products & Services)
        // REMOVED: oliver_categories (feature, in main nav Products & Services)
        // REMOVED: oliver_templates (feature → moved to main nav Billing)
        // REMOVED: oliver_addons (feature, in main nav W&A)
        { key: "oliver_settings", label: "Business Setup", route: "/app/services/oliver_settings" },
        { key: "oliver_workflow_settings", label: "Workflow Settings", route: "/app/services/oliver_workflow_settings" },
        { key: "oliver_service_categories", label: "Service Categories", route: "/app/services/oliver_service_categories" },
        { key: "oliver_team_access", label: "Team Access", route: "/app/services/oliver_team_access" },
      ],
    },
    {
      label: "SPARK", icon: Megaphone, collapsible: true, sectionId: "settings_spark",
      items: [
        // True settings only — every item is a toggle / single-value config
        // / setup config. Features moved to main nav (Templates → Outreach,
        // Webhooks + Audience Sync → Workflow & Automations, Review Widget
        // → Customer Success, Audit Log → Reports). Business Profile +
        // Plan & Pricing are global, live in hamburger.
        // SPARK Composer v1.1 (2026-06-24) — sender setup is now a 2-card
        // pick (IA default vs white-label) and Senders + Signatures are
        // separate CRUD pages alongside Sender Domains.
        { key: "spark_sender_domains", label: "Sender Setup", route: "/app/services/spark_sender_domains" },
        { key: "spark_senders", label: "Senders", route: "/app/services/spark_senders" },
        { key: "spark_signatures", label: "Signatures", route: "/app/services/spark_signatures" },
        { key: "spark_api_keys", label: "API Keys", route: "/app/services/spark_api_keys" },
        { key: "spark_secrets", label: "Tenant Secrets", route: "/app/services/spark_secrets" },
        { key: "spark_custom_fields", label: "Custom Fields", route: "/app/services/spark_custom_fields" },
        { key: "spark_quiet_hours", label: "Quiet Hours", route: "/app/services/spark_quiet_hours" },
        { key: "spark_tracking", label: "Tracking Pixels", route: "/app/services/spark_tracking" },
        { key: "spark_calendar_sync", label: "Calendar Sync", route: "/app/services/spark_calendar_sync" },
        { key: "spark_service_category", label: "Service Category", route: "/app/services/spark_service_category" },
        { key: "spark_config_backup", label: "Config Backup", route: "/app/services/spark_config_backup" },
      ],
    },
    {
      label: "STELLA", icon: BarChart2, collapsible: true, sectionId: "settings_stella",
      items: [
        // 2026-07-30 — founder's call: Bank Connections + Period Close are
        // configuration, not daily-work nav. They moved here from the STELLA
        // Ledger group (keys renamed stella_ledger_* → stella_settings_* so
        // SETTINGS_KEYS/deriveProduct routes them to Settings mode WITHOUT
        // hijacking the STELLA SubNav — the stella_settings_coming trap).
        { key: "stella_settings_bank", label: "Bank Connections", route: "/app/services/stella_settings_bank" },
        { key: "stella_settings_period_close", label: "Period Close", route: "/app/services/stella_settings_period_close" },
      ],
    },
    {
      label: "FORGE", icon: Server, collapsible: true, sectionId: "settings_forge",
      items: [
        { key: "forge_coming", label: "Coming Soon", route: "/app/services/forge_coming" },
      ],
    },
    {
      label: "ARGUS", icon: Sparkles, collapsible: true, sectionId: "settings_argus",
      items: [
        { key: "argus_coming", label: "Coming Soon", route: "/app/services/argus_coming" },
      ],
    },
  ],
};

// Set of every key that lives under Settings — used by AppShell.deriveProduct
// to recognise a settings-mode URL even though the URL prefix is still the
// product code (oliver_settings, spark_account_profile, etc.).
export const SETTINGS_KEYS = new Set<string>(
  SETTINGS_NAV.groups.flatMap((g) => g.items.map((i) => i.key)),
);

// v9.3 — ARGUS subnav mirrors per-platform IA Insights pattern (2026-06-22).
// Brandon's call: ARGUS Insights should look identical in structure to
// ARION/SPARK/OLIVER → IA Insights. Three items:
//
//   - Health  (no tag — matches per-platform Health)
//   - Trends  (ARGUS tag — matches per-platform Trends w/ platform tag)
//   - Intelligence  (ARGUS tag — the live multi-platform 6-report page,
//                    routed via the canonical `argus_cross_platform` key;
//                    legacy `argus_cross_channel` remains a back-compat alias.)
//
// "Platform Diagnostics" (argus_intelligence, the ARGUS-internal coming-soon
// connectivity/automation-ROI set) dropped from the visible nav — folds into
// Intelligence per spec rename. The page route still resolves by URL for
// any deep links, but no nav entry surfaces it.
const ARGUS_NAV: SubNavConfig = {
  productName: "ARGUS",
  tagline: "Multi-platform Intelligence",
  groups: [
    {
      label: "Workflow & Automations", icon: Zap, collapsible: false, sectionId: "argus_workflow",
      items: [
        { key: "argus_workflows",      label: "Workflow & Automations", route: "/app/services/argus_workflows", tag: { label: "ARGUS", color: "#84CC16" } },
      ],
    },
    {
      label: "IA Insights", icon: Sparkles, collapsible: true, sectionId: "argus_ia_insights",
      items: [
        { key: "argus_health",        label: "Health",        route: "/app/services/argus_health" },
        { key: "argus_trends",        label: "Trends",        route: "/app/services/argus_trends",        tag: { label: "ARGUS", color: "#84CC16" } },
        { key: "argus_cross_platform", label: "Cross-Platform Intelligence",  route: "/app/services/argus_cross_platform", tag: { label: "ARGUS", color: "#84CC16" } },
      ],
    },
  ],
};

// 2026-06-22 — MY_BRAND_NAV REMOVED. My Brand was a premature Wave-2 add
// for the Q4 2026 deferred product; the top-level slot has been pulled from
// IconRail and SubNav. Sub-pages still exist under /pages/myBrand/* and
// the routes remain unregistered in ServiceRouter (kept on disk for the
// eventual Q4 build, but unreachable from nav).
// The legitimate ARION-internal "My Brand" entry (route /app/services/arion_brand)
// stays in ARION_NAV and ARION Settings — see arion_brand entries below.

export const SUB_NAV_CONFIGS: Record<ProductKey, SubNavConfig | null> = {
  overview: null, // overview uses the flat Overview page, no sub-nav
  arion: ARION_NAV,
  oliver: OLIVER_NAV,
  spark: SPARK_NAV,
  consulting: CONSULTING_NAV,
  stella: STELLA_NAV,
  forge: PLACEHOLDER_NAV("FORGE", "Integrations"),
  argus: ARGUS_NAV,
  settings: SETTINGS_NAV,
};

// ── Component ────────────────────────────────────────────────

interface SubNavProps {
  config: SubNavConfig;
}

// Determine which section should auto-expand based on current path.
// Each entry maps a path predicate to a sectionId (which must match a group's sectionId).
function getDefaultSection(path: string): string | null {
  // F-93 — Settings auto-expand. ONLY the routes that are CURRENTLY in
  // Settings should expand a settings group. Routes that moved OUT to
  // main nav (Templates, Webhooks, Audience Sync, Audit Log, Review Widget,
  // Coupons, Categories, Booking, etc.) are intentionally excluded —
  // they expand their main-nav group instead.
  if (path.includes("/oliver_settings") || path.includes("/oliver_workflow_settings") || path.includes("/oliver_service_categories") || path.includes("/oliver_team_access")) return "settings_oliver";
  if (path.includes("/arion_brand") || path.includes("/arion_service_area")) return "settings_arion";
  if (
    path.includes("/spark_sender_domains") ||
    path.includes("/spark_senders") ||
    path.includes("/spark_signatures") ||
    path.includes("/spark_api_keys") ||
    path.includes("/spark_secrets") ||
    path.includes("/spark_custom_fields") ||
    path.includes("/spark_quiet_hours") ||
    path.includes("/spark_tracking") ||
    path.includes("/spark_calendar_sync") ||
    path.includes("/spark_service_category") ||
    path.includes("/spark_config_backup")
  ) return "settings_spark";
  if (path.includes("/stella_settings_bank") || path.includes("/stella_settings_period_close")) return "settings_stella";

  // STELLA sections (Ledger / Unit Economics / Database Manager / Custom Reporting)
  if (path.includes("/stella_ledger_")) return "stella_ledger";
  if (path.includes("/stella_ue_")) return "stella_ue";
  if (path.includes("/stella_db_")) return "stella_db";
  if (path.includes("/stella_report_")) return "stella_report";

  // ARION sections
  if (path.includes("arion_website_security") || path.includes("arion_website_performance") || path.includes("arion_website_updates")) return "security";
  if (path.includes("arion_website_")) return "website";
  if (path.includes("arion_hosting_")) return "hosting";
  if (path.includes("arion_analytics_")) return "analytics";
  if (path.includes("arion_seo_")) return "seo";
  if (path.includes("arion_search_")) return "search";
  if (path.includes("arion_business_")) return "business";
  // SPARK sections — F-84 refactored auto-expand. Admin items now live in
  // the Settings hub (not in main nav); their auto-expand entries are
  // removed because hitting one of those routes opens the page directly
  // (e.g. /spark_audit_log) without needing a main-nav group to expand.
  if (path.includes("/spark_contacts") || path.includes("/spark_contact_") || path.includes("/spark_accounts") || path.includes("/spark_lists") || path.includes("/spark_tags") || path.includes("/spark_segments") || path.includes("/spark_health_score")) return "spark_crm";
  // F-93 — Email Templates / SMS Templates / Translations all live under
  // the SPARK_NAV "Templates" entry (Outreach group) now. They collapse
  // into a single feature with channel tabs.
  if (path.includes("/spark_campaigns") || path.includes("/spark_templates") || path.includes("/spark_email_templates") || path.includes("/spark_sms_templates") || path.includes("/spark_template_i18n") || path.includes("/spark_newsletter") || path.includes("/spark_social") || path.includes("/spark_sms_inbox") || path.includes("/spark_deliverability")) return "spark_outreach";
  // F-89 + F-93 — Workflow & Automations contains everything that fires on
  // its own. Webhooks + Audience Sync moved here from Settings.
  // F-93 + rules consolidation (2026-05-28): spark_rules replaces the 3
  // separate scoring/routing/autotag entries but old deep-links still
  // expand the right group.
  if (path.includes("/spark_workflows_automations") || path.includes("/spark_tasks") || path.includes("/spark_automations") || path.includes("/spark_journey_") || path.includes("/spark_ab_tests") || path.includes("/spark_approvals") || path.includes("/spark_workflow_triggers") || path.includes("/spark_anomaly_alerts") || path.includes("/spark_webhooks") || path.includes("/spark_inbound_webhooks") || path.includes("/spark_webhook_deliveries") || path.includes("/spark_audience_sync") || path.includes("/spark_rules") || path.includes("/spark_scoring_rules") || path.includes("/spark_routing_rules") || path.includes("/spark_autotag_rules") || path.includes("/spark_lead_suppression") || path.includes("/spark_lead_territories")) return "spark_workflow";
  if (path.includes("/spark_forms") || path.includes("/spark_form_") || path.includes("/spark_landing_pages") || path.includes("/spark_qr_codes")) return "spark_capture";
  if (path.includes("/spark_leads") || path.includes("/spark_pipelines") || path.includes("/spark_deals") || path.includes("/spark_attribution")) return "spark_sales";
  if (path.includes("/spark_nps") || path.includes("/spark_reviews") || path.includes("/spark_review_") || path.includes("/spark_referrals")) return "spark_customer_success";
  if (path.includes("/spark_ai_writer") || path.includes("/spark_intelligence") || path.includes("/spark_activity_stream")) return "spark_intelligence";
  if (path.includes("/spark_ia_insights_") || path.includes("/spark_stella")) return "spark_ia_insights";
  // F-93 — Audit Log moved from Settings → Reporting.
  if (path.includes("/spark_dashboards") || path.includes("/spark_analytics_reports") || path.includes("/spark_scheduled_reports") || path.includes("/spark_realtime_metrics") || path.includes("/spark_usage_report") || path.includes("/spark_audit_log")) return "spark_reporting";
  // OLIVER sections (simplified nav 2026-05-25 — see OLIVER_NAV comment)
  //   - Removed entries for retired nav items (Projects, Schedule, Dispatch,
  //     Quotes-page, Billing Overview, Template Library, Operations *, Comms)
  //     so the auto-expand picks the correct collapsed section when a deep
  //     link is opened. Their underlying routes still load (legacy pages
  //     reachable via /app/services/<key>) but new nav doesn't expose them.
  if (path.includes("/oliver_job_board") || path.includes("/oliver_schedule") || path.includes("/oliver_jobs_archive")) return "oliver_jobs";
  if (path.includes("/oliver_workers") || path.includes("/oliver_crew_performance") || path.includes("/oliver_time_tracking")) return "oliver_team";
  if (path.includes("/oliver_contacts") || path.includes("/oliver_service_requests") || path.includes("/oliver_booking")) return "oliver_customers";
  if (path.includes("/oliver_catalog") || path.includes("/oliver_categories") || path.includes("/oliver_service_categories") || path.includes("/oliver_coupons")) return "oliver_products";
  if (path.includes("/oliver_expenses") || path.includes("/oliver_job_costing")) return "oliver_expenses";
  // F-93 — oliver_templates moved from Settings → Billing main nav.
  if (path.includes("/oliver_quotes") || path.includes("/oliver_invoices") || path.includes("/oliver_payments") || path.includes("/oliver_recurring") || path.includes("/oliver_disputes") || path.includes("/oliver_reminders") || path.includes("/oliver_templates") || path.includes("/oliver/quotes/templates")) return "oliver_billing";
  // F-114 — Portals hub + legacy Portal Designer / Portals & Domains all live in the W&A group.
  if (path.includes("/oliver_portals_hub") || path.includes("/oliver_portal_designer") || path.includes("/oliver_portal_domains") || path.includes("/oliver_automations") || path.includes("/oliver_addons") || path.includes("/oliver_workflow_settings")) return "oliver_workflow";
  if (path.includes("/oliver_ia_insights")) return "oliver_ia_insights";
  // ARGUS — single IA Insights group; expand it on any ARGUS Insights route.
  if (path.includes("/argus_health") || path.includes("/argus_trends") || path.includes("/argus_cross_platform") || path.includes("/argus_cross_channel") || path.includes("/argus_intelligence") || path.includes("/argus_ia_insights")) return "argus_ia_insights";
  if (path.includes("/oliver_reports") || path.includes("/oliver_activity_log")) return "oliver_reporting";
  // MY BRAND sections REMOVED 2026-06-22 — top-level slot pulled from
  // IconRail/SubNav (Q4 2026 deferred product). ARION's internal arion_brand
  // is handled by the settings_arion auto-expand above.
  return null;
}

export function SubNav({ config }: SubNavProps) {
  const location = useLocation();
  const navigate = useNavigate();
  // Single-section-expanded mode for products that opt in via sectionId on groups.
  // ARION, SPARK, OLIVER all have sectionIds; STELLA/FORGE/ARGUS placeholders don't.
  const hasSectionIds = config.groups.some(g => !!g.sectionId);

  // Single active section at a time (for any product with sectionIds)
  const [activeSection, setActiveSection] = useState<string | null>(() => {
    if (!hasSectionIds) return null;
    return getDefaultSection(location.pathname);
  });

  // Legacy expanded set for non-ARION products
  const [expanded, setExpanded] = useState<Set<number>>(() => {
    const initial = new Set<number>();
    config.groups.forEach((group, gi) => {
      if (group.collapsible && group.items.some(item => location.pathname.startsWith(item.route))) {
        initial.add(gi);
      }
    });
    return initial;
  });

  /**
   * Section-header click handler (global landing pattern).
   *
   * Rules:
   *   - If we are NOT already on this section's landing route, navigate there
   *     AND expand the section. This is the new "click section → Overview + expand" pattern.
   *   - If we ARE already on the landing route, treat the click as a toggle
   *     (collapse it, or re-expand).
   */
  const toggleSection = (sectionId: string, landingRoute?: string) => {
    if (landingRoute && location.pathname !== landingRoute) {
      setActiveSection(sectionId);
      navigate(landingRoute);
      return;
    }
    setActiveSection(prev => prev === sectionId ? null : sectionId);
  };

  const toggleGroup = (gi: number, landingRoute?: string) => {
    if (landingRoute && location.pathname !== landingRoute) {
      navigate(landingRoute);
      setExpanded(prev => new Set([gi]));
      return;
    }
    setExpanded(prev => {
      if (prev.has(gi)) { const n = new Set(prev); n.delete(gi); return n; }
      return new Set([gi]);
    });
  };

  return (
    <div className="flex w-52 flex-col bg-[#0B1C24]">
      {/* Product header */}
      <div className="px-4 pb-3 pt-4">
        <h2 className="text-sm font-bold text-white">{config.productName}</h2>
        <p className="text-[10px] text-[#A8CDD8]">{config.tagline}</p>
      </div>

      {/* Scrollable nav groups */}
      <nav className="flex-1 overflow-y-auto px-2 py-2">
        {config.groups.map((group, gi) => {
          const sid = group.sectionId;
          const isExpanded = hasSectionIds && sid
            ? activeSection === sid
            : !group.collapsible || expanded.has(gi);
          const hasActiveItem = group.items.some(item => location.pathname.startsWith(item.route));
          const Icon = group.icon;

          return (
            <div
              key={gi}
              className={gi > 0 ? "mt-1" : ""}
              // #256 2026-07-04: expose sectionId so the derived-tour runner's
              // group-intro step can spotlight the entire nav group.
              data-subnav-group={sid || group.label || undefined}
            >
              {/* Section header — collapsible with icon, or standalone link.
                  Clicking routes to the section's landing page (usually Overview) AND expands. */}
              {group.label && group.collapsible ? (
                <button
                  type="button"
                  onClick={() => {
                    const landingRoute = group.landingRoute ?? group.items[0]?.route;
                    if (sid) toggleSection(sid, landingRoute);
                    else toggleGroup(gi, landingRoute);
                  }}
                  className={`mb-0.5 flex w-full items-center justify-between rounded px-2 py-1.5 text-[12px] font-semibold transition-colors ${
                    hasActiveItem || isExpanded ? "text-white" : "text-[#A8CDD8]/70 hover:text-[#A8CDD8]"
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    {Icon && <Icon className="h-3.5 w-3.5 flex-shrink-0" />}
                    {group.label}
                  </span>
                  <ChevronDown className={`h-3 w-3 flex-shrink-0 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                </button>
              ) : group.label ? (
                <div className="mb-1 px-2 text-[9.5px] italic text-[#A8CDD8]/45">{group.label}</div>
              ) : null}

              {/* Sub-items — visible when section is expanded */}
              {isExpanded && (
                <ul className="space-y-0.5">
                  {group.items.map((item, itemIdx) => (
                    <li key={item.key}>
                      <NavLink
                        to={item.route}
                        className={({ isActive }) =>
                          `flex items-center gap-2 rounded px-2 py-1.5 text-[13px] transition-colors ${
                            isActive
                              ? "bg-white/10 font-medium text-white"
                              : "text-[#D5E8F0]/80 hover:bg-white/5 hover:text-white"
                          }`
                        }
                      >
                        <span className="h-1 w-1 flex-shrink-0 rounded-full bg-current opacity-50" />
                        <span className="truncate">{item.label}</span>
                        {item.tag && (
                          <span
                            style={{
                              background: `${item.tag.color}22`,
                              color: item.tag.color,
                              fontSize: 9,
                              fontWeight: 700,
                              letterSpacing: '0.04em',
                              padding: '1px 5px',
                              borderRadius: 99,
                              flexShrink: 0,
                              marginLeft: 'auto',
                            }}
                          >
                            {item.tag.label}
                          </span>
                        )}
                        {item.gated && (
                          <svg className="ml-auto h-3 w-3 flex-shrink-0 text-[#A8CDD8]/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                          </svg>
                        )}
                      </NavLink>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </nav>

      {/* Settings gear removed from ARION sub-nav — moved to global icon rail */}
    </div>
  );
}
