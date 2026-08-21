// lib/tierRank.ts — the subscription-tier ladder, as a pure module.
//
// Lives apart from hooks/useProductTier (React, MSAL, import.meta.env) so the
// nav feature wall (components/navVisibility) stays dependency-free and can be
// unit-tested under plain `node --test`.
export type TierKey = "lite" | "standard" | "pro" | "business" | "active" | null;

// 2026-06-22 — Doc 64 §2 allows Standard-tier Intelligence reports
// (simple_forecast/descriptive/basic_anomaly model classes). "standard" lets
// per-report meta declare a Standard floor without the consumer falling
// through to bg-slate-200 fallback styling.
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
