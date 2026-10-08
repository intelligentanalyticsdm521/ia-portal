// chatWorkflows.ts — the Portal's side of ARGUS chat workflows (contract
// CONTRACT_ARGUS_CHAT_PLAYBOOKS_2026-10-07 §C.12, §F).
//
// PURE: no React, no MSAL, no import.meta — so test/chat-workflow-card-ui and
// test/argus-workflows-ui import it directly. Everything a screen SAYS about a
// chat workflow is decided here, once: the step sentences in the read-only
// tree, the mode sentences, the "sure" words, the refusal sentences. The
// screens only lay them out.
//
// The calls themselves go through useSparkApi (the base is LUMEN, and it does
// not unwrap the { data } envelope), per convention_data_fetching. The paths
// are built here so a screen and its test name the same route.
//
// Nothing in this file knows any business. The words come from the
// business's own workflow (its services, its paths, its buttons); the only
// sentences written here are the generic step descriptions.

// ── wire shapes (LUMEN routes/chatWorkflows.js, §C.12) ──────────────────────

export type ChatWorkflowMode = "automatic" | "review";

export interface ChatPlaybookWarning {
  code?: string;
  words?: string;
  text?: string;
  message?: string;
}

export interface ChatPlaybookRow {
  playbook_id: string;
  name: string;
  site_id: string | null;
  site_label: string | null;
  status: "live" | "off";
  mode: ChatWorkflowMode;
  live_version: number | null;
  draft_version: number | null;
  owner_display: string | null;
  needs_you_count: number;
  allowed: boolean;
  allowed_words: string | null;
  tree: unknown;
  warnings: Array<string | ChatPlaybookWarning>;
  /** The links the workflow declares and the address the owner set for each
   *  (LUMEN linksOf: { key, label, url|null }). Absent from an older server. */
  links?: ChatLinkRow[];
}

/** One link a workflow's buttons open: the booking page, the trial page… */
export interface ChatLinkRow {
  key: string;
  label: string;
  url: string | null;
}

export interface ChatActionRow {
  action_id: string;
  name: string;
  url: string;
  key_id: string;
  secret_prefix: string;
  fields: string[];
  result_handling: { attach_to_lead?: boolean; email_visitor?: boolean; note?: boolean; result_label?: string } | null;
  status: "active" | "off";
  last_test_at: string | null;
  last_test_ok: boolean | null;
  last_test_plain: string | null;
}

export interface ArgusWorkflowRow {
  workflow_id: string;
  kind: "chat";
  name: string;
  trigger: { type: string; label: string };
  mode: ChatWorkflowMode;
  enabled: boolean;
  last_ran_at: string | null;
  runs_this_month: number;
  needs_you_count: number;
  site_label: string | null;
  /** The package gate, per row: LUMEN never refuses the list itself, it marks
   *  each row. Only `true` shows the mode and the switch (fail closed). */
  allowed?: boolean;
  allowed_words?: string | null;
}

export interface NeedsYouHeld {
  kind: "held";
  run_id: string;
  workflow_name: string;
  lead_id: number | null;
  visitor_name: string | null;
  action_label: string;
  waiting_since: string | null;
  summary_plain: string | null;
}

export interface NeedsYouUnmatched {
  kind: "unmatched";
  unmatched_id: number;
  reason: "unmatched" | "hold";
  text: string;
  intent_words: string | null;
  sure: string | null;
  lead_id: number | null;
  conversation_id: number;
  at: string | null;
}

export type NeedsYouItem = NeedsYouHeld | NeedsYouUnmatched;

export interface WorkflowHistoryRow {
  run_id: string;
  at: string | null;
  workflow_name: string;
  visitor_name: string | null;
  lead_id: number | null;
  action_label: string;
  status_words: string;
  file_url: string | null;
  /** What the tool sends back ("report", "quote"), when the server says. */
  result_label?: string | null;
}

/** The block the lead's Conversation tab shows above a transcript (§C.11). */
export interface ChatConversationWorkflow {
  name: string;
  service: string | null;
  path: string | null;
  intent_words: string | null;
  sure: string | null;
  fields: Array<{ label: string; value: string }>;
  results: Array<{ run_id: string; label: string; status_words: string; file_url: string | null; finished_at: string | null; result_label?: string | null }>;
}

// ── the routes, built in one place ──────────────────────────────────────────

const enc = encodeURIComponent;

