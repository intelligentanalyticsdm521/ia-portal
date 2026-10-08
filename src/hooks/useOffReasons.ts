// useOffReasons — why each locked product is off, for the rail's words:
// "PAUSED" and "Open SPARK to update your card" for a failed payment,
// "ENDED" and "Open SPARK to re-subscribe" for an ended subscription, instead
// of "ADD". The reading is offReasons (lib/productAccess.ts), the same one the
// off notice and the Plan & Pricing card make.
//
// Reads GET /billing/subscriptions through the shared 30-second read the off
// notice uses, and only while a product on the rail is locked. Re-asked once
// per navigation (`refreshKey`), never polled. Any failure = nothing known,
// so the rail keeps its older words.
import { useEffect, useState } from 'react';
import { useAppState } from '../app/AppState';
import { useAccessToken } from '../auth/useAccessToken';
import { fetchSubscriptionsShared } from '../lib/billingApi';
import { offReasons, type OffReason } from '../lib/productAccess';

const NONE: ReadonlyMap<string, OffReason> = new Map();

export function useOffReasons(enabled: boolean, refreshKey?: unknown): ReadonlyMap<string, OffReason> {
  const { activeTenantId } = useAppState();
  const { getToken } = useAccessToken();
  const [held, setHeld] = useState<{ tenantId: string; why: Map<string, OffReason> } | null>(null);

  useEffect(() => {
    if (!enabled || !activeTenantId) return;
    let cancelled = false;
    (async () => {
      try {
        const t = await getToken();
        const r = await fetchSubscriptionsShared({ token: t.accessToken, tenantId: activeTenantId });
        if (!cancelled) setHeld({ tenantId: activeTenantId, why: offReasons(r?.subscriptions) });
      } catch {
        if (!cancelled) setHeld(null);
      }
    })();
    return () => { cancelled = true; };
  }, [enabled, activeTenantId, getToken, refreshKey]);

  return held && held.tenantId === activeTenantId ? held.why : NONE;
}

export default useOffReasons;
