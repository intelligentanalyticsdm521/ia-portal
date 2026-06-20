// ARGUS AI Data Pack — header badge component (LOCKED 2026-06-20).
// Surface 1 of 3 (header / Data Plan page / IA Plugin sidebar).
// Shows current credit balance with color-coded state + click-to-detail popover.

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppState } from '../app/AppState';
import { useAccessToken } from '../auth/useAccessToken';
import { getArgusBalance, type ArgusBalance } from '../lib/arionApi';

const ARION_API_BASE = (import.meta.env.VITE_ARION_API_BASE_URL as string)
  || 'https://app-arion-api-prod-e6fuc9gzd8f3hqfe.centralus-01.azurewebsites.net';

const COLOR_CLASSES = {
  green:  'bg-emerald-100 text-emerald-900 border-emerald-300',
  yellow: 'bg-amber-100 text-amber-900 border-amber-300',
  red:    'bg-red-100 text-red-900 border-red-300',
} as const;

export function ArgusBalanceBadge() {
  const { activeTenantId } = useAppState();
  const { getToken } = useAccessToken();
  const [data, setData] = useState<ArgusBalance['data'] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!activeTenantId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    async function load() {
      try {
        const token = await getToken();
        const res = await getArgusBalance({
          baseUrl: ARION_API_BASE, bearerToken: token.accessToken, tenantId: activeTenantId!,
        });
        if (!cancelled) { setData(res.data); setError(null); }
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    }

    load();
    // 60s polling — cheap, keeps badge fresh while customer works
    timer = setInterval(load, 60_000);
    return () => { cancelled = true; if (timer) clearInterval(timer); };
  }, [activeTenantId, getToken]);

  if (error || !data) {
    // Don't render an error to the user — quietly hide if endpoint not reachable
    return null;
  }

  const colorCls = COLOR_CLASSES[data.badge_color];

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${colorCls} hover:opacity-90`}
        title={`${data.balance} ARGUS AI credits remaining`}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" strokeLinejoin="round" />
        </svg>
        {data.balance.toLocaleString()}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 w-72 rounded-lg border border-slate-200 bg-white shadow-xl z-40 p-3 space-y-2.5">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">ARGUS AI credits</div>
            <div>
              <div className="text-2xl font-bold text-slate-900">{data.balance.toLocaleString()}</div>
              <div className="text-xs text-slate-500">credits available</div>
            </div>

            <div className="border-t border-slate-100 pt-2 space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">Monthly allocation</span>
                <span className="font-semibold text-slate-700">{data.monthly_allocation}</span>
              </div>
              {data.pool_bonus > 0 && (
                <div className="flex justify-between text-[11px] text-slate-400">
                  <span>= {data.pool_base} ({data.base_tier}) + {data.pool_bonus} bonus</span>
                </div>
              )}
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">Lifetime spent</span>
                <span className="font-semibold text-slate-700">{data.lifetime_spent.toLocaleString()}</span>
              </div>
            </div>

            <div className="border-t border-slate-100 pt-2 flex gap-2">
              <Link
                to="/app/settings/argus-data-plan"
                onClick={() => setOpen(false)}
                className="flex-1 text-center rounded bg-slate-900 text-white text-xs font-semibold px-3 py-2 hover:bg-slate-800"
              >
                Buy more
              </Link>
              <Link
                to="/app/settings/argus-data-plan"
                onClick={() => setOpen(false)}
                className="flex-1 text-center rounded border border-slate-300 text-slate-700 text-xs font-semibold px-3 py-2 hover:bg-slate-50"
              >
                View usage
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
