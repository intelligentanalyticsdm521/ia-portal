// team.ts — the Portal's side of ARGUS → Your team (contract
// CONTRACT_ARGUS_EMPLOYEES_PHASE1_2026-10-08 §C.1, §F).
//
// PURE: no React, no MSAL, no import.meta — so test/argus-team-lib imports it
// directly. Everything a screen SAYS about an employee, a job or a waiting item
// is decided here, once: what a job row shows (a switch, a door, or the lock
// words), the mode sentences, the toast, "why it waited", the "Written from
// your business details" line, the per-source failure line in Needs you, and
// the request each button sends. The screens only lay them out.
//
// Nothing in this file knows any business. The job rows, their names, their
// sentences and their limits come from platform-api (core.team_job, seeded
// generically); the only words written here are the platform's own.
//
// On screen the words are: Your team, the web person, the marketer, the office
// administrator, Jobs, On / Off, Automatic / Send me first, Needs you, History,
// Today. Never the word for the account record, never the machine word for a
// job description, never a vendor or model name.

import type { AgentActivityRow, AgentRunRow } from "../components/agents/types";

// ── the three employees phase 1 shows ───────────────────────────────────────

export type EmployeeKey = "web" | "marketer" | "office";
export const EMPLOYEE_KEYS: readonly EmployeeKey[] = Object.freeze(["web", "marketer", "office"]);

/** The page each employee lives on (/app/services/<key>). */
export const TEAM_SERVICE_KEY: Readonly<Record<EmployeeKey, string>> = Object.freeze({
  web: "argus_team_web",
  marketer: "argus_team_marketer",
  office: "argus_team_office",
});

export function employeeFromServiceKey(serviceKey: string | null | undefined): EmployeeKey | null {
  for (const k of EMPLOYEE_KEYS) if (TEAM_SERVICE_KEY[k] === serviceKey) return k;
  return null;
}

export function employeeRoute(key: EmployeeKey, tab?: EmployeeTab | null): string {
  const base = `/app/services/${TEAM_SERVICE_KEY[key]}`;
  return tab && tab !== "today" ? `${base}?tab=${tab}` : base;
}

/** The name on the page header and in the menu (the server sends the same). */
export const EMPLOYEE_NAME: Readonly<Record<EmployeeKey, string>> = Object.freeze({
  web: "The web person",
  marketer: "The marketer",
  office: "The office administrator",
});

/** "your web person" — the words inside a sentence. */
export function yourEmployee(key: EmployeeKey | null | undefined): string {
  if (!key) return "your team";
  return `your ${EMPLOYEE_NAME[key].replace(/^The /, "").toLowerCase()}`;
}

