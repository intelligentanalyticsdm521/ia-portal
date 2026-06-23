// C:/dev/iadm/Portal/src/lib/onboardingRunner/types.ts
//
// OnboardingRunner — type contracts (engine layer only; not wired into the
// wizard yet). Drives the post-checkout sequential setup flow that handles
// ARION Hostinger provision, plugin swap, SEO project create, Google/Bing
// OAuth, OLIVER Stripe Connect, portal white-label, SPARK welcome email,
// etc.
//
// Brandon design decisions baked in here:
//   #2  Save-and-continue gate per step — every step's StepRecord captures
//       enough state (status + evidence) to resume from where the user left
//       off if they close the browser mid-run. The OnboardingRunnerProgress
//       UI renders a "Save & continue later" affordance per step.
//   #3  Retry → server-busy → notify-founder ladder. Each step declares
//       max_retries + retry_delay_ms; on_failure picks the terminal route
//       when the ladder bottoms out.
//
// IMPORTANT: keep this file dependency-free — it is imported by both the
// runner and the React progress component, and we want zero React/SQL/
// HTTP-client coupling so the same types compile in a Node worker context
// later if we move execution server-side.

/* ──────────────────────────────────────────────────────────────────────
 * Step authoring contract
 * ────────────────────────────────────────────────────────────────────── */

/**
 * What to do when a step exhausts its retry budget.
 *   - "retry"            : engine keeps the step in failed_retrying state
 *                          and waits for explicit user click before another
 *                          attempt (manual retry).
 *   - "notify_founder"   : engine flips the step to failed_server_busy,
 *                          posts a notification to the founder tenant
 *                          (handled by the backend status emitter), and
 *                          surfaces the "we have been notified" copy.
 *   - "skip_allowed"     : engine offers a "Skip this step" button. The
 *                          downstream flow must tolerate the step being
 *                          absent (e.g. optional Bing OAuth).
 */
export type StepFailureMode = "retry" | "notify_founder" | "skip_allowed";

/**
 * Step runtime statuses. The OnboardingRunnerProgress component switches
 * its icon + copy off these.
 *
 *   pending            : queued, not yet started
 *   running            : action() in flight
 *   waiting            : action() returned ok, now polling waitFor() until
 *                        the backend reports the side-effect is complete
 *                        (e.g. Hostinger SSH job still running). UI shows
 *                        the friendly waiting label.
 *   verifying          : waitFor() resolved, verify() in flight to confirm
 *                        the side-effect actually happened (idempotency
 *                        check — separate from waitFor's "is it done" gate)
 *   done               : verify() returned ok; engine advances to next step
 *   failed_retrying    : action/waitFor/verify failed; engine is inside the
 *                        retry ladder. Copy: "Retrying… attempt N of M"
 *   failed_server_busy : retry budget exhausted; on_failure was
 *                        "notify_founder". Copy: "We are trying — this is
 *                        taking longer than usual. We have been notified
 *                        and will reach out shortly. You can also try
 *                        again."
 *   skipped            : user clicked Skip (only valid when on_failure ===
 *                        "skip_allowed").
 */
export type StepStatus =
  | "pending"
  | "running"
  | "waiting"
  | "verifying"
  | "done"
  | "failed_retrying"
  | "failed_server_busy"
  | "skipped";

/**
 * Outcome shape every Step lifecycle hook returns. Mirrors the typical
 * { ok, data, error } envelope our backend uses, with one extra field —
 * retryable_after_ms — for steps that hit a provider rate limit and want
 * the engine to back off for a specific window (Hostinger 429, Stripe rate
 * limit, Google quota, etc.).
 */
export interface ActionResult<TData = unknown> {
  ok: boolean;
  /** Whatever payload the next hook (waitFor/verify) needs. */
  data?: TData;
  /** Human-readable error string; logged + surfaced in StepRecord.error. */
  error?: string;
  /**
   * If set, engine will wait at least this many ms before its next attempt
   * regardless of the step's configured retry_delay_ms. Used for
   * provider-side back-off signals (Retry-After header etc.).
   */
  retryable_after_ms?: number;
}

/**
 * Step definition. Authors register steps in a per-product array (ARION,
 * OLIVER, SPARK) and pass the array into createRunner().
 *
 * Lifecycle: action → waitFor → verify → done
 *   - action  : start the side-effect (HTTP POST to backend job kick-off,
 *               OAuth redirect prep, etc.). Returns ActionResult with any
 *               handle the next hooks need (job_id, run_id, etc.).
 *   - waitFor : optional. Engine calls this on a polling loop until ok ===
 *               true. Returning ok: false with no error keeps the engine
 *               in "waiting" status; returning ok: false with an error
 *               kicks the retry ladder. Skip this hook when action() is
 *               synchronous (e.g. a write to our own DB).
 *   - verify  : confirm the side-effect actually happened (separate
 *               idempotency check). Returning ok: false here re-runs the
 *               full step from action() — verify failure is treated as
 *               "the action lied" and is the strongest retry trigger.
 */
export interface Step<TCtx = RunnerCtx, TData = unknown> {
  /** Stable machine id (e.g. "arion_hostinger_provision"). Used as both
   *  the labels.ts registry key and the StepRecord.step_id. */
  id: string;

