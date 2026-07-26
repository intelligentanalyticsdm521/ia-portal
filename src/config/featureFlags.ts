// featureFlags.ts — central, build-time feature switches for the Portal.
//
// Keep these here (not scattered inline) so a capability can be turned off in
// ONE place and every surface that imports the flag follows.

// Google Business Profile.
//
// OFF in prod (Brandon 2026-07-24): tenants were being nagged to "Connect
// Google Business Profile" everywhere, but per-tenant GBP connect is a
// dead-end until the Google Workspace migration (personal-Gmail service
// account can't own the Clients group — see the GBP-picker-gated notes).
//
// This flag suppresses the proactive CONNECT nags (Get Started checklist,
// ARION overview hint, IA Insights locked-report message, and the
// "connect GBP" insight rules). It does NOT tear down GBP data: the tenants
// already connected via OAuth (Briarwood, MWAG, IA) keep their live review /
// insight panels — those read the connection status, not this flag.
//
// Re-enable plan when Workspace lands: flip to true; the picker
// (GBP_PICKER_ENABLED in TenantSettings) is a separate switch for the
// auto-provision UI.
export const GBP_ENABLED = false;
