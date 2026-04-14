import React from 'react';
import { useArionContext } from '../../useArionContext';
import { useArionData } from '../../useArionData';
import { StatCard, Card, AddonUpsell, EmptyPanel, Loading, InfoCard, PlatformTabs, ConsultingUpsell } from '../../components/Ui';
import { TrendChart } from '../../components/Charts';

export function SeoRankings() {
  const { selectedSite, activeSiteId, arionApi } = useArionContext();
  const [engine, setEngine] = React.useState('all');

  const { data: seo, loading: seoLoading } = useArionData(
    () => activeSiteId ? arionApi.getSeo(activeSiteId) : Promise.resolve(null),
    [activeSiteId]
  );

  if (seoLoading) return <Loading />;
  if (!selectedSite) return <EmptyPanel message="No ARION site selected." />;

  const s = seo as Record<string, any> | null;
  const connected = s?.connected === true;
  const hasSeoAddon = selectedSite?.seoAddonTier != null;
  const snapshot = s?.snapshot ?? {};
  const pkg = s?.package ?? {};
  const rankings = (s?.breakdowns?.rankings as any[]) ?? [];

  if (!connected && !hasSeoAddon) {
    return (
      <AddonUpsell
        title="SEO Tools — Add-on not active"
        description="Powered by SE Ranking. Track keyword positions, run site audits, monitor competitors, and discover ranking opportunities."
        price="$29"
        planName="Starter — 10 keywords"
      />
    );
  }

  const trackedKeywords = snapshot.trackedKeywords ?? snapshot.tracked_keywords ?? '--';
  const trackedCompetitors = snapshot.trackedCompetitors ?? snapshot.tracked_competitors ?? '0';

  // Filter rankings by engine
  const filtered = engine === 'all' ? rankings :
    rankings.filter((r: any) => r.engine_id === engine);

  // Compute position trend data for chart
  const trendData = filtered.slice(0, 20).map((r: any) => ({
    label: (r.keyword || '').slice(0, 15),
    value: r.position ?? 0,
  }));

  return (
    <div>
      {connected && (
        <InfoCard title="SE Ranking — Connected">
          <p style={{ margin: 0 }}>
            Package: <strong>{pkg.code || 'authority'}</strong> | Tracked Keywords: <strong>{trackedKeywords}</strong> | Tracked Competitors: <strong>{trackedCompetitors}</strong>
          </p>
        </InfoCard>
      )}

      <div className="grid3" style={{ marginTop: connected ? 12 : 0 }}>
        <StatCard label="Tracked Keywords" value={String(trackedKeywords)} deltaType="neutral" />
        <StatCard label="Tracked Competitors" value={String(trackedCompetitors)} deltaType="neutral" />
        <StatCard label="Package" value={String(pkg.code || '--')} deltaType="neutral" />
      </div>

      {/* Engine tabs */}
      <PlatformTabs
        tabs={[
          { key: 'all', label: 'All Engines' },
          { key: 'google', label: 'Google' },
          { key: 'bing', label: 'Bing' },
        ]}
        active={engine}
        onChange={setEngine}
      />

      <Card title="Keyword Rankings">
        <table className="data-table">
          <thead>
            <tr><th>Keyword</th><th>Position</th><th>Change</th><th>Volume</th><th>SERP Features</th></tr>
          </thead>
          <tbody>
            {filtered.length > 0 ? filtered.map((r: any, i: number) => (
              <tr key={i}>
                <td>{r.keyword ?? '--'}</td>
                <td>{r.position ?? '--'}</td>
                <td className={Number(r.change) > 0 ? 'pos' : Number(r.change) < 0 ? 'neg' : 'neu'}>{r.change ?? '--'}</td>
                <td>{r.volume ?? '--'}</td>
                <td>{Array.isArray(r.serp_features) && r.serp_features.length > 0 ? r.serp_features.join(', ') : '--'}</td>
              </tr>
            )) : (
              <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>Ranking data is being collected. Check back soon.</td></tr>
            )}
          </tbody>
        </table>
      </Card>

      {trendData.length > 0 && (
        <Card title="Position Trend (Top 20 Keywords)" style={{ marginTop: 12 }}>
          <TrendChart data={trendData.map(d => ({ keyword: d.label, position: d.value }))} dataKey="position" xKey="keyword" height={200} />
        </Card>
      )}

      <ConsultingUpsell
        headline="These rankings are your growth roadmap. IA builds a 90-day plan to reach page 1."
        subtext="Our SEO strategists analyze your keyword landscape and build a custom plan."
        serviceType="SEO Strategy"
        triggerPage="seo-rankings"
      />
    </div>
  );
}
