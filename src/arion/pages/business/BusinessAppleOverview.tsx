import { useArionContext } from '../../useArionContext';
import { useArionData } from '../../useArionData';
import { Card, Loading, ErrorBanner, ConsultingUpsell } from '../../components/Ui';

export function BusinessAppleOverview() {
  const { selectedSite, activeSiteId, arionApi } = useArionContext();

  const { data, loading, error } = useArionData(
    () => activeSiteId ? arionApi.getMyBusiness('apple', activeSiteId) : Promise.resolve(null),
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
      {/* Claimed / Unclaimed status */}
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

      {/* Claim CTA card with Apple Maps Connect checklist */}
      <Card title="Claim Your Apple Maps Listing">
        <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 12 }}>
          Follow these steps to claim your business on Apple Maps Connect:
        </p>
        <ol style={{ paddingLeft: '1.25rem', lineHeight: 2 }}>
          <li>
            Visit{' '}
            <a
              href="https://mapsconnect.apple.com/"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'var(--arion-sky)' }}
            >
              Apple Maps Connect
            </a>
          </li>
          <li>Sign in with your Apple ID</li>
          <li>Search for your business</li>
          <li>Claim your listing and verify ownership</li>
        </ol>
      </Card>

      {/* Claimed profile details */}
      {isClaimed && profile?.displayName && (
        <Card title="Listing Details">
          <div className="profile-fields">
            <div className="field-row"><strong>Business Name</strong><span>{profile.displayName ?? '--'}</span></div>
            <div className="field-row"><strong>Phone</strong><span>{profile.phone ?? '--'}</span></div>
            <div className="field-row"><strong>Address</strong><span>{profile.address ?? '--'}</span></div>
            <div className="field-row"><strong>Categories</strong><span>{Array.isArray(profile.categories) ? profile.categories.join(', ') : (profile.categories ?? '--')}</span></div>
          </div>
        </Card>
      )}

      <ConsultingUpsell
        headline="Apple Maps is the default on every iPhone"
        subtext="IA claims and optimizes your Apple Maps listing."
        serviceType="Local SEO"
        triggerPage="business-apple-overview"
      />
    </div>
  );
}
