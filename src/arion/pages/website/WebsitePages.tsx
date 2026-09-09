import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, Loading, EmptyPanel, ErrorBanner } from '../../components/Ui';
import { useArionContext } from '../../useArionContext';
import { useArionData } from '../../useArionData';
import { SectionEditSheet } from '../../components/SectionEditSheet';
import { SectionPicker } from '../../components/SectionPicker';
import { AskArgusBox, DiffRows } from '../../components/AskArgus';
import { AdoptSectionSheet, AdoptReviewList } from '../../components/AdoptSectionSheet';
import { PageSettingsSheet } from '../../components/PageSettingsSheet';
import { SwapLookSheet } from '../../components/SwapLookSheet';
import { smallButton } from '../../components/SectionFieldInputs';
import type {
  ArionSitePage, SectionCatalogEntry, SectionDiffRow, SectionProposal, PageProposal, AiPricing,
  AdoptPreview, SitePageSettings, SitePageSeo,
} from '../../../lib/arionApi';
import type { FieldContext } from '../../components/SectionFieldInputs';
import {
  type EditorSection,
  toEditorSections, toSavePayload, isDirty, orderOf, moveSection,
  setSectionField, setSectionFields, setListItemField, setListItemFields,
  addListItem, removeListItem,
  setParagraph, addParagraph, removeParagraph, removeSection, appendSection,
  swapSectionLayout,
  sectionSummary, proposalIdsOf, applyProposal, applyPageProposal,
  insertProposedSection, acceptProposedSections, dropProposedSections,
  replaceAdoptedSection, customSectionRows, customSectionCount,
} from '../../utils/sectionListState';
import { splitPages } from '../../utils/siteBuilderCopy';

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
 * Shape: an ordered list of sections, not a canvas (decision W-1). Reorder by
 * dragging a row (or the up/down buttons, which are the ones that work on a
 * phone and with a keyboard); tap a row to edit its fields.
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
      const res: any = await arionApi.createSitePage(activeSiteId, {
        title: newTitle.trim(),
        sections: [{ kind: 'hero' }],
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
          <button type="button" className="abtn abtn-sky" style={{ minHeight: 44 }} onClick={() => setCreating(true)}>
            New page
          </button>
        }
      >
        {creating && (
          <div style={{
            border: '1px solid var(--border)', borderRadius: 10, padding: 12, marginBottom: 12,
            background: 'var(--surface-2, #F8FAFC)',
          }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }} htmlFor="new-page-title">
              What is the page called?
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
            <div style={{ fontSize: 11, color: 'var(--text-muted)', margin: '8px 0 10px' }}>
              It starts as a draft with one banner section, so nothing appears on your website until you publish it.
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="abtn abtn-sky" style={{ minHeight: 44 }} disabled={busy || !newTitle.trim()} onClick={create}>
                {busy ? 'Creating…' : 'Create draft'}
              </button>
              <button type="button" style={smallButton} onClick={() => { setCreating(false); setNewTitle(''); }}>Cancel</button>
            </div>
          </div>
        )}

        {live.length === 0 ? (
          <EmptyPanel message={
            drafts.length > 0
              ? 'Nothing is live on this website yet.'
              : 'We could not find any pages on this website yet.'
          } />
        ) : (
          <div>{live.map(row)}</div>
        )}
      </Card>

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

/* ── the section-list editor ───────────────────────────────────────────── */

