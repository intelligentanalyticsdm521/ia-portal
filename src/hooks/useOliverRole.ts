/**
 * useOliverRole — Loads the caller's OLIVER role + capability flags from
 * GET /overview/me. Cached in module-scoped state so every consumer shares
 * one network round-trip per session.
 *
 * Returned shape mirrors the API:
 *   role: 'admin' | 'accountant'
 *   capabilities: granular booleans for hiding write controls
 *   allowedServiceKeys: null = "show every OLIVER nav item", array = "filter"
 *
 * Default while loading is { role: 'admin', allowedServiceKeys: null } so
 * the UI doesn't flash a restricted view for admin users.
 */

import { useEffect, useState } from "react";
import { useOliverApi } from "./useOliverApi";

export interface OliverRoleInfo {
  role: "admin" | "accountant";
  capabilities: {
    canMutateJobs: boolean;
    canMutateQuotes: boolean;
    canMutateInvoices: boolean;
    canMutateWorkers: boolean;
    canViewMessages: boolean;
    canViewDispatch: boolean;
  };
  allowedServiceKeys: string[] | null;
}

const DEFAULT_ROLE_INFO: OliverRoleInfo = {
  role: "admin",
  capabilities: {
    canMutateJobs: true,
    canMutateQuotes: true,
    canMutateInvoices: true,
    canMutateWorkers: true,
    canViewMessages: true,
    canViewDispatch: true,
  },
  allowedServiceKeys: null,
};

let cachedRoleInfo: OliverRoleInfo | null = null;
let inflight: Promise<OliverRoleInfo> | null = null;

export function useOliverRole(): { roleInfo: OliverRoleInfo; ready: boolean } {
  const { get, ready } = useOliverApi();
  const [roleInfo, setRoleInfo] = useState<OliverRoleInfo>(
    cachedRoleInfo ?? DEFAULT_ROLE_INFO,
  );
  const [resolved, setResolved] = useState<boolean>(cachedRoleInfo !== null);

  useEffect(() => {
    if (!ready || cachedRoleInfo) return;
    let cancelled = false;
    const p =
      inflight ||
      (inflight = get<OliverRoleInfo>("/overview/me")
        .then((r) => {
          cachedRoleInfo = r;
          return r;
        })
        .catch(() => {
          // On error, default to admin so we never lock out a real user
          // because of a transient network glitch.
          cachedRoleInfo = DEFAULT_ROLE_INFO;
          return DEFAULT_ROLE_INFO;
        })
        .finally(() => {
          inflight = null;
        }));

    p.then((r) => {
      if (!cancelled) {
        setRoleInfo(r);
        setResolved(true);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [ready, get]);

  return { roleInfo, ready: resolved };
}
