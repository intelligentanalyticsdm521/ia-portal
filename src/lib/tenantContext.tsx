// tenantContext — in-memory React context for "founder operating on a
// client tenant" mode. Lives only inside the ClientTenantModal; closing the
// modal drops the override and every API call falls back to the caller's
// own tenant.
//
// No localStorage. No global state beyond the module-level subscriber slot
// (which is only set while a TenantProvider is mounted, and reset on
// unmount). No banner. Open the modal → context is set → API hooks read it
// and send x-tenant-key: <client tenant_id>. Close the modal → context is
// unset → API hooks fall back to the caller's activeTenantId from AppState.
//
// Audit columns server-side still stamp the founder's identity from the
// JWT, so logs say "Brandon @ IA" with tenant scope = the client.
import { createContext, useContext, useEffect } from "react";
import type { PropsWithChildren } from "react";
import { useAppState } from "../app/AppState";

// ---------------------------------------------------------------------------
// React context
// ---------------------------------------------------------------------------

/**
 * TenantOverrideContext — when wrapped in a TenantProvider, this carries the
 * client tenant_id the founder is currently operating on. When NOT wrapped,
 * `useContext(...)` returns `null` and consumers fall through to AppState.
 */
export const TenantOverrideContext = createContext<string | null>(null);

interface TenantProviderProps {
  value: string | null;
}

/**
 * TenantProvider — wrap the ClientTenantModal's children with this.
 *
 * Also pumps the module-level subscriber slot so non-React fetch-time API
 * clients (which can't call hooks) can read the current override
 * synchronously via `getCurrentTenantOverride()`.
 */
export function TenantProvider({
  value,
  children
}: PropsWithChildren<TenantProviderProps>) {
  useEffect(() => {
    _currentOverride = value;
    _notify();
    return () => {
      _currentOverride = null;
      _notify();
    };
  }, [value]);

  return (
    <TenantOverrideContext.Provider value={value}>
      {children}
    </TenantOverrideContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// React hooks
// ---------------------------------------------------------------------------

/**
 * useEffectiveTenantId — returns the active tenant_id callers should scope
 * their API requests to.
 *
 * - If a TenantProvider is mounted above this component, returns its value
 *   (founder-impersonating-client mode).
 * - Otherwise, returns `useAppState().activeTenantId` byte-identically so
 *   call sites that never opt into impersonation see no behavioral change.
 */
export function useEffectiveTenantId(): string | null {
  const override = useContext(TenantOverrideContext);
  const { activeTenantId } = useAppState();
  return override !== null ? override : activeTenantId;
}

/**
 * useIsImpersonating — true iff a TenantProvider is mounted above this
 * component AND its value is a non-empty tenant_id. Use this to gate
 * impersonation-only UI affordances (e.g., "Exit client view" buttons).
 */
export function useIsImpersonating(): boolean {
  const override = useContext(TenantOverrideContext);
  return typeof override === "string" && override.length > 0;
}

/**
 * useClientTenantIdOverride — returns ONLY the override context value, or
 * `null` when no TenantProvider is mounted above. Does NOT subscribe to
 * AppState. This is critical for API hooks (useOliverApi/useLumenApi/
 * useSparkApi): subscribing to AppState here caused identity churn on
 * activeTenantId transitions, cascading into acquireTokenSilent →
 * InteractionRequiredAuthError → hard redirect loop. Callers that want
 * "override-or-active" should use `useEffectiveTenantId` explicitly.
 */
export function useClientTenantIdOverride(): string | null {
  return useContext(TenantOverrideContext);
}

// ---------------------------------------------------------------------------
// Module-level non-React subscriber API
//
// Fetch-time API clients (axios interceptors, ad-hoc fetch helpers) can't
// call React hooks. They need to read the current override synchronously
// from module scope. We keep one slot and a notify set; TenantProvider's
// effect is the only writer, and it always resets to `null` on unmount, so
// there's no risk of a stale override leaking past the modal closing.
// ---------------------------------------------------------------------------

let _currentOverride: string | null = null;
const _subs = new Set<(v: string | null) => void>();

function _notify() {
  for (const fn of _subs) {
    try {
      fn(_currentOverride);
    } catch {
      // Subscriber errors must not break other subscribers or the provider.
    }
  }
}

/**
 * getCurrentTenantOverride — synchronous read of the current override from
 * non-React code. Returns `null` when no TenantProvider is mounted.
 *
 * Callers that have access to AppState should still fall back to
 * `activeTenantId` themselves; this helper is intentionally scoped to "the
 * override only" so it mirrors `useContext(TenantOverrideContext)`.
 */
export function getCurrentTenantOverride(): string | null {
  return _currentOverride;
}

/**
 * subscribeTenantOverride — register a listener fired whenever the
 * override changes (set on mount, cleared on unmount). Returns an
 * unsubscribe function.
 */
export function subscribeTenantOverride(
  fn: (v: string | null) => void
): () => void {
  _subs.add(fn);
  return () => {
    _subs.delete(fn);
  };
}

