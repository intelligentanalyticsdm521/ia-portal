import { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import type { ProductKey } from "./IconRail";

export interface SubNavItem {
  key: string;
  label: string;
  route: string;
  gated?: boolean; // show lock icon
}

export interface SubNavGroup {
  label: string; // italic group label (not clickable), or collapsible section header
  items: SubNavItem[];
  collapsible?: boolean; // if true, group is collapsible accordion section
}

export interface SubNavConfig {
  productName: string;
  tagline: string;
  groups: SubNavGroup[];
}

// ── Navigation configs per product ────────────────────────────

const OLIVER_NAV: SubNavConfig = {
  productName: "OLIVER",
  tagline: "Field Service Management",
  groups: [
    {
      label: "",
      items: [{ key: "oliver_dashboard", label: "Dashboard", route: "/app/services/oliver_dashboard" }],
    },
    {
      label: "Jobs",
      items: [
        { key: "oliver_job_board", label: "Job Board", route: "/app/services/oliver_job_board" },
        { key: "oliver_schedule", label: "Schedule", route: "/app/services/oliver_schedule" },
        { key: "oliver_dispatch", label: "Dispatch", route: "/app/services/oliver_dispatch" },
      ],
    },
    {
      label: "Team",
      items: [
        { key: "oliver_workers", label: "Workers", route: "/app/services/oliver_workers" },
        { key: "oliver_crew_performance", label: "Team Performance", route: "/app/services/oliver_crew_performance", gated: true },
      ],
    },
    {
      label: "Customers",
      items: [
        { key: "oliver_contacts", label: "Contacts", route: "/app/services/oliver_contacts" },
        { key: "oliver_service_requests", label: "Service Requests", route: "/app/services/oliver_service_requests" },
      ],
    },
    {
      label: "Billing",
      items: [
        { key: "oliver_quotes", label: "Quotes", route: "/app/services/oliver_quotes" },
        { key: "oliver_invoices", label: "Invoices", route: "/app/services/oliver_invoices" },
        { key: "oliver_payments", label: "Payments", route: "/app/services/oliver_payments" },
        { key: "oliver_recurring", label: "Recurring & Subscriptions", route: "/app/services/oliver_recurring" },
      ],
    },
    {
      label: "Communication",
      items: [
        { key: "oliver_messages", label: "Messages", route: "/app/services/oliver_messages" },
        { key: "oliver_notifications", label: "Notifications", route: "/app/services/oliver_notifications" },
      ],
    },
    {
      label: "Insights",
      items: [
        { key: "oliver_reports", label: "Reports", route: "/app/services/oliver_reports" },
        { key: "oliver_activity_log", label: "Activity Log", route: "/app/services/oliver_activity_log" },
      ],
    },
    {
      label: "",
      items: [{ key: "oliver_settings", label: "Settings", route: "/app/services/oliver_settings" }],
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
      label: "Website",
      collapsible: true,
      items: [
        { key: "arion_website_overview", label: "Overview", route: "/app/services/arion_website_overview" },
        { key: "arion_website_content", label: "Content", route: "/app/services/arion_website_content" },
        { key: "arion_website_content_seo_overview", label: "Content SEO: Overview", route: "/app/services/arion_website_content_seo_overview" },
        { key: "arion_website_content_seo_pages", label: "Content SEO: Pages", route: "/app/services/arion_website_content_seo_pages" },
        { key: "arion_website_content_seo_posts", label: "Content SEO: Posts", route: "/app/services/arion_website_content_seo_posts" },
        { key: "arion_website_content_seo_schema", label: "Content SEO: Schema", route: "/app/services/arion_website_content_seo_schema" },
        { key: "arion_website_security_overview", label: "Security: Overview", route: "/app/services/arion_website_security_overview" },
        { key: "arion_website_security_vulnerabilities", label: "Security: Vulnerabilities", route: "/app/services/arion_website_security_vulnerabilities" },
        { key: "arion_website_security_firewall", label: "Security: Firewall", route: "/app/services/arion_website_security_firewall" },
        { key: "arion_website_performance_cache", label: "Performance: Cache", route: "/app/services/arion_website_performance_cache" },
        { key: "arion_website_performance_images", label: "Performance: Images", route: "/app/services/arion_website_performance_images" },
        { key: "arion_website_updates", label: "Updates", route: "/app/services/arion_website_updates" },
        { key: "arion_website_staging", label: "Staging", route: "/app/services/arion_website_staging" },
        { key: "arion_website_support", label: "Support", route: "/app/services/arion_website_support" },
        { key: "arion_website_settings", label: "Settings", route: "/app/services/arion_website_settings" },
      ],
    },
    {
      label: "Hosting",
      collapsible: true,
      items: [
        { key: "arion_hosting_overview", label: "Overview", route: "/app/services/arion_hosting_overview" },
        { key: "arion_hosting_domain_dns", label: "Domain & DNS", route: "/app/services/arion_hosting_domain_dns" },
        { key: "arion_hosting_backups", label: "Backups", route: "/app/services/arion_hosting_backups" },
        { key: "arion_hosting_performance", label: "Performance", route: "/app/services/arion_hosting_performance", gated: true },
      ],
    },
    {
      label: "Analytics",
      collapsible: true,
      items: [
        { key: "arion_analytics_overview", label: "Overview", route: "/app/services/arion_analytics_overview" },
        { key: "arion_analytics_traffic", label: "Traffic", route: "/app/services/arion_analytics_traffic" },
        { key: "arion_analytics_conversions", label: "Conversions", route: "/app/services/arion_analytics_conversions" },
        { key: "arion_analytics_pages", label: "Pages", route: "/app/services/arion_analytics_pages", gated: true },
        { key: "arion_analytics_reports", label: "Reports", route: "/app/services/arion_analytics_reports", gated: true },
        { key: "arion_analytics_ia_cross_channel", label: "IA: Cross-Channel", route: "/app/services/arion_analytics_ia_cross_channel" },
        { key: "arion_analytics_ia_reports", label: "IA: Reports", route: "/app/services/arion_analytics_ia_reports" },
      ],
    },
    {
      label: "SEO",
      collapsible: true,
      items: [
        { key: "arion_seo_overview", label: "Overview", route: "/app/services/arion_seo_overview" },
        { key: "arion_seo_rankings", label: "Rankings", route: "/app/services/arion_seo_rankings" },
        { key: "arion_seo_site_audit", label: "Site Audit", route: "/app/services/arion_seo_site_audit" },
        { key: "arion_seo_competitors", label: "Competitors", route: "/app/services/arion_seo_competitors" },
        { key: "arion_seo_opportunities", label: "Opportunities", route: "/app/services/arion_seo_opportunities" },
        { key: "arion_seo_reports", label: "Reports", route: "/app/services/arion_seo_reports" },
      ],
    },
    {
      label: "Search",
      collapsible: true,
      items: [
        { key: "arion_search_performance", label: "Performance", route: "/app/services/arion_search_performance" },
        { key: "arion_search_indexing", label: "Indexing", route: "/app/services/arion_search_indexing" },
        { key: "arion_search_sitemaps", label: "Sitemaps", route: "/app/services/arion_search_sitemaps" },
        { key: "arion_search_core_web_vitals", label: "Core Web Vitals", route: "/app/services/arion_search_core_web_vitals" },
        { key: "arion_search_bing_copilot", label: "Bing: Copilot AI", route: "/app/services/arion_search_bing_copilot" },
        { key: "arion_search_bing_indexnow", label: "Bing: IndexNow", route: "/app/services/arion_search_bing_indexnow" },
      ],
    },
    {
      label: "Business Profile",
      collapsible: true,
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
      label: "",
      items: [{ key: "arion_brand", label: "My Brand", route: "/app/services/arion_brand" }],
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
        { key: "spark_overview", label: "Overview", route: "/app/services/spark_overview" },
      ],
    },
    {
      label: "CRM",
      items: [
        { key: "spark_contacts", label: "Contacts", route: "/app/services/spark_contacts" },
        { key: "spark_lists", label: "Lists", route: "/app/services/spark_lists" },
        { key: "spark_tags", label: "Tags", route: "/app/services/spark_tags" },
        { key: "spark_segments", label: "Segments", route: "/app/services/spark_segments" },
      ],
    },
    {
      label: "Marketing",
      items: [
        { key: "spark_campaigns", label: "Campaigns", route: "/app/services/spark_campaigns" },
        { key: "spark_forms", label: "Forms", route: "/app/services/spark_forms" },
        { key: "spark_automations", label: "Automations", route: "/app/services/spark_automations" },
      ],
    },
    {
      label: "Lead Generation",
      items: [
        { key: "spark_leads", label: "Lead Inbox", route: "/app/services/spark_leads" },
        { key: "spark_search_profiles", label: "Search Profiles", route: "/app/services/spark_search_profiles" },
      ],
    },
    {
      label: "Intelligence",
      items: [
        { key: "spark_intelligence", label: "Contact Scoring", route: "/app/services/spark_intelligence" },
      ],
    },
    {
      label: "",
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

export function SubNav({ config }: SubNavProps) {
  const location = useLocation();
  // Auto-expand groups that contain the active route
  const [expanded, setExpanded] = useState<Set<number>>(() => {
    const initial = new Set<number>();
    config.groups.forEach((group, gi) => {
      if (group.collapsible && group.items.some(item => location.pathname.startsWith(item.route))) {
        initial.add(gi);
      }
    });
    return initial;
  });

  const toggleGroup = (gi: number) => {
    setExpanded(prev => {
      if (prev.has(gi)) {
        const next = new Set(prev);
        next.delete(gi);
        return next;
      }
      return new Set([gi]);
    });
  };

  return (
    <div className="flex w-52 flex-col bg-[#0B1C24] py-4">
      {/* Product header */}
      <div className="mb-4 px-4">
        <h2 className="text-sm font-bold text-white">{config.productName}</h2>
        <p className="text-[10px] text-[#A8CDD8]">{config.tagline}</p>
      </div>

      {/* Nav groups */}
      <nav className="flex-1 overflow-y-auto px-2">
        {config.groups.map((group, gi) => {
          const isExpanded = !group.collapsible || expanded.has(gi);
          const hasActiveItem = group.items.some(item => location.pathname.startsWith(item.route));

          return (
            <div key={gi} className={gi > 0 ? "mt-2" : ""}>
              {/* Group label — collapsible or italic */}
              {group.label && (
                group.collapsible ? (
                  <button
                    type="button"
                    onClick={() => toggleGroup(gi)}
                    className={`mb-1 flex w-full items-center justify-between px-2 py-1 text-[11px] font-semibold transition-colors ${
                      hasActiveItem ? "text-white" : "text-[#A8CDD8]/70 hover:text-[#A8CDD8]"
                    }`}
                  >
                    <span>{group.label}</span>
                    <svg
                      className={`h-3 w-3 flex-shrink-0 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                    </svg>
                  </button>
                ) : (
                  <div className="mb-1 px-2 text-[9.5px] italic text-[#A8CDD8]/45">
                    {group.label}
                  </div>
                )
              )}
              {/* Items — hidden when collapsed */}
              {isExpanded && (
                <ul className="space-y-0.5">
                  {group.items.map((item) => (
                    <li key={item.key}>
                      <NavLink
                        to={item.route}
                        className={({ isActive }) =>
                          `flex items-center gap-2 rounded px-2 py-1.5 text-[11px] transition-colors ${
                            isActive
                              ? "bg-white/10 font-medium text-white"
                              : "text-[#D5E8F0] hover:bg-white/5 hover:text-white"
                          }`
                        }
                      >
                        <span className="h-1 w-1 flex-shrink-0 rounded-full bg-current opacity-50" />
                        <span className="truncate">{item.label}</span>
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
    </div>
  );
}
