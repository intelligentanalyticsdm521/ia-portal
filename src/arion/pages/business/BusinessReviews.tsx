import { useState } from 'react';
import { useArionContext } from '../../useArionContext';
import { useArionData } from '../../useArionData';
import { Card, EmptyPanel, Loading, ConsultingUpsell } from '../../components/Ui';

export function BusinessReviews() {
  const { selectedSite, activeSiteId, arionApi } = useArionContext();
  const tier = selectedSite?.arionTier || 'standard';

  const [refreshKey, setRefreshKey] = useState(0);

  const { data, loading } = useArionData(
    () => activeSiteId ? arionApi.getGbpReviews(activeSiteId) : Promise.resolve(null),
    [activeSiteId, refreshKey]
  );

  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);

  if (loading) return <Loading />;
  if (!selectedSite) return <EmptyPanel message="No ARION site selected." />;

  const d = data as Record<string, any> | null;
  const reviews = (d?.data as any[]) ?? [];
  const meta = d?.meta ?? {};

  const totalReviews = meta.total ?? reviews.length;
  const avgRating = reviews.length > 0
    ? (reviews.reduce((sum: number, r: any) => sum + (Number(r.star_rating) || 0), 0) / reviews.length).toFixed(1)
    : '--';

  const handleSendReply = async (reviewId: string) => {
    if (!replyText.trim() || !activeSiteId) return;
    setSending(true);
    try {
      await arionApi.replyToReview(activeSiteId, reviewId, replyText);
      setReplyingTo(null);
      setReplyText('');
      setRefreshKey((k) => k + 1);
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <div className="mcards" style={{ marginBottom: '1rem' }}>
        <Card title="Total Reviews"><span style={{ fontSize: '1.5rem', fontWeight: 600 }}>{totalReviews}</span></Card>
        <Card title="Average Rating"><span style={{ fontSize: '1.5rem', fontWeight: 600 }}>{avgRating} <span className="stars-yellow">&#9733;</span></span></Card>
      </div>

      {reviews.length === 0 ? (
        <EmptyPanel message="No reviews available." />
      ) : (
        reviews.map((r: any) => (
          <div className="rev" key={r.review_id}>
            <div className="rev-top">
              <span className="rev-name">{r.reviewer_name ?? 'Anonymous'}</span>
              <span className="stars-yellow">{'★'.repeat(Number(r.star_rating) || 0)}</span>
              <span className="rev-date">{r.review_date ?? ''}</span>
            </div>
            <div className="rev-txt">{r.review_text ?? ''}</div>

            {r.reply_text ? (
              <div className="rev-reply">
                <strong>Owner reply:</strong> {r.reply_text}
              </div>
            ) : (
              <div className="needs-reply">
                {replyingTo === r.review_id ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
                    <textarea
                      placeholder="Write your reply..."
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      rows={3}
                    />
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button
                        className="abtn abtn-sky"
                        onClick={() => handleSendReply(r.review_id)}
                        disabled={sending || !replyText.trim()}
                      >
                        {sending ? 'Sending...' : 'Send Reply'}
                      </button>
                      <button
                        className="abtn"
                        onClick={() => { setReplyingTo(null); setReplyText(''); }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button className="abtn abtn-sky" onClick={() => setReplyingTo(r.review_id)}>Reply</button>
                )}
              </div>
            )}
          </div>
        ))
      )}

      <ConsultingUpsell
        headline="Low response rate hurts your local ranking."
        subtext="IA's local SEO team manages review responses and reputation."
        serviceType="Local SEO"
        triggerPage="business-reviews"
      />
    </>
  );
}
