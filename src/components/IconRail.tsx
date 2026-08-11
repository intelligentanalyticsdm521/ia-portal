import { useNavigate, useLocation } from "react-router-dom";
import { Shield, Settings } from "lucide-react";
import { useAppState } from "../app/AppState";
import { useIsSuperAdmin } from "../hooks/useIsSuperAdmin";
import { resolveServiceStatus, SERVICE_CATALOG } from "../config/serviceCatalog";

// "my_brand" intentionally REMOVED 2026-06-22 — the top-level My Brand slot
// was a premature Wave-2 add for the Q4 2026 deferred product. ARION's
// internal /arion_brand page still exists in the ARION SubNav (label
// "My Brand") and is unaffected.
export type ProductKey = "overview" | "arion" | "oliver" | "spark" | "stella" | "forge" | "argus" | "consulting" | "settings";

export interface ProductDef {
  key: ProductKey;
  label: string;
  tagline: string;
  icon: React.ReactNode;
  enabled: boolean;
}

const PRODUCT_ICONS: Record<ProductKey, React.ReactNode> = {
  settings: <Settings className="h-5 w-5" />,
  overview: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25a2.25 2.25 0 01-2.25-2.25v-2.25z" />
    </svg>
  ),
  arion: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
    </svg>
  ),
  oliver: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17l-5.1-5.1m0 0L11.42 4.97m-5.1 5.1H20.25M4.5 19.5h15" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
    </svg>
  ),
  spark: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
    </svg>
  ),
  stella: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
    </svg>
  ),
  forge: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17l-5.1-5.1m0 0L11.42 4.97M6.32 10.07H20.25" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.25 3.104c-.646 0-1.292.243-1.785.736l-8.25 8.25a2.525 2.525 0 000 3.57l4.5 4.5a2.525 2.525 0 003.57 0l8.25-8.25c.493-.493.736-1.139.736-1.785V4.875a1.77 1.77 0 00-1.771-1.771H14.25z" />
    </svg>
  ),
  argus: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
  consulting: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 00.75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 00-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0112 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 01-.673-.38m0 0A2.18 2.18 0 013 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 013.413-.387m7.5 0V5.25A2.25 2.25 0 0013.5 3h-3a2.25 2.25 0 00-2.25 2.25v.894m7.5 0a48.667 48.667 0 00-7.5 0" />
    </svg>
  ),
};

// Nav labels (2026-07-27, Brandon): plain-English names in the icon rail —
// "no one understands ARION/SPARK/ARGUS". Cosmetic, scoped to this rail only;
// the product codenames stay everywhere else (SubNav headers, routes, docs).
const PRODUCTS: Omit<ProductDef, "enabled">[] = [
  { key: "overview", label: "Home", tagline: "Portal Overview", icon: PRODUCT_ICONS.overview },
  { key: "arion", label: "Digital Presence", tagline: "ARION", icon: PRODUCT_ICONS.arion },
  { key: "oliver", label: "Invoicing & Administration", tagline: "OLIVER", icon: PRODUCT_ICONS.oliver },
  // 2026-06-22 — My Brand top-level slot REMOVED (Q4 2026 deferred product).
  // The legitimate ARION-internal "My Brand" page is reachable via the
  // ARION SubNav -> My Brand entry (route /app/services/arion_brand).
  { key: "spark", label: "CRM & Marketing", tagline: "SPARK", icon: PRODUCT_ICONS.spark },
  { key: "stella", label: "Ledger & Data Management", tagline: "STELLA", icon: PRODUCT_ICONS.stella },
  { key: "forge", label: "Integrations & Software", tagline: "FORGE", icon: PRODUCT_ICONS.forge },
  { key: "argus", label: "Agents & Automations", tagline: "ARGUS", icon: PRODUCT_ICONS.argus },
  { key: "consulting", label: "Consulting", tagline: "Projects", icon: PRODUCT_ICONS.consulting },
];

