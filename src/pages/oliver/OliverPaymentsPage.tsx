import { useEffect, useState } from "react";
import { useOliverApi } from "../../hooks/useOliverApi";

interface RevenueReport {
  total_revenue: number;
  payment_count: number;
  revenue_last_30d: number;
  revenue_last_7d: number;
  open_invoices: number;
  total_outstanding: number;
}

export function OliverPaymentsPage() {
  const { get, ready } = useOliverApi();
  const [data, setData] = useState<RevenueReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const d = await get<RevenueReport>("/reports/revenue");
        if (!cancelled) setData(d);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load payments data");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [get, ready]);

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <div className="h-8 w-36 bg-gray-200 rounded animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="rounded-xl bg-white ring-1 ring-gray-200 p-5 animate-pulse">
              <div className="h-4 w-24 bg-gray-200 rounded mb-3" />
              <div className="h-8 w-28 bg-gray-200 rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="rounded-xl bg-red-50 ring-1 ring-red-200 p-5 text-red-700">{error}</div>
      </div>
    );
  }

  const kpis = [
    { label: "Total Revenue", value: `$${(data?.total_revenue ?? 0).toLocaleString()}`, color: "text-green-600" },
    { label: "Payments Received", value: data?.payment_count ?? 0, color: "text-blue-600" },
    { label: "Last 30 Days", value: `$${(data?.revenue_last_30d ?? 0).toLocaleString()}`, color: "text-green-600" },
    { label: "Last 7 Days", value: `$${(data?.revenue_last_7d ?? 0).toLocaleString()}`, color: "text-green-600" },
    { label: "Open Invoices", value: data?.open_invoices ?? 0, color: "text-amber-600" },
    { label: "Total Outstanding", value: `$${(data?.total_outstanding ?? 0).toLocaleString()}`, color: "text-red-600" },
  ];

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold text-slate-900">Payments</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-xl bg-white ring-1 ring-gray-200 p-5">
            <p className="text-sm text-slate-500">{k.label}</p>
            <p className={`mt-1 text-2xl font-bold ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl bg-white ring-1 ring-gray-200 p-5">
        <h2 className="text-lg font-semibold text-slate-900 mb-2">Summary</h2>
        <p className="text-sm text-slate-600">
          Payment data is synced from Stripe. Revenue figures reflect completed payments only.
          Outstanding amounts include all sent invoices that have not yet been paid.
        </p>
      </div>
    </div>
  );
}
