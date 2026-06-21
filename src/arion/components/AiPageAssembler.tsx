import React, { useEffect, useState } from 'react';
import { useArionContext } from '../useArionContext';
import { IadmModal } from '../../components/IadmModal';
import type { AiBlockDraft } from '../../lib/arionApi';

/**
 * AiPageAssembler — F-AI-WB Phase 1 (2026-06-20)
 *
 * Drawer to assemble accepted block drafts into one Elementor page and
 * inject into the connected WP site via the page-assembler backend.
 *
 *   1. Lists all accepted drafts for the active site
 *      (GET /arion/sites/:siteId/blocks?accepted=1).
 *   2. Lets the admin drag-reorder the list. Native HTML5 drag/drop;
 *      avoiding pulling in @dnd-kit for one screen.
 *   3. Optional target page_id; blank = create new page.
 *   4. Assemble → POST /arion/sites/:siteId/blocks/assemble — returns
 *      edit_url, opens in Elementor.
 *
 * Tier-gating is handled by the host page. Component assumes Pro+.
 */

interface AssembleResult {
  pageId: string | number;
  edit_url: string;
  blocksInjected: number;
}

const KIND_LABEL: Record<string, string> = {
  hero: 'Hero',
  services: 'Services',
  testimonials: 'Testimonials',
  cta: 'Call to Action',
  about: 'About',
  faq: 'FAQ',
  gallery: 'Gallery',
  contact: 'Contact',
};

