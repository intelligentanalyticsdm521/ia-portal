/**
 * Phase 3.5 AI Search Results — full rebuild (2026-04-19).
 *
 * Tracks presence across Google AI Overviews + Google AI Mode (Growth) and
 * ChatGPT + Gemini (Authority) via the AIRT (AI Result Tracker) endpoint —
 * the AI engine model agreed 2026-08-21. Perplexity is consulting-only and
 * never sold self-serve; its card only renders when the project actually
 * has it unlocked.
 *
 * Layout mirrors Site Audit depth:
 *   1. Header InfoCard with metadata bar + "See Full Report" button
 *   2. Hero row (8 cards): totals + per-engine mention counts
 *   3. Engine Breakdown widget
 *   4. Mentions Over Time (grouped bar current vs prior)
 *   5. Visibility Score comparison (horizontal bars)
 *   6. Top Source Pages (bar + table)
 *   7. Competitor Mentions (bar + table)
 *   8. Glossary panel + ConsultingUpsell
 *   9. Full-report modal w/ 5 tabs: Rankings / Engines / Sources / Competitors / Prompts
 */
import React from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RTooltip,
  Legend,
  Cell,
} from 'recharts';
import { useArionContext } from '../../useArionContext';
import { useArionData } from '../../useArionData';
import {
  AddonUpsell,
  EmptyPanel,
  Loading,
  ConsultingUpsell,
  ErrorBanner,
  InfoCard,
} from '../../components/Ui';
import { GlossaryIcon, GlossaryPanel } from '../../components/Glossary';
import type {
  SeoAiSearchResponse,
  SeoAiEngine,
  SeoAiPromptRanking,
  SeoAiSourcePage,
  SeoAiCompetitorMention,
} from '../../../lib/arionApi';

// ────────────────────────────────────────────────────────────────
// Constants & helpers
// ────────────────────────────────────────────────────────────────

const ENGINE_COLORS: Record<string, string> = {
  chatgpt: '#10A37F',
  gemini: '#1A73E8',
  ai_mode: '#F4B400',
  ai_overview: '#4285F4',
  perplexity: '#20808D',
};

const ENGINE_LABELS: Record<string, string> = {
  chatgpt: 'ChatGPT',
  gemini: 'Gemini',
  ai_mode: 'AI Mode',
  ai_overview: 'AI Overview',
  perplexity: 'Perplexity',
};

// Self-serve engines, in tier order (Growth pair first, Authority pair next).
const SELF_SERVE_ENGINE_KEYS = ['ai_overview', 'ai_mode', 'chatgpt', 'gemini'] as const;

function engineColor(baseName: string | undefined): string {
  return (baseName && ENGINE_COLORS[baseName]) || '#5A7A8A';
}

function engineLabel(baseName: string | undefined, fallback?: string): string {
  return (baseName && ENGINE_LABELS[baseName]) || fallback || 'Unknown';
}

function truncate(s: string, n: number): string {
  if (!s) return '';
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

function prettyUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.host + u.pathname.replace(/\/$/, '');
  } catch {
    return url;
  }
}

function formatDelta(n: number | null | undefined, goodWhenPositive = true): { text: string; color: string; arrow: string } {
  if (n == null || n === 0) return { text: '—', color: '#5A7A8A', arrow: '' };
  const good = (n > 0) === goodWhenPositive;
  return {
    text: `${n > 0 ? '+' : ''}${Math.round(Number(n) * 10) / 10}`,
    color: good ? '#1D9E75' : '#D85A30',
    arrow: n > 0 ? '▲' : '▼',
  };
}

// ────────────────────────────────────────────────────────────────
// Main component
// ────────────────────────────────────────────────────────────────

type DetailTab = 'rankings' | 'engines' | 'sources' | 'competitors' | 'prompts';

