import { useEffect, useState, useCallback } from "react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { SparkPageShell } from "../../components/spark/SparkPageShell";
import { SparkStatStrip } from "../../components/spark/SparkStatStrip";
import { SparkDrawer } from "../../components/spark/SparkDrawer";
import { SparkTable } from "../../components/spark/SparkTable";
import { Plus, Newspaper, ExternalLink, Send, FileText } from "lucide-react";

interface NewsletterIssue {
  id: number; issue_number: number; edition_date: string; title: string; summary: string | null;
  wp_post_id: number | null; wp_post_url: string | null; published_at: string | null; created_at: string;
}

export function SparkNewsletterPage() {
  const { get, post, ready } = useSparkApi();
  const [list, setList] = useState<NewsletterIssue[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
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
      if (r.data?.length) setForm(f => ({ ...f, issue_number: (r.data[0].issue_number || 0) + 1 }));
    } catch (err) { setError(err); } finally { setLoading(false); }
  }, [get, ready]);
  useEffect(() => { load(); }, [load]);

  async function create() {
    await post("/api/v1/newsletters", form);
    setForm({ issue_number: form.issue_number + 1, edition_date: new Date().toISOString().slice(0, 10), title: "", summary: "" });
    setDrawerOpen(false);
    await load();
  }

  async function publish(id: number) {
    setPublishing(id);
    try { await post(`/api/v1/newsletters/${id}/publish`, {}); await load(); }
    catch (err) { setError(err); } finally { setPublishing(null); }
  }

  const draftCount = list.filter(n => !n.published_at).length;
  const publishedCount = list.filter(n => n.published_at).length;
  const thisYear = list.filter(n => new Date(n.edition_date).getFullYear() === new Date().getFullYear()).length;

  return (
    <SparkPageShell
      title="Newsletter Studio"
      subtitle="Create + auto-publish newsletter issues to WordPress"
      actions={
        <button onClick={() => setDrawerOpen(true)} className="spark-btn spark-btn-accent">
          <Plus className="h-3.5 w-3.5" /> New issue
        </button>
      }
      stats={
        <SparkStatStrip stats={[
          { label: "Total issues", value: list.length, icon: Newspaper },
          { label: "This year", value: thisYear, accent: "blue" },
          { label: "Drafts", value: draftCount, icon: FileText, accent: "amber" },
          { label: "Published", value: publishedCount, accent: "emerald" },
        ]} />
      }
      loading={loading}
      error={error}
    >
      <SparkTable<NewsletterIssue>
        rows={list}
        getRowKey={n => n.id}
        emptyState="No newsletter issues yet. Create your first issue to start publishing."
        totalCount={list.length}
        columns={[
          { key: "num", header: "#", width: "narrow",
            cell: n => <span className="font-mono text-xs text-slate-500">#{n.issue_number}</span>,
          },
          { key: "date", header: "Edition", width: "compact",
            cell: n => <span className="text-xs text-slate-600">{n.edition_date}</span>,
          },
          { key: "title", header: "Title", width: "wide",
            cell: n => <span className="font-medium">{n.title}</span>,
          },
          { key: "status", header: "Status", width: "compact",
            cell: n => n.published_at
              ? <span className="text-xs px-2 py-0.5 rounded bg-emerald-100 text-emerald-700">Published</span>
              : <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-600">Draft</span>,
          },
          { key: "wp", header: "WordPress", width: "compact",
            cell: n => n.wp_post_url
              ? <a href={n.wp_post_url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} className="text-xs text-blue-600 inline-flex items-center gap-1">
                  View <ExternalLink className="h-3 w-3" />
                </a>
              : <span className="text-xs text-slate-400">—</span>,
          },
        ]}
        rowActions={n => !n.published_at ? (
          <button onClick={() => publish(n.id)} disabled={publishing === n.id} className="spark-btn spark-btn-sm spark-btn-primary">
            <Send className="h-3 w-3" /> {publishing === n.id ? "Publishing…" : "Publish"}
          </button>
        ) : null}
      />

      <SparkDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title="New newsletter issue"
        subtitle="Draft creates a record. Click Publish on the row to push to WordPress."
        footer={
          <>
            <button onClick={() => setDrawerOpen(false)} className="spark-btn spark-btn-secondary">Cancel</button>
            <button onClick={create} disabled={!form.title.trim()} className="spark-btn spark-btn-primary">Create draft</button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-3">
          <div className="spark-field">
            <label className="spark-field-label">Issue #</label>
            <input type="number" className="spark-field-input" value={form.issue_number} onChange={e => setForm({ ...form, issue_number: Number(e.target.value) })} />
          </div>
          <div className="spark-field">
            <label className="spark-field-label">Edition date</label>
            <input type="date" className="spark-field-input" value={form.edition_date} onChange={e => setForm({ ...form, edition_date: e.target.value })} />
          </div>
        </div>
        <div className="spark-field">
          <label className="spark-field-label">Title</label>
          <input className="spark-field-input" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="January 2026 Update" autoFocus />
        </div>
        <div className="spark-field">
          <label className="spark-field-label">Summary / intro</label>
          <textarea className="spark-field-textarea" rows={5} value={form.summary} onChange={e => setForm({ ...form, summary: e.target.value })} placeholder="Lead paragraph for the newsletter…" />
        </div>
      </SparkDrawer>
    </SparkPageShell>
  );
}

export default SparkNewsletterPage;
