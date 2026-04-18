/**
 * Phase 3.5 AI Search Results — tier-gated.
 *
 * Tracks presence in AI Overview (Google), ChatGPT, Gemini, Perplexity.
 * Three subsections: Rankings (where YOU are mentioned), Competitors
 * (who's mentioned when you're not), Sources (URLs AI cites from your site).
 * Each subsection has a summary card + detail modal.
 *
 * Tier gating:
 *   Starter/Essentials → entire page locked, preview state
 *   Growth            → ChatGPT + Gemini unlocked, AI Overview/Perplexity locked
 *   Authority         → all 4 engines unlocked
 */
import React from 'react';
import { useArionContext } from '../../useArionContext';
import { Card, AddonUpsell, EmptyPanel, InfoCard, ConsultingUpsell } from '../../components/Ui';
import { SeoStatCard } from '../../components/SeoUi';
import { GlossaryIcon, GlossaryPanel } from '../../components/Glossary';

const AI_ENGINES = [
  { key: 'chatgpt', label: 'ChatGPT', minTier: 'growth', accent: '#10A37F' },
  { key: 'gemini', label: 'Gemini', minTier: 'growth', accent: '#1A73E8' },
  { key: 'ai_overview', label: 'AI Overview', minTier: 'authority', accent: '#4285F4' },
  { key: 'perplexity', label: 'Perplexity', minTier: 'authority', accent: '#20808D' },
];

type SubSection = 'rankings' | 'competitors' | 'sources';

