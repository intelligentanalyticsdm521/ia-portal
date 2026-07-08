// C:/dev/iadm/Portal/src/lib/onboardingRunner/arionSteps.ts
//
// ARION step factory for the OnboardingRunner. Returns the ordered Step[]
// the engine walks per the locked Brandon decision matrix on
// 2026-06-23: five domain paths (purchase / subdomain / byo /
// hostinger_existing / migrate), optional SEO chain when an SEO add-on is
// in the cart, optional Bing OAuth (skip-allowed).
//
// Path matrix — locked 2026-06-23 onboarding redesign:
//
//   purchase / subdomain
//     1. questionnaire             (save Brandon's questionnaire to arion.signup_session)
//     2. hostinger_provision       (register/connect domain + WP install)
//     3. plugin_stack_swap         (strip Hostinger plugins + install golden-master stack)
//     4. create_wp_user            (provision editor-level user for the customer)
//     5. ai_website_builder        (V2 emitter: AI copy + images + Elementor pages)
//     6. seo_*                     (only if has_seo_addon)
//     7. google_oauth              (GA4 / GSC / GBP — single OAuth, one redirect)
//     8. bing_oauth                (skip-allowed; Bing Webmaster sync)
//
//   byo / hostinger_existing
//     1. questionnaire             (still collected — drives brand voice + SEO seeds)
//     2. plugin_install_only       (install ONLY the IA Plugin; respects existing WP)
//     3. create_wp_user            (editor seat for the customer)
//     4. seo_*                     (only if has_seo_addon)
//     5. google_oauth
//     6. bing_oauth                (skip-allowed)
//     (no ai_website_builder — customer's existing content is theirs)
//
//   migrate
//     1. questionnaire             (collected; consulting needs it for cutover scoping)
//     2. mark_for_consulting       (flag arion.site for the migration queue and STOP)
//
// SEO chain (4 steps, in order):
//   seo_project_create    POST /arion/seo/project/create  (creates SE Ranking project shell)
//   seo_keywords_seed     POST /arion/seo/keywords/seed   (questionnaire → 10/25/60/150 seed kw)
//   seo_competitors_seed  POST /arion/seo/competitors/seed (questionnaire competitor field)
//   seo_configure_tier    POST /arion/seo/project/reconfigure (per-tier engines + AIRT)
//
// Side-effect contract every step holds:
//   • action()  POSTs to the documented arion-api route, returning the
//     persisted job/run handle so waitFor() / verify() can read state.
//   • waitFor() polls the orchestrator status endpoint (which itself reads
//     arion.site.provisioning_state / status_phase / provisioning_details_json)
//     until the side-effect lands or errors.
//   • verify() reads back the column-level proof so a re-run can short-
//     circuit when the work has already happened (e.g. arion.site.tier !==
//     null, integration row exists, etc.).
//
// The runner side-effect surface is the existing arion-api orchestrator at
// /onboarding/submit + a new GET /onboarding/runner/status/:tenantId/:siteId
// endpoint that mirrors arion.site.provisioning_state into the StepRecord
// shape. Until the orchestrator-side step-emitter PR lands, waitFor() reads
// the existing provisioning_details_json.current_phase field — see
// arion-api/lib/provisioningPhase.js PHASES for the canonical phase list
// the runner translates into step status.

import type { ActionResult, RunnerCtx, Step } from "./types";

/* ──────────────────────────────────────────────────────────────────────
 * Domain path discriminator
 * ────────────────────────────────────────────────────────────────────── */

export type ArionDomainPath =
  | "purchase"
  | "subdomain"
  | "byo"
  | "hostinger_existing"
  | "migrate";

/* ──────────────────────────────────────────────────────────────────────
 * arion-api base URL — same env-var fall-through pattern the wizard uses.
 * ────────────────────────────────────────────────────────────────────── */

const ARION_API_BASE_URL: string =
  (typeof import.meta !== "undefined" && (import.meta as { env?: Record<string, string> }).env?.VITE_ARION_API_BASE_URL) ||
  "https://app-arion-api-prod-e6fuc9gzd8f3hqfe.centralus-01.azurewebsites.net";

/* ──────────────────────────────────────────────────────────────────────
 * Runner context extension — ARION steps need site_id, bearer token, and
 * the customer's questionnaire payload at action() time. We carry these
 * via business_profile (the engine's free-form passthrough) so we don't
 * have to modify the generic RunnerCtx shape.
 *
 * Wizard caller is responsible for stuffing these fields into
 * ctx.business_profile when it constructs the Runner.
 * ────────────────────────────────────────────────────────────────────── */

interface ArionRunnerExtras {
  site_id?: string | null;
  bearer_token?: string | null;
  domain?: string | null;
  domain_path?: ArionDomainPath;
  questionnaire?: Record<string, unknown>;
  /** Customer's primary email — used to invite them as Admin/Owner on
   *  IA-master-provisioned Google + Bing assets. */
  contact_email?: string | null;
  /** Customer's business name — used as the displayName when the IA
   *  master service account creates a GA4 property or a GBP listing
   *  on their behalf. Falls back to the bare domain when missing. */
  business_name?: string | null;
  /** "yes" | "no" | "not_sure" — the customer's answer to "Do you
   *  already have Google Analytics, Search Console, and Business Profile?"
   *  Set by the wizard's Google card before the runner is launched. */
  google_setup_answer?: "yes" | "no" | "not_sure" | null;
  /** Same shape for Bing. */
  bing_setup_answer?: "yes" | "no" | "not_sure" | null;
  /** Cached probe verdict — written by the probe step into the extras
   *  bag so the per-branch step can short-circuit without re-asking
   *  the backend. */
  google_setup_mode?: "byo" | "ia_managed" | "auto_byo" | "auto_ia" | null;
  bing_setup_mode?: "byo" | "ia_managed" | "auto_byo" | "auto_ia" | null;
}

