import { useEffect, useState, useCallback } from "react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { SparkPageShell } from "../../components/spark/SparkPageShell";
import { SparkDrawer } from "../../components/spark/SparkDrawer";
import { Plus, Tag as TagIcon, Users } from "lucide-react";

interface Tag {
  id: number;
  name: string;
  color: string;
  contact_count: number;
}

const TAG_COLORS = [
  { label: "Slate", value: "#64748b" },
  { label: "Blue", value: "#3b82f6" },
  { label: "Emerald", value: "#10b981" },
  { label: "Amber", value: "#f59e0b" },
  { label: "Rose", value: "#f43f5e" },
  { label: "Violet", value: "#8b5cf6" },
  { label: "Pink", value: "#ec4899" },
  { label: "Teal", value: "#14b8a6" },
];

export function SparkTagsPage() {
  const { get, post, ready } = useSparkApi();
  const [tags, setTags] = useState<Tag[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form, setForm] = useState({ name: "", color: TAG_COLORS[0].value });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!ready) return;
    setLoading(true); setError(null);
    try {
      const r = await get<{ data: Tag[] }>("/api/v1/tags");
      setTags(r.data || []);
    } catch (err) { setError(err); } finally { setLoading(false); }
  }, [get, ready]);
  useEffect(() => { load(); }, [load]);

  async function handleAdd() {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      await post("/api/v1/tags", form);
      setDrawerOpen(false);
      setForm({ name: "", color: TAG_COLORS[0].value });
      await load();
    } catch (err) { setError(err); } finally { setSaving(false); }
  }

  return (
    <SparkPageShell
      title="Tags"
      subtitle="Color-coded labels for organizing contacts"
      actions={
        <button onClick={() => setDrawerOpen(true)} className="spark-btn spark-btn-accent">
          <Plus className="h-3.5 w-3.5" /> New tag
        </button>
      }
      loading={loading}
      error={error}
    >
      {tags.length === 0 && !loading ? (
        <div className="spark-mini-card py-12 text-center">
          <div className="mx-auto w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center mb-3">
            <TagIcon className="h-7 w-7 text-slate-400" />
          </div>
          <h3 className="text-lg font-semibold text-slate-900">No tags yet</h3>
          <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
            Tags are color-coded labels you can apply to contacts. Use them to filter,
            segment, and target campaigns — e.g. <em>"VIP"</em>, <em>"Hot lead"</em>, <em>"Newsletter only"</em>.
          </p>
          <button onClick={() => setDrawerOpen(true)} className="spark-btn spark-btn-primary mt-4">
            <Plus className="h-3.5 w-3.5" /> Create your first tag
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {tags.map(tag => (
            <div key={tag.id} className="spark-mini-card hover:border-slate-300 transition cursor-pointer">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-md flex items-center justify-center flex-shrink-0" style={{ backgroundColor: tag.color + "22", color: tag.color }}>
                  <TagIcon className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-slate-900 truncate">{tag.name}</div>
                  <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
                    <Users className="h-3 w-3" /> {tag.contact_count.toLocaleString()} contact{tag.contact_count === 1 ? "" : "s"}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <SparkDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title="New tag"
        subtitle="Tags let you organize contacts beyond lists/segments — apply many tags to one contact."
        footer={
          <>
            <button onClick={() => setDrawerOpen(false)} className="spark-btn spark-btn-secondary">Cancel</button>
            <button onClick={handleAdd} disabled={saving || !form.name.trim()} className="spark-btn spark-btn-primary">
              {saving ? "Saving…" : "Create tag"}
            </button>
          </>
        }
      >
        <div className="spark-field">
          <label className="spark-field-label">Name</label>
          <input className="spark-field-input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="VIP / Hot lead / Newsletter" autoFocus />
        </div>
        <div className="spark-field">
          <label className="spark-field-label">Color</label>
          <div className="flex flex-wrap gap-2">
            {TAG_COLORS.map(c => (
              <button
                key={c.value}
                type="button"
                onClick={() => setForm({ ...form, color: c.value })}
                className={`h-9 w-9 rounded-md transition-all flex items-center justify-center ${
                  form.color === c.value ? "ring-2 ring-offset-2 ring-slate-900 scale-105" : "hover:scale-105"
                }`}
                style={{ backgroundColor: c.value + "22", color: c.value }}
                title={c.label}
              >
                <TagIcon className="h-4 w-4" />
              </button>
            ))}
          </div>
        </div>

        {/* Preview */}
        <div className="spark-field">
          <label className="spark-field-label">Preview</label>
          <div className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full" style={{ backgroundColor: form.color + "22", color: form.color }}>
            <TagIcon className="h-3 w-3" /> {form.name || "Your tag"}
          </div>
        </div>
      </SparkDrawer>
    </SparkPageShell>
  );
}

export default SparkTagsPage;
