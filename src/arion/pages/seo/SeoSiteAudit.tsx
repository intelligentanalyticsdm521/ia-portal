/**
 * Phase 3.5 Site Audit (rebuild 2026-04-20).
 *
 * Layout:
 *   1. Metadata bar: Last audit / Next scheduled / Pages crawled
 *   2. 6 Hero cards (each click opens its matching tab in the Full Report modal):
 *        Health Score (half-donut gauge) · Total Issues · Crawled Pages ·
 *        Page Health · Found Resources · Found Links
 *   3. "See Full Report →" catch-all button in the header
 *   4. Historical (Health) Comparison widget (tier-gated: Weekly/Monthly/Quarterly)
 *   5. Top Issues table
 *   6. V2 Coming-Soon placeholder grid (Indexability / HTTP Status / CWV etc)
 *   7. Full Report modal with 5 tabs:
 *        Issue Report · Crawled Pages · Found Resources · Found Links · Audit Comparison
 */
import React from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip as RTooltip } from 'recharts';
import { useArionContext } from '../../useArionContext';
import { useArionData } from '../../useArionData';
import { AddonUpsell, EmptyPanel, Loading, ConsultingUpsell, ErrorBanner, InfoCard } from '../../components/Ui';
import { GlossaryIcon } from '../../components/Glossary';
import type { SeoAuditResponse, SeoAuditHistorySnapshot, SeoAuditTopIssue, SeoAuditPageDetail } from '../../../lib/arionApi';

type DetailTab = 'issue-report' | 'crawled-pages' | 'found-resources' | 'found-links' | 'audit-comparison';
type HistoryTab = 'weekly' | 'monthly' | 'quarterly';

export function SeoSiteAudit() {
  const { selectedSite, activeSiteId, arionApi } = useArionContext();
  const [activeTab, setActiveTab] = React.useState<DetailTab | null>(null);
  const [initialCategory, setInitialCategory] = React.useState<string | null>(null);
  const [pageDetailId, setPageDetailId] = React.useState<string | null>(null);
  const [historyTab, setHistoryTab] = React.useState<HistoryTab>('weekly');

  const openIssueReport = React.useCallback((category?: string | null) => {
    setInitialCategory(category ?? null);
    setActiveTab('issue-report');
  }, []);
  const openPageDetail = React.useCallback((id: string | number) => {
    setPageDetailId(String(id));
  }, []);

  const { data, loading } = useArionData(
    () => activeSiteId ? arionApi.getSeoAudit(activeSiteId) : Promise.resolve(null),
    [activeSiteId]
  );

  if (loading) return <Loading />;
  if (!selectedSite) return <EmptyPanel message="No ARION site selected." />;

  const a = data as SeoAuditResponse | null;
  const connected = a?.connected === true;
  const hasSeoAddon = selectedSite?.seoAddonTier != null;
  const tier = (selectedSite?.seoAddonTier || 'starter').toLowerCase();

  if (!connected && !hasSeoAddon) {
    return (
      <AddonUpsell
        title="SEO Tools — Add-on not active"
        description="Weekly site health monitoring, issue tracking, and historical trends. Powered by SE Ranking."
        price="$29"
        planName="Starter"
      />
    );
  }

  if (a?.status === 'running') {
    return <ErrorBanner message="Audit in progress — check back in a minute." />;
  }

  if (a?.status !== 'complete') {
    return <ErrorBanner message="Audit data unavailable. SE Ranking may be catching up on this project." />;
  }

  const healthScore = a.healthScore ?? 0;
  const issues = a.issues ?? { errors: 0, warnings: 0, notices: 0, passed: 0, total: 0 };
  const deltas = a.deltas;
  const pagesCrawled = a.pagesCrawled ?? 0;
  const pagesHealthy = a.pagesHealthy ?? 0;
  const pagesWithIssues = a.pagesWithIssues ?? 0;
  const history = a.history ?? {};
  const current = history.current;
  const topIssues = a.topIssues ?? [];

  // Historical Comparison tier gating
  const historyTabsByTier: Record<string, HistoryTab[]> = {
    starter: ['quarterly'],
    essentials: ['monthly', 'quarterly'],
    growth: ['monthly', 'quarterly'],
    authority: ['weekly', 'monthly', 'quarterly'],
  };
  const availableHistoryTabs = historyTabsByTier[tier] || ['quarterly'];
  const effectiveHistoryTab = availableHistoryTabs.includes(historyTab) ? historyTab : availableHistoryTabs[0];

  return (
    <div>
      <InfoCard title={`Website Audit — ${selectedSite.primaryDomain || selectedSite.wpUrl}`}>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center', fontSize: 12 }}>
          <MetaItem label="Last audit" value={a.lastAuditDate ? new Date(a.lastAuditDate).toLocaleDateString() : '—'} />
          <MetaItem label="Next scheduled" value={a.nextScheduledDate ? new Date(a.nextScheduledDate).toLocaleDateString() : nextScheduledFromTier(tier, a.lastAuditDate)} />
          <MetaItem label="Pages crawled" value={String(pagesCrawled)} />
          <div style={{ marginLeft: 'auto' }}>
            <button
              onClick={() => setActiveTab('issue-report')}
              style={{ padding: '7px 16px', fontSize: 12, fontWeight: 600, background: '#0B1C24', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}
            >
              See Full Report →
            </button>
          </div>
        </div>
      </InfoCard>

      {/* Hero cards — 6 cards, each opens its matching Full Report tab */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginTop: 14 }}>
        <HealthScoreGaugeCard score={healthScore} source={a.healthScoreSource} delta={deltas?.healthScore ?? null} onClick={() => setActiveTab('issue-report')} />
        <IssuesCard issues={issues} delta={deltas} onClick={() => setActiveTab('issue-report')} />
        <CrawledPagesCard count={pagesCrawled} delta={deltas?.crawled ?? null} onClick={() => setActiveTab('crawled-pages')} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginTop: 12 }}>
        <PageHealthCard healthy={pagesHealthy} withIssues={pagesWithIssues} total={pagesCrawled} onClick={() => setActiveTab('crawled-pages')} />
        <FoundResourcesCard resources={a.foundResources} onClick={() => setActiveTab('found-resources')} />
        <FoundLinksCard links={a.foundLinks} onClick={() => setActiveTab('found-links')} />
      </div>

      {/* Health Comparison widget (tier-gated) */}
      <div style={{ marginTop: 22 }}>
        <WidgetContainer
          title="Health Comparison"
          subtitle="How your site is trending over time"
          action={null}
        >
          <HistoryTabs value={effectiveHistoryTab} onChange={setHistoryTab} tier={tier} available={availableHistoryTabs} />
          <HistoryComparisonBody history={history} current={current} activeTab={effectiveHistoryTab} healthScore={healthScore} />
        </WidgetContainer>
      </div>

      {/* Top Issues */}
      <div style={{ marginTop: 22 }}>
        <WidgetContainer title="Top Issues" subtitle="Your 5 most-frequent issues by occurrence" action={
          <button onClick={() => openIssueReport(null)} style={{ fontSize: 11, fontWeight: 600, background: 'transparent', color: '#2D9CDB', border: 'none', cursor: 'pointer' }}>View all {issues.total ?? 0} →</button>
        }>
          <TopIssuesTable issues={topIssues} onIssueClick={() => openIssueReport(null)} />
        </WidgetContainer>
      </div>

      {/* Top Pages by Issues */}
      <div style={{ marginTop: 22 }}>
        <WidgetContainer title="Top Pages by Issues" subtitle="Pages with the most errors, warnings, and notices" action={null}>
          <TopPagesByIssuesTable rows={a.topPagesByIssues ?? []} onView={openPageDetail} />
        </WidgetContainer>
      </div>

      {/* Issue Breakdown + Issues by Category row */}
      <div style={{ marginTop: 22, display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: 12 }}>
        <WidgetContainer title="Issue Breakdown" subtitle="By severity across the full audit" action={
          <button onClick={() => openIssueReport(null)} style={{ fontSize: 11, fontWeight: 600, background: 'transparent', color: '#2D9CDB', border: 'none', cursor: 'pointer' }}>See all →</button>
        }>
          <IssueBreakdownWidget issues={issues} />
        </WidgetContainer>
        <WidgetContainer title="Issues by Category" subtitle="Error / warning / notice counts by category" action={null}>
          <IssueCategoriesWidget categories={a.issueCategories ?? []} onCategoryClick={(c) => openIssueReport(c)} />
        </WidgetContainer>
      </div>

      {/* Use Cases row */}
      <div style={{ marginTop: 22 }}>
        <WidgetContainer title="Most Popular Use Cases" subtitle="Quick-filtered reports for common SEO fixes" action={null}>
          <UseCasesTable useCases={a.useCases ?? []} onClick={() => openIssueReport(null)} />
        </WidgetContainer>
      </div>

      {/* Indexability + HTTP Status — side-by-side row (always render with empty-state) */}
      <div style={{ marginTop: 22, display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
        <WidgetContainer title="Page Indexability" subtitle="How Google sees your pages" action={null}>
          {a.indexability ? (
            <IndexabilityWidget data={a.indexability} totalPages={pagesCrawled} />
          ) : (
            <AwaitingData message="Indexability breakdown populates once SE Ranking's next full audit completes. Typically within 24 hours of your audit schedule." />
          )}
        </WidgetContainer>
        <WidgetContainer title="HTTP Status Codes" subtitle="Distribution across crawled pages" action={null}>
          {a.httpStatus ? (
            <HttpStatusWidget data={a.httpStatus} />
          ) : (
            <AwaitingData message="Status-code distribution appears after the next page-level crawl. All 200 responses are normal — this chart highlights redirects and broken pages." />
          )}
        </WidgetContainer>
      </div>

      {/* Core Web Vitals — always render, show pending state when absent */}
      <div style={{ marginTop: 22 }}>
        <WidgetContainer title="Core Web Vitals" subtitle="Google's page experience signals (real-world + lab)" action={null}>
          {a.coreWebVitals ? (
            <CoreWebVitalsWidget data={a.coreWebVitals} />
          ) : (
            <AwaitingData message="Core Web Vitals require the v2 audit engine with Chrome UX Report + Lighthouse telemetry. Your next audit cycle will populate these." />
          )}
        </WidgetContainer>
      </div>

      {/* Domain Metrics */}
      <div style={{ marginTop: 22 }}>
        <WidgetContainer title="Domain Metrics" subtitle="Domain-level authority and backlink signals" action={null}>
          {a.domain ? (
            <DomainMetricsWidget data={a.domain} />
          ) : (
            <AwaitingData message="Domain Trust, backlinks, and referring domains populate on the next audit. These are sourced from SE Ranking's Backlink Checker database." />
          )}
        </WidgetContainer>
      </div>

      {/* Page Distribution */}
      <div style={{ marginTop: 22 }}>
        <WidgetContainer title="Page Distribution" subtitle="Depth, response time, and redirects across your crawled pages" action={null}>
          {a.pageDistribution ? (
            <PageDistributionWidget data={a.pageDistribution} />
          ) : (
            <AwaitingData message="Per-page metrics populate after the next /pages fetch completes. Shallow page depth and sub-1s response times are SEO ideals." />
          )}
        </WidgetContainer>
      </div>

      <ConsultingUpsell
        headline="Your site audit is a roadmap. IA executes the fixes and reports back."
        subtext="We prioritize the highest-impact fixes, coordinate with your dev team, and verify resolution in the next audit cycle."
        serviceType="SEO Strategy"
        triggerPage="seo-site-audit"
      />

      {activeTab && (
        <SeoSiteAuditDetailsModal
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          onClose={() => { setActiveTab(null); setInitialCategory(null); }}
          audit={a}
          initialCategory={initialCategory}
          onPageDetail={openPageDetail}
        />
      )}
      {pageDetailId && activeSiteId && (
        <SeoPageDetailModal
          siteId={activeSiteId}
          pageId={pageDetailId}
          arionApi={arionApi}
          onClose={() => setPageDetailId(null)}
        />
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// Sub-components
// ────────────────────────────────────────────────────────────────

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 9, color: '#5A7A8A', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#0B1C24', marginTop: 2 }}>{value}</div>
    </div>
  );
}

function nextScheduledFromTier(tier: string, lastAuditDate: string | null | undefined): string {
  if (!lastAuditDate) return '—';
  const d = new Date(lastAuditDate);
  if (Number.isNaN(d.getTime())) return '—';
  const cadenceDays = tier === 'authority' ? 7 : tier === 'growth' || tier === 'essentials' ? 30 : 90;
  d.setDate(d.getDate() + cadenceDays);
  return d.toLocaleDateString();
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

function CardSeeDetailsButton({ color, onClick }: { color: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{ marginTop: 10, padding: '6px 12px', fontSize: 11, fontWeight: 600, background: 'transparent', color, border: `1px solid ${color}`, borderRadius: 4, cursor: 'pointer', alignSelf: 'flex-start' }}
    >
      See Details →
    </button>
  );
}

function HealthScoreGaugeCard({ score, source, delta, onClick }: { score: number; source?: string; delta: number | null; onClick: () => void }) {
  const color = score >= 80 ? '#1D9E75' : score >= 50 ? '#EF6C33' : '#D85A30';
  const label = score >= 80 ? 'Strong' : score >= 50 ? 'Needs Attention' : 'At Risk';
  const pieData = [{ name: 'Score', value: score }, { name: 'Rest', value: 100 - score }];
  return (
    <div style={{ background: '#F8FAFC', borderLeft: `3px solid ${color}`, borderRadius: 8, padding: '14px 16px', minHeight: 160, display: 'flex', flexDirection: 'column' }}>
      <div style={{ fontSize: 10, color: '#5A7A8A', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600, display: 'inline-flex', alignItems: 'center' }}>
        Health Score <GlossaryIcon termKey="health_score" size={11} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 6 }}>
        <div style={{ width: 130, height: 78 }}>
          <ResponsiveContainer>
            <PieChart>
              <Pie data={pieData} dataKey="value" cx="50%" cy="100%" startAngle={180} endAngle={0} innerRadius={40} outerRadius={62} stroke="none">
                <Cell fill={color} />
                <Cell fill="#E2E8F0" />
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div>
          <div style={{ fontSize: 32, fontWeight: 700, color: '#0B1C24', lineHeight: 1 }}>{score}</div>
          <div style={{ fontSize: 11, color, fontWeight: 600 }}>{label}</div>
          {delta != null && delta !== 0 && (
            <div style={{ fontSize: 11, color: delta > 0 ? '#1D9E75' : '#D85A30', fontWeight: 600, marginTop: 2 }}>
              {delta > 0 ? '▲' : '▼'} {Math.abs(delta)} vs prior
            </div>
          )}
        </div>
      </div>
      <div style={{ fontSize: 9, color: '#94A3B8', marginTop: 6, fontStyle: 'italic' }}>
        {source === 'se_ranking_official' ? 'SE Ranking score' : 'Computed (awaiting next audit for official score)'}
      </div>
      <CardSeeDetailsButton color={color} onClick={onClick} />
    </div>
  );
}

