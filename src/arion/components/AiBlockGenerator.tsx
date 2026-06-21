import React, { useEffect, useRef, useState } from 'react';
import { useArionContext } from '../useArionContext';
import { IadmModal } from '../../components/IadmModal';
import type { AiBlockKind } from '../../lib/arionApi';

/**
 * AiBlockGenerator — F-AI-WB Phase 1 (2026-06-20)
 *
 * User-facing drawer for ARION admins to call the 8-emitter block-generator
 * backend (POST /arion/sites/:siteId/blocks/:kind). Three-step flow:
 *
 *   1. Pick block kind from an 8-card grid.
 *   2. Optional section-context overrides (tone, industry, anything emitter
 *      can read off `context`).
 *   3. Generate → preview JSON → Accept / Discard / Regenerate.
 *
 * The Elementor render preview is deferred. Phase 1 shows the block_json
 * shape so an admin can sanity-check copy + structure before pushing to WP.
 *
 * Tier-gating is handled by the host page (WebsiteAiBuilder). This component
 * assumes the user already passed the Pro+ gate.
 */

interface BlockKindMeta {
  kind: AiBlockKind;
  label: string;
  description: string;
  icon: string;
}

const BLOCK_KINDS: BlockKindMeta[] = [
  { kind: 'hero',         label: 'Hero',         description: 'Big headline + subhead + primary CTA above the fold.', icon: 'H' },
  { kind: 'services',     label: 'Services',     description: 'Card grid of service offerings with icons + copy.', icon: 'S' },
  { kind: 'testimonials', label: 'Testimonials', description: 'Social-proof carousel of customer quotes + names.', icon: 'T' },
  { kind: 'cta',          label: 'Call to Action', description: 'Mid-page conversion block — headline, supporting line, button.', icon: 'C' },
  { kind: 'about',        label: 'About',        description: 'Brand story / origin paragraph with optional stats row.', icon: 'A' },
  { kind: 'faq',          label: 'FAQ',          description: 'Accordion of Q&A pairs for common objections.', icon: 'F' },
  { kind: 'gallery',      label: 'Gallery',      description: 'Image grid block with optional captions.', icon: 'G' },
  { kind: 'contact',      label: 'Contact',      description: 'Contact form section with phone / email / address rows.', icon: 'M' },
];

type Step = 'pick' | 'context' | 'generating' | 'result';

interface GenResult {
  block_json: Record<string, any>;
  tokens_used: number;
  latency_ms: number;
  draft_block_id: string;
}