function extras(ctx: RunnerCtx): ArionRunnerExtras {
  return (ctx.business_profile as ArionRunnerExtras) || {};
}

/* ──────────────────────────────────────────────────────────────────────
 * Lightweight fetch helpers — kept local so this file has zero coupling
 * to the rest of the Portal (deliberately mirrored from arionApi.ts so
 * the runner can be unit-tested standalone).
 * ────────────────────────────────────────────────────────────────────── */

interface ArionApiResponse<T = unknown> {
  ok: boolean;
  status: number;
  data?: T;
  error?: string;
  retryable_after_ms?: number;
}

async function arionFetch<T>(
  ctx: RunnerCtx,
  path: string,
  init: RequestInit = {},
): Promise<ArionApiResponse<T>> {
  const ex = extras(ctx);
  const token = ex.bearer_token || "";
  const url = `${ARION_API_BASE_URL}${path}`;
  try {
    const res = await fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        "x-tenant-key": ctx.tenant_id,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init.headers || {}),
      },
    });
    const text = await res.text();
    let body: unknown = null;
    if (text) {
      try { body = JSON.parse(text); } catch { body = { raw: text }; }
    }
    if (!res.ok) {
      // Honour Retry-After when present (Hostinger 429 / Stripe 429 / etc.)
      const ra = res.headers.get("retry-after");
      const retryable_after_ms = ra ? Math.max(0, Number(ra) * 1000) || undefined : undefined;
      const errMsg = extractErrorMessage(body) || `HTTP ${res.status}`;
      return { ok: false, status: res.status, error: errMsg, retryable_after_ms };
    }
    return { ok: true, status: res.status, data: (body as T) ?? undefined };
  } catch (e) {
    return { ok: false, status: 0, error: (e as Error).message || "network error" };
  }
}

function extractErrorMessage(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const e = (body as { error?: unknown }).error;
  if (typeof e === "string") return e;
  if (e && typeof e === "object") {
    const m = (e as { message?: string }).message;
    if (typeof m === "string") return m;
  }
  return null;
}

/* ──────────────────────────────────────────────────────────────────────
 * Status poller — every async step polls the orchestrator status
 * endpoint that mirrors arion.site.provisioning_details_json (current
 * phase) + arion.site.status_phase (the discrete status_phase column
 * Brandon asked the orchestrator to surface). Returns a normalised
 * payload the per-step waitFor() can switch off.
 * ────────────────────────────────────────────────────────────────────── */

interface RunnerStatusPayload {
  current_phase: string | null;
  status_phase: string | null;
  progress_percent: number;
  /** Surfaced when the orchestrator wants the engine to stop polling. */
  terminal_state: "done" | "failed" | null;
  error: string | null;
  /** Optional column-level proof the engine writes into StepRecord.evidence. */
  evidence: Record<string, unknown>;
}

async function pollStatus(ctx: RunnerCtx): Promise<ArionApiResponse<RunnerStatusPayload>> {
  const ex = extras(ctx);
  if (!ex.site_id) {
    return { ok: false, status: 0, error: "site_id not yet known on ctx (action() should set it)" };
  }
  const r = await arionFetch<{ data: RunnerStatusPayload }>(
    ctx,
    `/onboarding/runner/status/${encodeURIComponent(ctx.tenant_id)}/${encodeURIComponent(ex.site_id)}`,
  );
  if (!r.ok) return { ok: false, status: r.status, error: r.error, retryable_after_ms: r.retryable_after_ms };
  return { ok: true, status: r.status, data: r.data?.data };
}

/* ──────────────────────────────────────────────────────────────────────
 * Phase-name → waitFor result translation
 *
 * The orchestrator emits a stable string per step (status_phase column).
 * Each step declares which status_phase values it considers "done", and
 * the rest are treated as "still working" (waitFor returns ok:false
 * without an error — the engine keeps polling).
 * ────────────────────────────────────────────────────────────────────── */

function waitForPhase(donePhases: string[]): Step["waitFor"] {
  return async (ctx) => {
    const r = await pollStatus(ctx);
    if (!r.ok) {
      // Network error or 5xx — propagate as retryable failure.
      return { ok: false, error: r.error, retryable_after_ms: r.retryable_after_ms };
    }
    const payload = r.data;
    if (!payload) return { ok: false };
    if (payload.terminal_state === "failed") {
      return { ok: false, error: payload.error || "orchestrator reported terminal failure" };
    }
    if (payload.terminal_state === "done") {
      return { ok: true, data: payload };
    }
    if (donePhases.includes(payload.status_phase || "") ||
        donePhases.includes(payload.current_phase || "")) {
      return { ok: true, data: payload };
    }
    // Still in flight — engine keeps polling at step.retry_delay_ms cadence.
    return { ok: false };
  };
}

/* ──────────────────────────────────────────────────────────────────────
 * verify() — column-level proof readback
 *
 * Pulls arion.site by site_id and checks the declared column is populated.
 * Fast, idempotent, runs once per step.
 * ────────────────────────────────────────────────────────────────────── */

