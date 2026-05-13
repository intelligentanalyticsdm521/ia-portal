import { useEffect, useState, useCallback } from "react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { SparkPageShell } from "../../components/spark/SparkPageShell";
import { SparkStatStrip } from "../../components/spark/SparkStatStrip";
import { SparkDrawer } from "../../components/spark/SparkDrawer";
import { SparkTable } from "../../components/spark/SparkTable";
import { SparkFilterPills } from "../../components/spark/SparkFilterPills";
import { Plus, FileText, Eye, Send, ExternalLink } from "lucide-react";

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
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [filter, setFilter] = useState("all");
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
    await post("/api/v1/landing-pages", {
      slug: form.slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-"),
      name: form.name.trim(),
      title: form.title.trim() || null,
      blocks_json: [],
    });
    setForm({ slug: "", name: "", title: "" });
    setDrawerOpen(false);
    await load();
  }

  async function publish(p: LandingPage) {
    await put(`/api/v1/landing-pages/${p.id}`, { status: "published" });
    await load();
  }

  const filtered = filter === "all" ? list : list.filter(p => p.status === filter);
  const totalViews = list.reduce((s, p) => s + p.view_count, 0);
  const totalSubs = list.reduce((s, p) => s + p.submission_count, 0);
  const conversionRate = totalViews > 0 ? ((totalSubs / totalViews) * 100).toFixed(1) : "—";

  return (
    <SparkPageShell
      title="Landing Pages"
      subtitle="Hosted landing pages with submission capture"
      actions={
        <button onClick={() => setDrawerOpen(true)} className="spark-btn spark-btn-accent">
          <Plus className="h-3.5 w-3.5" /> New page
        </button>
      }
      stats={
        <SparkStatStrip stats={[
          { label: "Total pages", value: list.length, icon: FileText },
          { label: "Published", value: list.filter(p => p.status === "published").length, accent: "emerald" },
          { label: "Total views", value: totalViews.toLocaleString(), icon: Eye, accent: "blue" },
          { label: "Conversion", value: conversionRate === "—" ? "—" : `${conversionRate}%`, accent: "emerald" },
        ]} />
      }
      filters={
        <SparkFilterPills
          active={filter}
          onChange={setFilter}
          pills={[
            { key: "all", label: "All", count: list.length },
            { key: "draft", label: "Drafts", count: list.filter(p => p.status === "draft").length },
            { key: "published", label: "Published", count: list.filter(p => p.status === "published").length },
          ]}
        />
      }
      loading={loading}
      error={error}
    >
      <SparkTable<LandingPage>
        rows={filtered}
        getRowKey={p => p.id}
        emptyState="No landing pages yet. Create your first one to start capturing leads."
        totalCount={filtered.length}
        columns={[
          { key: "name", header: "Name", width: "wide",
            cell: p => (
              <div className="flex items-center gap-2">
                <FileText className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
                <span className="font-medium">{p.name}</span>
              </div>
            ),
          },
          { key: "slug", header: "Slug", width: "compact",
            cell: p => <span className="font-mono text-xs text-slate-500">/{p.slug}</span>,
          },
          { key: "status", header: "Status", width: "compact",
            cell: p => p.status === "published"
              ? <span className="text-xs px-2 py-0.5 rounded bg-emerald-100 text-emerald-700">Published</span>
              : <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-600 capitalize">{p.status}</span>,
          },
          { key: "views", header: "Views", width: "narrow", align: "right",
            cell: p => <span className="text-sm font-medium">{p.view_count.toLocaleString()}</span>,
          },
          { key: "subs", header: "Subs", width: "narrow", align: "right",
            cell: p => <span className="text-sm font-medium text-emerald-700">{p.submission_count.toLocaleString()}</span>,
          },
          { key: "url", header: "URL", width: "narrow",
            cell: p => p.published_url
              ? <a href={p.published_url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} className="text-xs text-blue-600 inline-flex items-center gap-1">View <ExternalLink className="h-3 w-3" /></a>
              : <span className="text-xs text-slate-400">—</span>,
          },
        ]}
        rowActions={p => p.status !== "published" ? (
          <button onClick={() => publish(p)} className="spark-btn spark-btn-sm spark-btn-primary">
            <Send className="h-3 w-3" /> Publish
          </button>
        ) : null}
      />

      <SparkDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title="New landing page"
        subtitle="Create a draft. Block editor coming in v2 — for now, the page is a placeholder you can publish + capture submissions on."
        footer={
          <>
            <button onClick={() => setDrawerOpen(false)} className="spark-btn spark-btn-secondary">Cancel</button>
            <button onClick={create} disabled={!form.slug || !form.name} className="spark-btn spark-btn-primary">Create draft</button>
          </>
        }
      >
        <div className="spark-field">
          <label className="spark-field-label">Slug</label>
          <input className="spark-field-input" value={form.slug} onChange={e => setForm({ ...form, slug: e.target.value })} placeholder="summer-promo" autoFocus />
          <p className="text-[11px] text-slate-500 mt-0.5">Lowercase letters, numbers, hyphens. Page URL will be /landing/&lt;tenant&gt;/{form.slug || "your-slug"}</p>
        </div>
        <div className="spark-field">
          <label className="spark-field-label">Internal name</label>
          <input className="spark-field-input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Summer Promo 2026" />
        </div>
        <div className="spark-field">
          <label className="spark-field-label">Page title (browser tab)</label>
          <input className="spark-field-input" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Get 30% off this summer" />
        </div>
      </SparkDrawer>
    </SparkPageShell>
  );
}

export default SparkLandingPagesPage;
