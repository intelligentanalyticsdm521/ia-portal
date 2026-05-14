import { useState, type ComponentType } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  Monitor, Server, ShieldCheck, BarChart2, TrendingUp,
  Search as SearchIcon, MapPin, Star, ChevronDown, Settings,
  Users, Megaphone, Briefcase, Heart, Target, Sparkles,
  Wrench, UserCircle, CreditCard, MessageSquare, LineChart,
} from "lucide-react";
import type { ProductKey } from "./IconRail";

export interface SubNavItem {
  key: string;
  label: string;
  route: string;
  gated?: boolean;
  intelligence?: boolean; // ARGUS-powered intelligence item — lime color + badge
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

const OLIVER_NAV: SubNavConfig = {
  productName: "OLIVER",
  tagline: "Universal Job & Project Lifecycle Platform",
  groups: [
    {
      label: "",
      items: [{ key: "oliver_dashboard", label: "Dashboard", route: "/app/services/oliver_dashboard" }],
    },
    {
      label: "Jobs", icon: Wrench, collapsible: true, sectionId: "oliver_jobs",
      items: [
        { key: "oliver_job_board", label: "Job Board", route: "/app/services/oliver_job_board" },
        { key: "oliver_projects", label: "Projects", route: "/app/services/oliver_projects" },
        { key: "oliver_schedule", label: "Schedule", route: "/app/services/oliver_schedule" },
        { key: "oliver_dispatch", label: "Dispatch", route: "/app/services/oliver_dispatch" },
      ],
    },
    {
      label: "Team", icon: Users, collapsible: true, sectionId: "oliver_team",
      items: [
        { key: "oliver_workers", label: "Workers", route: "/app/services/oliver_workers" },
        { key: "oliver_crew_performance", label: "Team Performance", route: "/app/services/oliver_crew_performance", gated: true },
        { key: "oliver_team_access", label: "Team Access", route: "/app/services/oliver_team_access" },
      ],
    },
    {
      label: "Customers", icon: UserCircle, collapsible: true, sectionId: "oliver_customers",
      items: [
        { key: "oliver_contacts", label: "Contacts", route: "/app/services/oliver_contacts" },
        { key: "oliver_service_requests", label: "Service Requests", route: "/app/services/oliver_service_requests" },
      ],
    },
    {
      label: "Billing", icon: CreditCard, collapsible: true, sectionId: "oliver_billing",
      items: [
        { key: "oliver_billing_overview", label: "Overview", route: "/app/services/oliver_billing_overview" },
        { key: "oliver_catalog", label: "Service Catalog", route: "/app/services/oliver_catalog" },
        { key: "oliver_proposals", label: "Proposals", route: "/app/services/oliver_proposals" },
        { key: "oliver_quotes", label: "Quotes", route: "/app/services/oliver_quotes" },
        { key: "oliver_quote_options", label: "Quote Options (good/better/best)", route: "/app/services/oliver_quote_options" },
        { key: "oliver_invoices", label: "Invoices", route: "/app/services/oliver_invoices" },
        { key: "oliver_payments", label: "Payments", route: "/app/services/oliver_payments" },
        { key: "oliver_payouts", label: "Stripe Payouts", route: "/app/services/oliver_payouts" },
        { key: "oliver_recurring", label: "Recurring & Subscriptions", route: "/app/services/oliver_recurring" },
        { key: "oliver_expenses", label: "Expenses", route: "/app/services/oliver_expenses" },
        { key: "oliver_job_costing", label: "Job Costing", route: "/app/services/oliver_job_costing" },
        { key: "oliver_coupons", label: "Coupons", route: "/app/services/oliver_coupons" },
        { key: "oliver_disputes", label: "Disputes", route: "/app/services/oliver_disputes" },
        { key: "oliver_reminders", label: "Reminders", route: "/app/services/oliver_reminders" },
      ],
    },
    {
      label: "Communication", icon: MessageSquare, collapsible: true, sectionId: "oliver_comms",
      items: [
        { key: "oliver_messages", label: "Messages", route: "/app/services/oliver_messages" },
        { key: "oliver_notifications", label: "Notifications", route: "/app/services/oliver_notifications" },
        { key: "oliver_support_tickets", label: "Support Tickets", route: "/app/services/oliver_support_tickets" },
      ],
    },
    {
      label: "Operations", icon: Wrench, collapsible: true, sectionId: "oliver_ops",
      items: [
        { key: "oliver_workflow_templates", label: "Workflow Templates", route: "/app/services/oliver_workflow_templates" },
        { key: "oliver_job_offers", label: "Job Offers", route: "/app/services/oliver_job_offers" },
        { key: "oliver_reschedule_requests", label: "Reschedule Queue", route: "/app/services/oliver_reschedule_requests" },
        { key: "oliver_time_tracking", label: "Time Tracking", route: "/app/services/oliver_time_tracking" },
        { key: "oliver_territories", label: "Territories", route: "/app/services/oliver_territories" },
        { key: "oliver_sla_policies", label: "SLA Policies", route: "/app/services/oliver_sla_policies" },
      ],
    },
    {
      label: "Insights", icon: BarChart2, collapsible: true, sectionId: "oliver_insights",
      items: [
        { key: "oliver_insights", label: "Insights", route: "/app/services/oliver_insights" },
        { key: "oliver_argus", label: "ARGUS AI Insights", route: "/app/services/oliver_argus" },
        { key: "oliver_reports", label: "Reports", route: "/app/services/oliver_reports" },
        { key: "oliver_activity_log", label: "Activity Log", route: "/app/services/oliver_activity_log" },
      ],
    },
    {
      label: "", icon: Settings,
      items: [
        { key: "oliver_settings", label: "Business Setup", route: "/app/services/oliver_settings" },
        { key: "oliver_usage", label: "Plan & Pricing", route: "/app/services/oliver_usage" },
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
      items: [{ key: "arion_dashboard", label: "Dashboard", route: "/app/services/arion_dashboard" }],
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
      label: "Analytics & Intelligence", icon: BarChart2, collapsible: true, sectionId: "analytics",
      items: [
        { key: "arion_analytics_overview", label: "Overview", route: "/app/services/arion_analytics_overview" },
        { key: "arion_analytics_traffic", label: "Traffic", route: "/app/services/arion_analytics_traffic" },
        { key: "arion_analytics_audience", label: "Audience", route: "/app/services/arion_analytics_audience" },
        { key: "arion_analytics_content", label: "Content", route: "/app/services/arion_analytics_content" },
        { key: "arion_analytics_conversions", label: "Conversions", route: "/app/services/arion_analytics_conversions" },
        { key: "arion_analytics_ia_cross_channel", label: "IA: Cross-Channel", route: "/app/services/arion_analytics_ia_cross_channel", intelligence: true },
        { key: "arion_analytics_ia_reports", label: "IA: Insights", route: "/app/services/arion_analytics_ia_reports", intelligence: true },
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
        // Companies (renamed from "B2B Accounts" — matches HubSpot/Salesforce/Pipedrive
        // industry convention). Auto-matched from contact email domains.
        { key: "spark_accounts", label: "Companies", route: "/app/services/spark_accounts" },
        { key: "spark_lists", label: "Lists", route: "/app/services/spark_lists" },
        { key: "spark_tags", label: "Tags", route: "/app/services/spark_tags" },
        { key: "spark_segments", label: "Segments", route: "/app/services/spark_segments" },
      ],
    },
    {
      label: "Outreach", icon: Megaphone, collapsible: true, sectionId: "spark_outreach",
      items: [
        { key: "spark_campaigns", label: "Campaigns", route: "/app/services/spark_campaigns" },
        { key: "spark_email_templates", label: "Email Templates", route: "/app/services/spark_email_templates" },
        { key: "spark_automations", label: "Automations", route: "/app/services/spark_automations" },
        { key: "spark_automation_builder", label: "Automation Builder", route: "/app/services/spark_automation_builder" },
        { key: "spark_journey_builder", label: "Journey Builder (graph)", route: "/app/services/spark_journey_builder" },
        { key: "spark_ab_tests", label: "A/B Tests", route: "/app/services/spark_ab_tests" },
        { key: "spark_newsletter", label: "Newsletter Studio", route: "/app/services/spark_newsletter" },
        { key: "spark_social", label: "Social Scheduler", route: "/app/services/spark_social" },
        { key: "spark_calendar", label: "Content Calendar", route: "/app/services/spark_calendar" },
        { key: "spark_sms_inbox", label: "SMS Inbox", route: "/app/services/spark_sms_inbox" },
        { key: "spark_deliverability", label: "Deliverability", route: "/app/services/spark_deliverability" },
        { key: "spark_sender_domains", label: "Sender Domains", route: "/app/services/spark_sender_domains" },
      ],
    },
    {
      label: "Capture", icon: Target, collapsible: true, sectionId: "spark_capture",
      items: [
        { key: "spark_forms", label: "Forms", route: "/app/services/spark_forms" },
        { key: "spark_landing_pages", label: "Landing Pages", route: "/app/services/spark_landing_pages" },
        { key: "spark_qr_codes", label: "QR Codes", route: "/app/services/spark_qr_codes" },
      ],
    },
    {
      label: "Sales", icon: Briefcase, collapsible: true, sectionId: "spark_sales",
      items: [
        // Lead Gen folded into Sales — they're sequential: lead → deal → close.
        { key: "spark_leads", label: "Lead Inbox", route: "/app/services/spark_leads" },
        { key: "spark_search_profiles", label: "Search Profiles", route: "/app/services/spark_search_profiles" },
        { key: "spark_lead_suppression", label: "Lead Suppression", route: "/app/services/spark_lead_suppression" },
        { key: "spark_lead_territories", label: "Lead Territories", route: "/app/services/spark_lead_territories" },
        { key: "spark_autotag_rules", label: "Auto-Tag Rules", route: "/app/services/spark_autotag_rules" },
        { key: "spark_competitor_watch", label: "Competitor Watch", route: "/app/services/spark_competitor_watch" },
        { key: "spark_pipelines", label: "Pipelines", route: "/app/services/spark_pipelines" },
        { key: "spark_deals", label: "Deals", route: "/app/services/spark_deals" },
        { key: "spark_scoring_rules", label: "Scoring Rules", route: "/app/services/spark_scoring_rules" },
        { key: "spark_routing_rules", label: "Routing Rules", route: "/app/services/spark_routing_rules" },
        { key: "spark_attribution", label: "Attribution", route: "/app/services/spark_attribution" },
        { key: "spark_audience_sync", label: "Audience Sync", route: "/app/services/spark_audience_sync" },
        { key: "spark_tracking", label: "Visitor Tracking", route: "/app/services/spark_tracking" },
      ],
    },
    {
      label: "Admin", icon: Sparkles, collapsible: true, sectionId: "spark_admin",
      items: [
        { key: "spark_approvals", label: "Approvals", route: "/app/services/spark_approvals" },
        { key: "spark_scheduled_reports", label: "Scheduled Reports", route: "/app/services/spark_scheduled_reports" },
        { key: "spark_api_keys", label: "API Keys", route: "/app/services/spark_api_keys" },
      ],
    },
    {
      label: "Customer Success", icon: Heart, collapsible: true, sectionId: "spark_customer_success",
      items: [
        { key: "spark_nps", label: "NPS", route: "/app/services/spark_nps" },
        { key: "spark_reviews", label: "Reputation Hub", route: "/app/services/spark_reviews" },
        { key: "spark_review_widget", label: "Review Widget", route: "/app/services/spark_review_widget" },
        { key: "spark_referrals", label: "Referrals", route: "/app/services/spark_referrals" },
      ],
    },
    {
      label: "AI & Intelligence", icon: Sparkles, collapsible: true, sectionId: "spark_intelligence",
      items: [
        { key: "spark_ai_writer", label: "AI Writer", route: "/app/services/spark_ai_writer" },
        { key: "spark_intelligence", label: "Contact Scoring", route: "/app/services/spark_intelligence" },
        { key: "spark_stella", label: "STELLA Send Intelligence", route: "/app/services/spark_stella", intelligence: true },
        { key: "spark_insights", label: "Insights", route: "/app/services/spark_insights", intelligence: true },
      ],
    },
    {
      label: "", icon: LineChart,
      items: [
        { key: "spark_usage", label: "Usage & Billing", route: "/app/services/spark_usage" },
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

export const SUB_NAV_CONFIGS: Record<ProductKey, SubNavConfig | null> = {
  overview: null, // overview uses the flat Overview page, no sub-nav
  arion: ARION_NAV,
  oliver: OLIVER_NAV,
  spark: SPARK_NAV,
  consulting: CONSULTING_NAV,
  stella: PLACEHOLDER_NAV("STELLA", "Reporting & BI"),
  forge: PLACEHOLDER_NAV("FORGE", "Integrations"),
  argus: PLACEHOLDER_NAV("ARGUS", "Orchestration"),
};

// ── Component ────────────────────────────────────────────────

interface SubNavProps {
  config: SubNavConfig;
}

// Determine which section should auto-expand based on current path.
// Each entry maps a path predicate to a sectionId (which must match a group's sectionId).
function getDefaultSection(path: string): string | null {
  // ARION sections
  if (path.includes("arion_website_security") || path.includes("arion_website_performance") || path.includes("arion_website_updates")) return "security";
  if (path.includes("arion_website_")) return "website";
  if (path.includes("arion_hosting_")) return "hosting";
  if (path.includes("arion_analytics_")) return "analytics";
  if (path.includes("arion_seo_")) return "seo";
  if (path.includes("arion_search_")) return "search";
  if (path.includes("arion_business_")) return "business";
  // SPARK sections
  if (path.includes("/spark_contacts") || path.includes("/spark_accounts") || path.includes("/spark_lists") || path.includes("/spark_tags") || path.includes("/spark_segments")) return "spark_crm";
  if (path.includes("/spark_campaigns") || path.includes("/spark_automations") || path.includes("/spark_newsletter") || path.includes("/spark_social") || path.includes("/spark_calendar")) return "spark_outreach";
  if (path.includes("/spark_forms") || path.includes("/spark_landing_pages") || path.includes("/spark_qr_codes")) return "spark_capture";
  if (path.includes("/spark_leads") || path.includes("/spark_search_profiles") || path.includes("/spark_pipelines") || path.includes("/spark_deals")) return "spark_sales";
  if (path.includes("/spark_nps") || path.includes("/spark_reviews") || path.includes("/spark_referrals")) return "spark_customer_success";
  if (path.includes("/spark_ai_writer") || path.includes("/spark_intelligence") || path.includes("/spark_insights")) return "spark_intelligence";
  // OLIVER sections
  if (path.includes("/oliver_job_board") || path.includes("/oliver_projects") || path.includes("/oliver_schedule") || path.includes("/oliver_dispatch")) return "oliver_jobs";
  if (path.includes("/oliver_workers") || path.includes("/oliver_crew_performance") || path.includes("/oliver_team_access")) return "oliver_team";
  if (path.includes("/oliver_contacts") || path.includes("/oliver_service_requests")) return "oliver_customers";
  if (path.includes("/oliver_billing_overview") || path.includes("/oliver_catalog") || path.includes("/oliver_proposals") || path.includes("/oliver_quotes") || path.includes("/oliver_invoices") || path.includes("/oliver_payments") || path.includes("/oliver_recurring") || path.includes("/oliver_coupons") || path.includes("/oliver_disputes") || path.includes("/oliver_reminders")) return "oliver_billing";
  if (path.includes("/oliver_messages") || path.includes("/oliver_notifications")) return "oliver_comms";
  if (path.includes("/oliver_insights") || path.includes("/oliver_reports") || path.includes("/oliver_activity_log")) return "oliver_insights";
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
                      {item.intelligence && (itemIdx === 0 || !group.items[itemIdx - 1]?.intelligence) && (
                        <div style={{ borderTop: '1px solid rgba(168,205,216,0.15)', margin: '6px 8px 4px' }} />
                      )}
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
                        <span className="truncate" style={item.intelligence ? { color: '#6B9402' } : undefined}>{item.label}</span>
                        {item.intelligence && (
                          <span style={{ background: 'rgba(151,204,4,0.12)', color: '#6B9402', fontSize: 9, padding: '1px 5px', borderRadius: 99, flexShrink: 0, marginLeft: 'auto' }}>Intelligence</span>
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