  /** Copy shown in the wizard timeline — short, declarative, present
   *  tense. e.g. "Spinning up your WordPress site". Resolved via
   *  labels.ts; the inline label_user_facing is the fallback when the
   *  registry lookup misses. */
  label_user_facing: string;

  /** Internal nickname for founder dashboards / logs. e.g.
   *  "arion: hostinger ssh provision". Never shown to customers. */
  label_friendly: string;

  /** Kick off the side-effect. */
  action: (ctx: TCtx) => Promise<ActionResult<TData>>;

  /** Optional poll hook for async side-effects. */
  waitFor?: (ctx: TCtx, data: TData | undefined) => Promise<ActionResult<TData>>;

  /** Idempotency confirmation. */
  verify?: (ctx: TCtx, data: TData | undefined) => Promise<ActionResult<TData>>;

  /** Terminal route when retry budget is exhausted. */
  on_failure: StepFailureMode;

  /** Engine attempts up to this many times before triggering on_failure. */
  max_retries: number;

  /** Default back-off between attempts (ActionResult.retryable_after_ms
   *  overrides on a per-attempt basis). */
  retry_delay_ms: number;
}

/* ──────────────────────────────────────────────────────────────────────
 * Runtime records (what the UI renders + what we persist to
 * core.onboarding_step_status)
 * ────────────────────────────────────────────────────────────────────── */

/**
 * Per-step runtime row. Mirrors the SQL row in
 * core.onboarding_step_status (migration 025) field-for-field so the
 * client/server contracts stay aligned.
 */
export interface StepRecord {
  step_id: string;
  status: StepStatus;
  attempt_count: number;
  started_at?: string;   // ISO-8601
  completed_at?: string; // ISO-8601
  error?: string;
  /** Free-form proof-of-work payload (e.g. provision_code, job_id,
   *  stripe_account_id). Persisted as evidence_json on the SQL side. */
  evidence?: Record<string, unknown>;
}

/* ──────────────────────────────────────────────────────────────────────
 * Runner context
 * ────────────────────────────────────────────────────────────────────── */

/**
 * Shape of cart items the runner needs to inspect when deciding which
 * conditional steps fire (e.g. SPARK welcome email only if SPARK in cart).
 * Kept minimal — full signupCart.ts CartItem type is bigger than the
 * engine cares about. Augment as new step authors need extra fields.
 */
export interface RunnerCartItem {
  product: "arion" | "oliver" | "spark";
  plan?: string | null;
  seo?: string | null;
  tier?: string | null;
  volume?: string | null;
  addon?: string | null;
}

/**
 * Business profile passthrough — the runner doesn't validate the shape,
 * it just hands each step what it needs. Mirrors the unified
 * business_profile object used by onboardingApi.ts so step authors can
 * write `ctx.business_profile.condensed_business_name` without coupling
 * to the larger Portal types.
 */
export type RunnerBusinessProfile = Record<string, unknown>;

/**
 * Status-change callback the runner fires every time a StepRecord
 * transitions. UI subscribes to this to re-render the timeline; backend
 * persistence layer subscribes to mirror state into
 * core.onboarding_step_status.
 */
export type StepChangeCallback = (record: StepRecord) => void;

/**
 * Run-complete callback — fired once when every step is either done or
 * skipped (or when one step lands in failed_server_busy with no remaining
 * retries). Receives the full record array so the caller can decide what
 * to render next (success screen vs "we will reach out" screen).
 */
export type RunCompleteCallback = (records: StepRecord[]) => void;

/**
 * Everything every step's action/waitFor/verify receives. Engine never
 * mutates this object; steps must not mutate it either (immutable
 * convention — easier to reason about replays).
 */
export interface RunnerCtx {
  tenant_id: string;
  /** Convenience flag — set to the cart's primary product when a single-
   *  product flow, otherwise "multi". */
  product: "arion" | "oliver" | "spark" | "multi";
  cart_items: RunnerCartItem[];
  business_profile: RunnerBusinessProfile;
  /**
   * UUID for this onboarding run. Persisted on every step row so multiple
   * re-runs (e.g. founder rerun for a stuck tenant) stay separable.
   * Generated by createRunner() if not supplied.
   */
  run_id: string;
  /** Callbacks the engine fires; see types above. */
  callbacks: {
    on_step_change: StepChangeCallback;
    on_run_complete?: RunCompleteCallback;
  };
}

/* ──────────────────────────────────────────────────────────────────────
 * Public runner interface (what createRunner returns)
 * ────────────────────────────────────────────────────────────────────── */

export interface Runner {
  /** Start sequential execution from the first pending step. */
  start: () => Promise<void>;
  /** Manual retry trigger for a step in failed_retrying or
   *  failed_server_busy state. */
  retry: (step_id: string) => Promise<void>;
  /** Mark a step skipped when on_failure === "skip_allowed". */
  skip: (step_id: string) => void;
  /** Read-only snapshot of every StepRecord (used by the UI to hydrate
   *  on remount). */
  snapshot: () => StepRecord[];
}
