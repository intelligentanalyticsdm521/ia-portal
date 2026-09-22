import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, Loading, EmptyPanel, ErrorBanner } from '../../components/Ui';
import { useArionContext } from '../../useArionContext';
import { useArionData } from '../../useArionData';
import { smallButton } from '../../components/SectionFieldInputs';
import type { ArionSitePage } from '../../../lib/arionApi';
import type { FieldContext } from '../../components/SectionFieldInputs';
import {
  statusLinks, filterPages, paginate, stateSuffix, dateCell, rowActions,
  ROW_ACTION_LABEL, bulkActions, type PagesView, type RowAction,
} from '../../utils/pagesTable';
import { WebsiteBuilder, type WebsiteBuilderApi } from '../../../builder/adapters/website/WebsiteBuilder';
import { SITE_PAGE_TEMPLATES, siteLibrary } from '../../../builder/adapters/website/siteTemplates';
import { TemplateLibrary } from '../../../builder/TemplateLibrary';

/**
 * ARION → Website → Pages
 * ---------------------------------------------------------------------------
 * "When something on my website is wrong or out of date, I open the Portal,
 *  click the page, change the words or the picture, see what it will look
 *  like, and hit Publish. I never open WordPress."
 *
 * Two views behind one route, switched by ?pageId=<n>:
 *   the list of pages, and the builder for one page.
 *
 * THE LIST IS WORDPRESS'S PAGES SCREEN (2026-09-22). Brandon: *"for the
 * website pages, can we make this look like what wordpress pages looks like."*
 * The "Drafts" / "Live pages" cards are DELETED, and with them the sentences
 * that counted how much of a page we could edit. What a client sees is the
 * screen they already know: Pages + Add New Page, All | Published | Drafts |
 * Trash with counts, a search box, Title / Author / Date, the row actions
 * under the title, bulk actions and pagination. Read off the real screen on
 * the dev fixture site, not from memory. The pure half is `utils/pagesTable`.
 *
 * Shape (REBUILT 2026-09-16): the ONE builder. A page opens on a canvas that
 * draws every section the way the website will, the widget pane adds sections
 * and content, and the inspector holds only what has no place on the page.
 * W-1's section-list editor and the AI Builder wizard are both DELETED — same
 * route, same list, same buttons, a different editor behind them.
 *
 * Safety: preview before save, a snapshot on every write, one-tap Undo, and
 * new pages born as drafts (decision W-3). No per-page staging.
 *
 * ARION pack 1 (2026-09-08) adds the jobs that had no home here at all and sent
 * a client to wp-admin for them: the page's address and layout, which page is
 * the home page, deleting and restoring a page, its three search-engine fields,
 * and changing a section's look without retyping it. Preview is now WORDPRESS
 * rendering the page (D-ARION-B) rather than our own approximation of it, and
 * the editor asks the website whether it actually has Elementor before it lets
 * anybody save (D-ARION-E) — that save used to answer 200 and leave the page
 * blank.
 *
 * Phase 1B adds the third way in — "Ask ARGUS to change it", per section and
 * per page. It always PROPOSES: what comes back is shown as a before/after,
 * and approving it only fills the editor. The website still changes on Save
 * and nowhere else, so Undo covers an AI edit exactly as it covers a typed
 * one. Every ARION tier can use the editor (W-4); the AI actions need a paid
 * plan and cost credits, and the price is read from the server, never guessed
 * here (feedback_no_fabricated_catalog).
 */

/* ── small shared bits ─────────────────────────────────────────────────── */

/** One line the client can act on, never a stack trace. */
function messageFrom(err: any, fallback: string): string {
  const m = err?.message;
  return typeof m === 'string' && m.trim() ? m : fallback;
}

