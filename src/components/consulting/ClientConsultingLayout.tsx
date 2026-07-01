// ClientConsultingLayout — F-Client.Consulting (2026-06-29).
//
// Lightweight layout shell for the three CLIENT-facing consulting pages
// (Projects / Deliverables / Service Requests). Renders a plain pill nav
// across the top + an <Outlet /> for the active page. Lives at
// /app/consulting/* — outside the founder ServiceRouter so we can scope
// the subnav to exactly three tabs without polluting the founder SubNav.
//
// Per Brandon's brief 2026-06-29:
//   - "Plain — no role checks needed at this layer." The three tabs are
//     ALWAYS visible to any authenticated tenant user; the page bodies do
//     their own subscription / upsell gating where needed (Service Requests
//     gates on Build-Your-Brand sub).
//   - Visual style mirrors OLIVER customer-portal pages — rounded white
//     card, slate text, inline pill tabs. No SubNav sidebar, no founder
//     filtering, no kanban.
//   - The IconRail "Consulting" entry on the left targets the projects
//     route as the default landing (wired via deriveProduct in AppShell).

import { NavLink, Outlet } from "react-router-dom";
import { Folder, Inbox, MessageCircle } from "lucide-react";

interface TabDef {
  to: string;
  label: string;
  icon: typeof Folder;
}

// Order locked: Projects first (default landing) → Deliverables → Requests.
const TABS: TabDef[] = [
  { to: "/app/consulting/projects",     label: "Projects",         icon: Folder },
  { to: "/app/consulting/deliverables", label: "Deliverables",     icon: Inbox },
  { to: "/app/consulting/requests",     label: "Service Requests", icon: MessageCircle },
];

export function ClientConsultingLayout() {
  return (
    <div className="arion-page">
      <div className="space-y-4 max-w-7xl">
        {/* Header strip — title + tab pills. Kept compact so deep pages
            don't sacrifice vertical real estate to the chrome. */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Consulting</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Your projects, deliverables, and service requests with Intelligent Analytics.
            </p>
          </div>
          <nav className="flex flex-wrap gap-1 rounded-full bg-slate-100 p-1">
            {TABS.map((t) => {
              const Icon = t.icon;
              return (
                <NavLink
                  key={t.to}
                  to={t.to}
                  className={({ isActive }) =>
                    `inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                      isActive
                        ? "bg-white text-slate-900 shadow-sm"
                        : "text-slate-600 hover:text-slate-900"
                    }`
                  }
                >
                  <Icon className="h-3.5 w-3.5" />
                  {t.label}
                </NavLink>
              );
            })}
          </nav>
        </div>

        <Outlet />
      </div>
    </div>
  );
}

export default ClientConsultingLayout;
