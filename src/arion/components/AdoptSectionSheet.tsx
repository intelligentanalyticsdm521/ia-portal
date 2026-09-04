import React, { useState } from 'react';
import type { AdoptPreview } from '../../lib/arionApi';
import { smallButton } from './SectionFieldInputs';

/**
 * "Make it editable" — the sheet that opens on a section built on the website
 * itself (Phase 3, decision W-5).
 *
 * THE SHAPE OF THE DECISION
 *
 * A client is being asked to let us rebuild a section of their live page. So
 * the sheet does three things, in this order, and nothing else:
 *
 *   1. shows them the section as it is NOW, beside what it would become;
 *   2. says plainly what changes and what does not, including the bit nobody
 *      wants to read — the layout is replaced with the standard one;
 *   3. asks for anything we cannot invent (a picture's description) before it
 *      will let them go ahead.
 *
 * And the two buttons are equal weight. "Keep as built" is not a cancel — it
 * is a legitimate answer, and the row it leaves behind still works exactly as
 * it does today: shown in position, saved back untouched.
 *
 * A section we cannot take charge of never reaches this sheet's ADOPT path at
 * all: the reason comes back from the server in plain words and this renders
 * that instead, with one button.
 */

const CONFIDENCE_WORDS: Record<string, string> = {
  high: 'We are confident about this one.',
  fair: 'We have a good idea what this is, so read the two sides before you decide.',
  low: 'We are not sure enough about this one.',
};

function Chip({ tone, children }: { tone: 'good' | 'warn' | 'flat'; children: React.ReactNode }) {
  const colours = tone === 'good'
    ? { bg: '#DCFCE7', fg: '#166534' }
    : tone === 'warn'
      ? { bg: '#FEF3C7', fg: '#92400E' }
      : { bg: '#F1F5F9', fg: '#475569' };
  return (
    <span style={{
      background: colours.bg, color: colours.fg, borderRadius: 999, padding: '2px 10px',
      fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap',
    }}>
      {children}
    </span>
  );
}

