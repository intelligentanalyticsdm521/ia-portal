import React from 'react';
import { useArionContext } from '../../useArionContext';
import { useArionData } from '../../useArionData';
import { StatCard, Card, HealthRow, Loading, ConsultingUpsell, ScoreCircle } from '../../components/Ui';

/**
 * Performance & Cache — live LiteSpeed + PageSpeed data from the IA Plugin.
 *
 * Surfaces:
 *   - LiteSpeed cache + optimization toggles (per-feature health)
 *   - Derived optimization score (0-100) from toggles
 *   - ShortPixel image optimization stats
 *   - Server config (PHP / MySQL / memory / opcache)
 *   - WP cron queue health (overdue events flag)
 *   - Core Web Vitals (from pagespeed_history snapshot if available)
 */
export function PerformanceCache() {
  const { selectedSite, activeSiteId, arionApi, loading } = useArionContext();

  const { data: perfEnv, loading: perfLoading } = useArionData(
    () => activeSiteId ? arionApi.getPluginPerformance(activeSiteId) : Promise.resolve(null),
    [activeSiteId]
  );

  const { data: pagespeed, loading: psLoading } = useArionData(
    () => activeSiteId ? arionApi.getPagespeedHistory(activeSiteId) : Promise.resolve(null),
    [activeSiteId]
  );

  if (loading || perfLoading) return <Loading />;
  if (!selectedSite) return <div style={{ padding: 24, color: 'var(--text-muted)' }}>No site selected.</div>;

  const env = (perfEnv as any) || {};
  const pluginStatus = env.plugin_status;
  const data = env.data || {};
  const ls = data.litespeed || null;
  const sp = data.shortpixel || null;
  const srv = data.server || null;
  const cron = data.cron || null;
  const pluginConnected = pluginStatus === 'connected';

  const ps = (pagespeed as any)?.data ?? {};
  const snapshots: any[] = Array.isArray(ps.snapshots) ? ps.snapshots : [];
  const latest = snapshots.length > 0 ? snapshots[snapshots.length - 1] : null;
  const mobileScore = latest?.mobile?.performance ?? latest?.mobileScore ?? null;
  const desktopScore = latest?.desktop?.performance ?? latest?.desktopScore ?? null;
  const metrics = latest?.mobile?.metrics ?? latest?.metrics ?? {};
  const lcp = metrics.lcp ?? null;
  const inp = metrics.inp ?? null;
  const cls = metrics.cls ?? null;

  const cwvColor = (metric: string, v: number | null) => {
    if (v == null || isNaN(Number(v))) return '#6b7280';
    const val = Number(v);
    if (metric === 'lcp') return val <= 2500 ? '#22c55e' : val <= 4000 ? '#f59e0b' : '#dc2626';
    if (metric === 'inp') return val <= 200 ? '#22c55e' : val <= 500 ? '#f59e0b' : '#dc2626';
    if (metric === 'cls') return val <= 0.1 ? '#22c55e' : val <= 0.25 ? '#f59e0b' : '#dc2626';
    return '#6b7280';
  };
  const cwvWidth = (metric: string, v: number | null) => {
    if (v == null || isNaN(Number(v))) return '10%';
    const val = Number(v);
    if (metric === 'lcp') return `${Math.min((val / 6000) * 100, 100)}%`;
    if (metric === 'inp') return `${Math.min((val / 800) * 100, 100)}%`;
    if (metric === 'cls') return `${Math.min((val / 0.5) * 100, 100)}%`;
    return '10%';
  };

  const handlePurgeCache = async () => {
    if (!activeSiteId) return;
    try {
      await arionApi.submitRequest(activeSiteId, 'cache_purge', 'Triggered from ARION performance page');
      alert('Cache purge requested.');
    } catch {
      alert('Failed to request cache purge.');
    }
  };

  return (
    <div>
      {!pluginConnected && (
        <div style={{ background: '#FEF3C7', borderLeft: '4px solid #D97706', padding: '12px 16px', marginBottom: 16, borderRadius: 4, fontSize: 13 }}>
          <strong>Plugin not reachable.</strong> LiteSpeed + ShortPixel + server metrics require the IA Plugin. Status: <code>{pluginStatus || 'unknown'}</code>
        </div>
      )}

      {/* Top score row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
        <StatCard label="Mobile Score" value="">
          <ScoreCircle score={typeof mobileScore === 'number' ? mobileScore : null} label="Mobile" />
        </StatCard>
        <StatCard label="Desktop Score" value="">
          <ScoreCircle score={typeof desktopScore === 'number' ? desktopScore : null} label="Desktop" />
        </StatCard>
        <StatCard
          label="LiteSpeed optimization"
          value={ls?.installed ? `${ls.optimization_score ?? 0}%` : 'Not installed'}
        />
        <StatCard
          label="Last PageSpeed run"
          value={latest?.timestamp ? new Date(latest.timestamp).toLocaleDateString() : '—'}
        />
      </div>

      {/* LiteSpeed detail */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
        <Card title="LiteSpeed Cache">
          {!ls?.installed ? (
            <EmptyInline message="LiteSpeed Cache is not installed on this site. Install via WP admin → Plugins → Add New → search 'LiteSpeed Cache'." />
          ) : (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <ToggleStatus enabled={!!ls.cache_enabled} label="Page cache" />
                <ToggleStatus enabled={!!ls.object_cache} label="Object cache" />
                <ToggleStatus enabled={!!ls.browser_cache} label="Browser cache" />
                <ToggleStatus enabled={!!ls.mobile_cache} label="Mobile cache" />
                <ToggleStatus enabled={!!ls.css_minify} label="CSS minify" />
                <ToggleStatus enabled={!!ls.js_minify} label="JS minify" />
                <ToggleStatus enabled={!!ls.css_combine} label="CSS combine" />
                <ToggleStatus enabled={!!ls.js_combine} label="JS combine" />
                <ToggleStatus enabled={!!ls.lazy_load_images} label="Lazy-load images" />
                <ToggleStatus enabled={!!ls.lazy_load_iframes} label="Lazy-load iframes" />
                <ToggleStatus enabled={!!ls.image_optimization} label="Image optimization" />
                <ToggleStatus enabled={!!ls.webp_replace} label="WebP replacement" />
              </div>
              <div style={{ marginTop: 14 }}>
                <button className="abtn abtn-outline" onClick={handlePurgeCache}>Purge Cache</button>
              </div>
            </div>
          )}
        </Card>

        <Card title="ShortPixel (image optimization)">
          {!sp?.installed ? (
            <EmptyInline message="ShortPixel is not installed. The plugin optimizes images automatically and converts to WebP, saving 30-60% on image bytes." />
          ) : (
            <div>
              <HealthRow status="ok" label="Images optimized" value={sp.images_optimized?.toLocaleString() ?? '—'} />
              <HealthRow status="ok" label="Bytes saved" value={sp.bytes_saved != null ? `${(sp.bytes_saved / (1024 * 1024)).toFixed(1)} MB` : '—'} />
              <HealthRow status={sp.quota_exceeded ? 'err' : 'ok'} label="Quota exceeded" value={sp.quota_exceeded ? 'Yes' : 'No'} />
            </div>
          )}
        </Card>
      </div>

      {/* Server + cron */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
        <Card title="Server environment">
          {!srv ? (
            <EmptyInline message="Awaiting plugin connection." />
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

        <Card title="WordPress cron health">
          {!cron ? (
            <EmptyInline message="Awaiting plugin connection." />
          ) : (
            <div>
              <HealthRow status="ok" label="Queued events" value={cron.queued_events?.toLocaleString() ?? '0'} />
              <HealthRow status={cron.overdue_events > 0 ? 'warn' : 'ok'} label="Overdue events (>1h)" value={cron.overdue_events ?? 0} />
              <HealthRow status={cron.disabled ? 'warn' : 'ok'} label="WP_CRON disabled" value={cron.disabled ? 'Yes (server cron recommended)' : 'No'} />
              {cron.overdue_events > 0 && (
                <div style={{ marginTop: 10, padding: 10, background: '#FEF3C7', fontSize: 11, color: '#78350F', borderRadius: 4 }}>
                  {cron.overdue_events} stuck events — may indicate cron is not firing. Server-side cron is more reliable than WP_CRON.
                </div>
              )}
            </div>
          )}
        </Card>
      </div>

      {/* Core Web Vitals */}
      <Card title="Core Web Vitals">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          {[
            { key: 'lcp', label: 'LCP', full: 'Largest Contentful Paint', value: lcp, unit: 'ms', targetGood: '≤2.5s', targetPoor: '>4s' },
            { key: 'inp', label: 'INP', full: 'Interaction to Next Paint', value: inp, unit: 'ms', targetGood: '≤200ms', targetPoor: '>500ms' },
            { key: 'cls', label: 'CLS', full: 'Cumulative Layout Shift', value: cls, unit: '', targetGood: '≤0.1', targetPoor: '>0.25' },
          ].map((m) => (
            <div key={m.key} style={{ background: '#F8FAFC', borderRadius: 6, padding: '12px 14px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#0B1C24' }}>{m.label}</div>
              <div style={{ fontSize: 10, color: '#5A7A8A', marginBottom: 8 }}>{m.full}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: cwvColor(m.key, m.value as number | null), marginBottom: 4 }}>
                {m.value != null ? `${m.value}${m.unit}` : '—'}
              </div>
              <div style={{ background: '#e5e7eb', borderRadius: 3, height: 6, marginTop: 8, overflow: 'hidden' }}>
                <div style={{ width: cwvWidth(m.key, m.value as number | null), height: '100%', background: cwvColor(m.key, m.value as number | null), borderRadius: 3 }} />
              </div>
              <div style={{ fontSize: 9, color: '#94A3B8', marginTop: 6 }}>Good: {m.targetGood} · Poor: {m.targetPoor}</div>
            </div>
          ))}
        </div>
      </Card>

      <ConsultingUpsell
        headline="Core Web Vitals impact rankings — let IA's performance team optimize"
        subtext="Google uses CWV as a ranking signal. If any metric is red, we can identify + fix the root cause."
        serviceType="Performance Optimization"
        triggerPage="performance-cache"
      />
    </div>
  );
}

function ToggleStatus({ enabled, label }: { enabled: boolean; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '4px 0' }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: enabled ? '#1D9E75' : '#CBD5E1' }} />
      <span style={{ color: enabled ? '#0B1C24' : '#94A3B8' }}>{label}</span>
    </div>
  );
}

function EmptyInline({ message }: { message: string }) {
  return <div style={{ padding: 12, color: '#5A7A8A', fontSize: 12, background: '#F8FAFC', borderRadius: 4, lineHeight: 1.5 }}>{message}</div>;
}
