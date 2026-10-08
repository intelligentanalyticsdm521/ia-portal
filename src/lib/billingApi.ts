// lib/billingApi.ts — authenticated in-app plan purchase / change.
//
// Every product's Plan & Pricing "Purchase / Upgrade" button calls this. It
// hits oliver-api (the single Stripe owner). Response:
//   { mode:'checkout', url }  → redirect to Stripe Checkout
//   { mode:'updated', message } → show message (billed next invoice)
//   { mode:'owner', message }   → platform account, nothing to buy
import { emergencyActAsHeaders } from "./emergencyActAs";
import { billingRefusalSentence } from "./productAccess";

const OLIVER_API_BASE =
  (import.meta.env.VITE_OLIVER_API_BASE as string) ||
  "https://app-oliver-api-prod-eaffhyhqgrgbcfh0.centralus-01.azurewebsites.net";

export interface BillingChangeBody {
  product: "arion" | "oliver" | "spark" | "stella";
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
  if (!res.ok) throw new Error(billingRefusalSentence(j, res.status));
  clearSubscriptionsCache();
  return (j?.data ?? j) as BillingChangeResult;
}

/** F-106 — One row per platform with active Stripe subs.
 *  Drives the Plan & Pricing hub: current tier badge + Manage vs Add CTA. */
export interface ProductSubscription {
  product: "oliver" | "spark" | "arion" | "stella";
  tier: string;                  // "lite" / "standard" / "pro" / "business" / "active"
  status: string;                // Stripe subscription status: active | trialing | past_due (SCOPE 2026-10-07 F11)
  current_period_end: string | null;
  /** SCOPE_ACCESS_FOLLOWS_SUBSCRIPTION_2026-10-07 §5 — the change already
   *  scheduled for THIS product (from the Stripe schedule's next phase, or
   *  cancel_at_period_end). null when nothing is scheduled. */
  next_change?: { kind: "tier" | "ends"; to_tier?: string | null; at?: string | null } | null;
  /** §5 — the latest switch-off (core.entitlement_change is_enabled 1→0) while
   *  the product is still off. Drives "Your <product> subscription ended on …". */
  ended?: { at: string | null; tier?: string | null } | null;
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
      ...emergencyActAsHeaders(),
    },
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j?.message || j?.error || `HTTP ${res.status}`);
  return (j?.data ?? j) as SubscriptionsResponse;
}

/** SCOPE 2026-10-07 §4.2/§5 — the off notice, the SubNav line and the plan
 *  line on a usage page all need the same answer on the same screen. ONE
 *  request serves them (30 s, per business; in-flight shared), so a product
 *  that is off does not cost three billing reads per page. `force` after the
 *  owner changes something. */
const SUBS_TTL_MS = 30 * 1000;
const subsCache = new Map<string, { at: number; data: SubscriptionsResponse }>();
const subsInFlight = new Map<string, Promise<SubscriptionsResponse>>();
export function clearSubscriptionsCache(): void { subsCache.clear(); subsInFlight.clear(); }
export async function fetchSubscriptionsShared(params: {
  token: string; tenantId: string; force?: boolean;
}): Promise<SubscriptionsResponse> {
  const key = String(params.tenantId || "").toLowerCase();
  if (!params.force) {
    const hit = subsCache.get(key);
    if (hit && Date.now() - hit.at < SUBS_TTL_MS) return hit.data;
    const pending = subsInFlight.get(key);
    if (pending) return pending;
  }
  const run = fetchSubscriptions(params)
    .then((data) => { subsCache.set(key, { at: Date.now(), data }); return data; })
    .finally(() => { subsInFlight.delete(key); });
  subsInFlight.set(key, run);
  return run;
}

/**
 * Update card: the ONE action behind every "Update card" (the Plan & Pricing
 * card, and the off notice on an unpaid product's pages and menu). Opens the
 * payment page for this product in a new tab and answers null; when there is
 * no page to open it answers the sentence to say beside the button.
 */
export async function openUpdateCard(params: {
  token: string; tenantId: string;
  product: "oliver" | "spark" | "arion" | "stella";
}): Promise<string | null> {
  const r = await createPortalSession({
    token: params.token, tenantId: params.tenantId,
    product: params.product === "stella" ? undefined : params.product,
    returnUrl: window.location.origin + "/app/settings/plan-pricing?refresh=1",
  });
  if (r.mode === "portal" && r.url) { window.open(r.url, "_blank", "noopener,noreferrer"); return null; }
  return r.message || "There is no card to update on this account.";
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
      // Founder emergency act-as: backend blocks portal-session creation
      // during read-only mode (it would write a Stripe portal session row).
      ...emergencyActAsHeaders(),
    },
    body: JSON.stringify(body),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j?.message || j?.error || `HTTP ${res.status}`);
  return (j?.data ?? j) as { mode: "portal" | "owner"; url?: string; message?: string };
}

/* ══════════════════════════════════════════════════════════════════════════
   SCOPE_ACCESS_FOLLOWS_SUBSCRIPTION_2026-10-07 §3.9 and §4.2 — the three
   controls a product that is off, or about to be, needs. The routes are
   oliver-api's (stream 1, routes/billing.js); the paths and bodies here are
   the scope's contract, pinned by test/product-access-follows-subscription.test.mjs.
   ══════════════════════════════════════════════════════════════════════════ */

export type SelfServeProduct = "oliver" | "spark" | "arion" | "stella";

async function billingCall<T>(params: {
  token: string; tenantId: string; method: "POST" | "DELETE"; path: string; body: Record<string, unknown>;
}): Promise<T> {
  const res = await fetch(`${OLIVER_API_BASE}${params.path}`, {
    method: params.method,
    headers: {
      Authorization: `Bearer ${params.token}`,
      "x-tenant-key": params.tenantId,
      "Content-Type": "application/json",
      // Founder emergency act-as: billing writes are refused in read-only mode.
      ...emergencyActAsHeaders(),
    },
    body: JSON.stringify(params.body),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(billingRefusalSentence(j, res.status));
  // The plan just changed; the next read must not be the one from before.
  clearSubscriptionsCache();
  return (j?.data ?? j) as T;
}

/** One click back to a paid plan: POST /billing/resubscribe { product }.
 *  `url` = the checkout for the same prices that ended. No url (a price was
 *  archived) = send the owner to the product's plan page instead. */
export interface ResubscribeResult { mode?: string; url?: string | null; message?: string }
export function resubscribe(params: { token: string; tenantId: string; product: SelfServeProduct }): Promise<ResubscribeResult> {
  return billingCall<ResubscribeResult>({ ...params, method: "POST", path: "/billing/resubscribe", body: { product: params.product } });
}

/** Drop one product at period end: POST /billing/change { product, action: 'remove' }. */
export function removeProduct(params: { token: string; tenantId: string; product: SelfServeProduct }): Promise<{ mode?: string; message?: string }> {
  return billingCall({ ...params, method: "POST", path: "/billing/change", body: { product: params.product, action: "remove" } });
}

/** Undo the change scheduled for ONE product: DELETE /billing/pending-change { product }. */
export function keepProductPlan(params: { token: string; tenantId: string; product: SelfServeProduct }): Promise<{ mode?: string; message?: string }> {
  return billingCall({ ...params, method: "DELETE", path: "/billing/pending-change", body: { product: params.product } });
}