function verifyColumn(
  expectedKey: string,
  predicate?: (v: unknown, site: Record<string, unknown>) => boolean,
): Step["verify"] {
  return async (ctx) => {
    const ex = extras(ctx);
    if (!ex.site_id) return { ok: false, error: "site_id missing on ctx" };
    const r = await arionFetch<{ data: { site?: Record<string, unknown> } }>(
      ctx,
      `/arion/sites/${encodeURIComponent(ex.site_id)}`,
    );
    if (!r.ok) return { ok: false, error: r.error, retryable_after_ms: r.retryable_after_ms };
    const site = (r.data as { data?: { site?: Record<string, unknown> } } | undefined)?.data?.site
      || (r.data as { site?: Record<string, unknown> } | undefined)?.site
      || (r.data as Record<string, unknown> | undefined)
      || {};
    const v = (site as Record<string, unknown>)[expectedKey];
    const ok = predicate ? predicate(v, site) : v !== null && v !== undefined && v !== "";
    if (!ok) {
      return {
        ok: false,
        error: `verify failed: arion.site.${expectedKey} not populated (got ${JSON.stringify(v)})`,
      };
    }
    return { ok: true, data: { [expectedKey]: v } };
  };
}

/* ──────────────────────────────────────────────────────────────────────
 * Step definitions
 *
 * Each step calls into the existing arion-api orchestrator routes. The
 * orchestrator is responsible for writing core.onboarding_step_status
 * rows + the arion.site.status_phase column the runner polls against.
 *
 * Tuning rationale:
 *   • Long-running provider work (Hostinger, AI WB, SEO project create)
 *     gets a 60-cycle * 5s poll budget = 5-minute upper bound per attempt,
 *     plus max_retries: 3 = ~15 min total for the slowest step. Above
 *     that the founder gets notified per Brandon decision #3.
 *   • Cheap local writes (questionnaire, mark_for_consulting,
 *     create_wp_user) get short retry windows so a transient SQL hiccup
 *     doesn't visibly stall the UI.
 * ────────────────────────────────────────────────────────────────────── */

const DEFAULT_POLL_MS = 5000;
const SLOW_POLL_MS = 8000;

/* Step: questionnaire — write the customer's questionnaire + domain
 * choice to arion.signup_session. Cheap local write — no waitFor. */
function stepQuestionnaire(): Step {
  return {
    id: "arion_questionnaire",
    label_user_facing: "Saving your business details",
    label_friendly: "arion: persist questionnaire",
    on_failure: "notify_founder",
    max_retries: 3,
    retry_delay_ms: 2000,
    action: async (ctx): Promise<ActionResult> => {
      const ex = extras(ctx);
      const r = await arionFetch<{ data: { ok: true; site_id?: string } }>(
        ctx,
        `/onboarding/runner/questionnaire`,
        {
          method: "POST",
          body: JSON.stringify({
            tenant_id: ctx.tenant_id,
            domain_path: ex.domain_path,
            domain: ex.domain,
            questionnaire: ex.questionnaire || {},
            run_id: ctx.run_id,
          }),
        },
      );
      if (!r.ok) return { ok: false, error: r.error, retryable_after_ms: r.retryable_after_ms };
      // Capture site_id back onto ctx so downstream steps can read it via
      // extras(ctx).site_id. The engine treats RunnerCtx as immutable, so
      // mutate the business_profile passthrough (which IS the extras bag).
      const sid = (r.data as { data?: { site_id?: string } } | undefined)?.data?.site_id;
      if (sid && !ex.site_id) {
        (ctx.business_profile as ArionRunnerExtras).site_id = sid;
      }
      return { ok: true, data: { site_id: sid } };
    },
  };
}

/* Step: mark_for_consulting — flag arion.site / arion.signup_session
 * for the consulting migration queue. STOPS the runner — the migrate
 * path has no further automated steps. */
function stepMarkForConsulting(): Step {
  return {
    id: "arion_mark_for_consulting",
    label_user_facing: "Queuing your migration with consulting",
    label_friendly: "arion: mark tenant for consulting migration",
    on_failure: "notify_founder",
    max_retries: 3,
    retry_delay_ms: 2000,
    action: async (ctx): Promise<ActionResult> => {
      const ex = extras(ctx);
      const r = await arionFetch(ctx, `/onboarding/runner/mark-for-consulting`, {
        method: "POST",
        body: JSON.stringify({
          tenant_id: ctx.tenant_id,
          site_id: ex.site_id,
          domain: ex.domain,
          notes: "Migration queued via OnboardingRunner",
          run_id: ctx.run_id,
        }),
      });
      if (!r.ok) return { ok: false, error: r.error, retryable_after_ms: r.retryable_after_ms };
      return { ok: true, data: { queued: true } };
    },
  };
}

/* Step: hostinger_provision — register/connect domain + create WP
 * install via Hostinger API. Long-running; polls until status_phase
 * lands in "waiting_for_wp" or later. */
function stepHostingerProvision(): Step {
  return {
    id: "arion_hostinger_provision",
    label_user_facing: "Spinning up your WordPress site",
    label_friendly: "arion: hostinger ssh provision",
    on_failure: "notify_founder",
    max_retries: 3,
    retry_delay_ms: SLOW_POLL_MS,
    action: async (ctx): Promise<ActionResult> => {
      const ex = extras(ctx);
      const r = await arionFetch(ctx, `/onboarding/runner/hostinger-provision`, {
        method: "POST",
        body: JSON.stringify({
          tenant_id: ctx.tenant_id,
          site_id: ex.site_id,
          domain: ex.domain,
          domain_path: ex.domain_path,
          run_id: ctx.run_id,
        }),
      });
      if (!r.ok) return { ok: false, error: r.error, retryable_after_ms: r.retryable_after_ms };
      return { ok: true, data: r.data };
    },
    waitFor: waitForPhase([
      "waiting_for_wp",
      "resetting_admin_password",
      "stripping_hostinger",
      "ready",
    ]),
    verify: verifyColumn("hostinger_website_id"),
  };
}

