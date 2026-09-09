import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, InfoCard, Loading, EmptyPanel, ErrorBanner, ConsultingUpsell } from '../../components/Ui';
import { useArionContext } from '../../useArionContext';
import { useArionData } from '../../useArionData';
import { smallButton } from '../../components/SectionFieldInputs';
import type { SiteOptions } from '../../../lib/arionApi';

/**
 * ARION → Website → Settings
 * ---------------------------------------------------------------------------
 * ARION pack 2 changed two things here.
 *
 * 1. THE CHAT BUBBLE AND THE BOOK NOW BUTTON now have a home. Both were
 *    switches that existed only on a WordPress settings screen, which meant a
 *    client had to sign into WordPress to turn on the chat bubble the Portal
 *    had sold them.
 *
 * 2. THE "WordPress Users" CARD IS GONE (D-ARION-D). It said user management
 *    happens through WP Admin. That was a lie on a client's screen: the people
 *    who use this business's account are the people invited to the Portal, and
 *    every website already gets one editor account of its own when it is set
 *    up. Building a WordPress user manager in here would be re-opening the
 *    door this whole pack exists to close.
 */

const TAP = 44;

function messageFrom(err: any, fallback: string): string {
  const m = err?.body?.error?.message || err?.error?.message || err?.message;
  return typeof m === 'string' && m.trim() ? m : fallback;
}

export function WebsiteSettings() {
  const { selectedSite, activeSiteId, arionApi, loading } = useArionContext();

  const { data: hosting, loading: hostingLoading } = useArionData(
    () => activeSiteId ? arionApi.getHosting(activeSiteId) : Promise.resolve(null),
    [activeSiteId]
  );

  const [options, setOptions] = useState<SiteOptions | null>(null);
  const [optionsError, setOptionsError] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadOptions = useCallback(async () => {
    if (!activeSiteId) return;
    setOptionsError(null);
    try {
      const res: any = await arionApi.getSiteOptions(activeSiteId);
      const payload: SiteOptions = res?.data;
      setOptions(payload);
      setLabel(payload.booking.label);
    } catch (e: any) {
      setOptionsError(messageFrom(e, 'We could not read your website’s settings just now.'));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSiteId, arionApi]);

  useEffect(() => { void loadOptions(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [activeSiteId]);

  const save = async (params: {
    chatEnabled?: boolean; bookingInHeader?: boolean; bookingLabel?: string;
  }) => {
    if (!activeSiteId) return;
    setBusy(true); setError(null); setOk(null);
    try {
      const res: any = await arionApi.saveSiteOptions(activeSiteId, params);
      const payload: SiteOptions = res?.data;
      setOptions(payload);
      setLabel(payload.booking.label);
      setOk('Saved. It is live on your website now.');
    } catch (e: any) {
      setError(messageFrom(e, 'We could not save that.'));
    } finally {
      setBusy(false);
    }
  };

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
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
          Your business name and the line under it are set under{' '}
          <Link to="/app/services/arion_website_design">Brand and layout</Link>.
        </div>
      </Card>

      {/* What visitors see — the two switches that lived only in WordPress */}
      <Card
        title="What visitors see"
        subtitle="Two things that show on every page of your website."
        style={{ marginTop: 12 }}
      >
        {optionsError && <ErrorBanner message={optionsError} />}
        {error && <ErrorBanner message={error} />}
        {ok && (
          <div style={{
            background: '#ECFDF5', color: '#065F46', border: '1px solid #A7F3D0',
            borderRadius: 10, padding: '8px 12px', marginBottom: 10, fontSize: 13,
          }}>{ok}</div>
        )}

        {!options ? (
          optionsError ? (
            <button type="button" style={smallButton} onClick={() => void loadOptions()}>Try again</button>
          ) : (
            <Loading message="Reading your website’s settings…" />
          )
        ) : (
          <>
            <div style={{ borderTop: '1px solid var(--border)', padding: '12px 0' }}>
              <label style={{ display: 'flex', gap: 10, alignItems: 'center', minHeight: TAP, cursor: 'pointer' }}>
                <input
                  type="checkbox" checked={options.chat.enabled} disabled={busy}
                  onChange={(e) => void save({ chatEnabled: e.target.checked })}
                  style={{ width: 18, height: 18 }}
                />
                <span style={{ fontSize: 14, fontWeight: 600 }}>The chat bubble</span>
              </label>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                The little "chat to us" button in the corner of your website. Messages come to your inbox.
              </div>
            </div>

            <div style={{ borderTop: '1px solid var(--border)', padding: '12px 0' }}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>The “{options.booking.label}” button</div>
              {!options.booking.url ? (
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  You have no online booking page yet, so there is nothing for this button to open.
                </div>
              ) : !options.booking.tierAllows ? (
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  Your plan does not include this button.
                </div>
              ) : (
                <>
                  <label style={{ display: 'flex', gap: 10, alignItems: 'center', minHeight: TAP, cursor: 'pointer' }}>
                    <input
                      type="checkbox" checked={options.booking.inHeader} disabled={busy}
                      onChange={(e) => void save({ bookingInHeader: e.target.checked })}
                      style={{ width: 18, height: 18 }}
                    />
                    <span style={{ fontSize: 13 }}>Show it at the top of every page</span>
                  </label>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 8 }}>
                    <label htmlFor="booking-label" style={{ fontSize: 12, fontWeight: 600 }}>What it says</label>
                    <input
                      id="booking-label" value={label} maxLength={40}
                      onChange={(e) => setLabel(e.target.value)}
                      style={{
                        fontSize: 16, padding: '8px 10px', borderRadius: 8,
                        border: '1px solid var(--border)', minHeight: TAP, width: 200,
                      }}
                    />
                    <button
                      type="button" style={smallButton}
                      disabled={busy || !label.trim() || label === options.booking.label}
                      onClick={() => void save({ bookingLabel: label.trim() })}
                    >
                      {busy ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6, wordBreak: 'break-all' }}>
                    It opens {options.booking.url}
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </Card>

      {/* Who can change this website (D-ARION-D) */}
      <Card title="Who can change this website" style={{ marginTop: 12 }}>
        <InfoCard title="The people on your account">
          <p style={{ margin: 0 }}>
            Whoever you invite to this account can change your website from here. There is no second
            set of logins to keep — your website already has the one account it needs, which we set up
            and look after.
          </p>
        </InfoCard>
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
