/**
 * Phase 3.5 Market Monitor — Authority tier only.
 *
 * Live backend (arion-func timer jobs populate these feeds):
 *   - Competitor Moves: daily position history → diffs rendered here
 *   - Backlink Watch:   weekly referring-domain snapshot (SE Ranking Data API)
 *   - Page Changes:     daily content-hash sweep of watched own-site +
 *                       competitor pages
 *
 * Tier gating: server-side. For non-Authority tiers the endpoint returns
 * authorityGated:true + a message, and we render the upgrade CTA.
 *
 * Empty-state design: when a job hasn't run yet for the site, we still show
 * the subsection cards with "awaiting first run" copy and the last-run
 * timestamp (or "never") so the user knows the feature is live.
 */
import React from 'react';
import { ResponsiveContainer, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, Tooltip as RTooltip, Legend } from 'recharts';
import { useArionContext } from '../../useArionContext';
import { useArionData } from '../../useArionData';
import { AddonUpsell, EmptyPanel, InfoCard, ConsultingUpsell, Loading } from '../../components/Ui';
import { SeoStatCard } from '../../components/SeoUi';
import { GlossaryIcon, GlossaryPanel } from '../../components/Glossary';
import { MarketMonitorWatchlistModal } from './MarketMonitorWatchlistModal';
import type { SeoMarketMonitorMove, SeoMarketMonitorBacklink, SeoMarketMonitorPageChange, SeoMarketMonitorJobStatus } from '../../../lib/arionApi';

type SubSection = 'backlinks' | 'page_changes' | 'competitor_moves';

