import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useArionContext } from '../useArionContext';
import { IadmModal } from '../../components/IadmModal';
import type { AiBlockKind } from '../../lib/arionApi';
import * as arionApiLib from '../../lib/arionApi';
import { useAppState } from '../../app/AppState';
import { useAccessToken } from '../../auth/useAccessToken';
/* The credit arithmetic that used to be imported here is GONE (P18): the price
   of writing a section is one row in argus.action_pricing, read from
   GET /arion/sites/:siteId/ai-pricing, and the server charges exactly it. The
   configurator's defaults are now what a section LOOKS like, not what it
   costs. */

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

/** What a section of each kind normally looks like. Not a price. */
const SHAPE_DEFAULTS: Record<string, {
  paragraphs: number; columns: number; items: number; images: number;
  imageQuality: 'std' | 'hd'; form: boolean;
}> = {
  hero:         { paragraphs: 1, columns: 0, items: 0, images: 1, imageQuality: 'std', form: false },
  services:     { paragraphs: 1, columns: 3, items: 0, images: 0, imageQuality: 'std', form: false },
  testimonials: { paragraphs: 1, columns: 0, items: 3, images: 0, imageQuality: 'std', form: false },
  cta:          { paragraphs: 1, columns: 2, items: 0, images: 0, imageQuality: 'std', form: true },
  about:        { paragraphs: 3, columns: 0, items: 0, images: 1, imageQuality: 'std', form: false },
  faq:          { paragraphs: 1, columns: 0, items: 5, images: 0, imageQuality: 'std', form: false },
  gallery:      { paragraphs: 1, columns: 0, items: 0, images: 6, imageQuality: 'std', form: false },
  contact:      { paragraphs: 1, columns: 1, items: 0, images: 0, imageQuality: 'std', form: true },
};

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
  const { activeTenantId } = useAppState();
  const { getToken } = useAccessToken();

  const [step, setStep] = useState<Step>(initialKind ? 'context' : 'pick');
  const [kind, setKind] = useState<AiBlockKind | null>(initialKind || null);
  const [tone, setTone] = useState('');
  const [industry, setIndustry] = useState('');
  const [extraNotes, setExtraNotes] = useState('');
  // Section configurator state — drives the live cost computation.
  const [userPrompt, setUserPrompt] = useState('');
  const [paragraphs, setParagraphs] = useState(1);
  const [columns, setColumns] = useState(0);
  const [items, setItems] = useState(0);
  const [withImage, setWithImage] = useState(false);
  const [imageQuality, setImageQuality] = useState<'std' | 'hd'>('std');
  const [imagePrompt, setImagePrompt] = useState('');
  const [withForm, setWithForm] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const [result, setResult] = useState<GenResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showElementorView, setShowElementorView] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [accepted, setAccepted] = useState(false);

  // A sensible SHAPE for each kind of section — how many columns, how many
  // items, whether it has a picture. These used to double as a price list and
  // that is what made them a defect: the numbers were multiplied into a credit
  // cost the server never charged.
  useEffect(() => {
    if (!kind) return;
    const def = SHAPE_DEFAULTS[kind];
    if (!def) return;
    setParagraphs(def.paragraphs);
    setColumns(def.columns);
    setItems(def.items);
    setWithImage(def.images > 0);
    setImageQuality(def.imageQuality);
    setWithForm(def.form);
  }, [kind]);

  // Fetch current ARGUS balance whenever the drawer opens.
  useEffect(() => {
    if (!open || !activeTenantId) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await getToken();
        const baseUrl = (import.meta.env.VITE_ARION_API_BASE_URL as string) || '';
        const res = await arionApiLib.getArgusBalance({ baseUrl, bearerToken: token.accessToken, tenantId: activeTenantId });
        if (!cancelled) {
          const b = (res as any)?.balance ?? (res as any)?.data?.balance ?? null;
          setBalance(typeof b === 'number' ? b : null);
        }
      } catch { /* leave null */ }
    })();
    return () => { cancelled = true; };
  }, [open, activeTenantId, getToken]);

  // THE price, from the server (P18). It used to be computed here from the
  // configurator's own coefficients — a number the server never charged. It is
  // one row in argus.action_pricing now, and writing a section costs the same
  // whatever shape it is. `null` means we could not read it, and a price we
  // cannot read is a price we do not quote.
  const [price, setPrice] = useState<number | null>(null);
  useEffect(() => {
    if (!open || !activeSiteId) return;
    let cancelled = false;
    (async () => {
      try {
        const res: any = await arionApi.getSiteAiPricing(activeSiteId);
        if (!cancelled) {
          const c = res?.data?.actions?.generate?.credits;
          setPrice(typeof c === 'number' ? c : null);
        }
      } catch { /* leave null */ }
    })();
    return () => { cancelled = true; };
  }, [open, activeSiteId, arionApi]);

  const canAfford = balance == null || price == null || balance >= price;

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
    if (userPrompt.trim()) ctx.user_prompt = userPrompt.trim();
    // Configurator passes — backend can opt in to honor each.
    ctx.paragraphs = paragraphs;
    ctx.columns = columns;
    ctx.items = items;
    ctx.with_image = withImage;
    if (withImage) {
      ctx.image_quality = imageQuality;
      if (imagePrompt.trim()) ctx.image_prompt = imagePrompt.trim();
    }
    ctx.with_form = withForm;
    // Nothing about the price travels with the request any more: the server
    // reads argus.action_pricing and charges it. A client-side estimate in the
    // body was only ever a second opinion about a number we do not own.
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
          <>
            <ContextForm
              kind={kind}
              tone={tone} setTone={setTone}
              industry={industry} setIndustry={setIndustry}
              extraNotes={extraNotes} setExtraNotes={setExtraNotes}
              onChangeKind={() => setStep('pick')}
            />
            <SectionConfigurator
              kind={kind}
              userPrompt={userPrompt} setUserPrompt={setUserPrompt}
              paragraphs={paragraphs} setParagraphs={setParagraphs}
              columns={columns} setColumns={setColumns}
              items={items} setItems={setItems}
              withImage={withImage} setWithImage={setWithImage}
              imageQuality={imageQuality} setImageQuality={setImageQuality}
              imagePrompt={imagePrompt} setImagePrompt={setImagePrompt}
              withForm={withForm} setWithForm={setWithForm}
              price={price}
              balance={balance}
              canAfford={canAfford}
            />
          </>
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
            Included on all ARION plans. Costs adjust based on what you add to the section.
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={ghost} onClick={onClose}>Cancel</button>
            <button
              style={canAfford ? primary : { ...primary, opacity: 0.55, cursor: 'not-allowed' }}
              onClick={runGenerate}
              disabled={!activeSiteId || !kind || !canAfford}
              title={!canAfford && price != null ? `This uses ${price} credits — you have ${balance ?? 0}` : ''}
            >
              {price == null
                ? 'Generate'
                : canAfford
                  ? (price === 0 ? 'Generate · included' : `Generate · ${price} credits`)
                  : `Need ${price} credits`}
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

