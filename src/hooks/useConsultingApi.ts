/**
 * useConsultingApi — Hook for consulting endpoints on oliver-api
 * Uses the same oliver-api base URL but hits /consulting/* endpoints
 * which use lighter auth (no requireOliverAccess — consulting is platform-level)
 */

import { useCallback } from "react";
import { useMsal } from "@azure/msal-react";
import { useActiveAccount } from "../auth/useAccessToken";
import { oliverGet, oliverPost } from "../lib/oliverApi";

export function useConsultingApi() {
  const { instance } = useMsal();
  // NOT accounts[0] — under VITE_DEV_AUTH=1 there is no MSAL session, so that is
  // permanently undefined and every account-gated fetch silently never fires.
  const account = useActiveAccount();

  const get = useCallback(
    <T>(path: string) => oliverGet<T>(instance, account, path),
    [instance, account]
  );

  const post = useCallback(
    <T>(path: string, body?: unknown) => oliverPost<T>(instance, account, path, body),
    [instance, account]
  );

  return { get, post, ready: !!account };
}
