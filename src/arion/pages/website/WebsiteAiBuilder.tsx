import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useArionContext } from '../../useArionContext';
import { Card, Loading, EmptyPanel } from '../../components/Ui';
import { AiBlockGenerator } from '../../components/AiBlockGenerator';
import { AiPageAssembler } from '../../components/AiPageAssembler';
import type { AiBlockKind } from '../../../lib/arionApi';
import * as arionApi from '../../../lib/arionApi';
import { useAppState } from '../../../app/AppState';
import { useAccessToken } from '../../../auth/useAccessToken';

// Section build cost model (Brandon-locked 2026-06-28).
// Cost = base + extraParagraphs + columns×3 + items×2 + images×(std?8:hd?16) + form?5
// Real AI cost-basis is tracked per-call in lumen.ai_call_audit (input_tokens,
// output_tokens, image_count, cost_basis_usd) so credit prices can be reviewed
// quarterly against actual spend.
// TODO F-Onb-D10: move COSTS + BLOCK_DEFAULTS into a GET /arion/ai-builder/pricing
// endpoint so DB is source of truth.
export const SECTION_COSTS = {
  base: 2,
  extraParagraph: 1,
  perColumn: 3,
  perItem: 2,
  imageStd: 8,
  imageHd: 16,
  form: 5,
} as const;

interface BlockDefaults {
  paragraphs: number; // 1 = single paragraph (base), 2+ adds extraParagraph
  columns: number;
  items: number;
  images: number;
  imageQuality: 'std' | 'hd';
  form: boolean;
}

export const BLOCK_DEFAULTS: Record<string, BlockDefaults> = {
  hero:         { paragraphs: 1, columns: 0, items: 0, images: 1, imageQuality: 'std', form: false },
  services:     { paragraphs: 1, columns: 3, items: 0, images: 0, imageQuality: 'std', form: false },
  testimonials: { paragraphs: 1, columns: 0, items: 3, images: 0, imageQuality: 'std', form: false },
  cta:          { paragraphs: 1, columns: 2, items: 0, images: 0, imageQuality: 'std', form: true },
  about:        { paragraphs: 3, columns: 0, items: 0, images: 1, imageQuality: 'std', form: false },
  faq:          { paragraphs: 1, columns: 0, items: 5, images: 0, imageQuality: 'std', form: false },
  gallery:      { paragraphs: 1, columns: 0, items: 0, images: 6, imageQuality: 'std', form: false },
  contact:      { paragraphs: 1, columns: 1, items: 0, images: 0, imageQuality: 'std', form: true },
};

export function computeSectionCost(cfg: BlockDefaults): number {
  let c = SECTION_COSTS.base;
  c += Math.max(0, cfg.paragraphs - 1) * SECTION_COSTS.extraParagraph;
  c += cfg.columns * SECTION_COSTS.perColumn;
  c += cfg.items * SECTION_COSTS.perItem;
  c += cfg.images * (cfg.imageQuality === 'hd' ? SECTION_COSTS.imageHd : SECTION_COSTS.imageStd);
  if (cfg.form) c += SECTION_COSTS.form;
  return c;
}

const MIN_BLOCK_COST = SECTION_COSTS.base; // cheapest possible section if user strips everything

/**
 * Website AI Builder — F-AI-WB Phase 1 (2026-06-20)
 *
 * Workspace page that surfaces the 8-emitter block generator + page
 * assembler. Lives under ARION → Website → AI Builder.
 *
 * Tier-gate REMOVED 2026-06-28 — Brandon clarified: included in ALL ARION
 * tiers; only credit balance gates each action. If the user lacks credits to
 * run an action, the emitter / page-assembler call returns an insufficient-
 * credits response and the UI prompts them to top up.
 *
 * Phase 2+ TODO (see overnight-report):
 *   - Surface the per-section "Generate with IL" buttons on the live page
 *     editor (when one exists in Portal).
 *   - Pull `ANTHROPIC-API-KEY` from kv-IADM-prod, set on func-arion-api-prod.
 *   - Wire actual Elementor preview render (currently shows JSON shape).
 */
