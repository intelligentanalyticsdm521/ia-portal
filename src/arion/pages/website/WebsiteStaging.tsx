import { Card, InfoCard, AccessButton, Loading, EmptyPanel, ConsultingUpsell } from '../../components/Ui';
import { useArionContext } from '../../useArionContext';
import { useArionData } from '../../useArionData';

export function WebsiteStaging() {
  const { selectedSite, activeSiteId, arionApi, loading } = useArionContext();

  const { data: hosting, loading: hostingLoading } = useArionData(
    () => activeSiteId ? arionApi.getHosting(activeSiteId) : Promise.resolve(null),
    [activeSiteId]
  );

  if (loading || hostingLoading) return <Loading />;
  if (!selectedSite) return <EmptyPanel message="No site selected." />;

  const h = (hosting as Record<string, any>) ?? {};
  const health = h.health ?? {};
  const staging = h.staging ?? {};
  const domain = health.domain ?? selectedSite.primaryDomain ?? '';

  const stagingExists = staging.exists === true;
  const stagingUrl = staging.url || (domain ? 'https://staging.' + domain : null);
  const manageUrl = staging.manageUrl || (domain ? `https://hpanel.hostinger.com/websites/${domain}/wordpress/staging/${domain}` : null);

  return (
    <div>
      {/* Staging Environment */}
      <Card title="Staging Environment">
        {stagingExists ? (
          <>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Staging Name</th>
                  <th>Created</th>
                  <th>Status</th>
                  <th>Last Published</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    {stagingUrl ? (
                      <a href={stagingUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--sky)' }}>
                        staging.{domain}
                      </a>
                    ) : (
                      `staging.${domain}`
                    )}
                  </td>
                  <td>--</td>
                  <td><span className="badge-ok">Completed</span></td>
                  <td>--</td>
                </tr>
              </tbody>
            </table>
            <div className="access-row" style={{ marginTop: 12 }}>
              {stagingUrl && (
                <AccessButton variant="outline" label="View Staging Site" href={stagingUrl} />
              )}
              {manageUrl && (
                <AccessButton variant="sky" label="Manage Staging" href={manageUrl} />
              )}
            </div>
          </>
        ) : (
          <>
            <InfoCard title="Staging Environment">
              <p style={{ margin: 0 }}>
                Create a staging environment to test changes before publishing to your live site.
              </p>
            </InfoCard>
            {manageUrl && (
              <div style={{ marginTop: 12 }}>
                <AccessButton variant="sky" label="Create Staging" href={manageUrl} />
              </div>
            )}
          </>
        )}
      </Card>

      <ConsultingUpsell
        headline="Need a safe testing environment for major changes? IA manages staging workflows."
        subtext="Safe staging environments for testing before going live."
        serviceType="Website Strategy"
        triggerPage="website-staging"
      />
    </div>
  );
}