function SectionConfigurator({
  kind,
  userPrompt, setUserPrompt,
  paragraphs, setParagraphs,
  columns, setColumns,
  items, setItems,
  withImage, setWithImage,
  imageQuality, setImageQuality,
  imagePrompt, setImagePrompt,
  withForm, setWithForm,
  price,
  balance,
  canAfford,
}: {
  kind: AiBlockKind;
  userPrompt: string; setUserPrompt: (v: string) => void;
  paragraphs: number; setParagraphs: (v: number) => void;
  columns: number; setColumns: (v: number) => void;
  items: number; setItems: (v: number) => void;
  withImage: boolean; setWithImage: (v: boolean) => void;
  imageQuality: 'std' | 'hd'; setImageQuality: (v: 'std' | 'hd') => void;
  imagePrompt: string; setImagePrompt: (v: string) => void;
  withForm: boolean; setWithForm: (v: boolean) => void;
  /** From argus.action_pricing. `null` means we could not read it. */
  price: number | null;
  balance: number | null;
  canAfford: boolean;
}) {
  const allowColumns = ['services', 'cta', 'contact'].includes(kind);
  const allowItems = ['testimonials', 'faq', 'gallery'].includes(kind);
  const allowForm = ['cta', 'contact'].includes(kind);
  const itemsLabel = kind === 'gallery' ? 'Images in gallery' : kind === 'testimonials' ? 'Testimonials' : kind === 'faq' ? 'Questions' : 'Items';

  const rowStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '10px 12px', border: '1px solid #E5EEF2', borderRadius: 6,
    background: '#fff', marginBottom: 8,
  };
  const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: '#0B1C24' };
  const hintStyle: React.CSSProperties = { fontSize: 11, color: '#5A7A8A', marginTop: 2 };

  return (
    <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #E5EEF2' }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#0B1C24', marginBottom: 4 }}>
        Tell us what you want
      </div>
      <div style={{ fontSize: 12, color: '#5A7A8A', marginBottom: 12 }}>
        Describe the section like you would to a designer. The cost on the Generate button updates as you add to it.
      </div>

      <Field
        label="What should this section say or do?"
        placeholder={`e.g. ${kind === 'hero' ? 'Bold welcome with our pricing offer and a "Get a quote" button.' : kind === 'services' ? 'Three service tiles — Lawn care, Snow removal, Tree trimming.' : 'Friendly section about us with a clear next step.'}`}
        value={userPrompt}
        onChange={setUserPrompt}
        multiline
      />

      <div style={{ marginTop: 12 }}>
        <NumberRow label="Paragraphs of copy" hint="1 paragraph included. Extra paragraphs add 1 credit each." min={1} max={5} value={paragraphs} setValue={setParagraphs} />

        {allowColumns && (
          <NumberRow label="Columns / cards" hint="Side-by-side blocks of copy. Each column adds 3 credits." min={0} max={6} value={columns} setValue={setColumns} />
        )}

        {allowItems && (
          <NumberRow label={itemsLabel} hint="Each item adds 2 credits." min={0} max={12} value={items} setValue={setItems} />
        )}

        <div style={rowStyle}>
          <div style={{ flex: 1 }}>
            <div style={labelStyle}>Generate an AI image for this section</div>
            <div style={hintStyle}>Standard image: 8 credits. Higher quality: 16 credits.</div>
          </div>
          <ToggleSwitch checked={withImage} onChange={setWithImage} />
        </div>

        {withImage && (
          <div style={{ marginLeft: 12, padding: '10px 12px', borderLeft: '2px solid #38BDF8', marginBottom: 8, background: '#F8FAFC' }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <button
                type="button"
                onClick={() => setImageQuality('std')}
                style={{
                  flex: 1, padding: '6px 10px', borderRadius: 4, fontSize: 12, cursor: 'pointer',
                  border: imageQuality === 'std' ? '2px solid #38BDF8' : '1px solid #CBD5E1',
                  background: imageQuality === 'std' ? '#E0F2FE' : '#fff',
                  fontWeight: imageQuality === 'std' ? 600 : 400, color: '#0B1C24',
                }}
              >Standard · 8 credits</button>
              <button
                type="button"
                onClick={() => setImageQuality('hd')}
                style={{
                  flex: 1, padding: '6px 10px', borderRadius: 4, fontSize: 12, cursor: 'pointer',
                  border: imageQuality === 'hd' ? '2px solid #38BDF8' : '1px solid #CBD5E1',
                  background: imageQuality === 'hd' ? '#E0F2FE' : '#fff',
                  fontWeight: imageQuality === 'hd' ? 600 : 400, color: '#0B1C24',
                }}
              >Higher quality · 16 credits</button>
            </div>
            <Field
              label="Describe the image"
              placeholder="e.g. A warm overhead shot of a freshly mowed front lawn at sunset."
              value={imagePrompt}
              onChange={setImagePrompt}
              multiline
            />
          </div>
        )}

        {allowForm && (
          <div style={rowStyle}>
            <div style={{ flex: 1 }}>
              <div style={labelStyle}>Include a contact form</div>
              <div style={hintStyle}>Adds a name + email + message form. 5 credits.</div>
            </div>
            <ToggleSwitch checked={withForm} onChange={setWithForm} />
          </div>
        )}
      </div>

      <div style={{
        marginTop: 14, padding: '12px 14px', borderRadius: 6,
        background: canAfford ? '#F0FDF4' : '#FEF2F2',
        border: `1px solid ${canAfford ? '#1D9E75' : '#DC2626'}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div>
          <div style={{ fontSize: 11, color: '#5A7A8A', textTransform: 'uppercase', letterSpacing: 0.6 }}>
            This section will cost
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#0B1C24' }}>
            {price == null ? 'we will tell you' : price === 0 ? 'nothing' : `${price} credits`}
          </div>
        </div>
        {balance != null && (
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 11, color: '#5A7A8A' }}>Your balance</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: canAfford ? '#0B1C24' : '#DC2626' }}>
              {balance.toLocaleString()} credits
            </div>
          </div>
        )}
      </div>
      {!canAfford && (
        <div style={{ marginTop: 8, fontSize: 12, color: '#DC2626' }}>
          You don&apos;t have enough credits for this section. <Link to="/app/settings/argus-data-plan" style={{ color: '#DC2626', fontWeight: 600 }}>Top up your data plan</Link> or simplify the section to fit your balance.
        </div>
      )}
    </div>
  );
}

function NumberRow({
  label, hint, min, max, value, setValue,
}: {
  label: string; hint: string; min: number; max: number;
  value: number; setValue: (v: number) => void;
}) {
  const btn: React.CSSProperties = {
    width: 28, height: 28, borderRadius: 4, border: '1px solid #CBD5E1',
    background: '#fff', cursor: 'pointer', fontSize: 16, fontWeight: 600, color: '#0B1C24',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  };
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '10px 12px', border: '1px solid #E5EEF2', borderRadius: 6,
      background: '#fff', marginBottom: 8,
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#0B1C24' }}>{label}</div>
        <div style={{ fontSize: 11, color: '#5A7A8A', marginTop: 2 }}>{hint}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button type="button" style={btn} onClick={() => setValue(Math.max(min, value - 1))} disabled={value <= min}>−</button>
        <div style={{ minWidth: 24, textAlign: 'center', fontWeight: 600, fontSize: 14, color: '#0B1C24' }}>{value}</div>
        <button type="button" style={btn} onClick={() => setValue(Math.min(max, value + 1))} disabled={value >= max}>+</button>
      </div>
    </div>
  );
}

function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ position: 'relative', display: 'inline-block', width: 40, height: 22, cursor: 'pointer' }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ opacity: 0, width: 0, height: 0 }}
      />
      <span style={{
        position: 'absolute', inset: 0,
        background: checked ? '#38BDF8' : '#CBD5E1',
        borderRadius: 22, transition: 'background 0.15s',
      }}>
        <span style={{
          position: 'absolute', width: 16, height: 16, top: 3,
          left: checked ? 21 : 3, background: '#fff',
          borderRadius: '50%', transition: 'left 0.15s',
        }} />
      </span>
    </label>
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
