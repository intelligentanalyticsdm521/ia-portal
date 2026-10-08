import React from 'react';
import { Link } from 'react-router-dom';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from 'recharts';
import { useArionContext } from '../../useArionContext';
import { useArionData } from '../../useArionData';
import { Card, StatCard, EmptyPanel, Loading, ConsultingUpsell } from '../../components/Ui';
import { GbpPendingVerificationCard, GbpStatusCard } from './GbpStatusCard';
import { ReportBar } from '../../../components/insights/ReportBar';
import { useArionInsightsPayload } from '../../../hooks/useArionInsightsPayload';
import { useJobWriter, useTeamJob } from '../../../hooks/useTeam';
import { JobControls } from '../../../components/argus/team/JobRow';
import { employeeRoute, jobRowState, reviewRepliesIntro, shownMode } from '../../../lib/team';

// Google review replies — your web person's job, switched where the reviews are
// (contract ARGUS employees phase 1 §F.5, §G). The old auto-reply card posted
// with no approval step and silently skipped 1-3 star reviews; that switch is
// gone (its routes are deleted). This card is the job's own On switch,
// Automatic / Send me first, and the one limit it has — "Answer 4 (or 5) stars
// and up by itself" — all writing PUT /me/team/jobs/arion.review_replies, the
// same row ARGUS → Your team → The web person writes. A review of 3 stars or
// fewer always waits for you, whatever the mode; the replies that wait are in
// Needs you.
function ReviewRepliesCard() {
  const reply = useTeamJob('web', 'arion.review_replies');
  const writer = useJobWriter();
  const [notice, setNotice] = React.useState<string | null>(null);
  const [refusal, setRefusal] = React.useState<string | null>(null);
  const job = reply.job;
  const st = job ? jobRowState(job) : null;
  const minStars = job ? Number(job.vars?.automatic_min_stars ?? 4) : 4;

  const setMinStars = async (n: number) => {
    if (!job) return;
    setRefusal(null);
    const out = await writer.write(job, { vars: { automatic_min_stars: n } });
    if (out.ok) { reply.setJob(out.job); setNotice(out.words); }
    else setRefusal(out.words);
  };

  return (
    <Card title="Google review replies">
      <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 8 }}>
        {reviewRepliesIntro(job ? job.enabled : null)}{' '}
        <Link to={employeeRoute('web', 'needs-you')} style={{ textDecoration: 'underline' }}>See the replies waiting for you</Link>
      </div>
      {!job && !reply.error && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Loading…</div>}
      {reply.error && <div role="alert" style={{ fontSize: 12, color: '#B71C1C' }}>{reply.error}</div>}
      {job && (
        <div>
          <JobControls job={job} onChanged={reply.setJob} onNotice={setNotice} />
          {st?.control === 'switch' && st.modeControl && shownMode(job) === 'automatic' && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, fontSize: 13 }}>
              <span>Answer</span>
              <select
                className="field-input"
                style={{ width: 'auto' }}
                value={String(minStars >= 5 ? 5 : 4)}
                disabled={writer.busy === job.job_key}
                onChange={(e) => void setMinStars(parseInt(e.target.value, 10))}
                aria-label="Which reviews it answers by itself"
              >
                <option value="4">4 stars and up</option>
                <option value="5">5 stars only</option>
              </select>
              <span>by itself.</span>
            </label>
          )}
          {refusal && <div role="alert" style={{ marginTop: 6, fontSize: 12, color: '#B71C1C' }}>{refusal}</div>}
          {notice && <div role="status" style={{ marginTop: 6, fontSize: 12, color: '#1D7A55' }}>{notice}</div>}
        </div>
      )}
    </Card>
  );
}

function Stars({ n }: { n: number }) {
  const full = Math.max(0, Math.min(5, Math.round(n)));
  return <span style={{ color: '#FEC82C', letterSpacing: 1 }}>{'★'.repeat(full)}<span style={{ color: '#ddd' }}>{'★'.repeat(5 - full)}</span></span>;
}

export function BusinessReviews() {
  // Reports covering THIS function (Brandon 2026-08-14). Declared above
  // any early return — a hook below one runs on some renders only.
  const insightsPayload = useArionInsightsPayload();

  const { selectedSite, activeSiteId, arionApi } = useArionContext();
  const { data, loading, refetch } = useArionData(
    () => activeSiteId ? arionApi.getGbpReviewsLive(activeSiteId).catch((e: any) => ({ error: e.message })) : Promise.resolve(null),
    [activeSiteId]
  );
  const [replyState, setReplyState] = React.useState<Record<string, { text: string; saving: boolean; drafting?: boolean; draftErr?: string | null }>>({});

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

  const setReply = (id: string, patch: Partial<{ text: string; saving: boolean; drafting: boolean; draftErr: string | null }>) =>
    setReplyState(prev => {
      const existing = prev[id] || { text: '', saving: false };
      return { ...prev, [id]: { ...existing, ...patch } };
    });

  const draftWithAi = async (r: any) => {
    if (!activeSiteId) return;
    setReply(r.reviewId, { drafting: true, draftErr: null });
    try {
      const res: any = await arionApi.draftGbpReviewReply(activeSiteId, {
        reviewId: r.reviewId, reviewerName: r.reviewerName, starRating: r.starRating, comment: r.comment,
      });
      setReply(r.reviewId, { text: res.draft || '', drafting: false });
    } catch (e: any) {
      const insufficient = e?.status === 402 || /insufficient/i.test(e?.message || '');
      setReply(r.reviewId, { drafting: false, draftErr: insufficient ? 'Not enough AI credits — top up in the Data Plan.' : (e?.message || 'Draft failed') });
    }
  };

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

      <ReviewRepliesCard />

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
                        placeholder="Write your reply, or let AI draft one..."
                        value={rep.text}
                        onChange={e => setReply(r.reviewId, { text: e.target.value })}
                      />
                      <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                        <button className="abtn abtn-sky" disabled={rep.saving || !rep.text.trim()} onClick={() => submitReply(r.reviewId)}>
                          {rep.saving ? 'Posting...' : 'Submit reply'}
                        </button>
                        <button className="abtn" disabled={rep.drafting} onClick={() => draftWithAi(r)} title="Draft a reply in your brand voice — 1 AI credit">
                          {rep.drafting ? 'Drafting…' : '✨ Draft with AI · 1cr'}
                        </button>
                        <button className="abtn" onClick={() => setReplyState(prev => { const { [r.reviewId]: _x, ...rest } = prev; return rest; })}>Cancel</button>
                      </div>
                      {rep.draftErr && <div style={{ marginTop: 6, fontSize: 11, color: '#D85A30' }}>{rep.draftErr}</div>}
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
