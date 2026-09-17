import { useState } from 'react';
import { Card, Loading, EmptyPanel, ConsultingUpsell } from '../../components/Ui';
import { useArionContext } from '../../useArionContext';
import { useArionData } from '../../useArionData';
import type { ArionSiteRequest, SiteRequestStatus } from '../../../lib/arionApi';

/** Plain words, not the database's. Colour matches the ARION status pills. */
const STATUS_LABEL: Record<SiteRequestStatus, string> = {
  open: 'Received',
  in_progress: 'Being worked on',
  done: 'Done',
  declined: 'Not doing this one',
};

const STATUS_TONE: Record<SiteRequestStatus, { bg: string; fg: string }> = {
  open: { bg: '#FEF3C7', fg: '#92400E' },
  in_progress: { bg: '#DBEAFE', fg: '#1E40AF' },
  done: { bg: '#DCFCE7', fg: '#166534' },
  declined: { bg: '#F1F5F9', fg: '#475569' },
};

function StatusChip({ status }: { status: SiteRequestStatus }) {
  const tone = STATUS_TONE[status] ?? STATUS_TONE.open;
  return (
    <span style={{
      background: tone.bg, color: tone.fg, borderRadius: 999, padding: '2px 10px',
      fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap',
    }}>
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

function formatDay(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function RequestRow({ r }: { r: ArionSiteRequest }) {
  return (
    <div style={{ padding: '12px 0', borderTop: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <StatusChip status={r.status} />
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          Sent {formatDay(r.createdAt)}
          {r.resolvedAt ? ` · Finished ${formatDay(r.resolvedAt)}` : ''}
        </span>
      </div>
      <div style={{ fontSize: 13, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
        {(r.notes || '').trim() || r.requestType.replace(/_/g, ' ')}
      </div>
      {r.resolutionNotes && (
        <div style={{
          marginTop: 8, padding: '8px 10px', background: 'var(--surface-2, #F8FAFC)',
          borderRadius: 6, fontSize: 12, lineHeight: 1.5,
        }}>
          <span style={{ fontWeight: 600 }}>Our reply: </span>{r.resolutionNotes}
        </div>
      )}
    </div>
  );
}

export function WebsiteSupport() {
  const { selectedSite, activeSiteId, arionApi, loading } = useArionContext();
  const [notes, setNotes] = useState('');
  const [requestType] = useState('content_update');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  // §11.11 + D-20. This used to be `alert('Failed to submit request…')` — the
  // browser's grey box, at the top of the screen, miles from the button that
  // raised it, with an "OK" that acknowledges nothing. It is not a question, so
  // it is not a ConfirmDialog; a refusal belongs BESIDE the control that was
  // pressed, in the slot the success line already uses.
  const [refusal, setRefusal] = useState('');

  // Real history from arion.site_request (migration 055) — this list used to be
  // a hardcoded [] with the comment "no request history endpoint exists yet".
  const { data, loading: listLoading, error: listError, refetch } = useArionData(
    () => activeSiteId ? arionApi.listRequests(activeSiteId) : Promise.resolve(null),
    [activeSiteId]
  );
  const requestList: ArionSiteRequest[] = data?.requests ?? [];

  if (loading) return <Loading />;
  if (!selectedSite) return <EmptyPanel message="No site selected." />;

  const handleSubmit = async () => {
    if (!activeSiteId || !notes.trim()) return;
    setSubmitting(true);
    setRefusal('');
    try {
      await arionApi.submitRequest(activeSiteId, requestType, notes);
      setSubmitted(true);
      setNotes('');
      // Show it in the list straight away — otherwise the client sends a
      // request and the history below still looks empty.
      refetch();
      setTimeout(() => setSubmitted(false), 3000);
    } catch {
      setRefusal('We could not send that request just now. Nothing was lost — press Submit Request again.');
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
          onChange={e => { setNotes(e.target.value); if (refusal) setRefusal(''); }}
          rows={3}
          style={{ width: '100%', resize: 'vertical', padding: 8, borderRadius: 6, border: '1px solid var(--border)', fontSize: 13 }}
        />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
          <span
            data-support-refusal={refusal ? 'yes' : undefined}
            role={refusal ? 'alert' : undefined}
            style={{ fontSize: 12, color: refusal ? 'var(--danger, #B91C1C)' : 'var(--text-muted)' }}
          >
            {refusal || (submitted ? 'Request submitted!' : '')}
          </span>
          <button className="abtn abtn-sky" onClick={handleSubmit} disabled={submitting || !notes.trim()}>
            {submitting ? 'Submitting...' : 'Submit Request'}
          </button>
        </div>
      </Card>

      {/* Recent Requests — newest first, with what we said back */}
      <Card title="Your requests" subtitle="Newest first. We email you when one is finished." style={{ marginTop: 12 }}>
        {listLoading && requestList.length === 0 ? (
          <Loading message="Loading your requests..." />
        ) : listError ? (
          <EmptyPanel message="We could not load your requests just now. Try again in a moment." />
        ) : requestList.length > 0 ? (
          requestList.map((r) => <RequestRow key={r.siteRequestId} r={r} />)
        ) : (
          <EmptyPanel message="You have not asked for any changes yet. Anything you send above shows up here with its status." />
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
