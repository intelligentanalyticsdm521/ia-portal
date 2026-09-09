import React from 'react';
import type {
  SectionCatalogEntry, SectionFieldSpec, SectionDiffRow, SectionRoleReview,
} from '../../lib/arionApi';
import type { EditorSection } from '../utils/sectionListState';
import {
  ScalarField, ParagraphsField, ListField, blankItem, smallButton, isHiddenSpec,
  type FieldContext,
} from './SectionFieldInputs';
import { AskArgusBox } from './AskArgus';

/**
 * The full-screen sheet that opens when a client taps a section row.
 *
 * Real form fields — heading, paragraph, button text, button link, pictures —
 * never raw JSON (SCOPE_ARION_SITE_BUILDER_2026-09-05 §3.2, walkthrough T2).
 * On a phone it is a single column with a sticky bar at the bottom; on a
 * desktop it is the same sheet, centred.
 *
 * At the bottom sits "Ask ARGUS to change this section" (Phase 1B) — type it
 * in plain English instead of filling the fields in. What comes back is a
 * suggestion shown as a before/after; approving it fills these same fields,
 * and the website still only changes on Save.
 */
export interface SectionAskArgus {
  /** null when the plan includes AI actions; the upsell sentence when it does not. */
  lockedReason: string | null;
  credits: number | null;
  busy: boolean;
  error: string | null;
  summary: string | null;
  diff: SectionDiffRow[] | null;
  onAsk: (instruction: string) => void;
  onApprove: () => void;
  onDiscard: () => void;
}

/**
 * "Check this" — the one thing a hand-drawn card cannot tell us.
 *
 * A curated layout draws a price card as a name, a price, two blocks of text
 * and a button. Which block is "how often" and which is "what is included" is
 * usually obvious from the content — a bullet list is a list — and when it is,
 * nothing is shown here at all. When it is not, the server says so, and this
 * is the row that lets a client put it right in one tap instead of finding out
 * on their published page.
 */
function RoleReviewNote({ review, fields, busy, onSwap }: {
  review: SectionRoleReview;
  /** The two field specs, so the boxes are named the way the sheet names them. */
  fields: SectionFieldSpec[];
  busy: boolean;
  onSwap: () => void;
}) {
  const names = fields.map((f) => f.label);
  return (
    <div
      style={{
        border: '1px solid #FDE68A', background: '#FFFBEB', borderRadius: 10,
        padding: 12, marginBottom: 12,
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 700, color: '#92400E', marginBottom: 6 }}>
        Check this
      </div>
      <div style={{ fontSize: 13, marginBottom: 10 }}>
        {review.why}
        {names.length === 2
          ? ` If “${names[0]}” and “${names[1]}” are the wrong way round below, swap them.`
          : ''}
      </div>
      <button
        type="button"
        style={{ ...smallButton, minHeight: 44 }}
        disabled={busy}
        onClick={onSwap}
      >
        {busy ? 'Swapping…' : 'Swap them over'}
      </button>
    </div>
  );
}

