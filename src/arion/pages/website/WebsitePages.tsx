import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, Loading, EmptyPanel, ErrorBanner } from '../../components/Ui';
import { useArionContext } from '../../useArionContext';
import { useArionData } from '../../useArionData';
import { SectionEditSheet } from '../../components/SectionEditSheet';
import { SectionPicker } from '../../components/SectionPicker';
import { smallButton } from '../../components/SectionFieldInputs';
import type { ArionSitePage, SectionCatalogEntry } from '../../../lib/arionApi';
import {
  type EditorSection,
  toEditorSections, toSavePayload, isDirty, orderOf, moveSection,
  setSectionField, setListItemField, addListItem, removeListItem,
  setParagraph, addParagraph, removeParagraph, removeSection, appendSection,
  sectionSummary,
} from '../../utils/sectionListState';

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
 * Every ARION tier can use this (decision W-4). Nothing on this page spends
 * credits — the AI actions that will are Phase 1B.
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

  const { data, loading, error: loadError, refetch } = useArionData(
    () => (activeSiteId ? arionApi.listSitePages(activeSiteId) : Promise.resolve(null)),
    [activeSiteId],
  );
  const pages: ArionSitePage[] = (data as any)?.data?.pages || [];

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

      <Card
        title="Pages"
        subtitle={`Every page on ${selectedSite?.primaryDomain || 'your website'}, drafts included.`}
        action={
          <button type="button" className="abtn abtn-sky" style={{ minHeight: 40 }} onClick={() => setCreating(true)}>
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
              <button type="button" className="abtn abtn-sky" style={{ minHeight: 40 }} disabled={busy || !newTitle.trim()} onClick={create}>
                {busy ? 'Creating…' : 'Create draft'}
              </button>
              <button type="button" style={smallButton} onClick={() => { setCreating(false); setNewTitle(''); }}>Cancel</button>
            </div>
          </div>
        )}

        {pages.length === 0 ? (
          <EmptyPanel message="We could not find any pages on this website yet." />
        ) : (
          <div>
            {pages.map((p) => (
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
                      : 'Built on the website itself'}
                    {p.modified ? ` · last changed ${whenText(p.modified)}` : ''}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="abtn abtn-sky"
                    style={{ minHeight: 40 }}
                    disabled={p.editableSectionCount === 0}
                    title={p.editableSectionCount === 0
                      ? 'Every section on this page was built on the website itself, so there is nothing to edit here yet.'
                      : undefined}
                    onClick={() => onOpen(p.pageId)}
                  >
                    Edit
                  </button>
                  {p.permalink && (
                    <a
                      className="abtn"
                      style={{ ...smallButton, display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}
                      href={p.permalink}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Open
                    </a>
                  )}
                  <button type="button" style={smallButton} onClick={() => { setAskFor(p); setAskText(''); }}>
                    Ask us to change it
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

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
            <button type="button" className="abtn abtn-sky" style={{ minHeight: 40 }} disabled={busy || !askText.trim()} onClick={askUs}>
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
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [openUid, setOpenUid] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [addingKind, setAddingKind] = useState<string | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Array<{ field: string; message: string }>>([]);
  const [ok, setOk] = useState<string | null>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!activeSiteId) return;
    setLoading(true); setLoadError(null);
    try {
      const [page, lib]: any[] = await Promise.all([
        arionApi.getSitePageSections(activeSiteId, pageId),
        arionApi.getSectionLibrary(activeSiteId),
      ]);
      const list = toEditorSections(page?.data?.sections || []);
      setSections(list);
      setBaseOrder(orderOf(list));
      setDetail(page?.data || null);
      setCatalog(lib?.data?.sections || []);
    } catch (e: any) {
      setLoadError(messageFrom(e, 'We could not read that page from your website.'));
    } finally {
      setLoading(false);
    }
  }, [activeSiteId, pageId, arionApi]);

  useEffect(() => { load(); }, [load]);

  const dirty = useMemo(() => isDirty(sections, baseOrder), [sections, baseOrder]);
  const openSection = sections.find((s) => s.uid === openUid) || null;
  const catalogFor = (kind: string | null) => catalog.find((c) => c.kind === kind) || null;

  const upload = useCallback(async (file: File): Promise<string> => {
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
    if (!url) throw new Error('The picture uploaded but your website did not say where it went.');
    return url;
  }, [activeSiteId, arionApi]);

  const runPreview = async () => {
    if (!activeSiteId) return;
    setBusy('preview'); setError(null); setFieldErrors([]);
    try {
      const res: any = await arionApi.previewSitePage(activeSiteId, pageId, {
        sections: toSavePayload(sections),
        title: detail?.title,
      });
      setPreviewHtml(res?.data?.html || '');
    } catch (e: any) {
      setError(messageFrom(e, 'We could not build a preview just now.'));
    } finally {
      setBusy(null);
    }
  };

  const save = async (status?: string) => {
    if (!activeSiteId) return;
    setBusy('save'); setError(null); setFieldErrors([]); setOk(null);
    try {
      const res: any = await arionApi.saveSitePageSections(activeSiteId, pageId, {
        sections: toSavePayload(sections),
        status,
      });
      const written = res?.data?.sectionsWritten ?? sections.length;
      setOk(
        (status === 'publish' ? 'Published. ' : 'Saved. ')
        + `${written} ${written === 1 ? 'section is' : 'sections are'} on your website now.`
        + (res?.data?.cachePurged === false ? ' Your website’s cache did not clear — give it a minute.' : ''),
      );
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
    setBusy('undo'); setError(null); setOk(null);
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

  const addSection = async (kind: string) => {
    if (!activeSiteId) return;
    setAddingKind(kind); setError(null);
    try {
      // The server builds the section, filled from the business's own details,
      // and writes nothing. The editor never invents Elementor JSON, and the
      // new section only reaches the website on the next Save.
      const built: any = await arionApi.buildSiteSection(activeSiteId, kind);
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
      {ok && <Banner tone="good" onClose={() => setOk(null)}>{ok}</Banner>}

      <Card
        title={detail?.title || 'Page'}
        subtitle={
          isDraft
            ? 'This page is a draft — nobody can see it until you publish it.'
            : 'This page is live. Anything you publish here shows on your website straight away.'
        }
        action={<button type="button" style={smallButton} onClick={onBack}>Back to pages</button>}
      >
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14, alignItems: 'center' }}>
          <StatusChip status={detail?.status || 'draft'} />
          {detail?.permalink && (
            <a href={detail.permalink} target="_blank" rel="noopener noreferrer"
               style={{ ...smallButton, display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>
              Open on the website
            </a>
          )}
          {dirty && (
            <span style={{ fontSize: 12, color: '#92400E', fontWeight: 600 }}>Unsaved changes</span>
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
              border: '1px solid var(--border)', borderRadius: 10, padding: 12, marginBottom: 10,
              background: s.editable ? 'var(--surface, #fff)' : 'var(--surface-2, #F8FAFC)',
              opacity: dragFrom === i ? 0.5 : 1,
              display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap',
            }}
          >
            <span
              draggable
              onDragStart={() => setDragFrom(i)}
              onDragEnd={() => setDragFrom(null)}
              aria-hidden="true"
              title="Drag to move"
              style={{ cursor: 'grab', color: 'var(--text-muted)', fontSize: 18, lineHeight: 1, padding: '4px 2px' }}
            >
              ⠿
            </span>

            <div style={{ flex: '1 1 200px', minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>
                {s.label}
                {s.isNew && <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}> · new</span>}
              </div>
              <div style={{
                fontSize: 12, color: 'var(--text-muted)', marginTop: 2,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {sectionSummary(s)}
              </div>
              {!s.editable && (
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                  {s.reason === 'custom'
                    ? 'Built on the website itself. It stays exactly as it is when you save.'
                    : 'This one was built before the editor existed, so its wording cannot be changed here yet.'}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button
                type="button" aria-label={`Move ${s.label} up`} disabled={i === 0}
                style={{ ...smallButton, minWidth: 44 }}
                onClick={() => setSections((cur) => moveSection(cur, i, i - 1))}
              >↑</button>
              <button
                type="button" aria-label={`Move ${s.label} down`} disabled={i === sections.length - 1}
                style={{ ...smallButton, minWidth: 44 }}
                onClick={() => setSections((cur) => moveSection(cur, i, i + 1))}
              >↓</button>
              <button
                type="button" className={s.editable ? 'abtn abtn-sky' : undefined}
                style={s.editable ? { minHeight: 40 } : smallButton}
                disabled={!s.editable}
                onClick={() => setOpenUid(s.uid)}
              >
                Edit
              </button>
              <button
                type="button" style={smallButton}
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

        <button type="button" style={{ ...smallButton, marginTop: 4 }} onClick={() => setPickerOpen(true)}>
          Add a section
        </button>
      </Card>

      {/* Sticky action bar — reachable on a 375px screen without scrolling.
          The right padding clears the floating ARGUS button, which is fixed to
          the bottom-right corner and would otherwise sit on top of Undo. */}
      <div style={{
        position: 'sticky', bottom: 0, zIndex: 5, marginTop: 12,
        background: 'var(--surface, #fff)', borderTop: '1px solid var(--border)',
        padding: '10px 76px 10px 12px', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center',
      }}>
        <button type="button" style={{ ...smallButton, minHeight: 44 }} disabled={busy !== null} onClick={runPreview}>
          {busy === 'preview' ? 'Building…' : 'Preview'}
        </button>
        <button
          type="button" className="abtn abtn-sky" style={{ minHeight: 44 }}
          disabled={busy !== null || (!dirty && !isDraft)}
          onClick={() => save(isDraft ? 'draft' : undefined)}
        >
          {busy === 'save' ? 'Saving…' : isDraft ? 'Save draft' : 'Save and publish'}
        </button>
        {isDraft && (
          <button type="button" className="abtn abtn-sky" style={{ minHeight: 44 }} disabled={busy !== null} onClick={() => save('publish')}>
            Publish
          </button>
        )}
        <button
          type="button" style={{ ...smallButton, minHeight: 44 }}
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

      {previewHtml !== null && (
        <div
          role="dialog" aria-modal="true" aria-label="Preview"
          style={{
            position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15,23,42,0.55)',
            display: 'flex', flexDirection: 'column',
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setPreviewHtml(null); }}
        >
          <div style={{
            background: 'var(--surface, #fff)', margin: 'auto', width: '100%', maxWidth: 960,
            height: '92vh', display: 'flex', flexDirection: 'column', borderRadius: 12, overflow: 'hidden',
          }}>
            <div style={{
              padding: '12px 16px', borderBottom: '1px solid var(--border)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <strong style={{ fontSize: 14 }}>Preview — nothing has been saved</strong>
              <button type="button" style={smallButton} onClick={() => setPreviewHtml(null)}>Close</button>
            </div>
            <iframe
              title="Page preview"
              sandbox=""
              srcDoc={previewHtml}
              style={{ border: 0, flex: 1, width: '100%', background: '#fff' }}
            />
          </div>
        </div>
      )}

      {pickerOpen && (
        <SectionPicker
          catalog={catalog}
          busyKind={addingKind}
          onAdd={addSection}
          onClose={() => setPickerOpen(false)}
        />
      )}

      {openSection && (
        <SectionEditSheet
          section={openSection}
          catalog={catalogFor(openSection.kind)}
          onClose={() => setOpenUid(null)}
          onField={(key, v) => setSections((cur) => setSectionField(cur, openSection.uid, key, v))}
          onListItem={(listKey, idx, key, v) => setSections((cur) => setListItemField(cur, openSection.uid, listKey, idx, key, v))}
          onListAdd={(listKey, blank) => setSections((cur) => addListItem(cur, openSection.uid, listKey, blank))}
          onListRemove={(listKey, idx) => setSections((cur) => removeListItem(cur, openSection.uid, listKey, idx))}
          onParagraph={(key, idx, v) => setSections((cur) => setParagraph(cur, openSection.uid, key, idx, v))}
          onParagraphAdd={(key) => setSections((cur) => addParagraph(cur, openSection.uid, key))}
          onParagraphRemove={(key, idx) => setSections((cur) => removeParagraph(cur, openSection.uid, key, idx))}
          onUpload={upload}
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
