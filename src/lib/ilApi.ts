/**
 * ilApi.ts — the founder's read-only window into the Intelligence Layer.
 *
 * Four LUMEN endpoints under /api/v1/il/admin, all founder-only server-side.
 * The Portal route is gated too, but the gate that matters is LUMEN's: this
 * file exists so the page has typed shapes, not so it has permission.
 *
 * Nothing here can change a label or make the IL act on one (L4). The two
 * POSTs re-run work the platform already does on a schedule.
 */

import type { IPublicClientApplication, AccountInfo } from "@azure/msal-browser";
import { lumenGet, lumenPost } from "./lumenApi";

export interface IlThresholds {
  window: number;
  platform_agreement_pct: number;
  tenant_min_pct: number;
  tenant_min_judged: number;
  sample_rate: number;
}

export interface IlModelRow {
  model_id: number;
  kind: string;
  model_version: string;
  /** 'shadow' = still proving itself, everything judged · 'live' = 5% sample · 'off' */
  status: "shadow" | "live" | "off";
  agreement_pct: number | null;
  judged_seen: number;
  decisions_seen: number;
  holdout_acc: number | null;
  trained_at: string | null;
  gate_passed_at: string | null;
  updated_at: string;
  notes: string | null;
  weights_bytes: number;
}

export interface IlTenantGateRow {
  tenant_id: string;
  kind: string;
  agreement_pct: number | null;
  decisions: number;
  judged: number;
  mode: "100pct_llm" | "sampled_5pct";
  budget_month: string | null;
  budget_usd: number | null;
  spent_usd: number;
  updated_at: string;
}

export interface IlSpendRow {
  tenant_id: string;
  decision_kind: string;
  decisions: number;
  judged: number;
  cost_usd: number;
}

export interface IlGateSummary {
  thresholds: IlThresholds;
  models: IlModelRow[];
  tenants: IlTenantGateRow[];
  spend_this_month: IlSpendRow[];
}

export interface IlDecisionRow {
  decision_id: number;
  tenant_id: string;
  subject_kind: string;
  subject_id: string;
  decision_kind: string;
  model_version: string;
  model_label: string;
  model_confidence: number | null;
  model_features: string | null;
  llm_label: string | null;
  llm_reason: string | null;
  final_label: string;
  judged_by: string;
  agreed: boolean | null;
  latency_ms: number | null;
  cost_usd: number | null;
  /** Already capped at 200 characters, twice: on write and on read. */
  input_excerpt: string | null;
  created_at: string;
}

export function getIlGate(msal: IPublicClientApplication, account: AccountInfo) {
  return lumenGet<IlGateSummary>(msal, account, "/api/v1/il/admin/gate");
}

export function recomputeIlGate(msal: IPublicClientApplication, account: AccountInfo, kind?: string) {
  return lumenPost<{ results: unknown[] }>(msal, account, "/api/v1/il/admin/gate/recompute", kind ? { kind } : {});
}

export function getIlDecisions(
  msal: IPublicClientApplication,
  account: AccountInfo,
  opts: { tenant?: string; kind?: string; limit?: number } = {}
) {
  const qs = new URLSearchParams();
  if (opts.tenant) qs.set("tenant", opts.tenant);
  if (opts.kind) qs.set("kind", opts.kind);
  qs.set("limit", String(opts.limit ?? 50));
  return lumenGet<IlDecisionRow[]>(msal, account, `/api/v1/il/admin/decisions?${qs.toString()}`);
}

export function trainIlModel(
  msal: IPublicClientApplication,
  account: AccountInfo,
  body: { force?: boolean; seed_only?: boolean; min_judged?: number } = {}
) {
  return lumenPost<{
    trained?: boolean;
    seeded?: boolean;
    reason?: string;
    from_log?: number;
    from_seed?: number;
    version?: string;
    holdout_accuracy?: number | null;
  }>(msal, account, "/api/v1/il/admin/model/train", body);
}

/* ═══════════════════════════════════════════════════════════════════════════
 * IL-2 — outcomes, fitted weights, calibration
 *
 * The agreement number above answers "does the model say what the judge says".
 * These answer the question that cannot be gamed: **we said Hot. Did Hot
 * convert?** Still read-only apart from one button, and still nothing that can
 * change a label or make the IL act on one (L4).
 * ═══════════════════════════════════════════════════════════════════════════ */

