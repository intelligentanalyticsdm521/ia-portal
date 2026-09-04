import React from 'react';
import type { SectionCatalogEntry } from '../../lib/arionApi';
import { smallButton } from './SectionFieldInputs';

/**
 * "Add a section" — the catalogue of section shapes this website can take.
 *
 * A shape the site cannot have (the Contact form needs the Elementor Pro form
 * widget, which Lite sites do not have) is shown greyed with the reason
 * spelled out, never silently dropped: a missing option is indistinguishable
 * from a bug (walkthrough T14).
 *
 * Each shape gets a small drawing of its layout. They are drawn here in plain
 * SVG — no third-party asset, no vendor branding
 * (memory: feedback_no_third_party_product_surface).
 */

function Thumb({ kind }: { kind: string }) {
  const bar = (x: number, y: number, w: number, h: number, o = 1) =>
    <rect key={`${x}-${y}-${w}`} x={x} y={y} width={w} height={h} rx={2} fill="currentColor" opacity={o} />;
  const shapes: Record<string, React.ReactNode[]> = {
    hero:         [bar(6, 8, 48, 8), bar(6, 20, 36, 4, 0.5), bar(6, 30, 20, 7, 0.8)],
    services:     [bar(6, 6, 30, 5, 0.6), bar(6, 16, 16, 22, 0.35), bar(26, 16, 16, 22, 0.35), bar(46, 16, 16, 22, 0.35)],
    testimonials: [bar(6, 6, 30, 5, 0.6), bar(6, 16, 25, 22, 0.35), bar(35, 16, 25, 22, 0.35)],
    cta:          [bar(4, 12, 60, 22, 0.25), bar(14, 18, 40, 5, 0.8), bar(26, 27, 16, 5, 0.9)],
    about:        [bar(6, 8, 26, 30, 0.35), bar(36, 8, 26, 5, 0.7), bar(36, 17, 26, 3, 0.4), bar(36, 23, 22, 3, 0.4), bar(36, 29, 24, 3, 0.4)],
    faq:          [bar(6, 6, 30, 5, 0.6), bar(6, 15, 56, 6, 0.35), bar(6, 24, 56, 6, 0.35), bar(6, 33, 56, 6, 0.35)],
    gallery:      [bar(6, 8, 17, 14, 0.35), bar(26, 8, 17, 14, 0.35), bar(46, 8, 16, 14, 0.35), bar(6, 25, 17, 14, 0.35), bar(26, 25, 17, 14, 0.35), bar(46, 25, 16, 14, 0.35)],
    contact:      [bar(6, 6, 30, 5, 0.6), bar(6, 15, 25, 4, 0.4), bar(6, 22, 25, 4, 0.4), bar(6, 29, 25, 4, 0.4), bar(36, 15, 26, 18, 0.3), bar(36, 35, 12, 4, 0.8)],
  };
  return (
    <svg viewBox="0 0 68 46" width="68" height="46" role="img" aria-hidden="true"
         style={{ color: 'var(--accent, #38BDF8)', flex: '0 0 auto' }}>
      <rect x="0" y="0" width="68" height="46" rx="6" fill="currentColor" opacity="0.08" />
      {shapes[kind] || bar(6, 16, 56, 14, 0.35)}
    </svg>
  );
}

export function SectionPicker({ catalog, busyKind, onAdd, onClose }: {
  catalog: SectionCatalogEntry[];
  busyKind: string | null;
  onAdd: (kind: string) => void;
  onClose: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Add a section"
      style={{
        position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15,23,42,0.45)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: 'var(--surface, #fff)', width: '100%', maxWidth: 640, maxHeight: '92vh',
        borderTopLeftRadius: 16, borderTopRightRadius: 16, display: 'flex', flexDirection: 'column',
      }}>
        <div style={{
          padding: '14px 16px', borderBottom: '1px solid var(--border)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>Add a section</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              It goes on the end of the page. Move it where you want it, then Save.
            </div>
          </div>
          <button type="button" style={smallButton} onClick={onClose}>Close</button>
        </div>

        <div style={{ padding: 12, overflowY: 'auto', flex: 1 }}>
          {catalog.map((entry) => (
            <button
              key={entry.kind}
              type="button"
              disabled={!entry.available || busyKind !== null}
              onClick={() => onAdd(entry.kind)}
              style={{
                display: 'flex', gap: 12, alignItems: 'center', width: '100%', textAlign: 'left',
                padding: 12, marginBottom: 8, borderRadius: 10,
                border: '1px solid var(--border)',
                background: entry.available ? 'transparent' : 'var(--surface-2, #F8FAFC)',
                opacity: entry.available ? 1 : 0.65,
                cursor: entry.available ? 'pointer' : 'not-allowed',
                minHeight: 72, color: 'inherit',
              }}
            >
              <Thumb kind={entry.kind} />
              <span style={{ flex: 1 }}>
                <span style={{ display: 'block', fontSize: 14, fontWeight: 600 }}>
                  {entry.label}
                  {busyKind === entry.kind && <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}> — adding…</span>}
                </span>
                <span style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                  {entry.available ? entry.blurb : entry.unavailableReason}
                </span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
