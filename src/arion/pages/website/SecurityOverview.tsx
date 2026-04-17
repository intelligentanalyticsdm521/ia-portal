import { useArionContext } from '../../useArionContext';
import { Card, HealthRow, Loading, ConsultingUpsell } from '../../components/Ui';

export function SecurityOverview() {
  const { selectedSite, activeSiteId, arionApi, loading } = useArionContext();

  if (loading) return <Loading />;
  if (!selectedSite) return <div style={{ padding: 24, color: 'var(--text-muted)' }}>No site selected.</div>;

  const handleRunScan = async () => {
    try {
      await arionApi.submitRequest(activeSiteId!, 'security_scan', 'Triggered from ARION portal');
      alert('Security scan requested. You will be notified when it completes.');
    } catch {
      alert('Failed to request security scan.');
    }
  };

  return (
    <div>
      <div className="two-col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Left: Scan Results */}
        <Card title="Scan Results">
          <HealthRow status="ok" label="Last Scan" value="--" />
          <HealthRow status="ok" label="Threats Blocked" value="0" />
          <HealthRow status="ok" label="File Issues" value="None detected" />
          <div style={{ marginTop: 12 }}>
            <button className="btn-ia" onClick={handleRunScan}>Run Scan Now</button>
          </div>
        </Card>

        {/* Right: Login Security */}
        <Card title="Login Security">
          <HealthRow status="ok" label="2FA Status" value="Enabled" />
          <HealthRow status="ok" label="Brute Force Protection" value="Active" />
          <HealthRow status="ok" label="Top Blocked IP" value="--" />
        </Card>
      </div>

      {/* Firewall data (merged from Security: Firewall page) */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 12 }}>
        <Card title="Top Blocked Countries">
          <table className="tbl">
            <thead><tr><th>Country</th><th>Blocked Hits</th></tr></thead>
            <tbody>
              {[{country:'Russia',hits:1247},{country:'China',hits:893},{country:'Brazil',hits:421},{country:'India',hits:287},{country:'Ukraine',hits:156}].map(c => (
                <tr key={c.country}><td>{c.country}</td><td>{c.hits.toLocaleString()}</td></tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card title="Recent Login Attempts">
          <table className="tbl">
            <thead><tr><th>IP</th><th>Username</th><th>Result</th></tr></thead>
            <tbody>
              {[{ip:'185.234.xx.xx',user:'admin',result:'Blocked'},{ip:'103.89.xx.xx',user:'administrator',result:'Blocked'},{ip:'45.155.xx.xx',user:'root',result:'Blocked'}].map((a,i) => (
                <tr key={i}><td style={{fontFamily:'monospace',fontSize:12}}>{a.ip}</td><td>{a.user}</td><td><span className="badge-ia">{a.result}</span></td></tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      <ConsultingUpsell
        headline="IA monitors threats 24/7"
        subtext="Security remediation included with all managed plans."
        serviceType="Security Remediation"
        triggerPage="security-overview"
      />
    </div>
  );
}
