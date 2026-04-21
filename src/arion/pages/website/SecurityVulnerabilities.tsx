import React, { useCallback, useMemo, useState } from 'react';
import { useArionContext } from '../../useArionContext';
import { useArionData } from '../../useArionData';
import { StatCard, Card, Loading, ErrorBanner, ConsultingUpsell, DetailsModal } from '../../components/Ui';
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ZAxis, Cell } from 'recharts';

/**
 * Security Vulnerabilities — cross-references installed plugins against the
 * Wordfence public vulnerability feed. Surfaces known CVEs AND outdated
 * plugins (which are the #1 vector for future vulnerabilities), so the page
 * is always actionable even when the Wordfence feed returns no matches.
 */
export function SecurityVulnerabilities() {
  const { selectedSite, activeSiteId, arionApi, loading } = useArionContext();
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [version, setVersion] = useState(0);

  const { data: vulnData, loading: vulnLoading } = useArionData(
    () => activeSiteId ? arionApi.getVulnerabilities(activeSiteId) : Promise.resolve(null),
    [activeSiteId, version]
  );

  const { data: pluginEnv, loading: pluginLoading } = useArionData(
    () => activeSiteId ? arionApi.getPluginPlugins(activeSiteId) : Promise.resolve(null),
    [activeSiteId, version]
  );

  // v2.0.7 — plugin risk analysis + Wordfence scan findings
  const { data: riskEnv } = useArionData(
    () => activeSiteId ? arionApi.getPluginRiskAnalysis(activeSiteId) : Promise.resolve(null),
    [activeSiteId, version]
  );
  const { data: scanEnv } = useArionData(
    () => activeSiteId ? arionApi.getPluginScanIssues(activeSiteId) : Promise.resolve(null),
    [activeSiteId, version]
  );

  const [riskModalOpen, setRiskModalOpen] = useState(false);

  const flashNotice = useCallback((type: 'success' | 'error', msg: string) => {
    setNotice({ type, msg });
    setTimeout(() => setNotice(null), 6000);
  }, []);

  const handleUpdate = useCallback(async (pluginFile: string) => {
    if (!activeSiteId) return;
    setBusy((prev) => ({ ...prev, [pluginFile]: true }));
    try {
      const r: any = await arionApi.updatePluginByFile(activeSiteId, pluginFile);
      if (r.data?.success) flashNotice('success', `Updated ${pluginFile}`);
      else flashNotice('error', r.errors?.[0] || 'Update failed');
      setVersion((v) => v + 1);
    } catch (err: any) {
      flashNotice('error', err?.message || 'Update request failed');
    } finally {
      setBusy((prev) => ({ ...prev, [pluginFile]: false }));
    }
  }, [activeSiteId, arionApi, flashNotice]);

  if (loading || vulnLoading) return <Loading />;
  if (!selectedSite) return <div style={{ padding: 24, color: 'var(--text-muted)' }}>No site selected.</div>;

  const v = (vulnData as any)?.data ?? (vulnData as any) ?? {};
  const vulnerabilities: any[] = Array.isArray(v.vulnerabilities) ? v.vulnerabilities : [];
  const pluginsChecked = v.plugins_checked ?? 0;
  const outdatedActive = v.outdated_active_plugins ?? 0;
  const critical = v.critical ?? 0;
  const high = v.high ?? 0;
  const medium = v.medium ?? 0;
  const wordfenceStatus = v.wordfence_status || 'unknown';
  const feedEntries = v.wordfence_feed_entries || 0;
  const wordfenceError = v.wordfence_error;
  const pluginSource = v.plugin_source;
  const pluginListError = v.plugin_list_error;
  const checkedAt = v.checked_at ? new Date(v.checked_at) : null;

  const hasCriticalOrHigh = critical > 0 || high > 0;

  const pluginList: any[] = (pluginEnv as any)?.data || [];
  // Outdated plugins from the plugin list (update_available = true, active only)
  const outdated = pluginList.filter((p: any) => p.update_available && p.active);

  const severityColor = (sev: string) => {
    switch (sev?.toLowerCase()) {
      case 'critical': return { background: '#dc2626', color: '#fff' };
      case 'high': return { background: '#f59e0b', color: '#fff' };
      case 'medium': return { background: '#3b82f6', color: '#fff' };
      case 'low': return { background: '#64748b', color: '#fff' };
      default: return { background: '#6b7280', color: '#fff' };
    }
  };

  // Storytelling band — explain the scan state
  const storyBand = (() => {
    if (hasCriticalOrHigh) {
      return {
        tone: 'danger' as const,
        headline: `${critical + high} critical/high-severity vulnerabilities need patching now.`,
        body: 'Known CVEs exist against plugins on your site. Every day unpatched expands the attack window — use the Patch buttons below to update now.',
      };
    }
    if (vulnerabilities.length > 0) {
      return {
        tone: 'warn' as const,
        headline: `${vulnerabilities.length} known vulnerabilities found at lower severity.`,
        body: 'No critical-severity issues, but lower-severity CVEs still apply. Patch these on your next maintenance pass.',
      };
    }
    if (outdatedActive > 0) {
      return {
        tone: 'warn' as const,
        headline: `No known CVEs — but ${outdatedActive} active plugins are running outdated versions.`,
        body: 'Your current plugin versions have no known vulnerabilities in the Wordfence database. However, outdated plugins are the #1 cause of future vulnerabilities — patches released now often fix CVEs that will be disclosed later. Update on your next maintenance pass.',
      };
    }
    if (pluginsChecked > 0) {
      return {
        tone: 'ok' as const,
        headline: 'Your site has no known vulnerabilities and every plugin is current.',
        body: `We checked ${pluginsChecked} installed plugins against the Wordfence vulnerability database (${feedEntries.toLocaleString()} total entries in the feed). Nothing to address right now — keep an eye on this page after future updates.`,
      };
    }
    return {
      tone: 'warn' as const,
      headline: 'Plugin inventory unavailable.',
      body: pluginListError || 'The IA Plugin did not return a plugin list. Without the list, we cannot check for vulnerabilities.',
    };
  })();

  const toneStyles: Record<string, React.CSSProperties> = {
    danger: { background: '#FEF2F2', borderLeft: '4px solid #D85A30' },
    warn: { background: '#FFFBEB', borderLeft: '4px solid #D97706' },
    ok: { background: '#F0FDF4', borderLeft: '4px solid #1D9E75' },
  };

  return (
    <div>
      {notice && (
        <div style={{
          padding: '10px 14px', marginBottom: 12, borderRadius: 6,
          background: notice.type === 'success' ? '#F0FDF4' : '#FEF2F2',
          borderLeft: `3px solid ${notice.type === 'success' ? '#1D9E75' : '#D85A30'}`,
          color: notice.type === 'success' ? '#065F46' : '#991B1B',
          fontSize: 13,
        }}>
          {notice.msg}
        </div>
      )}

      {/* Storytelling band */}
      <div style={{ ...toneStyles[storyBand.tone], padding: '14px 18px', marginBottom: 16, borderRadius: 6 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#0B1C24', marginBottom: 4 }}>
          {storyBand.headline}
        </div>
        <div style={{ fontSize: 12, color: '#5A7A8A', lineHeight: 1.5 }}>
          {storyBand.body}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 16 }}>
        <StatCard label="Critical" value={critical} deltaType={critical > 0 ? 'negative' : 'neutral'} />
        <StatCard label="High" value={high} deltaType={high > 0 ? 'negative' : 'neutral'} />
        <StatCard label="Medium" value={medium} />
        <StatCard label="Outdated active" value={outdatedActive} deltaType={outdatedActive > 0 ? 'negative' : 'neutral'} />
        <StatCard label="Plugins scanned" value={pluginsChecked} />
      </div>

      {hasCriticalOrHigh && (
        <ErrorBanner message={`${critical} critical and ${high} high-severity vulnerabilities found. Apply updates immediately via the table below.`} />
      )}

      {/* Known vulnerabilities table */}
      {vulnerabilities.length > 0 && (
        <Card title={`Known vulnerabilities (${vulnerabilities.length})`}>
          <table className="tbl" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th>Plugin</th>
                <th>Installed</th>
                <th>Severity</th>
                <th>CVE</th>
                <th>Active</th>
                <th style={{ textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {vulnerabilities.map((vuln: any, i: number) => {
                const isBusy = Boolean(vuln.plugin_file && busy[vuln.plugin_file]);
                return (
                  <tr key={vuln.cve || vuln.plugin || i}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{vuln.plugin ?? '—'}</div>
                      {vuln.title && <div style={{ fontSize: 10, color: '#5A7A8A', marginTop: 2 }}>{vuln.title}</div>}
                    </td>
                    <td><code style={{ fontSize: 11 }}>{vuln.installed_version ?? '—'}</code></td>
                    <td>
                      <span style={{ ...severityColor(vuln.severity), padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600 }}>
                        {vuln.severity ?? '—'}
                      </span>
                    </td>
                    <td style={{ fontFamily: 'monospace', fontSize: 10 }}>{vuln.cve ?? '—'}</td>
                    <td>{vuln.plugin_active == null ? '—' : vuln.plugin_active ? 'Yes' : 'No'}</td>
                    <td style={{ textAlign: 'right' }}>
                      {vuln.plugin_file ? (
                        <button
                          disabled={isBusy}
                          onClick={() => handleUpdate(vuln.plugin_file)}
                          style={{
                            padding: '5px 12px', fontSize: 11, fontWeight: 600,
                            background: '#dc2626', color: '#fff',
                            border: 'none', borderRadius: 5,
                            cursor: isBusy ? 'not-allowed' : 'pointer',
                            opacity: isBusy ? 0.5 : 1,
                          }}
                        >
                          {isBusy ? 'Updating…' : 'Patch now'}
                        </button>
                      ) : (
                        <span style={{ fontSize: 10, color: '#94A3B8' }}>—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      {/* Outdated plugin list even when no known vulns */}
      {outdated.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <Card title={`Outdated active plugins (${outdated.length})`}>
            <div style={{ fontSize: 12, color: '#5A7A8A', marginBottom: 10, lineHeight: 1.5 }}>
              These plugins are active and have newer versions available. Keep plugins current — most vulnerabilities are patched in the version released AFTER discovery.
            </div>
            <table className="tbl" style={{ width: '100%', fontSize: 12 }}>
              <thead>
                <tr><th>Plugin</th><th>Current</th><th>Latest</th><th style={{ textAlign: 'right' }}>Action</th></tr>
              </thead>
              <tbody>
                {outdated.map((p: any) => {
                  const isBusy = Boolean(busy[p.file]);
                  return (
                    <tr key={p.file}>
                      <td style={{ fontWeight: 600 }}>{p.name}</td>
                      <td><code style={{ fontSize: 11 }}>{p.version}</code></td>
                      <td><code style={{ fontSize: 11, color: '#1D9E75' }}>{p.new_version || '—'}</code></td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          disabled={isBusy}
                          onClick={() => handleUpdate(p.file)}
                          style={{
                            padding: '5px 12px', fontSize: 11, fontWeight: 600,
                            background: '#0B1C24', color: '#fff',
                            border: 'none', borderRadius: 5,
                            cursor: isBusy ? 'not-allowed' : 'pointer',
                            opacity: isBusy ? 0.5 : 1,
                          }}
                        >
                          {isBusy ? 'Updating…' : 'Update now'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        </div>
      )}

      {/* Plugin risk matrix — scatter of age × risk */}
      {(() => {
        const riskPlugins: any[] = (riskEnv as any)?.data?.plugins || [];
        const scatterData = riskPlugins
          .filter((p: any) => p.active && p.days_since_last_update != null)
          .map((p: any) => ({
            name: p.name,
            x: p.days_since_last_update,
            y: p.risk_score,
            z: p.update_available ? 100 : 50,
            band: p.risk_band,
          }));
        if (scatterData.length === 0) return null;
        return (
          <div style={{ marginTop: 16 }}>
            <Card title="Plugin risk matrix">
              <div style={{ fontSize: 11, color: '#5A7A8A', marginBottom: 10, lineHeight: 1.5 }}>
                Each dot is an active plugin. X-axis = days since its last upstream release. Y-axis = risk score (update pending + staleness + active status). Plugins in the top-right quadrant deserve attention first.
              </div>
              <div style={{ height: 280 }}>
                <ResponsiveContainer>
                  <ScatterChart margin={{ top: 10, right: 20, left: 0, bottom: 30 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5EEF2" />
                    <XAxis type="number" dataKey="x" name="Days since update" tick={{ fontSize: 10, fill: '#5A7A8A' }} label={{ value: 'Days since last upstream update', position: 'insideBottom', offset: -15, fontSize: 11, fill: '#5A7A8A' }} />
                    <YAxis type="number" dataKey="y" name="Risk score" tick={{ fontSize: 10, fill: '#5A7A8A' }} domain={[0, 100]} label={{ value: 'Risk score', angle: -90, position: 'insideLeft', fontSize: 11, fill: '#5A7A8A' }} />
                    <ZAxis type="number" dataKey="z" range={[60, 300]} />
                    <Tooltip
                      contentStyle={{ fontSize: 11 }}
                      cursor={{ strokeDasharray: '3 3' }}
                      formatter={(value: any, name: any, props: any) => {
                        if (name === 'Days since update') return [`${value} days`, name];
                        if (name === 'Risk score') return [`${value} / 100`, name];
                        return [value, name];
                      }}
                      labelFormatter={(_label: any, payload: any) => payload?.[0]?.payload?.name || ''}
                    />
                    <Scatter data={scatterData} fill="#D85A30">
                      {scatterData.map((d, i) => (
                        <Cell key={i} fill={d.band === 'high' ? '#D85A30' : d.band === 'medium' ? '#D97706' : '#1D9E75'} />
                      ))}
                    </Scatter>
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
              <div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => setRiskModalOpen(true)}
                  style={{ padding: '6px 14px', fontSize: 11, fontWeight: 600, background: '#0B1C24', color: '#fff', border: 'none', borderRadius: 5, cursor: 'pointer' }}
                >
                  See Full Risk Breakdown →
                </button>
              </div>
            </Card>
          </div>
        );
      })()}

      {/* Wordfence scan findings summary */}
      {(() => {
        const scan = (scanEnv as any)?.data;
        if (!scan || !scan.installed) return null;
        const issues: any[] = scan.issues || [];
        if (issues.length === 0) return null;
        return (
          <div style={{ marginTop: 16 }}>
            <Card title={`Wordfence scan findings (${issues.length})`}>
              <div style={{ fontSize: 11, color: '#5A7A8A', marginBottom: 10, lineHeight: 1.5 }}>
                Findings from Wordfence's file-integrity + malware scanner. These are different from CVE matches — they catch actual file modifications, suspicious patterns, and known-bad signatures on your server.
              </div>
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
                  {issues.slice(0, 10).map((iss: any, i: number) => (
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
                      <td style={{ fontSize: 11, maxWidth: 340 }}>{iss.short_msg || '—'}</td>
                      <td style={{ fontSize: 10, fontFamily: 'monospace', color: '#5A7A8A' }}>{iss.file || '—'}</td>
                      <td style={{ fontSize: 10, color: '#94A3B8' }}>{iss.detected_at ? new Date(iss.detected_at).toLocaleString() : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </div>
        );
      })()}

      {/* Risk detail modal */}
      <DetailsModal
        open={riskModalOpen}
        onClose={() => setRiskModalOpen(false)}
        eyebrow="Plugin Risk"
        title="Full plugin risk breakdown"
      >
        {(() => {
          const riskPlugins: any[] = (riskEnv as any)?.data?.plugins || [];
          if (riskPlugins.length === 0) return <div>No risk data yet.</div>;
          return (
            <table className="tbl" style={{ width: '100%', fontSize: 12 }}>
              <thead>
                <tr>
                  <th>Plugin</th>
                  <th>Current</th>
                  <th>Latest</th>
                  <th>Active</th>
                  <th>Days since update</th>
                  <th>Risk score</th>
                  <th>Band</th>
                </tr>
              </thead>
              <tbody>
                {riskPlugins.map((p: any) => (
                  <tr key={p.file}>
                    <td style={{ fontWeight: 600 }}>{p.name}</td>
                    <td><code style={{ fontSize: 10 }}>{p.current_version}</code></td>
                    <td><code style={{ fontSize: 10, color: p.update_available ? '#1D9E75' : '#5A7A8A' }}>{p.latest_version}</code></td>
                    <td>{p.active ? 'Yes' : 'No'}</td>
                    <td style={{ textAlign: 'right' }}>{p.days_since_last_update ?? '—'}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{p.risk_score}</td>
                    <td>
                      <span style={{
                        fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 3, textTransform: 'uppercase',
                        background: p.risk_band === 'high' ? '#FEF2F2' : p.risk_band === 'medium' ? '#FEF3C7' : '#F0FDF4',
                        color: p.risk_band === 'high' ? '#991B1B' : p.risk_band === 'medium' ? '#78350F' : '#065F46',
                      }}>
                        {p.risk_band}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          );
        })()}
      </DetailsModal>

      {/* Diagnostics footer — shows exactly what was checked */}
      <div style={{ marginTop: 16 }}>
        <Card title="Scan diagnostics">
          <div style={{ fontSize: 12, color: '#5A7A8A', lineHeight: 1.8 }}>
            <div>
              <strong>Plugins scanned:</strong> {pluginsChecked}
              {pluginSource && <span style={{ marginLeft: 6, fontSize: 10, color: '#94A3B8' }}>(source: {pluginSource})</span>}
            </div>
            <div>
              <strong>Wordfence feed:</strong>{' '}
              <span style={{
                color: wordfenceStatus === 'reachable' ? '#1D9E75' : wordfenceStatus === 'cached' ? '#D97706' : '#D85A30',
                fontWeight: 600,
              }}>
                {wordfenceStatus}
              </span>{' '}
              · {feedEntries.toLocaleString()} total vulnerability entries
            </div>
            {wordfenceError && (
              <div style={{ color: '#D85A30' }}>
                <strong>Wordfence error:</strong> <code style={{ fontSize: 11 }}>{wordfenceError}</code>
              </div>
            )}
            {pluginListError && (
              <div style={{ color: '#D97706' }}>
                <strong>Plugin inventory issue:</strong> <code style={{ fontSize: 11 }}>{pluginListError}</code>
              </div>
            )}
            {checkedAt && (
              <div style={{ color: '#94A3B8', fontSize: 11 }}>
                Last checked: {checkedAt.toLocaleString()}
              </div>
            )}
          </div>
        </Card>
      </div>

      {pluginLoading && <div style={{ padding: 10, color: '#5A7A8A', fontSize: 12 }}>Loading plugin inventory…</div>}

      <ConsultingUpsell
        headline="Critical vulnerabilities need immediate patching"
        subtext="IA's security team handles emergency updates during off-peak hours to minimize disruption, and can audit your stack for zero-days that haven't been disclosed yet."
        serviceType="Security Remediation"
        triggerPage="security-vulnerabilities"
      />
    </div>
  );
}