export const CHAT_WF = {
  playbooks: "/api/v1/chat/playbooks",
  playbook: (id: string) => `/api/v1/chat/playbooks/${enc(id)}`,
  path: (id: string, pathKey: string) => `/api/v1/chat/playbooks/${enc(id)}/paths/${enc(pathKey)}`,
  links: (id: string) => `/api/v1/chat/playbooks/${enc(id)}/links`,
  site: (siteId: string) => `/api/v1/chat/sites/${enc(siteId)}`,
  actions: "/api/v1/chat/actions",
  action: (id: string) => `/api/v1/chat/actions/${enc(id)}`,
  rotate: (id: string) => `/api/v1/chat/actions/${enc(id)}/rotate-secret`,
  test: (id: string) => `/api/v1/chat/actions/${enc(id)}/test`,
  workflows: "/api/v1/argus/workflows",
  workflow: (id: string) => `/api/v1/argus/workflows/${enc(id)}`,
  needsYou: "/api/v1/argus/workflows/needs-you",
  approve: (runId: string) => `/api/v1/argus/workflows/runs/${enc(runId)}/approve`,
  skip: (runId: string) => `/api/v1/argus/workflows/runs/${enc(runId)}/skip`,
  ignore: (id: number | string) => `/api/v1/argus/workflows/unmatched/${enc(String(id))}/ignore`,
  addToChat: (id: number | string) => `/api/v1/argus/workflows/unmatched/${enc(String(id))}/add-to-playbook`,
  history: (before?: string | null) =>
    `/api/v1/argus/workflows/history?limit=50${before ? `&before=${enc(before)}` : ""}`,
} as const;

/** Where the owner goes to switch paths on or off, and where Needs you lives. */
export const LEAD_SOURCES_ROUTE = "/app/services/spark_lead_sources";
export const WORKFLOWS_ROUTE = "/app/services/argus_workflows";
export const NEEDS_YOU_ROUTE = `${WORKFLOWS_ROUTE}?tab=needs-you`;

// ── sentences ──────────────────────────────────────────────────────────────

export function modeLine(mode: ChatWorkflowMode | string | null | undefined): string {
  return mode === "automatic" ? "Runs automatically" : "Waits for you before it sends anything";
}

/** What the notice says after the owner changes the mode. Plain words. */
export function modeChangedWords(name: string, mode: ChatWorkflowMode): string {
  return mode === "automatic"
    ? `${name} now runs on its own. Anything a visitor asks for is sent straight away.`
    : `${name} now waits for you. Anything it would send a visitor waits in Needs you until you say so.`;
}

export function enabledChangedWords(name: string, enabled: boolean): string {
  return enabled
    ? `${name} is on. Visitors see it on the next page they open.`
    : `${name} is off. Visitors get the usual chat until you switch it back on.`;
}

/** "sure" | "fairly sure" | "not sure" as the server sends them; anything else is dropped. */
export function sureWords(sure: string | null | undefined): string | null {
  if (sure === "sure" || sure === "fairly sure" || sure === "not sure") return sure;
  return null;
}

export function heldSentence(item: Pick<NeedsYouHeld, "visitor_name" | "action_label">): string {
  const who = (item.visitor_name || "").trim() || "A visitor";
  return `${who} asked for ${item.action_label || "something"}. It's waiting for you.`;
}

export function warningWords(w: string | ChatPlaybookWarning): string {
  if (typeof w === "string") return w;
  return w.words || w.text || w.message || "";
}

/** The server flags an unknown time zone; the card then shows the picker inline. */
export function isTimezoneWarning(w: string | ChatPlaybookWarning): boolean {
  if (typeof w !== "string" && w.code && /time_?zone|timezone/i.test(w.code)) return true;
  return /time zone/i.test(warningWords(w));
}

/** "3 min ago" from a server ISO time. Never invented: no time, no words. */
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
  return new Date(t).toLocaleDateString();
}

/**
 * The sentences a refusal carries. LUMEN answers a refused publish with a
 * list of plain sentences (`errors`), and everything else with `message`.
 * sparkApi throws `SPARK API <status>: <body>`; this reads the body.
 */
export function refusalSentences(err: unknown): string[] {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  const m = /^SPARK API (\d{3}): ([\s\S]*)$/.exec(msg);
  if (!m) {
    // A dropped connection, a browser that could not reach us, a fault in the
    // page: the raw message goes to the console, never to the owner.
    if (msg) console.warn("[chat workflows] request failed:", msg);
    return [UNREACHABLE_WORDS];
  }
  try {
    const body = JSON.parse(m[2]) as { errors?: unknown; message?: unknown; error?: unknown; words?: unknown };
    // The role check's own message is jargon ("Requires one of: admin…").
    if (body.error === "forbidden") return [ADMIN_ONLY_WORDS];
    const list = Array.isArray(body.errors)
      ? body.errors.map((e) => (typeof e === "string" ? e : (e as { words?: string; message?: string })?.words || (e as { message?: string })?.message || "")).filter(Boolean)
      : [];
    if (list.length) return list as string[];
    if (typeof body.message === "string" && body.message) return [body.message];
    if (typeof body.words === "string" && body.words) return [body.words];
    // A bare code (PUT /chat/sites/:siteId answers {error:"no_such_site"} and
    // nothing else): its own sentence, never the code with spaces for underscores.
    if (typeof body.error === "string" && body.error) {
      const words = CODE_WORDS[body.error];
      if (words) return [words];
      console.warn("[chat workflows] refused with a code we have no sentence for:", body.error);
    }
  } catch { /* not JSON — fall through to the plain sentence */ }
  return [NOT_DONE_WORDS];
}

/** Said when the server refused with nothing we can say in its place. */
export const NOT_DONE_WORDS = "That didn't go through. Please try again in a minute.";

