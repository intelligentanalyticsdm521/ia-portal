// useProductAccess — is a product switched off for the active business?
//
// SCOPE_ACCESS_FOLLOWS_SUBSCRIPTION_2026-10-07 §4.2. Reads platform-api
// GET /me/entitlements, the SAME document the APIs gate on, through the shared
// one-minute cache in lib/entitlements.ts (several callers at once share one
// request). That is what makes a mid-session switch-off show within a minute:
// the sign-in list of products (AppState.ownedProducts) only refreshes at
// sign-in or when switching business.
//
// Fetched once per navigation (`refreshKey`), never polled
// (memory convention_data_fetching).
//
// UNLIKE useEntitlements this also runs under VITE_DEV_AUTH. The dev stack runs
// platform-api on :4000 with no billing key, so its answer there is the
// database's, which is exactly what the sync writes — and the dev walk has to
// see a product go off the way production will. If platform-api is not
// running the answer is null, and null leaves everything open.
import { useEffect, useState } from 'react';
import { useAccessToken } from '../auth/useAccessToken';
import { useAppState } from '../app/AppState';
import { fetchEntitlements, type EntitlementPayload } from '../lib/entitlements';
import { productSwitchedOff, productLockedOnRail, payloadForTenant } from '../lib/productAccess';
import { isActingAsClient } from '../lib/actingAsClient';

const PLATFORM_API_BASE = (import.meta.env.VITE_PLATFORM_API_BASE_URL as string) || '';

export function useProductAccess(refreshKey?: unknown): {
  /** Decided off: the product's pages show the notice instead. */
  isOff: (product: string | null | undefined) => boolean;
  /** The rail's padlock (decided payload, else the sign-in list; null = neither knows). */
  isLockedOnRail: (product: string) => boolean | null;
  /** The founder is looking at a client's business (billing belongs to them). */
  viewingClient: boolean;
  payload: EntitlementPayload | null;
  ready: boolean;
} {
  const appState = useAppState();
  const { activeTenantId, ownedProducts } = appState;
  const isFounder = !!appState.bootstrap?.user?.isFounder;
  const home = appState.bootstrap?.homeTenantId;
  const { getToken } = useAccessToken();
  // The answer is kept WITH the business it was asked about. After a switch of
  // business, the previous business's answer never judges the new one while
  // the new answer is on its way (payloadForTenant: a mismatch reads as open).
  const [held, setHeld] = useState<{ tenantId: string | null; payload: EntitlementPayload | null } | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!activeTenantId || !PLATFORM_API_BASE) { setHeld(null); setReady(true); return; }
    let cancelled = false;
    (async () => {
      try {
        const t = await getToken();
        const p = await fetchEntitlements({ baseUrl: PLATFORM_API_BASE, token: t.accessToken, tenantId: activeTenantId });
        if (!cancelled) setHeld({ tenantId: activeTenantId, payload: p });
      } catch {
        // No answer = undecided = open. Never a lock on "we don't know".
        if (!cancelled) setHeld(null);
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => { cancelled = true; };
  }, [activeTenantId, getToken, refreshKey]);

  const payload = payloadForTenant(held, activeTenantId);

  return {
    isOff: (product) => productSwitchedOff(payload, product),
    isLockedOnRail: (product) => productLockedOnRail(payload, ownedProducts, product),
    viewingClient: isActingAsClient(isFounder, activeTenantId, home),
    payload,
    ready,
  };
}

export default useProductAccess;
