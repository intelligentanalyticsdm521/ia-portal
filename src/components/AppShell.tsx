import { useCallback, useEffect, useMemo, useState } from "react";
import { LEADGEN_LOCKED_KEYS } from '../config/featureFlags';
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { HeaderBar } from "./HeaderBar";
import { IconRail, type ProductKey } from "./IconRail";
import { SubNav, SUB_NAV_CONFIGS, SETTINGS_KEYS, type SubNavConfig } from "./SubNav";
import { applyRoleNavFilter, railRouteFor } from "./navRoleFilter";
import { useOliverRole } from "../hooks/useOliverRole";
import { useAppState } from "../app/AppState";
import { useLeadgenAccess } from "../hooks/useLeadgenAccess";
import { isActingAsClient } from "../lib/actingAsClient";
import { ArgusChatbot } from "./argus/ArgusChatbot";
import { EmergencyActAsBanner } from "./EmergencyActAsBanner";
import { EmergencyActAsToast } from "./EmergencyActAsToast";
import { ViewAsTenantBanner } from "./ViewAsTenantBanner";
import { ConsultantModeBanner } from "./consulting/ConsultantModeBanner";
// Onboarding V3 Phase 3 — slim "next thing to do" strip for first-time
// users. Self-hides once dismissed (session-scoped) or once there are no
// pending tasks. Co-exists with all existing setup banners.
import { WalkthroughPanel } from "./walkthroughs/WalkthroughPanel";
import { PageHelpButton } from "./PageHelpButton";

// The accountant's nav filter (applyRoleNavFilter) and the rail target
// (railRouteFor) live in navRoleFilter.ts — pure, so a node test runs the real
// rule. 2 Oct 2026 review: the rail icon read the UNFILTERED nav, so an
// accountant's STELLA icon opened the Dashboard their own menu did not hold.

// F1.9 — Hide founder-only Consulting items (Onboard Client + Access Log +
// Clients picker + Tenant Workspace) for non-super-users. Per locked rule:
// "Onboard Client button hidden from non-founder users".
// 2026-06-29: relocation to /app/admin/consulting/* moved Service Requests
// (consulting_tickets) into the founder-only set as well — the new admin
// URL is gated by RequireFounderRoute, so clients clicking the link would
// just bounce to /overview. Drop the nav row entirely to keep the SubNav
// honest about what's reachable.
const CONSULTING_FOUNDER_ONLY = new Set<string>([
  "consulting_onboard_client",
  "consulting_access_log",
  "consulting_workspace",
  "consulting_tenant_workspace",
  "consulting_projects",
  "consulting_documents",
  "consulting_tickets",
]);

/**
 * Two different questions, and they used to share one answer.
 *
 * `isFounder` — the founder-side CONSULTING keys. Internal tooling; correct.
 * `leadgenAllowed` — may THIS BUSINESS run a lead search? SPARK pack 1 moved
 *   that to a server allow-list (LEADGEN_TENANT_ALLOWLIST), because "the founder
 *   is the only one who may" is what stopped a real client verifying a real
 *   paid search. Unresolved hides the entries; see useLeadgenAccess.
 */
function applyConsultingNavFilter(
  config: SubNavConfig,
  isFounder: boolean,
  leadgenAllowed: boolean,
): SubNavConfig {
  if (isFounder && leadgenAllowed) return config;
  const filteredGroups = config.groups
    .map((g) => ({ ...g, items: g.items.filter((i) =>
      (isFounder || !CONSULTING_FOUNDER_ONLY.has(i.key))
      && (leadgenAllowed || !LEADGEN_LOCKED_KEYS.includes(i.key))) }))
    .filter((g) => g.items.length > 0);
  return { ...config, groups: filteredGroups };
}