export function AiPageAssembler({
  open,
  onClose,
  /** Optional refresh trigger — bumped by parent when a new draft is accepted. */
  refreshKey,
}: {
  open: boolean;
  onClose: () => void;
  refreshKey?: number;
}) {
  const { arionApi, activeSiteId } = useArionContext();

  const [drafts, setDrafts] = useState<AiBlockDraft[]>([]);
  const [loadingDrafts, setLoadingDrafts] = useState(false);
  const [draftsError, setDraftsError] = useState<string | null>(null);

  const [pageIdInput, setPageIdInput] = useState('');
  const [assembling, setAssembling] = useState(false);
  const [assembleError, setAssembleError] = useState<string | null>(null);
  const [result, setResult] = useState<AssembleResult | null>(null);

  // Local ordered list of draft IDs the user has arranged.
  const [orderedIds, setOrderedIds] = useState<string[]>([]);
  const [dragId, setDragId] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      void loadDrafts();
      setResult(null);
      setAssembleError(null);
      setPageIdInput('');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, refreshKey, activeSiteId]);

  async function loadDrafts() {
    if (!activeSiteId) return;
    setLoadingDrafts(true);
    setDraftsError(null);
    try {
      const res = await arionApi.listDrafts(activeSiteId, { accepted: true });
      const list = (res as any)?.data || [];
      setDrafts(list);
      // Default order: created_at ascending so older drafts appear first.
      const ids = [...list]
        .sort((a: AiBlockDraft, b: AiBlockDraft) => (a.created_at || '').localeCompare(b.created_at || ''))
        .map((d: AiBlockDraft) => d.draft_block_id);
      setOrderedIds(ids);
    } catch (err: any) {
      setDraftsError(err?.message || 'Failed to load accepted drafts.');
    } finally {
      setLoadingDrafts(false);
    }
  }

  function onDragStart(id: string) { setDragId(id); }
  function onDragOver(e: React.DragEvent) { e.preventDefault(); }
  function onDropOn(targetId: string) {
    if (!dragId || dragId === targetId) return;
    setOrderedIds((prev) => {
      const next = prev.filter((id) => id !== dragId);
      const idx = next.indexOf(targetId);
      next.splice(idx, 0, dragId);
      return next;
    });
    setDragId(null);
  }

  function moveUp(id: string) {
    setOrderedIds((prev) => {
      const idx = prev.indexOf(id);
      if (idx <= 0) return prev;
      const next = [...prev];
      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      return next;
    });
  }
  function moveDown(id: string) {
    setOrderedIds((prev) => {
      const idx = prev.indexOf(id);
      if (idx < 0 || idx >= prev.length - 1) return prev;
      const next = [...prev];
      [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
      return next;
    });
  }
  function removeFromOrder(id: string) {
    setOrderedIds((prev) => prev.filter((d) => d !== id));
  }

  async function runAssemble() {
    if (!activeSiteId || orderedIds.length === 0) return;
    setAssembling(true);
    setAssembleError(null);
    setResult(null);
    try {
      const res = await arionApi.assemblePage(activeSiteId, {
        pageId: pageIdInput.trim() ? pageIdInput.trim() : null,
        draftBlockIds: orderedIds,
      });
      setResult(res as AssembleResult);
    } catch (err: any) {
      setAssembleError(err?.message || 'Page assembly failed.');
    } finally {
      setAssembling(false);
    }
  }

  const draftById = new Map(drafts.map((d) => [d.draft_block_id, d]));
  const orderedDrafts = orderedIds
    .map((id) => draftById.get(id))
    .filter((d): d is AiBlockDraft => Boolean(d));

  return (
    <IadmModal
      open={open}
      onClose={onClose}
      product="arion"
      eyebrow="ARION · IL"
      title="Assemble accepted blocks"
      subtitle={
        result
          ? 'Page assembled — review in Elementor'
          : 'Order the accepted drafts, pick a target page, publish to WordPress'
      }
      size="report"
      footer={renderFooter()}
    >
      <div style={{ padding: '20px 24px' }}>
        {draftsError && (
          <ErrorBox message={draftsError} />
        )}
        {assembleError && (
          <ErrorBox message={assembleError} />
        )}

        {result ? (
          <ResultPanel result={result} />
        ) : (
          <>
            <Section title="1. Accepted drafts" subtitle="Drag to reorder. Remove items you don't want in this page.">
              {loadingDrafts ? (
                <div style={{ padding: 14, color: '#5A7A8A', fontSize: 12 }}>Loading drafts...</div>
              ) : orderedDrafts.length === 0 ? (
                <div style={{
                  padding: 14, color: '#5A7A8A', fontSize: 12,
                  background: '#F8FAFC', borderRadius: 6, border: '1px dashed #CBD5E1',
                }}>
                  No accepted drafts yet. Use the Block Generator to create
                  blocks and click Accept on each one you want in the page.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {orderedDrafts.map((d, idx) => (
                    <DraftRow
                      key={d.draft_block_id}
                      draft={d}
                      index={idx}
                      isFirst={idx === 0}
                      isLast={idx === orderedDrafts.length - 1}
                      onDragStart={() => onDragStart(d.draft_block_id)}
                      onDragOver={onDragOver}
                      onDrop={() => onDropOn(d.draft_block_id)}
                      onMoveUp={() => moveUp(d.draft_block_id)}
                      onMoveDown={() => moveDown(d.draft_block_id)}
                      onRemove={() => removeFromOrder(d.draft_block_id)}
                      isDragging={dragId === d.draft_block_id}
                    />
                  ))}
                </div>
              )}
            </Section>

            <Section title="2. Target page" subtitle="Leave blank to create a new page. Enter a WP page_id to replace its content.">
              <input
                type="text"
                placeholder="e.g. 42 — or leave blank"
                value={pageIdInput}
                onChange={(e) => setPageIdInput(e.target.value)}
                style={{
                  width: 280, boxSizing: 'border-box',
                  border: '1px solid #CBD5E1', borderRadius: 4,
                  padding: '8px 10px', fontSize: 12, background: '#fff',
                }}
              />
            </Section>
          </>
        )}
      </div>
    </IadmModal>
  );

  function renderFooter() {
    const baseBtn: React.CSSProperties = {
      padding: '8px 16px', borderRadius: 6, fontSize: 13,
      fontWeight: 600, border: '1px solid #CBD5E1', cursor: 'pointer',
    };
    const arionBtn: React.CSSProperties = { ...baseBtn, background: '#38BDF8', color: '#fff', border: 'none' };
    const ghost: React.CSSProperties = { ...baseBtn, background: '#fff', color: '#0B1C24' };

    if (result) {
      return (
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '12px 24px', gap: 8 }}>
          <button style={ghost} onClick={onClose}>Close</button>
          <a
            href={result.edit_url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ ...arionBtn, textDecoration: 'none', display: 'inline-block' }}
          >Open in Elementor →</a>
        </div>
      );
    }

    const disabled = !activeSiteId || orderedIds.length === 0 || assembling;
    return (
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '12px 24px', gap: 8,
      }}>
        <div style={{ fontSize: 11, color: '#5A7A8A' }}>
          {orderedIds.length} block{orderedIds.length === 1 ? '' : 's'} ordered
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={ghost} onClick={onClose}>Cancel</button>
          <button
            style={disabled ? { ...arionBtn, opacity: 0.5, cursor: 'not-allowed' } : arionBtn}
            onClick={runAssemble}
            disabled={disabled}
          >
            {assembling ? 'Assembling...' : 'Assemble + publish'}
          </button>
        </div>
      </div>
    );
  }
}

