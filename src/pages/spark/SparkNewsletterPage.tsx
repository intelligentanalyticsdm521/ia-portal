/**
 * SparkNewsletterPage — the Newsletter Studio.
 *
 * BUILDER_PLATFORM_SCOPE_2026-09-15 §7: "Newsletter Studio — full widget
 * drag-and-drop for a beautiful newsletter … the email widget subset …
 * pre-made newsletter templates first."
 *
 * ── WHAT CHANGED, AND WHAT DELIBERATELY DID NOT ───────────────────────────
 * Same route, same list, same stats, same Publish-to-site and Create-send
 * buttons. What is gone is the drawer of form fields with a TipTap box in it:
 * "New issue" and a row click now open the builder, on the same canvas the
 * proposal builder uses, with the email widget set.
 *
 * "Import from ARION" has moved INTO the builder, which is where it belongs.
 * It used to create one whole ISSUE per website post — so a monthly newsletter
 * of five stories meant five issues, each with one story in it. Now the posts
 * are a source for the ARTICLES widget: pick three, they land in the three
 * slots you asked for, in the issue you are writing. §7's exact words: "import
 * from the website keeps working as a widget source".
 *
 * A test send goes through the REAL send path (POST /newsletters/:id/test-send
 * → emailSender → the webhooks function), not a preview renderer, so what
 * arrives is what a subscriber would get.
 */
import { useEffect, useState, useCallback } from "react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { useOliverApi } from "../../hooks/useOliverApi";
import { SparkPageShell } from "../../components/spark/SparkPageShell";
import { SparkStatStrip } from "../../components/spark/SparkStatStrip";
import { SparkTable } from "../../components/spark/SparkTable";
import { Plus, Newspaper, ExternalLink, Send, FileText, Trash2 } from "lucide-react";
import { EmailBuilder } from "../../builder/adapters/email/EmailBuilder";
import type { EmailWire } from "../../builder/adapters/email/emailDoc";
import { apiErrorMessage } from "../../lib/apiErrorMessage";
import { ConfirmDialog, type ConfirmAsk } from "../../components/ConfirmDialog";
// D-32: ONE formatter for every date a person reads. See lib/plainValue.ts.
import { editionLabel } from "../../lib/plainValue";

interface NewsletterIssue {
  id: number; issue_number: number; edition_date: string; title: string; summary: string | null;
  wp_post_id: number | null; wp_post_url: string | null; published_at: string | null; created_at: string;
  content_html?: string | null; content_text?: string | null; content_source?: string | null;
  document_json?: unknown;
  campaign_id?: number | null;
}

