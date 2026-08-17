import { useEffect, useState, type ComponentType } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  Monitor, Server, ShieldCheck, BarChart2, TrendingUp,
  Search as SearchIcon, MapPin, Star, ChevronDown, Settings,
  Users, Megaphone, Briefcase, Heart, Target, Sparkles,
  Wrench, UserCircle, CreditCard, MessageSquare, LineChart, Zap, Palette, Lock,
} from "lucide-react";
import type { ProductKey } from "./IconRail";
import {
  activeAddons,
  isGatedProduct,
  isVisible,
  type VisibilityRules,
} from "./navVisibility";
import { useProductTier } from "../hooks/useProductTier";
import { useAppState } from "../app/AppState";
import { FEATURE_GATING_ENABLED } from "../config/featureFlags";

export interface SubNavItem extends VisibilityRules {
  key: string;
  label: string;
  route: string;
  /** Renders a padlock ICON only — see navVisibility.ts for actual gating. */
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
  /**
   * Set at render time (not authored in the nav config) when the tenant's plan
   * does NOT include this feature. The item still renders — with an "Upgrade"
   * pill — so customers can see what they're missing. Brandon 2026-08-06:
   * show, don't hide. Real enforcement is server-side (403).
   */
  locked?: boolean;
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
  tagline: "Operations",
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
      ],
    },
    // F-116 — Expenses removed from OLIVER nav; rebuilds in STELLA. The
    // routes/page/backend table stay in place (deprecated) so deep links
    // don't 500 if anyone hits them.
    // 2026-07-25 (Brandon): the "Reports" nav item removed — dead navigation,
    // the page never had a working backend ("Failed to fetch"). Reporting is
    // the IA Insights funnel now. Route/page stay so deep links don't 500.
    // 2026-07-26 (Brandon): the leftover "Activity" group dissolved too —
    // Activity Log is reachable from IA Insights → Reports (route unchanged).
    // Cosmetic pass 2026-07-22 (Brandon): IA Insights is ALWAYS the bottom
    // section of every platform nav.
    {
      label: "IA Insights", icon: Sparkles, collapsible: true, sectionId: "oliver_ia_insights",
      items: [
        { key: "oliver_ia_insights_health", label: "Health", route: "/app/services/oliver_ia_insights_health" },
        { key: "oliver_ia_insights_trends", label: "Trends", route: "/app/services/oliver_ia_insights_trends", tag: { label: "OLIVER", color: "#FEC82C" } },
        // IA Insights model (see SPARK block): Health/Trends/Reports every tier,
        // Intelligence = Pro. Brandon 2026-08-06.
        { key: "oliver_ia_insights_intelligence", label: "Intelligence", route: "/app/services/oliver_ia_insights_intelligence", tag: { label: "OLIVER", color: "#FEC82C" }, minTier: "pro" },
        { key: "oliver_ia_insights_reports", label: "Reports", route: "/app/services/oliver_ia_insights_reports" },
      ],
    },
  ],
};

