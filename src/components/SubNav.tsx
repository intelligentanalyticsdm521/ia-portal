import { NavLink } from "react-router-dom";
import type { ProductKey } from "./IconRail";

export interface SubNavItem {
  key: string;
  label: string;
  route: string;
  gated?: boolean; // show lock icon
}

export interface SubNavGroup {
  label: string; // italic group label (not clickable)
  items: SubNavItem[];
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
      items: [
        { key: "arion_overview", label: "Overview", route: "/app/services/arion_overview" },
      ],
    },
    {
      label: "Website",
      items: [
        { key: "arion_website_analytics", label: "Website Analytics", route: "/app/services/arion_website_analytics" },
        { key: "arion_hosting", label: "Hosting", route: "/app/services/arion_hosting" },
      ],
    },
    {
      label: "Marketing",
      items: [
        { key: "arion_seo", label: "SEO", route: "/app/services/arion_seo" },
        { key: "arion_console", label: "Console", route: "/app/services/arion_console" },
        { key: "arion_my_business", label: "My Business", route: "/app/services/arion_my_business" },
      ],
    },
    {
      label: "",
      items: [
        { key: "arion_brand", label: "Your Brand", route: "/app/services/arion_brand" },
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
  return (
    <div className="flex w-48 flex-col bg-[#0C4A60] py-4">
      {/* Product header */}
      <div className="mb-4 px-4">
        <h2 className="text-sm font-bold text-white">{config.productName}</h2>
        <p className="text-[10px] text-[#A8CDD8]">{config.tagline}</p>
      </div>

      {/* Nav groups */}
      <nav className="flex-1 overflow-y-auto px-2">
        {config.groups.map((group, gi) => (
          <div key={gi} className={gi > 0 ? "mt-3" : ""}>
            {/* Group label — italic, non-clickable */}
            {group.label && (
              <div className="mb-1 px-2 text-[9.5px] italic text-[#A8CDD8]/45">
                {group.label}
              </div>
            )}
            {/* Items */}
            <ul className="space-y-0.5">
              {group.items.map((item) => (
                <li key={item.key}>
                  <NavLink
                    to={item.route}
                    className={({ isActive }) =>
                      `flex items-center gap-2 rounded px-2 py-1.5 text-[12px] transition-colors ${
                        isActive
                          ? "bg-white/10 font-medium text-white"
                          : "text-[#D5E8F0] hover:bg-white/5 hover:text-white"
                      }`
                    }
                  >
                    {/* Dot indicator */}
                    <span className="h-1 w-1 flex-shrink-0 rounded-full bg-current opacity-50" />
                    <span className="truncate">{item.label}</span>
                    {/* Lock icon for gated items */}
                    {item.gated && (
                      <svg className="ml-auto h-3 w-3 flex-shrink-0 text-[#A8CDD8]/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                      </svg>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
    </div>
  );
}
