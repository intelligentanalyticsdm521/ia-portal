import { useArionContext } from '../../useArionContext';
import { useArionData } from '../../useArionData';
import { StatCard, Card, Loading, ErrorBanner, ConsultingUpsell } from '../../components/Ui';

export function SecurityVulnerabilities() {
  const { selectedSite, activeSiteId, arionApi, loading } = useArionContext();

  const { data: vulnData, loading: vulnLoading } = useArionData(
    () => activeSiteId ? arionApi.getVulnerabilities(activeSiteId) : Promise.resolve(null),
    [activeSiteId]
  );

  if (loading || vulnLoading) return <Loading />;
  if (!selectedSite) return <div style={{ padding: 24, color: 'var(--text-muted)' }}>No site selected.</div>;

  const v = (vulnData as Record<string, any>)?.data ?? (vulnData as Record<string, any>) ?? {};
  const vulnerabilities: any[] = Array.isArray(v.vulnerabilities) ? v.vulnerabilities : [];
  const pluginsChecked = v.plugins_checked ?? '--';
  const critical = v.critical ?? 0;
  const high = v.high ?? 0;
  const medium = v.medium ?? 0;
  const hasCriticalOrHigh = critical > 0 || high > 0;

  const severityColor = (sev: string) => {
    switch (sev?.toLowerCase()) {
      case 'critical': return { background: '#dc2626', color: '#fff' };
      case 'high': return { background: '#f59e0b', color: '#fff' };
      case 'medium': return { background: '#3b82f6', color: '#fff' };
      default: return { background: '#6b7280', color: '#fff' };
    }
  };

  return (
    <div>
      {/* Stat Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
        <StatCard label="Critical" value={critical} deltaType={critical > 0 ? 'negative' : 'neutral'} />
        <StatCard label="High" value={high} deltaType={high > 0 ? 'negative' : 'neutral'} />
        <StatCard label="Medium" value={medium} />
        <StatCard label="Plugins Checked" value={pluginsChecked} />
      </div>

      {/* Notice banner */}
      {hasCriticalOrHigh && (
        <ErrorBanner message={`${critical} critical and ${high} high severity vulnerabilities found. Immediate patching is recommended.`} />
      )}

      {/* Vulnerabilities Table */}
      <Card title="Vulnerabilities">
        {vulnerabilities.length > 0 ? (
          <table className="tbl">
            <thead>
              <tr>
                <th>Plugin</th>
                <th>Version</th>
                <th>Severity</th>
                <th>CVE</th>
                <th>Recommendation</th>
              </tr>
            </thead>
            <tbody>
              {vulnerabilities.map((vuln: any, i: number) => (
                <tr key={vuln.cve || vuln.plugin || i}>
                  <td>{vuln.plugin ?? '--'}</td>
                  <td>{vuln.version ?? '--'}</td>
                  <td>
                    <span style={{
                      ...severityColor(vuln.severity),
                      padding: '2px 8px',
                      borderRadius: 4,
                      fontSize: 11,
                      fontWeight: 600,
                    }}>
                      {vuln.severity ?? '--'}
                    </span>
                  </td>
                  <td>{vuln.cve ?? '--'}</td>
                  <td>{vuln.recommendation ?? '--'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div style={{ padding: 16, color: 'var(--text-muted)', fontSize: 13 }}>
            No vulnerabilities detected. All checked plugins are up to date.
          </div>
        )}
      </Card>

      <ConsultingUpsell
        headline="Critical vulnerabilities need immediate patching"
        subtext="IA's security team handles emergency updates."
        serviceType="Security Remediation"
        triggerPage="security-vulnerabilities"
      />
    </div>
  );
}
