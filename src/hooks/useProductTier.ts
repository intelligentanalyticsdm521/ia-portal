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

// Local-dev tier seam (2026-07-21). The tier is resolved from oliver-api's
// Stripe-backed /billing/subscriptions, which the local dev stack doesn't run
// — so every tier-gated surface read as below-Standard and the TEST TENANT
// couldn't test gated features at all. Under VITE_DEV_AUTH=1 the test tenant
// resolves to VITE_DEV_TIER (default "business") so every feature is
// walkable. Build-time constant — tree-shaken out of prod builds.
const DEV_TIER = (String(import.meta.env.VITE_DEV_TIER || "business").toLowerCase() as TierKey);

export type TierKey = "lite" | "standard" | "pro" | "business" | "active" | null;
// 2026-06-22 — Doc 64 §2 allows Standard-tier Intelligence reports
// (simple_forecast/descriptive/basic_anomaly model classes). Adding
// "standard" so per-report meta can declare a Standard floor without
// the consumer falling through to bg-slate-200 fallback styling.
export type IntelMinTier = "standard" | "pro" | "business";

const RANK: Record<string, number> = {
  lite: 1,
  standard: 2,
  active: 2,   // legacy "active" = paid-but-no-tier = treat as Standard
  pro: 3,
  business: 4,
  enterprise: 5,
};

export function tierMeets(current: TierKey, required: IntelMinTier): boolean {
  if (!current) return false;
  const c = RANK[String(current).toLowerCase()] ?? 0;
  const r = RANK[required] ?? 99;
  return c >= r;
}

export function useProductTier(product: "oliver" | "spark" | "arion"): {
  tier: TierKey;
  ready: boolean;
  error: unknown;
} {
  const { activeTenantId } = useAppState();
  const { getToken } = useAccessToken();
  const [tier, setTier] = useState<TierKey>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (DEV_AUTH) { setTier(DEV_TIER); setReady(true); return; }
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
  }, [activeTenantId, getToken, product]);

  return { tier, ready, error };
}
