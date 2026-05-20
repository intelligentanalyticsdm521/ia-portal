// lib/billingApi.ts — authenticated in-app plan purchase / change.
//
// Every product's Plan & Pricing "Purchase / Upgrade" button calls this. It
// hits oliver-api (the single Stripe owner). Response:
//   { mode:'checkout', url }  → redirect to Stripe Checkout
//   { mode:'updated', message } → show message (billed next invoice)
//   { mode:'owner', message }   → platform account, nothing to buy
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
