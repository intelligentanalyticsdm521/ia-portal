/**
 * useUserAccess — fetches the caller's platform-level role + product access
 * from platform-api /me/access. Returns null until loaded so callers can
 * fall back to "all access" defaults if necessary.
 */
import { useCallback, useEffect, useState } from "react";
import { useMsal } from "@azure/msal-react";
import { authScopes } from "../auth/msalConfig";
import { useAppState } from "../app/AppState";
import { getMeAccess, type MeAccessResponse } from "../lib/platformApi";

export function useUserAccess() {
  const { instance, accounts } = useMsal();
  const account = accounts[0];
  const { active } = useAppState();
  const [access, setAccess] = useState<MeAccessResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(async () => {
    if (!account || !active?.tenant?.tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await instance.acquireTokenSilent({ scopes: authScopes, account });
      const r = await getMeAccess({
        baseUrl: import.meta.env.VITE_PLATFORM_API_BASE_URL,
        bearerToken: res.accessToken,
        tenantId: active.tenant.tenantId,
      });
      setAccess(r);
    } catch (e) {
      setError(e);
      // Fail-open: treat as admin with full access so we don't lock users out
      // when /me/access isn't yet deployed. Pages can still tier-gate.
      setAccess({
        role: "admin",
        products: ["arion", "oliver", "spark", "stella", "forge", "argus", "consulting"],
        capabilities: { canManageUsers: true, canViewBilling: true, canMutate: true },
      });
    } finally {
      setLoading(false);
    }
  }, [instance, account, active?.tenant?.tenantId]);

  useEffect(() => { load(); }, [load]);

  return {
    access,
    loading,
    error,
    refresh: load,
    isAdmin: access?.role === "admin",
    canManageUsers: !!access?.capabilities?.canManageUsers,
    canMutate: !!access?.capabilities?.canMutate,
    hasProduct: (key: string) => !access || access.products.includes(key),
  };
}
