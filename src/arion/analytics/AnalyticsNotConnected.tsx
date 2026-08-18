// AnalyticsNotConnected — A3-1 (2026-07-03)
//
// Shared "Connect Google" empty-state for ARION analytics pages. Before A3-1,
// most analytics sub-tabs (Audience/Content/Conversions/…) rendered a blank
// page when the tenant had not yet connected GA4/GSC — a dead end with no path
// forward. Each GA4-gated page now early-returns this when
// `useAnalyticsData().data.connected === false`, giving the client a single
// clear CTA to the Google connect flow.
//
// The CTA points at the ARION Integrations surface (/app/arion/integrations),
// which hosts the Google (GA4/GSC/GBP) connect flow — NOT /app/settings.
import React from 'react';
import { ARION_COLORS } from './chartConfig';

export function AnalyticsNotConnected({
  title = 'Connect Google Analytics',
  body = 'Link your GA4 property and Search Console to see sessions, users, channels, and search performance here.',
}: { title?: string; body?: string }) {
  return (
    <div style={{ padding: '48px 16px', textAlign: 'center' }}>
      <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8, color: '#0B1C24' }}>{title}</div>
      <p style={{ fontSize: 13, color: '#5A7A8A', maxWidth: 420, margin: '0 auto 20px' }}>{body}</p>
      <a
        href="/app/settings/integrations"
        style={{
          display: 'inline-block',
          padding: '8px 24px',
          fontSize: 13,
          fontWeight: 500,
          background: ARION_COLORS.sky,
          color: '#fff',
          borderRadius: 6,
          textDecoration: 'none',
        }}
      >
        Connect Google
      </a>
    </div>
  );
}

export default AnalyticsNotConnected;
