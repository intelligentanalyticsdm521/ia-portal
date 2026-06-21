import React from 'react';
import { useArionContext } from '../../useArionContext';
import { useArionData } from '../../useArionData';
import { Card, EmptyPanel, Loading, InfoCard, TierGate, meetsMinTier, ConsultingUpsell } from '../../components/Ui';
import type { BusinessLocation } from '../../../lib/arionApi';

/**
 * Business Locations — Onboarding V3 Phase 3
 *
 * Tenants with more than one Google Business Profile listing (regional
 * chains, multi-location practices, etc.) see every imported location
 * here and can pick which one is the tenant's primary. Backed by
 * arion.business_location (commit c296d6b in arion-api).
 *
 * Tier gate: the LIST is visible to every tier (so a single-location
 * tenant still sees their one location + sync button). Multi-location
 * management (set-primary, etc.) is Pro+ — single-location tenants
 * just see a read-only card.
 */

function addressLine(loc: BusinessLocation): string {
  const cityRegion = [loc.city, loc.region].filter(Boolean).join(', ');
  const tail = [cityRegion, loc.postal_code].filter(Boolean).join(' ');
  return [loc.address_line1, tail].filter(Boolean).join(' — ');
}

function fmtTimestamp(ts: string | null): string {
  if (!ts) return '—';
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return ts;
  }
}

