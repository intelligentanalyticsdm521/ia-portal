import type { PropsWithChildren } from 'react';
import { createContext, useContext, useMemo, useState } from 'react';
import type { SessionVerifyResponse, SelectTenantResponse } from '../lib/platformApi';

interface AppStateValue {
  bootstrap: SessionVerifyResponse | null;
  setBootstrap: (v: SessionVerifyResponse | null) => void;

  active: SelectTenantResponse | null;
  setActive: (v: SelectTenantResponse | null) => void;

  activeTenantId: string | null;
  /** `persist=false` keeps the tenant in memory only (consultant/view-as). */
  setActiveTenantId: (v: string | null, persist?: boolean) => void;

  enabledServices: Set<string>;

  /**
   * PRODUCT-level entitlements ("arion" | "oliver" | "spark" | …) exactly as
   * recorded in core.tenant_services. Use THIS to answer "does the tenant own
   * this product?" — `enabledServices` is a derived granular set that has no
   * SPARK coverage and cannot answer it. See buildOwnedProducts().
   */
  ownedProducts: Set<string>;
}

export const AppStateContext = createContext<AppStateValue | undefined>(undefined);

const STORAGE_KEYS = {
  activeTenantId: 'iadm.portal.activeTenantId'
};

function loadStoredActiveTenantId(): string | null {
  const stored = (localStorage.getItem(STORAGE_KEYS.activeTenantId) || '').trim();
  return stored || null;
}

function loadEnabledServicesFromEnv(): Set<string> {
  const raw = import.meta.env.VITE_ENABLED_SERVICES || '';
  const keys = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return new Set(keys);
}

function buildEnabledServices(active: SelectTenantResponse | null): Set<string> {
  const keys = loadEnabledServicesFromEnv();
  const activeServiceKeys = new Set(
    (active?.services || []).map((svc) => String(svc.serviceKey || '').trim().toLowerCase())
  );

  if (activeServiceKeys.has('arion')) {
    keys.add('arion_dashboard');
    keys.add('arion_website_overview');
    keys.add('arion_website_content');
    keys.add('arion_website_content_seo_overview');
    keys.add('arion_website_security_overview');
    keys.add('arion_website_security_vulnerabilities');
    keys.add('arion_website_security_firewall');
    keys.add('arion_website_performance_cache');
    keys.add('arion_website_performance_images');
    keys.add('arion_website_updates');
    keys.add('arion_website_staging');
    keys.add('arion_website_support');
    keys.add('arion_website_settings');
    keys.add('arion_hosting_overview');
    keys.add('arion_hosting_domain_dns');
    keys.add('arion_hosting_backups');
    keys.add('arion_hosting_performance');
    keys.add('arion_analytics_overview');
    keys.add('arion_analytics_traffic');
    keys.add('arion_analytics_audience');
    keys.add('arion_analytics_content');
    keys.add('arion_analytics_conversions');
    keys.add('arion_analytics_pages');
    keys.add('arion_analytics_reports');
    keys.add('arion_analytics_ia_cross_platform');
    keys.add('arion_analytics_ia_cross_channel'); // legacy alias
    keys.add('arion_analytics_ia_reports');
    keys.add('arion_seo_overview');
    keys.add('arion_seo_rankings');
    keys.add('arion_seo_site_audit');
    keys.add('arion_seo_competitors');
    keys.add('arion_seo_opportunities');
    keys.add('arion_seo_reports');
    keys.add('arion_search_performance');
    keys.add('arion_search_indexing');
    keys.add('arion_search_sitemaps');
    keys.add('arion_search_core_web_vitals');
    keys.add('arion_search_bing_copilot');
    keys.add('arion_search_bing_indexnow');
    keys.add('arion_business_overview');
    keys.add('arion_business_locations');
    keys.add('arion_business_reviews');
    keys.add('arion_business_insights');
    keys.add('arion_business_posts');
    keys.add('arion_business_services');
    keys.add('arion_business_bing_overview');
    keys.add('arion_business_apple_overview');
    keys.add('arion_brand');
  }

  if (activeServiceKeys.has('oliver')) {
    keys.add('oliver_operations');
    keys.add('oliver_portals');
  }

  for (const feature of active?.features || []) {
    const key = String(feature.featureKey || '').trim();
    if (key) keys.add(key);
  }

  return keys;
}

/**
 * The tenant's PRODUCT-level entitlements, straight from the session response —
 * i.e. exactly the `core.tenant_services` rows with `is_enabled = 1`
 * ("arion" | "oliver" | "spark" | "argus" | "stella" | "forge" | …).
 *
 * 2026-08-06 — why this exists separately from `enabledServices`.
 * `enabledServices` is a *derived, granular* set (arion_dashboard, arion_seo_*,
 * …) built by hand-maintained per-product branches, and it only has branches for
 * `arion` and `oliver`. Nothing ever adds `spark_*` keys, so it CANNOT answer
 * "does this tenant own SPARK?" — gating the product rail on it would hide SPARK
 * from tenants who actually pay for it. This set is the authoritative answer and
 * needs no per-product maintenance.
 *
 * Dev (`VITE_ENABLED_SERVICES`) has no session payload, so callers fall back to
 * the legacy behaviour when this set is empty — see IconRail.
 * See memory: reference_subscription_gating_model.
 */
function buildOwnedProducts(active: SelectTenantResponse | null): Set<string> {
  return new Set(
    (active?.services || [])
      .map((svc) => String(svc.serviceKey || '').trim().toLowerCase())
      .filter(Boolean)
  );
}

export function AppStateProvider({ children }: PropsWithChildren) {
  const [bootstrap, setBootstrap] = useState<SessionVerifyResponse | null>(null);
  const [active, setActive] = useState<SelectTenantResponse | null>(null);
  const [activeTenantId, setActiveTenantIdState] = useState<string | null>(() => loadStoredActiveTenantId());

  const enabledServices = useMemo(() => buildEnabledServices(active), [active]);
  const ownedProducts = useMemo(() => buildOwnedProducts(active), [active]);

  /**
   * @param persist  When false the tenant is held in memory ONLY — nothing is
   *   written to localStorage. Used by the consultant/view-as workspace.
   *
   * 2026-08-06 — WHY. View-as used to persist the CLIENT's tenant id into
   * localStorage. That value outlives the workspace tab, so the founder's own
   * portal reloaded straight back into the client's tenant: Brandon opened his
   * own portal and saw Rolling In It's SPARK/OLIVER data, an empty clients
   * list (RII has none), and CONTACT_INSERT_NOT_ALLOWED_AS_CONSULTANT when he
   * tried to write — all because the app still believed he was acting as RII.
   *
   * View-as must be a scoped, disposable context. It never writes to the
   * founder's persisted session.
   */
  function setActiveTenantId(v: string | null, persist: boolean = true) {
    setActiveTenantIdState(v);
    if (!persist) return;
    if (!v) localStorage.removeItem(STORAGE_KEYS.activeTenantId);
    else localStorage.setItem(STORAGE_KEYS.activeTenantId, v);
  }

  const value: AppStateValue = {
    bootstrap,
    setBootstrap,
    active,
    setActive,
    activeTenantId,
    setActiveTenantId,
    enabledServices,
    ownedProducts
  };

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState() {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error('useAppState must be used within AppStateProvider');
  return ctx;
}