export function AiBlockGenerator({
  open,
  onClose,
  initialKind,
  onAccepted,
}: {
  open: boolean;
  onClose: () => void;
  initialKind?: AiBlockKind;
  /** Fired after a successful accept so a parent list (e.g. assembler) can refresh. */
  onAccepted?: (draftBlockId: string, kind: AiBlockKind) => void;
}) {
  const { arionApi, activeSiteId } = useArionContext();

  const [step, setStep] = useState<Step>(initialKind ? 'context' : 'pick');
  const [kind, setKind] = useState<AiBlockKind | null>(initialKind || null);
  const [tone, setTone] = useState('');
  const [industry, setIndustry] = useState('');
  const [extraNotes, setExtraNotes] = useState('');
  const [result, setResult] = useState<GenResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showElementorView, setShowElementorView] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [accepted, setAccepted] = useState(false);

  // Elapsed-time timer while generating
  const [elapsedMs, setElapsedMs] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startRef = useRef<number>(0);

  // Reset all state whenever the drawer is reopened.
  useEffect(() => {
    if (open) {
      setStep(initialKind ? 'context' : 'pick');
      setKind(initialKind || null);
      setTone('');
      setIndustry('');
      setExtraNotes('');
      setResult(null);
      setError(null);
      setShowElementorView(false);
      setAccepted(false);
      setElapsedMs(0);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  }, [open, initialKind]);

  function startTimer() {
    startRef.current = Date.now();
    setElapsedMs(0);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setElapsedMs(Date.now() - startRef.current);
    }, 100);
  }
  function stopTimer() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  function buildContext(): Record<string, any> {
    const ctx: Record<string, any> = {};
    if (tone.trim()) ctx.tone = tone.trim();
    if (industry.trim()) ctx.industry = industry.trim();
    if (extraNotes.trim()) ctx.notes = extraNotes.trim();
    return ctx;
  }

  async function runGenerate() {
    if (!activeSiteId || !kind) return;
    setStep('generating');
    setError(null);
    setResult(null);
    setAccepted(false);
    startTimer();
    try {
      const res = await arionApi.generateBlock(activeSiteId, kind, buildContext());
      stopTimer();
      setResult(res as GenResult);
      setStep('result');
    } catch (err: any) {
      stopTimer();
      setError(err?.message || 'Block generation failed.');
      setStep('context');
    }
  }

  async function runAccept() {
    if (!activeSiteId || !result) return;
    setAccepting(true);
    try {
      await arionApi.acceptDraft(activeSiteId, result.draft_block_id);
      setAccepted(true);
      if (onAccepted && kind) onAccepted(result.draft_block_id, kind);
    } catch (err: any) {
      setError(err?.message || 'Accept failed.');
    } finally {
      setAccepting(false);
    }
  }

  const headerSubtitle =
    step === 'pick'      ? 'Step 1 of 3 — Pick a block kind' :
    step === 'context'   ? `Step 2 of 3 — Section context for ${kind ?? 'block'}` :
    step === 'generating'? 'Step 3 of 3 — Generating with Intelligence Layer' :
                           'Step 3 of 3 — Review draft';

  return (
    <IadmModal
      open={open}
      onClose={onClose}
      product="arion"
      eyebrow="ARION · IL"
      title="Generate block with Intelligence Layer"
      subtitle={headerSubtitle}
      size="report"
      footer={renderFooter()}
    >
      <div style={{ padding: '20px 24px' }}>
        {error && (
          <div style={{
            background: 'rgba(220,38,38,0.06)',
            border: '1px solid rgba(220,38,38,0.25)',
            borderRadius: 6, padding: '10px 14px', marginBottom: 14,
            color: '#dc2626', fontSize: 12,
          }}>
            {error}
          </div>
        )}

        {step === 'pick' && (
          <KindPicker
            onPick={(k) => { setKind(k); setStep('context'); }}
          />
        )}

        {step === 'context' && kind && (
          <ContextForm
            kind={kind}
            tone={tone} setTone={setTone}
            industry={industry} setIndustry={setIndustry}
            extraNotes={extraNotes} setExtraNotes={setExtraNotes}
            onChangeKind={() => setStep('pick')}
          />
        )}

        {step === 'generating' && (
          <GeneratingPanel elapsedMs={elapsedMs} kind={kind!} />
        )}

        {step === 'result' && result && (
          <ResultPanel
            kind={kind!}
            result={result}
            showElementorView={showElementorView}
            setShowElementorView={setShowElementorView}
            accepted={accepted}
          />
        )}
      </div>
    </IadmModal>
  );

  function renderFooter() {
    const baseBtn: React.CSSProperties = {
      padding: '8px 16px', borderRadius: 6, fontSize: 13,
      fontWeight: 600, border: '1px solid #CBD5E1', cursor: 'pointer',
    };
    const primary: React.CSSProperties = { ...baseBtn, background: '#2563eb', color: '#fff', border: 'none' };
    const arionBtn: React.CSSProperties = { ...baseBtn, background: '#38BDF8', color: '#fff', border: 'none' };
    const ghost: React.CSSProperties = { ...baseBtn, background: '#fff', color: '#0B1C24' };

    if (step === 'pick') {
      return (
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '12px 24px', gap: 8 }}>
          <button style={ghost} onClick={onClose}>Cancel</button>
        </div>
      );
    }
    if (step === 'context') {
      return (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 24px', gap: 8 }}>
          <div style={{ fontSize: 11, color: '#5A7A8A' }}>
            Tier-gated: Pro+. Cost basis is metered against your ARGUS data plan.
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={ghost} onClick={onClose}>Cancel</button>
            <button style={primary} onClick={runGenerate} disabled={!activeSiteId || !kind}>
              Generate
            </button>
          </div>
        </div>
      );
    }
    if (step === 'generating') {
      return (
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '12px 24px', gap: 8 }}>
          <button style={ghost} onClick={onClose}>Cancel</button>
        </div>
      );
    }
    // result
    return (
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 24px', gap: 8 }}>
        <div style={{ fontSize: 11, color: '#5A7A8A' }}>
          {result && (
            <>
              <strong>{result.tokens_used.toLocaleString()}</strong> tokens ·{' '}
              <strong>{(result.latency_ms / 1000).toFixed(1)}s</strong> latency ·{' '}
              draft <code style={{ fontSize: 10 }}>{result.draft_block_id.slice(0, 8)}</code>
            </>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={ghost} onClick={onClose}>Discard</button>
          <button style={ghost} onClick={runGenerate} disabled={!activeSiteId || !kind}>
            Regenerate
          </button>
          <button
            style={accepted ? { ...arionBtn, opacity: 0.6, cursor: 'default' } : arionBtn}
            onClick={runAccept}
            disabled={accepting || accepted}
          >
            {accepted ? 'Accepted' : accepting ? 'Accepting...' : 'Accept'}
          </button>
        </div>
      </div>
    );
  }
}

/* ──────────────────────────────────────────────────────────────────────── */

