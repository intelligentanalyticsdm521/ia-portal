// test/fixtures/argus-team-server-shapes.mjs — what the servers ACTUALLY send
// to ARGUS → Your team, copied from the committed routes and runners on the
// release line (2026-10-08). The Portal's tests derive the screen from these,
// not from a shape the Portal wished for: a wire mismatch between streams is
// exactly what a source-regex test cannot see.
//
// Each export names the file and lines it was copied from. When a server
// changes its answer, change the fixture here with it; the lib tests then say
// what the screen does with the new answer.
//
// Ids below are made up for the fixture (fixtures are exempt from the
// no-business-named check); no business is named.

/* ── platform-api routes/me/team.js ─────────────────────────────────────── */

/** GET /me/team/:employeeKey (routes/me/team.js:202-206): NO product_owned, NO on_team. */
export const EMPLOYEE_ANSWER = Object.freeze({
  employee: { employee_key: "web", display_name: "The web person", job_line: "Writes your posts and answers your reviews.", product: "arion" },
  jobs: [],
});

/** GET /me/team (routes/me/team.js:104-120): the only answer with product_owned and on_team. */
export const TEAM_LIST_NO_ARION = Object.freeze({
  employees: [
    { employee_key: "web", display_name: "The web person", job_line: "x", product: "arion", product_owned: false, on_team: { yes: false, source: null } },
    { employee_key: "marketer", display_name: "The marketer", job_line: "x", product: "spark", product_owned: true, on_team: { yes: true, source: "founder" } },
    { employee_key: "office", display_name: "The office administrator", job_line: "x", product: "oliver", product_owned: null, on_team: { yes: false, source: null } },
  ],
});

/* ── arion-api POST /arion/agents/run → { data: runTick summary } ───────── */
// lib/contentAgent/tick.js:169-173 (empty), :217, :233, :249, :315, :323, :331; pick() :391-396

export const CONTENT_TICK = Object.freeze({
  drafted: (drafted, approvedInAdvance = 0) => ({ data: {
    disabled: false, tenants: 1, ran: 1, skippedHalted: 0, failed: 0, margins: [], alerts: [], notifications: [], learned: [],
    productOff: { skipped: [] },
    results: [{ tenantId: "T", jobKey: "arion.blog_posts", contentType: "blog_post", provider: "x", runId: "r1", status: "completed", outcome: "selected", drafted, escalated: 0, approvedInAdvance, costUsd: 0.01 }],
  } }),
  tickError: { data: { disabled: false, tenants: 1, ran: 0, skippedHalted: 0, failed: 1, productOff: { skipped: [] },
    results: [{ tenantId: "T", status: "tick_error", error: "Cannot read properties of undefined" }] } },
  briefUnreadable: { data: { tenants: 1, ran: 0, failed: 0, productOff: { skipped: [] },
    results: [{ tenantId: "T", jobKey: "arion.blog_posts", status: "skipped", outcome: "failed", words: "I couldn't read your business details, so I didn't write anything." }] } },
  blocked: { data: { tenants: 1, ran: 0, failed: 0, productOff: { skipped: [] },
    results: [{ tenantId: "T", jobKey: "arion.blog_posts", status: "completed", outcome: "blocked", words: "I'm waiting for you to tell me what you sell (Settings → Your business)." }] } },
  suiteCeiling: { data: { tenants: 1, ran: 1, failed: 0, productOff: { skipped: [] },
    results: [{ tenantId: "T", jobKey: "arion.blog_posts", runId: null, status: "halted", outcome: "suite_cost_ceiling", drafted: 0, escalated: 0, approvedInAdvance: 0, costUsd: 0 }] } },
  skippedHalted: { data: { tenants: 1, ran: 0, failed: 0, skippedHalted: 1, productOff: { skipped: [] },
    results: [{ tenantId: "T", status: "skipped_halted", reason: "Spending limit reached" }] } },
  nothingToWrite: { data: { tenants: 1, ran: 1, failed: 0, productOff: { skipped: [] },
    results: [{ tenantId: "T", jobKey: "arion.blog_posts", runId: "r2", status: "completed", outcome: "no_qualifying_topic", drafted: 0, escalated: 0, approvedInAdvance: 0 }] } },
  stateUnreadable: { data: { disabled: false, tenants: 0, ran: 0, failed: 0, results: [], productOff: { skipped: [] },
    jobStateUnreadable: true, words: "ARGUS couldn't check which jobs are switched on, so it did nothing this time.", error: "timeout" } },
  killSwitch: { data: { disabled: true, killSwitch: "X", tenants: 0, ran: 0, results: [] } },
  productOff: { data: { tenants: 0, ran: 0, failed: 0, results: [], productOff: { skipped: [{ tenantId: "T", note: "the web person didn't write anything" }] } } },
});

