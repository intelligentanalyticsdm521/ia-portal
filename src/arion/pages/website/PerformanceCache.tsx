import React, { useMemo } from 'react';
import { useArionContext } from '../../useArionContext';
import { useArionData } from '../../useArionData';
import { StatCard, Card, Loading, ConsultingUpsell, ScoreCircle } from '../../components/Ui';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  ReferenceArea, Legend,
} from 'recharts';

/**
 * Core Web Vitals — visual-first performance dashboard.
 *
 * Focus: Google's ranking signals. Mobile vs desktop scores over time + the
 * three Core Web Vitals metrics (LCP, INP, CLS) with time-series charts.
 * Cache + server environment details have moved to Website Overview.
 */
export function PerformanceCache() {
  const { selectedSite, activeSiteId, arionApi, loading } = useArionContext();

  const { data: pagespeed, loading: psLoading } = useArionData(
    () => activeSiteId ? arionApi.getPagespeedHistory(activeSiteId) : Promise.resolve(null),
    [activeSiteId]
  );

  const snapshots: any[] = useMemo(() => {
    const arr = (pagespeed as any)?.data?.snapshots;
    return Array.isArray(arr) ? arr : [];
  }, [pagespeed]);

  const chartData = useMemo(() => {
    return snapshots.map((s: any) => {
      const ts = s.timestamp ? new Date(s.timestamp) : null;
      const mobile = s.mobile || {};
      const desktop = s.desktop || {};
      const mobileMetrics = mobile.metrics || s.metrics || {};
      const desktopMetrics = desktop.metrics || {};
      return {
        date: ts ? ts.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '',
        rawDate: ts ? ts.getTime() : 0,
        mobileScore: typeof mobile.performance === 'number' ? mobile.performance : (typeof s.mobileScore === 'number' ? s.mobileScore : null),
        desktopScore: typeof desktop.performance === 'number' ? desktop.performance : (typeof s.desktopScore === 'number' ? s.desktopScore : null),
        lcp: mobileMetrics.lcp ?? null,
        inp: mobileMetrics.inp ?? null,
        cls: mobileMetrics.cls ?? null,
        lcpDesktop: desktopMetrics.lcp ?? null,
        inpDesktop: desktopMetrics.inp ?? null,
        clsDesktop: desktopMetrics.cls ?? null,
      };
    }).sort((a, b) => a.rawDate - b.rawDate);
  }, [snapshots]);

  const latest = chartData.length > 0 ? chartData[chartData.length - 1] : null;
  const previous = chartData.length > 1 ? chartData[chartData.length - 2] : null;

  if (loading || psLoading) return <Loading />;
  if (!selectedSite) return <div style={{ padding: 24, color: 'var(--text-muted)' }}>No site selected.</div>;

  const mobileScore = latest?.mobileScore ?? null;
  const desktopScore = latest?.desktopScore ?? null;
  const lcp = latest?.lcp ?? null;
  const inp = latest?.inp ?? null;
  const cls = latest?.cls ?? null;

  const deltaFromPrev = (curr: number | null, prev: number | null) => {
    if (curr == null || prev == null) return null;
    return curr - prev;
  };

  const mobileDelta = deltaFromPrev(mobileScore, previous?.mobileScore ?? null);
  const desktopDelta = deltaFromPrev(desktopScore, previous?.desktopScore ?? null);

  const cwvColor = (metric: string, v: number | null) => {
    if (v == null || isNaN(Number(v))) return '#6b7280';
    const val = Number(v);
    if (metric === 'lcp') return val <= 2500 ? '#22c55e' : val <= 4000 ? '#f59e0b' : '#dc2626';
    if (metric === 'inp') return val <= 200 ? '#22c55e' : val <= 500 ? '#f59e0b' : '#dc2626';
    if (metric === 'cls') return val <= 0.1 ? '#22c55e' : val <= 0.25 ? '#f59e0b' : '#dc2626';
    return '#6b7280';
  };

  const cwvBand = (metric: string, v: number | null) => {
    if (v == null || isNaN(Number(v))) return 'Unknown';
    const val = Number(v);
    if (metric === 'lcp') return val <= 2500 ? 'Good' : val <= 4000 ? 'Needs improvement' : 'Poor';
    if (metric === 'inp') return val <= 200 ? 'Good' : val <= 500 ? 'Needs improvement' : 'Poor';
    if (metric === 'cls') return val <= 0.1 ? 'Good' : val <= 0.25 ? 'Needs improvement' : 'Poor';
    return 'Unknown';
  };

  const formatMetric = (metric: string, v: number | null) => {
    if (v == null) return '—';
    if (metric === 'lcp') return `${(Number(v) / 1000).toFixed(2)}s`;
    if (metric === 'inp') return `${Math.round(Number(v))}ms`;
    if (metric === 'cls') return Number(v).toFixed(3);
    return String(v);
  };

  // Summary: how many metrics in "Good" band
  const metricsSummary = [
    { key: 'lcp', label: 'LCP', value: lcp },
    { key: 'inp', label: 'INP', value: inp },
    { key: 'cls', label: 'CLS', value: cls },
  ];
  const goodCount = metricsSummary.filter(m => cwvBand(m.key, m.value) === 'Good').length;
  const overallState = goodCount === 3 ? 'passing' : goodCount >= 2 ? 'mixed' : 'failing';

  const handleRunPagespeed = async (strategy: 'mobile' | 'desktop') => {
    if (!activeSiteId) return;
    try {
      await arionApi.runPageSpeed(activeSiteId, strategy);
      alert(`${strategy === 'mobile' ? 'Mobile' : 'Desktop'} PageSpeed run queued. Refresh in 1-2 minutes.`);
    } catch {
      alert('Failed to queue PageSpeed run.');
    }
  };

  return (
    <div>
      {/* Story band */}
      <div style={{
        background: overallState === 'passing' ? '#F0FDF4' : overallState === 'mixed' ? '#FFFBEB' : '#FEF2F2',
        borderLeft: `4px solid ${overallState === 'passing' ? '#1D9E75' : overallState === 'mixed' ? '#D97706' : '#D85A30'}`,
        padding: '14px 18px', marginBottom: 16, borderRadius: 6,
      }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#0B1C24', marginBottom: 4 }}>
          {overallState === 'passing' && `All three Core Web Vitals are in Google's "Good" band.`}
          {overallState === 'mixed' && `${goodCount} of 3 Core Web Vitals are passing — one or more metrics need work.`}
          {overallState === 'failing' && `Core Web Vitals are failing — this directly impacts your Google rankings.`}
        </div>
        <div style={{ fontSize: 12, color: '#5A7A8A', lineHeight: 1.5 }}>
          Core Web Vitals measure loading (LCP), responsiveness (INP), and visual stability (CLS).
          Google uses these as a direct ranking signal — sites that fail CWV on mobile lose positions to competitors that pass.
        </div>
      </div>

      {/* Top score row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
        <StatCard label="Mobile Score" value="">
          <ScoreCircle score={typeof mobileScore === 'number' ? mobileScore : null} label="Mobile" />
          {mobileDelta != null && (
            <div style={{ fontSize: 10, marginTop: 4, color: mobileDelta > 0 ? '#1D9E75' : mobileDelta < 0 ? '#D85A30' : '#94A3B8' }}>
              {mobileDelta > 0 ? '▲' : mobileDelta < 0 ? '▼' : '—'} {Math.abs(mobileDelta)} from last run
            </div>
          )}
        </StatCard>
        <StatCard label="Desktop Score" value="">
          <ScoreCircle score={typeof desktopScore === 'number' ? desktopScore : null} label="Desktop" />
          {desktopDelta != null && (
            <div style={{ fontSize: 10, marginTop: 4, color: desktopDelta > 0 ? '#1D9E75' : desktopDelta < 0 ? '#D85A30' : '#94A3B8' }}>
              {desktopDelta > 0 ? '▲' : desktopDelta < 0 ? '▼' : '—'} {Math.abs(desktopDelta)} from last run
            </div>
          )}
        </StatCard>
        <StatCard
          label="CWV passing"
          value={`${goodCount} / 3`}
          deltaType={goodCount === 3 ? 'positive' : goodCount >= 2 ? 'neutral' : 'negative'}
        />
        <StatCard
          label="Snapshots tracked"
          value={chartData.length > 0 ? chartData.length.toString() : '—'}
        />
      </div>

      {/* Mobile vs Desktop score over time */}
      <Card title="Performance score over time (mobile vs desktop)">
        {chartData.length === 0 ? (
          <EmptyChart message="No PageSpeed history yet. Run a test to start tracking." onRunMobile={() => handleRunPagespeed('mobile')} onRunDesktop={() => handleRunPagespeed('desktop')} />
        ) : (
          <div style={{ height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5EEF2" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#5A7A8A' }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#5A7A8A' }} />
                <ReferenceArea y1={90} y2={100} fill="#1D9E75" fillOpacity={0.08} />
                <ReferenceArea y1={50} y2={90} fill="#D97706" fillOpacity={0.05} />
                <ReferenceArea y1={0} y2={50} fill="#D85A30" fillOpacity={0.05} />
                <Tooltip contentStyle={{ fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="mobileScore" name="Mobile" stroke="#0284c7" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                <Line type="monotone" dataKey="desktopScore" name="Desktop" stroke="#7c3aed" strokeWidth={2} dot={{ r: 3 }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      {/* Current CWV metric cards */}
      <div style={{ marginTop: 16 }}>
        <Card title="Latest Core Web Vitals (mobile)">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            {metricsSummary.map((m) => (
              <div key={m.key} style={{
                background: '#F8FAFC', borderRadius: 8, padding: 16,
                borderTop: `3px solid ${cwvColor(m.key, m.value)}`,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#0B1C24' }}>{m.label}</div>
                  <div style={{
                    fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 99,
                    background: `${cwvColor(m.key, m.value)}20`, color: cwvColor(m.key, m.value),
                  }}>
                    {cwvBand(m.key, m.value)}
                  </div>
                </div>
                <div style={{ fontSize: 11, color: '#5A7A8A', marginBottom: 10 }}>
                  {m.key === 'lcp' && 'Largest Contentful Paint'}
                  {m.key === 'inp' && 'Interaction to Next Paint'}
                  {m.key === 'cls' && 'Cumulative Layout Shift'}
                </div>
                <div style={{ fontSize: 28, fontWeight: 700, color: cwvColor(m.key, m.value), lineHeight: 1 }}>
                  {formatMetric(m.key, m.value)}
                </div>
                <div style={{ fontSize: 10, color: '#94A3B8', marginTop: 8 }}>
                  {m.key === 'lcp' && 'Good ≤ 2.5s · Poor > 4s'}
                  {m.key === 'inp' && 'Good ≤ 200ms · Poor > 500ms'}
                  {m.key === 'cls' && 'Good ≤ 0.1 · Poor > 0.25'}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* CWV time series */}
      {chartData.length > 1 && (
        <>
          <div style={{ marginTop: 16 }}>
            <Card title="LCP (Largest Contentful Paint) — mobile over time">
              <div style={{ height: 200 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5EEF2" />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#5A7A8A' }} />
                    <YAxis tick={{ fontSize: 11, fill: '#5A7A8A' }} />
                    <ReferenceArea y1={0} y2={2500} fill="#22c55e" fillOpacity={0.08} />
                    <ReferenceArea y1={2500} y2={4000} fill="#f59e0b" fillOpacity={0.08} />
                    <ReferenceArea y1={4000} y2={10000} fill="#dc2626" fillOpacity={0.08} />
                    <Tooltip contentStyle={{ fontSize: 12 }} formatter={(v: any) => v != null ? `${(v / 1000).toFixed(2)}s` : '—'} />
                    <Line type="monotone" dataKey="lcp" name="LCP (ms)" stroke="#0284c7" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

          <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Card title="INP (Interaction to Next Paint) over time">
              <div style={{ height: 200 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5EEF2" />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#5A7A8A' }} />
                    <YAxis tick={{ fontSize: 11, fill: '#5A7A8A' }} />
                    <ReferenceArea y1={0} y2={200} fill="#22c55e" fillOpacity={0.08} />
                    <ReferenceArea y1={200} y2={500} fill="#f59e0b" fillOpacity={0.08} />
                    <ReferenceArea y1={500} y2={1500} fill="#dc2626" fillOpacity={0.08} />
                    <Tooltip contentStyle={{ fontSize: 12 }} formatter={(v: any) => v != null ? `${Math.round(v)}ms` : '—'} />
                    <Line type="monotone" dataKey="inp" name="INP (ms)" stroke="#0284c7" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card title="CLS (Cumulative Layout Shift) over time">
              <div style={{ height: 200 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5EEF2" />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#5A7A8A' }} />
                    <YAxis tick={{ fontSize: 11, fill: '#5A7A8A' }} />
                    <ReferenceArea y1={0} y2={0.1} fill="#22c55e" fillOpacity={0.08} />
                    <ReferenceArea y1={0.1} y2={0.25} fill="#f59e0b" fillOpacity={0.08} />
                    <ReferenceArea y1={0.25} y2={1} fill="#dc2626" fillOpacity={0.08} />
                    <Tooltip contentStyle={{ fontSize: 12 }} formatter={(v: any) => v != null ? Number(v).toFixed(3) : '—'} />
                    <Line type="monotone" dataKey="cls" name="CLS" stroke="#0284c7" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>
        </>
      )}

      {/* Actions row */}
      <div style={{ marginTop: 16 }}>
        <Card title="Run PageSpeed now">
          <div style={{ fontSize: 12, color: '#5A7A8A', marginBottom: 12 }}>
            On-demand PageSpeed Insights run. Results append to the history above and usually take 1-2 minutes.
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="abtn abtn-sky" onClick={() => handleRunPagespeed('mobile')}>Run mobile test</button>
            <button className="abtn abtn-outline" onClick={() => handleRunPagespeed('desktop')}>Run desktop test</button>
          </div>
        </Card>
      </div>

      <ConsultingUpsell
        headline="Core Web Vitals impact rankings — let IA's performance team optimize"
        subtext="Google uses CWV as a ranking signal. If any metric is red, we can identify + fix the root cause — render-blocking scripts, oversized hero images, lazy-loading gaps, or layout shifts."
        serviceType="Performance Optimization"
        triggerPage="performance-cache"
      />
    </div>
  );
}

function EmptyChart({ message, onRunMobile, onRunDesktop }: { message: string; onRunMobile: () => void; onRunDesktop: () => void }) {
  return (
    <div style={{ padding: 30, textAlign: 'center', color: '#5A7A8A' }}>
      <div style={{ fontSize: 13, marginBottom: 12 }}>{message}</div>
      <div style={{ display: 'inline-flex', gap: 10 }}>
        <button className="abtn abtn-sky" onClick={onRunMobile}>Run mobile test</button>
        <button className="abtn abtn-outline" onClick={onRunDesktop}>Run desktop test</button>
      </div>
    </div>
  );
}
