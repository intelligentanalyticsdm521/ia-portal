// CheckoutResultFlash — F-111.
//
// Drop-in banner that reads ?purchased=1 or ?cancelled=1 from the URL and
// shows the appropriate flash for ~8s, then clears the param so a refresh
// doesn't re-show it. Used on every per-product Plan & Pricing page
// (SparkUsagePage, OliverUsagePage, ArionUsagePage) so the Stripe round-
// trip lands with confirmation instead of dropping the user back on the
// page with no signal that anything changed.
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

interface Props {
  /** Display name of the product — drives the success copy. */
  product: "SPARK" | "OLIVER" | "ARION";
  /** Optional success href — the banner's primary action. Defaults to no link. */
  onAcknowledge?: () => void;
}

export function CheckoutResultFlash({ product }: Props) {
  const [params, setParams] = useSearchParams();
  const purchased = params.get("purchased") === "1";
  const cancelled = params.get("cancelled") === "1";
  const [visible, setVisible] = useState(purchased || cancelled);

  useEffect(() => {
    if (!visible) return;
    const t = window.setTimeout(() => setVisible(false), 8000);
    return () => window.clearTimeout(t);
  }, [visible]);

  // Strip the param once we've read it so refresh/back-button doesn't re-fire.
  useEffect(() => {
    if (!purchased && !cancelled) return;
    const next = new URLSearchParams(params);
    next.delete("purchased");
    next.delete("cancelled");
    setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!visible || (!purchased && !cancelled)) return null;

  if (purchased) {
    return (
      <div className="mb-4 flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
        <div className="text-2xl leading-none" aria-hidden>✓</div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-emerald-900">
            Welcome to {product}! Your subscription is active.
          </div>
          <div className="mt-0.5 text-xs text-emerald-800">
            Your invoice will arrive by email in a few minutes. You can manage billing details, payment
            methods, and invoice history from the <strong>Plan &amp; Pricing</strong> hub at any time.
          </div>
        </div>
        <button
          type="button"
          onClick={() => setVisible(false)}
          className="text-emerald-700 hover:text-emerald-900 text-xs font-semibold flex-shrink-0"
          aria-label="Dismiss"
        >
          ✕
        </button>
      </div>
    );
  }

  return (
    <div className="mb-4 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
      <div className="text-2xl leading-none" aria-hidden>⚠</div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-amber-900">
          Checkout cancelled — nothing was charged.
        </div>
        <div className="mt-0.5 text-xs text-amber-800">
          Your previous plan is unchanged. Pick a tier below to try again.
        </div>
      </div>
      <button
        type="button"
        onClick={() => setVisible(false)}
        className="text-amber-700 hover:text-amber-900 text-xs font-semibold flex-shrink-0"
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  );
}

export default CheckoutResultFlash;
