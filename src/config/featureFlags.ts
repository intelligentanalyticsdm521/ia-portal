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

// KILL SWITCH for the 2026-08-06 subscription/tier gating (product rail lock,
// per-item "UPGRADE" pills, product-not-owned banner).
//
// Turned OFF 2026-08-06 same day: after shipping, Brandon reported OLIVER
// inaccessible and SPARK behaving wrongly on the Intelligent Analytics tenant.
// The agency owns every product and has no Stripe subscriptions, so any hole in
// the founder-bypass path makes its own products read as locked. Rather than
// leave a broken portal while diagnosing, this flag restores the pre-gating
// behaviour: every product and every nav item renders normally.
//
// Backend enforcement is unaffected (requireSparkAccess / requireSparkTier /
// requireArionTier / oliver enforceTenantAccess) — real access control still
// lives server-side. This flag only controls what the MENU does.
//
// RE-ENABLED 2026-08-16, after fixing the root cause rather than the symptom.
//
// The original failure was NOT the gating logic — it was that tier came
// exclusively from live Stripe product names, so every manually-onboarded or
// comped tenant (Intelligent Analytics, Rolling In It, Cold Start Test Co)
// resolved to NO tier and therefore read as locked.
//
// Two independent protections now exist:
//   1. oliver-api GET /billing/subscriptions (commit 3fd6ff1) grants a tier
//      from core.tenants.subscription_tier for any product the tenant OWNS but
//      has no Stripe subscription for. Ownership is still the gate; Stripe wins
//      wherever a live subscription exists. Verified in prod: Cold Start =
//      business on 5 products, Rolling In It = pro on 3, Midwest Ag = arion only.
//   2. useProductTier still hard-bypasses to "business" for the founder inside
//      his OWN tenant, so a hole in (1) cannot lock Brandon out again.
//
// If this ever needs killing again, set false and redeploy — but fix the tier
// RESOLUTION, not this flag.
export const FEATURE_GATING_ENABLED = true;

// Service keys hidden from nav while LEADGEN_ENABLED is false. Kept here (not
// inline in serviceCatalog) so the lock lives with the flag it depends on.
export const LEADGEN_LOCKED_KEYS: readonly string[] = [
  'spark_leadgen_new',   // New Lead Search (the garbage-producing form)
  'spark_leadgen_saved', // Saved Lead Searches
  'spark_search_profiles', // Search Profiles (saved lead-search configs)
];
