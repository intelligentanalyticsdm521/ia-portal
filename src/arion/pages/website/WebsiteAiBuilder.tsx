import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useArionContext } from '../../useArionContext';
import { Card, Loading, EmptyPanel } from '../../components/Ui';
import { AiBlockGenerator } from '../../components/AiBlockGenerator';
import { AiPageAssembler } from '../../components/AiPageAssembler';
import type { AiBlockKind, AiPricing } from '../../../lib/arionApi';
import * as arionApi from '../../../lib/arionApi';
import { useAppState } from '../../../app/AppState';
import { useAccessToken } from '../../../auth/useAccessToken';

/* ── THE PRICE COMES FROM THE SERVER (P18, 2026-09-08) ────────────────────
 *
 * What used to be here: a `SECTION_COSTS` table (base 2, +3 a column, +2 an
 * item, +8 or +16 an image, +5 for a form), a `BLOCK_DEFAULTS` map, a
 * `computeSectionCost` function, and this TODO:
 *
 *     // TODO F-Onb-D10: move COSTS + BLOCK_DEFAULTS into a
 *     //                 GET /arion/ai-builder/pricing endpoint so DB is
 *     //                 source of truth.
 *
 * The server charged NONE of it. `grep meterAndAudit routes/arion/blocks.js`
 * was zero hits: generating a section quoted "from 8 credits" and debited
 * nothing at all, while a dollar ceiling nobody was shown did the actual
 * limiting. A price a client reads and a price we take have to be the same
 * number (memory: feedback_no_fabricated_catalog).
 *
 * They are now: both actions are rows in `argus.action_pricing`, the server
 * charges through the one metering path, and this page reads
 * `GET /arion/sites/:siteId/ai-pricing` — the endpoint that TODO asked for. A
 * price we cannot read is a price we do not quote.
 * ---------------------------------------------------------------------- */

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
  // `ctxApi` and not `arionApi`: the module import of the same name is right
  // above, and shadowing it here silently broke the balance read.
  const { selectedSite, activeSiteId, loading, arionApi: ctxApi } = useArionContext();
  const { activeTenantId } = useAppState();
  const { getToken } = useAccessToken();
  const [generatorOpen, setGeneratorOpen] = useState(false);
  const [generatorKind, setGeneratorKind] = useState<AiBlockKind | undefined>(undefined);
  const [assemblerOpen, setAssemblerOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [balance, setBalance] = useState<number | null>(null);
  const [pricing, setPricing] = useState<AiPricing | null>(null);

  // The one price list. Best effort: a price we cannot read is a price we do not
  // quote, and the page still works — it just does not promise a number.
  useEffect(() => {
    if (!activeSiteId) return;
    let cancelled = false;
    (async () => {
      try {
        const res: any = await ctxApi.getSiteAiPricing(activeSiteId);
        if (!cancelled) setPricing(res?.data || null);
      } catch { /* leave null */ }
    })();
    return () => { cancelled = true; };
  }, [activeSiteId, ctxApi, refreshKey]);

  const generateCredits = pricing?.actions?.generate?.credits ?? null;
  const assembleCredits = pricing?.actions?.assemble?.credits ?? null;
  const priceLine = generateCredits == null
    ? 'Generate a section'
    : generateCredits === 0
      ? 'Generate a section · included'
      : `Generate a section · ${generateCredits} ${generateCredits === 1 ? 'credit' : 'credits'}`;
  const assembleLine = assembleCredits == null
    ? 'Publish accepted sections to my site'
    : assembleCredits === 0
      ? 'Publish accepted sections to my site (free)'
      : `Publish accepted sections to my site · ${assembleCredits} credits`;

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

  // Unknown price, or a free action, means nothing to be short of.
  const canAffordBlockGen = balance == null || generateCredits == null
    || balance >= generateCredits;

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
            <span style={{ fontSize: 13, fontWeight: 700, color: canAffordBlockGen ? '#0B1C24' : '#D85A30' }}>
              {balance == null ? '—' : balance.toLocaleString()}
            </span>
            <Link to="/app/services/arion_usage" style={{ fontSize: 11, color: '#2563eb', textDecoration: 'none', fontWeight: 600, marginLeft: 4 }}>
              {canAffordBlockGen ? 'Manage' : 'Top up →'}
            </Link>
          </div>
        </div>

        {/* Short of credits — with the number the SERVER will charge. */}
        {!canAffordBlockGen && generateCredits != null && (
          <div style={{
            background: '#FEF3C7', border: '1px solid #FCD34D',
            borderRadius: 6, padding: '10px 14px', marginBottom: 14,
            fontSize: 12, color: '#92400E',
          }}>
            Writing a section uses <strong>{generateCredits} {generateCredits === 1 ? 'credit' : 'credits'}</strong> and you have {balance}. <Link to="/app/services/arion_usage" style={{ color: '#92400E', fontWeight: 700 }}>Top up your credits →</Link>
          </div>
        )}
        {pricing?.libraryNote && (
          <div style={{ fontSize: 12, color: '#5A7A8A', marginBottom: 14 }}>
            {pricing.libraryNote}
          </div>
        )}

        {/* Top actions */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
          <button
            onClick={() => openGeneratorForKind(undefined)}
            style={{ ...primaryBtn, opacity: (canAffordBlockGen && activeSiteId) ? 1 : 0.5, cursor: (canAffordBlockGen && activeSiteId) ? 'pointer' : 'not-allowed' }}
            disabled={!activeSiteId || !canAffordBlockGen}
            title={!canAffordBlockGen && generateCredits != null
              ? `This uses ${generateCredits} credits and you have ${balance}`
              : 'Configure your section in the next step'}
          >{priceLine}</button>
          <button
            onClick={() => setAssemblerOpen(true)}
            style={ghostBtn}
            disabled={!activeSiteId}
          >{assembleLine}</button>
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
                title={!canAffordBlockGen && generateCredits != null
                  ? `This uses ${generateCredits} credits and you have ${balance}`
                  : ''}
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
                  {/* One price for writing a section, whatever its shape. The
                      old per-kind arithmetic here was invented in the browser
                      and the server never charged it. */}
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#2563eb', whiteSpace: 'nowrap' }}>
                    {generateCredits == null
                      ? ''
                      : generateCredits === 0
                        ? 'included'
                        : `${generateCredits} ${generateCredits === 1 ? 'credit' : 'credits'}`}
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
              <li><strong>Generate.</strong> Pick a block kind. We draft the copy and the layout from your own business details. Ready-made layouts from our library cost nothing; writing something new uses credits, and the number above is what we charge.</li>
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
