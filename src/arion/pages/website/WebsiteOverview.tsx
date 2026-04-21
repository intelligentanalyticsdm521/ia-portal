import React, { useMemo } from 'react';
import { useArionContext } from '../../useArionContext';
import { useArionData } from '../../useArionData';
import {
  Card, HealthRow, Loading, EmptyPanel,
  SidebarCard, ConsultingUpsell,
} from '../../components/Ui';
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts';

/**
 * Website overview — the "home" page for the Website section. Snapshots
 * everything a client (or IA staff) needs at a glance: plugin connection,
 * core versions, pending updates, security posture summary, integration
 * status, recent events, server environment, plugin inventory breakdown.
 * Deep-dive links go to dedicated subpages.
 */
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
  const { data: pluginStatusEnv, loading: psL } = useArionData(
    () => activeSiteId ? arionApi.getPluginStatus(activeSiteId) : Promise.resolve(null),
    [activeSiteId]
  );
  const { data: updatesEnv, loading: upL } = useArionData(
    () => activeSiteId ? arionApi.getPluginUpdates(activeSiteId) : Promise.resolve(null),
    [activeSiteId]
  );
  const { data: secEnv, loading: secL } = useArionData(
    () => activeSiteId ? arionApi.getPluginSecurity(activeSiteId) : Promise.resolve(null),
    [activeSiteId]
  );
  const { data: eventsEnv, loading: evL } = useArionData(
    () => activeSiteId ? arionApi.getPluginSecurityEvents(activeSiteId, 10) : Promise.resolve(null),
    [activeSiteId]
  );
  const { data: perfEnv, loading: perfL } = useArionData(
    () => activeSiteId ? arionApi.getPluginPerformance(activeSiteId) : Promise.resolve(null),
    [activeSiteId]
  );
  const { data: pluginInv, loading: pluginInvL } = useArionData(
    () => activeSiteId ? arionApi.getPluginPlugins(activeSiteId) : Promise.resolve(null),
    [activeSiteId]
  );

  const plugins: any[] = useMemo(() => (pluginInv as any)?.data || [], [pluginInv]);
  const pluginBreakdown = useMemo(() => {
    const total = plugins.length;
    const active = plugins.filter((p) => p.active).length;
    const outdated = plugins.filter((p) => p.update_available).length;
    const outdatedActive = plugins.filter((p) => p.active && p.update_available).length;
    const inactive = total - active;
    return { total, active, inactive, outdated, outdatedActive };
  }, [plugins]);

  if (loading || ovL || hL) return <Loading />;
  if (!selectedSite) return <EmptyPanel message="No site selected." />;

  const ov = overview as Record<string, any> | null;
  const h = (hosting as Record<string, any>) ?? {};
  const health = h.health ?? {};
  const content = h.content ?? {};

  const pluginStatus = (pluginStatusEnv as any)?.plugin_status || 'unknown';
  const pluginConnected = pluginStatus === 'connected';
  const pluginData = (pluginStatusEnv as any)?.data || {};

  const updates = (updatesEnv as any)?.data || null;
  const totalUpdates = (updates?.plugin_update_count || 0) + (updates?.theme_update_count || 0) + (updates?.core_update ? 1 : 0);

  const secData = (secEnv as any)?.data || {};
  const wf = secData.wordfence || null;
  const core = secData.core_health || null;

  const perfData = (perfEnv as any)?.data || {};
  const srv = perfData.server || null;
  const cron = perfData.cron || null;
  const ls = perfData.litespeed || null;

  const recentEvents = (eventsEnv as any)?.data?.events || [];

  // Derive phpVersion / wpVersion from plugin data if available, else fall back to hosting
  const wpVersion = srv?.wp_version || pluginData?.last_health_check?.wp_version || health.wordpressVersion || h.wordpress?.version || '—';
  const phpVersion = srv?.php_version || pluginData?.last_health_check?.php_version || health.phpVersion || '—';

  // Pie chart data for plugin inventory
  const pieData = [
    { name: 'Up to date', value: Math.max(0, pluginBreakdown.active - pluginBreakdown.outdatedActive), color: '#1D9E75' },
    { name: 'Needs update', value: pluginBreakdown.outdatedActive, color: '#D97706' },
    { name: 'Inactive', value: pluginBreakdown.inactive, color: '#94A3B8' },
  ].filter((d) => d.value > 0);

  return (
    <div>
      {/* Plugin-not-reachable banner — shown only when we have a problem */}
      {!pluginConnected && (
        <div style={{
          background: '#FEF3C7', borderLeft: '4px solid #D97706',
          padding: '10px 14px', marginBottom: 14, borderRadius: 4, fontSize: 13,
        }}>
          <strong style={{ color: '#78350F' }}>⚠ IA Plugin not reachable</strong>
          <span style={{ marginLeft: 10, color: '#0B1C24', fontSize: 12 }}>
            ARION can't currently reach the plugin on this site. Some live data will fall back to the most recent snapshot.
          </span>
        </div>
      )}

      {/* Top stats row — big numbers clients care about */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 14 }}>
        <StatTile
          label="Pending updates"
          value={upL ? '…' : totalUpdates}
          tone={totalUpdates > 0 ? 'warn' : 'ok'}
          href="/app/services/arion_website_updates"
          linkLabel="Review updates →"
        />
        <StatTile
          label="Critical site-health issues"
          value={secL ? '…' : (core?.critical_count ?? '—')}
          tone={core?.critical_count > 0 ? 'err' : 'ok'}
          href="/app/services/arion_website_security_overview"
          linkLabel="Open security →"
        />
        <StatTile
          label="Blocked attacks (24h)"
          value={secL ? '…' : (wf?.installed ? wf.blocked_attacks_24h ?? 0 : '—')}
          tone={wf?.blocked_attacks_24h > 100 ? 'warn' : 'ok'}
          href="/app/services/arion_website_security_overview"
          linkLabel="Security events →"
        />
        <StatTile
          label="Published content"
          value={String(content.posts ?? 0)}
          tone="ok"
          sub={`${content.pages ?? 0} pages`}
        />
      </div>

      {/* NEW: Plugin inventory breakdown + pending updates bar */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
        <Card title="Plugin inventory">
          {pluginInvL ? (
            <div style={{ padding: 20, color: '#5A7A8A', fontSize: 12 }}>Loading plugin list…</div>
          ) : plugins.length === 0 ? (
            <Empty message="No plugin inventory available." />
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
              <div style={{ width: 140, height: 140 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={35} outerRadius={60} paddingAngle={2}>
                      {pieData.map((d, i) => <Cell key={i} fill={d.color} />)}
                    </Pie>
                    <Tooltip contentStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div style={{ flex: 1, fontSize: 12 }}>
                <div style={{ fontSize: 11, color: '#5A7A8A', marginBottom: 8 }}>
                  {pluginBreakdown.total} plugins installed
                </div>
                {pieData.map((d) => (
                  <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0' }}>
                    <span style={{ width: 10, height: 10, background: d.color, borderRadius: 2, flexShrink: 0 }} />
                    <span style={{ flex: 1 }}>{d.name}</span>
                    <strong>{d.value}</strong>
                  </div>
                ))}
                <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid #eef2f5' }}>
                  <a href="/app/services/arion_website_updates" style={{ fontSize: 11, color: 'var(--arion-sky)' }}>Manage plugins →</a>
                </div>
              </div>
            </div>
          )}
        </Card>

        <Card title="Update backlog">
          {upL ? (
            <div style={{ padding: 20, color: '#5A7A8A', fontSize: 12 }}>Loading…</div>
          ) : (
            <>
              <div style={{ height: 140 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={[
                      { name: 'Plugins', count: updates?.plugin_update_count || 0 },
                      { name: 'Themes', count: updates?.theme_update_count || 0 },
                      { name: 'Core', count: updates?.core_update ? 1 : 0 },
                    ]}
                    margin={{ top: 5, right: 15, left: 0, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5EEF2" />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#5A7A8A' }} />
                    <YAxis tick={{ fontSize: 11, fill: '#5A7A8A' }} allowDecimals={false} />
                    <Tooltip contentStyle={{ fontSize: 11 }} />
                    <Bar dataKey="count" fill="#0284c7" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div style={{ marginTop: 8, fontSize: 11, color: '#5A7A8A', textAlign: 'right' }}>
                <a href="/app/services/arion_website_updates" style={{ color: 'var(--arion-sky)' }}>Review all updates →</a>
              </div>
            </>
          )}
        </Card>
      </div>

      <div className="dash-layout">
        <div>
          {/* Security posture + Integrations */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <Card title="Security posture">
              {secL ? (
                <div style={{ padding: 10, color: '#5A7A8A', fontSize: 12 }}>Loading…</div>
              ) : !pluginConnected ? (
                <Empty message="Plugin not reachable — connect to see live security status." />
              ) : (
                <div>
                  <HealthRow status={wf?.firewall_enabled ? 'ok' : wf?.installed ? 'err' : 'warn'} label="Wordfence firewall" value={wf?.installed ? (wf.firewall_enabled ? 'Active' : 'Disabled') : 'Not installed'} />
                  <HealthRow status={wf?.scan_status === 'completed' ? 'ok' : 'warn'} label="Latest malware scan" value={wf?.last_scan_at ? new Date(wf.last_scan_at).toLocaleDateString() : 'Never'} />
                  <HealthRow status={core?.critical_count === 0 ? 'ok' : 'err'} label="WP Site Health critical" value={core?.critical_count ?? '—'} />
                  <HealthRow status={core?.recommended_count === 0 ? 'ok' : 'warn'} label="WP Site Health recommended" value={core?.recommended_count ?? '—'} />
                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #eef2f5', textAlign: 'right' }}>
                    <a href="/app/services/arion_website_security_overview" style={{ fontSize: 12, color: 'var(--arion-sky)' }}>View full security →</a>
                  </div>
                </div>
              )}
            </Card>

            <Card title="Integrations">
              <HealthRow status={ov?.integrations?.googleSearchConsole ? 'ok' : 'warn'} label="Google Search Console" value={ov?.integrations?.googleSearchConsole ? 'Connected' : 'Not connected'} />
              <HealthRow status={ov?.integrations?.googleBusinessProfile ? 'ok' : 'warn'} label="Google Business Profile" value={ov?.integrations?.googleBusinessProfile ? 'Connected' : 'Not connected'} />
              <HealthRow status={ov?.integrations?.seRankingProject ? 'ok' : 'warn'} label="SEO (SE Ranking)" value={ov?.integrations?.seRankingProject ? 'Connected' : 'Not connected'} />
              <HealthRow status={ov?.integrations?.googleAnalytics ? 'ok' : 'warn'} label="Google Analytics" value={ov?.integrations?.googleAnalytics ? 'Connected' : 'Not connected'} />
              <HealthRow status={ov?.integrations?.bingWebmaster ? 'ok' : 'warn'} label="Bing Webmaster Tools" value={ov?.integrations?.bingWebmaster ? 'Connected' : 'Not connected'} />
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #eef2f5', textAlign: 'right' }}>
                <a href="/app/settings?tab=Connected%20Accounts" style={{ fontSize: 12, color: 'var(--arion-sky)' }}>Manage connected accounts →</a>
              </div>
            </Card>
          </div>

          {/* Server environment + WP cron (moved here from CWV page) */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <Card title="Server environment">
              {perfL ? (
                <div style={{ padding: 10, color: '#5A7A8A', fontSize: 12 }}>Loading…</div>
              ) : !srv ? (
                <Empty message="Server info unavailable — plugin not reachable." />
              ) : (
                <div>
                  <HealthRow status="ok" label="PHP version" value={srv.php_version} />
                  <HealthRow status="ok" label="MySQL version" value={srv.mysql_version || '—'} />
                  <HealthRow status="ok" label="WordPress version" value={srv.wp_version} />
                  <HealthRow status={srv.ssl_enabled ? 'ok' : 'err'} label="SSL" value={srv.ssl_enabled ? 'Enabled' : 'Disabled'} />
                  <HealthRow status={srv.opcache_enabled ? 'ok' : 'warn'} label="OPcache" value={srv.opcache_enabled ? 'Enabled' : 'Disabled'} />
                  <HealthRow status="ok" label="Memory limit" value={srv.memory_limit} />
                  <HealthRow status="ok" label="Upload max" value={srv.upload_max_size} />
                  {srv.wp_debug && <HealthRow status="warn" label="WP_DEBUG" value="Enabled (disable in production)" />}
                </div>
              )}
            </Card>

            <Card title="Background tasks (WP cron)">
              {perfL ? (
                <div style={{ padding: 10, color: '#5A7A8A', fontSize: 12 }}>Loading…</div>
              ) : !cron ? (
                <Empty message="Cron info unavailable." />
              ) : (
                <div>
                  <HealthRow status="ok" label="Queued events" value={cron.queued_events?.toLocaleString() ?? '0'} />
                  <HealthRow status={cron.overdue_events > 0 ? 'warn' : 'ok'} label="Overdue events (>1h)" value={cron.overdue_events ?? 0} />
                  <HealthRow status={cron.disabled ? 'warn' : 'ok'} label="WP_CRON disabled" value={cron.disabled ? 'Yes' : 'No'} />
                  {ls?.installed && (
                    <>
                      <HealthRow status={ls.cache_enabled ? 'ok' : 'warn'} label="Page cache" value={ls.cache_enabled ? 'Enabled' : 'Disabled'} />
                      <HealthRow status={ls.object_cache ? 'ok' : 'warn'} label="Object cache" value={ls.object_cache ? 'Enabled' : 'Disabled'} />
                    </>
                  )}
                  {cron.overdue_events > 0 && (
                    <div style={{ marginTop: 10, padding: 10, background: '#FEF3C7', fontSize: 11, color: '#78350F', borderRadius: 4 }}>
                      {cron.overdue_events} stuck events — may indicate cron is not firing.
                    </div>
                  )}
                </div>
              )}
            </Card>
          </div>

          {/* Recent security events timeline (compact) */}
          <Card title="Recent activity">
            {evL ? (
              <div style={{ padding: 8, color: '#5A7A8A', fontSize: 12 }}>Loading…</div>
            ) : recentEvents.length === 0 ? (
              <Empty message="No plugin-reported events yet. Publishing content, activating plugins, or Wordfence alerts will appear here." />
            ) : (
              <div>
                {recentEvents.slice(0, 8).map((e: any) => (
                  <div key={e.event_id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '6px 0', borderBottom: '1px solid #f5f5f5' }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span style={{
                        fontSize: 9, fontWeight: 600, padding: '1px 6px', borderRadius: 3,
                        background: e.severity === 'critical' ? '#FEF2F2' : e.severity === 'warning' ? '#FEF3C7' : '#F1F5F9',
                        color: e.severity === 'critical' ? '#991B1B' : e.severity === 'warning' ? '#78350F' : '#64748B',
                        textTransform: 'uppercase',
                      }}>{e.severity}</span>
                      <span style={{ fontFamily: 'monospace', fontSize: 11 }}>{e.event_type}</span>
                      <span style={{ color: '#5A7A8A' }}>{e.title || ''}</span>
                    </div>
                    <span style={{ color: '#94A3B8', fontSize: 11 }}>{e.occurred_at ? new Date(e.occurred_at).toLocaleString() : ''}</span>
                  </div>
                ))}
                <div style={{ marginTop: 10, textAlign: 'right' }}>
                  <a href="/app/services/arion_website_security_overview" style={{ fontSize: 12, color: 'var(--arion-sky)' }}>View all events →</a>
                </div>
              </div>
            )}
          </Card>
        </div>

        {/* Right sidebar */}
        <div className="info-sidebar">
          <SidebarCard label="PHP Version" value={String(phpVersion)} />
          <SidebarCard label="WordPress" value={String(wpVersion)} />
          <SidebarCard label="Plugin version" value={pluginData?.plugin_version ? `v${pluginData.plugin_version}` : '—'} />
          <SidebarCard label="Pages" value={String(content.pages ?? '—')} />
          <SidebarCard label="Posts" value={String(content.posts ?? '—')} />
          <SidebarCard label="Daily backup" value="Enabled" valueClass="success" />
          <SidebarCard label="SSL" value={health.sslStatus || 'Active'} valueClass="success" />
        </div>
      </div>

      <ConsultingUpsell
        headline="Your website is the foundation — let IA handle hosting, security, and uptime"
        subtext="Full-service managed WordPress with IA's proactive monitoring. Zero downtime, automatic updates, quarterly optimization reviews."
        serviceType="IT & Hosting Management"
        triggerPage="website-overview"
      />

      {psL && <div style={{ padding: 6, fontSize: 11, color: '#94A3B8' }}>Checking plugin status…</div>}
    </div>
  );
}

function StatTile({ label, value, tone, href, linkLabel, sub }: { label: string; value: React.ReactNode; tone: 'ok' | 'warn' | 'err'; href?: string; linkLabel?: string; sub?: string }) {
  const colors: Record<string, { bg: string; border: string; text: string; valueText: string }> = {
    ok:    { bg: '#F0FDF4', border: '#1D9E75', text: '#065F46', valueText: '#0B1C24' },
    warn:  { bg: '#FEF3C7', border: '#D97706', text: '#78350F', valueText: '#92400E' },
    err:   { bg: '#FEF2F2', border: '#D85A30', text: '#991B1B', valueText: '#991B1B' },
  };
  const c = colors[tone];
  return (
    <div style={{ background: c.bg, borderLeft: `3px solid ${c.border}`, borderRadius: 6, padding: '10px 14px' }}>
      <div style={{ fontSize: 10, color: c.text, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: c.valueText, marginTop: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: '#5A7A8A', marginTop: 2 }}>{sub}</div>}
      {href && linkLabel && (
        <div style={{ marginTop: 6 }}>
          <a href={href} style={{ fontSize: 10, color: c.text, fontWeight: 600, textDecoration: 'none' }}>{linkLabel}</a>
        </div>
      )}
    </div>
  );
}

function Empty({ message }: { message: string }) {
  return <div style={{ padding: 10, color: '#5A7A8A', fontSize: 12, background: '#F8FAFC', borderRadius: 4 }}>{message}</div>;
}