/** The four scoring dimensions, keyed exactly as LUMEN stores them. */
export interface IlWeightSet {
  contactAccessibility: number;
  businessHealth: number;
  findability: number;
  enrichmentDepth: number;
}

/** The working behind one dimension's fitted weight. */
export interface IlPrior {
  label: string;
  platform_cap: number;
  platform_rate: number;
  platform_n: number;
  n: number;
  successes: number;
  posterior_raw: number;
  posterior_mean: number;
  /** true when the business had too few finished leads to stand on its own. */
  shrunk: boolean;
  blend: number;
  fitted_weight: number;
}

export interface IlWeightsRow {
  weights_id: number;
  tenant_id: string;
  version: number;
  /** 'shadow' = fitted but not trusted yet · 'live' = scoring with it */
  status: "shadow" | "live" | "retired";
  outcomes_seen: number;
  conversions: number;
  fitted_at: string | null;
  promoted_at: string | null;
  updated_at: string;
  weights: IlWeightSet | null;
  priors: Record<string, IlPrior> | null;
  gate: {
    checked_at?: string;
    period_days?: number;
    platform?: { pass: boolean; reason: string; explain: string };
    business?: { live: boolean; reason: string; explain: string; worst_error?: number | null };
  } | null;
}

export interface IlCalibrationRow {
  scope: "platform" | "tenant";
  tenant_id: string | null;
  period_days: number;
  band: "hot" | "warm" | "cold";
  predicted_rate: number | null;
  observed_rate: number | null;
  n: number;
  conversions: number;
  error_pts: number | null;
  computed_at: string;
}

export interface IlOutcomeRollupRow {
  tenant_id: string;
  leads: number;
  converted: number;
  money_collected: number;
  return_visits: number;
  hot: number;
  warm: number;
  cold: number;
  last_synced_at: string | null;
}

export interface IlLearningThresholds {
  conversion_window_days: number;
  posterior_min_n: number;
  min_outcomes_to_fit: number;
  prior_strength: number;
  min_weight: number;
  max_weight: number;
  calibration_period_days: number;
  platform_min_n: number;
  platform_max_error_pts: number;
  tenant_max_error_pts: number;
  tenant_min_outcomes: number;
  band_min_n: number;
  snapshot_max_lag_days: number;
}

export interface IlLearningSummary {
  platform_caps: IlWeightSet;
  dimension_labels: Record<string, string>;
  thresholds: IlLearningThresholds;
  weights: IlWeightsRow[];
  calibration: IlCalibrationRow[];
  outcomes: IlOutcomeRollupRow[];
}

export interface IlOutcomeBand {
  band: string;
  leads: number;
  converted: number;
  conversion_rate: number | null;
  quotes_accepted: number;
  jobs_completed: number;
  invoices_paid: number;
  return_visits: number;
  money_collected: number;
  avg_arrival_score: number | null;
}

export interface IlOutcomeSummary {
  tenant_id: string;
  window_days: number;
  conversion_window_days: number;
  bands: IlOutcomeBand[];
  totals: { leads: number; converted: number; money_collected: number; return_visits: number; conversion_rate: number | null };
}

export function getIlLearning(msal: IPublicClientApplication, account: AccountInfo) {
  return lumenGet<IlLearningSummary>(msal, account, "/api/v1/il/admin/learning");
}

export function getIlOutcomeSummary(
  msal: IPublicClientApplication,
  account: AccountInfo,
  tenantId: string,
  days = 365
) {
  return lumenGet<IlOutcomeSummary>(
    msal, account,
    `/api/v1/il/admin/outcomes/${encodeURIComponent(tenantId)}/summary?days=${days}`
  );
}

/**
 * Roll up outcomes, re-fit every business's weights, and re-run the
 * calibration — the same three steps the platform runs on its own every six
 * hours. It changes numbers, never labels: a weight set may be promoted or
 * demoted by it, and nothing else moves.
 */
export function syncIlOutcomes(
  msal: IPublicClientApplication,
  account: AccountInfo,
  body: { tenant_id?: string; fit?: boolean; calibrate?: boolean } = {}
) {
  return lumenPost<{
    sync: { snapshotted: number; events_merged: number; conversions_marked: number; skipped?: string };
    fit: { fits: Array<{ tenant_id: string; fitted: boolean; reason?: string; version: number | null }> } | null;
    calibration: {
      platform: { total_n: number; verdict: { pass: boolean; reason: string; explain: string } };
      promoted: number;
    } | null;
  }>(msal, account, "/api/v1/il/admin/outcomes/sync", body);
}