/** "Your web person" — at the start of a sentence. */
export function YourEmployee(key: EmployeeKey | null | undefined): string {
  const s = yourEmployee(key);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** The product each employee works on, and how the owner knows it. */
export const EMPLOYEE_PRODUCT: Readonly<Record<EmployeeKey, { key: string; name: string }>> = Object.freeze({
  web: { key: "arion", name: "ARION" },
  marketer: { key: "spark", name: "SPARK" },
  office: { key: "oliver", name: "OLIVER" },
});

// ── wire shapes (platform-api routes/me/team.js, §C.1) ──────────────────────

export type JobMode = "automatic" | "review";
export type JobState = "live" | "planned" | "locked";
export type SettingHome = "team" | "door" | "none";
export type ModeRule = "either" | "always_asks" | "none";

export interface TeamLink { label: string; to: string }

export interface TeamEmployee {
  employee_key: EmployeeKey;
  display_name: string;
  job_line: string;
  product: string;
  product_owned?: boolean | null;
  on_team?: { yes: boolean; source: "agency" | "founder" | "carried_over" | null };
}

export interface VarDef {
  label: string;
  type: "int" | "list" | "choice" | "stars" | "time";
  min?: number;
  max?: number;
  max_items?: number;
  max_len?: number;
  options?: string[];
}

export interface JobDoor {
  kind: "oliver_agent" | "oliver_rule";
  section?: "qtc" | "fieldops";
  rule_key?: string;
}

export interface JobPlaybookView {
  version: number;
  source: "starter" | "fixture" | "owner";
  steps: Array<{ words: string }>;
  allowed: string[];
  never: string[];
  reads: Array<{ field: string; label: string; set: boolean }>;
}

export interface JobGate { ok: boolean; decided: boolean; words?: string; link?: TeamLink }

export interface JobView {
  job_key: string;
  employee_key: EmployeeKey;
  display_name: string;
  description_plain: string;
  state: JobState;
  runner_kind: "agent" | "automation";
  setting_home: SettingHome;
  trigger_words: string;
  mode_rule: ModeRule;
  lock_words: string | null;
  hire_required: boolean;
  sends_to_customer: boolean;
  enabled: boolean | null;
  mode: JobMode | null;
  mode_set_by: string | null;
  mode_set_at: string | null;
  vars: Record<string, unknown>;
  var_defs: Record<string, VarDef>;
  available: JobGate;
  automatic: JobGate;
  on_team: boolean;
  door: JobDoor | null;
  playbook: JobPlaybookView | null;
  waiting_for_brief: Array<{ field: string; label: string }>;
}

export interface TeamJobChange { at: string; words: string; actor?: string | null }

export const TEAM_PATHS = Object.freeze({
  list: "/me/team",
  employee: (k: string) => `/me/team/${encodeURIComponent(k)}`,
  jobsOn: "/me/team/jobs?enabled=1",
  job: (jobKey: string) => `/me/team/jobs/${encodeURIComponent(jobKey)}`,
  changes: (jobKey: string) => `/me/team/jobs/${encodeURIComponent(jobKey)}/changes`,
});

// ── the employee page's tabs (?tab=) ────────────────────────────────────────

export type EmployeeTab = "today" | "needs-you" | "jobs" | "history" | "know";
export const EMPLOYEE_TABS: ReadonlyArray<{ key: EmployeeTab; label: string }> = Object.freeze([
  { key: "today", label: "Today" },
  { key: "needs-you", label: "Needs you" },
  { key: "jobs", label: "Jobs" },
  { key: "history", label: "History" },
  { key: "know", label: "What I know" },
]);

export function employeeTabFrom(v: string | null | undefined): EmployeeTab {
  return EMPLOYEE_TABS.some((t) => t.key === v) ? (v as EmployeeTab) : "today";
}

// ── dates, in the owner's words ─────────────────────────────────────────────

/** "8 Oct" — never a UTC time. Null when the value is not a date. */
export function dayMonth(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function relativeTime(iso: string | null | undefined, now: number = Date.now()): string | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  const mins = Math.floor((now - t) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return days === 1 ? "yesterday" : `${days} days ago`;
  return dayMonth(new Date(t).toISOString());
}

// ── one job row: a switch, a door, or the words ─────────────────────────────

export const NOT_BUILT_WORDS = "Not built yet";

export interface JobRowState {
  /** switch = the team On switch · door = the switch where it lives · none = words only */
  control: "switch" | "door" | "none";
  /** True when the switch is shown but cannot be switched on (the reason is `gateLine`). */
  switchLocked: boolean;
  /** The words in place of a switch, or under it. */
  lockLine: string | null;
  /** Automatic / Send me first — only for a job whose mode rule is "either". */
  modeControl: boolean;
  /** The sentence under the mode (or in its place): "This job always asks you first", the review-reply line. */
  modeLine: string | null;
  /** Automatic cannot be chosen yet: why, and where to fix it. */
  automaticLine: { words: string; link?: TeamLink } | null;
  /** Can't be switched on, or switched on and paused: the plan sentence with its link. */
  gateLine: { words: string; link?: TeamLink } | null;
  /** On, but its requirement stopped holding (a downgrade): "Paused: …". */
  paused: boolean;
}

/**
 * What one job row shows. Decided here so the Jobs tab, ARGUS → Workflows and
 * the doors on the Responder and Reviews pages can never disagree.
 *
 * Guards fail closed: a job that is planned, locked, has no switch of its own,
 * or belongs to an employee who is not on the team, gets no switch at all. The
 * mode control is offered ONLY for a job whose rule is "either": an
 * always-asks job never shows Automatic (mutation M19).
 */
export function jobRowState(job: Pick<JobView,
  "state" | "setting_home" | "mode_rule" | "lock_words" | "on_team" | "enabled" | "available" | "automatic">): JobRowState {
  const words = (job.lock_words || "").trim() || null;
  const base: JobRowState = {
    control: "none", switchLocked: false, lockLine: null, modeControl: false,
    modeLine: null, automaticLine: null, gateLine: null, paused: false,
  };
  if (job.state === "planned") return { ...base, lockLine: words || NOT_BUILT_WORDS };
  if (job.state === "locked") return { ...base, lockLine: words };
  if (job.setting_home === "none") return { ...base, lockLine: words };
  if (job.setting_home === "door") return { ...base, control: "door", modeLine: words };
  if (job.setting_home !== "team") return { ...base, lockLine: words };
  // From here: a live job whose switch is the team row.
  if (!job.on_team) return { ...base, lockLine: null };
  const on = job.enabled === true;
  const gate = job.available || { ok: false, decided: false };
  const refused = gate.decided === true && gate.ok === false;
  const auto = job.automatic || { ok: false, decided: false };
  const modeControl = job.mode_rule === "either";
  return {
    ...base,
    control: "switch",
    switchLocked: !on && refused,
    gateLine: refused ? { words: (gate.words || "").trim() || "This job can't be switched on yet.", link: gate.link } : null,
    paused: on && refused,
    modeControl,
    modeLine: words,
    automaticLine: modeControl && auto.decided === true && auto.ok === false
      ? { words: (auto.words || "").trim() || "Automatic isn't available for this job yet.", link: auto.link }
      : null,
  };
}

/** "Paused: <the plan sentence>" for a job that is on but can no longer run. */
export function pausedWords(gateWords: string): string {
  return `Paused: ${gateWords}`;
}

/** The mode the row shows. A job that always asks reads Send me first, whatever is stored. */
export function shownMode(job: Pick<JobView, "mode" | "mode_rule">): JobMode {
  return job.mode_rule === "either" && job.mode === "automatic" ? "automatic" : "review";
}

/**
 * The green notice after the mode changes (§F.2 "Mode toast"). A job that is
 * Off does nothing whatever its mode, so the sentence says "once it's on"
 * rather than promising something will go out.
 */
export function modeToast(
  name: string, mode: JobMode, by: string | null | undefined, atIso: string | null | undefined,
  enabled: boolean | null = true,
): string {
  const later = enabled === true ? "" : " once it's on";
  if (mode !== "automatic") return `${name} will wait for you again${later}.`;
  const who = (by || "").trim() || "you";
  const on = dayMonth(atIso);
  return `${name} will go out without waiting for you${later}. Approved in advance by ${who}${on ? ` on ${on}` : ""}.`;
}

export const NOTHING_CHANGED_SAVED_WORDS = "Nothing changed.";

/**
 * The green notice after a job write, built from the JobView the SERVER
 * answered with — never from what was asked. A mode the server kept, or an
 * answer that says nothing changed, is said as such.
 */
export function jobWriteWords(
  name: string,
  patch: { enabled?: boolean; mode?: JobMode; vars?: Record<string, unknown> },
  next: Pick<JobView, "enabled" | "mode" | "mode_set_by" | "mode_set_at" | "mode_rule"> & { changed?: boolean },
): string {
  if (next.changed === false) return NOTHING_CHANGED_SAVED_WORDS;
  if (patch.mode !== undefined) return modeToast(name, shownMode(next), next.mode_set_by, next.mode_set_at, next.enabled);
  if (patch.enabled !== undefined) return enabledToast(name, next.enabled === true);
  return `Saved: ${name}.`;
}

/** ARION → Reviews' line about the review-reply job: true only while it is on. */
export function reviewRepliesIntro(enabled: boolean | null | undefined): string {
  if (enabled === true) return "Your web person writes a reply to each new review in your voice.";
  if (enabled === false) return "Switch this on and your web person writes a reply to each new review in your voice.";
  return "Your web person can write a reply to each new review in your voice.";
}

export function enabledToast(name: string, enabled: boolean): string {
  return enabled
    ? `Switched on: ${name}.`
    : `Switched off: ${name}. It does nothing until you switch it back on.`;
}

export function needCountWords(n: number): string | null {
  return n > 0 ? `${n} need${n === 1 ? "s" : ""} you` : null;
}

export function lastDidWords(iso: string | null | undefined, now: number = Date.now()): string | null {
  const r = relativeTime(iso, now);
  return r ? `Last did ${r}` : null;
}

/** The halted line: "Stopped itself on 8 Oct: <reason>." The button beside it says Start it again. */
export function haltedLine(reason: string | null | undefined, atIso?: string | null): string {
  const why = (reason || "").trim().replace(/\.$/, "") || "it hit one of its own limits";
  const on = dayMonth(atIso || null);
  return on ? `Stopped itself on ${on}: ${why}.` : `Stopped itself: ${why}.`;
}

/**
 * Where this employee stands for this business, from GET /me/team (the only
 * answer that carries product_owned and on_team; GET /me/team/:key does not).
 *   not_owned    the business doesn't have the product: say so, with Plan & Pricing
 *   not_on_team  it has the product, but the employee was never added
 *   unknown      the list could not be read: say nothing either way (never deny on "we don't know")
 *   ok           on the team
 */
export type EmployeeStanding = "not_owned" | "not_on_team" | "unknown" | "ok";
export function employeeStanding(
  row: Pick<TeamEmployee, "product_owned" | "on_team"> | null | undefined,
  jobs: Array<Pick<JobView, "hire_required" | "on_team">> = [],
): EmployeeStanding {
  if (!row) return "unknown";
  if (row.product_owned === false) return "not_owned";
  if (row.product_owned !== true) return "unknown";
  if (row.on_team && row.on_team.yes === false && jobs.some((j) => j.hire_required && !j.on_team)) return "not_on_team";
  return "ok";
}

/** The employee's row on GET /me/team, merged onto the GET /me/team/:key answer. */
export function withStanding(employee: TeamEmployee | null, list: TeamEmployee[] | null | undefined): TeamEmployee | null {
  if (!employee) return null;
  const row = (list || []).find((e) => e.employee_key === employee.employee_key);
  return row ? { ...employee, product_owned: row.product_owned ?? null, on_team: row.on_team } : employee;
}

export function notOnTeamWords(key: EmployeeKey): string {
  return `${YourEmployee(key)} isn't on your team yet. Ask your account contact to add them.`;
}

export function productNotOwnedWords(key: EmployeeKey): string {
  const p = EMPLOYEE_PRODUCT[key].name;
  return `${YourEmployee(key)} works on ${p}. Add ${p} to have them on your team.`;
}

export const PLAN_PRICING_ROUTE = "/app/settings/plan-pricing";
export const YOUR_BUSINESS_ROUTE = "/app/settings/your-business";

/**
 * The drawer's "When I do it". A job that never acts (locked, or with no
 * switch of its own) says so; "When you ask" is only for a live job whose
 * trigger is a person pressing Run it now.
 */
export function whenWords(job: Pick<JobView, "state" | "setting_home" | "trigger_words" | "lock_words">): string {
  const trigger = (job.trigger_words || "").trim();
  if (job.state === "planned") return NOT_BUILT_WORDS;
  if (job.state === "locked") return (job.lock_words || "").trim() || NEVER_WORDS;
  if (trigger) return trigger;
  if (job.setting_home === "none") return (job.lock_words || "").trim() || NEVER_WORDS;
  return "When you ask";
}
export const NEVER_WORDS = "Never: it's always yours.";

/** A choice var's option in words (the job description stores codes). */
const CHOICE_WORDS: Readonly<Record<string, Record<string, string>>> = Object.freeze({
  winback_cohort_source: {
    auto: "Pick for me",
    job: "Anyone you've done a job for",
    invoice: "Anyone who has paid an invoice",
  },
});
export function choiceLabel(varKey: string, option: string): string {
  const w = CHOICE_WORDS[varKey]?.[option];
  if (w) return w;
  if (option === "auto") return "Pick for me";
  const t = String(option).replace(/[_-]+/g, " ").trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : String(option);
}

/** "Version 3, the standard set" / "Version 4, set up for your business". */
export function versionLine(pb: Pick<JobPlaybookView, "version" | "source"> | null | undefined): string | null {
  if (!pb || !Number.isFinite(pb.version)) return null;
  return pb.source === "starter"
    ? `Version ${pb.version}, the standard set`
    : `Version ${pb.version}, set up for your business`;
}

// ── the Business Brief, in the owner's words ────────────────────────────────

/** Each Brief answer a job can read, as it reads inside a sentence. */
export const BRIEF_PHRASES: Readonly<Record<string, string>> = Object.freeze({
  businessName: "your business name",
  description: "what you do",
  services: "what you sell",
  servicesSummary: "what you sell, in a sentence",
  serviceArea: "where you work",
  brandVoice: "how you talk",
  doNotSay: "things never to say",
  noGoList: "work you won't take",
  idealCustomer: "your ideal customer",
  differentiators: "why customers pick you",
  responsePromiseText: "how fast you answer",
  offersAllowed: "offers you allow",
  proofAllowed: "proof you allow",
  namesNeverMention: "names never to mention",
  namesYouMayMention: "names you may mention",
  competitors: "competitors",
  customerWords: "words your customers use",
});

export function briefPhrase(field: string, serverLabel?: string | null): string {
  if (BRIEF_PHRASES[field]) return BRIEF_PHRASES[field];
  const l = (serverLabel || "").trim();
  return l ? l.charAt(0).toLowerCase() + l.slice(1) : field;
}

/** Where to change one Brief answer: the field's own anchor on Your business. The name lives on Business Profile. */
export function briefFieldRoute(field: string): string {
  if (field === "businessName") return "/app/settings/business-profile";
  return `${YOUR_BUSINESS_ROUTE}#${encodeURIComponent(field)}`;
}

/** "I'm waiting for you to tell me what you sell (Settings → Your business)." — the line under a job whose required answer is not saved. */
export function waitingForBriefWords(item: { field: string; label?: string | null }): string {
  return `I'm waiting for you to tell me ${briefPhrase(item.field, item.label)} (Settings → Your business).`;
}

export interface BriefCited { version: number; saved_at: string | null; used: string[] }

/**
 * The line under a draft (§E.4): which saved version it was written from and
 * which answers it used. Version 0 means there was nothing saved, and says so.
 */
export function briefCitedLine(c: BriefCited | null | undefined): { words: string; link: boolean } | null {
  if (!c || typeof c.version !== "number") return null;
  if (c.version <= 0) {
    return { words: "Written without your business details. Fill them in on Your business.", link: true };
  }
  const saved = dayMonth(c.saved_at);
  const used = (c.used || []).map((f) => briefPhrase(f));
  const head = `Written from your business details (version ${c.version}${saved ? `, saved ${saved}` : ""})`;
  return { words: used.length ? `${head}: ${used.join(", ")}.` : `${head}.`, link: false };
}

/** Everything an employee's live jobs read, once each, with whether it is saved. */
export function knowFields(jobs: Array<Pick<JobView, "state" | "playbook">>): Array<{ field: string; label: string; set: boolean }> {
  const seen = new Map<string, { field: string; label: string; set: boolean }>();
  for (const j of jobs) {
    if (j.state !== "live" || !j.playbook) continue;
    for (const r of j.playbook.reads || []) {
      if (!r || !r.field || seen.has(r.field)) continue;
      seen.set(r.field, { field: r.field, label: (r.label || "").trim() || briefPhrase(r.field), set: !!r.set });
    }
  }
  return [...seen.values()];
}

// ── the waiting items (each product's /agents/activity?waiting=1, §F.1) ─────

export type NeedsSource = "arion" | "spark" | "oliver";
export const SOURCE_EMPLOYEE: Readonly<Record<NeedsSource, EmployeeKey>> = Object.freeze({
  arion: "web",
  spark: "marketer",
  oliver: "office",
});
export const EMPLOYEE_SOURCE: Readonly<Record<EmployeeKey, NeedsSource>> = Object.freeze({
  web: "arion",
  marketer: "spark",
  office: "oliver",
});

/** The activity endpoint, per source, asking only for what a person can act on. */
export const WAITING_PATHS: Readonly<Record<NeedsSource, string>> = Object.freeze({
  arion: "/arion/agents/activity?waiting=1",
  spark: "/api/v1/agents/activity?waiting=1",
  oliver: "/agents/activity?waiting=1",
});

/** The run history endpoint, per source. */
export const RUNS_PATHS: Readonly<Record<NeedsSource, string>> = Object.freeze({
  arion: "/arion/agents/runs?limit=50",
  spark: "/api/v1/agents/runs?limit=50",
  oliver: "/agents/runs?limit=50",
});

export interface DecideApprove {
  path: string;
  label: string;
  edits: Array<"title" | "subject" | "body">;
  edits_required?: true;
  when?: "schedule";
}
export interface DecideSkip { path: string; reason: "optional" | "required" }
export interface DecidePublish { path: string; label: string }
export interface Decide { approve?: DecideApprove; skip?: DecideSkip; publish?: DecidePublish }

/** One waiting item: the shared activity row plus what phase 1 adds (§F.1). */
export type NeedsYouRow = AgentActivityRow & { source: NeedsSource };

/** Which employee left this item: the row says, else the source it came from. */
export function employeeOfRow(row: Pick<AgentActivityRow, "employee_key"> & { source?: NeedsSource }): EmployeeKey | null {
  if (row.employee_key && (EMPLOYEE_KEYS as readonly string[]).includes(row.employee_key)) return row.employee_key as EmployeeKey;
  return row.source ? SOURCE_EMPLOYEE[row.source] : null;
}

/** The failure line for one source: never a silent empty list (§F.4). */
export function sourceFailedWords(source: NeedsSource): string {
  return `We couldn't load what ${yourEmployee(SOURCE_EMPLOYEE[source])} left for you. Try again.`;
}

/** The HTTP status inside whatever an api client threw, or null when it is not one. */
export function statusOfError(err: unknown): number | null {
  if (err && typeof err === "object") {
    const e = err as { status?: unknown; type?: unknown; message?: unknown };
    if (e.type === "tier_gate") return 403;
    if (typeof e.status === "number" && e.status > 0) return e.status;
    if (typeof e.message === "string") {
      const m = /^(?:SPARK|OLIVER|ARION|LUMEN|PLATFORM) API (\d{3}):/.exec(e.message);
      if (m) return Number(m[1]);
    }
  }
  return null;
}

export interface SourceResult { source: NeedsSource; rows: NeedsYouRow[]; failed: boolean; notOwned: boolean }

/**
 * One settled source → its rows, or why there are none. A 403 is a product
 * this business does not have: nothing from it, and nothing to say. Any other
 * failure is said, one line per source.
 */
/**
 * Is this row something a person can act on, from one of the team's jobs?
 * Each endpoint's ?waiting=1 already asks for exactly that; this holds the line
 * when a product answers with its whole activity list (a note, a stood-down
 * suggestion, the oversight layer's checks): those are nobody's job and nothing
 * to decide, so they are not shown as waiting.
 */
export function isWaitingItem(row: Pick<AgentActivityRow, "agent" | "kind" | "status" | "job_key" | "decide" | "can_publish">): boolean {
  if (row.decide && (row.decide.approve || row.decide.skip || row.decide.publish)) return true;
  const ours = !!row.job_key || !!AGENT_JOBS[row.agent || ""];
  if (!ours) return false;
  if (row.can_publish) return true;
  return row.kind === "proposal" && row.status === "proposed";
}

export function sourceResult(source: NeedsSource, settled: PromiseSettledResult<AgentActivityRow[] | null | undefined>): SourceResult {
  if (settled.status === "fulfilled") {
    const rows = (Array.isArray(settled.value) ? settled.value : []).filter(isWaitingItem);
    return { source, rows: rows.map((r) => ({ ...r, source })), failed: false, notOwned: false };
  }
  if (statusOfError(settled.reason) === 403) return { source, rows: [], failed: false, notOwned: true };
  return { source, rows: [], failed: true, notOwned: false };
}

/** Every source's rows in one list, newest first, and one failure line per source that failed (mutation M20). */
export function mergeNeedsYou(results: SourceResult[]): { rows: NeedsYouRow[]; failures: Array<{ source: NeedsSource; words: string }> } {
  const rows: NeedsYouRow[] = [];
  const failures: Array<{ source: NeedsSource; words: string }> = [];
  for (const r of results) {
    if (r.failed) failures.push({ source: r.source, words: sourceFailedWords(r.source) });
    rows.push(...r.rows);
  }
  rows.sort((a, b) => (Date.parse(b.proposed_at || "") || 0) - (Date.parse(a.proposed_at || "") || 0));
  return { rows, failures };
}

/** "from your web person · Blog posts" */
export function fromJobLine(row: Pick<AgentActivityRow, "employee_key" | "job_key" | "agent_label"> & { source?: NeedsSource }, jobName?: string | null): string {
  const who = yourEmployee(employeeOfRow(row));
  const what = (jobName || "").trim() || (row.agent_label || "").trim();
  return what ? `from ${who} · ${what}` : `from ${who}`;
}

/** Why it waited: the server's sentence, else the older hold note, else the plain default. */
export function heldWordsOf(row: Pick<AgentActivityRow, "held_words" | "hold_note">): string {
  return (row.held_words || "").trim() || (row.hold_note || "").trim() || "It's waiting for you to look.";
}

export function skipPrompt(reason: "optional" | "required" | undefined): string {
  return reason === "required" ? "Why? (needed)" : "Why? (optional — it helps your team learn)";
}

/** Approve is pressable: an "edits required" item only once a word has changed. */
export function approveAllowed(approve: Pick<DecideApprove, "edits_required"> | undefined, changed: boolean): boolean {
  if (!approve) return false;
  return approve.edits_required ? changed : true;
}

/**
 * The paths the server hands us must belong to the source they came from.
 * A row cannot send a decision to some other service.
 */
export function decidePathOk(source: NeedsSource, path: string | null | undefined): boolean {
  if (!path || typeof path !== "string") return false;
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("..") || /[\s:\\]/.test(path)) return false;
  // A percent-encoded dot ("%2e") becomes a real dot segment in the browser's
  // URL parser, so "/arion/%2e%2e/admin" would be sent to "/admin".
  if (/%2e|%2f|%5c/i.test(path)) return false;
  let pathname: string;
  try { pathname = new URL(path, "http://x").pathname; } catch { return false; }
  const asked = path.split(/[?#]/)[0];
  if (pathname !== asked) return false;
  if (source === "arion") return pathname.startsWith("/arion/");
  if (source === "spark") return pathname.startsWith("/api/v1/");
  return !pathname.startsWith("/arion/") && !pathname.startsWith("/api/v1/");
}

export interface DecideEdits { title?: string; subject?: string; body?: string }

/**
 * The body an Approve sends, in each route's own field names (§F.1 table):
 * only the fields the row says may be edited, and only when the person edited.
 */
export function approveBody(
  source: NeedsSource, path: string, approve: Pick<DecideApprove, "edits" | "when">,
  edits: DecideEdits | null, scheduledFor?: string | null,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const allowed = new Set(approve.edits || []);
  if (edits) {
    if (source === "arion" && path.startsWith("/arion/content-agent/")) {
      if (allowed.has("title") && edits.title !== undefined) out.title = edits.title;
      if (allowed.has("body") && edits.body !== undefined) out.body_markdown = edits.body;
    } else if (source === "arion") {
      if (allowed.has("body") && edits.body !== undefined) out.body = edits.body;
    } else if (source === "spark" && path.startsWith("/api/v1/campaign-agent/")) {
      if (allowed.has("subject") && edits.subject !== undefined) out.subject_line = edits.subject;
      if (allowed.has("body") && edits.body !== undefined) out.body_html = edits.body;
    } else if (source === "spark") {
      if (allowed.has("subject") && edits.subject !== undefined) out.subject = edits.subject;
      if (allowed.has("body") && edits.body !== undefined) out.body = edits.body;
    } else if (source === "oliver" && path.startsWith("/qtc-agent/")) {
      if (allowed.has("subject") && edits.subject !== undefined) out.subject_line = edits.subject;
      if (allowed.has("body") && edits.body !== undefined) out.message_body = edits.body;
    }
  }
  if (approve.when === "schedule" && scheduledFor) out.scheduled_for = scheduledFor;
  return out;
}

export const SCHEDULE_FAILED_WORDS = "It's approved, but it couldn't be handed to your social scheduler, so it isn't scheduled yet. Press Try again on it.";

/**
 * What a decision's 2xx answer actually says (§F.3). A social post approved
 * but not handed to the scheduler answers 200 with scheduled:false; that, and
 * any explicit ok:false / failed:true, is a failure said in rose, never green.
 */
export function decisionResult(which: "approve" | "skip" | "publish", out: unknown): { ok: boolean; words: string } {
  const o = (out && typeof out === "object" ? out : {}) as Record<string, unknown>;
  const d = (o.data && typeof o.data === "object" ? o.data : o) as Record<string, unknown>;
  const said = runnerSentence(d.words) || runnerSentence(o.words);
  const failed = d.scheduled === false || d.ok === false || o.ok === false || d.failed === true || o.failed === true;
  if (failed) return { ok: false, words: said || (d.scheduled === false ? SCHEDULE_FAILED_WORDS : NOTHING_CHANGED_WORDS) };
  const fallback = which === "skip" ? "Skipped. It won't come back." : which === "publish" ? "Sent to your website." : "Done.";
  return { ok: true, words: said || fallback };
}

/** Which buttons a Needs-you card has, from the row's own `decide` (a row without one gets none, never a guessed route). */
export type CardKind = "approve" | "publish" | "skip" | "none";
export function cardKind(decide: Decide | null | undefined): CardKind {
  const d = decide || {};
  if (d.approve) return "approve";
  if (d.publish) return "publish";
  if (d.skip) return "skip";
  return "none";
}

/**
 * The row a Needs-you card draws: why it waited and which job it came from in
 * the owner's words, and NO attribution. The products stamp a line naming the
 * platform's own company and the word "Agent" on every row; on this screen the
 * job line says who made it, so that line never reaches an owner.
 */
export function cardRow<R extends AgentActivityRow & { source?: NeedsSource }>(row: R, jobName?: string | null): R {
  return { ...row, attribution: "", hold_note: heldWordsOf(row), agent_label: fromJobLine(row, jobName) };
}

/** The value for a date-and-time picker: tomorrow at 10:00 in this browser's time zone. */
export function tomorrowAtTen(now: Date = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 10, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** A picker value ("2026-10-09T10:00", local) → ISO, or null when it is not a time. */
export function localToIso(value: string | null | undefined): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// ── Run it now (§F.2) ───────────────────────────────────────────────────────

export interface RunCall { source: NeedsSource; path: string; body: Record<string, unknown>; asksBrief: boolean }

/** The route each job's Run it now calls — the runners' own, never a second start path. */
export function runNowCall(jobKey: string, brief?: string | null): RunCall | null {
  switch (jobKey) {
    case "arion.blog_posts":
    case "arion.social_posts":
      return { source: "arion", path: "/arion/agents/run", body: { job_key: jobKey }, asksBrief: false };
    case "arion.review_replies":
      return { source: "arion", path: "/arion/review-replies/run", body: {}, asksBrief: false };
    case "spark.winback":
      return { source: "spark", path: "/api/v1/campaign-agent/run-winback", body: {}, asksBrief: false };
    case "spark.campaign_from_brief":
      return { source: "spark", path: "/api/v1/campaign-agent/draft", body: { brief: (brief || "").trim() }, asksBrief: true };
    case "oliver.quote_payment_followups":
      return { source: "oliver", path: "/qtc-agent/run", body: {}, asksBrief: false };
    case "oliver.crew_suggestions":
      return { source: "oliver", path: "/fieldops-agent/run", body: {}, asksBrief: false };
    default:
      return null;
  }
}

export const RUN_UNKNOWN_WORDS = "It has had a look. Anything it wrote is in Needs you.";
export const RUN_NOTHING_WORDS = "It has had a look and there was nothing to do.";
export const RUN_SPEND_LIMIT_WORDS = "Nothing ran: it has reached its spending limit, so nothing was written and nothing was spent.";
export const RUN_HALTED_WORDS = "Nothing ran: it has stopped itself. Press Start it again on its row first.";
export const RUN_OFF_WORDS = "Nothing ran: that job is off. Switch it on first.";
export const RUN_FAILED_WORDS = "It couldn't finish this time, so nothing new is waiting for you. Try again in a minute.";
export const RUN_PAUSED_WORDS = "Nothing ran: your team's writing is paused for everyone just now. Try again later.";
export const RUN_NOT_OWNED_WORDS = "Nothing ran: your plan doesn't include this job.";
export const RUN_PART_FAILED_WORDS = "Part of it didn't work this time (it couldn't read or answer some of your reviews). Try again in a minute.";
export const RUN_NO_CREDITS_WORDS = "It ran out of credits before it finished.";

/** A sentence a runner wrote, when it is one an owner can read. */
function runnerSentence(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t || !/\s/.test(t) || /tenant|\bjson\b|playbook|[{}]/i.test(t)) return null;
  return t;
}

const num = (v: unknown): number | null => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

/** One run (or one business's entry in a tick's summary) that did not do its work: why, in words. */
function runFailure(e: Record<string, unknown>): string | null {
  const status = String(e.status ?? "");
  const outcome = String(e.outcome ?? "");
  const said = runnerSentence(e.words);
  if (outcome === "suite_cost_ceiling" || outcome === "cost_ceiling") return RUN_SPEND_LIMIT_WORDS;
  if (status === "skipped_halted" || status === "halted_sticky" || outcome === "sticky_halt") return RUN_HALTED_WORDS;
  if (status === "halted") return said || RUN_SPEND_LIMIT_WORDS;
  if (outcome === "not_enabled" || outcome === "job_off") return said || RUN_OFF_WORDS;
  if (outcome === "blocked") return said || RUN_FAILED_WORDS;
  if (status === "tick_error" || status === "failed" || outcome === "failed") return said || RUN_FAILED_WORDS;
  if (status === "skipped") return said || RUN_FAILED_WORDS;
  return null;
}

/** "posted 1 by itself, and wrote 2 things for you. They're in Needs you." */
function didWords(posted: number, waiting: number): string {
  if (posted <= 0 && waiting <= 0) return RUN_NOTHING_WORDS;
  const bits: string[] = [];
  if (posted > 0) bits.push(`posted ${posted} by itself`);
  if (waiting > 0) bits.push(`wrote ${waiting} ${waiting === 1 ? "thing" : "things"} for you`);
  const tail = waiting > 0 ? ` ${waiting === 1 ? "It's" : "They're"} in Needs you.` : "";
  return `It has had a look and ${bits.join(", and ")}.${tail}`;
}

/**
 * What came of a Run it now (§F.2), as { ok, words }. ok:false goes in the rose
 * alert: a run that was stopped by its spending limit, blocked by a missing
 * answer, switched off, halted or failed is NEVER said in green
 * (never catch-swallow-report-success). Reads each runner's committed shape:
 *   · one run   (OLIVER Quote-to-Cash / Field Ops, the marketer's runs):
 *               { status, outcome, drafted | suggestions, words? }
 *   · a tick    (the web person's posts):   { disabled?, jobStateUnreadable?, productOff, results: [...] }
 *   · a tick    (review replies):           { drafted, held, posted, failed, errors: [...], runs: [...] }
 * A count it did not send is unknown, never 0.
 */
export function runResult(out: unknown): { ok: boolean; words: string } {
  const o = (out && typeof out === "object" ? out : {}) as Record<string, unknown>;
  const d = (o.data && typeof o.data === "object" ? o.data : o) as Record<string, unknown>;

  if (d.disabled === true) return { ok: false, words: RUN_PAUSED_WORDS };
  if (d.jobStateUnreadable === true) return { ok: false, words: runnerSentence(d.words) || RUN_FAILED_WORDS };
  const off = (d.productOff as { skipped?: unknown[] } | undefined)?.skipped;
  const isTick = Array.isArray(d.results) || Array.isArray(d.runs);

  if (isTick) {
    const entries = ((Array.isArray(d.results) ? d.results : d.runs) as unknown[])
      .filter((e): e is Record<string, unknown> => !!e && typeof e === "object");
    const failures = entries.map(runFailure).filter((w): w is string => !!w);
    let posted = 0;
    let waiting = 0;
    let known = false;
    if (Array.isArray(d.results)) {
      // The web person's posts: drafted includes the ones that went out by themselves.
      for (const e of entries) {
        if (runFailure(e)) continue;
        const dr = num(e.drafted);
        if (dr === null) continue;
        known = true;
        const inAdvance = num(e.approvedInAdvance) || 0;
        posted += inAdvance;
        waiting += Math.max(0, dr - inAdvance);
      }
    } else {
      // Review replies: the summary's own totals.
      const p = num(d.posted);
      const h = num(d.held);
      if (p !== null || h !== null) { known = true; posted = p || 0; waiting = h || 0; }
    }
    if (Array.isArray(d.errors) && d.errors.length) failures.push(RUN_PART_FAILED_WORDS);
    if ((num(d.skippedInsufficientCredits) || 0) > 0) failures.push(RUN_NO_CREDITS_WORDS);
    if ((num(d.failed) || 0) > 0 && !Array.isArray(d.results)) {
      const f = num(d.failed) as number;
      failures.push(`${f} ${f === 1 ? "reply" : "replies"} didn't go to Google. ${f === 1 ? "It's" : "They're"} in Needs you to try again.`);
    }
    if (!entries.length && Array.isArray(off) && off.length) return { ok: false, words: RUN_NOT_OWNED_WORDS };
    if (failures.length) {
      const did = known && (posted > 0 || waiting > 0) ? ` ${didWords(posted, waiting)}` : "";
      return { ok: false, words: `${[...new Set(failures)].join(" ")}${did}` };
    }
    if (!entries.length) return { ok: false, words: RUN_FAILED_WORDS };
    return { ok: true, words: known ? didWords(posted, waiting) : RUN_UNKNOWN_WORDS };
  }

  const failed = runFailure(d);
  if (failed) return { ok: false, words: failed };
  const said = runnerSentence(d.words);
  if (said) return { ok: true, words: said };
  const n = num(d.drafted) ?? num(d.suggestions);
  if (n === null) return { ok: true, words: RUN_UNKNOWN_WORDS };
  return { ok: true, words: didWords(0, n) };
}

/**
 * Run it now is offered only for a job that is on, not paused by its plan and
 * not stopped by itself (fails closed: unknown "on" is not on). The runners
 * refuse an off job too, but OLIVER's answers 200 "not enabled", so this is
 * the line that keeps the button off.
 */
export function canRunNow(p: { hasRunRoute: boolean; isOn: boolean | null | undefined; paused: boolean; halted: boolean }): boolean {
  return p.hasRunRoute === true && p.isOn === true && !p.paused && !p.halted;
}

// ── which agent of each product belongs to which job (rows with no job_key) ─

/** The product's own agent key → the job keys it runs. A row that names its job_key wins. */
export const AGENT_JOBS: Readonly<Record<string, string[]>> = Object.freeze({
  content: ["arion.blog_posts", "arion.social_posts"],
  review_replies: ["arion.review_replies"],
  campaign: ["spark.winback", "spark.campaign_from_brief"],
  responder: ["spark.inquiry_reply"],
  qtc: ["oliver.quote_payment_followups"],
  fieldops: ["oliver.crew_suggestions"],
});

/** Is this run (or row) one of this employee's? The founder's oversight runs are nobody's job. */
export function belongsTo(row: { job_key?: string | null; agent?: string | null; employee_key?: string | null }, jobKeys: string[]): boolean {
  if (row.job_key) return jobKeys.includes(row.job_key);
  const keys = AGENT_JOBS[row.agent || ""] || [];
  return keys.some((k) => jobKeys.includes(k));
}

/** The latest run per job: "Last did …" only when a run exists. */
export function lastRunByJob(runs: Array<Pick<AgentRunRow, "started_at" | "agent"> & { job_key?: string | null }>, jobKeys: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const r of runs) {
    const keys = r.job_key ? [r.job_key] : (AGENT_JOBS[r.agent || ""] || []);
    for (const k of keys) {
      if (!jobKeys.includes(k) || !r.started_at) continue;
      if (!out[k] || Date.parse(r.started_at) > Date.parse(out[k])) out[k] = r.started_at;
    }
  }
  return out;
}

/** Waiting items per job, for "{n} need you" on each job row. */
export function waitingByJob(rows: Array<{ job_key?: string | null; agent?: string | null }>, jobKeys: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) {
    const keys = r.job_key ? [r.job_key] : (AGENT_JOBS[r.agent || ""] || []).slice(0, 1);
    for (const k of keys) if (jobKeys.includes(k)) out[k] = (out[k] || 0) + 1;
  }
  return out;
}

/** Today → "What I did": the last 7 days of runs, one plain line each, newest first. */
export function whatIDid(runs: Array<Pick<AgentRunRow, "run_id" | "started_at" | "outcome_label" | "agent_label">>, now: number = Date.now()): Array<{ id: string; at: string; words: string }> {
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
  return runs
    .filter((r) => r.started_at && Date.parse(r.started_at) >= weekAgo)
    .sort((a, b) => Date.parse(b.started_at || "") - Date.parse(a.started_at || ""))
    .map((r) => ({ id: r.run_id, at: r.started_at as string, words: (r.outcome_label || "").trim() || "Had a look." }));
}

// ── job settings ("How much") ───────────────────────────────────────────────

/**
 * The owner's limits for one job, checked the way the server will check them,
 * so a mistake is said beside the box before anything is sent.
 * Returns the values to send, or the sentences that stop the save.
 */
export function varsPayload(defs: Record<string, VarDef>, draft: Record<string, string>): { ok: true; vars: Record<string, unknown> } | { ok: false; errors: string[] } {
  const vars: Record<string, unknown> = {};
  const errors: string[] = [];
  for (const [key, raw] of Object.entries(draft)) {
    const def = defs[key];
    if (!def) { errors.push("This job has no setting called that."); continue; }
    const v = (raw ?? "").trim();
    if (def.type === "int" || def.type === "stars") {
      const n = Number(v);
      const min = def.type === "stars" ? Math.max(4, def.min ?? 4) : def.min;
      const max = def.type === "stars" ? Math.min(5, def.max ?? 5) : def.max;
      if (!v || !Number.isInteger(n) || (min !== undefined && n < min) || (max !== undefined && n > max)) {
        errors.push(min !== undefined && max !== undefined
          ? `${def.label} must be between ${min} and ${max}.`
          : `${def.label} must be a whole number.`);
        continue;
      }
      vars[key] = n;
    } else if (def.type === "list") {
      // One per line, as the box says: an item can carry a comma
      // ("Mulch, edging and spring clean-ups" is one topic), the same rule as
      // Your business (businessProfileForm parseLines).
      const items = v.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
      if (def.max_items !== undefined && items.length > def.max_items) {
        errors.push(`${def.label}: ${def.max_items} at most.`);
        continue;
      }
      if (def.max_len !== undefined && items.some((s) => s.length > (def.max_len as number))) {
        errors.push(`${def.label}: each one ${def.max_len} letters at most.`);
        continue;
      }
      vars[key] = items;
    } else if (def.type === "choice") {
      if (def.options && !def.options.includes(v)) { errors.push(`${def.label}: pick one of the choices.`); continue; }
      vars[key] = v;
    } else if (def.type === "time") {
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) { errors.push(`${def.label} must be a time like 10:00.`); continue; }
      vars[key] = v;
    } else {
      errors.push("This job has no setting called that.");
    }
  }
  return errors.length ? { ok: false, errors } : { ok: true, vars };
}

