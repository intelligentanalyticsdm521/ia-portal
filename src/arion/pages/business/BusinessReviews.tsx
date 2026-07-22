import React from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from 'recharts';
import { useArionContext } from '../../useArionContext';
import { useArionData } from '../../useArionData';
import { Card, StatCard, EmptyPanel, Loading, ConsultingUpsell } from '../../components/Ui';
import { GbpPendingVerificationCard, GbpStatusCard } from './GbpStatusCard';

function Stars({ n }: { n: number }) {
  const full = Math.max(0, Math.min(5, Math.round(n)));
  return <span style={{ color: '#FEC82C', letterSpacing: 1 }}>{'★'.repeat(full)}<span style={{ color: '#ddd' }}>{'★'.repeat(5 - full)}</span></span>;
}

export function BusinessReviews() {
  const { selectedSite, activeSiteId, arionApi } = useArionContext();
  const { data, loading, refetch } = useArionData(
    () => activeSiteId ? arionApi.getGbpReviewsLive(activeSiteId).catch((e: any) => ({ error: e.message })) : Promise.resolve(null),
    [activeSiteId]
  );
  const [replyState, setReplyState] = React.useState<Record<string, { text: string; saving: boolean }>>({});

  if (loading) return <Loading />;
  if (!selectedSite) return <EmptyPanel message="No ARION site selected." />;

  const d = data as any;
  if (d?.pendingVerification) {
    return <GbpPendingVerificationCard what="reviews" />;
  }
  if (!d || d.error || d.connected === false) {
    // Differentiated failure copy — quota/auth/no-listing are NOT "not
    // connected" (the backend returns several of these with connected:true).
    return <GbpStatusCard error={d?.error} surface="reviews" />;
  }

  const total = d.totalReviewCount || 0;
  const avg = Number(d.averageRating || 0);
  const reviews: any[] = d.reviews || [];
  const thisMonth = reviews.filter((r: any) => {
    const when = r.createTime ? new Date(r.createTime) : null;
    if (!when) return false;
    const now = new Date();
    return when.getUTCFullYear() === now.getUTCFullYear() && when.getUTCMonth() === now.getUTCMonth();
  }).length;
  const withReply = reviews.filter((r: any) => r.replyComment).length;
  const responseRate = reviews.length > 0 ? Math.round((withReply / reviews.length) * 100) : 0;

  const dist = [5, 4, 3, 2, 1].map(s => ({
    name: s + '★',
    value: reviews.filter((r: any) => r.starRating === s).length,
  }));
  const distColors = ['#1D9E75', '#2D9CDB', '#EF6C33', '#D85A30', '#B71C1C'];

  const setReply = (id: string, patch: Partial<{ text: string; saving: boolean }>) =>
    setReplyState(prev => {
      const existing = prev[id] || { text: '', saving: false };
      return { ...prev, [id]: { ...existing, ...patch } };
    });

  const submitReply = async (id: string) => {
    const txt = replyState[id]?.text?.trim();
    if (!activeSiteId || !txt) return;
    setReply(id, { saving: true });
    try {
      await arionApi.replyGbpReview(activeSiteId, id, txt);
      setReply(id, { text: '', saving: false });
      refetch?.();
    } catch {
      setReply(id, { saving: false });
    }
  };

  return (
    <div>
      <div className="stat-row" style={{ marginTop: 8 }}>
        <StatCard label="Total Reviews" value={String(total)} />
        <StatCard label="Average Rating" value={avg > 0 ? avg.toFixed(1) : '--'} />
        <StatCard label="This Month" value={String(thisMonth)} />
        <StatCard label="Response Rate" value={reviews.length > 0 ? responseRate + '%' : '--'} />
      </div>

      {dist.some(d => d.value > 0) && (
        <Card title="Rating distribution">
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={dist} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} innerRadius={45} paddingAngle={2}>
                {dist.map((_, i) => <Cell key={i} fill={distColors[i]} />)}
              </Pie>
              <Tooltip contentStyle={{ fontSize: 11 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </Card>
      )}

      <Card title="Reviews">
        {reviews.length === 0 ? (
          <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No reviews yet</div>
        ) : (
          <div>
            {reviews.map((r: any) => {
              const rep = replyState[r.reviewId] || { text: '', saving: false };
              return (
                <div key={r.reviewId} style={{ padding: '12px 0', borderBottom: '1px solid #f0f0f0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{r.reviewerName}</div>
                      <div style={{ marginTop: 2 }}><Stars n={r.starRating} /> <span style={{ fontSize: 10, color: '#5A7A8A', marginLeft: 6 }}>{r.createTime ? new Date(r.createTime).toLocaleDateString() : ''}</span></div>
                    </div>
                    <button className="abtn" onClick={() => setReply(r.reviewId, { text: rep.text || r.replyComment || '' })} style={{ fontSize: 11 }}>
                      {r.replyComment ? 'Edit reply' : 'Reply'}
                    </button>
                  </div>
                  {r.comment && <p style={{ fontSize: 12, color: '#5A7A8A', marginTop: 6, marginBottom: 4, whiteSpace: 'pre-wrap' }}>{r.comment}</p>}
                  {r.replyComment && !replyState[r.reviewId] && (
                    <div style={{ marginTop: 8, padding: '8px 12px', background: '#F0F9FF', borderLeft: '3px solid #2D9CDB', borderRadius: 4, fontSize: 11, color: '#0C4A60' }}>
                      <strong>Your reply:</strong> {r.replyComment}
                    </div>
                  )}
                  {replyState[r.reviewId] && (
                    <div style={{ marginTop: 8 }}>
                      <textarea
                        className="field-input"
                        rows={3}
                        placeholder="Write your reply..."
                        value={rep.text}
                        onChange={e => setReply(r.reviewId, { text: e.target.value })}
                      />
                      <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                        <button className="abtn abtn-sky" disabled={rep.saving || !rep.text.trim()} onClick={() => submitReply(r.reviewId)}>
                          {rep.saving ? 'Posting...' : 'Submit reply'}
                        </button>
                        <button className="abtn" onClick={() => setReplyState(prev => { const { [r.reviewId]: _x, ...rest } = prev; return rest; })}>Cancel</button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <ConsultingUpsell
        headline="Replying to reviews improves local ranking."
        subtext="IA's team crafts review responses that build trust and rank."
        serviceType="Local SEO"
        triggerPage="business-reviews"
      />
    </div>
  );
}
