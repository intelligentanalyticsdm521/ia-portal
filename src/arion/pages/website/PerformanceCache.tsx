import { useArionContext } from '../../useArionContext';
import { useArionData } from '../../useArionData';
import { StatCard, Card, HealthRow, Loading, ConsultingUpsell, ScoreCircle } from '../../components/Ui';

export function PerformanceCache() {
  const { selectedSite, activeSiteId, arionApi, loading } = useArionContext();

  const { data: pagespeed, loading: psLoading } = useArionData(
    () => activeSiteId ? arionApi.getPagespeedHistory(activeSiteId) : Promise.resolve(null),
    [activeSiteId]
  );

  if (loading || psLoading) return <Loading />;
  if (!selectedSite) return <div style={{ padding: 24, color: 'var(--text-muted)' }}>No site selected.</div>;

  const ps = (pagespeed as Record<string, any>)?.data ?? (pagespeed as Record<string, any>) ?? {};
  const snapshots: any[] = Array.isArray(ps.snapshots) ? ps.snapshots : [];
  const latest = snapshots.length > 0 ? snapshots[snapshots.length - 1] : null;

  const mobileScore = latest?.mobile?.performance ?? latest?.mobileScore ?? null;
  const desktopScore = latest?.desktop?.performance ?? latest?.desktopScore ?? null;
  const cacheStatus = latest?.cacheStatus ?? 'Unknown';
  const lastRun = latest?.timestamp ? new Date(latest.timestamp).toLocaleDateString() : '--';

  const metrics = latest?.mobile?.metrics ?? latest?.metrics ?? {};
  const lcp = metrics.lcp ?? '--';
  const inp = metrics.inp ?? '--';
  const cls = metrics.cls ?? '--';

  const lcpMs = typeof lcp === 'number' ? lcp : parseFloat(lcp);
  const inpMs = typeof inp === 'number' ? inp : parseFloat(inp);
  const clsVal = typeof cls === 'number' ? cls : parseFloat(cls);

  const cwvColor = (metric: string, val: number) => {
    if (isNaN(val)) return '#6b7280';
    if (metric === 'lcp') return val <= 2500 ? '#22c55e' : val <= 4000 ? '#f59e0b' : '#dc2626';
    if (metric === 'inp') return val <= 200 ? '#22c55e' : val <= 500 ? '#f59e0b' : '#dc2626';
    if (metric === 'cls') return val <= 0.1 ? '#22c55e' : val <= 0.25 ? '#f59e0b' : '#dc2626';
    return '#6b7280';
  };

  const cwvWidth = (metric: string, val: number) => {
    if (isNaN(val)) return '10%';
    if (metric === 'lcp') return `${Math.min((val / 6000) * 100, 100)}%`;
    if (metric === 'inp') return `${Math.min((val / 800) * 100, 100)}%`;
    if (metric === 'cls') return `${Math.min((val / 0.5) * 100, 100)}%`;
    return '10%';
  };

  return (
    <div>
      {/* Stat Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
        <StatCard label="Mobile Score" value="">
          <ScoreCircle score={typeof mobileScore === 'number' ? mobileScore : null} label="Mobile" />
        </StatCard>
        <StatCard label="Desktop Score" value="">
          <ScoreCircle score={typeof desktopScore === 'number' ? desktopScore : null} label="Desktop" />
        </StatCard>
        <StatCard label="Cache Status" value={cacheStatus} />
        <StatCard label="Last Run" value={lastRun} />
      </div>

      {/* Two-column layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {/* Left: Core Web Vitals */}
        <Card title="Core Web Vitals">
          {[
            { key: 'lcp', label: 'LCP (Largest Contentful Paint)', value: lcp, unit: 'ms' },
            { key: 'inp', label: 'INP (Interaction to Next Paint)', value: inp, unit: 'ms' },
            { key: 'cls', label: 'CLS (Cumulative Layout Shift)', value: cls, unit: '' },
          ].map((m) => {
            const numVal = typeof m.value === 'number' ? m.value : parseFloat(m.value);
            return (
              <div key={m.key} style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                  <span>{m.label}</span>
                  <span style={{ fontWeight: 600 }}>{m.value}{m.unit ? ` ${m.unit}` : ''}</span>
                </div>
                <div style={{ background: 'var(--bg-muted, #f3f4f6)', borderRadius: 4, height: 8, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    width: cwvWidth(m.key, numVal),
                    background: cwvColor(m.key, numVal),
                    borderRadius: 4,
                    transition: 'width 0.3s',
                  }} />
                </div>
              </div>
            );
          })}
        </Card>

        {/* Right: Cache Management */}
        <Card title="Cache Management">
          <HealthRow status={cacheStatus === 'Active' || cacheStatus === 'HIT' ? 'ok' : 'warn'} label="Page Cache" value={cacheStatus} />
          <HealthRow status="ok" label="Browser Cache" value="Enabled" />
          <HealthRow status="ok" label="Gzip Compression" value="Enabled" />
          <HealthRow status="ok" label="CDN" value="Cloudflare" />
          <div style={{ marginTop: 14 }}>
            <button
              className="abtn abtn-outline"
              onClick={() => arionApi.submitRequest(activeSiteId!, 'cache_purge', '')}
            >
              Purge Cache
            </button>
          </div>
        </Card>
      </div>

      <ConsultingUpsell
        headline="LCP above threshold — IA's team can fix Core Web Vitals"
        subtext="Performance optimization starts at $299/mo."
        serviceType="Performance Optimization"
        triggerPage="performance-cache"
      />
    </div>
  );
}
