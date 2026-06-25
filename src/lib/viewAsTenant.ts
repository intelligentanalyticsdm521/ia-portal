/**
 * viewAsTenant.ts — Founder "View as tenant" read-only impersonation state.
 *
 * UX: Founder clicks "View as" from Consulting > Clients. The whole Portal
 * re-skins as that tenant — sidebar, dashboards, widgets — but with all
 * mutations server-blocked. Closing the banner reverts to the founder's own
 * iadm tenant context instantly with no reload.
 *
 * NOT to be confused with:
 *   - emergencyActAs (red banner, 30-min timer, audited, break-glass)
 *   - FounderTenantPicker's /super/select-tenant (full session swap; gated on
 *     isSuperUser; reserved for emergency)
 *   - ClientTenantModal (founder operates ON client data via authoring window;
 *     writes go through, scoped via x-tenant-key)
 *
 * Gating rules:
 *   - Entry point gated on bootstrap.user.isFounder (NOT isSuperUser).
 *   - Backend trusts the header ONLY when the caller's JWT resolves to a
 *     founder-tenant membership; otherwise it ignores the header.
 *   - When the header is present, backend treats the request as read-only —
 *     non-GET methods return 403.
 *
 * Why localStorage (not sessionStorage): Brandon wants this to survive tab
 * reloads while walking a client through the portal. There is no auto-expiry —
 * the only exit is the Exit button in the banner.
 *
 * Module is a tiny global store + subscription bus, persisted to localStorage
 * so a page reload doesn't drop the view. The non-hook API clients
 * (oliverApi.ts, arionApi.ts, etc.) read this on every fetch to inject the
 * x-view-as-tenant + x-view-as-mode headers + route to the correct tenant.
 */

const STORAGE_KEY = "iadm.portal.viewAsTenant.v1";

export interface ViewAsTenantState {
  /** Tenant being viewed (the client). */
  tenantId: string;
  tenantName: string;
  /** ISO timestamp when view-as was entered (informational only — no expiry). */
  startedAt: string;
}

type Listener = (state: ViewAsTenantState | null) => void;

let currentState: ViewAsTenantState | null = loadFromStorage();
const listeners = new Set<Listener>();

function loadFromStorage(): ViewAsTenantState | null {
  try {
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ViewAsTenantState;
    if (!parsed || !parsed.tenantId) return null;
    return parsed;
  } catch {
    return null;
  }
}

function persist(state: ViewAsTenantState | null) {
  try {
    if (typeof localStorage === "undefined") return;
    if (state) localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage denied (private mode etc.) — in-memory still works for the tab.
  }
}

function notify() {
  for (const l of listeners) {
    try {
      l(currentState);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("[viewAsTenant] listener threw:", err);
    }
  }
}

/** Read the current view-as state. null = not in view-as mode. */
export function getViewAsTenantState(): ViewAsTenantState | null {
  return currentState;
}

/** True if we should re-route API calls and inject view-as headers. */
export function isViewingAsTenant(): boolean {
  return currentState !== null;
}

/** The tenant_id to route API calls to, or null when not viewing-as. */
export function getViewAsTenantId(): string | null {
  return currentState?.tenantId || null;
}

/** Start a view-as session. */
export function startViewAsTenant(tenantId: string, tenantName: string): void {
  const trimmed = (tenantId || "").trim();
  if (!trimmed) return;
  currentState = {
    tenantId: trimmed,
    tenantName: tenantName || trimmed,
    startedAt: new Date().toISOString(),
  };
  persist(currentState);
  notify();
}

/** Exit view-as (drops the override; founder's own tenant is back in effect). */
export function exitViewAsTenant(): void {
  currentState = null;
  persist(null);
  notify();
}

/** Subscribe to view-as state changes. Returns unsubscribe. */
export function subscribeViewAsTenant(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Header builder for view-as mode. Returns:
 *   - x-view-as-tenant: <tid>     — target tenant id the founder is viewing
 *   - x-view-as-mode: read_only   — backend enforces 403 on non-GET
 * Returns empty object when not in view-as mode.
 *
 * Spread into fetch headers alongside Authorization / x-tenant-key.
 */
export function viewAsTenantHeaders(): Record<string, string> {
  if (!currentState) return {};
  return {
    "x-view-as-tenant": currentState.tenantId,
    "x-view-as-mode": "read_only",
  };
}
