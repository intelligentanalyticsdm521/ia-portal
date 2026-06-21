// ARGUS AI Data Pack — header badge component (LOCKED 2026-06-20).
// Surface 1 of 3 (header / Data Plan page / IA Plugin sidebar).
// Shows current credit balance with a small click-to-detail modal.
//
// Phase 1 verification update (2026-06-21):
//   - Switched data source from arion-api to oliver-api
//     (GET /tenants/me/argus-credits) per scope. ARION/SPARK/OLIVER-only
//     tenants now share one balance endpoint.
//   - Replaced custom popover with the standard IadmModal so the modal
//     pattern matches the rest of the platform.
//   - Polling removed; refetch fires on window focus instead so we don't
//     pound the API in idle tabs.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOliverApi } from '../hooks/useOliverApi';
import { IadmModal, CORE_BLUE, PRODUCT_ACCENT } from './IadmModal';

interface ArgusCreditsResponse {
  balance_credits: number;
  balance_dollar_estimate: number;
  monthly_spent_credits: number;
  monthly_spent_dollars: number;
  last_topup_at: string | null;
  auto_topoff_enabled: boolean;
  auto_topoff_threshold: number | null;
}

const LOW_BALANCE_THRESHOLD = 100;

function formatDate(iso: string | null): string {
  if (!iso) return 'Never';
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return iso;
  }
}

export function ArgusBalanceBadge() {
  const api = useOliverApi();
  const navigate = useNavigate();
  const [data, setData] = useState<ArgusCreditsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    if (!api.ready) return;
    try {
      const res = await api.get<ArgusCreditsResponse>('/tenants/me/argus-credits');
      setData(res);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [api]);

  useEffect(() => {
    load();
  }, [load]);

  // Focus refetch — keeps badge fresh without polling. Fires when the tab
  // returns to the foreground (user comes back from another app / tab).
  useEffect(() => {
    function onFocus() { load(); }
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') load();
    });
    return () => {
      window.removeEventListener('focus', onFocus);
    };
  }, [load]);

  const isLow = useMemo(() => {
    return data ? data.balance_credits < LOW_BALANCE_THRESHOLD : false;
  }, [data]);

  if (error || !data) {
    // Don't render an error to the user — quietly hide if endpoint not reachable
    return null;
  }

  const pillCls = isLow
    ? 'bg-amber-100 text-amber-900 border-amber-300'
    : 'bg-emerald-50 text-emerald-900 border-emerald-200';

  const balanceLabel = data.balance_credits.toLocaleString();
  const dollarLabel = `($${data.balance_dollar_estimate.toFixed(2)})`;

  function handleBuyMore() {
    setOpen(false);
    // Per scope, link to the existing data plan route (verified in App.tsx).
    navigate('/app/settings/argus-data-plan');
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${pillCls} hover:opacity-90`}
        title={`${balanceLabel} AI credits ${dollarLabel}`}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" strokeLinejoin="round" />
        </svg>
        <span>AI Credits: {balanceLabel}</span>
        <span className="opacity-70 font-normal">{dollarLabel}</span>
      </button>

      <IadmModal
        open={open}
        onClose={() => setOpen(false)}
        product="argus"
        eyebrow="ARGUS AI CREDITS"
        title="Credit balance & usage"
        subtitle="1 credit ≈ $0.005"
        size="confirm"
        footer={
          <>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Close
            </button>
            <button
              type="button"
              onClick={handleBuyMore}
              className="rounded px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
              style={{ background: CORE_BLUE }}
            >
              Buy more credits
            </button>
          </>
        }
      >
        <div className="space-y-4 px-5 py-4">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Available</div>
            <div className="mt-1 flex items-baseline gap-2">
              <div className="text-3xl font-bold text-slate-900">{balanceLabel}</div>
              <div className="text-sm text-slate-500">credits {dollarLabel}</div>
            </div>
            {isLow && (
              <div className="mt-1 text-xs font-semibold" style={{ color: PRODUCT_ACCENT.argus }}>
                Low balance — top up to avoid interruptions.
              </div>
            )}
          </div>

          <div className="border-t border-slate-100 pt-3 space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">Month-to-date spent</span>
              <span className="font-semibold text-slate-700">
                {data.monthly_spent_credits.toLocaleString()} credits (${data.monthly_spent_dollars.toFixed(2)})
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">Last top-up</span>
              <span className="font-semibold text-slate-700">{formatDate(data.last_topup_at)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">Auto top-off</span>
              <span className="font-semibold text-slate-700">
                {data.auto_topoff_enabled
                  ? `On (at <${data.auto_topoff_threshold ?? 50})`
                  : 'Off'}
              </span>
            </div>
          </div>
        </div>
      </IadmModal>
    </>
  );
}
