// useEndedProducts — which products' subscriptions ENDED, for the rail's words
// ("ENDED" and "Open SPARK to re-subscribe" instead of "ADD").
//
// Reads GET /billing/subscriptions through the shared 30-second read the off
// notice uses, and only while a product on the rail is locked. Re-asked once
// per navigation (`refreshKey`), never polled. Any failure = nothing known to
// have ended, so the rail keeps its older words.
import { useEffect, useState } from 'react';
import { useAppState } from '../app/AppState';
import { useAccessToken } from '../auth/useAccessToken';
import { fetchSubscriptionsShared } from '../lib/billingApi';
import { endedProducts } from '../lib/productAccess';

export function useEndedProducts(enabled: boolean, refreshKey?: unknown): Set<string> {
  const { activeTenantId } = useAppState();
  const { getToken } = useAccessToken();
  const [held, setHeld] = useState<{ tenantId: string; ended: Set<string> } | null>(null);

  useEffect(() => {
    if (!enabled || !activeTenantId) return;
    let cancelled = false;
    (async () => {
      try {
        const t = await getToken();
        const r = await fetchSubscriptionsShared({ token: t.accessToken, tenantId: activeTenantId });
        if (!cancelled) setHeld({ tenantId: activeTenantId, ended: endedProducts(r?.subscriptions) });
      } catch {
        if (!cancelled) setHeld(null);
      }
    })();
    return () => { cancelled = true; };
  }, [enabled, activeTenantId, getToken, refreshKey]);

  return held && held.tenantId === activeTenantId ? held.ended : new Set<string>();
}

export default useEndedProducts;
