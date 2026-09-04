import { isFounderTenantId } from "./founderTenant";

// lib/currentPlan.ts — shared "what plan is this tenant on" helpers.
//
// The platform-owner/founder tenant (Intelligent Analytics itself) always
// resolves to the TOP of every product — Business tier + all top add-ons —
// and is never gated or charged. Every other tenant shows its real current
// subscription, and the Plan & Pricing pages tag it + bill it as line items.
// SEAMS PACK 4B — the id lives in ONE module per repo (lib/founderTenant.ts).
// Re-exported under its existing name because callers import it from here.
export { FOUNDER_TENANT_ID_DEFAULT as PLATFORM_OWNER_TENANT_ID } from "./founderTenant";

export function isPlatformOwner(tenantId: string | null | undefined): boolean {
  return isFounderTenantId(tenantId);
}

// Founder defaults, per product, when isPlatformOwner is true.
export const OWNER_DEFAULTS = {
  arion:  { base: "business", addon: "authority" },   // base tier + SEO add-on
  oliver: { base: "business", addon: "authority" },   // base tier + CX add-on
  spark:  { base: "500k",     feature: "business", leads: "authority" },
} as const;
