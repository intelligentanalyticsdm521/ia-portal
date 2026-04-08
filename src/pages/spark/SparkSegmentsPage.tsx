import { useEffect, useState, useCallback } from "react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";

interface Segment {
  id: string;
  name: string;
  filterSummary: string;
  contactCount: number;
  createdAt: string;
}

export function SparkSegmentsPage() {
  const { get, post, ready } = useSparkApi();
  const [segments, setSegments] = useState<Segment[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: "", filterSummary: "" });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    setError(null);
    try {
      const res = await get<Segment[]>("/api/v1/segments");
      setSegments(res);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [get, ready]);

  useEffect(() => { load(); }, [load]);

  async function handleCreate() {
    setSaving(true);
    try {
      await post("/api/v1/segments", form);
      setShowModal(false);
      setForm({ name: "", filterSummary: "" });
      await load();
    } catch (err) {
      setError(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <OliverPageWrapper title="Segments" subtitle="Dynamic contact segments with filter rules" error={error} loading={loading}>
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-500">{segments.length} segment{segments.length !== 1 ? "s" : ""}</p>
          <button
            onClick={() => setShowModal(true)}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Create Segment
          </button>
        </div>

        <div className="rounded-xl bg-white ring-1 ring-gray-200 overflow-hidden">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs text-slate-500 uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Filters</th>
                <th className="px-4 py-3">Contacts</th>
                <th className="px-4 py-3">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {segments.map((s) => (
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-slate-900">{s.name}</td>
                  <td className="px-4 py-3 text-slate-500 text-xs">{s.filterSummary || "—"}</td>
                  <td className="px-4 py-3 text-slate-600">{s.contactCount.toLocaleString()}</td>
                  <td className="px-4 py-3 text-slate-400 text-xs">{new Date(s.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
              {segments.length === 0 && !loading && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-sm text-slate-400">
                    No segments yet. Create one to dynamically group contacts.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
              <h3 className="text-lg font-semibold text-slate-900 mb-4">Create Segment</h3>
              <div className="space-y-3">
                <input
                  type="text"
                  placeholder="Segment name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <textarea
                  placeholder="Filter description (e.g., contacts tagged 'VIP' in Texas)"
                  value={form.filterSummary}
                  onChange={(e) => setForm({ ...form, filterSummary: e.target.value })}
                  rows={3}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div className="mt-5 flex justify-end gap-2">
                <button onClick={() => setShowModal(false)} className="rounded-lg border px-4 py-2 text-sm text-slate-600 hover:bg-gray-50">Cancel</button>
                <button onClick={handleCreate} disabled={saving || !form.name.trim()} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                  {saving ? "Creating..." : "Create"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </OliverPageWrapper>
  );
}
