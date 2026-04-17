import { useArionContext } from '../../useArionContext';
import { useArionData } from '../../useArionData';
import { Card, TierGate, EmptyPanel, Loading, ConsultingUpsell } from '../../components/Ui';
import { BarChartViz } from '../../components/Charts';

export function AnalyticsConversions() {
  const { selectedSite, activeSiteId, arionApi } = useArionContext();
  const tier = selectedSite?.arionTier || 'standard';

  const { data: forms, loading: formsLoading } = useArionData(
    () => activeSiteId ? arionApi.getForms(activeSiteId) : Promise.resolve(null),
    [activeSiteId]
  );

  if (formsLoading) return <Loading />;
  if (!selectedSite) return <EmptyPanel message="No ARION site selected." />;

  const formsArr = Array.isArray(forms) ? forms : (forms as any)?.items ?? [];

  return (
    <TierGate currentTier={tier} requiredTier="standard" featureName="Conversion tracking and form analytics">
      {formsArr.length > 0 && (
        <Card title="Submissions by Form">
          <BarChartViz
            data={formsArr.map((f: any) => ({
              label: f.form_name ?? f.name ?? 'Unknown',
              submissions: Number(f.submissions ?? f.count) || 0,
            }))}
            dataKey="submissions"
            xKey="label"
            color="#EF6C33"
            height={250}
          />
        </Card>
      )}

      <Card title="Form Submissions">
        {formsArr.length > 0 ? (
          <table className="data-table">
            <thead>
              <tr><th>Form</th><th>Submissions</th><th>Conversion Rate</th><th>Top Page</th></tr>
            </thead>
            <tbody>
              {formsArr.map((f: any, i: number) => (
                <tr key={i}>
                  <td>{f.form_name ?? f.name ?? '--'}</td>
                  <td>{f.submissions ?? f.count ?? '--'}</td>
                  <td>{f.conversion_rate ?? '--'}</td>
                  <td>{f.top_page ?? '--'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
            Form submissions will appear here once visitors complete forms on your site.
          </div>
        )}
      </Card>

      <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
        Conversion data from ARION database
      </div>

      <ConsultingUpsell
        headline="Low conversion rate? Our CRO team audits forms and landing pages to improve it."
        subtext="Conversion rate optimization backed by data."
        serviceType="Conversion Optimization"
        triggerPage="analytics-conversions"
      />
    </TierGate>
  );
}
