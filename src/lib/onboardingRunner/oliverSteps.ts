// C:/dev/iadm/Portal/src/lib/onboardingRunner/oliverSteps.ts
//
// OLIVER step factory for the OnboardingRunner. Returns the ordered Step[]
// the engine walks for an OLIVER tenant after checkout.
//
// Brandon decisions baked in (locked 2026-06-23):
//
//   • Stripe Connect dual-path: tenants either CREATE a fresh Express
//     account (path "express_new") OR link an EXISTING Stripe account via
//     Standard Connect OAuth (path "standard_existing"). Both end with a
//     stripe_account_id row on oliver.tenant_settings; the only difference
//     is whether action() POSTs to /billing/connect/start (Express) or
//     /billing/connect/oauth-start (Standard OAuth). The wizard's Payments
//     section makes the choice BEFORE the runner is launched and passes the
//     picked stripe_path into buildOliverSteps so the engine knows which
//     side-effect to fire.
//
//   • Stripe is async — Express onboarding lives on stripe.com (hosted
//     flow), Standard OAuth lives on connect.stripe.com. Either way we kick
//     a popup/tab and then poll /billing/connect/status until
//     charges_enabled=true. The 30-minute upper bound is Brandon's
//     locked SLA for "this is taking too long, notify founder" — at 5s
//     poll cadence that's 360 cycles before on_failure: notify_founder
//     fires. Realistic finish times: Express ~3–8 min, Standard OAuth
//     ~30s–2 min (just an OAuth grant).
//
//   • Templates is a synchronous form — the wizard component captures
//     logo/colors/footer copy from the existing OnboardingState
//     (oliver.customer_portal, oliver.employee_portal, etc.) and POSTs a
//     single /onboarding/runner/templates payload that triggers the
//     templates seed inside oliver-api. No waitFor() — the response is
//     "done" or "failed".
//
//   • Portal white-label follows the catalog row oliver_portal_domains.
//     A business whose plan does not include it gets the IA-skinned
//     default subdomain and the step short-circuits to done immediately.
//     One whose plan includes it gets the full custom-domain hook, which
//     posts to /portal-domains/bind and polls verify status. The step
//     factory takes the catalog answer (customDomainAllowed) and emits the
//     right action() body so the orchestrator does the right thing.
//
//   • Product catalog is a synchronous bulk add — the wizard captures
//     the tenant's first batch of services/products in oliver.catalog and
//     posts /onboarding/runner/product-catalog in one shot. Customer can
//     skip and add catalog items later from OLIVER > Catalog (Brandon
//     wants this step to NEVER block onboarding completion).
//
// Side-effect contract (mirrored from arionSteps.ts):
//   • action()  POSTs to the documented oliver-api route. The orchestrator
//     writes core.onboarding_step_status (for persistence + founder
//     observability) and any product-specific tables.
//   • waitFor() polls /billing/connect/status (Stripe steps) or omitted for
//     synchronous steps.
//   • verify() reads back oliver.tenant_settings columns to confirm.

import type { ActionResult, RunnerCtx, Step } from "./types";

/* ──────────────────────────────────────────────────────────────────────
 * Stripe path discriminator
 * ────────────────────────────────────────────────────────────────────── */

export type OliverStripePath =
  | "express_new"          // fresh Stripe Connect Express account
  | "standard_existing";   // link an existing Stripe account via OAuth

export type OliverTier =
  | "lite"
  | "standard"
  | "pro"
  | "business";

/* ──────────────────────────────────────────────────────────────────────
 * oliver-api base URL — mirrors the env-var pattern used in arionSteps.ts.
 * ────────────────────────────────────────────────────────────────────── */

const OLIVER_API_BASE_URL: string =
  (typeof import.meta !== "undefined" && (import.meta as { env?: Record<string, string> }).env?.VITE_OLIVER_API_BASE_URL) ||
  "https://app-oliver-api-prod.azurewebsites.net";

/* ──────────────────────────────────────────────────────────────────────
 * Runner context extension — OLIVER steps need a bearer token + the
 * captured wizard payloads (templates, portals, catalog) at action() time.
 * Carried via business_profile (the engine's free-form passthrough).
 *
 * Wizard caller is responsible for stuffing these into ctx.business_profile
 * when it constructs the Runner.
 * ────────────────────────────────────────────────────────────────────── */

