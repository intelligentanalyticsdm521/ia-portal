/**
 * useOliverApi — Hook that provides typed OLIVER API methods
 * bound to the current MSAL account. Use in any OLIVER portal page.
 */

import { useCallback } from "react";
import { useMsal } from "@azure/msal-react";
import { oliverGet, oliverPost, oliverPatch, oliverDelete } from "../lib/oliverApi";

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

  return { get, post, patch, del, ready: !!account };
}
