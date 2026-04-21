import { Card, InfoCard, AccessButton, Loading, EmptyPanel, ConsultingUpsell, StatCard } from '../../components/Ui';
import { useArionContext } from '../../useArionContext';
import { useArionData } from '../../useArionData';

/**
 * Website Staging — shows staging status and provides direct access to the
 * staging WP admin (no bouncing through Hostinger's hPanel). The "Manage
 * Staging" link opens Hostinger only for actions the Portal can't perform
 * (create/delete/publish).
 */
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
  const stagingFrontend = staging.url || (domain ? 'https://staging.' + domain : null);
  const stagingAdmin = stagingFrontend ? `${stagingFrontend.replace(/\/$/, '')}/wp-admin` : null;
  // Hostinger hPanel staging management (only used for create/delete/publish)
  const manageUrl = staging.manageUrl || (domain ? `https://hpanel.hostinger.com/websites/${domain}/wordpress/staging/${domain}` : null);

  return (
    <div>
      {/* Story band */}
      <div style={{
        background: stagingExists ? '#F0FDF4' : '#FFFBEB',
        borderLeft: `4px solid ${stagingExists ? '#1D9E75' : '#D97706'}`,
        padding: '14px 18px', marginBottom: 16, borderRadius: 6, fontSize: 13,
      }}>
        <div style={{ fontWeight: 700, color: '#0B1C24', marginBottom: 4 }}>
          {stagingExists
            ? 'Staging environment is live.'
            : 'No staging environment yet.'}
        </div>
        <div style={{ color: '#5A7A8A', lineHeight: 1.5 }}>
          {stagingExists
            ? 'Test plugin updates, design changes, or new features on staging before pushing to production. The staging site is a separate WordPress install — changes there do not affect your live site until you explicitly publish.'
            : 'A staging environment lets you safely test changes before they hit your live site. Hostinger provides free staging with one-click create/sync/publish. Click "Create Staging" below to set one up.'}
        </div>
      </div>

      {/* Stat row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 14 }}>
        <StatCard label="Staging status" value={stagingExists ? 'Active' : 'Not created'} deltaType={stagingExists ? 'positive' : 'neutral'} />
        <StatCard label="Frontend" value={stagingExists ? `staging.${domain}` : '—'} />
        <StatCard label="WP admin" value={stagingExists ? 'Available' : '—'} />
      </div>

      <Card title="Staging environment">
        {stagingExists ? (
          <>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Site</th>
                  <th>Status</th>
                  <th>Frontend URL</th>
                  <th>Admin URL</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><strong>staging.{domain}</strong></td>
                  <td><span className="badge-ok">Active</span></td>
                  <td>
                    {stagingFrontend ? (
                      <a href={stagingFrontend} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--arion-sky)', fontSize: 11, fontFamily: 'monospace' }}>
                        {stagingFrontend}
                      </a>
                    ) : '—'}
                  </td>
                  <td>
                    {stagingAdmin ? (
                      <a href={stagingAdmin} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--arion-sky)', fontSize: 11, fontFamily: 'monospace' }}>
                        {stagingAdmin}
                      </a>
                    ) : '—'}
                  </td>
                </tr>
              </tbody>
            </table>

            <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
              {stagingAdmin && (
                <AccessButton variant="sky" label="Open Staging WP Admin →" href={stagingAdmin} />
              )}
              {stagingFrontend && (
                <AccessButton variant="outline" label="View Staging Site" href={stagingFrontend} />
              )}
              {manageUrl && (
                <AccessButton variant="outline" label="Sync / Publish (Hostinger)" href={manageUrl} />
              )}
            </div>

            <div style={{ marginTop: 14, padding: 12, background: '#F8FAFC', borderRadius: 6, fontSize: 11, color: '#5A7A8A', lineHeight: 1.6 }}>
              <strong>Workflow:</strong> Make your changes in the staging WP admin → test them on the staging frontend → use Hostinger's "Publish" action to push the staging database + files to production. Direct file edits or custom code changes should always flow staging → production, never the reverse.
            </div>
          </>
        ) : (
          <>
            <InfoCard title="No staging environment">
              <p style={{ margin: 0, fontSize: 13 }}>
                Create a staging environment to test changes before publishing to your live site. Staging is a free Hostinger feature — it copies your site to a subdomain (staging.yourdomain.com) where you can test safely.
              </p>
            </InfoCard>
            {manageUrl && (
              <div style={{ marginTop: 14 }}>
                <AccessButton variant="sky" label="Create Staging (Hostinger) →" href={manageUrl} />
              </div>
            )}
          </>
        )}
      </Card>

      <ConsultingUpsell
        headline="Let IA test plugin updates + design changes on staging before pushing to production"
        subtext="We catch breaking changes before they hit your live site. Staging workflows included in managed plans."
        serviceType="Website Strategy"
        triggerPage="website-staging"
      />
    </div>
  );
}
