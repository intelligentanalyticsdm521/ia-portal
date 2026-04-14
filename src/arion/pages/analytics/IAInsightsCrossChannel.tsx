import { useArionContext } from '../../useArionContext';
import { useArionData } from '../../useArionData';
import { StatCard, Card, Loading, ConsultingUpsell } from '../../components/Ui';

export function IAInsightsCrossChannel() {
  const { selectedSite, activeSiteId, arionApi } = useArionContext();

  const { data: overview, loading: ovLoading } = useArionData(
    () => activeSiteId ? arionApi.getOverview(activeSiteId) : Promise.resolve(null),
    [activeSiteId]
  );

  const { data: forms, loading: formsLoading } = useArionData(
    () => activeSiteId ? arionApi.getForms(activeSiteId) : Promise.resolve(null),
    [activeSiteId]
  );

  if (ovLoading || formsLoading) return <Loading />;
  if (!selectedSite) return <div style={{ padding: 24, color: 'var(--text-muted)' }}>No ARION site selected.</div>;

  const ov = overview as Record<string, any> | null;
  const formsData = forms as any;
  const formLeads = formsData?.meta?.total ?? (Array.isArray(formsData) ? formsData.length : null) ?? '--';
  const sessions = ov?.overview?.sessions ?? '--';

  /* Placeholders for SPARK and OLIVER until cross-platform integration */
  const sparkContacts = '--';
  const oliverJobs = '--';

  /* Funnel values (use numeric fallback for width calculation) */
  const funnelSteps = [
    { label: 'Website Sessions', value: sessions, color: '#3b82f6' },
    { label: 'Form Leads', value: formLeads, color: '#8b5cf6' },
    { label: 'SPARK Contacts', value: sparkContacts, color: '#f59e0b' },
    { label: 'OLIVER Jobs', value: oliverJobs, color: '#22c55e' },
  ];

  /* For the funnel, derive widths from the step index */
  const funnelWidths = [100, 75, 50, 35];

  return (
    <div>
      <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>IA Cross-Channel Funnel</h2>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>Combined view of website traffic, form leads, and platform engagement.</p>

      {/* Stat Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
        <StatCard label="Website Sessions" value={sessions} />
        <StatCard label="Form Leads" value={formLeads} />
        <StatCard label="SPARK Contacts" value={sparkContacts} />
        <StatCard label="OLIVER Jobs" value={oliverJobs} />
      </div>

      {/* Funnel Visualization */}
      <Card title="Cross-Channel Funnel">
        <div style={{ padding: '8px 0' }}>
          {funnelSteps.map((step, i) => (
            <div key={step.label} style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ width: 140, fontSize: 12, fontWeight: 500, flexShrink: 0 }}>
                {step.label}
              </div>
              <div style={{ flex: 1, position: 'relative' }}>
                <div style={{
                  width: `${funnelWidths[i]}%`,
                  height: 28,
                  background: step.color,
                  borderRadius: 4,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff',
                  fontSize: 12,
                  fontWeight: 600,
                  transition: 'width 0.3s',
                }}>
                  {step.value}
                </div>
              </div>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
          Connect OLIVER and SPARK to populate all funnel stages with live data.
        </div>
      </Card>

      <ConsultingUpsell
        headline="Connect OLIVER and SPARK to see your full revenue funnel"
        subtext="Cross-channel insights require platform integration."
        serviceType="Analytics Consulting"
        triggerPage="ia-insights-cross-channel"
      />
    </div>
  );
}
