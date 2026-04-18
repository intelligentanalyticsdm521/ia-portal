/**
 * Phase 3.5 SEO Overview — HOLISTIC cross-section dashboard.
 *
 * Not a rankings dashboard (that's Keyword Rankings). This is the one page
 * a client can open monthly to get a complete view across every SEO surface:
 *   - Hero engine cards for standard + AI search
 *   - Key metrics row (visibility, top 10, traffic forecast, audit score)
 *   - Cross-section widget grid — each links into its own dedicated page
 *   - ARGUS alert feed at the bottom
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useArionContext } from '../../useArionContext';
import { useArionData } from '../../useArionData';
import { Card, AddonUpsell, EmptyPanel, Loading, ConsultingUpsell, ErrorBanner } from '../../components/Ui';
import { SeoRangePicker, SeoStatCard, POSITION_BUCKET_COLORS, POSITION_BUCKET_LABELS } from '../../components/SeoUi';
import { GlossaryIcon } from '../../components/Glossary';
import type { SeoRangeCode, SeoOverviewResponse, SeoAuditResponse } from '../../../lib/arionApi';

const AI_ENGINE_LABELS = ['AI Overview', 'ChatGPT', 'Gemini', 'Perplexity'];

export function SeoOverview() {
  const { selectedSite, activeSiteId, arionApi } = useArionContext();
  const navigate = useNavigate();
  const [range, setRange] = React.useState<SeoRangeCode>('30d');

  const { data: overviewData, loading: overviewLoading } = useArionData(
    () => activeSiteId ? arionApi.getSeoOverview(activeSiteId, range) : Promise.resolve(null),
    [activeSiteId, range]
  );
  const { data: auditData } = useArionData(
    () => activeSiteId ? arionApi.getSeoAudit(activeSiteId).catch(() => null) : Promise.resolve(null),
    [activeSiteId]
  );

  if (overviewLoading) return <Loading />;
  if (!selectedSite) return <EmptyPanel message="No ARION site selected." />;

  const o = overviewData as SeoOverviewResponse | null;
  const a = auditData as SeoAuditResponse | null;
  const connected = o?.connected === true;
  const hasSeoAddon = selectedSite?.seoAddonTier != null;

  if (!connected && !hasSeoAddon) {
    return (
      <AddonUpsell
        title="SEO Tools — Add-on not active"
        description="Full SEO intelligence across Google, Bing, and AI search engines. Powered by SE Ranking."
        price="$29"
        planName="Starter"
      />
    );
  }

  if (!connected) {
    return <ErrorBanner message="SE Ranking is not connected for this site yet. Check the Keyword Rankings page to run diagnostics." />;
  }

  const stats = o!.stats.current;
  const delta = o!.stats.delta;
  const providers = o!.heroCards?.providers || [];
  const ai = o!.heroCards?.ai || [];
  const movers = o!.movers || { jumped: [], dropped: [], unchanged: 0 };

  // Tier gating — lower tiers see AI cards as locked previews.
  const tier = (selectedSite?.seoAddonTier || '').toLowerCase();
  const aiEnginesUnlocked: Record<string, boolean> = {
    'chatgpt': tier === 'growth' || tier === 'authority',
    'gemini': tier === 'growth' || tier === 'authority',
    'ai overview': tier === 'authority',
    'perplexity': tier === 'authority',
  };

  const aiCardsByName: Record<string, typeof ai[0] | null> = {};
  for (const x of ai) aiCardsByName[x.name.toLowerCase()] = x;
  const aiDisplay = AI_ENGINE_LABELS.map((label) => {
    const key = label.toLowerCase();
    const card = aiCardsByName[key] || Object.entries(aiCardsByName).find(([k]) => k.includes(key.split(' ')[0]))?.[1] || null;
    return { label, key, card, unlocked: aiEnginesUnlocked[key] ?? false };
  });

  const auditHealth = a?.status === 'complete' ? (a.healthScore ?? 0) : null;
  const auditErrors = a?.issues?.errors ?? 0;
  const auditWarnings = a?.issues?.warnings ?? 0;

  return (
    <div>
      {/* Filter bar */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16 }}>
        <SeoRangePicker value={range} onChange={setRange} />
        <div style={{ fontSize: 11, color: 'var(--color-text-tertiary, #5A7A8A)', marginLeft: 'auto' }}>
          {o!.range.label} · vs {o!.range.prior.start} to {o!.range.prior.end}
        </div>
      </div>

      {/* Row 1: Standard Search hero cards */}
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary, #0B1C24)', marginBottom: 8 }}>Standard Search</div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.max(providers.length, 1)}, 1fr)`, gap: 12, marginBottom: 18 }}>
        {providers.length === 0 ? (
          <div style={{ color: '#5A7A8A', fontSize: 12, padding: 20, textAlign: 'center', background: '#F8FAFC', borderRadius: 6 }}>
            No search engines configured. Check your SE Ranking project setup.
          </div>
        ) : providers.map((p) => (
          <SeoStatCard
            key={p.name}
            label={p.name}
            value={p.current.avgPosition != null ? `#${Math.round(p.current.avgPosition)}` : '—'}
            sub={`${p.current.rankingKeywords} / ${p.current.totalKeywords} ranking · ${p.devices.join(' + ') || 'all devices'}`}
            delta={p.avgPositionDelta}
            deltaFormat="position"
            deltaIsGoodWhenPositive={true}
            accent="#2D9CDB"
          />
        ))}
      </div>

      {/* Row 2: AI Search hero cards */}
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary, #0B1C24)', marginBottom: 8, display: 'flex', alignItems: 'center' }}>
        AI Search Engines <GlossaryIcon termKey="ai_mentions" />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 22 }}>
        {aiDisplay.map((ae) => (
          <SeoStatCard
            key={ae.label}
            label={ae.label}
            value={ae.card?.current?.top10Count != null ? ae.card.current.top10Count : '—'}
            sub={ae.unlocked ? 'mentions in AI responses' : 'Upgrade to Growth / Authority'}
            delta={ae.card?.visibilityDelta ?? null}
            deltaFormat="signed"
            deltaIsGoodWhenPositive={true}
            accent="#0C4A60"
            locked={!ae.unlocked}
          />
        ))}
      </div>

      {/* Row 3: Key metrics */}
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary, #0B1C24)', marginBottom: 8 }}>Key metrics</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 22 }}>
        <SeoStatCard
          termKey="search_visibility"
          label="Search Visibility"
          value={`${stats.visibilityScore}%`}
          delta={delta.visibilityScore != null ? Number(delta.visibilityScore) : null}
          deltaFormat="percentage"
          accent="#1D9E75"
        />
        <SeoStatCard
          termKey="top10_keywords"
          label="Top 10 Keywords"
          value={stats.top10Count || 0}
          sub={`of ${stats.totalKeywords || 0} total`}
          delta={delta.top10Count != null ? Number(delta.top10Count) : null}
          deltaIsGoodWhenPositive={true}
          accent="#EF6C33"
        />
        <SeoStatCard
          termKey="traffic_forecast"
          label="Traffic Forecast"
          value={`~${stats.trafficForecast}`}
          sub="est. monthly clicks"
          delta={delta.trafficForecast != null ? Number(delta.trafficForecast) : null}
          accent="#FEC82C"
        />
        <SeoStatCard
          termKey="health_score"
          label="Audit Health Score"
          value={auditHealth != null ? auditHealth : '—'}
          sub={auditHealth != null ? (auditHealth >= 80 ? 'Strong' : auditHealth >= 50 ? 'Needs attention' : 'At risk') : 'Run audit'}
          accent={auditHealth == null ? '#94A3B8' : auditHealth >= 80 ? '#1D9E75' : auditHealth >= 50 ? '#EF6C33' : '#D85A30'}
        />
      </div>

      {/* Row 4: Cross-section widget grid */}
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary, #0B1C24)', marginBottom: 8 }}>Across your SEO</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 22 }}>
        <SectionWidget
          title="Keyword Rankings"
          primaryValue={`${stats.totalKeywords}`}
          primaryLabel="tracked"
          secondaryRows={[
            { label: 'Avg Position', value: stats.avgPosition != null ? String(Math.round(stats.avgPosition)) : '—' },
            { label: 'Top 10', value: String(stats.top10Count) },
            { label: 'Jumped / Dropped', value: `${movers.jumped.length} / ${movers.dropped.length}`, valueColor: movers.jumped.length >= movers.dropped.length ? '#1D9E75' : '#D85A30' },
          ]}
          onClick={() => navigate('/app/services/arion_seo_rankings')}
          accent="#2D9CDB"
        />
        <SectionWidget
          title="Site Audit"
          primaryValue={auditHealth != null ? String(auditHealth) : '—'}
          primaryLabel="health score"
          primaryColor={auditHealth == null ? '#94A3B8' : auditHealth >= 80 ? '#1D9E75' : auditHealth >= 50 ? '#EF6C33' : '#D85A30'}
          secondaryRows={[
            { label: 'Errors', value: String(auditErrors), valueColor: auditErrors > 0 ? '#D85A30' : '#5A7A8A' },
            { label: 'Warnings', value: String(auditWarnings), valueColor: auditWarnings > 10 ? '#EF6C33' : '#5A7A8A' },
            { label: 'Pages crawled', value: a?.pagesCrawled != null ? String(a.pagesCrawled) : '—' },
          ]}
          onClick={() => navigate('/app/services/arion_seo_site_audit')}
          accent="#EF6C33"
        />
        <SectionWidget
          title="Competitors"
          primaryValue={'—'}
          primaryLabel="tracked"
          secondaryRows={[
            { label: 'Visibility vs avg', value: '—' },
            { label: 'Keyword gap', value: '—' },
            { label: 'Content opportunities', value: '—' },
          ]}
          onClick={() => navigate('/app/services/arion_seo_competitors')}
          accent="#FEC82C"
          comingSoon="Add competitors to populate"
        />
        <SectionWidget
          title="AI Search Results"
          primaryValue={tier === 'authority' ? `${ai.length}` : tier === 'growth' ? '2' : '—'}
          primaryLabel="AI engines tracked"
          secondaryRows={[
            { label: 'ChatGPT mentions', value: aiEnginesUnlocked['chatgpt'] ? '—' : '🔒' },
            { label: 'Gemini mentions', value: aiEnginesUnlocked['gemini'] ? '—' : '🔒' },
            { label: 'Your pages cited', value: tier === 'authority' ? '—' : '🔒' },
          ]}
          onClick={() => navigate('/app/services/arion_seo_ai_search')}
          accent="#0C4A60"
          locked={tier === 'starter' || tier === 'essentials'}
          lockedLabel="Included in Growth and Authority"
        />
        <SectionWidget
          title="Market Monitor"
          primaryValue={'—'}
          primaryLabel="new backlinks"
          secondaryRows={[
            { label: 'Lost backlinks', value: '—' },
            { label: 'Competitor page edits', value: '—' },
            { label: 'New keyword rankings', value: '—' },
          ]}
          onClick={() => navigate('/app/services/arion_seo_market_monitor')}
          accent="#E64A28"
          locked={tier !== 'authority'}
          lockedLabel="Authority tier only"
        />
        <SectionWidget
          title="IA Insights"
          primaryValue={String(movers.jumped.length + movers.dropped.length)}
          primaryLabel="movers this period"
          secondaryRows={[
            { label: 'Quick wins', value: '—' },
            { label: 'Content decay', value: '—' },
            { label: 'Whitespace', value: '—' },
          ]}
          onClick={() => navigate('/app/services/arion_analytics_ia_reports')}
          accent="#1D9E75"
        />
      </div>

      {/* Row 5: ARGUS alert feed (compact) */}
      <Card title="Recent activity">
        <AlertFeed overview={o!} audit={a || null} />
      </Card>

      <ConsultingUpsell
        headline={stats.avgPosition && stats.avgPosition > 15 ? `Average position is ${Math.round(stats.avgPosition)} — IA can build a 90-day plan to reach page 1.` : "IA manages your SEO strategy end-to-end."}
        subtext="Our SEO strategists analyze your full keyword landscape and execute a custom plan."
        serviceType="SEO Strategy"
        triggerPage="seo-overview"
      />
    </div>
  );
}

