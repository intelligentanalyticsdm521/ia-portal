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

  const { data: bookings, loading: bookingsLoading } = useArionData(
    () => activeSiteId ? arionApi.getBookings(activeSiteId) : Promise.resolve(null),
    [activeSiteId]
  );

  if (formsLoading || bookingsLoading) return <Loading />;
  if (!selectedSite) return <EmptyPanel message="No ARION site selected." />;

  const formsArr = Array.isArray(forms) ? forms : (forms as any)?.items ?? [];
  const bookingsArr = Array.isArray(bookings) ? bookings : (bookings as any)?.items ?? [];

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
        <table className="data-table">
          <thead>
            <tr><th>Form</th><th>Submissions</th><th>Conversion Rate</th><th>Top Page</th></tr>
          </thead>
          <tbody>
            {formsArr.length > 0 ? formsArr.map((f: any, i: number) => (
              <tr key={i}>
                <td>{f.form_name ?? f.name ?? '--'}</td>
                <td>{f.submissions ?? f.count ?? '--'}</td>
                <td>{f.conversion_rate ?? '--'}</td>
                <td>{f.top_page ?? '--'}</td>
              </tr>
            )) : (
              <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No form data available</td></tr>
            )}
          </tbody>
        </table>
      </Card>

      <Card title="Booking Requests">
        <table className="data-table">
          <thead>
            <tr><th>Type</th><th>Requests</th><th>Conversion Rate</th><th>Top Page</th></tr>
          </thead>
          <tbody>
            {bookingsArr.length > 0 ? bookingsArr.map((b: any, i: number) => (
              <tr key={i}>
                <td>{b.type ?? b.booking_type ?? '--'}</td>
                <td>{b.requests ?? b.count ?? '--'}</td>
                <td>{b.conversion_rate ?? '--'}</td>
                <td>{b.top_page ?? '--'}</td>
              </tr>
            )) : (
              <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No booking data available</td></tr>
            )}
          </tbody>
        </table>
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
