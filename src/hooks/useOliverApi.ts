/**
 * useOliverApi — Hook that provides typed OLIVER API methods
 * bound to the current MSAL account. Parses tier-gate 403s.
 */

import { useCallback, useMemo } from "react";
import { useMsal } from "@azure/msal-react";
import { oliverGet, oliverPost, oliverPatch, oliverPut, oliverDelete, BYPASS_VIEW_AS } from "../lib/oliverApi";
import { useClientTenantIdOverride } from "../lib/clientTenantContext";

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
  // (caller tenant must = FOUNDER_TENANT_ID). Without BYPASS_VIEW_AS the
  // view-as state would re-route founder admin calls to the client tenant
  // and break the founder gate.
  const getFounder = useCallback(
    <T>(path: string) => oliverGet<T>(instance, account, path, BYPASS_VIEW_AS),
    [instance, account]
  );
  const postFounder = useCallback(
    <T>(path: string, body?: unknown) => oliverPost<T>(instance, account, path, body, BYPASS_VIEW_AS),
    [instance, account]
  );

  // Stable object identity — prevents consumers keyed on this hook's result
  // from re-fetching on every render (fetch once per page, not per render).
  return useMemo(
    () => ({ get, post, patch, put, del, getFounder, postFounder, ready: !!account }),
    [get, post, patch, put, del, getFounder, postFounder, account]
  );
}