export function BusinessLocations() {
  const { selectedSite, activeSiteId, arionApi } = useArionContext();
  const tier = (selectedSite?.arionTier || 'standard') as string;
  const canManageMulti = meetsMinTier(tier, 'pro');

  const { data, loading, error, refetch } = useArionData(
    () => arionApi.listBusinessLocations().catch((e: any) => ({ error: e.message || 'Failed to load' } as any)),
    [activeSiteId],
  );

  const [pendingId, setPendingId] = React.useState<string | null>(null);
  const [syncing, setSyncing] = React.useState(false);
  const [toast, setToast] = React.useState<string | null>(null);

  if (loading) return <Loading />;
  if (!selectedSite) return <EmptyPanel message="No ARION site selected." />;

  const d = data as any;
  const loadError = d?.error || error;
  const locations: BusinessLocation[] = Array.isArray(d?.data) ? d.data : [];
  const meta = d?.meta || {};

  async function handleSetPrimary(loc: BusinessLocation) {
    if (!canManageMulti) {
      setToast('Multi-location management is available on Pro and Business plans.');
      return;
    }
    if (loc.is_primary) return;
    setPendingId(loc.location_id);
    setToast(null);
    try {
      await arionApi.setBusinessLocationPrimary(loc.location_id);
      setToast(`Set "${loc.display_name || 'Location'}" as primary.`);
      refetch();
    } catch (e: any) {
      setToast(e?.message || 'Failed to set primary location.');
    } finally {
      setPendingId(null);
    }
  }

  async function handleSync() {
    setSyncing(true);
    setToast(null);
    try {
      const r = await arionApi.syncBusinessLocations(activeSiteId);
      const stats = r?.data;
      if (stats) {
        setToast(`Sync complete — ${stats.added} added, ${stats.updated} updated, ${stats.removed} removed. Total: ${stats.total}.`);
      } else {
        setToast('Sync complete.');
      }
      refetch();
    } catch (e: any) {
      const msg = e?.message || 'Sync failed.';
      // Friendly mapping for known backend codes
      if (/NOT_CONNECTED/i.test(msg) || /No Google-connected/i.test(msg)) {
        setToast('No Google-connected site found for this tenant. Connect Google in Settings → Connected Accounts first.');
      } else if (/AUTH_EXPIRED/i.test(msg) || /authorization expired/i.test(msg)) {
        setToast('Google authorization expired. Reconnect Google in Settings → Connected Accounts.');
      } else if (/GBP_QUOTA_EXCEEDED/i.test(msg)) {
        setToast('Google Business Profile API quota not allocated. Request quota in Google Cloud Console.');
      } else if (/GBP_API_DISABLED/i.test(msg)) {
        setToast('Google Business Profile API is not enabled on this project.');
      } else {
        setToast(msg);
      }
    } finally {
      setSyncing(false);
    }
  }

  // ── Empty state — no locations bound yet ───────────────────────────────
  if (!loadError && locations.length === 0) {
    return (
      <div>
        <InfoCard title="No Business Profile locations connected yet">
          <p style={{ margin: 0, marginBottom: 12 }}>
            Connect your Google Business Profile to import every location your account manages.
            Multi-location tenants will see one row per listing, and you can pick which is the tenant's primary.
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <a
              className="abtn abtn-sky"
              href="/app/settings/tenant#connected-accounts"
              style={{ textDecoration: 'none', display: 'inline-block' }}
            >
              Connect Google Business Profile
            </a>
            <button className="abtn" onClick={handleSync} disabled={syncing}>
              {syncing ? 'Syncing...' : 'Re-sync from Google'}
            </button>
          </div>
          {toast && <div style={{ marginTop: 12, fontSize: 12, color: '#5A7A8A' }}>{toast}</div>}
        </InfoCard>
      </div>
    );
  }

  return (
    <div>
      {loadError && (
        <Card title="Couldn't load locations">
          <div style={{ color: '#dc2626', fontSize: 13 }}>{loadError}</div>
        </Card>
      )}

      <Card
        title="Business locations"
        subtitle={
          meta?.count != null
            ? `${meta.count} location${meta.count === 1 ? '' : 's'} imported from Google Business Profile`
            : undefined
        }
        action={
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="abtn" onClick={handleSync} disabled={syncing} title="Re-sync from Google">
              {syncing ? 'Syncing...' : 'Re-sync from Google'}
            </button>
          </div>
        }
      >
        {locations.length === 0 ? (
          <EmptyPanel message="No locations to display." />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: '#5A7A8A', borderBottom: '1px solid #E5E7EB' }}>
                  <th style={{ padding: '8px 10px' }}>Location</th>
                  <th style={{ padding: '8px 10px' }}>Address</th>
                  <th style={{ padding: '8px 10px' }}>Status</th>
                  <th style={{ padding: '8px 10px' }}>Last synced</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {locations.map((loc) => {
                  const isPrimary = loc.is_primary === true || loc.is_primary === 1;
                  const isVerified = loc.is_verified === true || loc.is_verified === 1;
                  const isPending = pendingId === loc.location_id;
                  return (
                    <tr key={loc.location_id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                      <td style={{ padding: '10px', verticalAlign: 'top' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {isPrimary && (
                            <span
                              title="Primary location"
                              style={{
                                width: 8, height: 8, borderRadius: '50%',
                                background: '#16A34A', display: 'inline-block', flexShrink: 0,
                              }}
                            />
                          )}
                          <div>
                            <div style={{ fontWeight: 600, color: '#0C4A60' }}>
                              {loc.display_name || '(Unnamed location)'}
                            </div>
                            {loc.primary_category && (
                              <div style={{ fontSize: 11, color: '#5A7A8A', marginTop: 2 }}>
                                {loc.primary_category}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '10px', verticalAlign: 'top', color: '#334155' }}>
                        <div>{addressLine(loc) || '—'}</div>
                        {loc.phone && <div style={{ fontSize: 11, color: '#5A7A8A', marginTop: 2 }}>{loc.phone}</div>}
                        {loc.website && (
                          <div style={{ fontSize: 11, marginTop: 2, wordBreak: 'break-all' }}>
                            <a href={loc.website} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--arion-sky)' }}>
                              {loc.website}
                            </a>
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '10px', verticalAlign: 'top' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {isPrimary ? (
                            <span className="status-pill active" style={{ width: 'fit-content' }}>Primary</span>
                          ) : (
                            <span style={{ fontSize: 11, color: '#5A7A8A' }}>Secondary</span>
                          )}
                          {isVerified ? (
                            <span style={{ fontSize: 11, color: '#16A34A', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              <span aria-hidden="true">✓</span> Verified
                            </span>
                          ) : (
                            <span style={{ fontSize: 11, color: '#B45309' }}>Unverified</span>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: '10px', verticalAlign: 'top', color: '#5A7A8A', fontSize: 11 }}>
                        {fmtTimestamp(loc.last_synced_at)}
                      </td>
                      <td style={{ padding: '10px', verticalAlign: 'top', textAlign: 'right' }}>
                        {isPrimary ? (
                          <span style={{ fontSize: 11, color: '#16A34A' }}>Current primary</span>
                        ) : (
                          <button
                            className="abtn abtn-sky"
                            onClick={() => handleSetPrimary(loc)}
                            disabled={isPending || !canManageMulti}
                            title={canManageMulti ? 'Promote this location to primary' : 'Multi-location management requires Pro+'}
                          >
                            {isPending ? 'Saving...' : 'Set as primary'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {toast && (
          <div style={{ marginTop: 12, fontSize: 12, color: '#5A7A8A' }}>{toast}</div>
        )}
        {!canManageMulti && locations.length > 1 && (
          <div
            style={{
              marginTop: 12, padding: '10px 12px', borderRadius: 8,
              background: 'rgba(254,200,44,0.10)', border: '1px solid rgba(254,200,44,0.35)',
              fontSize: 12, color: '#7C5A00',
            }}
          >
            You have multiple GBP locations. <strong>Pro+</strong> unlocks setting a different primary
            and full multi-location management. Your current plan shows all imported locations read-only.
          </div>
        )}
      </Card>

      {/* Pro+ multi-location features marketed as a TierGate'd preview so the
          status of the feature is obvious to lower tiers without hiding the
          page entirely. */}
      <TierGate
        currentTier={tier}
        requiredTier="pro"
        featureName="Per-location analytics, posts, and reviews routing"
      >
        <Card title="Multi-location features (Pro+)">
          <p style={{ margin: 0, color: '#334155', fontSize: 13 }}>
            On Pro and Business plans, each location gets its own GBP performance metrics,
            review thread, and posting calendar. The primary location is what your single-page
            Business Overview, Reviews, Posts, and Insights tabs are anchored to.
          </p>
        </Card>
      </TierGate>

      <ConsultingUpsell
        headline="Multi-location SEO is its own discipline. IA manages it end-to-end."
        subtext="Per-location optimization, review monitoring, posting cadence, and consolidated reporting — Pro+ plans."
        serviceType="Local SEO"
        triggerPage="business-locations"
      />
    </div>
  );
}

export default BusinessLocations;