const ARION_NAV: SubNavConfig = {
  productName: "ARION",
  tagline: "Digital Presence",
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
      // Business Profile un-gated 2026-07-22 — GBP Connect (client-owned
      // OAuth + create + verification) shipped and walked; the 2026-06-28
      // coming-soon locks predated the rework and are retired.
      label: "Business Profile", icon: MapPin, collapsible: true, sectionId: "business",
      items: [
        { key: "arion_business_overview", label: "Overview", route: "/app/services/arion_business_overview" },
        { key: "arion_business_locations", label: "Locations", route: "/app/services/arion_business_locations" },
        { key: "arion_business_reviews", label: "Reviews", route: "/app/services/arion_business_reviews" },
        { key: "arion_business_insights", label: "Performance", route: "/app/services/arion_business_insights" },
        { key: "arion_business_posts", label: "Posts", route: "/app/services/arion_business_posts" },
        { key: "arion_business_services", label: "Services", route: "/app/services/arion_business_services" },
        { key: "arion_business_bing_overview", label: "Bing Places", route: "/app/services/arion_business_bing_overview" },
        { key: "arion_business_apple_overview", label: "Apple Maps", route: "/app/services/arion_business_apple_overview" },
      ],
    },
    {
      // My Brand — ARION's brand-management section (re-cut 2026-07-21 per
      // Brandon's IA correction). FEATURES only: things a tenant does with
      // their brand. Voice profile + channel connections are SETTINGS
      // (Brand Identity / integrations surfaces); social analytics is a
      // REPORT (ARION IA Insights); the approval queue is the IA↔client
      // project workflow (Consulting domain) and is not in this nav.
      label: "My Brand", icon: Palette, collapsible: true, sectionId: "arion_my_brand",
      // No Overview page (Brandon 2026-07-21): the section lands directly on
      // Image Studio. Call-out surfaces (today's posts, new activity) belong
      // on the home / ARION dashboard calendars, not a My Brand page.
      // RE-CUT 2026-07-22 (MY_BRAND_RECUT doc, locked): Design Studio (was
      // Template Studio), Media Library (was Asset Library), Social Hub =
      // Composer + Calendar MERGED (canonical surface is the calendar page,
      // which hosts the composer modal; my_brand_compose route stays
      // registered as a redirect shim for old links). Social Content joins
      // this list when its page lands.
      landingRoute: "/app/services/my_brand_image_studio",
      items: [
        { key: "my_brand_image_studio", label: "Image Studio", route: "/app/services/my_brand_image_studio" },
        { key: "my_brand_templates", label: "Design Studio", route: "/app/services/my_brand_templates" },
        { key: "my_brand_assets", label: "Media Library", route: "/app/services/my_brand_assets" },
        { key: "my_brand_calendar", label: "Social Hub", route: "/app/services/my_brand_calendar" },
        // Re-cut item 5 (2026-07-22): Meta-Business-Suite-style content view —
        // per-post metrics + filters; "full report" page hangs off it (not nav).
        { key: "my_brand_social_content", label: "Social Content", route: "/app/services/my_brand_social_content" },
      ],
    },
    // REMOVED 2026-07-21 (Brandon, My Brand verification pass):
    //   * arion_usage "Plan & Pricing" — pricing lives ONLY in the global
    //     hub (hamburger > Plan & Pricing > /app/settings/plan-pricing);
    //     the arion_usage route stays registered for deep links from there.
    //   * arion_plugin_provisioning — it's a SETTING, not a daily-work
    //     feature; moved to Settings > ARION below.
    // Cosmetic pass 2026-07-22 (Brandon): IA Insights is ALWAYS the bottom
    // section of every platform nav; Service Area Config removed from it
    // (it's a setting — lives in Settings > ARION only).
    {
      label: "IA Insights", icon: Sparkles, collapsible: true, sectionId: "ia_insights",
      items: [
        { key: "arion_ia_insights_health", label: "Health", route: "/app/services/arion_ia_insights_health" },
        { key: "arion_ia_insights_trends", label: "Trends", route: "/app/services/arion_ia_insights_trends", tag: { label: "ARION", color: "#38BDF8" } },
        // IA Insights model (see SPARK block): Health/Trends/Reports every tier,
        // Intelligence = Pro. Brandon 2026-08-06.
        { key: "arion_ia_insights_intelligence", label: "Intelligence", route: "/app/services/arion_ia_insights_intelligence", tag: { label: "ARION", color: "#38BDF8" }, minTier: "pro" },
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
  tagline: "CRM",
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
        // MERGED into the Contacts import modal 2026-07-30 (phase 4). The modal
        // now does everything this page did (file picker) plus xlsx, so hiding
        // it removes a nav item without removing a capability.
        { key: "spark_contact_import", label: "Import (CSV)", route: "/app/services/spark_contact_import", merged: true },
        { key: "spark_accounts", label: "Companies", route: "/app/services/spark_accounts", merged: true /* merged: Companies is now a view on Contacts (List | Kanban | Companies) — same component, not a copy */ },
        { key: "spark_lists", label: "Lists", route: "/app/services/spark_lists" },
        { key: "spark_segments", label: "Segments", route: "/app/services/spark_segments", minTier: "pro" },
        { key: "spark_tags", label: "Tags", route: "/app/services/spark_tags", merged: true /* merged: apply/create tags inline on Contacts; 'Manage all tags' link opens the taxonomy */ },
        // MERGED into the contact record's Activity tab 2026-07-30 (phase 4).
        // Brandon: "Contact 360 - no clue what this is." Its only unique
        // content was email/SMS history + OLIVER jobs, which now render on the
        // record itself — one screen per person instead of two places to look.
        { key: "spark_contact_360", label: "Contact 360°", route: "/app/services/spark_contact_360", intelligence: true, merged: true, minTier: "business" /* BUSINESS (tier matrix 2026-08-06) */ },
        { key: "spark_health_score", label: "Health Score", route: "/app/services/spark_health_score", intelligence: true, merged: true, minTier: "business" /* BUSINESS (tier matrix 2026-08-06) — merged: linked from IA Insights -> Health (contact scoring) */ },
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
        { key: "spark_newsletter", label: "Newsletter Studio", route: "/app/services/spark_newsletter", minTier: "pro" },
        { key: "spark_social", label: "Social & Calendar", route: "/app/services/spark_social", hidden: true /* cut: moved to ARION -> My Brand */ },
        { key: "spark_sms_inbox", label: "SMS Inbox", route: "/app/services/spark_sms_inbox", minTier: "pro", hidden: true },
        { key: "spark_deliverability", label: "Deliverability", route: "/app/services/spark_deliverability", merged: true /* merged: status indicator on Settings -> Senders links to the full dashboard */ },
      ],
    },
    {
      label: "Capture", icon: Target, collapsible: true, sectionId: "spark_capture",
      items: [
        { key: "spark_forms", label: "Forms", route: "/app/services/spark_forms" },
        { key: "spark_form_builder", label: "Form Builder", route: "/app/services/spark_form_builder", merged: true /* merged: Forms opens the builder as a modal (F-104, 2026-05-28); this page is only a back-compat route for old deep links */ },
        { key: "spark_landing_pages", label: "Landing Pages", route: "/app/services/spark_landing_pages", minTier: "pro" /* PRO */},
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
        { key: "spark_workflows_automations", label: "Workflows & Automations", route: "/app/services/spark_workflows_automations", minTier: "pro" /* PRO (tier matrix 2026-08-06) — the ~4 prebuilt toggle-on automations */ },
        // F-CS.6 — admin for the lumen.spark_task rows that `task_call`
        // steps reference. Sits next to Workflows & Automations because
        // tasks ARE workflow building blocks — same mental model, same
        // group home.
        { key: "spark_tasks", label: "Tasks", route: "/app/services/spark_tasks", minTier: "pro" /* PRO: follow-up tasks are core CRM */},
        { key: "spark_journey_builder", label: "Journeys", route: "/app/services/spark_journey_builder", minTier: "business" /* BUSINESS (tier matrix 2026-08-06): multi-step branching journeys are the advanced-automation tier; Pro gets the prebuilt toggles */},
        { key: "spark_ab_tests", label: "A/B Tests", route: "/app/services/spark_ab_tests", minTier: "pro" /* PRO */},
        { key: "spark_approvals", label: "Approvals", route: "/app/services/spark_approvals", minTier: "business" /* BUSINESS: matters at 2+ marketers */},
        { key: "spark_anomaly_alerts", label: "Anomaly Alerts", route: "/app/services/spark_anomaly_alerts", minTier: "business" /* BUSINESS */},
        // Templates moved here from Outreach (2026-05-28 founder decision).
        // It's a library used by other features — configuration-like, not
        // an active send surface.
        { key: "spark_templates", label: "Templates", route: "/app/services/spark_templates", merged: true /* merged: reachable from Campaigns -> Templates. Already unified Email+SMS+Translations into one library (F-91) */ },
        // Phase 3A (2026-06-16) — Webhooks pulled from nav until our own
        // implementation ships in SPARK v1.5 (page shows Coming Soon banner).
        { key: "spark_audience_sync", label: "Audience Sync", route: "/app/services/spark_audience_sync", minTier: "business" /* BUSINESS: ad-platform audience push */},
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
        { key: "spark_lead_inbox", label: "Lead Inbox", route: "/app/services/spark_lead_inbox", addon: "leadgen" },
        { key: "spark_pipelines", label: "Pipelines", route: "/app/services/spark_pipelines", minTier: "pro" /* PRO: moved out of the Lead Gen add-on into the package */},
        { key: "spark_deals", label: "Deals", route: "/app/services/spark_deals", minTier: "pro" /* PRO: deals + pipelines are what ActiveCampaign gates too */},
        { key: "spark_attribution", label: "Attribution", route: "/app/services/spark_attribution", minTier: "business" /* BUSINESS (tier matrix 2026-08-06): multi-touch revenue attribution sits with the advanced reporting tier */},
      ],
    },
    {
      label: "Customer Success", icon: Heart, collapsible: true, sectionId: "spark_customer_success",
      items: [
        { key: "spark_nps", label: "NPS", route: "/app/services/spark_nps", minTier: "business" /* BUSINESS: customer-success suite */},
        { key: "spark_nps_schedules", label: "NPS Schedules", route: "/app/services/spark_nps_schedules", minTier: "business" /* BUSINESS: customer-success suite */},
        { key: "spark_reviews", label: "Reputation Hub", route: "/app/services/spark_reviews", hidden: true /* cut: reviews live in ARION My Business/GBP */ },
        { key: "spark_referrals", label: "Referrals", route: "/app/services/spark_referrals", minTier: "business" /* BUSINESS: customer-success suite */},
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
        { key: "spark_intelligence", label: "Contact Scoring", route: "/app/services/spark_intelligence", merged: true, minTier: "business" /* BUSINESS (tier matrix 2026-08-06) — merged: per-contact score is on the Contacts list (tier + score columns, Tier X/Y/Z filters); the trend lives in IA Insights. A third page showing the same distribution is the duplication Brandon flagged 2026-08-06 */ },
        { key: "spark_activity_stream", label: "Activity Stream", route: "/app/services/spark_activity_stream", merged: true /* merged: linked from IA Insights -> Health (activity stream) */ },
      ],
    },
    // 2026-07-26 (Brandon): the standalone "Reporting" nav group removed —
    // general/operational reporting lives under IA Insights → Reports now
    // (Real-Time Activity / Usage / Audit Log reachable from that hub; their
    // routes/pages stay so deep links don't 500). "STELLA Send Intelligence"
    // removed from nav too: its best-time-to-send analysis now ships as the
    // real spark_send_times report inside SPARK Intelligence (Campaign ROI →
    // Campaign Opportunities).
    // Cosmetic pass 2026-07-22 (Brandon): IA Insights is ALWAYS the bottom
    // section of every platform nav. Pure analytics; Service Category is in
    // Settings.
    {
      label: "IA Insights", icon: Sparkles, collapsible: true, sectionId: "spark_ia_insights",
      items: [
        { key: "spark_ia_insights_health", label: "Health", route: "/app/services/spark_ia_insights_health" },
        { key: "spark_ia_insights_trends", label: "Trends", route: "/app/services/spark_ia_insights_trends", tag: { label: "SPARK", color: "#EF6C33" } },
        // IA INSIGHTS MODEL (Brandon 2026-08-06, applies to ARION/OLIVER/SPARK
        // identically): Health + Trends + Reports at EVERY tier — their depth
        // scales naturally because a lower tier simply connects fewer data
        // sources. Only the MODELLED layer (forecasts, anomaly detection,
        // weighted-impact opportunity) is a paid unlock at Pro. Cross-platform
        // intelligence stays ARGUS-only.
        { key: "spark_ia_insights_intelligence", label: "Intelligence", route: "/app/services/spark_ia_insights_intelligence", tag: { label: "SPARK", color: "#EF6C33" }, minTier: "pro" },
        { key: "spark_ia_insights_reports", label: "Reports", route: "/app/services/spark_ia_insights_reports" },
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
  tagline: "Projects",
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
        { key: "consulting_tickets",           label: "Work",              route: "/app/admin/consulting/requests" },
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

// F-116 — STELLA placeholder nav: Coming Soon + Expenses-rebuild placeholder
// so OLIVER's deprecated Expenses surface has a forward-looking home in
// the product where the next-gen build will land.
const STELLA_NAV: SubNavConfig = {
  productName: "STELLA",
  tagline: "Expenses & Data · Coming Soon",
  groups: [
    {
      label: "",
      items: [
        { key: "stella_coming", label: "Overview (Coming Soon)", route: "/app/services/stella_coming" },
        { key: "stella_expenses_coming", label: "Expenses (Coming Soon)", route: "/app/services/stella_expenses_coming" },
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
        // Service Area = single-value config (setting).
        // REMOVED 2026-07-21: arion_brand — My Brand is a FEATURE section in
        //   the ARION main nav (Brandon's IA re-cut). Having it registered
        //   here put arion_brand in SETTINGS_KEYS, so landing on the My Brand
        //   hub flipped the whole shell into the Settings panel. Brand
        //   IDENTITY config remains a GLOBAL (hamburger > Brand Identity).
        // arion_plugin_provisioning RETURNED here 2026-07-21 (Brandon, My
        //   Brand verification pass): provisioning is a setup/config concern,
        //   not a daily-work feature — reversing the earlier feature→main-nav
        //   move. arion_usage stays OUT of both navs (global hamburger hub).
        { key: "arion_service_area", label: "Service Area", route: "/app/services/arion_service_area" },
        { key: "arion_plugin_provisioning", label: "Plugin Provisioning", route: "/app/services/arion_plugin_provisioning" },
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
        { key: "spark_api_keys", label: "API Keys", route: "/app/services/spark_api_keys", hidden: true /* cut: platform plumbing */ },
        { key: "spark_secrets", label: "Tenant Secrets", route: "/app/services/spark_secrets", hidden: true /* cut: platform plumbing */ },
        { key: "spark_custom_fields", label: "Custom Fields", route: "/app/services/spark_custom_fields" },
        { key: "spark_quiet_hours", label: "Quiet Hours", route: "/app/services/spark_quiet_hours", hidden: true /* cut: niche */ },
        { key: "spark_tracking", label: "Tracking Pixels", route: "/app/services/spark_tracking", hidden: true /* cut: visitor tracking, niche */ },
        { key: "spark_calendar_sync", label: "Calendar Sync", route: "/app/services/spark_calendar_sync", hidden: true /* cut: niche */ },
        { key: "spark_service_category", label: "Service Category", route: "/app/services/spark_service_category" },
        { key: "spark_config_backup", label: "Config Backup", route: "/app/services/spark_config_backup", hidden: true /* cut: platform plumbing */ },
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
  tagline: "AI & Agents",
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
/**
 * route → sectionId, DERIVED from the nav config itself.
 *
 * The hand-written `path.includes(...)` chain below has drifted from the nav
 * three times, because moving an item between groups doesn't touch it. Found
 * 2026-07-28 while walking the tours:
 *   - /spark_templates returned "spark_outreach" but the item now lives in
 *     Workflow & Automations
 *   - /spark_lead_inbox matched nothing at all (the Sales test is
 *     "/spark_leads", which "spark_lead_inbox" does not contain)
 *   - arion_ia_insights_* had no mapping whatsoever
 * In each case the wrong group expanded (or none did), so the page you were
 * looking at stayed hidden inside a collapsed group.
 *
 * Every nav item already knows its group, so read it from there. Built once,
 * and it cannot go stale — moving an item updates this automatically.
 */
const ROUTE_TO_SECTION: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const config of Object.values(SUB_NAV_CONFIGS)) {
    if (!config) continue;
    for (const group of config.groups) {
      const sid = (group as { sectionId?: string }).sectionId;
      if (!sid) continue;
      for (const item of group.items) {
        // FIRST claim wins. Three routes appear in both a main-nav group and
        // the Settings hub (oliver_service_categories, oliver_workflow_settings,
        // stella_coming); main nav is declared first and is where users expect
        // to be shown, so don't let the settings entry overwrite it.
        if (item.route && !map[item.route]) map[item.route] = sid;
      }
    }
  }
  return map;
})();

function getDefaultSection(path: string): string | null {
  // Exact nav route wins — this is the authoritative answer whenever the
  // path IS a nav destination. The legacy chain below still handles retired
  // routes and deep links that aren't in the nav any more.
  const exact = ROUTE_TO_SECTION[path];
  if (exact) return exact;

  // F-93 — Settings auto-expand. ONLY the routes that are CURRENTLY in
  // Settings should expand a settings group. Routes that moved OUT to
  // main nav (Templates, Webhooks, Audience Sync, Audit Log, Review Widget,
  // Coupons, Categories, Booking, etc.) are intentionally excluded —
  // they expand their main-nav group instead.
  if (path.includes("/oliver_settings") || path.includes("/oliver_workflow_settings") || path.includes("/oliver_service_categories") || path.includes("/oliver_team_access")) return "settings_oliver";
  if (path.includes("/arion_service_area") || path.includes("/arion_plugin_provisioning")) return "settings_arion";
  // My Brand is a FEATURE section in the ARION main nav (IA re-cut 2026-07-21)
  // — the hub (arion_brand) and every my_brand_* child expand it.
  if (path.includes("/arion_brand") || path.includes("/my_brand_")) return "arion_my_brand";
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
  // Operational report pages live under IA Insights → Reports now (2026-07-26).
  if (path.includes("/spark_dashboards") || path.includes("/spark_analytics_reports") || path.includes("/spark_scheduled_reports") || path.includes("/spark_realtime_metrics") || path.includes("/spark_usage_report") || path.includes("/spark_audit_log")) return "spark_ia_insights";
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
  if (path.includes("/oliver_reports") || path.includes("/oliver_activity_log")) return "oliver_ia_insights";
  // MY BRAND sections REMOVED 2026-06-22 — top-level slot pulled from
  // IconRail/SubNav (Q4 2026 deferred product). ARION's internal arion_brand
  // is handled by the settings_arion auto-expand above.
  return null;
}

/**
 * serviceKey → its visibility declaration, derived from the nav configs.
 *
 * Exported so ServiceRouter can enforce the SAME rules on the route as the nav
 * does on the link. Hiding a link without guarding its route just makes the
 * page reachable by URL — from a bookmark, an old deep link, or one of the
 * engagement alerts, which navigate by route.
 */
export const SERVICE_VISIBILITY: Record<string, VisibilityRules> = (() => {
  const map: Record<string, VisibilityRules> = {};
  for (const config of Object.values(SUB_NAV_CONFIGS)) {
    if (!config) continue;
    for (const group of config.groups) {
      for (const item of group.items) {
        if (item.hidden || item.merged || item.addon || item.minTier) {
          map[item.key] = { hidden: item.hidden, merged: item.merged, addon: item.addon, minTier: item.minTier };
        }
      }
    }
  }
  return map;
})();

/** Which product a config belongs to — configs are singletons, so identity works. */
export function productOfConfig(config: SubNavConfig): ProductKey | undefined {
  return (Object.keys(SUB_NAV_CONFIGS) as ProductKey[])
    .find((k) => SUB_NAV_CONFIGS[k] === config);
}

/**
 * Human-readable reason a nav row is locked, for the lock icon's tooltip.
 * Mirrors the wording used by FeatureLocked on the page itself so the menu and
 * the page never disagree about which plan a surface needs.
 */
export function requirementLabel(item: { minTier?: string; addon?: string }): string {
  if (item.addon === 'leadgen') return 'the Lead Gen add-on';
  if (item.minTier) {
    const t = item.minTier;
    return `SPARK ${t.charAt(0).toUpperCase()}${t.slice(1)}`;
  }
  return 'a higher plan';
}

export function SubNav({ config }: SubNavProps) {
  const location = useLocation();
  const navigate = useNavigate();

  // ── Feature wall ────────────────────────────────────────────────────────
  // Hooks must run unconditionally, so always resolve a tier; whether it's
  // APPLIED depends on the product (STELLA/FORGE/ARGUS placeholders, Settings
  // and Consulting are not gated).
  const productKey = productOfConfig(config);
  const gatingActive = isGatedProduct(productKey);
  const { tier } = useProductTier(gatingActive ? productKey : "spark");
  const { ownedProducts } = useAppState();
  const visCtx = { tier, addons: activeAddons(), gatingActive };

  // 2026-08-06 (Brandon) — SHOW, DON'T HIDE. Features the tenant's plan doesn't
  // include stay VISIBLE and are marked "Upgrade", so they can see what they're
  // missing. Hiding them destroyed the upsell: a Standard customer had no idea
  // Pipelines or Newsletter Studio existed. The API still hard-blocks them
  // (LUMEN requireSparkTier -> 403 tier_upgrade_required), so this is purely a
  // discovery/merchandising surface, not an access decision.
  // If the business doesn't own this PRODUCT at all, every item is locked —
  // they can still browse the whole feature list (with the upgrade banner
  // above it) to see what buying it would give them.
  const PRODUCT_SERVICE_KEY: Record<string, string | undefined> = {
    arion: "arion", oliver: "oliver", spark: "spark",
    stella: "stella", forge: "forge", argus: "argus",
  };
  const needsKey = PRODUCT_SERVICE_KEY[productKey || ""];
  // Kill switch (2026-08-06) — see config/featureFlags.FEATURE_GATING_ENABLED.
  // With gating off nothing is marked locked, restoring the pre-gating menu.
  const productLocked =
    FEATURE_GATING_ENABLED &&
    !!needsKey && ownedProducts.size > 0 && !ownedProducts.has(needsKey);

  // 2026-08-17 — SHOW-DON'T-HIDE applies to ENTITLEMENT ONLY.
  //
  // isVisible() returns false for three unrelated reasons: `hidden` (cut from
  // the product), `merged` (folded into another surface), and unmet
  // tier/add-on. The show-don't-hide change collapsed all three into
  // `locked: true`, which RESURRECTED every merged and hidden item as a locked
  // menu row — undoing the Phase 4b–5 SPARK consolidation and making ~13
  // surfaces look "gated" even at business tier, where nothing should be.
  //
  // hidden/merged are product-STRUCTURE decisions, not entitlement, so they
  // come out of the menu at every tier. Only tier/add-on gaps render as
  // locked, which is the upsell the 2026-08-06 decision actually asked for.
  // (merged routes still resolve — see isRoutable.)
  const gatedGroups = config.groups
    .map((g) => ({
      ...g,
      items: g.items
        .filter((it) => !it.hidden && !it.merged)
        .map((it) =>
          FEATURE_GATING_ENABLED && (productLocked || !isVisible(it, visCtx))
            ? { ...it, locked: true as const }
            : it
        ),
    }))
    .filter((g) => g.items.length > 0);
  config = { ...config, groups: gatedGroups };
  // Single-section-expanded mode for products that opt in via sectionId on groups.
  // ARION, SPARK, OLIVER all have sectionIds; STELLA/FORGE/ARGUS placeholders don't.
  const hasSectionIds = config.groups.some(g => !!g.sectionId);

  // Single active section at a time (for any product with sectionIds)
  const [activeSection, setActiveSection] = useState<string | null>(() => {
    if (!hasSectionIds) return null;
    return getDefaultSection(location.pathname);
  });

  // Keep the open section in sync with the URL (2026-07-27).
  //
  // activeSection was seeded ONCE at mount and only changed on a header
  // click, so any navigation the user didn't perform by clicking that header
  // — a deep link, an alert "Open →", a guided tour stepping between
  // sections — left the wrong group open and the destination group COLLAPSED.
  // Collapsed means its <a> isn't in the DOM at all, which is why the tour
  // had nothing to highlight and fell back to a bare centred box.
  //
  // Only forces a section when the path maps to one, so a user who collapses
  // everything on the page they're already on keeps that state.
  useEffect(() => {
    if (!hasSectionIds) return;
    const target = getDefaultSection(location.pathname);
    if (target) setActiveSection((prev) => (prev === target ? prev : target));
  }, [location.pathname, hasSectionIds]);

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

      {/* 2026-08-06 (Brandon) — product NOT owned: the whole feature list stays
          browsable so the customer can see exactly what they'd get, with a
          prominent "add this product" banner above it. Access itself is
          enforced server-side (403), never by hiding the nav. */}
      {productLocked && (
        <div
          className="mx-3 mb-3 rounded-md px-3 py-2.5"
          style={{ background: "#EF6C3318", border: "1px solid #EF6C3355" }}
        >
          <div className="text-[11px] font-bold" style={{ color: "#EF6C33" }}>
            🔒 Not included in your plan
          </div>
          <div className="mt-1 text-[10px] leading-snug text-[#D5E8F0]/80">
            Add <span className="font-semibold">{config.productName}</span> to unlock these features.
          </div>
          <button
            type="button"
            onClick={() => navigate("/app/settings/plan")}
            className="mt-2 w-full rounded px-2 py-1 text-[10px] font-bold text-white"
            style={{ background: "#EF6C33" }}
          >
            Add {config.productName}
          </button>
        </div>
      )}

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
                  // Tours spotlight this to teach the nav itself ("click
                  // Website — that's where your pages live") before drilling
                  // into an item inside it.
                  data-subnav-header={sid || group.label || undefined}
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
                        <span className={`truncate${item.locked ? " opacity-60" : ""}`}>{item.label}</span>
                        {/* Plan-locked features stay VISIBLE so customers discover
                            what they're missing. 2026-08-17 — a shouty orange
                            UPGRADE pill on every locked row read as a storefront
                            and drowned out the nav; a quiet lock says the same
                            thing. The full pitch belongs on the page itself
                            (FeatureLocked), not in the menu. API still 403s. */}
                        {item.locked && (
                          <span
                            title={`Requires ${requirementLabel(item)}`}
                            aria-label={`Locked — requires ${requirementLabel(item)}`}
                            style={{ flexShrink: 0, marginLeft: 'auto', display: 'inline-flex', opacity: 0.5 }}
                          >
                            <Lock size={11} />
                          </span>
                        )}
                        {item.tag && !item.locked && (
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