/**
 * The sentence for each code a chat write can answer with no message of its
 * own (LUMEN routes/chat.js PUT /chat/sites/:siteId). One instruction each.
 */
export const CODE_WORDS: Readonly<Record<string, string>> = Object.freeze({
  no_such_site: "That website isn't on your account any more. Reload the page to see your websites.",
  bad_site_id: "We couldn't tell which website that is. Reload the page to see your websites.",
  chat_site_save_failed: "Something went wrong on our side. Please try again in a minute.",
  no_tenant: "We couldn't tell which business you're signed in to. Sign in again.",
});

export function statusOf(err: unknown): number | null {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  const m = /^SPARK API (\d{3}):/.exec(msg);
  return m ? Number(m[1]) : null;
}

/** Said for anything that is not the server's own answer. */
export const UNREACHABLE_WORDS = "We couldn't reach the server. Check your connection and try again.";

/** A write refused because the person is not an admin on the account. */
export const ADMIN_ONLY_WORDS = "Only an admin on your account can change this. Ask one of them, or sign in as one.";

/** The server's error code (`not_allowed`, `forbidden`, …), or null. */
export function errorCodeOf(err: unknown): string | null {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  const m = /^SPARK API \d{3}: ([\s\S]*)$/.exec(msg);
  if (!m) return null;
  try {
    const body = JSON.parse(m[1]) as { error?: unknown };
    return typeof body.error === "string" ? body.error : null;
  } catch { return null; }
}

export const NO_SPARK_WORDS =
  "Your workflows appear here. Right now the only kind is the website chat, which comes with SPARK.";

/** The package sentence when the server sends none of its own. */
export const NOT_ALLOWED_WORDS = "Chat workflows with buttons come with the SPARK Leads Growth package.";

/**
 * Whether a row on ARGUS → Workflows gets its controls. Only an explicit
 * `allowed: true` does; a row that is refused, or does not say, reads the
 * package sentence instead — no switch that exists to say no.
 */
export function workflowGate(w: Pick<ArgusWorkflowRow, "allowed" | "allowed_words">): { controls: boolean; words: string | null } {
  if (w.allowed === true) return { controls: true, words: null };
  return { controls: false, words: (w.allowed_words || "").trim() || NOT_ALLOWED_WORDS };
}

/** The page-level "comes with SPARK" sentence is for the package refusal only;
 *  any other refusal of the list (sign-in, a header) is said as itself. */
export function isPackageRefusal(err: unknown): boolean {
  return statusOf(err) === 403 && errorCodeOf(err) === "not_allowed";
}

/** ARGUS -> Workflows when its one load failed: what happened, then the one thing to do. */
export function loadFailedWords(lines: string[]): string {
  const why = lines.join(" ").trim() || UNREACHABLE_WORDS;
  return `We couldn't load your workflows. ${why}`;
}

/**
 * Needs you: "Save for when you edit the chat". LUMEN keeps the question as a
 * draft for the chat editor; nothing a visitor sees changes, and the button
 * and its sentence say exactly that (LUMEN's own answer, used when it sends none).
 */
export const ADD_TO_CHAT_LABEL = "Save for when you edit the chat";
export const ADD_TO_CHAT_WORDS = "Saved for when you edit the chat. Nothing visitors see has changed yet.";

/** The tab ?tab= opens. "Set-up runs" is the founder's; anyone else lands on All. */
export type WorkflowsTab = "all" | "needs-you" | "history" | "setup";
export function workflowsTabFrom(v: string | null, isFounder: boolean): WorkflowsTab {
  if (v === "needs-you" || v === "history") return v;
  if (v === "setup" && isFounder) return "setup";
  return "all";
}

/**
 * One History line. LUMEN's status words already carry the step's name
 * ("Website audit — finished, score 62"); the name is added only when they
 * do not, so it is never said twice.
 */
export function historyLine(h: Pick<WorkflowHistoryRow, "action_label" | "status_words">): string {
  const label = (h.action_label || "").trim();
  const words = (h.status_words || "").trim();
  if (!label) return words;
  if (!words) return label;
  if (words.toLowerCase().startsWith(label.toLowerCase())) return words;
  return `${label} — ${words}`;
}

/**
 * "Looks like a complaint (sure)". LUMEN's intent words are whole sentences
 * ("Looks like a request for a quote", "Not sure what they want"); a bare
 * phrase gets "Looks like:" in front. "Not sure what they want" never carries
 * a sure-word — "(sure)" after it would contradict it.
 */
export function intentLine(words: string | null | undefined, sure: string | null | undefined): string | null {
  const w = (words || "").trim();
  if (!w) return null;
  const notSure = /^not sure\b/i.test(w);
  const sentence = /^looks like\b/i.test(w) || notSure ? w : `Looks like: ${w}`;
  const s = sureWords(sure);
  return s && !notSure ? `${sentence} (${s})` : sentence;
}

/** The link to a tool's file: "Open the quote". LUMEN's own default name is "report". */
export function openResultWords(resultLabel: string | null | undefined): string {
  const label = (resultLabel || "").trim() || "report";
  return `Open the ${label}`;
}

