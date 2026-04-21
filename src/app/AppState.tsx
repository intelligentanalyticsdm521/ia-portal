import type { PropsWithChildren } from 'react';
import { createContext, useContext, useMemo, useState } from 'react';
import type { SessionVerifyResponse, SelectTenantResponse } from '../lib/platformApi';

interface AppStateValue {
  bootstrap: SessionVerifyResponse | null;
  setBootstrap: (v: SessionVerifyResponse | null) => void;

  active: SelectTenantResponse | null;
  setActive: (v: SelectTenantResponse | null) => void;

  activeTenantId: string | null;
  setActiveTenantId: (v: string | null) => void;

  enabledServices: Set<string>;
}

const AppStateContext = createContext<AppStateValue | undefined>(undefined);

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
    keys.add('arion_analytics_ia_cross_channel');
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

export function AppStateProvider({ children }: PropsWithChildren) {
  const [bootstrap, setBootstrap] = useState<SessionVerifyResponse | null>(null);
  const [active, setActive] = useState<SelectTenantResponse | null>(null);
  const [activeTenantId, setActiveTenantIdState] = useState<string | null>(() => loadStoredActiveTenantId());

  const enabledServices = useMemo(() => buildEnabledServices(active), [active]);

  function setActiveTenantId(v: string | null) {
    setActiveTenantIdState(v);
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
    enabledServices
  };

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState() {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error('useAppState must be used within AppStateProvider');
  return ctx;
}
