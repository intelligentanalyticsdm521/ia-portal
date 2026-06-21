// lib/signupCheckout.ts — PUBLIC self-serve checkout client.
//
// Talks to oliver-api (the single Stripe owner). No auth — guest checkout.
// One endpoint serves OLIVER + SPARK; ARION keeps its own onboardingApi path.
const OLIVER_API_BASE =
  (import.meta.env.VITE_OLIVER_API_BASE as string) ||
  "https://app-oliver-api-prod-eaffhyhqgrgbcfh0.centralus-01.azurewebsites.net";

export type SignupProductU = "oliver" | "spark";
export type BillingCycleU = "monthly" | "annual";

// 2026-06-20 — every catalog row now ships with a `pricing` envelope so
// the UI can pick monthly vs annual without a refetch and without trusting
// the misnamed legacy `monthly_usd` field (which used to hold the FULL
// annual price when billing=annual). Legacy top-level `monthly_usd` stays
// for back-compat but is now ALWAYS the monthly amount.
export interface PriceEnvelope {
  monthly_usd: number | null;
  annual_usd: number | null;
  annual_per_month_usd: number | null;
  annual_savings_pct: number | null;
}

export interface OliverPlan {
  key: string; name: string; description: string; features: string[];
  monthly_usd: number;
  pricing?: PriceEnvelope;
}
export interface SparkVolume {
  key: string; volume: string; name: string;
  monthly_usd: number;
  pricing?: PriceEnvelope;
  description?: string | null;
  features?: string[] | null;
}
export interface SparkLeads {
  name: string;
  monthly_usd: number;
  included: number;
  increment: number;
  addon_unit_usd: number | null;
  pricing?: PriceEnvelope;
  addon_pricing?: PriceEnvelope;
  description?: string | null;
  features?: string[] | null;
}
export interface SparkFeatureAddon {
  name: string;
  monthly_usd: number;
  pricing?: PriceEnvelope;
  description?: string | null;
  features?: string[] | null;
}
export interface ArionSeoAddon {
  key: string;
  name: string;
  pricing: PriceEnvelope;
}
export interface SignupCatalog {
  product: string;
  plans?: OliverPlan[];                                   // oliver / arion
  volumes?: SparkVolume[];                                 // spark
  featureAddons?: Record<string, SparkFeatureAddon>;       // spark
  leads?: Record<string, SparkLeads>;                      // spark
  seoAddons?: Record<string, ArionSeoAddon>;               // arion
}

async function j<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${OLIVER_API_BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers as Record<string, string>) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.message || body?.error || `HTTP ${res.status}`);
  return (body?.data ?? body) as T;
}

export function fetchSignupCatalog(product: SignupProductU, billing: BillingCycleU) {
  return j<SignupCatalog>(`/signup/catalog?product=${product}&billing=${billing}`);
}

export interface SignupCheckoutInput {
  product: SignupProductU;
  email: string;
  name?: string;
  billing_cycle: BillingCycleU;
  plan?: string;            // oliver
  volume?: string;          // spark (5k,10k,…)
  featureAddon?: "pro" | "business" | null; // spark
  leads?: "essentials" | "growth" | "authority" | null; // spark
  leadsSelected?: number;   // spark slider total
}

export function createSignupCheckout(input: SignupCheckoutInput) {
  return j<{ checkout_url: string; session_id: string }>("/signup/checkout", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

// ─── F-110 — Waitlist capture (public, no auth) ─────────────────────────────
// POSTs an interest signal for unreleased products (STELLA/FORGE/ARGUS).
// Unauthenticated — the lead may not have a tenant yet, so no emergency
// act-as concerns. Routed through this typed client so all unauth
// oliver-api calls share one error/timeout pipeline.
export interface WaitlistSubmitInput {
  product: string;          // "stella" | "forge" | "argus"
  email: string;
  name?: string;
  company?: string;
  note?: string;
  source_url?: string;
}

export function submitWaitlist(input: WaitlistSubmitInput) {
  return j<{ ok: boolean } | Record<string, unknown>>("/api/v1/waitlist", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/** F-108 — Multi-product cart checkout. Accepts 1–3 items spanning ARION/
 *  OLIVER/SPARK, returns a single Stripe Checkout Session URL covering all
 *  of them. Bundle discount auto-applied server-side (MP5R / MP7R). */
export interface SignupCartCheckoutInput {
  email: string;
  name?: string;
  billing_cycle: BillingCycleU;
  items: Array<
    | { product: "oliver"; plan: string }
    | { product: "spark"; volume: string; featureAddon?: string | null; leads?: string | null; leadsSelected?: number }
    | { product: "arion"; plan: string; seo?: string | null }
  >;
  /** Founder-only: explicit Stripe coupon ID. Overrides the auto-applied
   *  MP5R/MP7R bundle when present (Stripe subscription-level discounts are
   *  mutually exclusive — only one wins). */
  coupon_code?: string;
}
export interface SignupCartCheckoutResult {
  checkout_url: string;
  session_id: string;
  cart: Array<{ product: string; items: number }>;
  bundle_coupon: string | null;
  bundle_coupon_applied: boolean;
  /** Whichever coupon actually applies to the Checkout Session (founder
   *  override > auto-bundle > none). Null if no coupon active. */
  applied_coupon?: string | null;
  coupon_source?: "founder" | "bundle" | null;
}

export function createSignupCartCheckout(input: SignupCartCheckoutInput) {
  return j<SignupCartCheckoutResult>("/signup/checkout-cart", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export interface SignupSession {
  email: string; product: string; plan: string;
  billing_cycle: string; status: string; tenant_id: string | null;
}
export function fetchSignupSession(sessionId: string) {
  return j<SignupSession | { status: "pending" }>(`/signup/session?session_id=${encodeURIComponent(sessionId)}`);
}

export interface SignupProfileInput {
  businessName: string;
  primaryContactPhone?: string;
  addressLine1?: string; city?: string; stateProvince?: string;
  postalCode?: string; countryRegion?: string; websiteUrl?: string;
  /** Post-checkout site picker — drives ARION provisioning gating later. */
  websiteStatus?: 'existing_ia' | 'migrate' | 'new';
}
export function createSignupComplete(sessionId: string, profile: SignupProfileInput) {
  return j<{ tenant_id: string; product: string; email?: string; already?: boolean }>(
    "/signup/complete",
    { method: "POST", body: JSON.stringify({ session_id: sessionId, profile }) },
  );
}
