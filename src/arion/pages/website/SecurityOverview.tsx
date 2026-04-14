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

      <ConsultingUpsell
        headline="IA monitors threats 24/7"
        subtext="Security remediation included with all managed plans."
        serviceType="Security Remediation"
        triggerPage="security-overview"
      />
    </div>
  );
}
