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
  const [mine, setMine] = useState<FeeBreakdown | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    (async () => {
      setLoading(true); setError(null);
      try {
        // useOliverApi.get already strips the { data: … } envelope
        // (oliverApi.ts:128). Reading res.data here returned undefined and
        // rendered an empty table — the page looked blank in production even
        // though the endpoint was fine. Kept tolerant of both shapes.
        const res = await get<FeeBreakdown[] | { data: FeeBreakdown[] }>("/tier-limits/fees");
        const list = Array.isArray(res) ? res : (res?.data ?? []);
        if (!cancelled) setRows(list);
        // Which row is THIS tenant on — so the table can mark "Your plan".
        const own = await get<FeeBreakdown>("/tier-limits/my-fees").catch(() => null);
        if (!cancelled && own) setMine(own);
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
                <tr
                  key={r.tier}
                  className={`border-b border-slate-100 align-top ${
                    mine && r.tier === mine.tier ? "bg-sky-50/70" : ""
                  }`}
                >
                  <td className="py-3 pr-3 font-semibold text-slate-800">
                    {TIER_LABEL[r.tier] || r.tier}
                    {mine && r.tier === mine.tier && (
                      <span className="ml-2 inline-block px-2 py-0.5 rounded bg-[#1A7DB5] text-white text-[10px] font-semibold align-middle">
                        YOUR PLAN
                      </span>
                    )}
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

      {mine && (
        <div className="card mb-4">
          <div className="card-hdr">
            <div>
              <div className="card-ttl">What you pay today</div>
              <div className="card-sub">
                Your account is on the {TIER_LABEL[mine.tier] || mine.tier} plan.
              </div>
            </div>
          </div>
          <div className="px-4 pb-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded border border-slate-200 p-3">
              <div className="text-[11px] uppercase tracking-wide text-slate-500">Stripe</div>
              <div className="text-lg font-bold text-slate-800 mt-1">
                {mine.stripe.percent}% + {money(mine.stripe.flat)}
              </div>
              <div className="text-[11px] text-slate-500 mt-1">Billed by Stripe</div>
            </div>
            <div className="rounded border border-slate-200 p-3">
              <div className="text-[11px] uppercase tracking-wide text-slate-500">
                Intelligent Analytics
              </div>
              <div className="text-lg font-bold text-slate-800 mt-1">
                {mine.ia.percent === 0 && mine.ia.flat === 0
                  ? "None"
                  : `${mine.ia.percent}% + ${money(mine.ia.flat)}`}
              </div>
              <div className="text-[11px] text-slate-500 mt-1">
                {mine.ia.cap != null ? `Capped at ${money(mine.ia.cap)} per transaction` : "No cap"}
              </div>
            </div>
            <div className="rounded border-2 border-[#1A7DB5] p-3 bg-sky-50/50">
              <div className="text-[11px] uppercase tracking-wide text-[#1A7DB5]">
                Total per transaction
              </div>
              <div className="text-lg font-bold text-[#1A3A4A] mt-1">
                {mine.blendedCard.percent}% + {money(mine.blendedCard.flat)}
              </div>
              <div className="text-[11px] text-slate-500 mt-1">Before the platform cap applies</div>
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-hdr">
          <div>
            <div className="card-ttl">Fee terms</div>
            <div className="card-sub">How and when each portion is charged.</div>
          </div>
        </div>
        <div className="px-4 pb-4 text-xs text-slate-600 leading-relaxed space-y-3">
          <div>
            <div className="font-semibold text-slate-800 mb-1">Stripe processing fee</div>
            Charged by Stripe directly to your connected Stripe account at their
            standard US card rate, and deducted from each payment before payout.
            Intelligent Analytics does not set, receive, or control this amount.
            Rates for non-US cards, currency conversion, chargebacks, and
            alternative payment methods are set by Stripe and may differ — see
            your Stripe dashboard for the authoritative schedule.
          </div>
          <div>
            <div className="font-semibold text-slate-800 mb-1">
              Intelligent Analytics platform fee
            </div>
            Collected at the time the customer pays, as a Stripe Connect
            application fee on the same transaction — there is no separate
            invoice and nothing is billed to you later. Where a cap is shown, the
            platform fee never exceeds that amount on a single transaction
            regardless of size. Plans with no platform fee are charged nothing on
            top of Stripe.
          </div>
          <div>
            <div className="font-semibold text-slate-800 mb-1">Refunds and disputes</div>
            Refunding a payment returns the customer's money but does not
            return the processing fees already charged on it. Stripe's fee is
            governed by your Stripe agreement and is generally not returned on a
            refund, and Stripe may charge a separate dispute fee; those amounts
            are between you and Stripe. The Intelligent Analytics platform fee
            on a refunded transaction is likewise retained.
          </div>
          <div>
            <div className="font-semibold text-slate-800 mb-1">Plan changes</div>
            The platform fee follows your current plan. If you change plans, the
            new rate applies to transactions processed from that point forward;
            transactions already completed are not repriced. This page always
            reflects the rate in effect for your account right now.
          </div>
          <div className="pt-1 border-t border-slate-100 text-slate-500">
            Founder and platform-owner accounts transact on the platform account
            directly and are charged no platform fee.
          </div>
        </div>
      </div>
    </OliverPageWrapper>
  );
}

export default OliverFeesPage;