/**
 * Where "Show older" asks from. The server's own cursor when it sends one;
 * otherwise one millisecond past the last row, so a run sharing the
 * boundary's millisecond comes back (mergeHistory drops the repeat) instead
 * of being skipped by the server's `created_at < before`.
 */
export function historyCursor(rows: Array<Pick<WorkflowHistoryRow, "at">>, metaNext?: string | null): string | null {
  if (metaNext) return metaNext;
  const last = rows[rows.length - 1]?.at;
  if (!last) return null;
  const t = new Date(last).getTime();
  return Number.isNaN(t) ? null : new Date(t + 1).toISOString();
}

/** Older rows added below, each run once. `added` = how many were new. */
export function mergeHistory<T extends { run_id: string }>(have: T[], incoming: T[]): { rows: T[]; added: number } {
  const seen = new Set(have.map((h) => h.run_id));
  const fresh: T[] = [];
  for (const r of incoming) {
    if (seen.has(r.run_id)) continue;
    seen.add(r.run_id);
    fresh.push(r);
  }
  return { rows: [...have, ...fresh], added: fresh.length };
}

/** A chat website as the time-zone picker needs it. */
export interface ZoneSite { site_id: string; timezone?: string | null }

/**
 * The websites a picked time zone is saved to: only those with none yet. A
 * website that already has a zone keeps it — the picker never overwrites one.
 */
export function zoneTargets(sites: ZoneSite[]): string[] {
  return sites.filter((s) => !(s.timezone || "").trim()).map((s) => s.site_id);
}

/**
 * The amber lines on a workflow card: the server's warnings and the tree's
 * own notes, once each. Once the time zone is answered (picked here, or every
 * website already has one) its line is gone with the picker.
 *
 * A link button the server hid for want of an address is said in the card's
 * own words, pointing at the Links section on the same card, and the line is
 * gone once that link has an address (the server's own sentence for it is
 * dropped from the warnings and the notes, so it is never said twice).
 */
export function cardWarningLines(
  warnings: Array<string | ChatPlaybookWarning>,
  notes: string[],
  tzAnswered: boolean,
  hidden: HiddenLink[] = [],
  links: ChatLinkRow[] = [],
): string[] {
  const serverHidden = new Set(hidden.map((h) => h.words).filter(Boolean));
  const shown = (tzAnswered ? warnings.filter((w) => !isTimezoneWarning(w)) : warnings)
    .map(warningWords)
    .filter((w) => !serverHidden.has(w));
  const ownNotes = notes.filter((n) => !serverHidden.has(n));
  const hiddenLines = hidden.map((h) => hiddenLinkLine(h, links)).filter((l): l is string => !!l);
  return [...new Set([...shown, ...ownNotes, ...hiddenLines].filter(Boolean))];
}

// -- the owner's links (PUT /chat/playbooks/:id/links) --------------------------

/** A link button the server hid because its link has no address (tree.hidden_links). */
export interface HiddenLink {
  /** The button's own words ("Book it"). */
  label: string;
  /** Which link it opens (the key in links[]), when the server says. */
  key: string | null;
  /** The server's own sentence about it. */
  words: string;
}

export function hiddenLinksOf(tree: unknown): HiddenLink[] {
  if (!isRec(tree) || !Array.isArray(tree.hidden_links)) return [];
  return tree.hidden_links.filter(isRec).map((h) => ({
    label: str(h.label).trim(),
    key: str(h.var).trim() || null,
    words: str(h.words),
  }));
}

/** The buttons each link opens, by link key, as far as the server has said. */
export function buttonsByLink(hidden: HiddenLink[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const h of hidden) {
    if (!h.key || !h.label) continue;
    const list = out[h.key] || (out[h.key] = []);
    if (!list.includes(h.label)) list.push(h.label);
  }
  return out;
}

/** "Booking page" → "booking page" mid-sentence; a name ("Website Builder sign-up page") keeps its capitals. */
const lowerFirst = (s: string) => {
  const [first, second] = s.split(/\s+/);
  if (!first) return s;
  if (second && /^[A-Z]/.test(second)) return s;
  return s[0].toLowerCase() + s.slice(1);
};
const quoted = (labels: string[]) => labels.map((l) => `'${l}'`).join(" and ");
const hasUrl = (l: Pick<ChatLinkRow, "url"> | undefined) => !!(l?.url || "").trim();

/**
 * The amber line for one hidden button. It points at Links on this card, and
 * is null once that link has an address. A button whose link the workflow
 * does not declare cannot be fixed under Links, so no instruction is given.
 */
export function hiddenLinkLine(h: HiddenLink, links: ChatLinkRow[]): string | null {
  const link = h.key ? links.find((l) => l.key === h.key) : undefined;
  if (hasUrl(link)) return null;
  const button = h.label ? `The '${h.label}' button` : "A button";
  if (!link) return `${button} is hidden from visitors because it has no web address.`;
  return `${button} is hidden from visitors because it has no web address yet. Add the address of your ${lowerFirst(link.label)} under Links, below.`;
}