function KindPicker({ onPick }: { onPick: (k: AiBlockKind) => void }) {
  return (
    <div>
      <div style={{ fontSize: 12, color: '#5A7A8A', marginBottom: 14 }}>
        Pick what kind of block to generate. Each runs a dedicated emitter
        tuned for that section type. You can run more than one and assemble
        them later.
      </div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
        gap: 12,
      }}>
        {BLOCK_KINDS.map((b) => (
          <button
            key={b.kind}
            onClick={() => onPick(b.kind)}
            style={{
              textAlign: 'left',
              background: '#fff',
              border: '1px solid #E5EEF2',
              borderRadius: 8,
              padding: 14,
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              minHeight: 120,
              transition: 'border-color 0.15s, box-shadow 0.15s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = '#38BDF8';
              e.currentTarget.style.boxShadow = '0 2px 8px rgba(56,189,248,0.15)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = '#E5EEF2';
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            <div style={{
              width: 32, height: 32, borderRadius: 6,
              background: 'rgba(56,189,248,0.12)', color: '#0284c7',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 700, fontSize: 14,
            }}>{b.icon}</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#0B1C24' }}>{b.label}</div>
            <div style={{ fontSize: 11, color: '#5A7A8A', lineHeight: 1.4 }}>{b.description}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

function ContextForm({
  kind, tone, setTone, industry, setIndustry, extraNotes, setExtraNotes, onChangeKind,
}: {
  kind: AiBlockKind;
  tone: string; setTone: (v: string) => void;
  industry: string; setIndustry: (v: string) => void;
  extraNotes: string; setExtraNotes: (v: string) => void;
  onChangeKind: () => void;
}) {
  const meta = BLOCK_KINDS.find((b) => b.kind === kind);
  return (
    <div>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: '#F8FAFC', border: '1px solid #E5EEF2',
        padding: '12px 14px', borderRadius: 6, marginBottom: 14,
      }}>
        <div>
          <div style={{ fontSize: 11, color: '#5A7A8A', textTransform: 'uppercase', letterSpacing: 0.6 }}>
            Selected block
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#0B1C24' }}>{meta?.label}</div>
          <div style={{ fontSize: 11, color: '#5A7A8A', marginTop: 2 }}>{meta?.description}</div>
        </div>
        <button
          onClick={onChangeKind}
          style={{
            background: 'transparent', border: '1px solid #CBD5E1',
            padding: '6px 12px', borderRadius: 4, cursor: 'pointer',
            fontSize: 12, color: '#0B1C24',
          }}
        >Change</button>
      </div>

      <div style={{ fontSize: 12, color: '#5A7A8A', marginBottom: 12 }}>
        Optional overrides. The emitter already pulls site context (brand,
        services, location) from your ARION questionnaire — these just
        let you steer the copy for this specific run.
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="Tone" placeholder="e.g. punchy, professional, friendly" value={tone} onChange={setTone} />
        <Field label="Industry hint" placeholder="e.g. trades-focused, B2B SaaS" value={industry} onChange={setIndustry} />
      </div>
      <div style={{ marginTop: 12 }}>
        <Field
          label="Extra notes"
          placeholder="Anything the emitter should know about this section."
          value={extraNotes}
          onChange={setExtraNotes}
          multiline
        />
      </div>
    </div>
  );
}

function Field({
  label, placeholder, value, onChange, multiline,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
}) {
  const sharedStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box',
    border: '1px solid #CBD5E1', borderRadius: 4,
    padding: '8px 10px', fontSize: 12, fontFamily: 'inherit',
    background: '#fff',
  };
  return (
    <div>
      <div style={{ fontSize: 11, color: '#5A7A8A', marginBottom: 4, fontWeight: 600 }}>{label}</div>
      {multiline ? (
        <textarea
          rows={3}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          style={{ ...sharedStyle, resize: 'vertical', minHeight: 60 }}
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          style={sharedStyle}
        />
      )}
    </div>
  );
}

function GeneratingPanel({ elapsedMs, kind }: { elapsedMs: number; kind: AiBlockKind }) {
  const seconds = (elapsedMs / 1000).toFixed(1);
  const meta = BLOCK_KINDS.find((b) => b.kind === kind);
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: '40px 24px', textAlign: 'center',
      minHeight: 240,
    }}>
      <div style={{
        width: 48, height: 48, borderRadius: '50%',
        border: '4px solid rgba(56,189,248,0.2)',
        borderTopColor: '#38BDF8',
        animation: 'spin 0.8s linear infinite',
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div style={{ fontSize: 14, fontWeight: 600, color: '#0B1C24', marginTop: 16 }}>
        Generating {meta?.label} block...
      </div>
      <div style={{ fontSize: 12, color: '#5A7A8A', marginTop: 6 }}>
        Elapsed: <strong>{seconds}s</strong>
      </div>
      <div style={{ fontSize: 11, color: '#5A7A8A', marginTop: 14, maxWidth: 360 }}>
        Typical block generation runs 5-30 seconds depending on length and
        emitter complexity. Hero and CTA finish fastest; FAQ and Services
        are the longest.
      </div>
    </div>
  );
}

function ResultPanel({
  kind, result, showElementorView, setShowElementorView, accepted,
}: {
  kind: AiBlockKind;
  result: GenResult;
  showElementorView: boolean;
  setShowElementorView: (v: boolean) => void;
  accepted: boolean;
}) {
  const meta = BLOCK_KINDS.find((b) => b.kind === kind);
  const json = result.block_json;
  return (
    <div>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 12,
      }}>
        <div>
          <div style={{ fontSize: 11, color: '#5A7A8A', textTransform: 'uppercase', letterSpacing: 0.6 }}>
            Generated draft {accepted ? '· accepted' : ''}
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#0B1C24' }}>{meta?.label} block</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#5A7A8A' }}>
          <span>Preview as Elementor</span>
          <label style={{ position: 'relative', display: 'inline-block', width: 36, height: 20 }}>
            <input
              type="checkbox"
              checked={showElementorView}
              onChange={(e) => setShowElementorView(e.target.checked)}
              style={{ opacity: 0, width: 0, height: 0 }}
            />
            <span style={{
              position: 'absolute', cursor: 'pointer', inset: 0,
              background: showElementorView ? '#38BDF8' : '#CBD5E1',
              borderRadius: 20, transition: 'background 0.15s',
            }}>
              <span style={{
                position: 'absolute', width: 14, height: 14, top: 3,
                left: showElementorView ? 19 : 3, background: '#fff',
                borderRadius: '50%', transition: 'left 0.15s',
              }} />
            </span>
          </label>
        </div>
      </div>

      {showElementorView ? (
        <ElementorShapeView json={json} />
      ) : (
        <pre style={{
          background: '#0B1C24', color: '#E5EEF2', padding: 14, borderRadius: 6,
          fontSize: 11, lineHeight: 1.5, maxHeight: 360, overflow: 'auto',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        }}>
          {JSON.stringify(json, null, 2)}
        </pre>
      )}

      {accepted && (
        <div style={{
          marginTop: 12, padding: '10px 14px',
          background: 'rgba(29,158,117,0.08)', border: '1px solid #1D9E75',
          borderRadius: 6, fontSize: 12, color: '#0B1C24',
        }}>
          Draft accepted — it&apos;s now eligible for assembly + WP injection
          from the Page Assembler.
        </div>
      )}
    </div>
  );
}

