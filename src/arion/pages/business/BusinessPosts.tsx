import React from 'react';
import { useArionContext } from '../../useArionContext';
import { useArionData } from '../../useArionData';
import { Card, InfoCard, EmptyPanel, Loading, ConsultingUpsell } from '../../components/Ui';
import { GbpPendingVerificationCard } from './GbpStatusCard';
import { ReportBar } from '../../../components/insights/ReportBar';
import { useArionInsightsPayload } from '../../../hooks/useArionInsightsPayload';

type PostType = 'STANDARD' | 'EVENT' | 'OFFER';

export function BusinessPosts() {
  // Reports covering THIS function (Brandon 2026-08-14). Declared above
  // any early return — a hook below one runs on some renders only.
  const insightsPayload = useArionInsightsPayload();

  const { selectedSite, activeSiteId, arionApi } = useArionContext();

  const { data, loading, refetch } = useArionData(
    () => activeSiteId ? arionApi.getGbpPostsLive(activeSiteId).catch((e: any) => ({ error: e.message })) : Promise.resolve(null),
    [activeSiteId]
  );

  const [composing, setComposing] = React.useState(false);
  const [postType, setPostType] = React.useState<PostType>('STANDARD');
  const [summary, setSummary] = React.useState('');
  const [ctaUrl, setCtaUrl] = React.useState('');
  const [ctaType, setCtaType] = React.useState('LEARN_MORE');
  const [imageUrl, setImageUrl] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [toast, setToast] = React.useState<string | null>(null);

  if (loading) return <Loading />;
  if (!selectedSite) return <EmptyPanel message="No ARION site selected." />;

  const d = data as any;

  if (d?.pendingVerification) {

    return <GbpPendingVerificationCard what="posts" />;

  }
  if (!d || d.error || d.connected === false) {
    return <InfoCard title="Google Business Profile — Not Connected"><p style={{ margin: 0 }}>Connect Google in Settings → Connected Accounts to create and view posts.</p></InfoCard>;
  }

  const posts: any[] = d.posts || [];

  const resetCompose = () => {
    setSummary('');
    setCtaUrl('');
    setCtaType('LEARN_MORE');
    setPostType('STANDARD');
    setImageUrl('');
  };

  const submitPost = async () => {
    if (!activeSiteId || !summary.trim()) return;
    setSaving(true);
    setToast(null);
    try {
      const body: any = { topicType: postType, summary: summary.trim(), languageCode: 'en' };
      if (ctaUrl.trim()) body.callToAction = { actionType: ctaType, url: ctaUrl.trim() };
      if (imageUrl.trim()) body.imageUrl = imageUrl.trim();
      await arionApi.createGbpPost(activeSiteId, body);
      setToast('Post published to Google Business Profile.');
      resetCompose();
      setComposing(false);
      refetch?.();
    } catch (e: any) {
      setToast(e.message || 'Failed to publish post');
    } finally {
      setSaving(false);
    }
  };

  const deletePost = async (postId: string) => {
    if (!activeSiteId) return;
    if (!confirm('Delete this post?')) return;
    try {
      await arionApi.deleteGbpPost(activeSiteId, postId);
      refetch?.();
    } catch (e: any) {
      setToast(e.message || 'Failed to delete');
    }
  };

  return (
    <div>
      {!composing && (
        <div style={{ marginBottom: 16 }}>
          <button className="abtn abtn-sky" onClick={() => setComposing(true)}>Create Post</button>
        </div>
      )}

      {composing && (
        <Card title="Create a new post">
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            {(['STANDARD', 'EVENT', 'OFFER'] as PostType[]).map(t => (
              <button key={t} className={postType === t ? 'abtn abtn-sky' : 'abtn'} onClick={() => setPostType(t)} style={{ fontSize: 11 }}>
                {t === 'STANDARD' ? "What's new" : t === 'EVENT' ? 'Event' : 'Offer'}
              </button>
            ))}
          </div>
          <textarea
            className="field-input"
            rows={4}
            maxLength={1500}
            placeholder="Write your post... (max 1500 characters)"
            value={summary}
            onChange={e => setSummary(e.target.value)}
          />
          <div style={{ fontSize: 10, color: '#5A7A8A', textAlign: 'right', marginTop: 4 }}>{summary.length}/1500</div>
          <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', rowGap: 8, columnGap: 12, fontSize: 12, alignItems: 'center', marginTop: 10 }}>
            <div style={{ color: '#5A7A8A' }}>CTA type</div>
            <select className="field-input" value={ctaType} onChange={e => setCtaType(e.target.value)}>
              <option value="LEARN_MORE">Learn more</option>
              <option value="BOOK">Book</option>
              <option value="ORDER">Order</option>
              <option value="SHOP">Shop</option>
              <option value="SIGN_UP">Sign up</option>
              <option value="CALL">Call</option>
            </select>
            <div style={{ color: '#5A7A8A' }}>CTA link</div>
            <input className="field-input" placeholder="https://..." value={ctaUrl} onChange={e => setCtaUrl(e.target.value)} />
            <div style={{ color: '#5A7A8A' }}>Photo URL</div>
            <input className="field-input" placeholder="Paste a Media Library / Design Studio image URL (optional)" value={imageUrl} onChange={e => setImageUrl(e.target.value)} />
          </div>
          {imageUrl.trim() && (
            <div style={{ marginTop: 8 }}>
              <img src={imageUrl} alt="post" style={{ maxHeight: 120, borderRadius: 6, border: '1px solid #eee' }} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button className="abtn abtn-sky" onClick={submitPost} disabled={saving || !summary.trim()}>{saving ? 'Publishing...' : 'Publish'}</button>
            <button className="abtn" onClick={() => { setComposing(false); resetCompose(); }}>Cancel</button>
          </div>
          {toast && <div style={{ marginTop: 10, fontSize: 12, color: '#5A7A8A' }}>{toast}</div>}
        </Card>
      )}

      <Card title="Published posts">
        {posts.length === 0 ? (
          <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No posts yet</div>
        ) : (
          <div>
            {posts.map((p: any) => (
              <div key={p.postId} style={{ padding: '12px 0', borderBottom: '1px solid #f0f0f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: 10, color: '#5A7A8A', textTransform: 'uppercase' }}>{p.topicType || 'Post'}</div>
                    <div style={{ fontSize: 13, marginTop: 2, whiteSpace: 'pre-wrap' }}>{p.summary}</div>
                    {p.callToAction?.url && (
                      <a href={p.callToAction.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: 'var(--arion-sky)' }}>
                        {p.callToAction.actionType || 'Link'} ↗
                      </a>
                    )}
                    <div style={{ fontSize: 10, color: '#5A7A8A', marginTop: 4 }}>
                      {p.createTime ? new Date(p.createTime).toLocaleDateString() : ''} · {p.state || ''}
                    </div>
                  </div>
                  <button className="abtn" style={{ color: '#D85A30', fontSize: 11 }} onClick={() => deletePost(p.postId)}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <PhotosSection siteId={activeSiteId!} arionApi={arionApi} />

      <ConsultingUpsell
        headline="Posting weekly to GBP drives significantly more profile views."
        subtext="IA handles your posting cadence so you never miss a week."
        serviceType="Local SEO"
        triggerPage="business-posts"
      />
    </div>
  );
}

// Photo management — profile photos live on the same listing as posts, so
// they share this page (Brandon: "Photo management should be part of Posts").
function PhotosSection({ siteId, arionApi }: { siteId: string; arionApi: any }) {
  const [media, setMedia] = React.useState<any[] | null>(null);
  const [url, setUrl] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const load = React.useCallback(() => {
    arionApi.getGbpMedia(siteId).then((r: any) => setMedia(r?.media || [])).catch(() => setMedia([]));
  }, [siteId, arionApi]);
  React.useEffect(() => { load(); }, [load]);

  const add = async () => {
    if (!url.trim()) return;
    setBusy(true); setErr(null);
    try {
      await arionApi.addGbpMedia(siteId, url.trim());
      setUrl('');
      load();
    } catch (e: any) {
      setErr(e?.message || 'Could not add photo');
    } finally { setBusy(false); }
  };

  const remove = async (mediaId: string) => {
    if (!confirm('Remove this photo from your Business Profile?')) return;
    try { await arionApi.deleteGbpMedia(siteId, mediaId); load(); } catch { /* keep */ }
  };

  return (
    <Card title="Photos">
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <input className="field-input" style={{ flex: 1, minWidth: 240 }} placeholder="Paste a public image URL (Media Library / Design Studio export)" value={url} onChange={e => setUrl(e.target.value)} />
        <button className="abtn abtn-sky" disabled={busy || !url.trim()} onClick={add}>{busy ? 'Adding…' : 'Add photo'}</button>
      </div>
      {err && <div style={{ fontSize: 12, color: '#D85A30', marginBottom: 8 }}>{err}</div>}
      {media === null ? (
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Loading…</div>
      ) : media.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>No photos yet. Businesses with photos get significantly more views and direction requests.</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 10 }}>
          {media.map((m: any) => (
            <div key={m.mediaId} style={{ position: 'relative' }}>
              <img src={m.thumbnail || m.url} alt="" style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 8, border: '1px solid #eee' }} />
              <button onClick={() => remove(m.mediaId)} title="Remove" style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 11, padding: '2px 6px' }}>✕</button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
