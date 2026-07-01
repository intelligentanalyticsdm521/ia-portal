// clientTenantContext — DEPRECATED thin re-export shim.
//
// This module has been renamed to `./tenantContext`. Existing call sites
// keep working through the re-exports below; new code should import from
// `./tenantContext` directly. Removed in the Cleanup phase.
import { createContext, useContext } from "react";
import type { PropsWithChildren } from "react";
import { TenantProvider, useEffectiveTenantId } from "./tenantContext";

export { useEffectiveTenantId, useClientTenantIdOverride } from "./tenantContext";

/**
 * @deprecated Legacy shape carrying the client tenant_id plus display
 * metadata and the modal's opening mode. The new `TenantProvider` takes a
 * bare `value: string | null` — callers should migrate and read display
 * metadata from AppState / lumen.account instead.
 */
export interface ClientTenantValue {
  tenantId: string;
  tenantName?: string;
  /** Opening mode — drives what the modal renders. */
  mode: "onboarding" | "consulting";
}

// Legacy context that still carries the rich value so `useClientTenant()`
// keeps working for call sites that read `tenantName` / `mode`. The new
// TenantProvider (which carries only the tenant_id string) is also pumped
// in parallel so fetch-time API clients see the override too.
const LegacyClientTenantContext = createContext<ClientTenantValue | null>(null);

interface ClientTenantProviderProps {
  value: ClientTenantValue;
}

/**
 * @deprecated Use `TenantProvider` from `./tenantContext` instead. This
 * shim bridges the legacy `{ tenantId, tenantName, mode }` shape onto the
 * new bare-string `TenantProvider`.
 */
export function ClientTenantProvider({
  value,
  children
}: PropsWithChildren<ClientTenantProviderProps>) {
  return (
    <LegacyClientTenantContext.Provider value={value}>
      <TenantProvider value={value.tenantId || null}>{children}</TenantProvider>
    </LegacyClientTenantContext.Provider>
  );
}

/**
 * @deprecated Read display metadata from AppState / lumen.account and the
 * effective tenant_id from `useEffectiveTenantId`. Returns the full legacy
 * value object during the migration window.
 */
export function useClientTenant(): ClientTenantValue | null {
  return useContext(LegacyClientTenantContext);
}
