import React, { useState, useCallback } from 'react';
import { useArionContext } from '../../useArionContext';
import { useArionData } from '../../useArionData';
import { Card, Loading, ConsultingUpsell } from '../../components/Ui';
import type { PluginAutoUpdateToggleBody } from '../../../lib/arionApi';

type UpdateItem = {
  kind: 'plugin' | 'theme' | 'core';
  file?: string;          // plugin file
  stylesheet?: string;    // theme stylesheet
  name: string;
  current_version: string;
  new_version: string;
  active?: boolean;
  auto_update?: boolean;
};

/**
 * Single-pane update management. Users can see every pending update across
 * plugins, themes, and WP core; trigger an update immediately; toggle
 * auto-update per item; or enable auto-update for the entire site.
 *
 * All actions go through the IA Plugin's REST API via ARION's site-scoped
 * proxy routes — the client never needs to leave ARION.
 */
export function WebsiteUpdates() {
  const { selectedSite, activeSiteId, arionApi, loading } = useArionContext();
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [version, setVersion] = useState(0); // cache-buster for refetch

  const { data: updatesData, loading: updatesLoading } = useArionData(
    () => activeSiteId ? arionApi.getPluginUpdates(activeSiteId) : Promise.resolve(null),
    [activeSiteId, version]
  );

  const { data: autoCfg, loading: autoCfgLoading } = useArionData(
    () => activeSiteId ? arionApi.getPluginAutoUpdateConfig(activeSiteId) : Promise.resolve(null),
    [activeSiteId, version]
  );

  const { data: logData, loading: logLoading } = useArionData(
    () => activeSiteId ? arionApi.getPluginUpdatesLog(activeSiteId) : Promise.resolve(null),
    [activeSiteId, version]
  );

  const refetchAll = useCallback(() => setVersion((v) => v + 1), []);

  const flashNotice = useCallback((type: 'success' | 'error', msg: string) => {
    setNotice({ type, msg });
    setTimeout(() => setNotice(null), 6000);
  }, []);

  const setBusyFor = (key: string, val: boolean) => setBusy((prev) => ({ ...prev, [key]: val }));

  const handleUpdatePlugin = useCallback(async (pluginFile: string) => {
    if (!activeSiteId) return;
    setBusyFor(`plugin:${pluginFile}`, true);
    try {
      const r: any = await arionApi.updatePluginByFile(activeSiteId, pluginFile);
      if (r.data?.success) flashNotice('success', `Updated ${pluginFile}`);
      else flashNotice('error', r.errors?.[0] || 'Update failed');
      refetchAll();
    } catch (err: any) {
      flashNotice('error', err?.message || 'Update request failed');
    } finally {
      setBusyFor(`plugin:${pluginFile}`, false);
    }
  }, [activeSiteId, arionApi, flashNotice, refetchAll]);

  const handleUpdateTheme = useCallback(async (stylesheet: string) => {
    if (!activeSiteId) return;
    setBusyFor(`theme:${stylesheet}`, true);
    try {
      const r: any = await arionApi.updateThemeByStylesheet(activeSiteId, stylesheet);
      if (r.data?.success) flashNotice('success', `Updated theme ${stylesheet}`);
      else flashNotice('error', r.errors?.[0] || 'Theme update failed');
      refetchAll();
    } catch (err: any) {
      flashNotice('error', err?.message || 'Theme update request failed');
    } finally {
      setBusyFor(`theme:${stylesheet}`, false);
    }
  }, [activeSiteId, arionApi, flashNotice, refetchAll]);

  const handleUpdateCore = useCallback(async () => {
    if (!activeSiteId) return;
    if (!window.confirm('Updating WordPress core can take 1-2 minutes. Continue?')) return;
    setBusyFor('core', true);
    try {
      const r: any = await arionApi.updateWpCore(activeSiteId);
      if (r.data?.success) flashNotice('success', 'WordPress core updated');
      else flashNotice('error', r.errors?.[0] || 'Core update failed');
      refetchAll();
    } catch (err: any) {
      flashNotice('error', err?.message || 'Core update request failed');
    } finally {
      setBusyFor('core', false);
    }
  }, [activeSiteId, arionApi, flashNotice, refetchAll]);

  const handleToggleAutoUpdate = useCallback(async (body: PluginAutoUpdateToggleBody, key: string) => {
    if (!activeSiteId) return;
    setBusyFor(`auto:${key}`, true);
    try {
      const r: any = await arionApi.setPluginAutoUpdateConfig(activeSiteId, body);
      if (r.data?.changes?.length) flashNotice('success', 'Auto-update updated');
      else flashNotice('error', r.errors?.[0] || 'Toggle failed');
      refetchAll();
    } catch (err: any) {
      flashNotice('error', err?.message || 'Toggle failed');
    } finally {
      setBusyFor(`auto:${key}`, false);
    }
  }, [activeSiteId, arionApi, flashNotice, refetchAll]);

  if (loading) return <Loading />;
  if (!selectedSite) return <div style={{ padding: 24, color: 'var(--text-muted)' }}>No site selected.</div>;

  const updates = (updatesData as any)?.data ?? null;
  const pluginStatus = (updatesData as any)?.plugin_status;
  const cfg = (autoCfg as any)?.data ?? null;
  const logEntries: any[] = (logData as any)?.data?.entries ?? [];
  const allItems: UpdateItem[] = [];

  if (updates?.plugins) {
    for (const p of updates.plugins) {
      const autoEntry = cfg?.plugins?.find((x: any) => x.file === p.file);
      allItems.push({
        kind: 'plugin',
        file: p.file,
        name: p.name,
        current_version: p.current_version,
        new_version: p.new_version,
        active: p.active,
        auto_update: Boolean(autoEntry?.auto_update),
      });
    }
  }
  if (updates?.themes) {
    for (const t of updates.themes) {
      const autoEntry = cfg?.themes?.find((x: any) => x.stylesheet === t.stylesheet);
      allItems.push({
        kind: 'theme',
        stylesheet: t.stylesheet,
        name: t.name,
        current_version: t.current_version,
        new_version: t.new_version,
        auto_update: Boolean(autoEntry?.auto_update),
      });
    }
  }
  if (updates?.core_update) {
    allItems.push({
      kind: 'core',
      name: 'WordPress Core',
      current_version: updates.core_update.current_version,
      new_version: updates.core_update.new_version,
    });
  }

  const totalPlugins = updates?.plugin_update_count ?? 0;
  const totalThemes = updates?.theme_update_count ?? 0;
  const hasCoreUpdate = !!updates?.core_update;

  const pluginConnected = pluginStatus === 'connected';

  return (
    <div>
      {/* Plugin connection banner */}
      {!pluginConnected && (updatesLoading || autoCfgLoading ? null : (
        <div style={{ background: '#FEF3C7', borderLeft: '4px solid #D97706', padding: '12px 16px', marginBottom: 16, borderRadius: 4, fontSize: 13 }}>
          <strong>Plugin not reachable.</strong> ARION can't reach the IA Plugin on this site (status: {pluginStatus || 'unknown'}). Update management requires the plugin to be installed, activated, and connected.
        </div>
      ))}

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

      {/* Summary row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
        <SummaryTile label="Plugin updates" value={totalPlugins} tone={totalPlugins > 0 ? 'warn' : 'ok'} />
        <SummaryTile label="Theme updates" value={totalThemes} tone={totalThemes > 0 ? 'warn' : 'ok'} />
        <SummaryTile label="Core update" value={hasCoreUpdate ? 'Available' : 'Current'} tone={hasCoreUpdate ? 'warn' : 'ok'} />
        <SummaryTile label="Total pending" value={allItems.length} tone={allItems.length > 0 ? 'warn' : 'ok'} />
      </div>

      {/* Master auto-update toggles */}
      <Card title="Auto-update defaults">
        <div style={{ fontSize: 12, color: '#5A7A8A', marginBottom: 12 }}>
          Enable auto-updates to let WordPress apply routine security + maintenance updates without manual action. IA-managed updates remain available as a safer alternative for high-traffic sites.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
          <ToggleRow
            label="Auto-update all plugins"
            sub="When enabled, every installed plugin will update automatically when a new version ships."
            checked={Boolean(cfg?.auto_update_all_plugins)}
            disabled={!pluginConnected || busy['auto:all_plugins']}
            onChange={(v) => handleToggleAutoUpdate({ all_plugins: v }, 'all_plugins')}
          />
          <ToggleRow
            label="Auto-update all themes"
            sub="Auto-update both the active theme and any inactive themes installed on the site."
            checked={Boolean(cfg?.auto_update_all_themes)}
            disabled={!pluginConnected || busy['auto:all_themes']}
            onChange={(v) => handleToggleAutoUpdate({ all_themes: v }, 'all_themes')}
          />
        </div>
        <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 10, lineHeight: 1.5 }}>
          Core auto-updates are managed globally by hosting policy.
          {cfg && (
            <> Currently: <strong>minor {cfg.core_minor_enabled ? 'on' : 'off'}</strong> · <strong>major {cfg.core_major_enabled ? 'on' : 'off'}</strong>.</>
          )}
        </div>
      </Card>

      {/* Updates available table */}
      <Card title={`Available updates${allItems.length > 0 ? ` (${allItems.length})` : ''}`}>
        {allItems.length === 0 ? (
          <div style={{ padding: 20, color: '#5A7A8A', fontSize: 13, textAlign: 'center', background: '#F8FAFC', borderRadius: 6 }}>
            {pluginConnected ? 'Everything is up to date.' : 'Connect the plugin to see available updates.'}
          </div>
        ) : (
          <table className="tbl" style={{ width: '100%', fontSize: 12 }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>Component</th>
                <th style={{ textAlign: 'left' }}>Type</th>
                <th style={{ textAlign: 'left' }}>Current</th>
                <th style={{ textAlign: 'left' }}>New</th>
                <th style={{ textAlign: 'center' }}>Auto</th>
                <th style={{ textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {allItems.map((it, i) => {
                const key = `${it.kind}:${it.file || it.stylesheet || 'core'}`;
                const isBusy = Boolean(busy[key]);
                return (
                  <tr key={key + i}>
                    <td>
                      <div style={{ fontWeight: 500 }}>{it.name}</div>
                      {it.active && <span style={{ fontSize: 10, color: '#1D9E75', marginLeft: 0 }}>• active</span>}
                    </td>
                    <td style={{ textTransform: 'capitalize', color: '#5A7A8A' }}>{it.kind}</td>
                    <td><code style={{ fontSize: 11 }}>{it.current_version}</code></td>
                    <td><code style={{ fontSize: 11, color: '#EF6C33' }}>{it.new_version}</code></td>
                    <td style={{ textAlign: 'center' }}>
                      {it.kind === 'core' ? (
                        <span style={{ fontSize: 10, color: '#94A3B8' }}>—</span>
                      ) : (
                        <InlineToggle
                          checked={Boolean(it.auto_update)}
                          disabled={!pluginConnected || Boolean(busy[`auto:${it.file || it.stylesheet}`])}
                          onChange={(v) => handleToggleAutoUpdate(
                            it.kind === 'plugin' ? { plugin: it.file!, enabled: v } : { theme: it.stylesheet!, enabled: v },
                            String(it.file || it.stylesheet)
                          )}
                        />
                      )}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        disabled={!pluginConnected || isBusy}
                        onClick={() => it.kind === 'plugin' ? handleUpdatePlugin(it.file!)
                          : it.kind === 'theme' ? handleUpdateTheme(it.stylesheet!)
                          : handleUpdateCore()}
                        style={{
                          padding: '5px 12px', fontSize: 11, fontWeight: 600,
                          background: '#0B1C24', color: '#fff',
                          border: 'none', borderRadius: 5,
                          cursor: !pluginConnected || isBusy ? 'not-allowed' : 'pointer',
                          opacity: !pluginConnected || isBusy ? 0.5 : 1,
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
        )}
      </Card>

      {/* Update history */}
      <Card title="Update history">
        {logLoading ? (
          <div style={{ padding: 10, color: '#5A7A8A', fontSize: 12 }}>Loading…</div>
        ) : logEntries.length === 0 ? (
          <div style={{ padding: 14, color: '#5A7A8A', fontSize: 12, textAlign: 'center' }}>No updates have been triggered through ARION yet.</div>
        ) : (
          <table className="tbl" style={{ width: '100%', fontSize: 11 }}>
            <thead>
              <tr>
                <th>When</th>
                <th>Type</th>
                <th>Target</th>
                <th>Status</th>
                <th>Triggered by</th>
              </tr>
            </thead>
            <tbody>
              {logEntries.slice(0, 20).map((e: any) => (
                <tr key={e.log_id}>
                  <td style={{ color: '#5A7A8A' }}>{e.triggered_at ? new Date(e.triggered_at).toLocaleString() : '—'}</td>
                  <td style={{ textTransform: 'capitalize' }}>{e.update_type}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: 10 }}>{e.target}</td>
                  <td>
                    <span style={{
                      fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 3,
                      background: e.status === 'success' ? '#F0FDF4' : e.status === 'failure' ? '#FEF2F2' : '#F1F5F9',
                      color: e.status === 'success' ? '#065F46' : e.status === 'failure' ? '#991B1B' : '#64748B',
                    }}>{e.status}</span>
                  </td>
                  <td style={{ fontSize: 10, color: '#5A7A8A' }}>{e.triggered_by || 'system'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <ConsultingUpsell
        headline="IA-managed updates are tested before deployment"
        subtext="High-traffic sites benefit from IA's staging-tested update policy — every update verified against your critical workflows before going live."
        serviceType="IT & Hosting Management"
        triggerPage="website-updates"
      />
    </div>
  );
}

function SummaryTile({ label, value, tone }: { label: string; value: string | number; tone: 'ok' | 'warn' | 'error' }) {
  const colors: Record<string, { bg: string; border: string; text: string }> = {
    ok:    { bg: '#F0FDF4', border: '#1D9E75', text: '#065F46' },
    warn:  { bg: '#FEF3C7', border: '#D97706', text: '#78350F' },
    error: { bg: '#FEF2F2', border: '#D85A30', text: '#991B1B' },
  };
  const c = colors[tone];
  return (
    <div style={{ background: c.bg, borderLeft: `3px solid ${c.border}`, borderRadius: 6, padding: '10px 14px' }}>
      <div style={{ fontSize: 10, color: c.text, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: '#0B1C24', marginTop: 4 }}>{value}</div>
    </div>
  );
}

function ToggleRow({ label, sub, checked, disabled, onChange }: { label: string; sub: string; checked: boolean; disabled?: boolean; onChange: (v: boolean) => void }) {
  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: 6, padding: '12px 14px', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#0B1C24' }}>{label}</div>
        <div style={{ fontSize: 11, color: '#5A7A8A', marginTop: 3, lineHeight: 1.5 }}>{sub}</div>
      </div>
      <InlineToggle checked={checked} disabled={disabled} onChange={onChange} />
    </div>
  );
}

function InlineToggle({ checked, disabled, onChange }: { checked: boolean; disabled?: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      style={{
        width: 38, height: 22, borderRadius: 11,
        background: checked ? '#1D9E75' : '#CBD5E1',
        border: 'none',
        position: 'relative',
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'background 0.15s',
        opacity: disabled ? 0.5 : 1,
        flexShrink: 0,
      }}
      aria-checked={checked}
      role="switch"
    >
      <span style={{
        position: 'absolute',
        top: 2, left: checked ? 18 : 2,
        width: 18, height: 18, borderRadius: '50%',
        background: '#fff',
        transition: 'left 0.15s',
        boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
      }} />
    </button>
  );
}
