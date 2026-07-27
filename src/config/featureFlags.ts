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

// SPARK Lead Gen (B2B Lead Search / "New B2B Lead Run").
//
// OFF in prod (Brandon 2026-07-27). The keyword taxonomy was auto-generated
// from NAICS 2022 + O*NET with uniform weights, so a category like "General
// Contractors" expands to an alphabetical dump of obscure NAICS construction
// specializations (abutment / aqueduct / acid-plant construction…) instead of
// the terms a real contractor would search. The UI is polished but the output
// is unusable — worse than not shipping the feature. See
// overnight-report/SOFTWARE_VERIFICATION_STATE_2026-07-27.md (item B1).
//
// This flag hides the Lead Gen nav entries (serviceCatalog filter) and gates
// the dedicated routes (App.tsx) behind a "temporarily unavailable" screen so
// neither a subscriber nor the founder can run a garbage search. It does NOT
// touch acquired-lead viewing (Lead Inbox) or any data. Re-enable once the
// taxonomy is hand-curated per category (or the category→term mapping is
// weighted and pruned) and a real search is verified end-to-end.
export const LEADGEN_ENABLED = false;

// Service keys hidden from nav while LEADGEN_ENABLED is false. Kept here (not
// inline in serviceCatalog) so the lock lives with the flag it depends on.
export const LEADGEN_LOCKED_KEYS: readonly string[] = [
  'spark_leadgen_new',   // New Lead Search (the garbage-producing form)
  'spark_leadgen_saved', // Saved Lead Searches
  'spark_search_profiles', // Search Profiles (saved lead-search configs)
];
