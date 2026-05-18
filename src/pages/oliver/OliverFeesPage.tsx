// OliverFeesPage — standalone, fully transparent processing-fee breakdown.
//
// Plan & Pricing cards show only ONE blended number. THIS page is the only
// place the split (Stripe vs platform) and the per-transaction CAP are
// disclosed (owner decision 2026-05-18). Data is live from oliver-api
// GET /tier-limits/fees (lib/iaFee.js feeBreakdown).
import { useEffect, useState } from "react";
import { useOliverApi } from "../../hooks/useOliverApi";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";

interface FeeBreakdown {
  tier: string;
  stripe: { percent: number; flat: number; note: string };
  ia: { percent: number; flat: number; cap: number | null; note: string };
  blendedCard: { percent: number; flat: number; label: string };
}

const TIER_LABEL: Record<string, string> = {
  lite: "Lite", standard: "Standard", pro: "Pro",
  business: "Business", enterprise: "Enterprise",
};

export function OliverFeesPage() {
  const { get, ready } = useOliverApi();
  const [rows, setRows] = useState<FeeBreakdown[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    (async () => {
      setLoading(true); setError(null);
      try {
        const res = await get<{ data: FeeBreakdown[] }>("/tier-limits/fees");
        if (!cancelled) setRows(res?.data || []);
      } catch (err) { if (!cancelled) setError(err); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [get, ready]);

  const money = (n: number) => `$${n.toFixed(2)}`;

  return (
    <OliverPageWrapper
      title="Processing fees"
      subtitle="Exactly what you pay per transaction — full breakdown by plan"
      error={error}
      loading={loading}
    >
      <div className="card mb-4">
        <div className="card-hdr">
          <div>
            <div className="card-ttl">How card processing is charged</div>
            <div className="card-sub">
              Stripe's standard card fee plus the Intelligent Analytics platform
              fee. Your Plan &amp; Pricing page shows these combined into one
              number; this page shows the full split and the per-transaction cap.
            </div>
          </div>
        </div>
        <div className="px-4 pb-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-600 border-b border-slate-200">
                <th className="py-2 pr-3 font-semibold">Plan</th>
                <th className="py-2 px-3 font-semibold">Stripe portion</th>
                <th className="py-2 px-3 font-semibold">Platform portion</th>
                <th className="py-2 px-3 font-semibold">Platform cap / txn</th>
                <th className="py-2 pl-3 font-semibold">Combined (shown on Plan &amp; Pricing)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.tier} className="border-b border-slate-100 align-top">
                  <td className="py-3 pr-3 font-semibold text-slate-800">
                    {TIER_LABEL[r.tier] || r.tier}
                  </td>
                  <td className="py-3 px-3 text-slate-700">
                    <div className="font-medium">{r.stripe.percent}% + {money(r.stripe.flat)}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">{r.stripe.note}</div>
                  </td>
                  <td className="py-3 px-3 text-slate-700">
                    <div className="font-medium">
                      {r.ia.percent === 0 && r.ia.flat === 0
                        ? "None"
                        : `${r.ia.percent}% + ${money(r.ia.flat)}`}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">{r.ia.note}</div>
                  </td>
                  <td className="py-3 px-3 text-slate-700">
                    {r.ia.cap != null ? (
                      <span className="inline-block px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 text-xs font-medium">
                        capped at {money(r.ia.cap)}
                      </span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="py-3 pl-3">
                    <span className="font-bold text-[#1A3A4A]">{r.blendedCard.label}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-slate-500 px-1">
        The Stripe portion is billed by Stripe directly to your connected
        account at their standard US card rate. The platform portion is the
        Intelligent Analytics application fee and is capped per transaction
        where shown. Founder/platform-owner accounts transact directly and pay
        no platform fee.
      </p>
    </OliverPageWrapper>
  );
}

export default OliverFeesPage;
