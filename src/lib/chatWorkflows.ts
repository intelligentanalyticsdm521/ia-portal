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
}

/** The block the lead's Conversation tab shows above a transcript (§C.11). */
export interface ChatConversationWorkflow {
  name: string;
  service: string | null;
  path: string | null;
  intent_words: string | null;
  sure: string | null;
  fields: Array<{ label: string; value: string }>;
  results: Array<{ run_id: string; label: string; status_words: string; file_url: string | null; finished_at: string | null }>;
}

// ── the routes, built in one place ──────────────────────────────────────────

const enc = encodeURIComponent;

export const CHAT_WF = {
  playbooks: "/api/v1/chat/playbooks",
  playbook: (id: string) => `/api/v1/chat/playbooks/${enc(id)}`,
  path: (id: string, pathKey: string) => `/api/v1/chat/playbooks/${enc(id)}/paths/${enc(pathKey)}`,
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
  if (!m) return [msg || "That didn't work. Please try again."];
  try {
    const body = JSON.parse(m[2]) as { errors?: unknown; message?: unknown; error?: unknown; words?: unknown };
    const list = Array.isArray(body.errors)
      ? body.errors.map((e) => (typeof e === "string" ? e : (e as { words?: string; message?: string })?.words || (e as { message?: string })?.message || "")).filter(Boolean)
      : [];
    if (list.length) return list as string[];
    if (typeof body.message === "string" && body.message) return [body.message];
    if (typeof body.words === "string" && body.words) return [body.words];
    if (typeof body.error === "string" && body.error) return [body.error.replace(/_/g, " ")];
  } catch { /* not JSON — fall through to the status sentence */ }
  return [`That didn't work (the server said ${m[1]}). Please try again in a minute.`];
}

export function statusOf(err: unknown): number | null {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  const m = /^SPARK API (\d{3}):/.exec(msg);
  return m ? Number(m[1]) : null;
}

export const NO_SPARK_WORDS =
  "Your workflows appear here. Right now the only kind is the website chat, which comes with SPARK.";

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
  | { kind: "goto"; label: string }
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
}

export interface TreeFacts {
  business?: string | null;
  owner?: string | null;
}

const EMPTY_TREE: DisplayTree = { services: [], shared: [], drafts: [], toolsUsed: [], notes: [] };

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

const MAX_STEPS = 400;

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

  function walk(start: string, ownEntry: string | null, ancestors: Set<string>): TreeStep[] {
    const out: TreeStep[] = [];
    let id: string | null = start;
    const seen = new Set(ancestors);
    while (id && budget > 0) {
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
  const toPath = (p: Rec): TreePath => ({
    key: str(p.key),
    label: str(p.label) || str(p.key),
    enabled: pathEnabled(p),
    steps: walk(str(p.entry), str(p.entry), new Set()),
  });

  const outServices: TreeService[] = services
    .filter((s) => str(s.status) !== "draft")
    .map((s) => {
      const start = str(s.start);
      const intro = start && !entryToPath.has(start) ? walk(start, null, new Set()) : [];
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
  return { services: outServices, shared, drafts, toolsUsed: [...toolsUsed], notes: [] };
}

const STEP_KINDS = new Set(["say", "ask", "do", "handoff", "end", "goto", "buttons"]);
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
        const target = to ? `path:${str(to.key)}` : `steps:${JSON.stringify(c.steps ?? null)}`;
        const g = groups.find((x) => x.target === target && x.link === link);
        if (g) { g.labels.push(str(c.label)); continue; }
        const children: TreeStep[] = to
          ? [{ kind: "goto", label: str(to.label) || str(to.key) }]
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
  };
  if (Array.isArray(tree.tools_used)) for (const t of tree.tools_used) if (typeof t === "string") tools.add(t);
  out.toolsUsed = [...tools];
  return out;
}

/** The workflows that run a tool, by name — said in the Remove confirmation. */
export function workflowsUsingTool(playbooks: ChatPlaybookRow[], toolName: string, facts: TreeFacts = {}): string[] {
  return playbooks
    .filter((p) => buildDisplayTree(p.tree, facts).toolsUsed.includes(toolName))
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