/**
 * Lightweight schematic of the block_json shape so admins can see top-level
 * element keys + nesting depth without us actually rendering Elementor.
 * Full WYSIWYG render is deferred — backend's WP injector is the source of
 * truth for layout.
 */
function ElementorShapeView({ json }: { json: Record<string, any> }) {
  function renderNode(node: any, depth: number, keyPath: string): React.ReactNode {
    if (node == null) return <span style={{ color: '#9CA3AF' }}>null</span>;
    if (typeof node !== 'object') {
      const s = String(node);
      const short = s.length > 100 ? s.slice(0, 100) + '...' : s;
      return <span style={{ color: '#0284c7' }}>{JSON.stringify(short)}</span>;
    }
    const isArray = Array.isArray(node);
    const entries: Array<[string, any]> = isArray
      ? (node as any[]).map((v, i) => [String(i), v] as [string, any])
      : (Object.entries(node) as Array<[string, any]>);
    return (
      <div style={{ marginLeft: depth === 0 ? 0 : 14 }}>
        {entries.map(([k, v]) => {
          const childKey = `${keyPath}.${k}`;
          const isLeaf = v == null || typeof v !== 'object';
          return (
            <div key={childKey} style={{ marginBottom: 4 }}>
              <span style={{ color: '#1D9E75', fontWeight: 600 }}>{isArray ? `[${k}]` : k}</span>
              <span style={{ color: '#5A7A8A' }}>: </span>
              {isLeaf ? renderNode(v, depth + 1, childKey) : (
                <>
                  <span style={{ color: '#5A7A8A', fontSize: 10 }}>
                    {Array.isArray(v) ? `(array, ${v.length})` : `(${Object.keys(v).length} keys)`}
                  </span>
                  {renderNode(v, depth + 1, childKey)}
                </>
              )}
            </div>
          );
        })}
      </div>
    );
  }
  return (
    <div style={{
      background: '#F8FAFC', border: '1px solid #E5EEF2', borderRadius: 6,
      padding: 14, fontSize: 11, lineHeight: 1.5, maxHeight: 360, overflow: 'auto',
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    }}>
      {renderNode(json, 0, '$')}
    </div>
  );
}
