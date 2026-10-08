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
 * WHO IS LOOKING (review 2026-10-08). A team member who is not an admin, and
 * the founder viewing a client's business, see the line and NO control, with
 * one sentence saying why ("Switch to your own business to change billing.").
 * The billing API refuses them too; the screen never offers what it refuses.
 *
 * RE-SUBSCRIBE WITHOUT A CHECKOUT (the API answers url null): its sentence is
 * said beside the button. The owner is taken to the product's plan page only
 * when that is somewhere else, carrying the sentence with them; on the plan
 * page itself nothing navigates. STELLA has no plan page, so its card offers
 * its plans right here, each one opening the checkout.
 *
 * Every answer is said beside the control that caused it.
 */
import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAppState } from '../app/AppState';
import { useAccessToken } from '../auth/useAccessToken';
import { useBillingViewer } from '../hooks/useBillingViewer';
import { changePlan, keepProductPlan, openUpdateCard, removeProduct, resubscribe } from '../lib/billingApi';
import { leaveForCheckout } from '../lib/leaveForCheckout';
import {
  planCardForViewer, planCardLine, planPagePath, removeConfirmSentence, resubscribeFallbackSentence,
  STELLA_PICK_SENTENCE, STELLA_PLAN_CHOICES, PRODUCT_NAME,
  type GatedProduct, type PlanRow,
} from '../lib/productAccess';

const FALLBACK_FAIL = 'That did not go through. Nothing was changed. Try again in a minute.';

/** Router state carried to a plan page: the sentence Re-subscribe answered with. */
export interface PlanNoticeState { planNotice?: { product: string; text: string; pick?: boolean } }

export function ProductPlanStatus({ product, row, owner = false, addTo, onChanged, hideWhenNever = false }: {
  product: GatedProduct;
  row: PlanRow | null;
  /** The platform account: everything is included, nothing to change. */
  owner?: boolean;
  /** Where "Add <PRODUCT> to your account" goes. null = no plan page (STELLA: its plans are offered in the card). */
  addTo?: string | null;
  /** Called after a change went through, so the caller can re-read the plan. */
  onChanged?: () => void;
  /** On the product's own plan page the page itself is the way to buy it. */
  hideWhenNever?: boolean;
}) {
  const { activeTenantId } = useAppState();
  const { getToken } = useAccessToken();
  const viewer = useBillingViewer();
  const navigate = useNavigate();
  const location = useLocation();
  const arrived = (location.state as PlanNoticeState | null)?.planNotice;
  const arrivedHere = arrived && arrived.product === product ? arrived : null;
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [message, setMessage] = useState<string | null>(arrivedHere?.text || null);
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState<boolean>(!!arrivedHere?.pick && product === 'stella');

  if (owner) return null;
  const { card, note } = planCardForViewer(product, planCardLine(product, row), viewer);
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
    if (c.kind === 'add') { setPicking(true); setMessage(null); setError(null); return; }
    if (c.kind === 'keep') {
      return run('keep', async (token, tenantId) => {
        const r = await keepProductPlan({ token, tenantId, product });
        setMessage(r?.message || `Your ${name} plan stays as it is.`);
        onChanged?.();
      });
    }
    if (c.kind === 'update_card') {
      return run('update_card', async (token, tenantId) => {
        const said = await openUpdateCard({ token, tenantId, product });
        if (said) setMessage(said);
      });
    }
    if (c.kind === 'resubscribe') {
      return run('resubscribe', async (token, tenantId) => {
        const r = await resubscribe({ token, tenantId, product });
        if (r?.url) { leaveForCheckout(r.url); return; }
        if (r?.mode === 'active' || r?.mode === 'owner') {
          // "SPARK is already on." — said here; the card re-reads the plan.
          setMessage(r.message || `${name} is already on.`);
          onChanged?.();
          return;
        }
        const text = resubscribeFallbackSentence(product, r?.message);
        if (product === 'stella') { setMessage(text); setPicking(true); return; }
        const dest = planPagePath(product);
        if (dest !== location.pathname) {
          navigate(dest, { state: { planNotice: { product, text } } satisfies PlanNoticeState });
          return;
        }
        setMessage(text);
      });
    }
  };

  const onPick = (plan: string) => run(`pick:${plan}`, async (token, tenantId) => {
    const r = await changePlan({ token, tenantId, body: { product: 'stella', billing_cycle: 'monthly', plan } });
    if (r?.url) { leaveForCheckout(r.url); return; }
    setPicking(false);
    setMessage(r?.message || 'STELLA is on your plan.');
    onChanged?.();
  });

  const onRemove = () => run('remove', async (token, tenantId) => {
    const r = await removeProduct({ token, tenantId, product });
    setConfirmingRemove(false);
    setMessage(r?.message || removeConfirmSentence(product, row?.current_period_end));
    onChanged?.();
  });

  const btn = 'inline-flex items-center justify-center rounded-md px-3 py-1.5 text-xs font-semibold disabled:opacity-50';
  // STELLA has no plan page: "Add STELLA" opens its plans here instead of a link.
  const addInCard = card.control?.kind === 'add' && product === 'stella' && !addTo;

  return (
    <div className="mt-2 flex flex-col gap-1.5" data-plan-status={product} data-plan-state={card.state} data-plan-viewer={viewer}>
      {card.line && card.state !== 'never' && (
        <p className={`text-xs ${card.state === 'past_due' ? 'text-red-700' : card.state === 'ended' ? 'text-slate-800' : 'text-gray-600'}`} data-plan-line>
          {card.line}
        </p>
      )}

      {card.control && card.control.kind === 'add' && !addInCard ? (
        addTo ? (
          <Link to={addTo} className={`${btn} bg-gray-900 text-white hover:bg-gray-800`} data-plan-control="add">
            {card.control.label}
          </Link>
        ) : null
      ) : card.control && !(picking && card.control.kind !== 'keep' && card.control.kind !== 'update_card') ? (
        <button
          type="button"
          onClick={onControl}
          disabled={!!busy}
          data-plan-control={card.control.kind}
          className={`${btn} ${card.control.kind === 'resubscribe' || card.control.kind === 'update_card' || card.control.kind === 'add'
            ? 'bg-[#EF6C33] text-white hover:bg-[#d95e2b]'
            : 'border border-amber-400 bg-white text-amber-900 hover:bg-amber-50'}`}
        >
          {busy === card.control.kind ? 'Working…' : card.control.label}
        </button>
      ) : null}

      {picking && product === 'stella' && card.control && (
        <div className="rounded-md border border-indigo-200 bg-indigo-50 p-2.5" data-plan-pick>
          <p className="text-xs text-indigo-900">{STELLA_PICK_SENTENCE}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {STELLA_PLAN_CHOICES.map((c) => (
              <button
                key={c.plan}
                type="button"
                onClick={() => onPick(c.plan)}
                disabled={!!busy}
                data-plan-control={`pick-${c.plan}`}
                className={`${btn} bg-[#4C5BD4] text-white hover:bg-[#3f4cb8]`}
              >
                {busy === `pick:${c.plan}` ? 'Opening checkout…' : c.label}
              </button>
            ))}
          </div>
        </div>
      )}

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
      {confirmingRemove && card.canRemove && (
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

      {note && <p className="text-xs text-gray-600" data-plan-note>{note}</p>}
      {message && <p className="text-xs text-emerald-700" data-plan-message>{message}</p>}
      {error && <p className="text-xs text-red-700" role="alert">{error}</p>}
    </div>
  );
}

export default ProductPlanStatus;