/** Derive the active product from the current URL path */
function deriveProduct(pathname: string): ProductKey {
  // 2026-06-29 — Founder-side Consulting moved to /app/admin/consulting/*.
  // Activate the Consulting product slot so the SubNav + IconRail highlight
  // matches user expectation. Sits above the SETTINGS_KEYS check because
  // there's no overlap.
  if (pathname.startsWith("/app/admin/consulting")) return "consulting";

  // F-Client.Consulting (2026-06-29) — CLIENT-facing consulting surface
  // at /app/consulting/{projects,deliverables,requests}. The layout
  // provides its own three-pill nav internally so we don't need to render
  // the founder SubNav here — but the IconRail "Consulting" entry should
  // still highlight as active when the user is on one of these tabs.
  // Also covers /app/consulting/intake/:submissionId (the existing client
  // intake form player), which conceptually belongs to the same surface.
  if (/^\/app\/consulting(\/|$)/.test(pathname)) return "consulting";

  // Product sub-routes that AREN'T /app/services/<key>.
  //
  // Brandon 2026-08-06: "OLIVER templates is working but for some reason it's
  // closing the nav page." Quotes & Proposals templates live at
  // a non-/services route, which doesn't match the /app/services/<key>
  // pattern below — so this function fell through to "overview" and the whole
  // OLIVER SubNav disappeared while you were still inside OLIVER.
  if (/^\/app\/oliver(\/|$)/.test(pathname)) return "oliver";

  // F-86 — Settings-class URLs share the product prefix (oliver_settings,
  // spark_account_profile, etc.) but should activate the Settings SubNav,
  // not the product's daily-work SubNav. Check the SETTINGS_KEYS set first.
  const keyMatch = pathname.match(/\/app\/services\/([a-z0-9_]+)/);
  if (keyMatch && SETTINGS_KEYS.has(keyMatch[1])) return "settings";

  // IA re-cut 2026-07-21 — My Brand lives INSIDE ARION as a nav section.
  // Every my_brand_* route must keep the ARION product active (SubNav
  // mounted + rail icon lit); before this, the generic prefix regex below
  // extracted "my" → no product → "overview" → the whole SubNav unmounted
  // the moment you entered Image Studio (Brandon's "nav bar doesn't work").
  if (keyMatch && keyMatch[1].startsWith("my_brand_")) return "arion";

  const map: Record<string, ProductKey> = {
    arion: "arion",
    oliver: "oliver",
    lumen: "spark",
    spark: "spark",
    stella: "stella",
    forge: "forge",
    argus: "argus",
    consulting: "consulting",
  };

  // NESTED form first: /app/services/<product>/<feature>/<function>.
  //
  // FORGE moved here so one product line can host a build per client
  // (/app/services/forge/hestia/clients), and the other products are following.
  // The flat matcher below requires an UNDERSCORE after the product name, so a
  // nested path matched nothing, this returned "overview", and the entire
  // SubNav unmounted the moment you clicked a FORGE nav item — which reads as
  // the navigation closing itself. Same failure mode as the My Brand and
  // OLIVER-templates fixes above; this is the third time, hence the general
  // rule rather than another special case.
  const nested = pathname.match(/^\/app\/services\/([a-z]+)(?:\/|$)/);
  if (nested && map[nested[1]]) return map[nested[1]];

  // FLAT form: /app/services/<product>_<screen>.
  const match = pathname.match(/\/app\/services\/([a-z]+)_/);
  if (!match) return "overview";
  return map[match[1]] ?? "overview";
}

/** Get the default route for a product (first nav item).
 *  2026-06-29: Consulting is role-split — founders land on the relocated
 *  /app/admin/consulting/clients surface; clients land on the new
 *  CLIENT-facing /app/consulting/projects surface (F-Client.Consulting).
 *  Other products still use the first-item-wins rule — on the nav THIS person
 *  sees (role-filtered for OLIVER and STELLA, 2 Oct 2026), so the rail never
 *  opens a page their own menu does not hold. */
function defaultRouteFor(key: ProductKey, isFounder: boolean, allowedServiceKeys: string[] | null): string {
  if (key === "overview") return "/app/overview";
  if (key === "consulting") {
    return isFounder
      ? "/app/admin/consulting/clients"
      : "/app/consulting/projects";
  }
  return railRouteFor(key, SUB_NAV_CONFIGS[key], allowedServiceKeys) ?? "/app/overview";
}

