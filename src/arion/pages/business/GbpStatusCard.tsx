import React from 'react';
import { InfoCard } from '../../components/Ui';

// GBP Connect August batch (2026-07-22) — ONE explainer for every GBP
// failure mode, shared by Overview / Insights / Reviews.
//
// Why: BusinessInsights and BusinessReviews collapsed EVERY backend error
// (quota pending, API disabled, auth expired, no location selected) into a
// generic "Not Connected" card — while BusinessOverview already
// differentiated. A tenant whose real problem was "you haven't picked your
// listing yet" (RII's documented live state) or "Google quota pending" was
// told they weren't connected, which is false and unactionable. The backend
// returns several of these codes WITH connected:true (routes/arion.js
// insights/reviews branches), so pages must switch on the error code, not
// just the connected flag.
export function gbpErrorTitle(err: string | null | undefined): string {
  if (err === 'gbp_quota_exceeded' || err === 'gbp_api_disabled') {
    return 'Google Business Profile — API Access Pending';
  }
  if (err === 'gbp_auth_expired') return 'Google Business Profile — Reconnect Needed';
  if (err === 'gbp_location_not_selected') return 'Google Business Profile — Choose Your Listing';
  if (err === 'location_not_found') return 'Google Business Profile — No Listing Found';
  return 'Google Business Profile — Not Connected';
}

export function gbpErrorBody(err: string | null | undefined, surface: 'insights' | 'reviews' | 'overview'): string {
  switch (err) {
    case 'gbp_quota_exceeded':
      return 'The Google Business Profile APIs are enabled for this project but have a zero-quota limit. Request quota in Google Cloud Console → APIs & Services → enable quota on My Business Account Management API, My Business Business Information API, and Business Profile Performance API. Google typically approves within minutes.';
    case 'gbp_api_disabled':
      return 'The Google Business Profile APIs are not enabled for this Google Cloud project. Enable them in Google Cloud Console → APIs & Services.';
    case 'gbp_auth_expired':
      return 'Your Google authentication has expired. Reconnect Google in Settings → Connected Accounts.';
    case 'gbp_location_not_selected':
      return 'Google is connected, but no business listing has been selected for this site yet. Choose your listing in Settings → Connected Accounts → Google Business Profile.';
    case 'location_not_found':
      return 'No Google Business Profile location was found for this Google account.';
    default:
      return surface === 'insights'
        ? 'Connect your Google Business Profile in Settings → Connected Accounts to see live insights.'
        : surface === 'reviews'
          ? 'Connect your Google Business Profile in Settings → Connected Accounts to see live reviews.'
          : 'Connect your Google Business Profile in Settings → Connected Accounts to see live reviews, insights, and manage your listing.';
  }
}

export function GbpStatusCard({ error, surface }: { error: string | null | undefined; surface: 'insights' | 'reviews' | 'overview' }) {
  return (
    <InfoCard title={gbpErrorTitle(error)}>
      <p style={{ margin: 0 }}>{gbpErrorBody(error, surface)}</p>
    </InfoCard>
  );
}

// A just-created listing IS connected — Google simply reports nothing
// (no performance, reviews, or posts) until verification completes.
// Telling the user "Not Connected" minutes after a successful create was
// false and alarming (walkthrough catch 2026-07-22).
export function GbpPendingVerificationCard({ what }: { what: string }) {
  return (
    <InfoCard title="Google Business Profile — Verification Pending">
      <p style={{ margin: 0 }}>
        Your listing is created and connected. Google doesn't publish {what} until
        the business is verified — finish verification on the Overview tab and
        this page fills in on its own once Google approves (usually within days;
        instant for some businesses).
      </p>
    </InfoCard>
  );
}
