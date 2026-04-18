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
        <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
          {section === 'competitor_moves' && <MovesTable moves={moves} />}
          {section === 'backlinks' && <BacklinksTable newBacklinks={newBacklinks} lostBacklinks={lostBacklinks} />}
          {section === 'page_changes' && <PageChangesTable pageChanges={pageChanges} />}
        </div>
      </div>
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
