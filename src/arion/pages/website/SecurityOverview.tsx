import React, { useMemo, useState } from 'react';
import { useArionContext } from '../../useArionContext';
import { useArionData } from '../../useArionData';
import { ReportBar } from '../../../components/insights/ReportBar';
import { useArionInsightsPayload } from '../../../hooks/useArionInsightsPayload';
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
 * Shield dual-gauge (firewall% + scan%), 30-day blocked-attack
 * time-series with 7d highlight, top attacker countries, attack types,
 * admin 2FA coverage ring, plus a "Full Shield report" modal with
 * all scan findings.
 */
export function SecurityOverview() {
  // Reports covering THIS function (Brandon 2026-08-14). Declared above
  // any early return — a hook below one runs on some renders only.
  const insightsPayload = useArionInsightsPayload();

  const { selectedSite, activeSiteId, arionApi, loading } = useArionContext();
  const [modalOpen, setModalOpen] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [configBusy, setConfigBusy] = useState<Record<string, boolean>>({});
  const [configState, setConfigState] = useState<Record<string, boolean>>({});
  const [configNotice, setConfigNotice] = useState<string | null>(null);

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

  // Seed config toggle state from full wordfence data when it loads
  React.useEffect(() => {
    if (full && full.installed !== false) {
      setConfigState({
        firewall_enabled: !!full.firewall_enabled,
        brute_force: !!full.brute_force_on,
        // Most other flags aren't surfaced on full — infer from score
      });
    }
  }, [full]);

  const handleToggleConfig = async (key: string) => {
    if (!activeSiteId || configState[key]) return; // only ON direction allowed
    setConfigBusy((prev) => ({ ...prev, [key]: true }));
    setConfigNotice(null);
    try {
      const res: any = await arionApi.setPluginWordfenceConfig(activeSiteId, { [key]: true });
      const newState = res?.data?.state || {};
      setConfigState((prev) => ({ ...prev, ...newState }));
      setConfigNotice(`✓ ${key.replace(/_/g, ' ')} enabled`);
      setTimeout(() => setConfigNotice(null), 4000);
    } catch (err: any) {
      setConfigNotice(`Failed to enable: ${err?.message || 'unknown error'}`);
    } finally {
      setConfigBusy((prev) => ({ ...prev, [key]: false }));
    }
  };

  if (loading || secLoading) return <Loading />;
  if (!selectedSite) return <div style={{ padding: 24, color: 'var(--text-muted)' }}>No site selected.</div>;

  // ── Shield Security dashboard (Wordfence replaced 2026-07-05) ──
  // The IA plugin now sources security data from Shield (provider:'shield'),
  // same payload shape. We render Shield's real protective signals; security
  // *scores* are intentionally not shown here (reworked separately).
  const shieldFull: any = (full as any)?.provider === 'shield' ? full : null;
  if (shieldFull || !wf?.installed) {
    const domain = (selectedSite as any)?.domain || 'your site';
    if (!shieldFull) {
      return (
        <div><Card><div style={{ padding: 24, color: 'var(--text-muted)' }}>
          No security plugin detected on {domain}. Shield Security will appear here once its connection is confirmed.
        </div></Card></div>
      );
    }
    const twofa = shieldFull.admin_2fa || { total_admins: 0, with_2fa: 0, coverage_pct: 0 };
    const siteBlocks = Number(shieldFull.site_blocks_total ?? 0);
    const threatIntel = Number(shieldFull.threat_intel_ips ?? shieldFull.blocked_ips_total ?? 0);
    const malware = Number(shieldFull.malware_findings ?? 0);
    const openFindings = Number(shieldFull.scan_findings_open ?? 0);
    const scanNever = (shieldFull.scan_status || 'never') === 'never';
    const tile = (label: string, value: string, accent: string) => (
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '14px 16px' }}>
        <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: '#64748b', fontWeight: 600 }}>{label}</div>
        <div style={{ fontSize: 22, fontWeight: 700, color: accent, marginTop: 4 }}>{value}</div>
      </div>
    );
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <span style={{ fontSize: 22 }}>🛡️</span>
          <h2 style={{ margin: 0, fontSize: 18, color: '#0B1C24' }}>Security — Shield Security</h2>
        </div>
        <div style={{ background: '#F0FDF4', borderLeft: '4px solid #1D9E75', padding: '14px 18px', borderRadius: 6, marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#0B1C24' }}>
            ✓ Shield Security is active on {domain}.
          </div>
          <div style={{ fontSize: 13, color: '#334155', marginTop: 4 }}>
            Firewall, bot blocking, brute-force protection, and malware scanning are running.{threatIntel > 0 ? ` ${threatIntel.toLocaleString()} known-malicious IPs are pre-blocked from the CrowdSec threat-intel feed.` : ''}
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 12, marginBottom: 16 }}>
          {tile('Attacks blocked (this site)', siteBlocks.toLocaleString(), siteBlocks > 0 ? '#D97706' : '#1D9E75')}
          {tile('Offenses recorded', Number(shieldFull.offenses_total ?? 0).toLocaleString(), '#0B1C24')}
          {tile('Threat-intel IPs pre-blocked', threatIntel.toLocaleString(), '#0B1C24')}
          {tile('Admin 2FA', `${twofa.with_2fa}/${twofa.total_admins}`, twofa.coverage_pct >= 50 ? '#1D9E75' : '#D97706')}
          {tile('Malware findings', String(malware), malware > 0 ? '#D85A30' : '#1D9E75')}
          {tile('Open findings', String(openFindings), openFindings > 0 ? '#D97706' : '#1D9E75')}
          {tile('Last scan', scanNever ? 'Not yet run' : (shieldFull.last_scan_at ? new Date(shieldFull.last_scan_at).toLocaleDateString() : '—'), '#0B1C24')}
        </div>
        {Array.isArray(shieldFull.attack_types) && shieldFull.attack_types.length > 0 && (
          <Card>
            <div style={{ padding: 16 }}>
              <h3 style={{ marginTop: 0, fontSize: 14 }}>What Shield is blocking</h3>
              {shieldFull.attack_types.map((t: any, i: number) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f1f5f9' }}>
                  <span style={{ fontSize: 13, color: '#334155' }}>{t.type}</span>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{Number(t.count).toLocaleString()}</span>
                </div>
              ))}
            </div>
          </Card>
        )}
        {scanNever && (
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 12 }}>
            A full malware/file scan hasn't run yet — Shield scans on its schedule; detailed scan results appear here after the first run.
          </div>
        )}
      </div>
    );
  }

  const storyBand = (() => {
    if (!wf?.installed) return { tone: 'warn' as const, text: 'Shield Security is not active. Enable it for firewall protection and malware scanning.' };
    if (overallScore != null && overallScore >= 80) return { tone: 'ok' as const, text: `Your security posture is strong. Shield is blocking ${blocked30dTotal.toLocaleString()} attacks per month.` };
    if (overallScore != null && overallScore >= 50) return { tone: 'warn' as const, text: `Your security posture has gaps. Shield caught ${blocked30dTotal.toLocaleString()} attacks this month, but your configuration isn't maxed out.` };
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
      <ReportBar detail={insightsPayload?.detail} reports={[
        { id: 'vulnerabilities', label: 'Vulnerabilities' },
        { id: 'component_upkeep', label: 'Software upkeep' },
      ]} />
      {/* Storytelling band + action buttons at top (matches SEO page pattern) */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 16 }}>
        <div style={{ ...toneStyle[storyBand.tone], flex: 1, padding: '14px 18px', borderRadius: 6 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#0B1C24', marginBottom: 4 }}>{storyBand.text}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button
            onClick={() => setConfigOpen(true)}
            style={{ padding: '8px 16px', fontSize: 12, fontWeight: 600, background: '#fff', color: '#0B1C24', border: '1px solid #CBD5E1', borderRadius: 6, cursor: 'pointer', whiteSpace: 'nowrap' }}
          >
            ⚙ Safe Configuration
          </button>
          <button
            onClick={() => setModalOpen(true)}
            style={{ padding: '8px 16px', fontSize: 12, fontWeight: 600, background: '#0B1C24', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', whiteSpace: 'nowrap' }}
          >
            See Full Details →
          </button>
        </div>
      </div>

      {/* Wordfence real-state panel (v2.0.11 — replaced made-up composite with actual state) */}
      <Card title="Shield protection status">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
          <StateTile
            label="Firewall"
            value={wf?.firewall_enabled ? 'ON' : wf?.installed ? 'OFF' : 'N/A'}
            ok={!!wf?.firewall_enabled}
          />
          <StateTile
            label="Brute-force protection"
            value={wf?.brute_force_on ? 'ON' : wf?.installed ? 'OFF' : 'N/A'}
            ok={!!wf?.brute_force_on}
          />
          <StateTile
            label="Admin 2FA"
            value={admin2fa ? `${admin2fa.with_2fa}/${admin2fa.total_admins}` : '—'}
            ok={admin2fa && admin2fa.coverage_pct === 100}
            warn={admin2fa && admin2fa.coverage_pct > 0 && admin2fa.coverage_pct < 100}
          />
          <StateTile
            label="Last scan"
            value={wf?.last_scan_at ? new Date(wf.last_scan_at).toLocaleDateString() : 'Never'}
            ok={!!wf?.last_scan_at}
          />
        </div>
        <div style={{ fontSize: 11, color: '#5A7A8A', marginTop: 12, lineHeight: 1.5 }}>
          Each item reflects actual Shield state on your site. Use the "Safe Configuration" button above to enable anything showing OFF.
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
          <EmptyInline message="No blocked-attack data yet — Shield collects this in the background." />
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

      <DetailsModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        eyebrow="Security"
        title={`Full Details — ${issues.length} scan findings`}
      >
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, color: '#5A7A8A', marginBottom: 8 }}>
            Live findings from Shield's scanner, sorted by severity. Each finding links back to the file + threat detail.
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

      {/* Safe Configuration modal — toggle-ON-only settings */}
      <DetailsModal
        open={configOpen}
        onClose={() => setConfigOpen(false)}
        eyebrow="Security configuration"
        title="Safe Shield settings"
        width={700}
      >
        <div style={{ fontSize: 12, color: '#5A7A8A', marginBottom: 14, lineHeight: 1.5 }}>
          These settings tighten your site's security. ARION only allows you to <strong>enable</strong> protections here — to disable any of them you must go to the Shield Security admin directly. This keeps your site safe from accidental misconfigurations.
        </div>
        <div style={{ marginBottom: 14, padding: 12, background: '#EFF6FF', borderLeft: '3px solid #0284c7', borderRadius: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <div style={{ fontSize: 12, color: '#0B1C24', lineHeight: 1.5, flex: 1 }}>
            <strong>One-click IA Recommended</strong> — enables every setting below at once + applies IA defaults to LiteSpeed, Rank Math, SMTP, and Safe SVG. Runs a fresh PageSpeed test too. This is also the "Restore Defaults" action available on Website Overview.
          </div>
          <a
            href="/app/services/arion_website_overview"
            style={{ padding: '8px 14px', fontSize: 11, fontWeight: 600, background: '#0B1C24', color: '#fff', border: 'none', borderRadius: 5, textDecoration: 'none', whiteSpace: 'nowrap' }}
          >
            Apply All IA Defaults →
          </a>
        </div>
        {configNotice && (
          <div style={{ padding: '8px 12px', marginBottom: 12, background: '#F0FDF4', borderLeft: '3px solid #1D9E75', borderRadius: 4, fontSize: 12, color: '#065F46' }}>
            {configNotice}
          </div>
        )}
        <div style={{ display: 'grid', gap: 10 }}>
          {[
            { key: 'firewall_enabled', label: 'Shield firewall', desc: 'Blocks known attack patterns. Shield enforces its firewall + bot protection continuously.' },
            { key: 'brute_force', label: 'Brute-force login protection', desc: 'Locks out IPs after repeated failed logins. Huge protection against credential-stuffing attacks.' },
            { key: 'require_admin_2fa', label: 'Require 2FA for admins', desc: 'Forces every administrator account to enroll in 2FA before they can log in. Blocks 99%+ of account takeovers.' },
            { key: 'block_fake_bots', label: 'Block fake search bots', desc: 'Real Googlebot traffic is allowed; fake bots claiming to be Google are blocked.' },
            { key: 'block_bad_post', label: 'Block suspicious POST requests', desc: 'Filters out known malicious POST payloads before they reach your site.' },
            { key: 'hide_wp_version', label: 'Hide WordPress version', desc: 'Removes the WP version number from HTML + scripts so attackers can\'t target version-specific exploits.' },
            { key: 'scan_enabled_core', label: 'Scan WordPress core files', desc: 'Detects tampered or modified core files (sign of an attack in progress).' },
            { key: 'scan_enabled_plugins', label: 'Scan plugin files', desc: 'Detects modified plugin files that may indicate compromise.' },
            { key: 'scan_enabled_themes', label: 'Scan theme files', desc: 'Same as plugin scan but for themes.' },
            { key: 'scan_enabled_malware', label: 'Scan for malware signatures', desc: 'Runs known-malware pattern matching on your site files.' },
            { key: 'scan_suspicious_admins', label: 'Flag suspicious admin users', desc: 'Alerts you if a new admin account appears without your knowledge.' },
          ].map((opt) => {
            const enabled = configState[opt.key] === true;
            const busy = !!configBusy[opt.key];
            return (
              <div key={opt.key} style={{ padding: 12, background: enabled ? '#F0FDF4' : '#F8FAFC', borderRadius: 6, border: `1px solid ${enabled ? '#bbf7d0' : '#e5eef2'}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#0B1C24' }}>
                      {opt.label} {enabled && <span style={{ fontSize: 10, color: '#1D9E75', marginLeft: 6 }}>✓ Enabled</span>}
                    </div>
                    <div style={{ fontSize: 11, color: '#5A7A8A', marginTop: 4, lineHeight: 1.5 }}>{opt.desc}</div>
                  </div>
                  <button
                    disabled={enabled || busy}
                    onClick={() => handleToggleConfig(opt.key)}
                    style={{
                      padding: '6px 14px', fontSize: 11, fontWeight: 600,
                      background: enabled ? '#E5EEF2' : '#0B1C24', color: enabled ? '#5A7A8A' : '#fff',
                      border: 'none', borderRadius: 4,
                      cursor: enabled || busy ? 'default' : 'pointer', flexShrink: 0, minWidth: 90,
                    }}
                  >
                    {busy ? 'Enabling…' : enabled ? 'Already on' : 'Enable'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ marginTop: 16, padding: 12, background: '#FFFBEB', borderLeft: '3px solid #D97706', borderRadius: 4, fontSize: 11, color: '#78350F', lineHeight: 1.5 }}>
          <strong>Need to disable a setting?</strong> Open your WordPress admin → Shield Security → settings. ARION intentionally doesn't let you disable security protections remotely.
        </div>
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

function StateTile({ label, value, ok, warn }: { label: string; value: string; ok?: boolean | null; warn?: boolean | null }) {
  const color = ok ? '#1D9E75' : warn ? '#D97706' : '#D85A30';
  const bg = ok ? '#F0FDF4' : warn ? '#FEF3C7' : '#FEF2F2';
  return (
    <div style={{ background: bg, borderLeft: `3px solid ${color}`, borderRadius: 6, padding: '10px 14px' }}>
      <div style={{ fontSize: 10, color: '#5A7A8A', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color, marginTop: 4 }}>{value}</div>
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
