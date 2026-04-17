import { useArionContext } from '../../useArionContext';
import { useArionData } from '../../useArionData';
import {
  Card, HealthRow, Loading, EmptyPanel,
  ScoreCircle, SidebarCard, ConsultingUpsell,
} from '../../components/Ui';

export function WebsiteOverview() {
  const { selectedSite, activeSiteId, arionApi, loading } = useArionContext();
  const { data: overview, loading: ovL } = useArionData(
    () => activeSiteId ? arionApi.getOverview(activeSiteId) : Promise.resolve(null),
    [activeSiteId]
  );
  const { data: hosting, loading: hL } = useArionData(
    () => activeSiteId ? arionApi.getHosting(activeSiteId) : Promise.resolve(null),
    [activeSiteId]
  );

  if (loading || ovL || hL) return <Loading />;
  if (!selectedSite) return <EmptyPanel message="No site selected." />;

  const ov = overview as Record<string, any> | null;
  const h = (hosting as Record<string, any>) ?? {};
  const health = h.health ?? {};
  const content = h.content ?? {};
  const wpVersion = health.wordpressVersion ?? h.wordpress?.version ?? '--';
  const phpVersion = health.phpVersion ?? '--';

  return (
    <div>
      {/* ── Dashboard panels ── */}
      <div className="dash-layout">
        <div>
          {/* PageSpeed + Security side by side */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <Card title="PageSpeed Insights">
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '4px 0' }}>
                <ScoreCircle score={null} label="Desktop" />
                <div>
                  <a href="/hosting/performance" style={{ fontSize: 12, color: 'var(--arion-sky)' }}>Run speed test</a>
                </div>
              </div>
            </Card>
            <Card title="Security">
              <HealthRow status="ok" label="Website Status" value="Website is safe" />
              <HealthRow status="ok" label="SSL Certificate" value="Lifetime Certificate" />
            </Card>
          </div>

          {/* Integrations */}
          <Card title="Integrations">
            <HealthRow status={ov?.integrations?.googleSearchConsole ? 'ok' : 'warn'} label="Google Search Console" value={ov?.integrations?.googleSearchConsole ? 'Connected' : 'Not connected'} />
            <HealthRow status={ov?.integrations?.googleBusinessProfile ? 'ok' : 'warn'} label="Google Business Profile" value={ov?.integrations?.googleBusinessProfile ? 'Connected' : 'Not connected'} />
            <HealthRow status={ov?.integrations?.seRankingProject ? 'ok' : 'warn'} label="SEO (SE Ranking)" value={ov?.integrations?.seRankingProject ? 'Connected' : 'Not connected'} />
            <HealthRow status={ov?.integrations?.googleAnalytics ? 'ok' : 'warn'} label="Google Analytics" value={ov?.integrations?.googleAnalytics ? 'Connected' : 'Not connected'} />
          </Card>
        </div>

        {/* Right sidebar */}
        <div className="info-sidebar">
          <SidebarCard label="Database" value="MySQL" />
          <SidebarCard label="Daily Backup" value="Enabled" valueClass="success" />
          <SidebarCard label="PHP Version" value={String(phpVersion)} />
          <SidebarCard label="WordPress" value={String(wpVersion)} />
          <SidebarCard label="Pages" value={String(content.pages ?? '--')} />
          <SidebarCard label="Posts" value={String(content.posts ?? '--')} />
          <SidebarCard label="SSL" value="Lifetime Certificate" valueClass="success" />
        </div>
      </div>

      <ConsultingUpsell
        headline="Need a website that converts? IA builds and manages sites that grow your business."
        subtext="Full-service website strategy and management."
        serviceType="Website Strategy"
        triggerPage="website-overview"
      />
    </div>
  );
}
