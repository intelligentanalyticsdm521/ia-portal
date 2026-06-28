/**
 * useOliverApi — Hook that provides typed OLIVER API methods
 * bound to the current MSAL account. Parses tier-gate 403s.
 */

import { useCallback, useMemo } from "react";
import { useMsal } from "@azure/msal-react";
import { oliverGet, oliverPost, oliverPatch, oliverPut, oliverDelete, BYPASS_TENANT_OVERRIDE } from "../lib/oliverApi";
import { useClientTenantIdOverride } from "../lib/clientTenantContext";
import { useIsFounder } from "./useIsFounder";

export interface TierGateError {
  type: "tier_gate";
  tierRequired: string;
  currentTier: string;
}

export function isTierGateError(err: unknown): err is TierGateError {
  return (
    typeof err === "object" &&
    err !== null &&
    "type" in err &&
    (err as TierGateError).type === "tier_gate"
  );
}

export function useOliverApi() {
  const { instance, accounts } = useMsal();
  const account = accounts[0];
  // If we're inside a ClientTenantModal, this returns the client's tenant_id.
  // Otherwise null — API calls go to the caller's own tenant from their JWT.
  const tenantOverride = useClientTenantIdOverride();

  const get = useCallback(
    <T>(path: string) => oliverGet<T>(instance, account, path, tenantOverride),
    [instance, account, tenantOverride]
  );

  const post = useCallback(
    <T>(path: string, body?: unknown) => oliverPost<T>(instance, account, path, body, tenantOverride),
    [instance, account, tenantOverride]
  );

  const patch = useCallback(
    <T>(path: string, body: unknown) => oliverPatch<T>(instance, account, path, body, tenantOverride),
    [instance, account, tenantOverride]
  );

  const put = useCallback(
    <T>(path: string, body: unknown) => oliverPut<T>(instance, account, path, body, tenantOverride),
    [instance, account, tenantOverride]
  );

  const del = useCallback(
    <T>(path: string) => oliverDelete<T>(instance, account, path, tenantOverride),
    [instance, account, tenantOverride]
  );

  // Founder-scoped variants. These IGNORE the ClientTenantModal override
  // AND any active view-as session, and always send the caller's own
  // tenant_id (from their JWT). Used inside the modal for
  // `/admin/onboard-client/*` endpoints, which are gated by requireFounder
  // (caller tenant must = FOUNDER_TENANT_ID). Without BYPASS_TENANT_OVERRIDE the
  // view-as state would re-route founder admin calls to the client tenant
  // and break the founder gate.
  //
  // 2026-06-27 (N-09) Defense-in-depth client-side gate. The backend
  // requireFounder middleware is still the security boundary, but if a
  // non-founder transiently has access (XSS, role-cache staleness, view-as
  // bug) the unguarded getFounder/postFounder would let them probe founder
  // endpoints and neutralize view-as overrides. Throwing here makes
  // misuse obvious in the console and easier to detect in logs.
  //
  // 2026-06-28 — Use isFounder (NOT useIsSuperAdmin) per the role-access-model
  // rule. Brandon is Founder, not super_admin. useIsSuperAdmin returns false
  // for him by design (no super_admin/platform_admin role + not in env
  // allow-list), so the original N-09 gate was rejecting his legitimate
  // /admin/onboard-client and /consulting/* founder calls.
  const isFounder = useIsFounder();
  const getFounder = useCallback(
    <T>(path: string): Promise<T> => {
      if (!isFounder) {
        return Promise.reject(new Error("getFounder called by non-founder — backend requireFounder will 403 this request"));
      }
      return oliverGet<T>(instance, account, path, BYPASS_TENANT_OVERRIDE);
    },
    [instance, account, isFounder]
  );
  const postFounder = useCallback(
    <T>(path: string, body?: unknown): Promise<T> => {
      if (!isFounder) {
        return Promise.reject(new Error("postFounder called by non-founder — backend requireFounder will 403 this request"));
      }
      return oliverPost<T>(instance, account, path, body, BYPASS_TENANT_OVERRIDE);
    },
    [instance, account, isFounder]
  );

  // Stable object identity — prevents consumers keyed on this hook's result
  // from re-fetching on every render (fetch once per page, not per render).
  return useMemo(
    () => ({ get, post, patch, put, del, getFounder, postFounder, ready: !!account }),
    [get, post, patch, put, del, getFounder, postFounder, account]
  );
}
