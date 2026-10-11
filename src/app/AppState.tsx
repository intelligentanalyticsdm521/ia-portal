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

  /**
   * PRODUCT-level entitlements ("arion" | "oliver" | "spark" | …) exactly as
   * recorded in core.tenant_services, from the sign-in. Use THIS (or
   * useProductAccess, which follows a mid-session switch-off) to answer "does
   * the business own this product?". Which PAGES it may open is the feature
   * catalog's answer: hooks/useEnabledServices.
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

// 2026-10-11 (feature catalog, SCOPE_FEATURE_CATALOG_2026-10-11 §2.5): the
// hand-written buildEnabledServices (an ARION key list, two OLIVER keys, the
// HESTIA keys, the February session `features` and a VITE_ENABLED_SERVICES
// seam that every env file left empty) is deleted. The keys a business may
// open are the catalog answer's: hooks/useEnabledServices.

/**
 * The tenant's PRODUCT-level entitlements, straight from the session response —
 * i.e. exactly the `core.tenant_services` rows with `is_enabled = 1`
 * ("arion" | "oliver" | "spark" | "argus" | "stella" | "forge" | …).
 *
 * Needs no per-product maintenance. With no session payload (the set is
 * empty) callers fall back to the platform-api answer — see IconRail.
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
    ownedProducts
  };

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState() {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error('useAppState must be used within AppStateProvider');
  return ctx;
}
