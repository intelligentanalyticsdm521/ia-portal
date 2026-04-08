import { useEffect, useState } from "react";
import { useOliverApi } from "../../hooks/useOliverApi";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";

interface Subscription {
  id: string;
  customerName: string;
  plan: string;
  amount: number;
  status: string;
  currentPeriodEnd: string;
}

interface RecurringJob {
  id: string;
  title: string;
  customerName: string;
  frequency: string;
  nextRunDate: string;
  status: string;
}

type Tab = "subscriptions" | "recurring";

export function OliverRecurringPage() {
  const { get, post, ready } = useOliverApi();
  const [tab, setTab] = useState<Tab>("subscriptions");
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [recurring, setRecurring] = useState<RecurringJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [s, r] = await Promise.all([
          get<Subscription[]>("/subscriptions"),
          get<RecurringJob[]>("/recurring-jobs"),
        ]);
        if (!cancelled) { setSubs(s); setRecurring(r); }
      } catch (err) {
        if (!cancelled) setError(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [get, ready]);

  async function handleSync() {
    setSyncing(true);
    try {
      await post("/subscriptions/sync");
      const data = await get<Subscription[]>("/subscriptions");
      setSubs(data);
    } catch {
      // silent
    } finally {
      setSyncing(false);
    }
  }

  return (
    <OliverPageWrapper title="Recurring & Subscriptions" subtitle="Manage recurring jobs and subscriptions" error={error} loading={loading}>
      <div className="flex items-center justify-between">
        <button
          onClick={handleSync}
          disabled={syncing}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {syncing ? "Syncing..." : "Sync from Stripe"}
        </button>
      </div>

      <div className="flex gap-1">
        {(["subscriptions", "recurring"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
              tab === t ? "bg-blue-600 text-white" : "bg-gray-100 text-slate-600 hover:bg-gray-200"
            }`}
          >
            {t === "subscriptions" ? "Subscriptions" : "Recurring Jobs"}
          </button>
        ))}
      </div>

      {tab === "subscriptions" && (
        <div className="rounded-xl bg-white ring-1 ring-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs text-slate-500 uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Plan</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Period End</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {subs.map((s) => (
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-slate-800">{s.customerName}</td>
                  <td className="px-4 py-3 text-slate-600">{s.plan}</td>
                  <td className="px-4 py-3 text-right text-slate-700">${s.amount.toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                      s.status === "active" ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-600"
                    }`}>
                      {s.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500">{new Date(s.currentPeriodEnd).toLocaleDateString()}</td>
                </tr>
              ))}
              {subs.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">No subscriptions.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === "recurring" && (
        <div className="rounded-xl bg-white ring-1 ring-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs text-slate-500 uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3">Job Template</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Frequency</th>
                <th className="px-4 py-3">Next Run</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {recurring.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-slate-800">{r.title}</td>
                  <td className="px-4 py-3 text-slate-600">{r.customerName}</td>
                  <td className="px-4 py-3 text-slate-600">{r.frequency}</td>
                  <td className="px-4 py-3 text-slate-500">{new Date(r.nextRunDate).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                      r.status === "active" ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-600"
                    }`}>
                      {r.status}
                    </span>
                  </td>
                </tr>
              ))}
              {recurring.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">No recurring job templates.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </OliverPageWrapper>
  );
}