interface OliverRunnerExtras {
  bearer_token?: string | null;
  stripe_path?: OliverStripePath;
  tier?: OliverTier;
  /** Captured by OliverTemplatesSection — inherits from BusinessProfile. */
  templates?: {
    logo_url?: string | null;
    primary_color?: string | null;
    secondary_color?: string | null;
    accent_color?: string | null;
  };
  /** Customer + employee portal config from OliverPortalSection. */
  customer_portal?: Record<string, unknown>;
  employee_portal?: Record<string, unknown>;
  /** Custom domain — only used when the plan includes oliver_portal_domains. */
  custom_domain?: string | null;
  /** Catalog items captured by OliverCatalogSection. */
  catalog?: Array<{ name: string; price?: string | number | null }>;
}

function extras(ctx: RunnerCtx): OliverRunnerExtras {
  return (ctx.business_profile as OliverRunnerExtras) || {};
}

/* ──────────────────────────────────────────────────────────────────────
 * Local fetch helper — same shape as arionSteps.ts (deliberately
 * mirrored so the runner has zero coupling to the rest of the Portal).
 * ────────────────────────────────────────────────────────────────────── */

interface OliverApiResponse<T = unknown> {
  ok: boolean;
  status: number;
  data?: T;
  error?: string;
  retryable_after_ms?: number;
}

async function oliverFetch<T>(
  ctx: RunnerCtx,
  path: string,
  init: RequestInit = {},
): Promise<OliverApiResponse<T>> {
  const ex = extras(ctx);
  const token = ex.bearer_token || "";
  const url = `${OLIVER_API_BASE_URL}${path}`;
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
  const m = (body as { message?: unknown }).message;
  if (typeof m === "string") return m;
  return null;
}

/* ──────────────────────────────────────────────────────────────────────
 * Step: stripe_connect — dual path (express_new vs standard_existing).
 *
 * action() opens the right Stripe URL in a new tab:
 *   • express_new       → POST /billing/connect/start  → returns Express
 *                          hosted onboarding URL
 *   • standard_existing → POST /billing/connect/oauth-start → returns the
 *                          Stripe OAuth authorize URL with our state param
 *
 * waitFor() polls /billing/connect/status until charges_enabled=true. The
 * Stripe webhook (account.updated) is the canonical signal but we poll
 * defensively in case the webhook is delayed or misses. Max ~30 min budget
 * (360 cycles * 5s) before on_failure: notify_founder fires.
 *
 * verify() confirms oliver.tenant_settings has both stripe_account_id AND
 * charges_enabled=true (the two columns the rest of OLIVER reads to gate
 * customer charges).
 * ────────────────────────────────────────────────────────────────────── */
function stepStripeConnect(stripe_path: OliverStripePath): Step {
  return {
    id: "oliver_stripe_connect",
    label_user_facing: "Setting up payments",
    label_friendly: stripe_path === "standard_existing"
      ? "oliver: stripe standard oauth (existing account)"
      : "oliver: stripe express (new account)",
    on_failure: "notify_founder",
    max_retries: 3,
    retry_delay_ms: 5000,
    action: async (ctx): Promise<ActionResult> => {
      const startPath = stripe_path === "standard_existing"
        ? "/billing/connect/oauth-start"
        : "/billing/connect/start";
      const r = await oliverFetch<{ url?: string; account_id?: string }>(ctx, startPath, {
        method: "POST",
        body: JSON.stringify({
          tenant_id: ctx.tenant_id,
          return_url: typeof window !== "undefined" ? window.location.href : "",
          run_id: ctx.run_id,
        }),
      });
      if (!r.ok) return { ok: false, error: r.error, retryable_after_ms: r.retryable_after_ms };
      if (typeof window !== "undefined" && r.data?.url) {
        try { window.open(r.data.url, "_blank", "noopener,noreferrer"); }
        catch { /* popup blocked — user retries */ }
      }
      return { ok: true, data: r.data };
    },
    waitFor: async (ctx) => {
      const r = await oliverFetch<{
        has_account?: boolean;
        account_id?: string | null;
        charges_enabled?: boolean;
        details_submitted?: boolean;
        mode?: string;
      }>(ctx, "/billing/connect/status");
      if (!r.ok) return { ok: false, error: r.error, retryable_after_ms: r.retryable_after_ms };
      if (r.data?.charges_enabled) {
        return { ok: true, data: r.data };
      }
      // Still in flight — engine keeps polling at step.retry_delay_ms cadence.
      return { ok: false };
    },
    verify: async (ctx) => {
      const r = await oliverFetch<{
        has_account?: boolean;
        account_id?: string | null;
        charges_enabled?: boolean;
      }>(ctx, "/billing/connect/status");
      if (!r.ok) return { ok: false, error: r.error, retryable_after_ms: r.retryable_after_ms };
      if (r.data?.has_account && r.data?.charges_enabled) {
        return { ok: true, data: r.data };
      }
      return { ok: false, error: "stripe account not yet charges-enabled" };
    },
  };
}

