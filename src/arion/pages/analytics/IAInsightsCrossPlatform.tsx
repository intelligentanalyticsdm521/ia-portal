import { useArionContext } from '../../useArionContext';
import { useAnalyticsData } from '../../analytics/useAnalyticsData';
import { formatNumber } from '../../analytics/chartConfig';
import { ConsultingUpsell } from '../../components/Ui';
import { AnalyticsNotConnected } from '../../analytics/AnalyticsNotConnected';

export function IAInsightsCrossPlatform() {
  const { selectedSite, activeSiteId } = useArionContext();
  const { data, loading } = useAnalyticsData(activeSiteId, 30);

  // A3-1 — the funnel's top-of-funnel metric is GA4 sessions; show a connect
  // CTA instead of an all-zero funnel when GA4 isn't linked yet.
  if (data?.connected === false) return <AnalyticsNotConnected />;

  if (!selectedSite) {
    return <div style={{ padding: 24, color: '#5A7A8A' }}>No ARION site selected.</div>;
  }

  if (loading) {
    return <div style={{ padding: 24, color: '#5A7A8A' }}>Loading...</div>;
  }

  /* ── Funnel stages ── */
  const stages = [
    { label: 'Website Sessions', value: data?.summary?.totalSessions || 0, color: '#2D9CDB', available: true },
    { label: 'Form Submissions', value: 0, color: '#EF6C33', available: true },
    { label: 'SPARK Contacts', value: 0, color: '#E64A28', available: false },
    { label: 'Quotes Created', value: 0, color: '#FEC82C', available: false },
    { label: 'Jobs Won', value: 0, color: 'rgba(254,200,44,0.7)', available: false },
  ];
  const maxValue = Math.max(...stages.map(s => s.value), 1);

  return (
    <div>
      {/* ── Header ── */}
      <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 4, color: '#0B1C24' }}>IA Cross-Platform Funnel</h2>
      <p style={{ fontSize: 12, color: '#5A7A8A', marginBottom: 16 }}>
        Combined view of website traffic, form leads, and platform engagement.
      </p>

      {/* ── Stat Cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Website Sessions', value: formatNumber(data?.summary?.totalSessions || 0), accent: '#2D9CDB' },
          { label: 'Form Submissions', value: '0', accent: '#EF6C33' },
          { label: 'SPARK Contacts', value: '--', accent: '#E64A28' },
          { label: 'OLIVER Jobs', value: '--', accent: '#FEC82C' },
        ].map((card) => (
          <div
            key={card.label}
            style={{
              background: '#fff',
              border: '1px solid rgba(45,156,219,0.12)',
              borderRadius: 10,
              padding: '14px 16px',
              borderTop: `3px solid ${card.accent}`,
            }}
          >
            <div style={{ fontSize: 11, color: '#5A7A8A', marginBottom: 4 }}>{card.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#0B1C24' }}>{card.value}</div>
          </div>
        ))}
      </div>

      {/* ── Revenue Funnel ── */}
      <div style={{ background: '#fff', border: '1px solid rgba(45,156,219,0.12)', borderRadius: 10, padding: 20, marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#0B1C24', marginBottom: 14 }}>Revenue Funnel</div>

        {stages.map((stage, i) => (
          <div key={stage.label} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <div style={{ width: 130, fontSize: 12, fontWeight: 500, color: '#0B1C24', flexShrink: 0 }}>{stage.label}</div>
            <div style={{ flex: 1, background: '#F2F6F9', borderRadius: 4, height: 28, position: 'relative' }}>
              {stage.available ? (
                <div
                  style={{
                    width: `${(stage.value / maxValue) * 100}%`,
                    minWidth: stage.value > 0 ? 4 : 0,
                    height: '100%',
                    background: stage.color,
                    borderRadius: 4,
                  }}
                />
              ) : (
                <div
                  style={{
                    width: '100%',
                    height: '100%',
                    background: 'rgba(0,0,0,0.04)',
                    borderRadius: 4,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 10,
                    color: '#999',
                  }}
                >
                  Subscribe to unlock
                </div>
              )}
            </div>
            <div style={{ width: 50, fontSize: 13, fontWeight: 600, textAlign: 'right' }}>
              {stage.available ? stage.value : '--'}
            </div>
            <div style={{ width: 50, fontSize: 10, color: '#5A7A8A', textAlign: 'right' }}>
              {i > 0 && stages[i - 1].value > 0 && stage.available
                ? ((stage.value / stages[i - 1].value) * 100).toFixed(1) + '%'
                : ''}
            </div>
          </div>
        ))}
      </div>

      {/* ── Note ── */}
      <div style={{ fontSize: 11, color: '#5A7A8A', marginBottom: 16, lineHeight: 1.5 }}>
        Quotes are created manually in OLIVER unless auto-quote rules are configured.
        Form submissions automatically create SPARK contacts.
      </div>

      {/* ── Consulting Upsell ── */}
      <ConsultingUpsell
        headline="Add SPARK and OLIVER to see your full revenue funnel — from web visit to closed job."
        subtext="Cross-platform insights powered by your IA platform data."
        serviceType="Analytics Consulting"
        triggerPage="ia-insights-cross-platform"
      />
    </div>
  );
}