/* Step: plugin_stack_swap — strip Hostinger onboarding plugins, install
 * the golden-master stack (Elementor + Pro + IA Plugin + tier add-ons). */
function stepPluginStackSwap(): Step {
  return {
    id: "arion_plugin_swap",
    label_user_facing: "Installing your tools",
    label_friendly: "arion: plugin stack swap",
    on_failure: "notify_founder",
    max_retries: 3,
    retry_delay_ms: SLOW_POLL_MS,
    action: async (ctx): Promise<ActionResult> => {
      const ex = extras(ctx);
      const r = await arionFetch(ctx, `/onboarding/runner/plugin-stack-swap`, {
        method: "POST",
        body: JSON.stringify({
          tenant_id: ctx.tenant_id,
          site_id: ex.site_id,
          domain: ex.domain,
          run_id: ctx.run_id,
        }),
      });
      if (!r.ok) return { ok: false, error: r.error, retryable_after_ms: r.retryable_after_ms };
      return { ok: true, data: r.data };
    },
    waitFor: waitForPhase(["generating_copy", "setting_brand_globals", "ready"]),
  };
}

/* Step: plugin_install_only — install ONLY the IA Plugin on an existing
 * WP site. Path-B equivalent of plugin_stack_swap; respects whatever
 * plugins the customer already has. */
function stepPluginInstallOnly(): Step {
  return {
    id: "arion_plugin_swap",   // SAME step id as full swap so the labels
                               // registry and progress UI render the
                               // friendly copy without a special case.
    label_user_facing: "Installing your tools",
    label_friendly: "arion: ia plugin install only",
    on_failure: "notify_founder",
    max_retries: 3,
    retry_delay_ms: DEFAULT_POLL_MS,
    action: async (ctx): Promise<ActionResult> => {
      const ex = extras(ctx);
      const r = await arionFetch(ctx, `/onboarding/runner/plugin-install-only`, {
        method: "POST",
        body: JSON.stringify({
          tenant_id: ctx.tenant_id,
          site_id: ex.site_id,
          domain: ex.domain,
          run_id: ctx.run_id,
        }),
      });
      if (!r.ok) return { ok: false, error: r.error, retryable_after_ms: r.retryable_after_ms };
      return { ok: true, data: r.data };
    },
    waitFor: waitForPhase(["finishing_up", "sending_welcome", "ready"]),
  };
}

/* Step: create_wp_user — provision the editor-level WP user for the
 * customer. Same hook for purchase / subdomain / byo paths. */
function stepCreateWpUser(): Step {
  return {
    id: "arion_create_wp_user",
    label_user_facing: "Creating your login",
    label_friendly: "arion: create editor wp user",
    on_failure: "notify_founder",
    max_retries: 3,
    retry_delay_ms: DEFAULT_POLL_MS,
    action: async (ctx): Promise<ActionResult> => {
      const ex = extras(ctx);
      const r = await arionFetch(ctx, `/onboarding/runner/create-wp-user`, {
        method: "POST",
        body: JSON.stringify({
          tenant_id: ctx.tenant_id,
          site_id: ex.site_id,
          domain: ex.domain,
          run_id: ctx.run_id,
        }),
      });
      if (!r.ok) return { ok: false, error: r.error, retryable_after_ms: r.retryable_after_ms };
      return { ok: true, data: r.data };
    },
    waitFor: waitForPhase([
      "creating_editor_user",
      "minting_publish_credentials",
      "installing_plugins",
      "ready",
    ]),
  };
}

/* Step: ai_website_builder — V2 emitter pipeline. Generates AI copy +
 * images, sets Elementor globals, publishes Home/About/Services/Contact.
 * Slowest step in the flow — image generation can take ~3 min. */
function stepAiWebsiteBuilder(): Step {
  return {
    id: "arion_ai_website_builder",
    label_user_facing: "Designing your website",
    label_friendly: "arion: ai website builder v2",
    on_failure: "notify_founder",
    max_retries: 2,             // image gen is expensive — fewer retries
    retry_delay_ms: SLOW_POLL_MS,
    action: async (ctx): Promise<ActionResult> => {
      const ex = extras(ctx);
      const r = await arionFetch(ctx, `/onboarding/runner/ai-website-builder`, {
        method: "POST",
        body: JSON.stringify({
          tenant_id: ctx.tenant_id,
          site_id: ex.site_id,
          domain: ex.domain,
          run_id: ctx.run_id,
        }),
      });
      if (!r.ok) return { ok: false, error: r.error, retryable_after_ms: r.retryable_after_ms };
      return { ok: true, data: r.data };
    },
    waitFor: waitForPhase(["finalizing_homepage", "finishing_up", "sending_welcome", "ready"]),
  };
}

/* ──────────────────────────────────────────────────────────────────────
 * SEO chain — 4 steps, each maps to an existing arion-api route.
 * Only emitted when has_seo_addon === true.
 * ────────────────────────────────────────────────────────────────────── */

function stepSeoProjectCreate(): Step {
  return {
    id: "arion_seo_project_create",
    label_user_facing: "Setting up your SEO project",
    label_friendly: "arion: seo project create",
    on_failure: "notify_founder",
    max_retries: 3,
    retry_delay_ms: DEFAULT_POLL_MS,
    action: async (ctx): Promise<ActionResult> => {
      const ex = extras(ctx);
      if (!ex.site_id) return { ok: false, error: "site_id missing" };
      const r = await arionFetch(ctx, `/arion/seo/project/create`, {
        method: "POST",
        body: JSON.stringify({ siteId: ex.site_id }),
      });
      if (!r.ok) return { ok: false, error: r.error, retryable_after_ms: r.retryable_after_ms };
      return { ok: true, data: r.data };
    },
  };
}

