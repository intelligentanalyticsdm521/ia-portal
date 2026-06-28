import React, { useState } from 'react';
import { useArionContext } from '../../useArionContext';
import { Card, Loading, EmptyPanel } from '../../components/Ui';
import { AiBlockGenerator } from '../../components/AiBlockGenerator';
import { AiPageAssembler } from '../../components/AiPageAssembler';
import type { AiBlockKind } from '../../../lib/arionApi';

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
  const [generatorOpen, setGeneratorOpen] = useState(false);
  const [generatorKind, setGeneratorKind] = useState<AiBlockKind | undefined>(undefined);
  const [assemblerOpen, setAssemblerOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

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
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#0284c7', textTransform: 'uppercase', letterSpacing: 0.6 }}>
            Intelligence Layer · ARION IL
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#0B1C24', marginTop: 4 }}>
            Generate Elementor blocks with IL, then assemble them into a page
          </div>
          <div style={{ fontSize: 12, color: '#5A7A8A', marginTop: 4, maxWidth: 720 }}>
            Pick a block kind (hero, services, testimonials, cta, about, faq,
            gallery, contact). The Intelligence Layer drafts the section using
            your site context. Accept the drafts you like, drag them into the
            order you want, and ship to WordPress in one click.
          </div>
        </div>

        {/* Top actions */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
          <button
            onClick={() => openGeneratorForKind(undefined)}
            style={primaryBtn}
            disabled={!activeSiteId}
          >Generate a block</button>
          <button
            onClick={() => setAssemblerOpen(true)}
            style={ghostBtn}
            disabled={!activeSiteId}
          >Assemble accepted blocks → publish to WP</button>
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
                style={{
                  textAlign: 'left',
                  background: '#fff',
                  border: '1px solid #E5EEF2',
                  borderRadius: 6,
                  padding: 12,
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 600, color: '#0B1C24' }}>{b.label}</div>
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
