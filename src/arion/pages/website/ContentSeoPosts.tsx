import React from 'react';
import { useArionContext } from '../../useArionContext';
import { useArionData } from '../../useArionData';
import { StatCard, Card, Loading, ErrorBanner, ConsultingUpsell, TierGate, meetsMinTier } from '../../components/Ui';

export function ContentSeoPosts() {
  const { selectedSite, activeSiteId, arionApi, loading } = useArionContext();

  const { data: seoData, loading: seoLoading, error } = useArionData(
    () => activeSiteId ? arionApi.getContentSeo(activeSiteId) : Promise.resolve(null),
    [activeSiteId],
  );

  const [editingId, setEditingId] = React.useState<number | null>(null);
  const [editTitle, setEditTitle] = React.useState('');
  const [editDesc, setEditDesc] = React.useState('');
  const [editKeyword, setEditKeyword] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  if (loading || seoLoading) return <Loading />;
  if (error) return <ErrorBanner message={error} />;
  if (!selectedSite) return <div style={{ padding: 24, color: 'var(--text-muted)' }}>No site selected.</div>;

  const d = (seoData as Record<string, any>)?.data ?? {};
  const allItems: any[] = Array.isArray(d.pages) ? d.pages : Array.isArray(d.posts) ? d.posts : [];
  const posts = allItems.filter((item: any) => item.type === 'post');

  const tier = selectedSite?.arionTier || 'lite';
  const isPro = meetsMinTier(tier, 'pro');

  const scoreColor = (score: number | null | undefined) => {
    if (score == null) return 'var(--text-muted)';
    if (score >= 80) return '#27AE60';
    if (score >= 50) return '#F2994A';
    return '#EB5757';
  };

  const charWarn = (len: number | null | undefined, max: number) => {
    if (len == null || len === 0) return { color: '#EB5757' };
    if (len > max) return { color: '#EB5757' };
    return {};
  };

  const startEdit = (item: any) => {
    setEditingId(item.post_id ?? item.id);
    setEditTitle(item.rank_math_title || item.meta_title || '');
    setEditDesc(item.rank_math_description || item.meta_description || '');
    setEditKeyword(item.rank_math_focus_keyword || item.focus_keyword || '');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditTitle('');
    setEditDesc('');
    setEditKeyword('');
  };

  const saveEdit = async () => {
    if (!activeSiteId || editingId == null) return;
    setSaving(true);
    try {
      await arionApi.updateContentSeo(activeSiteId, String(editingId), {
        rank_math_title: editTitle,
        rank_math_description: editDesc,
        rank_math_focus_keyword: editKeyword,
      });
      cancelEdit();
    } catch {
      alert('Failed to save SEO data.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <Card title="Posts SEO" subtitle={`${posts.length} post${posts.length !== 1 ? 's' : ''} found`}>
        {posts.length > 0 ? (
          <table className="tbl">
            <thead>
              <tr>
                <th>Post Title</th>
                <th>SEO Score</th>
                <th>Focus Keyword</th>
                <th>Meta Title</th>
                <th>Meta Description</th>
                {isPro && <th style={{ width: 70 }}></th>}
              </tr>
            </thead>
            <tbody>
              {posts.map((item: any) => {
                const id = item.post_id ?? item.id;
                const title = item.title || '--';
                const score = item.seo_score ?? item.score ?? null;
                const keyword = item.rank_math_focus_keyword || item.focus_keyword || '';
                const metaTitle = item.rank_math_title || item.meta_title || '';
                const metaDesc = item.rank_math_description || item.meta_description || '';
                const metaTitleLen = metaTitle.length;
                const metaDescLen = metaDesc.length;
                const isEditing = editingId === id;

                return (
                  <React.Fragment key={id}>
                    <tr>
                      <td>{title}</td>
                      <td style={{ color: scoreColor(score), fontWeight: 600 }}>{score ?? '--'}</td>
                      <td>
                        {keyword
                          ? <span style={{ color: '#27AE60' }}>{keyword}</span>
                          : <span style={{ color: '#EB5757' }}>Missing</span>}
                      </td>
                      <td style={charWarn(metaTitleLen, 60)}>
                        {metaTitle ? `${metaTitleLen} chars` : <span style={{ color: '#EB5757' }}>Missing</span>}
                      </td>
                      <td style={charWarn(metaDescLen, 160)}>
                        {metaDesc ? `${metaDescLen} chars` : <span style={{ color: '#EB5757' }}>Missing</span>}
                      </td>
                      {isPro && (
                        <td>
                          {!isEditing && (
                            <button
                              className="btn"
                              style={{ fontSize: 11, padding: '3px 10px' }}
                              onClick={() => startEdit(item)}
                            >
                              Edit
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                    {isEditing && isPro && (
                      <tr>
                        <td colSpan={6} style={{ background: 'var(--arion-sky-tint)', padding: 12 }}>
                          <div style={{ display: 'grid', gap: 8 }}>
                            <label style={{ fontSize: 11, fontWeight: 600 }}>
                              Meta Title
                              <input
                                type="text"
                                value={editTitle}
                                onChange={e => setEditTitle(e.target.value)}
                                style={{ width: '100%', padding: 6, borderRadius: 6, border: '1px solid #ddd', fontSize: 12, marginTop: 2 }}
                              />
                              <span style={{ fontSize: 10, color: editTitle.length > 60 ? '#EB5757' : 'var(--text-muted)' }}>
                                {editTitle.length}/60
                              </span>
                            </label>
                            <label style={{ fontSize: 11, fontWeight: 600 }}>
                              Meta Description
                              <textarea
                                value={editDesc}
                                onChange={e => setEditDesc(e.target.value)}
                                rows={2}
                                style={{ width: '100%', padding: 6, borderRadius: 6, border: '1px solid #ddd', fontSize: 12, marginTop: 2 }}
                              />
                              <span style={{ fontSize: 10, color: editDesc.length > 160 ? '#EB5757' : 'var(--text-muted)' }}>
                                {editDesc.length}/160
                              </span>
                            </label>
                            <label style={{ fontSize: 11, fontWeight: 600 }}>
                              Focus Keyword
                              <input
                                type="text"
                                value={editKeyword}
                                onChange={e => setEditKeyword(e.target.value)}
                                style={{ width: '100%', padding: 6, borderRadius: 6, border: '1px solid #ddd', fontSize: 12, marginTop: 2 }}
                              />
                            </label>
                            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                              <button className="btn" onClick={cancelEdit} disabled={saving}>Cancel</button>
                              <button className="btn btn-primary" onClick={saveEdit} disabled={saving}>
                                {saving ? 'Saving...' : 'Save'}
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div style={{ padding: '16px 0', color: 'var(--text-muted)', fontSize: 12 }}>No posts found.</div>
        )}

        {/* TierGate overlay for non-Pro users on edit controls */}
        {!isPro && posts.length > 0 && (
          <TierGate currentTier={tier} requiredTier="pro" featureName="Inline SEO editing">
            <div style={{ padding: '12px 0', fontSize: 12, color: 'var(--text-muted)' }}>
              Edit SEO metadata directly from this table with a Pro plan or higher.
            </div>
          </TierGate>
        )}
      </Card>

      <ConsultingUpsell
        headline="Posts with critical SEO issues need attention"
        subtext="IA's content team can fix all metadata issues."
        serviceType="Content Writing"
        triggerPage="content-seo-posts"
      />
    </div>
  );
}