export function AdoptSectionSheet({
  sectionLabel, preview, loading, busy, error, onAdopt, onClose,
}: {
  /** What the row is called today: "Custom section — built on the site". */
  sectionLabel: string;
  preview: AdoptPreview | null;
  loading: boolean;
  busy: boolean;
  error: string | null;
  /** The values the client typed for whatever the preview asked for. */
  onAdopt: (fixes: Record<string, string>) => void;
  onClose: () => void;
}) {
  const [fixes, setFixes] = useState<Record<string, string>>({});

  const needs = preview?.needsInput || [];
  const missing = needs.filter((n) => !String(fixes[n.field] || '').trim());
  const canAdopt = !!preview?.adoptable && missing.length === 0 && !busy;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Make ${sectionLabel} editable`}
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
          width: '100%', maxWidth: 900,
          borderTopLeftRadius: 16, borderTopRightRadius: 16,
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 -8px 32px rgba(15,23,42,0.2)',
        }}
      >
        <div style={{
          padding: '14px 16px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12,
        }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>Make this section editable</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
              Nothing changes on your website until you tap “Take charge of it”.
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flex: '0 0 auto' }}>
            {preview && (
              <Chip tone={preview.confidenceLabel === 'high' ? 'good' : preview.adoptable ? 'warn' : 'flat'}>
                {preview.adoptable ? (preview.kindLabel || 'Section') : 'Leave as it is'}
              </Chip>
            )}
            <button type="button" style={smallButton} onClick={onClose}>Close</button>
          </div>
        </div>

        <div style={{ padding: 16, overflowY: 'auto', flex: 1, WebkitOverflowScrolling: 'touch' }}>
          {loading && (
            <div style={{ fontSize: 13, color: 'var(--text-muted)', padding: '24px 0', textAlign: 'center' }}>
              Reading this section from your website…
            </div>
          )}

          {error && (
            <div role="alert" style={{
              background: '#FEE2E2', color: '#991B1B', border: '1px solid #FCA5A5',
              borderRadius: 8, padding: '10px 12px', marginBottom: 12, fontSize: 13,
            }}>
              {error}
            </div>
          )}

          {/* ── the honest refusal ─────────────────────────────────────── */}
          {preview && !preview.adoptable && (
            <>
              <p style={{ fontSize: 14, margin: '0 0 12px' }}>{preview.reasonText}</p>
              {preview.unmapped.filter((u) => u.carriesContent).length > 0 && (
                <div style={{
                  border: '1px solid var(--border)', borderRadius: 10, padding: 12, marginBottom: 12,
                }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6 }}>
                    WHAT WE COULD NOT CARRY OVER
                  </div>
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
                    {preview.unmapped.filter((u) => u.carriesContent).map((u, i) => (
                      <li key={i} style={{ marginBottom: 4 }}>
                        {u.label}
                        {u.preview ? <span style={{ color: 'var(--text-muted)' }}> — “{u.preview}”</span> : null}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
                It stays on your website exactly as it is, and it is saved back untouched every time you
                publish this page. If you want it changed, use <strong>Ask us to change it</strong> on the
                pages list.
              </p>
            </>
          )}

          {/* ── the offer ──────────────────────────────────────────────── */}
          {preview && preview.adoptable && (
            <>
              <p style={{ fontSize: 14, margin: '0 0 6px' }}>
                This looks like <strong>{preview.kindLabel}</strong>
                {preview.why ? <> — {preview.why}</> : null}. {CONFIDENCE_WORDS[preview.confidenceLabel]}
              </p>

              {(preview.warnings || []).length > 0 && (
                <ul style={{
                  margin: '0 0 12px', paddingLeft: 18, fontSize: 13, color: '#92400E',
                }}>
                  {(preview.warnings || []).map((wtext, i) => <li key={i} style={{ marginBottom: 4 }}>{wtext}</li>)}
                </ul>
              )}

              {preview.unmapped.length > 0 && (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
                  {preview.unmapped.map((u) => u.label).join(', ')} on this section
                  {preview.unmapped.length === 1 ? ' is' : ' are'} decoration, so
                  {preview.unmapped.length === 1 ? ' it goes' : ' they go'} when we rebuild it.
                </div>
              )}

              {/* What we cannot invent. */}
              {needs.length > 0 && (
                <div style={{
                  border: '1px solid #FDE68A', background: '#FFFBEB', borderRadius: 10,
                  padding: 12, marginBottom: 14,
                }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#92400E', marginBottom: 8 }}>
                    Before we can do this, we need {needs.length === 1 ? 'one thing' : `${needs.length} things`} from you
                  </div>
                  {needs.map((n) => (
                    <label key={n.field} style={{ display: 'block', marginBottom: 10 }}>
                      <span style={{ display: 'block', fontSize: 13, marginBottom: 4 }}>{n.message}</span>
                      <input
                        type="text"
                        value={fixes[n.field] || ''}
                        onChange={(e) => setFixes((cur) => ({ ...cur, [n.field]: e.target.value }))}
                        style={{
                          width: '100%', minHeight: 44, fontSize: 16, padding: '8px 10px',
                          border: '1px solid var(--border)', borderRadius: 8, boxSizing: 'border-box',
                        }}
                      />
                    </label>
                  ))}
                </div>
              )}

              {preview.html && (
                <iframe
                  title="Before and after"
                  srcDoc={preview.html}
                  style={{
                    width: '100%', height: 460, border: '1px solid var(--border)',
                    borderRadius: 10, background: '#fff',
                  }}
                />
              )}
            </>
          )}
        </div>

        <div className="ia-sticky-bar ia-sticky-bar--sheet" style={{
          borderTop: '1px solid var(--border)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
          flexWrap: 'wrap', background: 'var(--surface, #fff)',
        }}>
          <button type="button" style={{ ...smallButton, minHeight: 44 }} onClick={onClose}>
            Keep it as built
          </button>
          {preview?.adoptable && (
            <button
              type="button"
              className="abtn abtn-sky"
              style={{ minHeight: 44, opacity: canAdopt ? 1 : 0.5 }}
              disabled={!canAdopt}
              title={missing.length > 0 ? 'Fill in what we asked for above first.' : undefined}
              onClick={() => onAdopt(fixes)}
            >
              {busy ? 'Working…' : 'Take charge of it'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * "Review sections built on the site (N)" — the page-level list.
 *
 * A checklist, NOT an "adopt all". Every row opens its own before/after and is
 * confirmed on its own, because each one rewrites a piece of a live page and a
 * single tap should never do that four times over (SCOPE §3.9).
 */
export function AdoptReviewList({
  rows, onOpen, onClose,
}: {
  rows: Array<{
    index: number;
    label: string;
    summary: string;
    adoptable: boolean;
    kindLabel: string | null;
    reasonText: string | null;
    confidenceLabel: 'high' | 'fair' | 'low' | null;
  }>;
  onOpen: (index: number) => void;
  onClose: () => void;
}) {
  const canDo = rows.filter((r) => r.adoptable).length;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Sections built on the site"
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(15,23,42,0.45)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="ia-sheet" style={{
        background: 'var(--surface, #fff)', width: '100%', maxWidth: 640,
        borderTopLeftRadius: 16, borderTopRightRadius: 16,
        display: 'flex', flexDirection: 'column', boxShadow: '0 -8px 32px rgba(15,23,42,0.2)',
      }}>
        <div style={{
          padding: '14px 16px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12,
        }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>Sections built on the site</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
              {canDo === 0
                ? 'None of these can be made editable here, and each one says why.'
                : `${canDo} of ${rows.length} can be made editable here. You decide one at a time.`}
            </div>
          </div>
          <button type="button" style={{ ...smallButton, flex: '0 0 auto' }} onClick={onClose}>Close</button>
        </div>

        <div style={{ padding: 16, overflowY: 'auto', flex: 1, WebkitOverflowScrolling: 'touch' }}>
          {rows.map((r) => (
            <div
              key={r.index}
              style={{
                border: '1px solid var(--border)', borderRadius: 10, padding: 12, marginBottom: 10,
                display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap',
                background: r.adoptable ? 'var(--surface, #fff)' : 'var(--surface-2, #F8FAFC)',
              }}
            >
              <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>
                  Position {r.index + 1}
                  {r.adoptable && r.kindLabel
                    ? <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}> · looks like {r.kindLabel}</span>
                    : null}
                </div>
                <div style={{
                  fontSize: 12, color: 'var(--text-muted)', marginTop: 2,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {r.summary}
                </div>
                {!r.adoptable && r.reasonText && (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{r.reasonText}</div>
                )}
              </div>
              <button
                type="button"
                className={r.adoptable ? 'abtn abtn-sky' : undefined}
                style={r.adoptable ? { minHeight: 44 } : smallButton}
                disabled={!r.adoptable}
                title={r.adoptable ? undefined : (r.reasonText || undefined)}
                onClick={() => onOpen(r.index)}
              >
                {r.adoptable ? 'Make it editable' : 'Keep as built'}
              </button>
            </div>
          ))}
          {rows.length === 0 && (
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              Every section on this page is one you can already edit here.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