function IssuesCard({ issues, delta, onClick }: { issues: { errors: number; warnings: number; notices: number; total?: number }; delta: any; onClick: () => void }) {
  const total = issues.total ?? (issues.errors + issues.warnings + issues.notices);
  return (
    <div style={{ background: '#F8FAFC', borderLeft: '3px solid #D85A30', borderRadius: 8, padding: '14px 16px', minHeight: 160, display: 'flex', flexDirection: 'column' }}>
      <div style={{ fontSize: 10, color: '#5A7A8A', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>Total Issues</div>
      <div style={{ fontSize: 32, fontWeight: 700, color: '#0B1C24', marginTop: 4 }}>{total}</div>
      <div style={{ display: 'flex', height: 8, marginTop: 10, borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ width: `${(issues.errors / Math.max(total, 1)) * 100}%`, background: '#D85A30' }} />
        <div style={{ width: `${(issues.warnings / Math.max(total, 1)) * 100}%`, background: '#EF6C33' }} />
        <div style={{ width: `${(issues.notices / Math.max(total, 1)) * 100}%`, background: '#4285F4' }} />
      </div>
      <div style={{ display: 'flex', gap: 14, marginTop: 8, fontSize: 10 }}>
        <IssueBadge color="#D85A30" count={issues.errors} delta={delta?.errors} label="Errors" />
        <IssueBadge color="#EF6C33" count={issues.warnings} delta={delta?.warnings} label="Warnings" />
        <IssueBadge color="#4285F4" count={issues.notices} delta={delta?.notices} label="Notices" />
      </div>
      <CardSeeDetailsButton color="#D85A30" onClick={onClick} />
    </div>
  );
}

function IssueBadge({ color, count, delta, label }: { color: string; count: number; delta?: number | null; label: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', fontSize: 10 }}>
      <span style={{ color: '#5A7A8A' }}>{label}</span>
      <span style={{ fontWeight: 600, color }}>
        {count}
        {delta != null && delta !== 0 && (
          <span style={{ marginLeft: 3, fontSize: 9, color: delta > 0 ? '#D85A30' : '#1D9E75' }}>
            {delta > 0 ? '+' : ''}{delta}
          </span>
        )}
      </span>
    </div>
  );
}

function CrawledPagesCard({ count, delta, onClick }: { count: number; delta: number | null; onClick: () => void }) {
  return (
    <div style={{ background: '#F8FAFC', borderLeft: '3px solid #4285F4', borderRadius: 8, padding: '14px 16px', minHeight: 160, display: 'flex', flexDirection: 'column' }}>
      <div style={{ fontSize: 10, color: '#5A7A8A', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>Crawled Pages</div>
      <div style={{ fontSize: 32, fontWeight: 700, color: '#0B1C24', marginTop: 4 }}>{count}</div>
      {delta != null && delta !== 0 && (
        <div style={{ fontSize: 11, color: delta > 0 ? '#1D9E75' : '#5A7A8A', fontWeight: 600, marginTop: 4 }}>
          {delta > 0 ? '▲' : '▼'} {Math.abs(delta)} vs prior
        </div>
      )}
      <div style={{ fontSize: 10, color: '#94A3B8', marginTop: 10 }}>URLs crawled in this audit</div>
      <CardSeeDetailsButton color="#4285F4" onClick={onClick} />
    </div>
  );
}

function PageHealthCard({ healthy, withIssues, total, onClick }: { healthy: number; withIssues: number; total: number; onClick: () => void }) {
  const healthyPct = total > 0 ? Math.round((healthy / total) * 100) : 0;
  const color = healthyPct >= 80 ? '#1D9E75' : healthyPct >= 50 ? '#EF6C33' : '#D85A30';
  return (
    <div style={{ background: '#F8FAFC', borderLeft: `3px solid ${color}`, borderRadius: 8, padding: '14px 16px', minHeight: 160, display: 'flex', flexDirection: 'column' }}>
      <div style={{ fontSize: 10, color: '#5A7A8A', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>Page Health</div>
      <div style={{ fontSize: 32, fontWeight: 700, color: '#0B1C24', marginTop: 4 }}>{healthy}</div>
      <div style={{ fontSize: 10, color: '#5A7A8A', marginTop: 2 }}>healthy of {total} pages · {healthyPct}%</div>
      <div style={{ fontSize: 10, marginTop: 10, color: '#D85A30' }}>
        <strong>{withIssues}</strong> page(s) have issues
      </div>
      <CardSeeDetailsButton color={color} onClick={onClick} />
    </div>
  );
}

function FoundResourcesCard({ resources, onClick }: { resources: SeoAuditResponse['foundResources']; onClick: () => void }) {
  const imgCount = resources?.images ?? 0;
  const cssKB = Math.round((resources?.cssSizeBytes || 0) / 1024);
  const jsKB = Math.round((resources?.jsSizeBytes || 0) / 1024);
  return (
    <div style={{ background: '#F8FAFC', borderLeft: '3px solid #7B61FF', borderRadius: 8, padding: '14px 16px', minHeight: 160, display: 'flex', flexDirection: 'column' }}>
      <div style={{ fontSize: 10, color: '#5A7A8A', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>Found Resources</div>
      <div style={{ fontSize: 32, fontWeight: 700, color: '#7B61FF', marginTop: 4 }}>{imgCount}</div>
      <div style={{ fontSize: 10, color: '#5A7A8A', marginTop: 2 }}>images</div>
      <div style={{ fontSize: 10, color: '#5A7A8A', marginTop: 8 }}>
        CSS: {cssKB.toLocaleString()}KB · JS: {jsKB.toLocaleString()}KB
      </div>
      <CardSeeDetailsButton color="#7B61FF" onClick={onClick} />
    </div>
  );
}

function FoundLinksCard({ links, onClick }: { links: SeoAuditResponse['foundLinks']; onClick: () => void }) {
  const total = links?.total ?? 0;
  const internal = links?.internal ?? 0;
  const external = links?.external ?? 0;
  return (
    <div style={{ background: '#F8FAFC', borderLeft: '3px solid #2D9CDB', borderRadius: 8, padding: '14px 16px', minHeight: 160, display: 'flex', flexDirection: 'column' }}>
      <div style={{ fontSize: 10, color: '#5A7A8A', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>Found Links</div>
      <div style={{ fontSize: 32, fontWeight: 700, color: '#2D9CDB', marginTop: 4 }}>{total.toLocaleString()}</div>
      <div style={{ fontSize: 10, color: '#5A7A8A', marginTop: 2 }}>total</div>
      <div style={{ fontSize: 10, color: '#5A7A8A', marginTop: 8 }}>
        Internal: {internal.toLocaleString()} · External: {external.toLocaleString()}
      </div>
      <CardSeeDetailsButton color="#2D9CDB" onClick={onClick} />
    </div>
  );
}

function HistoryTabs({ value, onChange, tier, available }: { value: HistoryTab; onChange: (v: HistoryTab) => void; tier: string; available: HistoryTab[] }) {
  const allTabs: Array<{ id: HistoryTab; label: string; requires: string }> = [
    { id: 'weekly', label: 'Weekly', requires: 'Authority' },
    { id: 'monthly', label: 'Monthly', requires: 'Essentials' },
    { id: 'quarterly', label: 'Quarterly', requires: 'Starter' },
  ];
  return (
    <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
      {allTabs.map((t) => {
        const locked = !available.includes(t.id);
        const active = value === t.id;
        return (
          <button
            key={t.id}
            onClick={() => !locked && onChange(t.id)}
            disabled={locked}
            title={locked ? `Upgrade to ${t.requires} to unlock ${t.label.toLowerCase()} comparison` : undefined}
            style={{
              padding: '6px 12px', fontSize: 11, fontWeight: 600,
              background: active ? '#0B1C24' : locked ? '#F1F5F9' : '#F8FAFC',
              color: active ? '#fff' : locked ? '#94A3B8' : '#0B1C24',
              border: active ? '1px solid #0B1C24' : '1px solid #e2e8f0',
              borderRadius: 4,
              cursor: locked ? 'not-allowed' : 'pointer',
              opacity: locked ? 0.6 : 1,
            }}
          >
            {locked && '🔒 '}{t.label}
          </button>
        );
      })}
    </div>
  );
}

function HistoryComparisonBody({ history, current, activeTab, healthScore }: { history: any; current?: SeoAuditHistorySnapshot; activeTab: HistoryTab; healthScore?: number }) {
  const prior = history[activeTab] as SeoAuditHistorySnapshot | undefined;

  if (!current && !prior) {
    return (
      <div style={{ padding: 20, background: '#F8FAFC', borderRadius: 6, textAlign: 'center', fontSize: 12, color: '#5A7A8A' }}>
        Historical data builds up as audits accumulate. Check back after your next audit cycle.
      </div>
    );
  }

  const rows: Array<{ label: string; curr: number | null; prev: number | null; goodWhenUp: boolean }> = [
    { label: 'Pages Crawled', curr: current?.pagesCrawled ?? null, prev: prior?.pagesCrawled ?? null, goodWhenUp: true },
    { label: 'Errors', curr: current?.errors ?? null, prev: prior?.errors ?? null, goodWhenUp: false },
    { label: 'Warnings', curr: current?.warnings ?? null, prev: prior?.warnings ?? null, goodWhenUp: false },
    { label: 'Notices', curr: current?.notices ?? null, prev: prior?.notices ?? null, goodWhenUp: false },
    { label: 'Passed Checks', curr: current?.passed ?? null, prev: prior?.passed ?? null, goodWhenUp: true },
  ];

  return (
    <div>
      {prior ? (
        <div style={{ fontSize: 11, color: '#5A7A8A', marginBottom: 10 }}>
          Comparing <strong>{current?.date || 'current'}</strong> vs <strong>{prior.date}</strong>
        </div>
      ) : (
        <div style={{ fontSize: 11, color: '#94A3B8', marginBottom: 10, fontStyle: 'italic' }}>
          No {activeTab} snapshot available yet — comparison data appears after your tier's audit cycle runs.
        </div>
      )}
      <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
            <th style={{ textAlign: 'left', padding: '6px 4px', fontSize: 9, color: '#94A3B8', fontWeight: 600, textTransform: 'uppercase' }}>Metric</th>
            <th style={{ textAlign: 'right', padding: '6px 4px', fontSize: 9, color: '#94A3B8', fontWeight: 600 }}>Current</th>
            <th style={{ textAlign: 'right', padding: '6px 4px', fontSize: 9, color: '#94A3B8', fontWeight: 600 }}>Prior</th>
            <th style={{ textAlign: 'right', padding: '6px 4px', fontSize: 9, color: '#94A3B8', fontWeight: 600 }}>Δ</th>
          </tr>
        </thead>
        <tbody>
          {rows.filter((r) => r.curr != null || r.prev != null).map((r) => {
            const delta = (r.curr ?? 0) - (r.prev ?? 0);
            const color = delta === 0 ? '#5A7A8A' : (delta > 0) === r.goodWhenUp ? '#1D9E75' : '#D85A30';
            return (
              <tr key={r.label} style={{ borderBottom: '1px solid #f5f5f5' }}>
                <td style={{ padding: '5px 4px', color: '#0B1C24' }}>{r.label}</td>
                <td style={{ textAlign: 'right', padding: '5px 4px', fontWeight: 500 }}>{r.curr ?? '—'}</td>
                <td style={{ textAlign: 'right', padding: '5px 4px', color: '#5A7A8A' }}>{r.prev ?? '—'}</td>
                <td style={{ textAlign: 'right', padding: '5px 4px', fontWeight: 600, color }}>
                  {r.curr != null && r.prev != null ? (delta > 0 ? `+${delta}` : delta) : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function AwaitingData({ message }: { message: string }) {
  return (
    <div style={{ padding: 20, background: '#F8FAFC', borderRadius: 6, textAlign: 'center', color: '#5A7A8A', fontSize: 12 }}>
      <div style={{ fontWeight: 600, color: '#0B1C24', marginBottom: 6 }}>Data pending</div>
      <p style={{ margin: 0, fontSize: 11, lineHeight: 1.6, maxWidth: 520, marginInline: 'auto' }}>{message}</p>
    </div>
  );
}

function IssueBreakdownWidget({ issues }: { issues: { errors: number; warnings: number; notices: number; passed: number; total?: number } }) {
  const data = [
    { name: 'Errors', value: issues.errors, color: '#D85A30' },
    { name: 'Warnings', value: issues.warnings, color: '#EF6C33' },
    { name: 'Notices', value: issues.notices, color: '#4285F4' },
    { name: 'Passed', value: issues.passed, color: '#1D9E75' },
  ];
  const totalChecks = data.reduce((s, d) => s + d.value, 0);
  if (totalChecks === 0) {
    return <AwaitingData message="Issue counts populate after the first audit completes." />;
  }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'center' }}>
      <div style={{ height: 160, position: 'relative' }}>
        <ResponsiveContainer>
          <PieChart>
            <Pie data={data} dataKey="value" innerRadius={45} outerRadius={68} stroke="none">
              {data.map((d) => <Cell key={d.name} fill={d.color} />)}
            </Pie>
            <RTooltip contentStyle={{ fontSize: 11 }} />
          </PieChart>
        </ResponsiveContainer>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#0B1C24' }}>{totalChecks}</div>
          <div style={{ fontSize: 9, color: '#5A7A8A' }}>total checks</div>
        </div>
      </div>
      <div>
        {data.map((d) => {
          const pct = totalChecks > 0 ? ((d.value / totalChecks) * 100).toFixed(1) : '0';
          return (
            <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, marginBottom: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: d.color }} />
              <span style={{ flex: '0 0 72px', color: '#5A7A8A' }}>{d.name}</span>
              <span style={{ flex: 1, fontWeight: 600, color: '#0B1C24' }}>{d.value.toLocaleString()}</span>
              <span style={{ fontSize: 10, color: '#5A7A8A' }}>{pct}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function UseCasesTable({ useCases, onClick }: { useCases: Array<{ slug: string; name: string; count: number }>; onClick: () => void }) {
  if (!useCases || useCases.length === 0) {
    return <AwaitingData message="Use cases surface after your next full audit — quick-filter shortcuts to non-indexable pages, metadata issues, redirect chains, and more." />;
  }
  return (
    <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
      <thead>
        <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
          <th style={{ textAlign: 'left', padding: '6px 4px', fontSize: 9, color: '#94A3B8', fontWeight: 600, textTransform: 'uppercase' }}>Use Case</th>
          <th style={{ textAlign: 'right', padding: '6px 4px', fontSize: 9, color: '#94A3B8', fontWeight: 600 }}>Count</th>
          <th style={{ textAlign: 'right', padding: '6px 4px', fontSize: 9, color: '#94A3B8', fontWeight: 600 }}>Action</th>
        </tr>
      </thead>
      <tbody>
        {useCases.map((uc) => (
          <tr key={uc.slug} style={{ borderBottom: '1px solid #f5f5f5', cursor: uc.count > 0 ? 'pointer' : 'default' }} onClick={() => uc.count > 0 && onClick()}>
            <td style={{ padding: '8px 4px', color: '#0B1C24' }}>{uc.name}</td>
            <td style={{ textAlign: 'right', padding: '8px 4px', fontWeight: 600, color: uc.count > 0 ? '#0B1C24' : '#94A3B8' }}>{uc.count}</td>
            <td style={{ textAlign: 'right', padding: '8px 4px' }}>
              {uc.count > 0 ? (
                <span style={{ fontSize: 10, fontWeight: 600, color: '#2D9CDB' }}>View →</span>
              ) : (
                <span style={{ fontSize: 10, color: '#94A3B8' }}>—</span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function IndexabilityWidget({ data, totalPages }: { data: NonNullable<SeoAuditResponse['indexability']>; totalPages: number }) {
  const indexablePct = totalPages > 0 ? Math.round((data.indexable / totalPages) * 100) : 0;
  const pieData = [
    { name: 'Indexable', value: data.indexable },
    { name: 'Non-indexable', value: data.nonIndexable },
  ];
  const maxBlock = Math.max(1, ...Object.values(data.blockedBy));
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: 16, alignItems: 'center' }}>
      <div style={{ height: 160, position: 'relative' }}>
        <ResponsiveContainer>
          <PieChart>
            <Pie data={pieData} dataKey="value" innerRadius={45} outerRadius={68} stroke="none">
              <Cell fill="#1D9E75" />
              <Cell fill="#D85A30" />
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#0B1C24' }}>{indexablePct}%</div>
          <div style={{ fontSize: 9, color: '#5A7A8A' }}>indexable</div>
        </div>
      </div>
      <div>
        <div style={{ fontSize: 10, color: '#5A7A8A', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600, marginBottom: 6 }}>Blocked by</div>
        {[
          { label: 'Robots.txt', value: data.blockedBy.robotsTxt },
          { label: 'Meta tag', value: data.blockedBy.metaTag },
          { label: 'X-Robots header', value: data.blockedBy.xRobots },
          { label: 'Non-canonical', value: data.blockedBy.nonCanonical },
          { label: 'Non-200 status', value: data.blockedBy.non200Status },
        ].map((b) => (
          <div key={b.label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, marginBottom: 4 }}>
            <span style={{ flex: '0 0 90px', color: '#5A7A8A' }}>{b.label}</span>
            <div style={{ flex: 1, height: 6, background: '#e2e8f0', borderRadius: 99 }}>
              <div style={{ width: `${(b.value / maxBlock) * 100}%`, height: '100%', background: '#D85A30', borderRadius: 99 }} />
            </div>
            <span style={{ width: 30, textAlign: 'right', fontWeight: 600, color: '#0B1C24' }}>{b.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function HttpStatusWidget({ data }: { data: NonNullable<SeoAuditResponse['httpStatus']> }) {
  const buckets = data.buckets;
  const total = data.total || 1;
  const rows = [
    { label: '1XX', key: '1xx' as const, color: '#94A3B8' },
    { label: '2XX', key: '2xx' as const, color: '#1D9E75' },
    { label: '3XX', key: '3xx' as const, color: '#4285F4' },
    { label: '4XX', key: '4xx' as const, color: '#EF6C33' },
    { label: '5XX', key: '5xx' as const, color: '#D85A30' },
  ];
  const pieData = rows.map((r) => ({ name: r.label, value: buckets[r.key], color: r.color }));
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'center' }}>
      <div style={{ height: 160 }}>
        <ResponsiveContainer>
          <PieChart>
            <Pie data={pieData} dataKey="value" innerRadius={40} outerRadius={66} stroke="none">
              {pieData.map((d, i) => <Cell key={i} fill={d.color} />)}
            </Pie>
            <RTooltip contentStyle={{ fontSize: 11 }} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div>
        {rows.map((r) => {
          const count = buckets[r.key];
          const pct = total > 0 ? ((count / total) * 100).toFixed(1) : '0';
          return (
            <div key={r.key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, marginBottom: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: r.color }} />
              <span style={{ flex: '0 0 30px', color: '#5A7A8A' }}>{r.label}</span>
              <span style={{ flex: 1, fontWeight: 600, color: '#0B1C24' }}>{count}</span>
              <span style={{ fontSize: 10, color: '#5A7A8A' }}>{pct}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CoreWebVitalsWidget({ data }: { data: NonNullable<SeoAuditResponse['coreWebVitals']> }) {
  if (!data.hasData) {
    return (
      <div style={{ padding: 20, background: '#F8FAFC', borderRadius: 6, textAlign: 'center', color: '#5A7A8A', fontSize: 12 }}>
        <div style={{ fontWeight: 600, color: '#0B1C24', marginBottom: 4 }}>Core Web Vitals data pending</div>
        <p style={{ margin: 0, fontSize: 11, lineHeight: 1.6, maxWidth: 480, marginInline: 'auto' }}>
          Your project is on the v1 audit engine — v2.0 audits include Chrome UX Report + Lighthouse lab metrics.
          The next audit cycle will populate these.
        </p>
      </div>
    );
  }
  const metrics = [
    { label: 'LCP', realWorld: data.realWorld.lcp, lab: data.lab.lcp, unit: 'ms', desc: 'Largest Contentful Paint' },
    { label: 'INP', realWorld: data.realWorld.inp, lab: null, unit: 'ms', desc: 'Interaction to Next Paint' },
    { label: 'CLS', realWorld: data.realWorld.cls, lab: data.lab.cls, unit: '', desc: 'Cumulative Layout Shift' },
    { label: 'FCP', realWorld: data.realWorld.fcp, lab: data.lab.fcp, unit: 'ms', desc: 'First Contentful Paint' },
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
      {metrics.map((m) => (
        <div key={m.label} style={{ background: '#F8FAFC', borderRadius: 6, padding: '12px 14px' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#0B1C24' }}>{m.label}</div>
          <div style={{ fontSize: 9, color: '#5A7A8A', marginBottom: 8 }}>{m.desc}</div>
          <div style={{ display: 'flex', gap: 12, fontSize: 11 }}>
            <div>
              <div style={{ fontSize: 9, color: '#94A3B8' }}>Real-world</div>
              <div style={{ fontWeight: 600, color: '#0B1C24' }}>{m.realWorld != null ? `${m.realWorld}${m.unit}` : '—'}</div>
            </div>
            {m.lab != null && (
              <div>
                <div style={{ fontSize: 9, color: '#94A3B8' }}>Lab</div>
                <div style={{ fontWeight: 600, color: '#5A7A8A' }}>{m.lab}{m.unit}</div>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function DomainMetricsWidget({ data }: { data: NonNullable<SeoAuditResponse['domain']> }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10 }}>
      <DomainMetricCell label="Domain Trust" value={data.domainTrust ?? '—'} sub="0–100 scale" color="#2D9CDB" />
      <DomainMetricCell label="Backlinks" value={data.backlinks != null ? data.backlinks.toLocaleString() : '—'} sub="total inbound" color="#1D9E75" />
      <DomainMetricCell label="Referring Domains" value={data.referringDomains ?? '—'} sub="unique sources" color="#EF6C33" />
      <DomainMetricCell label="Indexed Pages" value={data.pagesInGoogle ?? '—'} sub="in Google" color="#7B61FF" />
      <DomainMetricCell label="Domain Expires" value={data.expirationDate ? new Date(data.expirationDate).toLocaleDateString() : '—'} sub="renewal date" color="#5A7A8A" />
    </div>
  );
}

function DomainMetricCell({ label, value, sub, color }: { label: string; value: React.ReactNode; sub: string; color: string }) {
  return (
    <div style={{ background: '#F8FAFC', borderLeft: `3px solid ${color}`, borderRadius: 6, padding: '10px 12px' }}>
      <div style={{ fontSize: 9, color: '#5A7A8A', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: '#0B1C24', marginTop: 4 }}>{value}</div>
      <div style={{ fontSize: 9, color: '#94A3B8', marginTop: 2 }}>{sub}</div>
    </div>
  );
}

function PageDistributionWidget({ data }: { data: NonNullable<SeoAuditResponse['pageDistribution']> }) {
  const depthData = Object.entries(data.depth).sort((a, b) => Number(a[0]) - Number(b[0])).map(([k, v]) => ({ name: `Depth ${k}`, value: v }));
  const responseData = Object.entries(data.responseTime).map(([k, v]) => ({ name: k, value: v }));
  const redirectData = Object.entries(data.redirects).map(([k, v]) => ({ name: `${k}`, value: v }));
  const panels = [
    { title: 'Page Depth (clicks from home)', data: depthData, color: '#2D9CDB' },
    { title: 'Server Response Time', data: responseData, color: '#EF6C33' },
    { title: 'Redirects per Page', data: redirectData, color: '#7B61FF' },
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
      {panels.map((p) => (
        <div key={p.title} style={{ background: '#F8FAFC', borderRadius: 6, padding: '12px 14px' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#0B1C24', marginBottom: 8 }}>{p.title}</div>
          <div style={{ height: 130 }}>
            <ResponsiveContainer>
              <BarChart data={p.data} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#5A7A8A' }} tickLine={false} />
                <YAxis tick={{ fontSize: 9, fill: '#5A7A8A' }} tickLine={false} width={24} />
                <RTooltip contentStyle={{ fontSize: 10, borderRadius: 4 }} />
                <Bar dataKey="value" fill={p.color} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      ))}
    </div>
  );
}

function TopIssuesTable({ issues, onIssueClick }: { issues: SeoAuditTopIssue[]; onIssueClick: () => void }) {
  if (issues.length === 0) {
    return (
      <div style={{ padding: 16, background: '#F8FAFC', borderRadius: 6, textAlign: 'center', color: '#5A7A8A', fontSize: 12 }}>
        No issues loaded yet — they'll appear after your next audit completes.
      </div>
    );
  }
  const severityColor = (s: string) => s === 'error' ? '#D85A30' : s === 'warning' ? '#EF6C33' : '#4285F4';
  return (
    <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
      <thead>
        <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
          <th style={{ textAlign: 'left', padding: '6px 4px', fontSize: 9, color: '#94A3B8', fontWeight: 600, textTransform: 'uppercase' }}>Issue</th>
          <th style={{ textAlign: 'center', padding: '6px 4px', fontSize: 9, color: '#94A3B8', fontWeight: 600 }}>Severity</th>
          <th style={{ textAlign: 'right', padding: '6px 4px', fontSize: 9, color: '#94A3B8', fontWeight: 600 }}>Count</th>
        </tr>
      </thead>
      <tbody>
        {issues.map((iss, i) => (
          <tr key={i} style={{ borderBottom: '1px solid #f5f5f5', cursor: 'pointer' }} onClick={onIssueClick}>
            <td style={{ padding: '7px 4px', color: '#0B1C24', fontWeight: 500 }}>{iss.name}</td>
            <td style={{ textAlign: 'center', padding: '7px 4px' }}>
              <span style={{ fontSize: 10, fontWeight: 600, background: severityColor(iss.severity), color: '#fff', padding: '2px 8px', borderRadius: 3, textTransform: 'uppercase' }}>
                {iss.severity}
              </span>
            </td>
            <td style={{ textAlign: 'right', padding: '7px 4px', fontWeight: 600 }}>{iss.count}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ────────────────────────────────────────────────────────────────
// Full Report modal (5 tabs)
// ────────────────────────────────────────────────────────────────

function SeoSiteAuditDetailsModal({
  activeTab, setActiveTab, onClose, audit, initialCategory, onPageDetail,
}: {
  activeTab: DetailTab;
  setActiveTab: (t: DetailTab) => void;
  onClose: () => void;
  audit: SeoAuditResponse;
  initialCategory?: string | null;
  onPageDetail?: (id: string | number) => void;
}) {
  const tabs: Array<{ id: DetailTab; label: string }> = [
    { id: 'issue-report', label: 'Issue Report' },
    { id: 'crawled-pages', label: 'Crawled Pages' },
    { id: 'found-resources', label: 'Found Resources' },
    { id: 'found-links', label: 'Found Links' },
    { id: 'audit-comparison', label: 'Audit Comparison' },
  ];

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 12, width: '94vw', maxWidth: 1100, maxHeight: '88vh', display: 'flex', flexDirection: 'column' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 11, color: '#5A7A8A', textTransform: 'uppercase', letterSpacing: 0.5 }}>Site Audit</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#0B1C24', marginTop: 2 }}>Full Report</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', color: '#999', padding: '0 6px' }}>&times;</button>
        </div>

        <div style={{ display: 'flex', padding: '0 16px', borderBottom: '1px solid #eee', overflowX: 'auto' }}>
          {tabs.map((t) => (
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

        <div style={{ flex: 1, overflow: 'auto', padding: 20 }}>
          {activeTab === 'issue-report' && <IssueReportTab audit={audit} initialCategory={initialCategory} />}
          {activeTab === 'crawled-pages' && <CrawledPagesTab audit={audit} onPageDetail={onPageDetail} />}
          {activeTab === 'found-resources' && <FoundResourcesTab audit={audit} />}
          {activeTab === 'found-links' && <FoundLinksTab audit={audit} />}
          {activeTab === 'audit-comparison' && <AuditComparisonTab audit={audit} />}
        </div>
      </div>
    </div>
  );
}

function IssueReportTab({ audit, initialCategory }: { audit: SeoAuditResponse; initialCategory?: string | null }) {
  const all = audit.allIssues ?? audit.topIssues ?? [];
  const [severityFilter, setSeverityFilter] = React.useState<'all' | 'error' | 'warning' | 'notice'>('all');
  const [categoryFilter, setCategoryFilter] = React.useState<string>(initialCategory || 'all');
  const [search, setSearch] = React.useState('');
  React.useEffect(() => {
    if (initialCategory) setCategoryFilter(initialCategory);
  }, [initialCategory]);

  const categories = Array.from(new Set(all.map((i) => i.categoryName || 'Other'))).sort();

  if (all.length === 0) {
    return <AwaitingData message="Issue-level data comes from SE Ranking's /audit/{id}/report endpoint. If this is blank and your audit shows as complete above, the report payload is still propagating on SE Ranking's side — typically catches up within an hour of audit completion." />;
  }

  const filtered = all.filter((i) => {
    if (severityFilter !== 'all' && i.severity !== severityFilter) return false;
    if (categoryFilter !== 'all' && (i.categoryName || 'Other') !== categoryFilter) return false;
    if (search && !i.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const totalErrors = all.filter((i) => i.severity === 'error').reduce((s, i) => s + i.count, 0);
  const totalWarnings = all.filter((i) => i.severity === 'warning').reduce((s, i) => s + i.count, 0);
  const totalNotices = all.filter((i) => i.severity === 'notice').reduce((s, i) => s + i.count, 0);

  return (
    <div>
      {/* Summary bar */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
        <SummaryChip color="#D85A30" label="Errors" count={totalErrors} />
        <SummaryChip color="#EF6C33" label="Warnings" count={totalWarnings} />
        <SummaryChip color="#4285F4" label="Notices" count={totalNotices} />
        <div style={{ marginLeft: 'auto', fontSize: 11, color: '#5A7A8A', alignSelf: 'center' }}>
          {filtered.length} of {all.length} issue types
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="Search issues…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ padding: '6px 10px', fontSize: 12, border: '1px solid #d5e0e8', borderRadius: 4, width: 200 }}
        />
        <select value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value as any)} style={{ padding: '6px 10px', fontSize: 12, border: '1px solid #d5e0e8', borderRadius: 4 }}>
          <option value="all">All severities</option>
          <option value="error">Errors only</option>
          <option value="warning">Warnings only</option>
          <option value="notice">Notices only</option>
        </select>
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} style={{ padding: '6px 10px', fontSize: 12, border: '1px solid #d5e0e8', borderRadius: 4 }}>
          <option value="all">All categories</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #e2e8f0', background: '#F8FAFC' }}>
            <th style={{ textAlign: 'left', padding: '8px 6px', fontSize: 10, color: '#5A7A8A', fontWeight: 600, textTransform: 'uppercase' }}>Issue</th>
            <th style={{ textAlign: 'left', padding: '8px 6px', fontSize: 10, color: '#5A7A8A', fontWeight: 600, textTransform: 'uppercase' }}>Category</th>
            <th style={{ textAlign: 'center', padding: '8px 6px', fontSize: 10, color: '#5A7A8A', fontWeight: 600, textTransform: 'uppercase' }}>Severity</th>
            <th style={{ textAlign: 'right', padding: '8px 6px', fontSize: 10, color: '#5A7A8A', fontWeight: 600, textTransform: 'uppercase' }}>Count</th>
          </tr>
        </thead>
        <tbody>
          {filtered.length === 0 ? (
            <tr><td colSpan={4} style={{ textAlign: 'center', padding: 24, color: '#94A3B8', fontSize: 12 }}>No issues match these filters.</td></tr>
          ) : filtered.map((i, idx) => (
            <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
              <td style={{ padding: '8px 6px', color: '#0B1C24' }}>{i.name}</td>
              <td style={{ padding: '8px 6px', color: '#5A7A8A', fontSize: 11 }}>{i.categoryName || '—'}</td>
              <td style={{ textAlign: 'center', padding: '8px 6px' }}>
                <SeverityBadge severity={i.severity} />
              </td>
              <td style={{ textAlign: 'right', padding: '8px 6px', fontWeight: 600 }}>{i.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CrawledPagesTab({ audit, onPageDetail }: { audit: SeoAuditResponse; onPageDetail?: (id: string | number) => void }) {
  const pages = audit.pages ?? [];
  const [search, setSearch] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState<'all' | '2xx' | '3xx' | '4xx' | '5xx'>('all');
  const [indexableFilter, setIndexableFilter] = React.useState<'all' | 'indexable' | 'not-indexable'>('all');
  const [sortKey, setSortKey] = React.useState<'url' | 'status' | 'depth' | 'loadMs' | 'errors' | 'warnings'>('depth');
  const [sortDir, setSortDir] = React.useState<'asc' | 'desc'>('asc');

  if (pages.length === 0) {
    return <AwaitingData message="Per-page crawl data comes from /audit/{id}/pages. This is the heaviest payload SE Ranking serves and takes the longest to populate after a fresh audit — expect 10-30 minutes on first run, near-instant on subsequent runs." />;
  }

  const filtered = pages.filter((p) => {
    if (search && !p.url.toLowerCase().includes(search.toLowerCase())) return false;
    if (statusFilter !== 'all') {
      const bucket = p.status >= 500 ? '5xx' : p.status >= 400 ? '4xx' : p.status >= 300 ? '3xx' : p.status >= 200 ? '2xx' : '1xx';
      if (bucket !== statusFilter) return false;
    }
    if (indexableFilter === 'indexable' && !p.indexable) return false;
    if (indexableFilter === 'not-indexable' && p.indexable) return false;
    return true;
  });
  const sorted = [...filtered].sort((a, b) => {
    let av: any = (a as any)[sortKey];
    let bv: any = (b as any)[sortKey];
    if (av == null) av = '';
    if (bv == null) bv = '';
    if (av < bv) return sortDir === 'asc' ? -1 : 1;
    if (av > bv) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="Search URL…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ padding: '6px 10px', fontSize: 12, border: '1px solid #d5e0e8', borderRadius: 4, width: 280 }}
        />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)} style={{ padding: '6px 10px', fontSize: 12, border: '1px solid #d5e0e8', borderRadius: 4 }}>
          <option value="all">All status codes</option>
          <option value="2xx">2XX only</option>
          <option value="3xx">3XX only</option>
          <option value="4xx">4XX only</option>
          <option value="5xx">5XX only</option>
        </select>
        <select value={indexableFilter} onChange={(e) => setIndexableFilter(e.target.value as any)} style={{ padding: '6px 10px', fontSize: 12, border: '1px solid #d5e0e8', borderRadius: 4 }}>
          <option value="all">Any indexability</option>
          <option value="indexable">Indexable only</option>
          <option value="not-indexable">Non-indexable only</option>
        </select>
        <div style={{ marginLeft: 'auto', fontSize: 11, color: '#5A7A8A', alignSelf: 'center' }}>
          {sorted.length} of {pages.length} pages
        </div>
      </div>

      <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #e2e8f0', background: '#F8FAFC' }}>
            <Th label="URL" k="url" sortKey={sortKey} sortDir={sortDir} onClick={(k) => { setSortKey(k as any); setSortDir(sortDir === 'asc' ? 'desc' : 'asc'); }} />
            <Th label="Status" k="status" sortKey={sortKey} sortDir={sortDir} onClick={(k) => { setSortKey(k as any); setSortDir(sortDir === 'asc' ? 'desc' : 'asc'); }} align="right" />
            <Th label="Depth" k="depth" sortKey={sortKey} sortDir={sortDir} onClick={(k) => { setSortKey(k as any); setSortDir(sortDir === 'asc' ? 'desc' : 'asc'); }} align="right" />
            <Th label="Load (ms)" k="loadMs" sortKey={sortKey} sortDir={sortDir} onClick={(k) => { setSortKey(k as any); setSortDir(sortDir === 'asc' ? 'desc' : 'asc'); }} align="right" />
            <Th label="Errors" k="errors" sortKey={sortKey} sortDir={sortDir} onClick={(k) => { setSortKey(k as any); setSortDir(sortDir === 'asc' ? 'desc' : 'asc'); }} align="right" />
            <Th label="Warnings" k="warnings" sortKey={sortKey} sortDir={sortDir} onClick={(k) => { setSortKey(k as any); setSortDir(sortDir === 'asc' ? 'desc' : 'asc'); }} align="right" />
            <th style={{ textAlign: 'center', padding: '8px 6px', fontSize: 10, color: '#5A7A8A', fontWeight: 600, textTransform: 'uppercase' }}>Indexable</th>
            <th style={{ textAlign: 'center', padding: '8px 6px', fontSize: 10, color: '#5A7A8A', fontWeight: 600, textTransform: 'uppercase' }}>Detail</th>
          </tr>
        </thead>
        <tbody>
          {sorted.slice(0, 200).map((p) => (
            <tr key={String(p.id)} style={{ borderBottom: '1px solid #f1f5f9' }}>
              <td style={{ padding: '6px 6px', maxWidth: 420, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                <a href={p.url} target="_blank" rel="noreferrer" style={{ color: '#2D9CDB', textDecoration: 'none' }}>{p.url}</a>
              </td>
              <td style={{ textAlign: 'right', padding: '6px 6px', color: p.status >= 400 ? '#D85A30' : p.status >= 300 ? '#EF6C33' : '#0B1C24', fontWeight: 500 }}>{p.status}</td>
              <td style={{ textAlign: 'right', padding: '6px 6px' }}>{p.depth}</td>
              <td style={{ textAlign: 'right', padding: '6px 6px', color: p.loadMs > 1000 ? '#EF6C33' : '#5A7A8A' }}>{p.loadMs}</td>
              <td style={{ textAlign: 'right', padding: '6px 6px', color: p.errors > 0 ? '#D85A30' : '#94A3B8', fontWeight: p.errors > 0 ? 600 : 400 }}>{p.errors}</td>
              <td style={{ textAlign: 'right', padding: '6px 6px', color: p.warnings > 0 ? '#EF6C33' : '#94A3B8', fontWeight: p.warnings > 0 ? 600 : 400 }}>{p.warnings}</td>
              <td style={{ textAlign: 'center', padding: '6px 6px' }}>
                {p.indexable ? (
                  <span style={{ fontSize: 10, color: '#1D9E75', fontWeight: 600 }}>✓</span>
                ) : (
                  <span style={{ fontSize: 10, color: '#D85A30', fontWeight: 600 }}>✗</span>
                )}
              </td>
              <td style={{ textAlign: 'center', padding: '6px 6px' }}>
                {onPageDetail ? (
                  <button
                    onClick={() => onPageDetail(p.id)}
                    style={{ fontSize: 10, fontWeight: 600, color: '#2D9CDB', background: 'transparent', border: '1px solid #2D9CDB', borderRadius: 3, padding: '2px 8px', cursor: 'pointer' }}
                  >
                    View →
                  </button>
                ) : <span style={{ fontSize: 10, color: '#94A3B8' }}>—</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {sorted.length > 200 && (
        <div style={{ fontSize: 11, color: '#94A3B8', textAlign: 'center', marginTop: 10, fontStyle: 'italic' }}>
          Showing first 200 of {sorted.length} filtered pages. Refine filters to narrow.
        </div>
      )}
    </div>
  );
}

function FoundResourcesTab({ audit }: { audit: SeoAuditResponse }) {
  const pages = audit.pages ?? [];
  const totals = audit.foundResources ?? { images: 0, cssSizeBytes: 0, jsSizeBytes: 0, total: 0 };
  if (pages.length === 0) {
    return <AwaitingData message="Resource weights per page (images, CSS, JS bytes) come from /audit/{id}/pages. Populates once the per-page crawl payload is ready — see Crawled Pages tab for timing." />;
  }

  // Top pages by resource weight (CSS+JS+img size)
  const byWeight = [...pages]
    .filter((p) => p.cssSize + p.jsSize + p.imgSize > 0)
    .sort((a, b) => (b.cssSize + b.jsSize + b.imgSize) - (a.cssSize + a.jsSize + a.imgSize))
    .slice(0, 50);
  const byImgCount = [...pages].filter((p) => p.imgCount > 0).sort((a, b) => b.imgCount - a.imgCount).slice(0, 50);

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
        <SummaryStat label="Total Images" value={totals.images.toLocaleString()} sub="across all pages" color="#7B61FF" />
        <SummaryStat label="CSS Total" value={`${Math.round(totals.cssSizeBytes / 1024).toLocaleString()} KB`} sub="combined CSS weight" color="#EF6C33" />
        <SummaryStat label="JS Total" value={`${Math.round(totals.jsSizeBytes / 1024).toLocaleString()} KB`} sub="combined JS weight" color="#FEC82C" />
      </div>

      <div style={{ fontSize: 13, fontWeight: 600, color: '#0B1C24', marginBottom: 8 }}>Top pages by resource weight</div>
      <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #e2e8f0', background: '#F8FAFC' }}>
            <th style={{ textAlign: 'left', padding: '8px 6px', fontSize: 10, color: '#5A7A8A', fontWeight: 600, textTransform: 'uppercase' }}>Page</th>
            <th style={{ textAlign: 'right', padding: '8px 6px', fontSize: 10, color: '#5A7A8A', fontWeight: 600 }}>Images</th>
            <th style={{ textAlign: 'right', padding: '8px 6px', fontSize: 10, color: '#5A7A8A', fontWeight: 600 }}>Img KB</th>
            <th style={{ textAlign: 'right', padding: '8px 6px', fontSize: 10, color: '#5A7A8A', fontWeight: 600 }}>CSS KB</th>
            <th style={{ textAlign: 'right', padding: '8px 6px', fontSize: 10, color: '#5A7A8A', fontWeight: 600 }}>JS KB</th>
            <th style={{ textAlign: 'right', padding: '8px 6px', fontSize: 10, color: '#5A7A8A', fontWeight: 600 }}>Total KB</th>
          </tr>
        </thead>
        <tbody>
          {byWeight.map((p) => {
            const totalKB = Math.round((p.cssSize + p.jsSize + p.imgSize) / 1024);
            return (
              <tr key={String(p.id)} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ padding: '6px 6px', maxWidth: 380, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  <a href={p.url} target="_blank" rel="noreferrer" style={{ color: '#2D9CDB', textDecoration: 'none' }}>{p.url}</a>
                </td>
                <td style={{ textAlign: 'right', padding: '6px 6px' }}>{p.imgCount}</td>
                <td style={{ textAlign: 'right', padding: '6px 6px' }}>{Math.round(p.imgSize / 1024)}</td>
                <td style={{ textAlign: 'right', padding: '6px 6px' }}>{Math.round(p.cssSize / 1024)}</td>
                <td style={{ textAlign: 'right', padding: '6px 6px' }}>{Math.round(p.jsSize / 1024)}</td>
                <td style={{ textAlign: 'right', padding: '6px 6px', fontWeight: 600, color: totalKB > 2000 ? '#D85A30' : totalKB > 1000 ? '#EF6C33' : '#0B1C24' }}>{totalKB}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 14, fontStyle: 'italic' }}>
        Pages over 1,000 KB of combined resources are optimization candidates — large images and uncompressed CSS/JS slow page load.
      </div>
    </div>
  );
}

function FoundLinksTab({ audit }: { audit: SeoAuditResponse }) {
  const pages = audit.pages ?? [];
  const totals = audit.foundLinks ?? { total: 0, internal: 0, external: 0, nofollow: 0 };
  if (pages.length === 0) {
    return <AwaitingData message="Link inventories (outbound + inbound per page) come from /audit/{id}/pages. Populates once the per-page crawl payload is ready." />;
  }

  const topByLinks = [...pages].filter((p) => p.totalLinks > 0).sort((a, b) => b.totalLinks - a.totalLinks).slice(0, 50);
  const topByInbound = [...pages].filter((p) => p.inlinks > 0).sort((a, b) => b.inlinks - a.inlinks).slice(0, 20);

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 }}>
        <SummaryStat label="Total Links" value={totals.total.toLocaleString()} sub="across all pages" color="#2D9CDB" />
        <SummaryStat label="Internal" value={totals.internal.toLocaleString()} sub="on-site links" color="#1D9E75" />
        <SummaryStat label="External" value={totals.external.toLocaleString()} sub="outbound links" color="#EF6C33" />
        <SummaryStat label="Nofollow" value={totals.nofollow.toLocaleString()} sub="rel='nofollow'" color="#5A7A8A" />
      </div>

      <div style={{ fontSize: 13, fontWeight: 600, color: '#0B1C24', marginBottom: 8 }}>Pages with most outbound links</div>
      <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse', marginBottom: 20 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #e2e8f0', background: '#F8FAFC' }}>
            <th style={{ textAlign: 'left', padding: '8px 6px', fontSize: 10, color: '#5A7A8A', fontWeight: 600, textTransform: 'uppercase' }}>Page</th>
            <th style={{ textAlign: 'right', padding: '8px 6px', fontSize: 10, color: '#5A7A8A', fontWeight: 600 }}>Total</th>
            <th style={{ textAlign: 'right', padding: '8px 6px', fontSize: 10, color: '#5A7A8A', fontWeight: 600 }}>Internal</th>
            <th style={{ textAlign: 'right', padding: '8px 6px', fontSize: 10, color: '#5A7A8A', fontWeight: 600 }}>External</th>
          </tr>
        </thead>
        <tbody>
          {topByLinks.map((p) => (
            <tr key={String(p.id)} style={{ borderBottom: '1px solid #f1f5f9' }}>
              <td style={{ padding: '6px 6px', maxWidth: 420, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                <a href={p.url} target="_blank" rel="noreferrer" style={{ color: '#2D9CDB', textDecoration: 'none' }}>{p.url}</a>
              </td>
              <td style={{ textAlign: 'right', padding: '6px 6px', fontWeight: 600 }}>{p.totalLinks}</td>
              <td style={{ textAlign: 'right', padding: '6px 6px' }}>{p.outlinksInternal}</td>
              <td style={{ textAlign: 'right', padding: '6px 6px' }}>{p.outlinksExternal}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ fontSize: 13, fontWeight: 600, color: '#0B1C24', marginBottom: 8 }}>Top pages by inbound links (authority pages)</div>
      <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #e2e8f0', background: '#F8FAFC' }}>
            <th style={{ textAlign: 'left', padding: '8px 6px', fontSize: 10, color: '#5A7A8A', fontWeight: 600, textTransform: 'uppercase' }}>Page</th>
            <th style={{ textAlign: 'right', padding: '8px 6px', fontSize: 10, color: '#5A7A8A', fontWeight: 600 }}>Inbound</th>
            <th style={{ textAlign: 'right', padding: '8px 6px', fontSize: 10, color: '#5A7A8A', fontWeight: 600 }}>Follow</th>
            <th style={{ textAlign: 'right', padding: '8px 6px', fontSize: 10, color: '#5A7A8A', fontWeight: 600 }}>Nofollow</th>
          </tr>
        </thead>
        <tbody>
          {topByInbound.map((p) => (
            <tr key={String(p.id)} style={{ borderBottom: '1px solid #f1f5f9' }}>
              <td style={{ padding: '6px 6px', maxWidth: 420, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                <a href={p.url} target="_blank" rel="noreferrer" style={{ color: '#2D9CDB', textDecoration: 'none' }}>{p.url}</a>
              </td>
              <td style={{ textAlign: 'right', padding: '6px 6px', fontWeight: 600 }}>{p.inlinks}</td>
              <td style={{ textAlign: 'right', padding: '6px 6px', color: '#1D9E75' }}>{p.inlinksFollow}</td>
              <td style={{ textAlign: 'right', padding: '6px 6px', color: '#5A7A8A' }}>{p.inlinksNofollow}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Helper components for the modal tabs
function SummaryChip({ color, label, count }: { color: string; label: string; count: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#F8FAFC', padding: '6px 12px', borderRadius: 4, borderLeft: `3px solid ${color}` }}>
      <span style={{ fontSize: 10, color: '#5A7A8A', textTransform: 'uppercase', fontWeight: 600 }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 700, color }}>{count}</span>
    </div>
  );
}

function SummaryStat({ label, value, sub, color }: { label: string; value: string | number; sub: string; color: string }) {
  return (
    <div style={{ background: '#F8FAFC', borderLeft: `3px solid ${color}`, borderRadius: 6, padding: '10px 12px' }}>
      <div style={{ fontSize: 9, color: '#5A7A8A', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: '#0B1C24', marginTop: 4 }}>{value}</div>
      <div style={{ fontSize: 9, color: '#94A3B8', marginTop: 2 }}>{sub}</div>
    </div>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  const color = severity === 'error' ? '#D85A30' : severity === 'warning' ? '#EF6C33' : '#4285F4';
  return (
    <span style={{ fontSize: 9, fontWeight: 600, background: color, color: '#fff', padding: '2px 8px', borderRadius: 3, textTransform: 'uppercase' }}>
      {severity}
    </span>
  );
}

function Th({ label, k, sortKey, sortDir, onClick, align = 'left' }: { label: string; k: string; sortKey: string; sortDir: 'asc' | 'desc'; onClick: (k: string) => void; align?: 'left' | 'right' | 'center' }) {
  const active = sortKey === k;
  return (
    <th style={{ textAlign: align, padding: '8px 6px', fontSize: 10, color: active ? '#0B1C24' : '#5A7A8A', fontWeight: 600, textTransform: 'uppercase', cursor: 'pointer', userSelect: 'none' }} onClick={() => onClick(k)}>
      {label}{active ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
    </th>
  );
}

function AuditComparisonTab({ audit }: { audit: SeoAuditResponse }) {
  const current = audit.history?.current;
  // Use the freshest comparison window we have
  const activeTab: HistoryTab = audit.history?.weekly ? 'weekly' : audit.history?.monthly ? 'monthly' : 'quarterly';
  return (
    <div>
      <div style={{ fontSize: 12, color: '#5A7A8A', marginBottom: 12 }}>
        Side-by-side comparison of the most recent audit vs the previous one.
      </div>
      <HistoryComparisonBody history={audit.history ?? {}} current={current} activeTab={activeTab} healthScore={audit.healthScore} />
      <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 16, fontStyle: 'italic' }}>
        V2 enhancement: resolved-issues list and new-issues list drawn from the issue-level diff between the two audits.
      </div>
    </div>
  );
}

function TabPlaceholder({ label, body }: { label: string; body: string }) {
  return (
    <div style={{ padding: 32, background: '#F8FAFC', borderRadius: 8, textAlign: 'center' }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: '#0B1C24' }}>{label} — Coming Soon</div>
      <p style={{ fontSize: 12, color: '#5A7A8A', maxWidth: 520, margin: '8px auto 0', lineHeight: 1.6 }}>{body}</p>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// Top Pages by Issues (dashboard widget)
// ────────────────────────────────────────────────────────────────

function TopPagesByIssuesTable({
  rows, onView,
}: {
  rows: Array<{ id: string | number; url: string; errors: number; warnings: number; notices: number }>;
  onView: (id: string | number) => void;
}) {
  if (!rows || rows.length === 0) {
    return <AwaitingData message="Per-page issue aggregates populate with /audit/{id}/pages. Once crawl data is available, the pages with the most errors, warnings, and notices appear here." />;
  }
  return (
    <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
      <thead>
        <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
          <th style={{ textAlign: 'left', padding: '6px 4px', fontSize: 9, color: '#94A3B8', fontWeight: 600, textTransform: 'uppercase' }}>URL</th>
          <th style={{ textAlign: 'right', padding: '6px 4px', fontSize: 9, color: '#94A3B8', fontWeight: 600 }}>Errors</th>
          <th style={{ textAlign: 'right', padding: '6px 4px', fontSize: 9, color: '#94A3B8', fontWeight: 600 }}>Warnings</th>
          <th style={{ textAlign: 'right', padding: '6px 4px', fontSize: 9, color: '#94A3B8', fontWeight: 600 }}>Notices</th>
          <th style={{ textAlign: 'right', padding: '6px 4px', fontSize: 9, color: '#94A3B8', fontWeight: 600 }}>Action</th>
        </tr>
      </thead>
      <tbody>
        {rows.slice(0, 20).map((p) => (
          <tr key={String(p.id)} style={{ borderBottom: '1px solid #f1f5f9' }}>
            <td style={{ padding: '7px 4px', maxWidth: 480, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              <a href={p.url} target="_blank" rel="noreferrer" style={{ color: '#2D9CDB', textDecoration: 'none' }}>{p.url}</a>
            </td>
            <td style={{ textAlign: 'right', padding: '7px 4px', fontWeight: p.errors > 0 ? 600 : 400, color: p.errors > 0 ? '#D85A30' : '#94A3B8' }}>{p.errors}</td>
            <td style={{ textAlign: 'right', padding: '7px 4px', fontWeight: p.warnings > 0 ? 600 : 400, color: p.warnings > 0 ? '#EF6C33' : '#94A3B8' }}>{p.warnings}</td>
            <td style={{ textAlign: 'right', padding: '7px 4px', fontWeight: p.notices > 0 ? 600 : 400, color: p.notices > 0 ? '#4285F4' : '#94A3B8' }}>{p.notices}</td>
            <td style={{ textAlign: 'right', padding: '7px 4px' }}>
              <button
                onClick={() => onView(p.id)}
                style={{ fontSize: 10, fontWeight: 600, color: '#2D9CDB', background: 'transparent', border: '1px solid #2D9CDB', borderRadius: 3, padding: '2px 8px', cursor: 'pointer' }}
              >
                View Detail →
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ────────────────────────────────────────────────────────────────
// Issues by Category (dashboard widget)
// ────────────────────────────────────────────────────────────────

function IssueCategoriesWidget({
  categories, onCategoryClick,
}: {
  categories: Array<{ uid: string; name: string; errorsCount: number; warningsCount: number; noticesCount: number }>;
  onCategoryClick: (name: string) => void;
}) {
  if (!categories || categories.length === 0) {
    return <AwaitingData message="Issue category rollups populate after the next full audit. Each row breaks down the error / warning / notice count per SE Ranking category." />;
  }
  const chartData = categories.map((c) => ({
    name: c.name.length > 18 ? c.name.slice(0, 17) + '…' : c.name,
    fullName: c.name,
    Errors: c.errorsCount,
    Warnings: c.warningsCount,
    Notices: c.noticesCount,
  }));
  return (
    <div>
      <div style={{ height: 180, marginBottom: 10 }}>
        <ResponsiveContainer>
          <BarChart data={chartData} margin={{ top: 5, right: 8, left: 0, bottom: 5 }}>
            <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#5A7A8A' }} tickLine={false} interval={0} angle={-15} textAnchor="end" height={42} />
            <YAxis tick={{ fontSize: 9, fill: '#5A7A8A' }} tickLine={false} width={28} />
            <RTooltip contentStyle={{ fontSize: 10, borderRadius: 4 }} />
            <Bar dataKey="Errors" stackId="a" fill="#D85A30" />
            <Bar dataKey="Warnings" stackId="a" fill="#EF6C33" />
            <Bar dataKey="Notices" stackId="a" fill="#4285F4" />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div style={{ maxHeight: 140, overflow: 'auto' }}>
        <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
              <th style={{ textAlign: 'left', padding: '5px 4px', fontSize: 9, color: '#94A3B8', fontWeight: 600, textTransform: 'uppercase' }}>Category</th>
              <th style={{ textAlign: 'right', padding: '5px 4px', fontSize: 9, color: '#D85A30', fontWeight: 600 }}>Err</th>
              <th style={{ textAlign: 'right', padding: '5px 4px', fontSize: 9, color: '#EF6C33', fontWeight: 600 }}>Warn</th>
              <th style={{ textAlign: 'right', padding: '5px 4px', fontSize: 9, color: '#4285F4', fontWeight: 600 }}>Note</th>
            </tr>
          </thead>
          <tbody>
            {categories.map((c) => (
              <tr
                key={c.uid}
                style={{ borderBottom: '1px solid #f5f5f5', cursor: 'pointer' }}
                onClick={() => onCategoryClick(c.name)}
              >
                <td style={{ padding: '6px 4px', color: '#0B1C24' }}>{c.name}</td>
                <td style={{ textAlign: 'right', padding: '6px 4px', fontWeight: c.errorsCount > 0 ? 600 : 400, color: c.errorsCount > 0 ? '#D85A30' : '#94A3B8' }}>{c.errorsCount}</td>
                <td style={{ textAlign: 'right', padding: '6px 4px', fontWeight: c.warningsCount > 0 ? 600 : 400, color: c.warningsCount > 0 ? '#EF6C33' : '#94A3B8' }}>{c.warningsCount}</td>
                <td style={{ textAlign: 'right', padding: '6px 4px', fontWeight: c.noticesCount > 0 ? 600 : 400, color: c.noticesCount > 0 ? '#4285F4' : '#94A3B8' }}>{c.noticesCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// Per-Page Detail Modal
// ────────────────────────────────────────────────────────────────

type PageDetailTab = 'overview' | 'issues' | 'metadata' | 'resources' | 'links';

function SeoPageDetailModal({
  siteId, pageId, arionApi, onClose,
}: {
  siteId: string;
  pageId: string;
  arionApi: { getSeoAuditPage: (siteId: string, pageId: string) => Promise<SeoAuditPageDetail> };
  onClose: () => void;
}) {
  const [detail, setDetail] = React.useState<SeoAuditPageDetail | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);
  const [tab, setTab] = React.useState<PageDetailTab>('overview');

  React.useEffect(() => {
    let alive = true;
    setLoading(true);
    setErr(null);
    arionApi.getSeoAuditPage(siteId, pageId)
      .then((r) => { if (alive) setDetail(r); })
      .catch((e) => { if (alive) setErr(e?.message || 'Failed to load page detail'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [siteId, pageId, arionApi]);

  const tabs: Array<{ id: PageDetailTab; label: string }> = [
    { id: 'overview', label: 'Overview' },
    { id: 'issues', label: 'Issues' },
    { id: 'metadata', label: 'Metadata & Content' },
    { id: 'resources', label: 'Resources' },
    { id: 'links', label: 'Links' },
  ];

  const page = detail?.page || null;
  const pageUrl: string = (page && (page.url || page.full_url)) || '';

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100 }}
      onClick={onClose}
    >
      <div
        style={{ background: '#fff', borderRadius: 12, width: '94vw', maxWidth: 1100, maxHeight: '88vh', display: 'flex', flexDirection: 'column' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 11, color: '#5A7A8A', textTransform: 'uppercase', letterSpacing: 0.5 }}>Page Detail</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#0B1C24', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {pageUrl || `Page #${pageId}`}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', color: '#999', padding: '0 6px', marginLeft: 12 }}>&times;</button>
        </div>

        <div style={{ display: 'flex', padding: '0 16px', borderBottom: '1px solid #eee', overflowX: 'auto' }}>
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                padding: '10px 16px', fontSize: 12, fontWeight: 600,
                background: 'transparent',
                color: tab === t.id ? '#0B1C24' : '#94A3B8',
                border: 'none',
                borderBottom: tab === t.id ? '2px solid #0B1C24' : '2px solid transparent',
                cursor: 'pointer', whiteSpace: 'nowrap',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: 20 }}>
          {loading && <div style={{ padding: 30, textAlign: 'center', color: '#5A7A8A', fontSize: 12 }}>Loading page detail…</div>}
          {!loading && err && <AwaitingData message={`Could not load page detail: ${err}`} />}
          {!loading && !err && (!detail || !detail.page) && (
            <AwaitingData message="Page-level detail comes from SE Ranking's /audit/{id}/page endpoint. If this is blank, the per-page payload is still propagating — typically catches up within an hour of audit completion." />
          )}
          {!loading && !err && detail && detail.page && (
            <>
              {tab === 'overview' && <PageOverviewTab page={detail.page} issues={detail.issues} />}
              {tab === 'issues' && <PageIssuesTab issues={detail.issues} />}
              {tab === 'metadata' && <PageMetadataTab page={detail.page} />}
              {tab === 'resources' && <PageResourcesTab page={detail.page} />}
              {tab === 'links' && <PageLinksTab page={detail.page} />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function pickNum(obj: Record<string, any>, keys: string[]): number | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'number' && !Number.isNaN(v)) return v;
    if (typeof v === 'string' && v !== '' && !Number.isNaN(Number(v))) return Number(v);
  }
  return null;
}

function pickStr(obj: Record<string, any>, keys: string[]): string | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'string' && v.length > 0) return v;
  }
  return null;
}

function PageOverviewTab({ page, issues }: { page: Record<string, any>; issues: SeoAuditPageDetail['issues'] }) {
  const url = pickStr(page, ['url', 'full_url']) || '';
  const status = pickNum(page, ['status', 'http_code', 'status_code']);
  const title = pickStr(page, ['title']);
  const titleLen = pickNum(page, ['title_len', 'title_length']);
  const description = pickStr(page, ['description', 'meta_description']);
  const descLen = pickNum(page, ['description_len', 'description_length']);
  const canonical = pickStr(page, ['canonical_url', 'canonical']);
  const size = pickNum(page, ['size', 'page_size', 'html_size']);
  const loadMs = pickNum(page, ['load_ms', 'load_time', 'response_time']);
  const wordCount = pickNum(page, ['word_count', 'words']);
  const redirectCount = pickNum(page, ['redirect_count', 'redirects']);
  const indexable = page.indexable === true || page.indexable === 1;
  const noindex = page.noindex === true || page.noindex === 1;
  const blockedRobots = page.blocked_robots === true || page.blocked_robots === 1;

  const errorCount = issues.filter((i) => i.severity === 'error').reduce((s, i) => s + (i.count || 1), 0);
  const warningCount = issues.filter((i) => i.severity === 'warning').reduce((s, i) => s + (i.count || 1), 0);
  const noticeCount = issues.filter((i) => i.severity === 'notice').reduce((s, i) => s + (i.count || 1), 0);

  const overallColor = errorCount > 0 ? '#D85A30' : warningCount > 0 ? '#EF6C33' : '#1D9E75';
  const overallLabel = errorCount > 0 ? 'Errors Present' : warningCount > 0 ? 'Warnings Present' : 'Healthy';

  const titleWarn = titleLen != null && (titleLen < 30 || titleLen > 60);
  const descWarn = descLen != null && (descLen < 70 || descLen > 160);

  const statusColor = status != null && status >= 400 ? '#D85A30' : status != null && status >= 300 ? '#EF6C33' : '#1D9E75';

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, padding: '10px 14px', background: '#F8FAFC', borderLeft: `4px solid ${overallColor}`, borderRadius: 6 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: overallColor }}>{overallLabel}</div>
        {url && (
          <a href={url} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: '#2D9CDB', marginLeft: 'auto' }}>
            Open page in new tab ↗
          </a>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 }}>
        <SummaryStat label="Errors" value={errorCount} sub="issues found" color="#D85A30" />
        <SummaryStat label="Warnings" value={warningCount} sub="issues found" color="#EF6C33" />
        <SummaryStat label="Notices" value={noticeCount} sub="issues found" color="#4285F4" />
        <SummaryStat label="Load Time" value={loadMs != null ? `${loadMs} ms` : '—'} sub="server response" color="#2D9CDB" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <FactCard label="URL" value={url || '—'} mono />
        <FactCard label="HTTP Status" value={status != null ? String(status) : '—'} valueColor={statusColor} />
        <FactCard
          label="Indexability"
          value={indexable ? 'Indexable' : 'Not indexable'}
          valueColor={indexable ? '#1D9E75' : '#D85A30'}
          sub={[noindex ? 'noindex meta' : null, blockedRobots ? 'blocked by robots.txt' : null].filter(Boolean).join(' · ') || null}
        />
        <FactCard label="Canonical URL" value={canonical || '—'} mono />
        <FactCard
          label="Title"
          value={title || '—'}
          sub={titleLen != null ? `${titleLen} chars${titleWarn ? ' — outside 30–60 range' : ''}` : null}
          valueColor={titleWarn ? '#EF6C33' : undefined}
        />
        <FactCard
          label="Meta Description"
          value={description || '—'}
          sub={descLen != null ? `${descLen} chars${descWarn ? ' — outside 70–160 range' : ''}` : null}
          valueColor={descWarn ? '#EF6C33' : undefined}
        />
        <FactCard label="Page Size" value={size != null ? `${Math.round(size / 1024).toLocaleString()} KB` : '—'} />
        <FactCard label="Word Count" value={wordCount != null ? wordCount.toLocaleString() : '—'} />
        <FactCard label="Redirects" value={redirectCount != null ? String(redirectCount) : '—'} sub={pickStr(page, ['redirect_url']) || null} />
      </div>
    </div>
  );
}

function FactCard({ label, value, sub, valueColor, mono }: { label: string; value: string; sub?: string | null; valueColor?: string; mono?: boolean }) {
  return (
    <div style={{ background: '#F8FAFC', borderRadius: 6, padding: '10px 12px', border: '1px solid #e2e8f0' }}>
      <div style={{ fontSize: 9, color: '#5A7A8A', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>{label}</div>
      <div
        style={{
          fontSize: 12, fontWeight: 600, color: valueColor || '#0B1C24', marginTop: 4,
          wordBreak: 'break-word', fontFamily: mono ? 'ui-monospace, SFMono-Regular, Menlo, monospace' : undefined,
        }}
      >
        {value}
      </div>
      {sub && <div style={{ fontSize: 10, color: '#94A3B8', marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

function PageIssuesTab({ issues }: { issues: SeoAuditPageDetail['issues'] }) {
  const [sev, setSev] = React.useState<'all' | 'error' | 'warning' | 'notice'>('all');
  if (!issues || issues.length === 0) {
    return <AwaitingData message="No issues recorded for this page in the current audit." />;
  }
  const filtered = issues.filter((i) => sev === 'all' || i.severity === sev);

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <select value={sev} onChange={(e) => setSev(e.target.value as any)} style={{ padding: '6px 10px', fontSize: 12, border: '1px solid #d5e0e8', borderRadius: 4 }}>
          <option value="all">All severities</option>
          <option value="error">Errors only</option>
          <option value="warning">Warnings only</option>
          <option value="notice">Notices only</option>
        </select>
        <div style={{ marginLeft: 'auto', fontSize: 11, color: '#5A7A8A', alignSelf: 'center' }}>
          {filtered.length} of {issues.length} issues
        </div>
      </div>
      <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #e2e8f0', background: '#F8FAFC' }}>
            <th style={{ textAlign: 'center', padding: '8px 6px', fontSize: 10, color: '#5A7A8A', fontWeight: 600, textTransform: 'uppercase', width: 90 }}>Severity</th>
            <th style={{ textAlign: 'left', padding: '8px 6px', fontSize: 10, color: '#5A7A8A', fontWeight: 600, textTransform: 'uppercase' }}>Issue</th>
            <th style={{ textAlign: 'right', padding: '8px 6px', fontSize: 10, color: '#5A7A8A', fontWeight: 600, textTransform: 'uppercase', width: 70 }}>Count</th>
            <th style={{ textAlign: 'left', padding: '8px 6px', fontSize: 10, color: '#5A7A8A', fontWeight: 600, textTransform: 'uppercase' }}>Description</th>
          </tr>
        </thead>
        <tbody>
          {filtered.length === 0 ? (
            <tr><td colSpan={4} style={{ textAlign: 'center', padding: 24, color: '#94A3B8', fontSize: 12 }}>No issues match this filter.</td></tr>
          ) : filtered.map((i, idx) => (
            <tr key={`${i.slug || 'iss'}-${idx}`} style={{ borderBottom: '1px solid #f1f5f9' }}>
              <td style={{ textAlign: 'center', padding: '8px 6px' }}><SeverityBadge severity={i.severity} /></td>
              <td style={{ padding: '8px 6px', color: '#0B1C24', fontWeight: 500 }}>{i.name}</td>
              <td style={{ textAlign: 'right', padding: '8px 6px', fontWeight: 600 }}>{i.count}</td>
              <td style={{ padding: '8px 6px', color: '#5A7A8A', fontSize: 11 }}>{i.description || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PageMetadataTab({ page }: { page: Record<string, any> }) {
  const title = pickStr(page, ['title']);
  const titleLen = pickNum(page, ['title_len', 'title_length']);
  const description = pickStr(page, ['description', 'meta_description']);
  const descLen = pickNum(page, ['description_len', 'description_length']);
  const canonical = pickStr(page, ['canonical_url', 'canonical']);
  const xrobots = pickStr(page, ['xrobots', 'x_robots', 'x_robots_tag']);
  const wordCount = pickNum(page, ['word_count', 'words']);
  const duplicate = page.duplicate_content ?? page.duplicate ?? null;

  const headingLevels: Array<{ key: string; label: string }> = [
    { key: 'h1', label: 'H1' },
    { key: 'h2', label: 'H2' },
    { key: 'h3', label: 'H3' },
    { key: 'h4', label: 'H4' },
    { key: 'h5', label: 'H5' },
    { key: 'h6', label: 'H6' },
  ];

  const schema = page.schema || page.structured_data || null;
  const schemaTypes: string[] = Array.isArray(schema)
    ? schema.map((s: any) => (typeof s === 'string' ? s : (s?.type || s?.['@type'] || ''))).filter(Boolean)
    : schema && typeof schema === 'object'
      ? Object.keys(schema)
      : [];

  const titleWarn = titleLen != null && (titleLen < 30 || titleLen > 60);
  const descWarn = descLen != null && (descLen < 70 || descLen > 160);

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
        <div style={{ background: '#F8FAFC', borderRadius: 6, padding: 12, border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: 9, color: '#5A7A8A', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600, marginBottom: 6 }}>Title</div>
          <div style={{ fontSize: 12, color: '#0B1C24', wordBreak: 'break-word' }}>{title || <span style={{ color: '#D85A30' }}>No title set</span>}</div>
          <div style={{ fontSize: 10, color: titleWarn ? '#EF6C33' : '#94A3B8', marginTop: 6 }}>
            {titleLen != null ? `${titleLen} characters` : 'Length unknown'}{titleWarn ? ' · Outside recommended 30–60 range' : ''}
          </div>
        </div>
        <div style={{ background: '#F8FAFC', borderRadius: 6, padding: 12, border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: 9, color: '#5A7A8A', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600, marginBottom: 6 }}>Meta Description</div>
          <div style={{ fontSize: 12, color: '#0B1C24', wordBreak: 'break-word' }}>{description || <span style={{ color: '#D85A30' }}>No description set</span>}</div>
          <div style={{ fontSize: 10, color: descWarn ? '#EF6C33' : '#94A3B8', marginTop: 6 }}>
            {descLen != null ? `${descLen} characters` : 'Length unknown'}{descWarn ? ' · Outside recommended 70–160 range' : ''}
          </div>
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#0B1C24', marginBottom: 8 }}>Heading Structure</div>
        <div style={{ background: '#F8FAFC', borderRadius: 6, padding: 12, border: '1px solid #e2e8f0' }}>
          {headingLevels.map((h) => {
            const raw = page[h.key];
            const list: string[] = Array.isArray(raw)
              ? raw.map((x) => (typeof x === 'string' ? x : x?.text || x?.value || '')).filter(Boolean)
              : typeof raw === 'string' && raw.length > 0
                ? [raw]
                : [];
            if (list.length === 0) {
              return (
                <div key={h.key} style={{ display: 'flex', gap: 10, fontSize: 11, padding: '4px 0', color: '#94A3B8' }}>
                  <span style={{ fontWeight: 700, width: 30 }}>{h.label}</span>
                  <span>—</span>
                </div>
              );
            }
            return (
              <div key={h.key} style={{ padding: '4px 0', borderBottom: '1px solid #eef2f6' }}>
                <div style={{ display: 'flex', gap: 10, fontSize: 11 }}>
                  <span style={{ fontWeight: 700, color: '#0B1C24', width: 30 }}>{h.label}</span>
                  <span style={{ color: '#5A7A8A' }}>({list.length})</span>
                </div>
                <ul style={{ margin: '4px 0 0 40px', padding: 0, fontSize: 11, color: '#0B1C24' }}>
                  {list.slice(0, 8).map((txt, i) => (
                    <li key={i} style={{ margin: '2px 0', listStyle: 'disc' }}>{txt}</li>
                  ))}
                  {list.length > 8 && <li style={{ color: '#94A3B8', fontStyle: 'italic' }}>+{list.length - 8} more</li>}
                </ul>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
        <FactCard label="Word Count" value={wordCount != null ? wordCount.toLocaleString() : '—'} />
        <FactCard label="Canonical URL" value={canonical || '—'} mono />
        <FactCard label="X-Robots Header" value={xrobots || '—'} />
        <FactCard
          label="Duplicate Content"
          value={duplicate == null ? '—' : typeof duplicate === 'boolean' ? (duplicate ? 'Yes' : 'No') : String(duplicate)}
          valueColor={duplicate === true ? '#D85A30' : undefined}
        />
      </div>

      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#0B1C24', marginBottom: 8 }}>Structured Data</div>
        <div style={{ background: '#F8FAFC', borderRadius: 6, padding: 12, border: '1px solid #e2e8f0' }}>
          {schemaTypes.length === 0 ? (
            <div style={{ fontSize: 11, color: '#94A3B8' }}>No structured data detected on this page.</div>
          ) : (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {schemaTypes.map((t, i) => (
                <span key={i} style={{ fontSize: 10, fontWeight: 600, background: '#2D9CDB', color: '#fff', padding: '3px 8px', borderRadius: 3 }}>
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PageResourcesTab({ page }: { page: Record<string, any> }) {
  const imgRaw = page.img;
  const imgArr: any[] = Array.isArray(imgRaw) ? imgRaw : [];
  const imgCount = typeof imgRaw === 'number' ? imgRaw : (pickNum(page, ['img_count', 'images_count']) ?? imgArr.length);
  const brokenAlt = pickNum(page, ['img_no_alt', 'images_without_alt', 'missing_alt']) ?? imgArr.filter((x: any) => x && !(x.alt || x.alt_text)).length;
  const imgKB = Math.round((pickNum(page, ['img_size', 'images_size']) ?? 0) / 1024);

  const cssArr: any[] = Array.isArray(page.css) ? page.css : [];
  const cssCount = pickNum(page, ['css_count']) ?? cssArr.length;
  const cssKB = Math.round((pickNum(page, ['css_size']) ?? 0) / 1024);

  const jsArr: any[] = Array.isArray(page.js) ? page.js : [];
  const jsCount = pickNum(page, ['js_count']) ?? jsArr.length;
  const jsKB = Math.round((pickNum(page, ['js_size']) ?? 0) / 1024);

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
        <SummaryStat label="Images" value={imgCount != null ? imgCount : '—'} sub={`${imgKB.toLocaleString()} KB${brokenAlt ? ` · ${brokenAlt} missing alt` : ''}`} color="#7B61FF" />
        <SummaryStat label="CSS Files" value={cssCount != null ? cssCount : '—'} sub={`${cssKB.toLocaleString()} KB`} color="#EF6C33" />
        <SummaryStat label="JS Files" value={jsCount != null ? jsCount : '—'} sub={`${jsKB.toLocaleString()} KB`} color="#FEC82C" />
      </div>

      {imgArr.length > 0 && (
        <ResourceList title="Images" items={imgArr} kind="img" />
      )}
      {cssArr.length > 0 && (
        <ResourceList title="CSS Files" items={cssArr} kind="css" />
      )}
      {jsArr.length > 0 && (
        <ResourceList title="JS Files" items={jsArr} kind="js" />
      )}

      {imgArr.length === 0 && cssArr.length === 0 && jsArr.length === 0 && (
        <AwaitingData message="Resource-level arrays are not included in this audit payload. The summary counts above are sourced from SE Ranking's aggregated page metrics." />
      )}
    </div>
  );
}

function ResourceList({ title, items, kind }: { title: string; items: any[]; kind: 'img' | 'css' | 'js' }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: '#0B1C24', marginBottom: 8 }}>{title} ({items.length})</div>
      <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #e2e8f0', background: '#F8FAFC' }}>
            <th style={{ textAlign: 'left', padding: '8px 6px', fontSize: 10, color: '#5A7A8A', fontWeight: 600, textTransform: 'uppercase' }}>URL</th>
            {kind === 'img' && <th style={{ textAlign: 'left', padding: '8px 6px', fontSize: 10, color: '#5A7A8A', fontWeight: 600, textTransform: 'uppercase' }}>Alt</th>}
            <th style={{ textAlign: 'right', padding: '8px 6px', fontSize: 10, color: '#5A7A8A', fontWeight: 600, textTransform: 'uppercase' }}>Size</th>
          </tr>
        </thead>
        <tbody>
          {items.slice(0, 50).map((it, i) => {
            const url = typeof it === 'string' ? it : (it?.url || it?.src || it?.href || '—');
            const alt = typeof it === 'object' && it ? (it.alt ?? it.alt_text ?? '') : '';
            const size = typeof it === 'object' && it ? (it.size ?? it.bytes ?? null) : null;
            const sizeKB = size != null ? Math.round(size / 1024) : null;
            return (
              <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ padding: '6px 6px', maxWidth: 520, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {typeof url === 'string' && url.startsWith('http')
                    ? <a href={url} target="_blank" rel="noreferrer" style={{ color: '#2D9CDB', textDecoration: 'none' }}>{url}</a>
                    : <span>{url}</span>}
                </td>
                {kind === 'img' && (
                  <td style={{ padding: '6px 6px', color: alt ? '#0B1C24' : '#D85A30', maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {alt || 'missing'}
                  </td>
                )}
                <td style={{ textAlign: 'right', padding: '6px 6px', color: '#5A7A8A' }}>{sizeKB != null ? `${sizeKB} KB` : '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {items.length > 50 && (
        <div style={{ fontSize: 10, color: '#94A3B8', marginTop: 6, fontStyle: 'italic' }}>
          Showing first 50 of {items.length} entries.
        </div>
      )}
    </div>
  );
}

function PageLinksTab({ page }: { page: Record<string, any> }) {
  const totalLinks = pickNum(page, ['total_links']);
  const outInternal = pickNum(page, ['outlinks_internal']);
  const outExternal = pickNum(page, ['outlinks_external']);
  const inlinks = pickNum(page, ['inlinks']);
  const inlinksFollow = pickNum(page, ['inlinks_follow']);
  const inlinksNofollow = pickNum(page, ['inlinks_nofollow']);
  const nofollowOut = pickNum(page, ['outlinks_nofollow', 'nofollow_outlinks']);

  const outlinksRaw: any[] = Array.isArray(page.outlinks) ? page.outlinks : [];
  const inlinksRaw: any[] = Array.isArray(page.inlinks_list) ? page.inlinks_list : Array.isArray(page.inlinks) && typeof page.inlinks !== 'number' ? page.inlinks : [];
  const brokenLinks: any[] = Array.isArray(page.broken_links) ? page.broken_links : [];

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 }}>
        <SummaryStat label="Total Links" value={totalLinks != null ? totalLinks.toLocaleString() : '—'} sub="outbound + inbound" color="#2D9CDB" />
        <SummaryStat label="Internal Out" value={outInternal != null ? outInternal.toLocaleString() : '—'} sub="on-site outbound" color="#1D9E75" />
        <SummaryStat label="External Out" value={outExternal != null ? outExternal.toLocaleString() : '—'} sub="off-site outbound" color="#EF6C33" />
        <SummaryStat label="Nofollow Out" value={nofollowOut != null ? nofollowOut.toLocaleString() : '—'} sub="rel='nofollow'" color="#5A7A8A" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
        <SummaryStat label="Inbound Links" value={inlinks != null ? inlinks.toLocaleString() : '—'} sub="from other pages on-site" color="#2D9CDB" />
        <SummaryStat label="Inbound Follow" value={inlinksFollow != null ? inlinksFollow.toLocaleString() : '—'} sub="authority-passing" color="#1D9E75" />
        <SummaryStat label="Inbound Nofollow" value={inlinksNofollow != null ? inlinksNofollow.toLocaleString() : '—'} sub="no authority passed" color="#5A7A8A" />
      </div>

      {outlinksRaw.length > 0 && <LinkList title="Outbound Links" items={outlinksRaw} />}
      {inlinksRaw.length > 0 && typeof inlinksRaw[0] !== 'number' && <LinkList title="Inbound Links" items={inlinksRaw} />}
      {brokenLinks.length > 0 && <LinkList title="Broken Links" items={brokenLinks} highlight />}

      {outlinksRaw.length === 0 && (typeof inlinksRaw[0] === 'number' || inlinksRaw.length === 0) && brokenLinks.length === 0 && (
        <AwaitingData message="Full link inventory per page is not included in this payload. The counts above come from SE Ranking's aggregated page metrics." />
      )}
    </div>
  );
}

function LinkList({ title, items, highlight }: { title: string; items: any[]; highlight?: boolean }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: highlight ? '#D85A30' : '#0B1C24', marginBottom: 8 }}>{title} ({items.length})</div>
      <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #e2e8f0', background: '#F8FAFC' }}>
            <th style={{ textAlign: 'left', padding: '8px 6px', fontSize: 10, color: '#5A7A8A', fontWeight: 600, textTransform: 'uppercase' }}>URL</th>
            <th style={{ textAlign: 'left', padding: '8px 6px', fontSize: 10, color: '#5A7A8A', fontWeight: 600, textTransform: 'uppercase' }}>Anchor</th>
            <th style={{ textAlign: 'center', padding: '8px 6px', fontSize: 10, color: '#5A7A8A', fontWeight: 600, textTransform: 'uppercase' }}>Type</th>
          </tr>
        </thead>
        <tbody>
          {items.slice(0, 50).map((it, i) => {
            const url = typeof it === 'string' ? it : (it?.url || it?.href || '—');
            const anchor = typeof it === 'object' && it ? (it.anchor ?? it.text ?? '') : '';
            const nofollow = typeof it === 'object' && it ? (it.nofollow === true || it.rel === 'nofollow') : false;
            const external = typeof it === 'object' && it ? it.external === true : false;
            return (
              <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ padding: '6px 6px', maxWidth: 520, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {typeof url === 'string' && url.startsWith('http')
                    ? <a href={url} target="_blank" rel="noreferrer" style={{ color: '#2D9CDB', textDecoration: 'none' }}>{url}</a>
                    : <span>{url}</span>}
                </td>
                <td style={{ padding: '6px 6px', maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#5A7A8A' }}>{anchor || '—'}</td>
                <td style={{ textAlign: 'center', padding: '6px 6px', fontSize: 10 }}>
                  {nofollow && <span style={{ color: '#5A7A8A', marginRight: 4 }}>nofollow</span>}
                  {external && <span style={{ color: '#EF6C33' }}>external</span>}
                  {!nofollow && !external && <span style={{ color: '#1D9E75' }}>follow</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {items.length > 50 && (
        <div style={{ fontSize: 10, color: '#94A3B8', marginTop: 6, fontStyle: 'italic' }}>
          Showing first 50 of {items.length} entries.
        </div>
      )}
    </div>
  );
}