/** What a link row says about its buttons: shown, or hidden and why. */
export function linkStateWords(link: ChatLinkRow, buttons: string[]): string {
  const many = buttons.length > 1;
  if (hasUrl(link)) {
    return buttons.length
      ? `Visitors see the ${quoted(buttons)} ${many ? "buttons" : "button"}, and ${many ? "they open" : "it opens"} this page.`
      : "Visitors see its button, and it opens this page.";
  }
  return buttons.length
    ? `No address yet, so the ${quoted(buttons)} ${many ? "buttons are" : "button is"} hidden from visitors.`
    : "No address yet, so its button is hidden from visitors.";
}

/** Said beside the link's field after a save. */
export function linkSavedWords(link: ChatLinkRow, buttons: string[]): string {
  const many = buttons.length > 1;
  if (hasUrl(link)) {
    return buttons.length
      ? `Saved. Visitors see the ${quoted(buttons)} ${many ? "buttons" : "button"} from the next page they open.`
      : "Saved. Visitors see its button from the next page they open.";
  }
  return buttons.length
    ? `Cleared. The ${quoted(buttons)} ${many ? "buttons are" : "button is"} hidden from visitors until you add an address.`
    : "Cleared. Its button is hidden from visitors until you add an address.";
}

/** What the owner typed, as the address saved: a bare "book.example.com" gets https:// in front. */
export function linkAddress(typed: string): string {
  const t = (typed || "").trim();
  if (!t) return "";
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(t) ? t : `https://${t}`;
}

/** Every website the workflow covers has a zone: the question is answered. */
export function zoneKnown(sites: ZoneSite[]): boolean {
  return sites.length > 0 && sites.every((s) => !!(s.timezone || "").trim());
}

/**
 * The websites whose "Email visitors what they asked for" switch does
 * something: those an allowed chat workflow runs on (its own website, or every
 * website when it covers them all). Workflows unknown (the load failed) → none.
 */
export function visitorEmailSiteIds(
  playbooks: Array<Pick<ChatPlaybookRow, "allowed" | "site_id">> | null,
  siteIds: string[],
): Set<string> {
  const out = new Set<string>();
  if (!playbooks) return out;
  for (const p of playbooks) {
    if (p.allowed !== true) continue;
    if (p.site_id == null) { siteIds.forEach((id) => out.add(id)); continue; }
    // the same website however its id is cased
    const want = String(p.site_id).toLowerCase();
    for (const id of siteIds) if (id.toLowerCase() === want) out.add(id);
  }
  return out;
}

/**
 * Whether "Your own tools" is offered. Only on an explicit yes: the server's
 * package answer (`meta.allowed`) or a workflow it marked allowed. A failed
 * load, no workflows and no answer, or only refused workflows → not offered.
 */
export function toolsOffered(
  playbooks: Array<Pick<ChatPlaybookRow, "allowed">> | null,
  metaAllowed?: boolean | null,
): boolean {
  if (metaAllowed === true) return true;
  if (metaAllowed === false) return false;
  return !!playbooks && playbooks.some((p) => p.allowed === true);
}

// ── the read-only tree ─────────────────────────────────────────────────────
//
// `tree` from GET /chat/playbooks is read in one of two shapes:
//   (a) the workflow's own definition (`schema: "chat-playbook/1"`: services,
//       paths, nodes), with the owner's switches beside it as
//       `path_switches` (or `path_switches_json`, object or string), or with
//       `enabled` on each path; drafts as `drafts: [{ key, label }]` or as
//       paths with `status: "draft"`;
//   (b) an already-walked tree, as LUMEN's definition.tree() builds it:
//       `services: [{ key, label, on, first?, paths: [{ key, label, on,
//       steps: [{ kind, words, buttons?: [{ label, link?, goes_to?, steps? }] }] }] }]`,
//       `shared`, `drafts: [{ key, words }]`, `hidden_links: [{ label, words }]`
//       — the server's words are shown as they come (tokens filled), or steps
//       already in the TreeStep shape below.
// Anything else renders as "no steps to show", never as a crash.

export type TreeStep =
  | { kind: "say"; text: string }
  | { kind: "ask"; text: string; prompt: string | null }
  | { kind: "do"; text: string }
  | { kind: "handoff"; text: string }
  | { kind: "end"; text: string | null }
  | { kind: "goto"; label: string; on?: boolean }
  | { kind: "more"; text: string }
  | { kind: "buttons"; text: string; groups: TreeButtonGroup[] };

export interface TreeButtonGroup {
  labels: string[];
  /** A button that opens a web page. */
  link: boolean;
  children: TreeStep[];
}

export interface TreePath {
  key: string;
  label: string;
  enabled: boolean;
  steps: TreeStep[];
}

export interface TreeService {
  key: string;
  label: string;
  /** What ARGUS asks before the visitor is on one path (e.g. "Do you have a website today?"). */
  intro: TreeStep[];
  paths: TreePath[];
}

