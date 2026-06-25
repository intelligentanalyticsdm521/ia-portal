import { useCallback, useEffect, useMemo, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { HeaderBar } from "./HeaderBar";
import { IconRail, type ProductKey } from "./IconRail";
import { SubNav, SUB_NAV_CONFIGS, SETTINGS_KEYS, type SubNavConfig } from "./SubNav";
import { useOliverRole } from "../hooks/useOliverRole";
import { useAppState } from "../app/AppState";
import { ArgusChatbot } from "./argus/ArgusChatbot";
import { EmergencyActAsBanner } from "./EmergencyActAsBanner";
import { EmergencyActAsToast } from "./EmergencyActAsToast";
import { ViewAsTenantBanner } from "./ViewAsTenantBanner";
// Onboarding V3 Phase 3 — slim "next thing to do" strip for first-time
// users. Self-hides once dismissed (session-scoped) or once there are no
// pending tasks. Co-exists with all existing setup banners.
import { WalkthroughPanel } from "./walkthroughs/WalkthroughPanel";

// Strip OLIVER nav items that aren't in allowedServiceKeys, and drop any
// group that becomes empty. Returns the original config when no filter
// applies (admin users / null allowedServiceKeys).
function applyOliverNavFilter(
  config: SubNavConfig,
  allowedServiceKeys: string[] | null,
): SubNavConfig {
  if (!allowedServiceKeys) return config;
  const allowSet = new Set(allowedServiceKeys);
  const filteredGroups = config.groups
    .map((g) => ({ ...g, items: g.items.filter((i) => allowSet.has(i.key)) }))
    .filter((g) => g.items.length > 0);
  return { ...config, groups: filteredGroups };
}

// F1.9 — Hide founder-only Consulting items (Onboard Client + Access Log +
// Clients picker + Tenant Workspace) for non-super-users. Per locked rule:
// "Onboard Client button hidden from non-founder users".
const CONSULTING_FOUNDER_ONLY = new Set<string>([
  "consulting_onboard_client",
  "consulting_access_log",
  "consulting_workspace",
  "consulting_tenant_workspace",
]);

function applyConsultingNavFilter(
  config: SubNavConfig,
  isFounder: boolean,
): SubNavConfig {
  if (isFounder) return config;
  const filteredGroups = config.groups
    .map((g) => ({ ...g, items: g.items.filter((i) => !CONSULTING_FOUNDER_ONLY.has(i.key)) }))
    .filter((g) => g.items.length > 0);
  return { ...config, groups: filteredGroups };
}

/** Derive the active product from the current URL path */
function deriveProduct(pathname: string): ProductKey {
  // F-86 — Settings-class URLs share the product prefix (oliver_settings,
  // spark_account_profile, etc.) but should activate the Settings SubNav,
  // not the product's daily-work SubNav. Check the SETTINGS_KEYS set first.
  const keyMatch = pathname.match(/\/app\/services\/([a-z0-9_]+)/);
  if (keyMatch && SETTINGS_KEYS.has(keyMatch[1])) return "settings";

  // My Brand top-level slot REMOVED 2026-06-22 — any lingering my_brand_*
  // links (from the page files we kept on disk for the Q4 build) fall back
  // to "overview" through the map below, which is the desired behaviour:
  // they're no longer reachable from nav and pointing at them shouldn't
  // try to activate a ProductKey that no longer exists.

  const match = pathname.match(/\/app\/services\/([a-z]+)_/);
  if (!match) return "overview";
  const prefix = match[1];
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
  return map[prefix] ?? "overview";
}

/** Get the default route for a product (first nav item) */
function defaultRouteFor(key: ProductKey): string {
  if (key === "overview") return "/app/overview";
  const config = SUB_NAV_CONFIGS[key];
  if (!config) return "/app/overview";
  for (const group of config.groups) {
    if (group.items.length > 0) return group.items[0].route;
  }
  return "/app/overview";
}

export function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const [activeProduct, setActiveProduct] = useState<ProductKey>(() =>
    deriveProduct(location.pathname)
  );
  // Mobile MVP shell (2026-06-24): collapse IconRail + SubNav into a slide-over
  // drawer at < md (768px). Desktop layout unchanged. Drawer closes on any
  // route change so navigating in mobile drops you back to content.
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Keep activeProduct in sync with URL changes (e.g., back/forward nav)
  useEffect(() => {
    setActiveProduct(deriveProduct(location.pathname));
    setMobileNavOpen(false);
  }, [location.pathname]);

  const handleProductSelect = useCallback(
    (key: ProductKey) => {
      setActiveProduct(key);
      // Navigate to the product's default page
      navigate(defaultRouteFor(key));
    },
    [navigate]
  );

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

  const rawSubNavConfig =
    activeProduct !== "overview" ? SUB_NAV_CONFIGS[activeProduct] : null;
  const subNavConfig = useMemo(() => {
    if (!rawSubNavConfig) return null;
    if (activeProduct === "oliver") {
      return applyOliverNavFilter(rawSubNavConfig, roleInfo.allowedServiceKeys);
    }
    if (activeProduct === "consulting") {
      // F1.9 — Onboard Client (and other founder-tools) hidden for non-founders
      return applyConsultingNavFilter(rawSubNavConfig, isFounder);
    }
    return rawSubNavConfig;
  }, [rawSubNavConfig, activeProduct, roleInfo.allowedServiceKeys, isFounder]);

  return (
    // h-screen (not min-h-screen) locks the shell to exactly 100vh so the nav row's
    // flex-1 height is a definite number — otherwise IconRail/SubNav fall back to
    // content height and the Settings gear sits mid-viewport with empty space below.
    <div className="iadm-shell flex h-screen flex-col overflow-hidden">
      {/* Founder-only view-as-tenant banner — slate, no timer, renders above
          the header while the founder is viewing a client's portal
          read-only. Stays on top across navigation. */}
      <div className="shrink-0">
        <ViewAsTenantBanner />
      </div>

      {/* Founder-only emergency act-as banner — renders above the header
          while a 30-min read-only session is open. shrink-0 so it never
          gets squeezed by the main content area. */}
      <div className="shrink-0">
        <EmergencyActAsBanner />
      </div>

      {/* Top header */}
      <header className="iadm-header shrink-0">
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
          className="md:hidden absolute top-2 left-2 z-30 flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
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
        <div
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
