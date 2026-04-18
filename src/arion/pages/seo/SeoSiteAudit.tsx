/**
 * Phase 3.5 Site Audit page — visual summary + detail modal pattern.
 *
 * Summary view: health-score gauge, issues-by-severity donut, key stats,
 * severity-bar breakdown. "More Details" button opens a modal with the
 * full issue-list / crawled-pages / resources / links breakdowns (empty
 * for now until the /audit/{id}/issues sub-path is confirmed in diagnostic).
 */
import React from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar as RBar, XAxis, YAxis, Tooltip as RTooltip } from 'recharts';
import { useArionContext } from '../../useArionContext';
import { useArionData } from '../../useArionData';
import { Card, AddonUpsell, EmptyPanel, Loading, InfoCard, ConsultingUpsell, ErrorBanner } from '../../components/Ui';
import { SeoStatCard } from '../../components/SeoUi';
import { GlossaryIcon, GlossaryPanel } from '../../components/Glossary';

export function SeoSiteAudit() {
  const { selectedSite, activeSiteId, arionApi } = useArionContext();
  const [restarting, setRestarting] = React.useState(false);
  const [pollCount, setPollCount] = React.useState(0);
  const [showDetails, setShowDetails] = React.useState(false);

  const { data: audit, loading, refetch } = useArionData(
    () => activeSiteId ? arionApi.getSeoAudit(activeSiteId) : Promise.resolve(null),
    [activeSiteId, pollCount]
  );

  const a = audit as any;
  const status = a?.status as string | undefined;

  React.useEffect(() => {
    if (status !== 'running') return;
    const t = setTimeout(() => setPollCount(c => c + 1), 30000);
    return () => clearTimeout(t);
  }, [status, pollCount]);

  if (loading && pollCount === 0) return <Loading />;
  if (!selectedSite) return <EmptyPanel message="No ARION site selected." />;

  const hasSeoAddon = selectedSite?.seoAddonTier != null;
  const connected = a?.connected === true;

  if (!connected && !hasSeoAddon) {
    return (
      <AddonUpsell
        title="SEO Tools — Add-on not active"
        description="Run comprehensive site audits to find and fix technical SEO issues that hurt your rankings."
        price="$29"
        planName="Starter — 5 keywords"
      />
    );
  }

  // Running state
  if (status === 'running') {
    return (
      <div>
        <InfoCard title="Site Audit — In Progress">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 18, height: 18, border: '3px solid #2D9CDB', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
            <span>SE Ranking is crawling your site. This typically takes 2–5 minutes. Page will refresh automatically when complete.</span>
          </div>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </InfoCard>
      </div>
    );
  }
  if (status === 'unavailable') {
    return (
      <div>
        <InfoCard title="Site Audit — Unavailable">
          <p style={{ margin: 0 }}>{a?.message || 'Unable to start audit right now. Please try again in a few minutes.'}</p>
          <button className="abtn abtn-sky" style={{ marginTop: 10, fontSize: 11 }} onClick={() => setPollCount(c => c + 1)}>Retry</button>
        </InfoCard>
      </div>
    );
  }
  if (!connected) {
    return <ErrorBanner message="SE Ranking is not connected for this site yet. Run diagnostics from the Keyword Rankings page." />;
  }

  const healthScore = a?.healthScore ?? 0;
  const issues = a?.issues ?? { errors: 0, warnings: 0, notices: 0, passed: 0 };
  const totalIssues = (issues.errors || 0) + (issues.warnings || 0) + (issues.notices || 0);
  const pagesCrawled = a?.pagesCrawled ?? '—';
  const lastAuditDate = a?.lastAuditDate ? new Date(a.lastAuditDate).toLocaleDateString() : null;

  const scoreColor = healthScore >= 80 ? '#1D9E75' : healthScore >= 50 ? '#EF6C33' : '#D85A30';
  const scoreLabel = healthScore >= 80 ? 'Strong' : healthScore >= 50 ? 'Needs Attention' : 'At Risk';

  const handleRestart = async () => {
    if (!activeSiteId) return;
    setRestarting(true);
    try {
      await refetch();
      setPollCount(c => c + 1);
    } finally {
      setRestarting(false);
    }
  };

  const severityDonutData = [
    { name: 'Errors', value: issues.errors || 0, color: '#D85A30' },
    { name: 'Warnings', value: issues.warnings || 0, color: '#EF6C33' },
    { name: 'Notices', value: issues.notices || 0, color: '#2D9CDB' },
    { name: 'Passed', value: issues.passed || 0, color: '#1D9E75' },
  ];

  const severityBarData = [
    { name: 'Errors', value: issues.errors || 0, color: '#D85A30' },
    { name: 'Warnings', value: issues.warnings || 0, color: '#EF6C33' },
    { name: 'Notices', value: issues.notices || 0, color: '#2D9CDB' },
    { name: 'Passed', value: issues.passed || 0, color: '#1D9E75' },
  ];

  return (
    <div>
      {/* Connected banner with Run New Audit + See Details */}
      <InfoCard title="Site Audit — Connected">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <p style={{ margin: 0, fontSize: 12 }}>
            SE Ranking site audit is active.
            {lastAuditDate && <span style={{ marginLeft: 10, color: 'var(--color-text-tertiary, #5A7A8A)' }}>Last audit: {lastAuditDate}</span>}
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={handleRestart}
              disabled={restarting}
              style={{ padding: '6px 14px', fontSize: 12, fontWeight: 600, background: 'transparent', color: '#2D9CDB', border: '1px solid #2D9CDB', borderRadius: 6, cursor: restarting ? 'wait' : 'pointer' }}
            >
              {restarting ? 'Restarting…' : 'Run New Audit'}
            </button>
            <button
              onClick={() => setShowDetails(true)}
              style={{ padding: '6px 16px', fontSize: 12, fontWeight: 600, background: '#0B1C24', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}
            >
              See Full Details →
            </button>
          </div>
        </div>
      </InfoCard>

      {/* Row 1: 4 hero stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
        <SeoStatCard termKey="health_score" label="Health Score" value={`${healthScore}`} sub={scoreLabel} accent={scoreColor} />
        <SeoStatCard label="Total Issues" value={totalIssues} sub="across all severities" accent="#EF6C33" />
        <SeoStatCard label="Pages Crawled" value={pagesCrawled} sub="from this audit" accent="#2D9CDB" />
        <SeoStatCard label="Passed Checks" value={issues.passed || 0} sub="healthy pages" accent="#1D9E75" />
      </div>

      {/* Row 2: Health gauge + Severity donut side by side */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <Card title="Health Score">
          <div style={{ position: 'relative', width: 200, height: 200, margin: '8px auto' }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={[
                    { name: 'Score', value: healthScore, color: scoreColor },
                    { name: 'Gap', value: Math.max(0, 100 - healthScore), color: '#E5E7EB' },
                  ]}
                  dataKey="value"
                  innerRadius={68}
                  outerRadius={92}
                  startAngle={90}
                  endAngle={-270}
                  stroke="none"
                >
                  <Cell fill={scoreColor} />
                  <Cell fill="#E5E7EB" />
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ fontSize: 42, fontWeight: 700, color: scoreColor, lineHeight: 1 }}>{healthScore}</div>
              <div style={{ fontSize: 11, color: scoreColor, fontWeight: 600, marginTop: 4 }}>{scoreLabel}</div>
            </div>
          </div>
          <div style={{ fontSize: 11, color: '#5A7A8A', textAlign: 'center', marginTop: 6, padding: '0 20px' }}>
            <GlossaryIcon termKey="health_score" /> Percentage of audit checks your site passes
          </div>
        </Card>

        <Card title="Issues by Severity">
          <div style={{ position: 'relative', width: 200, height: 200, margin: '8px auto' }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={severityDonutData}
                  dataKey="value"
                  innerRadius={60}
                  outerRadius={92}
                  paddingAngle={2}
                  stroke="none"
                >
                  {severityDonutData.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Pie>
                <RTooltip contentStyle={{ fontSize: 11, borderRadius: 6 }} />
              </PieChart>
            </ResponsiveContainer>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
              <div style={{ fontSize: 26, fontWeight: 700, color: '#0B1C24' }}>{totalIssues}</div>
              <div style={{ fontSize: 10, color: '#5A7A8A', textTransform: 'uppercase', letterSpacing: 0.5 }}>Issues</div>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 14, flexWrap: 'wrap', marginTop: 10, fontSize: 10 }}>
            {severityDonutData.map(d => (
              <span key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: d.color, display: 'inline-block' }} />
                <span style={{ color: '#0B1C24', fontWeight: 600 }}>{d.name}:</span>
                <span style={{ color: '#5A7A8A' }}>{d.value}</span>
              </span>
            ))}
          </div>
        </Card>
      </div>

      {/* Row 3: Severity horizontal bar chart */}
      <Card title="Severity breakdown" style={{ marginBottom: 16 }}>
        <div style={{ height: 180, paddingTop: 4 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={severityBarData} layout="vertical" margin={{ top: 4, right: 40, bottom: 4, left: 8 }} barCategoryGap={10}>
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: '#5A7A8A' }} width={100} tickLine={false} axisLine={false} />
              <RTooltip contentStyle={{ fontSize: 11, borderRadius: 6 }} />
              <RBar dataKey="value" radius={[0, 4, 4, 0]} label={{ position: 'right', fontSize: 11, fill: '#0B1C24', fontWeight: 600 }}>
                {severityBarData.map((d, i) => <Cell key={i} fill={d.color} />)}
              </RBar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Row 4: Placeholder card for "What to fix first" — populated once
          audit-issues detail endpoint is confirmed via diagnostic. */}
      <Card title="What to fix first" style={{ marginBottom: 16 }}>
        {(a?.issuesByCategory?.length ?? 0) === 0 ? (
          <div style={{ padding: '16px 4px', color: '#5A7A8A', fontSize: 13, lineHeight: 1.6 }}>
            Category-level breakdown (broken links, missing meta descriptions, duplicate titles, thin content, slow pages) is a Phase 4 add-on. The issue-detail endpoint was probed in this round's diagnostic — the Site Audit detail modal will light up automatically once the correct SE Ranking path is confirmed. For now, use <strong>Run New Audit</strong> to refresh the counts and <strong>See Full Details</strong> to export the current summary.
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Category</th>
                <th style={{ textAlign: 'right' }}>Errors</th>
                <th style={{ textAlign: 'right' }}>Warnings</th>
                <th style={{ textAlign: 'right' }}>Notices</th>
              </tr>
            </thead>
            <tbody>
              {(a?.issuesByCategory ?? []).map((c: any, i: number) => (
                <tr key={i}>
                  <td style={{ fontWeight: 600 }}>{c.category}</td>
                  <td style={{ textAlign: 'right', color: c.errors ? '#D85A30' : 'inherit', fontWeight: c.errors ? 600 : 400 }}>{c.errors ?? 0}</td>
                  <td style={{ textAlign: 'right', color: c.warnings ? '#EF6C33' : 'inherit', fontWeight: c.warnings ? 600 : 400 }}>{c.warnings ?? 0}</td>
                  <td style={{ textAlign: 'right' }}>{c.notices ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <GlossaryPanel termKeys={['health_score', 'core_web_vitals']} title="What do these audit terms mean?" />

      <ConsultingUpsell
        headline={`${issues.warnings || 0} warnings found — IA's technical team resolves audit issues fast.`}
        subtext="Technical SEO fixes included with Growth and Authority SEO add-on plans."
        serviceType="SEO Strategy"
        triggerPage="seo-site-audit"
      />

      {showDetails && (
        <SeoSiteAuditDetailsModal audit={a} onClose={() => setShowDetails(false)} />
      )}
    </div>
  );
}

/* ───────── Full-details modal ───────── */

function SeoSiteAuditDetailsModal({ audit, onClose }: { audit: any; onClose: () => void }) {
  const [tab, setTab] = React.useState<'issues' | 'pages' | 'resources' | 'links'>('issues');
  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
      onClick={onClose}
    >
      <div
        style={{ background: '#fff', borderRadius: 12, maxWidth: 1100, width: '92vw', maxHeight: '88vh', display: 'flex', flexDirection: 'column' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ padding: '16px 24px', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 11, color: '#5A7A8A', textTransform: 'uppercase', letterSpacing: 0.5 }}>Site Audit — Full Details</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#0B1C24', marginTop: 2 }}>
              {audit?.pagesCrawled} pages crawled · {(audit?.issues?.errors || 0) + (audit?.issues?.warnings || 0) + (audit?.issues?.notices || 0)} issues
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', color: '#999', padding: '0 4px' }}>&times;</button>
        </div>

        <div style={{ padding: '0 24px', borderBottom: '1px solid #eef2f5', display: 'flex', gap: 0 }}>
          {(['issues', 'pages', 'resources', 'links'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                padding: '10px 14px',
                fontSize: 12,
                fontWeight: tab === t ? 600 : 400,
                background: 'none',
                border: 'none',
                borderBottom: tab === t ? '2px solid #2D9CDB' : '2px solid transparent',
                color: tab === t ? '#2D9CDB' : '#5A7A8A',
                textTransform: 'capitalize',
                cursor: 'pointer',
              }}
            >
              {t === 'issues' ? 'Issue Report' : t === 'pages' ? 'Crawled Pages' : t === 'resources' ? 'Found Resources' : 'Found Links'}
            </button>
          ))}
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
          <div style={{ padding: 24, background: '#F8FAFC', borderRadius: 8, textAlign: 'center', color: '#5A7A8A', fontSize: 13, lineHeight: 1.6 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#0B1C24', marginBottom: 6 }}>Detail data coming soon</div>
            <p style={{ margin: '0 auto', maxWidth: 520 }}>
              The SE Ranking audit-detail endpoint (for per-category issue lists, crawled-page URLs, resource types, and discovered links) is being confirmed. This deploy includes a round of probes — once the correct path is identified in the next diagnostic run, all four tabs will populate automatically without a UI change.
            </p>
            <p style={{ margin: '10px auto 0', maxWidth: 520, fontSize: 12, color: '#94A3B8' }}>
              Current audit summary: {audit?.issues?.errors ?? 0} errors · {audit?.issues?.warnings ?? 0} warnings · {audit?.issues?.notices ?? 0} notices · {audit?.issues?.passed ?? 0} passed
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
