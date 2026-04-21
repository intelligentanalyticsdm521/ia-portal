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

  const { data: allPluginsEnv, loading: allPluginsLoading } = useArionData(
    () => activeSiteId ? arionApi.getPluginPlugins(activeSiteId) : Promise.resolve(null),
    [activeSiteId, version]
  );

  const { data: logData, loading: logLoading } = useArionData(
    () => activeSiteId ? arionApi.getPluginUpdatesLog(activeSiteId) : Promise.resolve(null),
    [activeSiteId, version]
  );

  // v2.0.7 — plugin risk/age distribution
  const { data: riskEnv } = useArionData(
    () => activeSiteId ? arionApi.getPluginRiskAnalysis(activeSiteId) : Promise.resolve(null),
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
      const d = r.data?.detail?.data || r.data;
      if (r.data?.success) {
        // v2.0.11 — Surface plugin activation state honestly. If plugin was
        // active before update but isn't now, the upgrade deactivated it.
        if (d?.was_active && !d?.is_active) {
          flashNotice('error', `Updated ${pluginFile} BUT plugin is now deactivated. Reactivation error: ${d?.reactivate_error || 'unknown'}. Go to WP Admin → Plugins to reactivate.`);
        } else if (d?.was_active && d?.reactivated) {
          flashNotice('success', `Updated ${pluginFile} — reactivated automatically.`);
        } else {
          flashNotice('success', `Updated ${pluginFile}`);
        }
      } else {
        flashNotice('error', r.errors?.[0] || 'Update failed');
      }
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

      {/* Plugin freshness + update history visuals */}
      {(() => {
        const riskPlugins: any[] = (riskEnv as any)?.data?.plugins || [];
        if (riskPlugins.length === 0) return null;
        const buckets = { fresh: 0, current: 0, aging: 0, stale: 0 };
        for (const p of riskPlugins) {
          const d = p.days_since_last_update;
          if (d == null) continue;
          if (d < 90) buckets.fresh++;
          else if (d < 365) buckets.current++;
          else if (d < 730) buckets.aging++;
          else buckets.stale++;
        }
        const total = buckets.fresh + buckets.current + buckets.aging + buckets.stale;
        if (total === 0) return null;
        const ageItems = [
          { label: 'Fresh (<90d)', count: buckets.fresh, color: '#1D9E75' },
          { label: 'Current (<1y)', count: buckets.current, color: '#0284c7' },
          { label: 'Aging (1-2y)', count: buckets.aging, color: '#D97706' },
          { label: 'Stale (>2y)', count: buckets.stale, color: '#D85A30' },
        ];
        const logs: any[] = (logData as any)?.data?.logs || [];
        return (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <Card title="Plugin freshness (upstream)">
              <div style={{ fontSize: 11, color: '#5A7A8A', marginBottom: 12, lineHeight: 1.5 }}>
                How recently the plugin developers shipped a release. Stale plugins (no upstream update in 1+ year) are higher-risk because unpatched vulns compound over time.
              </div>
              <div style={{ display: 'flex', height: 24, borderRadius: 4, overflow: 'hidden', marginBottom: 10 }}>
                {ageItems.map((b) => b.count > 0 && (
                  <div key={b.label} style={{ width: `${(b.count / total) * 100}%`, background: b.color }} title={`${b.label}: ${b.count}`} />
                ))}
              </div>
              {ageItems.map((b) => (
                <div key={b.label} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0', fontSize: 12 }}>
                  <span style={{ width: 10, height: 10, background: b.color, borderRadius: 2 }} />
                  <span style={{ flex: 1 }}>{b.label}</span>
                  <strong>{b.count}</strong>
                </div>
              ))}
            </Card>

            <Card title="Recent update history">
              {logs.length === 0 ? (
                <div style={{ padding: 12, fontSize: 12, color: '#5A7A8A' }}>No updates applied via ARION yet.</div>
              ) : (
                <table className="tbl" style={{ width: '100%', fontSize: 11 }}>
                  <thead>
                    <tr>
                      <th>Type</th>
                      <th>Target</th>
                      <th>Status</th>
                      <th>When</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.slice(0, 8).map((row: any) => (
                      <tr key={row.log_id}>
                        <td style={{ textTransform: 'capitalize', color: '#5A7A8A' }}>{row.update_type}</td>
                        <td style={{ fontFamily: 'monospace', fontSize: 10, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.target}</td>
                        <td>
                          <span style={{ fontSize: 9, fontWeight: 600, padding: '1px 6px', borderRadius: 3,
                            background: row.status === 'success' ? '#F0FDF4' : row.status === 'pending' ? '#EFF6FF' : '#FEF2F2',
                            color: row.status === 'success' ? '#065F46' : row.status === 'pending' ? '#1E40AF' : '#991B1B',
                            textTransform: 'uppercase' }}>
                            {row.status}
                          </span>
                        </td>
                        <td style={{ color: '#94A3B8', fontSize: 10 }}>{row.started_at ? new Date(row.started_at).toLocaleString() : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
          </div>
        );
      })()}

      {/* All plugins/themes/core — shows current state + actions per row */}
      {(() => {
        const allPluginsList: any[] = (allPluginsEnv as any)?.data || [];
        const allAutoCfg: any = cfg || null;
        const pluginUpdateMap = new Map<string, any>();
        if (updates?.plugins) for (const p of updates.plugins) pluginUpdateMap.set(p.file, p);

        // Merge live plugin inventory with update info + auto-update config
        const pluginRows = allPluginsList.map((p: any) => {
          const upd = pluginUpdateMap.get(p.file);
          const autoEntry = allAutoCfg?.plugins?.find((x: any) => x.file === p.file);
          return {
            kind: 'plugin' as const,
            file: p.file,
            name: p.name,
            current_version: p.version,
            new_version: upd?.new_version || null,
            active: p.active,
            update_available: Boolean(upd),
            auto_update: Boolean(autoEntry?.auto_update),
          };
        });

        // Merge theme updates with theme list from auto-update config (which contains ALL themes)
        const themeRows = (allAutoCfg?.themes || []).map((t: any) => {
          const updList = updates?.themes || [];
          const upd = updList.find((x: any) => x.stylesheet === t.stylesheet);
          return {
            kind: 'theme' as const,
            stylesheet: t.stylesheet,
            name: t.name,
            current_version: t.version,
            new_version: upd?.new_version || null,
            active: t.active,
            update_available: Boolean(upd),
            auto_update: Boolean(t.auto_update),
          };
        });

        const coreRow = updates?.core_update ? [{
          kind: 'core' as const,
          name: 'WordPress Core',
          current_version: updates.core_update.current_version,
          new_version: updates.core_update.new_version,
          active: true,
          update_available: true,
          auto_update: false,
        }] : [];

        const [filter, setFilter] = ['all', () => {}] as const; // placeholder — actual state below via hook
        return (
          <PluginInventoryTable
            plugins={pluginRows}
            themes={themeRows}
            coreRow={coreRow}
            pluginConnected={pluginConnected}
            busy={busy}
            onUpdatePlugin={handleUpdatePlugin}
            onUpdateTheme={handleUpdateTheme}
            onUpdateCore={handleUpdateCore}
            onToggleAutoUpdate={handleToggleAutoUpdate}
            loading={allPluginsLoading || updatesLoading}
          />
        );
      })()}

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

type InventoryRow = {
  kind: 'plugin' | 'theme' | 'core';
  file?: string;
  stylesheet?: string;
  name: string;
  current_version: string;
  new_version: string | null;
  active: boolean;
  update_available: boolean;
  auto_update: boolean;
};

function PluginInventoryTable({
  plugins, themes, coreRow, pluginConnected, busy,
  onUpdatePlugin, onUpdateTheme, onUpdateCore, onToggleAutoUpdate, loading,
}: {
  plugins: InventoryRow[];
  themes: InventoryRow[];
  coreRow: InventoryRow[];
  pluginConnected: boolean;
  busy: Record<string, boolean>;
  onUpdatePlugin: (f: string) => void;
  onUpdateTheme: (s: string) => void;
  onUpdateCore: () => void;
  onToggleAutoUpdate: (body: PluginAutoUpdateToggleBody, key: string) => void;
  loading: boolean;
}) {
  const [filter, setFilter] = React.useState<'all' | 'plugins' | 'themes' | 'needs_update' | 'active'>('all');

  let rows: InventoryRow[] = [];
  if (filter === 'all' || filter === 'plugins') rows = rows.concat(plugins);
  if (filter === 'all' || filter === 'themes') rows = rows.concat(themes);
  if (filter === 'all') rows = rows.concat(coreRow);
  if (filter === 'needs_update') rows = [...plugins, ...themes, ...coreRow].filter((r) => r.update_available);
  if (filter === 'active') rows = [...plugins, ...themes].filter((r) => r.active);

  // Sort: updates first (update_available=true), then by name
  rows.sort((a, b) => {
    if (a.update_available !== b.update_available) return a.update_available ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  const totalPluginsNeedingUpdate = plugins.filter((p) => p.update_available).length;
  const totalThemesNeedingUpdate = themes.filter((t) => t.update_available).length;

  return (
    <Card title={`Plugins, Themes & Core${rows.length ? ` (${rows.length})` : ''}`}>
      {/* Filter pills */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        {[
          { k: 'all', label: `All (${plugins.length + themes.length + coreRow.length})` },
          { k: 'plugins', label: `Plugins (${plugins.length})` },
          { k: 'themes', label: `Themes (${themes.length})` },
          { k: 'active', label: `Active only` },
          { k: 'needs_update', label: `Needs update (${totalPluginsNeedingUpdate + totalThemesNeedingUpdate + coreRow.length})` },
        ].map((p) => (
          <button
            key={p.k}
            onClick={() => setFilter(p.k as any)}
            style={{
              padding: '4px 12px', fontSize: 11, fontWeight: 600,
              background: filter === p.k ? '#0B1C24' : '#F1F5F9',
              color: filter === p.k ? '#fff' : '#5A7A8A',
              border: 'none', borderRadius: 4, cursor: 'pointer',
            }}
          >
            {p.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ padding: 20, color: '#5A7A8A', fontSize: 12, textAlign: 'center' }}>Loading plugin inventory…</div>
      ) : rows.length === 0 ? (
        <div style={{ padding: 20, color: '#5A7A8A', fontSize: 13, textAlign: 'center', background: '#F8FAFC', borderRadius: 6 }}>
          {pluginConnected ? 'No plugins match this filter.' : 'Connect the plugin to see inventory.'}
        </div>
      ) : (
        <table className="tbl" style={{ width: '100%', fontSize: 12 }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', width: '32%' }}>Component</th>
              <th style={{ textAlign: 'left' }}>Type</th>
              <th style={{ textAlign: 'left' }}>Current</th>
              <th style={{ textAlign: 'left' }}>Status</th>
              <th style={{ textAlign: 'center' }}>Auto-update</th>
              <th style={{ textAlign: 'right' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((it) => {
              const key = `${it.kind}:${it.file || it.stylesheet || 'core'}`;
              const isBusy = Boolean(busy[key]);
              const autoKey = `auto:${it.file || it.stylesheet}`;
              return (
                <tr key={key}>
                  <td>
                    <div style={{ fontWeight: 500 }}>{it.name}</div>
                    {it.active && <span style={{ fontSize: 10, color: '#1D9E75' }}>● active</span>}
                    {!it.active && it.kind !== 'core' && <span style={{ fontSize: 10, color: '#94A3B8' }}>○ inactive</span>}
                  </td>
                  <td style={{ textTransform: 'capitalize', color: '#5A7A8A' }}>{it.kind}</td>
                  <td><code style={{ fontSize: 11 }}>{it.current_version}</code></td>
                  <td>
                    {it.update_available ? (
                      <span style={{ fontSize: 10, fontWeight: 600, background: '#FEF3C7', color: '#78350F', padding: '2px 8px', borderRadius: 3 }}>
                        Update to {it.new_version}
                      </span>
                    ) : (
                      <span style={{ fontSize: 10, fontWeight: 600, background: '#F0FDF4', color: '#065F46', padding: '2px 8px', borderRadius: 3 }}>
                        Up to date
                      </span>
                    )}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    {it.kind === 'core' ? (
                      <span style={{ fontSize: 10, color: '#94A3B8' }}>—</span>
                    ) : (
                      <InlineToggle
                        checked={it.auto_update}
                        disabled={!pluginConnected || Boolean(busy[autoKey])}
                        onChange={(v) => onToggleAutoUpdate(
                          it.kind === 'plugin' ? { plugin: it.file!, enabled: v } : { theme: it.stylesheet!, enabled: v },
                          String(it.file || it.stylesheet)
                        )}
                      />
                    )}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    {it.update_available ? (
                      <button
                        disabled={!pluginConnected || isBusy}
                        onClick={() => it.kind === 'plugin' ? onUpdatePlugin(it.file!)
                          : it.kind === 'theme' ? onUpdateTheme(it.stylesheet!)
                          : onUpdateCore()}
                        style={{
                          padding: '5px 12px', fontSize: 11, fontWeight: 600,
                          background: '#EF6C33', color: '#fff',
                          border: 'none', borderRadius: 5,
                          cursor: !pluginConnected || isBusy ? 'not-allowed' : 'pointer',
                          opacity: !pluginConnected || isBusy ? 0.5 : 1,
                        }}
                      >
                        {isBusy ? 'Updating…' : 'Update now'}
                      </button>
                    ) : isBusy ? (
                      <span style={{ fontSize: 10, color: '#D97706' }}>Refreshing…</span>
                    ) : (
                      <span style={{ fontSize: 10, color: '#1D9E75', fontWeight: 600 }}>✓ Current</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </Card>
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
