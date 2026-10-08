/**
 * ProductEndedNotice — what a product's pages show when the product is off.
 *
 * SCOPE_ACCESS_FOLLOWS_SUBSCRIPTION_2026-10-07 §4.2. One sentence and one
 * control, in place of the product's pages:
 *
 *   Ended         "Your SPARK subscription ended on November 1, 2026.
 *                  Re-subscribe to pick up where you left off."   [Re-subscribe]
 *   Never bought  "SPARK isn't part of your plan yet."           [Add SPARK]
 *   Not an admin  the sentence, and "Ask an admin on your team to re-subscribe."
 *   Founder viewing a client
 *                 the sentence, and "Switch to your own business to change billing."
 *
 * The last two say why in words; there is never a greyed-out button that only
 * exists to say no.
 *
 * Re-subscribe is ONE click to the checkout: POST /billing/resubscribe
 * { product } answers with the checkout for the same prices that ended. When it
 * cannot (a price was archived), the owner is taken to the product's plan page
 * with the API's sentence ("Choose a SPARK plan to pick up where you left
 * off."), which the plan line there shows. STELLA's plans are offered on its
 * Plan & Pricing card, which opens with them showing. "SPARK is already on."
 * is said here, beside the button.
 *
 * Data: GET /billing/subscriptions once, on mount, for the `ended` date of this
 * product (§5). Nothing is polled.
 */
import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAppState } from '../app/AppState';
import { useAccessToken } from '../auth/useAccessToken';
import { useBillingViewer } from '../hooks/useBillingViewer';
import { fetchSubscriptionsShared, resubscribe } from '../lib/billingApi';
import { leaveForCheckout } from '../lib/leaveForCheckout';
import {
  offNotice, planPagePath, resubscribeFallbackSentence, rowForProduct, rowIsLive, PRODUCT_NAME,
  STELLA_PICK_SENTENCE, type GatedProduct,
} from '../lib/productAccess';
import type { PlanNoticeState } from './ProductPlanStatus';

export function ProductEndedNotice({ product, variant = 'page' }: {
  product: GatedProduct;
  /** 'page' replaces the product's pages; 'nav' is the same sentence and
   *  control above the product's menu (SubNav). */
  variant?: 'page' | 'nav';
}) {
  const { activeTenantId } = useAppState();
  const { getToken } = useAccessToken();
  const viewer = useBillingViewer();
  const navigate = useNavigate();
  const location = useLocation();
  const [said, setSaid] = useState<string | null>(null);

  const [ended, setEnded] = useState<{ at: string | null } | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!activeTenantId) { setLoaded(true); return; }
    const key = `${activeTenantId}:${product}`;
    if (loadedFor.current === key) return;
    loadedFor.current = key;
    let cancelled = false;
    (async () => {
      try {
        const t = await getToken();
        const r = await fetchSubscriptionsShared({ token: t.accessToken, tenantId: activeTenantId });
        const row = rowForProduct(r?.subscriptions, product);
        if (!cancelled) setEnded(row && !rowIsLive(row) && row.ended ? { at: row.ended.at ?? null } : null);
      } catch {
        // Not knowing WHEN it ended changes only the sentence, never the control:
        // both versions lead back to buying it.
        if (!cancelled) setEnded(null);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [activeTenantId, getToken, product]);

  const notice = offNotice(product, ended, viewer);

  /** To the plan page, carrying the sentence; never to the page already open. */
  function toPlanPage(text: string, pick: boolean) {
    const dest = planPagePath(product);
    if (dest === location.pathname) { setSaid(text); return; }
    navigate(dest, { state: { planNotice: { product, text, pick } } satisfies PlanNoticeState });
  }

  async function onAction() {
    if (!notice.action) return;
    setError(null); setSaid(null);
    if (notice.action.kind === 'add') {
      if (product === 'stella') toPlanPage(STELLA_PICK_SENTENCE, true);
      else navigate(planPagePath(product));
      return;
    }
    if (!activeTenantId) return;
    setBusy(true);
    try {
      const t = await getToken();
      const r = await resubscribe({ token: t.accessToken, tenantId: activeTenantId, product });
      if (r?.url) { leaveForCheckout(r.url); return; }
      if (r?.mode === 'active' || r?.mode === 'owner') { setSaid(r.message || `${PRODUCT_NAME[product]} is already on.`); return; }
      toPlanPage(resubscribeFallbackSentence(product, r?.message), product === 'stella');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not go through. Nothing was changed. Try again in a minute.');
    } finally {
      setBusy(false);
    }
  }

  const body = !loaded ? null : (
    <>
      <p className={variant === 'nav' ? 'text-[11px] leading-snug text-[#D5E8F0]' : 'mt-3 text-base text-slate-800'} data-notice-sentence>
        {notice.sentence}
      </p>
      {notice.action && (
        <button
          type="button"
          onClick={onAction}
          disabled={busy}
          data-notice-action={notice.action.kind}
          className={variant === 'nav'
            ? 'mt-2 w-full rounded px-2 py-1 text-[10px] font-bold text-white disabled:opacity-60'
            : 'mt-5 inline-flex items-center justify-center rounded-md bg-[#EF6C33] px-5 py-2 text-sm font-semibold text-white hover:bg-[#d95e2b] disabled:opacity-60'}
          style={variant === 'nav' ? { background: '#EF6C33' } : undefined}
        >
          {busy ? 'Opening checkout…' : notice.action.label}
        </button>
      )}
      {notice.note && (
        <p className={variant === 'nav' ? 'mt-1.5 text-[10px] leading-snug text-[#D5E8F0]/80' : 'mt-4 text-sm text-slate-600'} data-notice-note>
          {notice.note}
        </p>
      )}
      {said && <p className={variant === 'nav' ? 'mt-1.5 text-[10px] text-[#D5E8F0]' : 'mt-3 text-sm text-slate-700'} data-notice-said>{said}</p>}
      {error && <p className={variant === 'nav' ? 'mt-1.5 text-[10px] text-red-300' : 'mt-3 text-sm text-red-700'} role="alert">{error}</p>}
    </>
  );

  if (variant === 'nav') {
    return (
      <div
        className="mx-3 mb-3 rounded-md px-3 py-2.5"
        style={{ background: '#EF6C3318', border: '1px solid #EF6C3355' }}
        data-product-ended={product}
        data-variant="nav"
      >
        {body}
      </div>
    );
  }

  return (
    <div className="flex flex-1 items-start justify-center p-6" data-product-ended={product} data-variant="page">
      <div className="mt-10 w-full max-w-lg rounded-xl border bg-white p-6 text-center shadow-sm">
        <div className="text-xs font-bold tracking-wide text-slate-500">{PRODUCT_NAME[product]}</div>
        {body ?? <p className="mt-3 text-sm text-slate-500">Checking your plan…</p>}
      </div>
    </div>
  );
}

export default ProductEndedNotice;
