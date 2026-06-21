// lib/billingApi.ts — authenticated in-app plan purchase / change.
//
// Every product's Plan & Pricing "Purchase / Upgrade" button calls this. It
// hits oliver-api (the single Stripe owner). Response:
//   { mode:'checkout', url }  → redirect to Stripe Checkout
//   { mode:'updated', message } → show message (billed next invoice)
//   { mode:'owner', message }   → platform account, nothing to buy
import { emergencyActAsHeaders } from "./emergencyActAs";

const OLIVER_API_BASE =
  (import.meta.env.VITE_OLIVER_API_BASE as string) ||
  "https://app-oliver-api-prod-eaffhyhqgrgbcfh0.centralus-01.azurewebsites.net";

export interface BillingChangeBody {
  product: "arion" | "oliver" | "spark";
  billing_cycle: "monthly" | "annual";
  plan?: string;            // oliver tier · arion base tier
  seo?: string | null;      // arion SEO add-on
  volume?: string;          // spark
  featureAddon?: string | null; // spark
  leads?: string | null;    // spark
  leadsSelected?: number;   // spark
}
export interface BillingChangeResult {
  mode: "checkout" | "updated" | "owner";
  url?: string;
  message?: string;
}

export async function changePlan(params: {
  token: string; tenantId: string; body: BillingChangeBody;
}): Promise<BillingChangeResult> {
  const res = await fetch(`${OLIVER_API_BASE}/billing/change`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.token}`,
      "x-tenant-key": params.tenantId,
      "Content-Type": "application/json",
      // Founder emergency act-as: backend will 403 this POST while a 30-min
      // read-only session is open. No-op for every other user.
      ...emergencyActAsHeaders(),
    },
    body: JSON.stringify(params.body),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j?.message || j?.error || `HTTP ${res.status}`);
  return (j?.data ?? j) as BillingChangeResult;
}

/** A scheduled subscription change that has been mirrored to
 *  core.tenants.pending_*. Drives the "Downgrading on [date]" banner
 *  on every Plan & Pricing page. */
export interface PendingChange {
  pendingTier: string | null;
  pendingCxTier: string | null;
  pendingSeoAddonTier: string | null;
  effectiveAt: string;            // ISO timestamp
  scheduleId: string;
  requestedAt: string;            // ISO timestamp
  requestedByEmail: string | null;
}

export async function fetchPendingChange(params: {
  token: string; tenantId: string;
}): Promise<PendingChange | null> {
  const res = await fetch(`${OLIVER_API_BASE}/billing/pending-change`, {
    headers: {
      Authorization: `Bearer ${params.token}`,
      "x-tenant-key": params.tenantId,
    },
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j?.message || j?.error || `HTTP ${res.status}`);
  return (j?.data ?? null) as PendingChange | null;
}

/** F-106 — One row per platform with active Stripe subs.
 *  Drives the Plan & Pricing hub: current tier badge + Manage vs Add CTA. */
export interface ProductSubscription {
  product: "oliver" | "spark" | "arion";
  tier: string;                  // "lite" / "standard" / "pro" / "business" / "active"
  status: string;                // Stripe subscription status
  current_period_end: string | null;
  monthly_usd: number;
  items: Array<{ name: string; price_id: string; quantity: number; monthly_usd: number; interval: string | null }>;
  subscription_id?: string;
  cancel_at_period_end?: boolean;
}
export interface SubscriptionsResponse {
  subscriptions: ProductSubscription[];
  hasAnySubscription: boolean;
  customerId: string | null;
  owner: boolean;
}

export async function fetchSubscriptions(params: {
  token: string; tenantId: string;
}): Promise<SubscriptionsResponse> {
  const res = await fetch(`${OLIVER_API_BASE}/billing/subscriptions`, {
    headers: {
      Authorization: `Bearer ${params.token}`,
      "x-tenant-key": params.tenantId,
    },
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j?.message || j?.error || `HTTP ${res.status}`);
  return (j?.data ?? j) as SubscriptionsResponse;
}

/** F-106 — Stripe Billing Portal session URL.
 *  Opens Stripe's hosted portal for cancel + invoice history +
 *  payment-method updates. Configured per-env in the Stripe dashboard. */
export async function createPortalSession(params: {
  token: string; tenantId: string;
  product?: "oliver" | "spark" | "arion";
  returnUrl?: string;
}): Promise<{ mode: "portal" | "owner"; url?: string; message?: string }> {
  const body: Record<string, string> = {};
  if (params.product) body.product = params.product;
  if (params.returnUrl) body.return_url = params.returnUrl;
  const res = await fetch(`${OLIVER_API_BASE}/billing/portal-session`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.token}`,
      "x-tenant-key": params.tenantId,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j?.message || j?.error || `HTTP ${res.status}`);
  return (j?.data ?? j) as { mode: "portal" | "owner"; url?: string; message?: string };
}

/** Releases the Stripe Subscription Schedule and clears pending_*.
 *  The customer keeps their current (higher) tier indefinitely. */
export async function cancelPendingChange(params: {
  token: string; tenantId: string;
}): Promise<{ mode: string; message: string }> {
  const res = await fetch(`${OLIVER_API_BASE}/billing/pending-change`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${params.token}`,
      "x-tenant-key": params.tenantId,
    },
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j?.message || j?.error || `HTTP ${res.status}`);
  return (j?.data ?? j) as { mode: string; message: string };
}