/* ───────── Cross-section widget ───────── */

function SectionWidget({
  title,
  primaryValue,
  primaryLabel,
  primaryColor,
  secondaryRows,
  onClick,
  accent,
  locked = false,
  lockedLabel,
  comingSoon,
}: {
  title: string;
  primaryValue: string;
  primaryLabel: string;
  primaryColor?: string;
  secondaryRows: Array<{ label: string; value: string; valueColor?: string }>;
  onClick: () => void;
  accent: string;
  locked?: boolean;
  lockedLabel?: string;
  comingSoon?: string;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        background: '#fff',
        borderLeft: `3px solid ${accent}`,
        borderRadius: 8,
        padding: '14px 16px',
        cursor: 'pointer',
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
        transition: 'transform 0.15s, box-shadow 0.15s',
        position: 'relative',
        minHeight: 170,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 4px 14px rgba(0,0,0,0.1)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.06)'; e.currentTarget.style.transform = 'none'; }}
    >
      {locked && (
        <div style={{ position: 'absolute', top: 12, right: 12, background: 'rgba(214,168,0,0.15)', color: '#C48C00', fontSize: 9, fontWeight: 700, padding: '3px 8px', borderRadius: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          🔒 Upgrade
        </div>
      )}
      <div style={{ fontSize: 11, color: '#5A7A8A', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600, marginBottom: 4 }}>{title}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 10 }}>
        <span style={{ fontSize: 28, fontWeight: 700, color: primaryColor || '#0B1C24', lineHeight: 1 }}>{primaryValue}</span>
        <span style={{ fontSize: 11, color: '#5A7A8A' }}>{primaryLabel}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
        {secondaryRows.map((r, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
            <span style={{ color: '#5A7A8A' }}>{r.label}</span>
            <span style={{ color: r.valueColor || '#0B1C24', fontWeight: 500 }}>{r.value}</span>
          </div>
        ))}
      </div>
      {(lockedLabel || comingSoon) && (
        <div style={{ fontSize: 10, color: '#94A3B8', fontStyle: 'italic', marginTop: 8, paddingTop: 8, borderTop: '1px dashed #eef2f5' }}>
          {locked ? lockedLabel : comingSoon}
        </div>
      )}
      <div style={{ position: 'absolute', bottom: 10, right: 14, fontSize: 11, fontWeight: 600, color: accent }}>
        View →
      </div>
    </div>
  );
}

