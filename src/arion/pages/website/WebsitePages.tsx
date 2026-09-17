import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, Loading, EmptyPanel, ErrorBanner } from '../../components/Ui';
import { useArionContext } from '../../useArionContext';
import { useArionData } from '../../useArionData';
import { smallButton } from '../../components/SectionFieldInputs';
import type { ArionSitePage } from '../../../lib/arionApi';
import type { FieldContext } from '../../components/SectionFieldInputs';
import { splitPages } from '../../utils/siteBuilderCopy';
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
 *   the list of pages, and the section-list editor for one page.
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

const STATUS_LABEL: Record<string, string> = {
  publish: 'Live', draft: 'Draft', pending: 'Waiting for review',
  future: 'Scheduled', private: 'Private',
};
const STATUS_TONE: Record<string, { bg: string; fg: string }> = {
  publish: { bg: '#DCFCE7', fg: '#166534' },
  draft:   { bg: '#FEF3C7', fg: '#92400E' },
  pending: { bg: '#DBEAFE', fg: '#1E40AF' },
  future:  { bg: '#DBEAFE', fg: '#1E40AF' },
  private: { bg: '#F1F5F9', fg: '#475569' },
};

function StatusChip({ status }: { status: string }) {
  const tone = STATUS_TONE[status] || STATUS_TONE.private;
  return (
    <span style={{
      background: tone.bg, color: tone.fg, borderRadius: 999, padding: '2px 10px',
      fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap',
    }}>
      {STATUS_LABEL[status] || status}
    </span>
  );
}

