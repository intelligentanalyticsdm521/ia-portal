import type { PropsWithChildren } from 'react';
import { createContext, useContext, useMemo, useState } from 'react';
import type { VerifyResponse, PortalContext } from '../lib/platformApi';

interface AppStateValue {
  tenantKey: string;
  setTenantKey: (v: string) => void;
  portalContext: PortalContext;
  setPortalContext: (v: PortalContext) => void;
  session: VerifyResponse | null;
  setSession: (s: VerifyResponse | null) => void;
  enabledServices: Set<string>;
}

const AppStateContext = createContext<AppStateValue | undefined>(undefined);

const STORAGE_KEYS = {
  tenantKey: 'iadm.portal.tenantKey',
  portalContext: 'iadm.portal.portalContext'
};

function loadStoredTenantKey(): string {
  const stored = localStorage.getItem(STORAGE_KEYS.tenantKey);
  if (stored && stored.trim()) return stored.trim();
  return import.meta.env.VITE_DEFAULT_TENANT_ID?.trim() || '';
}

function loadStoredPortalContext(): PortalContext {
  const stored = (localStorage.getItem(STORAGE_KEYS.portalContext) || '').trim().toLowerCase();
  if (stored === 'employee') return 'employee';
  return 'customer';
}

function loadEnabledServices(): Set<string> {
  const raw = import.meta.env.VITE_ENABLED_SERVICES || '';
  const keys = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return new Set(keys);
}

export function AppStateProvider({ children }: PropsWithChildren) {
  const [tenantKey, setTenantKeyState] = useState<string>(() => loadStoredTenantKey());
  const [portalContext, setPortalContextState] = useState<PortalContext>(() => loadStoredPortalContext());
  const [session, setSession] = useState<VerifyResponse | null>(null);

  const enabledServices = useMemo(() => loadEnabledServices(), []);

  function setTenantKey(v: string) {
    const next = v.trim();
    setTenantKeyState(next);
    localStorage.setItem(STORAGE_KEYS.tenantKey, next);
  }

  function setPortalContext(v: PortalContext) {
    setPortalContextState(v);
    localStorage.setItem(STORAGE_KEYS.portalContext, v);
  }

  const value: AppStateValue = {
    tenantKey,
    setTenantKey,
    portalContext,
    setPortalContext,
    session,
    setSession,
    enabledServices
  };

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState() {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error('useAppState must be used within AppStateProvider');
  return ctx;
}
