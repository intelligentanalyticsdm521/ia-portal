import React from 'react';
import { useArionContext } from '../../useArionContext';
import { useArionData } from '../../useArionData';
import { StatCard, Card, AddonUpsell, EmptyPanel, Loading, InfoCard, ConsultingUpsell } from '../../components/Ui';
import { DonutChart } from '../../components/Charts';

export function SeoSiteAudit() {
  const { selectedSite, activeSiteId, arionApi } = useArionContext();
  const [restarting, setRestarting] = React.useState(false);

  const { data: seo, loading: seoLoading } = useArionData(
    () => activeSiteId ? arionApi.getSeo(activeSiteId) : Promise.resolve(null),
    [activeSiteId]
  );

  if (seoLoading) return <Loading />;
  if (!selectedSite) return <EmptyPanel message="No ARION site selected." />;

  const s = seo as Record<string, any> | null;
  const connected = s?.connected === true;
  const hasSeoAddon = selectedSite?.seoAddonTier != null;
  const snapshot = s?.snapshot ?? {};
  const auditSections = (s?.breakdowns?.auditSections as any[]) ?? [];
  const auditTotals = s?.breakdowns?.auditTotals ?? {};

  if (!connected && !hasSeoAddon) {
    return (
      <AddonUpsell
        title="SEO Tools — Add-on not active"
        description="Run comprehensive site audits to find and fix technical SEO issues that hurt your rankings."
        price="$29"
        planName="Starter — 10 keywords"
      />
    );
  }

  const auditScore = snapshot.audit_score ?? snapshot.auditScore ?? null;
  const issuesFound = snapshot.issues_found ?? snapshot.issuesFound ?? '--';
  const pagesCrawled = snapshot.pages_crawled ?? snapshot.pagesCrawled ?? '--';

  const handleRestart = async () => {
    if (!activeSiteId) return;
    setRestarting(true);
    try {
      await arionApi.createSeoProject(activeSiteId);
    } finally {
      setRestarting(false);
    }
  };

  // Donut data for health score
  const scoreNum = typeof auditScore === 'number' ? auditScore : 0;
  const scoreColor = scoreNum >= 80 ? '#16A34A' : scoreNum >= 50 ? '#D97706' : '#DC2626';

  // Donut data for issues by severity
  const issueDonutData = [
    { label: 'Errors', value: auditTotals.errors || 0, color: '#DC2626' },
    { label: 'Warnings', value: auditTotals.warnings || 0, color: '#D97706' },
    { label: 'Notices', value: auditTotals.notices || 0, color: '#2D9CDB' },
    { label: 'Passed', value: auditTotals.passed || 0, color: '#16A34A' },
  ];

  return (
    <div>
      {connected && (
        <InfoCard title="Site Audit — Connected">
          <p style={{ margin: 0 }}>SE Ranking site audit is active.
            <button className="abtn abtn-sky" style={{ marginLeft: 12, fontSize: 11 }}
              onClick={handleRestart} disabled={restarting}>
              {restarting ? 'Restarting...' : 'Restart Audit'}
            </button>
          </p>
        </InfoCard>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginTop: connected ? 12 : 0 }}>
        {/* Health Score Gauge */}
        <Card title="Health Score" style={{ textAlign: 'center' }}>
          <div style={{ position: 'relative', width: 120, height: 120, margin: '12px auto' }}>
            <DonutChart data={[{ name: 'Score', value: scoreNum, color: scoreColor }, { name: '', value: 100 - scoreNum, color: '#E5E7EB' }]} height={120} />
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, fontWeight: 700, color: scoreColor }}>
              {auditScore ?? '--'}
            </div>
          </div>
        </Card>

        {/* Issues by Severity */}
        <Card title="Issues by Severity" style={{ textAlign: 'center' }}>
          <div style={{ width: 120, height: 120, margin: '12px auto', position: 'relative' }}>
            <DonutChart data={issueDonutData.map(d => ({ name: d.label, value: d.value, fill: d.color }))} height={120} />
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 700 }}>
              {issuesFound}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 8, fontSize: 10 }}>
            {issueDonutData.map(d => (
              <span key={d.label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: d.color, display: 'inline-block' }} />
                {d.label}: {d.value}
              </span>
            ))}
          </div>
        </Card>

        {/* Pages Crawled */}
        <Card>
          <StatCard label="Pages Crawled" value={pagesCrawled} deltaType="neutral" />
        </Card>
      </div>

      <Card title="Audit Issues by Section" style={{ marginTop: 12 }}>
        <table className="data-table">
          <thead>
            <tr><th>Section</th><th>Issue</th><th>Severity</th><th>Pages Affected</th></tr>
          </thead>
          <tbody>
            {auditSections.length > 0 ? auditSections.map((section: any, i: number) => {
              const issues = Array.isArray(section.issues) ? section.issues : [section];
              return issues.map((issue: any, j: number) => (
                <tr key={`${i}-${j}`}>
                  {j === 0 && <td rowSpan={issues.length} style={{ fontWeight: 600 }}>{section.name || section.section || '--'}</td>}
                  <td>{issue.issue ?? issue.name ?? issue.title ?? '--'}</td>
                  <td>
                    <span style={{
                      padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 600,
                      background: issue.severity === 'error' ? 'rgba(220,38,38,0.1)' : issue.severity === 'warning' ? 'rgba(217,119,6,0.1)' : 'rgba(45,156,219,0.1)',
                      color: issue.severity === 'error' ? '#DC2626' : issue.severity === 'warning' ? '#D97706' : '#2D9CDB',
                    }}>
                      {issue.severity ?? '--'}
                    </span>
                  </td>
                  <td>{issue.pages_affected ?? issue.pagesAffected ?? issue.count ?? '--'}</td>
                </tr>
              ));
            }) : (
              <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No audit issues found. Run an audit to see results.</td></tr>
            )}
          </tbody>
        </table>
      </Card>

      <ConsultingUpsell
        headline={`${auditTotals.warnings || 0} warnings found — IA's technical team resolves audit issues fast.`}
        subtext="Technical SEO fixes included with Growth and Authority SEO add-on plans."
        serviceType="SEO Strategy"
        triggerPage="seo-site-audit"
      />
    </div>
  );
}