function PageEditor({ pageId, onBack }: { pageId: number; onBack: () => void }) {
  const { activeSiteId, arionApi } = useArionContext();

  const [sections, setSections] = useState<EditorSection[]>([]);
  const [baseOrder, setBaseOrder] = useState<string[]>([]);
  const [detail, setDetail] = useState<any>(null);
  const [catalog, setCatalog] = useState<SectionCatalogEntry[]>([]);
  const [bookingHref, setBookingHref] = useState('');
  const [aiLocked, setAiLocked] = useState<string | null>(null);
  const [pricing, setPricing] = useState<AiPricing | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [openUid, setOpenUid] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [addingKind, setAddingKind] = useState<string | null>(null);
  // The WordPress preview link (D-ARION-B). A URL, not HTML: the site renders
  // the page with its own theme and its own Elementor, behind a one-hour key.
  const [preview, setPreview] = useState<{ url: string; expiresAt: string | null } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Array<{ field: string; message: string }>>([]);
  const [ok, setOk] = useState<string | null>(null);
  const [liveUrl, setLiveUrl] = useState<string | null>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [confirmPublish, setConfirmPublish] = useState(false);

  // ARGUS, per section and per page. Both hold at most one open suggestion:
  // a second one would mean two before/afters describing the same page.
  const [sectionProposal, setSectionProposal] = useState<SectionProposal | null>(null);
  const [sectionAiError, setSectionAiError] = useState<string | null>(null);
  const [pageProposal, setPageProposal] = useState<PageProposal | null>(null);
  const [pageAiError, setPageAiError] = useState<string | null>(null);
  const [pageAiOpen, setPageAiOpen] = useState(false);

  // Adoption (Phase 3). `adoptIndex` is the section being looked at, and the
  // preview it is showing. One at a time, deliberately — two before/afters
  // open at once would be two decisions about the same live page.
  const [adoptIndex, setAdoptIndex] = useState<number | null>(null);
  const [adoptPreview, setAdoptPreview] = useState<AdoptPreview | null>(null);
  const [adoptLoading, setAdoptLoading] = useState(false);
  const [adoptError, setAdoptError] = useState<string | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);

  /* Page settings + the three search fields (ARION pack 1). Loaded when the
     sheet is opened, not on every page open: they are two more round trips to
     the website and most visits to this screen are about the words. */
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<SitePageSettings | null>(null);
  const [seo, setSeo] = useState<SitePageSeo | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);

  /* "Change the look" — the same words in a different layout (D-ARION-F). */
  const [swapUid, setSwapUid] = useState<string | null>(null);
  const [swapBusy, setSwapBusy] = useState<string | null>(null);
  const [swapError, setSwapError] = useState<string | null>(null);

  /* What the WEBSITE says it can draw pages with. `active: false` and the editor
     stops offering Save, because that save would leave the page blank. */
  const [pageEngine, setPageEngine] = useState<{ known: boolean; active: boolean | null; reason: string | null } | null>(null);

  const load = useCallback(async () => {
    if (!activeSiteId) return;
    setLoading(true); setLoadError(null);
    try {
      const [page, lib, price]: any[] = await Promise.all([
        arionApi.getSitePageSections(activeSiteId, pageId),
        arionApi.getSectionLibrary(activeSiteId),
        // Best effort: a price we cannot read is a price we do not quote, and
        // the box still works — it just does not promise a number.
        arionApi.getSiteAiPricing(activeSiteId).catch(() => null),
      ]);
      const list = toEditorSections(page?.data?.sections || []);
      setSections(list);
      setBaseOrder(orderOf(list));
      setDetail(page?.data || null);
      setCatalog(lib?.data?.sections || []);
      setBookingHref(String(lib?.data?.bookingHref || ''));
      setAiLocked(lib?.data?.ai?.available === false ? (lib?.data?.ai?.reason || null) : null);
      setPricing(price?.data || null);
      setPageEngine(lib?.data?.pageEngine
        ? {
          known: !!lib.data.pageEngine.known,
          active: lib.data.pageEngine.active,
          reason: lib.data.pageEngine.reason || null,
        }
        : null);
    } catch (e: any) {
      setLoadError(messageFrom(e, 'We could not read that page from your website.'));
    } finally {
      setLoading(false);
    }
  }, [activeSiteId, pageId, arionApi]);

  useEffect(() => { load(); }, [load]);

  const dirty = useMemo(() => isDirty(sections, baseOrder), [sections, baseOrder]);

  /**
   * Leaving with work in the editor loses it — the editor holds unsaved
   * changes in memory on purpose (nothing reaches the website until Save).
   * On a phone the back gesture is one flick, so this is not a nicety.
   *
   * Two halves, because they catch different exits: `beforeunload` covers
   * closing the tab, reloading and following a link out; `leave()` below
   * covers "Back to pages", which never leaves the page at all.
   */
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const leave = useCallback(() => {
    if (dirty && !window.confirm(
      'You have changes here that are not on your website yet. Leave the page and lose them?',
    )) return;
    onBack();
  }, [dirty, onBack]);

  const openSection = sections.find((s) => s.uid === openUid) || null;
  const catalogFor = (kind: string | null) => catalog.find((c) => c.kind === kind) || null;
  const proposedCount = sections.filter((s) => s.isProposed).length;

  /**
   * Everything the inputs need from the website: its picture library, and
   * where "your booking page" points. Memoised so the edit sheet does not
   * re-mount its picker on every keystroke.
   */
  const fieldCtx: FieldContext = useMemo(() => ({
    bookingHref,
    media: {
      list: async (params) => {
        if (!activeSiteId) throw new Error('No website selected.');
        const res: any = await arionApi.listSiteMedia(activeSiteId, params);
        return res?.data || { items: [], page: 1, totalPages: 1, total: 0 };
      },
      upload: async (file: File) => {
        if (!activeSiteId) throw new Error('No website selected.');
        const dataBase64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onerror = () => reject(new Error('That file could not be read.'));
          reader.onload = () => {
            const result = String(reader.result || '');
            const comma = result.indexOf(',');
            resolve(comma >= 0 ? result.slice(comma + 1) : result);
          };
          reader.readAsDataURL(file);
        });
        const res: any = await arionApi.uploadSiteMedia(activeSiteId, {
          filename: file.name, contentType: file.type, dataBase64,
        });
        const url = res?.data?.url;
        // A 200 with no url is a FAILED upload wearing a success. Say so.
        if (!url) throw new Error('The picture uploaded but your website did not say where it went.');
        return { url, attachmentId: res?.data?.attachmentId ?? null };
      },
      describe: async (attachmentId: number, alt: string) => {
        if (!activeSiteId) throw new Error('No website selected.');
        await arionApi.setSiteMediaAlt(activeSiteId, attachmentId, alt);
      },
      // Looking after a picture, not only choosing one (ARION pack 1). Delete
      // is offered only when `usage` says nowhere; the website checks again on
      // the way in, because a client's screen can be minutes old.
      usage: async (attachmentId: number) => {
        if (!activeSiteId) throw new Error('No website selected.');
        const res: any = await arionApi.getSiteMediaUsage(activeSiteId, attachmentId);
        return res?.data;
      },
      remove: async (attachmentId: number) => {
        if (!activeSiteId) throw new Error('No website selected.');
        await arionApi.deleteSiteMedia(activeSiteId, attachmentId);
      },
      replace: async (attachmentId: number, file: File) => {
        if (!activeSiteId) throw new Error('No website selected.');
        const dataBase64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onerror = () => reject(new Error('That file could not be read.'));
          reader.onload = () => {
            const result = String(reader.result || '');
            const comma = result.indexOf(',');
            resolve(comma >= 0 ? result.slice(comma + 1) : result);
          };
          reader.readAsDataURL(file);
        });
        const res: any = await arionApi.replaceSiteMedia(activeSiteId, attachmentId, { dataBase64 });
        const url = res?.data?.url;
        if (!url) throw new Error('Your website took the picture but did not say where it went.');
        return { url, usedOn: Number(res?.data?.usedOn || 0) };
      },
    },
  }), [activeSiteId, arionApi, bookingHref]);

  /* ── Adoption (Phase 3) ────────────────────────────────────────────────
   * Three handlers and one rule between them: the website changes on
   * `doAdopt` and `undoAdoption`, and on nothing else. Opening the sheet
   * writes nothing, so it is safe to tap out of curiosity — which is exactly
   * what a client should be able to do before agreeing to have a piece of
   * their live page rebuilt.
   * ------------------------------------------------------------------- */

  const openAdopt = useCallback(async (index: number) => {
    if (!activeSiteId) return;
    setReviewOpen(false);
    setAdoptIndex(index);
    setAdoptPreview(null);
    setAdoptError(null);
    setAdoptLoading(true);
    try {
      const res: any = await arionApi.adoptSectionPreview(activeSiteId, pageId, index);
      setAdoptPreview(res?.data || null);
    } catch (e: any) {
      setAdoptError(messageFrom(e, 'We could not read that section from your website.'));
    } finally {
      setAdoptLoading(false);
    }
  }, [activeSiteId, pageId, arionApi]);

  const closeAdopt = useCallback(() => {
    setAdoptIndex(null);
    setAdoptPreview(null);
    setAdoptError(null);
  }, []);

  const doAdopt = useCallback(async (fixes: Record<string, string>) => {
    if (!activeSiteId || adoptIndex === null || !adoptPreview?.fingerprint) return;
    setBusy('adopt'); setAdoptError(null);
    try {
      const res: any = await arionApi.adoptSection(activeSiteId, pageId, adoptIndex, {
        fingerprint: adoptPreview.fingerprint,
        fixes,
      });
      const adopted = res?.data?.section;
      // A 200 with no section back is a failed adoption wearing a success.
      if (!adopted) throw new Error('Your website said it changed the section but did not say what to.');
      setSections((cur) => replaceAdoptedSection(cur, adoptIndex, adopted));
      setBaseOrder((cur) => cur); // the order did not change; only the row did
      setOk(`That section is yours to edit now. You can put it back the way it was for `
        + `${res?.data?.undoDays ?? 30} days.`);
      setError(null);
      closeAdopt();
    } catch (e: any) {
      setAdoptError(messageFrom(e, 'We could not take charge of that section, so it is exactly as it was.'));
    } finally {
      setBusy(null);
    }
  }, [activeSiteId, pageId, arionApi, adoptIndex, adoptPreview, closeAdopt]);

  const undoAdoption = useCallback(async (index: number, adoptionId: string) => {
    if (!activeSiteId) return;
    if (!window.confirm(
      'Put this section back exactly as it was built on the website? '
      + 'Anything you have changed on it since will go with it.',
    )) return;
    setBusy('undo-adopt'); setError(null);
    try {
      await arionApi.undoSectionAdoption(activeSiteId, pageId, adoptionId);
      setOk('That section is back the way it was built on your website.');
      // Re-read rather than patch: the section came back as somebody else's
      // Elementor markup and only the server can say what the row now is.
      await load();
    } catch (e: any) {
      setError(messageFrom(e, 'We could not put that section back, so nothing was changed.'));
    } finally {
      setBusy(null);
    }
  }, [activeSiteId, pageId, arionApi, load]);

  const customRows = useMemo(() => customSectionRows(sections), [sections]);
  const customCount = useMemo(() => customSectionCount(sections), [sections]);

  /* ── page settings, the three search fields, and deleting the page ──────
   * All three were wp-admin-only jobs. The sheet loads both reads at once when
   * it opens; each half saves on its own, because changing a page's address and
   * fixing a typo in its search description are different decisions.
   * -------------------------------------------------------------------- */

  const openSettings = useCallback(async () => {
    if (!activeSiteId) return;
    setSettingsOpen(true);
    setSettingsError(null);
    setSettingsLoading(true);
    try {
      const [st, sq]: any[] = await Promise.all([
        arionApi.getSitePageSettings(activeSiteId, pageId),
        arionApi.getSitePageSeo(activeSiteId, pageId),
      ]);
      setSettings(st?.data || null);
      setSeo(sq?.data || null);
    } catch (e: any) {
      setSettingsError(messageFrom(e, 'We could not read this page’s settings from your website.'));
    } finally {
      setSettingsLoading(false);
    }
  }, [activeSiteId, pageId, arionApi]);

  const saveSettings = useCallback(async (params: {
    slug?: string; template?: string; parentId?: number; makeHomePage?: boolean;
  }) => {
    if (!activeSiteId) return;
    setBusy('settings'); setSettingsError(null);
    try {
      const res: any = await arionApi.saveSitePageSettings(activeSiteId, pageId, params);
      const next: SitePageSettings | null = res?.data || null;
      // A 200 with nothing in it is a failed save wearing a success.
      if (!next) throw new Error('Your website said it saved that but did not say what to.');
      setSettings(next);
      setOk(params.makeHomePage
        ? 'This is your home page now.'
        : next.slugAdjusted
          ? `Saved. That address was taken, so your website used “${next.slug}”.`
          : 'Saved.');
      await load();
    } catch (e: any) {
      setSettingsError(messageFrom(e, 'Your website would not take that change. Nothing was saved.'));
    } finally {
      setBusy(null);
    }
  }, [activeSiteId, pageId, arionApi, load]);

  const saveSeo = useCallback(async (params: {
    title: string; description: string; focusKeyword: string;
  }) => {
    if (!activeSiteId) return;
    setBusy('seo'); setSettingsError(null);
    try {
      const res: any = await arionApi.saveSitePageSeo(activeSiteId, pageId, params);
      const next: SitePageSeo | null = res?.data || null;
      if (!next) throw new Error('Your website said it saved that but did not say what to.');
      setSeo(next);
      setOk(next.seoPluginActive
        ? 'Saved. Search engines will pick these up the next time they look.'
        : 'Saved on your website.');
    } catch (e: any) {
      setSettingsError(messageFrom(e, 'Your website would not take that change. Nothing was saved.'));
    } finally {
      setBusy(null);
    }
  }, [activeSiteId, pageId, arionApi]);

  const trashThisPage = useCallback(async () => {
    if (!activeSiteId) return;
    if (!window.confirm(
      'Delete this page? It comes off your website straight away and goes in your website’s bin, '
      + 'where you can put it back for 30 days.',
    )) return;
    setBusy('trash'); setSettingsError(null);
    try {
      await arionApi.trashSitePage(activeSiteId, pageId);
      setSettingsOpen(false);
      onBack();
    } catch (e: any) {
      setSettingsError(messageFrom(e, 'Your website would not delete that page. Nothing was changed.'));
    } finally {
      setBusy(null);
    }
  }, [activeSiteId, pageId, arionApi, onBack]);

  /* ── change the look, keeping the words (D-ARION-F) ─────────────────── */

  const doSwap = useCallback(async (blueprintId: string) => {
    if (!activeSiteId || !swapUid) return;
    const row = sections.find((x) => x.uid === swapUid);
    if (!row || !row.kind) return;
    setSwapBusy(blueprintId); setSwapError(null);
    try {
      const res: any = await arionApi.swapSectionLook(activeSiteId, {
        kind: row.kind,
        blueprintId,
        fields: row.fields || {},
      });
      const swapped = res?.data?.section;
      if (!swapped) throw new Error('We could not build that layout.');
      setSections((cur) => swapSectionLayout(cur, swapUid, swapped));
      const dropped: string[] = res?.data?.dropped || [];
      setOk(dropped.length
        ? `New layout in the editor. It has no place for ${dropped.length} `
          + `${dropped.length === 1 ? 'thing' : 'things'} that were on the old one, so `
          + `${dropped.length === 1 ? 'it is' : 'they are'} not on it. Save when you are happy.`
        : 'New layout in the editor, with your wording on it. Save when you are happy with it.');
      setSwapUid(null);
    } catch (e: any) {
      setSwapError(messageFrom(e, 'We could not change that section’s look. Nothing was changed.'));
    } finally {
      setSwapBusy(null);
    }
  }, [activeSiteId, arionApi, swapUid, sections]);

  const runPreview = async () => {
    if (!activeSiteId) return;
    setBusy('preview'); setError(null); setFieldErrors([]);
    try {
      const res: any = await arionApi.previewSitePage(activeSiteId, pageId, {
        sections: toSavePayload(sections),
        title: detail?.title,
      });
      const url = res?.data?.previewUrl;
      // A preview with no link is a failed preview wearing a success.
      if (!url) throw new Error('Your website built the preview but did not say where it is.');
      setPreview({ url, expiresAt: res?.data?.expiresAt || null });
    } catch (e: any) {
      setError(messageFrom(e, 'We could not build a preview just now.'));
    } finally {
      setBusy(null);
    }
  };

  const save = async (status?: string) => {
    if (!activeSiteId) return;
    setBusy('save'); setError(null); setFieldErrors([]); setOk(null); setLiveUrl(null);
    try {
      const res: any = await arionApi.saveSitePageSections(activeSiteId, pageId, {
        sections: toSavePayload(sections),
        status,
        proposalIds: proposalIdsOf(sections),
      });
      const written = res?.data?.sectionsWritten ?? sections.length;
      const nowLive = (res?.data?.status || status) === 'publish';
      setOk(
        (status === 'publish' ? 'Published. ' : status === 'draft' ? 'Saved as a draft. ' : 'Saved. ')
        + `${written} ${written === 1 ? 'section is' : 'sections are'} on your website now.`
        + (res?.data?.cachePurged === false ? ' Your website’s cache did not clear — give it a minute.' : ''),
      );
      // The live address, right where they published it — the single most
      // asked question after a publish is "where is it?".
      if (nowLive && res?.data?.permalink) setLiveUrl(res.data.permalink);
      setConfirmPublish(false);
      await load();
    } catch (e: any) {
      const rows = e?.body?.errors;
      if (Array.isArray(rows) && rows.length) setFieldErrors(rows);
      setError(messageFrom(e, 'Your website would not take that change. Nothing was saved.'));
    } finally {
      setBusy(null);
    }
  };

  const undo = async () => {
    if (!activeSiteId) return;
    setBusy('undo'); setError(null); setOk(null); setLiveUrl(null);
    try {
      const res: any = await arionApi.undoSitePage(activeSiteId, pageId);
      setOk(res?.data?.restoredFrom
        ? 'Put back the version from before your last save.'
        : 'Put the previous version back.');
      await load();
    } catch (e: any) {
      setError(messageFrom(e, 'We could not undo that.'));
    } finally {
      setBusy(null);
    }
  };

  const addSection = async (kind: string, blueprintId?: string) => {
    if (!activeSiteId) return;
    setAddingKind(blueprintId || kind); setError(null);
    try {
      // The server builds the section, filled from the business's own details,
      // and writes nothing. The editor never invents Elementor JSON, and the
      // new section only reaches the website on the next Save.
      const built: any = await arionApi.buildSiteSection(activeSiteId, kind, blueprintId);
      const node = built?.data?.section;
      if (!node) throw new Error('We could not build that section.');
      setSections((cur) => appendSection(cur, node));
      setPickerOpen(false);
    } catch (e: any) {
      setError(messageFrom(e, 'We could not add that section.'));
    } finally {
      setAddingKind(null);
    }
  };

  /* ── ARGUS, one section ──────────────────────────────────────────────── */

  const askSection = async (instruction: string) => {
    if (!activeSiteId || !openSection) return;
    setBusy('ai-section'); setSectionAiError(null);
    try {
      const res: any = await arionApi.aiEditSection(activeSiteId, pageId, {
        handle: openSection.handle || 'section',
        index: openSection.index,
        instruction,
        section: { fields: openSection.fields, node: openSection.node },
      });
      setSectionProposal(res?.data || null);
    } catch (e: any) {
      setSectionAiError(messageFrom(e, 'ARGUS AI could not answer just now. Nothing was changed.'));
    } finally {
      setBusy(null);
    }
  };

  const approveSection = () => {
    if (!openSection || !sectionProposal) return;
    setSections((cur) => applyProposal(cur, openSection.uid, sectionProposal.after, sectionProposal.proposal_id));
    setSectionProposal(null);
    setOk('The new wording is in the editor. Save when you are happy with it.');
  };

  const discardSection = async () => {
    const id = sectionProposal?.proposal_id;
    setSectionProposal(null);
    setSectionAiError(null);
    if (!activeSiteId || !id) return;
    // Recording the "no" is best effort: the suggestion is already off the
    // screen, and a failed audit write must not look like a failed discard.
    try { await arionApi.discardSiteProposal(activeSiteId, id); } catch { /* recorded next time */ }
  };

  /* ── ARGUS, the whole page ───────────────────────────────────────────── */

  const askPage = async (instruction: string) => {
    if (!activeSiteId) return;
    setBusy('ai-page'); setPageAiError(null);
    try {
      const res: any = await arionApi.aiEditPage(activeSiteId, pageId, {
        instruction,
        sections: toSavePayload(sections),
      });
      const proposal: PageProposal | null = res?.data || null;
      setPageProposal(proposal);
      // Suggested NEW sections go into the list straight away, marked, so the
      // client can see WHERE they would land. They are skipped by Save until
      // approved (sectionListState.toSavePayload).
      if (proposal?.additions?.length) {
        setSections((cur) => proposal.additions.reduce(
          (acc, add) => insertProposedSection(acc, add.section, add.afterIndex, proposal.proposal_id),
          cur,
        ));
      }
    } catch (e: any) {
      setPageAiError(messageFrom(e, 'ARGUS AI could not answer just now. Nothing was changed.'));
    } finally {
      setBusy(null);
    }
  };

  const approvePage = () => {
    if (!pageProposal) return;
    setSections((cur) => acceptProposedSections(
      applyPageProposal(cur, pageProposal.edits, pageProposal.proposal_id),
    ));
    setPageProposal(null);
    setPageAiOpen(false);
    setOk('The changes are in the editor. Save when you are happy with them.');
  };

  const discardPage = async () => {
    const id = pageProposal?.proposal_id;
    setSections((cur) => dropProposedSections(cur));
    setPageProposal(null);
    setPageAiError(null);
    if (!activeSiteId || !id) return;
    try { await arionApi.discardSiteProposal(activeSiteId, id); } catch { /* recorded next time */ }
  };

  if (loading) return <Loading message="Opening the page…" />;
  if (loadError) {
    return (
      <Card title="Edit page">
        <ErrorBanner message={loadError} />
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" style={smallButton} onClick={load}>Try again</button>
          <button type="button" style={smallButton} onClick={onBack}>Back to pages</button>
        </div>
      </Card>
    );
  }

  const isDraft = detail?.status === 'draft';
  const isLive = detail?.status === 'publish';
  // Only a website that TOLD us it cannot draw these pages stops the Save
  // button. "We could not ask" is a third answer and must not lock anybody out.
  const cannotPublish = !!pageEngine?.known && pageEngine.active === false;

  return (
    <div>
      {error && <Banner tone="bad" onClose={() => setError(null)}>{error}</Banner>}
      {fieldErrors.length > 0 && (
        <Banner tone="bad" onClose={() => setFieldErrors([])}>
          <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
            {fieldErrors.map((f, i) => <li key={i}>{f.message}</li>)}
          </ul>
        </Banner>
      )}
      {ok && (
        <Banner tone="good" onClose={() => { setOk(null); setLiveUrl(null); }}>
          {ok}
          {liveUrl && (
            <>
              {' '}
              <a href={liveUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', fontWeight: 700 }}>
                {liveUrl}
              </a>
            </>
          )}
        </Banner>
      )}

      {/* The website itself says it cannot draw pages built here. Saving would
          leave the page blank, so the editor says why instead of letting
          somebody type a page they cannot publish (D-ARION-E). */}
      {pageEngine?.known && pageEngine.active === false && (
        <Banner tone="bad">
          {pageEngine.reason
            || 'This website cannot show pages built here at the moment. Ask us and we will put it right.'}
        </Banner>
      )}

      <Card
        title={detail?.title || 'Page'}
        subtitle={
          isDraft
            ? 'This page is a draft — nobody can see it until you publish it.'
            : 'This page is live. Anything you publish here shows on your website straight away.'
        }
        action={
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" style={smallButton} onClick={openSettings}>Page settings</button>
            <button type="button" style={smallButton} onClick={leave}>Back to pages</button>
          </div>
        }
      >
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14, alignItems: 'center' }}>
          <StatusChip status={detail?.status || 'draft'} />
          {detail?.permalink && (
            <a href={detail.permalink} target="_blank" rel="noopener noreferrer"
               style={{ ...smallButton, display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>
              {isDraft ? 'Preview on the website' : 'Open on the website'}
            </a>
          )}
          {dirty && (
            <span style={{ fontSize: 12, color: '#92400E', fontWeight: 600 }}>Unsaved changes</span>
          )}
          {proposedCount > 0 && (
            <span style={{ fontSize: 12, color: '#1E40AF', fontWeight: 600 }}>
              {proposedCount} suggested {proposedCount === 1 ? 'section' : 'sections'} waiting for you
            </span>
          )}
        </div>

        {sections.length === 0 && <EmptyPanel message="This page has no sections yet. Add one below." />}

        {sections.map((s, i) => (
          <div
            key={s.uid}
            data-section-row={i}
            // `draggable` sits on the HANDLE, not on the row. With it on the
            // row, a press anywhere inside — including on the ↑ ↓ Edit Remove
            // buttons — can start a drag instead of a click, and the button
            // silently does nothing. Caught clicking through the real app.
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (dragFrom !== null) setSections((cur) => moveSection(cur, dragFrom, i));
              setDragFrom(null);
            }}
            style={{
              border: s.isProposed ? '1px dashed #60A5FA' : '1px solid var(--border)',
              borderRadius: 10, padding: 12, marginBottom: 10,
              background: s.isProposed ? '#EFF6FF' : s.editable ? 'var(--surface, #fff)' : 'var(--surface-2, #F8FAFC)',
              opacity: dragFrom === i ? 0.5 : 1,
              display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap',
            }}
          >
            {/* A mouse affordance, and only that. HTML5 drag-and-drop does
                not fire on touch at all, so `.ia-drag-handle` is hidden on a
                coarse pointer and the ↑ ↓ buttons ARE the reorder there — a
                handle that cannot work is a control that lies. */}
            <span
              className="ia-drag-handle"
              draggable={!s.isProposed}
              onDragStart={() => setDragFrom(i)}
              onDragEnd={() => setDragFrom(null)}
              aria-hidden="true"
              title="Drag to move"
              // Layout lives in `.ia-drag-handle`, NOT here: an inline
              // `display` would beat the stylesheet's `display: none` and the
              // handle would reappear on a touch screen. (It did.)
              style={{ color: 'var(--text-muted)', fontSize: 18 }}
            >
              ⠿
            </span>

            <div style={{ flex: '1 1 200px', minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>
                {s.label}
                {s.isProposed
                  ? <span style={{ fontWeight: 400, color: '#1E40AF' }}> · proposed</span>
                  : s.isNew && <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}> · new</span>}
              </div>
              <div style={{
                fontSize: 12, color: 'var(--text-muted)', marginTop: 2,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {sectionSummary(s)}
              </div>
              {s.isProposed && (
                <div style={{ fontSize: 11, color: '#1E40AF', marginTop: 4 }}>
                  Suggested by ARGUS AI. It is not on your website — decide below.
                </div>
              )}
              {!s.editable && !s.isProposed && (
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                  {s.reason === 'custom'
                    ? 'Built on the website itself. It stays exactly as it is when you save.'
                    : 'This one was built before the editor existed, so its wording cannot be changed here yet.'}
                  {' '}
                  {s.adoptable
                    ? `This looks like ${s.adoptKindLabel ? `a “${s.adoptKindLabel}” section` : 'one we know'} — you can make it editable.`
                    : (s.adoptReasonText || '')}
                </div>
              )}
              {/* A row that got here by adoption says so, and offers the way
                  back. Discovering afterwards that we rebuilt something is
                  exactly what this note exists to prevent. */}
              {s.editable && s.adoption && (
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                  Made editable{s.adoption.adoptedAt ? ` on ${whenText(s.adoption.adoptedAt)}` : ''}.
                  {s.adoption.canUndo ? (
                    <>
                      {' '}
                      <button
                        type="button"
                        onClick={() => undoAdoption(i, s.adoption!.adoptionId)}
                        disabled={busy === 'undo-adopt'}
                        style={{
                          background: 'none', border: 0, padding: 0, font: 'inherit',
                          color: 'var(--brand-sky, #0284C7)', textDecoration: 'underline', cursor: 'pointer',
                        }}
                      >
                        Undo adoption
                      </button>
                      {s.adoption.undoUntil ? ` (until ${whenText(s.adoption.undoUntil)})` : ''}
                    </>
                  ) : (
                    ' The window for putting it back the way it was has passed.'
                  )}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button
                type="button" aria-label={`Move ${s.label} up`} disabled={i === 0 || s.isProposed}
                style={{ ...smallButton, minWidth: 44 }}
                onClick={() => setSections((cur) => moveSection(cur, i, i - 1))}
              >↑</button>
              <button
                type="button" aria-label={`Move ${s.label} down`} disabled={i === sections.length - 1 || s.isProposed}
                style={{ ...smallButton, minWidth: 44 }}
                onClick={() => setSections((cur) => moveSection(cur, i, i + 1))}
              >↓</button>
              {!s.editable && !s.isProposed && s.adoptable ? (
                <button
                  type="button"
                  className="abtn abtn-sky"
                  style={{ minHeight: 44 }}
                  onClick={() => openAdopt(i)}
                >
                  Make it editable
                </button>
              ) : (
                <button
                  type="button" className={s.editable && !s.isProposed ? 'abtn abtn-sky' : undefined}
                  style={s.editable && !s.isProposed ? { minHeight: 44 } : smallButton}
                  disabled={!s.editable || s.isProposed}
                  title={!s.editable && !s.isProposed ? (s.adoptReasonText || undefined) : undefined}
                  onClick={() => { setSectionProposal(null); setSectionAiError(null); setOpenUid(s.uid); }}
                >
                  Edit
                </button>
              )}
              {/* The same words, a different layout. Only where there are other
                  layouts to move to, so the button never opens an empty list. */}
              {s.editable && !s.isProposed && (catalogFor(s.kind)?.variants?.length || 0) > 0 && (
                <button
                  type="button" style={smallButton}
                  onClick={() => { setSwapError(null); setSwapUid(s.uid); }}
                >
                  Change the look
                </button>
              )}
              <button
                type="button" style={smallButton} disabled={s.isProposed}
                onClick={() => {
                  if (window.confirm(`Remove the ${s.label.toLowerCase()} section? You can put it back with Undo after you save.`)) {
                    setSections((cur) => removeSection(cur, s.uid));
                  }
                }}
              >
                Remove
              </button>
            </div>
          </div>
        ))}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
          <button type="button" style={smallButton} onClick={() => setPickerOpen(true)}>
            Add a section
          </button>
          {customCount > 0 && (
            <button type="button" style={smallButton} onClick={() => setReviewOpen(true)}>
              Review sections built on the site ({customCount})
            </button>
          )}
          <button type="button" style={smallButton} onClick={() => setPageAiOpen((v) => !v)}>
            {pageAiOpen ? 'Hide ARGUS' : 'Ask ARGUS about this page'}
          </button>
        </div>

        {pageAiOpen && (
          <AskArgusBox
            strings={{
              title: 'Ask ARGUS to change this page',
              placeholder: 'e.g. “Make the tone warmer” or “Add a section about winter services.”',
              lockedReason: aiLocked,
            }}
            credits={pricing?.actions?.page?.credits ?? null}
            busy={busy === 'ai-page'}
            error={pageAiError}
            summary={pageProposal?.summary || null}
            diff={pageProposal ? pageProposal.edits.flatMap((e) => e.diff) as SectionDiffRow[] : null}
            onAsk={askPage}
            onApprove={approvePage}
            onDiscard={discardPage}
            extra={pageProposal && pageProposal.additions.length > 0 ? (
              <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px dashed var(--border)' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6 }}>
                  NEW SECTIONS
                </div>
                {pageProposal.additions.map((a, i) => (
                  <div key={i} style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{a.label}</div>
                    <DiffRows rows={a.diff} />
                  </div>
                ))}
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  They are shown in the list above marked “proposed”, and are not on your website.
                </div>
              </div>
            ) : undefined}
          />
        )}
      </Card>

      {/* Sticky action bar — reachable on a 375px screen without scrolling.
          `.ia-sticky-bar` clears the floating ARGUS button, which is fixed to
          the bottom-right corner and would otherwise sit on top of Undo, and
          the phone's home indicator underneath it. */}
      <div className="ia-sticky-bar" style={{
        zIndex: 5, marginTop: 12,
        background: 'var(--surface, #fff)', borderTop: '1px solid var(--border)',
        display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center',
      }}>
        <button type="button" style={smallButton} disabled={busy !== null} onClick={runPreview}>
          {busy === 'preview' ? 'Building…' : 'Preview'}
        </button>
        <button
          type="button" className="abtn abtn-sky" style={{ minHeight: 44 }}
          disabled={busy !== null || (!dirty && !isDraft) || cannotPublish}
          title={cannotPublish ? (pageEngine?.reason || undefined) : undefined}
          onClick={() => (isDraft ? save('draft') : setConfirmPublish(true))}
        >
          {busy === 'save' ? 'Saving…' : isDraft ? 'Save draft' : 'Save and publish'}
        </button>
        {isDraft && (
          <button type="button" className="abtn abtn-sky" style={{ minHeight: 44 }} disabled={busy !== null} onClick={() => setConfirmPublish(true)}>
            Publish
          </button>
        )}
        {isLive && (
          <button
            type="button" style={smallButton} disabled={busy !== null}
            title="Takes the page off your website. It keeps everything on it and you can publish it again."
            onClick={() => {
              if (window.confirm('Take this page off your website? It becomes a draft — nothing on it is lost, and you can publish it again whenever you like.')) {
                save('draft');
              }
            }}
          >
            Unpublish
          </button>
        )}
        <button
          type="button" style={smallButton}
          disabled={busy !== null || !detail?.canUndo}
          title={detail?.canUndo ? undefined : 'There is nothing to go back to yet.'}
          onClick={undo}
        >
          {busy === 'undo' ? 'Undoing…' : 'Undo last change'}
        </button>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          Preview never changes your website.
        </span>
      </div>

      {confirmPublish && (
        <div
          role="dialog" aria-modal="true" aria-label="Publish this page"
          style={{
            position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(15,23,42,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setConfirmPublish(false); }}
        >
          <div style={{
            background: 'var(--surface, #fff)', borderRadius: 12, padding: 18,
            width: '100%', maxWidth: 420,
          }}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>
              Publish “{detail?.title || 'this page'}”?
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 6 }}>
              {isDraft
                ? 'It goes onto your website straight away, where anybody can see it.'
                : 'Your changes go onto the live page straight away, where anybody can see them.'}
            </div>
            {proposedCount > 0 && (
              <div style={{ fontSize: 13, color: '#1E40AF', marginBottom: 6 }}>
                {proposedCount} suggested {proposedCount === 1 ? 'section is' : 'sections are'} still
                waiting for you and will NOT be published.
              </div>
            )}
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>
              You can put it back exactly as it was with Undo last change.
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button type="button" style={smallButton} onClick={() => setConfirmPublish(false)}>
                Not yet
              </button>
              <button
                type="button" className="abtn abtn-sky" style={{ minHeight: 44 }}
                disabled={busy !== null}
                onClick={() => save('publish')}
              >
                {busy === 'save' ? 'Publishing…' : 'Yes, publish it'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PREVIEW: your website renders it, so this is the real thing — your
          theme, your fonts, your colours (D-ARION-B). The link carries a
          one-hour key, so it opens without signing in to WordPress, and the
          page itself has not been touched. The button is always there in case
          the site refuses to be shown inside a frame. */}
      {preview !== null && (
        <div
          role="dialog" aria-modal="true" aria-label="Preview"
          style={{
            position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15,23,42,0.55)',
            display: 'flex', flexDirection: 'column',
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setPreview(null); }}
        >
          <div style={{
            background: 'var(--surface, #fff)', margin: 'auto', width: '100%', maxWidth: 1100,
            height: '92vh', display: 'flex', flexDirection: 'column', borderRadius: 12, overflow: 'hidden',
          }}>
            <div style={{
              padding: '12px 16px', borderBottom: '1px solid var(--border)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              gap: 12, flexWrap: 'wrap',
            }}>
              <div style={{ minWidth: 0 }}>
                <strong style={{ fontSize: 14 }}>Preview — nothing has been saved</strong>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  This is your website drawing the page, so it is exactly what publishing looks like.
                  Your live page has not changed.
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <a
                  className="abtn"
                  style={{ ...smallButton, display: 'inline-flex', alignItems: 'center', textDecoration: 'none', minHeight: 44 }}
                  href={preview.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open in a new tab
                </a>
                <button type="button" style={{ ...smallButton, minHeight: 44 }} onClick={() => setPreview(null)}>
                  Close
                </button>
              </div>
            </div>
            <iframe
              title="Page preview"
              src={preview.url}
              style={{ border: 0, flex: 1, width: '100%', background: '#fff' }}
            />
          </div>
        </div>
      )}

      {settingsOpen && (
        <PageSettingsSheet
          settings={settings}
          seo={seo}
          loading={settingsLoading}
          busy={busy === 'settings' || busy === 'seo' || busy === 'trash' ? busy : null}
          error={settingsError}
          onSaveSettings={saveSettings}
          onSaveSeo={saveSeo}
          onTrash={trashThisPage}
          onClose={() => { setSettingsOpen(false); setSettingsError(null); }}
        />
      )}

      {swapUid && (
        <SwapLookSheet
          sectionLabel={sections.find((x) => x.uid === swapUid)?.label || 'this section'}
          catalog={catalogFor(sections.find((x) => x.uid === swapUid)?.kind || null)}
          currentBlueprintId={sections.find((x) => x.uid === swapUid)?.blueprintId || null}
          busyBlueprint={swapBusy}
          error={swapError}
          onSwap={doSwap}
          onClose={() => { setSwapUid(null); setSwapError(null); }}
        />
      )}

      {pickerOpen && (
        <SectionPicker
          catalog={catalog}
          busyKind={addingKind}
          onAdd={addSection}
          onClose={() => setPickerOpen(false)}
        />
      )}

      {/* Adoption (Phase 3). The review list is a CHECKLIST — it opens one
          before/after at a time and never adopts anything itself. */}
      {reviewOpen && (
        <AdoptReviewList
          rows={customRows}
          onOpen={openAdopt}
          onClose={() => setReviewOpen(false)}
        />
      )}

      {adoptIndex !== null && (
        <AdoptSectionSheet
          sectionLabel={sections[adoptIndex]?.label || 'this section'}
          preview={adoptPreview}
          loading={adoptLoading}
          busy={busy === 'adopt'}
          error={adoptError}
          onAdopt={doAdopt}
          onClose={closeAdopt}
        />
      )}

      {openSection && (
        <SectionEditSheet
          section={openSection}
          catalog={catalogFor(openSection.kind)}
          ctx={fieldCtx}
          onClose={() => { setOpenUid(null); setSectionProposal(null); setSectionAiError(null); }}
          onField={(key, v) => setSections((cur) => setSectionField(cur, openSection.uid, key, v))}
          onFields={(patch) => setSections((cur) => setSectionFields(cur, openSection.uid, patch))}
          onListItem={(listKey, idx, key, v) => setSections((cur) => setListItemField(cur, openSection.uid, listKey, idx, key, v))}
          onListItemPatch={(listKey, idx, patch) => setSections((cur) => setListItemFields(cur, openSection.uid, listKey, idx, patch))}
          onListAdd={(listKey, blank) => setSections((cur) => addListItem(cur, openSection.uid, listKey, blank))}
          onListRemove={(listKey, idx) => setSections((cur) => removeListItem(cur, openSection.uid, listKey, idx))}
          onParagraph={(key, idx, v) => setSections((cur) => setParagraph(cur, openSection.uid, key, idx, v))}
          onParagraphAdd={(key) => setSections((cur) => addParagraph(cur, openSection.uid, key))}
          onParagraphRemove={(key, idx) => setSections((cur) => removeParagraph(cur, openSection.uid, key, idx))}
          ask={{
            lockedReason: aiLocked,
            credits: pricing?.actions?.section?.credits ?? null,
            busy: busy === 'ai-section',
            error: sectionAiError,
            summary: sectionProposal?.summary || null,
            diff: sectionProposal ? sectionProposal.diff : null,
            onAsk: askSection,
            onApprove: approveSection,
            onDiscard: discardSection,
          }}
        />
      )}
    </div>
  );
}

/* ── the route ─────────────────────────────────────────────────────────── */

export function WebsitePages() {
  const { selectedSite, loading } = useArionContext();
  const [params, setParams] = useSearchParams();
  const raw = params.get('pageId');
  const pageId = raw && /^\d+$/.test(raw) ? Number(raw) : null;

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

  return pageId ? <PageEditor pageId={pageId} onBack={back} /> : <PagesList onOpen={open} />;
}
