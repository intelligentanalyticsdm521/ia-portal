import React, { useState } from 'react';
import { useArionContext } from '../../useArionContext';
import { useArionData } from '../../useArionData';
import { StatCard, Card, HealthRow, Loading, ConsultingUpsell } from '../../components/Ui';

/**
 * Media — LiteSpeed image-optimization status + one-click bulk optimize.
 */
export function PerformanceImages() {
  const { selectedSite, activeSiteId, arionApi, loading } = useArionContext();
  const [optimizing, setOptimizing] = useState(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  const { data: perfEnv, loading: perfLoading, refetch } = useArionData(
    () => activeSiteId ? arionApi.getPluginPerformance(activeSiteId) : Promise.resolve(null),
    [activeSiteId]
  );

  const { data: contentEnv, loading: contentLoading } = useArionData(
    () => activeSiteId ? arionApi.getPluginContentAggregate(activeSiteId) : Promise.resolve(null),
    [activeSiteId]
  );

  if (loading || perfLoading) return <Loading />;
  if (!selectedSite) return <div style={{ padding: 24, color: 'var(--text-muted)' }}>No site selected.</div>;

  const env = (perfEnv as any) || {};
  const pluginStatus = env.plugin_status;
  const data = env.data || {};
  const ls = data.litespeed || null;
  const pluginConnected = pluginStatus === 'connected';

  const contentData = (contentEnv as any)?.data || {};
  const contentSummary = contentData.summary || null;
  const mediaCount = contentSummary?.media_count ?? null;

  const lsOptimized = ls?.installed ? ls.images_optimized ?? 0 : 0;
  const webpPulled = ls?.installed ? ls.images_pulled ?? 0 : 0;
  const pendingCount = mediaCount != null ? Math.max(0, mediaCount - lsOptimized) : null;
  const coverage = mediaCount && mediaCount > 0 ? Math.min(100, Math.round((lsOptimized / mediaCount) * 100)) : null;

  const handleRunOptimize = async () => {
    if (!activeSiteId) return;
    setOptimizing(true);
    setNotice(null);
    try {
      const res: any = await arionApi.triggerImageOptimize(activeSiteId);
      if (res?.data?.success || res?.plugin_status === 'connected') {
        const method = res?.data?.method || 'LiteSpeed';
        setNotice({ type: 'success', msg: `Bulk image optimization started (${method}). New images will be processed in the background. Refresh in a few minutes to see progress.` });
        setTimeout(() => { refetch(); }, 4000);
      } else {
        const err = (res?.errors && res.errors[0]) || 'Unable to start optimization';
        setNotice({ type: 'error', msg: String(err) });
      }
    } catch (err: any) {
      setNotice({ type: 'error', msg: err?.message || 'Optimization request failed' });
    } finally {
      setOptimizing(false);
    }
  };

  const canRunOptimize = pluginConnected && ls?.installed;

  return (
    <div>
      {!pluginConnected && (
        <div style={{ background: '#FEF3C7', borderLeft: '4px solid #D97706', padding: '12px 16px', marginBottom: 16, borderRadius: 4, fontSize: 13 }}>
          <strong>Plugin not reachable.</strong> Image optimization stats require the IA Plugin. Status: <code>{pluginStatus || 'unknown'}</code>
        </div>
      )}

      {notice && (
        <div style={{
          padding: '10px 14px', marginBottom: 12, borderRadius: 6,
          background: notice.type === 'success' ? '#F0FDF4' : '#FEF2F2',
          borderLeft: `3px solid ${notice.type === 'success' ? '#1D9E75' : '#D85A30'}`,
          color: notice.type === 'success' ? '#065F46' : '#991B1B',
          fontSize: 13,
        }}>{notice.msg}</div>
      )}

      {/* Stat row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
        <StatCard label="Total images" value={mediaCount != null ? mediaCount.toLocaleString() : '—'} />
        <StatCard label="Optimized" value={lsOptimized > 0 ? lsOptimized.toLocaleString() : '—'} deltaType="positive" />
        <StatCard label="Coverage" value={coverage != null ? `${coverage}%` : '—'} deltaType={coverage != null && coverage >= 80 ? 'positive' : coverage != null && coverage < 40 ? 'negative' : 'neutral'} />
        <StatCard label="Pending" value={pendingCount != null ? pendingCount.toLocaleString() : '—'} deltaType={pendingCount != null && pendingCount > 50 ? 'negative' : 'neutral'} />
      </div>

      {/* Coverage bar */}
      {mediaCount != null && coverage != null && (
        <Card title="Optimization coverage">
          <div style={{ marginBottom: 10, fontSize: 12, color: '#5A7A8A' }}>
            {lsOptimized.toLocaleString()} of {mediaCount.toLocaleString()} images have been optimized.
          </div>
          <div style={{ background: '#E5EEF2', height: 14, borderRadius: 7, overflow: 'hidden' }}>
            <div style={{
              width: `${coverage}%`, height: '100%',
              background: coverage >= 80 ? '#1D9E75' : coverage >= 40 ? '#D97706' : '#D85A30',
              transition: 'width 0.3s',
            }} />
          </div>
          {pendingCount != null && pendingCount > 0 && canRunOptimize && (
            <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 12, color: '#0B1C24' }}>
                <strong>{pendingCount.toLocaleString()} images</strong> waiting to be optimized.
              </div>
              <button
                className="abtn abtn-sky"
                onClick={handleRunOptimize}
                disabled={optimizing}
              >
                {optimizing ? 'Starting…' : 'Run bulk optimization'}
              </button>
            </div>
          )}
          {pendingCount === 0 && (
            <div style={{ marginTop: 14, padding: 10, background: '#F0FDF4', borderLeft: '3px solid #1D9E75', borderRadius: 4, fontSize: 12, color: '#065F46' }}>
              All images optimized. New uploads will be processed automatically.
            </div>
          )}
        </Card>
      )}

      {/* LiteSpeed image optimization toggles */}
      <div style={{ marginTop: 16 }}>
        <Card title="LiteSpeed image optimization">
          {!ls?.installed ? (
            <EmptyInline message="LiteSpeed Cache is not installed. LiteSpeed's built-in image optimization converts JPEG/PNG to WebP automatically and serves responsive sizes — install it from the Hosting → Plugins section." />
          ) : (
            <div>
              <HealthRow status={ls.image_optimization ? 'ok' : 'warn'} label="Image optimization" value={ls.image_optimization ? 'Enabled' : 'Disabled'} />
              <HealthRow status={ls.webp_replace ? 'ok' : 'warn'} label="WebP replacement" value={ls.webp_replace ? 'Serving WebP to modern browsers' : 'Original format only'} />
              <HealthRow status={ls.lazy_load_images ? 'ok' : 'warn'} label="Lazy-load images" value={ls.lazy_load_images ? 'Active' : 'Disabled'} />
              <HealthRow status={ls.lazy_load_iframes ? 'ok' : 'warn'} label="Lazy-load iframes" value={ls.lazy_load_iframes ? 'Active' : 'Disabled'} />
              <HealthRow status="ok" label="Images optimized" value={lsOptimized.toLocaleString()} />
              {webpPulled > 0 && (
                <HealthRow status="ok" label="WebP versions pulled" value={webpPulled.toLocaleString()} />
              )}
            </div>
          )}
        </Card>
      </div>

      {/* Optimization recommendations */}
      <div style={{ marginTop: 16 }}>
        <Card title="Recommendations">
          <div style={{ fontSize: 12, color: '#0B1C24', lineHeight: 1.7 }}>
            {pendingCount != null && pendingCount > 100 && (
              <div style={{ padding: 10, background: '#FEF3C7', borderLeft: '3px solid #D97706', marginBottom: 8, borderRadius: 4 }}>
                <strong style={{ color: '#78350F' }}>{pendingCount.toLocaleString()} unoptimized images</strong> — large unoptimized images are the #1 cause of slow mobile pages. Use the "Run bulk optimization" button above to process them now.
              </div>
            )}
            {ls?.installed && !ls.image_optimization && (
              <div style={{ padding: 10, background: '#FEF3C7', borderLeft: '3px solid #D97706', marginBottom: 8, borderRadius: 4 }}>
                LiteSpeed image optimization is <strong>disabled</strong>. Enable it in LiteSpeed Cache → Image Optimization for automatic ongoing image compression.
              </div>
            )}
            {ls?.installed && ls.image_optimization && !ls.webp_replace && (
              <div style={{ padding: 10, background: '#FEF3C7', borderLeft: '3px solid #D97706', marginBottom: 8, borderRadius: 4 }}>
                Image optimization is on but <strong>WebP serving is off</strong>. Enable WebP replacement — modern browsers support it and it saves 25-35% on image weight.
              </div>
            )}
            {ls?.installed && !ls.lazy_load_images && (
              <div style={{ padding: 10, background: '#FEF3C7', borderLeft: '3px solid #D97706', marginBottom: 8, borderRadius: 4 }}>
                Lazy-loading is off. Enable it so below-the-fold images don't slow your initial render.
              </div>
            )}
            {(!pendingCount || pendingCount === 0) && ls?.image_optimization && ls?.webp_replace && ls?.lazy_load_images && (
              <div style={{ padding: 10, background: '#F0FDF4', borderLeft: '3px solid #1D9E75', borderRadius: 4 }}>
                Image optimization looks healthy. Nothing urgent to address.
              </div>
            )}
          </div>
        </Card>
      </div>

      <ConsultingUpsell
        headline="Large unoptimized images are the #1 cause of slow mobile rankings"
        subtext="IA's performance team can audit your media library, set up advanced compression rules, and make sure every new upload stays optimized."
        serviceType="Performance Optimization"
        triggerPage="performance-images"
      />

      {contentLoading && <div style={{ padding: 6, fontSize: 11, color: '#94A3B8' }}>Loading media counts…</div>}
    </div>
  );
}

function EmptyInline({ message }: { message: string }) {
  return <div style={{ padding: 12, color: '#5A7A8A', fontSize: 12, background: '#F8FAFC', borderRadius: 4, lineHeight: 1.5 }}>{message}</div>;
}
