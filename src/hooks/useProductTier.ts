// useProductTier — small hook that returns the active Stripe subscription
// tier ("lite" / "standard" / "pro" / "business" / "active") for a single
// product (oliver | spark | arion). Used by IA Insights Intelligence pages
// (and other tier-gated surfaces) to render an upgrade-locked state for
// reports whose minTier is above the user's current tier.
//
// Failure mode: returns { tier: null, ready: true, error } and the caller
// should treat null tier as "Lite" — i.e. lock business/pro-tier cards
// rather than silently let the engine run. Null-tier MUST NOT crash the
// page.
import { useEffect, useState } from "react";
import { fetchSubscriptions, type ProductSubscription } from "../lib/billingApi";
import { useAccessToken } from "../auth/useAccessToken";
import { useAppState } from "../app/AppState";
import { DEV_AUTH } from "../lib/devAuth";
// The tier ladder (TierKey / IntelMinTier / tierMeets) lives in lib/tierRank —
// a pure module, so navVisibility and its node tests don't drag React in.
import type { TierKey } from "../lib/tierRank";

// Local-dev tier seam (2026-07-21). The tier is resolved from oliver-api's
// Stripe-backed /billing/subscriptions, which the local dev stack doesn't run
// — so every tier-gated surface read as below-Standard and the TEST TENANT
// couldn't test gated features at all. Under VITE_DEV_AUTH=1 the test tenant
// resolves to VITE_DEV_TIER (default "business") so every feature is
// walkable. Build-time constant — tree-shaken out of prod builds.
const DEV_TIER = (String(import.meta.env.VITE_DEV_TIER || "business").toLowerCase() as TierKey);

export function useProductTier(product: "oliver" | "spark" | "arion"): {
  tier: TierKey;
  ready: boolean;
  error: unknown;
} {
  const appState = useAppState();
  const { activeTenantId } = appState;
  const isFounder = !!appState.bootstrap?.user?.isFounder;
  const { getToken } = useAccessToken();
  const [tier, setTier] = useState<TierKey>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (DEV_AUTH) { setTier(DEV_TIER); setReady(true); return; }

    // 2026-08-06 — AGENCY / PLATFORM-OWNER BYPASS.
    // Intelligent Analytics IS the agency: it owns the platform and holds NO
    // Stripe subscriptions of its own. /billing/subscriptions returns nothing
    // for it, tier resolved to null, and every tier-gated surface read as
    // locked — which locked Brandon out of ARION/OLIVER/SPARK the moment tier
    // gating went live. The agency's own tenant always resolves to the top tier.
    // (The APIs already behave this way server-side: myBrand/tierCheck.js treats
    // FOUNDER_TENANT_ID as "business"; requireArionTier reads
    // arion.site.arion_tier = "business" for IA.)
    //
    // Scoped to the founder's OWN tenant on purpose: `isFounder` stays true
    // while viewing a client (ClientTenantModal reuses the founder bootstrap),
    // so an unscoped bypass would show unlocked features inside a CLIENT's
    // portal and defeat view-as. homeTenantId is the founder's own tenant.
    const home = appState.bootstrap?.homeTenantId;
    const inOwnTenant =
      isFounder && !!activeTenantId && !!home &&
      String(activeTenantId).toLowerCase() === String(home).toLowerCase();
    if (inOwnTenant) { setTier("business"); setReady(true); return; }

    if (!activeTenantId) { setReady(true); return; }
    let cancelled = false;
    (async () => {
      try {
        const t = await getToken();
        const r = await fetchSubscriptions({ token: t.accessToken, tenantId: activeTenantId });
        if (cancelled) return;
        const sub = (r.subscriptions || []).find((s: ProductSubscription) => s.product === product);
        setTier((sub?.tier as TierKey) ?? null);
      } catch (e) {
        if (!cancelled) setError(e);
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => { cancelled = true; };
  }, [activeTenantId, getToken, product, isFounder, appState.bootstrap?.homeTenantId]);

  return { tier, ready, error };
}
