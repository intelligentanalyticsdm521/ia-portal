import { useEffect, useState } from "react";
import { useOliverApi } from "../../hooks/useOliverApi";

interface Quote {
  id: string;
  jobTitle: string;
  jobId: string;
  amount: number;
  status: string;
  createdAt: string;
}

export function OliverQuotesPage() {
  const { get, post, ready } = useOliverApi();
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ jobId: "", amount: "" });
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await get<Quote[]>("/quotes");
        if (!cancelled) setQuotes(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load quotes");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [get, ready]);

  async function handleSend(quoteId: string) {
    setActionLoading(quoteId);
    try {
      await post(`/quotes/${quoteId}/send`);
      setQuotes((prev) => prev.map((q) => q.id === quoteId ? { ...q, status: "sent" } : q));
    } catch {
      // silent
    } finally {
      setActionLoading(null);
    }
  }

  async function handleConvert(quoteId: string) {
    setActionLoading(quoteId);
    try {
      await post(`/quotes/${quoteId}/convert`);
      setQuotes((prev) => prev.map((q) => q.id === quoteId ? { ...q, status: "converted" } : q));
    } catch {
      // silent
    } finally {
      setActionLoading(null);
    }
  }

  async function handleCreate() {
    if (!form.jobId.trim() || !form.amount) return;
    setCreating(true);
    try {
      const q = await post<Quote>("/quotes", { job_id: form.jobId, amount: parseFloat(form.amount) });
      setQuotes((prev) => [q, ...prev]);
      setShowCreate(false);
      setForm({ jobId: "", amount: "" });
    } catch {
      // keep form open
    } finally {
      setCreating(false);
    }
  }

  const statusColor: Record<string, string> = {
    draft: "bg-gray-100 text-gray-600",
    sent: "bg-blue-50 text-blue-700",
    accepted: "bg-green-50 text-green-700",
    declined: "bg-red-50 text-red-700",
    converted: "bg-indigo-50 text-indigo-700",
  };

  if (loading) {
    return (
      <div className="p-6 space-y-3">
        <div className="h-8 w-32 bg-gray-200 rounded animate-pulse" />
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
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">Quotes</h1>
        <button onClick={() => setShowCreate(true)} className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700">
          Create Quote
        </button>
      </div>

      <div className="rounded-xl bg-white ring-1 ring-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs text-slate-500 uppercase tracking-wide">
            <tr>
              <th className="px-4 py-3">Job</th>
              <th className="px-4 py-3 text-right">Amount</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {quotes.map((q) => (
              <tr key={q.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-slate-800">{q.jobTitle || q.jobId}</td>
                <td className="px-4 py-3 text-right text-slate-700">${q.amount.toLocaleString()}</td>
                <td className="px-4 py-3">
                  <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${statusColor[q.status] ?? "bg-gray-100 text-gray-600"}`}>
                    {q.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-500">{new Date(q.createdAt).toLocaleDateString()}</td>
                <td className="px-4 py-3 text-right space-x-2">
                  {q.status === "draft" && (
                    <button
                      onClick={() => handleSend(q.id)}
                      disabled={actionLoading === q.id}
                      className="text-xs text-blue-600 hover:text-blue-800 disabled:opacity-50"
                    >
                      Send
                    </button>
                  )}
                  {q.status === "accepted" && (
                    <button
                      onClick={() => handleConvert(q.id)}
                      disabled={actionLoading === q.id}
                      className="text-xs text-green-600 hover:text-green-800 disabled:opacity-50"
                    >
                      Convert to Invoice
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {quotes.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">No quotes yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="rounded-xl bg-white p-6 shadow-xl w-full max-w-md space-y-4">
            <h2 className="text-lg font-semibold text-slate-900">Create Quote</h2>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Job ID</label>
              <input className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" value={form.jobId} onChange={(e) => setForm({ ...form, jobId: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Amount ($)</label>
              <input type="number" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowCreate(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-slate-700 hover:bg-gray-50">Cancel</button>
              <button onClick={handleCreate} disabled={creating || !form.jobId.trim()} className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50">
                {creating ? "Creating..." : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
