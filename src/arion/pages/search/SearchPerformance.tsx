import { useState } from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from 'recharts';
import { useArionContext } from '../../useArionContext';
import { useArionData } from '../../useArionData';
import { MetricCard, Card, PlatformTabs, WarnNotice, EmptyPanel, Loading, ConsultingUpsell } from '../../components/Ui';
import { BarChartViz, MultiLineChart } from '../../components/Charts';
import { ReportBar } from '../../../components/insights/ReportBar';
import { useArionInsightsPayload } from '../../../hooks/useArionInsightsPayload';

// Format a raw country code to a readable label. GSC uses ISO 3166-1 alpha-3.
function countryLabel(code: string): string {
  if (!code) return '--';
  const up = code.toUpperCase();
  const map: Record<string, string> = {
    USA: 'United States', GBR: 'United Kingdom', CAN: 'Canada', AUS: 'Australia', IND: 'India',
    DEU: 'Germany', FRA: 'France', ESP: 'Spain', ITA: 'Italy', BRA: 'Brazil', MEX: 'Mexico',
    JPN: 'Japan', KOR: 'South Korea', CHN: 'China', NLD: 'Netherlands', SWE: 'Sweden',
    NOR: 'Norway', FIN: 'Finland', IRL: 'Ireland', ZAF: 'South Africa',
  };
  return map[up] || up;
}