export function SeoAiSearch() {
  const { selectedSite, activeSiteId, arionApi } = useArionContext();
  const [activeTab, setActiveTab] = React.useState<DetailTab | null>(null);

  const { data, loading } = useArionData<SeoAiSearchResponse | null>(
    () => (activeSiteId ? arionApi.getSeoAiSearch(activeSiteId) : Promise.resolve(null)),
    [activeSiteId],
  );

  if (loading) return <Loading />;
  if (!selectedSite) return <EmptyPanel message="No ARION site selected." />;

  const hasSeoAddon = selectedSite?.seoAddonTier != null;
  if (!hasSeoAddon) {
    return (
      <AddonUpsell
        title="SEO Tools — Add-on not active"
        description="AI Search Results are included with the SEO add-on at Growth (Google AI Overviews + AI Mode) and Authority (+ ChatGPT + Gemini)."
        price="$99.99"
        planName="Growth"
      />
    );
  }

  const tier = (selectedSite?.seoAddonTier || 'starter').toLowerCase();
  const tierRank = ({ starter: 0, essentials: 1, growth: 2, authority: 3 } as Record<string, number>)[tier] ?? 0;

  // Tier lock preview for Starter / Essentials
  if (data?.tierGated === true || tierRank < 2) {
    return <TierGatedPreview tier={tier} />;
  }

  if (!data || data.connected === false) {
    return (
      <div>
        <InfoCard title="AI Search Results">
          <p style={{ margin: 0, fontSize: 12 }}>
            Tracking your brand presence across AI search engines.
          </p>
        </InfoCard>
        <div style={{ marginTop: 16 }}>
          <ErrorBanner message={data?.message || 'AI tracking service is initializing for this site. First snapshot arrives within 24 hours.'} />
        </div>
      </div>
    );
  }

  const engines = data.engines ?? [];
  const agg = data.aggregate;
  // Four self-serve engines. Perplexity is consulting-only — it joins the
  // grid only when the project really has it unlocked (IA's own account).
  const hasPerplexity = engines.some((e) => e.baseName === 'perplexity' && e.unlocked);
  const heroEngineKeys: string[] = hasPerplexity ? [...SELF_SERVE_ENGINE_KEYS, 'perplexity'] : [...SELF_SERVE_ENGINE_KEYS];
  const totalEngines = heroEngineKeys.length;
  const trackedCount = engines.filter((e) => e.unlocked).length;

  const totalMentions = agg?.totalMentions ?? 0;
  const priorTotalMentions = engines.reduce((sum, e) => sum + (e.prior?.mentions ?? 0), 0);
  const mentionsDelta = totalMentions - priorTotalMentions;

  const visibilityScore = agg?.visibilityScore ?? 0;
  const priorVisibility =
    engines.length > 0
      ? engines.reduce((sum, e) => sum + (e.prior?.visibilityScore ?? 0), 0) / engines.length
      : 0;
  const visibilityDelta = Math.round((visibilityScore - priorVisibility) * 10) / 10;

  const uniquePromptsMentioned = agg?.uniquePromptsMentioned ?? 0;
  const totalPromptsTracked = agg?.totalPromptsTracked ?? 0;

  const rangeDays = data.range?.days ?? 30;

  // Pre-compute per-engine view-model keyed by baseName
  const engineByBase = new Map<string, SeoAiEngine>();
  engines.forEach((e) => engineByBase.set(e.baseName, e));

  return (
    <div>
      <InfoCard title={`AI Search Results — ${selectedSite.primaryDomain || selectedSite.wpUrl || 'Site'}`}>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center', fontSize: 12 }}>
          <MetaItem label="Tracked engines" value={`${trackedCount} of ${totalEngines}`} />
          <MetaItem label="Mentions this period" value={String(totalMentions)} />
          <MetaItem label="Visibility score" value={`${Math.round(visibilityScore)}%`} />
          <MetaItem label="Date range" value={`Last ${rangeDays}d`} />
          <div style={{ marginLeft: 'auto' }}>
            <button
              onClick={() => setActiveTab('rankings')}
              style={{ padding: '7px 16px', fontSize: 12, fontWeight: 600, background: '#0B1C24', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}
            >
              See Full Report →
            </button>
          </div>
        </div>
      </InfoCard>

      {/* Hero row 1 — aggregate stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginTop: 14 }}>
        <HeroStatCard
          label="Total Mentions"
          value={totalMentions}
          sub="mentions this period"
          delta={mentionsDelta}
          deltaLabel="vs prior period"
          color="#10A37F"
          termKey="ai_mentions"
          onSeeDetails={() => setActiveTab('rankings')}
        />
        <HeroStatCard
          label="Visibility Score"
          value={`${Math.round(visibilityScore)}%`}
          sub="brand presence in AI responses"
          delta={visibilityDelta}
          deltaLabel="vs prior"
          color="#2D9CDB"
          termKey="ai_visibility"
          onSeeDetails={() => setActiveTab('engines')}
        />
        <HeroStatCard
          label="Engines Tracked"
          value={`${trackedCount} / ${totalEngines}`}
          sub={tierRank < 3 ? 'Upgrade to Authority for ChatGPT + Gemini' : 'All AI engines active'}
          color="#1A73E8"
          onSeeDetails={() => setActiveTab('engines')}
        />
        <HeroStatCard
          label="Prompts Mentioned"
          value={`${uniquePromptsMentioned} / ${totalPromptsTracked}`}
          sub="unique prompts with a mention"
          color="#4285F4"
          onSeeDetails={() => setActiveTab('prompts')}
        />
      </div>

      {/* Hero row 2 — per-engine mentions */}
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${totalEngines}, 1fr)`, gap: 12, marginTop: 12 }}>
        {heroEngineKeys.map((key) => {
          const eng = engineByBase.get(key);
          const locked = !eng || !eng.unlocked;
          return (
            <EngineMiniHeroCard
              key={key}
              baseName={key}
              label={ENGINE_LABELS[key]}
              mentions={eng?.current?.mentions ?? 0}
              delta={eng?.delta?.mentions ?? 0}
              avgPosition={eng?.current?.avgPosition ?? null}
              locked={locked}
              tierRequired={eng?.tierRequired}
              onSeeDetails={() => setActiveTab('engines')}
            />
          );
        })}
      </div>

      {/* Engine Breakdown widget */}
      <div style={{ marginTop: 22 }}>
        <WidgetContainer
          title="Engine Breakdown"
          subtitle="Per-engine mention counts, visibility, and prompt coverage"
          action={
            <button
              onClick={() => setActiveTab('engines')}
              style={{ fontSize: 11, fontWeight: 600, background: 'transparent', color: '#2D9CDB', border: 'none', cursor: 'pointer' }}
            >
              Full engine detail →
            </button>
          }
        >
          {engines.length === 0 ? (
            <AwaitingData message="Engine breakdown populates after the first AIRT run. This usually completes within 24 hours of site onboarding." />
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
              {engines.map((e) => (
                <EngineBreakdownCard key={e.engineId} engine={e} onOpen={() => setActiveTab('engines')} />
              ))}
            </div>
          )}
        </WidgetContainer>
      </div>

      {/* Mentions Over Time */}
      <div style={{ marginTop: 22 }}>
        <WidgetContainer
          title="Mentions — Current vs Prior"
          subtitle="Grouped comparison by AI engine"
          action={null}
        >
          {engines.length === 0 ? (
            <AwaitingData message="Period comparison chart will populate once two snapshots are available." />
          ) : (
            <div style={{ height: 280 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={engines.map((e) => ({
                    name: e.label || engineLabel(e.baseName),
                    baseName: e.baseName,
                    current: e.current?.mentions ?? 0,
                    prior: e.prior?.mentions ?? 0,
                  }))}
                  margin={{ top: 10, right: 20, left: 0, bottom: 10 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(45,156,219,0.12)" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#5A7A8A' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#5A7A8A' }} allowDecimals={false} />
                  <RTooltip contentStyle={{ fontSize: 11, borderRadius: 6 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="prior" fill="#CBD5E1" name="Prior period" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="current" name="Current period" radius={[4, 4, 0, 0]}>
                    {engines.map((e) => (
                      <Cell key={e.engineId} fill={engineColor(e.baseName)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </WidgetContainer>
      </div>

      {/* Visibility Score comparison + Top Sources — 2-col grid */}
      <div style={{ marginTop: 22, display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: 12 }}>
        <WidgetContainer title="Visibility Score by Engine" subtitle="How strongly you show up in each AI" action={null}>
          {engines.length === 0 ? (
            <AwaitingData message="Visibility score requires at least one completed snapshot per engine." />
          ) : (
            <div style={{ height: Math.max(220, engines.length * 42) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  layout="vertical"
                  data={engines.map((e) => ({
                    name: e.label || engineLabel(e.baseName),
                    baseName: e.baseName,
                    score: Math.round(e.current?.visibilityScore ?? 0),
                  }))}
                  margin={{ top: 6, right: 20, left: 8, bottom: 6 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(45,156,219,0.12)" horizontal={false} />
                  <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11, fill: '#5A7A8A' }} />
                  <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 11, fill: '#0B1C24' }} />
                  <RTooltip contentStyle={{ fontSize: 11, borderRadius: 6 }} formatter={(v: any) => `${v}%`} />
                  <Bar dataKey="score" radius={[0, 4, 4, 0]}>
                    {engines.map((e) => (
                      <Cell key={e.engineId} fill={engineColor(e.baseName)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </WidgetContainer>

        <WidgetContainer
          title="Top Source Pages"
          subtitle="Your URLs most frequently cited by AI engines"
          action={
            <button
              onClick={() => setActiveTab('sources')}
              style={{ fontSize: 11, fontWeight: 600, background: 'transparent', color: '#2D9CDB', border: 'none', cursor: 'pointer' }}
            >
              See all →
            </button>
          }
        >
          <TopSourcePagesWidget pages={agg?.topSourcePages ?? []} onOpen={() => setActiveTab('sources')} />
        </WidgetContainer>
      </div>

      {/* Competitor Mentions */}
      <div style={{ marginTop: 22 }}>
        <WidgetContainer
          title="Competitor Mentions"
          subtitle="Who gets cited in AI responses across your tracked prompts"
          action={
            <button
              onClick={() => setActiveTab('competitors')}
              style={{ fontSize: 11, fontWeight: 600, background: 'transparent', color: '#2D9CDB', border: 'none', cursor: 'pointer' }}
            >
              See all →
            </button>
          }
        >
          <CompetitorMentionsWidget mentions={agg?.competitorMentions ?? []} />
        </WidgetContainer>
      </div>

      <GlossaryPanel termKeys={['ai_mentions', 'ai_sources', 'ai_visibility']} title="What do these AI terms mean?" />

      <ConsultingUpsell
        headline="AI search is the new SEO front. IA helps you get cited."
        subtext="Content-for-AI strategy, prompt coverage analysis, and brand-entity optimization."
        serviceType="SEO Strategy"
        triggerPage="seo-ai-search"
      />

      {activeTab && (
        <AiSearchDetailsModal
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          onClose={() => setActiveTab(null)}
          data={data}
        />
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// Shared small components
// ────────────────────────────────────────────────────────────────

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 9, color: '#5A7A8A', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#0B1C24', marginTop: 2 }}>{value}</div>
    </div>
  );
}

function WidgetContainer({ title, subtitle, action, children }: { title: string; subtitle?: string; action: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '14px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 8, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#0B1C24' }}>{title}</div>
          {subtitle && <div style={{ fontSize: 10, color: '#5A7A8A', marginTop: 2 }}>{subtitle}</div>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function AwaitingData({ message }: { message: string }) {
  return (
    <div style={{ padding: 24, background: '#F8FAFC', borderRadius: 8, textAlign: 'center', color: '#5A7A8A', fontSize: 12, lineHeight: 1.6 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#0B1C24', marginBottom: 6 }}>Awaiting data</div>
      <p style={{ margin: '0 auto', maxWidth: 520 }}>{message}</p>
    </div>
  );
}

function CardSeeDetailsButton({ color, onClick, label }: { color: string; onClick: () => void; label?: string }) {
  return (
    <button
      onClick={onClick}
      style={{
        marginTop: 10,
        padding: '6px 12px',
        fontSize: 11,
        fontWeight: 600,
        background: 'transparent',
        color,
        border: `1px solid ${color}`,
        borderRadius: 4,
        cursor: 'pointer',
        alignSelf: 'flex-start',
      }}
    >
      {label || 'See Details →'}
    </button>
  );
}

function SummaryStat({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div style={{ padding: '10px 12px', background: '#F8FAFC', borderRadius: 6 }}>
      <div style={{ fontSize: 10, color: '#5A7A8A', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: color || '#0B1C24', marginTop: 2 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: '#5A7A8A', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// Hero cards
// ────────────────────────────────────────────────────────────────

function HeroStatCard({
  label,
  value,
  sub,
  delta,
  deltaLabel,
  color,
  termKey,
  onSeeDetails,
}: {
  label: string;
  value: string | number;
  sub?: string;
  delta?: number | null;
  deltaLabel?: string;
  color: string;
  termKey?: string;
  onSeeDetails: () => void;
}) {
  const d = delta != null ? formatDelta(delta, true) : null;
  return (
    <div
      style={{
        background: '#F8FAFC',
        borderLeft: `3px solid ${color}`,
        borderRadius: 8,
        padding: '14px 16px',
        minHeight: 140,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ fontSize: 10, color: '#5A7A8A', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600, display: 'inline-flex', alignItems: 'center' }}>
        {label}
        {termKey && <GlossaryIcon termKey={termKey} size={11} />}
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, color: '#0B1C24', marginTop: 4, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: '#5A7A8A', marginTop: 4 }}>{sub}</div>}
      {d && (
        <div style={{ fontSize: 11, color: d.color, fontWeight: 600, marginTop: 6 }}>
          {d.arrow} {d.text.replace(/^[-+]/, '')} {deltaLabel || ''}
        </div>
      )}
      <div style={{ marginTop: 'auto' }}>
        <CardSeeDetailsButton color={color} onClick={onSeeDetails} />
      </div>
    </div>
  );
}

function EngineMiniHeroCard({
  baseName,
  label,
  mentions,
  delta,
  avgPosition,
  locked,
  tierRequired,
  onSeeDetails,
}: {
  baseName: string;
  label: string;
  mentions: number;
  delta: number;
  avgPosition: number | null;
  locked: boolean;
  tierRequired?: string;
  onSeeDetails: () => void;
}) {
  const color = engineColor(baseName);
  if (locked) {
    const req = (tierRequired || 'growth').toLowerCase();
    const reqLabel = req === 'authority' ? 'Authority' : req === 'consulting' ? 'IA Consulting' : 'Growth';
    return (
      <div
        style={{
          background: '#F8FAFC',
          border: '1px dashed #CBD5E1',
          borderRadius: 8,
          padding: '14px 16px',
          minHeight: 140,
          display: 'flex',
          flexDirection: 'column',
          opacity: 0.85,
        }}
      >
        <div style={{ fontSize: 10, color: '#5A7A8A', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>{label}</div>
        <div style={{ fontSize: 22, fontWeight: 700, color: '#94A3B8', marginTop: 6 }}>Locked</div>
        <div style={{ fontSize: 11, color: '#5A7A8A', marginTop: 4 }}>Upgrade to {reqLabel}</div>
        <div style={{ marginTop: 'auto', fontSize: 11, color: '#5A7A8A', fontStyle: 'italic' }}>Not tracked on current tier</div>
      </div>
    );
  }
  const d = formatDelta(delta, true);
  return (
    <div
      style={{
        background: '#F8FAFC',
        borderLeft: `3px solid ${color}`,
        borderRadius: 8,
        padding: '14px 16px',
        minHeight: 140,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ fontSize: 10, color: '#5A7A8A', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color: '#0B1C24', marginTop: 4, lineHeight: 1 }}>{mentions}</div>
      <div style={{ fontSize: 11, color: '#5A7A8A', marginTop: 4 }}>mentions this period</div>
      <div style={{ display: 'flex', gap: 12, marginTop: 6, fontSize: 11 }}>
        <span style={{ color: d.color, fontWeight: 600 }}>
          {d.arrow} {d.text.replace(/^[-+]/, '')} vs prior
        </span>
        {avgPosition != null && (
          <span style={{ color: '#5A7A8A' }}>avg pos {Math.round(avgPosition * 10) / 10}</span>
        )}
      </div>
      <div style={{ marginTop: 'auto' }}>
        <CardSeeDetailsButton color={color} onClick={onSeeDetails} />
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// Tier-gated preview
// ────────────────────────────────────────────────────────────────

function TierGatedPreview({ tier }: { tier: string }) {
  // AI engine model (Brandon 2026-08-21): Growth = Google AI Overviews + AI
  // Mode · Authority = + ChatGPT + Gemini · Perplexity = consulting only.
  const engines = [
    { key: 'ai_overview', label: 'Google AI Overviews', min: 'Growth+' },
    { key: 'ai_mode', label: 'Google AI Mode', min: 'Growth+' },
    { key: 'chatgpt', label: 'ChatGPT', min: 'Authority' },
    { key: 'gemini', label: 'Gemini', min: 'Authority' },
  ];
  return (
    <div>
      <InfoCard title="AI Search Results">
        <p style={{ margin: 0, fontSize: 12 }}>
          Track how your brand appears in AI search responses from Google AI Overviews, Google AI Mode, ChatGPT, and Gemini.
        </p>
      </InfoCard>
      <div style={{ marginTop: 16, padding: 48, background: '#F8FAFC', borderRadius: 12, textAlign: 'center' }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: '#0B1C24', marginBottom: 8 }}>
          AI Search Tracking is a Growth feature
        </div>
        <p style={{ fontSize: 13, color: '#5A7A8A', maxWidth: 520, margin: '0 auto 20px', lineHeight: 1.6 }}>
          AI search is changing how customers discover businesses. Google's AI Overviews and AI Mode, ChatGPT, and Gemini are increasingly the first stop. This tracker monitors whether your brand gets cited in their responses and which of your pages they reference as sources.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, maxWidth: 640, margin: '0 auto 24px' }}>
          {engines.map((e) => (
            <div key={e.key} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '14px 10px', opacity: 0.7 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#0B1C24' }}>{e.label}</div>
              <div style={{ fontSize: 10, color: '#5A7A8A', marginTop: 4 }}>{e.min}</div>
            </div>
          ))}
        </div>
        <button style={{ padding: '10px 24px', background: '#EF6C33', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          Upgrade to Growth
        </button>
        <div style={{ fontSize: 10, color: '#94A3B8', marginTop: 12, fontStyle: 'italic' }}>Current tier: {tier}</div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// Engine Breakdown
// ────────────────────────────────────────────────────────────────

function EngineBreakdownCard({ engine, onOpen }: { engine: SeoAiEngine; onOpen: () => void }) {
  const color = engineColor(engine.baseName);
  if (!engine.unlocked) {
    return (
      <div style={{ background: '#F8FAFC', border: '1px dashed #CBD5E1', borderRadius: 8, padding: 14, opacity: 0.85 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#0B1C24' }}>{engine.label}</div>
        <div style={{ fontSize: 11, color: '#5A7A8A', marginTop: 4 }}>Locked — requires {engine.tierRequired}</div>
      </div>
    );
  }
  const d = formatDelta(engine.delta?.mentions ?? 0);
  return (
    <div style={{ background: '#fff', border: `1px solid #e2e8f0`, borderLeft: `3px solid ${color}`, borderRadius: 8, padding: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#0B1C24' }}>{engine.label}</div>
          <div style={{ fontSize: 10, color: '#5A7A8A', marginTop: 2 }}>
            {engine.region || 'global'} · {engine.lang || 'en'}
          </div>
        </div>
        <span style={{ fontSize: 10, fontWeight: 600, color: '#1D9E75', background: '#ECFDF5', padding: '2px 8px', borderRadius: 4 }}>
          Unlocked
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginTop: 12 }}>
        <SummaryStat label="Mentions" value={engine.current?.mentions ?? 0} sub={`${d.arrow} ${d.text.replace(/^[-+]/, '')} vs prior`} color={color} />
        <SummaryStat label="Visibility" value={`${Math.round(engine.current?.visibilityScore ?? 0)}%`} />
        <SummaryStat label="Avg Position" value={engine.current?.avgPosition != null ? Math.round(engine.current.avgPosition * 10) / 10 : '—'} />
        <SummaryStat label="Prompts" value={`${engine.current?.promptsCount ?? 0}`} sub={`${engine.current?.linkedCount ?? 0} with citation`} />
      </div>
      {engine.upstreamErrors && engine.upstreamErrors.length > 0 && (
        <div style={{ marginTop: 10, fontSize: 10, color: '#D85A30', background: 'rgba(216,90,48,0.06)', border: '1px solid rgba(216,90,48,0.2)', padding: '6px 8px', borderRadius: 4 }}>
          {engine.upstreamErrors[0]}
        </div>
      )}
      <CardSeeDetailsButton color={color} onClick={onOpen} label="View Engine Detail →" />
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// Top source pages widget
// ────────────────────────────────────────────────────────────────

