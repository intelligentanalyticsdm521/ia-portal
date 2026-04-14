/**
 * useConsultingApi — Hook for consulting endpoints on oliver-api
 * Uses the same oliver-api base URL but hits /consulting/* endpoints
 * which use lighter auth (no requireOliverAccess — consulting is platform-level)
 */

import { useCallback } from "react";
import { useMsal } from "@azure/msal-react";
import { oliverGet, oliverPost } from "../lib/oliverApi";

export function useConsultingApi() {
  const { instance, accounts } = useMsal();
  const account = accounts[0];

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
