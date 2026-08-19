import { useEffect, useState, useCallback } from "react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { SparkPageShell } from "../../components/spark/SparkPageShell";
import { SparkStatStrip } from "../../components/spark/SparkStatStrip";
import { SparkDrawer } from "../../components/spark/SparkDrawer";
import { SparkTable } from "../../components/spark/SparkTable";
import { Plus, Newspaper, ExternalLink, Send, FileText, DownloadCloud, Check, Settings } from "lucide-react";
import { SparkBodyEditor } from "../../components/spark/SparkBodyEditor";

// 2026-06-13: per-tenant taxonomy config for "Import from ARION". Default
// looks for posts tagged or categorized "newsletter"; each tenant can
// override which taxonomy and which term via the cog UI next to Import.
type TaxonomyType = "category" | "tag" | "both";
interface ImportConfig { type: TaxonomyType; value: string }
const DEFAULT_IMPORT_CONFIG: ImportConfig = { type: "both", value: "newsletter" };

interface NewsletterIssue {
  id: number; issue_number: number; edition_date: string; title: string; summary: string | null;
  wp_post_id: number | null; wp_post_url: string | null; published_at: string | null; created_at: string;
  content_html?: string | null; content_text?: string | null; content_source?: string | null;
  campaign_id?: number | null;
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
  const { get, post, put, ready } = useSparkApi();
  const [list, setList] = useState<NewsletterIssue[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [drawer, setDrawer] = useState<"new" | "import" | "import_config" | null>(null);
  const [editingIssue, setEditingIssue] = useState<NewsletterIssue | null>(null);
  const [form, setForm] = useState({
    issue_number: 1,
    edition_date: new Date().toISOString().slice(0, 10),
    title: "",
    summary: "",
    content_html: "",
    content_text: "",
  });
  const [publishing, setPublishing] = useState<number | null>(null);

  // Import-from-ARION state
  const [wpPosts, setWpPosts] = useState<WpPost[]>([]);
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [selectedPostIds, setSelectedPostIds] = useState<Set<number>>(new Set());
  const [importing, setImporting] = useState(false);
  // Per-tenant Import config (taxonomy filter for /wp-posts)
  const [importConfig, setImportConfig] = useState<ImportConfig>(DEFAULT_IMPORT_CONFIG);
  const [configDraft, setConfigDraft] = useState<ImportConfig>(DEFAULT_IMPORT_CONFIG);
  const [configSaving, setConfigSaving] = useState(false);
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

  // Load per-tenant Newsletter Import config (default = both/newsletter)
  useEffect(() => {
    if (!ready) return;
    (async () => {
      try {
        const r = await get<{ data: { setting_value?: string } | null }>("/api/v1/tenant-settings/newsletter_import_config");
        const raw = r?.data?.setting_value;
        if (raw) {
          const parsed = JSON.parse(raw) as Partial<ImportConfig>;
          const cfg: ImportConfig = {
            type: (parsed.type === "category" || parsed.type === "tag" || parsed.type === "both") ? parsed.type : "both",
            value: (parsed.value || "newsletter").toString(),
          };
          setImportConfig(cfg);
          setConfigDraft(cfg);
        }
      } catch { /* default config is fine */ }
    })();
  }, [get, ready]);

  async function saveImportConfig() {
    setConfigSaving(true);
    try {
      await put("/api/v1/tenant-settings/newsletter_import_config", { setting_value: JSON.stringify(configDraft) });
      setImportConfig(configDraft);
      setDrawer(null);
    } catch (err) {
      alert(`Couldn't save Import config: ${(err as Error).message}`);
    } finally {
      setConfigSaving(false);
    }
  }

  async function create() {
    if (editingIssue) {
      await put(`/api/v1/newsletters/${editingIssue.id}`, form);
    } else {
      await post("/api/v1/newsletters", { ...form, content_source: "studio" });
    }
    setEditingIssue(null);
    setForm({
      issue_number: form.issue_number + 1,
      edition_date: new Date().toISOString().slice(0, 10),
      title: "", summary: "", content_html: "", content_text: "",
    });
    setDrawer(null);
    await load();
  }

  function openIssue(issue: NewsletterIssue) {
    setEditingIssue(issue);
    setForm({
      issue_number: issue.issue_number,
      edition_date: (issue.edition_date || "").slice(0, 10),
      title: issue.title,
      summary: issue.summary || "",
      content_html: issue.content_html || "",
      content_text: issue.content_text || "",
    });
    setDrawer("new");
  }

  /**
   * Upload a picture and hand its address back to the editor.
   *
   * Base64 rather than multipart, matching the endpoint — and matching how the
   * My Brand media library already uploads, so both use one storage path.
   */
  const uploadImage = useCallback(async (file: File): Promise<string> => {
    const dataUrl: string = await new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result));
      fr.onerror = () => reject(new Error("That file could not be read."));
      fr.readAsDataURL(file);
    });
    const r = await post<{ data?: { url?: string } }>("/api/v1/newsletters/assets/upload", {
      data: dataUrl, filename: file.name,
    });
    const url = r?.data?.url;
    if (!url) throw new Error("The image uploaded but no address came back for it.");
    return url;
  }, [post]);

  /** Build the send for this issue, then hand the user to Campaigns. */
  async function createSend(issue: NewsletterIssue) {
    setPublishing(issue.id);
    try {
      await post(`/api/v1/newsletters/${issue.id}/campaign`, {});
      await load();
      alert(`A draft campaign is ready for "${issue.title}". Open CRM & Marketing → Campaigns to choose who gets it and when.`);
    } catch (err) {
      setError(err);
    } finally {
      setPublishing(null);
    }
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
      const qp = new URLSearchParams({
        taxonomy_type: importConfig.type,
        taxonomy_value: importConfig.value,
        limit: "100",
      });
      const r = await get<{ ok: boolean; posts: WpPost[] }>(`/api/v1/newsletters/wp-posts?${qp}`);
      setWpPosts(r.posts || []);
    } catch (err) {
      // The wp-posts proxy returns specific error codes from arion-api.
      // Parse them out of the SPARK-API-error string so the user gets
      // an actionable message instead of "SPARK API 502: {...}".
      const raw = err instanceof Error ? err.message : String(err);
      let friendly = "Couldn't reach ARION/WordPress.";
      if (/no_arion_site/i.test(raw) || /404/.test(raw)) {
        friendly = "No ARION-managed website is connected to this tenant yet. Connect a site (or finish ARION onboarding) before importing newsletters from WordPress.";
      } else if (/plugin_call_failed/i.test(raw)) {
        friendly = "Reached your ARION site but the IA plugin didn't respond. Check that the plugin is installed and activated on your WordPress site, then try again.";
      } else if (/arion_api_not_configured/i.test(raw)) {
        friendly = "The SPARK ↔ ARION connection isn't configured on the platform yet. Contact support.";
      } else if (/SPARK API 5\d\d/.test(raw)) {
        friendly = "ARION is temporarily unreachable. Try again in a minute. If it keeps failing, check that your WordPress site is online.";
      } else if (raw && raw.length < 200) {
        friendly = raw;
      }
      setImportError(friendly);
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
          <button
            onClick={() => { setConfigDraft(importConfig); setDrawer("import_config"); }}
            className="spark-btn spark-btn-secondary"
            title={`Configure Import: ${importConfig.type === 'both' ? 'category or tag' : importConfig.type} = "${importConfig.value}"`}
          >
            <Settings className="h-3.5 w-3.5" />
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
        onRowClick={openIssue}
        rowActions={n => (
          <div className="flex items-center gap-1.5">
            {/* Publish pushes the issue to the website. Create send builds the
                email. They are separate on purpose: an issue can go to the site
                only, to the list only, or to both. */}
            {!n.published_at && (
              <button onClick={(e) => { e.stopPropagation(); publish(n.id); }} disabled={publishing === n.id}
                      className="spark-btn spark-btn-sm spark-btn-secondary">
                <ExternalLink className="h-3 w-3" /> {publishing === n.id ? "Publishing…" : "Publish to site"}
              </button>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); createSend(n); }}
              disabled={publishing === n.id || !n.content_html}
              title={n.content_html ? "Build the email for this issue" : "Write or import the issue first"}
              className="spark-btn spark-btn-sm spark-btn-primary"
            >
              <Send className="h-3 w-3" /> {n.campaign_id ? "New send" : "Create send"}
            </button>
          </div>
        )}
      />

      <SparkDrawer
        open={drawer === "import_config"}
        onClose={() => setDrawer(null)}
        title="Configure Newsletter Import"
        subtitle="Choose which WordPress taxonomy + term Import from ARION looks for. Default is both category and tag matching 'newsletter'."
        footer={
          <>
            <button onClick={() => setDrawer(null)} className="spark-btn spark-btn-secondary">Cancel</button>
            <button onClick={saveImportConfig} disabled={configSaving || !configDraft.value.trim()} className="spark-btn spark-btn-primary">
              {configSaving ? "Saving…" : "Save"}
            </button>
          </>
        }
      >
        <div className="spark-field">
          <label className="spark-field-label">Taxonomy</label>
          <select
            className="spark-field-select"
            value={configDraft.type}
            onChange={e => setConfigDraft({ ...configDraft, type: e.target.value as TaxonomyType })}
          >
            <option value="both">Both (category or tag — OR match)</option>
            <option value="category">Category only</option>
            <option value="tag">Tag only</option>
          </select>
          <p className="text-[11px] text-slate-500 mt-1">
            WordPress has two taxonomies. "Both" pulls posts that match the term as either a category or a tag.
          </p>
        </div>
        <div className="spark-field">
          <label className="spark-field-label">Term</label>
          <input
            type="text"
            className="spark-field-input"
            placeholder="newsletter"
            value={configDraft.value}
            onChange={e => setConfigDraft({ ...configDraft, value: e.target.value })}
            autoFocus
          />
          <p className="text-[11px] text-slate-500 mt-1">
            We match by slug first, then name. Case-insensitive. Examples: <code className="bg-slate-100 px-1 rounded">newsletter</code>, <code className="bg-slate-100 px-1 rounded">intelligence-brief</code>.
          </p>
        </div>
        <div className="mt-3 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-900">
          <strong>Current setting:</strong> {importConfig.type === "both" ? "category OR tag" : importConfig.type} = <code>"{importConfig.value}"</code>
        </div>
      </SparkDrawer>

      <SparkDrawer
        open={drawer === "new"}
        onClose={() => setDrawer(null)}
        title={editingIssue ? `Issue ${editingIssue.issue_number} — ${editingIssue.title}` : "New newsletter issue"}
        subtitle="Write it here, or import it from your website. Publish pushes it to the site; Create send builds the email."
        footer={
          <>
            <button onClick={() => setDrawer(null)} className="spark-btn spark-btn-secondary">Cancel</button>
            <button onClick={create} disabled={!form.title.trim()} className="spark-btn spark-btn-primary">{editingIssue ? "Save issue" : "Create draft"}</button>
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
          <label className="spark-field-label">
            Summary <span className="font-normal text-slate-400">— the one-line teaser, used in listings</span>
          </label>
          <textarea className="spark-field-textarea" rows={2} value={form.summary} onChange={e => setForm({ ...form, summary: e.target.value })} placeholder="What this issue is about, in a sentence." />
        </div>
        <div className="spark-field">
          <label className="spark-field-label">The issue</label>
          {/* richness="newsletter" turns on headings, pictures, pull quotes and
              section breaks. The campaign composer stays on the plain "email"
              mode, because a promo email is prose and a newsletter is a
              document. Same editor either way, so an issue opens in both. */}
          <SparkBodyEditor
            value={form.content_html}
            onChange={(html, text) => setForm({ ...form, content_html: html, content_text: text })}
            placeholder="Write the issue. Add pictures, links and merge tags as you go."
            richness="newsletter"
            onUploadImage={uploadImage}
            minHeight={320}
          />
        </div>
      </SparkDrawer>

      {/* IMPORT FROM ARION drawer */}
      <SparkDrawer
        open={drawer === "import"}
        onClose={() => setDrawer(null)}
        title="Import newsletters from ARION"
        subtitle={
          importConfig.type === "both"
            ? `Showing posts tagged or categorized "${importConfig.value}"`
            : `Showing posts ${importConfig.type === "tag" ? "tagged" : "in category"} "${importConfig.value}"`
        }
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
            No posts found matching {importConfig.type === "both" ? "category or tag" : importConfig.type} "{importConfig.value}".
            <div className="text-[11px] mt-2">Tip: change the term via the settings cog (top right) or tag posts in WP with this term.</div>
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
