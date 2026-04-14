import { useArionContext } from '../../useArionContext';
import { useArionData } from '../../useArionData';
import { StatCard, Card, Loading, ErrorBanner, ConsultingUpsell } from '../../components/Ui';

export function SeoOverview() {
  const { selectedSite, activeSiteId, arionApi } = useArionContext();

  const { data: seo, loading: seoLoading } = useArionData(
    () => activeSiteId ? arionApi.getSeo(activeSiteId) : Promise.resolve(null),
    [activeSiteId]
  );

  if (seoLoading) return <Loading />;
  if (!selectedSite) return <div style={{ padding: 24, color: 'var(--text-muted)' }}>No ARION site selected.</div>;

  const s = seo as Record<string, any> | null;
  const connected = s?.connected === true;
  const snapshot = s?.snapshot ?? {};
  const rankings: any[] = (s?.breakdowns?.rankings as any[]) ?? [];

  if (!connected) {
    return (
      <div>
        <ErrorBanner message="SE Ranking is not connected for this site. Contact IA to activate your SEO add-on." />
      </div>
    );
  }

  /* Stat calculations */
  const avgPosition = snapshot.avgPosition ?? snapshot.avg_position ?? null;
  const avgPosDisplay = avgPosition != null ? Math.round(avgPosition * 10) / 10 : '--';
  const top10 = rankings.filter((r: any) => typeof r.position === 'number' && r.position <= 10).length;
  const visibility = snapshot.searchVisibility ?? snapshot.search_visibility ?? '--';
  const trafficForecast = snapshot.trafficForecast ?? snapshot.traffic_forecast ?? '--';

  /* Rankings sorted by position ascending (best first) */
  const sorted = [...rankings].sort((a: any, b: any) => (a.position ?? 999) - (b.position ?? 999));
  const jumped = sorted.filter((r: any) => typeof r.change === 'number' && r.change > 0).slice(0, 10);
  const dropped = sorted.filter((r: any) => typeof r.change === 'number' && r.change < 0).slice(0, 10);

  /* Ranking distribution */
  const dist = { '1-3': 0, '4-10': 0, '11-20': 0, '21-50': 0, '51+': 0 };
  rankings.forEach((r: any) => {
    const p = r.position;
    if (typeof p !== 'number') return;
    if (p <= 3) dist['1-3']++;
    else if (p <= 10) dist['4-10']++;
    else if (p <= 20) dist['11-20']++;
    else if (p <= 50) dist['21-50']++;
    else dist['51+']++;
  });
  const distTotal = Object.values(dist).reduce((a, b) => a + b, 0) || 1;

  const distColors: Record<string, string> = {
    '1-3': '#22c55e',
    '4-10': '#3b82f6',
    '11-20': '#f59e0b',
    '21-50': '#f97316',
    '51+': '#dc2626',
  };

  return (
    <div>
      {/* Stat Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
        <StatCard
          label="Avg Position"
          value={avgPosDisplay}
          deltaType={typeof avgPosition === 'number' && avgPosition > 30 ? 'negative' : 'neutral'}
        />
        <StatCard label="Top 10 Keywords" value={top10} deltaType="positive" />
        <StatCard label="Search Visibility" value={typeof visibility === 'number' ? `${visibility}%` : visibility} />
        <StatCard label="Traffic Forecast" value={trafficForecast} />
      </div>

      {/* Two-column layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {/* Left: Jumped / Dropped */}
        <Card title="Top Movers">
          {jumped.length > 0 && (
            <>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, color: '#22c55e' }}>Jumped</div>
              <table className="tbl">
                <thead><tr><th>Keyword</th><th>Position</th><th>Change</th></tr></thead>
                <tbody>
                  {jumped.map((r: any, i: number) => (
                    <tr key={i}>
                      <td>{r.keyword ?? '--'}</td>
                      <td>{r.position ?? '--'}</td>
                      <td style={{ color: '#22c55e', fontWeight: 600 }}>+{r.change}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          {dropped.length > 0 && (
            <>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, marginTop: jumped.length > 0 ? 14 : 0, color: '#dc2626' }}>Dropped</div>
              <table className="tbl">
                <thead><tr><th>Keyword</th><th>Position</th><th>Change</th></tr></thead>
                <tbody>
                  {dropped.map((r: any, i: number) => (
                    <tr key={i}>
                      <td>{r.keyword ?? '--'}</td>
                      <td>{r.position ?? '--'}</td>
                      <td style={{ color: '#dc2626', fontWeight: 600 }}>{r.change}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          {jumped.length === 0 && dropped.length === 0 && (
            <div style={{ padding: 16, color: 'var(--text-muted)', fontSize: 13 }}>
              No ranking changes detected yet.
            </div>
          )}
        </Card>

        {/* Right: Ranking Distribution */}
        <Card title="Ranking Distribution">
          {Object.entries(dist).map(([range, count]) => (
            <div key={range} style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                <span>Position {range}</span>
                <span style={{ fontWeight: 600 }}>{count}</span>
              </div>
              <div style={{ background: 'var(--bg-muted, #f3f4f6)', borderRadius: 4, height: 8, overflow: 'hidden' }}>
                <div style={{
                  height: '100%',
                  width: `${Math.max((count / distTotal) * 100, 2)}%`,
                  background: distColors[range],
                  borderRadius: 4,
                  transition: 'width 0.3s',
                }} />
              </div>
            </div>
          ))}
        </Card>
      </div>

      <ConsultingUpsell
        headline={typeof avgPosition === 'number' ? `Average position is ${avgPosDisplay} — IA can improve your rankings` : "Improve your search rankings with IA's SEO team"}
        subtext="SEO strategy and execution managed by Intelligent Analytics."
        serviceType="SEO Strategy"
        triggerPage="seo-overview"
      />
    </div>
  );
}
