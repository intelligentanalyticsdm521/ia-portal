// OnboardingWizardModal — UNIFIED onboarding + consulting modal.
//
// ONE modal, ONE design, ONE flow. The CONTENT changes per section. The only
// thing that varies visually is the accent color band per section (so OLIVER
// sections feel like OLIVER, ARION like ARION, etc.). Layout, fields,
// buttons, step indicator — all identical across every section.
//
// NO HARD VALIDATION between sections. Save & Continue advances. Save &
// Close pauses. Save & Finish always works — even if some optional fields
// are blank. Skipping a step is a deliberate choice, not an error.
//
// Sections (filtered by what's in cart on the tenant):
//   1.  Business profile         (always)
//   2.  Owner account            (always)
//   3.  ARION setup              (if arion in cart) — domain/questionnaire/branding
//   4.  SPARK setup              (if spark in cart) — sender + contacts + voice
//   5.  OLIVER payments          (if oliver in cart) — info-only note;
//                                  Stripe Connect setup happens client-side
//                                  post-CIAM via the OLIVER dashboard hint
//                                  (Brandon does not handle client bank info)
//   6.  OLIVER templates         (if oliver in cart) — invoice/quote/proposal
//   7.  OLIVER customer portal   (if oliver in cart) — design + features + domain
//   8.  OLIVER employee portal   (if oliver in cart) — same shape, for crew
//   9.  OLIVER catalog           (if oliver in cart) — first offerings
//   10. Consulting kickoff       (if consulting in cart) — engagement + booking
//   11. Finish                   (always) — review + Save & Finish (welcome email)
//
// API scope: every fetch from inside this modal sends x-tenant-key /
// x-tenant-id = the client's tenant_id (via ClientTenantContext). Audit
// columns server-side stamp the founder's identity.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { IadmModal, CORE_BLUE, PRODUCT_ACCENT } from "../IadmModal";
import { ClientTenantProvider, type ClientTenantValue } from "../../lib/clientTenantContext";
import { useOliverApi } from "../../hooks/useOliverApi";
import { useAccessToken } from "../../auth/useAccessToken";
import { connectGoogle as arionConnectGoogle, createSeoProject as arionCreateSeoProject, markAppleClaimed as arionMarkAppleClaimed } from "../../lib/arionApi";
import { InfoTip } from "../InfoTip";
import { LogoPicker } from "../oliver/LogoPicker";
import { PhoneInput } from "../PhoneInput";
import { BarChart3, Building2, CheckCircle2, ExternalLink, Globe, MapPin, Plus, Search, Sparkles, Trash2, TrendingUp, UserCheck } from "lucide-react";
import { mergeStrict } from "../../lib/mergeStrict";
import { createRunner } from "../../lib/onboardingRunner/runner";
import { buildArionSteps, type ArionDomainPath } from "../../lib/onboardingRunner/arionSteps";
import type { StepRecord, Runner } from "../../lib/onboardingRunner/types";
import OnboardingRunnerProgress from "../onboarding/OnboardingRunnerProgress";
import { BrandIntakeStep } from "../BrandIntakeStep";
import {
  DEFAULT_BRAND_INTAKE,
  coerceBrandIntake,
  type BrandIntake,
} from "../../types/brandIntake";
import { fetchArionSeoAddons, type ArionSeoAddonEntry } from "../../lib/onboardingApi";
import { SparkBodyEditor } from "../spark/SparkBodyEditor";
import { useSparkApi } from "../../hooks/useSparkApi";

const ARION_API_BASE_URL = (import.meta.env.VITE_ARION_API_BASE_URL as string)
  || "https://app-arion-api-prod-e6fuc9gzd8f3hqfe.centralus-01.azurewebsites.net";

// ─── Types ───────────────────────────────────────────────────────────────

interface BusinessProfile {
  business_name: string;
  primary_contact_email: string;
  address_street: string;
  address_line2: string;
  address_city: string;
  address_state: string;
  address_zip: string;
  phone: string;
  website: string;
  industry: string;
  logo_url: string;
  primary_color: string;
  secondary_color: string;
  accent_color: string;
}

interface OwnerAccount {
  first_name: string;
  last_name: string;
  display_name: string;
  title: string;
  mobile: string;
  time_zone: string;
  billing_email: string;
  notif_email: boolean;
  notif_sms: boolean;
}

interface OnboardingState {
  profile: BusinessProfile;
  owner: OwnerAccount;
  arion: {
    // 2026-06-24 — siteMode is the FIRST decision in the ARION flow per
    // Brandon's lock: customer picks "I have an existing site" vs "I need a
    // new site built" before anything else. This drives whether we render
    // the full questionnaire (new) or a compact WP-URL + admin handoff form
    // (existing). Stays "" until the user clicks one of the two cards.
    //
    // Mapping to runner's domain_choice:
    //   siteMode='new'      → domain_choice ∈ {purchase, subdomain, byo (no existing flag)}
    //   siteMode='existing' → domain_choice ∈ {byo + has_existing_website=true, hostinger_existing}
    //                         skip-questionnaire flag implicit via has_existing_website.
    siteMode: "new" | "existing" | "";
    // Existing-site fields (only used when siteMode='existing'). Captured so
    // the runner / handoff has the WordPress URL + admin credentials path.
    existing_wp_url: string;
    existing_wp_admin_handoff: "create_admin_invite" | "share_credentials" | "";
    // Domain
    domain_choice: "byo" | "purchase" | "subdomain" | "hostinger_existing" | "migrate" | "";
    domain: string;
    has_existing_website: boolean;
    // Questionnaire (drives WP template + AI copy + SE Ranking seeds)
    industry: string;
    description: string;
    services: string[];        // up to 3
    target_audience: string;
    location: string;          // city/region
    // 2026-06-21 — multi-select, max 3, from 12-voice catalog. Was single value.
    // Free-text custom voice can be appended (joined with ',' on save).
    brand_voice: string[];
    brand_voice_custom: string;
    style_preference: "Modern" | "Classic" | "Minimal" | "Bold";
    pages: string[];           // multi-select
    tagline: string;
  };
  spark: {
    sender_domain: string;
    brand_voice: string[];
    brand_voice_custom: string;
    contact_import_method: "csv" | "paste" | "sync" | "later" | "";
    send_time_preference: "morning" | "midday" | "afternoon" | "evening" | "";
    first_campaign_goal: string;
    audience_size_estimate: string;
    // 2026-06-24 — SPARK setup expanded from a single sender_domain field
    // to a 7-sub-step flow per Brandon's SPARK Campaign Composer v1.1 lock
    // + welcome-email canonical scope. Each block below carries one step.
    //
    // Step 1 — IA-default ("@send.ia-dm.com") vs white-label own domain.
    sender_mode: "ia_default" | "white_label" | "";
    // Step 1b — the white-label "from" email the founder typed (drives
    // sender_domain + reply_to). Empty when sender_mode = ia_default.
    white_label_email: string;
    // Step 2 — DNS publish path. arion_auto: Hostinger-managed domain, the
    // ARION SSH pipeline writes the SPF/DKIM/DMARC records. manual_byo: the
    // customer publishes the records themselves and verifies via SPARK ▸
    // Sender domains after onboarding.
    dns_path: "arion_auto" | "manual_byo" | "";
    arion_dns_publish_status: "idle" | "publishing" | "verified" | "failed";
    // Step 3 — Sender addresses (1+ rows). Persisted via POST /senders one
    // row at a time at finish-onboarding time. The first row is prefilled
    // from the owner's email (or welcome@<white_label_domain>).
    senders: Array<{
      local_part: string;
      display_name: string;
      is_default: boolean;
      reply_to_override: string;
    }>;
    // Step 4 — Signatures (1+ rows). Body is rich-text (SparkBodyEditor
    // produces sanitised HTML); we mirror plain text into body_text. The
    // first row is prefilled from owner.first_name + business_name + phone.
    signatures: Array<{
      name: string;
      body_html: string;
      body_text: string;
      is_default: boolean;
    }>;
    // Step 5 — Default CTA brand colour for the Campaign Composer's "Insert
    // CTA" button. Prefilled from profile.accent_color but overridable.
    default_cta_color: string;
    // Step 6 — Initial contact source pick. csv_now / integrate_later / skip
    // is the headline; the legacy contact_import_method / audience_size /
    // send_time_preference / brand_voice / first_campaign_goal fields above
    // remain accessible as "More SPARK settings".
    initial_contact_source: "csv_now" | "integrate_later" | "skip" | "";
    // Step 7 — White-label only: show or hide the "Powered by Intelligent
    // Analytics" footer. The picker is disabled for Lite-tier (which always
    // shows the footer per reference_oliver_tier_matrix.md branding model).
    show_ia_footer: boolean;
  };
  oliver: {
    stripe_connect_started: boolean;
    customer_portal: { welcome: string; show_a: boolean; show_b: boolean; logo_override: string; header_color: string; };
    employee_portal: { welcome: string; show_a: boolean; show_b: boolean; logo_override: string; header_color: string; };
    catalog: Array<{ name: string; price: string }>;
  };
  consulting: { engagement_type: string; first_meeting_notes: string };
  lifecycle: {
    preset: "simple" | "moderate" | "detailed";
    qualify_trigger: "manual" | "on_quote_or_meeting" | "every_lead";
    oliver_create_trigger: "eager" | "on_prospect" | "manual";
    past_customer_days: number;
    negotiation_trigger: "manual" | "on_counter_reply" | null;
    confirmed: boolean;
  };
  arion_integrations: {
    gbp_connected: boolean;
    gsc_connected: boolean;
    google_ads_linked: boolean;
    bing_connected: boolean;
    apple_claimed: boolean;
    se_ranking_project_created: boolean;
    skipped: boolean;
    // 2026-06-24 — Dual-path picker per [[reference_ia_integration_pattern]].
    // Each integration has TWO visible paths the customer chooses between
    // BEFORE the runner launches the Google + Bing connect steps:
    //   • "byo"        — customer brings their own account; the runner kicks
    //                    off the existing OAuth (Google) or paste-key (Bing)
    //                    flow into THEIR account.
    //   • "ia_managed" — we provision under the IA master account and
    //                    transfer ownership to the customer post-onboarding.
    // Defaults to "ia_managed" — the lowest-friction path for the typical
    // client who doesn't already have these accounts. The selections feed
    // launchRunner() as google_setup_answer / bing_setup_answer (yes for
    // byo, no for ia_managed). Per-integration so a customer with their own
    // GA4 but no GBP can still pick BYO for one and ia_managed for the
    // other (the runner reads a single google answer today; that limitation
    // is documented inline at the launch site so the future split lands
    // cleanly).
    google_provisioning: {
      ga4: "byo" | "ia_managed";
      gsc: "byo" | "ia_managed";
      gbp: "byo" | "ia_managed";
    };
    bing_provisioning: {
      bwt: "byo" | "ia_managed";
    };
  };
  spark_welcome_email: {
    template_choice: "system_default" | "custom" | "skip";
    subject: string;
    preview_text: string;
    body: string;
    sender_name: string;
    sender_email: string;
  };
  /**
   * 2026-06-25 — Shared brand intake (sliders / voice traits / tones to
   * avoid / differentiators / visual direction / photography / admired
   * brands / positioning territories). Persists to lumen.brand_voice_profile
   * so AI features across ARION / SPARK / OLIVER read from one canonical
   * source. Top-level (not nested under arion) because it's cross-product —
   * a SPARK-only tenant should still capture this.
   */
  brand_intake: BrandIntake;
}

const EMPTY_STATE: OnboardingState = {
  profile: {
    business_name: "", primary_contact_email: "",
    address_street: "", address_line2: "", address_city: "", address_state: "", address_zip: "",
    phone: "", website: "", industry: "", logo_url: "",
    primary_color: "#1A3A4A", secondary_color: "#FEC82C", accent_color: "#1A7DB5",
  },
  owner: {
    first_name: "", last_name: "", display_name: "", title: "", mobile: "",
    time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Chicago",
    billing_email: "", notif_email: true, notif_sms: false,
  },
  arion: {
    siteMode: "", existing_wp_url: "", existing_wp_admin_handoff: "",
    domain_choice: "", domain: "", has_existing_website: false,
    industry: "", description: "", services: ["", "", ""],
    target_audience: "", location: "",
    brand_voice: ["Professional"], brand_voice_custom: "", style_preference: "Modern",
    pages: ["Home", "About", "Services", "Contact"],
    tagline: "",
  },
  spark: {
    sender_domain: "", brand_voice: [], brand_voice_custom: "",
    contact_import_method: "", send_time_preference: "",
    first_campaign_goal: "", audience_size_estimate: "",
    // 2026-06-24 — SPARK 7-sub-step expansion seeds. Most are blank/empty;
    // the senders + signatures arrays start with one placeholder row each
    // so the UI always has something to render before prefill lands.
    sender_mode: "",
    white_label_email: "",
    dns_path: "",
    arion_dns_publish_status: "idle",
    senders: [{ local_part: "", display_name: "", is_default: true, reply_to_override: "" }],
    signatures: [{ name: "Default", body_html: "", body_text: "", is_default: true }],
    default_cta_color: "",
    initial_contact_source: "",
    show_ia_footer: true,
  },
  oliver: {
    stripe_connect_started: false,
    customer_portal: { welcome: "", show_a: true, show_b: true, logo_override: "", header_color: "" },
    employee_portal: { welcome: "", show_a: true, show_b: true, logo_override: "", header_color: "" },
    catalog: [{ name: "", price: "" }],
  },
  consulting: { engagement_type: "", first_meeting_notes: "" },
  lifecycle: {
    preset: "simple",
    qualify_trigger: "manual",
    oliver_create_trigger: "on_prospect",
    past_customer_days: 90,
    negotiation_trigger: null,
    confirmed: false,
  },
  arion_integrations: {
    gbp_connected: false,
    gsc_connected: false,
    google_ads_linked: false,
    bing_connected: false,
    apple_claimed: false,
    se_ranking_project_created: false,
    skipped: false,
    // Default both Google + Bing to "ia_managed" — Brandon's locked default
    // per [[reference_ia_integration_pattern]]. The lowest-friction path for
    // the typical client who doesn't already have GA4/GSC/GBP/BWT accounts.
    // Customer can flip any of these to "byo" in the wizard's dual-path
    // picker before clicking Save & Continue.
    google_provisioning: { ga4: "ia_managed", gsc: "ia_managed", gbp: "ia_managed" },
    bing_provisioning:   { bwt: "ia_managed" },
  },
  spark_welcome_email: {
    template_choice: "system_default",
    subject: "Welcome to {{tenant.business_name}}",
    preview_text: "We're so glad you're here.",
    body: "",
    sender_name: "",
    sender_email: "",
  },
  brand_intake: { ...DEFAULT_BRAND_INTAKE },
};

// ─── Section model ───────────────────────────────────────────────────────

type ProductKey = "arion" | "spark" | "oliver" | "consulting";
type SectionId =
  | "profile" | "owner" | "lifecycle"
  | "arion" | "arion_integrations"
  | "spark" | "spark_welcome_email"
  | "oliver_payments" | "oliver_templates" | "oliver_customer_portal" | "oliver_employee_portal" | "oliver_catalog"
  | "consulting"
  | "finish";

interface Section {
  id: SectionId;
  title: string;
  product?: ProductKey;
  required?: boolean;
}

function buildSections(cart: ProductKey[]): Section[] {
  const out: Section[] = [
    { id: "profile", title: "Business profile", required: true },
    { id: "owner",   title: "Owner account",    required: true },
  ];
  // Customer Lifecycle step — shown to any tenant whose cart includes SPARK or
  // OLIVER (consulting-only tenants don't have a CRM funnel to configure).
  if (cart.includes("spark") || cart.includes("oliver")) {
    out.push({ id: "lifecycle", title: "Sales workflow", required: true });
  }
  if (cart.includes("arion")) {
    out.push({ id: "arion", title: "ARION setup", product: "arion" });
    out.push({ id: "arion_integrations", title: "ARION · Integrations", product: "arion", required: true });
  }
  if (cart.includes("spark")) {
    out.push({ id: "spark", title: "SPARK setup", product: "spark" });
    out.push({ id: "spark_welcome_email", title: "SPARK · Welcome email", product: "spark", required: true });
  }
  if (cart.includes("oliver")) {
    out.push({ id: "oliver_payments",        title: "OLIVER · Payments",        product: "oliver" });
    out.push({ id: "oliver_templates",       title: "OLIVER · Templates",       product: "oliver" });
    out.push({ id: "oliver_customer_portal", title: "OLIVER · Customer portal", product: "oliver" });
    out.push({ id: "oliver_employee_portal", title: "OLIVER · Employee portal", product: "oliver" });
    out.push({ id: "oliver_catalog",         title: "OLIVER · Catalog",         product: "oliver" });
  }
  if (cart.includes("consulting")) out.push({ id: "consulting", title: "Consulting kickoff", product: "consulting" });
  out.push({ id: "finish", title: "Finish" });
  return out;
}

function accentFor(section: Section): string {
  if (!section.product) return CORE_BLUE;
  return (PRODUCT_ACCENT as Record<string, string>)[section.product] || CORE_BLUE;
}

// ─── ARION runner controller ─────────────────────────────────────────────
//
// 2026-06-23 — runner state lifted out of ArionSection so:
//   1. Save & Continue on Step 4 (ArionSection) can launch the runner BEFORE
//      advancing to Step 5 (ArionIntegrationsSection). No separate blue
//      "Start ARION setup" button — the wizard footer is the trigger.
//   2. Step 5 can render OnboardingRunnerProgress inline while the runner is
//      still ticking, replacing the legacy "No ARION site detected yet"
//      yellow callout that used to appear because the runner never started.
//   3. persist("continue") on Step 5 can block advance until the runner
//      reaches a terminal state (every step done/skipped, OR at least one
//      step in failed_server_busy — meaning the founder has been pinged and
//      the user can choose to bail).
//
// The migrate path is the only one that does NOT auto-launch the runner —
// per Brandon's lock 2026-06-23, migration is consulting-only (flag the
// tenant, show handoff copy, no provisioning). ArionIntegrationsSection
// recognises domain_choice === "migrate" and shows the handoff panel
// instead of the runner UI.
export interface ArionRunnerController {
  // Inputs the ArionSection probes & writes up so the controller can launch.
  setSiteContext: (ctx: { site_id: string | null; has_seo_addon: boolean }) => void;
  // The single entry point — called from persist("continue") on Step 4.
  // Returns immediately; runner.start() runs in the background and pushes
  // status via the on_step_change callback.
  launchRunner: (args: {
    arion: OnboardingState["arion"];
    profile: OnboardingState["profile"];
    arion_integrations: OnboardingState["arion_integrations"];
  }) => Promise<void>;
  // Read-only state — consumed by both ArionSection (for the inline progress
  // panel when the user navigates back to Step 4 mid-run) and by
  // ArionIntegrationsSection (the natural home of the live progress UI).
  runnerStarted: boolean;
  runnerComplete: boolean;
  runnerError: string | null;
  runnerRecords: StepRecord[];
  runnerCurrentStep: string | null;
  stepCaps: Record<string, number>;
  skipAllowedStepIds: string[];
  fallbackLabels: Record<string, string>;
  handleRetry: (step_id: string) => void;
  handleSkip: (step_id: string) => void;
  /** Has the runner reached a state where Save & Continue from Step 5 is
   *  allowed? True when every step is done/skipped OR at least one step is
   *  in failed_server_busy (founder pinged, user can bail). False while any
   *  step is still pending/running/waiting/verifying/failed_retrying. */
  isAtTerminalState: boolean;
}

