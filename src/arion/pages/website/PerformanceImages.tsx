import React, { useState } from 'react';
import { useArionContext } from '../../useArionContext';
import { useArionData } from '../../useArionData';
import { StatCard, Card, HealthRow, Loading, ConsultingUpsell } from '../../components/Ui';

/**
 * Performance — Images. Live LiteSpeed image-optimization + ShortPixel stats
 * from the IA Plugin. Falls back to friendly empty states when either plugin
 * isn't installed on the site.
 */
export function PerformanceImages() {
  const { selectedSite, activeSiteId, arionApi, loading } = useArionContext();
  const [requesting, setRequesting] = useState(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  const { data: perfEnv, loading: perfLoading } = useArionData(
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
  const sp = data.shortpixel || null;
  const pluginConnected = pluginStatus === 'connected';

  const contentData = (contentEnv as any)?.data || {};
  const contentSummary = contentData.summary || null;
  const mediaCount = contentSummary?.media_count ?? null;

  // Derived numbers
  const spOptimized = sp?.installed ? sp.images_optimized ?? 0 : null;
  const spBytesSaved = sp?.installed ? sp.bytes_saved ?? 0 : null;
  const spQuotaExceeded = sp?.installed ? !!sp.quota_exceeded : null;
  const lsOptimized = ls?.installed ? ls.images_optimized ?? null : null;

  const totalOptimized = (spOptimized || 0) + (lsOptimized || 0);
  const pendingCount = mediaCount != null ? Math.max(0, mediaCount - totalOptimized) : null;

  const handleRequestOptimize = async () => {
    if (!activeSiteId) return;
    setRequesting(true);
    try {
      await arionApi.submitRequest(activeSiteId, 'image_optimize', 'Bulk image optimization requested from ARION performance page');
      setNotice({ type: 'success', msg: 'Optimization request sent to IA team.' });
      setTimeout(() => setNotice(null), 5000);
    } catch {
      setNotice({ type: 'error', msg: 'Request failed. Try again or contact support.' });
    } finally {
      setRequesting(false);
    }
  };

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
        <StatCard label="Total images in media library" value={mediaCount != null ? mediaCount.toLocaleString() : '—'} />
        <StatCard label="Optimized" value={totalOptimized > 0 ? totalOptimized.toLocaleString() : '—'} deltaType="positive" />
        <StatCard label="Pending optimization" value={pendingCount != null ? pendingCount.toLocaleString() : '—'} deltaType={pendingCount != null && pendingCount > 50 ? 'negative' : 'neutral'} />
        <StatCard
          label="Bytes saved (ShortPixel)"
          value={spBytesSaved != null ? `${(spBytesSaved / (1024 * 1024)).toFixed(1)} MB` : '—'}
          deltaType="positive"
        />
      </div>

      {/* LiteSpeed image optimization toggles */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
        <Card title="LiteSpeed image optimization">
          {!ls?.installed ? (
            <EmptyInline message="LiteSpeed Cache is not installed. LiteSpeed's built-in image optimization converts JPEG/PNG to WebP automatically and serves responsive sizes." />
          ) : (
            <div>
              <HealthRow status={ls.image_optimization ? 'ok' : 'warn'} label="Image optimization" value={ls.image_optimization ? 'Enabled' : 'Disabled'} />
              <HealthRow status={ls.webp_replace ? 'ok' : 'warn'} label="WebP replacement" value={ls.webp_replace ? 'Serving WebP' : 'Original format only'} />
              <HealthRow status={ls.lazy_load_images ? 'ok' : 'warn'} label="Lazy-load images" value={ls.lazy_load_images ? 'Active' : 'Disabled'} />
              <HealthRow status={ls.lazy_load_iframes ? 'ok' : 'warn'} label="Lazy-load iframes" value={ls.lazy_load_iframes ? 'Active' : 'Disabled'} />
              {ls.images_optimized != null && (
                <HealthRow status="ok" label="Images optimized (LS)" value={ls.images_optimized.toLocaleString()} />
              )}
              {ls.images_pulled != null && (
                <HealthRow status="ok" label="WebP pulled from server" value={ls.images_pulled.toLocaleString()} />
              )}
            </div>
          )}
        </Card>

        <Card title="ShortPixel">
          {!sp?.installed ? (
            <EmptyInline message="ShortPixel is not installed. It's a companion to LiteSpeed — ShortPixel runs deeper compression + bulk-processes existing images beyond LiteSpeed's live optimization." />
          ) : (
            <div>
              <HealthRow status="ok" label="Installed" value="Yes" />
              <HealthRow status="ok" label="Images optimized" value={sp.images_optimized != null ? sp.images_optimized.toLocaleString() : '—'} />
              <HealthRow status="ok" label="Total bytes saved" value={sp.bytes_saved != null ? `${(sp.bytes_saved / (1024 * 1024)).toFixed(1)} MB` : '—'} />
              <HealthRow status={spQuotaExceeded ? 'err' : 'ok'} label="Quota status" value={spQuotaExceeded ? 'Exceeded — upgrade plan' : 'Within limits'} />
              {sp.credits_remaining != null && (
                <HealthRow status="ok" label="Credits remaining" value={sp.credits_remaining.toLocaleString()} />
              )}
            </div>
          )}
        </Card>
      </div>

      {/* Optimization recommendations */}
      <Card title="Recommendations">
        <div style={{ fontSize: 12, color: '#0B1C24', lineHeight: 1.7 }}>
          {pendingCount != null && pendingCount > 100 && (
            <div style={{ padding: 10, background: '#FEF3C7', borderLeft: '3px solid #D97706', marginBottom: 8, borderRadius: 4 }}>
              <strong style={{ color: '#78350F' }}>{pendingCount.toLocaleString()} unoptimized images</strong> — large unoptimized images are the #1 cause of slow mobile pages. Click "Request bulk optimization" below to have IA process them overnight.
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
          {spQuotaExceeded && (
            <div style={{ padding: 10, background: '#FEF2F2', borderLeft: '3px solid #D85A30', marginBottom: 8, borderRadius: 4 }}>
              ShortPixel quota exceeded — new uploads aren't being optimized. Upgrade your ShortPixel plan or wait for monthly reset.
            </div>
          )}
          {(!pendingCount || pendingCount <= 100) && ls?.image_optimization && ls?.webp_replace && ls?.lazy_load_images && !spQuotaExceeded && (
            <div style={{ padding: 10, background: '#F0FDF4', borderLeft: '3px solid #1D9E75', borderRadius: 4 }}>
              Image optimization looks healthy. Nothing urgent to address.
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginTop: 14 }}>
          <button
            className="abtn abtn-sky"
            onClick={handleRequestOptimize}
            disabled={requesting}
          >
            {requesting ? 'Submitting…' : 'Request bulk optimization'}
          </button>
        </div>
      </Card>

      <ConsultingUpsell
        headline="Large unoptimized images are the #1 cause of slow mobile rankings"
        subtext="IA's performance team handles bulk image optimization + sets up the automation so new uploads stay optimized going forward."
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
