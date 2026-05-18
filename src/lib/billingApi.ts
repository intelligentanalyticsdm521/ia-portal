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