/** A stored var as the text its box holds. */
export function varText(value: unknown): string {
  if (Array.isArray(value)) return value.map(String).join("\n");
  if (value === null || value === undefined) return "";
  return String(value);
}

/** The limits under a var's box, in words. */
export function varLimitWords(def: VarDef): string | null {
  if ((def.type === "int" || def.type === "stars") && def.min !== undefined && def.max !== undefined) return `From ${def.min} to ${def.max}.`;
  if (def.type === "list" && def.max_items !== undefined) return `One per line, ${def.max_items} at most.`;
  if (def.type === "time") return "A time like 10:00, in your business's time zone.";
  return null;
}

// ── refusals from platform-api, said as the sentence they are ───────────────

export const UNREACHABLE_WORDS = "We couldn't reach the server, so nothing changed. Check your connection and try again.";
export const UNDECIDED_WORDS = "We couldn't check just now, so nothing changed. Try again in a minute.";
export const NOT_ADMIN_WORDS = "Only the business owner or an admin can change what your team does.";
export const NOTHING_CHANGED_WORDS = "That didn't go through, so nothing changed. Try again in a minute.";

/**
 * The sentence a refused team request carries. The server writes each refusal
 * as a sentence; when it sends none (a dropped connection, a fault), the
 * fallback says what happened and that nothing changed. A machine code and the
 * account record's internal name never reach the screen.
 */
