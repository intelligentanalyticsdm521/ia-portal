/**
 * Phase 3.5 Market Monitor — Authority tier only.
 *
 * Combines three market-watch feeds into one surface:
 *   1. Backlinks     — new / lost / total referring domains + authority
 *   2. Page Changes  — detected changes on competitor pages we watch
 *   3. Competitor Moves — large jumps or drops by tracked competitors
 *
 * Each subsection follows the Phase 3.5 pattern:
 *   - summary card with 1-2 primary stats + short description
 *   - "See Full Details" button opens a modal with the full feed
 *
 * Tier gating:
 *   Starter / Essentials / Growth → preview with upgrade CTA
 *   Authority                     → full feature unlocked
 */
import React from 'react';
import { useArionContext } from '../../useArionContext';
import { AddonUpsell, EmptyPanel, InfoCard, ConsultingUpsell } from '../../components/Ui';
import { SeoStatCard } from '../../components/SeoUi';
import { GlossaryIcon, GlossaryPanel } from '../../components/Glossary';

type SubSection = 'backlinks' | 'page_changes' | 'competitor_moves';

export function SeoMarketMonitor() {
  const { selectedSite } = useArionContext();
  const [openModal, setOpenModal] = React.useState<SubSection | null>(null);

  if (!selectedSite) return <EmptyPanel message="No ARION site selected." />;

  const hasSeoAddon = selectedSite?.seoAddonTier != null;
  if (!hasSeoAddon) {
    return (
      <AddonUpsell
        title="SEO Tools — Add-on not active"
        description="Market Monitor is included with the SEO Authority tier — watch backlinks, competitor page changes, and ranking swings."
        price="$29"
        planName="Starter"
      />
    );
  }

  const tier = (selectedSite?.seoAddonTier || '').toLowerCase();
  const isAuthority = tier === 'authority';

  // Growth/Essentials/Starter preview
  if (!isAuthority) {
    return (
      <div>
        <InfoCard title="Market Monitor">
          <p style={{ margin: 0, fontSize: 12 }}>
            Track market-level movements that affect your SEO position — new backlinks, competitor page changes, and ranking swings across the sites you track.
          </p>
        </InfoCard>

        <div style={{ marginTop: 16, padding: 48, background: '#F8FAFC', borderRadius: 12, textAlign: 'center' }}>
          <div style={{ fontSize: 24, marginBottom: 12 }}>🔒</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#0B1C24', marginBottom: 8 }}>
            Market Monitor is an Authority feature
          </div>
          <p style={{ fontSize: 13, color: '#5A7A8A', maxWidth: 520, margin: '0 auto 20px', lineHeight: 1.6 }}>
            Know the moment your market shifts. Market Monitor tells you when a competitor publishes a new page,
            lands a notable backlink, or a key SERP swings — before your traffic does.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, maxWidth: 640, margin: '0 auto 24px' }}>
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '14px 10px', opacity: 0.85 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#0B1C24' }}>Backlink Watch</div>
              <div style={{ fontSize: 10, color: '#5A7A8A', marginTop: 4 }}>New / lost links + referring domains</div>
            </div>
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '14px 10px', opacity: 0.85 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#0B1C24' }}>Page Changes</div>
              <div style={{ fontSize: 10, color: '#5A7A8A', marginTop: 4 }}>Detects content edits on watched pages</div>
            </div>
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '14px 10px', opacity: 0.85 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#0B1C24' }}>Competitor Moves</div>
              <div style={{ fontSize: 10, color: '#5A7A8A', marginTop: 4 }}>Large ranking swings by your competitors</div>
            </div>
          </div>
          <button style={{ padding: '10px 24px', background: '#EF6C33', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            Upgrade to Authority
          </button>
        </div>
      </div>
    );
  }

  // Authority: full view
  return (
    <div>
      <InfoCard title="Market Monitor — Authority">
        <p style={{ margin: 0, fontSize: 12 }}>
          Real-time market signals across your SEO project. Daily backlink checks, competitor page change detection, and large ranking movement alerts.
        </p>
      </InfoCard>

      {/* Row 1: headline stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginTop: 16 }}>
        <SeoStatCard termKey="backlinks_new" label="New Backlinks" value="—" sub="past 30 days" accent="#1D9E75" />
        <SeoStatCard termKey="backlinks_lost" label="Lost Backlinks" value="—" sub="past 30 days" accent="#C55" />
        <SeoStatCard termKey="page_changes" label="Page Changes" value="—" sub="on watched pages" accent="#4285F4" />
        <SeoStatCard termKey="competitor_moves" label="Competitor Moves" value="—" sub="significant swings" accent="#EF6C33" />
      </div>

      {/* Three subsection summary cards */}
      <div style={{ fontSize: 13, fontWeight: 600, color: '#0B1C24', marginTop: 22, marginBottom: 10 }}>Detail feeds</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        <SubsectionCard
          title="Backlink Watch"
          description="Referring domains gained or lost, with authority score and first-seen / last-seen dates"
          primaryStat="—"
          primaryLabel="active referring domains"
          accent="#1D9E75"
          onViewDetails={() => setOpenModal('backlinks')}
          termKey="backlinks_new"
        />
        <SubsectionCard
          title="Page Changes"
          description="Content change detection on competitor pages and your tracked priority pages"
          primaryStat="—"
          primaryLabel="changes this period"
          accent="#4285F4"
          onViewDetails={() => setOpenModal('page_changes')}
          termKey="page_changes"
        />
        <SubsectionCard
          title="Competitor Moves"
          description="Ranking swings greater than 5 positions across your tracked competitors and keywords"
          primaryStat="—"
          primaryLabel="large moves"
          accent="#EF6C33"
          onViewDetails={() => setOpenModal('competitor_moves')}
          termKey="competitor_moves"
        />
      </div>

      <GlossaryPanel
        termKeys={['backlinks_new', 'backlinks_lost', 'page_changes', 'competitor_moves']}
        title="What do these market signals mean?"
      />

      <ConsultingUpsell
        headline="Market moves mean opportunity. IA turns signals into strategy."
        subtext="We monitor Market Monitor alongside you and surface the ones worth acting on — plus a quarterly competitive review."
        serviceType="SEO Strategy"
        triggerPage="seo-market-monitor"
      />

      {openModal && (
        <MarketSubsectionModal section={openModal} onClose={() => setOpenModal(null)} />
      )}
    </div>
  );
}

