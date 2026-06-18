import { useCallback, useMemo } from "react";
import { useMsal } from "@azure/msal-react";
import { sparkGet, sparkPost, sparkPut, sparkPatch, sparkDelete } from "../lib/sparkApi";
import { useClientTenantIdOverride } from "../lib/clientTenantContext";

export function useSparkApi() {
  const { instance, accounts } = useMsal();
  const account = accounts[0];
  const tenantOverride = useClientTenantIdOverride();

  const get = useCallback(<T>(path: string) => sparkGet<T>(instance, account, path, tenantOverride), [instance, account, tenantOverride]);
  const post = useCallback(<T>(path: string, body?: unknown) => sparkPost<T>(instance, account, path, body, tenantOverride), [instance, account, tenantOverride]);
  const put = useCallback(<T>(path: string, body: unknown) => sparkPut<T>(instance, account, path, body, tenantOverride), [instance, account, tenantOverride]);
  const patch = useCallback(<T>(path: string, body: unknown) => sparkPatch<T>(instance, account, path, body, tenantOverride), [instance, account, tenantOverride]);
  const del = useCallback(<T>(path: string) => sparkDelete<T>(instance, account, path, tenantOverride), [instance, account, tenantOverride]);

  // Stable object identity — without this every consumer that lists the hook
  // result (or a spread of it) in a useEffect/useCallback dep array re-fetches
  // on EVERY render instead of once per page. That's wasted API spend.
  return useMemo(
    () => ({ get, post, put, patch, del, ready: !!account }),
    [get, post, put, patch, del, account]
  );
}
