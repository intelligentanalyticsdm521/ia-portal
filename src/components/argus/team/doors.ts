// doors.ts — the office administrator's jobs, switched where they live
// (contract ARGUS employees phase 1 §0.1.4, §C.5).
//
// PURE (no React, no import.meta) so test/argus-team-lib reads the shapes.
//
// In phase 1 the three OLIVER jobs keep their own homes: the Quote-to-Cash and
// Field Ops switches in oliver.*_agent_tenant_config (read by the hourly
// chasers too, so moving the bit would send a second email about the same
// money), and the review ask as automation rule review_request_after_job.
// The employee page is a DOOR onto those homes: it reads them with the routes
// the OLIVER Agents page used and writes them with the same routes. One store,
// two doors — never a second copy of the switch.
//
// The words for the knobs are the OLIVER Agents page's own, moved here when
// that page was deleted.

import type { AgentSettingsResponse, AgentSummary } from "../../agents/types";
import { PLAN_PRICING_ROUTE, statusOfError, teamRefusal, type JobDoor, type JobView, type TeamLink } from "../../../lib/team";

export interface DoorKnob {
  field: string;
  label: string;
  hint?: string;
  type?: "number" | "text";
  min?: number;
  max?: number;
  suffix?: string;
  placeholder?: string;
}

/** The OLIVER Agents page's own words for each knob, moved unchanged. */
export const DOOR_KNOBS: Readonly<Record<"qtc" | "fieldops", DoorKnob[]>> = Object.freeze({
  qtc: [
    {
      field: "quote_followup_days",
      label: "Chase a quote after",
      hint: "How long to wait for an answer before it writes the first nudge.",
      min: 1, max: 90, suffix: "days",
    },
    {
      field: "dunning_days_csv",
      label: "Remind about an unpaid invoice after",
      hint: "Days past due, separated by commas. Three reminders at most.",
      type: "text", placeholder: "3,7,14", suffix: "days overdue",
    },
  ],
  fieldops: [
    {
      field: "confidence_percent",
      label: "Only name someone when it is at least",
      hint: "Below this it hands the job back to you instead of guessing.",
      min: 0, max: 100, suffix: "% sure",
    },
  ],
});

/** oliver GET /automations/rules/:key → data (oliverApi strips the envelope). */
export interface DoorRule { key: string; is_enabled: boolean; required_tier?: string | null }
/**
 * oliver GET /automations/runs → data[]. status is success | skipped | failed
 * (oliver lib/automationDispatcher.js); only a success sent anything.
 */
export interface DoorRuleRun { fired_at: string | null; status?: string | null }

/** How many recent runs a rule door reads, to find the last one that sent. */
export const DOOR_RUNS_LIMIT = 20;

export interface DoorState {
  /** null = we could not read the home, so the switch is not shown as off. */
  enabled: boolean | null;
  knobs: DoorKnob[];
  values: Record<string, number | string | boolean | null>;
  paused: boolean;
  pausedReason: string | null;
  haltedAt: string | null;
  /** The last run that actually sent (status success). */
  lastSentAt: string | null;
  /** The newest run, when it did NOT send (skipped or failed): said as such, never as "Last sent". */
  lastMissAt: string | null;
}

/** The read paths a door needs, by kind. */
export function doorReads(door: JobDoor): string[] {
  if (door.kind === "oliver_agent") return ["/agents/settings"];
  const key = encodeURIComponent(door.rule_key || "");
  return [`/automations/rules/${key}`, `/automations/runs?rule_key=${key}&limit=${DOOR_RUNS_LIMIT}`];
}

/** What the door's home says, in the shape a job row shows. */
export function doorState(
  door: JobDoor,
  agents: AgentSettingsResponse | null,
  rule: DoorRule | null,
  lastRun: DoorRuleRun[] | null,
): DoorState {
  if (door.kind === "oliver_agent") {
    const a: AgentSummary | undefined = agents?.agents?.find((x) => x.key === door.section);
    return {
      enabled: a ? !!a.enabled : null,
      knobs: door.section ? [...DOOR_KNOBS[door.section]] : [],
      values: a?.settings ? { ...a.settings } : {},
      paused: !!a?.paused,
      pausedReason: a?.paused_reason || null,
      haltedAt: a?.halted_at || null,
      lastSentAt: null,
      lastMissAt: null,
    };
  }
  const runs = (lastRun || []).filter((r) => r && r.fired_at)
    .sort((x, y) => Date.parse(y.fired_at as string) - Date.parse(x.fired_at as string));
  const sent = runs.find((r) => r.status === "success") || null;
  const newest = runs[0] || null;
  return {
    enabled: rule ? !!rule.is_enabled : null,
    knobs: [],
    values: {},
    paused: false,
    pausedReason: null,
    haltedAt: null,
    lastSentAt: sent?.fired_at || null,
    lastMissAt: newest && newest.status !== "success" ? newest.fired_at : null,
  };
}

