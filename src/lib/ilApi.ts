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