function whenText(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

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

/* ── the list of pages ─────────────────────────────────────────────────── */

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
  const [restored, setRestored] = useState<string | null>(null);

  const { data, loading, error: loadError, refetch } = useArionData(
    () => (activeSiteId ? arionApi.listSitePages(activeSiteId) : Promise.resolve(null)),
    [activeSiteId],
  );
  const pages: ArionSitePage[] = (data as any)?.data?.pages || [];
  const { drafts, live, deleted } = useMemo(() => splitPages(pages), [pages]);
  // Blog posts are their own list. A post is not a page: it is dated writing
  // that appears in a blog list, and mixing the two makes a client hunt for
  // the difference in a chip (ARION pack 2, D-ARION-C).
  const livePages = useMemo(() => live.filter((p) => p.type !== 'post'), [live]);
  const livePosts = useMemo(() => live.filter((p) => p.type === 'post'), [live]);

  const restore = async (p: ArionSitePage) => {
    if (!activeSiteId) return;
    setBusy(true); setError(null);
    try {
      await arionApi.restoreSitePage(activeSiteId, p.pageId);
      setRestored(p.title || 'That page');
      refetch();
    } catch (e: any) {
      setError(messageFrom(e, 'We could not bring that page back.'));
    } finally {
      setBusy(false);
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

  const row = (p: ArionSitePage) => (
    <div
      key={p.pageId}
      style={{
        borderTop: '1px solid var(--border)', padding: '14px 0',
        display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between',
      }}
    >
      <div style={{ minWidth: 220, flex: '1 1 240px' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>{p.title || '(no title)'}</span>
          <StatusChip status={p.status} />
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
          {p.type === 'post' ? 'Blog post · ' : ''}
          {p.editableSectionCount > 0
            ? `${p.editableSectionCount} of ${p.sectionCount} sections you can edit here`
            : (p.adoptCandidateCount || 0) > 0
              ? `Built on the website itself · up to ${p.adoptCandidateCount} of ${p.sectionCount} `
                + 'may be editable here'
              : 'Built on the website itself'}
          {p.modified ? ` · last changed ${whenText(p.modified)}` : ''}
        </div>
        {p.status === 'publish' && p.permalink && (
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, wordBreak: 'break-all' }}>
            {p.permalink}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          type="button"
          className="abtn abtn-sky"
          style={{ minHeight: 44 }}
          // A page with NOTHING editable but something that could be still
          // opens — that is precisely the page whose owner most needs the
          // review, and disabling it locked them out of Phase 3 entirely.
          disabled={p.editableSectionCount === 0 && (p.adoptCandidateCount || 0) === 0}
          title={p.editableSectionCount === 0 && (p.adoptCandidateCount || 0) === 0
            ? 'Every section on this page was built on the website itself and none of them can be '
              + 'made editable here, so there is nothing to change. Use “Ask us to change it”.'
            : undefined}
          onClick={() => onOpen(p.pageId)}
        >
          {p.editableSectionCount === 0 && (p.adoptCandidateCount || 0) > 0 ? 'Review' : 'Edit'}
        </button>
        {p.permalink && (
          <a
            className="abtn"
            style={{ ...smallButton, display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}
            href={p.permalink}
            target="_blank"
            rel="noopener noreferrer"
          >
            {p.status === 'draft' ? 'Preview' : 'Open'}
          </a>
        )}
        <button type="button" style={smallButton} onClick={() => { setAskFor(p); setAskText(''); }}>
          Ask us to change it
        </button>
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
    <div>
      {error && <Banner tone="bad" onClose={() => setError(null)}>{error}</Banner>}
      {asked && (
        <Banner tone="good" onClose={() => setAsked(null)}>
          Request sent about “{asked}”. You can follow it under Website → Support.
        </Banner>
      )}
      {restored && (
        <Banner tone="good" onClose={() => setRestored(null)}>
          “{restored}” is back, as a draft. Publish it when you are ready.
        </Banner>
      )}

      {drafts.length > 0 && (
        <Card
          title="Drafts"
          subtitle="Nobody can see these until you publish them."
          style={{ marginBottom: 12 }}
        >
          {drafts.map(row)}
        </Card>
      )}

      <Card
        title={drafts.length > 0 ? 'Live pages' : 'Pages'}
        subtitle={
          drafts.length > 0
            ? `On ${selectedSite?.primaryDomain || 'your website'} right now.`
            : `Every page on ${selectedSite?.primaryDomain || 'your website'}, drafts included.`
        }
        action={
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button" className="abtn abtn-sky" style={{ minHeight: 44 }}
              onClick={() => { setNewKind('page'); setCreating(true); }}
            >
              New page
            </button>
            <button
              type="button" style={{ ...smallButton, minHeight: 44 }}
              onClick={() => { setNewKind('post'); setCreating(true); }}
            >
              Write a post
            </button>
          </div>
        }
      >
        {creating && (
          <div style={{
            border: '1px solid var(--border)', borderRadius: 10, padding: 12, marginBottom: 12,
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

        {livePages.length === 0 ? (
          <EmptyPanel message={
            drafts.length > 0
              ? 'Nothing is live on this website yet.'
              : 'We could not find any pages on this website yet.'
          } />
        ) : (
          <div>{livePages.map(row)}</div>
        )}
      </Card>

      {livePosts.length > 0 && (
        <Card
          title="Blog posts"
          subtitle="Written here, in the same editor as your pages."
          style={{ marginTop: 12 }}
        >
          {livePosts.map(row)}
        </Card>
      )}

      {deleted.length > 0 && (
        <Card
          title="Deleted pages"
          subtitle="Your website keeps these for 30 days. Nobody can see them."
          style={{ marginTop: 12 }}
        >
          {deleted.map((p) => (
            <div key={p.pageId} style={{
              borderTop: '1px solid var(--border)', padding: '14px 0',
              display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center',
              justifyContent: 'space-between',
            }}>
              <div style={{ minWidth: 220, flex: '1 1 240px' }}>
                <span style={{ fontSize: 14, fontWeight: 600 }}>{p.title || '(no title)'}</span>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                  Deleted{p.modified ? ` · ${whenText(p.modified)}` : ''}
                </div>
              </div>
              <button
                type="button" style={{ ...smallButton, minHeight: 44 }}
                disabled={busy} onClick={() => restore(p)}
              >
                Put it back
              </button>
            </div>
          ))}
        </Card>
      )}

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
