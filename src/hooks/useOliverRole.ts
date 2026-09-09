/**
 * useOliverRole — Loads the caller's role + capability flags for THIS business.
 * Cached in module-scoped state so every consumer shares one round trip.
 *
 * TWO DOORS ONTO ONE PERSON (STELLA pack 2, item 11c). GET /overview/me sits
 * behind the field-service entitlement, so a business that bought the
 * bookkeeping and not OLIVER could never resolve an accountant: the role row
 * could be written and nothing could read it back, and "invite my accountant"
 * is an easy thing to promise on a call. When that door is shut, this asks the
 * bookkeeping one — GET /ledger/me — which returns the SAME payload from the
 * same shared module on the server, so the two can never describe one person
 * differently.
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
import { useStellaApi } from "./useStellaApi";

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
  const stella = useStellaApi();
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
        // The field-service door is not open to this business. Try the
        // bookkeeping one before giving up — a STELLA-only business has an
        // accountant too. One extra request, and only for those businesses.
        .catch(() => stella.get<OliverRoleInfo>("/ledger/me")
          .then((r) => {
            cachedRoleInfo = r;
            return r;
          }))
        .catch(() => {
          // Neither door answered. Default to admin so we never lock out a
          // real user over a transient network glitch.
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
  }, [ready, get, stella]);

  return { roleInfo, ready: resolved };
}
