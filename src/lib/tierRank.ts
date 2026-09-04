// lib/tierRank.ts — the subscription-tier ladder, as a pure module.
//
// Lives apart from hooks/useProductTier (React, MSAL, import.meta.env) so the
// nav feature wall (components/navVisibility) stays dependency-free and can be
// unit-tested under plain `node --test`.
//
// SEAMS PACK 3 (SEAM-3-A), 2026-09-06: THE LADDER IS NO LONGER DEFINED HERE.
// It was a hand-kept copy of LUMEN's lib/myBrand/tierCheck.js RANK, which was
// itself copied into services/il/tier.js with a comment saying so — three
// copies of six numbers, in two repos and a browser. The ladder is defined once
// in lib/entitlements.ts, arrives in every entitlement payload as `rank`, and
// is pinned across five repos by test/fixtures/entitlement-rule-cases.json.
//
// This file keeps its NAME and its exports because ~15 components import
// `TierKey` and `tierMeets` from here, and re-exports them from the one
// definition. It is a doorway now, not a table.
export type { TierKey } from './entitlements';
export { RANK, rankOf, tierMeets } from './entitlements';

// 2026-06-22 — Doc 64 §2 allows Standard-tier Intelligence reports
// (simple_forecast/descriptive/basic_anomaly model classes). "standard" lets
// per-report meta declare a Standard floor without the consumer falling
// through to bg-slate-200 fallback styling.
export type IntelMinTier = 'standard' | 'pro' | 'business';
