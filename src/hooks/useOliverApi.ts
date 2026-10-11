/**
 * useOliverApi — Hook that provides typed OLIVER API methods
 * bound to the current MSAL account. Parses tier-gate 403s.
 */

import { useCallback, useMemo } from "react";
import { useMsal } from "@azure/msal-react";
import { useActiveAccount } from "../auth/useAccessToken";
import { oliverGet, oliverPost, oliverPatch, oliverPut, oliverDelete, oliverUpload, oliverDownload, oliverBlob, BYPASS_TENANT_OVERRIDE } from "../lib/oliverApi";
import { useClientTenantIdOverride } from "../lib/clientTenantContext";
import type { PlanRefusal } from "../lib/planRefusal";
import { useIsFounder } from "./useIsFounder";

/** A plan refusal from any API (lib/planRefusal): the catalog key, its `needs`
 *  ("SPARK Business") and the API's sentence; an older API's tier verbatim. */
export type TierGateError = PlanRefusal;

export function isTierGateError(err: unknown): err is TierGateError {
  return (
    typeof err === "object" &&
    err !== null &&
    "type" in err &&
    (err as TierGateError).type === "tier_gate"
  );
}

export function useOliverApi() {
  const { instance } = useMsal();
  // NOT accounts[0] — under VITE_DEV_AUTH=1 there is no MSAL session, so that is
  // permanently undefined and every account-gated fetch silently never fires.
  const account = useActiveAccount();
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

  // Founder-scoped PATCH — same rationale as postFounder: a lingering view-as
  // override would send a client tenant, requireFounder-family checks would
  // see a non-founder caller, and a founder transition would 400/403.
  const patchFounder = useCallback(
    <T>(path: string, body: unknown): Promise<T> => {
      if (!isFounder) {
        return Promise.reject(new Error("patchFounder called by non-founder — backend founder gate will reject this request"));
      }
      return oliverPatch<T>(instance, account, path, body, BYPASS_TENANT_OVERRIDE);
    },
    [instance, account, isFounder]
  );

  // Client-scoped multipart upload. Distinct from uploadFounder: the client
  // markup endpoint is NOT founder-gated (it is the one upload a client may
  // do), so this must NOT reject non-founders. Tenant scoping still comes
  // from the caller's own JWT via oliverFetchRaw.
  const uploadClient = useCallback(
    <T>(path: string, form: FormData): Promise<T> => oliverUpload<T>(instance, account, path, form),
    [instance, account]
  );

  // Multipart upload — founder-scoped like postFounder (the upload endpoints
  // are requireFounder-gated, so an active view-as override would 403 them).
  const uploadFounder = useCallback(
    <T>(path: string, form: FormData): Promise<T> => {
      if (!isFounder) {
        return Promise.reject(new Error("uploadFounder called by non-founder — backend requireFounder will 403 this request"));
      }
      return oliverUpload<T>(instance, account, path, form);
    },
    [instance, account, isFounder]
  );

  // Authenticated binary download. Private-container files are streamed by the
  // API behind its tenant guard, so a plain <a href> to the blob URL cannot
  // work — it has no bearer token and the container denies anonymous reads.
  const download = useCallback(
    (path: string, filename: string): Promise<void> =>
      oliverDownload(instance, account, path, filename),
    [instance, account]
  );

  // The BYTES of a private file, as a Blob. The Files card (D-136) renders a
  // thumbnail and opens a PDF from the same guarded endpoint, neither of which
  // is a save-to-disk — so `download` cannot serve either.
  const fetchBlob = useCallback(
    (path: string): Promise<Blob> => oliverBlob(instance, account, path),
    [instance, account]
  );

  // Stable object identity — prevents consumers keyed on this hook's result
  // from re-fetching on every render (fetch once per page, not per render).
  return useMemo(
    () => ({ get, post, patch, put, del, getFounder, postFounder, patchFounder, uploadFounder, uploadClient, download, fetchBlob, ready: !!account }),
    [get, post, patch, put, del, getFounder, postFounder, patchFounder, uploadFounder, uploadClient, download, fetchBlob, account]
  );
}
