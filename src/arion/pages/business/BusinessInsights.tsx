import React from 'react';
import { useArionContext } from '../../useArionContext';
import { useArionData } from '../../useArionData';
import { MetricCard, Card, EmptyPanel, Loading, ConsultingUpsell } from '../../components/Ui';
import { MultiLineChart } from '../../components/Charts';
import { GbpPendingVerificationCard, GbpStatusCard } from './GbpStatusCard';
import { ReportBar } from '../../../components/insights/ReportBar';
import { useArionInsightsPayload } from '../../../hooks/useArionInsightsPayload';

function fmtNum(n: any): string { return n == null || isNaN(Number(n)) ? '--' : Number(n).toLocaleString(); }

export function BusinessInsights() {
  // Reports covering THIS function (Brandon 2026-08-14). Declared above
  // any early return — a hook below one runs on some renders only.
  const insightsPayload = useArionInsightsPayload();

  const { selectedSite, activeSiteId, arionApi } = useArionContext();
  const [period, setPeriod] = React.useState<number>(30);

  const { data, loading } = useArionData(
    () => activeSiteId ? arionApi.getGbpInsightsLive(activeSiteId, period).catch((e: any) => ({ error: e.message })) : Promise.resolve(null),
    [activeSiteId, period]
  );

  if (loading) return <Loading />;
  if (!selectedSite) return <EmptyPanel message="No ARION site selected." />;

  const d = data as any;
  if (d?.pendingVerification) {
    return <GbpPendingVerificationCard what="performance metrics" />;
  }
  if (!d || d.error || d.connected === false) {
    // Differentiated failure copy — quota/auth/no-listing are NOT "not
    // connected" (the backend returns several of these with connected:true).
    return <GbpStatusCard error={d?.error} surface="insights" />;
  }
  const totals = d.totals || {};
  const daily = (d.dailyBreakdown || []) as any[];
  const trend = daily.map((r: any) => ({
    label: (r.date || '').slice(5),
    Impressions: r.impressions || 0,
    Calls: r.calls || 0,
    'Website clicks': r.websiteClicks || 0,
    Directions: r.directions || 0,
  }));

  return (
    <div>
      <ReportBar detail={insightsPayload?.detail} reports={[
        { id: 'gbp_visibility_split', label: 'Where you\'re seen' },
        { id: 'gbp_actions', label: 'What people do' },
        { id: 'gbp_search_keywords', label: 'Search terms' },
        { id: 'gbp_discovery_split', label: 'Discovery split' },
        { id: 'gbp_action_breakdown', label: 'Action breakdown' },
      ]} />
      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        {[30, 90].map(p => (
          <button key={p} onClick={() => setPeriod(p)} className={period === p ? 'abtn abtn-sky' : 'abtn'} style={{ fontSize: 12, padding: '6px 14px' }}>
            Last {p} days
          </button>
        ))}
      </div>

      <div className="mcards">
        <MetricCard label="Impressions" value={fmtNum(totals.impressions)} />
        <MetricCard label="Website Clicks" value={fmtNum(totals.websiteClicks)} />
        <MetricCard label="Directions" value={fmtNum(totals.directionsRequests)} />
        <MetricCard label="Phone Calls" value={fmtNum(totals.calls)} />
      </div>

      {trend.length > 0 && (
        <Card title={`${period}-day trend`}>
          <MultiLineChart
            data={trend}
            lines={[
              { dataKey: 'Impressions', color: '#2D9CDB', name: 'Impressions' },
              { dataKey: 'Website clicks', color: '#EF6C33', name: 'Website clicks' },
              { dataKey: 'Directions', color: '#0C4A60', name: 'Directions' },
              { dataKey: 'Calls', color: '#FEC82C', name: 'Calls' },
            ]}
            height={260}
          />
        </Card>
      )}

      <ConsultingUpsell
        headline="Turn Google Business traffic into customers."
        subtext="IA optimizes photos, categories, and posting cadence for maximum local visibility."
        serviceType="Local SEO"
        triggerPage="business-insights"
      />
    </div>
  );
}
