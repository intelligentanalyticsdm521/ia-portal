import React, { useCallback, useState } from 'react';
import { useArionContext } from '../../useArionContext';
import { useArionData } from '../../useArionData';
import { StatCard, Card, Loading, ErrorBanner, ConsultingUpsell } from '../../components/Ui';

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