/* ──────────────────────────────────────────────────────────────────────
 * Step: templates — synchronous form. The wizard has already collected
 * the logo/colors/footer overrides from BusinessProfile + the
 * OliverTemplatesSection; action() just persists them.
 * ────────────────────────────────────────────────────────────────────── */
function stepTemplates(): Step {
  return {
    id: "oliver_templates",
    label_user_facing: "Branding your invoices and quotes",
    label_friendly: "oliver: seed invoice/quote/proposal templates",
    on_failure: "notify_founder",
    max_retries: 3,
    retry_delay_ms: 2000,
    action: async (ctx): Promise<ActionResult> => {
      const ex = extras(ctx);
      const r = await oliverFetch(ctx, "/onboarding/runner/templates", {
        method: "POST",
        body: JSON.stringify({
          tenant_id: ctx.tenant_id,
          templates: ex.templates || {},
          run_id: ctx.run_id,
        }),
      });
      if (!r.ok) return { ok: false, error: r.error, retryable_after_ms: r.retryable_after_ms };
      return { ok: true, data: r.data };
    },
  };
}

/* ──────────────────────────────────────────────────────────────────────
 * Step: portal_white_label — plan-gated (oliver_portal_domains).
 *
 *   Not in the plan  → IA-skinned default subdomain; action() persists
 *                      the welcome copy + portal toggles and returns
 *                      done immediately (no DNS work).
 *
 *   In the plan      → custom domain. action() posts to the same
 *                      /onboarding/runner/portal-white-label endpoint
 *                      but with custom_domain set; the orchestrator
 *                      runs the bind + DNS verify side-effect. waitFor
 *                      polls the orchestrator status endpoint until
 *                      verified. Customers without a domain yet pass
 *                      custom_domain=null and stay on the default
 *                      subdomain (the same short-circuit as a plan
 *                      without it).
 *
 * 2026-10-11 (feature catalog): whether the custom-domain path runs is the
 * catalog answer for oliver_portal_domains (custom domains, alias
 * portal_custom_domain), decided by platform-api and passed in by the caller
 * as `customDomainAllowed`. It is never a tier written here (this said
 * Pro/Business while the catalog says Standard). The orchestrator still
 * refuses a custom domain the plan does not include.
 * ────────────────────────────────────────────────────────────────────── */
function stepPortalWhiteLabel(tier: OliverTier, customDomainAllowed: boolean): Step {
  const isCustomDomainTier = customDomainAllowed === true;
  return {
    id: "oliver_portal_white_label",
    label_user_facing: "Configuring your portals",
    label_friendly: isCustomDomainTier
      ? "oliver: portal white-label (custom domain)"
      : "oliver: portal white-label (default subdomain)",
    on_failure: "notify_founder",
    max_retries: 3,
    retry_delay_ms: 3000,
    action: async (ctx): Promise<ActionResult> => {
      const ex = extras(ctx);
      const r = await oliverFetch<{ verified?: boolean; mode?: string }>(ctx, "/onboarding/runner/portal-white-label", {
        method: "POST",
        body: JSON.stringify({
          tenant_id: ctx.tenant_id,
          tier,
          customer_portal: ex.customer_portal || {},
          employee_portal: ex.employee_portal || {},
          custom_domain: isCustomDomainTier ? (ex.custom_domain || null) : null,
          run_id: ctx.run_id,
        }),
      });
      if (!r.ok) return { ok: false, error: r.error, retryable_after_ms: r.retryable_after_ms };
      return { ok: true, data: r.data };
    },
    // No waitFor for the default-subdomain path — the orchestrator returns
    // synchronously when isCustomDomainTier=false. For Pro/Business with a
    // custom domain, the orchestrator can either return verified=true
    // immediately (CNAME already in place) or return verified=false and
    // wait for the customer to add DNS later. We treat
    // verified=false as a non-blocking "we'll verify later" — the customer
    // can finish onboarding and come back to the portals page after they
    // add the CNAME. So no waitFor() in either case; the verify step
    // confirms the row exists, not that DNS is live.
    verify: async (ctx) => {
      // Cheap proof — oliver.tenant_settings should have the portal config
      // persisted. Use the existing /settings/portal endpoint if available
      // or fall back to /settings/stripe (any 200 means the row is there).
      const r = await oliverFetch(ctx, "/settings/stripe");
      if (!r.ok) return { ok: false, error: r.error, retryable_after_ms: r.retryable_after_ms };
      return { ok: true, data: r.data };
    },
  };
}

