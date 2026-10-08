/**
 * ProductGate — the product gate in front of a product's pages.
 *
 * SCOPE_ACCESS_FOLLOWS_SUBSCRIPTION_2026-10-07 §4.2. When platform-api has
 * DECIDED the business does not own the product (its subscription ended, or
 * it was never bought), the pages are replaced by one sentence and one control
 * (ProductEndedNotice). Undecided stays open (SEAM-3-B). The product's own plan
 * page (<product>_usage) is never closed: it is where they buy it back.
 *
 * Used by ServiceRouter (every /app/services/:serviceKey page, OUTSIDE the
 * tier check) and by SPARK's own routes (/app/spark/leadgen/*, contact
 * scoring, customer flow, lifecycle, sync issues), so a bookmark or an
 * in-page link never lands on a page of API refusals. Re-asked once per
 * navigation (`refreshKey`), from the shared one-minute cache.
 */
import type { ReactNode } from 'react';
import { FEATURE_GATING_ENABLED } from '../config/featureFlags';
import { useProductAccess } from '../hooks/useProductAccess';
import { gateExemptServiceKey, isOffGatedProduct } from '../lib/productAccess';
import { ProductEndedNotice } from './ProductEndedNotice';

export function ProductGate({ product, serviceKey, refreshKey, children }: {
  product: string | null | undefined;
  /** The page's service key; its plan page (<product>_usage) is never closed. */
  serviceKey?: string | null;
  refreshKey?: unknown;
  children: ReactNode;
}) {
  const { isOff } = useProductAccess(refreshKey ?? serviceKey ?? product);
  if (
    FEATURE_GATING_ENABLED &&
    isOffGatedProduct(product) &&
    !gateExemptServiceKey(serviceKey) &&
    isOff(product)
  ) {
    return <ProductEndedNotice product={product} />;
  }
  return <>{children}</>;
}

export default ProductGate;
