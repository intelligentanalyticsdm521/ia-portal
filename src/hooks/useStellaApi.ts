/**
 * useStellaApi — Hook that provides typed STELLA (Ledger + Unit Economics) API
 * methods bound to the current MSAL account. Mirrors useOliverApi exactly:
 * parses tier-gate 403s, honours the ClientTenantModal tenant override, and
 * returns a stable object identity so consumers fetch once per page (not per
 * render).
 */

import { useCallback, useMemo } from "react";
import { useMsal } from "@azure/msal-react";
import { useActiveAccount } from "../auth/useAccessToken";
import { stellaGet, stellaGetFull, stellaPost, stellaPostFull, stellaPatch, stellaPut, stellaDelete } from "../lib/stellaApi";
import { useClientTenantIdOverride } from "../lib/clientTenantContext";

// Re-export the shared tier-gate helpers so STELLA pages don't duplicate them.
export { isTierGateError, type TierGateError } from "./useOliverApi";

export function useStellaApi() {
  const { instance } = useMsal();
  // NOT accounts[0] — under VITE_DEV_AUTH=1 there is no MSAL session, so that is
  // permanently undefined and every account-gated fetch silently never fires.
  const account = useActiveAccount();
  // If we're inside a ClientTenantModal, this returns the client's tenant_id.
  // Otherwise null — API calls go to the caller's own tenant from their JWT.
  const tenantOverride = useClientTenantIdOverride();

  const get = useCallback(
    <T>(path: string) => stellaGet<T>(instance, account, path, tenantOverride),
    [instance, account, tenantOverride]
  );

  // Layer 3 (Database Manager / Custom Reporting): keeps the whole envelope.
  // Those endpoints return `columns`, `pagination` and `meta` alongside `data`,
  // and the unwrapping `get` throws all three away.
  const getFull = useCallback(
    <T>(path: string) => stellaGetFull<T>(instance, account, path, tenantOverride),
    [instance, account, tenantOverride]
  );

  const post = useCallback(
    <T>(path: string, body?: unknown) => stellaPost<T>(instance, account, path, body, tenantOverride),
    [instance, account, tenantOverride]
  );

  const postFull = useCallback(
    <T>(path: string, body?: unknown) => stellaPostFull<T>(instance, account, path, body, tenantOverride),
    [instance, account, tenantOverride]
  );

  const patch = useCallback(
    <T>(path: string, body: unknown) => stellaPatch<T>(instance, account, path, body, tenantOverride),
    [instance, account, tenantOverride]
  );

  const put = useCallback(
    <T>(path: string, body: unknown) => stellaPut<T>(instance, account, path, body, tenantOverride),
    [instance, account, tenantOverride]
  );

  const del = useCallback(
    <T>(path: string) => stellaDelete<T>(instance, account, path, tenantOverride),
    [instance, account, tenantOverride]
  );

  // Stable object identity — prevents consumers keyed on this hook's result
  // from re-fetching on every render (fetch once per page, not per render).
  return useMemo(
    () => ({ get, getFull, post, postFull, patch, put, del, ready: !!account }),
    [get, getFull, post, postFull, patch, put, del, account]
  );
}