export function SeoMarketMonitor() {
  const { selectedSite, activeSiteId, arionApi } = useArionContext();
  const [openModal, setOpenModal] = React.useState<SubSection | null>(null);
  const [showWatchlistModal, setShowWatchlistModal] = React.useState(false);
  const [refreshKey, setRefreshKey] = React.useState(0);

  const { data: mm, loading } = useArionData(
    () => activeSiteId ? arionApi.getSeoMarketMonitor(activeSiteId, 30) : Promise.resolve(null),
    [activeSiteId, refreshKey]
  );

  if (loading) return <Loading />;
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

  const data = mm as any;
  const authorityGated = data?.authorityGated === true;

  // Growth/Essentials/Starter preview
  if (authorityGated) {
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

  const moves: SeoMarketMonitorMove[] = data?.moves ?? [];
  const newBacklinks: SeoMarketMonitorBacklink[] = data?.backlinks?.new ?? [];
  const lostBacklinks: SeoMarketMonitorBacklink[] = data?.backlinks?.lost ?? [];
  const activeBacklinks = data?.backlinks?.totals?.active ?? 0;
  const pageChanges: SeoMarketMonitorPageChange[] = data?.pageChanges ?? [];
  const jobStatus = data?.jobStatus ?? { moves: null, backlinks: null, page_changes: null };

  return (
    <div>
      <InfoCard title="Market Monitor — Authority">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <p style={{ margin: 0, fontSize: 12, flex: 1, minWidth: 280 }}>
            Real-time market signals across your SEO project. Daily backlink checks, competitor page change detection, and large ranking movement alerts.
            Backend jobs run automatically on the Authority tier.
          </p>
          <button
            onClick={() => setShowWatchlistModal(true)}
            style={{ padding: '8px 16px', fontSize: 12, fontWeight: 600, background: '#0B1C24', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}
          >
            Manage Watchlist →
          </button>
        </div>
      </InfoCard>

      {/* Row 1: headline stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginTop: 16 }}>
        <SeoStatCard termKey="backlinks_new" label="New Backlinks" value={String(newBacklinks.length)} sub="past 30 days" accent="#1D9E75" />
        <SeoStatCard termKey="backlinks_lost" label="Lost Backlinks" value={String(lostBacklinks.length)} sub="past 30 days" accent="#C55" />
        <SeoStatCard termKey="page_changes" label="Page Changes" value={String(pageChanges.length)} sub="on watched pages" accent="#4285F4" />
        <SeoStatCard termKey="competitor_moves" label="Competitor Moves" value={String(moves.length)} sub="≥5 position swings" accent="#EF6C33" />
      </div>

      {/* Three subsection summary cards */}
      <div style={{ fontSize: 13, fontWeight: 600, color: '#0B1C24', marginTop: 22, marginBottom: 10 }}>Detail feeds</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        <SubsectionCard
          title="Backlink Watch"
          description="Referring domains gained or lost, with authority score and first-seen / last-seen dates"
          primaryStat={String(activeBacklinks || newBacklinks.length)}
          primaryLabel={activeBacklinks > 0 ? 'active referring domains' : 'new referring domains'}
          accent="#1D9E75"
          onViewDetails={() => setOpenModal('backlinks')}
          termKey="backlinks_new"
          jobStatus={jobStatus.backlinks}
        />
        <SubsectionCard
          title="Page Changes"
          description="Content change detection on competitor pages and your tracked priority pages"
          primaryStat={String(pageChanges.length)}
          primaryLabel="changes this period"
          accent="#4285F4"
          onViewDetails={() => setOpenModal('page_changes')}
          termKey="page_changes"
          jobStatus={jobStatus.page_changes}
        />
        <SubsectionCard
          title="Competitor Moves"
          description="Ranking swings greater than 5 positions across your tracked competitors and keywords"
          primaryStat={String(moves.length)}
          primaryLabel="large moves"
          accent="#EF6C33"
          onViewDetails={() => setOpenModal('competitor_moves')}
          termKey="competitor_moves"
          jobStatus={jobStatus.moves}
        />
      </div>

      {/* Market Pulse visuals row */}
      <div style={{ marginTop: 22, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <WidgetContainer title="Backlinks Trend" subtitle="New vs lost referring domains by day">
          <BacklinksTrendChart newBacklinks={newBacklinks} lostBacklinks={lostBacklinks} />
        </WidgetContainer>
        <WidgetContainer title="Competitor Moves Distribution" subtitle="Direction of large ranking swings">
          <MovesDistributionChart moves={moves} />
        </WidgetContainer>
      </div>

      {/* Page Changes Overview row */}
      <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <WidgetContainer title="Change Magnitude Distribution" subtitle="How much content changed per detection">
          <ChangeMagnitudeChart pageChanges={pageChanges} />
        </WidgetContainer>
        <WidgetContainer title="Changes by Type" subtitle="Your pages vs competitor pages">
          <ChangesByTypeChart pageChanges={pageChanges} />
        </WidgetContainer>
      </div>

      {/* Top competitors by move activity */}
      {moves.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <WidgetContainer title="Top Competitors by Move Activity" subtitle="Tracked domains with the most large ranking swings">
            <TopCompetitorsByMovesChart moves={moves} />
          </WidgetContainer>
        </div>
      )}

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
        <MarketSubsectionModal
          section={openModal}
          moves={moves}
          newBacklinks={newBacklinks}
          lostBacklinks={lostBacklinks}
          pageChanges={pageChanges}
          onClose={() => setOpenModal(null)}
        />
      )}

      {showWatchlistModal && (
        <MarketMonitorWatchlistModal
          onClose={() => setShowWatchlistModal(false)}
          onSaved={() => { setShowWatchlistModal(false); setRefreshKey((k) => k + 1); }}
        />
      )}
    </div>
  );
}

function formatAgo(iso: string | null | undefined) {
  if (!iso) return 'never';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 'never';
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 60) return `${mins}m ago`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)}h ago`;
  return `${Math.round(mins / (60 * 24))}d ago`;
}

function SubsectionCard({
  title,
  description,
  primaryStat,
  primaryLabel,
  accent,
  onViewDetails,
  termKey,
  jobStatus,
}: {
  title: string;
  description: string;
  primaryStat: string;
  primaryLabel: string;
  accent: string;
  onViewDetails: () => void;
  termKey?: string;
  jobStatus: SeoMarketMonitorJobStatus | null;
}) {
  const lastRunLabel = jobStatus?.completedAt ? `last run ${formatAgo(jobStatus.completedAt)}` : 'awaiting first run';
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
      <div style={{ fontSize: 10, color: '#94A3B8', marginTop: 6, fontStyle: 'italic' }}>{lastRunLabel}</div>
      <button
        onClick={onViewDetails}
        style={{ marginTop: 12, padding: '6px 12px', fontSize: 11, fontWeight: 600, background: 'transparent', color: accent, border: `1px solid ${accent}`, borderRadius: 4, cursor: 'pointer', alignSelf: 'flex-start' }}
      >
        See Full Details →
      </button>
    </div>
  );
}

function MarketSubsectionModal({
  section,
  moves,
  newBacklinks,
  lostBacklinks,
  pageChanges,
  onClose,
}: {
  section: SubSection;
  moves: SeoMarketMonitorMove[];
  newBacklinks: SeoMarketMonitorBacklink[];
  lostBacklinks: SeoMarketMonitorBacklink[];
  pageChanges: SeoMarketMonitorPageChange[];
  onClose: () => void;
}) {
  const titles: Record<SubSection, string> = {
    backlinks: 'Backlink Watch — Full Details',
    page_changes: 'Page Changes — Full Details',
    competitor_moves: 'Competitor Moves — Full Details',
  };

  const tabs: Record<SubSection, Array<{ id: string; label: string }>> = {
    backlinks: [
      { id: 'new', label: `New (${newBacklinks.length})` },
      { id: 'lost', label: `Lost (${lostBacklinks.length})` },
      { id: 'referrers', label: 'Top Referring Domains' },
    ],
    page_changes: [
      { id: 'all', label: `All Changes (${pageChanges.length})` },
      { id: 'own', label: `Your Pages (${pageChanges.filter((p) => p.pageType === 'own_site').length})` },
      { id: 'competitor', label: `Competitor Pages (${pageChanges.filter((p) => p.pageType !== 'own_site').length})` },
    ],
    competitor_moves: [
      { id: 'largest', label: `Largest Moves (${moves.length})` },
      { id: 'by_competitor', label: 'By Competitor' },
      { id: 'by_keyword', label: 'By Keyword' },
    ],
  };

  const [activeTab, setActiveTab] = React.useState<string>(tabs[section][0].id);
  React.useEffect(() => { setActiveTab(tabs[section][0].id); }, [section]);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 12, maxWidth: 1100, width: '94vw', maxHeight: '88vh', display: 'flex', flexDirection: 'column' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: '16px 24px', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 11, color: '#5A7A8A', textTransform: 'uppercase', letterSpacing: 0.5 }}>Market Monitor</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#0B1C24', marginTop: 2 }}>{titles[section]}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', color: '#999', padding: '0 4px' }}>&times;</button>
        </div>

        <div style={{ display: 'flex', padding: '0 16px', borderBottom: '1px solid #eee', overflowX: 'auto' }}>
          {tabs[section].map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              style={{
                padding: '10px 16px', fontSize: 12, fontWeight: 600,
                background: 'transparent',
                color: activeTab === t.id ? '#0B1C24' : '#94A3B8',
                border: 'none',
                borderBottom: activeTab === t.id ? '2px solid #0B1C24' : '2px solid transparent',
                cursor: 'pointer', whiteSpace: 'nowrap',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
          {section === 'backlinks' && activeTab === 'new' && <BacklinksList rows={newBacklinks} kind="new" />}
          {section === 'backlinks' && activeTab === 'lost' && <BacklinksList rows={lostBacklinks} kind="lost" />}
          {section === 'backlinks' && activeTab === 'referrers' && <ReferrersAggregate newBacklinks={newBacklinks} lostBacklinks={lostBacklinks} />}

          {section === 'page_changes' && activeTab === 'all' && <PageChangesTable pageChanges={pageChanges} />}
          {section === 'page_changes' && activeTab === 'own' && <PageChangesTable pageChanges={pageChanges.filter((p) => p.pageType === 'own_site')} />}
          {section === 'page_changes' && activeTab === 'competitor' && <PageChangesByCompetitor pageChanges={pageChanges.filter((p) => p.pageType !== 'own_site')} />}

          {section === 'competitor_moves' && activeTab === 'largest' && <MovesTable moves={[...moves].sort((a, b) => Math.abs(b.positionChange) - Math.abs(a.positionChange))} />}
          {section === 'competitor_moves' && activeTab === 'by_competitor' && <MovesByCompetitor moves={moves} />}
          {section === 'competitor_moves' && activeTab === 'by_keyword' && <MovesByKeyword moves={moves} />}
        </div>
      </div>
    </div>
  );
}

function BacklinksList({ rows, kind }: { rows: SeoMarketMonitorBacklink[]; kind: 'new' | 'lost' }) {
  if (rows.length === 0) {
    return <EmptyState title={kind === 'new' ? 'No new backlinks in this window' : 'No lost backlinks in this window'} body={kind === 'new' ? 'Backlink Watch runs weekly. New acquisitions appear here within 7 days.' : 'Nothing lost — good sign.'} />;
  }
  return (
    <table className="data-table" style={{ fontSize: 12, width: '100%' }}>
      <thead>
        <tr>
          <th>Referring Domain</th>
          <th>Target URL</th>
          <th>Anchor</th>
          <th style={{ textAlign: 'right' }}>DA</th>
          <th style={{ textAlign: 'right' }}>{kind === 'new' ? 'First Seen' : 'Last Seen'}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((b, i) => (
          <tr key={i}>
            <td style={{ fontWeight: 500 }}>{b.referringDomain}</td>
            <td style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.targetUrl || '—'}</td>
            <td style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.anchorText || '—'}</td>
            <td style={{ textAlign: 'right' }}>{b.domainAuthority ?? '—'}</td>
            <td style={{ textAlign: 'right' }}>{(kind === 'new' ? b.firstSeen : b.lastSeen) ? new Date((kind === 'new' ? b.firstSeen : b.lastSeen) as string).toLocaleDateString() : '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ReferrersAggregate({ newBacklinks, lostBacklinks }: { newBacklinks: SeoMarketMonitorBacklink[]; lostBacklinks: SeoMarketMonitorBacklink[] }) {
  const byDomain = new Map<string, { domain: string; new: number; lost: number; da: number | null }>();
  for (const b of newBacklinks) {
    const ex = byDomain.get(b.referringDomain) || { domain: b.referringDomain, new: 0, lost: 0, da: b.domainAuthority };
    ex.new++;
    if (b.domainAuthority != null) ex.da = b.domainAuthority;
    byDomain.set(b.referringDomain, ex);
  }
  for (const b of lostBacklinks) {
    const ex = byDomain.get(b.referringDomain) || { domain: b.referringDomain, new: 0, lost: 0, da: b.domainAuthority };
    ex.lost++;
    if (ex.da == null && b.domainAuthority != null) ex.da = b.domainAuthority;
    byDomain.set(b.referringDomain, ex);
  }
  const rows = Array.from(byDomain.values()).sort((a, b) => (b.da ?? 0) - (a.da ?? 0));
  if (rows.length === 0) return <EmptyState title="No referring domains yet" body="Once backlink data starts landing, unique referring domains will be aggregated here." />;
  return (
    <table className="data-table" style={{ fontSize: 12, width: '100%' }}>
      <thead>
        <tr>
          <th>Referring Domain</th>
          <th style={{ textAlign: 'right' }}>Domain Authority</th>
          <th style={{ textAlign: 'right' }}>New</th>
          <th style={{ textAlign: 'right' }}>Lost</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            <td style={{ fontWeight: 500 }}>{r.domain}</td>
            <td style={{ textAlign: 'right', fontWeight: 600 }}>{r.da ?? '—'}</td>
            <td style={{ textAlign: 'right', color: '#1D9E75', fontWeight: r.new > 0 ? 600 : 400 }}>{r.new || '—'}</td>
            <td style={{ textAlign: 'right', color: '#D85A30', fontWeight: r.lost > 0 ? 600 : 400 }}>{r.lost || '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function PageChangesByCompetitor({ pageChanges }: { pageChanges: SeoMarketMonitorPageChange[] }) {
  const byComp = new Map<string, SeoMarketMonitorPageChange[]>();
  for (const pc of pageChanges) {
    const key = pc.competitorDomain || 'Unknown';
    if (!byComp.has(key)) byComp.set(key, []);
    byComp.get(key)!.push(pc);
  }
  const entries = Array.from(byComp.entries()).sort((a, b) => b[1].length - a[1].length);
  if (entries.length === 0) return <EmptyState title="No competitor page changes" body="Competitor page-watcher will surface content edits once SE Ranking has tracked at least 2 days of each watched URL." />;
  return (
    <div>
      {entries.map(([domain, changes]) => (
        <div key={domain} style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#0B1C24', marginBottom: 8 }}>{domain} <span style={{ color: '#94A3B8', fontWeight: 400 }}>({changes.length} change{changes.length === 1 ? '' : 's'})</span></div>
          <PageChangesTable pageChanges={changes} />
        </div>
      ))}
    </div>
  );
}

function MovesByCompetitor({ moves }: { moves: SeoMarketMonitorMove[] }) {
  const byComp = new Map<string, { competitor: string; up: number; down: number; net: number; bestKeyword: string; bestChange: number }>();
  for (const m of moves) {
    const ex = byComp.get(m.competitorDomain) || { competitor: m.competitorDomain, up: 0, down: 0, net: 0, bestKeyword: '', bestChange: 0 };
    if (m.direction === 'up') ex.up++; else ex.down++;
    ex.net += m.positionChange;
    if (Math.abs(m.positionChange) > Math.abs(ex.bestChange)) {
      ex.bestChange = m.positionChange;
      ex.bestKeyword = m.keyword;
    }
    byComp.set(m.competitorDomain, ex);
  }
  const rows = Array.from(byComp.values()).sort((a, b) => (b.up + b.down) - (a.up + a.down));
  if (rows.length === 0) return <EmptyState title="No competitor moves yet" body="Only swings of 5+ positions qualify. More data accumulates daily." />;
  return (
    <table className="data-table" style={{ fontSize: 12, width: '100%' }}>
      <thead>
        <tr>
          <th>Competitor</th>
          <th style={{ textAlign: 'right' }}>Gains (↑)</th>
          <th style={{ textAlign: 'right' }}>Losses (↓)</th>
          <th style={{ textAlign: 'right' }}>Net</th>
          <th>Biggest Move</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            <td style={{ fontWeight: 500 }}>{r.competitor}</td>
            <td style={{ textAlign: 'right', color: '#1D9E75', fontWeight: 600 }}>{r.up}</td>
            <td style={{ textAlign: 'right', color: '#D85A30', fontWeight: 600 }}>{r.down}</td>
            <td style={{ textAlign: 'right', fontWeight: 600, color: r.net > 0 ? '#1D9E75' : r.net < 0 ? '#D85A30' : '#5A7A8A' }}>{r.net > 0 ? '+' : ''}{r.net}</td>
            <td style={{ fontSize: 11, color: '#5A7A8A' }}>
              {r.bestKeyword ? (<><strong style={{ color: '#0B1C24' }}>{r.bestKeyword}</strong> ({r.bestChange > 0 ? '+' : ''}{r.bestChange})</>) : '—'}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function MovesByKeyword({ moves }: { moves: SeoMarketMonitorMove[] }) {
  const byKw = new Map<string, { keyword: string; competitors: Set<string>; up: number; down: number }>();
  for (const m of moves) {
    const ex = byKw.get(m.keyword) || { keyword: m.keyword, competitors: new Set(), up: 0, down: 0 };
    ex.competitors.add(m.competitorDomain);
    if (m.direction === 'up') ex.up++; else ex.down++;
    byKw.set(m.keyword, ex);
  }
  const rows = Array.from(byKw.values()).sort((a, b) => b.competitors.size - a.competitors.size);
  if (rows.length === 0) return <EmptyState title="No keywords with movement yet" body="Once 7+ days of position history accumulate, contested keywords surface here." />;
  return (
    <table className="data-table" style={{ fontSize: 12, width: '100%' }}>
      <thead>
        <tr>
          <th>Keyword</th>
          <th style={{ textAlign: 'right' }}>Competitors Moved</th>
          <th style={{ textAlign: 'right' }}>Gains</th>
          <th style={{ textAlign: 'right' }}>Losses</th>
        </tr>
      </thead>
      <tbody>
        {rows.slice(0, 100).map((r, i) => (
          <tr key={i}>
            <td style={{ fontWeight: 500 }}>{r.keyword}</td>
            <td style={{ textAlign: 'right', fontWeight: 600 }}>{r.competitors.size}</td>
            <td style={{ textAlign: 'right', color: '#1D9E75' }}>{r.up}</td>
            <td style={{ textAlign: 'right', color: '#D85A30' }}>{r.down}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── Visuals ──────────────────────────────────────────────────────

function WidgetContainer({ title, subtitle, action, children }: { title: string; subtitle?: string; action?: React.ReactNode; children: React.ReactNode }) {
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

function AwaitingVisual({ message }: { message: string }) {
  return (
    <div style={{ padding: 20, background: '#F8FAFC', borderRadius: 6, textAlign: 'center', color: '#5A7A8A', fontSize: 11, lineHeight: 1.6 }}>
      {message}
    </div>
  );
}

function BacklinksTrendChart({ newBacklinks, lostBacklinks }: { newBacklinks: SeoMarketMonitorBacklink[]; lostBacklinks: SeoMarketMonitorBacklink[] }) {
  if (newBacklinks.length === 0 && lostBacklinks.length === 0) {
    return <AwaitingVisual message="Trend chart populates once the weekly backlink sync lands — typically Sunday mornings." />;
  }
  const byDate = new Map<string, { date: string; new: number; lost: number }>();
  for (const b of newBacklinks) {
    const d = b.firstSeen ? String(b.firstSeen).slice(0, 10) : b.snapshotDate ? String(b.snapshotDate).slice(0, 10) : null;
    if (!d) continue;
    const ex = byDate.get(d) || { date: d, new: 0, lost: 0 };
    ex.new++;
    byDate.set(d, ex);
  }
  for (const b of lostBacklinks) {
    const d = b.lastSeen ? String(b.lastSeen).slice(0, 10) : b.snapshotDate ? String(b.snapshotDate).slice(0, 10) : null;
    if (!d) continue;
    const ex = byDate.get(d) || { date: d, new: 0, lost: 0 };
    ex.lost++;
    byDate.set(d, ex);
  }
  const data = Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
  return (
    <div style={{ height: 220 }}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 5, right: 15, left: 0, bottom: 5 }}>
          <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#5A7A8A' }} />
          <YAxis tick={{ fontSize: 10, fill: '#5A7A8A' }} width={30} />
          <RTooltip contentStyle={{ fontSize: 11, borderRadius: 6 }} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey="new" name="New" fill="#1D9E75" radius={[3, 3, 0, 0]} />
          <Bar dataKey="lost" name="Lost" fill="#D85A30" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function MovesDistributionChart({ moves }: { moves: SeoMarketMonitorMove[] }) {
  if (moves.length === 0) {
    return <AwaitingVisual message="Once 7+ days of position history accumulate, swings of 5+ positions appear in this distribution." />;
  }
  const up = moves.filter((m) => m.direction === 'up').length;
  const down = moves.filter((m) => m.direction === 'down').length;
  const buckets = [
    { name: '5-10', up: 0, down: 0 },
    { name: '10-20', up: 0, down: 0 },
    { name: '20-50', up: 0, down: 0 },
    { name: '50+', up: 0, down: 0 },
  ];
  for (const m of moves) {
    const abs = Math.abs(m.positionChange);
    const bucket = abs < 10 ? 0 : abs < 20 ? 1 : abs < 50 ? 2 : 3;
    if (m.direction === 'up') buckets[bucket].up++; else buckets[bucket].down++;
  }
  return (
    <div>
      <div style={{ display: 'flex', gap: 20, marginBottom: 8, fontSize: 11, color: '#5A7A8A' }}>
        <span><strong style={{ color: '#1D9E75' }}>{up}</strong> gained ground</span>
        <span><strong style={{ color: '#D85A30' }}>{down}</strong> lost ground</span>
      </div>
      <div style={{ height: 190 }}>
        <ResponsiveContainer>
          <BarChart data={buckets} margin={{ top: 5, right: 15, left: 0, bottom: 5 }}>
            <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#5A7A8A' }} />
            <YAxis tick={{ fontSize: 10, fill: '#5A7A8A' }} width={30} />
            <RTooltip contentStyle={{ fontSize: 11, borderRadius: 6 }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="up" name="Gained" stackId="a" fill="#1D9E75" />
            <Bar dataKey="down" name="Lost" stackId="a" fill="#D85A30" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function ChangeMagnitudeChart({ pageChanges }: { pageChanges: SeoMarketMonitorPageChange[] }) {
  if (pageChanges.length === 0) {
    return <AwaitingVisual message="Change magnitude chart populates once watched pages get edited." />;
  }
  const buckets = [
    { range: '0-10%', count: 0 },
    { range: '10-25%', count: 0 },
    { range: '25-50%', count: 0 },
    { range: '50-75%', count: 0 },
    { range: '75-100%', count: 0 },
  ];
  for (const pc of pageChanges) {
    const pct = pc.changeMagnitude * 100;
    const b = pct < 10 ? 0 : pct < 25 ? 1 : pct < 50 ? 2 : pct < 75 ? 3 : 4;
    buckets[b].count++;
  }
  return (
    <div style={{ height: 220 }}>
      <ResponsiveContainer>
        <BarChart data={buckets} margin={{ top: 5, right: 15, left: 0, bottom: 5 }}>
          <XAxis dataKey="range" tick={{ fontSize: 10, fill: '#5A7A8A' }} />
          <YAxis tick={{ fontSize: 10, fill: '#5A7A8A' }} width={30} />
          <RTooltip contentStyle={{ fontSize: 11, borderRadius: 6 }} />
          <Bar dataKey="count" fill="#4285F4" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function ChangesByTypeChart({ pageChanges }: { pageChanges: SeoMarketMonitorPageChange[] }) {
  if (pageChanges.length === 0) {
    return <AwaitingVisual message="Once page changes are detected, a breakdown by type lands here." />;
  }
  const own = pageChanges.filter((p) => p.pageType === 'own_site').length;
  const compRaw = pageChanges.filter((p) => p.pageType !== 'own_site');
  const byComp = new Map<string, number>();
  for (const pc of compRaw) {
    const key = pc.competitorDomain || 'Other';
    byComp.set(key, (byComp.get(key) || 0) + 1);
  }
  const pieData = [
    { name: 'Your site', value: own, color: '#1D9E75' },
    ...Array.from(byComp.entries()).map(([name, value], i) => ({ name, value, color: ['#EF6C33', '#2D9CDB', '#7B61FF', '#D85A30', '#FEC82C', '#94A3B8'][i % 6] })),
  ].filter((d) => d.value > 0);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, alignItems: 'center' }}>
      <div style={{ height: 180 }}>
        <ResponsiveContainer>
          <PieChart>
            <Pie data={pieData} dataKey="value" innerRadius={40} outerRadius={68} stroke="none">
              {pieData.map((d, i) => <Cell key={i} fill={d.color} />)}
            </Pie>
            <RTooltip contentStyle={{ fontSize: 11, borderRadius: 6 }} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div>
        {pieData.map((d) => (
          <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, marginBottom: 4 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: d.color }} />
            <span style={{ flex: 1, color: '#0B1C24', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</span>
            <span style={{ fontWeight: 600, color: '#0B1C24' }}>{d.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TopCompetitorsByMovesChart({ moves }: { moves: SeoMarketMonitorMove[] }) {
  const byComp = new Map<string, { name: string; up: number; down: number }>();
  for (const m of moves) {
    const ex = byComp.get(m.competitorDomain) || { name: m.competitorDomain, up: 0, down: 0 };
    if (m.direction === 'up') ex.up++; else ex.down++;
    byComp.set(m.competitorDomain, ex);
  }
  const data = Array.from(byComp.values()).sort((a, b) => (b.up + b.down) - (a.up + a.down)).slice(0, 10);
  return (
    <div style={{ height: Math.max(200, 32 * data.length) }}>
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ top: 5, right: 15, left: 10, bottom: 5 }}>
          <XAxis type="number" tick={{ fontSize: 10, fill: '#5A7A8A' }} />
          <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: '#0B1C24' }} width={160} />
          <RTooltip contentStyle={{ fontSize: 11, borderRadius: 6 }} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey="up" name="Gained" stackId="a" fill="#1D9E75" />
          <Bar dataKey="down" name="Lost" stackId="a" fill="#D85A30" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function MovesTable({ moves }: { moves: SeoMarketMonitorMove[] }) {
  if (moves.length === 0) {
    return (
      <EmptyState
        title="No large competitor moves in this window"
        body="We only flag ranking swings of 5 positions or more. Once the position-history job has run for 7+ days, any keyword where a tracked competitor gained or lost 5 places will show up here."
      />
    );
  }
  return (
    <table className="data-table" style={{ fontSize: 12, width: '100%' }}>
      <thead>
        <tr>
          <th>Keyword</th>
          <th>Competitor</th>
          <th style={{ textAlign: 'right' }}>First Position</th>
          <th style={{ textAlign: 'right' }}>Last Position</th>
          <th style={{ textAlign: 'right' }}>Change</th>
          <th style={{ textAlign: 'right' }}>Direction</th>
        </tr>
      </thead>
      <tbody>
        {moves.map((m, i) => {
          const isUp = m.direction === 'up';
          return (
            <tr key={i}>
              <td style={{ fontWeight: 500 }}>{m.keyword}</td>
              <td>{m.competitorDomain}</td>
              <td style={{ textAlign: 'right' }}>{m.firstPosition ?? '—'}</td>
              <td style={{ textAlign: 'right' }}>{m.lastPosition ?? '—'}</td>
              <td style={{ textAlign: 'right', fontWeight: 600, color: isUp ? '#1D9E75' : '#D85A30' }}>
                {isUp ? '+' : ''}{m.positionChange}
              </td>
              <td style={{ textAlign: 'right' }}>
                <span style={{ background: isUp ? '#F0FDF4' : '#FEF2F2', color: isUp ? '#1D9E75' : '#D85A30', fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 3 }}>
                  {isUp ? 'gained ground' : 'lost ground'}
                </span>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function BacklinksTable({ newBacklinks, lostBacklinks }: { newBacklinks: SeoMarketMonitorBacklink[]; lostBacklinks: SeoMarketMonitorBacklink[] }) {
  if (newBacklinks.length === 0 && lostBacklinks.length === 0) {
    return (
      <EmptyState
        title="Waiting for the first backlink sync"
        body="Backlink Watch runs weekly on Sunday mornings. Once SE Ranking's Data API returns your first referring-domain snapshot, it will appear here."
      />
    );
  }
  return (
    <>
      <h3 style={{ fontSize: 14, fontWeight: 600, color: '#0B1C24', marginBottom: 8 }}>New backlinks ({newBacklinks.length})</h3>
      {newBacklinks.length > 0 ? (
        <table className="data-table" style={{ fontSize: 12, width: '100%', marginBottom: 20 }}>
          <thead>
            <tr>
              <th>Referring Domain</th>
              <th>Target URL</th>
              <th>Anchor</th>
              <th style={{ textAlign: 'right' }}>DA</th>
              <th style={{ textAlign: 'right' }}>First Seen</th>
            </tr>
          </thead>
          <tbody>
            {newBacklinks.map((b, i) => (
              <tr key={i}>
                <td style={{ fontWeight: 500 }}>{b.referringDomain}</td>
                <td style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.targetUrl || '—'}</td>
                <td style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.anchorText || '—'}</td>
                <td style={{ textAlign: 'right' }}>{b.domainAuthority ?? '—'}</td>
                <td style={{ textAlign: 'right' }}>{b.firstSeen ? new Date(b.firstSeen).toLocaleDateString() : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div style={{ fontSize: 12, color: '#5A7A8A', padding: '8px 0 20px' }}>No new backlinks detected in this window.</div>
      )}

      <h3 style={{ fontSize: 14, fontWeight: 600, color: '#0B1C24', marginBottom: 8 }}>Lost backlinks ({lostBacklinks.length})</h3>
      {lostBacklinks.length > 0 ? (
        <table className="data-table" style={{ fontSize: 12, width: '100%' }}>
          <thead>
            <tr>
              <th>Referring Domain</th>
              <th style={{ textAlign: 'right' }}>Last Seen</th>
            </tr>
          </thead>
          <tbody>
            {lostBacklinks.map((b, i) => (
              <tr key={i}>
                <td style={{ fontWeight: 500 }}>{b.referringDomain}</td>
                <td style={{ textAlign: 'right' }}>{b.lastSeen ? new Date(b.lastSeen).toLocaleDateString() : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div style={{ fontSize: 12, color: '#5A7A8A', padding: '8px 0' }}>No lost backlinks in this window — healthy sign.</div>
      )}
    </>
  );
}

function PageChangesTable({ pageChanges }: { pageChanges: SeoMarketMonitorPageChange[] }) {
  if (pageChanges.length === 0) {
    return (
      <EmptyState
        title="No page changes detected"
        body="The page-watcher runs daily at 05:41 UTC. Once we've captured two hashes of a watched page and they differ, the change is recorded here with a title/content-excerpt diff."
      />
    );
  }
  return (
    <table className="data-table" style={{ fontSize: 12, width: '100%' }}>
      <thead>
        <tr>
          <th>Page</th>
          <th>Type</th>
          <th style={{ textAlign: 'right' }}>Magnitude</th>
          <th>Title change</th>
          <th style={{ textAlign: 'right' }}>Detected</th>
        </tr>
      </thead>
      <tbody>
        {pageChanges.map((p, i) => {
          const titleChanged = p.titlePrev !== p.titleNew;
          return (
            <tr key={i}>
              <td style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                <a href={p.pageUrl} target="_blank" rel="noreferrer" style={{ color: '#2D9CDB' }}>{p.pageUrl}</a>
              </td>
              <td>
                {p.pageType === 'own_site' ? (
                  <span style={{ background: '#F0FDF4', color: '#1D9E75', fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 3 }}>Own site</span>
                ) : (
                  <span style={{ background: '#FEF2F2', color: '#D85A30', fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 3 }}>{p.competitorDomain || 'Competitor'}</span>
                )}
              </td>
              <td style={{ textAlign: 'right', fontWeight: 600 }}>{Math.round(p.changeMagnitude * 100)}%</td>
              <td style={{ fontSize: 11, color: '#5A7A8A' }}>
                {titleChanged ? (
                  <>
                    <div style={{ textDecoration: 'line-through' }}>{p.titlePrev || '—'}</div>
                    <div style={{ color: '#0B1C24', fontWeight: 500 }}>{p.titleNew || '—'}</div>
                  </>
                ) : (
                  <em>no title change</em>
                )}
              </td>
              <td style={{ textAlign: 'right' }}>{new Date(p.detectedAt).toLocaleDateString()}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div style={{ padding: 32, background: '#F8FAFC', borderRadius: 8, textAlign: 'center' }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: '#0B1C24', marginBottom: 8 }}>{title}</div>
      <p style={{ fontSize: 12, color: '#5A7A8A', maxWidth: 520, margin: '0 auto', lineHeight: 1.6 }}>{body}</p>
    </div>
  );
}