function stepSeoKeywordsSeed(): Step {
  return {
    id: "arion_seo_keywords_seed",
    label_user_facing: "Seeding your keywords",
    label_friendly: "arion: seo keywords seed",
    on_failure: "notify_founder",
    max_retries: 3,
    retry_delay_ms: DEFAULT_POLL_MS,
    action: async (ctx): Promise<ActionResult> => {
      const ex = extras(ctx);
      if (!ex.site_id) return { ok: false, error: "site_id missing" };
      const r = await arionFetch(ctx, `/onboarding/runner/seo-keywords-seed`, {
        method: "POST",
        body: JSON.stringify({
          tenant_id: ctx.tenant_id,
          site_id: ex.site_id,
          questionnaire: ex.questionnaire || {},
          run_id: ctx.run_id,
        }),
      });
      if (!r.ok) return { ok: false, error: r.error, retryable_after_ms: r.retryable_after_ms };
      return { ok: true, data: r.data };
    },
  };
}

function stepSeoCompetitorsSeed(): Step {
  return {
    id: "arion_seo_competitors_seed",
    label_user_facing: "Linking your competitors",
    label_friendly: "arion: seo competitors seed",
    on_failure: "notify_founder",
    max_retries: 3,
    retry_delay_ms: DEFAULT_POLL_MS,
    action: async (ctx): Promise<ActionResult> => {
      const ex = extras(ctx);
      if (!ex.site_id) return { ok: false, error: "site_id missing" };
      const r = await arionFetch(ctx, `/onboarding/runner/seo-competitors-seed`, {
        method: "POST",
        body: JSON.stringify({
          tenant_id: ctx.tenant_id,
          site_id: ex.site_id,
          questionnaire: ex.questionnaire || {},
          run_id: ctx.run_id,
        }),
      });
      if (!r.ok) return { ok: false, error: r.error, retryable_after_ms: r.retryable_after_ms };
      return { ok: true, data: r.data };
    },
  };
}

function stepSeoConfigureTier(): Step {
  return {
    id: "arion_seo_configure_tier",
    label_user_facing: "Tuning your SEO settings",
    label_friendly: "arion: seo configure tier (engines + airt)",
    on_failure: "notify_founder",
    max_retries: 3,
    retry_delay_ms: DEFAULT_POLL_MS,
    action: async (ctx): Promise<ActionResult> => {
      const ex = extras(ctx);
      if (!ex.site_id) return { ok: false, error: "site_id missing" };
      const r = await arionFetch(ctx, `/arion/seo/project/reconfigure`, {
        method: "POST",
        body: JSON.stringify({ siteId: ex.site_id }),
      });
      if (!r.ok) return { ok: false, error: r.error, retryable_after_ms: r.retryable_after_ms };
      return { ok: true, data: r.data };
    },
  };
}

/* ──────────────────────────────────────────────────────────────────────
 * Google + Bing dual-path steps (Brandon-locked 2026-06-23)
 *
 * Each provider has THREE steps, gated on the customer's answer:
 *
 *   probe  → calls /onboarding/{google|bing}-oauth/setup-probe with
 *            ctx.{google|bing}_setup_answer. The backend persists
 *            arion.site.{google|bing}_setup_mode and returns the route.
 *            Probe writes ex.{google|bing}_setup_mode onto ctx so the
 *            branched step downstream knows which branch to fire.
 *
 *   byo    → standard OAuth → popup → existing /google/callback writes
 *            the per-tenant tokens onto arion.site. action() returns
 *            ok once the authUrl has been delivered + opened; waitFor()
 *            polls until the site row reports the connection.
 *
 *   ia     → POST /onboarding/{google|bing}-oauth/auto-provision. The
 *            backend uses the IA master service account to create GA4 +
 *            GSC + GBP (or Bing site) under our org, then invites the
 *            customer as Admin/Owner. action() drives the entire
 *            provision + invite in one round-trip; waitFor() then polls
 *            the status endpoint until the connection booleans flip.
 *
 * The branched step is a SINGLE Step object that internally chooses byo
 * vs ia based on extras(ctx).{google|bing}_setup_mode. This keeps the
 * UI timeline at a constant length (probe + connect = 2 entries per
 * provider) regardless of which branch fires.
 *
 * Bing OAuth is skip-allowed because Bing Webmaster doesn't gate any
 * downstream feature — purely additive search-engine coverage.
 * ────────────────────────────────────────────────────────────────────── */

interface GoogleProbeReply {
  data?: {
    route?: "byo" | "ia";
    mode?: "byo" | "ia_managed" | "auto_byo" | "auto_ia";
    configured?: boolean;
    warning?: string | null;
    probe?: Record<string, unknown>;
  };
}

interface BingProbeReply {
  data?: {
    route?: "byo" | "ia";
    mode?: "byo" | "ia_managed" | "auto_byo" | "auto_ia";
    configured?: boolean;
    warning?: string | null;
    probe?: Record<string, unknown>;
  };
}

/* Step: arion_google_setup_probe — single-shot. Persists the customer's
 * answer, hits the backend probe when "not_sure", writes the resolved
 * mode onto ctx so the next step knows which branch to fire. */
