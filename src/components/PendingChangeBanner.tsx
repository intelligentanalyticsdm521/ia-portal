/**
 * PendingChangeBanner — the plan line at the top of a product's own plan page
 * (ARION, SPARK and OLIVER Plan & Pricing).
 *
 * SCOPE_ACCESS_FOLLOWS_SUBSCRIPTION_2026-10-07 §5. It used to read ONE
 * scheduled change for the whole business (core.tenants.pending_* via
 * GET /billing/pending-change), so a STELLA downgrade showed as OLIVER's and
 * the banner never cleared when the downgrade happened. It now reads
 * `next_change` for ITS OWN product from GET /billing/subscriptions and shows
 * the same line and control as that product's Plan & Pricing card:
 *
 *   "OLIVER Pro until November 1, 2026, then Invoicing"   [Keep my plan]
 *   "SPARK Standard until November 1, 2026, then it ends" [Keep SPARK]
 *   "Your last payment didn't go through. …"              [Update card]
 *   "Your SPARK subscription ended on … Re-subscribe …"   [Re-subscribe]
 *   "Renews November 1, 2026"                             [Remove SPARK]
 *
 * "Keep" sends DELETE /billing/pending-change { product }, so it restores only
 * this product. Fetched once on mount (and when `refreshKey` changes), from the
 * shared 30-second read the off notice uses, never polled.
 */
import { useEffect, useState } from "react";
import { fetchSubscriptionsShared } from "../lib/billingApi";
import { rowForProduct, type GatedProduct, type PlanRow } from "../lib/productAccess";
import { ProductPlanStatus } from "./ProductPlanStatus";

interface Props {
  /** Token getter (matches the `getToken` from `useAccessToken`). */
  getToken: () => Promise<{ accessToken: string }>;
  /** Tenant id from app state. */
  tenantId: string | null;
  /** The product whose plan page this is. */
  product: GatedProduct;
  /** Re-fetch trigger — bump after the page itself changes the plan. */
  refreshKey?: number;
}

export function PendingChangeBanner({ getToken, tenantId, product, refreshKey = 0 }: Props) {
  const [row, setRow] = useState<PlanRow | null>(null);
  const [owner, setOwner] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!tenantId) { setLoaded(true); return; }
    let cancelled = false;
    (async () => {
      try {
        const t = await getToken();
        const r = await fetchSubscriptionsShared({ token: t.accessToken, tenantId, force: refreshKey > 0 || reload > 0 });
        if (!cancelled) { setRow(rowForProduct(r?.subscriptions, product)); setOwner(!!r?.owner); }
      } catch {
        // The plan page below still works; this line is a summary of it.
        if (!cancelled) setRow(null);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [getToken, tenantId, product, refreshKey, reload]);

  if (!loaded || owner || !row) return null;

  return (
    <div className="mb-6 rounded-lg border bg-white px-5 py-4" data-plan-banner={product}>
      <ProductPlanStatus product={product} row={row} onChanged={() => setReload((k) => k + 1)} hideWhenNever />
    </div>
  );
}

export default PendingChangeBanner;