function useArionRunner(tenantId: string): ArionRunnerController {
  const { getToken: getArionToken } = useAccessToken();

  const [siteCtx, setSiteCtx] = useState<{ site_id: string | null; has_seo_addon: boolean }>({
    site_id: null,
    has_seo_addon: false,
  });
  const [runnerStarted, setRunnerStarted] = useState(false);
  const [runnerComplete, setRunnerComplete] = useState(false);
  const [runnerError, setRunnerError] = useState<string | null>(null);
  const [runnerRecords, setRunnerRecords] = useState<StepRecord[]>([]);
  const [runnerCurrentStep, setRunnerCurrentStep] = useState<string | null>(null);
  const runnerRef = useRef<Runner | null>(null);
  const stepCapsRef = useRef<Record<string, number>>({});
  const skipAllowedRef = useRef<string[]>([]);
  const fallbackLabelsRef = useRef<Record<string, string>>({});
  // Mirror site context into a ref so launchRunner picks the latest value
  // even when it's invoked from a parent persist() handler whose closure
  // captured an older render.
  const siteCtxRef = useRef(siteCtx);
  siteCtxRef.current = siteCtx;

  const setSiteContext = (ctx: { site_id: string | null; has_seo_addon: boolean }) => {
    setSiteCtx(ctx);
  };

  async function launchRunner(args: { arion: OnboardingState["arion"]; profile: OnboardingState["profile"]; arion_integrations: OnboardingState["arion_integrations"] }): Promise<void> {
    const { arion: v, profile, arion_integrations: integ } = args;
    if (runnerStarted || !v.domain_choice) return;
    // Migrate path never auto-launches; the parent's persist() also guards
    // this, but defending here makes the controller safe to call anywhere.
    if (v.domain_choice === "migrate") return;

    setRunnerStarted(true);
    setRunnerError(null);
    setRunnerComplete(false);

    let bearer = "";
    try {
      const t = await getArionToken();
      bearer = t.accessToken;
    } catch (e) {
      setRunnerError(`Could not get auth token: ${(e as Error).message}`);
      setRunnerStarted(false);
      return;
    }

    const steps = buildArionSteps(v.domain_choice as ArionDomainPath, siteCtxRef.current.has_seo_addon);
    stepCapsRef.current = Object.fromEntries(steps.map((s) => [s.id, s.max_retries]));
    skipAllowedRef.current = steps.filter((s) => s.on_failure === "skip_allowed").map((s) => s.id);
    fallbackLabelsRef.current = Object.fromEntries(steps.map((s) => [s.id, s.label_user_facing]));

    // 2026-06-24 — Map the dual-path picker selections to the runner's
    // google_setup_answer / bing_setup_answer fields per
    // [[reference_ia_integration_pattern]]. The runner today accepts a SINGLE
    // answer per provider (yes = BYO into customer account, no = IA-managed +
    // ownership transfer); the wizard surfaces three Google sub-toggles
    // (GA4 / GSC / GBP) for transparency, but if ANY sub-toggle is "byo" we
    // treat the whole Google answer as "yes" so the runner kicks off the BYO
    // OAuth (which is a single grant covering all three Google products
    // anyway). When the runner gains per-sub-product paths, swap this for
    // a direct passthrough — the per-sub-product values are persisted to
    // saved_state today so the migration is data-only.
    const gp = integ?.google_provisioning || { ga4: "ia_managed", gsc: "ia_managed", gbp: "ia_managed" };
    const bp = integ?.bing_provisioning   || { bwt: "ia_managed" };
    const googleAnswer: "yes" | "no" = (gp.ga4 === "byo" || gp.gsc === "byo" || gp.gbp === "byo") ? "yes" : "no";
    const bingAnswer:   "yes" | "no" = bp.bwt === "byo" ? "yes" : "no";

    const businessProfile: Record<string, unknown> = {
      site_id: siteCtxRef.current.site_id,
      bearer_token: bearer,
      domain: v.domain.trim(),
      domain_path: v.domain_choice,
      google_setup_answer: googleAnswer,
      bing_setup_answer: bingAnswer,
      // Per-sub-product selections — surfaced for the future per-product
      // runner branch and for the post-onboarding ownership-transfer
      // bookkeeping. Today the runner ignores these (reads only the single
      // google_setup_answer), but persisting them on businessProfile means
      // we don't have to re-walk the wizard when the split lands.
      google_provisioning: gp,
      bing_provisioning: bp,
      contact_email: (profile.primary_contact_email || "").trim() || null,
      business_name: (profile.business_name || "").trim() || null,
      questionnaire: {
        businessName: profile.business_name || null,
        industry: v.industry,
        description: v.description,
        services: v.services.filter(Boolean),
        target_audience: v.target_audience,
        location: v.location,
        brand_voice: v.brand_voice,
        brand_voice_custom: v.brand_voice_custom,
        style_preference: v.style_preference,
        pages: v.pages,
        tagline: v.tagline,
        has_existing_website: v.has_existing_website,
        site_mode: v.siteMode,
        existing_wp_url: v.existing_wp_url,
        existing_wp_admin_handoff: v.existing_wp_admin_handoff,
      },
    };

    const runner = createRunner(
      {
        tenant_id: tenantId,
        product: "arion",
        cart_items: [{ product: "arion" }],
        business_profile: businessProfile,
        callbacks: {
          on_step_change: (rec) => {
            setRunnerRecords((prev) => {
              const idx = prev.findIndex((r) => r.step_id === rec.step_id);
              if (idx === -1) return [...prev, rec];
              const next = prev.slice();
              next[idx] = rec;
              return next;
            });
            if (rec.status === "running" || rec.status === "waiting" || rec.status === "verifying") {
              setRunnerCurrentStep(rec.step_id);
            }
            void persistStepStatus(bearer, tenantId, runner ? runner.snapshot()[0]?.evidence?.run_id as string | undefined : undefined, rec);
            if (rec.status === "failed_server_busy") {
              void notifyFounderStuck(bearer, tenantId, rec);
            }
          },
          on_run_complete: (records) => {
            const allDone = records.every((r) => r.status === "done" || r.status === "skipped");
            setRunnerComplete(allDone);
            setRunnerCurrentStep(null);
          },
        },
      },
      steps,
    );
    runnerRef.current = runner;
    setRunnerRecords(steps.map((s) => ({ step_id: s.id, status: "pending" as const, attempt_count: 0 })));

    // Fire-and-forget — the engine pushes status via on_step_change. We
    // do NOT await here because Save & Continue must advance to Step 5
    // immediately so the user sees the progress UI rendering live.
    void (async () => {
      try {
        await runner.start();
      } catch (e) {
        setRunnerError((e as Error).message || "Runner threw");
      }
    })();
  }

  function handleRetry(step_id: string) {
    void runnerRef.current?.retry(step_id);
  }
  function handleSkip(step_id: string) {
    runnerRef.current?.skip(step_id);
  }

  // Terminal-state predicate — drives whether Save & Continue is enabled on
  // Step 5. Allowed when every step is in a terminal status (done/skipped)
  // OR at least one step is in failed_server_busy (the user has been told
  // we are notified; they can bail out manually). Blocked while any step
  // is still pending/running/waiting/verifying/failed_retrying — the user
  // must use Save & Close to bail mid-run.
  const isAtTerminalState = (() => {
    if (!runnerStarted) return true; // nothing in flight — don't block
    if (runnerComplete) return true;
    if (runnerRecords.length === 0) return false; // started but no records yet
    const allTerminal = runnerRecords.every((r) => r.status === "done" || r.status === "skipped");
    if (allTerminal) return true;
    const anyServerBusy = runnerRecords.some((r) => r.status === "failed_server_busy");
    return anyServerBusy;
  })();

  return {
    setSiteContext,
    launchRunner,
    runnerStarted,
    runnerComplete,
    runnerError,
    runnerRecords,
    runnerCurrentStep,
    stepCaps: stepCapsRef.current,
    skipAllowedStepIds: skipAllowedRef.current,
    fallbackLabels: fallbackLabelsRef.current,
    handleRetry,
    handleSkip,
    isAtTerminalState,
  };
}

// ─── Modal shell ─────────────────────────────────────────────────────────

export interface OnboardingWizardModalProps {
  open: boolean;
  tenantId: string | null;
  tenantName?: string;
  mode: "onboarding" | "consulting";
  /** Products in the cart — drives which sections show. */
  cart?: ProductKey[];
  /**
   * Optional per-product tier from the cart (e.g. SPARK "lite" gates the
   * white-label "hide IA footer" toggle in step 7). When omitted the SPARK
   * section assumes Standard or higher so the toggle is enabled.
   */
  cartTier?: { spark?: string; oliver?: string; arion?: string };
  onClose: () => void;
  onFinished?: () => void;
}

export function OnboardingWizardModal({ open, tenantId, tenantName, mode, cart, cartTier, onClose, onFinished }: OnboardingWizardModalProps) {
  if (!open || !tenantId) return null;
  const ctx: ClientTenantValue = { tenantId, tenantName, mode };
  return (
    <ClientTenantProvider value={ctx}>
      {mode === "onboarding"
        ? <UnifiedOnboarding tenantId={tenantId} tenantName={tenantName} cart={cart} cartTier={cartTier} onClose={onClose} onFinished={onFinished} />
        : <ConsultingModeShell tenantId={tenantId} tenantName={tenantName} onClose={onClose} />}
    </ClientTenantProvider>
  );
}

// ─── Unified onboarding ──────────────────────────────────────────────────