export function SearchPerformance() {
  // Reports covering THIS function (Brandon 2026-08-14). Declared above
  // any early return — a hook below one runs on some renders only.
  const insightsPayload = useArionInsightsPayload();

  const { selectedSite, activeSiteId, arionApi } = useArionContext();
  const tier = selectedSite?.arionTier || 'standard';
  const [provider, setProvider] = useState<string>('google');
  const [period, setPeriod] = useState<number>(30);

  const { data, loading } = useArionData(
    () => activeSiteId ? arionApi.getSearchPerformance(provider, activeSiteId, { period, groupBy: 'all' }) : Promise.resolve(null),
    [activeSiteId, provider, period]
  );

  if (loading) return <Loading />;
  if (!selectedSite) return <EmptyPanel message="No ARION site selected." />;

  const d = data as Record<string, any> | null;
  const bingNotConnected = provider === 'bing' && d?.error && /not connected|not configured/i.test(String(d.error));
  const summary = d?.summary ?? {};
  const breakdowns = d?.breakdowns ?? {};
  const queries = (breakdowns.queries as any[]) ?? [];
  const pages = (breakdowns.pages as any[]) ?? [];
  const dates = (breakdowns.dates as any[]) ?? [];
  const devices = (breakdowns.devices as any[]) ?? [];
  const countries = (breakdowns.countries as any[]) ?? [];

  // CTR comes pre-formatted as a percentage number from the API (e.g. 0.66 = 0.66%).
  const fmtCtr = (v: any) => (v == null || v === '' ? '--' : `${Number(v).toFixed(2)}%`);
  const fmtPos = (v: any) => (v == null || v === '' ? '--' : Number(v).toFixed(1));

  const hasLowCtr = queries.some((q: any) => Number(q.ctr) < 2 && Number(q.impressions) >= 100);

  // Device donut — locked colors per brand
  const DEVICE_COLORS: Record<string, string> = { DESKTOP: '#2D9CDB', MOBILE: '#EF6C33', TABLET: '#0C4A60' };
  const deviceChartData = devices.map(dv => ({
    name: dv.device === 'DESKTOP' ? 'Desktop' : dv.device === 'MOBILE' ? 'Mobile' : dv.device === 'TABLET' ? 'Tablet' : (dv.device || 'Other'),
    value: dv.clicks || 0,
    impressions: dv.impressions || 0,
    _key: dv.device || 'OTHER',
  }));

  // Trend chart — scale impressions by /100 so it shares an axis with clicks
  const dateChartData = dates.map(r => ({
    label: (r.date || '').slice(5), // MM-DD
    clicks: r.clicks || 0,
    impressionsScaled: Math.round((r.impressions || 0) / 100),
  }));

  return (
    <>
      <ReportBar detail={insightsPayload?.detail} reports={[
        { id: 'query_performance', label: 'Queries' },
        { id: 'page_search_performance', label: 'Landing pages' },
        { id: 'page_query_pairs', label: 'Page + search pairs' },
        { id: 'ctr_by_query', label: 'Click-through by query' },
        { id: 'ctr_opportunity', label: 'CTR opportunities' },
        { id: 'search_device_split', label: 'By device' },
        { id: 'search_by_country', label: 'By country' },
        { id: 'search_appearance', label: 'Rich results' },
      ]} />
      <PlatformTabs
        tabs={[{ key: 'google', label: 'Google' }, { key: 'bing', label: 'Bing' }]}
        active={provider}
        onChange={setProvider}
      />

      {/* Period selector */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {[30, 90, 365].map(p => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={period === p ? 'abtn abtn-sky' : 'abtn'}
            style={{ fontSize: 12, padding: '6px 14px' }}
          >
            {p === 365 ? 'Last 12 months' : `Last ${p} days`}
          </button>
        ))}
      </div>

      {bingNotConnected ? (
        <div style={{ background: '#FFF8E1', borderLeft: '3px solid #D4A800', borderRadius: 4, padding: '14px 18px', fontSize: 13, color: '#5A7A8A', lineHeight: 1.6 }}>
          <strong style={{ color: '#0B1C24' }}>Bing Webmaster Tools — Not Connected</strong>
          <p style={{ margin: '4px 0 0' }}>Connect Bing in Settings → Connected Accounts to see Bing search impressions, clicks, CTR, and ranking data alongside your Google results.</p>
        </div>
      ) : !d ? (
        <EmptyPanel message="No search performance data available." />
      ) : (
        <>
          <div className="mcards">
            <MetricCard label="Impressions" value={summary.impressions ?? '--'} />
            <MetricCard label="Clicks" value={summary.clicks ?? '--'} />
            <MetricCard label="CTR" value={fmtCtr(summary.ctr)} />
            <MetricCard label="Avg Position" value={fmtPos(summary.avgPosition)} />
          </div>

          {hasLowCtr && (
            <WarnNotice>Some queries have low CTR (under 2%) with significant impressions. Consider improving title tags and meta descriptions for these pages.</WarnNotice>
          )}

          {/* Date trend — dual line (clicks solid, impressions dashed) */}
          {dateChartData.length > 0 && (
            <Card title="Clicks & Impressions over time">
              <div style={{ fontSize: 10, color: '#5A7A8A', marginBottom: 6 }}>Impressions shown scaled (÷100) to share the clicks axis.</div>
              <MultiLineChart
                data={dateChartData}
                lines={[
                  { dataKey: 'clicks', color: '#2D9CDB', name: 'Clicks' },
                  { dataKey: 'impressionsScaled', color: '#EF6C33', name: 'Impressions ÷ 100', dashed: true },
                ]}
                height={240}
              />
            </Card>
          )}

          {queries.length > 0 && (
            <Card title="Top Queries — by Impressions">
              <BarChartViz
                data={queries.slice(0, 10).map((q: any) => ({
                  label: q.query?.slice(0, 25) || '--',
                  impressions: q.impressions || 0,
                }))}
                dataKey="impressions"
                xKey="label"
                layout="horizontal"
                height={250}
              />
            </Card>
          )}

          {/* Device + Country side by side */}
          {(deviceChartData.length > 0 || countries.length > 0) && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              {deviceChartData.length > 0 && (
                <Card title="Device breakdown">
                  <ResponsiveContainer width="100%" height={240}>
                    <PieChart>
                      <Pie data={deviceChartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} innerRadius={45} paddingAngle={2}>
                        {deviceChartData.map((dv, i) => (
                          <Cell key={i} fill={DEVICE_COLORS[dv._key] || '#5A7A8A'} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v: any, _n: any, e: any) => [`${v} clicks (${e?.payload?.impressions ?? 0} impressions)`, e?.payload?.name ?? '']} contentStyle={{ fontSize: 11, borderRadius: 6 }} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </Card>
              )}
              {countries.length > 0 && (
                <Card title="Top Countries">
                  <table className="tbl">
                    <thead>
                      <tr><th>Country</th><th>Clicks</th><th>Impressions</th><th>CTR</th></tr>
                    </thead>
                    <tbody>
                      {countries.slice(0, 10).map((c: any, i: number) => (
                        <tr key={i}>
                          <td>{countryLabel(c.country)}</td>
                          <td>{c.clicks ?? '--'}</td>
                          <td>{c.impressions ?? '--'}</td>
                          <td>{fmtCtr(c.ctr)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Card>
              )}
            </div>
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
                        {fmtCtr(q.ctr)}{isLow ? ' \u26A0' : ''}
                      </td>
                      <td>{fmtPos(q.position ?? q.avgPosition ?? q.avg_position)}</td>
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
                    <td>{fmtCtr(p.ctr)}</td>
                    <td>{fmtPos(p.position ?? p.avgPosition ?? p.avg_position)}</td>
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
