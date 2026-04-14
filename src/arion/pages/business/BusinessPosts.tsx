import { useArionContext } from '../../useArionContext';
import { useArionData } from '../../useArionData';
import { Card, TierGate, InfoCard, EmptyPanel, Loading, ConsultingUpsell } from '../../components/Ui';

export function BusinessPosts() {
  const { selectedSite, activeSiteId, arionApi } = useArionContext();
  const tier = selectedSite?.arionTier || 'standard';

  const { data, loading } = useArionData(
    () => activeSiteId ? arionApi.getBusinessPosts(activeSiteId).catch(() => null) : Promise.resolve(null),
    [activeSiteId]
  );

  if (!selectedSite) return <EmptyPanel message="No ARION site selected." />;
  if (loading) return <Loading />;

  const d = data as Record<string, any> | null;
  const posts = (d?.data as any[]) ?? [];

  return (
    <div>
      <TierGate currentTier={tier} requiredTier="pro" featureName="GBP post management">
        <Card title="Google Business Posts"
          action={
            <button className="abtn abtn-sky" onClick={() => {
              if (activeSiteId) arionApi.createBusinessPost(activeSiteId, { type: 'update', title: 'New Post' });
            }}>Create Post</button>
          }>
          {posts.length > 0 ? (
            <table className="data-table">
              <thead>
                <tr><th>Title</th><th>Type</th><th>Status</th><th>Date</th></tr>
              </thead>
              <tbody>
                {posts.map((p: any, i: number) => (
                  <tr key={i}>
                    <td>{p.title ?? p.summary ?? '--'}</td>
                    <td>{p.type ?? p.topicType ?? '--'}</td>
                    <td>{p.status ?? 'Published'}</td>
                    <td>{p.created_at ?? p.createTime ?? '--'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p style={{ color: 'var(--text-muted)', fontSize: 12 }}>No posts yet. Create your first Google Business post.</p>
          )}
        </Card>
      </TierGate>

      <InfoCard title="Info">Google Business Posts let you share updates, offers, events, and products directly on your Google Business Profile.</InfoCard>

      <ConsultingUpsell
        headline="Regular GBP posts increase your search visibility."
        subtext="IA's content team creates and schedules posts for your business."
        serviceType="Local SEO"
        triggerPage="business-posts"
      />
    </div>
  );
}
