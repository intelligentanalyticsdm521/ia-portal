import { useState } from 'react';
import { Card, HealthRow, Loading, EmptyPanel, ConsultingUpsell } from '../../components/Ui';
import { useArionContext } from '../../useArionContext';

export function WebsiteSupport() {
  const { selectedSite, activeSiteId, arionApi, loading } = useArionContext();
  const [notes, setNotes] = useState('');
  const [requestType] = useState('content_update');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  if (loading) return <Loading />;
  if (!selectedSite) return <EmptyPanel message="No site selected." />;

  // No request history endpoint exists yet — site_request table not created
  const requestList: any[] = [];

  const handleSubmit = async () => {
    if (!activeSiteId || !notes.trim()) return;
    setSubmitting(true);
    try {
      await arionApi.submitRequest(activeSiteId, requestType, notes);
      setSubmitted(true);
      setNotes('');
      setTimeout(() => setSubmitted(false), 3000);
    } catch {
      alert('Failed to submit request. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      {/* Submit a Content Request */}
      <Card title="Submit a Content Request">
        <div style={{ marginBottom: 8, fontSize: 12, fontWeight: 500 }}>
          What needs to be updated?
        </div>
        <textarea
          className="textarea-input"
          placeholder='Describe the change you need — e.g. "Update the phone number on the Contact page to (555) 123-4567."'
          value={notes}
          onChange={e => setNotes(e.target.value)}
          rows={3}
          style={{ width: '100%', resize: 'vertical', padding: 8, borderRadius: 6, border: '1px solid var(--border)', fontSize: 13 }}
        />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {submitted ? 'Request submitted!' : ''}
          </span>
          <button className="abtn abtn-sky" onClick={handleSubmit} disabled={submitting || !notes.trim()}>
            {submitting ? 'Submitting...' : 'Submit Request'}
          </button>
        </div>
      </Card>

      {/* Recent Requests */}
      <Card title="Recent Requests" style={{ marginTop: 12 }}>
        {requestList.length > 0 ? requestList.map((r: any, i: number) => {
          const st = r.status === 'completed' ? 'ok' : r.status === 'in_progress' ? 'warn' : 'err';
          return <HealthRow key={i} status={st} label={r.description ?? r.label ?? '--'} value={r.statusLabel ?? r.status ?? '--'} />;
        }) : (
          <EmptyPanel message="No support requests yet." />
        )}
      </Card>

      <ConsultingUpsell
        headline="Need more than content updates? IA offers full-service website management."
        subtext="Comprehensive website management and support."
        serviceType="Website Strategy"
        triggerPage="website-support"
      />
    </div>
  );
}
