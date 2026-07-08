import { useArionContext } from '../../useArionContext';
import { Card, Loading, ConsultingUpsell } from '../../components/Ui';

export function SecurityFirewall() {
  const { selectedSite, loading } = useArionContext();

  if (loading) return <Loading />;
  if (!selectedSite) return <div style={{ padding: 24, color: 'var(--text-muted)' }}>No site selected.</div>;

  const blockedCountries = [
    { country: 'Russia', hits: 1842 },
    { country: 'China', hits: 1256 },
    { country: 'Brazil', hits: 734 },
    { country: 'India', hits: 512 },
    { country: 'Ukraine', hits: 389 },
  ];

  const loginAttempts = [
    { ip: '185.220.101.xx', country: 'Russia', username: 'admin', date: '--', result: 'Blocked' },
    { ip: '103.114.67.xx', country: 'China', username: 'administrator', date: '--', result: 'Blocked' },
    { ip: '45.148.10.xx', country: 'Netherlands', username: 'wp-admin', date: '--', result: 'Blocked' },
    { ip: '192.168.1.xx', country: 'United States', username: 'admin', date: '--', result: 'Blocked' },
  ];

  return (
    <div>
      <div className="two-col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Left: Top Blocked Countries */}
        <Card title="Top Blocked Countries">
          <table className="tbl">
            <thead>
              <tr>
                <th>Country</th>
                <th>Blocked Hits</th>
              </tr>
            </thead>
            <tbody>
              {blockedCountries.map((c) => (
                <tr key={c.country}>
                  <td>{c.country}</td>
                  <td>{c.hits.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        {/* Right: Recent Login Attempts */}
        <Card title="Recent Login Attempts">
          <table className="tbl">
            <thead>
              <tr>
                <th>IP</th>
                <th>Country</th>
                <th>Username</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              {loginAttempts.map((a, i) => (
                <tr key={i}>
                  <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{a.ip}</td>
                  <td>{a.country}</td>
                  <td>{a.username}</td>
                  <td><span className="badge-ia">{a.result}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      {/* Upgrade Notice */}
      <div style={{
        background: 'rgba(59,130,246,0.06)',
        border: '1px solid rgba(59,130,246,0.25)',
        borderRadius: 9,
        padding: '12px 14px',
        marginTop: 16,
        marginBottom: 12,
        color: '#3b82f6',
        fontSize: 12,
      }}>
        Upgrade to Pro for Shield Security Pro real-time rules.
      </div>

      <ConsultingUpsell
        headline="IA monitors threats 24/7"
        subtext="Advanced firewall management included with Pro+."
        serviceType="Security Remediation"
        triggerPage="security-firewall"
      />
    </div>
  );
}
