// lib/tierLabels.ts — the ONE place a subscription tier key becomes a
// customer-facing name.
//
// Why this exists (pricing rework, Brandon 2026-08-21): OLIVER's bottom tier
// was renamed "OLIVER Invoicing" — quotes, proposals, invoices, payments and
// 30-day reporting, zero jobs. The plan KEY stays `lite` everywhere (Stripe
// lookup, oliver-api PLAN_PRICING, core.tenants.subscription_tier), only the
// DISPLAY changes. Before this module every page capitalised the raw key
// itself, so a rename meant hunting down a dozen `charAt(0).toUpperCase()`s.
//
// ARION and SPARK keep their names (ARION Lite is still "Lite"; SPARK has no
// lite tier at all).
export type TierProduct = "oliver" | "spark" | "arion";

const OLIVER_TIER_NAMES: Record<string, string> = {
  lite: "Invoicing",
  standard: "Standard",
  active: "Standard", // legacy "paid but no tier" — treated as Standard everywhere else too
  pro: "Pro",
  business: "Business",
  enterprise: "Enterprise",
};

const GENERIC_TIER_NAMES: Record<string, string> = {
  lite: "Lite",
  standard: "Standard",
  active: "Standard",
  pro: "Pro",
  business: "Business",
  enterprise: "Enterprise",
};

function capitalise(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/** "lite" → "Invoicing" (OLIVER) / "Lite" (everything else). Unknown keys are capitalised as-is. */
export function tierDisplayName(product: TierProduct | string | null | undefined, tier: string | null | undefined): string {
  const key = String(tier || "").toLowerCase();
  if (!key) return "";
  const table = String(product || "").toLowerCase() === "oliver" ? OLIVER_TIER_NAMES : GENERIC_TIER_NAMES;
  return table[key] || capitalise(key);
}

/** "OLIVER Invoicing", "SPARK Pro", "ARION Business". */
export function planDisplayName(product: TierProduct | string | null | undefined, tier: string | null | undefined): string {
  const name = tierDisplayName(product, tier);
  const brand = String(product || "").toUpperCase();
  return name ? `${brand} ${name}`.trim() : brand;
}
