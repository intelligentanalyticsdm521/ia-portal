/**
 * useLumenApi — MSAL-bound LUMEN API methods.
 *
 * Identical shape to useSparkApi / useOliverApi (get/post/put/patch/del +
 * `ready` flag), so My Brand pages copy-paste cleanly from any existing
 * page that already uses one of the other product hooks.
 *
 * Stable identity via useMemo — consumers can list this in dep arrays
 * without triggering a refetch on every render.
 */

import { useCallback, useMemo } from "react";
import { useMsal } from "@azure/msal-react";
import { lumenGet, lumenPost, lumenPut, lumenPatch, lumenDelete } from "../lib/lumenApi";
import { useClientTenantIdOverride } from "../lib/clientTenantContext";

export function useLumenApi() {
  const { instance, accounts } = useMsal();
  const account = accounts[0];
  // Founder ClientTenantModal override — when set, hits the LUMEN-API as
  // that client's tenant via x-tenant-id. Otherwise the JWT's tid is used.
  const tenantOverride = useClientTenantIdOverride();

  const get = useCallback(
    <T>(path: string) => lumenGet<T>(instance, account, path, tenantOverride),
    [instance, account, tenantOverride]
  );

  const post = useCallback(
    <T>(path: string, body?: unknown) => lumenPost<T>(instance, account, path, body, tenantOverride),
    [instance, account, tenantOverride]
  );

  const put = useCallback(
    <T>(path: string, body: unknown) => lumenPut<T>(instance, account, path, body, tenantOverride),
    [instance, account, tenantOverride]
  );

  const patch = useCallback(
    <T>(path: string, body: unknown) => lumenPatch<T>(instance, account, path, body, tenantOverride),
    [instance, account, tenantOverride]
  );

  const del = useCallback(
    <T>(path: string) => lumenDelete<T>(instance, account, path, tenantOverride),
    [instance, account, tenantOverride]
  );

  return useMemo(
    () => ({ get, post, put, patch, del, ready: !!account }),
    [get, post, put, patch, del, account]
  );
}