/* ───────── Alert feed ───────── */

function AlertFeed({ overview, audit }: { overview: SeoOverviewResponse; audit: SeoAuditResponse | null }) {
  const alerts: Array<{ tone: 'good' | 'warn' | 'bad' | 'info'; text: React.ReactNode }> = [];

  const topJump = overview.movers.jumped[0];
  const topDrop = overview.movers.dropped[0];
  if (topJump) {
    alerts.push({
      tone: 'good',
      text: <><strong>{topJump.keyword}</strong> jumped {topJump.positionChange} positions to #{topJump.currentPosition}.</>,
    });
  }
  if (topDrop) {
    alerts.push({
      tone: 'bad',
      text: <><strong>{topDrop.keyword}</strong> dropped {Math.abs(topDrop.positionChange)} positions to #{topDrop.currentPosition ?? '—'}.</>,
    });
  }
  const newTop10 = overview.stats.current.top10Count - overview.stats.prior.top10Count;
  if (newTop10 > 0) {
    alerts.push({ tone: 'good', text: <>{newTop10} new keyword{newTop10 === 1 ? '' : 's'} entered the top 10 this period.</> });
  } else if (newTop10 < 0) {
    alerts.push({ tone: 'warn', text: <>{Math.abs(newTop10)} keyword{Math.abs(newTop10) === 1 ? '' : 's'} fell out of the top 10 this period.</> });
  }
  if (audit?.status === 'complete' && (audit.issues?.errors ?? 0) > 0) {
    alerts.push({
      tone: 'bad',
      text: <>Site audit found <strong>{audit.issues!.errors} critical errors</strong>. Fixing these is the fastest SEO win.</>,
    });
  }
  if (audit?.status === 'complete' && (audit.healthScore ?? 0) >= 80) {
    alerts.push({ tone: 'good', text: <>Site audit health is strong at <strong>{audit.healthScore}/100</strong>.</> });
  }

  if (alerts.length === 0) {
    return <div style={{ fontSize: 12, color: '#5A7A8A', padding: '10px 0' }}>No significant changes this period.</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {alerts.map((alert, i) => {
        const color = alert.tone === 'good' ? '#1D9E75' : alert.tone === 'warn' ? '#EF6C33' : alert.tone === 'bad' ? '#D85A30' : '#2D9CDB';
        const icon = alert.tone === 'good' ? '▲' : alert.tone === 'warn' ? '⚠' : alert.tone === 'bad' ? '▼' : 'ⓘ';
        return (
          <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 12, padding: '6px 0', borderBottom: i < alerts.length - 1 ? '1px solid #f5f5f5' : 'none' }}>
            <span style={{ color, fontWeight: 700, flexShrink: 0, width: 16, textAlign: 'center' }}>{icon}</span>
            <span style={{ color: '#0B1C24', lineHeight: 1.55 }}>{alert.text}</span>
          </div>
        );
      })}
    </div>
  );
}
