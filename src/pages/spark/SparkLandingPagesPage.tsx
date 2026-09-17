import { useEffect, useState, useCallback } from "react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { SparkPageShell } from "../../components/spark/SparkPageShell";
import { SparkStatStrip } from "../../components/spark/SparkStatStrip";
import { SparkTable } from "../../components/spark/SparkTable";
// §7: the hosted landing page is built on the SAME canvas as the proposal and
// the newsletter, with the web widget set. SparkLandingPageEditor — five fixed
// kinds, up-and-down arrows, a form of text boxes with no picture of the page
// anywhere — is deleted in the same pass. Replace means delete.
import { LandingBuilder, type LandingPageRow } from "../../builder/adapters/landing/LandingBuilder";
import { SparkFilterPills } from "../../components/spark/SparkFilterPills";
import { IadmModal, IadmButton } from "../../components/IadmModal";
import { Plus, FileText, Eye, Send, ExternalLink, Trash2 } from "lucide-react";
// THE brand kit. A landing page has exactly one brand hook — theme_json.accent
// — and until 2026-09-15 nothing ever set it, so LUMEN's default applied and
// every published page carried #EF6C33, the orange Intelligent Analytics
// itself retired (BUILDER_PLATFORM_SCOPE_2026-09-15 §2, step 0).
import { useBrandKit } from "../../brand/BrandKitProvider";
// D-16: a link we cannot build absolutely is not shown. See lib/plainValue.ts.
import { absoluteLink } from "../../lib/plainValue";

interface LandingPage {
  id: number; slug: string; name: string; title: string | null;
  status: string; published_url: string | null;
  view_count: number; submission_count: number;
  created_at: string; updated_at: string;
  /** Either the v2 builder document or the old flat array. Both open. */
  blocks_json?: unknown;
  theme_json?: unknown;
  meta_description?: string | null;
}