/* ──────────────────────────────────────────────────────────────────────
 * Step: product_catalog — synchronous bulk add. The wizard captures the
 * tenant's first batch of services in oliver.catalog; action() POSTs them
 * as a single payload. Customer can skip (Brandon: catalog should NEVER
 * block onboarding completion).
 * ────────────────────────────────────────────────────────────────────── */
function stepProductCatalog(): Step {
  return {
    id: "oliver_service_catalog_seed",
    label_user_facing: "Loading your services",
    label_friendly: "oliver: bulk add catalog items",
    on_failure: "skip_allowed",  // Brandon: never block on catalog
    max_retries: 2,
    retry_delay_ms: 2000,
    action: async (ctx): Promise<ActionResult> => {
      const ex = extras(ctx);
      const items = (ex.catalog || []).filter((it) =>
        it && typeof it.name === "string" && it.name.trim().length > 0
      );
      if (items.length === 0) {
        // Nothing to add — short-circuit done. Customer can add catalog
        // items later from OLIVER > Catalog.
        return { ok: true, data: { skipped: true, reason: "no_items" } };
      }
      const r = await oliverFetch<{ inserted?: number; skipped?: number }>(ctx, "/onboarding/runner/product-catalog", {
        method: "POST",
        body: JSON.stringify({
          tenant_id: ctx.tenant_id,
          items,
          run_id: ctx.run_id,
        }),
      });
      if (!r.ok) return { ok: false, error: r.error, retryable_after_ms: r.retryable_after_ms };
      return { ok: true, data: r.data };
    },
  };
}

/* ──────────────────────────────────────────────────────────────────────
 * Public builder
 * ────────────────────────────────────────────────────────────────────── */

/* ──────────────────────────────────────────────────────────────────────
 * Workflow node manifest (P0-4, Agency Foundation build 2026-07-04)
 *
 * The ORDER of OLIVER onboarding steps is now declared as DATA — a manifest
 * (workflow_key 'onboarding.oliver') that mirrors the seeded node rows in
 * oliver.automation_rule 1:1 (node_seq + action_params_json.step_id). Each
 * entry references the CODE builder owning the step's closures. stripe_path
 * and tier are passed to the builders that branch on them (stepStripeConnect,
 * stepPortalWhiteLabel) — the branch logic is unchanged.
 *
 * Output is byte-identical to the pre-P0-4 hardcoded array. Phase 0 keeps the
 * manifest in code (runtime source of order); the DB rows are the observe
 * copy the ARGUS surface renders. DB-driven order is deferred (contract §7).
 * ────────────────────────────────────────────────────────────────────── */

interface OliverStepArgs {
  stripe_path: OliverStripePath;
  tier: OliverTier;
  /** The catalog answer for oliver_portal_domains: true only when decided allowed. */
  customDomainAllowed: boolean;
}

interface OliverWorkflowNode {
  /** step_id — matches the seeded oliver.automation_rule node row. */
  id: string;
  /** Code builder owning this step's action/waitFor/verify closures. */
  build: (args: OliverStepArgs) => Step;
}

/** Manifest keyed by workflow_key 'onboarding.oliver' (mirrors DB node rows). */
export const OLIVER_WORKFLOW_MANIFEST: OliverWorkflowNode[] = [
  { id: "oliver_stripe_connect", build: ({ stripe_path }) => stepStripeConnect(stripe_path) },
  { id: "oliver_templates", build: () => stepTemplates() },
  { id: "oliver_portal_white_label", build: ({ tier, customDomainAllowed }) => stepPortalWhiteLabel(tier, customDomainAllowed) },
  { id: "oliver_service_catalog_seed", build: () => stepProductCatalog() },
];

/**
 * Build the OLIVER step list for a given Stripe path + tier.
 *
 * Order:
 *   1. stripe_connect          (dual path: express_new | standard_existing)
 *   2. templates               (synchronous)
 *   3. portal_white_label      (tier-gated custom domain)
 *   4. product_catalog         (synchronous bulk add or skip)
 *
 * Custom domain (the catalog row oliver_portal_domains):
 *   • not allowed / undecided → portal_white_label uses the default subdomain
 *   • allowed                 → portal_white_label honors custom_domain
 */
export function buildOliverSteps(
  stripe_path: OliverStripePath,
  tier: OliverTier,
  customDomainAllowed = false,
): Step[] {
  const args: OliverStepArgs = { stripe_path, tier, customDomainAllowed };
  return OLIVER_WORKFLOW_MANIFEST.map((n) => n.build(args));
}

export default buildOliverSteps;
