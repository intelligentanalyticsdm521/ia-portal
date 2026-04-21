import React from 'react';
import { useArionContext } from '../../useArionContext';
import { useArionData } from '../../useArionData';
import { Card, Loading, ConsultingUpsell } from '../../components/Ui';

export function SecurityOverview() {
  const { selectedSite, activeSiteId, arionApi, loading } = useArionContext();

  const { data: sec, loading: secLoading } = useArionData(
    () => activeSiteId ? arionApi.getPluginSecurity(activeSiteId) : Promise.resolve(null),
    [activeSiteId]
  );
  const { data: events, loading: evLoading } = useArionData(
    () => activeSiteId ? arionApi.getPluginSecurityEvents(activeSiteId, 50) : Promise.resolve(null),
    [activeSiteId]
  );

  if (loading || secLoading) return <Loading />;
  if (!selectedSite) return <div style={{ padding: 24, color: 'var(--text-muted)' }}>No site selected.</div>;

  const env = (sec as any) || {};
  const pluginStatus: string = env.plugin_status || 'unknown';
  const data = env.data || {};
  const wf = data.wordfence || null;
  const core = data.core_health || null;
  const users = data.users || null;
  const securityEvents: any[] = ((events as any)?.data?.events) || [];
  const pluginConnected = pluginStatus === 'connected';
  const wfInstalled = wf?.installed === true;

  // Aggregate "security posture" score 0-100
  const scoreBreakdown: Array<{ label: string; score: number; weight: number; note: string }> = [];
  if (wfInstalled) {
    scoreBreakdown.push({
      label: 'Firewall enabled',
      score: wf.firewall_enabled ? 100 : 0,
      weight: 25,
      note: wf.firewall_enabled ? 'Wordfence firewall is active' : 'Wordfence is installed but firewall is OFF',
    });
    scoreBreakdown.push({
      label: 'Brute-force protection',
      score: wf.brute_force_on ? 100 : 0,
      weight: 15,
      note: wf.brute_force_on ? 'Login protection active' : 'Login protection disabled',
    });
    scoreBreakdown.push({
      label: 'Malware scan completeness',
      score: wf.scan_status === 'completed' ? 100 : wf.scan_status === 'running' ? 60 : 0,
      weight: 15,
      note: wf.last_scan_at ? `Last scan ${fmtDate(wf.last_scan_at)}` : 'No completed scan on record',
    });
  } else if (pluginConnected) {
    scoreBreakdown.push({
      label: 'Wordfence security suite',
      score: 0,
      weight: 55,
      note: 'Wordfence is not installed — install via Plugins for firewall + malware scanning',
    });
  }
  if (core) {
    scoreBreakdown.push({
      label: 'WordPress Site Health',
      score: core.critical_count === 0 ? 100 : core.critical_count <= 1 ? 70 : 40,
      weight: 25,
      note: core.critical_count === 0
        ? 'No critical issues reported by WP Site Health'
        : `${core.critical_count} critical issue${core.critical_count === 1 ? '' : 's'} flagged`,
    });
  }
  if (users) {
    const inactiveCount = users.inactive_admins?.length || 0;
    scoreBreakdown.push({
      label: 'Inactive administrator cleanup',
      score: inactiveCount === 0 ? 100 : inactiveCount <= 1 ? 60 : 20,
      weight: 20,
      note: inactiveCount === 0
        ? 'No administrator accounts with >90 days since last login'
        : `${inactiveCount} admin${inactiveCount === 1 ? '' : 's'} with >90-day dormancy`,
    });
  }

  const totalWeight = scoreBreakdown.reduce((s, r) => s + r.weight, 0) || 1;
  const postureScore = Math.round(scoreBreakdown.reduce((s, r) => s + (r.score * r.weight), 0) / totalWeight);
  const postureTone = postureScore >= 80 ? 'ok' : postureScore >= 50 ? 'warn' : 'error';

  return (
    <div>
      {!pluginConnected && (
        <div style={{ background: '#FEF3C7', borderLeft: '4px solid #D97706', padding: '12px 16px', marginBottom: 16, borderRadius: 4, fontSize: 13 }}>
          <strong>Plugin not reachable.</strong> Connect the IA Plugin to see live security status. Status: <code>{pluginStatus}</code>
        </div>
      )}

      {/* Hero posture card */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 16, marginBottom: 16 }}>
        <PostureCard score={postureScore} tone={postureTone} connected={pluginConnected} />
        <Card title="Score breakdown">
          {scoreBreakdown.length === 0 ? (
            <div style={{ padding: 12, color: '#5A7A8A', fontSize: 12 }}>Awaiting plugin connection to compute posture score.</div>
          ) : (
            <div>
              {scoreBreakdown.map((row) => (
                <div key={row.label} style={{ display: 'grid', gridTemplateColumns: '180px 1fr 50px 40px', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: '1px solid #f5f5f5' }}>
                  <div style={{ fontSize: 12, fontWeight: 500 }}>{row.label}</div>
                  <div style={{ background: '#F2F6F9', borderRadius: 3, height: 14, position: 'relative' }}>
                    <div style={{ width: `${row.score}%`, height: '100%', background: row.score >= 80 ? '#1D9E75' : row.score >= 40 ? '#D4A800' : '#D85A30', borderRadius: 3 }} />
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 600, textAlign: 'right', color: row.score >= 80 ? '#1D9E75' : row.score >= 40 ? '#D4A800' : '#D85A30' }}>{row.score}</div>
                  <div style={{ fontSize: 10, color: '#94A3B8', textAlign: 'right' }}>{row.weight}%</div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Wordfence detail */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <Card title="Wordfence">
          {!wfInstalled ? (
            <EmptyInline message="Wordfence is not installed on this site. Install via WP admin → Plugins → Add New → search 'Wordfence'. The plugin is free." />
          ) : (
            <div>
              <Row label="Firewall" value={wf.firewall_enabled ? 'Enabled' : 'Disabled'} tone={wf.firewall_enabled ? 'ok' : 'error'} />
              <Row label="Brute-force protection" value={wf.brute_force_on ? 'Active' : 'Inactive'} tone={wf.brute_force_on ? 'ok' : 'warn'} />
              <Row label="Last malware scan" value={wf.last_scan_at ? fmtDate(wf.last_scan_at) : 'Never'} tone={wf.scan_status === 'completed' ? 'ok' : 'warn'} />
              <Row label="Scan status" value={wf.scan_status || '—'} tone={wf.scan_status === 'completed' ? 'ok' : wf.scan_status === 'running' ? 'warn' : 'error'} />
              <Row label="Blocked attacks (24h)" value={wf.blocked_attacks_24h != null ? wf.blocked_attacks_24h.toLocaleString() : '—'} tone={wf.blocked_attacks_24h > 100 ? 'warn' : 'ok'} />
              <Row label="Malware findings" value={wf.malware_findings != null ? wf.malware_findings : '—'} tone={wf.malware_findings > 0 ? 'error' : 'ok'} />
              <Row label="Outdated plugins" value={wf.outdated_plugins != null ? wf.outdated_plugins : '—'} tone={wf.outdated_plugins > 0 ? 'warn' : 'ok'} />
            </div>
          )}
        </Card>

        <Card title="WordPress Site Health">
          {!core ? (
            <EmptyInline message="Awaiting plugin connection." />
          ) : (
            <div>
              <SummaryPill count={core.critical_count || 0} label="Critical" tone="error" />
              <SummaryPill count={core.recommended_count || 0} label="Recommended" tone="warn" />
              <SummaryPill count={core.good_count || 0} label="Passing" tone="ok" />
              {core.critical?.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#991B1B', marginBottom: 6 }}>Critical issues</div>
                  {core.critical.slice(0, 5).map((c: any, i: number) => (
                    <div key={i} style={{ fontSize: 11, color: '#0B1C24', padding: '4px 0' }}>• {c.label}</div>
                  ))}
                </div>
              )}
              {core.recommended?.length > 0 && core.critical_count === 0 && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#78350F', marginBottom: 6 }}>Top recommendations</div>
                  {core.recommended.slice(0, 5).map((c: any, i: number) => (
                    <div key={i} style={{ fontSize: 11, color: '#0B1C24', padding: '4px 0' }}>• {c.label}</div>
                  ))}
                </div>
              )}
            </div>
          )}
        </Card>
      </div>

      {/* User accounts */}
      <Card title="User accounts">
        {!users ? (
          <EmptyInline message="Awaiting plugin connection." />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <Stat label="Total users" value={users.total_users || 0} />
            <Stat label="Administrators" value={users.admin_count || 0} />
            <Stat label="Inactive admins (>90d)" value={users.inactive_admins?.length || 0} tone={users.inactive_admins?.length > 0 ? 'warn' : 'ok'} />
          </div>
        )}
        {users?.inactive_admins?.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#78350F', marginBottom: 6 }}>Administrators worth reviewing</div>
            <table className="tbl" style={{ width: '100%', fontSize: 11 }}>
              <thead><tr><th>Login</th><th>Email</th><th>Last login</th></tr></thead>
              <tbody>
                {users.inactive_admins.map((u: any) => (
                  <tr key={u.user_id}>
                    <td>{u.login}</td>
                    <td>{u.email}</td>
                    <td>{fmtDate(u.last_login_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Recent security event timeline */}
      <Card title={`Recent security events${securityEvents.length > 0 ? ` (${securityEvents.length})` : ''}`}>
        {evLoading ? (
          <div style={{ padding: 10, color: '#5A7A8A', fontSize: 12 }}>Loading…</div>
        ) : securityEvents.length === 0 ? (
          <EmptyInline message="No security events recorded yet. Plugin events (activation, deactivation, core updates, Wordfence alerts) will appear here as they fire." />
        ) : (
          <table className="tbl" style={{ width: '100%', fontSize: 11 }}>
            <thead>
              <tr><th>When</th><th>Event</th><th>Severity</th><th>Detail</th><th>Source IP</th></tr>
            </thead>
            <tbody>
              {securityEvents.slice(0, 30).map((e: any) => (
                <tr key={e.event_id}>
                  <td style={{ color: '#5A7A8A', whiteSpace: 'nowrap' }}>{fmtDate(e.occurred_at)}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: 10 }}>{e.event_type}</td>
                  <td>
                    <span style={{
                      fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 3,
                      background: e.severity === 'critical' ? '#FEF2F2' : e.severity === 'warning' ? '#FEF3C7' : '#F1F5F9',
                      color: e.severity === 'critical' ? '#991B1B' : e.severity === 'warning' ? '#78350F' : '#64748B',
                      textTransform: 'uppercase',
                    }}>{e.severity}</span>
                  </td>
                  <td style={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.title || '—'}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: 10, color: '#5A7A8A' }}>{e.source_ip || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <ConsultingUpsell
        headline="Security requires ongoing attention, not a one-time setup"
        subtext="IA's 24/7 security monitoring + quarterly posture reviews keep your site ahead of new threats."
        serviceType="Security Remediation"
        triggerPage="security-overview"
      />
    </div>
  );
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString();
}

function PostureCard({ score, tone, connected }: { score: number; tone: 'ok' | 'warn' | 'error'; connected: boolean }) {
  const color = tone === 'ok' ? '#1D9E75' : tone === 'warn' ? '#D4A800' : '#D85A30';
  const label = tone === 'ok' ? 'Strong' : tone === 'warn' ? 'Needs attention' : 'At risk';
  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '18px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', textAlign: 'center' }}>
      <div style={{ fontSize: 10, color: '#5A7A8A', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>Security Posture</div>
      <div style={{ fontSize: 52, fontWeight: 700, color: color, lineHeight: 1, marginTop: 10 }}>{connected ? score : '—'}</div>
      <div style={{ fontSize: 11, color, fontWeight: 600, marginTop: 2 }}>{connected ? label : 'Awaiting plugin'}</div>
      <div style={{ fontSize: 10, color: '#94A3B8', marginTop: 6 }}>out of 100 · weighted</div>
    </div>
  );
}

function Row({ label, value, tone }: { label: string; value: React.ReactNode; tone: 'ok' | 'warn' | 'error' }) {
  const color = tone === 'ok' ? '#1D9E75' : tone === 'warn' ? '#D4A800' : '#D85A30';
  const dot = tone === 'ok' ? '●' : tone === 'warn' ? '▲' : '■';
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f5f5f5', fontSize: 12 }}>
      <span>{label}</span>
      <span style={{ color, fontWeight: 500 }}>{value} <span style={{ marginLeft: 4 }}>{dot}</span></span>
    </div>
  );
}

function SummaryPill({ count, label, tone }: { count: number; label: string; tone: 'ok' | 'warn' | 'error' }) {
  const colors: Record<string, { bg: string; text: string }> = {
    ok: { bg: '#F0FDF4', text: '#065F46' },
    warn: { bg: '#FEF3C7', text: '#78350F' },
    error: { bg: '#FEF2F2', text: '#991B1B' },
  };
  const c = colors[tone];
  return (
    <span style={{ display: 'inline-block', background: c.bg, color: c.text, padding: '4px 10px', borderRadius: 4, fontSize: 11, fontWeight: 600, marginRight: 8 }}>
      {count} {label}
    </span>
  );
}

function Stat({ label, value, tone }: { label: string; value: number | string; tone?: 'ok' | 'warn' | 'error' }) {
  const color = tone === 'warn' ? '#D4A800' : tone === 'error' ? '#D85A30' : '#0B1C24';
  return (
    <div style={{ background: '#F8FAFC', borderRadius: 6, padding: '10px 14px', textAlign: 'center' }}>
      <div style={{ fontSize: 10, color: '#5A7A8A', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color, marginTop: 4 }}>{value}</div>
    </div>
  );
}

function EmptyInline({ message }: { message: string }) {
  return <div style={{ padding: 12, color: '#5A7A8A', fontSize: 12, background: '#F8FAFC', borderRadius: 4 }}>{message}</div>;
}
