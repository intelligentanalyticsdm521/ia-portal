import React from 'react';
import type { SectionCatalogEntry, SectionFieldSpec } from '../../lib/arionApi';
import type { EditorSection } from '../utils/sectionListState';
import { ScalarField, ParagraphsField, ListField, blankItem, smallButton } from './SectionFieldInputs';

/**
 * The full-screen sheet that opens when a client taps a section row.
 *
 * Real form fields — heading, paragraph, button text, button link, pictures —
 * never raw JSON (SCOPE_ARION_SITE_BUILDER_2026-09-05 §3.2, walkthrough T2).
 * On a phone it is a single column with a sticky bar at the bottom; on a
 * desktop it is the same sheet, centred.
 */
export function SectionEditSheet({
  section, catalog, onClose, onField, onListItem, onListAdd, onListRemove,
  onParagraph, onParagraphAdd, onParagraphRemove, onUpload,
}: {
  section: EditorSection;
  catalog: SectionCatalogEntry | null;
  onClose: () => void;
  onField: (key: string, v: any) => void;
  onListItem: (listKey: string, index: number, key: string, v: any) => void;
  onListAdd: (listKey: string, blank: Record<string, any>) => void;
  onListRemove: (listKey: string, index: number) => void;
  onParagraph: (key: string, index: number, v: string) => void;
  onParagraphAdd: (key: string) => void;
  onParagraphRemove: (key: string, index: number) => void;
  onUpload: (file: File) => Promise<string>;
}) {
  const fields: SectionFieldSpec[] = catalog?.fields || [];

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
        style={{
          background: 'var(--surface, #fff)',
          width: '100%', maxWidth: 640, maxHeight: '92vh',
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
              return (
                <ListField
                  key={spec.key}
                  spec={spec}
                  value={Array.isArray(value) ? value : []}
                  onItemChange={(i, key, v) => onListItem(spec.key, i, key, v)}
                  onAdd={() => onListAdd(spec.key, blankItem(spec))}
                  onRemove={(i) => onListRemove(spec.key, i)}
                  onUpload={onUpload}
                />
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
                onChange={(v) => onField(spec.key, v)}
                onUpload={onUpload}
              />
            );
          })}
        </div>

        {/* paddingRight clears the floating ARGUS button, which is fixed to
            the bottom-right corner and sat squarely on top of Done at 375px. */}
        <div style={{
          padding: '12px 76px 12px 16px', borderTop: '1px solid var(--border)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
          position: 'sticky', bottom: 0, background: 'var(--surface, #fff)',
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