export interface DisplayTree {
  services: TreeService[];
  /** Paths every service reuses ("Call a rep now", "Get a custom quote"). */
  shared: TreePath[];
  drafts: Array<{ key: string; label: string }>;
  /** Names of the business's own tools this workflow runs. */
  toolsUsed: string[];
  /** Sentences the server adds about the tree itself (a hidden link button). */
  notes: string[];
  /** The link buttons hidden for want of an address, with the link each opens. */
  hiddenLinks: HiddenLink[];
}

export interface TreeFacts {
  business?: string | null;
  owner?: string | null;
}

const EMPTY_TREE: DisplayTree = { services: [], shared: [], drafts: [], toolsUsed: [], notes: [], hiddenLinks: [] };

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === "string" ? v : "");

/** {business} → the business's name, {name} → [their name], … so an owner reads words, not braces. */
export function fillTokens(text: string, facts: TreeFacts = {}): string {
  const business = (facts.business || "").trim() || "your business";
  const owner = (facts.owner || "").trim() || business;
  const map: Record<string, string> = {
    business,
    owner,
    name: "[their name]",
    email: "[their email]",
    phone: "[their number]",
    business_phone: "[your phone number]",
    note: "[what they need]",
    last_free_text: "[what they typed]",
  };
  return text.replace(/\{([a-z_]+)\}/g, (all, k: string) => (k in map ? map[k] : all));
}

const ASK_WORDS: Record<string, string> = {
  name: "Asks their name",
  business: "Asks their business name",
  website: "Asks their website address",
  email: "Asks their email",
  phone: "Asks their phone number",
  note: "Asks what they need, in a line",
  free_text: "Asks them to type an answer",
};

function actionWords(kind: string, params: Rec, facts: TreeFacts): string {
  switch (kind) {
    case "create_lead": return "Saves them as a lead";
    case "alert_owner": return `Tells you: ${fillTokens(str(params.title) || "a visitor needs you", facts)}`;
    case "email_visitor": {
      const promise = str(params.promise);
      return promise ? `Emails them: ${fillTokens(promise, facts)}` : "Emails them what they asked for";
    }
    case "enrol_journey": return `Adds them to your follow-up: ${str(params.journey_name) || "a journey"}`;
    case "call_now": return "Shows your phone number";
    case "custom": return `Runs your tool: ${str(params.action_name) || "your tool"}`;
    default: return "Runs a step";
  }
}

function parseSwitches(tree: Rec): Record<string, boolean> {
  const raw = tree.path_switches ?? tree.path_switches_json;
  let obj: unknown = raw;
  if (typeof raw === "string") {
    try { obj = JSON.parse(raw); } catch { obj = null; }
  }
  const out: Record<string, boolean> = {};
  if (isRec(obj)) for (const [k, v] of Object.entries(obj)) if (typeof v === "boolean") out[k] = v;
  return out;
}

/** Steps shown for one path (or one service's opening question). Each walk from
 *  the top gets its own count, so a long path never leaves the next one empty;
 *  when a count runs out the owner reads that it did. */
const MAX_STEPS = 400;
export const MORE_STEPS_WORDS = "More steps than we can show here.";

