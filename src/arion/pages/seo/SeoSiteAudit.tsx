import React from 'react';
import { useArionContext } from '../../useArionContext';
import { useArionData } from '../../useArionData';
import { StatCard, Card, AddonUpsell, EmptyPanel, Loading, InfoCard, ConsultingUpsell } from '../../components/Ui';
import { DonutChart } from '../../components/Charts';

/**
 * Phase 3 / Step 4.2 — uses /arion/seo/audit which auto-starts an audit
 * if none exists, and returns running/complete state explicitly.
 */
export function SeoSiteAudit() {
  const { selectedSite, activeSiteId, arionApi } = useArionContext();
  const [restarting, setRestarting] = React.useState(false);
  const [pollCount, setPollCount] = React.useState(0);

  const { data: audit, loading, refetch } = useArionData(
    () => activeSiteId ? arionApi.getSeoAudit(activeSiteId) : Promise.resolve(null),
    [activeSiteId, pollCount]
  );

  const a = audit as any;
  const status = a?.status as string | undefined;

  // If the audit is running, re-poll every 30s until complete.
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
        planName="Starter — 10 keywords"
      />
    );
  }

  // Running / unavailable states
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

  // Complete
  const auditScore = a?.healthScore ?? null;
  const issues = a?.issues ?? { errors: 0, warnings: 0, notices: 0, passed: 0 };
  const issuesFound = (issues.errors || 0) + (issues.warnings || 0) + (issues.notices || 0);
  const pagesCrawled = a?.pagesCrawled ?? '--';
  const issuesByCategory: any[] = a?.issuesByCategory || [];

  const handleRestart = async () => {
    if (!activeSiteId) return;
    setRestarting(true);
    try {
      // Trigger a fresh audit by nulling-then-fetching; simplest: increment pollCount to retry.
      await refetch();
      setPollCount(c => c + 1);
    } finally {
      setRestarting(false);
    }
  };

  const scoreNum = typeof auditScore === 'number' ? auditScore : 0;
  const scoreColor = scoreNum >= 80 ? '#1D9E75' : scoreNum >= 50 ? '#EF6C33' : '#D85A30';

  const issueDonutData = [
    { label: 'Errors', value: issues.errors || 0, color: '#D85A30' },
    { label: 'Warnings', value: issues.warnings || 0, color: '#EF6C33' },
    { label: 'Notices', value: issues.notices || 0, color: '#2D9CDB' },
    { label: 'Passed', value: issues.passed || 0, color: '#1D9E75' },
  ];

  return (
    <div>
      {connected && (
        <InfoCard title="Site Audit — Connected">
          <p style={{ margin: 0 }}>
            SE Ranking site audit is active.
            <button className="abtn abtn-sky" style={{ marginLeft: 12, fontSize: 11 }} onClick={handleRestart} disabled={restarting}>
              {restarting ? 'Restarting...' : 'Run New Audit'}
            </button>
            {a?.lastAuditDate && <span style={{ marginLeft: 12, fontSize: 11, color: 'var(--text-muted)' }}>Last audit: {new Date(a.lastAuditDate).toLocaleDateString()}</span>}
          </p>
        </InfoCard>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginTop: connected ? 12 : 0 }}>
        <Card title="Health Score" style={{ textAlign: 'center' }}>
          <div style={{ position: 'relative', width: 120, height: 120, margin: '12px auto' }}>
            <DonutChart data={[{ name: 'Score', value: scoreNum, color: scoreColor }, { name: '', value: Math.max(0, 100 - scoreNum), color: '#E5E7EB' }]} height={120} />
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, fontWeight: 700, color: scoreColor }}>
              {auditScore ?? '--'}
            </div>
          </div>
        </Card>

        <Card title="Issues by Severity" style={{ textAlign: 'center' }}>
          <div style={{ width: 120, height: 120, margin: '12px auto', position: 'relative' }}>
            <DonutChart data={issueDonutData.map(d => ({ name: d.label, value: d.value, fill: d.color }))} height={120} />
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 700 }}>
              {issuesFound}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 8, fontSize: 10, flexWrap: 'wrap' }}>
            {issueDonutData.map(d => (
              <span key={d.label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: d.color, display: 'inline-block' }} />
                {d.label}: {d.value}
              </span>
            ))}
          </div>
        </Card>

        <Card>
          <StatCard label="Pages Crawled" value={pagesCrawled} deltaType="neutral" />
        </Card>
      </div>

      <Card title="Audit Issues by Category" style={{ marginTop: 12 }}>
        <table className="data-table">
          <thead>
            <tr><th>Category</th><th>Errors</th><th>Warnings</th><th>Notices</th></tr>
          </thead>
          <tbody>
            {issuesByCategory.length > 0 ? issuesByCategory.map((c: any, i: number) => (
              <tr key={i}>
                <td style={{ fontWeight: 600 }}>{c.category}</td>
                <td style={{ color: c.errors ? '#D85A30' : 'inherit', fontWeight: c.errors ? 600 : 400 }}>{c.errors ?? 0}</td>
                <td style={{ color: c.warnings ? '#EF6C33' : 'inherit', fontWeight: c.warnings ? 600 : 400 }}>{c.warnings ?? 0}</td>
                <td>{c.notices ?? 0}</td>
              </tr>
            )) : (
              <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No audit categories yet — run a new audit to see results.</td></tr>
            )}
          </tbody>
        </table>
      </Card>

      <ConsultingUpsell
        headline={`${issues.warnings || 0} warnings found — IA's technical team resolves audit issues fast.`}
        subtext="Technical SEO fixes included with Growth and Authority SEO add-on plans."
        serviceType="SEO Strategy"
        triggerPage="seo-site-audit"
      />
    </div>
  );
}
