import { useArionContext } from '../../useArionContext';
import { useArionData } from '../../useArionData';
import { Card, HealthRow, Loading, ErrorBanner, ConsultingUpsell } from '../../components/Ui';

export function BusinessBingOverview() {
  const { selectedSite, activeSiteId, arionApi } = useArionContext();

  const { data, loading, error } = useArionData(
    () => activeSiteId ? arionApi.getMyBusiness('bing', activeSiteId) : Promise.resolve(null),
    [activeSiteId],
  );

  if (loading) return <Loading />;
  if (error) return <ErrorBanner message={error} />;
  if (!selectedSite) return <div style={{ padding: 24, color: 'var(--text-muted)' }}>No site selected.</div>;

  const d = data as Record<string, any> | null;
  const profile = d?.profile ?? null;
  const isClaimed = profile?.connected === true;

  return (
    <div>
      {/* Claimed / Unclaimed badge */}
      <div style={{ marginBottom: 16 }}>
        <span
          style={{
            display: 'inline-block',
            padding: '4px 12px',
            borderRadius: 20,
            fontSize: 12,
            fontWeight: 600,
            background: isClaimed ? 'var(--arion-green-tint, #dcfce7)' : 'var(--arion-warn-tint, #fef3c7)',
            color: isClaimed ? 'var(--arion-green, #16a34a)' : 'var(--arion-warn, #b45309)',
          }}
        >
          {isClaimed ? 'Claimed' : 'Unclaimed'}
        </span>
      </div>

      {/* Sync status */}
      <Card title="Bing Places Sync Status">
        <HealthRow
          label="Listing Claimed"
          status={isClaimed ? 'ok' : 'warn'}
          value={isClaimed ? 'Yes' : 'No'}
        />
        <HealthRow
          label="NAP Consistency"
          status={profile?.napConsistent ? 'ok' : 'warn'}
          value={profile?.napConsistent ? 'Consistent' : 'Not verified'}
        />
        <HealthRow
          label="Last Sync"
          status={profile?.lastSync ? 'ok' : 'warn'}
          value={profile?.lastSync ?? 'Never'}
        />
        <HealthRow
          label="Profile Completeness"
          status={profile?.completeness && profile.completeness >= 80 ? 'ok' : 'warn'}
          value={profile?.completeness != null ? `${profile.completeness}%` : '--'}
        />
      </Card>

      {/* Profile details when claimed */}
      {isClaimed && profile?.displayName && (
        <Card title="Listing Details">
          <div className="profile-fields">
            <div className="field-row"><strong>Business Name</strong><span>{profile.displayName ?? '--'}</span></div>
            <div className="field-row"><strong>Phone</strong><span>{profile.phone ?? '--'}</span></div>
            <div className="field-row"><strong>Address</strong><span>{profile.address ?? '--'}</span></div>
          </div>
        </Card>
      )}

      {/* External link */}
      <div style={{ marginTop: 16 }}>
        <a
          href="https://www.bingplaces.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="abtn abtn-sky"
        >
          Open Bing for Business &rarr;
        </a>
      </div>

      <ConsultingUpsell
        headline="IA can claim and optimize your Bing Places listings as part of your managed plan."
        subtext="Contact us to get started."
        serviceType="Local SEO"
        triggerPage="business-bing-overview"
      />
    </div>
  );
}
