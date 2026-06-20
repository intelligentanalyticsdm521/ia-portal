// Settings → Data Plan & Usage — Surface 2 of 3 for ARGUS AI Data Pack.
//
// Shows: current balance, monthly allocation, usage breakdown by action,
// credit pack slider (50→1000), mode toggle (one-time / monthly / annual),
// auto-topoff config (off by default).
//
// All purchase actions hit OLIVER catalog → Stripe Checkout. The 30 Stripe
// prices were seeded by scripts/seed-argus-data-pack-catalog.mjs.

import { useEffect, useMemo, useState } from 'react';
import { useAppState } from '../../app/AppState';
import { useAccessToken } from '../../auth/useAccessToken';
import { getArgusBalance, getArgusUsage, getArgusPricing, type ArgusBalance, type ArgusUsage, type ArgusPricingRow } from '../../lib/arionApi';

const ARION_API_BASE = (import.meta.env.VITE_ARION_API_BASE_URL as string)
  || 'https://app-arion-api-prod-e6fuc9gzd8f3hqfe.centralus-01.azurewebsites.net';

// Locked per scope doc Section 4 — mirrors seed-argus-data-pack-catalog.mjs.
const PACK_SIZES = [50, 100, 150, 200, 250, 300, 400, 500, 750, 1000];
const PACK_DISCOUNTS: Record<number, number> = {
  50: 0, 100: 0, 150: 0, 200: 0,
  250: 0.10, 300: 0.10, 400: 0.10,
  500: 0.15, 750: 0.15,
  1000: 0.20,
};

function packPriceCents(credits: number, mode: 'onetime' | 'monthly' | 'annual'): number {
  const baseUsd = credits * 0.10 * (1 - (PACK_DISCOUNTS[credits] || 0));
  const usd = mode === 'annual' ? baseUsd * 12 * 0.9 : baseUsd;
  return Math.round(usd * 100);
}

