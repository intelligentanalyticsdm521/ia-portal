import { useArionContext } from '../../useArionContext';
import { useArionData } from '../../useArionData';
import { Card, AddonUpsell, EmptyPanel, Loading, ConsultingUpsell } from '../../components/Ui';

const SEO_REPORTS = [
  { title: 'Weekly Ranking Summary', description: 'Position changes for all tracked keywords over the past 7 days.' },
  { title: 'Monthly SEO Overview', description: 'Visibility, traffic, and ranking trends for the month.' },
  { title: 'Site Audit Report', description: 'Full technical SEO audit with prioritized fix recommendations.' },
  { title: 'Competitor Comparison', description: 'Side-by-side keyword and visibility comparison with competitors.' },
  { title: 'Backlink Profile', description: 'New and lost backlinks, referring domains, and authority score.' },
];

export function SeoReports() {
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

  if (!connected && !hasSeoAddon) {
    return (
      <AddonUpsell
        title="SEO Tools — Add-on not active"
        description="Generate detailed SEO reports to share with your team or clients."
        price="$24.99"
        planName="Starter — 10 keywords"
      />
    );
  }

  return (
    <div>
      <Card title="SEO Reports">
        <div className="grid2">
          {SEO_REPORTS.map((r) => (
            <Card key={r.title} title={r.title}>
              <div className="muted" style={{ fontSize: 12 }}>{r.description}</div>
              <button className="btn" style={{ marginTop: 12 }}>Generate Report</button>
            </Card>
          ))}
        </div>
      </Card>

      <ConsultingUpsell
        headline="Want IA to interpret these reports and recommend next steps? Book a strategy session."
        subtext="Expert SEO analysis with actionable recommendations."
        serviceType="SEO Strategy"
        triggerPage="seo-reports"
      />
    </div>
  );
}
