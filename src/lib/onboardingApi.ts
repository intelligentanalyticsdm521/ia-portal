/**
 * Onboarding API client.
 *
 * Fetches public signup endpoints on arion-api. None of these calls require
 * authentication — the backend uses signup-session tokens (issued by Stripe
 * webhook on payment success) for the post-checkout endpoints.
 */

const API_BASE = (import.meta.env.VITE_ARION_API_BASE_URL as string)
  || 'https://app-arion-api-prod-e6fuc9gzd8f3hqfe.centralus-01.azurewebsites.net';

export type BillingCycle = 'monthly' | 'annual';
export type DomainMode = 'purchase' | 'byod';
export type SignupProduct = 'arion' | 'oliver' | 'spark';

export interface PlanCatalogEntry {
  key: string; // arion: lite|standard|pro|business · oliver: lite|standard|pro|business · spark: standard|pro|business · (SEO addon, separate: essentials|growth|authority)
  product?: SignupProduct;
  name: string;
  description: string;
  features: string[];
  pricing: {
    monthly_usd: number;
    annual_usd: number;
    annual_per_month_usd: number;
    annual_savings_usd: number;
  };
}

export interface DomainCheckResult {
  domain: string;
  available: boolean;
  price_per_year?: number | null;
  currency?: string;
  error?: string;
}

export interface ByodInstructions {
  step1: string;
  step2: string;
  nameservers: string[];
  note: string;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error?.message || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data.data as T;
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error?.message || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data.data as T;
}

// ---------------------------------------------------------------------------
// Plan catalog
//
// Checkout itself is NOT here: every self-serve purchase goes through
// oliver-api `/signup/checkout-cart` (lib/signupCheckout.ts), the single
// Stripe owner. The arion-api `/onboarding/checkout/create-session` client
// that used to live here was deleted 2026-08-22 — it resolved prices via
// STRIPE_PRICE_* env vars that exist on no App Service, so it could only 503.
// ---------------------------------------------------------------------------
export async function fetchPlanCatalog(product: SignupProduct = 'arion'): Promise<PlanCatalogEntry[]> {
  const data = await getJson<{ plans: PlanCatalogEntry[] }>(
    `/onboarding/checkout/catalog?product=${encodeURIComponent(product)}`);
  return data.plans;
}

// ARION SEO add-ons live on the same /catalog endpoint but in a separate
// `seoAddons` envelope. Returns an empty map if upstream doesn't expose
// them (deploy lag or Stripe products missing). Tiers per locked matrix:
// starter | essentials | growth | authority.
export interface ArionSeoAddonEntry {
  key: string;
  name: string;
  pricing: {
    monthly_usd: number | null;
    annual_usd: number | null;
    annual_per_month_usd: number | null;
    annual_savings_pct?: number | null;
  };
}
export async function fetchArionSeoAddons(): Promise<Record<string, ArionSeoAddonEntry>> {
  const data = await getJson<{ seoAddons?: Record<string, ArionSeoAddonEntry> }>(
    `/onboarding/checkout/catalog?product=arion`);
  return data.seoAddons || {};
}

// ---------------------------------------------------------------------------
// Domain search / purchase / BYOD
// ---------------------------------------------------------------------------
export async function checkDomainAvailability(query: string, tlds?: string[]) {
  return postJson<{ results: DomainCheckResult[]; query: string; tlds_checked: string[] }>(
    '/onboarding/domains/check',
    { query, tlds }
  );
}

export async function startByodVerification(domain: string) {
  return postJson<{
    domain: string;
    verified: boolean;
    current_nameservers: string[];
    instructions: ByodInstructions;
  }>('/onboarding/domains/byod', { domain });
}

export interface HostingerExistingDomain {
  domain: string;
  status: string | null;
  expires_at: string | null;
}

// Defect #246 V1 — list domains already on the IA master Hostinger account so
// the founder wizard can render a dropdown when the customer picks
// `hostinger_existing` instead of asking them to hand-type the FQDN.
export async function fetchHostingerExistingDomains(): Promise<HostingerExistingDomain[]> {
  const data = await getJson<{ domains: HostingerExistingDomain[] }>(
    '/onboarding/domains/hostinger-existing');
  return data.domains || [];
}

export async function pollByodStatus(domain: string) {
  const res = await fetch(
    `${API_BASE}/onboarding/domains/byod/status?domain=${encodeURIComponent(domain)}`
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || 'failed');
  return data.data as { domain: string; verified: boolean; nameservers: string[]; checked_at: string };
}

// ---------------------------------------------------------------------------
// Session info (post-checkout context for OnboardingFlow)
// ---------------------------------------------------------------------------
export interface SignupSessionInfo {
  email: string;
  product?: SignupProduct;
  plan: { key: string; name: string; description: string | null };
  billing_cycle: BillingCycle;
  tenant_status: string;
  site: { domain: string | null; provisioning_state: string | null };
  saved_questionnaire: Record<string, unknown> | null;
  saved_domain: { mode: DomainMode; domain: string; pricePerYear?: number } | null;
  already_submitted: boolean;
  // Canonical org fields from the SHARED platform profile (core.tenants).
  // Used to prefill the wizard so the customer doesn't re-type what the
  // operator already entered. Null when there's no shared record yet.
  shared_profile?: { businessName?: string; primaryColor?: string } | null;
}

export async function fetchSessionInfo(sessionId: string): Promise<SignupSessionInfo> {
  const res = await fetch(`${API_BASE}/onboarding/session-info?session_id=${encodeURIComponent(sessionId)}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `HTTP ${res.status}`);
  return data.data as SignupSessionInfo;
}
