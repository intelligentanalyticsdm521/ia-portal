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
  crossChannel?: boolean; // (legacy) — no longer changes the label color; harmless if set.
  /**
   * v7.4 — Optional platform/brand tag rendered to the right of the label.
   * The label text always uses the standard sidebar color; only the tag
   * pill carries the brand color. Use this for ARION/SPARK/OLIVER trend +
   * intelligence items, ARGUS Cross-Channel links, STELLA, etc.
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
      // Billing — money in. Quotes & Recurring/Templates handled in the Job flow.
      label: "Billing", icon: CreditCard, collapsible: true, sectionId: "oliver_billing",
      items: [
        { key: "oliver_invoices", label: "Invoices", route: "/app/services/oliver_invoices" },
        { key: "oliver_recurring", label: "Subscriptions", route: "/app/services/oliver_recurring" },
        { key: "oliver_payments", label: "Payments", route: "/app/services/oliver_payments" },
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
        { key: "oliver_portal_domains", label: "Portals & Domains", route: "/app/services/oliver_portal_domains" },
        // F-70 + F-72 + F-63 — reschedule policy, post-booking actions, signup form
        { key: "oliver_workflow_settings", label: "Workflow Settings", route: "/app/services/oliver_workflow_settings" },
      ],
    },
    {
      label: "Expenses", icon: TrendingUp, collapsible: true, sectionId: "oliver_expenses",
      items: [
        { key: "oliver_expenses", label: "Expenses", route: "/app/services/oliver_expenses" },
      ],
    },
    {
      label: "IA Insights", icon: Sparkles, collapsible: true, sectionId: "oliver_ia_insights",
      items: [
        { key: "oliver_ia_insights_health", label: "Health", route: "/app/services/oliver_ia_insights_health" },
        { key: "oliver_ia_insights_trends", label: "Trends", route: "/app/services/oliver_ia_insights_trends", tag: { label: "OLIVER", color: "#FEC82C" } },
        { key: "oliver_ia_insights_intelligence", label: "Intelligence", route: "/app/services/oliver_ia_insights_intelligence", tag: { label: "OLIVER", color: "#FEC82C" } },
        { key: "argus_cross_channel", label: "Cross-Channel", route: "/app/services/argus_cross_channel", tag: { label: "ARGUS", color: "#84CC16" } },
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
        { key: "arion_onboarding", label: "Get Started", route: "/app/services/arion_onboarding" },
        { key: "arion_dashboard", label: "Dashboard", route: "/app/services/arion_dashboard" },
      ],
    },
    {
      label: "Website", icon: Monitor, collapsible: true, sectionId: "website",
      items: [
        { key: "arion_website_overview", label: "Overview", route: "/app/services/arion_website_overview" },
        { key: "arion_website_content", label: "Content", route: "/app/services/arion_website_content" },
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
        { key: "argus_cross_channel", label: "Cross-Channel", route: "/app/services/argus_cross_channel", tag: { label: "ARGUS", color: "#84CC16" } },
        { key: "arion_service_area", label: "Service Area Config", route: "/app/services/arion_service_area" },
      ],
    },
    {
      label: "SEO", icon: TrendingUp, collapsible: true, sectionId: "seo",
      items: [
        { key: "arion_seo_overview", label: "Overview", route: "/app/services/arion_seo_overview" },
        { key: "arion_seo_rankings", label: "Rankings", route: "/app/services/arion_seo_rankings" },
        { key: "arion_seo_site_audit", label: "Site Audit", route: "/app/services/arion_seo_site_audit" },
        { key: "arion_seo_competitors", label: "Competitors", route: "/app/services/arion_seo_competitors" },
        { key: "arion_seo_ai_search", label: "AI Search Results", route: "/app/services/arion_seo_ai_search" },
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
      label: "Business Profile", icon: MapPin, collapsible: true, sectionId: "business",
      items: [
        { key: "arion_business_overview", label: "Overview", route: "/app/services/arion_business_overview" },
        { key: "arion_business_reviews", label: "Reviews", route: "/app/services/arion_business_reviews" },
        { key: "arion_business_insights", label: "Insights", route: "/app/services/arion_business_insights" },
        { key: "arion_business_posts", label: "Posts", route: "/app/services/arion_business_posts", gated: true },
        { key: "arion_business_services", label: "Services", route: "/app/services/arion_business_services", gated: true },
        { key: "arion_business_bing_overview", label: "Bing Places", route: "/app/services/arion_business_bing_overview" },
        { key: "arion_business_apple_overview", label: "Apple Maps", route: "/app/services/arion_business_apple_overview" },
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
      label: "",
      items: [
        { key: "spark_onboarding", label: "Get Started", route: "/app/services/spark_onboarding" },
        { key: "spark_overview", label: "Overview", route: "/app/services/spark_overview" },
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
      label: "Outreach", icon: Megaphone, collapsible: true, sectionId: "spark_outreach",
      items: [
        { key: "spark_campaigns", label: "Campaigns", route: "/app/services/spark_campaigns" },
        { key: "spark_email_templates", label: "Templates", route: "/app/services/spark_email_templates" },
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
      //   - Always-on rules: Scoring, Routing, Auto-Tag, Lead Suppression,
      //     Lead Territories, Anomaly Alerts (data-driven notifications).
      //
      // Keeping them in one group rather than two avoids the user having to
      // decide which sub-bucket their thing lives in — they all share the
      // mental model "configurable behavior that fires automatically".
      label: "Workflow & Automations", icon: Zap, collapsible: true, sectionId: "spark_workflow",
      items: [
        { key: "spark_automations", label: "Automations", route: "/app/services/spark_automations" },
        { key: "spark_journey_builder", label: "Journeys", route: "/app/services/spark_journey_builder" },
        { key: "spark_ab_tests", label: "A/B Tests", route: "/app/services/spark_ab_tests" },
        { key: "spark_approvals", label: "Approvals", route: "/app/services/spark_approvals" },
        { key: "spark_workflow_triggers", label: "Workflow Triggers", route: "/app/services/spark_workflow_triggers" },
        { key: "spark_anomaly_alerts", label: "Anomaly Alerts", route: "/app/services/spark_anomaly_alerts" },
        { key: "spark_scoring_rules", label: "Scoring Rules", route: "/app/services/spark_scoring_rules" },
        { key: "spark_routing_rules", label: "Routing Rules", route: "/app/services/spark_routing_rules" },
        { key: "spark_autotag_rules", label: "Auto-Tag Rules", route: "/app/services/spark_autotag_rules" },
        { key: "spark_lead_suppression", label: "Lead Suppression", route: "/app/services/spark_lead_suppression" },
        { key: "spark_lead_territories", label: "Lead Territories", route: "/app/services/spark_lead_territories" },
      ],
    },
    {
      // Sales = active human work on leads/deals. Sales rules (scoring,
      // routing, suppression, territories) moved up to Workflow & Automations.
      label: "Sales", icon: Briefcase, collapsible: true, sectionId: "spark_sales",
      items: [
        { key: "spark_leads", label: "Lead Inbox", route: "/app/services/spark_leads" },
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
        { key: "spark_review_widget", label: "Review Widget", route: "/app/services/spark_review_widget" },
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
        { key: "argus_cross_channel", label: "Cross-Channel", route: "/app/services/argus_cross_channel", tag: { label: "ARGUS", color: "#84CC16" } },
      ],
    },
    {
      label: "AI Tools", icon: Sparkles, collapsible: true, sectionId: "spark_intelligence",
      items: [
        { key: "spark_ai_writer", label: "AI Writer", route: "/app/services/spark_ai_writer" },
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
      ],
    },
  ],
};

const CONSULTING_NAV: SubNavConfig = {
  productName: "Consulting",
  tagline: "IA Work & Deliverables",
  groups: [
    {
      label: "",
      items: [
        { key: "consulting_overview", label: "Overview", route: "/app/services/consulting_overview" },
      ],
    },
    {
      label: "Build Your Brand",
      items: [
        { key: "consulting_brand_tasks", label: "Tasks", route: "/app/services/consulting_brand_tasks" },
        { key: "consulting_brand_deliverables", label: "Deliverables", route: "/app/services/consulting_brand_deliverables" },
      ],
    },
    {
      label: "Build Your Foundation",
      items: [
        { key: "consulting_foundation_tasks", label: "Tasks", route: "/app/services/consulting_foundation_tasks" },
        { key: "consulting_foundation_deliverables", label: "Deliverables", route: "/app/services/consulting_foundation_deliverables" },
      ],
    },
    {
      label: "Build Your Clarity",
      items: [
        { key: "consulting_clarity_tasks", label: "Tasks", route: "/app/services/consulting_clarity_tasks" },
        { key: "consulting_clarity_deliverables", label: "Deliverables", route: "/app/services/consulting_clarity_deliverables" },
      ],
    },
    {
      label: "Build Your Engine",
      items: [
        { key: "consulting_engine_tasks", label: "Tasks", route: "/app/services/consulting_engine_tasks" },
        { key: "consulting_engine_deliverables", label: "Deliverables", route: "/app/services/consulting_engine_deliverables" },
      ],
    },
    {
      label: "",
      items: [
        { key: "consulting_calendar", label: "Calendar & Events", route: "/app/services/consulting_calendar" },
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

// ─────────────────────────────────────────────────────────────────────────────
// F-86 — Settings as its own IconRail destination.
//
// The gear in the IconRail no longer routes to a per-product settings PAGE;
// it activates this Settings SubNav. The SubNav has one collapsible group per
// product, each containing that product's configuration pages. Result:
// "where do I configure X" has one answer no matter which product you're in,
// matching the OLIVER pattern (settings is a separate concern from daily work).
//
// The hamburger ☰ at the top right is STILL strictly cross-product (My
// Account, Business Settings, Platform) — it doesn't touch per-product
// settings any more.
// ─────────────────────────────────────────────────────────────────────────────
const SETTINGS_NAV: SubNavConfig = {
  productName: "Settings",
  tagline: "Per-product configuration",
  groups: [
    {
      label: "ARION", icon: Monitor, collapsible: true, sectionId: "settings_arion",
      items: [
        { key: "arion_brand", label: "Brand", route: "/app/services/arion_brand" },
        { key: "arion_plugin_provisioning", label: "Plugin Provisioning", route: "/app/services/arion_plugin_provisioning" },
        { key: "arion_service_area", label: "Service Area", route: "/app/services/arion_service_area" },
        { key: "arion_usage", label: "Plan & Pricing", route: "/app/services/arion_usage" },
      ],
    },
    {
      label: "OLIVER", icon: Wrench, collapsible: true, sectionId: "settings_oliver",
      items: [
        { key: "oliver_settings", label: "Business Setup", route: "/app/services/oliver_settings" },
        { key: "oliver_workflow_settings", label: "Workflow Settings", route: "/app/services/oliver_workflow_settings" },
        { key: "oliver_booking", label: "Booking Pages", route: "/app/services/oliver_booking" },
        { key: "oliver_portal_domains", label: "Portals & Domains", route: "/app/services/oliver_portal_domains" },
        { key: "oliver_service_categories", label: "Service Categories", route: "/app/services/oliver_service_categories" },
        { key: "oliver_team_access", label: "Team Access", route: "/app/services/oliver_team_access" },
        { key: "oliver_coupons", label: "Coupons", route: "/app/services/oliver_coupons" },
        { key: "oliver_categories", label: "Categories", route: "/app/services/oliver_categories" },
        { key: "oliver_templates", label: "Templates", route: "/app/services/oliver_templates" },
        { key: "oliver_addons", label: "Add-ons", route: "/app/services/oliver_addons" },
      ],
    },
    {
      label: "SPARK", icon: Megaphone, collapsible: true, sectionId: "settings_spark",
      items: [
        { key: "spark_account_profile", label: "Business Profile", route: "/app/services/spark_account_profile" },
        { key: "spark_sender_domains", label: "Sender Domains", route: "/app/services/spark_sender_domains" },
        { key: "spark_email_templates", label: "Email Templates", route: "/app/services/spark_email_templates" },
        { key: "spark_sms_templates", label: "SMS Templates", route: "/app/services/spark_sms_templates" },
        { key: "spark_template_i18n", label: "Translations", route: "/app/services/spark_template_i18n" },
        { key: "spark_api_keys", label: "API Keys", route: "/app/services/spark_api_keys" },
        { key: "spark_webhooks", label: "Outbound Webhooks", route: "/app/services/spark_webhooks" },
        { key: "spark_inbound_webhooks", label: "Inbound Webhooks", route: "/app/services/spark_inbound_webhooks" },
        { key: "spark_webhook_deliveries", label: "Webhook Deliveries", route: "/app/services/spark_webhook_deliveries" },
        { key: "spark_secrets", label: "Tenant Secrets", route: "/app/services/spark_secrets" },
        { key: "spark_custom_fields", label: "Custom Fields", route: "/app/services/spark_custom_fields" },
        { key: "spark_quiet_hours", label: "Quiet Hours", route: "/app/services/spark_quiet_hours" },
        { key: "spark_tracking", label: "Tracking Pixels", route: "/app/services/spark_tracking" },
        { key: "spark_audience_sync", label: "Audience Sync", route: "/app/services/spark_audience_sync" },
        { key: "spark_calendar_sync", label: "Calendar Sync", route: "/app/services/spark_calendar_sync" },
        { key: "spark_service_category", label: "Service Category", route: "/app/services/spark_service_category" },
        { key: "spark_review_widget", label: "Review Widget", route: "/app/services/spark_review_widget" },
        { key: "spark_usage", label: "Plan & Pricing", route: "/app/services/spark_usage" },
        { key: "spark_audit_log", label: "Audit Log", route: "/app/services/spark_audit_log" },
        { key: "spark_config_backup", label: "Config Backup", route: "/app/services/spark_config_backup" },
        { key: "spark_api_reference", label: "API Reference", route: "/app/services/spark_api_reference" },
        { key: "spark_engine_docs", label: "Engine Docs", route: "/app/services/spark_engine_docs" },
      ],
    },
    {
      label: "STELLA", icon: BarChart2, collapsible: true, sectionId: "settings_stella",
      items: [
        { key: "stella_coming", label: "Coming Soon", route: "/app/services/stella_coming" },
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

// v9.2 — ARGUS as full product per spec §2 (uniform nav). Single IA Insights
// group with the 4 spec sub-items: Health → Trends → Intelligence →
// Cross-Channel. Matches the uniform pattern used by ARION/SPARK/OLIVER.
const ARGUS_NAV: SubNavConfig = {
  productName: "ARGUS",
  tagline: "Cross-Channel Intelligence",
  groups: [
    {
      label: "IA Insights", icon: Sparkles, collapsible: true, sectionId: "argus_ia_insights",
      items: [
        { key: "argus_health",        label: "Health",        route: "/app/services/argus_health" },
        { key: "argus_trends",        label: "Trends",        route: "/app/services/argus_trends" },
        { key: "argus_intelligence",  label: "Intelligence",  route: "/app/services/argus_intelligence", tag: { label: "ARGUS", color: "#84CC16" } },
        { key: "argus_cross_channel", label: "Cross-Channel", route: "/app/services/argus_cross_channel", tag: { label: "ARGUS", color: "#84CC16" } },
      ],
    },
  ],
};

export const SUB_NAV_CONFIGS: Record<ProductKey, SubNavConfig | null> = {
  overview: null, // overview uses the flat Overview page, no sub-nav
  arion: ARION_NAV,
  oliver: OLIVER_NAV,
  spark: SPARK_NAV,
  consulting: CONSULTING_NAV,
  stella: PLACEHOLDER_NAV("STELLA", "Reporting & BI"),
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
  // Settings — collapse all but the active product's settings group
  if (path.includes("/oliver_settings") || path.includes("/oliver_workflow_settings") || path.includes("/oliver_booking") || path.includes("/oliver_portal_domains") || path.includes("/oliver_service_categories") || path.includes("/oliver_team_access") || path.includes("/oliver_coupons") || path.includes("/oliver_categories") || path.includes("/oliver_templates") || path.includes("/oliver_addons")) return "settings_oliver";
  if (path.includes("/arion_brand") || path.includes("/arion_plugin_provisioning") || path.includes("/arion_service_area") || path.includes("/arion_usage")) return "settings_arion";
  if (path.includes("/spark_account_profile") || path.includes("/spark_sender_domains") || path.includes("/spark_email_templates") || path.includes("/spark_sms_templates") || path.includes("/spark_template_i18n") || path.includes("/spark_api_keys") || path.includes("/spark_webhooks") || path.includes("/spark_inbound_webhooks") || path.includes("/spark_webhook_deliveries") || path.includes("/spark_secrets") || path.includes("/spark_custom_fields") || path.includes("/spark_quiet_hours") || path.includes("/spark_tracking") || path.includes("/spark_audience_sync") || path.includes("/spark_calendar_sync") || path.includes("/spark_service_category") || path.includes("/spark_review_widget") || path.includes("/spark_usage") || path.includes("/spark_audit_log") || path.includes("/spark_config_backup") || path.includes("/spark_api_reference") || path.includes("/spark_engine_docs")) return "settings_spark";

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
  if (path.includes("/spark_campaigns") || path.includes("/spark_email_templates") || path.includes("/spark_newsletter") || path.includes("/spark_social") || path.includes("/spark_sms_inbox") || path.includes("/spark_deliverability")) return "spark_outreach";
  // F-89 — Workflow & Automations contains everything that fires on its
  // own (multi-step automations + always-on rules). Auto-expands for ANY
  // of those routes.
  if (path.includes("/spark_automations") || path.includes("/spark_journey_") || path.includes("/spark_ab_tests") || path.includes("/spark_approvals") || path.includes("/spark_workflow_triggers") || path.includes("/spark_anomaly_alerts") || path.includes("/spark_scoring_rules") || path.includes("/spark_routing_rules") || path.includes("/spark_autotag_rules") || path.includes("/spark_lead_suppression") || path.includes("/spark_lead_territories")) return "spark_workflow";
  if (path.includes("/spark_forms") || path.includes("/spark_form_") || path.includes("/spark_landing_pages") || path.includes("/spark_qr_codes")) return "spark_capture";
  if (path.includes("/spark_leads") || path.includes("/spark_pipelines") || path.includes("/spark_deals") || path.includes("/spark_attribution")) return "spark_sales";
  if (path.includes("/spark_nps") || path.includes("/spark_reviews") || path.includes("/spark_review_") || path.includes("/spark_referrals")) return "spark_customer_success";
  if (path.includes("/spark_ai_writer") || path.includes("/spark_intelligence") || path.includes("/spark_activity_stream")) return "spark_intelligence";
  if (path.includes("/spark_ia_insights_") || path.includes("/spark_stella")) return "spark_ia_insights";
  if (path.includes("/spark_dashboards") || path.includes("/spark_analytics_reports") || path.includes("/spark_scheduled_reports") || path.includes("/spark_realtime_metrics") || path.includes("/spark_usage_report")) return "spark_reporting";
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
  if (path.includes("/oliver_invoices") || path.includes("/oliver_payments") || path.includes("/oliver_recurring") || path.includes("/oliver_disputes") || path.includes("/oliver_reminders")) return "oliver_billing";
  if (path.includes("/oliver_ia_insights") || path.includes("/argus_cross_channel")) return "oliver_ia_insights";
  if (path.includes("/oliver_reports") || path.includes("/oliver_activity_log")) return "oliver_reporting";
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
            <div key={gi} className={gi > 0 ? "mt-1" : ""}>
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
