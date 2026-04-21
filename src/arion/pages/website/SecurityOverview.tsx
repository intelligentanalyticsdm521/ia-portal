import React, { useMemo, useState } from 'react';
import { useArionContext } from '../../useArionContext';
import { useArionData } from '../../useArionData';
import {
  Card, Loading, ConsultingUpsell, StatCard, MiniGauge, DetailsModal,
} from '../../components/Ui';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, PieChart, Pie, Cell,
} from 'recharts';

/**
 * Security Overview — visual-first security posture for the site.
 *
 * Wordfence dual-gauge (firewall% + scan%), 30-day blocked-attack
 * time-series with 7d highlight, top attacker countries, attack types,
 * admin 2FA coverage ring, plus a "Full Wordfence report" modal with
 * all scan findings.
 */
export function SecurityOverview() {
  const { selectedSite, activeSiteId, arionApi, loading } = useArionContext();
  const [modalOpen, setModalOpen] = useState(false);

  const fetchIfId = <T,>(fn: (s: string) => Promise<T>) =>
    activeSiteId ? fn(activeSiteId) : Promise.resolve(null);

  const { data: sec, loading: secLoading } = useArionData(() => fetchIfId(arionApi.getPluginSecurity), [activeSiteId]);
  const { data: wfFull } = useArionData(() => fetchIfId(arionApi.getPluginWordfenceFull), [activeSiteId]);
  const { data: scanIssues } = useArionData(() => fetchIfId(arionApi.getPluginScanIssues), [activeSiteId]);
  const { data: events } = useArionData(() => activeSiteId ? arionApi.getPluginSecurityEvents(activeSiteId, 50) : Promise.resolve(null), [activeSiteId]);

  const env = (sec as any) || {};
  const pluginStatus: string = env.plugin_status || 'unknown';
  const pluginConnected = pluginStatus === 'connected';
  const data = env.data || {};
  const wf = data.wordfence || null;
  const core = data.core_health || null;
  const users = data.users || null;

  const full = (wfFull as any)?.data || null;
  const firewallScore = full?.firewall_score ?? null;
  const scanScore = full?.scan_score ?? null;
  const overallScore = full?.overall_score ?? null;
  const blocked30d: Array<{ day: string; count: number }> = full?.blocked_attacks_30d || [];
  const blocked7dTotal = full?.blocked_attacks_7d_total ?? 0;
  const blocked30dTotal = full?.blocked_attacks_30d_total ?? 0;
  const topCountries: Array<{ country: string; count: number }> = full?.top_countries || [];
  const attackTypes: Array<{ type: string; count: number }> = full?.attack_types || [];
  const admin2fa = full?.admin_2fa || null;

  const issuesData = (scanIssues as any)?.data || { issues: [], total: 0 };
  const issues: any[] = issuesData.issues || [];

  const recentEvents: any[] = (events as any)?.data?.events || [];

  if (loading || secLoading) return <Loading />;
  if (!selectedSite) return <div style={{ padding: 24, color: 'var(--text-muted)' }}>No site selected.</div>;

  const storyBand = (() => {
    if (!wf?.installed) return { tone: 'warn' as const, text: 'Wordfence is not installed. Install it to enable firewall protection and malware scanning.' };
    if (overallScore != null && overallScore >= 80) return { tone: 'ok' as const, text: `Your security posture is strong. Wordfence is blocking ${blocked30dTotal.toLocaleString()} attacks per month.` };
    if (overallScore != null && overallScore >= 50) return { tone: 'warn' as const, text: `Your security posture has gaps. Wordfence caught ${blocked30dTotal.toLocaleString()} attacks this month, but your configuration isn't maxed out.` };
    return { tone: 'err' as const, text: `Your security posture is weak. Enable the firewall, scan settings, and 2FA to tighten protection.` };
  })();

  const toneStyle: Record<string, any> = {
    ok: { background: '#F0FDF4', borderLeft: '4px solid #1D9E75' },
    warn: { background: '#FFFBEB', borderLeft: '4px solid #D97706' },
    err: { background: '#FEF2F2', borderLeft: '4px solid #D85A30' },
  };

  // Attack type chart — cap to 6
  const attackTypeData = attackTypes.slice(0, 6).map((t) => ({
    name: (t.type || 'Unknown').length > 22 ? `${(t.type || 'Unknown').slice(0, 20)}…` : (t.type || 'Unknown'),
    count: t.count,
  }));

  return (
    <div>
      {/* Storytelling band */}
      <div style={{ ...toneStyle[storyBand.tone], padding: '14px 18px', marginBottom: 16, borderRadius: 6 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#0B1C24', marginBottom: 4 }}>{storyBand.text}</div>
      </div>

      {/* Wordfence dual gauge */}
      <Card title="Wordfence Optimization Score">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20, alignItems: 'center' }}>
          <MiniGauge score={firewallScore} label="Firewall" size={130} />
          <MiniGauge score={scanScore} label="Scan" size={130} />
          <MiniGauge score={overallScore} label="Overall" size={130} />
        </div>
        <div style={{ fontSize: 11, color: '#5A7A8A', marginTop: 12, lineHeight: 1.5, textAlign: 'center' }}>
          Scores reflect how many Wordfence protection settings are enabled. Match or beat what Wordfence's own dashboard recommends.
        </div>
      </Card>

      {/* Stat row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginTop: 14, marginBottom: 14 }}>
        <StatCard label="Attacks blocked 7d" value={blocked7dTotal.toLocaleString()} deltaType="positive" />
        <StatCard label="Attacks blocked 30d" value={blocked30dTotal.toLocaleString()} deltaType="positive" />
        <StatCard label="Scan findings" value={String(issuesData.total || 0)} deltaType={(issuesData.total || 0) > 0 ? 'negative' : 'neutral'} />
        <StatCard label="Admin 2FA coverage" value={admin2fa ? `${admin2fa.coverage_pct}%` : '—'} deltaType={admin2fa?.coverage_pct >= 100 ? 'positive' : admin2fa?.coverage_pct >= 50 ? 'neutral' : 'negative'} />
      </div>

      {/* Blocked attacks timeseries */}
      <Card title="Blocked attacks (last 30 days)">
        {blocked30d.length === 0 ? (
          <EmptyInline message="No blocked-attack data yet — Wordfence collects this in the background." />
        ) : (
          <div style={{ height: 220 }}>
            <ResponsiveContainer>
              <AreaChart data={blocked30d} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5EEF2" />
                <XAxis dataKey="day" tick={{ fontSize: 10, fill: '#5A7A8A' }} />
                <YAxis tick={{ fontSize: 10, fill: '#5A7A8A' }} allowDecimals={false} />
                <Tooltip contentStyle={{ fontSize: 11 }} formatter={(v: any) => [`${v} blocked`, 'Attacks']} />
                <Area type="monotone" dataKey="count" stroke="#D85A30" fill="#D85A30" fillOpacity={0.25} strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      {/* Countries + Attack types */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 14 }}>
        <Card title="Top attacker countries (30d)">
          {topCountries.length === 0 ? (
            <EmptyInline message="No country data yet." />
          ) : (
            <div>
              {topCountries.slice(0, 10).map((c) => {
                const max = topCountries[0].count || 1;
                const pct = (c.count / max) * 100;
                return (
                  <div key={c.country} style={{ marginBottom: 6 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 2 }}>
                      <span style={{ fontWeight: 500 }}>{c.country}</span>
                      <span style={{ color: '#5A7A8A' }}>{c.count.toLocaleString()}</span>
                    </div>
                    <div style={{ background: '#E5EEF2', height: 8, borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: '#D85A30', borderRadius: 4 }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card title="Attack type breakdown (30d)">
          {attackTypeData.length === 0 ? (
            <EmptyInline message="No attack-type data yet." />
          ) : (
            <div style={{ height: 220 }}>
              <ResponsiveContainer>
                <BarChart data={attackTypeData} layout="vertical" margin={{ top: 5, right: 15, left: 80, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5EEF2" />
                  <XAxis type="number" tick={{ fontSize: 10, fill: '#5A7A8A' }} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: '#5A7A8A' }} width={160} />
                  <Tooltip contentStyle={{ fontSize: 11 }} />
                  <Bar dataKey="count" fill="#EF6C33" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>

      {/* WP Site Health + Admin users */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 14 }}>
        <Card title="WordPress Site Health">
          {!core ? (
            <EmptyInline message="Site Health data unavailable." />
          ) : (
            <div>
              <HealthBar label="Critical" count={core.critical_count} color="#D85A30" />
              <HealthBar label="Recommended" count={core.recommended_count} color="#D97706" />
              <HealthBar label="Good" count={core.good_count} color="#1D9E75" />
            </div>
          )}
        </Card>

        <Card title="Admin users">
          {!users ? (
            <EmptyInline message="User data unavailable." />
          ) : (
            <div style={{ fontSize: 12 }}>
              <div style={{ marginBottom: 10 }}>
                <strong style={{ fontSize: 22 }}>{users.admin_count}</strong> administrator {users.admin_count === 1 ? 'account' : 'accounts'}
              </div>
              {admin2fa && (
                <div style={{ padding: 10, background: admin2fa.coverage_pct >= 100 ? '#F0FDF4' : admin2fa.coverage_pct >= 50 ? '#FEF3C7' : '#FEF2F2', borderRadius: 6, marginBottom: 8 }}>
                  <strong style={{ color: admin2fa.coverage_pct >= 100 ? '#065F46' : admin2fa.coverage_pct >= 50 ? '#78350F' : '#991B1B' }}>
                    {admin2fa.with_2fa} of {admin2fa.total_admins} admins have 2FA enabled ({admin2fa.coverage_pct}%)
                  </strong>
                </div>
              )}
              {users.inactive_admins?.length > 0 && (
                <div style={{ padding: 10, background: '#FEF3C7', borderRadius: 6, fontSize: 11 }}>
                  <strong>{users.inactive_admins.length} inactive admin{users.inactive_admins.length === 1 ? '' : 's'}</strong> — consider removing to reduce attack surface.
                </div>
              )}
            </div>
          )}
        </Card>
      </div>

      {/* Full report modal trigger */}
      <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end' }}>
        <button
          onClick={() => setModalOpen(true)}
          style={{ padding: '8px 18px', fontSize: 12, fontWeight: 600, background: '#0B1C24', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}
        >
          See Full Wordfence Report →
        </button>
      </div>

      <DetailsModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        eyebrow="Security"
        title={`Wordfence full report — ${issues.length} scan findings`}
      >
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, color: '#5A7A8A', marginBottom: 8 }}>
            Live findings from Wordfence's scanner, sorted by severity. Each finding links back to the file + threat detail.
          </div>
        </div>
        {issues.length === 0 ? (
          <div style={{ padding: 30, background: '#F0FDF4', borderRadius: 8, textAlign: 'center' }}>
            <strong style={{ color: '#065F46' }}>No active scan findings — clean site.</strong>
          </div>
        ) : (
          <table className="tbl" style={{ width: '100%', fontSize: 12 }}>
            <thead>
              <tr>
                <th>Severity</th>
                <th>Type</th>
                <th>Finding</th>
                <th>File</th>
                <th>Detected</th>
              </tr>
            </thead>
            <tbody>
              {issues.map((iss: any, i: number) => (
                <tr key={iss.id || i}>
                  <td>
                    <span style={{
                      fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 3,
                      background: iss.severity === 'critical' ? '#FEF2F2' : iss.severity === 'high' ? '#FEF3C7' : iss.severity === 'medium' ? '#EFF6FF' : '#F1F5F9',
                      color: iss.severity === 'critical' ? '#991B1B' : iss.severity === 'high' ? '#78350F' : iss.severity === 'medium' ? '#1E40AF' : '#64748B',
                      textTransform: 'uppercase',
                    }}>
                      {iss.severity}
                    </span>
                  </td>
                  <td style={{ fontSize: 11, color: '#5A7A8A' }}>{iss.type || '—'}</td>
                  <td style={{ fontSize: 11, maxWidth: 360 }}>{iss.short_msg || '—'}</td>
                  <td style={{ fontSize: 10, fontFamily: 'monospace', color: '#5A7A8A' }}>{iss.file || '—'}</td>
                  <td style={{ fontSize: 10, color: '#94A3B8' }}>{iss.detected_at ? new Date(iss.detected_at).toLocaleString() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {recentEvents.length > 0 && (
          <div style={{ marginTop: 20 }}>
            <h4 style={{ margin: '0 0 10px', fontSize: 13, color: '#0B1C24' }}>Recent security events</h4>
            <table className="tbl" style={{ width: '100%', fontSize: 11 }}>
              <thead>
                <tr>
                  <th>Severity</th>
                  <th>Type</th>
                  <th>Detail</th>
                  <th>When</th>
                </tr>
              </thead>
              <tbody>
                {recentEvents.slice(0, 20).map((e: any) => (
                  <tr key={e.event_id}>
                    <td style={{ textTransform: 'uppercase', fontSize: 9 }}>{e.severity}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: 10 }}>{e.event_type}</td>
                    <td style={{ color: '#5A7A8A' }}>{e.title || '—'}</td>
                    <td style={{ color: '#94A3B8', fontSize: 10 }}>{e.occurred_at ? new Date(e.occurred_at).toLocaleString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DetailsModal>

      <ConsultingUpsell
        headline="Security incidents require fast, experienced response"
        subtext="IA's security team handles emergency patching, malware removal, and post-incident hardening — any time of day."
        serviceType="Security Remediation"
        triggerPage="security-overview"
      />
    </div>
  );
}

function HealthBar({ label, count, color }: { label: string; count: number | undefined; color: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0' }}>
      <span style={{ fontSize: 12 }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 700, color }}>{count ?? 0}</span>
    </div>
  );
}

function EmptyInline({ message }: { message: string }) {
  return <div style={{ padding: 12, color: '#5A7A8A', fontSize: 12, background: '#F8FAFC', borderRadius: 4 }}>{message}</div>;
}
