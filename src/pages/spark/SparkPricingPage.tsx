import { Navigate } from "react-router-dom";

/**
 * Legacy route. Pricing + tier comparison + top-ups are now consolidated
 * into the Usage & Billing page so customers see their current usage AND
 * tier options on one screen. Anything pointing at /spark/pricing redirects.
 */
export function SparkPricingPage() {
  return <Navigate to="/app/services/spark_usage" replace />;
}

export default SparkPricingPage;
