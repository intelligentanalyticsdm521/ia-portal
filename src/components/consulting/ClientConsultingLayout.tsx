// ClientConsultingLayout — G4-CLIENT-CONSULTING-GATE (LOCKED 2026-07-03)
//
// Lightweight layout shell for the three CLIENT-facing consulting pages
// (Projects / Deliverables / Service Requests). Renders a pill nav across
// the top + an <Outlet /> for the active page. Lives at /app/consulting/*
// — outside the founder ServiceRouter so we can scope the subnav to
// exactly three tabs without polluting the founder SubNav.
//
// Gate rules (2026-07-03 REPLACES the 2026-06-29 "always show" pattern):
//   Calls oliver-api GET /consulting/nav-visibility on mount. Response
//   determines which tabs render + whether the Book-a-consultation CTA
//   appears + whether the entire nav is hidden (rule NONE).
//     A. active build_your_brand_* subscription       → all 3 tabs
//     B. open project OR closed <14 days              → all 3 tabs
//     C. deliverables only (no A + no B)              → Deliverables tab + CTA
//     NONE                                            → BookConsultationCTA full-page
//
// Backend contract: response.data = {
//   has_byb_sub, has_open_project, has_recent_project_within_14d,
//   has_deliverables, show_nav, unlock_service_requests,
//   unlock_projects, unlock_deliverables, show_book_cta, book_cta_url
// }

import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { Folder, Inbox, MessageCircle, Loader2 } from "lucide-react";
import { useOliverApi } from "../../hooks/useOliverApi";
import { BookConsultationCTA } from "./BookConsultationCTA";

interface TabDef {
  key: "projects" | "deliverables" | "requests";
  to: string;
  label: string;
  icon: typeof Folder;
}

const ALL_TABS: TabDef[] = [
  { key: "projects",     to: "/app/consulting/projects",     label: "Projects",         icon: Folder },
  { key: "deliverables", to: "/app/consulting/deliverables", label: "Deliverables",     icon: Inbox },
  { key: "requests",     to: "/app/consulting/requests",     label: "Service Requests", icon: MessageCircle },
];

interface NavVisibility {
  has_byb_sub: boolean;
  has_open_project: boolean;
  has_recent_project_within_14d: boolean;
  has_deliverables: boolean;
  show_nav: boolean;
  unlock_service_requests: boolean;
  unlock_projects: boolean;
  unlock_deliverables: boolean;
  show_book_cta: boolean;
  book_cta_url: string;
}

export function ClientConsultingLayout() {
  const { get, ready } = useOliverApi();
  const [vis, setVis] = useState<NavVisibility | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    (async () => {
      try {
        // useOliverApi.get strips the `{ data: ... }` envelope; result is the
        // inner object per the lumen convention in lib/oliverApi.ts.
        const data = await get<NavVisibility>("/consulting/nav-visibility");
        if (!cancelled) setVis(data);
      } catch {
        // Fail-safe: on error, default to permissive (show all tabs, no CTA)
        // so a backend hiccup doesn't lock a paying client out of their nav.
        if (!cancelled) {
          setVis({
            has_byb_sub: false,
            has_open_project: false,
            has_recent_project_within_14d: false,
            has_deliverables: false,
            show_nav: true,
            unlock_service_requests: true,
            unlock_projects: true,
            unlock_deliverables: true,
            show_book_cta: false,
            book_cta_url: "https://book.intelligentanalyticsdm.com",
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [get, ready]);

  useEffect(() => {
    // If we're on the /app/consulting/projects or /requests route but that tab
    // is locked, redirect the browser to the highest tab we DO unlock (or the
    // book-CTA landing).
    if (!vis) return;
    const path = window.location.pathname;
    const onProjects = path.startsWith("/app/consulting/projects");
    const onRequests = path.startsWith("/app/consulting/requests");
    const onDeliverables = path.startsWith("/app/consulting/deliverables");

    if (onProjects && !vis.unlock_projects) {
      if (vis.unlock_deliverables) navigate("/app/consulting/deliverables", { replace: true });
    } else if (onRequests && !vis.unlock_service_requests) {
      if (vis.unlock_deliverables) navigate("/app/consulting/deliverables", { replace: true });
    } else if (onDeliverables && !vis.unlock_deliverables) {
      // Deliverables locked and we're on it — nothing to redirect to, the
      // NONE render below handles it.
    }
  }, [vis, navigate]);

  if (loading) {
    return (
      <div className="arion-page">
        <div className="max-w-7xl flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
        </div>
      </div>
    );
  }

  // Rule NONE — the tenant has no A, no B, no C. Consulting nav is fully
  // hidden; we render the book-CTA as a full-page shell so the tenant knows
  // why they're here and how to unlock it.
  if (vis && !vis.show_nav) {
    return <BookConsultationCTA variant="full" bookUrl={vis.book_cta_url} />;
  }

  const tabs = ALL_TABS.filter((t) => {
    if (!vis) return true;
    if (t.key === "projects")     return vis.unlock_projects;
    if (t.key === "requests")     return vis.unlock_service_requests;
    if (t.key === "deliverables") return vis.unlock_deliverables;
    return false;
  });

  return (
    <div className="arion-page">
      <div className="space-y-4 max-w-7xl">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Consulting</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Your projects, deliverables, and service requests with Intelligent Analytics.
            </p>
          </div>
          <nav className="flex flex-wrap gap-1 rounded-full bg-slate-100 p-1">
            {tabs.map((t) => {
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

        {/* Rule C — deliverables-only clients: surface the CTA at the bottom
            so they know how to reactivate consulting. */}
        {vis?.show_book_cta && (
          <BookConsultationCTA variant="compact" bookUrl={vis.book_cta_url} />
        )}
      </div>
    </div>
  );
}

export default ClientConsultingLayout;
