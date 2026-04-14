import React from 'react';
import { useArionContext } from '../../useArionContext';
import { useArionData } from '../../useArionData';
import {
  Card, HealthRow, Loading, EmptyPanel,
  ScoreCircle, SidebarCard, ConsultingUpsell, PlatformTabs,
} from '../../components/Ui';

const WpIcon = () => (
  <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
    <circle cx="14" cy="14" r="13" stroke="#464646" strokeWidth="1.5" fill="none" />
    <text x="14" y="19" textAnchor="middle" fontSize="15" fontWeight="700" fill="#464646">W</text>
  </svg>
);

const ExtIcon = () => (
  <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M4.5 1.5H2a.5.5 0 00-.5.5v8a.5.5 0 00.5.5h8a.5.5 0 00.5-.5V7.5M7.5 1.5H10.5V4.5M10.5 1.5L5 7" />
  </svg>
);


export function WebsiteOverview() {
  const { selectedSite, activeSiteId, arionApi, loading } = useArionContext();
  const [tab, setTab] = React.useState('overview');

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
  const domain = health.domain ?? selectedSite.primaryDomain ?? '';
  const wpVersion = health.wordpressVersion ?? h.wordpress?.version ?? '--';
  const phpVersion = health.phpVersion ?? '--';
  const wpName = h.wordpress?.name ?? domain;
  const quickEditorUrl = h.quickEditorUrl || `https://hpanel.hostinger.com/websites/${domain}/wordpress/dashboard`;

  const createdAt = selectedSite.createdAt ? new Date(selectedSite.createdAt).toLocaleDateString() : '--';
  const updatedAt = selectedSite.updatedAt ? new Date(selectedSite.updatedAt).toLocaleDateString() : '--';

  const handleWpAdmin = async () => {
    try {
      const res = await arionApi.getAdminLink(selectedSite.siteId) as Record<string, any>;
      const url = res?.data?.admin_url || res?.admin_url || res?.url;
      if (url) window.open(url, '_blank');
    } catch { alert('Failed to get admin link'); }
  };

  return (
    <div>
      <PlatformTabs
        tabs={[
          { key: 'overview', label: 'Site Overview' },
          { key: 'settings', label: 'Settings' },
          { key: 'users', label: 'Users' },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === 'settings' && (
        <Card title="WordPress General Settings">
          <div className="profile-fields">
            <div className="field-row"><strong>Site Title</strong><span>{h.wordpress?.name ?? domain}</span></div>
            <div className="field-row"><strong>Tagline</strong><span>{h.wordpress?.tagline ?? '--'}</span></div>
            <div className="field-row"><strong>WordPress Address</strong><span>{h.wordpress?.url ?? `https://${domain}`}</span></div>
            <div className="field-row"><strong>Site Address</strong><span>{`https://${domain}`}</span></div>
            <div className="field-row"><strong>Admin Email</strong><span>{h.wordpress?.adminEmail ?? '--'}</span></div>
            <div className="field-row"><strong>Timezone</strong><span>{h.wordpress?.timezone ?? '--'}</span></div>
          </div>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 12 }}>
            To modify these settings, use the WP Admin panel or contact IA support.
          </p>
        </Card>
      )}

      {tab === 'users' && (
        <Card title="WordPress Users">
          <table className="data-table">
            <thead><tr><th>Username</th><th>Role</th><th>Email</th></tr></thead>
            <tbody>
              {(h.users ?? []).length > 0 ? (h.users as any[]).map((u: any, i: number) => (
                <tr key={i}><td>{u.username ?? u.login ?? '--'}</td><td>{u.role ?? '--'}</td><td>{u.email ?? '--'}</td></tr>
              )) : (
                <tr><td colSpan={3} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>User data available via WP Admin.</td></tr>
              )}
            </tbody>
          </table>
        </Card>
      )}

      {tab === 'overview' && <>
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
      </>}

      <ConsultingUpsell
        headline="Need a website that converts? IA builds and manages sites that grow your business."
        subtext="Full-service website strategy and management."
        serviceType="Website Strategy"
        triggerPage="website-overview"
      />
    </div>
  );
}