export function SectionEditSheet({
  section, catalog, ctx, onClose, onField, onFields, onListItem, onListItemPatch,
  onListAdd, onListRemove, onParagraph, onParagraphAdd, onParagraphRemove, ask,
  onSwapRoles, swapBusy = false,
}: {
  section: EditorSection;
  catalog: SectionCatalogEntry | null;
  /** Pictures and the booking link — everything the inputs need from the site. */
  ctx: FieldContext;
  onClose: () => void;
  onField: (key: string, v: any) => void;
  /** Several fields at once: a picture writes its url, its id and its description together. */
  onFields: (patch: Record<string, any>) => void;
  onListItem: (listKey: string, index: number, key: string, v: any) => void;
  onListItemPatch: (listKey: string, index: number, patch: Record<string, any>) => void;
  onListAdd: (listKey: string, blank: Record<string, any>) => void;
  onListRemove: (listKey: string, index: number) => void;
  onParagraph: (key: string, index: number, v: string) => void;
  onParagraphAdd: (key: string) => void;
  onParagraphRemove: (key: string, index: number) => void;
  /** Omitted on a sheet with no AI at all — the box simply does not render. */
  ask?: SectionAskArgus;
  /** Answering a "check this". Omitted where there is nothing to check. */
  onSwapRoles?: (review: SectionRoleReview) => void;
  swapBusy?: boolean;
}) {
  const fields: SectionFieldSpec[] = (catalog?.fields || []).filter((f) => !isHiddenSpec(f));
  const itemFields = section.itemFields || null;
  const reviews = section.roleReview || [];

  /**
   * A hand-drawn card only has room for what its author drew. The server says
   * which sub-fields have somewhere to go on THIS layout, and anything else is
   * left out — a box you can type into that saves nothing is the failure this
   * codebase keeps finding, not a feature.
   */
  const specForList = (spec: SectionFieldSpec): SectionFieldSpec => {
    const allowed = itemFields?.[spec.key];
    if (!allowed || !spec.item) return spec;
    return { ...spec, item: spec.item.filter((sub) => allowed.includes(sub.key)) };
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Edit ${section.label}`}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(15,23,42,0.45)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="ia-sheet"
        style={{
          background: 'var(--surface, #fff)',
          width: '100%', maxWidth: 640,
          borderTopLeftRadius: 16, borderTopRightRadius: 16,
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 -8px 32px rgba(15,23,42,0.2)',
        }}
      >
        <div style={{
          padding: '14px 16px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{section.label}</div>
            {catalog?.blurb && (
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{catalog.blurb}</div>
            )}
          </div>
          <button type="button" style={{ ...smallButton, flex: '0 0 auto' }} onClick={onClose}>Close</button>
        </div>

        <div style={{ padding: 16, overflowY: 'auto', flex: 1, WebkitOverflowScrolling: 'touch' }}>
          {fields.length === 0 && (
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              We could not load the list of things you can change on this section. Reload the page and try again.
            </div>
          )}

          {fields.map((spec) => {
            const value = section.fields?.[spec.key];
            if (spec.type === 'list') {
              const shown = specForList(spec);
              const review = reviews.find((r) => r.list === spec.key) || null;
              return (
                <React.Fragment key={spec.key}>
                  {review && onSwapRoles && (
                    <RoleReviewNote
                      review={review}
                      fields={(spec.item || []).filter((sub) => review.fields.includes(sub.key))}
                      busy={swapBusy}
                      onSwap={() => onSwapRoles(review)}
                    />
                  )}
                <ListField
                  key={spec.key}
                  spec={shown}
                  value={Array.isArray(value) ? value : []}
                  onItemChange={(i, key, v) => onListItem(spec.key, i, key, v)}
                  onItemPatch={(i, patch) => onListItemPatch(spec.key, i, patch)}
                  onAdd={() => onListAdd(spec.key, blankItem(shown))}
                  onRemove={(i) => onListRemove(spec.key, i)}
                  ctx={ctx}
                />
                </React.Fragment>
              );
            }
            if (spec.type === 'paragraphs') {
              return (
                <ParagraphsField
                  key={spec.key}
                  spec={spec}
                  value={Array.isArray(value) ? value : []}
                  onChange={(i, v) => onParagraph(spec.key, i, v)}
                  onAdd={() => onParagraphAdd(spec.key)}
                  onRemove={(i) => onParagraphRemove(spec.key, i)}
                />
              );
            }
            return (
              <ScalarField
                key={spec.key}
                spec={spec}
                value={value}
                siblings={section.fields || {}}
                onChange={(v) => onField(spec.key, v)}
                onPatch={onFields}
                ctx={ctx}
              />
            );
          })}

          {ask && (
            <AskArgusBox
              strings={{
                title: 'Ask ARGUS to change this section',
                placeholder: 'e.g. “Make this warmer and mention that we are family-run.”',
                lockedReason: ask.lockedReason,
              }}
              credits={ask.credits}
              busy={ask.busy}
              error={ask.error}
              summary={ask.summary}
              diff={ask.diff}
              onAsk={ask.onAsk}
              onApprove={ask.onApprove}
              onDiscard={ask.onDiscard}
            />
          )}
        </div>

        {/* `.ia-sticky-bar` clears the floating ARGUS button, which is fixed
            to the bottom-right corner and sat squarely on top of Done at
            375px, and the phone's home indicator underneath it. */}
        <div className="ia-sticky-bar ia-sticky-bar--sheet" style={{
          borderTop: '1px solid var(--border)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
          background: 'var(--surface, #fff)',
        }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            Changes are kept here until you hit Save on the page.
          </span>
          <button type="button" className="abtn abtn-sky" style={{ minHeight: 44 }} onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}
