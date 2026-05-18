// lib/currentPlan.ts — shared "what plan is this tenant on" helpers.
//
// The platform-owner/founder tenant (Intelligent Analytics itself) always
// resolves to the TOP of every product — Business tier + all top add-ons —
// and is never gated or charged. Every other tenant shows its real current
// subscription, and the Plan & Pricing pages tag it + bill it as line items.
export const PLATFORM_OWNER_TENANT_ID =
  "8c9527b9-8999-4b31-a306-f3d4ccc39fbd";

export function isPlatformOwner(tenantId: string | null | undefined): boolean {
  return !!tenantId && tenantId.toLowerCase() === PLATFORM_OWNER_TENANT_ID;
}

// Founder defaults, per product, when isPlatformOwner is true.
export const OWNER_DEFAULTS = {
  arion:  { base: "business", addon: "authority" },   // base tier + SEO add-on
  oliver: { base: "business", addon: "authority" },   // base tier + CX add-on
  spark:  { base: "500k",     feature: "business", leads: "authority" },
} as const;
