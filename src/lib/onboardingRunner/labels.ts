// C:/dev/iadm/Portal/src/lib/onboardingRunner/labels.ts
//
// Single registry of customer-facing labels for the OnboardingRunner.
// Step authors declare a step_id (machine name) plus a label_user_facing
// fallback on the Step object itself; this registry is the canonical
// override so copy can be tuned without redeploying the step modules.
//
// Tone rules (Brandon-locked):
//   • Present continuous tense ("Spinning up your WordPress site", not
//     "Spin up your WordPress site" or "Spun up your WordPress site").
//   • Plain-English verbs — never expose vendor names (Hostinger, Stripe,
//     Stripe Connect, SE Ranking, GBP, GSC, etc.). The customer should
//     see what's happening for THEM, not which API we're poking.
//     Exception: "Talking with Google" / "Connecting to Bing" is OK
//     because the OAuth screen the user just clicked through is a
//     Google/Bing screen — keeping the brand match reduces "wait, who?"
//     confusion in the middle of the flow.
//   • No emojis, no exclamation marks, no "we're", no "you're" (we use
//     "your" because that's possessive, not contraction-driven). Keeps
//     the timeline calm.
//   • Under 6 words. The progress timeline is vertical and narrow.

import type { StepRecord } from "./types";

/* ──────────────────────────────────────────────────────────────────────
 * Label registry — keyed by Step.id.
 * ────────────────────────────────────────────────────────────────────── */

export const STEP_LABELS: Readonly<Record<string, string>> = Object.freeze({
  // ── ARION ──────────────────────────────────────────────────────────
  arion_questionnaire:         "Saving your business details",
  arion_hostinger_provision:   "Spinning up your WordPress site",
  arion_plugin_swap:           "Installing your tools",
  arion_create_wp_user:        "Creating your login",
  arion_ai_website_builder:    "Designing your website",
  arion_seo_project_create:    "Setting up your SEO project",
  arion_seo_keywords_seed:     "Seeding your keywords",
  arion_seo_competitors_seed:  "Linking your competitors",
  arion_seo_configure_tier:    "Tuning your SEO settings",
  arion_google_oauth:          "Talking with Google",
  arion_bing_oauth:            "Connecting to Bing",
  arion_gbp_connect:           "Linking your business profile",
  arion_ga4_connect:           "Connecting your analytics",
  arion_gsc_connect:           "Connecting your search data",
  arion_market_monitor_seed:   "Picking your competitors",
  arion_mark_for_consulting:   "Queuing your migration with consulting",

  // ── OLIVER ─────────────────────────────────────────────────────────
  oliver_stripe_connect:       "Setting up payments",
  oliver_portal_white_label:   "Configuring your portals",
  oliver_calendar_connect:     "Syncing your calendar",
  oliver_team_seats_seed:      "Preparing your team seats",
  oliver_service_catalog_seed: "Loading your services",
  oliver_welcome_email:        "Saving your welcome email",

  // ── SPARK ──────────────────────────────────────────────────────────
  spark_welcome_email:         "Saving your welcome email",
  spark_brand_voice_seed:      "Learning your brand voice",
  spark_social_connect:        "Linking your social accounts",
  spark_first_campaign_seed:   "Drafting your first campaign",

  // ── Shared / cross-product ─────────────────────────────────────────
  shared_business_profile_save: "Saving your business details",
  shared_billing_finalize:      "Finalizing your subscription",
  shared_tenant_users_seed:     "Setting up your account",
});

/* ──────────────────────────────────────────────────────────────────────
 * Resolver helpers
 * ────────────────────────────────────────────────────────────────────── */

/**
 * Resolve the customer-facing label for a step id. Order of precedence:
 *   1. STEP_LABELS registry hit
 *   2. fallback parameter (typically the Step's label_user_facing)
 *   3. a humanised version of the step id ("arion_foo_bar" → "Arion
 *      foo bar")
 *
 * Step authors should always pass their label_user_facing as the
 * fallback so a missing registry entry never shows raw snake_case to a
 * customer.
 */
export function getLabel(step_id: string, fallback?: string): string {
  const hit = STEP_LABELS[step_id];
  if (hit) return hit;
  if (fallback) return fallback;
  return step_id
    .split("_")
    .map((w, i) => (i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(" ");
}

/**
 * Convenience for the UI — given a StepRecord + the original Step's
 * label_user_facing fallback, return the resolved copy. Lives here (not
 * in the React component) so it's easy to unit-test.
 */
export function getRecordLabel(record: Pick<StepRecord, "step_id">, fallback?: string): string {
  return getLabel(record.step_id, fallback);
}