export function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const [activeProduct, setActiveProduct] = useState<ProductKey>(() =>
    deriveProduct(location.pathname)
  );
  // Mobile MVP shell (2026-06-24): collapse IconRail + SubNav into a slide-over
  // drawer at < md (768px). Desktop layout unchanged. Per Brandon 2026-06-25:
  // tapping a product icon while the drawer is open should NOT close the
  // drawer + navigate — instead it should swap the visible SubNav so the user
  // can drill into a child in one open/close cycle (Menu > OLIVER > Billing >
  // Subscriptions, not Menu > OLIVER > Menu > Billing > Menu > Subscriptions).
  // Only LEAF navigation (SubNav children + product-Dashboards with no SubNav
  // group + Home) closes the drawer.
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Keep activeProduct in sync with URL changes (e.g., back/forward nav).
  // ALSO closes the drawer on a real route change — but the IconRail mobile
  // handler below skips navigation when a target product has a SubNav, so
  // tapping IconRail doesn't trigger this. Only leaf navigation does.
  useEffect(() => {
    setActiveProduct(deriveProduct(location.pathname));
    setMobileNavOpen(false);
  }, [location.pathname]);

  // OLIVER role drives accountant nav filtering. The hook fetches /overview/me
  // once per session; defaults to 'admin' until resolved so the full nav
  // doesn't briefly flash a restricted view for real admins.
  const { roleInfo } = useOliverRole();
  const appState = useAppState();
  // isFounder drives day-to-day founder UX (Consulting > Onboard Client,
  // Access Log, Tenant Workspace). 2026-06-24 — decoupled from
  // isSuperUser, which is now reserved as an emergency-only role. The
  // backend sets isFounder=true for super-admins as well, so the existing
  // emergency-access path keeps working.
  const isFounder = !!appState.bootstrap?.user?.isFounder;
  // 2026-06-28 (defect 4.03) — view-as override. When the founder is acting
  // AS a client tenant, hide founder-only nav items so the founder sees what
  // the client sees. We read the EXPLICIT WORKSPACE flag that ConsultantWorkspaceEntry
  // sets in sessionStorage (and ConsultantModeBanner clears on exit). URL-only
  // detection was wrong because after /c/:tid → /app redirect the URL no longer
  // matches /c/, so view-as state was lost everywhere (2026-06-29 bug: IconRail
  // "Consulting" sent founder to /admin/consulting/clients even while view-as).
  // We do NOT use useClientTenantIdOverride()/activeTenantId-vs-home checks —
  // those are too broad and caused the 2026-06-28 regression where founder nav
  // disappeared in Brandon's own IA tenant.
  //
  // 2026-08-24 — the flag alone was not enough. It is set ONLY by entering
  // through /c/:tid (the Access Portal button). A founder who reaches a client
  // tenant any other legitimate way — notably the "Switch Tenant" control on
  // the access-error screen — carried no flag, so the portal still treated him
  // as founder while his active tenant was the client's: clicking Consulting
  // went to /app/admin/consulting/clients (the founder Clients board) instead
  // of the client surface, and the client's projects, deliverables and work
  // tasks were nowhere to be seen.
  //
  // So ALSO treat "my active tenant is not my own tenant" as acting-as-client.
  // The 2026-06-28 regression this file warns about — founder nav vanishing in
  // Brandon's own IA tenant — came from a check that had nothing to compare
  // against. `homeTenantId` is that missing piece: /session/verify returns the
  // founder tenant for IA team members, so in his own tenant the two ids are
  // equal and founder nav is untouched. Both ids must be present before this
  // can fire, so it cannot trip while bootstrap is still resolving.
  const actingAsClient = isActingAsClient(
    isFounder,
    appState.activeTenantId,
    appState.bootstrap?.homeTenantId
  );
  const effectiveIsFounder = isFounder && !actingAsClient;
  // May THIS BUSINESS run a lead search? The server's allow-list answers, and
  // `null` (unresolved) hides the entries — see useLeadgenAccess.
  const leadgenAllowed = useLeadgenAccess().allowed === true;

  const handleProductSelect = useCallback(
    (key: ProductKey) => {
      setActiveProduct(key);
      // Mobile-drawer behavior: if the user just opened the drawer and tapped
      // a product that HAS its own SubNav (arion / oliver / spark / consulting
      // / settings), skip the auto-navigate so the drawer stays open and the
      // user can pick a child. For products WITHOUT a SubNav (overview /
      // stella / forge / argus today) we navigate immediately — that route
      // change closes the drawer via the useEffect above.
      if (mobileNavOpen && SUB_NAV_CONFIGS[key]) return;
      // Navigate to the product's default page. 2026-06-29: Consulting
      // routes to /app/admin/consulting/clients for founders (Brandon
      // sees Clients first) and to the shared Overview for clients.
      navigate(defaultRouteFor(key, effectiveIsFounder, roleInfo.allowedServiceKeys));
    },
    [navigate, mobileNavOpen, effectiveIsFounder, roleInfo.allowedServiceKeys]
  );

  // F-Client.Consulting — 2026-07-24 (Brandon): the client consulting surface
  // gets THREE INDEPENDENT PAGES in the portal's own left SubNav — Service
  // Requests / Deliverables / Projects — not a pill-tab strip on one page.
  // (Replaces the 2026-06-29 pattern that suppressed the SubNav here and let
  // ClientConsultingLayout render tabs.) Founder /app/admin/consulting/* still
  // gets the founder SubNav.
  const onClientConsultingSurface = /^\/app\/consulting(\/|$)/.test(location.pathname);
  const rawSubNavConfig =
    activeProduct !== "overview" ? SUB_NAV_CONFIGS[activeProduct] : null;
  const clientConsultingSubNav = useMemo<SubNavConfig>(() => ({
    productName: "Consulting",
    tagline: "Your work with Intelligent Analytics",
    groups: [
      {
        label: "Consulting",
        items: [
          { key: "client_consulting_requests", label: "Service Requests", route: "/app/consulting/requests" },
          { key: "client_consulting_deliverables", label: "Deliverables", route: "/app/consulting/deliverables" },
          { key: "client_consulting_projects", label: "Projects", route: "/app/consulting/projects" },
        ],
      },
    ],
  }), []);
  const subNavConfig = useMemo(() => {
    if (onClientConsultingSurface) return clientConsultingSubNav;
    if (!rawSubNavConfig) return null;
    if (activeProduct === "oliver" || activeProduct === "stella") {
      return applyRoleNavFilter(rawSubNavConfig, roleInfo.allowedServiceKeys);
    }
    if (activeProduct === "settings") {
      // Product settings are role-filtered; account settings are not. Period
      // Close IS on the accountant's list and stays; the bank-and-card page is
      // not and goes.
      return applyRoleNavFilter(rawSubNavConfig, roleInfo.allowedServiceKeys, ["stella_", "oliver_"]);
    }
    if (activeProduct === "consulting") {
      // F1.9 — Onboard Client (and other founder-tools) hidden for non-founders
      // 4.03 — also hidden when view-as'ing a client
      return applyConsultingNavFilter(rawSubNavConfig, effectiveIsFounder, leadgenAllowed);
    }
    return rawSubNavConfig;
  }, [rawSubNavConfig, activeProduct, roleInfo.allowedServiceKeys, effectiveIsFounder, leadgenAllowed, onClientConsultingSurface]);

  return (
    // h-screen (not min-h-screen) locks the shell to exactly 100vh so the nav row's
    // flex-1 height is a definite number — otherwise IconRail/SubNav fall back to
    // content height and the Settings gear sits mid-viewport with empty space below.
    <div className="iadm-shell flex h-screen flex-col overflow-hidden">
      {/* Founder-only view-as-tenant banner — slate, no timer, renders above
          the header while the founder is viewing a client's portal
          read-only. Stays on top across navigation. */}
      <div data-app-chrome className="shrink-0">
        <ViewAsTenantBanner />
      </div>

      {/* Founder-only emergency act-as banner — renders above the header
          while a 30-min read-only session is open. shrink-0 so it never
          gets squeezed by the main content area. */}
      <div data-app-chrome className="shrink-0">
        <EmergencyActAsBanner />
      </div>

      {/* Consultant Mode banner — shown while a founder is acting in a
          client tenant via the View-as flow. Returns null when inactive. */}
      <div data-app-chrome className="shrink-0">
        <ConsultantModeBanner />
      </div>

      {/* Top header.
          data-app-chrome — see the icon rail below. */}
      <header data-app-chrome className="iadm-header shrink-0">
        <HeaderBar />
      </header>

      {/* Onboarding V3 Phase 3 — sticky "next task" strip for first-time
          users. The component returns null (no wrapper) when dismissed or
          when there are no pending tasks, so this slot collapses cleanly. */}
      <WalkthroughPanel variant="header" />


      {/* Main layout: icon rail + sub-nav + content. Default align-items:stretch
          on this flex row causes IconRail and SubNav to fill the full row height.
          Mobile MVP: below md, IconRail+SubNav collapse into a slide-over drawer
          triggered by a hamburger button anchored to the main content area. */}
      <div className="flex flex-1 min-h-0 relative">
        {/* Hamburger — mobile only. Sits inside main content's top-left corner. */}
        <button
          type="button"
          onClick={() => setMobileNavOpen(true)}
          className="md:hidden absolute top-2 left-2 z-30 flex min-h-[40px] items-center gap-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          aria-label="Open navigation"
        >
          <Menu className="h-4 w-4" />
          Menu
        </button>

        {/* Backdrop — mobile only, dismisses drawer on tap */}
        {mobileNavOpen && (
          <div
            className="md:hidden fixed inset-0 z-40 bg-black/40"
            onClick={() => setMobileNavOpen(false)}
            aria-hidden="true"
          />
        )}

        {/* Icon Rail + Sub-Nav wrapper.
            Desktop (md+): inline flex row, no transform.
            Mobile (< md): fixed slide-over from the left, hidden by translate-x.
            Drawer auto-closes via the useEffect above on any route change. */}
        {/* data-app-chrome — THE marker for "this is the app around the page,
            not the page". PRE-WALK 1b, walk row S2: STELLA's print rules hid
            `nav`, `aside` and `.stella-no-print`, and this wrapper is none of
            those, so printing a Balance Sheet put the whole product rail (Home,
            Digital Presence, Invoicing & Administration, …), the STELLA sub-nav
            heading and the "Welcome, <business>" header on the paper a lender
            was going to read. The rail and the sub-nav's product heading live
            OUTSIDE the <nav> that held the links, which is why hiding `nav`
            alone never covered them.

            An attribute rather than a class: nothing styles it, no stylesheet
            depends on it, and one print rule can name every piece of chrome
            without any page learning a STELLA-specific class name. */}
        <div
          data-app-chrome
          className={
            "flex md:relative md:translate-x-0 md:transform-none md:transition-none " +
            "fixed inset-y-0 left-0 z-50 transition-transform duration-200 ease-out " +
            "md:bg-transparent bg-white md:shadow-none shadow-2xl " +
            (mobileNavOpen ? "translate-x-0" : "-translate-x-full")
          }
        >
          {/* Mobile close button inside drawer */}
          {mobileNavOpen && (
            <button
              type="button"
              onClick={() => setMobileNavOpen(false)}
              className="md:hidden absolute top-2 right-2 z-10 rounded-md p-1 text-slate-500 hover:bg-slate-100"
              aria-label="Close navigation"
            >
              <X className="h-5 w-5" />
            </button>
          )}
          <IconRail activeProduct={activeProduct} onSelect={handleProductSelect} />
          {subNavConfig && <SubNav config={subNavConfig} />}
        </div>

        {/* Main content area. On mobile, top padding clears the hamburger. */}
        <main className="flex-1 overflow-y-auto bg-[#F2F6F9] pt-12 md:pt-0">
          {/* 2026-09-01 — help offered FROM the page you are stuck on, not only
              from the header's Learn menu (which you have to already suspect
              covers your problem). PageHelpButton resolves the current route
              against the journeys and opens that exact step; it renders nothing
              on pages with no authored content, so it never promises help that
              does not answer the question. */}
          <div className="flex justify-end px-4 pt-3 md:px-6">
            <PageHelpButton />
          </div>
          <Outlet />
        </main>
      </div>

      {/* F-120 — floating ARGUS chatbot, always available on authenticated pages */}
      <ArgusChatbot />

      {/* Phase 2 followup #4 — one-shot success toast after entering emergency
          mode. Reads the sessionStorage stash set by FounderTenantPicker just
          before its hard navigation. Returns null when nothing's stashed. */}
      <EmergencyActAsToast />
    </div>
  );
}
