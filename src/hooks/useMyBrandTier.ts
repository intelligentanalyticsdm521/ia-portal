// useMyBrandTier — Wave 3 (Brandon 2026-06-22).
//
// Derives the My Brand tier (ARION, SPARK floor) and exposes the My Brand feature
// gate matrix (mirrors the FEATURE_MIN_TIER table in
// LUMEN-API/src/lib/myBrand/tierCheck.js). Lets a page write:
//
//   const gate = useMyBrandTier();
//   if (gate.ready && !gate.meets("image_studio")) {
//     return <MyBrandUpgradeGate
//              featureName="Image Studio"
//              requiredTier={gate.requiredTier("image_studio")}
//              currentTier={gate.tier}
//            />;
//   }
//
// Keep the keys in sync with the backend table. The shared `serviceCatalog.ts`
// tierGate column drives navigation-level access; this hook drives the
// in-page locked states for sub-features the catalog can't see (per-platform
// connect, scheduling horizons, etc).
//
// Pricing rework 2026-08-21: My Brand is governed by the ARION tier, with a
// Standard floor whenever the tenant also holds an active SPARK subscription
// (a SPARK tenant never loses My Brand by adding ARION Lite; SPARK-only
// tenants get Standard-level My Brand). Mirrors LUMEN-API
// src/lib/myBrand/tierCheck.js getTenantMyBrandTier(). Unresolved on both
// products -> null (the server fails OPEN and logs; the UI shows nothing as
// locked rather than walling a paying tenant behind a lookup failure).
import { useProductTier } from "./useProductTier";
import { tierMeets, type TierKey } from "../lib/tierRank";

// Lower-case tier ranking — matches Portal RANK + LUMEN-API RANK.
export type FeatureMinTier = "lite" | "standard" | "pro" | "business";

// Single source of truth on the Portal side. Update here when scope changes,
// and mirror in LUMEN-API/src/lib/myBrand/tierCheck.js FEATURE_MIN_TIER.
export const MY_BRAND_FEATURE_TIERS: Record<string, FeatureMinTier> = {
  image_studio:               "standard",
  template_studio:            "standard",
  voice_monitor:              "pro",
  // Social — per-platform connect gates.
  social_connect_facebook:    "standard",
  social_connect_instagram:   "standard",
  social_connect_x:           "pro",
  social_connect_linkedin:    "pro",
  social_connect_multi:       "business",
  // Composer scheduling horizons.
  social_compose_30d:         "standard",
  social_compose_90d:         "pro",
  social_compose_unlimited:   "business",
  social_compose_bulk_import: "business",
  // Calendar
  social_calendar_list:       "standard",
  social_calendar_grid:       "pro",
  social_calendar_multi:      "business",
  // Analytics
  social_analytics_30d:       "standard",
  social_analytics_90d:       "pro",
  social_analytics_csv:       "business",
  // Social approval workflow — the My Brand > Social settings "Approval
  // Workflow" toggle (SocialChannelsPage) and the LUMEN
  // /my-brand/social/settings gate. Business on the My Brand (ARION) tier.
  // NOT the SPARK /approvals queue: that is keyed `approval_workflow` on the
  // backend (SPARK Business) and is gated in the Portal by SubNav
  // `spark_approvals` minTier + SparkPageShell's tier-gate 403 handling — it
  // never reads this table. The two keys were split 2026-08-21 because sharing
  // one key double-gated /approvals on the ARION tier.
  social_approval_workflow:   "business",
};

export interface MyBrandTierGate {
  /** Derived My Brand tier: max(ARION tier, Standard floor if SPARK active). Null until ready / when unresolved. */
  tier: TierKey;
  /** True once Stripe lookup has resolved. */
  ready: boolean;
  error: unknown;
  /** True if the active tier meets/exceeds the feature's minimum. */
  meets: (feature: keyof typeof MY_BRAND_FEATURE_TIERS) => boolean;
  /** Required tier for the feature (lowercase). */
  requiredTier: (feature: keyof typeof MY_BRAND_FEATURE_TIERS) => FeatureMinTier;
}

export function useMyBrandTier(): MyBrandTierGate {
  const arion = useProductTier("arion");
  const spark = useProductTier("spark");
  const ready = arion.ready && spark.ready;
  const error = arion.error ?? spark.error;
  // Derived My Brand tier = max(ARION tier, Standard floor if SPARK is active).
  const sparkFloor: TierKey = spark.tier ? "standard" : null;
  const tier: TierKey =
    arion.tier && sparkFloor
      ? ((RANK[String(arion.tier).toLowerCase()] ?? 0) >= RANK.standard ? arion.tier : "standard")
      : (arion.tier ?? sparkFloor);
  return {
    tier,
    ready,
    error,
    meets: (feature) => {
      const required = MY_BRAND_FEATURE_TIERS[feature];
      if (!required) return false; // unknown feature → fail closed
      // tierMeets accepts "pro" | "business" today; widen via cast since the
      // hook is intentionally more permissive than the IA-Insights call site.
      // For "standard" / "lite" we use a direct rank compare via the helper
      // by reusing the same RANK table inline.
      return tierMeetsAny(tier, required);
    },
    requiredTier: (feature) => MY_BRAND_FEATURE_TIERS[feature] || "standard",
  };
}

// Local rank helper — mirrors Portal/hooks/useProductTier.ts RANK so we can
// compare against any tier key (not just pro/business).
const RANK: Record<string, number> = {
  lite: 1,
  standard: 2,
  active: 2,
  pro: 3,
  business: 4,
  enterprise: 5,
};

function tierMeetsAny(current: TierKey, required: FeatureMinTier): boolean {
  // Re-export tierMeets for callers that only need pro/business — but for our
  // wider feature table we need full ranking. Founder tenants are upgraded
  // server-side; on the client we still see their real subscription tier so
  // they get the same gating as everyone else (acceptable, no UI bypass).
  if (!current) return false;
  const c = RANK[String(current).toLowerCase()] ?? 0;
  const r = RANK[required] ?? 99;
  return c >= r;
}

export { tierMeets };
