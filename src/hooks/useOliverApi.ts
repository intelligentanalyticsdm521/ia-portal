/**
 * useOliverApi — Hook that provides typed OLIVER API methods
 * bound to the current MSAL account. Parses tier-gate 403s.
 */

import { useCallback, useMemo } from "react";
import { useMsal } from "@azure/msal-react";
import { oliverGet, oliverPost, oliverPatch, oliverDelete } from "../lib/oliverApi";

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

  const get = useCallback(
    <T>(path: string) => oliverGet<T>(instance, account, path),
    [instance, account]
  );

  const post = useCallback(
    <T>(path: string, body?: unknown) => oliverPost<T>(instance, account, path, body),
    [instance, account]
  );

  const patch = useCallback(
    <T>(path: string, body: unknown) => oliverPatch<T>(instance, account, path, body),
    [instance, account]
  );

  const del = useCallback(
    <T>(path: string) => oliverDelete<T>(instance, account, path),
    [instance, account]
  );

  // Stable object identity — prevents consumers keyed on this hook's result
  // from re-fetching on every render (fetch once per page, not per render).
  return useMemo(
    () => ({ get, post, patch, del, ready: !!account }),
    [get, post, patch, del, account]
  );
}