/* ──────────────────────────────────────────────────────────────────────── */

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#0B1C24', textTransform: 'uppercase', letterSpacing: 0.6 }}>
        {title}
      </div>
      {subtitle && <div style={{ fontSize: 11, color: '#5A7A8A', marginBottom: 8 }}>{subtitle}</div>}
      <div>{children}</div>
    </div>
  );
}

function DraftRow({
  draft, index, isFirst, isLast,
  onDragStart, onDragOver, onDrop,
  onMoveUp, onMoveDown, onRemove,
  isDragging,
}: {
  draft: AiBlockDraft;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
  isDragging: boolean;
}) {
  const kindLabel = KIND_LABEL[draft.kind] || draft.kind;
  const arrowBtn: React.CSSProperties = {
    background: '#fff', border: '1px solid #CBD5E1', borderRadius: 4,
    cursor: 'pointer', fontSize: 12, padding: '2px 8px', color: '#0B1C24',
  };
  const arrowDisabled: React.CSSProperties = { ...arrowBtn, opacity: 0.35, cursor: 'not-allowed' };
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        background: isDragging ? '#E0F2FE' : '#fff',
        border: '1px solid #E5EEF2', borderRadius: 6,
        padding: '10px 12px',
      }}
    >
      <div
        title="Drag to reorder"
        style={{
          cursor: 'grab', color: '#94A3B8', fontSize: 14,
          fontFamily: 'monospace', userSelect: 'none', flexShrink: 0,
        }}
      >⋮⋮</div>
      <div style={{
        background: 'rgba(56,189,248,0.12)', color: '#0284c7',
        borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 700,
        flexShrink: 0,
      }}>{index + 1}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#0B1C24' }}>{kindLabel}</div>
        <div style={{ fontSize: 10, color: '#5A7A8A' }}>
          <code>{draft.draft_block_id.slice(0, 8)}</code>
          {' · '}
          {draft.created_at ? new Date(draft.created_at).toLocaleString() : ''}
          {draft.tokens_used != null && (
            <> · {draft.tokens_used.toLocaleString()} tokens</>
          )}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 4 }}>
        <button
          style={isFirst ? arrowDisabled : arrowBtn}
          onClick={onMoveUp}
          disabled={isFirst}
          title="Move up"
        >↑</button>
        <button
          style={isLast ? arrowDisabled : arrowBtn}
          onClick={onMoveDown}
          disabled={isLast}
          title="Move down"
        >↓</button>
        <button
          style={{ ...arrowBtn, color: '#D85A30' }}
          onClick={onRemove}
          title="Remove from order"
        >✕</button>
      </div>
    </div>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div style={{
      background: 'rgba(220,38,38,0.06)', border: '1px solid rgba(220,38,38,0.25)',
      borderRadius: 6, padding: '10px 14px', marginBottom: 14,
      color: '#dc2626', fontSize: 12,
    }}>{message}</div>
  );
}

function ResultPanel({ result }: { result: AssembleResult }) {
  return (
    <div>
      <div style={{
        background: 'rgba(29,158,117,0.08)', border: '1px solid #1D9E75',
        borderRadius: 6, padding: '14px 16px',
      }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#0B1C24' }}>
          Page assembled successfully
        </div>
        <div style={{ fontSize: 12, color: '#0B1C24', marginTop: 6, lineHeight: 1.5 }}>
          Injected <strong>{result.blocksInjected}</strong> block{result.blocksInjected === 1 ? '' : 's'}{' '}
          into page <code>{String(result.pageId)}</code>. Open the page in
          Elementor to review, polish, and publish.
        </div>
      </div>
      <div style={{
        marginTop: 14, padding: 12, background: '#F8FAFC',
        border: '1px solid #E5EEF2', borderRadius: 6, fontSize: 11,
        color: '#5A7A8A', wordBreak: 'break-all',
      }}>
        <div style={{ fontWeight: 600, color: '#0B1C24', marginBottom: 4 }}>Edit URL</div>
        <a href={result.edit_url} target="_blank" rel="noopener noreferrer" style={{ color: '#0284c7' }}>
          {result.edit_url}
        </a>
      </div>
    </div>
  );
}
