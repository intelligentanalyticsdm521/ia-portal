import { useArionContext } from '../../useArionContext';
import { useArionData } from '../../useArionData';
import { Card, Loading, ErrorBanner, ConsultingUpsell, StatCard } from '../../components/Ui';

/**
 * Apple Maps / Apple Business Connect — there is no public API to pull
 * impressions, reviews, or engagement data for individual businesses, so
 * this page focuses on (1) claim status, (2) listing integrity checklist,
 * (3) deep link to Apple Maps Connect for the ~15% of Americans who use
 * Apple Maps as their primary maps app.
 */
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

  // Build Apple Maps search URL for quick verification
  const searchQuery = profile?.displayName || selectedSite.primaryDomain || '';
  const appleMapsSearchUrl = searchQuery
    ? `https://maps.apple.com/?q=${encodeURIComponent(searchQuery)}`
    : 'https://maps.apple.com/';

  const completeness = (() => {
    if (!profile) return 0;
    let have = 0; const total = 4;
    if (profile.displayName) have++;
    if (profile.phone) have++;
    if (profile.address) have++;
    if (profile.categories && (Array.isArray(profile.categories) ? profile.categories.length > 0 : true)) have++;
    return Math.round((have / total) * 100);
  })();

  return (
    <div>
      {/* Story band */}
      <div style={{
        background: isClaimed ? '#F0FDF4' : '#FFFBEB',
        borderLeft: `4px solid ${isClaimed ? '#1D9E75' : '#D97706'}`,
        padding: '14px 18px', marginBottom: 16, borderRadius: 6, fontSize: 13,
      }}>
        <div style={{ fontWeight: 700, color: '#0B1C24', marginBottom: 4 }}>
          {isClaimed
            ? 'Your Apple Maps listing is claimed.'
            : 'Apple Maps listing not claimed yet — roughly 1 in 6 Americans uses Apple Maps as their primary maps app.'}
        </div>
        <div style={{ color: '#5A7A8A', lineHeight: 1.5 }}>
          {isClaimed
            ? 'Apple doesn\'t expose API-level metrics for individual businesses — so you\'ll monitor Apple Maps by searching your business periodically and confirming details look correct.'
            : 'Claiming takes ~10 minutes and is free. Apple Maps also feeds Siri, Spotlight search, and the Mac Maps app.'}
        </div>
      </div>

      {/* Status stat row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 14 }}>
        <StatCard label="Claim status" value={isClaimed ? 'Claimed' : 'Unclaimed'} deltaType={isClaimed ? 'positive' : 'negative'} />
        <StatCard label="Listing completeness" value={`${completeness}%`} deltaType={completeness >= 75 ? 'positive' : completeness >= 50 ? 'neutral' : 'negative'} />
        <StatCard label="Data API" value="None" deltaType="neutral" />
      </div>

      {/* Claim CTA card */}
      {!isClaimed && (
        <Card title="Claim your Apple Maps listing">
          <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 12 }}>
            Apple Business Connect is Apple's portal for managing your business on Apple Maps, Siri, Spotlight, and Mac Maps. Follow these steps:
          </p>
          <ol style={{ paddingLeft: '1.25rem', lineHeight: 2, fontSize: 13 }}>
            <li>Visit <a href="https://mapsconnect.apple.com/" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--arion-sky)' }}>Apple Business Connect</a></li>
            <li>Sign in with your Apple ID</li>
            <li>Search for your business (if it already exists on Apple Maps)</li>
            <li>Claim your listing and verify ownership (phone or mail verification)</li>
            <li>Add photos, hours, services, and payment methods</li>
          </ol>
          <div style={{ marginTop: 14, padding: 12, background: '#F8FAFC', borderRadius: 6, fontSize: 12, color: '#5A7A8A' }}>
            <strong>Why this matters:</strong> ~15-20% of US mobile searches for local businesses happen on Apple platforms (iPhone users using Siri, Spotlight, or default Maps). Unclaimed listings show generic data — potentially wrong hours, no photos, wrong categories — and you have no control over the experience.
          </div>
        </Card>
      )}

      {/* Claimed profile details */}
      {isClaimed && profile?.displayName && (
        <Card title="Listing details">
          <div className="profile-fields">
            <div className="field-row"><strong>Business Name</strong><span>{profile.displayName ?? '--'}</span></div>
            <div className="field-row"><strong>Phone</strong><span>{profile.phone ?? '--'}</span></div>
            <div className="field-row"><strong>Address</strong><span>{profile.address ?? '--'}</span></div>
            <div className="field-row"><strong>Categories</strong><span>{Array.isArray(profile.categories) ? profile.categories.join(', ') : (profile.categories ?? '--')}</span></div>
          </div>
        </Card>
      )}

      {/* Verify on Apple Maps */}
      <div style={{ marginTop: 14 }}>
        <Card title="Verify your listing">
          <div style={{ fontSize: 12, color: '#5A7A8A', marginBottom: 12, lineHeight: 1.6 }}>
            Apple doesn't publish an analytics API. The best way to verify your listing is to search for it directly on Apple Maps and confirm the name, hours, phone, address, and photos match what you want customers to see.
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <a
              href={appleMapsSearchUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-block', padding: '8px 16px', fontSize: 12, fontWeight: 600,
                background: '#0B1C24', color: '#fff', borderRadius: 6, textDecoration: 'none',
              }}
            >
              Open Apple Maps search →
            </a>
            <a
              href="https://mapsconnect.apple.com/"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-block', padding: '8px 16px', fontSize: 12, fontWeight: 600,
                background: '#fff', color: '#0B1C24', border: '1px solid #CBD5E1', borderRadius: 6, textDecoration: 'none',
              }}
            >
              Apple Business Connect →
            </a>
          </div>
        </Card>
      </div>

      <ConsultingUpsell
        headline="IA can claim and optimize your Apple Maps listings as part of your managed plan."
        subtext="We handle the claim, verification, photo optimization, and ongoing monitoring. Pairs with GBP + Bing Places for full local coverage."
        serviceType="Local SEO"
        triggerPage="business-apple-overview"
      />
    </div>
  );
}
