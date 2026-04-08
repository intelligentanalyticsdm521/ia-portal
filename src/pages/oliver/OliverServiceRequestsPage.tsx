import { useEffect, useState } from "react";
import { useOliverApi } from "../../hooks/useOliverApi";

interface ServiceRequest {
  id: string;
  title: string;
  customerName: string;
  scheduledDate: string;
  source: string;
  status: string;
}

export function OliverServiceRequestsPage() {
  const { get, ready } = useOliverApi();
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await get<ServiceRequest[]>("/jobs?status=inquiry");
        if (!cancelled) setRequests(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load service requests");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [get, ready]);

  if (loading) {
    return (
      <div className="p-6 space-y-3">
        <div className="h-8 w-44 bg-gray-200 rounded animate-pulse" />
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-12 bg-gray-200 rounded animate-pulse" />
        ))}
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

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Service Requests</h1>
        <p className="text-sm text-slate-500 mt-1">Inbound job inquiries from the customer portal.</p>
      </div>

      <div className="rounded-xl bg-white ring-1 ring-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs text-slate-500 uppercase tracking-wide">
            <tr>
              <th className="px-4 py-3">Title</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Source</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {requests.map((r) => (
              <tr key={r.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-slate-800">{r.title}</td>
                <td className="px-4 py-3 text-slate-600">{r.customerName}</td>
                <td className="px-4 py-3 text-slate-500">
                  {r.scheduledDate ? new Date(r.scheduledDate).toLocaleDateString() : "—"}
                </td>
                <td className="px-4 py-3">
                  <span className="inline-block rounded-full bg-purple-50 px-2 py-0.5 text-xs font-medium text-purple-700">
                    {r.source || "portal"}
                  </span>
                </td>
              </tr>
            ))}
            {requests.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-400">No pending service requests.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