export function teamRefusal(err: unknown): string {
  const status = statusOfError(err);
  const body = (err && typeof err === "object" ? (err as { body?: unknown }).body : null) as
    | { words?: unknown; message?: unknown; error?: unknown; errors?: unknown }
    | null;
  const clean = (s: unknown): string | null => {
    if (typeof s !== "string") return null;
    const t = s.trim();
    if (!t || !/\s/.test(t) || /tenant|\bjson\b|playbook/i.test(t)) return null;
    return t;
  };
  if (body && typeof body === "object") {
    const w = clean(body.words) || clean(body.message);
    if (w) return w;
    if (Array.isArray(body.errors)) {
      const lines = body.errors.map((e) => clean(typeof e === "string" ? e : (e as { words?: string })?.words)).filter(Boolean);
      if (lines.length) return lines.join(" ");
    }
    if (status !== null && status >= 400 && status < 500 && status !== 401 && status !== 403) {
      const e = clean(body.error);
      if (e) return e;
    }
  }
  if (status === null || status === 0) return UNREACHABLE_WORDS;
  if (status === 403) return NOT_ADMIN_WORDS;
  if (status === 503) return UNDECIDED_WORDS;
  return NOTHING_CHANGED_WORDS;
}

// ── ARGUS → Workflows: a job row ────────────────────────────────────────────