function TopSourcePagesWidget({ pages, onOpen }: { pages: SeoAiSourcePage[]; onOpen: () => void }) {
  if (!pages || pages.length === 0) {
    return <AwaitingData message="Source pages appear once AI responses cite your content. Populates within 24 hours of the first tracked prompt set." />;
  }
  const top = pages.slice(0, 6);
  return (
    <div>
      <div style={{ height: Math.max(160, top.length * 32) }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            layout="vertical"
            data={top.map((p) => ({ name: truncate(prettyUrl(p.url), 38), count: p.citationCount }))}
            margin={{ top: 4, right: 16, left: 8, bottom: 4 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(45,156,219,0.12)" horizontal={false} />
            <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10, fill: '#5A7A8A' }} />
            <YAxis dataKey="name" type="category" width={180} tick={{ fontSize: 10, fill: '#0B1C24' }} />
            <RTooltip contentStyle={{ fontSize: 11, borderRadius: 6 }} />
            <Bar dataKey="count" fill="#1D9E75" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <table style={{ width: '100%', marginTop: 10, fontSize: 11, borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>
            <th style={{ padding: '6px 4px', color: '#5A7A8A', fontWeight: 600 }}>URL</th>
            <th style={{ padding: '6px 4px', color: '#5A7A8A', fontWeight: 600, width: 70 }}>Citations</th>
            <th style={{ padding: '6px 4px', color: '#5A7A8A', fontWeight: 600 }}>Engines</th>
          </tr>
        </thead>
        <tbody>
          {top.map((p) => (
            <tr key={p.url} style={{ borderBottom: '1px solid #f1f5f9' }}>
              <td style={{ padding: '6px 4px', color: '#0B1C24' }}>
                <a href={p.url} target="_blank" rel="noopener noreferrer" style={{ color: '#2D9CDB', textDecoration: 'none' }}>
                  {truncate(prettyUrl(p.url), 50)}
                </a>
              </td>
              <td style={{ padding: '6px 4px', fontWeight: 600 }}>{p.citationCount}</td>
              <td style={{ padding: '6px 4px' }}>
                <EngineBadges engines={p.engines} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {pages.length > top.length && (
        <div style={{ marginTop: 8, textAlign: 'right' }}>
          <button
            onClick={onOpen}
            style={{ fontSize: 11, fontWeight: 600, background: 'transparent', color: '#2D9CDB', border: 'none', cursor: 'pointer' }}
          >
            +{pages.length - top.length} more →
          </button>
        </div>
      )}
    </div>
  );
}

function EngineBadges({ engines }: { engines: string[] }) {
  if (!engines || engines.length === 0) return <span style={{ color: '#94A3B8' }}>—</span>;
  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
      {engines.map((e) => {
        const color = engineColor(e);
        return (
          <span
            key={e}
            style={{
              fontSize: 9,
              fontWeight: 600,
              background: `${color}18`,
              color,
              border: `1px solid ${color}40`,
              padding: '2px 6px',
              borderRadius: 3,
              textTransform: 'uppercase',
              letterSpacing: 0.3,
            }}
          >
            {engineLabel(e, e)}
          </span>
        );
      })}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// Competitor mentions widget
// ────────────────────────────────────────────────────────────────

function CompetitorMentionsWidget({ mentions }: { mentions: SeoAiCompetitorMention[] }) {
  if (!mentions || mentions.length === 0) {
    return <AwaitingData message="Competitor mentions appear once AI responses name rival brands. If you are not seeing competitors, you may be the dominant brand in your prompts — nice problem to have." />;
  }
  const top = mentions.slice(0, 10);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
      <div style={{ height: Math.max(200, top.length * 26) }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            layout="vertical"
            data={top.map((m) => ({ name: truncate(m.competitor, 28), count: m.count }))}
            margin={{ top: 4, right: 16, left: 8, bottom: 4 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(45,156,219,0.12)" horizontal={false} />
            <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10, fill: '#5A7A8A' }} />
            <YAxis dataKey="name" type="category" width={130} tick={{ fontSize: 10, fill: '#0B1C24' }} />
            <RTooltip contentStyle={{ fontSize: 11, borderRadius: 6 }} />
            <Bar dataKey="count" fill="#EF6C33" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>
            <th style={{ padding: '6px 4px', color: '#5A7A8A', fontWeight: 600 }}>Competitor</th>
            <th style={{ padding: '6px 4px', color: '#5A7A8A', fontWeight: 600, width: 70 }}>Mentions</th>
            <th style={{ padding: '6px 4px', color: '#5A7A8A', fontWeight: 600 }}>Engines</th>
          </tr>
        </thead>
        <tbody>
          {top.map((m) => (
            <tr key={m.competitor} style={{ borderBottom: '1px solid #f1f5f9' }}>
              <td style={{ padding: '6px 4px', color: '#0B1C24', fontWeight: 500 }}>{m.competitor}</td>
              <td style={{ padding: '6px 4px', fontWeight: 600 }}>{m.count}</td>
              <td style={{ padding: '6px 4px' }}>
                <EngineBadges engines={m.engines} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// Full-report modal (5 tabs)
// ────────────────────────────────────────────────────────────────

function AiSearchDetailsModal({
  activeTab,
  setActiveTab,
  onClose,
  data,
}: {
  activeTab: DetailTab;
  setActiveTab: (tab: DetailTab) => void;
  onClose: () => void;
  data: SeoAiSearchResponse;
}) {
  const tabs: Array<{ key: DetailTab; label: string }> = [
    { key: 'rankings', label: 'Rankings' },
    { key: 'engines', label: 'Engines' },
    { key: 'sources', label: 'Source Pages' },
    { key: 'competitors', label: 'Competitors' },
    { key: 'prompts', label: 'Prompts' },
  ];

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
      onClick={onClose}
    >
      <div
        style={{ background: '#fff', borderRadius: 12, maxWidth: 1100, width: '94vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ padding: '16px 24px', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 11, color: '#5A7A8A', textTransform: 'uppercase', letterSpacing: 0.5 }}>AI Search</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#0B1C24', marginTop: 2 }}>Full Report</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', color: '#999', padding: '0 4px' }}>
            &times;
          </button>
        </div>
        <div style={{ padding: '10px 24px 0', borderBottom: '1px solid #eee', display: 'flex', gap: 6 }}>
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              style={{
                padding: '10px 14px',
                fontSize: 12,
                fontWeight: activeTab === t.key ? 700 : 500,
                background: 'transparent',
                color: activeTab === t.key ? '#0B1C24' : '#5A7A8A',
                border: 'none',
                borderBottom: activeTab === t.key ? '2px solid #2D9CDB' : '2px solid transparent',
                cursor: 'pointer',
                marginBottom: -1,
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
          {activeTab === 'rankings' && <RankingsTab data={data} />}
          {activeTab === 'engines' && <EnginesTab data={data} />}
          {activeTab === 'sources' && <SourcesTab data={data} />}
          {activeTab === 'competitors' && <CompetitorsTab data={data} />}
          {activeTab === 'prompts' && <PromptsTab data={data} />}
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// Tab: Rankings
// ────────────────────────────────────────────────────────────────

type PromptRow = {
  engineId: string;
  engineBaseName: string;
  engineLabel: string;
  prompt: SeoAiPromptRanking;
};

function RankingsTab({ data }: { data: SeoAiSearchResponse }) {
  const [engineFilter, setEngineFilter] = React.useState<string>('all');
  const [mentionedOnly, setMentionedOnly] = React.useState<boolean>(false);

  const rows: PromptRow[] = React.useMemo(() => {
    const out: PromptRow[] = [];
    for (const e of data.engines || []) {
      for (const p of e.recentPrompts || []) {
        out.push({ engineId: e.engineId, engineBaseName: e.baseName, engineLabel: e.label, prompt: p });
      }
    }
    return out;
  }, [data]);

  const filtered = rows.filter((r) => {
    if (engineFilter !== 'all' && r.engineBaseName !== engineFilter) return false;
    if (mentionedOnly && !r.prompt.mentioned) return false;
    return true;
  });

  if (rows.length === 0) {
    return <AwaitingData message="No prompt rankings yet. The first AIRT snapshot typically completes within 24 hours of onboarding." />;
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
        <label style={{ fontSize: 11, color: '#5A7A8A' }}>
          Engine:&nbsp;
          <select
            value={engineFilter}
            onChange={(e) => setEngineFilter(e.target.value)}
            style={{ fontSize: 11, padding: '4px 8px', border: '1px solid #d5e0e8', borderRadius: 4 }}
          >
            <option value="all">All engines</option>
            {(data.engines || []).map((e) => (
              <option key={e.engineId} value={e.baseName}>
                {e.label}
              </option>
            ))}
          </select>
        </label>
        <label style={{ fontSize: 11, color: '#5A7A8A', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" checked={mentionedOnly} onChange={(e) => setMentionedOnly(e.target.checked)} />
          Mentioned only
        </label>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: '#5A7A8A' }}>
          Showing {filtered.length} of {rows.length}
        </span>
      </div>
      {filtered.length === 0 ? (
        <AwaitingData message="No rows match the current filters." />
      ) : (
        <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>
              <th style={{ padding: '8px 6px', color: '#5A7A8A', fontWeight: 600, width: 120 }}>Engine</th>
              <th style={{ padding: '8px 6px', color: '#5A7A8A', fontWeight: 600 }}>Prompt</th>
              <th style={{ padding: '8px 6px', color: '#5A7A8A', fontWeight: 600, width: 90 }}>Mentioned</th>
              <th style={{ padding: '8px 6px', color: '#5A7A8A', fontWeight: 600, width: 70 }}>Position</th>
              <th style={{ padding: '8px 6px', color: '#5A7A8A', fontWeight: 600, width: 90 }}>Citations</th>
              <th style={{ padding: '8px 6px', color: '#5A7A8A', fontWeight: 600, width: 100 }}>Date</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r, i) => (
              <tr key={`${r.engineId}-${r.prompt.promptId}-${i}`} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ padding: '8px 6px' }}>
                  <EngineBadges engines={[r.engineBaseName]} />
                </td>
                <td style={{ padding: '8px 6px', color: '#0B1C24' }} title={r.prompt.prompt}>
                  {truncate(r.prompt.prompt, 80)}
                </td>
                <td style={{ padding: '8px 6px', fontWeight: 600, color: r.prompt.mentioned ? '#1D9E75' : '#D85A30' }}>
                  {r.prompt.mentioned ? '✓' : '✗'}
                </td>
                <td style={{ padding: '8px 6px' }}>
                  {r.prompt.position != null ? r.prompt.position : <span style={{ color: '#94A3B8' }}>—</span>}
                </td>
                <td style={{ padding: '8px 6px' }} title={(r.prompt.citationUrls || []).join('\n')}>
                  {r.prompt.citationUrls?.length ? `${r.prompt.citationUrls.length} link${r.prompt.citationUrls.length === 1 ? '' : 's'}` : <span style={{ color: '#94A3B8' }}>—</span>}
                </td>
                <td style={{ padding: '8px 6px', color: '#5A7A8A' }}>
                  {r.prompt.date ? new Date(r.prompt.date).toLocaleDateString() : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// Tab: Engines
// ────────────────────────────────────────────────────────────────

function EnginesTab({ data }: { data: SeoAiSearchResponse }) {
  const [expanded, setExpanded] = React.useState<string | null>(data.engines?.[0]?.engineId || null);

  if (!data.engines || data.engines.length === 0) {
    return <AwaitingData message="Engines populate after the first AIRT run. First snapshot usually completes within 24 hours." />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {data.engines.map((e) => {
        const color = engineColor(e.baseName);
        const open = expanded === e.engineId;
        return (
          <div key={e.engineId} style={{ border: '1px solid #e2e8f0', borderLeft: `3px solid ${color}`, borderRadius: 8, overflow: 'hidden' }}>
            <button
              onClick={() => setExpanded(open ? null : e.engineId)}
              style={{
                width: '100%',
                padding: '12px 14px',
                background: '#F8FAFC',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontSize: 13,
                fontWeight: 700,
                color: '#0B1C24',
              }}
            >
              <span>
                {e.label}{' '}
                <span style={{ fontSize: 10, fontWeight: 500, color: '#5A7A8A', marginLeft: 8 }}>
                  {e.region || 'global'} · {e.lang || 'en'}
                </span>
              </span>
              <span style={{ fontSize: 11, color: '#5A7A8A' }}>{open ? '▲' : '▼'}</span>
            </button>
            {open && (
              <div style={{ padding: 14 }}>
                {!e.unlocked ? (
                  <AwaitingData message={`Locked — requires ${e.tierRequired}`} />
                ) : (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
                      <SummaryStat label="Mentions" value={e.current?.mentions ?? 0} sub={`prior ${e.prior?.mentions ?? 0}`} color={color} />
                      <SummaryStat label="Visibility" value={`${Math.round(e.current?.visibilityScore ?? 0)}%`} sub={`prior ${Math.round(e.prior?.visibilityScore ?? 0)}%`} />
                      <SummaryStat label="Avg Position" value={e.current?.avgPosition != null ? Math.round(e.current.avgPosition * 10) / 10 : '—'} />
                      <SummaryStat label="Prompts" value={e.current?.promptsCount ?? 0} />
                      <SummaryStat label="Linked" value={e.current?.linkedCount ?? 0} />
                    </div>
                    <div style={{ marginTop: 14, fontSize: 12, fontWeight: 700, color: '#0B1C24' }}>Recent prompts</div>
                    {(!e.recentPrompts || e.recentPrompts.length === 0) ? (
                      <AwaitingData message="No prompt results captured for this engine yet." />
                    ) : (
                      <table style={{ width: '100%', marginTop: 8, fontSize: 11, borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>
                            <th style={{ padding: '6px 4px', color: '#5A7A8A', fontWeight: 600 }}>Prompt</th>
                            <th style={{ padding: '6px 4px', color: '#5A7A8A', fontWeight: 600, width: 80 }}>Mentioned</th>
                            <th style={{ padding: '6px 4px', color: '#5A7A8A', fontWeight: 600, width: 60 }}>Pos</th>
                            <th style={{ padding: '6px 4px', color: '#5A7A8A', fontWeight: 600 }}>Citations</th>
                          </tr>
                        </thead>
                        <tbody>
                          {e.recentPrompts.map((p, i) => (
                            <tr key={`${p.promptId}-${i}`} style={{ borderBottom: '1px solid #f1f5f9' }}>
                              <td style={{ padding: '6px 4px' }} title={p.prompt}>{truncate(p.prompt, 70)}</td>
                              <td style={{ padding: '6px 4px', fontWeight: 600, color: p.mentioned ? '#1D9E75' : '#D85A30' }}>
                                {p.mentioned ? '✓' : '✗'}
                              </td>
                              <td style={{ padding: '6px 4px' }}>{p.position ?? '—'}</td>
                              <td style={{ padding: '6px 4px' }}>
                                {p.citationUrls?.length ? (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                    {p.citationUrls.slice(0, 3).map((u) => (
                                      <a key={u} href={u} target="_blank" rel="noopener noreferrer" style={{ color: '#2D9CDB', textDecoration: 'none', fontSize: 10 }}>
                                        {truncate(prettyUrl(u), 48)}
                                      </a>
                                    ))}
                                    {p.citationUrls.length > 3 && (
                                      <span style={{ fontSize: 10, color: '#5A7A8A' }}>+{p.citationUrls.length - 3} more</span>
                                    )}
                                  </div>
                                ) : (
                                  <span style={{ color: '#94A3B8' }}>—</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                    {e.upstreamErrors && e.upstreamErrors.length > 0 && (
                      <div style={{ marginTop: 10, fontSize: 11, color: '#D85A30', background: 'rgba(216,90,48,0.06)', border: '1px solid rgba(216,90,48,0.2)', padding: '8px 10px', borderRadius: 4 }}>
                        {e.upstreamErrors.join(' — ')}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// Tab: Sources
// ────────────────────────────────────────────────────────────────

function SourcesTab({ data }: { data: SeoAiSearchResponse }) {
  const [sortBy, setSortBy] = React.useState<'count' | 'url'>('count');
  const pages = data.aggregate?.topSourcePages ?? [];

  if (pages.length === 0) {
    return <AwaitingData message="Source pages populate as AI engines cite your content. Typically appears after the first two snapshot cycles." />;
  }

  const sorted = [...pages].sort((a, b) => {
    if (sortBy === 'count') return b.citationCount - a.citationCount;
    return a.url.localeCompare(b.url);
  });

  return (
    <div>
      <div style={{ marginBottom: 10, fontSize: 11, color: '#5A7A8A' }}>
        {pages.length} unique page{pages.length === 1 ? '' : 's'} cited · Sort by{' '}
        <button
          onClick={() => setSortBy('count')}
          style={{ background: 'none', border: 'none', color: sortBy === 'count' ? '#2D9CDB' : '#5A7A8A', fontWeight: sortBy === 'count' ? 700 : 400, cursor: 'pointer', fontSize: 11 }}
        >
          citations
        </button>
        {' · '}
        <button
          onClick={() => setSortBy('url')}
          style={{ background: 'none', border: 'none', color: sortBy === 'url' ? '#2D9CDB' : '#5A7A8A', fontWeight: sortBy === 'url' ? 700 : 400, cursor: 'pointer', fontSize: 11 }}
        >
          URL
        </button>
      </div>
      <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>
            <th style={{ padding: '8px 6px', color: '#5A7A8A', fontWeight: 600 }}>URL</th>
            <th style={{ padding: '8px 6px', color: '#5A7A8A', fontWeight: 600, width: 90 }}>Citations</th>
            <th style={{ padding: '8px 6px', color: '#5A7A8A', fontWeight: 600 }}>Cited by</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((p) => (
            <tr key={p.url} style={{ borderBottom: '1px solid #f1f5f9' }}>
              <td style={{ padding: '8px 6px' }}>
                <a href={p.url} target="_blank" rel="noopener noreferrer" style={{ color: '#2D9CDB', textDecoration: 'none' }}>
                  {prettyUrl(p.url)}
                </a>
              </td>
              <td style={{ padding: '8px 6px', fontWeight: 600 }}>{p.citationCount}</td>
              <td style={{ padding: '8px 6px' }}>
                <EngineBadges engines={p.engines} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// Tab: Competitors
// ────────────────────────────────────────────────────────────────

function CompetitorsTab({ data }: { data: SeoAiSearchResponse }) {
  const [sortBy, setSortBy] = React.useState<'count' | 'name'>('count');
  const items = data.aggregate?.competitorMentions ?? [];

  if (items.length === 0) {
    return <AwaitingData message="Competitor mentions populate once AI engines cite rival brands within your tracked prompts." />;
  }

  const sorted = [...items].sort((a, b) => {
    if (sortBy === 'count') return b.count - a.count;
    return a.competitor.localeCompare(b.competitor);
  });

  return (
    <div>
      <div style={{ marginBottom: 10, fontSize: 11, color: '#5A7A8A' }}>
        {items.length} competitor{items.length === 1 ? '' : 's'} cited · Sort by{' '}
        <button
          onClick={() => setSortBy('count')}
          style={{ background: 'none', border: 'none', color: sortBy === 'count' ? '#2D9CDB' : '#5A7A8A', fontWeight: sortBy === 'count' ? 700 : 400, cursor: 'pointer', fontSize: 11 }}
        >
          mentions
        </button>
        {' · '}
        <button
          onClick={() => setSortBy('name')}
          style={{ background: 'none', border: 'none', color: sortBy === 'name' ? '#2D9CDB' : '#5A7A8A', fontWeight: sortBy === 'name' ? 700 : 400, cursor: 'pointer', fontSize: 11 }}
        >
          name
        </button>
      </div>
      <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>
            <th style={{ padding: '8px 6px', color: '#5A7A8A', fontWeight: 600 }}>Competitor</th>
            <th style={{ padding: '8px 6px', color: '#5A7A8A', fontWeight: 600, width: 90 }}>Mentions</th>
            <th style={{ padding: '8px 6px', color: '#5A7A8A', fontWeight: 600 }}>Cited in</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((m) => (
            <tr key={m.competitor} style={{ borderBottom: '1px solid #f1f5f9' }}>
              <td style={{ padding: '8px 6px', color: '#0B1C24', fontWeight: 500 }}>{m.competitor}</td>
              <td style={{ padding: '8px 6px', fontWeight: 600 }}>{m.count}</td>
              <td style={{ padding: '8px 6px' }}>
                <EngineBadges engines={m.engines} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// Tab: Prompts
// ────────────────────────────────────────────────────────────────

type PromptAggregate = {
  promptId: string;
  prompt: string;
  enginesMentioning: Set<string>;
  enginesWithCompetitors: Set<string>;
  latestDate: string | null;
  totalCitations: number;
};

function PromptsTab({ data }: { data: SeoAiSearchResponse }) {
  const aggregated = React.useMemo(() => {
    const map = new Map<string, PromptAggregate>();
    for (const e of data.engines || []) {
      for (const p of e.recentPrompts || []) {
        const key = p.promptId || p.prompt;
        let entry = map.get(key);
        if (!entry) {
          entry = {
            promptId: p.promptId,
            prompt: p.prompt,
            enginesMentioning: new Set(),
            enginesWithCompetitors: new Set(),
            latestDate: null,
            totalCitations: 0,
          };
          map.set(key, entry);
        }
        if (p.mentioned) entry.enginesMentioning.add(e.baseName);
        if (p.competitors && p.competitors.length > 0) entry.enginesWithCompetitors.add(e.baseName);
        entry.totalCitations += p.citationUrls?.length ?? 0;
        if (p.date && (!entry.latestDate || p.date > entry.latestDate)) entry.latestDate = p.date;
      }
    }
    return Array.from(map.values()).sort((a, b) => b.enginesMentioning.size - a.enginesMentioning.size);
  }, [data]);

  if (aggregated.length === 0) {
    return <AwaitingData message="Prompts populate after the first AIRT run. Typically within 24 hours of onboarding." />;
  }

  return (
    <div>
      <div style={{ fontSize: 11, color: '#5A7A8A', marginBottom: 10 }}>
        Showing {aggregated.length} unique prompt{aggregated.length === 1 ? '' : 's'} deduped across engines
      </div>
      <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>
            <th style={{ padding: '8px 6px', color: '#5A7A8A', fontWeight: 600 }}>Prompt</th>
            <th style={{ padding: '8px 6px', color: '#5A7A8A', fontWeight: 600, width: 120 }}>You mentioned</th>
            <th style={{ padding: '8px 6px', color: '#5A7A8A', fontWeight: 600, width: 120 }}>Competitors cited</th>
            <th style={{ padding: '8px 6px', color: '#5A7A8A', fontWeight: 600, width: 80 }}>Citations</th>
            <th style={{ padding: '8px 6px', color: '#5A7A8A', fontWeight: 600, width: 100 }}>Latest</th>
          </tr>
        </thead>
        <tbody>
          {aggregated.map((p, i) => (
            <tr key={`${p.promptId}-${i}`} style={{ borderBottom: '1px solid #f1f5f9' }}>
              <td style={{ padding: '8px 6px' }} title={p.prompt}>{truncate(p.prompt, 80)}</td>
              <td style={{ padding: '8px 6px', fontWeight: 600, color: p.enginesMentioning.size > 0 ? '#1D9E75' : '#D85A30' }}>
                {p.enginesMentioning.size} engine{p.enginesMentioning.size === 1 ? '' : 's'}
              </td>
              <td style={{ padding: '8px 6px', color: p.enginesWithCompetitors.size > 0 ? '#EF6C33' : '#5A7A8A' }}>
                {p.enginesWithCompetitors.size} engine{p.enginesWithCompetitors.size === 1 ? '' : 's'}
              </td>
              <td style={{ padding: '8px 6px' }}>{p.totalCitations}</td>
              <td style={{ padding: '8px 6px', color: '#5A7A8A' }}>
                {p.latestDate ? new Date(p.latestDate).toLocaleDateString() : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
