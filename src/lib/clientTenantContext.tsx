// clientTenantContext — in-memory React context for "founder operating on a
// client tenant" mode. Lives only inside the ClientTenantModal; closing the
// modal drops the override and every API call falls back to your iadm tenant.
//
// No localStorage. No global state. No banner. Open the modal → context is
// set → API hooks read it and send x-tenant-key: <client tenant_id>. Close
// the modal → context is unset → API hooks send your own iadm tenant_id.
//
// Audit columns server-side still stamp the founder's identity from the JWT,
// so logs say "Brandon @ IA" with tenant scope = the client.
import { createContext, useContext } from "react";

export interface ClientTenantValue {
  tenantId: string;
  tenantName?: string;
  /** Opening mode — drives what the modal renders. */
  mode: "onboarding" | "consulting";
}

const ClientTenantContext = createContext<ClientTenantValue | null>(null);

/** Provider — wrap the ClientTenantModal's children with this. */
export const ClientTenantProvider = ClientTenantContext.Provider;

/** Read the current client tenant override. null = operate on caller's own tenant. */
export function useClientTenant(): ClientTenantValue | null {
  return useContext(ClientTenantContext);
}

/** API-hook helper — returns the tenant_id to send as x-tenant-key, or null to use the JWT default. */
export function useClientTenantIdOverride(): string | null {
  const ctx = useContext(ClientTenantContext);
  return ctx?.tenantId || null;
}