export function WebsiteAiBuilder() {
  const { selectedSite, activeSiteId, loading } = useArionContext();
  const { activeTenantId } = useAppState();
  const { getToken } = useAccessToken();
  const [generatorOpen, setGeneratorOpen] = useState(false);
  const [generatorKind, setGeneratorKind] = useState<AiBlockKind | undefined>(undefined);
  const [assemblerOpen, setAssemblerOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
    if (!activeTenantId) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await getToken();
        const baseUrl = (import.meta.env.VITE_ARION_API_BASE_URL as string) || '';
        const res = await arionApi.getArgusBalance({ baseUrl, bearerToken: token.accessToken, tenantId: activeTenantId });
        if (!cancelled) {
          const b = (res as any)?.balance ?? (res as any)?.data?.balance ?? null;
          setBalance(typeof b === 'number' ? b : null);
        }
      } catch { /* leave null */ }
    })();
    return () => { cancelled = true; };
  }, [activeTenantId, getToken, refreshKey]);

  const canAffordBlockGen = balance == null || balance >= MIN_BLOCK_COST;

  if (loading) return <Loading />;
  if (!selectedSite) return <EmptyPanel message="No site selected." />;

  function openGeneratorForKind(kind?: AiBlockKind) {
    setGeneratorKind(kind);
    setGeneratorOpen(true);
  }

  return (
    <div>
        <div style={{
          background: 'linear-gradient(to right, rgba(56,189,248,0.12), rgba(56,189,248,0.02))',
          border: '1px solid rgba(56,189,248,0.25)',
          padding: '14px 18px',
          borderRadius: 6,
          marginBottom: 16,
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap',
        }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#0B1C24' }}>
              Generate sections with AI, then publish them to your site
            </div>
            <div style={{ fontSize: 12, color: '#5A7A8A', marginTop: 4, maxWidth: 720 }}>
              Pick a section type below. AI drafts three options using your brand
              and industry. Accept the ones you like and publish to your site.
            </div>
          </div>
          {/* Credit balance pill */}
          <div style={{
            background: '#fff', border: '1px solid #CBD5E1',
            borderRadius: 99, padding: '4px 12px',
            display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
          }}>
            <span style={{ fontSize: 11, color: '#5A7A8A', fontWeight: 500 }}>Credits</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: balance != null && balance < MIN_BLOCK_COST ? '#D85A30' : '#0B1C24' }}>
              {balance == null ? '—' : balance.toLocaleString()}
            </span>
            <Link to="/app/services/arion_usage" style={{ fontSize: 11, color: '#2563eb', textDecoration: 'none', fontWeight: 600, marginLeft: 4 }}>
              {balance != null && balance < MIN_BLOCK_COST ? 'Top up →' : 'Manage'}
            </Link>
          </div>
        </div>

        {/* Insufficient credits banner */}
        {balance != null && balance < MIN_BLOCK_COST && (
          <div style={{
            background: '#FEF3C7', border: '1px solid #FCD34D',
            borderRadius: 6, padding: '10px 14px', marginBottom: 14,
            fontSize: 12, color: '#92400E',
          }}>
            You need at least <strong>{MIN_BLOCK_COST} credits</strong> to generate even the simplest section. <Link to="/app/services/arion_usage" style={{ color: '#92400E', fontWeight: 700 }}>Top up your credits →</Link>
          </div>
        )}

        {/* Top actions */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
          <button
            onClick={() => openGeneratorForKind(undefined)}
            style={{ ...primaryBtn, opacity: (canAffordBlockGen && activeSiteId) ? 1 : 0.5, cursor: (canAffordBlockGen && activeSiteId) ? 'pointer' : 'not-allowed' }}
            disabled={!activeSiteId || !canAffordBlockGen}
            title={!canAffordBlockGen ? `Need ${MIN_BLOCK_COST}+ credits to generate` : 'Configure your section in the next step'}
          >Generate a section · from {MIN_BLOCK_COST} credits</button>
          <button
            onClick={() => setAssemblerOpen(true)}
            style={ghostBtn}
            disabled={!activeSiteId}
          >Publish accepted sections to my site (free)</button>
        </div>

        {/* Block kind quick-launch grid */}
        <Card title="Quick launch — pick a block kind" subtitle="Or use the generic button above to pick from inside the drawer.">
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
            gap: 10,
          }}>
            {QUICK_KINDS.map((b) => (
              <button
                key={b.kind}
                onClick={() => openGeneratorForKind(b.kind)}
                disabled={!canAffordBlockGen}
                title={!canAffordBlockGen ? `Need ${MIN_BLOCK_COST}+ credits to generate` : ''}
                style={{
                  textAlign: 'left',
                  background: '#fff',
                  border: '1px solid #E5EEF2',
                  borderRadius: 6,
                  padding: 12,
                  cursor: canAffordBlockGen ? 'pointer' : 'not-allowed',
                  opacity: canAffordBlockGen ? 1 : 0.55,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#0B1C24' }}>{b.label}</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#2563eb', whiteSpace: 'nowrap' }}>
                    from {computeSectionCost(BLOCK_DEFAULTS[b.kind] || BLOCK_DEFAULTS.hero)} credits
                  </div>
                </div>
                <div style={{ fontSize: 11, color: '#5A7A8A', lineHeight: 1.4 }}>{b.description}</div>
              </button>
            ))}
          </div>
        </Card>

        {/* How it works */}
        <div style={{ marginTop: 14 }}>
          <Card title="How it works">
            <ol style={{ paddingLeft: 18, margin: 0, fontSize: 12, color: '#0B1C24', lineHeight: 1.7 }}>
              <li><strong>Generate.</strong> Pick a block kind. IL drafts copy + layout using your site context (brand, services, location).</li>
              <li><strong>Accept.</strong> Each generated draft persists to <code>arion.site_block_draft</code>. Accept the ones you want; discard the rest.</li>
              <li><strong>Assemble.</strong> Open the assembler, order accepted drafts, optionally pick a target page (blank = new).</li>
              <li><strong>Publish.</strong> The WP injector pushes Elementor JSON to the site and returns an edit URL.</li>
            </ol>
          </Card>
        </div>

        <AiBlockGenerator
          open={generatorOpen}
          onClose={() => setGeneratorOpen(false)}
          initialKind={generatorKind}
          onAccepted={() => setRefreshKey((k) => k + 1)}
        />
        <AiPageAssembler
          open={assemblerOpen}
          onClose={() => setAssemblerOpen(false)}
          refreshKey={refreshKey}
        />
    </div>
  );
}

