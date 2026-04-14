import { useState } from 'react';
import { useArionContext } from '../../useArionContext';
import { useArionData } from '../../useArionData';
import { MetricCard, Card, PlatformTabs, WarnNotice, EmptyPanel, Loading, ConsultingUpsell } from '../../components/Ui';
import { BarChartViz } from '../../components/Charts';

export function SearchPerformance() {
  const { selectedSite, activeSiteId, arionApi } = useArionContext();
  const tier = selectedSite?.arionTier || 'standard';
  const [provider, setProvider] = useState<string>('google');

  const { data, loading } = useArionData(
    () => activeSiteId ? arionApi.getConsole(provider, activeSiteId) : Promise.resolve(null),
    [activeSiteId, provider]
  );

  if (loading) return <Loading />;
  if (!selectedSite) return <EmptyPanel message="No ARION site selected." />;

  const d = data as Record<string, any> | null;
  const summary = d?.summary ?? {};
  const queries = (d?.breakdowns?.queries as any[]) ?? [];
  const pages = (d?.breakdowns?.pages as any[]) ?? [];
  const hasLowCtr = queries.some((q: any) => Number(q.ctr) < 2 && Number(q.impressions) >= 100);

  return (
    <>
      <PlatformTabs
        tabs={[{ key: 'google', label: 'Google' }, { key: 'bing', label: 'Bing' }]}
        active={provider}
        onChange={setProvider}
      />

      {!d ? (
        <EmptyPanel message="No search performance data available." />
      ) : (
        <>
          <div className="mcards">
            <MetricCard label="Impressions" value={summary.impressions ?? '--'} />
            <MetricCard label="Clicks" value={summary.clicks ?? '--'} />
            <MetricCard label="CTR" value={summary.ctr != null ? `${summary.ctr}%` : '--'} />
            <MetricCard label="Avg Position" value={summary.avgPosition ?? '--'} />
          </div>

          {hasLowCtr && (
            <WarnNotice>Some queries have low CTR (under 2%) with significant impressions. Consider improving title tags and meta descriptions for these pages.</WarnNotice>
          )}

          {queries.length > 0 && (
            <Card title="Clicks & Impressions">
              <BarChartViz
                data={queries.slice(0, 10).map((q: any) => ({
                  label: q.query?.slice(0, 25) || '--',
                  impressions: q.impressions || 0,
                  clicks: q.clicks || 0,
                }))}
                dataKey="impressions"
                xKey="label"
                layout="horizontal"
                height={250}
              />
            </Card>
          )}

          <Card title="Top Queries">
            <table className="tbl">
              <thead>
                <tr><th>Query</th><th>Impressions</th><th>Clicks</th><th>CTR</th><th>Position</th></tr>
              </thead>
              <tbody>
                {queries.length > 0 ? queries.map((q: any, i: number) => {
                  const ctr = Number(q.ctr);
                  const imp = Number(q.impressions);
                  const isLow = ctr < 2 && imp >= 100;
                  const isOk = ctr > 5;
                  return (
                    <tr key={i}>
                      <td>{q.query ?? '--'}</td>
                      <td>{q.impressions ?? '--'}</td>
                      <td>{q.clicks ?? '--'}</td>
                      <td className={isLow ? 'ctr-low' : isOk ? 'ctr-ok' : ''}>
                        {q.ctr != null ? `${q.ctr}%` : '--'}{isLow ? ' \u26A0' : ''}
                      </td>
                      <td>{q.position ?? '--'}</td>
                    </tr>
                  );
                }) : (
                  <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No query data available</td></tr>
                )}
              </tbody>
            </table>
          </Card>

          <Card title="Top Pages">
            <table className="tbl">
              <thead>
                <tr><th>Page</th><th>Impressions</th><th>Clicks</th><th>CTR</th><th>Position</th></tr>
              </thead>
              <tbody>
                {pages.length > 0 ? pages.map((p: any, i: number) => (
                  <tr key={i}>
                    <td>{p.page ?? p.url ?? '--'}</td>
                    <td>{p.impressions ?? '--'}</td>
                    <td>{p.clicks ?? '--'}</td>
                    <td>{p.ctr != null ? `${p.ctr}%` : '--'}</td>
                    <td>{p.position ?? '--'}</td>
                  </tr>
                )) : (
                  <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No page data available</td></tr>
                )}
              </tbody>
            </table>
          </Card>
        </>
      )}

      <ConsultingUpsell
        headline="Low CTR hurts your traffic. IA's content team improves title tags and meta descriptions."
        subtext="Search performance optimization for higher click-through rates."
        serviceType="Content Writing"
        triggerPage="search-performance"
      />
    </>
  );
}
