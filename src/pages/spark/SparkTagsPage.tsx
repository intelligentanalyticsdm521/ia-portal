import { useEffect, useState, useCallback } from "react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";

interface Tag {
  id: string;
  name: string;
  color: string;
  contactCount: number;
}

const TAG_COLORS = [
  { label: "Blue", value: "#3b82f6" },
  { label: "Green", value: "#22c55e" },
  { label: "Red", value: "#ef4444" },
  { label: "Purple", value: "#a855f7" },
  { label: "Amber", value: "#f59e0b" },
  { label: "Teal", value: "#14b8a6" },
  { label: "Pink", value: "#ec4899" },
  { label: "Gray", value: "#6b7280" },
];

export function SparkTagsPage() {
  const { get, post, ready } = useSparkApi();
  const [tags, setTags] = useState<Tag[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: "", color: TAG_COLORS[0].value });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    setError(null);
    try {
      const raw = await get<{ data: Tag[] }>("/api/v1/tags");
      setTags(raw.data || []);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [get, ready]);

  useEffect(() => { load(); }, [load]);

  async function handleAdd() {
    setSaving(true);
    try {
      await post("/api/v1/tags", form);
      setShowModal(false);
      setForm({ name: "", color: TAG_COLORS[0].value });
      await load();
    } catch (err) {
      setError(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <OliverPageWrapper title="Tags" subtitle="Color-coded contact tags for organization" error={error} loading={loading}>
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-500">{tags.length} tag{tags.length !== 1 ? "s" : ""}</p>
          <button
            onClick={() => setShowModal(true)}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Add Tag
          </button>
        </div>

        {tags.length === 0 && !loading ? (
          <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-8 text-center">
            <p className="text-sm text-slate-500">No tags yet. Add one to start organizing contacts.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {tags.map((tag) => (
              <div key={tag.id} className="rounded-xl bg-white ring-1 ring-gray-200 p-4 hover:shadow-sm transition-shadow">
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full" style={{ backgroundColor: tag.color }} />
                  <span className="font-medium text-slate-900">{tag.name}</span>
                </div>
                <p className="mt-2 text-sm text-slate-500">{tag.contactCount.toLocaleString()} contact{tag.contactCount !== 1 ? "s" : ""}</p>
              </div>
            ))}
          </div>
        )}

        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
              <h3 className="text-lg font-semibold text-slate-900 mb-4">Add Tag</h3>
              <div className="space-y-3">
                <input
                  type="text"
                  placeholder="Tag name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <div>
                  <label className="block text-sm text-slate-600 mb-2">Color</label>
                  <div className="flex flex-wrap gap-2">
                    {TAG_COLORS.map((c) => (
                      <button
                        key={c.value}
                        onClick={() => setForm({ ...form, color: c.value })}
                        className={`h-8 w-8 rounded-full border-2 transition-all ${form.color === c.value ? "border-slate-900 scale-110" : "border-transparent"}`}
                        style={{ backgroundColor: c.value }}
                        title={c.label}
                      />
                    ))}
                  </div>
                </div>
              </div>
              <div className="mt-5 flex justify-end gap-2">
                <button onClick={() => setShowModal(false)} className="rounded-lg border px-4 py-2 text-sm text-slate-600 hover:bg-gray-50">Cancel</button>
                <button onClick={handleAdd} disabled={saving || !form.name.trim()} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                  {saving ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </OliverPageWrapper>
  );
}
