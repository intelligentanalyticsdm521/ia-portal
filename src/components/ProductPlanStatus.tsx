/**
 * ProductPlanStatus — the one line under a product's tier, and the control
 * that goes with it. Used on the Plan & Pricing cards and at the top of the
 * product's own plan page (PendingChangeBanner).
 *
 * SCOPE_ACCESS_FOLLOWS_SUBSCRIPTION_2026-10-07 §5:
 *
 *   Active               "Renews November 1, 2026"                        [Remove SPARK]
 *   Downgrade scheduled  "OLIVER Pro until November 1, 2026, then Invoicing"  [Keep my plan]
 *   Ending               "SPARK Standard until November 1, 2026, then it ends" [Keep SPARK]
 *   Payment failed       "Your last payment didn't go through. Update your card to keep your plan." [Update card]
 *   Ended                "Your SPARK subscription ended on … Re-subscribe to pick up where you left off." [Re-subscribe]
 *   Never bought         "Not subscribed"                                  [Add SPARK to your account]
 *
 * Remove asks first, in the card itself (never a browser pop-up): "SPARK stays
 * on until <date>, then it ends. Your other products are not changed."
 *
 * Every answer is said beside the control that caused it.
 */
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAppState } from '../app/AppState';
import { useAccessToken } from '../auth/useAccessToken';
import { createPortalSession, keepProductPlan, removeProduct, resubscribe } from '../lib/billingApi';
import { leaveForCheckout } from '../lib/leaveForCheckout';
import {
  planCardLine, planPagePath, removeConfirmSentence, PRODUCT_NAME,
  type GatedProduct, type PlanRow,
} from '../lib/productAccess';

const FALLBACK_FAIL = 'That did not go through. Nothing was changed. Try again in a minute.';

export function ProductPlanStatus({ product, row, owner = false, addTo, onChanged, hideWhenNever = false }: {
  product: GatedProduct;
  row: PlanRow | null;
  /** The platform account: everything is included, nothing to change. */
  owner?: boolean;
  /** Where "Add <PRODUCT> to your account" goes. null = no self-serve page (said in words). */
  addTo?: string | null;
  /** Called after a change went through, so the caller can re-read the plan. */
  onChanged?: () => void;
  /** On the product's own plan page the page itself is the way to buy it. */
  hideWhenNever?: boolean;
}) {
  const { activeTenantId } = useAppState();
  const { getToken } = useAccessToken();
  const navigate = useNavigate();
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (owner) return null;
  const card = planCardLine(product, row);
  if (hideWhenNever && card.state === 'never') return null;
  const name = PRODUCT_NAME[product];

  async function run(kind: string, fn: (token: string, tenantId: string) => Promise<void>) {
    if (!activeTenantId) return;
    setBusy(kind); setError(null); setMessage(null);
    try {
      const t = await getToken();
      await fn(t.accessToken, activeTenantId);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : FALLBACK_FAIL);
    } finally {
      setBusy(null);
    }
  }

  const onControl = () => {
    const c = card.control;
    if (!c) return;
    if (c.kind === 'keep') {
      return run('keep', async (token, tenantId) => {
        const r = await keepProductPlan({ token, tenantId, product });
        setMessage(r?.message || `Your ${name} plan stays as it is.`);
        onChanged?.();
      });
    }
    if (c.kind === 'update_card') {
      return run('update_card', async (token, tenantId) => {
        const r = await createPortalSession({
          token, tenantId,
          product: product === 'stella' ? undefined : product,
          returnUrl: window.location.origin + '/app/settings/plan-pricing?refresh=1',
        });
        if (r.mode === 'portal' && r.url) window.open(r.url, '_blank', 'noopener,noreferrer');
        else setMessage(r.message || 'There is no card to update on this account.');
      });
    }
    if (c.kind === 'resubscribe') {
      return run('resubscribe', async (token, tenantId) => {
        const r = await resubscribe({ token, tenantId, product });
        if (r?.url) { leaveForCheckout(r.url); return; }
        navigate(planPagePath(product));
      });
    }
  };

  const onRemove = () => run('remove', async (token, tenantId) => {
    const r = await removeProduct({ token, tenantId, product });
    setConfirmingRemove(false);
    setMessage(r?.message || removeConfirmSentence(product, row?.current_period_end));
    onChanged?.();
  });

  const btn = 'inline-flex items-center justify-center rounded-md px-3 py-1.5 text-xs font-semibold disabled:opacity-50';

  return (
    <div className="mt-2 flex flex-col gap-1.5" data-plan-status={product} data-plan-state={card.state}>
      {card.line && card.state !== 'never' && (
        <p className={`text-xs ${card.state === 'past_due' ? 'text-red-700' : card.state === 'ended' ? 'text-slate-800' : 'text-gray-600'}`} data-plan-line>
          {card.line}
        </p>
      )}

      {card.control && card.control.kind === 'add' ? (
        addTo === undefined ? null : addTo ? (
          <Link to={addTo} className={`${btn} bg-gray-900 text-white hover:bg-gray-800`} data-plan-control="add">
            {card.control.label}
          </Link>
        ) : (
          <span className="inline-flex items-center justify-center rounded-md border border-dashed border-gray-300 px-3 py-1.5 text-xs text-gray-500">
            Ask us about {name}
          </span>
        )
      ) : card.control ? (
        <button
          type="button"
          onClick={onControl}
          disabled={!!busy}
          data-plan-control={card.control.kind}
          className={`${btn} ${card.control.kind === 'resubscribe' || card.control.kind === 'update_card'
            ? 'bg-[#EF6C33] text-white hover:bg-[#d95e2b]'
            : 'border border-amber-400 bg-white text-amber-900 hover:bg-amber-50'}`}
        >
          {busy === card.control.kind ? 'Working…' : card.control.label}
        </button>
      ) : null}

      {card.canRemove && !confirmingRemove && (
        <button
          type="button"
          onClick={() => { setConfirmingRemove(true); setMessage(null); setError(null); }}
          disabled={!!busy}
          data-plan-control="remove"
          className={`${btn} border border-gray-300 bg-white font-medium text-gray-700 hover:bg-gray-50`}
        >
          Remove {name}
        </button>
      )}
      {confirmingRemove && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-2.5" data-plan-remove-confirm>
          <p className="text-xs text-amber-900">{removeConfirmSentence(product, row?.current_period_end)}</p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={onRemove}
              disabled={!!busy}
              data-plan-control="remove-confirm"
              className={`${btn} bg-amber-600 text-white hover:bg-amber-700`}
            >
              {busy === 'remove' ? 'Removing…' : `Yes, remove ${name}`}
            </button>
            <button
              type="button"
              onClick={() => setConfirmingRemove(false)}
              disabled={!!busy}
              data-plan-control="remove-cancel"
              className={`${btn} border border-gray-300 bg-white font-medium text-gray-700`}
            >
              Keep {name}
            </button>
          </div>
        </div>
      )}

      {message && <p className="text-xs text-emerald-700" data-plan-message>{message}</p>}
      {error && <p className="text-xs text-red-700" role="alert">{error}</p>}
    </div>
  );
}

export default ProductPlanStatus;
