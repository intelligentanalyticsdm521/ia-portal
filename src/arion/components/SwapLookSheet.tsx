import React from 'react';
import type { SectionCatalogEntry } from '../../lib/arionApi';
import { smallButton } from './SectionFieldInputs';

/**
 * "Change the look" — the same words in a different layout (D-ARION-F).
 * ---------------------------------------------------------------------------
 * The curated library's layouts were only ever offered when ADDING a section,
 * so a client who picked the wrong one had to delete it, add another and retype
 * everything. Both halves of the swap already existed on the server —
 * `buildLibrarySection` builds the layout, `applyFields` writes the section's
 * current values onto it — and nothing joined them.
 *
 * The warning is the one the adoption sheet already uses, for the same reason:
 * the LAYOUT is replaced. The words and the pictures come across; anything the
 * new layout has no place for is named afterwards, never dropped quietly.
 *
 * Nothing here writes to the website. The swapped section sits in the editor
 * until Save, so Undo covers it exactly like a typed change.
 */

export function SwapLookSheet({
  sectionLabel, catalog, currentBlueprintId, busyBlueprint, error, onSwap, onClose,
}: {
  sectionLabel: string;
  /** The catalogue entry for THIS section's kind — its variants are the choices. */
  catalog: SectionCatalogEntry | null;
  currentBlueprintId: string | null;
  busyBlueprint: string | null;
  error: string | null;
  onSwap: (blueprintId: string) => void;
  onClose: () => void;
}) {
  const variants = catalog?.variants || [];

  return (
    <div
      role="dialog" aria-modal="true" aria-label={`Change the look of ${sectionLabel}`}
      style={{
        position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(15,23,42,0.45)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="ia-sheet" style={{
        background: 'var(--surface, #fff)', width: '100%', maxWidth: 640, maxHeight: '92vh',
        borderTopLeftRadius: 16, borderTopRightRadius: 16, display: 'flex', flexDirection: 'column',
      }}>
        <div style={{
          padding: '14px 16px', borderBottom: '1px solid var(--border)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
        }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>Change the look</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{sectionLabel}</div>
          </div>
          <button type="button" style={{ ...smallButton, minHeight: 44, flex: '0 0 auto' }} onClick={onClose}>
            Close
          </button>
        </div>

        <div style={{ padding: 16, overflowY: 'auto', flex: 1, WebkitOverflowScrolling: 'touch' }}>
          <div style={{
            background: '#FEF3C7', border: '1px solid #FDE68A', color: '#92400E',
            borderRadius: 8, padding: '10px 12px', fontSize: 13, marginBottom: 14,
          }}>
            Your wording and your pictures come across. The layout is replaced, so this section will
            look different. Nothing changes on your website until you save.
          </div>

          {error && (
            <div role="status" style={{
              background: '#FEE2E2', border: '1px solid #FCA5A5', color: '#991B1B',
              borderRadius: 8, padding: '10px 12px', fontSize: 13, marginBottom: 14,
            }}>
              {error}
            </div>
          )}

          {variants.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              There are no other ready-made layouts for this kind of section yet.
            </div>
          ) : variants.map((v) => {
            const isCurrent = !!currentBlueprintId && v.blueprintId === currentBlueprintId;
            const disabled = !v.available || isCurrent || busyBlueprint !== null;
            return (
              <button
                key={v.blueprintId}
                type="button"
                disabled={disabled}
                onClick={() => onSwap(v.blueprintId)}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  padding: 12, marginBottom: 8, borderRadius: 10,
                  border: isCurrent ? '2px solid var(--accent, #38BDF8)' : '1px solid var(--border)',
                  background: v.available && !isCurrent ? 'transparent' : 'var(--surface-2, #F8FAFC)',
                  opacity: v.available ? 1 : 0.65,
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  minHeight: 60, color: 'inherit',
                }}
              >
                <span style={{ display: 'block', fontSize: 14, fontWeight: 600 }}>
                  {v.label}
                  {isCurrent && <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}> — the one you have</span>}
                  {busyBlueprint === v.blueprintId && (
                    <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}> — changing…</span>
                  )}
                </span>
                {!v.available && (
                  <span style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                    {v.unavailableReason}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
