import { Card, HealthRow, InfoCard, Loading, EmptyPanel, ConsultingUpsell } from '../../components/Ui';
import { useArionContext } from '../../useArionContext';
import { useArionData } from '../../useArionData';

export function WebsiteSecurity() {
  const { selectedSite, activeSiteId, arionApi, loading } = useArionContext();

  const { data: hosting, loading: hostingLoading } = useArionData(
    () => activeSiteId ? arionApi.getHosting(activeSiteId) : Promise.resolve(null),
    [activeSiteId]
  );

  if (loading || hostingLoading) return <Loading />;
  if (!selectedSite) return <EmptyPanel message="No site selected." />;

  const h = (hosting as Record<string, any>) ?? {};
  const health = h.health ?? {};
  const wordpress = h.wordpress ?? {};
  const plugins = Array.isArray(h.plugins) ? h.plugins : [];

  const wpVersion = health.wordpressVersion ?? wordpress.version ?? '--';
  const hasPluginData = plugins.length > 0;

  return (
    <div>
      {/* WordPress Updates */}
      <Card title="WordPress Updates">
        <HealthRow status={wpVersion !== '--' ? 'ok' : 'warn'} label="WordPress Version" value={wpVersion} />
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
          WordPress updates are managed by Intelligent Analytics.
        </div>
      </Card>

      {/* Installed Plugins */}
      <Card title="Installed Plugins">
        {hasPluginData ? (
          <>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Plugin Name</th>
                  <th>Status</th>
                  <th>Source</th>
                </tr>
              </thead>
              <tbody>
                {plugins.map((p: any, i: number) => (
                  <tr key={p.slug || p.name || i}>
                    <td>{p.name || p.plugin_name || '--'}</td>
                    <td><span className="badge-ia">{p.status === 'active' ? 'Active' : p.status || 'Active'}</span></td>
                    <td>{p.source || '--'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <InfoCard title="Plugin Management">
              <p style={{ margin: 0 }}>
                Plugins are managed by Intelligent Analytics and updated during weekly maintenance windows.
              </p>
            </InfoCard>
          </>
        ) : (
          <InfoCard title="Plugin Management">
            <p style={{ margin: 0 }}>
              Plugin information is managed by Intelligent Analytics.
              Plugins are updated during weekly maintenance windows.
            </p>
          </InfoCard>
        )}
      </Card>

      {/* Security Status */}
      <Card title="Security Status">
        <HealthRow status="ok" label="SSL Certificate" value="Lifetime Certificate" />
        <HealthRow status="ok" label="HTTPS Forced" value="--" />
        <HealthRow status="ok" label="Malware Scan" value="--" />
      </Card>

      {/* Theme */}
      <Card title="Theme">
        <HealthRow status="ok" label="Active Theme" value={wordpress.theme ?? '--'} />
      </Card>

      <ConsultingUpsell
        headline="IA monitors threats 24/7 and handles security remediation."
        subtext="Security management included with all managed plans."
        serviceType="Security Remediation"
        triggerPage="website-security"
      />
    </div>
  );
}