interface IconRailProps {
  activeProduct: ProductKey;
  onSelect: (key: ProductKey) => void;
}

export function IconRail({ activeProduct, onSelect }: IconRailProps) {
  const navigate = useNavigate();
  const location = useLocation();
  // Gear at the bottom of the rail is reserved for platform-level admin tools
  // (cross-tenant ops). Tenant settings now live in the hamburger menu — see
  // AccountMenu. Hide the gear entirely for non-super-admin users so they
  // aren't tempted into a /admin page they can't use.
  const isAdminActive = location.pathname.startsWith("/admin");
  const { enabledServices, ownedProducts } = useAppState();
  const isSuperAdmin = useIsSuperAdmin();

  // 2026-08-06 — PRODUCT GATING. A product rail icon appears only when the
  // tenant actually OWNS that product (core.tenant_services.is_enabled).
  //
  // The old test — "any service in this section resolves to enabled" — was
  // bypassed entirely by `resolveServiceStatus()`, which returns 'enabled'
  // unconditionally whenever a catalog row is declared `defaultStatus:'enabled'`.
  // 41 rows are (12 SPARK, 11 ARION, 9 CONSULTING, 6 ARGUS, 2 OLIVER), so every
  // tenant saw SPARK/ARGUS regardless of what they bought — Briarwood and
  // Midwest Ag (ARION-only) both showed SPARK.
  //
  // We gate on `ownedProducts` (the raw core.tenant_services keys) rather than
  // `enabledServices`, because the latter is a derived granular set whose
  // per-product branches only cover arion + oliver — no spark_* key is ever
  // added, so using it would hide SPARK from tenants who DO pay for it.
  // See memory: reference_subscription_gating_model.
  const PRODUCT_SERVICE_KEY: Partial<Record<ProductKey, string>> = {
    arion: "arion", oliver: "oliver", spark: "spark",
    stella: "stella", forge: "forge", argus: "argus",
  };

  const products: ProductDef[] = PRODUCTS.map((p) => {
    // Home is always available. Consulting is founder/client-surface gated
    // elsewhere (applyConsultingNavFilter + RequireFounderRoute), not by
    // subscription — leave its existing behaviour untouched.
    if (p.key === "overview" || p.key === "consulting") return { ...p, enabled: true };

    const serviceKey = PRODUCT_SERVICE_KEY[p.key];
    if (!serviceKey) return { ...p, enabled: false };

    // Dev / preview: no session payload exists (VITE_ENABLED_SERVICES drives
    // the granular set instead), so fall back to the legacy catalog test rather
    // than blanking the rail for local work.
    if (ownedProducts.size === 0) {
      const sectionMap: Record<string, string> = {
        arion: "ARION", oliver: "OLIVER", spark: "LUMEN",
        stella: "STELLA", forge: "FORGE", argus: "ARGUS",
      };
      const section = sectionMap[p.key];
      const hasEnabled = SERVICE_CATALOG.some(
        (s) => s.section === section && resolveServiceStatus(s, enabledServices) === "enabled"
      );
      return { ...p, enabled: hasEnabled };
    }

    return { ...p, enabled: ownedProducts.has(serviceKey) };
  });

  return (
    // In a flex row parent with min-h-0 and align-items:stretch (default), this column
    // stretches to the row's full height automatically — no h-full needed and in fact
    // h-full breaks on some browsers when the parent height is flex-derived rather than
    // explicit. `min-h-0` on the inner list lets it scroll rather than pushing Settings
    // off-screen when many products are enabled.
    // Widened 64px -> 96px (2026-07-27, Brandon): the plain-English labels
    // ("Invoicing & Administration", "Ledger & Data Management") were
    // clipping/cramped at the old width. Buttons follow at 56px -> 88px.
    <div className="flex w-24 flex-col items-center bg-[#0B1C24] py-3">
      <div className="flex min-h-0 flex-1 flex-col items-center gap-1 overflow-y-auto">
        {products.map((p) => {
          const isActive = activeProduct === p.key;
          // 2026-08-06 (Brandon) — SHOW, DON'T HIDE. Products the business
          // doesn't subscribe to stay visible but render LOCKED with a padlock
          // and an "Add <PRODUCT>" prompt, so customers discover what else the
          // platform does. (`enabled` was previously computed and then never
          // used in the render — every product showed as if owned.) Real access
          // is enforced server-side: arion-api requireArionAccess, oliver-api
          // enforceTenantAccess, LUMEN requireSparkAccess.
          const locked = !p.enabled;
          return (
            <button
              key={p.key}
              // Locked products still OPEN (Brandon 2026-08-06): the customer
              // browses the full feature nav with everything locked plus an
              // upgrade banner, so they can see exactly what they'd get. Do NOT
              // bounce them to Settings — that hides the product entirely.
              onClick={() => onSelect(p.key)}
              title={locked
                ? `${p.tagline} is not part of your plan — add ${p.tagline} to enable ${p.label}`
                : `${p.label} - ${p.tagline}`}
              aria-disabled={locked}
              className={`relative flex w-[88px] flex-col items-center gap-1 rounded-md px-1 py-2 transition-colors ${
                isActive
                  ? "bg-white/10 text-white"
                  : locked
                    ? "text-white/25 hover:bg-white/5 hover:text-white/40"
                    : "text-white/50 hover:bg-white/5 hover:text-white/80"
              }`}
            >
              {/* Active indicator bar */}
              {isActive && (
                <span className="absolute left-0 top-1/2 h-6 w-[2.5px] -translate-y-1/2 rounded-r-sm bg-[#EF6C33]" />
              )}
              <span className="relative flex h-6 w-6 items-center justify-center">
                {p.icon}
                {locked && (
                  <span
                    aria-hidden
                    className="absolute -right-1 -top-1 flex h-3 w-3 items-center justify-center rounded-full bg-[#0B1C24] text-[8px] leading-none"
                    style={{ color: "#EF6C33" }}
                  >
                    🔒
                  </span>
                )}
              </span>
              <span className="text-[10px] font-medium leading-tight text-center">{p.label}</span>
              {locked && (
                <span
                  className="text-[8px] font-bold leading-none tracking-wide"
                  style={{ color: "#EF6C33" }}
                >
                  ADD
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* F-86 — Settings gear. Activates the cross-product Settings SubNav
          (one collapsible group per product: ARION / OLIVER / SPARK / STELLA /
          FORGE / ARGUS). One destination for "where do I configure X" no
          matter which product the user is currently in. Per-product config
          pages stay where they are; the Settings SubNav just groups them. */}
      <button
        onClick={() => onSelect("settings")}
        title="Settings"
        className={`mt-auto flex w-[88px] flex-col items-center gap-1 rounded-md px-1 py-2 transition-colors ${
          activeProduct === "settings" ? "bg-white/10 text-white" : "text-white/50 hover:bg-white/5 hover:text-white/80"
        }`}
      >
        <span className="flex h-6 w-6 items-center justify-center">
          <Settings className="h-5 w-5" />
        </span>
        <span className="text-[10px] font-medium leading-tight text-center">Settings</span>
      </button>

      {/* Platform Admin gear — pinned at bottom. SUPER_ADMIN-only.
          The Settings gear above always consumes mt-auto, so this button
          just stacks below it. */}
      {isSuperAdmin && (
        <button
          onClick={() => navigate("/admin")}
          title="Platform Admin (SUPER_ADMIN)"
          className={`flex w-[88px] flex-col items-center gap-1 rounded-md px-1 py-2 transition-colors ${
            isAdminActive ? "bg-white/10 text-white" : "text-white/50 hover:bg-white/5 hover:text-white/80"
          }`}
        >
          <span className="flex h-6 w-6 items-center justify-center">
            <Shield className="h-5 w-5" />
          </span>
          <span className="text-[10px] font-medium leading-tight text-center">Admin</span>
        </button>
      )}
    </div>
  );
}