function stepGoogleSetupProbe(): Step {
  return {
    id: "arion_google_setup_probe",
    label_user_facing: "Checking your Google setup",
    label_friendly: "arion: google setup probe (yes/no/not_sure routing)",
    on_failure: "retry",
    max_retries: 3,
    retry_delay_ms: 2000,
    action: async (ctx): Promise<ActionResult> => {
      const ex = extras(ctx);
      if (!ex.site_id) return { ok: false, error: "site_id missing" };
      const answer = ex.google_setup_answer || "not_sure";
      const r = await arionFetch<GoogleProbeReply>(ctx, `/onboarding/google-oauth/setup-probe`, {
        method: "POST",
        body: JSON.stringify({
          tenant_id: ctx.tenant_id,
          site_id: ex.site_id,
          answer,
        }),
      });
      if (!r.ok) return { ok: false, error: r.error, retryable_after_ms: r.retryable_after_ms };
      const mode = (r.data as GoogleProbeReply | undefined)?.data?.mode || "byo";
      // Stuff the resolved mode onto ctx for the connect step. The engine
      // treats ctx as immutable, so we mutate the extras passthrough.
      (ctx.business_profile as ArionRunnerExtras).google_setup_mode = mode;
      return { ok: true, data: r.data };
    },
  };
}

/* Step: arion_google_oauth — the connect step. Branches on
 * ex.google_setup_mode written by the probe step. */
function stepGoogleOauth(): Step {
  return {
    id: "arion_google_oauth",
    label_user_facing: "Talking with Google",
    label_friendly: "arion: google connect (byo OR ia auto-provision)",
    on_failure: "notify_founder",
    max_retries: 3,
    retry_delay_ms: SLOW_POLL_MS,
    action: async (ctx): Promise<ActionResult> => {
      const ex = extras(ctx);
      if (!ex.site_id) return { ok: false, error: "site_id missing" };
      const mode = ex.google_setup_mode || "byo";

      // IA-managed branch — provision GA4 + GSC + GBP under our master
      // account, invite the customer's email as Admin / Owner.
      if (mode === "ia_managed" || mode === "auto_ia") {
        const r = await arionFetch(ctx, `/onboarding/google-oauth/auto-provision`, {
          method: "POST",
          body: JSON.stringify({
            tenant_id: ctx.tenant_id,
            site_id: ex.site_id,
            business_name: ex.business_name || null,
            contact_email: ex.contact_email || null,
          }),
        });
        if (!r.ok) {
          // If the IA master path is unconfigured (503), fall back to BYO
          // automatically so the customer isn't blocked.
          if (r.status === 503) {
            (ctx.business_profile as ArionRunnerExtras).google_setup_mode = "byo";
            // Fall through to BYO branch by recursing once.
            return stepGoogleOauth().action(ctx);
          }
          return { ok: false, error: r.error, retryable_after_ms: r.retryable_after_ms };
        }
        return { ok: true, data: r.data };
      }

      // BYO branch — standard OAuth. Same UX as the legacy single-step
      // flow: ask backend for an authUrl, pop it in a new tab.
      const r = await arionFetch<{ data?: { authUrl?: string } } | { authUrl?: string }>(
        ctx,
        `/onboarding/google-oauth/byo-start`,
        {
          method: "POST",
          body: JSON.stringify({
            tenant_id: ctx.tenant_id,
            site_id: ex.site_id,
            returnUrl: typeof window !== "undefined" ? window.location.href : "",
          }),
        },
      );
      if (!r.ok) return { ok: false, error: r.error, retryable_after_ms: r.retryable_after_ms };
      const authUrl = (r.data as { data?: { authUrl?: string } } | undefined)?.data?.authUrl
        || (r.data as { authUrl?: string } | undefined)?.authUrl
        || null;
      if (typeof window !== "undefined" && authUrl) {
        try { window.open(authUrl, "_blank", "noopener,noreferrer"); }
        catch { /* popup blocked — user will retry */ }
      }
      return { ok: true, data: { authUrl, mode } };
    },
    waitFor: async (ctx) => {
      const ex = extras(ctx);
      if (!ex.site_id) return { ok: false, error: "site_id missing" };
      const r = await arionFetch<{ data?: { done?: boolean; gsc_connected?: boolean; ga4_connected?: boolean; gbp_connected?: boolean } }>(
        ctx,
        `/onboarding/google-oauth/status/${encodeURIComponent(ex.site_id)}`,
      );
      if (!r.ok) return { ok: false, error: r.error, retryable_after_ms: r.retryable_after_ms };
      const status = (r.data as { data?: Record<string, unknown> } | undefined)?.data
        || (r.data as Record<string, unknown> | undefined)
        || {};
      if (status.done) return { ok: true, data: status };
      return { ok: false };
    },
  };
}

/* Step: arion_push_ga4_gtag — F-Onb-D1. Immediately after Google OAuth
 * lands the GA4 property (arion.site.ga4_measurement_id populated), push
 * the measurement_id to the IA WordPress plugin so it auto-injects the
 * gtag.js snippet on wp_head. Runs before Bing so the tracker is live on
 * the site the moment the customer sees "Google connected". Skip-allowed:
 * a customer with `ia_ga4_gtag_enabled` filtered off, or a BYO GA4 that
 * failed to persist, shouldn't block the whole runner. */
