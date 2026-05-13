import { useCallback } from "react";
import { useMsal } from "@azure/msal-react";
import { sparkGet, sparkPost, sparkPut, sparkPatch, sparkDelete } from "../lib/sparkApi";

export function useSparkApi() {
  const { instance, accounts } = useMsal();
  const account = accounts[0];

  const get = useCallback(<T>(path: string) => sparkGet<T>(instance, account, path), [instance, account]);
  const post = useCallback(<T>(path: string, body?: unknown) => sparkPost<T>(instance, account, path, body), [instance, account]);
  const put = useCallback(<T>(path: string, body: unknown) => sparkPut<T>(instance, account, path, body), [instance, account]);
  const patch = useCallback(<T>(path: string, body: unknown) => sparkPatch<T>(instance, account, path, body), [instance, account]);
  const del = useCallback(<T>(path: string) => sparkDelete<T>(instance, account, path), [instance, account]);

  return { get, post, put, patch, del, ready: !!account };
}
