import { useState } from 'react';
import { useArionContext } from '../../useArionContext';
import { useArionData } from '../../useArionData';
import { Card, Loading, ErrorBanner, ConsultingUpsell, StatCard } from '../../components/Ui';

/**
 * Apple Maps / Apple Business Connect — there is no public API to pull
 * impressions, reviews, or engagement data for individual businesses, so
 * this page focuses on (1) claim status, (2) listing integrity checklist,
 * (3) deep link to Apple Maps Connect for the ~15% of Americans who use
 * Apple Maps as their primary maps app.
 *
 * Claim is recorded MANUALLY (no OAuth/API). The "Mark as Claimed" button
 * POSTs /arion/sites/:id/apple/mark-claimed which flips apple_claimed=1
 * and stamps apple_claimed_at. From there the SetupHints nudge disappears
 * and the integrations card flips green.
 */
export function BusinessAppleOverview() {
  const { selectedSite, activeSiteId, arionApi } = useArionContext();

  const { data, loading, error, refetch } = useArionData(
    () => activeSiteId ? arionApi.getMyBusiness('apple', activeSiteId) : Promise.resolve(null),
    [activeSiteId],
  );

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  if (loading) return <Loading />;
  if (error) return <ErrorBanner message={error} />;
  if (!selectedSite) return <div style={{ padding: 24, color: 'var(--text-muted)' }}>No site selected.</div>;

  const d = data as Record<string, any> | null;
  const profile = d?.profile ?? null;
  const isClaimed = profile?.connected === true;
  const claimedAt: string | null = profile?.claimedAt || null;

  async function handleMarkClaimed(claimed: boolean) {
    if (!activeSiteId) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await arionApi.markAppleClaimed(activeSiteId, claimed);
      refetch();
    } catch (err: any) {
      setSubmitError(err?.message || 'Failed to update claim status');
    } finally {
      setSubmitting(false);
    }
  }

  const claimedDateLabel = claimedAt
    ? new Date(claimedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
    : null;

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
            ? (claimedDateLabel ? `Your Apple Maps listing is claimed (recorded ${claimedDateLabel}).` : 'Your Apple Maps listing is claimed.')
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
            <li>Visit <a href="https://register.apple.com/business" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--arion-sky)' }}>register.apple.com/business</a></li>
            <li>Sign in with your Apple ID</li>
            <li>Search for your business (if it already exists on Apple Maps)</li>
            <li>Claim your listing and verify ownership (phone or mail verification)</li>
            <li>Add photos, hours, services, and payment methods</li>
          </ol>

          {/* Two-button row — primary action opens Apple's portal in a new
              tab; secondary action records the claim in our DB. Apple has
              no OAuth/API, so the only way the rest of the Portal (setup
              hints, integration badges, ARION overview) knows the listing
              is claimed is when someone clicks this button. */}
          <div style={{ marginTop: 14, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <a
              href="https://register.apple.com/business"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-block', padding: '10px 18px', fontSize: 13, fontWeight: 600,
                background: '#0B1C24', color: '#fff', borderRadius: 6, textDecoration: 'none',
              }}
            >
              Set Up Apple Business →
            </a>
            <button
              type="button"
              onClick={() => handleMarkClaimed(true)}
              disabled={submitting}
              style={{
                padding: '10px 18px', fontSize: 13, fontWeight: 600,
                background: submitting ? '#94A3B8' : '#1D9E75', color: '#fff',
                borderRadius: 6, border: 'none',
                cursor: submitting ? 'not-allowed' : 'pointer',
              }}
            >
              {submitting ? 'Saving...' : 'Mark as Claimed'}
            </button>
          </div>
          {submitError && (
            <div style={{ marginTop: 10, color: '#B91C1C', fontSize: 12 }}>{submitError}</div>
          )}

          <div style={{ marginTop: 14, padding: 12, background: '#F8FAFC', borderRadius: 6, fontSize: 12, color: '#5A7A8A' }}>
            <strong>Why this matters:</strong> ~15-20% of US mobile searches for local businesses happen on Apple platforms (iPhone users using Siri, Spotlight, or default Maps). Unclaimed listings show generic data — potentially wrong hours, no photos, wrong categories — and you have no control over the experience.
          </div>
        </Card>
      )}

      {/* Claimed — show confirmation + unmark link */}
      {isClaimed && (
        <Card title="Listing details">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: profile?.displayName ? 12 : 0 }}>
            <div style={{ fontSize: 13, color: '#0B1C24' }}>
              <strong>Claimed</strong>
              {claimedDateLabel && (
                <span style={{ color: '#5A7A8A', marginLeft: 8 }}>· recorded {claimedDateLabel}</span>
              )}
            </div>
            <button
              type="button"
              onClick={() => handleMarkClaimed(false)}
              disabled={submitting}
              style={{
                padding: '4px 10px', fontSize: 11, fontWeight: 500,
                background: 'transparent', color: '#5A7A8A',
                border: '1px solid #CBD5E1', borderRadius: 4,
                cursor: submitting ? 'not-allowed' : 'pointer',
              }}
            >
              {submitting ? 'Saving...' : 'Unmark'}
            </button>
          </div>
          {submitError && (
            <div style={{ marginBottom: 10, color: '#B91C1C', fontSize: 12 }}>{submitError}</div>
          )}
          {profile?.displayName && (
            <div className="profile-fields">
              <div className="field-row"><strong>Business Name</strong><span>{profile.displayName ?? '--'}</span></div>
              <div className="field-row"><strong>Phone</strong><span>{profile.phone ?? '--'}</span></div>
              <div className="field-row"><strong>Address</strong><span>{profile.address ?? '--'}</span></div>
              <div className="field-row"><strong>Categories</strong><span>{Array.isArray(profile.categories) ? profile.categories.join(', ') : (profile.categories ?? '--')}</span></div>
            </div>
          )}
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