/* ═══════════════════════════════════════════════════════════════════════════
 * IL-3 — the owner's compiled rules, and the quarterly audit
 *
 * Two more read-only blocks and one more button. The rules block answers the
 * question no agreement percentage can ("is the compiler reading people
 * correctly"); the audit block answers Brandon's coverage rule ("did we look at
 * EVERY business"). Neither changes a label; the audit's single side effect is
 * putting a business that fell under 90% back on 100% judging.
 * ═══════════════════════════════════════════════════════════════════════════ */

export interface IlRuleConstraintRow {
  key: string;
  kind: string;
  effect: string;
  delta_points: number;
  say: string;
}

export interface IlOwnerRuleRow {
  rule_id: number;
  tenant_id: string;
  version: number;
  status: "active" | "rejected" | "superseded";
  compiled_by: "model" | "owner";
  compiled_model: string | null;
  constraint_count: number;
  compiled_at: string | null;
  expires_at: string | null;
  explanation_plain: string | null;
  rejected_reason: string | null;
  compile_cost_usd: number | null;
  source_text: string;
  constraints: IlRuleConstraintRow[];
  applications: number;
  leads_touched: number;
  held_now: number;
  accepted_anyway: number;
  declined: number;
}

export interface IlRulesAdmin {
  grammar: {
    kinds: string[];
    effects: string[];
    fields_by_kind: Record<string, string[]>;
    floor: number;
    max_delta: number;
    max_total_delta: number;
    model: string;
  };
  rules: IlOwnerRuleRow[];
  suggestions: Array<{ tenant_id: string; status: string; n: number }>;
}

export interface IlAuditTenantRow {
  tenant_id: string;
  decisions_in_period: number;
  sampled: number;
  rejudged: number;
  agreed: number;
  agreement_pct: number | null;
  under_floor: boolean;
  gate_reset: boolean;
  notes: string | null;
}

export interface IlAuditRunRow {
  run_id: number;
  kind: "quarterly" | "annual";
  decision_kind: string;
  period_start: string;
  period_end: string;
  started_at: string;
  finished_at: string | null;
  status: "running" | "done" | "failed";
  tenants_total: number;
  tenants_sampled: number;
  sampled: number;
  rejudged: number;
  agreed: number;
  agreement_pct: number | null;
  tenants_under_floor: number;
  budget_usd: number;
  spent_usd: number;
  budget_exhausted: boolean;
  baseline_note: string | null;
  error_text: string | null;
  triggered_by: string | null;
  summary: {
    planned_rows?: number;
    decisions_in_period?: number;
    skipped_unjudgeable?: number;
    tenant_floor_pct?: number;
    by_model_version?: Array<{ model_version: string; rejudged: number; agreed: number; agreement_pct: number | null }>;
  } | null;
}

export interface IlAuditHistory {
  thresholds: {
    sample_pct: number;
    sample_min: number;
    sample_max: number;
    default_budget_usd: number;
    tenant_floor_pct: number;
    tenant_min_rejudged: number;
  };
  runs: IlAuditRunRow[];
  latest_run_id: number | null;
  tenants: IlAuditTenantRow[];
}

export function getIlRules(msal: IPublicClientApplication, account: AccountInfo) {
  return lumenGet<IlRulesAdmin>(msal, account, "/api/v1/il/admin/rules");
}

export function getIlAudit(msal: IPublicClientApplication, account: AccountInfo, runId?: number) {
  const qs = runId ? `?run_id=${runId}` : "";
  return lumenGet<IlAuditHistory>(msal, account, `/api/v1/il/admin/audit${qs}`);
}

/**
 * Start an audit. `budget_usd` is the ceiling for THIS run (default $5,
 * platform-wide) — the run stops when it is reached and says so rather than
 * reporting an agreement number it did not earn.
 */
export function runIlAudit(
  msal: IPublicClientApplication,
  account: AccountInfo,
  body: { decision_kind?: string; budget_usd?: number; kind?: "quarterly" | "annual"; baseline_note?: string } = {}
) {
  return lumenPost<{
    ok: boolean;
    run_id: number;
    tenants_total: number;
    sampled: number;
    rejudged: number;
    agreement_pct: number | null;
    spent_usd: number;
    budget_exhausted: boolean;
    error?: string;
  }>(msal, account, "/api/v1/il/admin/audit/run", body);
}
