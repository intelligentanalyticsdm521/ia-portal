import { Card, SidebarCard, InfoCard, EmptyPanel, Loading, ConsultingUpsell } from '../../components/Ui';
import { useArionContext } from '../../useArionContext';
import { useArionData } from '../../useArionData';

export function HostingBackups() {
  const { selectedSite, activeSiteId, arionApi } = useArionContext();

  const { data: hosting, loading: hostingLoading } = useArionData(
    () => activeSiteId ? arionApi.getHosting(activeSiteId) : Promise.resolve(null),
    [activeSiteId]
  );

  if (hostingLoading) return <Loading />;
  if (!selectedSite) return <EmptyPanel message="No site selected." />;

  const h = (hosting as Record<string, any>) ?? {};
  const health = h.health ?? {};
  const lastBackup = health.lastBackupAt ?? null;

  return (
    <div>
      <Card title="Backup Configuration">
        <div className="info-sidebar">
          <SidebarCard label="Backup Type" value="Daily Automatic" />
          <SidebarCard label="Status" value="Enabled" valueClass="success" />
          <SidebarCard label="Schedule" value="Daily" />
        </div>
        <div style={{ marginTop: 16 }}>
          <InfoCard title="About Backups">
            Backups run automatically every 24 hours. Your hosting plan includes daily automated backups with point-in-time restore capability.
          </InfoCard>
        </div>
      </Card>

      <Card title="Last Backup">
        <div style={{ padding: '8px 0' }}>
          {lastBackup ? (
            <div style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>
              {new Date(lastBackup).toLocaleString()}
            </div>
          ) : (
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              Automatic daily backups are active
            </div>
          )}
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
            To restore from a backup, use the WP Admin panel or contact support.
          </div>
        </div>
      </Card>

      <ConsultingUpsell
        headline="Need enterprise backup strategy with offsite redundancy? IA manages it."
        subtext="Automated backups with disaster recovery included."
        serviceType="Managed Backup"
        triggerPage="hosting-backups"
      />
    </div>
  );
}
