import { Card, InfoCard, Loading, EmptyPanel, ConsultingUpsell } from '../../components/Ui';
import { useArionContext } from '../../useArionContext';
import { useArionData } from '../../useArionData';

export function WebsiteSettings() {
  const { selectedSite, activeSiteId, arionApi, loading } = useArionContext();

  const { data: hosting, loading: hostingLoading } = useArionData(
    () => activeSiteId ? arionApi.getHosting(activeSiteId) : Promise.resolve(null),
    [activeSiteId]
  );

  if (loading || hostingLoading) return <Loading />;
  if (!selectedSite) return <EmptyPanel message="No site selected." />;

  const h = (hosting as Record<string, any>) ?? {};
  const health = h.health ?? {};
  const wordpress = h.wordpress ?? {};
  const domain = health.domain ?? selectedSite.primaryDomain ?? '';

  const siteName = health.siteName ?? wordpress.name ?? '--';
  const siteDescription = health.siteDescription ?? wordpress.description ?? '--';
  const siteUrl = wordpress.url ?? (domain ? 'https://' + domain : '--');

  return (
    <div>
      {/* Site Information */}
      <Card title="Site Information">
        <div className="field-row">
          <div className="field-label">Site Name</div>
          <div className="field-value">{siteName}</div>
        </div>
        <div className="field-row">
          <div className="field-label">Tagline</div>
          <div className="field-value">{siteDescription}</div>
        </div>
        <div className="field-row">
          <div className="field-label">URL</div>
          <div className="field-value">{siteUrl}</div>
        </div>
      </Card>

      {/* WordPress Users */}
      <Card title="WordPress Users">
        <InfoCard title="User Management">
          <p style={{ margin: 0 }}>
            User management is available through WP Admin. Use the WP Admin button in the topbar to access it.
          </p>
        </InfoCard>
      </Card>

      {/* General Settings */}
      <Card title="General Settings">
        <div className="field-row">
          <div className="field-label">Timezone</div>
          <div className="field-value">--</div>
        </div>
        <div className="field-row">
          <div className="field-label">Language</div>
          <div className="field-value">--</div>
        </div>
        <div className="field-row">
          <div className="field-label">Site Visibility</div>
          <div className="field-value">--</div>
        </div>
      </Card>

      <ConsultingUpsell
        headline="Want IA to handle site configuration? We manage every technical detail."
        subtext="Full technical management included with all plans."
        serviceType="IT & Hosting Management"
        triggerPage="website-settings"
      />
    </div>
  );
}
