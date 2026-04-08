import { useCallback, useEffect, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { HeaderBar } from "./HeaderBar";
import { IconRail, type ProductKey } from "./IconRail";
import { SubNav, SUB_NAV_CONFIGS } from "./SubNav";

/** Derive the active product from the current URL path */
function deriveProduct(pathname: string): ProductKey {
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

  const subNavConfig = activeProduct !== "overview" ? SUB_NAV_CONFIGS[activeProduct] : null;

  return (
    <div className="iadm-shell flex min-h-screen flex-col">
      {/* Top header */}
      <header className="iadm-header">
        <HeaderBar />
      </header>

      {/* Main layout: icon rail + sub-nav + content */}
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
    </div>
  );
}