export function SparkNewsletterPage() {
  const spark = useSparkApi();
  const oliver = useOliverApi();
  const { get, post, put, del, ready } = spark;
  const [list, setList] = useState<NewsletterIssue[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState<number | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  // 2026-09-25 (register spark-newsletter-list-crashes-on-a-row-action-error):
  // a failed row action (publish, send, delete) used to go to setError, which
  // the page wrapper renders as "Something went wrong loading this page" and
  // the six issues vanished behind raw JSON. A row action that fails says so
  // in a red line above the table and the list stays on screen; setError is
  // for the LOAD only.
  const [actionError, setActionError] = useState<string | null>(null);
  const plainError = (err: unknown): string => {
    const raw = err instanceof Error ? err.message : String(err ?? "");
    // "SPARK API 502: {"error":"publish_failed","message":"…"}" → the message.
    const brace = raw.indexOf("{");
    if (brace >= 0) {
      try {
        const body = JSON.parse(raw.slice(brace));
        const m = body?.message || body?.error?.message || body?.error;
        if (typeof m === "string" && m.trim()) return m;
      } catch { /* not JSON — fall through to the raw text */ }
    }
    return raw || "Something went wrong.";
  };

  /** The pending "are you sure?", or null. One home for every question. */
  const [confirmAsk, setConfirmAsk] = useState<ConfirmAsk | null>(null);

  /** The issue open in the builder. `"new"` means one that does not exist yet. */
  const [editing, setEditing] = useState<NewsletterIssue | "new" | null>(null);

  const load = useCallback(async () => {
    if (!ready) return;
    setLoading(true); setError(null);
    try {
      const r = await get<{ data: NewsletterIssue[] }>("/api/v1/newsletters");
      setList(r.data || []);
    } catch (err) { setError(err); } finally { setLoading(false); }
  }, [get, ready]);
  useEffect(() => { load(); }, [load]);

  /**
   * Save what the builder built.
   *
   * The MODEL and the rendered body are written together, from one render, so
   * the row can never hold a body and a model that disagree — which was the
   * defect behind three different pictures of one proposal.
   */
  const saveIssue = useCallback(async (
    wire: EmailWire,
    meta: { subject: string; title: string; preheader: string },
  ): Promise<number | null> => {
    const payload = {
      title: meta.title,
      summary: meta.preheader || null,
      content_html: wire.content_html,
      content_text: wire.content_text,
      document_json: wire.document_json,
      content_source: "builder",
    };
    if (editing && editing !== "new") {
      await put(`/api/v1/newsletters/${editing.id}`, payload);
      await load();
      return editing.id;
    }
    /* D-25: the SERVER numbers the issue. This used to send
     * `list[0].issue_number + 1`, and the list is ordered by edition date, not
     * by number — so two issues written the same afternoon both came out "#3".
     * The walk finished with three rows all called "#3 Monthly update". */
    const r = await post<{ data: NewsletterIssue }>("/api/v1/newsletters", payload);
    // Keep the builder open on the row that now exists, so a second Save
    // updates it instead of creating issue after issue.
    const saved = (r as any)?.data ?? r;
    if (saved?.id) setEditing(saved as NewsletterIssue);
    await load();
    // RETURNED, not read back off state. setEditing does not take effect until
    // the next render, so a caller that saved and then looked at `editing` got
    // the value from BEFORE the save — which on the 2026-09-16 walk meant the
    // test send mailed the top row of the list instead of the issue on screen.
    return saved?.id ?? null;
  }, [editing, load, post, put]);

  /**
   * Send yourself this exact email, through the path a real send uses.
   *
   * It saves FIRST, on purpose: the server sends what is stored, so a test of
   * something that was never stored would be a test of nothing. That also means
   * the address that receives it gets byte-for-byte what a subscriber would.
   */
  const testSend = useCallback(async (
    wire: EmailWire,
    meta: { subject: string; title: string; preheader: string },
    to: string,
    previewContactId?: string | null,
  ) => {
    const target = await saveIssue(wire, meta);
    if (!target) throw new Error("The issue did not save, so there was nothing to send.");
    const r = await post<{ data?: { message?: string } }>(`/api/v1/newsletters/${target}/test-send`, {
      to,
      subject: meta.subject,
      // WHOSE details the test should fill in. Without it the tester receives
      // {{first name}} and learns nothing about whether the merge tags work.
      preview_contact_id: previewContactId || null,
    });
    return (r as any)?.data?.message || `Sent to ${to}. It went out exactly as a real send would.`;
  }, [post, saveIssue]);

  async function publish(id: number, again = false) {
    setPublishing(id); setFlash(null); setActionError(null);
    try {
      await post(`/api/v1/newsletters/${id}/publish`, {}); await load();
      setFlash(again ? "Updated on your website." : "Published to your website.");
    }
    catch (err) { setActionError(`Could not ${again ? "update" : "publish"} it: ${plainError(err)}`); } finally { setPublishing(null); }
  }

  /**
   * D-14: nothing a user creates could be deleted. Three of the walk's own
   * junk rows are still in this list because there was no control to remove
   * them by clicking.
   *
   * The refusals — an issue already on the website, an issue a send was built
   * from — come from LUMEN and are shown in its own words, because the reason
   * is the useful part.
   */
  /**
   * The question, in the app's own dialog.
   *
   * It was a `window.confirm`: the browser's grey box, with the dev
   * server's hostname above it and an "OK" button for deleting somebody's
   * work. Same question, same refusals behind it, asked the way the rest of
   * the product asks.
   */
  function askRemove(issue: NewsletterIssue) {
    setConfirmAsk({
      title: `Delete issue #${issue.issue_number} “${issue.title}”?`,
      body: "It goes from this list for good. This cannot be undone. An issue already on your website, or one a send was built from, is refused — and your newsletter says why.",
      confirmLabel: "Yes, delete it",
      onConfirm: () => { void remove(issue); },
    });
  }

  async function remove(issue: NewsletterIssue) {
    setPublishing(issue.id); setFlash(null); setActionError(null);
    try {
      await del(`/api/v1/newsletters/${issue.id}`);
      await load();
      setFlash(`Deleted issue #${issue.issue_number}.`);
    } catch (err) { setActionError(`Could not delete issue #${issue.issue_number}: ${plainError(err)}`); } finally { setPublishing(null); }
  }

  async function createSend(issue: NewsletterIssue) {
    setPublishing(issue.id); setFlash(null); setActionError(null);
    try {
      await post(`/api/v1/newsletters/${issue.id}/campaign`, {});
      await load();
      setFlash(`A draft campaign is ready for “${issue.title}”. Open Campaigns to choose who gets it and when.`);
    } catch (err) { setActionError(`Could not build the send for “${issue.title}”: ${plainError(err)}`); } finally { setPublishing(null); }
  }

  const draftCount = list.filter(n => !n.published_at).length;
  const publishedCount = list.filter(n => n.published_at).length;
  const thisYear = list.filter(n => new Date(n.edition_date).getFullYear() === new Date().getFullYear()).length;

  return (
    <SparkPageShell
      title="Newsletter Studio"
      subtitle="Build the issue on the page, send it to your list, and put it on your website"
      help={
        <>
          <strong className="block mb-1">How this works:</strong>
          Press <em>New issue</em>, pick a shape (monthly update, promotion, event, announcement) and the page opens with
          your logo at the top and your unsubscribe footer at the bottom. Type straight onto it — what you see is what
          lands in the inbox.
          <br /><br />
          <strong>From your website:</strong> select the Articles block and press <em>Show my posts</em> to bring stories
          across from your own site into the issue you are writing.
          <br /><br />
          <strong>Publish to site</strong> puts the issue on your website as a post. <strong>Create send</strong> builds
          the email campaign — they are separate on purpose, so an issue can go to one, the other, or both.
        </>
      }
      actions={
        <button onClick={() => setEditing("new")} className="spark-btn spark-btn-accent" title="Build a new issue">
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
      {actionError && (
        <div role="alert" className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900">
          {actionError}
        </div>
      )}
      {flash && (
        <div className="mb-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
          {flash}
        </div>
      )}

      <SparkTable<NewsletterIssue>
        rows={list}
        getRowKey={n => n.id}
        emptyState="No newsletter issues yet. Press New issue and pick a shape to start from."
        totalCount={list.length}
        columns={[
          { key: "num", header: "#", width: "narrow",
            cell: n => <span className="font-mono text-xs text-slate-500">#{n.issue_number}</span>,
          },
          { key: "date", header: "Edition", width: "compact",
            /* D-32: this printed `2026-09-16T00:00:00.000Z` — a raw database
               value on a screen a business owner reads. One formatter, and it
               never shows a bare ISO string even when the value is unreadable. */
            cell: n => <span className="text-xs text-slate-600">{editionLabel(n.edition_date)}</span>,
          },
          { key: "title", header: "Title", width: "wide",
            cell: n => <span className="font-medium">{n.title}</span>,
          },
          { key: "built", header: "Built in", width: "compact",
            cell: n => n.document_json
              ? <span className="text-xs text-slate-600">The builder</span>
              : <span className="text-xs text-amber-700" title="Written in the old editor. Open it and it will be read back into the builder.">The old editor</span>,
          },
          { key: "status", header: "Status", width: "compact",
            cell: n => n.published_at
              ? <span className="text-xs px-2 py-0.5 rounded bg-emerald-100 text-emerald-700">Published</span>
              : <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-600">Draft</span>,
          },
          { key: "wp", header: "Website", width: "compact",
            cell: n => n.wp_post_url
              ? <a href={n.wp_post_url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} className="text-xs text-blue-600 inline-flex items-center gap-1">
                  View <ExternalLink className="h-3 w-3" />
                </a>
              : <span className="text-xs text-slate-400">—</span>,
          },
        ]}
        onRowClick={n => setEditing(n)}
        rowActions={n => (
          <div className="flex items-center gap-1.5">
            {!n.published_at ? (
              <button onClick={(e) => { e.stopPropagation(); publish(n.id); }} disabled={publishing === n.id}
                      title="Put this issue on your website as a post"
                      className="spark-btn spark-btn-sm spark-btn-secondary">
                <ExternalLink className="h-3 w-3" /> {publishing === n.id ? "Publishing…" : "Publish to site"}
              </button>
            ) : (
              /* 2026-09-25 (register spark-newsletter-republish-creates-a-second-post):
                 an issue edited after it went to the website had no way back
                 there. Same route; LUMEN sends the post id, so the post on the
                 site is rewritten, never duplicated. */
              <button onClick={(e) => { e.stopPropagation(); publish(n.id, true); }} disabled={publishing === n.id}
                      title="Write this issue's latest text over the post already on your website"
                      className="spark-btn spark-btn-sm spark-btn-secondary">
                <ExternalLink className="h-3 w-3" /> {publishing === n.id ? "Updating…" : "Update on website"}
              </button>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); createSend(n); }}
              disabled={publishing === n.id || !n.content_html}
              title={n.content_html ? "Build the email campaign for this issue" : "Build the issue first"}
              className="spark-btn spark-btn-sm spark-btn-primary"
            >
              <Send className="h-3 w-3" /> {n.campaign_id ? "New send" : "Create send"}
            </button>
            {/* D-14. Asks first; an issue already on the website or already
                sent is refused by LUMEN, in its own words. */}
            <button
              onClick={(e) => { e.stopPropagation(); askRemove(n); }}
              disabled={publishing === n.id}
              title="Delete this issue"
              className="spark-btn spark-btn-sm spark-btn-ghost"
            >
              <Trash2 className="h-3 w-3" /> Delete
            </button>
          </div>
        )}
      />

      {/* THE builder. Same canvas as the proposal builder, email widget set. */}
      <EmailBuilder
        open={!!editing}
        onClose={() => setEditing(null)}
        api={spark}
        catalogApi={oliver}
        eyebrow="SPARK · Newsletter"
        row={editing && editing !== "new" ? editing : null}
        title={editing && editing !== "new" ? editing.title : ""}
        titlePlaceholder={`Name this issue — e.g. “${new Date().toLocaleString("en-US", { month: "long" })} update”`}
        initialSubject={editing && editing !== "new" ? editing.title : ""}
        initialPreheader={editing && editing !== "new" ? (editing.summary || "") : ""}
        saveLabel="Save issue"
        onSave={saveIssue}
        onTestSend={testSend}
        extraActions={
          editing && editing !== "new" && editing.content_html ? (
            <button
              type="button"
              onClick={async () => {
                try { await createSend(editing); }
                catch (e) { setError(apiErrorMessage(e)); }
              }}
              title="Build the email campaign for this issue, then choose who gets it in Campaigns"
              style={{
                display: "inline-flex", alignItems: "center", gap: 5,
                border: "1px solid rgba(255,255,255,0.3)", background: "transparent", color: "#fff",
                borderRadius: 4, padding: "5px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer",
              }}
            >
              <Send size={13} /> Create send
            </button>
          ) : null
        }
      />

      <ConfirmDialog ask={confirmAsk} product="spark" z={70} onClose={() => setConfirmAsk(null)} />
    </SparkPageShell>
  );
}

export default SparkNewsletterPage;
