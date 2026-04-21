import React, { useMemo, useState } from 'react';
import { useArionContext } from '../../useArionContext';
import { useArionData } from '../../useArionData';
import {
  StatCard, Card, Loading, ConsultingUpsell, DetailsModal, HealthRow,
} from '../../components/Ui';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  ReferenceArea, Legend,
} from 'recharts';

/**
 * Core Web Vitals — analytics-first summary with drill-down modal.
 *
 * Data source: Google PageSpeed Insights (direct API call, same engine
 * Hostinger + Site Kit use under the hood). Runs happen automatically:
 *   - On site onboarding (one-time baseline)
 *   - Monthly for Growth / Authority tiers
 *   - Quarterly for Starter / Essentials tiers
 *
 * Clients do NOT run tests manually. All data collection is on the schedule
 * defined by their plan. This keeps PSI quota predictable + prevents clients
 * from spamming the API.
 *
 * This page is the SUMMARY view. Full per-metric history, CrUX field data,
 * and Lighthouse opportunities live in the "See Full Details →" modal.
 */
export function PerformanceCache() {
  const { selectedSite, activeSiteId, arionApi, loading } = useArionContext();
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTab, setModalTab] = useState<'history' | 'metrics' | 'crux' | 'opportunities'>('history');
  const [purgeBusy, setPurgeBusy] = useState(false);
  const [purgeNotice, setPurgeNotice] = useState<string | null>(null);

  const { data: pagespeed, loading: psLoading } = useArionData(
    () => activeSiteId ? arionApi.getPagespeedHistory(activeSiteId) : Promise.resolve(null),
    [activeSiteId]
  );

  const { data: perfEnv, loading: perfLoading } = useArionData(
    () => activeSiteId ? arionApi.getPluginPerformance(activeSiteId) : Promise.resolve(null),
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
      const mobileMetrics = mobile.metrics || {};
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
        triggeredBy: mobile.triggered_by || desktop.triggered_by || null,
      };
    }).sort((a, b) => a.rawDate - b.rawDate);
  }, [snapshots]);

  const latestSnapshot = snapshots.length > 0 ? snapshots[snapshots.length - 1] : null;
  const latest = chartData.length > 0 ? chartData[chartData.length - 1] : null;
  const previous = chartData.length > 1 ? chartData[chartData.length - 2] : null;

  const perfData = (perfEnv as any)?.data || {};
  const ls = perfData.litespeed || null;

  // ── Cadence + next-run calculation ─────────────────────────────────
  const tier = String(selectedSite?.arionTier || '').toLowerCase();
  const isMonthlyTier = ['growth', 'authority', 'business', 'enterprise'].includes(tier);
  const cadenceDays = isMonthlyTier ? 30 : 90;
  const cadenceLabel = isMonthlyTier ? 'monthly' : 'quarterly';
  const nextRunDate = (() => {
    if (!latest?.rawDate) return null;
    return new Date(latest.rawDate + cadenceDays * 86400000);
  })();

  if (loading || psLoading) return <Loading />;
  if (!selectedSite) return <div style={{ padding: 24, color: 'var(--text-muted)' }}>No site selected.</div>;

  const mobileScore = latest?.mobileScore ?? null;
  const desktopScore = latest?.desktopScore ?? null;
  const lcp = latest?.lcp ?? null;
  const inp = latest?.inp ?? null;
  const cls = latest?.cls ?? null;

  const delta = (curr: number | null, prev: number | null) => {
    if (curr == null || prev == null) return null;
    return curr - prev;
  };
  const mobileDelta = delta(mobileScore, previous?.mobileScore ?? null);
  const desktopDelta = delta(desktopScore, previous?.desktopScore ?? null);

  const cwvColor = (metric: string, v: number | null) => {
    if (v == null || isNaN(Number(v))) return '#94A3B8';
    const val = Number(v);
    if (metric === 'lcp') return val <= 2500 ? '#22c55e' : val <= 4000 ? '#f59e0b' : '#dc2626';
    if (metric === 'inp') return val <= 200 ? '#22c55e' : val <= 500 ? '#f59e0b' : '#dc2626';
    if (metric === 'cls') return val <= 0.1 ? '#22c55e' : val <= 0.25 ? '#f59e0b' : '#dc2626';
    return '#94A3B8';
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

  const metricsSummary = [
    { key: 'lcp', label: 'LCP', full: 'Largest Contentful Paint', value: lcp },
    { key: 'inp', label: 'INP', full: 'Interaction to Next Paint', value: inp },
    { key: 'cls', label: 'CLS', full: 'Cumulative Layout Shift', value: cls },
  ];
  const goodCount = metricsSummary.filter((m) => m.value != null && cwvBand(m.key, m.value) === 'Good').length;
  const measuredCount = metricsSummary.filter((m) => m.value != null).length;

  // ── State machine for storytelling band ─────────────────────────────
  // Three distinct states:
  //   pending  — no data yet (first run scheduled but not completed)
  //   passing  — all measured metrics in "Good" band
  //   mixed    — some good, some not
  //   failing  — none in "Good" band (but only if we have data to fail)
  const pageState = (() => {
    if (snapshots.length === 0) return 'pending';
    if (measuredCount === 0) return 'pending';
    if (goodCount === measuredCount) return 'passing';
    if (goodCount >= 1) return 'mixed';
    return 'failing';
  })();

  const storyBand = (() => {
    if (pageState === 'pending') {
      return {
        tone: 'info' as const,
        headline: 'PageSpeed data collection is scheduled.',
        body: `Google PageSpeed Insights runs automatically for your site on a ${cadenceLabel} cadence (based on your plan tier). Your first scheduled run will populate this page with mobile + desktop scores, Core Web Vitals, and Lighthouse opportunities — no manual action needed.`,
      };
    }
    if (pageState === 'passing') {
      return {
        tone: 'ok' as const,
        headline: `All ${measuredCount} Core Web Vitals are passing.`,
        body: `Your site meets Google's ranking thresholds for loading speed, responsiveness, and visual stability. Keep LiteSpeed Cache configured as-is and monitor this page after each scheduled run.`,
      };
    }
    if (pageState === 'mixed') {
      return {
        tone: 'warn' as const,
        headline: `${goodCount} of ${measuredCount} Core Web Vitals are passing.`,
        body: `One or more metrics need work. Google uses Core Web Vitals as a direct ranking signal — the weakest metric drags rankings even if the others are strong. See Full Details for Lighthouse's top optimization opportunities.`,
      };
    }
    return {
      tone: 'err' as const,
      headline: `Core Web Vitals are failing.`,
      body: `Your site is falling below Google's ranking thresholds for mobile users. This directly impacts positions in search. Open Full Details to see which specific pages + resources are slowing the site down.`,
    };
  })();

  const toneStyle: Record<string, any> = {
    info: { background: '#EFF6FF', borderLeft: '4px solid #0284c7' },
    ok: { background: '#F0FDF4', borderLeft: '4px solid #1D9E75' },
    warn: { background: '#FFFBEB', borderLeft: '4px solid #D97706' },
    err: { background: '#FEF2F2', borderLeft: '4px solid #D85A30' },
  };

  const handlePurgeCache = async () => {
    if (!activeSiteId || purgeBusy) return;
    setPurgeBusy(true);
    setPurgeNotice(null);
    try {
      await arionApi.purgePluginCache(activeSiteId);
      setPurgeNotice('✓ Cache purged. New visitors will fetch fresh assets.');
      setTimeout(() => setPurgeNotice(null), 5000);
    } catch (err: any) {
      setPurgeNotice(`Purge failed: ${err?.message || 'unknown error'}`);
      setTimeout(() => setPurgeNotice(null), 6000);
    } finally {
      setPurgeBusy(false);
    }
  };

  return (
    <div>
      {/* ── Storytelling band + See Full Details button at top ──────────── */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 16 }}>
        <div style={{ ...toneStyle[storyBand.tone], flex: 1, padding: '14px 18px', borderRadius: 6 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#0B1C24', marginBottom: 4 }}>{storyBand.headline}</div>
          <div style={{ fontSize: 12, color: '#5A7A8A', lineHeight: 1.5 }}>{storyBand.body}</div>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          style={{
            padding: '10px 18px', fontSize: 12, fontWeight: 600,
            background: '#0B1C24', color: '#fff',
            border: 'none', borderRadius: 6, cursor: 'pointer', whiteSpace: 'nowrap',
          }}
        >
          See Full Details →
        </button>
      </div>

      {/* ── Summary stat row ───────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 14 }}>
        <StatCard
          label="Mobile score"
          value={mobileScore != null ? String(mobileScore) : '—'}
          deltaType={mobileScore == null ? 'neutral' : mobileScore >= 80 ? 'positive' : mobileScore >= 50 ? 'neutral' : 'negative'}
          delta={mobileDelta != null ? `${mobileDelta > 0 ? '▲' : mobileDelta < 0 ? '▼' : '—'} ${Math.abs(mobileDelta)} vs last run` : undefined}
        />
        <StatCard
          label="Desktop score"
          value={desktopScore != null ? String(desktopScore) : '—'}
          deltaType={desktopScore == null ? 'neutral' : desktopScore >= 80 ? 'positive' : desktopScore >= 50 ? 'neutral' : 'negative'}
          delta={desktopDelta != null ? `${desktopDelta > 0 ? '▲' : desktopDelta < 0 ? '▼' : '—'} ${Math.abs(desktopDelta)} vs last run` : undefined}
        />
        <StatCard
          label="CWV passing"
          value={measuredCount > 0 ? `${goodCount} / ${measuredCount}` : '—'}
          deltaType={measuredCount === 0 ? 'neutral' : goodCount === measuredCount ? 'positive' : goodCount >= 1 ? 'neutral' : 'negative'}
        />
        <StatCard
          label="Next scheduled run"
          value={nextRunDate ? nextRunDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '—'}
          delta={`${cadenceLabel} cadence · ${tier || 'unknown tier'}`}
        />
      </div>

      {/* ── Mobile vs Desktop trend ────────────────────────────────────── */}
      <Card title="Performance trend (mobile vs desktop)">
        {chartData.length === 0 ? (
          <div style={{ padding: 30, textAlign: 'center', color: '#5A7A8A', fontSize: 13 }}>
            No PageSpeed history yet. Your first run is scheduled automatically.
          </div>
        ) : chartData.length === 1 ? (
          <div style={{ padding: 20, textAlign: 'center', color: '#5A7A8A', fontSize: 13 }}>
            <div style={{ marginBottom: 6 }}>Only one snapshot so far.</div>
            <div style={{ fontSize: 12 }}>Trend chart will populate after the next scheduled {cadenceLabel} run.</div>
          </div>
        ) : (
          <div style={{ height: 240 }}>
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

      {/* ── Latest Core Web Vitals (mobile) ────────────────────────────── */}
      <div style={{ marginTop: 14 }}>
        <Card title="Latest Core Web Vitals (mobile)">
          {measuredCount === 0 ? (
            <div style={{ padding: 20, textAlign: 'center', color: '#5A7A8A', fontSize: 13 }}>
              Core Web Vitals will appear after your first scheduled PageSpeed run.
            </div>
          ) : (
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
                  <div style={{ fontSize: 11, color: '#5A7A8A', marginBottom: 10 }}>{m.full}</div>
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
          )}
        </Card>
      </div>

      {/* ── LiteSpeed Cache status ─────────────────────────────────────── */}
      <div style={{ marginTop: 14 }}>
        <Card title="LiteSpeed Cache status">
          {purgeNotice && (
            <div style={{ padding: '8px 12px', marginBottom: 10, background: '#F0FDF4', borderLeft: '3px solid #1D9E75', borderRadius: 4, fontSize: 12, color: '#065F46' }}>
              {purgeNotice}
            </div>
          )}
          {perfLoading ? (
            <div style={{ padding: 10, fontSize: 12, color: '#5A7A8A' }}>Loading cache status…</div>
          ) : !ls?.installed ? (
            <div style={{ padding: 12, background: '#FEF3C7', borderLeft: '3px solid #D97706', borderRadius: 4, fontSize: 12, color: '#78350F', lineHeight: 1.5 }}>
              <strong>LiteSpeed Cache not installed.</strong> LiteSpeed is the recommended caching solution for Hostinger + LiteSpeed servers — install it from WP Admin → Plugins → Add New → search "LiteSpeed Cache".
            </div>
          ) : (
            <>
              <div style={{ fontSize: 11, color: '#5A7A8A', marginBottom: 12, lineHeight: 1.5 }}>
                Cache + minify + lazy-load are the biggest levers for PageSpeed scores. Status below reflects your current LiteSpeed configuration.
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <div style={{ fontSize: 10, color: '#5A7A8A', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Cache</div>
                  <HealthRow status={ls.cache_enabled ? 'ok' : 'warn'} label="Page cache" value={ls.cache_enabled ? 'Enabled' : 'Disabled'} />
                  <HealthRow status={ls.object_cache ? 'ok' : 'warn'} label="Object cache" value={ls.object_cache ? 'Enabled' : 'Disabled'} />
                  <HealthRow status={ls.browser_cache ? 'ok' : 'warn'} label="Browser cache" value={ls.browser_cache ? 'Enabled' : 'Disabled'} />
                  <HealthRow status={ls.mobile_cache ? 'ok' : 'warn'} label="Mobile cache" value={ls.mobile_cache ? 'Enabled' : 'Disabled'} />
                </div>
                <div>
                  <div style={{ fontSize: 10, color: '#5A7A8A', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Optimization</div>
                  <HealthRow status={ls.css_minify ? 'ok' : 'warn'} label="CSS minify" value={ls.css_minify ? 'Enabled' : 'Disabled'} />
                  <HealthRow status={ls.js_minify ? 'ok' : 'warn'} label="JS minify" value={ls.js_minify ? 'Enabled' : 'Disabled'} />
                  <HealthRow status={ls.lazy_load_images ? 'ok' : 'warn'} label="Lazy-load images" value={ls.lazy_load_images ? 'Enabled' : 'Disabled'} />
                  <HealthRow status={ls.webp_replace ? 'ok' : 'warn'} label="WebP serving" value={ls.webp_replace ? 'Enabled' : 'Disabled'} />
                </div>
              </div>
              <div style={{ marginTop: 14, display: 'flex', gap: 10, alignItems: 'center' }}>
                <button
                  className="abtn abtn-sky"
                  onClick={handlePurgeCache}
                  disabled={purgeBusy}
                >
                  {purgeBusy ? 'Purging…' : 'Purge cache'}
                </button>
                <span style={{ fontSize: 11, color: '#5A7A8A' }}>
                  Safe action — forces next visitor to fetch fresh assets. Use after design or content changes.
                </span>
              </div>
            </>
          )}
        </Card>
      </div>

      {/* ── Modal: Full Details ────────────────────────────────────────── */}
      <DetailsModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        eyebrow="Core Web Vitals"
        title="Full performance report"
        width={1100}
      >
        {/* Tabs */}
        <div style={{ display: 'flex', gap: 6, borderBottom: '1px solid #eef2f5', marginBottom: 14 }}>
          {([
            { key: 'history', label: 'History' },
            { key: 'metrics', label: 'Metrics over time' },
            { key: 'crux', label: 'Real-user data (CrUX)' },
            { key: 'opportunities', label: 'Opportunities' },
          ] as const).map((t) => (
            <button
              key={t.key}
              onClick={() => setModalTab(t.key)}
              style={{
                padding: '8px 14px', fontSize: 12, fontWeight: 600,
                background: 'transparent', border: 'none',
                borderBottom: modalTab === t.key ? '2px solid #0B1C24' : '2px solid transparent',
                color: modalTab === t.key ? '#0B1C24' : '#5A7A8A',
                cursor: 'pointer',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {modalTab === 'history' && <HistoryTab snapshots={snapshots} />}
        {modalTab === 'metrics' && <MetricsTab chartData={chartData} />}
        {modalTab === 'crux' && <CruxTab latestSnapshot={latestSnapshot} />}
        {modalTab === 'opportunities' && <OpportunitiesTab latestSnapshot={latestSnapshot} />}
      </DetailsModal>

      <ConsultingUpsell
        headline="Core Web Vitals impact rankings — let IA's performance team optimize"
        subtext="Google uses CWV as a ranking signal. If any metric is red, we can identify + fix the root cause — render-blocking scripts, oversized hero images, lazy-loading gaps, or layout shifts."
        serviceType="Performance Optimization"
        triggerPage="performance-cache"
      />
    </div>
  );
}

/* ─── Modal tab content components ─── */

function HistoryTab({ snapshots }: { snapshots: any[] }) {
  if (snapshots.length === 0) {
    return <div style={{ padding: 30, color: '#5A7A8A', textAlign: 'center', fontSize: 13 }}>No runs yet.</div>;
  }
  const rows = [...snapshots].reverse(); // newest first
  return (
    <table className="tbl" style={{ width: '100%', fontSize: 12 }}>
      <thead>
        <tr>
          <th>Date</th>
          <th>Mobile</th>
          <th>Desktop</th>
          <th>LCP (mobile)</th>
          <th>INP (mobile)</th>
          <th>CLS (mobile)</th>
          <th>Trigger</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((s: any, i) => {
          const m = s.mobile || {};
          const d = s.desktop || {};
          const mm = m.metrics || {};
          const trigger = m.triggered_by || d.triggered_by || '—';
          return (
            <tr key={s.timestamp || i}>
              <td>{s.timestamp ? new Date(s.timestamp).toLocaleDateString() : '—'}</td>
              <td>{m.performance ?? s.mobileScore ?? '—'}</td>
              <td>{d.performance ?? s.desktopScore ?? '—'}</td>
              <td>{mm.lcp != null ? `${(mm.lcp / 1000).toFixed(2)}s` : '—'}</td>
              <td>{mm.inp != null ? `${Math.round(mm.inp)}ms` : '—'}</td>
              <td>{mm.cls != null ? Number(mm.cls).toFixed(3) : '—'}</td>
              <td style={{ fontSize: 10, color: '#5A7A8A', textTransform: 'capitalize' }}>{trigger}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function MetricsTab({ chartData }: { chartData: any[] }) {
  if (chartData.length < 2) {
    return <div style={{ padding: 30, color: '#5A7A8A', textAlign: 'center', fontSize: 13 }}>Need at least 2 snapshots for a trend chart. Check back after your next scheduled run.</div>;
  }
  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#0B1C24', marginBottom: 8 }}>LCP (Largest Contentful Paint) — mobile</div>
        <div style={{ height: 180 }}>
          <ResponsiveContainer>
            <LineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5EEF2" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#5A7A8A' }} />
              <YAxis tick={{ fontSize: 10, fill: '#5A7A8A' }} />
              <ReferenceArea y1={0} y2={2500} fill="#22c55e" fillOpacity={0.08} />
              <ReferenceArea y1={2500} y2={4000} fill="#f59e0b" fillOpacity={0.08} />
              <ReferenceArea y1={4000} y2={10000} fill="#dc2626" fillOpacity={0.08} />
              <Tooltip contentStyle={{ fontSize: 11 }} formatter={(v: any) => v != null ? `${(v / 1000).toFixed(2)}s` : '—'} />
              <Line type="monotone" dataKey="lcp" name="LCP (ms)" stroke="#0284c7" strokeWidth={2} dot={{ r: 3 }} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#0B1C24', marginBottom: 8 }}>INP (Interaction to Next Paint)</div>
          <div style={{ height: 160 }}>
            <ResponsiveContainer>
              <LineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5EEF2" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#5A7A8A' }} />
                <YAxis tick={{ fontSize: 10, fill: '#5A7A8A' }} />
                <ReferenceArea y1={0} y2={200} fill="#22c55e" fillOpacity={0.08} />
                <ReferenceArea y1={200} y2={500} fill="#f59e0b" fillOpacity={0.08} />
                <ReferenceArea y1={500} y2={1500} fill="#dc2626" fillOpacity={0.08} />
                <Tooltip contentStyle={{ fontSize: 11 }} formatter={(v: any) => v != null ? `${Math.round(v)}ms` : '—'} />
                <Line type="monotone" dataKey="inp" name="INP (ms)" stroke="#0284c7" strokeWidth={2} dot={{ r: 3 }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#0B1C24', marginBottom: 8 }}>CLS (Cumulative Layout Shift)</div>
          <div style={{ height: 160 }}>
            <ResponsiveContainer>
              <LineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5EEF2" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#5A7A8A' }} />
                <YAxis tick={{ fontSize: 10, fill: '#5A7A8A' }} />
                <ReferenceArea y1={0} y2={0.1} fill="#22c55e" fillOpacity={0.08} />
                <ReferenceArea y1={0.1} y2={0.25} fill="#f59e0b" fillOpacity={0.08} />
                <ReferenceArea y1={0.25} y2={1} fill="#dc2626" fillOpacity={0.08} />
                <Tooltip contentStyle={{ fontSize: 11 }} formatter={(v: any) => v != null ? Number(v).toFixed(3) : '—'} />
                <Line type="monotone" dataKey="cls" name="CLS" stroke="#0284c7" strokeWidth={2} dot={{ r: 3 }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}

function CruxTab({ latestSnapshot }: { latestSnapshot: any }) {
  const crux = latestSnapshot?.mobile?.crux_origin || null;
  if (!crux) {
    return (
      <div style={{ padding: 30, color: '#5A7A8A', textAlign: 'center', fontSize: 13 }}>
        <div style={{ marginBottom: 6 }}>No CrUX field data yet.</div>
        <div style={{ fontSize: 12 }}>Google's Chrome User Experience Report requires enough real-user traffic to generate statistics. Sites with low traffic may never have CrUX data; we'll show it automatically when Google has enough samples.</div>
      </div>
    );
  }
  const metrics = [
    { key: 'lcp', label: 'LCP', full: 'Largest Contentful Paint', data: crux.lcp, format: (v: number) => `${(v / 1000).toFixed(2)}s` },
    { key: 'inp', label: 'INP', full: 'Interaction to Next Paint', data: crux.inp, format: (v: number) => `${Math.round(v)}ms` },
    { key: 'cls', label: 'CLS', full: 'Cumulative Layout Shift', data: crux.cls, format: (v: number) => (v / 100).toFixed(3) },
  ].filter((m) => m.data && m.data.distributions);

  if (metrics.length === 0) {
    return <div style={{ padding: 30, color: '#5A7A8A', textAlign: 'center', fontSize: 13 }}>Not enough real-user traffic for CrUX yet.</div>;
  }

  return (
    <div>
      <div style={{ fontSize: 12, color: '#5A7A8A', marginBottom: 14, lineHeight: 1.5 }}>
        Field data from real Chrome users visiting your site over the last 28 days. This is what Google actually uses for ranking — lab scores above are a proxy; this is the real signal.
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        {metrics.map((m) => {
          const dist = m.data.distributions || [];
          const good = dist[0]?.proportion ?? 0;
          const avg = dist[1]?.proportion ?? 0;
          const poor = dist[2]?.proportion ?? 0;
          const color = m.data.category === 'FAST' ? '#1D9E75' : m.data.category === 'AVERAGE' ? '#D97706' : '#D85A30';
          return (
            <div key={m.key} style={{ background: '#fff', border: '1px solid #E5EEF2', borderRadius: 8, padding: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#0B1C24' }}>{m.label}</div>
              <div style={{ fontSize: 10, color: '#5A7A8A', marginBottom: 10 }}>{m.full}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color }}>
                {m.data.percentile != null ? m.format(m.data.percentile) : '—'}
              </div>
              <div style={{ fontSize: 9, color: '#5A7A8A', marginTop: 2 }}>75th percentile · {m.data.category}</div>
              <div style={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', marginTop: 10 }}>
                <div style={{ width: `${good * 100}%`, background: '#22c55e' }} title={`Good: ${Math.round(good * 100)}%`} />
                <div style={{ width: `${avg * 100}%`, background: '#f59e0b' }} title={`Avg: ${Math.round(avg * 100)}%`} />
                <div style={{ width: `${poor * 100}%`, background: '#dc2626' }} title={`Poor: ${Math.round(poor * 100)}%`} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#5A7A8A', marginTop: 4 }}>
                <span>{Math.round(good * 100)}% good</span>
                <span>{Math.round(avg * 100)}% avg</span>
                <span>{Math.round(poor * 100)}% poor</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function OpportunitiesTab({ latestSnapshot }: { latestSnapshot: any }) {
  const opportunities: any[] = latestSnapshot?.mobile?.opportunities || [];
  if (opportunities.length === 0) {
    return <div style={{ padding: 30, color: '#5A7A8A', textAlign: 'center', fontSize: 13 }}>No major opportunities flagged by Lighthouse. Your site passes the default checks, or no run has completed yet.</div>;
  }
  return (
    <div>
      <div style={{ fontSize: 12, color: '#5A7A8A', marginBottom: 14, lineHeight: 1.5 }}>
        Lighthouse's ranked list of performance improvements for your site. Each item shows the estimated savings if you resolve it — fix the top items first for the biggest impact on mobile scores.
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 10 }}>
        {opportunities.map((op: any) => (
          <div key={op.id} style={{
            background: '#F8FAFC', borderRadius: 6, padding: 14,
            borderLeft: `3px solid ${op.score == null ? '#94A3B8' : op.score < 0.5 ? '#D85A30' : op.score < 0.9 ? '#D97706' : '#1D9E75'}`,
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#0B1C24', marginBottom: 4 }}>{op.title}</div>
            {op.display_value && (
              <div style={{ fontSize: 13, fontWeight: 600, color: '#D85A30', marginBottom: 6 }}>{op.display_value}</div>
            )}
            {op.description && (
              <div style={{ fontSize: 11, color: '#5A7A8A', lineHeight: 1.5 }}>{op.description}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
