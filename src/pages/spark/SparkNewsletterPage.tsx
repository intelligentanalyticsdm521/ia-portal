import { useEffect, useState, useCallback } from "react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { SparkPageShell } from "../../components/spark/SparkPageShell";
import { SparkStatStrip } from "../../components/spark/SparkStatStrip";
import { SparkDrawer } from "../../components/spark/SparkDrawer";
import { SparkTable } from "../../components/spark/SparkTable";
import { Plus, Newspaper, ExternalLink, Send, FileText, DownloadCloud, Check } from "lucide-react";

interface NewsletterIssue {
  id: number; issue_number: number; edition_date: string; title: string; summary: string | null;
  wp_post_id: number | null; wp_post_url: string | null; published_at: string | null; created_at: string;
}

interface WpPost {
  post_id: number;
  title: string;
  excerpt: string;
  post_url: string;
  published_at: string;
  categories: string[];
  issue_number: number | null;
  edition_date: string | null;
  from_spark: boolean;
}

export function SparkNewsletterPage() {
  const { get, post, ready } = useSparkApi();
  const [list, setList] = useState<NewsletterIssue[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [drawer, setDrawer] = useState<"new" | "import" | null>(null);
  const [form, setForm] = useState({
    issue_number: 1, edition_date: new Date().toISOString().slice(0, 10),
    title: "", summary: "",
  });
  const [publishing, setPublishing] = useState<number | null>(null);

  // Import-from-ARION state
  const [wpPosts, setWpPosts] = useState<WpPost[]>([]);
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [selectedPostIds, setSelectedPostIds] = useState<Set<number>>(new Set());
  const [importing, setImporting] = useState(false);
  // Already-imported wp_post_ids (so we can grey them out)
  const importedPostIds = new Set(list.filter(n => n.wp_post_id).map(n => n.wp_post_id!));

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
    setDrawer(null);
    await load();
  }

  async function publish(id: number) {
    setPublishing(id);
    try { await post(`/api/v1/newsletters/${id}/publish`, {}); await load(); }
    catch (err) { setError(err); } finally { setPublishing(null); }
  }

  async function openImportDrawer() {
    setDrawer("import");
    setImportLoading(true);
    setImportError(null);
    setSelectedPostIds(new Set());
    try {
      const r = await get<{ ok: boolean; posts: WpPost[] }>("/api/v1/newsletters/wp-posts?category=Newsletter&limit=100");
      setWpPosts(r.posts || []);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Couldn't reach ARION/WP");
    } finally {
      setImportLoading(false);
    }
  }

  async function performImport() {
    if (selectedPostIds.size === 0) return;
    setImporting(true);
    try {
      const toImport = wpPosts.filter(p => selectedPostIds.has(p.post_id));
      for (const p of toImport) {
        await post("/api/v1/newsletters/import", {
          post_id: p.post_id,
          title: p.title,
          summary: p.excerpt,
          edition_date: p.edition_date || p.published_at.slice(0, 10),
          issue_number: p.issue_number,
          post_url: p.post_url,
        });
      }
      setDrawer(null);
      setSelectedPostIds(new Set());
      await load();
    } catch (err) { setError(err); } finally { setImporting(false); }
  }

  function togglePost(id: number) {
    setSelectedPostIds(s => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const draftCount = list.filter(n => !n.published_at).length;
  const publishedCount = list.filter(n => n.published_at).length;
  const thisYear = list.filter(n => new Date(n.edition_date).getFullYear() === new Date().getFullYear()).length;

  return (
    <SparkPageShell
      title="Newsletter Studio"
      subtitle="Create + auto-publish newsletter issues to WordPress"
      help={
        <>
          <strong className="block mb-1">How this works:</strong>
          Draft a newsletter issue here → click Publish → SPARK proxies through ARION → posts to your WordPress site as a blog post in the "Newsletter" category. Subscribers also get an email via your campaign list (coming in v2).
          <br /><br />
          <strong>Import from ARION:</strong> If you've published newsletters on your WP site before SPARK existed, click "Import" to bring them into SPARK as already-published issues. We'll link them by wp_post_id so they show up alongside new ones.
        </>
      }
      actions={
        <>
          <button onClick={openImportDrawer} className="spark-btn spark-btn-secondary">
            <DownloadCloud className="h-3.5 w-3.5" /> Import from ARION
          </button>
          <button onClick={() => setDrawer("new")} className="spark-btn spark-btn-accent">
            <Plus className="h-3.5 w-3.5" /> New issue
          </button>
        </>
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
        open={drawer === "new"}
        onClose={() => setDrawer(null)}
        title="New newsletter issue"
        subtitle="Draft creates a record. Click Publish on the row to push to WordPress."
        footer={
          <>
            <button onClick={() => setDrawer(null)} className="spark-btn spark-btn-secondary">Cancel</button>
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

      {/* IMPORT FROM ARION drawer */}
      <SparkDrawer
        open={drawer === "import"}
        onClose={() => setDrawer(null)}
        title="Import newsletters from ARION"
        subtitle={`Showing posts in the "Newsletter" category from your WordPress site`}
        width="wide"
        footer={
          <>
            <button onClick={() => setDrawer(null)} className="spark-btn spark-btn-secondary">Cancel</button>
            <button onClick={performImport} disabled={importing || selectedPostIds.size === 0} className="spark-btn spark-btn-primary">
              {importing ? "Importing…" : `Import ${selectedPostIds.size} ${selectedPostIds.size === 1 ? "issue" : "issues"}`}
            </button>
          </>
        }
      >
        {importLoading ? (
          <div className="py-8 text-center text-sm text-slate-500">Loading WordPress posts…</div>
        ) : importError ? (
          <div className="bg-rose-50 border border-rose-200 text-rose-900 text-xs rounded-md p-3">
            <strong>Couldn't reach ARION/WordPress:</strong> {importError}
            <p className="mt-1 text-rose-800">Make sure this tenant has an ARION-managed site with the IA Plugin installed, and the plugin has the latest version (v2.1+).</p>
          </div>
        ) : wpPosts.length === 0 ? (
          <div className="py-8 text-center text-sm text-slate-500">
            No posts in the "Newsletter" category on your WordPress site.
            <div className="text-[11px] mt-2">Tip: if your newsletters were published in a different category, change it on WP first or rename here.</div>
          </div>
        ) : (
          <>
            <div className="text-xs text-slate-500 mb-3">
              {wpPosts.length} post{wpPosts.length === 1 ? "" : "s"} found · {selectedPostIds.size} selected
              {importedPostIds.size > 0 && <span className="ml-2 text-slate-400">· {importedPostIds.size} already imported</span>}
            </div>
            <div className="space-y-1.5">
              {wpPosts.map(p => {
                const alreadyImported = importedPostIds.has(p.post_id);
                const selected = selectedPostIds.has(p.post_id);
                return (
                  <button
                    key={p.post_id}
                    type="button"
                    onClick={() => !alreadyImported && togglePost(p.post_id)}
                    disabled={alreadyImported}
                    className={`w-full text-left px-3 py-2 rounded-md border transition flex items-start gap-2 ${
                      alreadyImported
                        ? "opacity-60 cursor-not-allowed bg-slate-50 border-slate-200"
                        : selected
                          ? "bg-emerald-50 border-emerald-300"
                          : "bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                    }`}
                  >
                    <div className={`mt-0.5 h-4 w-4 rounded border flex-shrink-0 flex items-center justify-center ${
                      selected ? "bg-emerald-600 border-emerald-600 text-white" : "border-slate-300"
                    }`}>
                      {selected && <Check className="h-3 w-3" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">{p.title}</div>
                      <div className="text-xs text-slate-500 truncate mt-0.5">{p.excerpt || "No excerpt"}</div>
                      <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-1">
                        <span>{new Date(p.published_at).toLocaleDateString()}</span>
                        {p.from_spark && <span className="text-emerald-700">· Already in SPARK</span>}
                        {alreadyImported && <span className="text-amber-700">· Already imported</span>}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </SparkDrawer>
    </SparkPageShell>
  );
}

export default SparkNewsletterPage;
