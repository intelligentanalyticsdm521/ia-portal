import { useEffect, useState, useCallback } from "react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";

interface Lead {
  id: string;
  businessName: string;
  score: "Hot" | "Warm" | "Cold";
  email: string;
  phone: string;
  status: string;
  source: string;
  createdAt: string;
}

export function SparkLeadsPage() {
  const { get, put, ready } = useSparkApi();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "Hot" | "Warm" | "Cold">("all");

  const load = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    setError(null);
    try {
      const params = filter !== "all" ? `?score=${filter}` : "";
      const res = await get<Lead[]>(`/api/v1/leads${params}`);
      setLeads(res);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [get, ready, filter]);

  useEffect(() => { load(); }, [load]);

  async function handleAction(leadId: string, action: "accept" | "reject") {
    try {
      await put(`/api/v1/leads/${leadId}`, { status: action === "accept" ? "accepted" : "rejected" });
      setLeads((prev) => prev.map((l) => l.id === leadId ? { ...l, status: action === "accept" ? "accepted" : "rejected" } : l));
    } catch (err) {
      setError(err);
    }
  }

  function scoreBadge(score: string) {
    const colors: Record<string, string> = {
      Hot: "bg-red-100 text-red-700",
      Warm: "bg-amber-100 text-amber-700",
      Cold: "bg-blue-100 text-blue-700",
    };
    return (
      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${colors[score] || "bg-gray-100 text-gray-600"}`}>
        {score}
      </span>
    );
  }

  return (
    <OliverPageWrapper title="Lead Inbox" subtitle="B2B leads with scoring and actions" error={error} loading={loading}>
      <div className="p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
            {(["all", "Hot", "Warm", "Cold"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${filter === f ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
              >
                {f === "all" ? "All" : f}
              </button>
            ))}
          </div>
          <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
            New Search
          </button>
        </div>

        <div className="rounded-xl bg-white ring-1 ring-gray-200 overflow-hidden">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs text-slate-500 uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3">Business</th>
                <th className="px-4 py-3">Score</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {leads.map((l) => (
                <tr key={l.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-slate-900">{l.businessName}</td>
                  <td className="px-4 py-3">{scoreBadge(l.score)}</td>
                  <td className="px-4 py-3 text-slate-600">{l.email || "—"}</td>
                  <td className="px-4 py-3 text-slate-600">{l.phone || "—"}</td>
                  <td className="px-4 py-3 text-slate-500 text-xs capitalize">{l.status}</td>
                  <td className="px-4 py-3 text-slate-500 text-xs">{l.source}</td>
                  <td className="px-4 py-3">
                    {l.status === "new" || l.status === "pending" ? (
                      <div className="flex gap-1">
                        <button onClick={() => handleAction(l.id, "accept")} className="rounded bg-green-50 px-2 py-1 text-xs font-medium text-green-700 hover:bg-green-100">Accept</button>
                        <button onClick={() => handleAction(l.id, "reject")} className="rounded bg-red-50 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-100">Reject</button>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
              {leads.length === 0 && !loading && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-sm text-slate-400">
                    No leads found. Run a search to discover new prospects.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </OliverPageWrapper>
  );
}
