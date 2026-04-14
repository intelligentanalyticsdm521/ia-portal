import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useArionContext } from '../../useArionContext';
import { useArionData } from '../../useArionData';
import { StatCard, Card, Loading, ErrorBanner, ConsultingUpsell } from '../../components/Ui';

const PageIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
    <polyline points="14 2 14 8 20 8" />
  </svg>
);

const PostIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
  </svg>
);

const SchemaIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M4 7V4h16v3" /><path d="M9 20h6" /><path d="M12 4v16" />
  </svg>
);

export function ContentSeoOverview() {
  const { selectedSite, activeSiteId, arionApi, loading } = useArionContext();
  const navigate = useNavigate();

  const { data: seoData, loading: seoLoading, error } = useArionData(
    () => activeSiteId ? arionApi.getContentSeo(activeSiteId) : Promise.resolve(null),
    [activeSiteId],
  );

  if (loading || seoLoading) return <Loading />;
  if (error) return <ErrorBanner message={error} />;
  if (!selectedSite) return <div style={{ padding: 24, color: 'var(--text-muted)' }}>No site selected.</div>;

  const d = (seoData as Record<string, any>)?.data ?? {};
  const summary = d.summary ?? {};

  return (
    <div>
      {/* Stat cards */}
      <div className="stat-row" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
        <StatCard label="Avg SEO Score" value={summary.avg_score ?? '--'} />
        <StatCard label="Missing Meta" value={summary.missing_meta ?? '--'} />
        <StatCard label="No Focus Keyword" value={summary.no_focus_keyword ?? '--'} />
        <StatCard label="Total Pages" value={summary.total ?? '--'} />
      </div>

      {/* Sub-page link cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 16 }}>
        <Card>
          <div
            style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}
            onClick={() => navigate('/content-seo/pages')}
          >
            <div style={{ background: 'var(--arion-sky-tint)', color: 'var(--arion-sky)', borderRadius: 8, padding: 8, display: 'flex' }}>
              <PageIcon />
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: 13 }}>Pages</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>SEO metadata for pages</div>
            </div>
          </div>
        </Card>

        <Card>
          <div
            style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}
            onClick={() => navigate('/content-seo/posts')}
          >
            <div style={{ background: 'var(--arion-sky-tint)', color: 'var(--arion-sky)', borderRadius: 8, padding: 8, display: 'flex' }}>
              <PostIcon />
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: 13 }}>Posts</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>SEO metadata for blog posts</div>
            </div>
          </div>
        </Card>

        <Card>
          <div
            style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}
            onClick={() => navigate('/content-seo/schema')}
          >
            <div style={{ background: 'var(--arion-sky-tint)', color: 'var(--arion-sky)', borderRadius: 8, padding: 8, display: 'flex' }}>
              <SchemaIcon />
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: 13 }}>Schema</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Structured data markup</div>
            </div>
          </div>
        </Card>
      </div>

      <ConsultingUpsell
        headline="Let IA write your SEO metadata"
        subtext="Our content team optimizes title tags and descriptions for every page."
        serviceType="Content Writing"
        triggerPage="content-seo-overview"
      />
    </div>
  );
}