/** Walks a definition (shape a) into lines an owner reads. Pure. */
function walkDefinition(tree: Rec, facts: TreeFacts): DisplayTree {
  const nodes = isRec(tree.nodes) ? tree.nodes : {};
  const services = Array.isArray(tree.services) ? tree.services.filter(isRec) : [];
  const paths = Array.isArray(tree.paths) ? tree.paths.filter(isRec) : [];
  const switches = parseSwitches(tree);
  const entryToPath = new Map<string, Rec>();
  for (const p of paths) if (str(p.entry)) entryToPath.set(str(p.entry), p);
  const toolsUsed = new Set<string>();
  let budget = MAX_STEPS;
  let cut = false;

  function walk(start: string, ownEntry: string | null, ancestors: Set<string>): TreeStep[] {
    const out: TreeStep[] = [];
    let id: string | null = start;
    const seen = new Set(ancestors);
    while (id) {
      if (budget <= 0) {
        if (!cut) { out.push({ kind: "more", text: MORE_STEPS_WORDS }); cut = true; }
        break;
      }
      budget -= 1;
      const other = entryToPath.get(id);
      if (other && id !== ownEntry) { out.push({ kind: "goto", label: str(other.label) || id }); break; }
      if (id === "rules.price") { out.push({ kind: "goto", label: "The answer to a price question" }); break; }
      if (id === "rules.hold") { out.push({ kind: "goto", label: "Passed straight to you" }); break; }
      if (seen.has(id)) break;
      seen.add(id);
      const n: unknown = nodes[id];
      if (!isRec(n)) break;
      const type = str(n.type);
      if (type === "say") {
        out.push({ kind: "say", text: fillTokens(str(n.say), facts) });
        id = str(n.next) || null;
      } else if (type === "ask") {
        const field = str(n.field);
        const base = ASK_WORDS[field] || "Asks a question";
        out.push({
          kind: "ask",
          text: n.required === false ? `${base} (they can skip it)` : base,
          prompt: str(n.prompt) ? fillTokens(str(n.prompt), facts) : null,
        });
        id = str(n.next) || null;
      } else if (type === "action") {
        const kind = str(n.kind);
        const params = isRec(n.params) ? n.params : {};
        if (kind === "custom" && str(params.action_name)) toolsUsed.add(str(params.action_name));
        out.push({ kind: "do", text: actionWords(kind, params, facts) });
        id = str(n.next) || null;
      } else if (type === "handoff") {
        out.push({ kind: "handoff", text: fillTokens(str(n.say), facts) });
        id = str(n.next) || null;
      } else if (type === "end") {
        out.push({ kind: "end", text: str(n.say) ? fillTokens(str(n.say), facts) : null });
        id = null;
      } else if (type === "buttons") {
        const buttons = Array.isArray(n.buttons) ? n.buttons.filter(isRec) : [];
        // Buttons that go to the same place share one line: three answers
        // that all lead to the next question are one branch, not three copies.
        const groups: Array<{ target: string; link: boolean; labels: string[] }> = [];
        for (const b of buttons) {
          const link = !!str(b.link);
          const target = link ? `link:${str(b.then)}` : `goto:${str(b.goto)}`;
          const g = groups.find((x) => x.target === target && x.link === link);
          if (g) g.labels.push(str(b.label));
          else groups.push({ target, link, labels: [str(b.label)] });
        }
        const next = new Set(seen);
        out.push({
          kind: "buttons",
          text: fillTokens(str(n.say), facts),
          groups: groups.map((g) => {
            const to = g.target.slice(g.target.indexOf(":") + 1);
            return { labels: g.labels, link: g.link, children: to ? walk(to, ownEntry, next) : [] };
          }),
        });
        id = null;
      } else {
        break;
      }
    }
    return out;
  }

  const pathEnabled = (p: Rec) =>
    typeof p.enabled === "boolean" ? p.enabled : switches[str(p.key)] !== false;
  const isDraft = (p: Rec) => str(p.status) === "draft";
  /** One count per walk from the top: a path, or a service's opening question. */
  const fromTop = (start: string, ownEntry: string | null): TreeStep[] => {
    budget = MAX_STEPS;
    cut = false;
    return walk(start, ownEntry, new Set());
  };
  const toPath = (p: Rec): TreePath => ({
    key: str(p.key),
    label: str(p.label) || str(p.key),
    enabled: pathEnabled(p),
    steps: fromTop(str(p.entry), str(p.entry)),
  });

  const outServices: TreeService[] = services
    .filter((s) => str(s.status) !== "draft")
    .map((s) => {
      const start = str(s.start);
      const intro = start && !entryToPath.has(start) ? fromTop(start, null) : [];
      return {
        key: str(s.key),
        label: str(s.label) || str(s.key),
        intro,
        paths: paths.filter((p) => str(p.service) === str(s.key) && !isDraft(p)).map(toPath),
      };
    });
  const shared = paths.filter((p) => !str(p.service) && !isDraft(p)).map(toPath);
  const drafts: Array<{ key: string; label: string }> = paths
    .filter(isDraft)
    .map((p) => ({ key: str(p.key), label: str(p.label) || str(p.key) }));
  if (Array.isArray(tree.drafts)) {
    for (const d of tree.drafts.filter(isRec)) {
      const key = str(d.key);
      if (!drafts.some((x) => x.key === key)) drafts.push({ key, label: str(d.label) || str(d.words) || key });
    }
  }
  return { services: outServices, shared, drafts, toolsUsed: [...toolsUsed], notes: [], hiddenLinks: hiddenLinksOf(tree) };
}

const STEP_KINDS = new Set(["say", "ask", "do", "handoff", "end", "goto", "more", "buttons"]);
const PREFIX = /^ARGUS (says|asks):\s*/;

/** Steps from an already-walked tree: the server's `{ kind, words }`, or our own shape. */
function fromWalked(v: unknown, facts: TreeFacts, tools: Set<string>, depth = 0): TreeStep[] {
  if (!Array.isArray(v) || depth > 20) return [];
  const out: TreeStep[] = [];
  for (const s of v) {
    if (!isRec(s)) continue;
    const kind = str(s.kind);
    if (!("words" in s)) {
      if (STEP_KINDS.has(kind)) out.push(s as unknown as TreeStep);
      continue;
    }
    const words = fillTokens(str(s.words), facts);
    const bare = words.replace(PREFIX, "");
    if (kind === "goes_to" || kind === "goto") {
      const label = isRec(s.goes_to) ? str(s.goes_to.label) : "";
      out.push({ kind: "goto", label: label || bare.replace(/^→\s*/, "") });
    } else if (kind === "buttons" || Array.isArray(s.buttons)) {
      const chips = Array.isArray(s.buttons) ? s.buttons.filter(isRec) : [];
      const groups: Array<TreeButtonGroup & { target: string }> = [];
      for (const c of chips) {
        const link = c.link === true;
        const to = isRec(c.goes_to) ? c.goes_to : null;
        // Answers that lead to the same place share one line.
        // A chip into another path carries that path's switch (`on`): an
        // answer into a switched-off path reads off, as visitors are offered it.
        const on = c.on !== false;
        const target = to ? `path:${str(to.key)}:${on}` : `steps:${JSON.stringify(c.steps ?? null)}`;
        const g = groups.find((x) => x.target === target && x.link === link);
        if (g) { g.labels.push(str(c.label)); continue; }
        const children: TreeStep[] = to
          ? [{ kind: "goto", label: str(to.label) || str(to.key), on }]
          : fromWalked(c.steps, facts, tools, depth + 1);
        groups.push({ target, link, labels: [str(c.label)], children });
      }
      out.push({ kind: "buttons", text: bare, groups: groups.map(({ labels, link, children }) => ({ labels, link, children })) });
    } else if (kind === "ask") {
      out.push({ kind: "ask", text: words, prompt: null });
    } else if (kind === "say") {
      out.push({ kind: "say", text: bare });
    } else if (kind === "end") {
      out.push({ kind: "end", text: PREFIX.test(words) ? bare : null });
    } else if (kind === "owner_reply" || kind === "handoff") {
      out.push({ kind: "handoff", text: bare.replace(/^Hands the question to you:\s*/, "") });
    } else {
      const tool = /^Runs your tool:\s*(.+)$/.exec(words);
      if (kind === "tool" && tool) tools.add(tool[1].trim());
      out.push({ kind: "do", text: words });
    }
  }
  return out;
}

