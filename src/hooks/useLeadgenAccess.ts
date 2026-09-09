/**
 * useLeadgenAccess — "may this business run a lead search?", answered by the
 * server that enforces it.
 *
 * WHAT THIS REPLACES
 * ------------------
 * Hotfix B (2026-09-03) hid every Lead Gen search surface behind `isFounder` in
 * five places in this app, and LUMEN refused the routes for any tenant but the
 * agency's. That made the thing being verified — a REAL client running a REAL
 * paid search and getting a REAL invoice — impossible to verify.
 *
 * LUMEN's gate is an ALLOW-LIST now (`LEADGEN_TENANT_ALLOWLIST`, see
 * services/leadgen/accessAllowlist.js), and a list in a server setting is not
 * something a static front-end build can read. So the front end asks:
 * GET /api/v1/leadgen/access returns `{ allowed, reason, message }` from the
 * same module that gates the routes. The menu and the server therefore cannot
 * disagree — which was the point of the `isFounder` checks and is now true for a
 * reason instead of by coincidence.
 *
 * FAIL DIRECTION — CLOSED WHILE UNRESOLVED, and this is the one place in the nav
 * that does that on purpose. `navVisibility`'s standing rule is fail-OPEN, because
 * an unresolved TIER must never lock a paying customer out of what they bought.
 * This is not a tier: it is a rollout gate on a surface that SPENDS MONEY, and
 * LUMEN refuses the routes behind it regardless. Showing "New B2B Lead Search"
 * to somebody whose first click will 403 is worse than not showing it yet, so an
 * unresolved answer renders nothing rather than a promise.
 *
 * ONE FETCH PER BUSINESS. Cached per tenant id for the tab's lifetime: five nav
 * consumers ask this on every render and the answer changes when a setting
 * changes, not between two renders.
 */
import { useEffect, useState } from 'react';
import { useSparkApi } from './useSparkApi';
import { useAppState } from '../app/AppState';

export type LeadgenAccess = {
  /** null = not resolved yet. Treat as locked; see the fail-direction note. */
  allowed: boolean | null;
  /** Why, in the client's words. Null when allowed, or when unresolved. */
  message: string | null;
  /** Server-side reason code, for a walk row and for the console. */
  reason: string | null;
};

const UNRESOLVED: LeadgenAccess = { allowed: null, message: null, reason: null };

type Payload = { data?: { allowed?: boolean; reason?: string | null; message?: string | null } };

// tenant id → the resolved answer. Survives navigation inside the tab, which is
// what stops five nav consumers making five requests on every route change.
const cache = new Map<string, LeadgenAccess>();

/** Test seam + the escape hatch for a tenant switch in the same tab. */
export function _clearLeadgenAccessCache() { cache.clear(); }

export function useLeadgenAccess(): LeadgenAccess {
  const { get, ready } = useSparkApi();
  const { activeTenantId } = useAppState();
  const key = (activeTenantId || '').toLowerCase();
  const [state, setState] = useState<LeadgenAccess>(() => cache.get(key) || UNRESOLVED);

  useEffect(() => {
    if (!ready || !key) return;
    const cached = cache.get(key);
    if (cached) { setState(cached); return; }
    let cancelled = false;
    setState(UNRESOLVED); // never show the PREVIOUS business's answer
    (async () => {
      try {
        const r = await get<Payload>('/api/v1/leadgen/access');
        const d = r?.data || {};
        const resolved: LeadgenAccess = {
          allowed: !!d.allowed,
          message: d.message ?? null,
          reason: d.reason ?? null,
        };
        cache.set(key, resolved);
        if (!cancelled) setState(resolved);
      } catch (err) {
        // NOT swallowed into a silent "no". The console says what happened, and
        // the state stays unresolved — which renders nothing rather than
        // rendering a wrong answer in either direction.
        console.error('[useLeadgenAccess] could not resolve Lead Gen access — surfaces stay hidden.', err);
        if (!cancelled) setState(UNRESOLVED);
      }
    })();
    return () => { cancelled = true; };
  }, [get, ready, key]);

  return state;
}
