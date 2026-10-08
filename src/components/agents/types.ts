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

import type { BriefCited, Decide } from "../../lib/team";

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
    /** ARION content agent: the copy is written, the slides are not. */
    needs_manual_render?: boolean;
    agent_original?: string | null;
    confidence_note?: string | null;
    url_slug?: string | null;
    published_at?: string | null;
    wordpress_post_id?: number | null;
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
  /**
   * ARION content agent only: approved, and putting it on the website is a
   * SECOND press (AC8). Approval never schedules anything, so "approved" and
   * "live" are different states and the page must be able to tell them apart.
   */
  can_publish?: boolean;
  /** Where the decision lives when it is not on this page (the lead card). */
  decide_href?: string | null;
  attribution: string;
  links: AgentLink[];
  // ── ARGUS → Your team, phase 1 (contract §F.1). Optional: a product that has
  // not tagged its rows yet still renders; a row without `decide` shows no
  // buttons rather than guessing at a route.
  /** The job that made it, e.g. "arion.blog_posts". */
  job_key?: string;
  /** Which employee: web | marketer | office. */
  employee_key?: string;
  /** Which saved version of Your business it was written from, and what it used. */
  brief_cited?: BriefCited | null;
  /** Why it waited, one sentence. */
  held_words?: string | null;
  /** The routes its buttons call, from the product that owns the decision. */
  decide?: Decide;
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

/**
 * One agent RUN, as opposed to one proposal.
 *
 * ARGUS pack 1. Produced server-side by oliver-api lib/agents/runs.js, LUMEN
 * src/lib/agentActivity/sparkRuns.js and arion-api lib/agents/runs.js — three
 * normalisers, one row shape, so the Portal learns one vocabulary.
 *
 * NO cost_usd, deliberately, on any of the three: it is IA's provider cost basis
 * and this is a client surface (AG-1). The founder's dollars live on the founder
 * rollup, where the whole page is internal.
 */
export interface AgentRunRow {
  agent: string;
  agent_label: string;
  product: string;
  run_id: string;
  started_at: string | null;
  finished_at: string | null;
  trigger: string | null;
  trigger_label: string;
  status: string;
  /** worked | nothing_due | escalated | halted | failed | running | skipped | blocked */
  outcome: string;
  outcome_label: string;
  drafted: number | null;
  jobs_considered?: number | null;
  keywords?: string[];
  cost_note: string;
  /** Why it skipped what it skipped, in plain words. Never an empty promise. */
  notes: string[];
  failure: { reason: string } | null;
  rung?: string | null;
  intent?: string | null;
  /** ARGUS → Your team (§G.4): the job this run belongs to, when the product tags it. */
  job_key?: string | null;
}

/** What the oversight layer itself has been doing, per registered agent. */
export interface AgentOversightRow {
  agent_key: string;
  display_name: string;
  product: string;
  active: boolean;
  last_checked_at: string | null;
  healthy: boolean;
  problem: string | null;
}

export interface AgentRunsPayload {
  rows: AgentRunRow[];
  meta: {
    total: number;
    limit: number;
    failed: number;
    held: number;
    halted: number;
    last_run_at: string | null;
    oversight?: AgentOversightRow[] | null;
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
  /** When it stopped itself, where the product sends it. */
  halted_at?: string | null;
  /** The Responder keeps its own settings page; this row points at it. */
  settings_href?: string;
  settings: Record<string, number | string | boolean | null>;
  /**
   * The 60% rule for this business, where the server computes it (the content
   * agent). `price_not_set` is a real answer and a finding, not an error.
   */
  margin?: {
    verdict: string;
    costUsd: number;
    priceUsdMonthly: number | null;
    ratio: number | null;
    windowDays: number;
    message: string;
  } | null;
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
