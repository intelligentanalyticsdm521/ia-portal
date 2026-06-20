// Founder-only ARGUS margin dashboard — Surface for the quarterly review
// process. Shows per-action 30/60/90d margin, lets the founder edit
// credit pricing inline (changes take effect on next call). Routes
// to /app/admin/argus-margin (founder tenant only — UI itself doesn't
// gate; the API endpoints enforce founder-only via tenant ID check).

import { useEffect, useState } from 'react';
import { useAppState } from '../../app/AppState';
import { useAccessToken } from '../../auth/useAccessToken';
import {
  getArgusMargin,
  getArgusPricing,
  patchArgusPricing,
  type ArgusMargin,
  type ArgusPricingRow,
} from '../../lib/arionApi';

const ARION_API_BASE = (import.meta.env.VITE_ARION_API_BASE_URL as string)
  || 'https://app-arion-api-prod-e6fuc9gzd8f3hqfe.centralus-01.azurewebsites.net';

function fmt$(n: number) { return `$${n.toFixed(2)}`; }
function fmtPct(n: number) {
  if (!Number.isFinite(n)) return '—';
  return `${(n * 100).toFixed(1)}%`;
}

export function ArgusMarginPage() {
  const { activeTenantId } = useAppState();
  const { getToken } = useAccessToken();
  const [days, setDays] = useState(30);
  const [margin, setMargin] = useState<ArgusMargin['data'] | null>(null);
  const [pricing, setPricing] = useState<ArgusPricingRow[]>([]);
  const [editingType, setEditingType] = useState<string | null>(null);
  const [draftCredits, setDraftCredits] = useState<number>(0);
  const [draftCap, setDraftCap] = useState<number>(3);
  const [saving, setSaving] = useState(false);

  async function refresh() {
    if (!activeTenantId) return;
    try {
      const token = await getToken();
      const [m, p] = await Promise.all([
        getArgusMargin({ baseUrl: ARION_API_BASE, bearerToken: token.accessToken, tenantId: activeTenantId, days }),
        getArgusPricing({ baseUrl: ARION_API_BASE, bearerToken: token.accessToken, tenantId: activeTenantId }),
      ]);
      setMargin(m.data);
      setPricing(p.data);
    } catch (e) { console.error('[argus margin]', e); }
  }

  useEffect(() => { refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [activeTenantId, days]);

  async function saveEdit() {
    if (!editingType) return;
    setSaving(true);
    try {
      const token = await getToken();
      await patchArgusPricing({
        baseUrl: ARION_API_BASE, bearerToken: token.accessToken, tenantId: activeTenantId!,
        actionType: editingType,
        body: { credits_per_call: draftCredits, outlier_cap_usd: draftCap },
      });
      setEditingType(null);
      await refresh();
    } catch (e) {
      alert(`Update failed: ${(e as Error).message}`);
    } finally { setSaving(false); }
  }

  const lowMarginAction = margin?.by_action?.find(a => a.margin_ratio < 0.3);

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">ARGUS AI — Margin Dashboard</h1>
        <p className="text-sm text-slate-600 mt-1">
          Per-action cost-basis vs. credits sold. Quarterly review surface. Editing pricing here takes effect on the next call.
        </p>
      </div>

      {lowMarginAction && (
        <div className="rounded-lg border-2 border-red-300 bg-red-50 p-4">
          <div className="text-sm font-semibold text-red-900">⚠ Margin alert</div>
          <div className="text-xs text-red-800 mt-1">
            Action <code>{lowMarginAction.action_type}</code> is at {fmtPct(lowMarginAction.margin_ratio)} margin
            over the last {days} days — under the 30% floor. Consider raising the credit price or lowering the
            outlier cap.
          </div>
        </div>
      )}

      <div className="flex items-center gap-3">
        <label className="text-sm font-semibold text-slate-700">Window:</label>
        <div className="inline-flex rounded-md border border-slate-300 overflow-hidden text-xs font-semibold">
          {[30, 60, 90].map((d) => (
            <button key={d} type="button" onClick={() => setDays(d)}
              className={`px-3 py-1.5 ${days === d ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 hover:bg-slate-50'}`}>
              {d} days
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-6 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-slate-500 border-b border-slate-200">
              <th className="text-left pb-2">Action</th>
              <th className="text-right pb-2">Credits/call</th>
              <th className="text-right pb-2">Outlier cap</th>
              <th className="text-right pb-2">Calls ({days}d)</th>
              <th className="text-right pb-2">Credits sold</th>
              <th className="text-right pb-2">Cost basis</th>
              <th className="text-right pb-2">Margin</th>
              <th className="text-right pb-2">Outliers</th>
              <th className="text-right pb-2"></th>
            </tr>
          </thead>
          <tbody>
            {pricing.map((p) => {
              const m = margin?.by_action?.find(x => x.action_type === p.action_type);
              const editing = editingType === p.action_type;
              const marginColor = m ? (m.margin_ratio < 0.3 ? 'text-red-700' : m.margin_ratio < 0.5 ? 'text-amber-700' : 'text-emerald-700') : 'text-slate-400';
              return (
                <tr key={p.action_type} className="border-b border-slate-100">
                  <td className="py-2.5 font-mono text-xs">{p.action_type}</td>
                  <td className="py-2.5 text-right font-semibold">
                    {editing ? (
                      <input type="number" value={draftCredits} onChange={(e) => setDraftCredits(Number(e.target.value))}
                        className="w-16 rounded border border-slate-300 px-2 py-0.5 text-right text-xs" />
                    ) : p.credits_per_call}
                  </td>
                  <td className="py-2.5 text-right">
                    {editing ? (
                      <input type="number" step="0.1" value={draftCap} onChange={(e) => setDraftCap(Number(e.target.value))}
                        className="w-16 rounded border border-slate-300 px-2 py-0.5 text-right text-xs" />
                    ) : fmt$(p.outlier_cap_usd)}
                  </td>
                  <td className="py-2.5 text-right text-slate-600">{m?.call_count?.toLocaleString() || '—'}</td>
                  <td className="py-2.5 text-right text-slate-600">{m?.credits_sold?.toLocaleString() || '—'}</td>
                  <td className="py-2.5 text-right text-slate-600">{m ? fmt$(m.cost_basis_total) : '—'}</td>
                  <td className={`py-2.5 text-right font-semibold ${marginColor}`}>{m ? fmtPct(m.margin_ratio) : '—'}</td>
                  <td className="py-2.5 text-right text-slate-600">{m?.outlier_count || 0}</td>
                  <td className="py-2.5 text-right">
                    {editing ? (
                      <div className="flex gap-1 justify-end">
                        <button type="button" disabled={saving} onClick={saveEdit}
                          className="text-xs px-2 py-0.5 rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">
                          {saving ? '…' : 'Save'}
                        </button>
                        <button type="button" onClick={() => setEditingType(null)}
                          className="text-xs px-2 py-0.5 rounded border border-slate-300 hover:bg-slate-50">
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button type="button" onClick={() => {
                        setEditingType(p.action_type);
                        setDraftCredits(p.credits_per_call);
                        setDraftCap(p.outlier_cap_usd);
                      }} className="text-xs text-sky-700 font-semibold hover:text-sky-900">
                        Edit
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {pricing.length === 0 && (
          <div className="text-center text-sm text-slate-500 py-6">
            No action pricing loaded. Check that migration 090 applied and the /argus/pricing endpoint is reachable.
          </div>
        )}
      </div>

      <div className="text-xs text-slate-500">
        <b>Margin color:</b> green ≥50% · amber 30-50% · red {'<'}30% (auto-alerts threshold).
        Pricing edits write to <code>lumen.argus_action_pricing</code> and audit log via <code>updated_by</code>/<code>updated_at</code>.
      </div>
    </div>
  );
}