function Banner({ tone, children, onClose }: {
  tone: 'good' | 'bad'; children: React.ReactNode; onClose?: () => void;
}) {
  const good = tone === 'good';
  return (
    <div role="status" style={{
      background: good ? '#DCFCE7' : '#FEE2E2',
      color: good ? '#166534' : '#991B1B',
      border: `1px solid ${good ? '#86EFAC' : '#FCA5A5'}`,
      borderRadius: 8, padding: '10px 12px', marginBottom: 12, fontSize: 13,
      display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start',
    }}>
      <span>{children}</span>
      {onClose && (
        <button type="button" onClick={onClose} aria-label="Dismiss"
                style={{ background: 'none', border: 0, color: 'inherit', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>
          ×
        </button>
      )}
    </div>
  );
}

/* ── the list of pages: WordPress's Pages screen, in our colours ────────── */

/**
 * Brandon, 2026-09-22: *"for the website pages, can we make this look like
 * what wordpress pages looks like, then I can't actually edit anything."*
 *
 * The card list this replaces stacked "Drafts" and "Live pages" cards, each
 * row a title, a chip and a sentence about how much of the page we could
 * edit. Nobody who has run a WordPress site recognises that screen. This one
 * is the screen they already know — heading, Add New Page, the status links,
 * a search box, a table of Title / Author / Date with the row actions under
 * the title on hover, bulk actions and pagination — read off the real one on
 * the dev fixture site rather than from memory.
 *
 * Everything about it that is not JSX lives in `utils/pagesTable.ts`, so the
 * counts, the search, the page of twenty, the row actions and WordPress's two
 * row strings are `node --test` rows rather than a browser check.
 */

function PagesList({ onOpen }: { onOpen: (pageId: number) => void }) {
  const { selectedSite, activeSiteId, arionApi } = useArionContext();
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newKind, setNewKind] = useState<'page' | 'post'>('page');
  // THE TEMPLATE PRINCIPLE (§7): a new page never opens blank. The template is
  // a list of ARION section KINDS — arion-api fills each one from the
  // business's own details, so no template ever carries somebody else's words.
  const [template, setTemplate] = useState('home');
  // §11.9 — the one template library, opened from 'Browse templates'.
  const [browsing, setBrowsing] = useState(false);
  const pageLibrary = useMemo(() => siteLibrary(), []);
  const chosenTemplate = SITE_PAGE_TEMPLATES.find((t) => t.key === template);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [askFor, setAskFor] = useState<ArionSitePage | null>(null);
  const [askText, setAskText] = useState('');
  const [asked, setAsked] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  /* The screen's own state: which status link, what is typed in the search
     box, which page of twenty, and which rows are ticked. */
  const [view, setView] = useState<PagesView>('all');
  const [typed, setTyped] = useState('');
  const [search, setSearch] = useState('');
  const [pageNo, setPageNo] = useState(1);
  const [ticked, setTicked] = useState<number[]>([]);
  const [bulk, setBulk] = useState('');

  const { data, loading, error: loadError, refetch } = useArionData(
    () => (activeSiteId ? arionApi.listSitePages(activeSiteId) : Promise.resolve(null)),
    [activeSiteId],
  );
  const pages: ArionSitePage[] = (data as any)?.data?.pages || [];

  const links = useMemo(() => statusLinks(pages), [pages]);
  const filtered = useMemo(() => filterPages(pages, view, search), [pages, view, search]);
  const screen = useMemo(() => paginate(filtered, pageNo), [filtered, pageNo]);
  const shown = screen.rows;
  const allTicked = shown.length > 0 && shown.every((p) => ticked.includes(p.pageId));

  /* A link, a search or a new page of rows starts from the top with nothing
     ticked — a tick a client cannot see is a page they are about to bin by
     accident. */
  const go = (next: PagesView) => { setView(next); setPageNo(1); setTicked([]); };
  useEffect(() => { setTicked([]); }, [pageNo, search, view]);
  // The bin link disappears the moment the bin empties, so a view pinned to it
  // would show a table with no way back to the pages.
  useEffect(() => {
    if (view === 'trash' && !links.some((l) => l.view === 'trash')) setView('all');
  }, [links, view]);

  const restore = async (p: ArionSitePage) => {
    if (!activeSiteId) return;
    setBusy(true); setError(null);
    try {
      await arionApi.restoreSitePage(activeSiteId, p.pageId);
      setNote(`“${p.title || 'That page'}” is back, as a draft. Publish it when you are ready.`);
      refetch();
    } catch (e: any) {
      setError(messageFrom(e, 'We could not bring that page back.'));
    } finally {
      setBusy(false);
    }
  };

  const trash = async (p: ArionSitePage) => {
    if (!activeSiteId) return;
    setBusy(true); setError(null);
    try {
      await arionApi.trashSitePage(activeSiteId, p.pageId);
      setNote(`“${p.title || 'That page'}” is in the bin. Your website keeps it for 30 days.`);
      refetch();
    } catch (e: any) {
      setError(messageFrom(e, 'We could not delete that page.'));
    } finally {
      setBusy(false);
    }
  };

  /**
   * Bulk actions, one page at a time.
   *
   * The website has no bulk door, so this is the row action run over the
   * ticked rows — and it STOPS on the first refusal rather than carrying on
   * and reporting a success it did not have. A client is told how many moved
   * and which one would not.
   */
  const applyBulk = async () => {
    if (!activeSiteId || !bulk || ticked.length === 0) return;
    const rows = filtered.filter((p) => ticked.includes(p.pageId));
    setBusy(true); setError(null);
    let done = 0;
    try {
      for (const p of rows) {
        if (bulk === 'trash') await arionApi.trashSitePage(activeSiteId, p.pageId);
        else if (bulk === 'restore') await arionApi.restoreSitePage(activeSiteId, p.pageId);
        done += 1;
      }
      setNote(bulk === 'trash'
        ? `${done} page${done === 1 ? '' : 's'} moved to the bin. Your website keeps them for 30 days.`
        : `${done} page${done === 1 ? '' : 's'} put back, as drafts.`);
    } catch (e: any) {
      setError(messageFrom(e, done > 0
        ? `${done} of ${rows.length} were done, then your website refused the next one.`
        : 'Your website refused that.'));
    } finally {
      setTicked([]); setBulk('');
      setBusy(false);
      refetch();
    }
  };

  const create = async () => {
    if (!activeSiteId || !newTitle.trim()) return;
    setBusy(true); setError(null);
    try {
      const chosen = SITE_PAGE_TEMPLATES.find((t) => t.key === template);
      const res: any = await arionApi.createSitePage(activeSiteId, {
        title: newTitle.trim(),
        // A post opens on a headline and a paragraph; a page opens on the
        // template the client chose, filled from their own details.
        sections: (newKind === 'post'
          ? ['about', 'content']
          : (chosen?.kinds || ['hero'])
        ).map((kind) => ({ kind })),
        type: newKind,
      });
      setCreating(false); setNewTitle('');
      refetch();
      if (res?.data?.pageId) onOpen(res.data.pageId);
    } catch (e: any) {
      setError(messageFrom(e, 'We could not create that page.'));
    } finally {
      setBusy(false);
    }
  };

  const askUs = async () => {
    if (!activeSiteId || !askFor || !askText.trim()) return;
    setBusy(true); setError(null);
    try {
      await arionApi.submitRequest(
        activeSiteId,
        'content_update',
        `Page: ${askFor.title}${askFor.permalink ? ` (${askFor.permalink})` : ''}\n\n${askText.trim()}`,
      );
      setAsked(askFor.title);
      setAskFor(null); setAskText('');
    } catch (e: any) {
      setError(messageFrom(e, 'We could not send that request.'));
    } finally {
      setBusy(false);
    }
  };

  /** One row action, drawn the way WordPress draws them — a row of links. */
  const action = (p: ArionSitePage, kind: RowAction) => {
    const label = ROW_ACTION_LABEL[kind];
    if (kind === 'view' || kind === 'preview') {
      return (
        <a key={kind} className="wpp-action" href={p.permalink || '#'} target="_blank" rel="noopener noreferrer">
          {label}
        </a>
      );
    }
    const onClick = kind === 'edit' ? () => onOpen(p.pageId)
      : kind === 'trash' ? () => trash(p)
      : kind === 'restore' ? () => restore(p)
      : () => { setAskFor(p); setAskText(''); };
    return (
      <button
        key={kind}
        type="button"
        className={`wpp-action${kind === 'trash' ? ' wpp-action-bad' : ''}`}
        disabled={busy}
        onClick={onClick}
      >
        {label}
      </button>
    );
  };

  /** The bulk bar and the pagination, which WordPress prints above AND below. */
  const tablenav = (where: 'top' | 'bottom') => (
    <div className="wpp-tablenav">
      <div className="wpp-bulk">
        <label className="wpp-sr" htmlFor={`wpp-bulk-${where}`}>What to do with the pages you ticked</label>
        <select
          id={`wpp-bulk-${where}`}
          value={bulk}
          onChange={(e) => setBulk(e.target.value)}
          style={{ ...smallButton, padding: '8px 10px' }}
        >
          {bulkActions(view).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <button
          type="button"
          style={{ ...smallButton }}
          disabled={busy || !bulk || ticked.length === 0}
          onClick={applyBulk}
        >
          Apply
        </button>
      </div>
      <div className="wpp-pagination">
        <span className="wpp-count">{screen.total} item{screen.total === 1 ? '' : 's'}</span>
        {screen.pages > 1 && (
          <>
            <button type="button" style={smallButton} disabled={screen.page === 1} aria-label="First page"
                    onClick={() => setPageNo(1)}>«</button>
            <button type="button" style={smallButton} disabled={screen.page === 1} aria-label="Previous page"
                    onClick={() => setPageNo(screen.page - 1)}>‹</button>
            <span className="wpp-count">{screen.page} of {screen.pages}</span>
            <button type="button" style={smallButton} disabled={screen.page === screen.pages} aria-label="Next page"
                    onClick={() => setPageNo(screen.page + 1)}>›</button>
            <button type="button" style={smallButton} disabled={screen.page === screen.pages} aria-label="Last page"
                    onClick={() => setPageNo(screen.pages)}>»</button>
          </>
        )}
      </div>
    </div>
  );

  if (loading && pages.length === 0) return <Loading message="Reading the pages on your website…" />;
  if (loadError) {
    return (
      <Card title="Pages">
        <ErrorBanner message={loadError} />
        <button type="button" style={smallButton} onClick={refetch}>Try again</button>
      </Card>
    );
  }

  return (
    <div className="wpp">
      {error && <Banner tone="bad" onClose={() => setError(null)}>{error}</Banner>}
      {asked && (
        <Banner tone="good" onClose={() => setAsked(null)}>
          Request sent about “{asked}”. You can follow it under Website → Support.
        </Banner>
      )}
      {note && <Banner tone="good" onClose={() => setNote(null)}>{note}</Banner>}

      <div className="wpp-head">
        <h1 className="wpp-title">Pages</h1>
        <button
          type="button" className="abtn abtn-sky" style={{ minHeight: 44 }}
          onClick={() => { setNewKind('page'); setCreating(true); }}
        >
          Add New Page
        </button>
        <button
          type="button" style={{ ...smallButton, minHeight: 44 }}
          onClick={() => { setNewKind('post'); setCreating(true); }}
        >
          Write a post
        </button>
        <span className="wpp-where">{selectedSite?.primaryDomain || 'your website'}</span>
      </div>

      {creating && (
        <div style={{
          border: '1px solid var(--border)', borderRadius: 10, padding: 12, margin: '12px 0',
          background: 'var(--surface-2, #F8FAFC)',
        }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }} htmlFor="new-page-title">
            What is the {newKind === 'post' ? 'post' : 'page'} called?
          </label>
          <input
            id="new-page-title"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="e.g. Garden offices"
            style={{
              width: '100%', fontSize: 16, padding: '10px 12px', borderRadius: 8,
              border: '1px solid var(--border)', minHeight: 44, boxSizing: 'border-box',
            }}
          />
          {/* §11.9 / D-146 — the grid of text cards that used to sit here is
              gone. One library, with a picture of every page, search and
              categories, shared with the proposal and email builders. */}
          {newKind === 'page' && (
            <div style={{ margin: '12px 0' }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Start from…</div>
              <div style={{
                display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10,
                border: '1px solid var(--border)', borderRadius: 8, padding: 10,
                background: 'var(--surface, #fff)',
              }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{chosenTemplate?.name || 'Choose a template'}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3, lineHeight: 1.35 }}>
                    {chosenTemplate
                      ? `${chosenTemplate.purpose} · ${chosenTemplate.kinds.length} section${chosenTemplate.kinds.length === 1 ? '' : 's'} · ${chosenTemplate.bestFor}`
                      : 'Every template opens filled in from your own business details.'}
                  </div>
                </div>
                <button type="button" style={{ ...smallButton, minHeight: 44 }} onClick={() => setBrowsing(true)}>
                  Browse templates
                </button>
              </div>
            </div>
          )}
          {browsing && (
            <TemplateLibrary
              open
              onClose={() => setBrowsing(false)}
              product="arion"
              eyebrow="ARION · Website"
              title="Start your page"
              subtitle="Every page opens as a draft, filled in from your own business details. Pick the one closest to what this page is for, then change anything in the builder."
              entries={pageLibrary}
              onPick={(id) => { setTemplate(id); setBrowsing(false); }}
            />
          )}
          <div style={{ fontSize: 11, color: 'var(--text-muted)', margin: '8px 0 10px' }}>
            It starts as a draft, filled in from your own business details, so nothing appears on your
            website until you publish it. Every section can be changed, moved or removed in the builder.
            {newKind === 'post' && ' You can set what it is filed under, and its picture, in its settings.'}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="abtn abtn-sky" style={{ minHeight: 44 }} disabled={busy || !newTitle.trim()} onClick={create}>
              {busy ? 'Creating…' : 'Create draft'}
            </button>
            <button type="button" style={smallButton} onClick={() => { setCreating(false); setNewTitle(''); }}>Cancel</button>
          </div>
        </div>
      )}

      <div className="wpp-bar">
        <ul className="wpp-status">
          {links.map((l, i) => (
            <li key={l.view}>
              <button
                type="button"
                className={`wpp-statuslink${view === l.view ? ' is-on' : ''}`}
                aria-current={view === l.view ? 'true' : undefined}
                onClick={() => go(l.view)}
              >
                {l.label} <span className="wpp-n">({l.count})</span>
              </button>
              {i < links.length - 1 && <span className="wpp-sep">|</span>}
            </li>
          ))}
        </ul>
        <form
          className="wpp-search"
          onSubmit={(e) => { e.preventDefault(); setSearch(typed); setPageNo(1); }}
        >
          <label className="wpp-sr" htmlFor="wpp-search">Search pages</label>
          <input
            id="wpp-search"
            type="search"
            value={typed}
            onChange={(e) => {
              setTyped(e.target.value);
              // An emptied box puts the whole list back without a second click,
              // which is what a person expects of a search box they cleared.
              if (e.target.value === '') { setSearch(''); setPageNo(1); }
            }}
            style={{
              fontSize: 14, padding: '8px 10px', borderRadius: 8,
              border: '1px solid var(--border)', minHeight: 44, minWidth: 180,
            }}
          />
          <button type="submit" style={{ ...smallButton, minHeight: 44 }}>Search pages</button>
        </form>
      </div>

      {tablenav('top')}

      <table className="data-table wpp-table">
        <thead>
          <tr>
            <th className="wpp-cb">
              <label className="wpp-sr" htmlFor="wpp-all">Tick every page on this screen</label>
              <input
                id="wpp-all"
                type="checkbox"
                checked={allTicked}
                onChange={(e) => setTicked(e.target.checked ? shown.map((p) => p.pageId) : [])}
              />
            </th>
            <th>Title</th>
            <th>Author</th>
            <th>Date</th>
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 ? (
            <tr>
              <td colSpan={4} style={{ color: 'var(--text-muted)', padding: '18px 8px' }}>
                {search
                  ? `Nothing on your website matches “${search}”.`
                  : view === 'trash'
                    ? 'The bin is empty.'
                    : 'We could not find any pages on this website yet.'}
              </td>
            </tr>
          ) : shown.map((p) => {
            const suffix = stateSuffix(p);
            const when = dateCell(p);
            return (
              <tr key={p.pageId} className="wpp-row">
                <td className="wpp-cb">
                  <label className="wpp-sr" htmlFor={`wpp-cb-${p.pageId}`}>Tick “{p.title || '(no title)'}”</label>
                  <input
                    id={`wpp-cb-${p.pageId}`}
                    type="checkbox"
                    checked={ticked.includes(p.pageId)}
                    onChange={(e) => setTicked((t) => (e.target.checked
                      ? [...t, p.pageId]
                      : t.filter((id) => id !== p.pageId)))}
                  />
                </td>
                <td>
                  <button
                    type="button"
                    className="wpp-rowtitle"
                    onClick={() => (p.status === 'trash' ? restore(p) : onOpen(p.pageId))}
                  >
                    {p.title || '(no title)'}
                  </button>
                  {suffix && <span className="wpp-state"> — {suffix}</span>}
                  <div className="wpp-actions">
                    {rowActions(p, view).map((k) => action(p, k))}
                  </div>
                </td>
                {/* The website's pages door does not say who wrote a page, so
                    this reads the way WordPress's own column reads when it does
                    not know either — a dash, never a name we invented. */}
                <td className="wpp-author">—</td>
                <td className="wpp-date">
                  <div className="wpp-datelabel">{when.label}</div>
                  <div>{when.when}</div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {tablenav('bottom')}

      {askFor && (
        <Card title={`Ask us to change “${askFor.title}”`} style={{ marginTop: 12 }}>
          <textarea
            rows={3}
            value={askText}
            onChange={(e) => setAskText(e.target.value)}
            placeholder='Describe the change — e.g. "Swap the phone number in the banner for 01000 960 118."'
            style={{
              width: '100%', fontSize: 16, padding: 10, borderRadius: 8,
              border: '1px solid var(--border)', resize: 'vertical', boxSizing: 'border-box',
            }}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button type="button" className="abtn abtn-sky" style={{ minHeight: 44 }} disabled={busy || !askText.trim()} onClick={askUs}>
              {busy ? 'Sending…' : 'Send it to us'}
            </button>
            <button type="button" style={smallButton} onClick={() => setAskFor(null)}>Cancel</button>
          </div>
        </Card>
      )}
    </div>
  );
}


/* ── the builder, hosted ───────────────────────────────────────────────── */

/**
 * Everything the WEBSITE adapter needs from arion-api, in one object.
 *
 * Built HERE rather than inside the builder so the builder never imports
 * `useArionContext` and can be driven by a fixture in a test. The media half
 * is the Portal's existing picker contract (`FieldContext`), unchanged — the
 * same library, the same upload, the same alt text and the same "where is
 * this picture used" the sheet this replaces had.
 */
function useWebsiteBuilderApi(): WebsiteBuilderApi | null {
  const { activeSiteId, arionApi } = useArionContext();
  const [bookingHref, setBookingHref] = useState('');

  useEffect(() => {
    if (!activeSiteId) return;
    arionApi.getSectionLibrary(activeSiteId)
      .then((r: any) => setBookingHref(String(r?.data?.bookingHref || '')))
      .catch(() => setBookingHref(''));
  }, [activeSiteId, arionApi]);

  return useMemo(() => {
    if (!activeSiteId) return null;
    const siteId = activeSiteId;

    const readFile = (file: File) => new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('That file could not be read.'));
      reader.onload = () => {
        const result = String(reader.result || '');
        const comma = result.indexOf(',');
        resolve(comma >= 0 ? result.slice(comma + 1) : result);
      };
      reader.readAsDataURL(file);
    });

    const field: FieldContext = {
      bookingHref,
      media: {
        list: async (params) => {
          const res: any = await arionApi.listSiteMedia(siteId, params);
          return res?.data || { items: [], page: 1, totalPages: 1, total: 0 };
        },
        upload: async (file: File) => {
          const res: any = await arionApi.uploadSiteMedia(siteId, {
            filename: file.name, contentType: file.type, dataBase64: await readFile(file),
          });
          return { url: res?.data?.url || '', attachmentId: res?.data?.attachmentId ?? null };
        },
        describe: async (attachmentId: number, alt: string) => {
          await arionApi.setSiteMediaAlt(siteId, attachmentId, alt);
        },
        usage: async (attachmentId: number) => {
          const res: any = await arionApi.getSiteMediaUsage(siteId, attachmentId);
          return res?.data || { usedOn: 0, pages: [] };
        },
        remove: async (attachmentId: number) => {
          await arionApi.deleteSiteMedia(siteId, attachmentId);
        },
        replace: async (attachmentId: number, file: File) => {
          const res: any = await arionApi.replaceSiteMedia(siteId, attachmentId, {
            dataBase64: await readFile(file),
          });
          return { url: res?.data?.url || '', usedOn: Number(res?.data?.usedOn || 0) };
        },
      },
    };

    const api: WebsiteBuilderApi = {
      getPage: (pageId: number) => arionApi.getSitePageSections(siteId, pageId),
      getCatalog: () => arionApi.getSectionLibrary(siteId),
      getPricing: () => arionApi.getSiteAiPricing(siteId),
      // D-23: THE price list. One call, already built for the pricing section's
      // "Use my current prices" — the services grid reads the same one.
      getPriceList: () => arionApi.getSitePricingCatalogue(siteId),
      buildSection: (kind: string, blueprintId?: string) => arionApi.buildSiteSection(siteId, kind, blueprintId),
      save: (pageId: number, body: any) => arionApi.saveSitePageSections(siteId, pageId, body),
      // D-05: "save without publishing" writes HERE, not to the website.
      saveDraft: (pageId: number, body: any) => arionApi.saveSitePageDraft(siteId, pageId, body),
      discardDraft: (pageId: number) => arionApi.discardSitePageDraft(siteId, pageId),
      preview: (pageId: number, body: any) => arionApi.previewSitePage(siteId, pageId, body),
      askSection: (pageId: number, body: any) => arionApi.aiEditSection(siteId, pageId, body),
      askPage: (pageId: number, body: any) => arionApi.aiEditPage(siteId, pageId, body),
      discardProposal: (id: string) => arionApi.discardSiteProposal(siteId, id),
      adoptPreview: (pageId: number, index: number) => arionApi.adoptSectionPreview(siteId, pageId, index),
      adopt: (pageId: number, index: number, body: any) => arionApi.adoptSection(siteId, pageId, index, body),
      undoAdoption: (pageId: number, adoptionId: string) => arionApi.undoSectionAdoption(siteId, pageId, adoptionId),
      getSettings: (pageId: number) => arionApi.getSitePageSettings(siteId, pageId),
      saveSettings: (pageId: number, params: any) => arionApi.saveSitePageSettings(siteId, pageId, params),
      getSeo: (pageId: number) => arionApi.getSitePageSeo(siteId, pageId),
      saveSeo: (pageId: number, params: any) => arionApi.saveSitePageSeo(siteId, pageId, params),
      trash: (pageId: number) => arionApi.trashSitePage(siteId, pageId),
      swapLook: (body: any) => arionApi.swapSectionLook(siteId, body),
      swapRoles: (body: any) => arionApi.swapSectionRoles(siteId, body),
      undoPage: (pageId: number) => arionApi.undoSitePage(siteId, pageId),
      field,
    };
    return api;
  }, [activeSiteId, arionApi, bookingHref]);
}

/* ── the route ─────────────────────────────────────────────────────────── */

export function WebsitePages() {
  const { selectedSite, loading } = useArionContext();
  const [params, setParams] = useSearchParams();
  const raw = params.get('pageId');
  const pageId = raw && /^\d+$/.test(raw) ? Number(raw) : null;
  const api = useWebsiteBuilderApi();
  const [saved, setSaved] = useState<string | null>(null);

  const open = (id: number) => {
    const next = new URLSearchParams(params);
    next.set('pageId', String(id));
    setParams(next, { replace: false });
  };
  const back = () => {
    const next = new URLSearchParams(params);
    next.delete('pageId');
    setParams(next, { replace: false });
  };

  if (loading) return <Loading />;
  if (!selectedSite) return <EmptyPanel message="No website selected." />;

  return (
    <>
      {saved && <Banner tone="good" onClose={() => setSaved(null)}>{saved}</Banner>}
      <PagesList onOpen={open} />
      {pageId != null && api && (
        <WebsiteBuilder
          key={pageId}
          pageId={pageId}
          api={api}
          onClose={back}
          onSaved={(m) => setSaved(m)}
        />
      )}
    </>
  );
}