function UnifiedOnboarding({ tenantId, tenantName, cart, cartTier, onClose, onFinished }: {
  tenantId: string; tenantName?: string; cart: ProductKey[] | undefined;
  cartTier?: { spark?: string; oliver?: string; arion?: string };
  onClose: () => void; onFinished?: () => void;
}) {
  // get/post/patch are CLIENT-scoped (header = client tenant_id) — used for
  // Stripe Connect, PATCH /settings (business profile), etc.
  // getFounder/postFounder are FOUNDER-scoped — used for /admin/onboard-client/*.
  const { get, post, patch, getFounder, postFounder } = useOliverApi();
  // SPARK (LUMEN) API — used by flushSectionToCanonical at the SPARK step to
  // POST senders/signatures + register the sender domain + write the
  // spark-onboarding settings bundle. The hook is tenant-scoped via the
  // ClientTenantProvider context so headers carry the client tenant_id.
  const sparkApi = useSparkApi();
  // Cart can come from props (explicit) OR be derived from the prefill payload
  // (core.tenants.signup_product → ["arion"|"spark"|"oliver"|"consulting"]
  // OR all four for multi). Default ["arion","spark","oliver"] is a final
  // fallback only when nothing is known — never the first choice. This is
  // what Brandon complained about: SPARK-only buyers seeing ARION/OLIVER.
  const [effectiveCart, setEffectiveCart] = useState<ProductKey[]>(cart && cart.length ? cart : ["arion","spark","oliver"]);
  const sections = useMemo(() => buildSections(effectiveCart), [effectiveCart]);
  const [stepIdx, setStepIdx] = useState(0);
  const [state, setState] = useState<OnboardingState>(EMPTY_STATE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // ARION runner — lifted from ArionSection so persist("continue") can
  // launch it on Save & Continue from Step 4, and ArionIntegrationsSection
  // can render its live progress on Step 5. See useArionRunner JSDoc.
  const arionRunner = useArionRunner(tenantId);

  const current = sections[stepIdx];
  const accent = accentFor(current);
  const isFirst = stepIdx === 0;
  const isLast = stepIdx === sections.length - 1;

  // Block Save & Continue when the user is in the integrations section AND
  // the ARION runner is mid-flight. Migrate path is exempt — it never
  // launches the runner. The user can still hit Save & Close to bail (the
  // runner keeps ticking in the background until the modal unmounts; we'll
  // wire resume-from-saved-state in a follow-up — for now Save & Close
  // pauses the wizard and the next opener picks up at the same step).
  const runnerBlocksAdvance =
    current.id === "arion_integrations" &&
    state.arion.domain_choice !== "migrate" &&
    arionRunner.runnerStarted &&
    !arionRunner.isAtTerminalState;

  // Hydrate from any saved progress
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    // FIX (2026-06-23) — getFounder calls oliverFetch which AUTO-UNWRAPS
    // the {data: ...} envelope at oliverApi.ts:89. The old code typed the
    // response as { data?: {...} } and then tried to read `.data` off it,
    // which discarded the entire prefill payload silently for every tenant.
    // Now type the response as the inner shape and read fields directly.
    getFounder<{ state?: Partial<OnboardingState>; prefill?: Partial<OnboardingState> & { cart?: ProductKey[] }; step?: number }>(`/admin/onboard-client/onboarding-progress?tenant_id=${encodeURIComponent(tenantId)}`)
      .then((data) => {
        if (cancelled) return;
        // Merge order: defaults → prefill (from existing tables) → saved state (wins).
        // Per Brandon's rule: don't make users re-enter data the system has.
        //
        // FIX (2026-06-23) — brand colors kept reverting to the EMPTY_STATE
        // defaults (#1A3A4A / #FEC82C / #1A7DB5) even when prefill had Brandon's
        // real values (#0C4A60 / #EF6C33 / #2D9CDB). Root cause: an older
        // saved_state row from before the prefill-load gate landed had the
        // EMPTY_STATE defaults written into it. Saved state wins over prefill
        // in the merge order, so the stale defaults clobbered the real colors
        // on every reload.
        //
        // Treat saved_state.profile color fields that EXACTLY match the
        // EMPTY_STATE defaults as "user never picked" — strip them before the
        // merge so prefill wins for those fields. Real picks (anything else)
        // still come through.
        const DEFAULT_PRIMARY = EMPTY_STATE.profile.primary_color;
        const DEFAULT_SECONDARY = EMPTY_STATE.profile.secondary_color;
        const DEFAULT_ACCENT = EMPTY_STATE.profile.accent_color;
        let cleanedSavedState = data?.state;
        if (cleanedSavedState?.profile) {
          const savedProfile = cleanedSavedState.profile as Partial<BusinessProfile>;
          // Build a new profile object excluding any color field that matches
          // the EMPTY_STATE default — those came from a stale pre-prefill save
          // and would otherwise clobber the real prefill colors.
          const { primary_color, secondary_color, accent_color, ...restProfile } = savedProfile;
          const nextProfile: Partial<BusinessProfile> = { ...restProfile };
          if (primary_color !== undefined && primary_color !== DEFAULT_PRIMARY) nextProfile.primary_color = primary_color;
          if (secondary_color !== undefined && secondary_color !== DEFAULT_SECONDARY) nextProfile.secondary_color = secondary_color;
          if (accent_color !== undefined && accent_color !== DEFAULT_ACCENT) nextProfile.accent_color = accent_color;
          // Cast: nextProfile is intentionally a Partial<BusinessProfile> after
          // we strip default-matching colors. mergeState → mergeStrict handles
          // missing keys correctly at runtime (treats them as "not provided"
          // and falls back to base/prefill).
          cleanedSavedState = { ...cleanedSavedState, profile: nextProfile as BusinessProfile };
        }
        setState((s) => {
          let merged = s;
          if (data?.prefill) merged = mergeState(merged, data.prefill);
          if (cleanedSavedState) merged = mergeState(merged, cleanedSavedState);
          return merged;
        });
        // Cart override from prefill — backend reads signup_product +
        // canonical-table presence and tells us which products are in scope.
        // Only override if caller didn't pass an explicit cart prop.
        if (!cart || !cart.length) {
          const prefillCart = data?.prefill?.cart;
          if (Array.isArray(prefillCart) && prefillCart.length) {
            setEffectiveCart(prefillCart.filter((p): p is ProductKey =>
              p === "arion" || p === "spark" || p === "oliver" || p === "consulting"));
          }
        }
        if (typeof data?.step === "number" && data.step >= 0 && data.step < sections.length) {
          setStepIdx(data.step);
        }
      })
      .catch(() => { /* fresh start ok */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, getFounder]);

  async function persist(mode: "continue" | "close" | "finish") {
    // Block Save & Continue past the integrations section while the runner
    // is still ticking. Save & Close + Save & Finish always work (Close
    // pauses the wizard, Finish kicks off the finish-onboarding fan-out).
    if (mode === "continue" && runnerBlocksAdvance) {
      setErr("ARION setup is still running — please wait, or use Save & Close to come back later.");
      return;
    }
    setSaving(true); setErr(null);
    try {
      // Per-section canonical-table writes (G1 confirmed: save then continue).
      // Best-effort — if a write fails, log + continue so Save & Continue
      // never blocks. The JSON-blob save below is the durable record.
      try { await flushSectionToCanonical(current.id, state, { patch, sparkApi }); }
      catch (e) { console.warn("[onboarding] canonical write failed for", current.id, e); }

      await postFounder("/admin/onboard-client/save-onboarding", {
        tenant_id: tenantId, step: stepIdx, section: current.id, state, mode,
      });
      if (mode === "finish") {
        await postFounder("/admin/onboard-client/finish-onboarding", { tenant_id: tenantId });
        onFinished?.();
        onClose();
      } else if (mode === "close") {
        onClose();
      } else {
        // Auto-launch the ARION runner when leaving Step 4 (ArionSection)
        // for Step 5 (ArionIntegrationsSection). No separate blue button —
        // Save & Continue IS the trigger per Brandon 2026-06-23.
        //
        // Migrate path is the only one that doesn't launch — migration is
        // consulting-only and the integrations section detects it and
        // shows the handoff copy instead of the runner.
        if (
          current.id === "arion" &&
          state.arion.domain_choice &&
          state.arion.domain_choice !== "migrate" &&
          !arionRunner.runnerStarted
        ) {
          // Fire-and-forget — the runner reports progress through the
          // controller's state so the next-section render picks it up.
          void arionRunner.launchRunner({ arion: state.arion, profile: state.profile, arion_integrations: state.arion_integrations });
        }
        setStepIdx((i) => Math.min(i + 1, sections.length - 1));
      }
    } catch (e) {
      setErr((e as Error).message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <IadmModal
      open
      onClose={onClose}
      product={(current.product === "arion" || current.product === "spark") ? current.product : "oliver"}
      eyebrow={`Client Onboarding · ${tenantName || tenantId}`}
      title={current.title}
      subtitle={`Step ${stepIdx + 1} of ${sections.length}${current.required ? " · required" : " · optional — skip anytime"}`}
      size="report"
      footer={
        // 2026-06-20 — also disable on `loading`. Clicking Save before
        // prefill finished was flushing EMPTY_STATE to PATCH /settings
        // and wiping the tenant's business profile. Gating on both saving
        // AND loading closes the race; the omit-empty payload in
        // flushSectionToCanonical and the empty-string guard in
        // settings.js are the deeper fixes.
        <div className="flex justify-between w-full gap-2">
          {!isFirst ? (
            <button onClick={() => setStepIdx((i) => Math.max(i - 1, 0))} disabled={saving || loading}
              className="px-4 py-2 rounded-lg border border-gray-300 text-slate-700 font-semibold text-sm disabled:opacity-50">
              ← Back
            </button>
          ) : <span />}
          <div className="flex gap-2">
            <button onClick={() => persist("close")} disabled={saving || loading}
              className="px-4 py-2 rounded-lg border border-gray-300 text-slate-700 font-semibold text-sm disabled:opacity-50"
              title={loading ? "Loading existing data — please wait" : undefined}>
              Save & Close
            </button>
            {isLast ? (
              <button onClick={() => persist("finish")} disabled={saving || loading}
                className="px-4 py-2 rounded-lg text-white font-semibold text-sm disabled:opacity-50"
                style={{ background: "#0F766E" }}
                title={loading ? "Loading existing data — please wait" : undefined}>
                {loading ? "Loading…" : saving ? "Finishing…" : "Save & Finish (send welcome) →"}
              </button>
            ) : (
              <button onClick={() => persist("continue")} disabled={saving || loading || runnerBlocksAdvance}
                className="px-4 py-2 rounded-lg text-white font-semibold text-sm disabled:opacity-50"
                style={{ background: accent }}
                title={
                  loading ? "Loading existing data — please wait"
                  : runnerBlocksAdvance ? "ARION setup is still running — please wait, or use Save & Close to come back later"
                  : undefined
                }>
                {loading ? "Loading…"
                 : saving ? "Saving…"
                 : runnerBlocksAdvance ? "ARION setup running…"
                 : "Save & Continue →"}
              </button>
            )}
          </div>
        </div>
      }
    >
      <div className="px-6 py-5">
        <StepStrip current={stepIdx} sections={sections} accent={accent} />
        {err && <div className="mb-3 px-3 py-2 rounded-lg bg-rose-50 border border-rose-200 text-sm text-rose-700">{err}</div>}
        {loading ? (
          <div className="text-sm text-slate-500">Loading saved progress…</div>
        ) : (
          <SectionBody section={current} state={state} setState={setState} api={{ get, post }} accent={accent} tenantId={tenantId} arionRunner={arionRunner} cartTier={cartTier} />
        )}
        <HelpFooter />
      </div>
    </IadmModal>
  );
}

// ─── Step indicator ──────────────────────────────────────────────────────

function StepStrip({ current, sections, accent }: { current: number; sections: Section[]; accent: string }) {
  return (
    <div className="mb-4">
      <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
        <div className="h-full transition-all" style={{ background: accent, width: `${((current + 1) / sections.length) * 100}%` }} />
      </div>
      <div className="mt-2 flex flex-wrap gap-1 text-[10px] text-slate-500">
        {sections.map((s, i) => (
          <span key={s.id} className={`px-1.5 py-0.5 rounded ${i === current ? "font-bold" : ""}`}
            style={i === current ? { color: accent } : {}}>
            {i + 1}. {s.title}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Section dispatcher ──────────────────────────────────────────────────

function SectionBody({ section, state, setState, api, accent, tenantId, arionRunner, cartTier }: {
  section: Section;
  state: OnboardingState;
  setState: (s: OnboardingState | ((prev: OnboardingState) => OnboardingState)) => void;
  api: { get: <T>(p: string) => Promise<T>; post: <T>(p: string, b?: unknown) => Promise<T> };
  accent: string;
  tenantId: string;
  arionRunner: ArionRunnerController;
  cartTier?: { spark?: string; oliver?: string; arion?: string };
}) {
  switch (section.id) {
    case "profile":                return <ProfileSection profile={state.profile} setProfile={(p) => setState((s) => ({ ...s, profile: p }))} api={api} />;
    case "owner":                  return <OwnerSection owner={state.owner} setOwner={(o) => setState((s) => ({ ...s, owner: o }))} />;
    case "lifecycle":              return <LifecycleSection v={state.lifecycle} setV={(v) => setState((s) => ({ ...s, lifecycle: v }))} />;
    case "arion":                  return <ArionSection v={state.arion} setV={(v) => setState((s) => ({ ...s, arion: v }))} tenantId={tenantId} profile={state.profile} arionRunner={arionRunner} integ={state.arion_integrations} setInteg={(integ) => setState((s) => ({ ...s, arion_integrations: integ }))} brandIntake={state.brand_intake} setBrandIntake={(b) => setState((s) => ({ ...s, brand_intake: b }))} />;
    // arion_integrations renders the live runner progress (or the migrate
    // handoff panel) at the top, then the connect-account rows once the
    // runner finishes and arion.site exists in the DB.
    case "arion_integrations":     return <ArionIntegrationsSection v={state.arion_integrations} setV={(v) => setState((s) => ({ ...s, arion_integrations: v }))} tenantId={tenantId} arion={state.arion} arionRunner={arionRunner} />;
    case "spark":                  return <SparkSection v={state.spark} setV={(v) => setState((s) => ({ ...s, spark: v }))} profile={state.profile} owner={state.owner} sparkTier={cartTier?.spark} />;
    case "spark_welcome_email":    return <SparkWelcomeEmailSection v={state.spark_welcome_email} setV={(v) => setState((s) => ({ ...s, spark_welcome_email: v }))} profile={state.profile} owner={state.owner} spark={state.spark} />;
    case "oliver_payments":        return <OliverPaymentsSection v={state.oliver} setV={(v) => setState((s) => ({ ...s, oliver: v }))} accent={accent} api={api} />;
    case "oliver_templates":       return <OliverTemplatesSection profile={state.profile} />;
    case "oliver_customer_portal": return <OliverPortalSection title="Customer portal" v={state.oliver.customer_portal} setV={(p) => setState((s) => ({ ...s, oliver: { ...s.oliver, customer_portal: p } }))} fallback={state.profile} />;
    case "oliver_employee_portal": return <OliverPortalSection title="Employee portal" v={state.oliver.employee_portal} setV={(p) => setState((s) => ({ ...s, oliver: { ...s.oliver, employee_portal: p } }))} fallback={state.profile} variant="employee" />;
    case "oliver_catalog":         return <OliverCatalogSection items={state.oliver.catalog} setItems={(it) => setState((s) => ({ ...s, oliver: { ...s.oliver, catalog: it } }))} />;
    case "consulting":             return <ConsultingSection v={state.consulting} setV={(v) => setState((s) => ({ ...s, consulting: v }))} />;
    case "finish":                 return <FinishSection state={state} />;
  }
}

// ─── Section: Business profile ───────────────────────────────────────────

function ProfileSection({ profile, setProfile, api }: { profile: BusinessProfile; setProfile: (p: BusinessProfile) => void; api: { get: <T>(p: string) => Promise<T>; post: <T>(p: string, b?: unknown) => Promise<T> } }) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">Shared across every product. Logo + colors land on invoices, portals, ARION WP build, SPARK templates.</p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Business name" value={profile.business_name} onChange={(v) => setProfile({ ...profile, business_name: v })} />
        <Field label="Primary contact email" type="email" value={profile.primary_contact_email} onChange={(v) => setProfile({ ...profile, primary_contact_email: v })} />
      </div>
      <Field label="Street address" value={profile.address_street} onChange={(v) => setProfile({ ...profile, address_street: v })} />
      <Field label="Suite / unit" value={profile.address_line2} onChange={(v) => setProfile({ ...profile, address_line2: v })} placeholder="optional" />
      <div className="grid grid-cols-3 gap-3">
        <Field label="City" value={profile.address_city} onChange={(v) => setProfile({ ...profile, address_city: v })} />
        <Field label="State" value={profile.address_state} onChange={(v) => setProfile({ ...profile, address_state: v })} placeholder="IA, AZ, CA…" />
        <Field label="ZIP" value={profile.address_zip} onChange={(v) => setProfile({ ...profile, address_zip: v })} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <PhoneField label="Phone" value={profile.phone} onChange={(v) => setProfile({ ...profile, phone: v })} />
        <Field label="Website" value={profile.website} onChange={(v) => setProfile({ ...profile, website: v })} placeholder="https://…" />
      </div>
      <Field label="Industry" value={profile.industry} onChange={(v) => setProfile({ ...profile, industry: v })} placeholder="e.g. Roofing, Restaurant, Roller skating rink"
        tip="Drives ARION starter template + AI brand voice. Be specific." />
      <div>
        <label className="block text-xs font-semibold text-slate-700 mb-1">Logo</label>
        <LogoPicker value={profile.logo_url || null} onChange={(url) => setProfile({ ...profile, logo_url: url || "" })} api={api} website={profile.website || undefined} />
      </div>
      <div>
        <label className="block text-xs font-semibold text-slate-700">Brand colors</label>
        <p className="text-[10px] text-slate-500">Primary = headers/CTAs · Secondary = sub-headers · Accent = links</p>
        <div className="mt-2 space-y-2">
          {([
            ["Primary", "primary_color", "#1A3A4A"],
            ["Secondary", "secondary_color", "#FEC82C"],
            ["Accent", "accent_color", "#1A7DB5"],
          ] as Array<[string, "primary_color" | "secondary_color" | "accent_color", string]>).map(([label, key, fb]) => (
            <div key={key} className="flex items-center gap-3">
              <span className="w-20 text-xs text-slate-700">{label}</span>
              <input type="color" value={profile[key] || fb}
                onChange={(e) => setProfile({ ...profile, [key]: e.target.value })}
                className="h-9 w-12 cursor-pointer rounded border border-gray-300" />
              <input type="text" value={profile[key] || ""}
                onChange={(e) => setProfile({ ...profile, [key]: e.target.value })}
                className="w-32 rounded-lg border border-gray-300 px-3 py-2 text-xs font-mono"
                placeholder={fb} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Section: Owner account ──────────────────────────────────────────────

// ─── Section: Sales workflow (Customer Lifecycle) ────────────────────────
//
// 4 sub-blocks in one scrollable section (per the unified-modal pattern):
//   1. Pick a preset (Simple / Moderate / Detailed)
//   2. Auto-transitions explainer (read-only; past-customer days slider)
//   3. Configurable transitions (qualify trigger + OLIVER customer trigger
//      + negotiation trigger for Detailed)
//   4. Confirm flow visualization
//
// White-label rule: the tenant never sees "Stripe." Every customer-create
// is framed as "become an OLIVER customer."
function LifecycleSection({ v, setV }: { v: OnboardingState["lifecycle"]; setV: (v: OnboardingState["lifecycle"]) => void }) {
  const isModerate = v.preset === "moderate";
  const isDetailed = v.preset === "detailed";
  const promotionLabel = isModerate || isDetailed ? "Qualified Prospect" : "Prospect";

  function Pick({ id, title, summary, stages }: { id: "simple" | "moderate" | "detailed"; title: string; summary: string; stages: string }) {
    const active = v.preset === id;
    return (
      <button
        type="button"
        onClick={() => setV({ ...v, preset: id, negotiation_trigger: id === "detailed" ? (v.negotiation_trigger || "manual") : null })}
        className={`w-full text-left rounded-lg border-2 p-3 transition ${active ? "border-slate-900 bg-slate-50" : "border-slate-200 hover:border-slate-400"}`}
      >
        <div className="flex items-start gap-2">
          <span className={`mt-1 inline-block h-3 w-3 rounded-full border-2 ${active ? "bg-slate-900 border-slate-900" : "border-slate-400"}`} />
          <div className="flex-1">
            <div className="font-semibold text-sm">{title}</div>
            <div className="text-xs text-slate-600 mt-0.5">{stages}</div>
            <div className="text-xs text-slate-500 mt-1">{summary}</div>
          </div>
        </div>
      </button>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-slate-700 space-y-1">
        <div className="font-semibold text-slate-800">What this controls</div>
        <p>
          Every contact you collect (form fills, manual adds, CSV imports, leads) flows through these stages.
          Your choice here drives <b>which SPARK lists they land in</b>, <b>when they auto-flow into OLIVER for billing</b>,
          and <b>which lifecycle-aware campaigns fire</b> (welcome, nurture, win-back). You can change any of this later
          in Settings → CRM → Lifecycle.
        </p>
      </div>

      {/* Sub-block 1: pick a preset */}
      <div className="space-y-2">
        <div className="text-sm font-semibold text-slate-700">1. Pick the flow that matches your business</div>
        <Pick
          id="simple"
          title="Simple — 5 stages (recommended for most)"
          stages="Lead → Prospect → Active Customer → Past Customer → Repeat Customer"
          summary="Best for: solo operators, service businesses, anyone without a formal sales process."
        />
        <Pick
          id="moderate"
          title="Moderate — 6 stages"
          stages="Lead → Engaged → Qualified → Active → Past → Repeat"
          summary="Best for: B2B with a sales cycle; separates warm leads from qualified prospects."
        />
        <Pick
          id="detailed"
          title="Detailed — 8 stages"
          stages="Lead → Engaged → Qualified → Proposal → Negotiation → Active → Past → Repeat"
          summary="Best for: agencies, consultants, high-touch B2B with formal proposal/negotiation phases."
        />
      </div>

      {/* Sub-block 2: auto transitions explainer */}
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
        <div className="text-sm font-semibold text-slate-700">2. These happen automatically — no action needed</div>
        <ul className="text-xs text-slate-700 space-y-1.5 list-none pl-0">
          <li>✓ Anyone who fills a form, gets imported, or you add manually starts as a <b>Lead</b>.</li>
          {(isModerate || isDetailed) && (
            <li>✓ When they reply, book a meeting, or open 2+ emails they become an <b>Engaged Prospect</b>.</li>
          )}
          {isDetailed && (
            <li>✓ When you send them a quote or invoice they become <b>Proposal Sent</b>.</li>
          )}
          <li>✓ When they pay for the first time they become an <b>Active Customer</b>.</li>
          <li>
            ✓ When they cancel everything AND go quiet for{" "}
            <b>{v.past_customer_days} days</b> they move to <b>Past Customer</b>.
            <div className="mt-1 flex items-center gap-2">
              <input
                type="range"
                min={30}
                max={365}
                step={1}
                value={v.past_customer_days}
                onChange={(e) => setV({ ...v, past_customer_days: Number(e.target.value) })}
                className="flex-1"
              />
              <span className="text-xs text-slate-500 w-20 text-right">{v.past_customer_days} days</span>
            </div>
          </li>
          <li>✓ If a Past Customer pays again, they automatically become a <b>Repeat Customer</b>.</li>
        </ul>
      </div>

      {/* Sub-block 3: configurable transitions */}
      <div className="space-y-3">
        <div className="text-sm font-semibold text-slate-700">3. When YOU decide a Lead is ready</div>
        <div className="space-y-1.5">
          {[
            { id: "manual",                label: "I'll click \"Qualify\" myself", sub: "Recommended. You stay in control — review every lead before promoting them to a sales opportunity. Best for low-volume / high-touch businesses." },
            { id: "on_quote_or_meeting",   label: "Auto-qualify when they request a quote or book a meeting", sub: "Action signals intent. Anyone who books a call or asks for pricing gets auto-promoted. Best for service businesses with quote/booking forms." },
            { id: "every_lead",            label: "Every Lead is automatically a Prospect", sub: "Treat every inbound contact as a sales opportunity. Best for high-volume B2C or e-commerce where you don't need to qualify." },
          ].map((opt) => (
            <label key={opt.id} className="flex items-start gap-2 text-sm">
              <input
                type="radio"
                name="qualify_trigger"
                checked={v.qualify_trigger === opt.id}
                onChange={() => setV({ ...v, qualify_trigger: opt.id as OnboardingState["lifecycle"]["qualify_trigger"] })}
                className="mt-1"
              />
              <div className="flex-1">
                <div>{opt.label}</div>
                <div className="text-xs text-slate-500 mt-0.5">{opt.sub}</div>
              </div>
            </label>
          ))}
        </div>

        <div className="text-sm font-semibold text-slate-700 pt-2">When should they be added as an OLIVER customer?</div>
        <div className="space-y-1.5">
          {[
            { id: "on_prospect", label: `When they become a ${promotionLabel}  (recommended — keeps your customer list clean, ready to send proposals and invoices)` },
            { id: "eager",       label: "Right away when they're a Lead  (every contact is also an OLIVER customer)" },
            { id: "manual",      label: "Only when I click \"Add to OLIVER\"" },
          ].map((opt) => (
            <label key={opt.id} className="flex items-start gap-2 text-sm">
              <input
                type="radio"
                name="oliver_create_trigger"
                checked={v.oliver_create_trigger === opt.id}
                onChange={() => setV({ ...v, oliver_create_trigger: opt.id as OnboardingState["lifecycle"]["oliver_create_trigger"] })}
                className="mt-1"
              />
              <span>{opt.label}</span>
            </label>
          ))}
        </div>
        <p className="text-xs text-slate-500">
          Why this matters: Contacts live in SPARK from day one for lead nurture. They only appear in OLIVER (where you send proposals, invoices, and schedule jobs) once they're ready to be billed.
        </p>

        {isDetailed && (
          <>
            <div className="text-sm font-semibold text-slate-700 pt-2">When does a Proposal move to Negotiation?</div>
            <div className="space-y-1.5">
              {[
                { id: "manual",           label: "I'll move it manually  (recommended)" },
                { id: "on_counter_reply", label: "Auto when they reply to the proposal with changes  (Coming soon)" },
              ].map((opt) => (
                <label key={opt.id} className="flex items-start gap-2 text-sm">
                  <input
                    type="radio"
                    name="negotiation_trigger"
                    checked={(v.negotiation_trigger || "manual") === opt.id}
                    onChange={() => setV({ ...v, negotiation_trigger: opt.id as OnboardingState["lifecycle"]["negotiation_trigger"] })}
                    className="mt-1"
                    disabled={opt.id === "on_counter_reply"}
                  />
                  <span className={opt.id === "on_counter_reply" ? "text-slate-400" : ""}>{opt.label}</span>
                </label>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Sub-block 4: confirm flow */}
      <div className="rounded-lg border-2 border-slate-300 bg-white p-3 space-y-2">
        <div className="text-sm font-semibold text-slate-700">4. Your flow at a glance</div>
        <div className="font-mono text-xs text-slate-700 whitespace-pre-line leading-5">
{`Lead ──(${v.qualify_trigger === "manual" ? "you qualify manually" : v.qualify_trigger === "on_quote_or_meeting" ? "quote/meeting triggers it" : "every Lead auto-qualifies"})──→ ${promotionLabel}${v.oliver_create_trigger === "on_prospect" ? " [now in OLIVER]" : ""}
     ──(auto on first payment)──→ Active Customer
     ──(subs cancelled + ${v.past_customer_days}d)──→ Past Customer
     ──(auto on next payment)──→ Repeat Customer`}
        </div>
        <label className="flex items-center gap-2 text-xs text-slate-600">
          <input type="checkbox" checked={v.confirmed} onChange={(e) => setV({ ...v, confirmed: e.target.checked })} />
          Looks good — apply this flow
        </label>
      </div>
    </div>
  );
}

function OwnerSection({ owner, setOwner }: { owner: OwnerAccount; setOwner: (o: OwnerAccount) => void }) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">Goes to CIAM directory. The owner gets the welcome email at finish.</p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="First name" value={owner.first_name} onChange={(v) => setOwner({ ...owner, first_name: v })} />
        <Field label="Last name" value={owner.last_name} onChange={(v) => setOwner({ ...owner, last_name: v })} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Display name" value={owner.display_name} onChange={(v) => setOwner({ ...owner, display_name: v })} hint="How they're addressed" />
        <Field label="Title / role" value={owner.title} onChange={(v) => setOwner({ ...owner, title: v })} placeholder="Owner, Founder, GM…" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <PhoneField label="Mobile phone" value={owner.mobile} onChange={(v) => setOwner({ ...owner, mobile: v })} />
        <Field label="Time zone" value={owner.time_zone} onChange={(v) => setOwner({ ...owner, time_zone: v })} hint="Drives scheduled-send times" />
      </div>
      <Field label="Billing email" type="email" value={owner.billing_email} onChange={(v) => setOwner({ ...owner, billing_email: v })} hint="Leave blank to reuse the primary contact email" />
      <div className="space-y-1">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={owner.notif_email} onChange={(e) => setOwner({ ...owner, notif_email: e.target.checked })} /> Email notifications</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={owner.notif_sms} onChange={(e) => setOwner({ ...owner, notif_sms: e.target.checked })} /> SMS notifications</label>
      </div>
    </div>
  );
}

// ─── Section: ARION ──────────────────────────────────────────────────────

const ARION_INDUSTRY_OPTIONS: { value: string; label: string }[] = [
  { value: "service_business", label: "Service business (plumber, electrician, HVAC, cleaner, contractor)" },
  { value: "consulting", label: "Consulting / professional services" },
  { value: "healthcare", label: "Healthcare / wellness (dental, chiro, gym, therapy)" },
  { value: "restaurant", label: "Restaurant / food" },
  { value: "tech_saas", label: "Tech / SaaS / software" },
  { value: "retail", label: "Retail / online shop" },
  { value: "real_estate", label: "Real estate" },
  { value: "creative", label: "Creative / agency / portfolio" },
  { value: "other", label: "Other" },
];
// 2026-06-21 — 12-voice catalog with descriptions + 2-sentence examples.
// Used as multi-select (max 3) across ARION + SPARK onboarding sections.
// Powers My Brand voice profile (Q4) when that ships — same shape.
export const BRAND_VOICE_CATALOG: { key: string; description: string; example: string }[] = [
  { key: "Professional", description: "Polished, credible, business-formal. Trust signals dominate.",
    example: "Our team delivers measured solutions backed by ten years of industry results. Every engagement begins with a thorough discovery to define success." },
  { key: "Friendly", description: "Warm and approachable. Reads like a neighbor.",
    example: "Hey there! We're so glad you're here — let's figure out the right fit for what you need. No pressure, just real help." },
  { key: "Knowledgeable", description: "Expert-led and educational. Teaches as it sells.",
    example: "Three factors typically drive the cost difference here: material grade, install complexity, and warranty duration. We'll walk you through each before quoting." },
  { key: "Bold", description: "Confident and direct. Doesn't hedge.",
    example: "Stop guessing. We fix it right the first time, or you don't pay. That's it." },
  { key: "Premium", description: "Refined, exclusive, quality-forward. Luxury-adjacent.",
    example: "Discerning clients trust our atelier for bespoke results that endure. Every detail is considered; nothing is rushed." },
  { key: "Casual", description: "Conversational and informal. Reads like a text message.",
    example: "We get it — life's busy. Tell us what's broken and we'll come fix it. Easy." },
  { key: "Playful", description: "Witty and fun. Doesn't take itself too seriously.",
    example: "Plumbing emergencies always happen at 2 AM on a holiday weekend. Lucky for you, we drink a lot of coffee." },
  { key: "Authoritative", description: "Commanding and decisive. The expert in the room.",
    example: "This is what works, and here's why. Forty years of practice has taught us exactly which approaches save you money and which cost you in the long run." },
  { key: "Warm", description: "Caring and empathetic. Feelings first, then facts.",
    example: "Going through a renovation can be overwhelming — we know. Our promise is that you'll never feel left in the dark, and we'll treat your home like our own." },
  { key: "Witty", description: "Clever wordplay and humor. Smart without being snarky.",
    example: "We've been called the 'WD-40 of accounting' — applies to anything that's squeaking. Numbers, tax forms, that quarterly meeting you've been dreading." },
  { key: "Direct", description: "Plain-spoken and efficient. No fluff, no jargon.",
    example: "Quote in 24 hours. Work starts within a week. Done in three. Pay when satisfied." },
  { key: "Inspirational", description: "Aspirational and visionary. Frames product as part of a bigger story.",
    example: "Your business deserves to be seen. We help small operations punch above their weight by giving you the tools the big guys take for granted." },
];

const ARION_VOICE_OPTIONS = BRAND_VOICE_CATALOG.map(v => v.key);
const ARION_STYLE_OPTIONS = ["Modern", "Classic", "Minimal", "Bold"] as const;
const ARION_PAGE_OPTIONS = ["Home", "About", "Services", "Contact", "Blog", "Shop", "Portfolio", "FAQ"];

/* ──────────────────────────────────────────────────────────────────────
 * Server-side mirror — persist every OnboardingRunner StepRecord into
 * core.onboarding_step_status via the founder oliver-api endpoint. Best
 * effort: a failed POST never blocks the engine. Run id is the same UUID
 * the engine generates so the SQL row is stable across browser refresh.
 * ────────────────────────────────────────────────────────────────────── */
const OLIVER_API_BASE_URL = (import.meta.env.VITE_OLIVER_API_BASE_URL as string)
  || "https://app-oliver-api-prod.azurewebsites.net";

async function persistStepStatus(
  bearer: string,
  tenant_id: string,
  run_id: string | undefined,
  rec: StepRecord,
): Promise<void> {
  if (!bearer || !run_id) return;
  try {
    await fetch(`${OLIVER_API_BASE_URL}/admin/onboarding-runner/upsert-step`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${bearer}`,
        "x-tenant-key": tenant_id,
      },
      body: JSON.stringify({
        tenant_id,
        run_id,
        step_id: rec.step_id,
        status: rec.status,
        attempt_count: rec.attempt_count,
        started_at: rec.started_at,
        completed_at: rec.completed_at,
        error: rec.error,
        evidence: rec.evidence,
      }),
    });
  } catch {
    /* never block the engine on a status mirror failure */
  }
}

async function notifyFounderStuck(bearer: string, tenant_id: string, rec: StepRecord): Promise<void> {
  if (!bearer) return;
  try {
    await fetch(`${OLIVER_API_BASE_URL}/admin/onboarding-runner/notify-stuck`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${bearer}`,
        "x-tenant-key": tenant_id,
      },
      body: JSON.stringify({
        tenant_id,
        step_id: rec.step_id,
        attempt_count: rec.attempt_count,
        error: rec.error || null,
      }),
    });
  } catch {
    /* notification is fire-and-forget */
  }
}

function ArionSection({ v, setV, tenantId, profile, arionRunner, integ, setInteg, brandIntake, setBrandIntake }: { v: OnboardingState["arion"]; setV: (v: OnboardingState["arion"]) => void; tenantId: string; profile: OnboardingState["profile"]; arionRunner: ArionRunnerController; integ: OnboardingState["arion_integrations"]; setInteg: (v: OnboardingState["arion_integrations"]) => void; brandIntake: BrandIntake; setBrandIntake: (b: BrandIntake) => void; }) {
  // 2026-06-21 — skip-if-provisioned. Brandon hit this himself:
  // ARION onboarding shouldn't re-prompt for site setup if arion.site already
  // has a row for this tenant. Probe on mount; if found, render a compact
  // "Already provisioned" panel with an Edit affordance instead of the full
  // questionnaire.
  //
  // FIX (2026-06-23) — the previous `fetch('/api/v1/arion/sites?...')` call
  // was a RELATIVE URL. The Static Web App's staticwebapp.config.json has no
  // rewrite for /api/v1/arion/*, so the request silently fell through to the
  // SPA index.html and returned HTML — not JSON. `res.json()` threw, the
  // catch swallowed it, and the "already provisioned" check never fired.
  // arion.site is at a DIFFERENT Azure App Service (ARION_API_BASE_URL).
  // Switch to the full URL + bearer-token pattern this file already uses
  // for arionConnectGoogle / arionCreateSeoProject.
  const [existingSite, setExistingSite] = useState<{ site_id: string; domain: string | null; seoAddonTier: string | null } | null>(null);
  const [siteCheckLoading, setSiteCheckLoading] = useState(true);
  const [forceEdit, setForceEdit] = useState(false);
  const { getToken: getArionToken } = useAccessToken();

  // 2026-06-23 — runner state lives in the parent's useArionRunner hook now,
  // so persist("continue") on Save & Continue can launch it. We just read
  // status off the controller to show the inline progress panel when the
  // user navigates back to this step mid-run.
  const { runnerStarted, runnerComplete, runnerError, runnerRecords, runnerCurrentStep,
    stepCaps, skipAllowedStepIds, fallbackLabels, handleRetry, handleSkip,
    setSiteContext } = arionRunner;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await getArionToken();
        const res = await fetch(`${ARION_API_BASE_URL}/api/v1/arion/sites?tenant_id=${encodeURIComponent(tenantId)}&primary=1`, {
          headers: { Authorization: `Bearer ${token.accessToken}` },
        });
        const j = await res.json().catch(() => null);
        const site = j?.data?.[0];
        if (!cancelled && site?.site_id) {
          setExistingSite({
            site_id: site.site_id,
            domain: site.domain || site.primary_domain || null,
            seoAddonTier: site.seoAddonTier || site.seo_addon_tier || null,
          });
        }
      } catch { /* fall through to questionnaire */ }
      finally { if (!cancelled) setSiteCheckLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [tenantId, getArionToken]);

  // Resolve has_seo_addon — Path A: existing arion.site row already has
  // a seoAddonTier. Path B: tenant just bought; the catalog tier sits on
  // the saved onboarding state where the wizard captured it. Default to
  // true when an existing site has the column populated.
  const hasSeoAddon = !!(existingSite?.seoAddonTier);

  // Push site context up to the runner controller so launchRunner — which
  // is invoked from the parent's persist() handler — has the latest
  // site_id + has_seo_addon when it builds the step list.
  useEffect(() => {
    setSiteContext({ site_id: existingSite?.site_id || null, has_seo_addon: hasSeoAddon });
  }, [existingSite?.site_id, hasSeoAddon, setSiteContext]);

  const toggleService = (i: number, val: string) => {
    const next = [...v.services]; next[i] = val; setV({ ...v, services: next });
  };
  const togglePage = (page: string) => {
    const next = v.pages.includes(page) ? v.pages.filter((p) => p !== page) : [...v.pages, page];
    setV({ ...v, pages: next });
  };

  // Show "already provisioned" panel unless user clicks Edit.
  if (!siteCheckLoading && existingSite && !forceEdit) {
    return (
      <div className="space-y-3">
        <div className="rounded-lg border-2 border-emerald-200 bg-emerald-50 p-4">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 mt-0.5 shrink-0" />
            <div className="flex-1">
              <div className="text-sm font-semibold text-emerald-900">ARION site already provisioned</div>
              <div className="text-xs text-emerald-800 mt-1">
                {existingSite.domain ? <>Site for <code className="font-mono">{existingSite.domain}</code> is set up.</> : "A site is set up for this tenant."}
                {" "}Skip the questionnaire and head straight to integrations — Google Business Profile, Search Console, Bing, SE Ranking.
              </div>
              <button
                type="button"
                onClick={() => setForceEdit(true)}
                className="mt-2 text-xs font-semibold text-emerald-900 underline hover:text-emerald-700"
              >
                Edit ARION configuration anyway →
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {existingSite && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <b>Heads up:</b> An ARION site is already provisioned for this tenant. Editing here won't re-provision —
          it just updates the brand voice + content seeds used by future AI generation.
          <button type="button" onClick={() => setForceEdit(false)} className="ml-2 underline font-semibold">Back to provisioned view</button>
        </div>
      )}
      <p className="text-xs text-slate-500">First, tell us whether you're starting from scratch or already have a WordPress site. That choice drives the rest of the flow.</p>

      {/* ── siteMode branch — Brandon's locked structure 2026-06-24 ──
            The FIRST decision in the ARION flow is "new site" vs "existing
            site". Two large clickable cards make it impossible to miss.
              • new      → full questionnaire so AI Website Builder has context
              • existing → skip questionnaire, ask for WP URL + admin handoff
            Toggling between modes preserves entered data — we never blank
            out v.industry / v.brand_voice / v.existing_wp_url etc. so the
            user can flip back without losing work. */}
      <div>
        <label className="block text-xs font-semibold text-slate-700 mb-2">What are we starting from?</label>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setV({ ...v, siteMode: "new" })}
            className={`p-5 rounded-xl border-2 text-left transition ${v.siteMode === "new" ? "border-sky-500 bg-sky-50 ring-2 ring-sky-200" : "border-slate-200 bg-white hover:border-slate-300"}`}
          >
            <div className="flex items-start gap-3">
              <Building2 className={`h-6 w-6 mt-0.5 shrink-0 ${v.siteMode === "new" ? "text-sky-700" : "text-slate-400"}`} />
              <div>
                <div className="text-sm font-bold text-slate-900">I need a new site built</div>
                <div className="text-xs text-slate-600 mt-1 leading-snug">
                  Spin up a brand-new WordPress site. We'll ask a few questions about your business so the AI Website Builder
                  can generate your homepage copy, page structure, and brand voice. Then pick a domain (buy one, use a free
                  subdomain, or bring your own).
                </div>
              </div>
            </div>
          </button>
          <button
            type="button"
            onClick={() => setV({ ...v, siteMode: "existing" })}
            className={`p-5 rounded-xl border-2 text-left transition ${v.siteMode === "existing" ? "border-emerald-500 bg-emerald-50 ring-2 ring-emerald-200" : "border-slate-200 bg-white hover:border-slate-300"}`}
          >
            <div className="flex items-start gap-3">
              <CheckCircle2 className={`h-6 w-6 mt-0.5 shrink-0 ${v.siteMode === "existing" ? "text-emerald-700" : "text-slate-400"}`} />
              <div>
                <div className="text-sm font-bold text-slate-900">I have an existing site</div>
                <div className="text-xs text-slate-600 mt-1 leading-snug">
                  You already have a working WordPress site. We'll skip the questionnaire and just install the IA Plugin so
                  you get analytics, AI insights, and integrations. Give us the URL + admin access and we'll handle the rest.
                </div>
              </div>
            </div>
          </button>
        </div>
        {!v.siteMode && (
          <div className="mt-2 text-[11px] text-slate-500 italic">Pick one to continue.</div>
        )}
      </div>

      {/* ── EXISTING SITE BRANCH ──
            Skip questionnaire. Ask for WordPress URL + admin handoff method.
            Under the hood this maps to the plugin-install-only runner branch:
              • domain_choice = 'byo' (or 'hostinger_existing' if user picks)
              • has_existing_website = true   ← runner reads this and skips
                                                template-import + AI copy gen
            See buildArionSteps() in lib/onboardingRunner/arionSteps.ts for the
            matrix. */}
      {v.siteMode === "existing" && (
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-2">Where is your site hosted?</label>
            <div className="grid grid-cols-2 gap-2">
              {([
                ["byo",                "Anywhere (we'll install the plugin via your admin login)", "Your site lives on any host — we connect through wp-admin."],
                ["hostinger_existing", "On Hostinger (we auto-install via Hostinger API)",         "Your site is on your Hostinger account — we connect directly, no DNS hop."],
              ] as const).map(([id, label, desc]) => (
                <button key={id} type="button"
                  onClick={() => setV({ ...v, domain_choice: id, has_existing_website: true })}
                  className={`p-3 rounded-lg border-2 text-left text-xs ${v.domain_choice === id ? "border-emerald-500 bg-emerald-50" : "border-slate-200 bg-white"}`}>
                  <div className="font-semibold">{label}</div>
                  <div className="text-[10px] text-slate-500 mt-1 leading-tight">{desc}</div>
                </button>
              ))}
            </div>
            {v.domain_choice === "hostinger_existing" && (
              <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                <b>Note:</b> the back-end auto-connect via Hostinger API is queued for build (#246).
                For now this routes through the same plugin-install path as <code>byo</code>.
              </div>
            )}
          </div>

          <Field
            label="WordPress site URL"
            value={v.existing_wp_url}
            onChange={(u) => setV({ ...v, existing_wp_url: u, domain: u })}
            placeholder="https://your-site.com"
            hint="The URL you use to log in at /wp-admin"
          />

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-2">How will you give us admin access?</label>
            <div className="grid grid-cols-2 gap-2">
              {([
                ["create_admin_invite", "Send IA Plugin install link",        "We'll email you a one-click install URL — you stay logged in, no credentials shared."],
                ["share_credentials",   "Share a temporary admin user",       "Create a temp wp-admin user named 'ia-installer' and we'll handle the install."],
              ] as const).map(([id, label, desc]) => (
                <button key={id} type="button"
                  onClick={() => setV({ ...v, existing_wp_admin_handoff: id })}
                  className={`p-3 rounded-lg border-2 text-left text-xs ${v.existing_wp_admin_handoff === id ? "border-emerald-500 bg-emerald-50" : "border-slate-200 bg-white"}`}>
                  <div className="font-semibold">{label}</div>
                  <div className="text-[10px] text-slate-500 mt-1 leading-tight">{desc}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
            <b>Skipping the questionnaire.</b> Since you already have content, we won't ask about industry, brand voice, or pages —
            those only feed the AI Website Builder. You can edit your brand profile any time from Settings.
          </div>
        </div>
      )}

      {/* ── NEW SITE BRANCH ──
            Full domain picker + questionnaire. Same UI as before, just gated
            behind siteMode === 'new'. */}
      {v.siteMode === "new" && (
      <>
      {/* Domain — 5 options per Brandon 2026-06-23 ask:
            byo               = you already own a domain elsewhere, point DNS at us
            hostinger_existing= you already own a domain on Hostinger (we connect via API, no DNS hop)
            migrate           = you have an existing WordPress site to migrate IN to ARION
            purchase          = buy a brand-new domain through our Hostinger pipeline
            subdomain         = use a free *.ia-dm.com subdomain to get started fast */}
      <div>
        <label className="block text-xs font-semibold text-slate-700 mb-2">Domain</label>
        <div className="grid grid-cols-3 gap-2">
          {([
            ["byo",                "Use an existing domain (DNS hop)",                "Already own a domain anywhere — we'll give you DNS records."],
            ["hostinger_existing", "Connect a domain on my Hostinger",                "We'll auto-connect a domain already on your Hostinger account."],
            ["migrate",            "Migrate an existing WordPress site",              "Move a live WP site INTO ARION — we'll copy content + redirect."],
            ["purchase",           "Buy a new domain",                                "We'll register a new domain via Hostinger as part of provisioning."],
            ["subdomain",          "Use a free *.ia-dm.com subdomain",                "Get started fast — no registrar, no DNS, no waiting."],
          ] as const).map(([id, label, desc]) => (
            <button key={id} type="button" onClick={() => setV({ ...v, domain_choice: id, has_existing_website: false })}
              className={`p-3 rounded-lg border-2 text-left text-xs ${v.domain_choice === id ? "border-sky-500 bg-sky-50" : "border-slate-200 bg-white"}`}>
              <div className="font-semibold">{label}</div>
              <div className="text-[10px] text-slate-500 mt-1 leading-tight">{desc}</div>
            </button>
          ))}
        </div>
        {v.domain_choice && (
          <div className="mt-2">
            <Field label={v.domain_choice === "subdomain" ? "Subdomain prefix" : "Domain"}
              value={v.domain} onChange={(d) => setV({ ...v, domain: d })}
              placeholder={v.domain_choice === "subdomain" ? "rollinginit (becomes rollinginit.ia-dm.com)" : "example.com"} />
            {v.domain_choice === "hostinger_existing" && (
              <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                <b>Note:</b> the back-end auto-connect via Hostinger API is queued for build (#246).
                For now this routes through the same provisioning as <code>byo</code> but flagged so we surface the right post-setup instructions.
              </div>
            )}
            {v.domain_choice === "migrate" && (
              <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                <b>Note:</b> automated WP migration tooling is queued for build. Selecting this flags the tenant for a guided manual migration —
                IA Consulting will reach out within 1 business day to schedule the cutover.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Industry */}
      <div>
        <label className="block text-xs font-semibold text-slate-700 mb-1">Industry</label>
        <select value={v.industry} onChange={(e) => setV({ ...v, industry: e.target.value })}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white">
          <option value="">Select an industry…</option>
          {ARION_INDUSTRY_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <div className="text-[10px] text-slate-500 mt-1">Drives WP starter template + keyword seeds.</div>
      </div>

      {/* Description */}
      <div>
        <label className="block text-xs font-semibold text-slate-700 mb-1">What does your business do? <span className="text-slate-400">(20+ chars feeds the AI copy generator)</span></label>
        <textarea value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })}
          rows={3} placeholder="Family-owned roller skating rink in Marshalltown, IA. We host private parties, public skate sessions, league nights, and birthdays for kids 5-15."
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
      </div>

      {/* Top 3 services */}
      <div>
        <label className="block text-xs font-semibold text-slate-700 mb-1">Top 3 services / offerings</label>
        <div className="space-y-1.5">
          {v.services.map((s, i) => (
            <input key={i} value={s} onChange={(e) => toggleService(i, e.target.value)}
              placeholder={`Service ${i + 1}`}
              className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm" />
          ))}
        </div>
      </div>

      <Field label="Target audience" value={v.target_audience} onChange={(a) => setV({ ...v, target_audience: a })}
        placeholder="Families with kids 5-15 within 30 miles, birthday parties, corporate events" />
      <Field label="Primary location / service area" value={v.location} onChange={(l) => setV({ ...v, location: l })}
        placeholder="Marshalltown, IA + surrounding 30 mi" />

      <BrandVoicePicker
        selected={v.brand_voice}
        custom={v.brand_voice_custom}
        onSelectedChange={(arr) => setV({ ...v, brand_voice: arr })}
        onCustomChange={(s) => setV({ ...v, brand_voice_custom: s })}
      />

      {/* Style preference */}
      <div>
        <label className="block text-xs font-semibold text-slate-700 mb-1">Style preference</label>
        <div className="flex flex-wrap gap-1.5">
          {ARION_STYLE_OPTIONS.map((st) => (
            <button key={st} type="button"
              onClick={() => setV({ ...v, style_preference: st })}
              className={`px-3 py-1.5 rounded text-xs font-semibold border ${v.style_preference === st ? "border-sky-500 bg-sky-50 text-sky-900" : "border-slate-300 bg-white text-slate-700"}`}>
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* Pages */}
      <div>
        <label className="block text-xs font-semibold text-slate-700 mb-1">Pages you want</label>
        <div className="flex flex-wrap gap-1.5">
          {ARION_PAGE_OPTIONS.map((p) => (
            <button key={p} type="button" onClick={() => togglePage(p)}
              className={`px-3 py-1 rounded-full text-xs border ${v.pages.includes(p) ? "border-sky-500 bg-sky-50 text-sky-900 font-semibold" : "border-slate-300 bg-white text-slate-700"}`}>
              {p}
            </button>
          ))}
        </div>
      </div>

      <Field label="Tagline (optional)" value={v.tagline} onChange={(t) => setV({ ...v, tagline: t })}
        placeholder="Where Marshalltown rolls together since 1998" hint="Goes in the hero, used by the AI copy generator" />

      {/* ── Simplified Brand Intake ──
            2026-06-25 — Pulled directly from the Rolling-In-It intake form.
            12-15 fields covering sliders / tones-to-avoid / differentiators
            / visual direction / photography / admired brands / positioning.
            Persists to lumen.brand_voice_profile alongside the BrandVoicePicker
            tags so the AI Website Builder + STELLA + SPARK campaign writer
            all read from one canonical source. */}
      <div className="rounded-lg border-2 border-sky-100 bg-white p-4">
        <div className="text-sm font-bold text-slate-900 mb-1">Brand direction</div>
        <div className="text-xs text-slate-500 mb-3">
          These shape every piece of AI-generated copy. Optional but strongly recommended for Build-Your-Brand engagements.
        </div>
        <BrandIntakeStep
          value={brandIntake}
          onChange={setBrandIntake}
          intro=""
          accentColor="#0284c7"
        />
      </div>
      </>
      )}

      {/* Brand intake is ALSO shown in the existing-site branch — they still
          need a voice/positioning profile for SPARK + OLIVER even though we
          aren't generating WP copy. Renders ONLY after they've picked a
          handoff method so the form doesn't open with twenty fields. */}
      {v.siteMode === "existing" && v.existing_wp_admin_handoff && (
        <div className="rounded-lg border-2 border-sky-100 bg-white p-4">
          <div className="text-sm font-bold text-slate-900 mb-1">Brand direction</div>
          <div className="text-xs text-slate-500 mb-3">
            We won't generate new website copy (you already have content), but SPARK email + future AI features still need a voice profile.
          </div>
          <BrandIntakeStep
            value={brandIntake}
            onChange={setBrandIntake}
            intro=""
            accentColor="#0284c7"
          />
        </div>
      )}

      {/* ── ARION setup preview panel ─────────────────────────────────
            2026-06-23 — the runner now auto-launches when the user clicks
            Save & Continue in the wizard footer (no separate blue button).
            This panel just previews what's about to happen so the user
            knows what Save & Continue will trigger.

            If the user navigated BACK to Step 4 mid-run, we render the
            live OnboardingRunnerProgress here too — the runner state
            lives in the parent's useArionRunner hook, so it survives
            section navigation.

            Runner step list depends on:
              • v.domain_choice  (5 paths — purchase / subdomain / byo /
                                  hostinger_existing / migrate)
              • hasSeoAddon      (derived from existing site row OR cart)
            See lib/onboardingRunner/arionSteps.ts for the full matrix.

            Gated behind v.siteMode so it doesn't appear until the user has
            made the first decision — otherwise the empty "Pick a domain
            option above first" copy renders before the user has even seen
            the two siteMode cards. */}
      {v.siteMode && (
      <div className="mt-4 rounded-lg border-2 border-sky-200 bg-sky-50 p-4">
        <div className="flex items-start gap-3">
          <Building2 className="h-5 w-5 text-sky-700 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-sky-900">
              {runnerStarted ? "ARION setup in progress" : "What happens next"}
            </div>
            <div className="text-xs text-sky-800 mt-1">
              {v.domain_choice === "migrate" && (
                <>Save &amp; Continue will flag your tenant for a guided migration — IA Consulting reaches out within 1 business day. No automated provisioning runs for migrations.</>
              )}
              {(v.domain_choice === "byo" || v.domain_choice === "hostinger_existing") && (
                <>Save &amp; Continue will install the IA Plugin on your existing WordPress site, set up your account, and connect Google + Bing. You'll see the live progress on the next step.</>
              )}
              {(v.domain_choice === "purchase" || v.domain_choice === "subdomain") && (
                <>Save &amp; Continue will spin up your WordPress site, install tools, build your homepage with AI{hasSeoAddon ? ", configure SEO" : ""}, and connect Google + Bing. You'll see the live progress on the next step.</>
              )}
              {!v.domain_choice && <>Pick a domain option above first. Save &amp; Continue will then walk through setup live on the next step.</>}
            </div>

            {runnerError && (
              <div className="mt-2 text-xs text-rose-700">Runner error: {runnerError}</div>
            )}

            {/* Live progress, shown if the user navigated back to Step 4
                while the runner is still ticking. The primary home for
                this UI is Step 5 (ArionIntegrationsSection). */}
            {runnerStarted && runnerRecords.length > 0 && (
              <div className="mt-4">
                <OnboardingRunnerProgress
                  steps={runnerRecords}
                  current_step_id={runnerCurrentStep}
                  max_retries_by_step={stepCaps}
                  skip_allowed_step_ids={skipAllowedStepIds}
                  fallback_labels_by_step={fallbackLabels}
                  onRetry={handleRetry}
                  onSkip={handleSkip}
                />
                {runnerComplete && (
                  <div className="mt-3 rounded-md bg-emerald-100 border border-emerald-300 px-3 py-2 text-xs text-emerald-900">
                    All ARION setup steps done. Click Save &amp; Continue below to move to the next section.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      )}

      {/* ── SEO Tools (always on) ─────────────────────────────────────
            Per Brandon's lock 2026-06-24 — every ARION site ships with
            the always-on SEO tools that surface inline across the
            dashboard. This is informational + a conditional upsell;
            customers do NOT get to opt out. Whether they bought an
            ARION SEO add-on is the only branch:
              • hasSeoAddon = true  → green confirmation pill with tier
              • hasSeoAddon = false → upsell banner + inline tier picker
            Gated behind v.siteMode so it doesn't render before the user
            has made the first new-vs-existing decision (same pattern
            the setup preview panel above uses). */}
      {v.siteMode && (
        <ArionSeoToolsSubsection hasSeoAddon={hasSeoAddon} seoAddonTier={existingSite?.seoAddonTier || null} />
      )}

      {/* ── Google + Bing dual-path picker ────────────────────────────
            Per Brandon's Day-1 lock + [[reference_ia_integration_pattern]]:
            EVERY integration must offer BOTH paths visibly — bring your own
            OR let us set it up. Treating BYO as "advanced/hidden" is what
            cost months of delays. The runner consumes the selections via
            launchRunner() → businessProfile.google_setup_answer +
            bing_setup_answer (see lib/onboardingRunner/arionSteps.ts steps
            arion_google_oauth + arion_bing_oauth). Mounted here in Step 4
            so the customer makes the choice BEFORE Save & Continue auto-
            launches the runner. Gated on v.siteMode so it doesn't appear
            before the first new-vs-existing decision. */}
      {v.siteMode && (
        <ArionIntegrationsPathPickerSubsection integ={integ} setInteg={setInteg} />
      )}
    </div>
  );
}

// ─── ArionSection · SEO Tools subsection ─────────────────────────────────
//
// Always-on SEO tools live inline in the dashboard — Brand Consistency,
// Featured Snippets, SEO Content Score, Internal Linking, Cannibalization
// Detection, Alt-Text Helper. We tell the customer this so they don't think
// nothing's happening and we surface an upsell when they didn't buy an SEO
// add-on at checkout.
//
// Catalog source: fetchArionSeoAddons() — never hardcode prices, per
// feedback_no_fabricated_catalog. The catalog endpoint sits on arion-api
// and returns Essentials/Growth/Authority with their pricing envelopes.
function ArionSeoToolsSubsection({ hasSeoAddon, seoAddonTier }: {
  hasSeoAddon: boolean;
  seoAddonTier: string | null;
}) {
  const [showPicker, setShowPicker] = useState(false);
  const [addons, setAddons] = useState<Record<string, ArionSeoAddonEntry> | null>(null);
  const [addonsLoading, setAddonsLoading] = useState(false);
  const [addonsError, setAddonsError] = useState<string | null>(null);

  // Tier feature blurbs for the green confirmation pill — kept short so the
  // pill stays one line on most screens. Tier names come from the canonical
  // ARION SEO tier matrix (Essentials / Growth / Authority).
  const tierBlurb: Record<string, string> = {
    essentials: "keyword tracking, on-page audits, competitor watch",
    growth:     "+ Google AI Mode, deeper keyword sets, more audits",
    authority:  "+ ChatGPT + Gemini AI search, full keyword set, unlimited audits",
  };

  const tierName: Record<string, string> = {
    essentials: "Essentials",
    growth:     "Growth",
    authority:  "Authority",
  };

  function loadAddons() {
    if (addons || addonsLoading) return;
    setAddonsLoading(true);
    setAddonsError(null);
    fetchArionSeoAddons()
      .then((map) => setAddons(map))
      .catch((e: Error) => setAddonsError(e.message || "Failed to load SEO add-on catalog"))
      .finally(() => setAddonsLoading(false));
  }

  function openPicker() {
    setShowPicker(true);
    loadAddons();
  }

  const tierKey = (seoAddonTier || "").toLowerCase();
  const activeTierName = tierName[tierKey] || (seoAddonTier ? seoAddonTier : "Active");
  const activeBlurb = tierBlurb[tierKey] || "your SEO tools are active";

  return (
    <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-amber-500 shrink-0" />
        <div className="text-sm font-semibold text-slate-900">SEO Tools (always on)</div>
      </div>
      <p className="text-xs text-slate-600 mt-1.5 leading-snug">
        Every ARION site ships with always-on SEO tools that surface inside your dashboard wherever they're useful —
        no separate tab, no setup required. You get <b>Brand Consistency</b>, <b>Featured Snippets</b>,
        <b> SEO Content Score</b>, <b>Internal Linking</b>, <b>Cannibalization Detection</b>, and the <b>Alt-Text Helper</b>
        baked into the pages where they apply.
      </p>

      {/* Confirmation pill — customer already has an SEO add-on */}
      {hasSeoAddon && (
        <div className="mt-3 inline-flex items-start gap-2 rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1.5">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 mt-0.5 shrink-0" />
          <div className="text-[11px] leading-snug text-emerald-900">
            <span className="font-semibold">ARION SEO {activeTierName} active</span>
            <span className="text-emerald-800"> — your tools include {activeBlurb}.</span>
          </div>
        </div>
      )}

      {/* Upsell banner — customer did NOT buy an SEO add-on */}
      {!hasSeoAddon && (
        <div className="mt-3 rounded-lg border-2 border-sky-200 bg-gradient-to-br from-sky-50 to-white p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-100">
              <TrendingUp className="h-5 w-5 text-sky-700" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold text-slate-900">Get the most out of your website and SEO</div>
              <div className="text-xs text-slate-600 mt-1 leading-snug">
                Add an ARION SEO add-on to unlock keyword tracking, competitor analysis, technical SEO audits,
                and AI-powered SEO insights from SE Ranking — all integrated into ARION.
              </div>
              {!showPicker && (
                <button
                  type="button"
                  onClick={openPicker}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold px-3 py-2"
                >
                  <Search className="h-3.5 w-3.5" />
                  Add ARION SEO
                </button>
              )}
            </div>
          </div>

          {/* Inline tier picker — opens on CTA click. Pulls live pricing from
              fetchArionSeoAddons() so prices stay in sync with Stripe.
              Customer can pick a tier to flag intent; the actual add-on
              attaches at checkout (or via consulting follow-up) since this
              wizard runs after the initial purchase. */}
          {showPicker && (
            <div className="mt-4 pt-3 border-t border-sky-200">
              {addonsLoading && (
                <div className="text-xs text-slate-500">Loading SEO add-on catalog…</div>
              )}
              {addonsError && (
                <div className="text-xs text-rose-700">Couldn't load pricing: {addonsError}</div>
              )}
              {addons && Object.keys(addons).length === 0 && (
                <div className="text-xs text-amber-700">
                  SEO add-on catalog is empty — check arion-api <code>/onboarding/checkout/catalog?product=arion</code>.
                </div>
              )}
              {addons && Object.keys(addons).length > 0 && (
                <>
                  <div className="text-[11px] font-semibold text-slate-700 mb-2">Pick the tier that fits your goals:</div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {(["essentials", "growth", "authority"] as const).map((key) => {
                      const t = addons[key];
                      if (!t) return null;
                      const monthly = t.pricing.monthly_usd;
                      return (
                        <a
                          key={key}
                          href="/pricing?product=arion#seo"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block p-3 rounded-lg border-2 border-slate-200 bg-white hover:border-sky-500 hover:shadow-sm transition text-left"
                        >
                          <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{t.name || tierName[key]}</div>
                          <div className="text-sm font-bold text-slate-900 mt-0.5">
                            {monthly != null ? `$${monthly}` : "—"}
                            <span className="text-[10px] font-normal text-slate-500">/mo</span>
                          </div>
                          <div className="text-[10px] text-slate-600 mt-1 leading-tight">{tierBlurb[key]}</div>
                          <div className="text-[10px] text-sky-700 font-semibold mt-2">Add at checkout →</div>
                        </a>
                      );
                    })}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-2 italic">
                    Tier cards open the public pricing page in a new tab so you can attach the add-on to your account.
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── ArionSection · Dual-path integrations picker ────────────────────────
//
// Per Brandon's Day-1 lock + [[reference_ia_integration_pattern]]: every
// integration MUST surface BOTH paths visibly to the client.
//   • Bring your own — customer already has the account; OAuth (Google) or
//     paste-key (Bing Webmaster) into their existing account.
//   • Let us set it up — we provision under the IA master account and
//     transfer ownership to the customer after onboarding.
//
// The runner reads the chosen path from businessProfile.google_setup_answer +
// bing_setup_answer (set in launchRunner above) and branches into the
// matching arion_google_oauth / arion_bing_oauth step in arionSteps.ts.
//
// IA-master availability:
//   • GOOGLE-MASTER-SERVICE-ACCOUNT-JSON — NOT in KV today (verified
//     2026-06-23). The "Let us set it up" Google path falls back to the
//     master-managed-but-not-transferred branch; ownership transfer is
//     scheduled for 2026-07 once the secret lands. Footnote surfaces this.
//   • BING-WMT-API-KEY — present in kv-IADM-prod (verified 2026-06-23). The
//     "Let us set it up" Bing path works fully today, including ownership
//     invite via lib/iaMasterBing.inviteBingSiteUser().
function ArionIntegrationsPathPickerSubsection({ integ, setInteg }: {
  integ: OnboardingState["arion_integrations"];
  setInteg: (v: OnboardingState["arion_integrations"]) => void;
}) {
  type GooglePid = "ga4" | "gsc" | "gbp";
  type Path = "byo" | "ia_managed";

  function setGoogle(pid: GooglePid, path: Path) {
    setInteg({
      ...integ,
      google_provisioning: { ...integ.google_provisioning, [pid]: path },
    });
  }
  function setBing(path: Path) {
    setInteg({
      ...integ,
      bing_provisioning: { ...integ.bing_provisioning, bwt: path },
    });
  }

  // BYO note copy reused across all four cards — same Google warning shows
  // on the OAuth consent screen because the app isn't yet verified by
  // Google. Standard onboarding-day surface for an early platform.
  const googleByoNote = (
    <div className="mt-2 rounded-md bg-amber-50 border border-amber-200 px-2.5 py-1.5 text-[10px] text-amber-900 leading-snug">
      <b>Heads up:</b> You may see a Google warning that this app isn't verified — that's
      normal for new platforms. Click <b>Advanced</b> → <b>Continue</b> to grant access.
    </div>
  );
  // Until GOOGLE-MASTER-SERVICE-ACCOUNT-JSON lands in KV, the Google "Let us
  // set it up" path runs in the master-managed-but-not-transferred mode.
  // The runner still does the right thing (site is provisioned under IA);
  // we just can't auto-transfer ownership yet.
  const googleManagedFootnote = (
    <div className="mt-2 text-[10px] text-slate-500 italic leading-snug">
      (Currently managed under our master account; ownership transfer scheduled for 2026-07.)
    </div>
  );
  // BWT is fully wired — no footnote needed.
  const bingManagedReady = (
    <div className="mt-2 inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700">
      <CheckCircle2 className="h-3 w-3" />
      Fully automated — your site is added to Bing under our master account, then ownership transfers to your Microsoft account email.
    </div>
  );

  // ── Card renderer — shared shape so all 4 cards look identical ───────
  // Two large buttons side-by-side; selected button gets a sky/emerald
  // accent ring + bg; the matching info panel renders below the buttons.
  function PathCard({
    icon,
    title,
    desc,
    byoCopy,
    managedCopy,
    selected,
    onByo,
    onManaged,
    byoExtra,
    managedExtra,
  }: {
    icon: ReactNode;
    title: string;
    desc: string;
    byoCopy: string;
    managedCopy: string;
    selected: Path;
    onByo: () => void;
    onManaged: () => void;
    byoExtra?: ReactNode;
    managedExtra?: ReactNode;
  }) {
    return (
      <div className="rounded-lg border-2 border-slate-200 bg-white p-3">
        <div className="flex items-start gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-slate-100">
            {icon}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-bold text-slate-900">{title}</div>
            <div className="text-xs text-slate-600 mt-0.5 leading-snug">{desc}</div>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onByo}
            className={`text-left rounded-md border-2 p-2 transition ${selected === "byo" ? "border-sky-500 bg-sky-50 ring-1 ring-sky-200" : "border-slate-200 bg-white hover:border-slate-300"}`}
          >
            <div className="text-[11px] font-bold text-slate-900">Bring your own</div>
            <div className="text-[10px] text-slate-600 mt-0.5 leading-tight">{byoCopy}</div>
          </button>
          <button
            type="button"
            onClick={onManaged}
            className={`text-left rounded-md border-2 p-2 transition ${selected === "ia_managed" ? "border-emerald-500 bg-emerald-50 ring-1 ring-emerald-200" : "border-slate-200 bg-white hover:border-slate-300"}`}
          >
            <div className="text-[11px] font-bold text-slate-900">Let us set it up</div>
            <div className="text-[10px] text-slate-600 mt-0.5 leading-tight">{managedCopy}</div>
          </button>
        </div>
        {selected === "byo" && byoExtra}
        {selected === "ia_managed" && managedExtra}
      </div>
    );
  }

  const gp = integ.google_provisioning;
  const bp = integ.bing_provisioning;

  return (
    <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-center gap-2">
        <Globe className="h-4 w-4 text-sky-600 shrink-0" />
        <div className="text-sm font-semibold text-slate-900">Google &amp; Bing — pick your path for each</div>
      </div>
      <p className="text-xs text-slate-600 mt-1.5 leading-snug">
        ARION pulls insights from Google Analytics, Search Console, Business Profile, and Bing Webmaster Tools.
        For each one: <b>bring your own</b> account if you already have it, or <b>let us set it up</b> for you and
        transfer ownership to you after onboarding. You can change your mind later from <code>ARION → Integrations</code>.
      </p>

      <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* GA4 */}
        <PathCard
          icon={<BarChart3 className="h-4 w-4 text-sky-700" />}
          title="Google Analytics (GA4)"
          desc="GA4 tracks who visits your website and what they do — sessions, conversions, traffic sources, all the visitor behavior data."
          byoCopy="I already have GA4 — link my account."
          managedCopy="Create GA4 for me under our master account."
          selected={gp.ga4}
          onByo={() => setGoogle("ga4", "byo")}
          onManaged={() => setGoogle("ga4", "ia_managed")}
          byoExtra={googleByoNote}
          managedExtra={googleManagedFootnote}
        />
        {/* GSC */}
        <PathCard
          icon={<Search className="h-4 w-4 text-sky-700" />}
          title="Google Search Console (GSC)"
          desc="GSC shows what people search for to find your site — keywords, click-through rates, impressions, indexing health."
          byoCopy="I already have GSC — link my account."
          managedCopy="Create GSC for me under our master account."
          selected={gp.gsc}
          onByo={() => setGoogle("gsc", "byo")}
          onManaged={() => setGoogle("gsc", "ia_managed")}
          byoExtra={googleByoNote}
          managedExtra={googleManagedFootnote}
        />
        {/* GBP */}
        <PathCard
          icon={<MapPin className="h-4 w-4 text-sky-700" />}
          title="Google Business Profile (GBP)"
          desc="GBP is your Google Maps + local search listing — hours, photos, reviews, the panel that shows up when someone Googles your business name."
          byoCopy="I already have GBP — link my account."
          managedCopy="Create GBP for me under our master account."
          selected={gp.gbp}
          onByo={() => setGoogle("gbp", "byo")}
          onManaged={() => setGoogle("gbp", "ia_managed")}
          byoExtra={googleByoNote}
          managedExtra={googleManagedFootnote}
        />
        {/* BWT — Bing Webmaster Tools */}
        <PathCard
          icon={<UserCheck className="h-4 w-4 text-sky-700" />}
          title="Bing Webmaster Tools (BWT)"
          desc="BWT shows how your site performs on Bing — search queries, indexed pages, crawl health. Bing also powers ChatGPT search results."
          byoCopy="I already have BWT — link my account."
          managedCopy="Add my site to BWT under our master account."
          selected={bp.bwt}
          onByo={() => setBing("byo")}
          onManaged={() => setBing("ia_managed")}
          byoExtra={
            <div className="mt-2 rounded-md bg-amber-50 border border-amber-200 px-2.5 py-1.5 text-[10px] text-amber-900 leading-snug">
              <b>Heads up:</b> You may see a Microsoft warning that this app isn't verified — that's
              normal for new platforms. Click <b>Advanced</b> → <b>Continue</b> to grant access.
            </div>
          }
          managedExtra={bingManagedReady}
        />
      </div>

      <div className="mt-3 text-[10px] text-slate-500 leading-snug">
        Tip: If you're not sure whether you have one of these, pick <b>Let us set it up</b> — we'll provision and
        transfer ownership to your primary email after onboarding. You can always switch later.
      </div>
    </div>
  );
}

// ─── Section: ARION · Integrations ───────────────────────────────────────
//
// Connect Google Business Profile, Google Search Console, Google Ads, Bing
// Webmaster Tools, Apple Business Connect, and create the SE Ranking project.
// Each is a button that opens a connect flow (OAuth or in-app form). State
// reflects what's already linked so we don't re-prompt for things that are
// done.
//
// API: GET /api/v1/arion/sites?primary=1 → site_id, then
//      GET /api/v1/portal/arion/sites/:site_id/linked-business-profiles for status,
//      POST /api/v1/portal/arion/sites/:site_id/connect-google to start OAuth.
// We use raw fetch for now so we don't have to add to the modal's api shape.
function ArionIntegrationsSection({ v, setV, tenantId, arion, arionRunner }: {
  v: OnboardingState["arion_integrations"];
  setV: (v: OnboardingState["arion_integrations"]) => void;
  tenantId: string;
  arion: OnboardingState["arion"];
  arionRunner: ArionRunnerController;
}) {
  const [siteId, setSiteId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const { getToken } = useAccessToken();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // FIX (2026-06-23) — same bug as ArionSection: /api/v1/arion/* is
        // NOT proxied by the Portal SWA, so the relative URL fell through to
        // index.html and returned SPA HTML. siteId stayed null and the
        // section rendered the "No ARION site detected yet" amber error
        // even though arion.site has a row. Switch to the full URL + bearer.
        const token = await getToken();
        const auth = { headers: { Authorization: `Bearer ${token.accessToken}` } };
        const res = await fetch(`${ARION_API_BASE_URL}/api/v1/arion/sites?tenant_id=${encodeURIComponent(tenantId)}&primary=1`, auth);
        const j = await res.json().catch(() => null);
        const id = j?.data?.[0]?.site_id || j?.data?.[0]?.id || null;
        if (!cancelled) setSiteId(id);
        if (id) {
          const statusRes = await fetch(`${ARION_API_BASE_URL}/api/v1/arion/sites/${id}/integrations-status`, auth);
          const status = await statusRes.json().catch(() => null);
          if (!cancelled && status?.data) {
            setV({
              ...v,
              gbp_connected: !!status.data.gbp_connected,
              gsc_connected: !!status.data.gsc_connected,
              google_ads_linked: !!status.data.google_ads_linked,
              bing_connected: !!status.data.bing_connected,
              apple_claimed: !!status.data.apple_claimed,
              se_ranking_project_created: !!status.data.se_ranking_project_created,
            });
          }
        }
      } catch { /* fresh */ }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  async function startGoogleOAuth() {
    if (!siteId) return;
    setWorking("google");
    try {
      const returnUrl = window.location.href;
      const token = await getToken();
      const j = await arionConnectGoogle({
        baseUrl: ARION_API_BASE_URL,
        bearerToken: token.accessToken,
        tenantId,
        siteId,
        setupMode: "ARION_AUTO_SETUP",
        returnUrl,
      });
      const url = j?.authUrl;
      if (url) window.location.href = url;
    } catch { /* swallow — preserves old behavior */ }
    finally { setWorking(null); }
  }

  async function createSeProject() {
    if (!siteId) return;
    setWorking("seranking");
    try {
      const token = await getToken();
      await arionCreateSeoProject({
        baseUrl: ARION_API_BASE_URL,
        bearerToken: token.accessToken,
        tenantId,
        siteId,
        body: {},
      });
      setV({ ...v, se_ranking_project_created: true });
    } catch { /* swallow — preserves old behavior */ }
    finally { setWorking(null); }
  }

  // 2026-06-25 — Apple Business Connect has no OAuth/API. The old behavior
  // opened `/app/arion/integrations?connect=apple&site_id=...` which was a
  // dead URL (no handler existed there). Now: if not claimed, open the
  // Apple Business Connect signup in a new tab AND let the founder click
  // "Mark as Claimed" here once the tenant finishes. The button flips the
  // local UI immediately so the founder sees the green badge.
  async function markAppleClaimedFromModal() {
    if (!siteId) return;
    if (v.apple_claimed) {
      // Already claimed — open Apple's portal to re-verify / re-manage.
      window.open("https://register.apple.com/business", "_blank", "noopener");
      return;
    }
    // Open Apple's signup first so the founder can walk the tenant through
    // it, THEN record the claim in our DB.
    window.open("https://register.apple.com/business", "_blank", "noopener");
    if (!window.confirm("Open register.apple.com/business now. Click OK once the listing is claimed there to record it in the Portal.")) {
      return;
    }
    setWorking("apple");
    try {
      const token = await getToken();
      await arionMarkAppleClaimed({
        baseUrl: ARION_API_BASE_URL,
        bearerToken: token.accessToken,
        tenantId,
        siteId,
        claimed: true,
      });
      setV({ ...v, apple_claimed: true });
    } catch { /* swallow — preserves old behavior */ }
    finally { setWorking(null); }
  }

  const Row = ({ label, desc, connected, onClick, busyKey, cta }: { label: string; desc: string; connected: boolean; onClick?: () => void; busyKey?: string; cta?: string }) => (
    <div className="flex items-center justify-between gap-3 border border-slate-200 rounded-lg p-3">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-slate-900 flex items-center gap-2">
          {label}
          {connected && <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5"><CheckCircle2 className="h-3 w-3" /> Connected</span>}
        </div>
        <div className="text-xs text-slate-600 mt-0.5">{desc}</div>
      </div>
      {onClick && (
        <button
          type="button"
          onClick={onClick}
          disabled={working === busyKey}
          className="text-xs px-3 py-1.5 rounded-md border border-slate-300 bg-white hover:border-slate-500 disabled:opacity-50 whitespace-nowrap"
        >
          {working === busyKey ? "Working…" : (connected ? "Re-connect" : (cta || "Connect"))}
        </button>
      )}
    </div>
  );

  if (loading) return <div className="text-sm text-slate-500">Loading integration status…</div>;

  // ── Migrate path — consulting-only handoff. Per Brandon lock 2026-06-23,
  // migration does NOT auto-provision; we flag the tenant and IA Consulting
  // takes the cutover. Skip the runner UI and the connect rows entirely.
  if (arion.domain_choice === "migrate") {
    return (
      <div className="space-y-3">
        <div className="rounded-lg border-2 border-indigo-200 bg-indigo-50 p-4">
          <div className="text-sm font-semibold text-indigo-900">Migration queued for our consulting team</div>
          <div className="text-xs text-indigo-800 mt-1">
            Your tenant has been flagged for a guided WordPress migration. IA Consulting reaches out within 1 business day to schedule the cutover — no automated provisioning runs for migrations.
          </div>
          <div className="text-xs text-indigo-800 mt-2">
            You can keep moving through onboarding — integrations will connect after your site is migrated and live in our system.
          </div>
        </div>
      </div>
    );
  }

  // ── Runner in flight — show the live OnboardingRunnerProgress here,
  // replacing the legacy "No ARION site detected yet" yellow callout. The
  // runner was auto-launched on Save & Continue from Step 4.
  if (arionRunner.runnerStarted && !siteId) {
    return (
      <div className="space-y-3">
        <div className="rounded-lg border-2 border-sky-200 bg-sky-50 p-4">
          <div className="text-sm font-semibold text-sky-900">
            {arionRunner.runnerComplete ? "ARION setup complete" : "ARION setup in progress"}
          </div>
          <div className="text-xs text-sky-800 mt-1">
            {arionRunner.runnerComplete
              ? "All steps done. Click Save & Continue below to move to the next section."
              : "We're provisioning your site live. You can keep this open, or click Save & Close — the build keeps running and you can resume later."}
          </div>
          {arionRunner.runnerError && (
            <div className="mt-2 text-xs text-rose-700">Runner error: {arionRunner.runnerError}</div>
          )}
          {arionRunner.runnerRecords.length > 0 && (
            <div className="mt-4">
              <OnboardingRunnerProgress
                steps={arionRunner.runnerRecords}
                current_step_id={arionRunner.runnerCurrentStep}
                max_retries_by_step={arionRunner.stepCaps}
                skip_allowed_step_ids={arionRunner.skipAllowedStepIds}
                fallback_labels_by_step={arionRunner.fallbackLabels}
                onRetry={arionRunner.handleRetry}
                onSkip={arionRunner.handleSkip}
              />
            </div>
          )}
        </div>
      </div>
    );
  }

  if (!siteId) {
    return (
      <div className="space-y-3">
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4">
          <div className="text-sm font-semibold text-amber-900">No ARION site detected yet</div>
          <div className="text-xs text-amber-800 mt-1">
            The site provisioning may still be running, or this tenant hasn't been pushed through ARION setup yet.
            Integrations connect after a site exists in our system.
          </div>
          <div className="text-xs text-amber-800 mt-2">
            Two ways forward:
          </div>
          <ul className="text-xs text-amber-800 mt-1 ml-4 list-disc space-y-0.5">
            <li>Go back to ARION setup and pick a domain — Save &amp; Continue auto-launches provisioning.</li>
            <li>If you just finished setup, refresh this page — provisioning takes ~30s to land in our DB</li>
          </ul>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* If the runner is still ticking but the site row already landed,
          surface the live progress at the top so the user sees us still
          working — then they can connect integrations below as steps land. */}
      {arionRunner.runnerStarted && !arionRunner.runnerComplete && arionRunner.runnerRecords.length > 0 && (
        <div className="rounded-lg border-2 border-sky-200 bg-sky-50 p-3">
          <div className="text-xs font-semibold text-sky-900 mb-2">ARION setup still finishing</div>
          <OnboardingRunnerProgress
            steps={arionRunner.runnerRecords}
            current_step_id={arionRunner.runnerCurrentStep}
            max_retries_by_step={arionRunner.stepCaps}
            skip_allowed_step_ids={arionRunner.skipAllowedStepIds}
            fallback_labels_by_step={arionRunner.fallbackLabels}
            onRetry={arionRunner.handleRetry}
            onSkip={arionRunner.handleSkip}
          />
        </div>
      )}
      <p className="text-xs text-slate-500">
        Connect the data sources ARION pulls insights from. <b>Each row uses YOUR own Google/Bing/Apple account</b> — you authenticate, we just read.
        You can skip any of these and add them later from <code>ARION → Integrations</code>.
      </p>
      <div className="space-y-2">
        <Row
          label="Google — your account (GBP + GSC + Ads)"
          desc="One OAuth on YOUR Google account covers Business Profile, Search Console, and Ads. Powers Local Presence + Search Performance + Conversion reports."
          connected={v.gbp_connected && v.gsc_connected}
          onClick={startGoogleOAuth}
          busyKey="google"
          cta="Connect my Google"
        />
        <Row
          label="Bing — your Bing Webmaster Tools"
          desc="Bing search performance + indexing from YOUR Bing Webmaster account. Optional but recommended."
          connected={v.bing_connected}
          onClick={() => window.open(`/app/arion/integrations?connect=bing&site_id=${siteId}`, "_blank")}
          cta="Connect my Bing"
        />
        <Row
          label="Apple Business Connect"
          desc="Apple Maps + Spotlight listing from YOUR Apple Business account. No API exists — we open register.apple.com/business and then record the claim here."
          connected={v.apple_claimed}
          onClick={markAppleClaimedFromModal}
          busyKey="apple"
          cta="Mark as Claimed"
        />
        <Row
          label="SE Ranking Project (we manage this)"
          desc="Keyword rank tracking + competitor analysis on OUR SE Ranking account — no external login needed. We auto-create a project tied to your domain."
          connected={v.se_ranking_project_created}
          onClick={createSeProject}
          busyKey="seranking"
          cta="Create project"
        />
      </div>
      <label className="flex items-center gap-2 text-xs text-slate-600 pt-2">
        <input type="checkbox" checked={v.skipped} onChange={(e) => setV({ ...v, skipped: e.target.checked })} />
        I'll connect the rest later in <code>ARION → Integrations</code>.
      </label>
    </div>
  );
}

// ─── Section: SPARK · Welcome email ──────────────────────────────────────
//
// First nurture: the email a new contact gets after they sign up / get
// imported. We pre-fill with a system default that pulls the tenant's
// business name + owner name. Tenant can edit, pick "system default" to
// use ours as-is, or skip and write it later.
function SparkWelcomeEmailSection({ v, setV, profile, owner, spark }: {
  v: OnboardingState["spark_welcome_email"];
  setV: (v: OnboardingState["spark_welcome_email"]) => void;
  profile: BusinessProfile;
  owner: OwnerAccount;
  spark: OnboardingState["spark"];
}) {
  // 2026-06-24 — auto-fill now sources from the SPARK 7-sub-step picks:
  //   sender_name  ← senders[is_default=true].display_name (fallback to owner)
  //   sender_email ← senders[is_default=true].local_part + "@" + domain
  //                  (white-label uses the typed domain; ia_default uses send.ia-dm.com)
  //   signature appended to body  ← signatures[is_default=true].body_text
  //   CTA brand colour            ← spark.default_cta_color (used by future
  //     "Insert CTA" insertion in this editor; today we just store the colour
  //     alongside the template via flushSectionToCanonical)
  // Only fires on initial mount so the founder can still edit by hand.
  useEffect(() => {
    const defaultSender = spark.senders.find((s) => s.is_default) || spark.senders[0];
    const defaultSig = spark.signatures.find((s) => s.is_default) || spark.signatures[0];
    const domain = spark.sender_mode === "ia_default"
      ? "send.ia-dm.com"
      : (spark.white_label_email.split("@")[1] || spark.sender_domain || "");

    const senderName = v.sender_name
      || defaultSender?.display_name
      || `${owner.first_name || ""} ${owner.last_name || ""}`.trim()
      || profile.business_name;
    const senderEmail = v.sender_email
      || (defaultSender?.local_part && domain ? `${defaultSender.local_part}@${domain}` : "")
      || profile.primary_contact_email;

    if (senderName !== v.sender_name || senderEmail !== v.sender_email) {
      setV({ ...v, sender_name: senderName || "", sender_email: senderEmail || "" });
    }
    // Note: signature body is not prepended into v.body here — the template
    // body editor below renders + edits independently. The persist function
    // is the place where signature body_text gets appended to the final
    // outgoing email, so the founder sees their welcome copy without the
    // signature noise while editing.
    void defaultSig; // referenced for future signature preview chip
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const businessName = profile.business_name || "your business";
  const ownerFirst = owner.first_name || owner.display_name || "the team";
  // 2026-06-20 — Brandon flagged: the previous default used
  // `\{\{contact.first_name|"there"\}\}` (Handlebars-style fallback), but
  // LUMEN-API's interpolate() at lib/emailSender.js:56 only matches
  // `\{\{\\s*[\w.]+\\s*\}\}` — no pipe syntax — so the whole tag rendered
  // verbatim to the recipient. Switched to the simple `\{\{first_name\}\}`
  // shape; the merge-tag picker (Phase 2) will write this for the user.
  // Fallback "there" is handled in the renderer when first_name is null.
  const defaultBody =
`Hi {{first_name}},

Welcome to ${businessName}! I'm ${ownerFirst}, and I wanted to personally say thanks for connecting with us.

Here's what to expect next:
• A short note from us each month with what we're working on
• First access to anything new we ship
• Zero spam — unsubscribe link in every email

If there's anything specific you'd like help with, just hit reply.

Talk soon,
${ownerFirst}
${businessName}`;

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">
        The email a new contact gets the moment they're added. You can use our system default, customize it now, or skip and write it later in SPARK → Templates.
      </p>

      <div className="grid grid-cols-3 gap-2">
        {([
          { id: "system_default", label: "Use system default", desc: "We've written a friendly one for you." },
          { id: "custom",         label: "Write my own",        desc: "Edit it right here." },
          { id: "skip",           label: "Skip for now",        desc: "I'll do it later in SPARK." },
        ] as const).map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => setV({ ...v, template_choice: opt.id })}
            className={`text-left rounded-lg border-2 p-2 transition ${v.template_choice === opt.id ? "border-slate-900 bg-slate-50" : "border-slate-200 hover:border-slate-400"}`}
          >
            <div className="text-sm font-semibold">{opt.label}</div>
            <div className="text-[11px] text-slate-500 mt-0.5">{opt.desc}</div>
          </button>
        ))}
      </div>

      {v.template_choice !== "skip" && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Sender name" value={v.sender_name} onChange={(s) => setV({ ...v, sender_name: s })} placeholder="Who it's from" />
            <Field label="Sender email" value={v.sender_email} onChange={(s) => setV({ ...v, sender_email: s })} placeholder="hello@yourdomain.com" />
          </div>
          <Field label="Subject line" value={v.subject} onChange={(s) => setV({ ...v, subject: s })} hint="Use {{business_name}} or {{first_name}} to personalize" />
          <Field label="Preview text" value={v.preview_text} onChange={(s) => setV({ ...v, preview_text: s })} hint="Inbox snippet under the subject line." />
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-slate-700">Email body</label>
              <MergeTagDropdown
                context="spark_welcome"
                onInsert={(tag) => {
                  const cur = v.template_choice === "system_default" ? defaultBody : (v.body || defaultBody);
                  setV({ ...v, body: cur + tag, template_choice: "custom" });
                }}
              />
            </div>
            <textarea
              value={v.template_choice === "system_default" ? defaultBody : (v.body || defaultBody)}
              onChange={(e) => setV({ ...v, body: e.target.value, template_choice: "custom" })}
              rows={14}
              className="w-full mt-1 rounded-md border border-slate-300 px-3 py-2 text-sm font-mono"
              readOnly={v.template_choice === "system_default"}
            />
            <p className="text-[11px] text-slate-500 mt-1">
              Click <b>Insert merge tag ▾</b> to add fields like first name, business name. Falls back to <em>there</em> when a contact has no first name.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Section: SPARK ──────────────────────────────────────────────────────

// 2026-06-24 — SPARK setup expanded from a single sender_domain field into a
// 7-sub-step block driven by Brandon's SPARK Campaign Composer v1.1 lock
// (reference_spark_campaign_composer_v11) + welcome-email canonical scope
// (reference_welcome_email_campaigns). Steps render top-to-bottom; later
// steps gate visibly on earlier picks (e.g. step 2 only renders when the
// founder picks "white-label" in step 1; step 7 only renders for white-label
// + non-Lite tiers). Legacy fields (contact_import_method, brand_voice,
// send_time_preference, audience_size_estimate, first_campaign_goal) move
// into the "More SPARK settings" expander at the bottom so this section
// is still a single canonical place for SPARK onboarding writes.
function SparkSection({ v, setV, profile, owner, sparkTier }: {
  v: OnboardingState["spark"];
  setV: (v: OnboardingState["spark"]) => void;
  profile: BusinessProfile;
  owner: OwnerAccount;
  sparkTier?: string;
}) {
  // Lite-tier (== "lite") cannot hide the IA footer per
  // reference_oliver_tier_matrix.md branding-model lock. Default to enabled
  // when no tier info is available — Brandon's overnight onboarding flow
  // currently doesn't always pass tier through.
  const isLiteTier = (sparkTier || "").toLowerCase() === "lite";

  // ─── Step 3 prefill (senders) ──────────────────────────────────────────
  // First-time render — when the senders array still holds the placeholder
  // empty row, swap it for a sensible default derived from the white-label
  // email (if present) or the owner email. Runs once.
  useEffect(() => {
    if (v.senders.length === 1 && !v.senders[0].local_part && !v.senders[0].display_name) {
      const sourceEmail = v.white_label_email || owner.billing_email || profile.primary_contact_email || "";
      const localPart = sourceEmail.includes("@") ? sourceEmail.split("@")[0] : "welcome";
      const display = [owner.first_name, owner.last_name].filter(Boolean).join(" ") || profile.business_name || "";
      setV({
        ...v,
        senders: [{
          local_part: localPart || "welcome",
          display_name: display,
          is_default: true,
          reply_to_override: "",
        }],
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Step 4 prefill (signatures) ───────────────────────────────────────
  useEffect(() => {
    if (v.signatures.length === 1 && !v.signatures[0].body_html && !v.signatures[0].body_text) {
      const name = [owner.first_name, owner.last_name].filter(Boolean).join(" ") || profile.business_name || "Team";
      const bizLine = profile.business_name ? `<br/>${profile.business_name}` : "";
      const phoneLine = profile.phone ? `<br/>${profile.phone}` : "";
      const html = `<p>${owner.first_name || name}<br/>${profile.business_name || ""}${phoneLine}</p>`.replace("<br/>", bizLine ? "<br/>" : "");
      const text = `${owner.first_name || name}\n${profile.business_name || ""}${profile.phone ? `\n${profile.phone}` : ""}`;
      setV({
        ...v,
        signatures: [{
          name: "Default",
          body_html: html,
          body_text: text,
          is_default: true,
        }],
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Step 5 prefill (CTA colour) ───────────────────────────────────────
  useEffect(() => {
    if (!v.default_cta_color && profile.accent_color) {
      setV({ ...v, default_cta_color: profile.accent_color });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.accent_color]);

  // ─── White-label email → keep sender_domain in sync ────────────────────
  // sender_domain (legacy field, still rendered in Finish summary) tracks
  // whatever domain the founder picked in step 1.
  useEffect(() => {
    if (v.sender_mode === "white_label" && v.white_label_email.includes("@")) {
      const dom = v.white_label_email.split("@")[1] || "";
      if (dom && dom !== v.sender_domain) setV({ ...v, sender_domain: dom });
    } else if (v.sender_mode === "ia_default" && v.sender_domain !== "send.ia-dm.com") {
      setV({ ...v, sender_domain: "send.ia-dm.com" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v.sender_mode, v.white_label_email]);

  const [showLegacy, setShowLegacy] = useState(false);

  // Helpers for the senders/signatures mini-tables — keep the default-radio
  // invariant (exactly one true) intact whichever row the user toggles.
  function setDefaultSender(idx: number) {
    setV({ ...v, senders: v.senders.map((s, i) => ({ ...s, is_default: i === idx })) });
  }
  function setDefaultSignature(idx: number) {
    setV({ ...v, signatures: v.signatures.map((s, i) => ({ ...s, is_default: i === idx })) });
  }
  function addSender() {
    setV({ ...v, senders: [...v.senders, { local_part: "", display_name: "", is_default: false, reply_to_override: "" }] });
  }
  function removeSender(idx: number) {
    if (v.senders.length <= 1) return; // never drop below 1 row
    const next = v.senders.filter((_, i) => i !== idx);
    // If we removed the default, promote the first remaining row.
    if (!next.some((s) => s.is_default)) next[0].is_default = true;
    setV({ ...v, senders: next });
  }
  function addSignature() {
    setV({ ...v, signatures: [...v.signatures, { name: "", body_html: "", body_text: "", is_default: false }] });
  }
  function removeSignature(idx: number) {
    if (v.signatures.length <= 1) return;
    const next = v.signatures.filter((_, i) => i !== idx);
    if (!next.some((s) => s.is_default)) next[0].is_default = true;
    setV({ ...v, signatures: next });
  }

  const sectionHeader = (n: number, title: string, desc: string) => (
    <div className="flex items-baseline gap-2 mb-1.5">
      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-orange-500 text-white text-[10px] font-bold">{n}</span>
      <span className="text-sm font-bold text-slate-900">{title}</span>
      <span className="text-[11px] text-slate-500 ml-1">{desc}</span>
    </div>
  );

  // ARION manages the domain when (a) ARION is in cart AND (b) the sender
  // domain (white-label) matches the ARION domain the founder picked. The
  // "arion_auto" DNS path is only sensible in that case — otherwise it's
  // the manual_byo flow (customer publishes records themselves).
  // The arion section in OnboardingState exposes this, but this component
  // doesn't have access to that here. The DNS path radio defaults to
  // manual_byo and gives the founder the choice; the backend at
  // finish-onboarding decides whether the Hostinger SSH publisher can
  // actually act on "arion_auto" given the tenant's real ARION site row.

  return (
    <div className="space-y-5">
      <p className="text-xs text-slate-500">SPARK email setup, broken into 7 quick decisions. Skip what doesn't apply — every step is optional.</p>

      {/* ─── Step 1 ─── Sender mode ───────────────────────────────────── */}
      <div>
        {sectionHeader(1, "Sender mode", "Where do SPARK emails come from?")}
        <div className="grid grid-cols-2 gap-2">
          {([
            { id: "ia_default", label: "Use IA's shared domain", desc: "From: anything@send.ia-dm.com. Zero DNS setup. Fine for low-volume sends." },
            { id: "white_label", label: "Use my own domain (white-label)", desc: "From: hello@yourbusiness.com. Better deliverability. We help with DNS in step 2." },
          ] as const).map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setV({ ...v, sender_mode: opt.id })}
              className={`text-left rounded-lg border-2 p-3 transition ${v.sender_mode === opt.id ? "border-orange-500 bg-orange-50" : "border-slate-200 hover:border-slate-400"}`}
            >
              <div className="text-sm font-semibold">{opt.label}</div>
              <div className="text-[11px] text-slate-600 mt-0.5">{opt.desc}</div>
            </button>
          ))}
        </div>
        {v.sender_mode === "white_label" && (
          <div className="mt-2">
            <Field
              label="Your sender email"
              value={v.white_label_email}
              onChange={(s) => setV({ ...v, white_label_email: s })}
              placeholder="welcome@yourbusiness.com"
              hint="We'll register the domain for SPARK and use this address as the From + reply-to default."
            />
          </div>
        )}
      </div>

      {/* ─── Step 2 ─── DNS path (white-label only) ────────────────────── */}
      {v.sender_mode === "white_label" && (
        <div>
          {sectionHeader(2, "DNS publish path", "How will the SPF / DKIM / DMARC records get published?")}
          <div className="grid grid-cols-2 gap-2">
            {([
              { id: "arion_auto",  label: "ARION publishes it for me", desc: "If your domain lives on the Hostinger account we manage, we'll push the records automatically when you finish onboarding." },
              { id: "manual_byo",  label: "I'll publish the records myself", desc: "We give you the exact records; you (or your IT person) paste them at your DNS host and verify in SPARK ▸ Sender domains." },
            ] as const).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setV({ ...v, dns_path: opt.id })}
                className={`text-left rounded-lg border-2 p-3 transition ${v.dns_path === opt.id ? "border-orange-500 bg-orange-50" : "border-slate-200 hover:border-slate-400"}`}
              >
                <div className="text-sm font-semibold">{opt.label}</div>
                <div className="text-[11px] text-slate-600 mt-0.5">{opt.desc}</div>
              </button>
            ))}
          </div>
          {v.dns_path === "manual_byo" && (
            <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-[11px] text-amber-900">
              <div className="font-semibold">After you finish onboarding</div>
              <p className="mt-0.5">Open <code className="font-mono">SPARK ▸ Sender domains</code>. You'll see SPF, DKIM (3 CNAMEs) and DMARC records to copy into your DNS host. Once published, click <b>Verify</b>; SPARK can usually confirm within 5 minutes.</p>
            </div>
          )}
          {v.dns_path === "arion_auto" && (
            <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-[11px] text-emerald-900">
              <div className="font-semibold">We'll handle it automatically</div>
              <p className="mt-0.5">When you finish onboarding, the ARION provisioning pipeline writes the SPF, DKIM and DMARC records to your domain and verifies them. You'll see the status on the SPARK ▸ Sender domains page within a few minutes.</p>
            </div>
          )}
        </div>
      )}

      {/* ─── Step 3 ─── Sender addresses ───────────────────────────────── */}
      <div>
        {sectionHeader(3, "Sender addresses", "At least one. The From + reply-to picker in the SPARK Composer reads from this list.")}
        <div className="rounded-lg border border-slate-200 bg-white divide-y divide-slate-100">
          {v.senders.map((s, idx) => (
            <div key={idx} className="p-2.5 space-y-1.5">
              <div className="grid grid-cols-[1fr_auto_1fr_1fr_auto] gap-1.5 items-end">
                <Field
                  label={idx === 0 ? "Local part" : ""}
                  value={s.local_part}
                  onChange={(val) => setV({ ...v, senders: v.senders.map((row, i) => i === idx ? { ...row, local_part: val.toLowerCase().replace(/[^a-z0-9._+-]/g, "") } : row) })}
                  placeholder="welcome"
                />
                <div className="pb-2 text-[11px] text-slate-500 font-mono">@{v.sender_mode === "ia_default" ? "send.ia-dm.com" : (v.white_label_email.split("@")[1] || "yourbusiness.com")}</div>
                <Field
                  label={idx === 0 ? "Display name" : ""}
                  value={s.display_name}
                  onChange={(val) => setV({ ...v, senders: v.senders.map((row, i) => i === idx ? { ...row, display_name: val } : row) })}
                  placeholder="Acme Marketing"
                />
                <Field
                  label={idx === 0 ? "Reply-to (optional)" : ""}
                  value={s.reply_to_override}
                  onChange={(val) => setV({ ...v, senders: v.senders.map((row, i) => i === idx ? { ...row, reply_to_override: val } : row) })}
                  placeholder="hello@yourbusiness.com"
                />
                <button
                  type="button"
                  onClick={() => removeSender(idx)}
                  disabled={v.senders.length <= 1}
                  title={v.senders.length <= 1 ? "At least one sender required" : "Remove"}
                  className="mb-1 p-1.5 rounded hover:bg-rose-50 text-rose-600 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <label className="flex items-center gap-1.5 text-[11px] text-slate-600">
                <input type="radio" name="default_sender" checked={s.is_default} onChange={() => setDefaultSender(idx)} />
                Default sender for new campaigns
              </label>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={addSender}
          className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-sky-700 hover:text-sky-900"
        >
          <Plus className="h-3.5 w-3.5" /> Add another sender
        </button>
      </div>

      {/* ─── Step 4 ─── Signatures ─────────────────────────────────────── */}
      <div>
        {sectionHeader(4, "Email signatures", "At least one. The Signature picker in the SPARK Composer reads from this list.")}
        <div className="rounded-lg border border-slate-200 bg-white divide-y divide-slate-100">
          {v.signatures.map((s, idx) => (
            <div key={idx} className="p-2.5 space-y-1.5">
              <div className="flex items-end gap-1.5">
                <div className="flex-1">
                  <Field
                    label={idx === 0 ? "Signature name" : ""}
                    value={s.name}
                    onChange={(val) => setV({ ...v, signatures: v.signatures.map((row, i) => i === idx ? { ...row, name: val } : row) })}
                    placeholder="Default"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeSignature(idx)}
                  disabled={v.signatures.length <= 1}
                  title={v.signatures.length <= 1 ? "At least one signature required" : "Remove"}
                  className="mb-1 p-1.5 rounded hover:bg-rose-50 text-rose-600 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Signature body</label>
                <SparkBodyEditor
                  value={s.body_html}
                  onChange={(html, text) => setV({ ...v, signatures: v.signatures.map((row, i) => i === idx ? { ...row, body_html: html, body_text: text } : row) })}
                  placeholder="Your name, title, and contact info…"
                  minHeight={120}
                />
              </div>
              <label className="flex items-center gap-1.5 text-[11px] text-slate-600">
                <input type="radio" name="default_signature" checked={s.is_default} onChange={() => setDefaultSignature(idx)} />
                Default signature for new campaigns
              </label>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={addSignature}
          className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-sky-700 hover:text-sky-900"
        >
          <Plus className="h-3.5 w-3.5" /> Add another signature
        </button>
      </div>

      {/* ─── Step 5 ─── Default CTA colour ─────────────────────────────── */}
      <div>
        {sectionHeader(5, "Default CTA button colour", "Used when you click \"Insert CTA\" in the SPARK Composer.")}
        <div className="flex items-center gap-3">
          <input
            type="color"
            value={v.default_cta_color || "#1A7DB5"}
            onChange={(e) => setV({ ...v, default_cta_color: e.target.value })}
            className="h-10 w-16 rounded border border-slate-300 cursor-pointer"
          />
          <input
            type="text"
            value={v.default_cta_color}
            onChange={(e) => setV({ ...v, default_cta_color: e.target.value })}
            placeholder="#1A7DB5"
            className="w-28 rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono"
          />
          <div className="text-[11px] text-slate-500">Prefilled from your business profile's accent colour. You can override per-campaign later.</div>
        </div>
        <div
          className="mt-2 inline-block px-4 py-2 rounded-lg text-white text-sm font-semibold"
          style={{ background: v.default_cta_color || "#1A7DB5" }}
        >
          Preview CTA button
        </div>
      </div>

      {/* ─── Step 6 ─── Initial contact source ─────────────────────────── */}
      <div>
        {sectionHeader(6, "Initial contacts", "How will your first audience get into SPARK?")}
        <div className="grid grid-cols-3 gap-2">
          {([
            { id: "csv_now",          label: "I have a CSV ready",       desc: "We'll show you the importer after finish." },
            { id: "integrate_later",  label: "Integrate from OLIVER / a form later", desc: "Sync customers and form submissions over time." },
            { id: "skip",             label: "Skip — I'll do it later",  desc: "Pick this up in SPARK ▸ Contacts whenever you're ready." },
          ] as const).map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setV({ ...v, initial_contact_source: opt.id })}
              className={`text-left rounded-lg border-2 p-2.5 transition ${v.initial_contact_source === opt.id ? "border-orange-500 bg-orange-50" : "border-slate-200 hover:border-slate-400"}`}
            >
              <div className="text-sm font-semibold">{opt.label}</div>
              <div className="text-[11px] text-slate-600 mt-0.5">{opt.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* ─── Step 7 ─── White-label IA footer toggle ───────────────────── */}
      {v.sender_mode === "white_label" && (
        <div>
          {sectionHeader(7, "\"Powered by IA\" footer", "Show or hide the small attribution footer on outgoing SPARK emails.")}
          <label className={`flex items-start gap-2 rounded-lg border-2 p-3 ${isLiteTier ? "border-slate-200 bg-slate-50 opacity-70" : "border-slate-200 bg-white hover:border-slate-400"}`}>
            <input
              type="checkbox"
              checked={v.show_ia_footer}
              disabled={isLiteTier}
              onChange={(e) => setV({ ...v, show_ia_footer: e.target.checked })}
              className="mt-0.5"
            />
            <div className="flex-1">
              <div className="text-sm font-semibold">Show "Powered by Intelligent Analytics" footer</div>
              <div className="text-[11px] text-slate-600 mt-0.5">
                {isLiteTier
                  ? "Lite tier always shows the IA footer per your subscription. Upgrade to Standard or higher to remove it."
                  : "Standard and higher can hide this; we recommend leaving it on for the first 90 days for deliverability signals."}
              </div>
            </div>
          </label>
        </div>
      )}

      {/* ─── More SPARK settings (legacy fields preserved) ─────────────── */}
      <div className="rounded-lg border border-slate-200 bg-slate-50">
        <button
          type="button"
          onClick={() => setShowLegacy(!showLegacy)}
          className="w-full px-3 py-2 text-left text-xs font-semibold text-slate-700 flex items-center justify-between"
        >
          <span>More SPARK settings (optional)</span>
          <span className="text-slate-500">{showLegacy ? "▲" : "▼"}</span>
        </button>
        {showLegacy && (
          <div className="p-3 pt-0 space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">How will you import your contacts?</label>
              <div className="grid grid-cols-2 gap-2">
                {([
                  ["csv","Upload a CSV (recommended)"],
                  ["paste","Paste a list of emails"],
                  ["sync","Sync from OLIVER customers"],
                  ["later","I'll add them later"],
                ] as const).map(([id, label]) => (
                  <button key={id} type="button"
                    onClick={() => setV({ ...v, contact_import_method: id })}
                    className={`p-2.5 rounded-lg border-2 text-left text-xs ${v.contact_import_method === id ? "border-orange-500 bg-orange-50" : "border-slate-200 bg-white"}`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <Field label="Estimated audience size" value={v.audience_size_estimate} onChange={(s) => setV({ ...v, audience_size_estimate: s })}
              placeholder="e.g. 1,200 customers" hint="Drives volume tier recommendations" />

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Preferred send time</label>
              <div className="flex flex-wrap gap-1.5">
                {([
                  ["morning","Morning (8-10am)"],
                  ["midday","Midday (11-1pm)"],
                  ["afternoon","Afternoon (2-4pm)"],
                  ["evening","Evening (5-7pm)"],
                ] as const).map(([id, label]) => (
                  <button key={id} type="button"
                    onClick={() => setV({ ...v, send_time_preference: id })}
                    className={`px-3 py-1.5 rounded text-xs font-semibold border ${v.send_time_preference === id ? "border-orange-500 bg-orange-50 text-orange-900" : "border-slate-300 bg-white text-slate-700"}`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <BrandVoicePicker
              selected={v.brand_voice}
              custom={v.brand_voice_custom}
              onSelectedChange={(arr) => setV({ ...v, brand_voice: arr })}
              onCustomChange={(s) => setV({ ...v, brand_voice_custom: s })}
              hint="Used by SPARK's AI campaign writer + STELLA optimizations"
            />

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Goal of your first campaign (optional)</label>
              <textarea value={v.first_campaign_goal} onChange={(e) => setV({ ...v, first_campaign_goal: e.target.value })}
                rows={2} placeholder="Welcome existing customers + announce summer league signups opening April 1."
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Section: OLIVER Payments ────────────────────────────────────────────
//
// F-Stripe-Client-Side (2026-06-23) — Brandon-locked: the founder never
// touches client bank info. Stripe Connect setup happens client-side AFTER
// CIAM signin, driven by a "Set up payments" hint on the OLIVER dashboard.
//
// This step used to be a dual-path picker (Express vs Standard OAuth) that
// minted accounts at founder-wizard time. Removed. The step now exists only
// as an informational note so the founder knows the gap is INTENTIONAL — not
// missing/broken.
//
// The unused `v`/`setV`/`accent`/`api` params are kept to keep
// SectionBody's dispatch signature stable (every section receives the same
// prop bundle today). Save & Continue advances unconditionally.
/* eslint-disable @typescript-eslint/no-unused-vars */
function OliverPaymentsSection(_props: {
  v: OnboardingState["oliver"];
  setV: (v: OnboardingState["oliver"]) => void;
  accent: string;
  api: { get: <T>(p: string) => Promise<T>; post: <T>(p: string, b?: unknown) => Promise<T> };
}) {
  return (
    <div className="space-y-3">
      <div className="rounded-lg border-2 border-slate-200 bg-slate-50 p-4">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="h-5 w-5 text-slate-500 mt-0.5 shrink-0" />
          <div className="flex-1 text-sm text-slate-700">
            <div className="font-semibold text-slate-900">Stripe Connect setup happens when the client logs in.</div>
            <p className="mt-1 text-xs text-slate-600">
              They will see a &ldquo;Set up payments to start invoicing&rdquo; card on their OLIVER dashboard. The client picks between linking an existing Stripe account or creating a new one, and enters their own business + bank info directly with Stripe.
            </p>
            <p className="mt-2 text-[11px] text-slate-500">
              Save &amp; Continue to move on — nothing to configure here.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
/* eslint-enable @typescript-eslint/no-unused-vars */

// ─── Section: OLIVER Templates ───────────────────────────────────────────

function OliverTemplatesSection({ profile }: { profile: BusinessProfile }) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">Invoice / quote / proposal branding. By default, all three inherit the business profile's logo + brand colors. Override per-template later in OLIVER · Templates.</p>
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-2">
        <div className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Inherited from your business profile</div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-slate-500 w-16">Logo:</span>
          {profile.logo_url ? <img src={profile.logo_url} alt="Logo" className="h-8 max-w-[120px] object-contain" /> : <span className="text-slate-400 italic">none uploaded</span>}
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-slate-500 w-16">Colors:</span>
          <span className="w-5 h-5 rounded border border-slate-300" style={{ background: profile.primary_color }} />
          <span className="w-5 h-5 rounded border border-slate-300" style={{ background: profile.secondary_color }} />
          <span className="w-5 h-5 rounded border border-slate-300" style={{ background: profile.accent_color }} />
        </div>
      </div>
      <p className="text-xs text-slate-500">All three templates (invoice, quote, proposal) get created automatically when you finish onboarding. Per-template overrides (footer text, payment terms, custom headers) live in OLIVER · Templates after launch.</p>
    </div>
  );
}

// ─── Section: OLIVER Portal (customer + employee) ────────────────────────

function OliverPortalSection({ title, v, setV, fallback, variant = "customer" }: {
  title: string;
  v: OnboardingState["oliver"]["customer_portal"];
  setV: (v: OnboardingState["oliver"]["customer_portal"]) => void;
  fallback: BusinessProfile;
  variant?: "customer" | "employee";
}) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">{variant === "customer"
        ? "What your CUSTOMERS see when they log in to view jobs, invoices, send messages."
        : "What your EMPLOYEES/CREW see when they log in for schedules, dispatch, time tracking."}</p>
      <Field label="Welcome message" value={v.welcome} onChange={(w) => setV({ ...v, welcome: w })}
        placeholder={variant === "customer" ? "Welcome! Here's your portal." : "Hey team — your shift schedule + active jobs."}
        hint="Shown at the top of the portal home screen" />
      <div>
        <label className="block text-xs font-semibold text-slate-700 mb-1">{title} logo (override)</label>
        <Field label="" value={v.logo_override} onChange={(u) => setV({ ...v, logo_override: u })} placeholder="optional — defaults to business profile logo" />
        {v.logo_override && <img src={v.logo_override} alt="" className="mt-1 h-8 max-w-[120px] object-contain" />}
        {!v.logo_override && fallback.logo_url && <div className="mt-1 text-[10px] text-slate-500">Will use: <img src={fallback.logo_url} className="inline h-5 ml-1 align-middle" /></div>}
      </div>
      <div>
        <label className="block text-xs font-semibold text-slate-700 mb-1">Header color (override)</label>
        <div className="flex items-center gap-2">
          <input type="color" value={v.header_color || fallback.primary_color} onChange={(e) => setV({ ...v, header_color: e.target.value })} className="h-9 w-12 cursor-pointer rounded border border-gray-300" />
          <input type="text" value={v.header_color} onChange={(e) => setV({ ...v, header_color: e.target.value })} placeholder={`optional — defaults to ${fallback.primary_color}`} className="w-40 rounded-lg border border-gray-300 px-3 py-2 text-xs font-mono" />
        </div>
      </div>
      <div className="space-y-1 pt-1">
        <div className="text-xs font-semibold text-slate-700 mb-1">Features visible to {variant === "customer" ? "customers" : "employees"}:</div>
        {variant === "customer" ? (
          <>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={v.show_a} onChange={(e) => setV({ ...v, show_a: e.target.checked })} /> Show "Request work" button</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={v.show_b} onChange={(e) => setV({ ...v, show_b: e.target.checked })} /> Show messaging thread</label>
          </>
        ) : (
          <>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={v.show_a} onChange={(e) => setV({ ...v, show_a: e.target.checked })} /> Show schedule/calendar</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={v.show_b} onChange={(e) => setV({ ...v, show_b: e.target.checked })} /> Show dispatch / job-board</label>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Section: OLIVER Catalog ─────────────────────────────────────────────

function OliverCatalogSection({ items, setItems }: { items: Array<{ name: string; price: string }>; setItems: (it: Array<{ name: string; price: string }>) => void }) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">Your first service offerings — what customers will see in your catalog. Add 3-5 to make the portal feel alive on day one. Optional — skip and add later in OLIVER · Service Catalog.</p>
      {items.map((it, i) => (
        <div key={i} className="grid grid-cols-[1fr_120px_40px] gap-2 items-end">
          <Field label={i === 0 ? "Offering name" : ""} value={it.name} onChange={(v) => { const copy = [...items]; copy[i] = { ...copy[i], name: v }; setItems(copy); }} placeholder="e.g. Standard lawn cut" />
          <Field label={i === 0 ? "Price" : ""} value={it.price} onChange={(v) => { const copy = [...items]; copy[i] = { ...copy[i], price: v }; setItems(copy); }} placeholder="49.99" />
          <button onClick={() => { setItems(items.filter((_, ii) => ii !== i)); }} className="h-9 rounded border border-gray-300 text-xs text-slate-600 hover:bg-slate-50">✕</button>
        </div>
      ))}
      <button onClick={() => setItems([...items, { name: "", price: "" }])}
        className="px-3 py-1.5 rounded-lg border border-gray-300 text-xs text-slate-700">
        + Add another offering
      </button>
    </div>
  );
}

// ─── Section: Consulting ─────────────────────────────────────────────────

function ConsultingSection({ v, setV }: { v: OnboardingState["consulting"]; setV: (v: OnboardingState["consulting"]) => void }) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">Kickoff details for your consulting engagement. Optional — skip if you'll set up the engagement separately.</p>
      <Field label="Engagement type" value={v.engagement_type} onChange={(t) => setV({ ...v, engagement_type: t })}
        placeholder="Build Your Brand / Clarity / Engine / Foundation" />
      <div>
        <label className="block text-xs font-semibold text-slate-700 mb-1">Kickoff notes</label>
        <textarea value={v.first_meeting_notes} onChange={(e) => setV({ ...v, first_meeting_notes: e.target.value })}
          rows={4} placeholder="Topics to cover, goals, pre-work — whatever sets the first session up for success."
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
      </div>
    </div>
  );
}

// ─── Section: Finish ─────────────────────────────────────────────────────

function FinishSection({ state }: { state: OnboardingState }) {
  return (
    <div className="space-y-3">
      <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 text-sm">
        <div className="font-bold text-emerald-900 flex items-center gap-2"><CheckCircle2 className="h-4 w-4" /> Ready to finish</div>
        <div className="text-xs text-emerald-800 mt-1">
          Save & Finish below will send the CIAM welcome email to <strong>{state.profile.primary_contact_email || "the primary contact"}</strong>. They'll receive a signup link, set their password, and land on a guided walkthrough on first login.
        </div>
      </div>
      <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-1 text-sm">
        <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wide mb-1">Summary</div>
        <SummaryRow label="Business" value={state.profile.business_name} />
        <SummaryRow label="Contact email" value={state.profile.primary_contact_email} />
        <SummaryRow label="Owner" value={[state.owner.first_name, state.owner.last_name].filter(Boolean).join(" ")} />
        {state.arion.domain_choice && <SummaryRow label="ARION domain" value={`${state.arion.domain_choice}: ${state.arion.domain || "(blank)"}`} />}
        {state.spark.sender_domain && <SummaryRow label="SPARK sender" value={state.spark.sender_domain} />}
        {state.oliver.stripe_connect_started && <SummaryRow label="OLIVER payments" value="Stripe Connect already linked (from prior setup)" />}
        {state.consulting.engagement_type && <SummaryRow label="Consulting" value={state.consulting.engagement_type} />}
      </div>
      <p className="text-[10px] text-slate-500">
        Blank fields are fine. The client can fill them in from their own portal after signup. Save & Finish always works.
      </p>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-sm">
      <span className="text-slate-500 w-32 inline-block">{label}:</span> <strong>{value || <span className="text-slate-400 font-normal italic">not set</span>}</strong>
    </div>
  );
}

// ─── Consulting mode (existing-tenant workspace) ─────────────────────────

function ConsultingModeShell({ tenantId, tenantName, onClose }: { tenantId: string; tenantName?: string; onClose: () => void }) {
  return (
    <IadmModal
      open onClose={onClose} product="oliver"
      eyebrow={`Client Workspace · ${tenantName || tenantId}`}
      title="Skinnied client portal"
      subtitle="SPARK Campaigns / Segments / Automations / Templates · OLIVER Automations / Templates · ARION Insights"
      size="info"
      footer={<div className="flex justify-end w-full"><button onClick={onClose} className="px-4 py-2 rounded-lg border border-gray-300 text-slate-700 font-semibold text-sm">Close</button></div>}
    >
      <div className="px-6 py-5 space-y-4">
        <div className="rounded-xl bg-sky-50 border border-sky-200 p-4 text-sm">
          <div className="font-bold text-sky-900 flex items-center gap-2"><Building2 className="h-4 w-4" /> Working in client tenant</div>
          <div className="text-xs text-sky-800 mt-1">Tenant ID <code className="text-[10px]">{tenantId}</code>. Coming next: sidebar with the skinnied sections + embedded page components scoped to this tenant.</div>
        </div>
        <HelpFooter />
      </div>
    </IadmModal>
  );
}

// ─── Shared field components ─────────────────────────────────────────────

// 2026-06-21 — Brand voice multi-select picker.
// Max 3 voices from BRAND_VOICE_CATALOG + optional custom free-text.
// Cards show voice name, description, and a 2-sentence example.
//
// FIX (2026-06-24, F-289 follow-up) — Brandon hit this live mid-onboarding:
// "I just have professional locked in, I would like to be able to do some
// other options since it's pick up to 3." Root cause: an older saved_state
// row persisted brand_voice as a STRING ("Professional"), not the array
// EMPTY_STATE seeds (["Professional"]). When `selected` is a string:
//   • `selected.includes("Friendly")` → false (no substring match)
//   • `selected.includes("Professional")` → true (substring of itself)
//   • `selected.length` is the string length (12), which is >= MAX (3)
//   • Therefore EVERY other chip is disabled and locked out.
// Defensive coerce inside the picker so a malformed prefill can never lock
// the UI again, regardless of which upstream gave us bad shape. The
// hydration boundary also normalizes (see mergeState below) so the next
// save round-trips a clean array and the legacy row self-heals.
function BrandVoicePicker({ selected, custom, onSelectedChange, onCustomChange, hint }: {
  selected: string[] | string | null | undefined;
  custom: string;
  onSelectedChange: (s: string[]) => void;
  onCustomChange: (s: string) => void;
  hint?: string;
}) {
  const MAX = 3;
  // Coerce defensively. Accept array (canonical), single string (legacy
  // saved_state from before F-289 made this multi-select), or null/undefined.
  const sel: string[] = Array.isArray(selected)
    ? selected.filter((k): k is string => typeof k === "string" && k.trim() !== "")
    : typeof selected === "string" && selected.trim() !== ""
      ? [selected.trim()]
      : [];
  function toggle(key: string) {
    if (sel.includes(key)) {
      onSelectedChange(sel.filter((k) => k !== key));
    } else if (sel.length < MAX) {
      onSelectedChange([...sel, key]);
    }
  }
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-700 mb-1">
        Brand voice <span className="text-slate-400 font-normal">— pick up to 3 ({sel.length}/{MAX} selected)</span>
      </label>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {BRAND_VOICE_CATALOG.map((v) => {
          const active = sel.includes(v.key);
          const disabled = !active && sel.length >= MAX;
          return (
            <button
              key={v.key}
              type="button"
              onClick={() => toggle(v.key)}
              disabled={disabled}
              title={disabled ? `You've picked the max of ${MAX} voices — deselect one to pick another.` : undefined}
              className={`text-left rounded-lg border-2 p-2.5 transition ${
                active ? "border-sky-500 bg-sky-50" :
                disabled ? "border-slate-200 bg-slate-50 opacity-40 cursor-not-allowed" :
                "border-slate-200 bg-white hover:border-slate-400"
              }`}
            >
              <div className="flex items-start gap-2">
                <input type="checkbox" readOnly checked={active} disabled={disabled} className="mt-1" />
                <div className="flex-1">
                  <div className="text-sm font-semibold text-slate-900">{v.key}</div>
                  <div className="text-xs text-slate-600 mt-0.5">{v.description}</div>
                  <div className="text-[11px] italic text-slate-500 mt-1 leading-snug">"{v.example}"</div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
      <div className="mt-2">
        <label className="block text-xs font-semibold text-slate-700 mb-1">Custom voice notes (optional)</label>
        <input
          type="text"
          value={custom}
          onChange={(e) => onCustomChange(e.target.value)}
          placeholder="e.g. Sign off as 'The Team' not 'Owner Name', avoid exclamation points"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
      </div>
      {hint && <div className="text-[10px] text-slate-500 mt-1">{hint}</div>}
    </div>
  );
}

// 2026-06-21 — Curated, per-context merge-tag picker.
// Triggered by "{{" in an input. Shows friendly field names + descriptions.
// Subscription-gated: only shows fields the tenant has product access to.
export const MERGE_TAG_CATALOG: Record<string, { tag: string; friendly: string; description: string; product?: "spark" | "oliver" | "arion" }[]> = {
  spark_welcome: [
    { tag: "{{first_name}}", friendly: "Contact First Name", description: "Renders 'there' when blank" },
    { tag: "{{last_name}}", friendly: "Contact Last Name", description: "Renders blank when missing" },
    { tag: "{{business_name}}", friendly: "Your Business Name", description: "From your tenant profile" },
    { tag: "{{sender_name}}", friendly: "Sender Name", description: "The 'From' name on this email" },
    { tag: "{{unsubscribe_link}}", friendly: "Unsubscribe Link", description: "Required by law for marketing emails" },
  ],
  oliver_overdue: [
    { tag: "{{customer_name}}", friendly: "Customer Name", description: "Their first name (preferred)", product: "oliver" },
    { tag: "{{balance_due}}", friendly: "Balance Due", description: "Formatted as $X.XX", product: "oliver" },
    { tag: "{{days_overdue}}", friendly: "Days Overdue", description: "Integer", product: "oliver" },
    { tag: "{{pay_link}}", friendly: "Pay Link", description: "Stripe-hosted invoice URL", product: "oliver" },
    { tag: "{{business_name}}", friendly: "Your Business Name", description: "From your tenant profile" },
  ],
  oliver_appointment: [
    { tag: "{{customer_name}}", friendly: "Customer Name", description: "First name", product: "oliver" },
    { tag: "{{appointment_date}}", friendly: "Appointment Date", description: "Friendly format (Mon, Jun 24)", product: "oliver" },
    { tag: "{{appointment_time}}", friendly: "Appointment Time", description: "12-hour clock", product: "oliver" },
    { tag: "{{worker_name}}", friendly: "Worker Name", description: "Tech assigned", product: "oliver" },
    { tag: "{{business_name}}", friendly: "Your Business Name", description: "From your tenant profile" },
  ],
};

// 2026-06-21 — Inline merge-tag dropdown. Opens a panel with curated
// per-context fields. Clicking a field inserts the canonical tag at the
// end of the current value via onInsert.
function MergeTagDropdown({ context, onInsert }: {
  context: keyof typeof MERGE_TAG_CATALOG;
  onInsert: (tag: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const tags = MERGE_TAG_CATALOG[context] || [];
  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="text-xs font-semibold text-sky-700 hover:text-sky-900"
      >
        Insert merge tag ▾
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-72 rounded-lg border border-slate-200 bg-white shadow-lg z-10">
          <div className="text-[10px] uppercase tracking-wide text-slate-500 px-3 pt-2">Available fields</div>
          <div className="max-h-72 overflow-auto py-1">
            {tags.map((t) => (
              <button
                key={t.tag}
                type="button"
                onClick={() => { onInsert(t.tag); setOpen(false); }}
                className="w-full text-left px-3 py-1.5 hover:bg-sky-50"
              >
                <div className="text-xs font-semibold text-slate-900">{t.friendly}</div>
                <div className="text-[10px] text-slate-500">{t.description}</div>
                <code className="text-[10px] text-sky-700">{t.tag}</code>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, value, onChange, type = "text", placeholder, hint, tip }: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; placeholder?: string; hint?: string; tip?: string;
}) {
  return (
    <div>
      {label && (
        <label className="block text-xs font-semibold text-slate-700 mb-1">
          {label}
          {tip && <InfoTip text={tip} />}
        </label>
      )}
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
      {hint && <div className="text-[10px] text-slate-500 mt-1">{hint}</div>}
    </div>
  );
}

function PhoneField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-700 mb-1">{label}</label>
      <PhoneInput value={value} onChange={onChange}
        placeholder="+1 (555) 555-5555"
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
    </div>
  );
}

function HelpFooter() {
  return (
    <div className="mt-6 pt-4 border-t border-slate-200 text-center text-[11px] text-slate-500">
      Need help? <a href="https://book.intelligentanalyticsdm.com" target="_blank" rel="noreferrer"
        className="font-semibold underline" style={{ color: CORE_BLUE }}>
        Book an Intelligent Analytics consultation today →
      </a>
    </div>
  );
}

// flushSectionToCanonical — when a section is saved, ALSO write its data to
// the destination tables/services (not just the JSON blob). Best-effort; the
// blob save in persist() is the durable backstop. Per Brandon's G1 decision:
// Save & Continue = save then continue, not just save the blob.
//
// Section-by-section:
//   profile          → PATCH /settings on oliver-api (owns core.tenants R/W)
//   owner            → JSON blob only (CIAM trigger consumes at finish)
//   arion            → JSON blob only tonight; ARION fan-out is overnight
//                      (needs arion-api site config endpoint mapping)
//   spark            → JSON blob only tonight; LUMEN tenant settings overnight
//   oliver_*         → PATCH /settings for portal config; catalog separately overnight
//   consulting       → JSON blob only
//   finish           → no-op (the finish endpoint handles fan-out + CIAM)
async function flushSectionToCanonical(
  sectionId: SectionId,
  state: OnboardingState,
  api: {
    patch: <T>(p: string, b: unknown) => Promise<T>;
    /**
     * SPARK (LUMEN) API client — required to fan the SPARK section out to
     * /senders, /signatures, /sender-domains/from-email, and
     * /tenant-settings/spark-onboarding. Optional because non-SPARK
     * sections never touch it.
     */
    sparkApi?: {
      get: <T>(p: string) => Promise<T>;
      post: <T>(p: string, b?: unknown) => Promise<T>;
      put: <T>(p: string, b: unknown) => Promise<T>;
    };
  }
): Promise<void> {
  if (sectionId === "profile") {
    const p = state.profile;
    // 2026-06-20 — only include populated fields. Sending blank strings
    // for every field used to wipe the entire core.tenants row when the
    // user clicked Save before prefill loaded (initial state EMPTY_STATE
    // has every field as ""). The settings.js PATCH handler now also
    // guards against empty strings as a belt-and-suspenders fix, but this
    // is the source.
    const address = [p.address_street, p.address_line2, [p.address_city, p.address_state, p.address_zip].filter(Boolean).join(" ")]
      .filter(Boolean).join(", ");
    const present = (v: unknown) => typeof v === "string" && v.trim() !== "";
    const payload: Record<string, unknown> = {};
    if (present(p.business_name))         payload.tenantFullName = p.business_name;
    if (present(p.primary_contact_email)) payload.email = p.primary_contact_email;
    if (present(p.website))               payload.website = p.website;
    if (present(p.phone))                 payload.phone = p.phone;
    if (present(address))                 payload.address = address;
    if (present(p.logo_url))              payload.logoUrl = p.logo_url;
    if (present(p.primary_color))         payload.brandColor = p.primary_color;
    if (present(p.secondary_color))       payload.brandColorSecondary = p.secondary_color;
    if (present(p.accent_color))          payload.brandColorAccent = p.accent_color;
    if (Object.keys(payload).length === 0) return; // no-op when nothing to send
    await api.patch("/settings", payload);
    return;
  }
  if (sectionId === "oliver_customer_portal" || sectionId === "oliver_employee_portal") {
    // OLIVER portal config goes to oliver.tenant_settings via PATCH /settings
    // (same endpoint extends with portal_* fields). Backend tonight may not
    // yet accept these keys — the call is wrapped in try/catch in the caller.
    const v = sectionId === "oliver_customer_portal"
      ? state.oliver.customer_portal
      : state.oliver.employee_portal;
    const prefix = sectionId === "oliver_customer_portal" ? "customer" : "employee";
    await api.patch("/settings", {
      [`${prefix}PortalWelcome`]: v.welcome || "",
      [`${prefix}PortalLogo`]: v.logo_override || "",
      [`${prefix}PortalHeaderColor`]: v.header_color || "",
      [`${prefix}PortalShowA`]: v.show_a,
      [`${prefix}PortalShowB`]: v.show_b,
    });
    return;
  }
  if (sectionId === "spark_welcome_email") {
    // POST /api/v1/templates creates a SPARK email template. The system-default
    // path stamps a known name we can find later; custom uses the tenant's
    // typed body. "skip" leaves a placeholder template flagged as needs_review.
    const v = (state as OnboardingState).spark_welcome_email;
    if (v.template_choice === "skip") return;
    const body = v.template_choice === "system_default"
      ? `Hi {{contact.first_name|"there"}},\n\nWelcome to ${state.profile.business_name || "us"}! Thanks for connecting.\n\nTalk soon,\n${state.owner.first_name || state.profile.business_name}`
      : (v.body || "");
    try {
      await api.patch("/api/v1/templates/welcome-email", {
        kind: "email",
        slug: "welcome",
        subject: v.subject,
        preview_text: v.preview_text,
        body_html: body,
        sender_name: v.sender_name,
        sender_email: v.sender_email,
        source: "onboarding_modal",
      });
    } catch (e) { console.warn("[onboarding] welcome email save deferred:", e); }
    return;
  }
  if (sectionId === "arion_integrations") {
    // Nothing to flush — state mutations are written as the OAuth callbacks
    // land. JSON blob save covers the user's current checkbox state.
    return;
  }
  if (sectionId === "arion") {
    // 2026-06-25 — Flush the cross-product brand_intake into lumen.brand_voice_profile
    // so AI features (ARION copy gen, SPARK campaign writer, STELLA, OLIVER
    // customer-message tone) read the same source whether the customer self-
    // onboarded or the founder onboarded them. Best-effort: a 5xx never blocks
    // Save & Continue (the JSON blob save in persist() is the durable backstop).
    //
    // We map to the existing PUT /api/v1/my-brand/voice/profile endpoint which
    // accepts { tone_attributes, voice_examples }:
    //   tone_attributes → JSON object holding the full structured intake
    //                     (sliders / lists / differentiators) so future
    //                     surfaces can read individual fields without
    //                     reparsing free text.
    //   voice_examples  → seeded from differentiators + any free-text fields
    //                     that read like sample copy ("admired brands" lines).
    if (!api.sparkApi) {
      return; // non-SPARK-aware caller (rare — kept silent so test harnesses pass)
    }
    const intake = state.brand_intake;
    const intakeHasContent =
      intake.voice_traits.length > 0 ||
      intake.tones_to_avoid.length > 0 ||
      intake.positioning_territories.length > 0 ||
      intake.differentiators.some((s) => s && s.trim()) ||
      intake.admired_brands.trim() !== "" ||
      intake.avoid_brand.trim() !== "" ||
      intake.visual_direction !== "" ||
      intake.photography_preference !== "" ||
      intake.sliders.casual_formal !== 5 ||
      intake.sliders.affordable_premium !== 5 ||
      intake.sliders.traditional_modern !== 5 ||
      intake.sliders.local_corporate !== 5;
    if (!intakeHasContent) return; // no-op when nothing captured yet

    // Merge the founder wizard's 12-voice brand_voice tags (state.arion.brand_voice)
    // with the simplified intake's voice_traits so the canonical record reflects BOTH
    // pickers. The arrays are independent — the wizard's 12 voices target the AI
    // copy register; the intake's lexicon targets the simpler quick-pick used by
    // the self-serve flow.
    const toneAttributes: Record<string, unknown> = {
      voice_traits: intake.voice_traits,
      tones_to_avoid: intake.tones_to_avoid,
      sliders: intake.sliders,
      differentiators: intake.differentiators.filter((s) => s && s.trim()),
      visual_direction: intake.visual_direction,
      photography_preference: intake.photography_preference,
      admired_brands: intake.admired_brands,
      avoid_brand: intake.avoid_brand,
      positioning_territories: intake.positioning_territories,
      // Founder-wizard catalog tags (12-voice). May overlap with voice_traits;
      // we keep both so downstream consumers can choose granularity.
      brand_voice_catalog: state.arion.brand_voice || [],
      brand_voice_custom: state.arion.brand_voice_custom || "",
      style_preference: state.arion.style_preference,
      source: "founder_wizard",
      captured_at: new Date().toISOString(),
    };
    // Build voice_examples as a string[] — the runtime upsertProfile filters
    // to 20 × 2000 chars, so we don't have to. Seed from differentiators +
    // tagline + free-text "admired brands" so the embedding pass has real
    // text to anchor on.
    const voiceExamples: string[] = [
      ...intake.differentiators.filter((s) => s && s.trim()),
      ...(state.arion.tagline ? [state.arion.tagline] : []),
      ...(intake.admired_brands ? [`We want to sound brand-adjacent to: ${intake.admired_brands}`] : []),
      ...(intake.avoid_brand ? [`We do NOT want to sound like: ${intake.avoid_brand}`] : []),
    ];

    try {
      await api.sparkApi.put("/api/v1/my-brand/voice/profile", {
        tone_attributes: toneAttributes,
        voice_examples: voiceExamples,
      });
    } catch (e) {
      console.warn("[onboarding] brand_voice_profile upsert deferred:", e);
    }
    return;
  }
  if (sectionId === "lifecycle") {
    // PUT /lifecycle/config writes core.tenant_lifecycle_config for this
    // tenant — preset, qualify_trigger, oliver_create_trigger, past_customer_days,
    // negotiation_trigger. Backend lives on oliver-api at /lifecycle/*.
    const v = state.lifecycle;
    await api.patch("/lifecycle/config", {
      preset: v.preset,
      qualify_trigger: v.qualify_trigger,
      oliver_create_trigger: v.oliver_create_trigger,
      past_customer_days: v.past_customer_days,
      negotiation_trigger: v.negotiation_trigger,
    });
    return;
  }
  if (sectionId === "spark") {
    // 2026-06-24 — SPARK 7-sub-step fan-out. Order matters:
    //   1) Register the sender_domain (white-label only) so subsequent
    //      sender_address INSERTs have a valid sender_domain_id to link to.
    //   2) POST each sender via /senders.
    //   3) POST each signature via /signatures.
    //   4) PUT the spark-onboarding settings bundle into lumen.tenant_settings.
    // Every call is best-effort — the JSON blob save in persist() is the
    // durable backstop so a transient 5xx never blocks Save & Continue.
    const v = state.spark;
    if (!api.sparkApi) {
      console.warn("[onboarding] spark section flush skipped: sparkApi not provided");
      return;
    }
    const spark = api.sparkApi;

    // 1) Sender domain registration (white-label only).
    let senderDomainId: number | null = null;
    if (v.sender_mode === "white_label" && v.white_label_email && v.white_label_email.includes("@")) {
      try {
        // sparkPost returns the full envelope ({data: ...}), it does NOT
        // auto-unwrap (see lib/sparkApi.ts:70 — comment block calls this out).
        // Distinct from oliverApi's behaviour, which DOES unwrap.
        const reg = await spark.post<{ data: { id: number; domain: string } }>(
          "/api/v1/sender-domains/from-email",
          {
            email: v.white_label_email,
            display_name: state.profile.business_name || undefined,
            reply_to: v.white_label_email,
          }
        );
        senderDomainId = reg?.data?.id ?? null;
        // For the arion_auto DNS path, trigger the backend Hostinger publish.
        // Endpoint name follows the same /sender-domains/:id/* convention as
        // /verify and /default — backend wires this up to the ARION SSH
        // publisher when the tenant's ARION site sits on the IA-managed
        // Hostinger account. A 404 here just means the endpoint isn't live
        // yet; we degrade to the manual flow silently.
        if (senderDomainId && v.dns_path === "arion_auto") {
          try {
            await spark.post(`/api/v1/sender-domains/${senderDomainId}/publish-via-arion`, {});
          } catch (e) {
            console.warn("[onboarding] arion DNS publish trigger deferred:", e);
          }
        }
      } catch (e) {
        console.warn("[onboarding] sender domain register deferred:", e);
      }
    }

    // 2) Sender addresses — POST one row at a time. Skip blank rows.
    if (senderDomainId) {
      for (const s of v.senders) {
        if (!s.local_part) continue;
        try {
          await spark.post("/api/v1/senders", {
            local_part: s.local_part,
            display_name: s.display_name || null,
            sender_domain_id: senderDomainId,
            is_default: !!s.is_default,
            reply_to_override: s.reply_to_override || null,
          });
        } catch (e) {
          console.warn("[onboarding] sender create deferred:", s.local_part, e);
        }
      }
    }

    // 3) Signatures — POST each non-blank row.
    for (const sig of v.signatures) {
      if (!sig.body_html && !sig.body_text && !sig.name) continue;
      try {
        await spark.post("/api/v1/signatures", {
          name: sig.name || "Default",
          body_html: sig.body_html || null,
          body_text: sig.body_text || null,
          is_default: !!sig.is_default,
        });
      } catch (e) {
        console.warn("[onboarding] signature create deferred:", sig.name, e);
      }
    }

    // 4) Spark-onboarding settings bundle — one PUT writes every key into
    // lumen.tenant_settings. Backend route mirrors PUT /tenant-settings/:key
    // (string upsert) but accepts a JSON body of N keys to upsert in a
    // single round trip. See LUMEN-API/src/routes/tenantSettings.js — the
    // PUT /tenant-settings/spark-onboarding handler we add alongside this
    // change.
    try {
      await spark.put("/api/v1/tenant-settings/spark-onboarding", {
        spark_sender_mode: v.sender_mode || "",
        spark_white_label_email: v.white_label_email || "",
        spark_dns_path: v.dns_path || "",
        spark_default_cta_color: v.default_cta_color || "",
        spark_initial_contact_source: v.initial_contact_source || "",
        spark_show_ia_footer: v.show_ia_footer ? "true" : "false",
        spark_brand_voice: JSON.stringify(v.brand_voice || []),
        spark_brand_voice_custom: v.brand_voice_custom || "",
        spark_audience_size_estimate: v.audience_size_estimate || "",
        spark_send_time_preference: v.send_time_preference || "",
        spark_contact_import_method: v.contact_import_method || "",
        spark_first_campaign_goal: v.first_campaign_goal || "",
      });
    } catch (e) {
      console.warn("[onboarding] spark settings bundle deferred:", e);
    }
    return;
  }
  // owner / arion / oliver_payments / oliver_templates / oliver_catalog /
  // consulting / finish — JSON blob only tonight; canonical-table fan-out
  // happens at finish-onboarding (or is queued for overnight per SCOPE_WORKING.md).
}

// NOTE: mergeStrict() was extracted to src/lib/mergeStrict.ts so the founder
// wizard (ConsultingOnboardClientPageV2) can share the exact same semantics.
// Don't reintroduce a second copy here.

// 2026-06-24 — coerce legacy brand_voice STRING to array on hydration.
// F-289 made brand_voice multi-select (string[]); pre-F-289 saved_state rows
// still hold a single string ("Professional"). mergeStrict happily forwards
// that string as-is, and the picker then locks (see BrandVoicePicker note).
// Normalize here so downstream is uniform. Cast: TS sees `string[]` on the
// type but we may receive `string | null` at runtime from older saves.
function coerceVoiceArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((k): k is string => typeof k === "string" && k.trim() !== "");
  if (typeof v === "string" && v.trim() !== "") return [v.trim()];
  return [];
}

function mergeState(base: OnboardingState, partial: Partial<OnboardingState>): OnboardingState {
  const oliverPartial = (partial.oliver || {}) as Partial<OnboardingState["oliver"]>;
  const mergedArion = mergeStrict(base.arion, partial.arion);
  const mergedSpark = mergeStrict(base.spark, partial.spark);
  // 2026-06-25 — brand_intake uses its own coercer (defaults sliders, filters
  // unknown trait keys) instead of mergeStrict so a legacy saved_state row
  // missing the field self-heals on hydration.
  const mergedBrandIntake = coerceBrandIntake(partial.brand_intake || base.brand_intake);
  return {
    profile:    mergeStrict(base.profile,    partial.profile),
    owner:      mergeStrict(base.owner,      partial.owner),
    arion:      { ...mergedArion, brand_voice: coerceVoiceArray(mergedArion.brand_voice) },
    spark:      { ...mergedSpark, brand_voice: coerceVoiceArray(mergedSpark.brand_voice) },
    oliver: {
      ...mergeStrict(base.oliver, oliverPartial),
      customer_portal: mergeStrict(base.oliver.customer_portal, oliverPartial.customer_portal),
      employee_portal: mergeStrict(base.oliver.employee_portal, oliverPartial.employee_portal),
      catalog: (Array.isArray(oliverPartial.catalog) && oliverPartial.catalog.some((r) => r && (r.name || r.price)))
        ? oliverPartial.catalog
        : base.oliver.catalog,
    },
    consulting: mergeStrict(base.consulting, partial.consulting),
    lifecycle:  mergeStrict(base.lifecycle,  partial.lifecycle),
    arion_integrations: mergeStrict(base.arion_integrations, partial.arion_integrations),
    spark_welcome_email: mergeStrict(base.spark_welcome_email, partial.spark_welcome_email),
    brand_intake: mergedBrandIntake,
  };
}

export default OnboardingWizardModal;
