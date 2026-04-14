import { useEffect, useState } from "react";
import { useOliverApi } from "../../hooks/useOliverApi";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";

interface Worker {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  type: string;
  status: string;
}

export function OliverWorkersPage() {
  const { get, post, ready } = useOliverApi();
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ first_name: "", last_name: "", email: "", phone: "", type: "employee" });
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await get<Worker[]>("/workers");
        if (!cancelled) setWorkers(data);
      } catch (err) {
        if (!cancelled) setError(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [get, ready]);

  async function handleCreate() {
    if (!form.first_name.trim() || !form.last_name.trim()) return;
    setCreating(true);
    try {
      const w = await post<Worker>("/workers", form);
      setWorkers((prev) => [w, ...prev]);
      setShowAdd(false);
      setForm({ first_name: "", last_name: "", email: "", phone: "", type: "employee" });
    } catch {
      // keep form open on error
    } finally {
      setCreating(false);
    }
  }

  return (
    <OliverPageWrapper title="Team" subtitle="Manage team members and contractors" error={error} loading={loading}>
      <div className="flex items-center justify-between">
        <button
          onClick={() => setShowAdd(true)}
          className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700"
        >
          Add Worker
        </button>
      </div>

      <div className="rounded-xl bg-white ring-1 ring-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs text-slate-500 uppercase tracking-wide">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Phone</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {workers.map((w) => (
              <tr key={w.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-slate-800">{w.first_name} {w.last_name}</td>
                <td className="px-4 py-3 text-slate-600">{w.email}</td>
                <td className="px-4 py-3 text-slate-600">{w.phone || "—"}</td>
                <td className="px-4 py-3">
                  <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                    w.type === "employee" ? "bg-indigo-50 text-indigo-700" : "bg-amber-50 text-amber-700"
                  }`}>
                    {w.type}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                    w.status === "active" ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-600"
                  }`}>
                    {w.status}
                  </span>
                </td>
              </tr>
            ))}
            {workers.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">No workers found.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="rounded-xl bg-white p-6 shadow-xl w-full max-w-md space-y-4">
            <h2 className="text-lg font-semibold text-slate-900">Add Worker</h2>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">First Name</label>
                <input className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Last Name</label>
                <input className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
              <input className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Phone</label>
              <input className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Type</label>
              <select className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                <option value="employee">Employee</option>
                <option value="contractor">Contractor</option>
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowAdd(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-slate-700 hover:bg-gray-50">Cancel</button>
              <button onClick={handleCreate} disabled={creating || !form.first_name.trim() || !form.last_name.trim()} className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50">
                {creating ? "Adding..." : "Add Worker"}
              </button>
            </div>
          </div>
        </div>
      )}
    </OliverPageWrapper>
  );
}
