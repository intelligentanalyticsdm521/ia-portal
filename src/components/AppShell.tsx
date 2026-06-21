import { useCallback, useEffect, useMemo, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { HeaderBar } from "./HeaderBar";
import { IconRail, type ProductKey } from "./IconRail";
import { SubNav, SUB_NAV_CONFIGS, SETTINGS_KEYS, type SubNavConfig } from "./SubNav";
import { useOliverRole } from "../hooks/useOliverRole";
import { useAppState } from "../app/AppState";
import { ArgusChatbot } from "./argus/ArgusChatbot";
import { EmergencyActAsBanner } from "./EmergencyActAsBanner";
import { EmergencyActAsToast } from "./EmergencyActAsToast";
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
  isSuperUser: boolean,
): SubNavConfig {
  if (isSuperUser) return config;
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

  // Keep activeProduct in sync with URL changes (e.g., back/forward nav)
  useEffect(() => {
    setActiveProduct(deriveProduct(location.pathname));
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
  const isSuperUser = !!appState.bootstrap?.user?.isSuperUser;

  const rawSubNavConfig =
    activeProduct !== "overview" ? SUB_NAV_CONFIGS[activeProduct] : null;
  const subNavConfig = useMemo(() => {
    if (!rawSubNavConfig) return null;
    if (activeProduct === "oliver") {
      return applyOliverNavFilter(rawSubNavConfig, roleInfo.allowedServiceKeys);
    }
    if (activeProduct === "consulting") {
      // F1.9 — Onboard Client (and other founder-tools) hidden for non-founders
      return applyConsultingNavFilter(rawSubNavConfig, isSuperUser);
    }
    return rawSubNavConfig;
  }, [rawSubNavConfig, activeProduct, roleInfo.allowedServiceKeys, isSuperUser]);

  return (
    // h-screen (not min-h-screen) locks the shell to exactly 100vh so the nav row's
    // flex-1 height is a definite number — otherwise IconRail/SubNav fall back to
    // content height and the Settings gear sits mid-viewport with empty space below.
    <div className="iadm-shell flex h-screen flex-col overflow-hidden">
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
          on this flex row causes IconRail and SubNav to fill the full row height. */}
      <div className="flex flex-1 min-h-0">
        {/* Icon Rail — always visible */}
        <IconRail activeProduct={activeProduct} onSelect={handleProductSelect} />

        {/* Sub-Nav — visible when a product (not overview) is selected */}
        {subNavConfig && <SubNav config={subNavConfig} />}

        {/* Main content area */}
        <main className="flex-1 overflow-y-auto bg-[#F2F6F9]">
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