/* ── arion-api POST /arion/review-replies/run → { data: runReviewReplyTick summary } ── */
// lib/gbpReplyRunner.js:184-187 (summary), :228, :236, :244, :271, :289, :324, :337-345

const reviewSummary = (over) => ({ data: {
  tenants: 1, sitesEligible: 1, drafted: 0, held: 0, posted: 0, failed: 0, skippedInsufficientCredits: 0,
  runs: [], errors: [], productOff: { skipped: [] }, ...over,
} });

export const REVIEW_TICK = Object.freeze({
  automaticMixed: reviewSummary({ drafted: 2, held: 1, posted: 1, runs: [{ tenantId: "T", runId: "r", outcome: "worked", seen: 2, drafted: 2, held: 1, posted: 1 }] }),
  heldTwo: reviewSummary({ drafted: 2, held: 2, runs: [{ tenantId: "T", runId: "r", outcome: "worked", seen: 2, drafted: 2, held: 2, posted: 0 }] }),
  googleFetchFailed: reviewSummary({ errors: ["fetchReviews S: 401 unauthorised"], runs: [{ tenantId: "T", runId: "r", outcome: "nothing_due", seen: 0, drafted: 0, held: 0, posted: 0 }] }),
  briefBlocked: reviewSummary({ runs: [{ tenantId: "T", runId: "r", outcome: "blocked", words: "I couldn't read your business details, so I didn't answer any reviews." }] }),
  nothingDue: reviewSummary({ runs: [{ tenantId: "T", runId: "r", outcome: "nothing_due", seen: 0, drafted: 0, held: 0, posted: 0 }] }),
  postRefused: reviewSummary({ drafted: 1, held: 1, failed: 1, runs: [{ tenantId: "T", runId: "r", outcome: "worked", seen: 1, drafted: 1, held: 1, posted: 0 }] }),
});

/* ── oliver-api POST /qtc-agent/run, /fieldops-agent/run → { data: runCycle } (oliverApi strips data) ── */
// lib/qtcAgent/runner.js:116-146, :290, :296; lib/fieldopsAgent/runner.js:44, :116, :124

export const OLIVER_RUN = Object.freeze({
  qtcNotEnabled: { runId: null, status: "skipped", outcome: "not_enabled", drafted: 0, alerts: [] },
  qtcSuiteCeiling: { runId: null, status: "halted", outcome: "suite_cost_ceiling", drafted: 0, alerts: [{ failure_mode: "F7", code: "breached", message: "x" }] },
  qtcStickyHalt: { runId: null, status: "halted", outcome: "sticky_halt", drafted: 0, alerts: [] },
  qtcDrafted: { runId: "r", status: "completed", outcome: "drafted", drafted: 2, escalated: 0, costUsd: 0.01, alerts: [], flags: [] },
  qtcNothingDue: { runId: "r", status: "completed", outcome: "nothing_due", drafted: 0, escalated: 0, alerts: [] },
  qtcFailed: { runId: "r", status: "failed", outcome: "failed", drafted: 0, escalated: 0, alerts: [] },
  fieldopsNotEnabled: { runId: null, status: "skipped", outcome: "not_enabled", suggestions: 0 },
  fieldopsSuggested: { runId: "r", status: "completed", outcome: "suggested", jobsConsidered: 4, suggestions: 3 },
  fieldopsFailed: { runId: "r", status: "failed", outcome: "failed", error: "Invalid column name", suggestions: 0 },
});

/* ── LUMEN POST /api/v1/campaign-agent/run-winback | /draft → { data: runCycle } ── */
// src/lib/campaignAgent/runner.js:247, :251-281, :289, :317, :336, :356, :446, :465

