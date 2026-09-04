import React, { useState } from 'react';
import type { SectionDiffRow } from '../../lib/arionApi';
import { smallButton } from './SectionFieldInputs';
import { costLine } from '../utils/siteBuilderCopy';

/**
 * "Ask ARGUS to change it" — the instruction box and the before/after.
 * ---------------------------------------------------------------------------
 * SCOPE_ARION_SITE_BUILDER_2026-09-05 §3.8.
 *
 * Type what you want in plain English, see exactly what would change, then
 * Approve or Discard. Approving does not publish: it drops the new wording
 * into the editor, where the ordinary Save and Publish buttons still stand
 * between it and the website. Nothing ARGUS writes reaches a live page
 * without a human tap, twice.
 *
 * Two rules this file must not break:
 *   - the cost is shown BEFORE the client sends anything, and it comes from
 *     the server (feedback_no_fabricated_catalog);
 *   - the words are always "ARGUS AI", never a vendor
 *     (reference_intelligence_layer_terminology).
 */

export interface AskArgusStrings {
  /** e.g. "Ask ARGUS to change this section" */
  title: string;
  placeholder: string;
  /** Shown instead of the box when the plan does not include AI actions. */
  lockedReason?: string | null;
}

const PANEL: React.CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: 10,
  padding: 12,
  marginTop: 14,
  background: 'var(--surface-2, #F8FAFC)',
};

function PoweredBy() {
  return (
    <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
      Powered by ARGUS AI
    </span>
  );
}

/* ── the before/after a client reads before approving ───────────────────── */

export function DiffRows({ rows }: { rows: SectionDiffRow[] }) {
  if (!rows || rows.length === 0) {
    return <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Nothing would change.</div>;
  }
  return (
    <div>
      {rows.map((r) => (
        <div key={r.field} style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4 }}>
            {r.label}
          </div>
          <div style={{ display: 'grid', gap: 6 }}>
            <div style={{
              fontSize: 13, padding: '6px 8px', borderRadius: 6,
              background: '#FEF2F2', color: '#7F1D1D', textDecoration: r.kind === 'text' ? 'line-through' : 'none',
              wordBreak: 'break-word',
            }}>
              {r.beforeText || <em style={{ opacity: 0.7 }}>empty</em>}
            </div>
            <div style={{
              fontSize: 13, padding: '6px 8px', borderRadius: 6,
              background: '#F0FDF4', color: '#14532D', wordBreak: 'break-word',
            }}>
              {r.afterText || <em style={{ opacity: 0.7 }}>empty</em>}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── the box itself ─────────────────────────────────────────────────────── */

export function AskArgusBox({
  strings, credits, busy, error, summary, diff, onAsk, onApprove, onDiscard,
  extra,
}: {
  strings: AskArgusStrings;
  credits: number | null;
  busy: boolean;
  error: string | null;
  /** One sentence from ARGUS about what it changed. Null until there is a proposal. */
  summary: string | null;
  diff: SectionDiffRow[] | null;
  onAsk: (instruction: string) => void;
  onApprove: () => void;
  onDiscard: () => void;
  /** Anything extra to show above the buttons — the page box lists new sections here. */
  extra?: React.ReactNode;
}) {
  const [text, setText] = useState('');
  const locked = !!strings.lockedReason;
  const hasProposal = diff !== null;

  if (locked) {
    return (
      <div style={{ ...PANEL, opacity: 0.75 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
          <strong style={{ fontSize: 13 }}>{strings.title}</strong>
          <PoweredBy />
        </div>
        <textarea
          rows={2}
          disabled
          value=""
          placeholder={strings.placeholder}
          aria-label={strings.title}
          style={{
            width: '100%', fontSize: 16, padding: 10, marginTop: 8, borderRadius: 8,
            border: '1px solid var(--border)', background: 'var(--surface, #fff)',
            boxSizing: 'border-box', resize: 'vertical', cursor: 'not-allowed',
          }}
        />
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
          {strings.lockedReason}
        </div>
      </div>
    );
  }

  return (
    <div style={PANEL}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
        <strong style={{ fontSize: 13 }}>{strings.title}</strong>
        <PoweredBy />
      </div>

      {!hasProposal && (
        <>
          <textarea
            rows={2}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={strings.placeholder}
            aria-label={strings.title}
            disabled={busy}
            style={{
              width: '100%', fontSize: 16, padding: 10, marginTop: 8, borderRadius: 8,
              border: '1px solid var(--border)', background: 'var(--surface, #fff)',
              color: 'inherit', boxSizing: 'border-box', resize: 'vertical',
            }}
          />
          <div style={{
            display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 8,
          }}>
            <button
              type="button"
              className="abtn abtn-sky"
              style={{ minHeight: 40 }}
              disabled={busy || !text.trim()}
              onClick={() => onAsk(text.trim())}
            >
              {busy ? 'Asking…' : 'Ask ARGUS'}
            </button>
            {costLine(credits) && (
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{costLine(credits)}</span>
            )}
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              You see what it suggests before anything changes.
            </span>
          </div>
        </>
      )}

      {error && (
        <div role="status" style={{
          marginTop: 8, background: '#FEE2E2', color: '#991B1B', border: '1px solid #FCA5A5',
          borderRadius: 8, padding: '8px 10px', fontSize: 13,
        }}>
          {error}
        </div>
      )}

      {hasProposal && (
        <div style={{ marginTop: 10 }}>
          {summary && (
            <div style={{ fontSize: 13, marginBottom: 10 }}>{summary}</div>
          )}
          <DiffRows rows={diff} />
          {extra}
          <div style={{
            display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center',
            marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border)',
          }}>
            <button type="button" className="abtn abtn-sky" style={{ minHeight: 44 }} disabled={busy} onClick={onApprove}>
              {busy ? 'Working…' : 'Use this'}
            </button>
            <button type="button" style={{ ...smallButton, minHeight: 44 }} disabled={busy} onClick={onDiscard}>
              No thanks
            </button>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              “Use this” puts the new wording in the editor. Your website only changes when you Save.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
