import { useCallback, useEffect, useMemo, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { HeaderBar } from "./HeaderBar";
import { IconRail, type ProductKey } from "./IconRail";
import { SubNav, SUB_NAV_CONFIGS, SETTINGS_KEYS, type SubNavConfig } from "./SubNav";
import { useOliverRole } from "../hooks/useOliverRole";
import { ArgusChatbot } from "./argus/ArgusChatbot";
import { getActingTenant, getActingTenantName, clearActingTenant } from "../lib/consultingSession";
import { ShieldCheck, LogOut } from "lucide-react";

// F-257 — Sticky banner shown across every page when the operator is acting
// inside a client tenant. Clicking Exit clears the localStorage flag + reloads
// so all API hooks re-init without the x-acting-tenant header.
function ActingTenantBanner() {
  const acting = getActingTenant();
  const name = getActingTenantName();
  if (!acting) return null;
  return (
    <div className="shrink-0 flex items-center justify-between px-4 py-2 text-xs font-medium"
         style={{ background: "#FEF3C7", borderBottom: "1px solid #FCD34D", color: "#78350F" }}>
      <span className="inline-flex items-center gap-2">
        <ShieldCheck className="h-4 w-4" />
        Acting as <strong>{name || acting}</strong> — every change writes to their tenant. All actions are logged.
      </span>
      <button onClick={() => { clearActingTenant(); window.location.href = "/app/services/consulting_onboard_client"; }}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded font-semibold hover:bg-amber-200">
        <LogOut className="h-3.5 w-3.5" /> Exit
      </button>
    </div>
  );
}

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

  const rawSubNavConfig =
    activeProduct !== "overview" ? SUB_NAV_CONFIGS[activeProduct] : null;
  const subNavConfig = useMemo(() => {
    if (!rawSubNavConfig) return null;
    if (activeProduct !== "oliver") return rawSubNavConfig;
    return applyOliverNavFilter(rawSubNavConfig, roleInfo.allowedServiceKeys);
  }, [rawSubNavConfig, activeProduct, roleInfo.allowedServiceKeys]);

  return (
    // h-screen (not min-h-screen) locks the shell to exactly 100vh so the nav row's
    // flex-1 height is a definite number — otherwise IconRail/SubNav fall back to
    // content height and the Settings gear sits mid-viewport with empty space below.
    <div className="iadm-shell flex h-screen flex-col overflow-hidden">
      {/* F-257 — Acting-tenant banner. Always visible when the operator has
          stepped into a client tenant; gives a one-click exit. Without this,
          founders can't tell at a glance whose tenant they're editing. */}
      <ActingTenantBanner />
      {/* Top header */}
      <header className="iadm-header shrink-0">
        <HeaderBar />
      </header>

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
    </div>
  );
}