export const SPARK_RUN = Object.freeze({
  jobOff: { data: { runId: null, status: "skipped", outcome: "job_off", drafted: 0, alerts: [], words: "Win back quiet customers is off, so I did nothing." } },
  costCeiling: { data: { runId: null, status: "halted", outcome: "cost_ceiling", drafted: 0, alerts: [] } },
  briefUnreadable: { data: { runId: "r", status: "failed", outcome: "brief_unreadable", drafted: 0, alerts: [], words: "I couldn't read your business details, so I didn't write anything." } },
  noCohort: { data: { runId: "r", status: "completed", outcome: "no_qualifying_cohort", drafted: 0, alerts: [], cohort: { reachable: 2, suppressed: 0 } } },
  drafted: { data: { runId: "r", status: "escalated", outcome: "drafted", drafted: 1, escalated: 1, outputId: "o", costUsd: 0.02, alerts: [], cohort: null } },
});

/* ── decisions (2xx answers) ────────────────────────────────────────────── */

/** arion routes/arion/contentAgent.js:180-191, a social post whose hand-off failed. */
export const SOCIAL_APPROVE_NOT_SCHEDULED = Object.freeze({ data: { output_id: "o", review_status: "approved", published: false, scheduled: false, scheduled_social_post_id: null, words: "Your social scheduler couldn't be reached, so it isn't scheduled yet. Press Try again." } });
export const SOCIAL_APPROVE_NOT_SCHEDULED_NO_WORDS = Object.freeze({ data: { output_id: "o", review_status: "approved", published: false, scheduled: false, scheduled_social_post_id: null, words: null } });
export const SOCIAL_APPROVE_SCHEDULED = Object.freeze({ data: { output_id: "o", review_status: "approved", published: false, scheduled: true, scheduled_social_post_id: "p", words: "Scheduled for 9 Oct 10:00." } });
export const BLOG_APPROVE = Object.freeze({ data: { output_id: "o", review_status: "approved", published: false, words: 'Approved. It goes on your website when you press "Put it on your website".' } });
/** arion routes/arion/reviewReplies.js:160-162, a skip answers with no words. */
export const REVIEW_SKIP = Object.freeze({ data: { draft_id: "d", status: "skipped" } });

/* ── oliver lib/agents/activity.js qtcDecide / fieldopsDecide ───────────── */

/** An escalated Quote-to-Cash draft (activity.js:117-119): Skip only, reason required. */
export const QTC_ESCALATED_ROW = Object.freeze({
  id: "q1", agent: "qtc", agent_label: "Quote follow-up", kind: "proposal", status: "proposed",
  summary: "A nudge about quote Q-14", proposed_at: "2026-10-08T09:00:00Z", links: [], cost_note: "No AI credits used",
  attribution: "Created by Example Co — Quote-to-Cash Agent", job_key: "oliver.quote_payment_followups", employee_key: "office",
  decide: { skip: { path: "/qtc-agent/queue/q1/reject", reason: "required" } },
});
/** A crew suggestion that names nobody (activity.js:128-135): Skip only, reason optional. */
export const FIELDOPS_NOBODY_ROW = Object.freeze({
  id: "f1", agent: "fieldops", agent_label: "Crew suggestion", kind: "proposal", status: "proposed",
  summary: "Nobody fits job J-9", proposed_at: "2026-10-08T08:00:00Z", links: [], cost_note: "No AI credits used",
  attribution: "Created by Example Co — Field Ops Agent", job_key: "oliver.crew_suggestions", employee_key: "office",
  decide: { skip: { path: "/fieldops-agent/suggestions/f1/dismiss", reason: "optional" } },
});

/* ── oliver GET /automations/runs?rule_key= (routes/automations.js:343-355; statuses lib/automationDispatcher.js:829-859) ── */
export const RULE_RUNS = Object.freeze([
  { run_id: 3, rule_key: "review_request_after_job", status: "skipped", skip_reason: "tier_gate(rule=pro, tenant=standard)", error_message: null, fired_at: "2026-10-08T10:00:00Z" },
  { run_id: 2, rule_key: "review_request_after_job", status: "failed", skip_reason: null, error_message: "x", fired_at: "2026-10-07T10:00:00Z" },
  { run_id: 1, rule_key: "review_request_after_job", status: "success", skip_reason: null, error_message: null, fired_at: "2026-10-01T10:00:00Z" },
]);

/** oliver PATCH /automations/rules/:key below the rule's tier (routes/automations.js:160-166), as oliverApi throws it. */
export function tierNotMetError() {
  const e = new Error(`OLIVER API 403: {"error":"tier_not_met","message":"Automation rule 'review_request_after_job' requires pro tier or higher."}`);
  e.status = 403;
  e.code = "tier_not_met";
  e.body = { error: "tier_not_met", message: "Automation rule 'review_request_after_job' requires pro tier or higher." };
  return e;
}