export type DoorChange =
  | { enabled: boolean }
  | { knob: { field: string; value: number | string } }
  | { resume: true };

/**
 * The one write a door makes, with the route its home already answers.
 * null when that home has no such control (a rule has only its switch) — the
 * caller sends nothing, rather than a write that means something else.
 */
export function doorWrite(door: JobDoor, change: DoorChange): { method: "PUT" | "PATCH"; path: string; body: Record<string, unknown> } | null {
  if (door.kind === "oliver_agent") {
    // No section, no write: a guessed section would switch some other job.
    if (door.section !== "qtc" && door.section !== "fieldops") return null;
    const section = door.section;
    let patch: Record<string, unknown>;
    if ("enabled" in change) patch = { enabled: change.enabled };
    else if ("knob" in change) patch = { [change.knob.field]: change.knob.value };
    else patch = { paused: false };
    return { method: "PUT", path: "/agents/settings", body: { [section]: patch } };
  }
  if (!("enabled" in change) || !door.rule_key) return null;
  const key = encodeURIComponent(door.rule_key);
  return { method: "PATCH", path: `/automations/rules/${key}`, body: { is_enabled: change.enabled } };
}

/** Where a door's switch lives, for the refusal sentence ("switched where it lives"). */
export function doorPlace(door: JobDoor): string {
  if (door.kind === "oliver_rule") return "OLIVER → Jobs → Settings";
  return "ARGUS → Your team → The office administrator → Jobs";
}

/**
 * What a door's row shows in place of, or beside, its switch (fails closed):
 *   locked  the business doesn't have the product, or its plan doesn't cover
 *           the job: the plain sentence and its link, no switch to press on
 *   unread  the home could not be read: say so, and show no switch
 *   switch  the switch; `canSwitchOn` false keeps an on-but-no-longer-allowed
 *           job switchable OFF only, with the plan sentence beside it
 */
export type DoorRowView =
  | { control: "locked"; words: string; link?: TeamLink }
  | { control: "unread"; words: string }
  | { control: "switch"; canSwitchOn: boolean; gate: { words: string; link?: TeamLink } | null };

export function doorRowView(
  job: Pick<JobView, "display_name" | "available">,
  state: Pick<DoorState, "enabled">,
  notOwnedWords: string | null,
): DoorRowView {
  if (notOwnedWords) return { control: "locked", words: notOwnedWords, link: { label: "Plan & Pricing", to: PLAN_PRICING_ROUTE } };
  const gate = job.available || { ok: false, decided: false };
  const refused = gate.decided === true && gate.ok === false;
  const gateLine = refused ? { words: (gate.words || "").trim() || "Your plan doesn't include this job yet.", link: gate.link } : null;
  if (state.enabled === null) {
    return { control: "unread", words: `We couldn't read whether ${job.display_name} is on just now. Open the page again to retry.` };
  }
  if (refused && state.enabled !== true) return { control: "locked", words: gateLine!.words, link: gateLine!.link };
  return { control: "switch", canSwitchOn: !refused, gate: gateLine };
}

/** OLIVER's codes for "your plan doesn't include this" (oliverApi maps three of them to tier_gate; automations answers tier_not_met). */
const TIER_CODES = /^(tier_not_met|tier_gate|tier_required|tier_upgrade_required|feature_not_available)$/;

/**
 * A refused door write, as a plain sentence (§0.3): a plan refusal says the
 * job's own plan sentence (never "Automation rule 'x' requires pro tier"),
 * anything else goes through the same refusal words as a team switch.
 */
export function doorRefusalWords(err: unknown, job: Pick<JobView, "available">): string {
  const e = (err && typeof err === "object" ? err : {}) as { type?: unknown; code?: unknown; body?: { error?: unknown } };
  const code = String(e.type ?? e.code ?? e.body?.error ?? "");
  if (TIER_CODES.test(code)) {
    const w = (job.available?.words || "").trim();
    return w || "Your plan doesn't include this job yet, so nothing changed. See Plan & Pricing.";
  }
  if (statusOfError(err) === 403) return "Only the business owner or an admin can change what your team does.";
  return teamRefusal(err);
}
