/**
 * PendingChangeBanner — shows when a tenant has a scheduled subscription
 * downgrade that hasn't taken effect yet.
 *
 * Mounted at the top of every Plan & Pricing page (ARION, SPARK, OLIVER).
 * If there's no pending change, renders nothing.
 *
 * Driven by /billing/pending-change on oliver-api. The "Cancel downgrade"
 * button calls DELETE /billing/pending-change which releases the Stripe
 * Subscription Schedule and clears core.tenants.pending_*.
 */
import { useEffect, useState } from "react";
import { fetchPendingChange, cancelPendingChange, type PendingChange } from "../lib/billingApi";

interface Props {
  /** Token getter (matches the `getToken` from `useAccessToken`). The
   *  banner calls this in its own effect so the parent doesn't have to
   *  manage the token lifecycle. Returns `{ accessToken }` shape. */
  getToken: () => Promise<{ accessToken: string }>;
  /** Tenant id from app state. */
  tenantId: string | null;
  /** Re-fetch trigger — bump on parent state change to force a refresh
   *  (e.g. after the user submits a plan change on the same page). */
  refreshKey?: number;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "long", day: "numeric", year: "numeric",
    });
  } catch {
    return iso;
  }
}

function summarize(p: PendingChange): string {
  const parts: string[] = [];
  if (p.pendingTier) parts.push(`tier: ${p.pendingTier}`);
  if (p.pendingCxTier) parts.push(`CX add-on: ${p.pendingCxTier === "none" ? "removed" : p.pendingCxTier}`);
  if (p.pendingSeoAddonTier) parts.push(`SEO add-on: ${p.pendingSeoAddonTier === "none" ? "removed" : p.pendingSeoAddonTier}`);
  return parts.join(" · ") || "a scheduled change";
}

export function PendingChangeBanner({ getToken, tenantId, refreshKey = 0 }: Props) {
  const [pending, setPending] = useState<PendingChange | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!tenantId) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true); setError(null);
    (async () => {
      try {
        const t = await getToken();
        const p = await fetchPendingChange({ token: t.accessToken, tenantId });
        if (!cancelled) setPending(p);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [getToken, tenantId, refreshKey]);

  if (loading || error || !pending) return null;

  async function onCancel() {
    if (!tenantId) return;
    if (!window.confirm("Cancel the scheduled downgrade and stay on your current plan?")) return;
    setCancelling(true); setError(null);
    try {
      const t = await getToken();
      await cancelPendingChange({ token: t.accessToken, tenantId });
      setPending(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCancelling(false);
    }
  }

  return (
    <div className="mb-6 rounded-lg border-2 border-amber-300 bg-amber-50 px-5 py-4">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-0.5">
          <svg className="h-5 w-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-amber-900">
            Downgrade scheduled for {formatDate(pending.effectiveAt)}
          </h3>
          <p className="mt-1 text-sm text-amber-800">
            You'll switch to: <strong>{summarize(pending)}</strong>. You keep your current plan and all its features until then — no charge or refund right now.
          </p>
          <div className="mt-3 flex items-center gap-3">
            <button
              onClick={onCancel}
              disabled={cancelling}
              className="rounded-md bg-white border border-amber-400 px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-50"
            >
              {cancelling ? "Cancelling…" : "Cancel downgrade — keep current plan"}
            </button>
            {pending.requestedByEmail && (
              <span className="text-xs text-amber-700">Requested by {pending.requestedByEmail}</span>
            )}
          </div>
          {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
        </div>
      </div>
    </div>
  );
}

export default PendingChangeBanner;
