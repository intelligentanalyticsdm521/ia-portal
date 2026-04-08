import { useEffect, useState, useCallback } from "react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";

interface ContactList {
  id: string;
  name: string;
  contactCount: number;
  createdAt: string;
}

export function SparkListsPage() {
  const { get, post, ready } = useSparkApi();
  const [lists, setLists] = useState<ContactList[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    setError(null);
    try {
      const res = await get<ContactList[]>("/api/v1/lists");
      setLists(res);
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
      await post("/api/v1/lists", { name });
      setShowModal(false);
      setName("");
      await load();
    } catch (err) {
      setError(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <OliverPageWrapper title="Lists" subtitle="Static contact lists for campaign targeting" error={error} loading={loading}>
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-500">{lists.length} list{lists.length !== 1 ? "s" : ""}</p>
          <button
            onClick={() => setShowModal(true)}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Create List
          </button>
        </div>

        <div className="rounded-xl bg-white ring-1 ring-gray-200 overflow-hidden">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs text-slate-500 uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Contacts</th>
                <th className="px-4 py-3">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {lists.map((l) => (
                <tr key={l.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-slate-900">{l.name}</td>
                  <td className="px-4 py-3 text-slate-600">{l.contactCount.toLocaleString()}</td>
                  <td className="px-4 py-3 text-slate-400 text-xs">{new Date(l.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
              {lists.length === 0 && !loading && (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-sm text-slate-400">
                    No lists yet. Create one to get started.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
              <h3 className="text-lg font-semibold text-slate-900 mb-4">Create List</h3>
              <input
                type="text"
                placeholder="List name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <div className="mt-5 flex justify-end gap-2">
                <button onClick={() => setShowModal(false)} className="rounded-lg border px-4 py-2 text-sm text-slate-600 hover:bg-gray-50">Cancel</button>
                <button onClick={handleCreate} disabled={saving || !name.trim()} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
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
