import { useEffect, useState, useCallback } from "react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";

interface LandingPage {
  id: number; slug: string; name: string; title: string | null;
  status: string; published_url: string | null;
  view_count: number; submission_count: number;
  created_at: string; updated_at: string;
}

export function SparkLandingPagesPage() {
  const { get, post, put, ready } = useSparkApi();
  const [list, setList] = useState<LandingPage[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ slug: "", name: "", title: "" });

  const load = useCallback(async () => {
    if (!ready) return;
    setLoading(true); setError(null);
    try {
      const r = await get<{ data: LandingPage[] }>("/api/v1/landing-pages");
      setList(r.data || []);
    } catch (err) { setError(err); } finally { setLoading(false); }
  }, [get, ready]);

  useEffect(() => { load(); }, [load]);

  async function create() {
    if (!form.slug || !form.name) return;
    try {
      await post("/api/v1/landing-pages", {
        slug: form.slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-"),
        name: form.name.trim(),
        title: form.title.trim() || null,
        blocks_json: [],
      });
      setShowCreate(false);
      setForm({ slug: "", name: "", title: "" });
      await load();
    } catch (err) { setError(err); }
  }

  async function publish(p: LandingPage) {
    try {
      await put(`/api/v1/landing-pages/${p.id}`, { status: "published" });
      await load();
    } catch (err) { setError(err); }
  }

  return (
    <OliverPageWrapper title="Landing Pages" subtitle="Hosted landing pages with submission capture" error={error} loading={loading}>
      <div className="arion-page">
        <div className="card">
          <div className="card-hdr flex items-center justify-between">
            <div className="card-ttl">All pages</div>
            <button onClick={() => setShowCreate(true)} className="px-3 py-1.5 rounded-md text-sm bg-blue-600 text-white">+ New page</button>
          </div>
          <table className="data-table text-sm">
            <thead><tr><th>Slug</th><th>Name</th><th>Status</th><th>Views</th><th>Subs</th><th></th></tr></thead>
            <tbody>
              {list.map(p => (
                <tr key={p.id}>
                  <td className="font-mono text-xs">/{p.slug}</td>
                  <td className="font-medium">{p.name}</td>
                  <td>
                    {p.status === "published"
                      ? <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 text-xs rounded">Published</span>
                      : <span className="bg-gray-100 text-gray-700 px-2 py-0.5 text-xs rounded capitalize">{p.status}</span>}
                  </td>
                  <td>{p.view_count}</td>
                  <td>{p.submission_count}</td>
                  <td>
                    {p.status !== "published" && (
                      <button onClick={() => publish(p)} className="px-2 py-1 rounded-md text-xs bg-emerald-600 text-white">Publish</button>
                    )}
                  </td>
                </tr>
              ))}
              {list.length === 0 && <tr><td colSpan={6} className="text-center py-4 text-gray-500">No landing pages yet</td></tr>}
            </tbody>
          </table>
        </div>

        {showCreate && (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-lg max-w-md w-full p-5">
              <div className="text-lg font-semibold mb-3">New landing page</div>
              <div className="space-y-3">
                <input placeholder="Slug (e.g. summer-promo)" value={form.slug} onChange={e => setForm({ ...form, slug: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" />
                <input placeholder="Internal name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" />
                <input placeholder="Page title (optional)" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" />
                <div className="text-xs text-gray-500">Block editor coming next — for now this creates an empty draft you can publish.</div>
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <button onClick={() => setShowCreate(false)} className="px-3 py-1.5 rounded-md text-sm border">Cancel</button>
                <button onClick={create} className="px-3 py-1.5 rounded-md text-sm bg-emerald-600 text-white">Create draft</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </OliverPageWrapper>
  );
}

export default SparkLandingPagesPage;
