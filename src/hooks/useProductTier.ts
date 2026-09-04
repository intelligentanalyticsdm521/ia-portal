// useProductTier — the active business's tier for one product
// ("lite" / "standard" / "pro" / "business" / "active"), and useEntitlements —
// the whole payload for a page that needs more than a tier.
//
// SEAMS PACK 3 (SEAM-3-A), 2026-09-06. This hook used to GET oliver-api
// /billing/subscriptions on every mount, per product, and the browser kept its
// own copy of the tier ladder (src/lib/tierRank.ts) and its own copy of the
// per-feature minimums (src/config/serviceCatalog.ts). Three copies of one
// table, refreshed from the service that owns CHECKOUT.
//
// It now reads platform-api GET /me/entitlements — ONE document that carries
// the products, the add-ons, the ladder, the feature minimums and the limits,
// and is the SAME document the APIs gate on. That is the fix for the 2026-08-17
// incident, where the Portal showed every SPARK Pro feature unlocked while
// every Pro route 403'd: the screen and the server now read one answer.
//
// FAILURE MODE — SEAM-3-B, and it CHANGED, on purpose.
// The old header said: "the caller should treat null tier as 'Lite' — i.e. lock
// business/pro-tier cards". That is the wrong half of the rule and it is the
// browser side of the incident above. An answer we could not get means we do
// not know, and not knowing must never lock a paying customer out of a feature
// they bought. So a null tier ALLOWS, `decided` says whether we really know,
// and the API — which is the thing that can actually spend money — refuses the
// spend on the same undecided answer. Features open, spending shut.
//
// Null-tier MUST NOT crash the page. That part is unchanged.
import { useEffect, useState } from 'react';
import { useAccessToken } from '../auth/useAccessToken';
import { useAppState } from '../app/AppState';
import { DEV_AUTH } from '../lib/devAuth';
import {
  fetchEntitlements,
  tierOf,
  type EntitlementPayload,
  type TierKey,
} from '../lib/entitlements';

const PLATFORM_API_BASE = (import.meta.env.VITE_PLATFORM_API_BASE_URL as string) || '';

// Local-dev tier seam (2026-07-21). The tier is resolved from platform-api's
// entitlement service, which the fully-local stack may not run — so every
// tier-gated surface would read as below-Standard and the TEST TENANT could not
// test gated features at all. Under VITE_DEV_AUTH=1 the test tenant resolves to
// VITE_DEV_TIER (default "business") so every feature is walkable. Build-time
// constant — tree-shaken out of prod builds.
const DEV_TIER = String(import.meta.env.VITE_DEV_TIER || 'business').toLowerCase() as TierKey;

/** The whole payload for the active business. */
export function useEntitlements(): {
  entitlements: EntitlementPayload | null;
  ready: boolean;
  error: unknown;
} {
  const appState = useAppState();
  const { activeTenantId } = appState;
  const isFounder = !!appState.bootstrap?.user?.isFounder;
  const { getToken } = useAccessToken();
  const [entitlements, setEntitlements] = useState<EntitlementPayload | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const home = appState.bootstrap?.homeTenantId;

  useEffect(() => {
    if (DEV_AUTH) { setEntitlements(null); setReady(true); return; }
    if (!activeTenantId || !PLATFORM_API_BASE) { setReady(true); return; }

    // 2026-08-06 — AGENCY / PLATFORM-OWNER BYPASS.
    // Intelligent Analytics IS the agency: it owns the platform and holds NO
    // Stripe subscriptions of its own, so every tier-gated surface read as
    // locked the moment tier gating went live. The service answers this too
    // (sources.is_agency, from core.tenants.tenant_kind) — the shortcut here
    // exists so the founder stays unblocked even when the service is the thing
    // that is down.
    //
    // Scoped to the founder's OWN tenant on purpose: `isFounder` stays true
    // while viewing a client (ClientTenantModal reuses the founder bootstrap),
    // so an unscoped bypass would show unlocked features inside a CLIENT's
    // portal and defeat view-as. homeTenantId is the founder's own tenant.
    const inOwnTenant =
      isFounder && !!home &&
      String(activeTenantId).toLowerCase() === String(home).toLowerCase();
    if (inOwnTenant) { setEntitlements(null); setReady(true); return; }

    let cancelled = false;
    (async () => {
      try {
        const t = await getToken();
        const payload = await fetchEntitlements({
          baseUrl: PLATFORM_API_BASE,
          token: t.accessToken,
          tenantId: activeTenantId,
        });
        if (!cancelled) setEntitlements(payload);
      } catch (e) {
        if (!cancelled) setError(e);
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => { cancelled = true; };
  }, [activeTenantId, getToken, isFounder, home]);

  return { entitlements, ready, error };
}

export function useProductTier(product: 'oliver' | 'spark' | 'arion' | 'stella'): {
  tier: TierKey;
  ready: boolean;
  error: unknown;
} {
  const appState = useAppState();
  const { activeTenantId } = appState;
  const isFounder = !!appState.bootstrap?.user?.isFounder;
  const home = appState.bootstrap?.homeTenantId;
  const { entitlements, ready, error } = useEntitlements();

  if (DEV_AUTH) return { tier: DEV_TIER, ready: true, error: null };

  const inOwnTenant =
    isFounder && !!activeTenantId && !!home &&
    String(activeTenantId).toLowerCase() === String(home).toLowerCase();
  if (inOwnTenant) return { tier: 'business', ready: true, error: null };

  // tierOf() returns null for a product we could not decide, and null ALLOWS
  // (SEAM-3-B). Callers that render an upgrade CTA must check `tier` for a
  // POSITIVE shortfall, never for absence.
  return { tier: tierOf(entitlements, product), ready, error };
}

export default useProductTier;
