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
import type { JobDoor } from "../../../lib/team";

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
/** oliver GET /automations/runs → data[] (one row is enough for "Last sent"). */
export interface DoorRuleRun { fired_at: string | null; status?: string | null }

export interface DoorState {
  /** null = we could not read the home, so the switch is not shown as off. */
  enabled: boolean | null;
  knobs: DoorKnob[];
  values: Record<string, number | string | boolean | null>;
  paused: boolean;
  pausedReason: string | null;
  haltedAt: string | null;
  lastSentAt: string | null;
}

/** The read paths a door needs, by kind. */
export function doorReads(door: JobDoor): string[] {
  if (door.kind === "oliver_agent") return ["/agents/settings"];
  const key = encodeURIComponent(door.rule_key || "");
  return [`/automations/rules/${key}`, `/automations/runs?rule_key=${key}&limit=1`];
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
    };
  }
  return {
    enabled: rule ? !!rule.is_enabled : null,
    knobs: [],
    values: {},
    paused: false,
    pausedReason: null,
    haltedAt: null,
    lastSentAt: (lastRun && lastRun[0]?.fired_at) || null,
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
    const section = door.section || "qtc";
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
