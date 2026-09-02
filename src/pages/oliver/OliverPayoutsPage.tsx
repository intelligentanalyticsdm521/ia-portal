// OliverPayoutsPage — Stripe Connect payout dashboard for OLIVER tenants.
//
// Shows account status (charges + payouts enabled), available/pending balance,
// payout schedule, and the last 25 payouts.
import { useCallback, useEffect, useState } from "react";
import { useOliverApi } from "../../hooks/useOliverApi";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";
import { DollarSign, Calendar, ExternalLink, AlertCircle, Check, RefreshCw } from "lucide-react";

interface BalanceItem { amount: number; currency: string; source_types?: { card?: number; bank_account?: number } }
interface Payout {
  id: string;
  amount: number;
  currency: string;
  status: string;
  arrival_date: string | null;
  created: string | null;
  method: string;
  type: string;
}
interface PayoutData {
  stripe_account_id: string;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted: boolean;
  requirements: { currently_due?: string[]; eventually_due?: string[]; pending_verification?: string[]; disabled_reason?: string | null } | null;
  payout_schedule: { interval: string; delay_days?: number; weekly_anchor?: string; monthly_anchor?: number } | null;
  balance: { available: BalanceItem[]; pending: BalanceItem[] } | null;
  recent_payouts: Payout[];
}

function fmtMoney(cents: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: (currency || "USD").toUpperCase() }).format(cents / 100);
}

