import { useArionContext } from '../../useArionContext';
import { useArionData } from '../../useArionData';
import { Card, AddonUpsell, EmptyPanel, Loading, InfoCard, ConsultingUpsell } from '../../components/Ui';

export function SeoCompetitors() {
  const { selectedSite, activeSiteId, arionApi } = useArionContext();

  const { data: seo, loading: seoLoading } = useArionData(
    () => activeSiteId ? arionApi.getSeo(activeSiteId) : Promise.resolve(null),
    [activeSiteId]
  );

  if (seoLoading) return <Loading />;
  if (!selectedSite) return <EmptyPanel message="No ARION site selected." />;

  const s = seo as Record<string, any> | null;
  const connected = s?.connected === true;
  const hasSeoAddon = selectedSite?.seoAddonTier != null;
  const competitors = (s?.breakdowns?.competitors as any[]) ?? [];

  if (!connected && !hasSeoAddon) {
    return (
      <AddonUpsell
        title="SEO Tools — Add-on not active"
        description="Track your competitors' keyword rankings, visibility scores, and backlink profiles."
        price="$29"
        planName="Starter — 10 keywords"
      />
    );
  }

  return (
    <div>
      {connected && (
        <InfoCard title="Competitor Tracking — Connected">
          <p style={{ margin: 0 }}>SE Ranking competitor tracking is active. Add competitors from the SE Ranking dashboard.</p>
        </InfoCard>
      )}
    <Card title="Tracked Competitors">
      <table className="data-table">
        <thead>
          <tr><th>Competitor</th><th>Visibility</th><th>Keywords</th><th>Overlap</th></tr>
        </thead>
        <tbody>
          {competitors.length > 0 ? competitors.map((c: any, i: number) => (
            <tr key={i}>
              <td>{c.competitor ?? c.domain ?? '--'}</td>
              <td>{c.visibility ?? '--'}</td>
              <td>{c.keywords ?? '--'}</td>
              <td>{c.overlap ?? '--'}</td>
            </tr>
          )) : (
            <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No competitor data available yet</td></tr>
          )}
        </tbody>
      </table>
    </Card>

      <ConsultingUpsell
        headline="Your competitors are winning keywords you could own. Let IA close the gap."
        subtext="Competitive SEO analysis and counter-strategy."
        serviceType="SEO Strategy"
        triggerPage="seo-competitors"
      />
    </div>
  );
}
