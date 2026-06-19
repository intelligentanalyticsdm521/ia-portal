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
// Plan catalog + checkout
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

export interface CheckoutSessionInput {
  email: string;
  name?: string;
  product?: SignupProduct;
  plan: PlanCatalogEntry['key'];
  billing_cycle: BillingCycle;
  domain: { mode: DomainMode; name?: string; registration_price_usd?: number };
}

export async function createCheckoutSession(input: CheckoutSessionInput) {
  return postJson<{ checkout_url: string; session_id: string }>(
    '/onboarding/checkout/create-session',
    input
  );
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