function stepPushGa4Gtag(): Step {
  return {
    id: "arion_push_ga4_gtag",
    label_user_facing: "Turning on site analytics",
    label_friendly: "arion: push GA4 measurement_id to IA plugin (gtag inject)",
    on_failure: "skip_allowed",
    max_retries: 2,
    retry_delay_ms: DEFAULT_POLL_MS,
    action: async (ctx): Promise<ActionResult> => {
      const ex = extras(ctx);
      if (!ex.site_id) return { ok: false, error: "site_id missing" };
      const r = await arionFetch(ctx, `/onboarding/runner/push-ga4-measurement-id`, {
        method: "POST",
        body: JSON.stringify({
          tenant_id: ctx.tenant_id,
          site_id: ex.site_id,
        }),
      });
      if (!r.ok) return { ok: false, error: r.error, retryable_after_ms: r.retryable_after_ms };
      return { ok: true, data: r.data };
    },
  };
}

/* Step: arion_bing_setup_probe — same shape as google probe. */
function stepBingSetupProbe(): Step {
  return {
    id: "arion_bing_setup_probe",
    label_user_facing: "Checking your Bing setup",
    label_friendly: "arion: bing setup probe (yes/no/not_sure routing)",
    on_failure: "skip_allowed",      // Bing is optional end-to-end
    max_retries: 2,
    retry_delay_ms: 2000,
    action: async (ctx): Promise<ActionResult> => {
      const ex = extras(ctx);
      if (!ex.site_id) return { ok: false, error: "site_id missing" };
      const answer = ex.bing_setup_answer || "not_sure";
      const r = await arionFetch<BingProbeReply>(ctx, `/onboarding/bing-oauth/setup-probe`, {
        method: "POST",
        body: JSON.stringify({
          tenant_id: ctx.tenant_id,
          site_id: ex.site_id,
          answer,
        }),
      });
      if (!r.ok) return { ok: false, error: r.error, retryable_after_ms: r.retryable_after_ms };
      const mode = (r.data as BingProbeReply | undefined)?.data?.mode || "byo";
      (ctx.business_profile as ArionRunnerExtras).bing_setup_mode = mode;
      return { ok: true, data: r.data };
    },
  };
}

/* Step: arion_bing_oauth — branches on ex.bing_setup_mode. */
function stepBingOauth(): Step {
  return {
    id: "arion_bing_oauth",
    label_user_facing: "Connecting to Bing",
    label_friendly: "arion: bing connect (byo OR ia auto-provision)",
    on_failure: "skip_allowed",
    max_retries: 2,
    retry_delay_ms: SLOW_POLL_MS,
    action: async (ctx): Promise<ActionResult> => {
      const ex = extras(ctx);
      if (!ex.site_id) return { ok: false, error: "site_id missing" };
      const mode = ex.bing_setup_mode || "byo";

      // IA-managed branch — auto-connect under master + invite customer.
      if (mode === "ia_managed" || mode === "auto_ia") {
        const r = await arionFetch(ctx, `/onboarding/bing-oauth/auto-provision`, {
          method: "POST",
          body: JSON.stringify({
            tenant_id: ctx.tenant_id,
            site_id: ex.site_id,
            contact_email: ex.contact_email || null,
          }),
        });
        if (!r.ok) {
          if (r.status === 503) {
            (ctx.business_profile as ArionRunnerExtras).bing_setup_mode = "byo";
            return stepBingOauth().action(ctx);
          }
          return { ok: false, error: r.error, retryable_after_ms: r.retryable_after_ms };
        }
        return { ok: true, data: r.data };
      }

      // BYO branch — defer to the legacy runner endpoint that the
      // wizard's existing UI uses to walk the customer through pasting
      // their Bing Webmaster API key.
      const r = await arionFetch(ctx, `/onboarding/runner/bing-oauth-start`, {
        method: "POST",
        body: JSON.stringify({
          tenant_id: ctx.tenant_id,
          site_id: ex.site_id,
          run_id: ctx.run_id,
        }),
      });
      if (!r.ok) return { ok: false, error: r.error, retryable_after_ms: r.retryable_after_ms };
      return { ok: true, data: r.data };
    },
    waitFor: async (ctx) => {
      const ex = extras(ctx);
      if (!ex.site_id) return { ok: false, error: "site_id missing" };
      const r = await arionFetch<{ data?: { done?: boolean; bing_connected?: boolean } }>(
        ctx,
        `/onboarding/bing-oauth/status/${encodeURIComponent(ex.site_id)}`,
      );
      if (!r.ok) return { ok: false, error: r.error, retryable_after_ms: r.retryable_after_ms };
      const status = (r.data as { data?: Record<string, unknown> } | undefined)?.data
        || (r.data as Record<string, unknown> | undefined)
        || {};
      if (status.done) return { ok: true, data: status };
      return { ok: false };
    },
  };
}

/* ──────────────────────────────────────────────────────────────────────
 * Public builder
 * ────────────────────────────────────────────────────────────────────── */

/* ──────────────────────────────────────────────────────────────────────
 * Workflow node manifest (P0-4, Agency Foundation build 2026-07-04)
 *
 * The ORDER + conditional inclusion of ARION onboarding steps is now
 * declared as DATA — a per-workflow manifest keyed by workflow_key that
 * mirrors the seeded node rows in oliver.automation_rule 1:1
 * (workflow_key + node_seq + action_params_json.step_id + conditional).
 * Each manifest entry keeps a reference to the CODE builder that owns the
 * step's action/waitFor/verify closures (those cannot live in the DB).
 *
 * buildArionSteps() materializes a manifest into the EXACT same Step[] it
 * returned before this refactor — this changes ONLY where the orchestrator
 * sources its ordered list, not any provisioning route and not the
 * arion-func phase order.
 *
 * Phase 0 keeps the manifest in code (the single runtime source of order);
 * the DB node rows are the OBSERVE copy the ARGUS Workflow surface renders.
 * Converging the runtime source onto a DB fetch is the deferred convergence
 * step (contract §7) — deliberately NOT done in Phase 0 so the
 * provisioning-critical path gains no new runtime failure mode.
 * ────────────────────────────────────────────────────────────────────── */

