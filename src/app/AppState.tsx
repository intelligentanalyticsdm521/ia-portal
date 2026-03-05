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

  // ARION: if the tenant has the ARION service enabled, light up the ARION section.
  if (activeServiceKeys.has('arion')) {
    keys.add('arion_websites');
    keys.add('arion_hosting');
    keys.add('arion_domains');
  }

  // Future-safe: if any feature keys match portal routes directly, honor them.
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