function SubsectionCard({
  title,
  description,
  primaryStat,
  primaryLabel,
  accent,
  onViewDetails,
  termKey,
}: {
  title: string;
  description: string;
  primaryStat: string;
  primaryLabel: string;
  accent: string;
  onViewDetails: () => void;
  termKey?: string;
}) {
  return (
    <div style={{ background: '#fff', borderLeft: `3px solid ${accent}`, borderRadius: 8, padding: '16px 18px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#0B1C24', display: 'inline-flex', alignItems: 'center' }}>
        {title}
        {termKey && <GlossaryIcon termKey={termKey} />}
      </div>
      <div style={{ fontSize: 11, color: '#5A7A8A', lineHeight: 1.5, marginTop: 6, marginBottom: 12 }}>{description}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 'auto' }}>
        <span style={{ fontSize: 28, fontWeight: 700, color: accent, lineHeight: 1 }}>{primaryStat}</span>
        <span style={{ fontSize: 11, color: '#5A7A8A' }}>{primaryLabel}</span>
      </div>
      <button
        onClick={onViewDetails}
        style={{ marginTop: 12, padding: '6px 12px', fontSize: 11, fontWeight: 600, background: 'transparent', color: accent, border: `1px solid ${accent}`, borderRadius: 4, cursor: 'pointer', alignSelf: 'flex-start' }}
      >
        See Full Details →
      </button>
    </div>
  );
}

function MarketSubsectionModal({ section, onClose }: { section: SubSection; onClose: () => void }) {
  const titles: Record<SubSection, string> = {
    backlinks: 'Backlink Watch — Full Details',
    page_changes: 'Page Changes — Full Details',
    competitor_moves: 'Competitor Moves — Full Details',
  };
  const descriptions: Record<SubSection, string> = {
    backlinks: 'Every referring domain we have seen for your site, with first-seen date, last-seen date, authority score, anchor text, and link status. Separated into gained (new since last check) and lost (missing since last check).',
    page_changes: 'Competitor pages and your own priority pages we re-fetch on a schedule. When content diffs trigger our threshold, the change is logged here with a short before / after excerpt.',
    competitor_moves: 'For every tracked keyword × tracked competitor pair, we log position changes of five places or more. Sorted by magnitude and recency so the biggest market shifts float to the top.',
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 12, maxWidth: 1000, width: '92vw', maxHeight: '88vh', display: 'flex', flexDirection: 'column' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: '16px 24px', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 11, color: '#5A7A8A', textTransform: 'uppercase', letterSpacing: 0.5 }}>Market Monitor</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#0B1C24', marginTop: 2 }}>{titles[section]}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', color: '#999', padding: '0 4px' }}>&times;</button>
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
          <p style={{ fontSize: 13, color: '#5A7A8A', marginBottom: 20, lineHeight: 1.6 }}>{descriptions[section]}</p>
          <div style={{ padding: 24, background: '#F8FAFC', borderRadius: 8, textAlign: 'center', color: '#5A7A8A', fontSize: 13, lineHeight: 1.6 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#0B1C24', marginBottom: 8 }}>Detail data populates as monitors run</div>
            <p style={{ margin: '0 auto', maxWidth: 480 }}>
              Market Monitor checks run daily on the Authority tier. The first detail snapshot lands within 24 hours of your next scheduled check.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