interface ArionStepFlags {
  has_seo_addon: boolean;
}

interface ArionWorkflowNode {
  /** step_id — matches the seeded oliver.automation_rule node row. */
  id: string;
  /** Code builder owning this step's action/waitFor/verify closures. */
  build: () => Step;
  /** Optional conditional inclusion; omitted = always included. */
  when?: (flags: ArionStepFlags) => boolean;
}

const seoOn = (f: ArionStepFlags): boolean => f.has_seo_addon === true;

/**
 * Manifests keyed by workflow_key (mirror oliver.automation_rule rows):
 *   onboarding.arion.purchase  → domain_path purchase | subdomain
 *   onboarding.arion.byo       → domain_path byo | hostinger_existing
 *   onboarding.arion.migrate   → domain_path migrate
 *
 * NOTE: 'arion_plugin_swap' resolves to DIFFERENT builders per workflow —
 * stepPluginStackSwap (purchase: full golden-master) vs stepPluginInstallOnly
 * (byo: IA-plugin-only) — which intentionally share the same step id. This is
 * why the manifest references builder functions, not just step ids.
 */
export const ARION_WORKFLOW_MANIFESTS: Record<string, ArionWorkflowNode[]> = {
  "onboarding.arion.purchase": [
    { id: "arion_questionnaire", build: stepQuestionnaire },
    { id: "arion_hostinger_provision", build: stepHostingerProvision },
    { id: "arion_plugin_swap", build: stepPluginStackSwap },
    { id: "arion_create_wp_user", build: stepCreateWpUser },
    { id: "arion_ai_website_builder", build: stepAiWebsiteBuilder },
    { id: "arion_seo_project_create", build: stepSeoProjectCreate, when: seoOn },
    { id: "arion_seo_keywords_seed", build: stepSeoKeywordsSeed, when: seoOn },
    { id: "arion_seo_competitors_seed", build: stepSeoCompetitorsSeed, when: seoOn },
    { id: "arion_seo_configure_tier", build: stepSeoConfigureTier, when: seoOn },
    { id: "arion_google_setup_probe", build: stepGoogleSetupProbe },
    { id: "arion_google_oauth", build: stepGoogleOauth },
    { id: "arion_push_ga4_gtag", build: stepPushGa4Gtag },
    { id: "arion_bing_setup_probe", build: stepBingSetupProbe },
    { id: "arion_bing_oauth", build: stepBingOauth },
  ],
  "onboarding.arion.byo": [
    { id: "arion_questionnaire", build: stepQuestionnaire },
    { id: "arion_plugin_swap", build: stepPluginInstallOnly },
    { id: "arion_create_wp_user", build: stepCreateWpUser },
    { id: "arion_seo_project_create", build: stepSeoProjectCreate, when: seoOn },
    { id: "arion_seo_keywords_seed", build: stepSeoKeywordsSeed, when: seoOn },
    { id: "arion_seo_competitors_seed", build: stepSeoCompetitorsSeed, when: seoOn },
    { id: "arion_seo_configure_tier", build: stepSeoConfigureTier, when: seoOn },
    { id: "arion_google_setup_probe", build: stepGoogleSetupProbe },
    { id: "arion_google_oauth", build: stepGoogleOauth },
    { id: "arion_push_ga4_gtag", build: stepPushGa4Gtag },
    { id: "arion_bing_setup_probe", build: stepBingSetupProbe },
    { id: "arion_bing_oauth", build: stepBingOauth },
  ],
  "onboarding.arion.migrate": [
    { id: "arion_questionnaire", build: stepQuestionnaire },
    { id: "arion_mark_for_consulting", build: stepMarkForConsulting },
  ],
};

/** domain_path → workflow_key. purchase/subdomain and byo/hostinger_existing
 *  collapse to the same manifest, exactly as the old branching did. */
export function arionWorkflowKey(domain_path: ArionDomainPath): string {
  if (domain_path === "migrate") return "onboarding.arion.migrate";
  if (domain_path === "purchase" || domain_path === "subdomain") return "onboarding.arion.purchase";
  return "onboarding.arion.byo"; // byo | hostinger_existing
}

/** Materialize a manifest into the ordered Step[] the engine walks. */
function materializeArionManifest(nodes: ArionWorkflowNode[], flags: ArionStepFlags): Step[] {
  return nodes.filter((n) => !n.when || n.when(flags)).map((n) => n.build());
}

/**
 * Build the ARION step list for a given domain path + SEO add-on flag.
 *
 * Path matrix (Brandon-locked 2026-06-23):
 *   purchase | subdomain   → full provision + AI WB
 *   byo | hostinger_existing → IA Plugin only, no AI WB
 *   migrate                → questionnaire + flag for consulting; runner stops
 *
 * Output is byte-identical to the pre-P0-4 hardcoded arrays — the manifest
 * is a 1:1 transcription of the old ordered builder calls (SEO chain gated
 * on has_seo_addon in the same position).
 */
export function buildArionSteps(
  domain_path: ArionDomainPath,
  has_seo_addon: boolean,
): Step[] {
  const manifest = ARION_WORKFLOW_MANIFESTS[arionWorkflowKey(domain_path)];
  return materializeArionManifest(manifest, { has_seo_addon });
}

export default buildArionSteps;