export function SparkLandingPagesPage() {
  const { get, post, put, del, ready } = useSparkApi();
  const { kit } = useBrandKit();
  const [list, setList] = useState<LandingPage[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [filter, setFilter] = useState("all");
  const [form, setForm] = useState({ slug: "", name: "", title: "" });
  /** The page currently open in the section editor — this is what turns
   *  "publish a placeholder" into "build a page". */
  const [editing, setEditing] = useState<LandingPage | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  /**
   * Does this business have a website with us?
   *
   * §7's first sentence about landing pages is "With ARION: it is a website
   * page, built in the website builder and published on their site." The only
   * moment that advice is worth anything is the moment somebody opens this, so
   * the builder is told, and says so with the link.
   */
  const [hasArionSite, setHasArionSite] = useState(false);
  /** The row a publish or a delete is working on, so its buttons say so. */
  const [busyId, setBusyId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);

  /**
   * Reload the list.
   *
   * `silent` matters more than it looks. SparkPageShell renders
   * `!loading ? children : null`, so a refresh that flips `loading` UNMOUNTS
   * the builder and mounts a new one — which reopens the template library on
   * an author who was halfway through a page, and looks exactly like "my work
   * disappeared". Found by driving Publish, 2026-09-17. Anything that refreshes
   * the list while the builder is open passes `silent`.
   */
  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!ready) return null;
    if (!opts?.silent) setLoading(true);
    setError(null);
    try {
      const r = await get<{ data: LandingPage[] }>("/api/v1/landing-pages");
      const rows = r.data || [];
      setList(rows);
      return rows;
    } catch (err) { setError(err); return null; }
    finally { if (!opts?.silent) setLoading(false); }
  }, [get, ready]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!ready) return;
    // Best effort, and silent when it fails: the note about the website
    // builder is a nicety, and a business whose site status we cannot read
    // still gets a working landing page. It rides the identity call the
    // builder already makes rather than adding a second one.
    get<any>("/api/v1/email-builder/identity")
      .then((r) => setHasArionSite(!!((r?.data ?? r)?.has_website)))
      .catch(() => setHasArionSite(false));
  }, [get, ready]);

  /**
   * D-34 (BUILDER_USER_TEST_2026-09-16): *"a name-it-first dialog whose copy
   * promises 'Name it first — then you’ll build the page itself'. Pressing
   * Create draft creates the row and dumps you back on the list."*
   *
   * The row it just made is opened in the builder, so the dialog does what its
   * own sentence says.
   */
  async function create() {
    if (!form.slug || !form.name) return;
    setCreating(true); setError(null);
    try {
      const r = await post<{ data: LandingPage }>("/api/v1/landing-pages", {
        slug: form.slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-"),
        name: form.name.trim(),
        title: form.title.trim() || null,
        blocks_json: [],
        // Stamp the business's own accent at creation. LUMEN reads the kit too,
        // so an existing page with no theme still renders in their colour; this
        // makes the value visible in the row rather than implied.
        theme_json: { accent: kit.colours.accent },
      });
      const row = ((r as any)?.data ?? r) as LandingPage | null;
      setForm({ slug: "", name: "", title: "" });
      setDrawerOpen(false);
      await load();
      // Straight into the builder, as the dialog promised.
      if (row?.id) setEditing(row);
    } catch (err) { setError(err); } finally { setCreating(false); }
  }

  /**
   * D-17: Publish asks, and answers. Pressing it from the list used to change
   * a row silently — no confirm, no message, and the chip did not move until
   * the next load.
   */
  async function publish(p: LandingPage) {
    if (!window.confirm(
      `Put “${p.name}” on the internet? Anybody with the link can see it straight away. `
      + "You can keep editing it afterwards.",
    )) return;
    setBusyId(p.id); setError(null);
    try {
      const r: any = await put(`/api/v1/landing-pages/${p.id}`, { status: "published" });
      const row = (r?.data ?? r) as LandingPage | null;
      await load();
      setFlash(row?.published_url
        ? `Published ✓ — “${p.name}” is live at ${row.published_url}`
        : `Published ✓ — “${p.name}” is live.`);
    } catch (err) { setError(err); } finally { setBusyId(null); }
  }

  /**
   * D-14: nothing a user creates could ever be deleted — no control on any of
   * the four surfaces. A published page is taken off the internet first, so a
   * link in somebody's hand never dies without its owner meaning it.
   */
  async function remove(p: LandingPage) {
    const live = p.status === "published";
    if (!window.confirm(
      live
        ? `Delete “${p.name}”? It is live — anybody holding the link will get a "page not found". `
          + "The page and every submission on it are gone for good."
        : `Delete “${p.name}”? The page and every submission on it are gone for good.`,
    )) return;
    setBusyId(p.id); setError(null);
    try {
      await del(`/api/v1/landing-pages/${p.id}`);
      await load();
      setFlash(`Deleted “${p.name}”.`);
    } catch (err) { setError(err); } finally { setBusyId(null); }
  }

  const filtered = filter === "all" ? list : list.filter(p => p.status === filter);
  const totalViews = list.reduce((s, p) => s + p.view_count, 0);
  const totalSubs = list.reduce((s, p) => s + p.submission_count, 0);
  const conversionRate = totalViews > 0 ? ((totalSubs / totalViews) * 100).toFixed(1) : "—";

  return (
    <SparkPageShell
      title="Landing Pages"
      subtitle="Hosted pages you build on the page itself — every submission becomes a contact"
      actions={
        <button onClick={() => setDrawerOpen(true)} className="spark-btn spark-btn-accent"
          title="Name a new page, then build it on the page itself">
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
      {flash && (
        <div className="mb-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
          {flash}
        </div>
      )}

      <SparkTable<LandingPage>
        rows={filtered}
        getRowKey={p => p.id}
        onRowClick={p => setEditing(p)}
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
          /* D-16: the link a visitor would follow. Only shown when the server
             gave the page a real, absolute address — a relative one is
             resolved against the Portal and serves the Portal, which is what
             the walk followed. */
          { key: "url", header: "Link", width: "narrow",
            cell: p => absoluteLink(p.published_url)
              ? <a data-landing-view href={absoluteLink(p.published_url)!} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} className="text-xs text-blue-600 inline-flex items-center gap-1" title="Open the page a visitor sees">View <ExternalLink className="h-3 w-3" /></a>
              : <span className="text-xs text-slate-400">—</span>,
          },
        ]}
        rowActions={p => (
          <div className="flex items-center gap-1.5">
            <button onClick={e => { e.stopPropagation(); setEditing(p); }}
              title="Open this page in the builder"
              className="spark-btn spark-btn-sm spark-btn-secondary">
              Edit
            </button>
            {p.status !== "published" && (
              <button onClick={e => { e.stopPropagation(); publish(p); }} disabled={busyId === p.id}
                title="Put this page on the internet at its own address"
                className="spark-btn spark-btn-sm spark-btn-primary">
                <Send className="h-3 w-3" /> {busyId === p.id ? "Working…" : "Publish"}
              </button>
            )}
            {/* D-14. Asks first, and the question says what goes. */}
            <button onClick={e => { e.stopPropagation(); remove(p); }} disabled={busyId === p.id}
              title="Delete this page and everything somebody sent through it"
              className="spark-btn spark-btn-sm spark-btn-ghost">
              <Trash2 className="h-3 w-3" /> Delete
            </button>
          </div>
        )}
      />

      <IadmModal
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        product="spark"
        title="New landing page"
        subtitle="Name it first — then you'll build the page itself (headline, copy, image, button, contact form)."
        size="info"
        footer={
          <>
            <IadmButton variant="ghost" onClick={() => setDrawerOpen(false)}>Cancel</IadmButton>
            <IadmButton variant="accent" product="spark" onClick={create} disabled={!form.slug || !form.name || creating}>
              {creating ? "Working…" : "Create it and start building"}
            </IadmButton>
          </>
        }
      >
        <div className="p-5 space-y-3">
          <div className="spark-field">
            <label className="spark-field-label">Slug</label>
            <input className="spark-field-input" value={form.slug} onChange={e => setForm({ ...form, slug: e.target.value })} placeholder="summer-promo" autoFocus />
            <p className="text-[11px] text-slate-500 mt-0.5">Lowercase letters, numbers, hyphens. This is the end of the page’s web address: …/{form.slug || "your-slug"}</p>
          </div>
          <div className="spark-field">
            <label className="spark-field-label">Internal name</label>
            <input className="spark-field-input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Summer Promo 2026" />
          </div>
          <div className="spark-field">
            <label className="spark-field-label">Page title (browser tab)</label>
            <input className="spark-field-input" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Get 30% off this summer" />
          </div>
        </div>
      </IadmModal>

      {/* THE builder. Same canvas, same widget pane, the web widget set. */}
      <LandingBuilder
        open={!!editing}
        page={editing}
        api={{ get, put }}
        onClose={() => setEditing(null)}
        /* Silent, and the open row is re-pointed at what the server now holds:
           the builder reads `page.status` and `page.published_url` off this
           prop, and a stale copy is why the chip said "Not live yet" about a
           page that was live (D-17). */
        onSaved={async (message) => {
          setFlash(message);
          const rows = await load({ silent: true });
          if (rows && editing) {
            const fresh = rows.find((r) => r.id === editing.id);
            if (fresh) setEditing(fresh);
          }
        }}
        arionSitePath={hasArionSite ? "/app/services/arion_website_pages" : null}
      />
    </SparkPageShell>
  );
}

export default SparkLandingPagesPage;
