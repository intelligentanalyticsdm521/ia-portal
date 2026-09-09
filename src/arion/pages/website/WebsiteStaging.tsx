import { Card, InfoCard, AccessButton, Loading, EmptyPanel, ConsultingUpsell, StatCard } from '../../components/Ui';
import { useArionContext } from '../../useArionContext';
import { useArionData } from '../../useArionData';
import { useIsFounder } from '../../../hooks/useIsFounder';

/**
 * Website Staging — a practice copy of the website.
 *
 * ARION pack 2 (D-ARION-G): the two doors on this page that open somebody
 * else's admin screen — the staging WordPress admin and the host's own control
 * panel — are IA STAFF ONLY, for the same reason the WP Admin button in the
 * topbar is. A client who lands in either of them is somewhere we cannot
 * support them, and neither is a normal client job: making a practice copy,
 * changing it and publishing it are all things we do.
 *
 * Rebuilding staging as a Portal surface is parked to 2027 (per-site staging
 * needs the host's paid plan tier), and ARION 2.0 takes this page off the
 * client's navigation entirely.
 */
export function WebsiteStaging() {
  const { selectedSite, activeSiteId, arionApi, loading } = useArionContext();
  const isFounder = useIsFounder();

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
  // IA STAFF ONLY (D-ARION-G), and gated where the VALUE is made rather than
  // where it is drawn: a client simply never has these two addresses, so no
  // future edit to the markup below can put one back on their screen by
  // accident. Both open an admin screen we cannot support a client inside.
  const stagingAdmin = isFounder && stagingFrontend ? `${stagingFrontend.replace(/\/$/, '')}/wp-admin` : null;
  // Hostinger hPanel staging management (only used for create/delete/publish)
  const manageUrl = isFounder
    ? (staging.manageUrl || (domain ? `https://hpanel.hostinger.com/websites/${domain}/wordpress/staging/${domain}` : null))
    : null;

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
                  {isFounder && <th>Admin URL</th>}
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
                  {isFounder && (
                    <td>
                      {stagingAdmin ? (
                        <a href={stagingAdmin} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--arion-sky)', fontSize: 11, fontFamily: 'monospace' }}>
                          {stagingAdmin}
                        </a>
                      ) : '—'}
                    </td>
                  )}
                </tr>
              </tbody>
            </table>

            <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
              {stagingFrontend && (
                <AccessButton variant="sky" label="View the practice copy" href={stagingFrontend} />
              )}
              {/* IA staff only (D-ARION-G) — both of these open an admin screen
                  we cannot support a client inside. */}
              {isFounder && stagingAdmin && (
                <AccessButton variant="outline" label="Staging WP Admin (IA staff)" href={stagingAdmin} />
              )}
              {isFounder && manageUrl && (
                <AccessButton variant="outline" label="Sync / Publish (IA staff)" href={manageUrl} />
              )}
            </div>

            <div style={{ marginTop: 14, padding: 12, background: '#F8FAFC', borderRadius: 6, fontSize: 11, color: '#5A7A8A', lineHeight: 1.6 }}>
              <strong>How this is used:</strong> the practice copy is where we try a bigger change
              before it goes anywhere near the website your customers see. Look at it, tell us what
              you think, and we publish it across for you when you are happy. Nothing you do in the
              Portal touches this copy — your pages, menus, colours and posts are edited on your
              real website and published from there.
            </div>
          </>
        ) : (
          <>
            <InfoCard title="You have no practice copy yet">
              <p style={{ margin: 0, fontSize: 13 }}>
                A practice copy is a second, private copy of your website where a bigger change can
                be tried out before anybody else sees it. It costs nothing on your plan. Ask us and
                we will make you one.
              </p>
            </InfoCard>
            {isFounder && manageUrl && (
              <div style={{ marginTop: 14 }}>
                <AccessButton variant="outline" label="Create staging (IA staff)" href={manageUrl} />
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