export function SeoAiSearch() {
  const { selectedSite } = useArionContext();
  const [openModal, setOpenModal] = React.useState<SubSection | null>(null);

  if (!selectedSite) return <EmptyPanel message="No ARION site selected." />;

  const hasSeoAddon = selectedSite?.seoAddonTier != null;
  if (!hasSeoAddon) {
    return (
      <AddonUpsell
        title="SEO Tools — Add-on not active"
        description="AI Search Results are included with SEO Growth and Authority tiers."
        price="$29"
        planName="Starter"
      />
    );
  }

  const tier = (selectedSite?.seoAddonTier || '').toLowerCase();
  const tierRank = { starter: 0, essentials: 1, growth: 2, authority: 3 }[tier] ?? 0;

  const isUnlocked = (minTier: string) => {
    const min = { growth: 2, authority: 3 }[minTier] ?? 0;
    return tierRank >= min;
  };

  const unlockedEngineCount = AI_ENGINES.filter((e) => isUnlocked(e.minTier)).length;

  // Full page lock for starter/essentials
  if (tierRank < 2) {
    return (
      <div>
        <InfoCard title="AI Search Results">
          <p style={{ margin: 0, fontSize: 12 }}>
            Track how your brand appears in AI search responses from ChatGPT, Gemini, AI Overview, and Perplexity.
          </p>
        </InfoCard>

        <div style={{ marginTop: 16, padding: 48, background: '#F8FAFC', borderRadius: 12, textAlign: 'center' }}>
          <div style={{ fontSize: 24, marginBottom: 12 }}>🔒</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#0B1C24', marginBottom: 8 }}>
            AI Search Tracking is a Growth feature
          </div>
          <p style={{ fontSize: 13, color: '#5A7A8A', maxWidth: 480, margin: '0 auto 20px', lineHeight: 1.6 }}>
            AI search is changing how customers discover businesses. ChatGPT, Gemini, and Google's AI Overview are increasingly the first stop. This tracker monitors whether your brand gets cited in their responses and which of your pages they reference as sources.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, maxWidth: 640, margin: '0 auto 24px' }}>
            {AI_ENGINES.map((e) => (
              <div key={e.key} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '14px 10px', opacity: 0.7, position: 'relative' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#0B1C24' }}>{e.label}</div>
                <div style={{ fontSize: 10, color: '#5A7A8A', marginTop: 4 }}>{e.minTier === 'growth' ? 'Growth+' : 'Authority only'}</div>
              </div>
            ))}
          </div>
          <button style={{ padding: '10px 24px', background: '#EF6C33', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            Upgrade to Growth
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <InfoCard title="AI Search Results">
        <p style={{ margin: 0, fontSize: 12 }}>
          Tracking your brand presence across <strong>{unlockedEngineCount} of 4</strong> AI search engines on your {tier} tier.
          {tierRank < 3 && <span style={{ marginLeft: 8, color: '#C48C00', fontStyle: 'italic' }}>Upgrade to Authority for AI Overview + Perplexity.</span>}
        </p>
      </InfoCard>

      {/* Row 1: AI engine hero cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginTop: 16 }}>
        {AI_ENGINES.map((e) => {
          const unlocked = isUnlocked(e.minTier);
          return (
            <SeoStatCard
              key={e.key}
              termKey="ai_mentions"
              label={e.label}
              value={unlocked ? '—' : '—'}
              sub={unlocked ? 'mentions this period' : `Upgrade to ${e.minTier === 'authority' ? 'Authority' : 'Growth'}`}
              accent={e.accent}
              locked={!unlocked}
            />
          );
        })}
      </div>

      {/* Three subsection summary cards with See Details modals */}
      <div style={{ fontSize: 13, fontWeight: 600, color: '#0B1C24', marginTop: 22, marginBottom: 10 }}>Detail sections</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        <SubsectionCard
          title="AI Rankings"
          description="Which tracked queries cite your brand, and where in the AI response you're mentioned"
          primaryStat="—"
          primaryLabel="mentions this period"
          accent="#10A37F"
          onViewDetails={() => setOpenModal('rankings')}
          termKey="ai_mentions"
        />
        <SubsectionCard
          title="AI Competitors"
          description="Who gets mentioned when you're not. Share of voice across your target queries."
          primaryStat="—"
          primaryLabel="competitor mentions"
          accent="#EF6C33"
          onViewDetails={() => setOpenModal('competitors')}
        />
        <SubsectionCard
          title="AI Sources"
          description="Pages on your site that AI engines cite as answer sources — the new AI-era attribution"
          primaryStat="—"
          primaryLabel="pages cited"
          accent="#1D9E75"
          onViewDetails={() => setOpenModal('sources')}
          termKey="ai_sources"
        />
      </div>

      <GlossaryPanel termKeys={['ai_mentions', 'ai_sources']} title="What do these AI terms mean?" />

      <ConsultingUpsell
        headline="AI search is the new SEO front. IA helps you get cited."
        subtext="Content-for-AI strategy, prompt coverage analysis, and brand-entity optimization."
        serviceType="SEO Strategy"
        triggerPage="seo-ai-search"
      />

      {openModal && (
        <AiSubsectionModal section={openModal} onClose={() => setOpenModal(null)} unlockedEngines={AI_ENGINES.filter((e) => isUnlocked(e.minTier))} />
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

function AiSubsectionModal({ section, onClose, unlockedEngines }: { section: SubSection; onClose: () => void; unlockedEngines: typeof AI_ENGINES }) {
  const titles = {
    rankings: 'AI Rankings — Full Details',
    competitors: 'AI Competitors — Full Details',
    sources: 'AI Sources — Full Details',
  };
  const descriptions = {
    rankings: 'Every tracked query × every AI engine × whether your brand is cited, the exact quote, and snapshot date.',
    competitors: 'Head-to-head per query: which competitor gets cited when you don\'t. Share-of-voice trends over time.',
    sources: 'Every URL on your site × every AI engine × which queries triggered the citation × when citations appeared or disappeared.',
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 12, maxWidth: 1000, width: '92vw', maxHeight: '88vh', display: 'flex', flexDirection: 'column' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: '16px 24px', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 11, color: '#5A7A8A', textTransform: 'uppercase', letterSpacing: 0.5 }}>AI Search</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#0B1C24', marginTop: 2 }}>{titles[section]}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', color: '#999', padding: '0 4px' }}>&times;</button>
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
          <p style={{ fontSize: 13, color: '#5A7A8A', marginBottom: 20, lineHeight: 1.6 }}>{descriptions[section]}</p>
          <div style={{ padding: 24, background: '#F8FAFC', borderRadius: 8, textAlign: 'center', color: '#5A7A8A', fontSize: 13, lineHeight: 1.6 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#0B1C24', marginBottom: 8 }}>Detail data populates as AI tracking runs</div>
            <p style={{ margin: '0 auto', maxWidth: 480 }}>
              Tracking {unlockedEngines.length} AI engine{unlockedEngines.length === 1 ? '' : 's'} on your tier: {unlockedEngines.map((e) => e.label).join(', ')}. The first detail snapshot lands within 24 hours of your next scheduled AI check.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