const primaryBtn: React.CSSProperties = {
  background: '#2563eb', color: '#fff', border: 'none',
  borderRadius: 6, padding: '10px 18px', fontSize: 13, fontWeight: 600,
  cursor: 'pointer',
};
const ghostBtn: React.CSSProperties = {
  background: '#fff', color: '#0B1C24', border: '1px solid #CBD5E1',
  borderRadius: 6, padding: '10px 18px', fontSize: 13, fontWeight: 600,
  cursor: 'pointer',
};

const QUICK_KINDS: Array<{ kind: AiBlockKind; label: string; description: string }> = [
  { kind: 'hero',         label: 'Hero',          description: 'Above-the-fold headline + CTA.' },
  { kind: 'services',     label: 'Services',      description: 'Service offerings card grid.' },
  { kind: 'testimonials', label: 'Testimonials',  description: 'Customer quotes carousel.' },
  { kind: 'cta',          label: 'Call to Action', description: 'Mid-page conversion block.' },
  { kind: 'about',        label: 'About',         description: 'Brand story paragraph + stats.' },
  { kind: 'faq',          label: 'FAQ',           description: 'Q&A accordion.' },
  { kind: 'gallery',      label: 'Gallery',       description: 'Image grid section.' },
  { kind: 'contact',      label: 'Contact',       description: 'Contact info + form.' },
];