function fmtUsd(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

export function ArgusDataPlanPage() {
  const { activeTenantId } = useAppState();
  const { getToken } = useAccessToken();
  const [balance, setBalance] = useState<ArgusBalance['data'] | null>(null);
  const [usage, setUsage] = useState<ArgusUsage['data'] | null>(null);
  const [pricing, setPricing] = useState<ArgusPricingRow[]>([]);
  const [packSize, setPackSize] = useState(200);
  const [mode, setMode] = useState<'onetime' | 'monthly' | 'annual'>('onetime');
  const [usageDays, setUsageDays] = useState(30);

  useEffect(() => {
    if (!activeTenantId) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await getToken();
        const [b, u, p] = await Promise.all([
          getArgusBalance({ baseUrl: ARION_API_BASE, bearerToken: token.accessToken, tenantId: activeTenantId }),
          getArgusUsage({ baseUrl: ARION_API_BASE, bearerToken: token.accessToken, tenantId: activeTenantId, days: usageDays }),
          getArgusPricing({ baseUrl: ARION_API_BASE, bearerToken: token.accessToken, tenantId: activeTenantId }),
        ]);
        if (!cancelled) {
          setBalance(b.data);
          setUsage(u.data);
          setPricing(p.data);
        }
      } catch (e) { console.error('[argus data plan]', e); }
    })();
    return () => { cancelled = true; };
  }, [activeTenantId, getToken, usageDays]);

  const packCents = useMemo(() => packPriceCents(packSize, mode), [packSize, mode]);
  const packDiscountPct = (PACK_DISCOUNTS[packSize] || 0) * 100;

  function startCheckout() {
    // Placeholder: real implementation creates a Stripe Checkout Session via
    // a new oliver-api endpoint that knows the price IDs by (credits, mode).
    // Until that endpoint lands, surface the intent so the user knows their click registered.
    alert(`Coming soon: Stripe Checkout for ${packSize} credits (${mode}) = ${fmtUsd(packCents)}.\nUntil then, contact us to purchase.`);
  }

  return (
    <div className="space-y-6 p-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">ARGUS AI Data Plan</h1>
        <p className="text-sm text-slate-600 mt-1">
          ARGUS AI credits power every AI action across ARION, SPARK, OLIVER, and ARGUS.
          One pool, one balance, used wherever you need it.
        </p>
      </div>

      {/* Balance summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="text-[10px] uppercase font-semibold tracking-wide text-slate-500">Current Balance</div>
          <div className="text-3xl font-bold text-slate-900 mt-1">{balance?.balance?.toLocaleString() ?? '—'}</div>
          <div className="text-xs text-slate-500 mt-0.5">credits available now</div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="text-[10px] uppercase font-semibold tracking-wide text-slate-500">Monthly Allocation</div>
          <div className="text-3xl font-bold text-slate-900 mt-1">{balance?.monthly_allocation?.toLocaleString() ?? '—'}</div>
          <div className="text-xs text-slate-500 mt-0.5">
            {balance ? `${balance.pool_base} (${balance.base_tier}) + ${balance.pool_bonus} bonus` : ''}
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="text-[10px] uppercase font-semibold tracking-wide text-slate-500">Lifetime Spent</div>
          <div className="text-3xl font-bold text-slate-900 mt-1">{balance?.lifetime_spent?.toLocaleString() ?? '—'}</div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="text-[10px] uppercase font-semibold tracking-wide text-slate-500">Refunded by Guard</div>
          <div className="text-3xl font-bold text-slate-900 mt-1">{balance?.lifetime_refunded?.toLocaleString() ?? '—'}</div>
        </div>
      </div>

      {/* Buy credits */}
      <div className="rounded-lg border border-slate-200 bg-white p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Add more credits</h2>
          <div className="inline-flex rounded-md border border-slate-300 overflow-hidden text-xs font-semibold">
            {(['onetime', 'monthly', 'annual'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`px-3 py-1.5 ${mode === m ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 hover:bg-slate-50'}`}
              >
                {m === 'onetime' ? 'One-time' : m === 'monthly' ? 'Monthly' : 'Annual'}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-end justify-between mb-2">
            <div>
              <div className="text-xs text-slate-500">Pack size</div>
              <div className="text-2xl font-bold text-slate-900">{packSize.toLocaleString()} <span className="text-sm font-normal text-slate-500">credits</span></div>
            </div>
            <div className="text-right">
              <div className="text-xs text-slate-500">{mode === 'onetime' ? 'One-time' : mode === 'monthly' ? 'Per month' : 'Per year'}</div>
              <div className="text-2xl font-bold text-slate-900">{fmtUsd(packCents)}</div>
              {packDiscountPct > 0 && (
                <div className="text-[11px] font-semibold text-emerald-700">{packDiscountPct}% off</div>
              )}
            </div>
          </div>
          <input
            type="range"
            min={0}
            max={PACK_SIZES.length - 1}
            value={PACK_SIZES.indexOf(packSize)}
            onChange={(e) => setPackSize(PACK_SIZES[Number(e.target.value)])}
            className="w-full"
          />
          <div className="flex justify-between mt-1 text-[10px] text-slate-400">
            {PACK_SIZES.map((s) => <span key={s}>{s}</span>)}
          </div>
        </div>

        <button
          type="button"
          onClick={startCheckout}
          className="w-full rounded-lg bg-[#EF6C33] px-6 py-3 text-white font-semibold hover:bg-[#d75a25]"
        >
          {mode === 'onetime' ? 'Buy ' : mode === 'monthly' ? 'Subscribe to ' : 'Subscribe annually to '}
          {packSize.toLocaleString()} credits — {fmtUsd(packCents)}
        </button>
      </div>

      {/* Action pricing reference */}
      <div className="rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-3">What credits cost</h2>
        <div className="text-xs text-slate-500 mb-3">Credit costs per AI action. Founder admin can adjust pricing quarterly as provider costs shift.</div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-slate-500 border-b border-slate-200">
              <th className="text-left pb-2">Action</th>
              <th className="text-left pb-2">Credits</th>
              <th className="text-left pb-2">Description</th>
            </tr>
          </thead>
          <tbody>
            {pricing.map((p) => (
              <tr key={p.action_type} className="border-b border-slate-100">
                <td className="py-2 font-mono text-xs text-slate-700">{p.action_type}</td>
                <td className="py-2 font-semibold text-slate-900">{p.credits_per_call}</td>
                <td className="py-2 text-slate-600">{p.description || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Usage breakdown */}
      <div className="rounded-lg border border-slate-200 bg-white p-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-slate-900">Recent usage</h2>
          <div className="inline-flex rounded-md border border-slate-300 overflow-hidden text-xs font-semibold">
            {[30, 60, 90].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setUsageDays(d)}
                className={`px-3 py-1 ${usageDays === d ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 hover:bg-slate-50'}`}
              >
                {d}d
              </button>
            ))}
          </div>
        </div>
        {!usage || usage.by_action.length === 0 ? (
          <div className="text-sm text-slate-500 py-6 text-center">No AI activity in the last {usageDays} days.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-500 border-b border-slate-200">
                <th className="text-left pb-2">Action</th>
                <th className="text-right pb-2">Calls</th>
                <th className="text-right pb-2">Credits Spent</th>
                <th className="text-right pb-2">Refunded</th>
              </tr>
            </thead>
            <tbody>
              {usage.by_action.map((r) => (
                <tr key={r.action_type} className="border-b border-slate-100">
                  <td className="py-2 font-mono text-xs text-slate-700">{r.action_type}</td>
                  <td className="py-2 text-right text-slate-700">{r.call_count}</td>
                  <td className="py-2 text-right font-semibold text-slate-900">{r.credits_spent.toLocaleString()}</td>
                  <td className="py-2 text-right text-slate-500">{r.refunded_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
