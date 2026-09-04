/**
 * ilOwnerApi.ts — the OWNER's side of the Intelligence Layer (IL-3).
 *
 * Types only, plus the six LUMEN paths. Two prefixes, both tenant-scoped:
 *   /api/v1/business-rules    what the owner's rules were understood to mean
 *   /api/v1/il-suggestions    what the platform noticed, each with ONE link
 *
 * NOT under /api/v1/il — that prefix is the founder's dashboard (ilApi.ts) and
 * /il/rules already belongs to the platform campaign ruleset (F-CS.1).
 *
 * L4: there is no call in this file that makes the platform DO anything. The
 * strongest verbs here are "compile my rules", "I am taking this one", and
 * "mark that suggestion done". A suggestion has an `action_url` — a path the
 * Portal navigates to — and no payload of any kind.
 */

/** One compiled constraint, in the words the owner reads. */
export interface IlRuleConstraint {
  key: string;
  /** geography | time_window | job_size | service | customer_type | capacity */
  kind: string;
  /** rank_up | rank_down | hold | route | note */
  effect: string;
  delta_points: number;
  /** the one sentence shown next to an inquiry */
  say: string;
}

export interface IlRulesSummary {
  has_rules: boolean;
  status: "active" | "expired" | "rejected" | "none" | string;
  rule_id: number | null;
  version: number | null;
  source_text: string | null;
  explanation_plain: string | null;
  rejected_reason: string | null;
  constraints: IlRuleConstraint[];
  expires_at: string | null;
  expired: boolean;
  compiled_at: string | null;
  applications: number;
  leads_touched: number;
  held_now: number;
  compile: { reason: string; message: string | null };
  tier_locked: boolean;
  bounds: { floor: number; max_delta: number; max_total_delta: number };
}

export interface IlHeldLead {
  lead_id: number;
  reason_plain: string;
  applied_at: string;
  constraint_kind: string;
  business_name: string | null;
  first_name: string | null;
  last_name: string | null;
  composite_score: number | null;
  hot_warm_cold: string | null;
  intake_message: string | null;
  created_at: string;
}

export interface IlRuleApplication {
  application_id: number;
  rule_id: number;
  constraint_key: string;
  constraint_kind: string;
  effect: string;
  delta_points: number;
  reason_plain: string;
  score_before: number | null;
  score_after: number | null;
  band_before: string | null;
  band_after: string | null;
  resolution: "accepted" | "declined" | null;
  resolved_at: string | null;
  applied_at: string;
}

export interface IlSuggestion {
  suggestion_id: number;
  kind: string;
  subject_kind: string | null;
  subject_id: string | null;
  title: string;
  body_plain: string;
  /** A Portal path. Never an absolute URL, and never anything runnable. */
  action_url: string;
  action_label: string;
  status: "open" | "done" | "dismissed";
  created_at: string;
  decided_at: string | null;
}

export interface IlLeadRules {
  lead_id: number;
  applications: IlRuleApplication[];
  held: boolean;
  held_reason: string | null;
  suggestions: IlSuggestion[];
}

export const IL_OWNER_PATHS = {
  rules: "/api/v1/business-rules",
  compile: "/api/v1/business-rules/compile",
  held: "/api/v1/business-rules/held",
  lead: (id: number) => `/api/v1/business-rules/lead/${id}`,
  resolve: (id: number) => `/api/v1/business-rules/lead/${id}/resolve`,
  suggestions: "/api/v1/il-suggestions",
  suggestionDone: (id: number) => `/api/v1/il-suggestions/${id}/done`,
  suggestionDismiss: (id: number) => `/api/v1/il-suggestions/${id}/dismiss`,
} as const;

/** Plain words for each constraint kind — the owner never sees "geography". */
export const RULE_KIND_LABEL: Record<string, string> = {
  geography: "Where you work",
  time_window: "When it applies",
  job_size: "How big a job",
  service: "What work",
  customer_type: "Who it is for",
  capacity: "How much you can take",
};

/** Plain words for each effect. */
export const RULE_EFFECT_LABEL: Record<string, string> = {
  rank_up: "moves it up",
  rank_down: "moves it down",
  hold: "waits for you",
  route: "notes who should take it",
  note: "adds a note",
};