/** "Made by: your web person" */
export function madeByWords(key: EmployeeKey | null | undefined): string {
  return `Made by: ${yourEmployee(key)}`;
}

/**
 * A READ that failed (the employee's jobs, the switched-on jobs). Unlike a
 * refused write it changed nothing, so it never says "nothing changed": the
 * server's sentence when it sent one, else what happened and what to do.
 */
export function teamLoadWords(err: unknown): string {
  const status = statusOfError(err);
  if (status === null || status === 0) return "We couldn't reach the server. Check your connection and try again.";
  const body = (err && typeof err === "object" ? (err as { body?: unknown }).body : null) as { words?: unknown; message?: unknown } | null;
  for (const v of [body?.words, body?.message]) {
    if (typeof v === "string" && /\s/.test(v.trim()) && !/tenant|\bjson\b|playbook/i.test(v)) return v.trim();
  }
  if (status === 403) return "Only people on this business's account can see its team.";
  return "Try again in a minute.";
}

/**
 * The page's line when the employee's jobs could not be read: the server's own
 * sentence when it sent one (it already says what happened), otherwise what
 * could not be loaded and what to do. Never the two run together.
 */
export function employeeLoadWords(key: EmployeeKey, err: unknown): string {
  const w = teamLoadWords(err);
  const generic = w === "Try again in a minute." || w.startsWith("We couldn't reach the server");
  return generic ? `We couldn't load ${yourEmployee(key)}'s jobs. ${w}` : w;
}

/** The jobs each employee's product runs today, for reading its runs and waiting items when its job list could not be read. */
export function knownJobKeys(key: EmployeeKey): string[] {
  const prefix = `${EMPLOYEE_PRODUCT[key].key}.`;
  return [...new Set(Object.values(AGENT_JOBS).flat())].filter((k) => k.startsWith(prefix));
}
