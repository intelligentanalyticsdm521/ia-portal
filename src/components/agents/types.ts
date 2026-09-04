// The one row shape every ARGUS agent's activity is flattened into, and the
// one settings shape every agent's switches are described by.
//
// Both are produced SERVER-SIDE — oliver-api lib/agents/activity.js and
// LUMEN src/lib/agentActivity/spark.js — so a new agent gets a surface by
// adding a normaliser next to its own tables, not by teaching the Portal a
// fourth vocabulary.
//
// SCOPE_AGENT_SURFACES_2026-09-05 §3.1 / AG-1 / AG-2:
//   · four statuses, plus a plain-words status_label written by whoever knows
//     what the agent actually did
//   · NO cost_usd. A client never sees our cost basis. `cost_note` is the
//     sentence they read; the founder page is where the dollars live.

/** proposed = waiting on a person · stopped = the agent stood down by itself. */
export type AgentStatus = "proposed" | "approved" | "declined" | "stopped";

export interface AgentLink {
  label: string;
  href: string;
}

export interface AgentActivityRow {
  agent: string;
  agent_label: string;
  product: string;
  /** proposal = something to decide · note = something to know. */
  kind: "proposal" | "note";
  id: string;
  summary: string;
  detail: {
    subject?: string | null;
    body?: string | null;
    why?: string | null;
    relationship?: string | null;
    evidence?: string | null;
    recommend_call?: boolean;
    grounded_on?: unknown;
    factors?: Record<string, unknown>;
    alternates?: unknown[];
    confidence?: number | null;
    first_time_customer?: boolean;
    scheduled_start?: string | null;
    reachable?: number | null;
    suppressed?: number | null;
    send_window?: string | null;
    intent?: string | null;
    source_agent?: string;
    rules?: unknown;
  } | null;
  status: AgentStatus;
  status_label: string;
  hold_note: string | null;
  proposed_at: string | null;
  decided_at: string | null;
  cost_units: number | null;
  cost_note: string;
  /** True only where THIS page owns the decision. */
  can_decide: boolean;
  /** Where the decision lives when it is not on this page (the lead card). */
  decide_href?: string | null;
  attribution: string;
  links: AgentLink[];
}

/**
 * `rows`, not `data` — and that is load-bearing. lib/oliverApi.ts and
 * lib/lumenApi.ts strip a top-level `data` key and return its contents, so a
 * body of { data: [...], meta: {...} } would arrive here as a bare array with
 * `meta` silently gone (the payouts-page bug). Both services therefore send
 * { data: { rows, meta } } and this is the inside of that envelope.
 */
export interface AgentActivityPayload {
  rows: AgentActivityRow[];
  meta: {
    engine: string;
    total: number;
    waiting: number;
    oversight?: { checked: number; flagged: number; last_checked_at: string | null } | null;
    /** A source we could not read. Shown, never swallowed. */
    degraded: Array<{ agent: string; error: string }>;
  };
}

export interface AgentSummary {
  key: string;
  label: string;
  product: string;
  blurb: string;
  attribution: string;
  drafts_with_ai?: boolean;
  enabled?: boolean;
  read_only?: boolean;
  paused?: boolean;
  paused_reason?: string | null;
  /** The Responder keeps its own settings page; this row points at it. */
  settings_href?: string;
  settings: Record<string, number | string | boolean>;
}

export interface AgentSettingsResponse {
  engine: string;
  agents: AgentSummary[];
}

/** One knob, described in the owner's words by the page that renders it. */
export interface AgentKnob {
  field: string;
  label: string;
  hint?: string;
  /** "number" (default) or "text" — the dunning cadence is "3,7,14". */
  type?: "number" | "text";
  min?: number;
  max?: number;
  suffix?: string;
  placeholder?: string;
}
