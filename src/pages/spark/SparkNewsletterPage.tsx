import { useEffect, useState, useCallback } from "react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";

interface NewsletterIssue {
  id: number; issue_number: number; edition_date: string; title: string; summary: string | null;
  wp_post_id: number | null; wp_post_url: string | null; published_at: string | null; created_at: string;
}

export function SparkNewsletterPage() {
  const { get, post, ready } = useSparkApi();
  const [list, setList] = useState<NewsletterIssue[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    issue_number: 1, edition_date: new Date().toISOString().slice(0, 10),
    title: "", summary: "",
  });
  const [publishing, setPublishing] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!ready) return;
    setLoading(true); setError(null);
    try {
      const r = await get<{ data: NewsletterIssue[] }>("/api/v1/newsletters");
      setList(r.data || []);
      // Auto-set next issue number
      if (r.data?.length) setForm(f => ({ ...f, issue_number: (r.data[0].issue_number || 0) + 1 }));
    } catch (err) { setError(err); } finally { setLoading(false); }
  }, [get, ready]);

  useEffect(() => { load(); }, [load]);

  async function create() {
    try {
      await post("/api/v1/newsletters", form);
      setShowCreate(false);
      setForm({ issue_number: form.issue_number + 1, edition_date: new Date().toISOString().slice(0, 10), title: "", summary: "" });
      await load();
    } catch (err) { setError(err); }
  }

  async function publish(id: number) {
    setPublishing(id);
    try {
      await post(`/api/v1/newsletters/${id}/publish`, {});
      await load();
    } catch (err) { setError(err); } finally { setPublishing(null); }
  }

  return (
    <OliverPageWrapper title="Newsletter Studio" subtitle="Create + publish newsletter issues to WordPress" error={error} loading={loading}>
      <div className="arion-page">
        <div className="card">
          <div className="card-hdr flex items-center justify-between">
            <div className="card-ttl">Issues</div>
            <button onClick={() => setShowCreate(true)} className="px-3 py-1.5 rounded-md text-sm bg-blue-600 text-white">+ New issue</button>
          </div>
          <table className="data-table text-sm">
            <thead><tr><th>#</th><th>Date</th><th>Title</th><th>Status</th><th>WP</th><th></th></tr></thead>
            <tbody>
              {list.map(n => (
                <tr key={n.id}>
                  <td className="font-mono text-xs">#{n.issue_number}</td>
                  <td className="text-xs">{n.edition_date}</td>
                  <td className="font-medium">{n.title}</td>
                  <td>
                    {n.published_at
                      ? <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 text-xs rounded">Published</span>
                      : <span className="bg-gray-100 text-gray-700 px-2 py-0.5 text-xs rounded">Draft</span>}
                  </td>
                  <td>
                    {n.wp_post_url
                      ? <a href={n.wp_post_url} target="_blank" rel="noreferrer" className="text-xs text-blue-700 underline">View</a>
                      : <span className="text-xs text-gray-500">—</span>}
                  </td>
                  <td>
                    {!n.published_at && (
                      <button onClick={() => publish(n.id)} disabled={publishing === n.id}
                        className="px-2 py-1 rounded-md text-xs bg-emerald-600 text-white disabled:opacity-50">
                        {publishing === n.id ? "Publishing…" : "Publish"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {list.length === 0 && <tr><td colSpan={6} className="text-center py-4 text-gray-500">No newsletter issues yet</td></tr>}
            </tbody>
          </table>
        </div>

        {showCreate && (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-lg max-w-lg w-full p-5">
              <div className="text-lg font-semibold mb-3">New newsletter issue</div>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <label className="text-sm"><div className="text-xs text-gray-500 mb-1">Issue #</div>
                    <input type="number" value={form.issue_number} onChange={e => setForm({ ...form, issue_number: Number(e.target.value) })}
                      className="w-full border border-gray-300 rounded-md px-2 py-1.5" /></label>
                  <label className="text-sm"><div className="text-xs text-gray-500 mb-1">Edition date</div>
                    <input type="date" value={form.edition_date} onChange={e => setForm({ ...form, edition_date: e.target.value })}
                      className="w-full border border-gray-300 rounded-md px-2 py-1.5" /></label>
                </div>
                <input placeholder="Title" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" />
                <textarea placeholder="Summary (intro paragraph)" value={form.summary}
                  onChange={e => setForm({ ...form, summary: e.target.value })}
                  rows={5} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" />
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

export default SparkNewsletterPage;