export function OliverPayoutsPage() {
  const { get, post, ready } = useOliverApi();
  const [data, setData] = useState<PayoutData | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [editingSchedule, setEditingSchedule] = useState(false);
  const [interval, setInterval] = useState("daily");
  const [delayDays, setDelayDays] = useState<number | "">("");
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    if (!ready) return;
    setLoading(true); setError(null);
    try {
      // 2026-09-01 — this read `r.data` and `r.note` on a client that ALREADY
      // unwraps the envelope (useOliverApi -> lib/oliverApi.ts returns
      // body.data and discards its siblings). So `r.data` was undefined even
      // when the request succeeded, and `note` — which the API sent as a
      // sibling — never arrived at all. The page rendered "no data" whether or
      // not a Stripe account existed, and a tenant without one got a blank
      // panel with no explanation.
      //
      // The endpoint now puts connected/platform/note INSIDE data, so one
      // unwrapped object carries every state.
      const r = await get<(PayoutData & { connected: boolean; note: string | null }) | null>(
        "/settings/stripe/payouts",
      );
      setData(r?.connected ? r : null);
      setNote(r?.note || null);
      if (r?.payout_schedule) {
        setInterval(r.payout_schedule.interval || "daily");
        setDelayDays(r.payout_schedule.delay_days ?? "");
      }
    } catch (err) { setError(err); }
    finally { setLoading(false); }
  }, [get, ready]);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function saveSchedule() {
    setSaving(true);
    try {
      await post("/settings/stripe/payout-schedule", {
        interval, delay_days: delayDays === "" ? undefined : Number(delayDays),
      });
      setEditingSchedule(false);
      await fetchData();
    } catch (err) { alert(`Save failed: ${(err as Error).message}`); }
    finally { setSaving(false); }
  }

  return (
    <OliverPageWrapper title="Payouts" subtitle="Stripe Connect — payout schedule, balance, recent transfers" loading={loading} error={error}>
      {note && (
        <div className="card">
          <div className="px-4 py-6 text-center text-sm text-slate-600">
            {note}{" "}
            <a href="/app/services/oliver_settings" className="text-[#1A7DB5] font-semibold hover:underline">Connect Stripe →</a>
          </div>
        </div>
      )}

      {data && (
        <>
          {/* Account status */}
          <div className="card">
            <div className="card-hdr">
              <div>
                <div className="card-ttl">Account status</div>
                <div className="card-sub">Connected Stripe account: <code className="text-xs">{data.stripe_account_id}</code></div>
              </div>
              <div className="flex items-center gap-2">
                {/* There was no route from this page to the bank account the money
                    actually lands in. The Stripe BILLING portal cannot show it —
                    that one is for paying US, and has no payout bank at all — so
                    anyone looking for it had nowhere to go. */}
                <a href="https://dashboard.stripe.com/settings/payouts" target="_blank" rel="noreferrer"
                  className="text-xs px-2.5 py-1 rounded border border-slate-200 flex items-center gap-1 text-[#1A7DB5] hover:underline"
                  title="Change the bank account your payouts are sent to, in your own Stripe dashboard">
                  Payout bank <ExternalLink className="h-3 w-3" />
                </a>
                <button onClick={fetchData} className="text-xs px-2.5 py-1 rounded border border-slate-200 flex items-center gap-1">
                  <RefreshCw className="h-3 w-3" /> Refresh
                </button>
              </div>
            </div>
            <div className="px-4 pb-4 grid grid-cols-3 gap-3">
              <StatusTile label="Charges" ok={data.charges_enabled} />
              <StatusTile label="Payouts" ok={data.payouts_enabled} />
              <StatusTile label="Details submitted" ok={data.details_submitted} />
            </div>
            {data.requirements?.currently_due && data.requirements.currently_due.length > 0 && (
              <div className="mx-4 mb-4 p-3 rounded bg-amber-50 border border-amber-200 text-amber-900 text-sm">
                <div className="flex items-center gap-2 font-semibold mb-1"><AlertCircle className="h-4 w-4" /> Stripe needs more info</div>
                <ul className="text-xs space-y-0.5 list-disc list-inside">
                  {data.requirements.currently_due.map(r => <li key={r}>{r}</li>)}
                </ul>
                {/* 2026-09-02 — this pointed at dashboard.stripe.com/connect/accounts/<id>,
                    which is the PLATFORM's admin view of the account. This page is
                    client-facing (routed at oliver_payouts, no founder gate), so the
                    business clicking it landed somewhere they have no access to. The
                    account owner signs in to their OWN Stripe dashboard. */}
                <a href="https://dashboard.stripe.com/" target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-1 mt-2 text-xs font-semibold text-[#1A7DB5] hover:underline">
                  Resolve in your Stripe dashboard <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            )}
          </div>

          {/* Balance */}
          {data.balance && (
            <div className="card mt-3">
              <div className="card-hdr">
                <div>
                  <div className="card-ttl flex items-center gap-2"><DollarSign className="h-4 w-4 text-emerald-600" /> Balance</div>
                  <div className="card-sub">Available transfers to your bank vs pending settlement</div>
                </div>
              </div>
              <div className="px-4 pb-4 grid grid-cols-2 gap-3">
                <BalanceCard label="Available now" items={data.balance.available} accent="emerald" />
                <BalanceCard label="Pending settlement" items={data.balance.pending} accent="amber" />
              </div>
            </div>
          )}

          {/* Schedule */}
          <div className="card mt-3">
            <div className="card-hdr">
              <div>
                <div className="card-ttl flex items-center gap-2"><Calendar className="h-4 w-4 text-[#1A7DB5]" /> Payout schedule</div>
                <div className="card-sub">When Stripe automatically transfers your balance to your bank</div>
              </div>
              {!editingSchedule && (
                <button onClick={() => setEditingSchedule(true)} className="text-xs px-2.5 py-1 rounded border border-slate-200">Edit</button>
              )}
            </div>
            <div className="px-4 pb-4">
              {!editingSchedule && data.payout_schedule && (
                <div className="text-sm">
                  <span className="font-semibold capitalize">{data.payout_schedule.interval}</span>
                  {data.payout_schedule.delay_days != null && <span className="text-slate-600"> · delayed {data.payout_schedule.delay_days} day{data.payout_schedule.delay_days === 1 ? "" : "s"} after charge</span>}
                </div>
              )}
              {editingSchedule && (
                <div className="space-y-2">
                  <div className="flex gap-2 items-center">
                    <label className="text-xs text-slate-600">Interval:</label>
                    <select value={interval} onChange={(e) => setInterval(e.target.value)} className="text-sm border border-slate-300 rounded p-1">
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                      <option value="monthly">Monthly</option>
                      <option value="manual">Manual (you trigger)</option>
                    </select>
                  </div>
                  <div className="flex gap-2 items-center">
                    <label className="text-xs text-slate-600">Delay days (0-30):</label>
                    <input type="number" min={0} max={30} value={delayDays} onChange={(e) => setDelayDays(e.target.value === "" ? "" : Number(e.target.value))} className="text-sm border border-slate-300 rounded p-1 w-20" />
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button disabled={saving} onClick={saveSchedule} className="text-xs px-3 py-1 rounded bg-[#FEC82C] text-[#1A3A4A] font-semibold disabled:opacity-50">
                      {saving ? "Saving…" : "Save"}
                    </button>
                    <button onClick={() => setEditingSchedule(false)} className="text-xs px-3 py-1 rounded border border-slate-200">Cancel</button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Recent payouts */}
          <div className="card mt-3">
            <div className="card-hdr">
              <div>
                <div className="card-ttl">Recent payouts</div>
                <div className="card-sub">Last {data.recent_payouts.length} transfers</div>
              </div>
            </div>
            <div className="px-4 pb-4 overflow-x-auto">
              {data.recent_payouts.length === 0 ? (
                <div className="text-center text-sm text-slate-500 py-4">No payouts yet. Once charges accumulate and clear, Stripe will transfer them on your schedule.</div>
              ) : (
                <table className="w-full text-sm">
                  <thead><tr className="text-left border-b border-slate-200 text-xs text-slate-600">
                    <th className="py-2">Amount</th><th>Status</th><th>Arrival</th><th>Method</th><th></th>
                  </tr></thead>
                  <tbody>
                    {data.recent_payouts.map(p => (
                      <tr key={p.id} className="border-b border-slate-100">
                        <td className="py-2 font-semibold">{fmtMoney(p.amount * 100, p.currency)}</td>
                        <td><span className={`px-2 py-0.5 rounded text-[11px] border ${p.status === "paid" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : p.status === "failed" ? "bg-rose-50 text-rose-700 border-rose-200" : "bg-amber-50 text-amber-700 border-amber-200"}`}>{p.status}</span></td>
                        <td className="text-xs text-slate-600">{p.arrival_date ? new Date(p.arrival_date).toLocaleDateString() : "—"}</td>
                        <td className="text-xs text-slate-500">{p.method}</td>
                        <td><a href={`https://dashboard.stripe.com/payouts/${p.id}`} target="_blank" rel="noreferrer" className="text-xs text-[#1A7DB5] hover:underline">View →</a></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}
    </OliverPageWrapper>
  );
}

function StatusTile({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className={`p-3 rounded border-2 ${ok ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
      <div className="flex items-center gap-2 mb-1">
        {ok ? <Check className="h-4 w-4 text-emerald-700" /> : <AlertCircle className="h-4 w-4 text-amber-700" />}
        <div className="text-[10px] uppercase font-semibold text-slate-700">{label}</div>
      </div>
      <div className={`text-sm font-bold ${ok ? "text-emerald-800" : "text-amber-800"}`}>{ok ? "Enabled" : "Pending"}</div>
    </div>
  );
}

function BalanceCard({ label, items, accent }: { label: string; items: BalanceItem[]; accent: "emerald" | "amber" }) {
  const total = items.reduce((a, b) => a + b.amount, 0);
  const currency = items[0]?.currency || "usd";
  const color = accent === "emerald" ? "text-emerald-700" : "text-amber-700";
  return (
    <div className="p-3 rounded border border-slate-200 bg-white">
      <div className="text-[10px] uppercase font-semibold text-slate-500">{label}</div>
      <div className={`text-2xl font-bold ${color}`}>{fmtMoney(total, currency)}</div>
    </div>
  );
}

export default OliverPayoutsPage;