function walkedPath(p: Rec, facts: TreeFacts, tools: Set<string>): TreePath {
  return {
    key: str(p.key),
    label: str(p.label) || str(p.key),
    enabled: typeof p.on === "boolean" ? p.on : p.enabled !== false,
    steps: fromWalked(p.steps, facts, tools),
  };
}

/** Reads `tree` (either shape) into what ChatWorkflowTree renders. Pure, never throws. */
export function buildDisplayTree(tree: unknown, facts: TreeFacts = {}): DisplayTree {
  if (!isRec(tree)) return EMPTY_TREE;
  if (isRec(tree.nodes)) return walkDefinition(tree, facts);
  const services = Array.isArray(tree.services) ? tree.services.filter(isRec) : [];
  if (!services.every((s) => Array.isArray(s.paths)) || (!services.length && !Array.isArray(tree.shared))) return EMPTY_TREE;
  const tools = new Set<string>();
  const out: DisplayTree = {
    services: services.map((s) => ({
      key: str(s.key),
      label: str(s.label) || str(s.key),
      intro: fromWalked(isRec(s.first) ? [s.first] : s.intro, facts, tools),
      paths: (s.paths as unknown[]).filter(isRec).filter((p) => str(p.status) !== "draft").map((p) => walkedPath(p, facts, tools)),
    })),
    shared: Array.isArray(tree.shared)
      ? tree.shared.filter(isRec).filter((p) => str(p.status) !== "draft").map((p) => walkedPath(p, facts, tools))
      : [],
    drafts: Array.isArray(tree.drafts)
      ? tree.drafts.filter(isRec).map((d) => ({ key: str(d.key), label: str(d.label) || str(d.words) || str(d.key) }))
      : [],
    toolsUsed: [],
    notes: Array.isArray(tree.hidden_links)
      ? tree.hidden_links.filter(isRec).map((h) => str(h.words)).filter(Boolean)
      : [],
    hiddenLinks: hiddenLinksOf(tree),
  };
  if (Array.isArray(tree.tools_used)) for (const t of tree.tools_used) if (typeof t === "string") tools.add(t);
  out.toolsUsed = [...tools];
  return out;
}

/** A tool's name as a chat step finds it: trimmed, any case (LUMEN's validate does the same). */
const toolKey = (name: string) => (name || "").trim().toLowerCase();

/** The workflows that run a tool, by name — said in the Remove confirmation. */
export function workflowsUsingTool(playbooks: ChatPlaybookRow[], toolName: string, facts: TreeFacts = {}): string[] {
  const want = toolKey(toolName);
  return playbooks
    .filter((p) => buildDisplayTree(p.tree, facts).toolsUsed.some((t) => toolKey(t) === want))
    .map((p) => p.name);
}

/** The fields a tool can be sent, in the order the form lists them. */
export const TOOL_FIELDS: Array<{ key: string; label: string }> = [
  { key: "name", label: "name" },
  { key: "business", label: "business" },
  { key: "website", label: "website" },
  { key: "email", label: "email" },
  { key: "phone", label: "phone" },
];

export const SECRET_SENTENCE =
  "Paste this into your tool's settings. It's shown once — if you lose it, replace it.";

/** Time zones for the inline picker. The browser's own list when it has one. */
export function timeZoneOptions(): string[] {
  const intl = Intl as unknown as { supportedValuesOf?: (k: string) => string[] };
  try {
    const all = intl.supportedValuesOf?.("timeZone");
    if (all && all.length) return all;
  } catch { /* an older browser: the short list below */ }
  return [
    "America/New_York", "America/Chicago", "America/Denver", "America/Phoenix",
    "America/Los_Angeles", "America/Anchorage", "Pacific/Honolulu",
  ];
}
