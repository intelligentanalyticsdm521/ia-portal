import { useArionContext } from '../../useArionContext';
import { useArionData } from '../../useArionData';
import { Card, AddonUpsell, EmptyPanel, Loading, InfoCard, ConsultingUpsell } from '../../components/Ui';

export function SeoOpportunities() {
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
  const opportunities = (s?.breakdowns?.opportunities as any[]) ?? [];

  if (!connected && !hasSeoAddon) {
    return (
      <AddonUpsell
        title="SEO Tools — Add-on not active"
        description="Discover untapped keyword opportunities based on your current rankings and competitor gaps."
        price="$29"
        planName="Starter — 10 keywords"
      />
    );
  }

  return (
    <div>
      {connected && (
        <InfoCard title="Keyword Opportunities — Connected">
          <p style={{ margin: 0 }}>SE Ranking is analyzing keyword opportunities. Data will populate as rankings are tracked.</p>
        </InfoCard>
      )}
    <Card title="Keyword Opportunities">
      <table className="data-table">
        <thead>
          <tr><th>Keyword</th><th>Volume</th><th>Difficulty</th><th>Current Pos.</th></tr>
        </thead>
        <tbody>
          {opportunities.length > 0 ? opportunities.map((o: any, i: number) => (
            <tr key={i}>
              <td>{o.keyword ?? '--'}</td>
              <td>{o.volume ?? '--'}</td>
              <td>{o.difficulty ?? '--'}</td>
              <td>{o.position ?? o.current_position ?? '--'}</td>
            </tr>
          )) : (
            <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No opportunity data available yet</td></tr>
          )}
        </tbody>
      </table>
    </Card>

      <ConsultingUpsell
        headline="These keywords are one optimization away from page 1. IA's content team gets them there."
        subtext="Quick-win keyword optimization for positions 11-20."
        serviceType="SEO Strategy"
        triggerPage="seo-opportunities"
      />
    </div>
  );
}
