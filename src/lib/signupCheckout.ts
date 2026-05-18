// lib/signupCheckout.ts — PUBLIC self-serve checkout client.
//
// Talks to oliver-api (the single Stripe owner). No auth — guest checkout.
// One endpoint serves OLIVER + SPARK; ARION keeps its own onboardingApi path.
const OLIVER_API_BASE =
  (import.meta.env.VITE_OLIVER_API_BASE as string) ||
  "https://app-oliver-api-prod-eaffhyhqgrgbcfh0.centralus-01.azurewebsites.net";

export type SignupProductU = "oliver" | "spark";
export type BillingCycleU = "monthly" | "annual";

export interface OliverPlan {
  key: string; name: string; description: string; features: string[]; monthly_usd: number;
}
export interface SparkVolume { key: string; volume: string; name: string; monthly_usd: number; }
export interface SparkLeads {
  name: string; monthly_usd: number; included: number; increment: number; addon_unit_usd: number | null;
}
export interface SignupCatalog {
  product: string;
  plans?: OliverPlan[];                                   // oliver
  volumes?: SparkVolume[];                                 // spark
  featureAddons?: Record<string, { name: string; monthly_usd: number }>; // spark
  leads?: Record<string, SparkLeads>;                      // spark
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
}
export function createSignupComplete(sessionId: string, profile: SignupProfileInput) {
  return j<{ tenant_id: string; product: string; email?: string; already?: boolean }>(
    "/signup/complete",
    { method: "POST", body: JSON.stringify({ session_id: sessionId, profile }) },
  );
}
