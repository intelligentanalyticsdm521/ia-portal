// The Agents surfaces: three product pages, three shared components, one
// founder page. Source-pinned, like responder-ui and il-learning-ui — these
// are wiring and wording facts a typecheck cannot see.
//
// What has to stay true:
//   • the client learns ONE pattern: Approve & send / Edit / Decline, the same
//     verbs the Responder panel already taught
//   • every page talks to routes the APIs actually serve
//   • the Portal never invents a second approval path — decisions go to the
//     agents' own routes, which re-check the source before they act
//   • the client pages show no dollar figure; the founder page does (AG-1)
//   • ARION's agent is WIRED (ARGUS pack 1 — it used to be a "coming" row), and
//     approving it never publishes: putting a piece live is a second press
//   • the engine is "ARGUS AI" and no model vendor is named anywhere
//   • no surface says "tenant" to a human
//   • every product page has a run-history panel and a Run-it-now control, so a
//     working agent and a broken one cannot look identical
//   • the founder page carries the kill switches, the spend limits and the
//     propose-only code queue
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const SRC = path.join(process.cwd(), "src");
const read = (rel) => readFileSync(path.join(SRC, rel), "utf8");

const panel = read("components/agents/AgentActivityPanel.tsx");
const card = read("components/agents/AgentApprovalCard.tsx");
const settingsRow = read("components/agents/AgentSettingsRow.tsx");
const types = read("components/agents/types.ts");
const oliver = read("pages/oliver/OliverAgentsPage.tsx");
const spark = read("pages/spark/SparkAgentsPage.tsx");
const arion = read("pages/arion/ArionAgentsPage.tsx");
const founder = read("pages/admin/AgentsAcrossBusinessesPage.tsx");
const app = read("App.tsx");
const subnav = read("components/SubNav.tsx");
const router = read("pages/ServiceRouter.tsx");
const catalog = read("config/serviceCatalog.ts");
const settingsRoutes = read("pages/settings/SettingsRoutes.tsx");
const platformAdmin = read("pages/PlatformAdminPage.tsx");
const leadInbox = read("pages/spark/SparkLeadInboxPage.tsx");

const CLIENT_SURFACES = [
  ["the activity panel", panel],
  ["the approval card", card],
  ["the settings row", settingsRow],
  ["the OLIVER page", oliver],
  ["the SPARK page", spark],
  ["the ARION page", arion],
];

/** Everything a person can read: JSX text and quoted copy, minus the code. */
function visibleText(src) {
  return src
    .replace(/^\s*\/\/.*$/gm, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/className="[^"]*"/g, " ")
    .replace(/import[^;]*;/g, " ");
}

/* ── one pattern, learned once ───────────────────────────────────────── */

test("the approval card offers the same three verbs as the Responder panel", () => {
  const responder = read("components/spark/LeadResponderPanel.tsx");
  assert.match(responder, /Approve & send/, "the pattern being copied still exists");
  assert.match(card, /approveLabel \|\| "Approve & send"/);
  assert.match(card, />Edit\b/);
  assert.match(card, />Decline\b/);
  // and, like the Responder, an edit and an approval in one press
  assert.match(card, /Save &amp; /);
});

test("declining always asks why — that answer is what tone calibration reads", () => {
  assert.match(card, /onDecline\(row, note\.trim\(\)\)/);
  assert.match(card, /disabled=\{!note\.trim\(\) \|\| declineBusy\}/,
    "a blank reason must not be submittable — QTC's reject route requires one");
});

test("the panel splits Waiting for you from Recently, and never hides a broken source", () => {
  assert.match(panel, /Waiting for you/);
  assert.match(panel, /Recently/);
  assert.match(panel, /activity\.meta\.degraded\.length > 0/);
  assert.match(panel, /Some of this list could not be loaded/);
});

test("a draft decided elsewhere gets a link, not a second Approve button", () => {
  assert.match(panel, /const elsewhere = waiting\.filter\(\(r\) => !r\.can_decide\)/);
  assert.match(panel, /function ElsewhereRow/);
  assert.match(panel, />\s*Open it\s*</);
  // ElsewhereRow must not render an approval card
  const block = panel.slice(panel.indexOf("function ElsewhereRow"), panel.indexOf("export function AgentActivityPanel"));
  assert.equal(/AgentApprovalCard/.test(block), false);
});

/* ── the routes each page actually calls ─────────────────────────────── */

test("the OLIVER page reads its own endpoints and decides through the agents' routes", () => {
  // useOliverApi strips the envelope, so the generic is the payload itself.
  assert.match(oliver, /get<AgentActivityPayload>\("\/agents\/activity"\)/);
  assert.match(oliver, /get<AgentSettingsResponse>\("\/agents\/settings"\)/);
  assert.match(oliver, /put<AgentSettingsResponse>\("\/agents\/settings"/);
  assert.match(oliver, /`\/qtc-agent\/queue\/\$\{row\.id\}\/approve`/);
  assert.match(oliver, /`\/qtc-agent\/queue\/\$\{row\.id\}\/reject`/);
  assert.match(oliver, /`\/fieldops-agent\/suggestions\/\$\{row\.id\}\/accept`/);
  assert.match(oliver, /`\/fieldops-agent\/suggestions\/\$\{row\.id\}\/dismiss`/);
});

test("the SPARK page reads its own endpoints and decides through the campaign-agent queue", () => {
  assert.match(spark, /"\/api\/v1\/agents\/activity\?product=spark"/);
  assert.match(spark, /"\/api\/v1\/agents\/settings\?product=spark"/);
  assert.match(spark, /`\/api\/v1\/campaign-agent\/queue\/\$\{row\.id\}\/approve`/);
  assert.match(spark, /`\/api\/v1\/campaign-agent\/queue\/\$\{row\.id\}\/reject`/);
});

test("no page invents its own approval — every decision goes to an agent route", () => {
  for (const [name, src] of [["the OLIVER page", oliver], ["the SPARK page", spark]]) {
    assert.equal(/\/agents\/(approve|reject|decide)/.test(src), false,
      `${name} must not grow a second approval path`);
  }
});

test("the SPARK page never grows a second copy of the Responder's buttons", () => {
  // Approving a Responder draft stays on the lead card, where the send guards
  // are. The page links to the inquiry instead.
  assert.equal(/leads\/\$\{[^}]*\}\/drafts/.test(spark), false);
  assert.match(spark, /lead card/i);
  // …and the Lead Inbox can actually be deep-linked, or that link is a lie.
  assert.match(leadInbox, /new URLSearchParams\(window\.location\.search\)\.get\("lead"\)/);
});

/* ── AG-2: the button says what actually happens ─────────────────────── */

test("approving a campaign draft is never labelled as sending it", () => {
  assert.match(spark, /campaign: "Approve & create the draft"/);
  assert.match(spark, /Approving a campaign here creates the draft/);
  assert.match(oliver, /qtc: "Approve & send"/);
  assert.match(oliver, /fieldops: "Approve & assign"/);
});

test("the four statuses are the only ones the Portal knows about", () => {
  assert.match(types, /export type AgentStatus = "proposed" \| "approved" \| "declined" \| "stopped";/);
  // The payload key is `rows`, not `data` — an envelope-stripping client would
  // hand back a bare array and drop `meta` (the degraded banner) on the floor.
  assert.match(types, /export interface AgentActivityPayload \{/);
  assert.match(types, /rows: AgentActivityRow\[\];/);
  assert.equal(/"sent"\s*\|/.test(types), false, "`sent` would be a lie for the campaign agent");
});

/* ── AG-1: dollars ───────────────────────────────────────────────────── */

test("no client-facing agent surface renders a dollar figure", () => {
  for (const [name, src] of CLIENT_SURFACES) {
    assert.equal(/cost_usd/.test(src), false, `${name} must not read our cost basis`);
    assert.equal(/\$\{?\s*usd\(/.test(src), false, `${name} must not format money for agent work`);
  }
  // …and the row's own plain-words line IS shown, so cost is not just hidden
  assert.match(card, /\{row\.cost_note\}/);
});

test("the founder page is the one place the real cost appears", () => {
  assert.match(founder, /cost_usd/);
  assert.match(founder, /Our cost/);
  assert.match(founder, /il\/admin\/agents\/activity\?days=/);
  assert.match(founder, /the client-facing\s*\n?\s*agent pages never show a cost figure/);
  assert.match(founder, /rollup\.unavailable/, "an incomplete rollup must say so");
});

/* ── ARION: wired, and publishing is a SECOND press ──────────────────── */

test("the ARION page is wired to the real agent and can switch it on", () => {
  // ARGUS pack 1 replaced the honest "coming" row. The agent had been merged,
  // tested and reachable only by script; the page is now the same three
  // components the other two products use.
  assert.match(arion, /useArionAgentsApi/, "it must talk to the real service");
  assert.match(arion, /<AgentActivityPanel/);
  assert.match(arion, /<AgentSettingsRow/);
  assert.match(arion, /<AgentRunHistoryPanel/);
  assert.equal(/coming/.test(visibleText(arion)), false, "the coming row is gone from what a person reads");
  // The switch-on knobs: this is what makes the agent sellable at all. Without a
  // price the 60% margin rule reports "price not set" and protects nothing.
  assert.match(arion, /field: "posts_per_week"/);
  assert.match(arion, /field: "price_usd_monthly"/);
  assert.match(arion, /onRunNow=\{runNow\}/, "the POC cannot wait for a weekly timer");
});

test("approving an ARION draft never publishes it — that is a second press", () => {
  // AC8. The agent must not be able to put something on a client's website
  // because somebody clicked once.
  assert.match(arion, /can_publish/);
  assert.match(arion, /Put it live/);
  assert.match(arion, /nothing has gone live yet/);
  assert.match(arion, /Approved, ready to go live/);
});

test("an ARION draft that was held back cannot be approved from the page", () => {
  // AC2. A held draft in the normal list is exactly the mistake escalation
  // exists to prevent, so it gets its own section and no approve button.
  assert.match(arion, /activity\.escalated/);
  assert.match(arion, /Held back for a person to read/);
  assert.match(arion, /These are not approvable from here on purpose/);
});

test("the ARION page explains itself in plain words", () => {
  const text = visibleText(arion);
  for (const jargon of ["API", "endpoint", "merged", "branch", "migration", "LLM", "webhook"]) {
    assert.equal(text.includes(jargon), false, `"${jargon}" is not a word a business owner should read`);
  }
});

/* ── nav + routing ───────────────────────────────────────────────────── */

test("every Agents page is in the catalog, the nav and the router", () => {
  for (const key of ["oliver_agents", "spark_agents", "arion_agents"]) {
    assert.match(catalog, new RegExp(`key: '${key}'`), `${key} missing from the catalog`);
    assert.match(subnav, new RegExp(`key: "${key}", label: "Agents"`), `${key} missing from the nav`);
    assert.match(router, new RegExp(`case '${key}':`), `${key} has no route`);
  }
});

test("Agents lives in each product's Settings group — one entry per product", () => {
  // AG-3. Count the nav rows: exactly one per product, nowhere else.
  const rows = subnav.match(/key: "(oliver|spark|arion)_agents"/g) || [];
  assert.equal(rows.length, 3, "one Agents entry per product, and only one");
  // and the settings section auto-expands on those routes
  assert.match(subnav, /if \(path\.includes\("\/oliver_agents"\)\) return "settings_oliver";/);
  assert.match(subnav, /if \(path\.includes\("\/spark_agents"\)\) return "settings_spark";/);
  assert.match(subnav, /if \(path\.includes\("\/arion_agents"\)\) return "settings_arion";/);
});

test("the Settings hub has a tile for each product's Agents page", () => {
  for (const key of ["oliver_agents", "spark_agents", "arion_agents"]) {
    assert.match(settingsRoutes, new RegExp(`/app/services/${key}'`), `${key} tile missing`);
  }
});

test("the founder page is routed behind RequireFounderRoute and linked from Platform Admin", () => {
  assert.match(app, /<Route path="admin\/agents" element=\{<RequireFounderRoute \/>\}>/);
  assert.match(app, /AgentsAcrossBusinessesPageAdmin/);
  assert.match(platformAdmin, /to="\/app\/admin\/agents"/);
  assert.match(platformAdmin, /Agents across businesses/);
});

/* ── the words ───────────────────────────────────────────────────────── */

test("the engine is ARGUS AI and no model vendor is named on any agent surface", () => {
  for (const [name, src] of [...CLIENT_SURFACES, ["the founder page", founder]]) {
    assert.equal(/anthropic|claude|openai|gpt-|gemini|sonnet|haiku|llama/i.test(src), false,
      `${name} must never name the model vendor`);
  }
  // All THREE now read the engine name from the server. The ARION page used to
  // carry the literal because it had no server to read it from.
  for (const [name, src] of [["OLIVER", oliver], ["SPARK", spark], ["ARION", arion]]) {
    assert.match(src, /Powered by \{activity\?\.meta\.engine \|\| settings\?\.engine \|\| "ARGUS AI"\}/,
      `the ${name} page must take the engine name from the server`);
  }
});

test("no client surface says 'tenant' to a human", () => {
  for (const [name, src] of CLIENT_SURFACES) {
    assert.equal(/tenant/i.test(visibleText(src)), false, `${name} must say Business, never tenant`);
  }
});

test("the client pages explain themselves in plain words", () => {
  for (const [name, src] of [["the OLIVER page", oliver], ["the SPARK page", spark]]) {
    const text = visibleText(src);
    for (const jargon of ["LLM", "webhook", "endpoint", "idempotent", "normalised", "read model", "tier gate"]) {
      assert.equal(text.includes(jargon), false, `${name}: "${jargon}" is not a word a business owner should read`);
    }
  }
});

test("every agent's attribution line comes from the server, not re-spelled here", () => {
  assert.match(settingsRow, /\{agent\.attribution\}/);
  assert.match(card, /\{row\.attribution\}/);
  // ARGUS pack 1: the last hard-coded attribution is gone. The ARION page had
  // one only because it had no server to ask; now arion-api's read model owns it
  // (lib/agents/activity.js ARION_AGENTS), the same as the other two products.
  for (const [name, src] of [["OLIVER", oliver], ["SPARK", spark], ["ARION", arion]]) {
    assert.equal(/Created by Intelligent Analytics/.test(src), false,
      `the ${name} page must not spell an attribution line itself`);
  }
});

/* ── ARGUS pack 1: history, Run it now, and the founder's switches ───── */

test("every product page shows what its agents have been DOING, not just what they proposed", () => {
  // Before this, a failed run, a sticky halt, a provider outage and a perfectly
  // ordinary "nothing was due" were all invisible — so an agent working
  // correctly and an agent broken since Tuesday looked identical.
  const runsPanel = read("components/agents/AgentRunHistoryPanel.tsx");
  assert.match(runsPanel, /What it has been doing/);
  assert.match(runsPanel, /row\.notes/, "why it skipped what it skipped, in words");
  assert.match(runsPanel, /row\.failure/, "a failure must say what failed");
  assert.equal(/cost_usd|usd\(/.test(runsPanel), false, "AG-1: no dollar figure on a client surface");
  for (const [name, src] of [["OLIVER", oliver], ["SPARK", spark], ["ARION", arion]]) {
    assert.match(src, /<AgentRunHistoryPanel/, `the ${name} page has no run history`);
    // Found by the mutation check: `{false && <AgentRunHistoryPanel ...>}` still
    // matches the line above and renders nothing. A component parked behind a
    // permanently false condition is a component that is not on the page.
    assert.equal(/\{\s*false\s*&&/.test(src), false,
      `the ${name} page has something parked behind a permanently false condition`);
  }
  // Where the request is made differs by product: OLIVER and SPARK have api
  // hooks that take a path, ARION's service takes three arguments per call so
  // its page keeps that plumbing in a hook of its own (which is also what keeps
  // the word "tenant" out of a client-facing file).
  assert.match(oliver, /agents\/runs/);
  assert.match(spark, /agents\/runs/);
  assert.match(read("lib/arionApi.ts"), /\/arion\/agents\/runs/);
  assert.match(read("pages/arion/useArionAgentsApi.ts"), /getArionAgentRuns/);
});

test("Run it now calls the run endpoints that already exist — no second start path", () => {
  // A second way to start a cycle is a second place for the pre-run gates
  // (enabled, sticky halt, spend ceiling) to be forgotten.
  assert.match(oliver, /qtc: "\/qtc-agent\/run"/);
  assert.match(oliver, /fieldops: "\/fieldops-agent\/run"/);
  assert.match(oliver, /governance: "\/argus\/governance\/reindex"/);
  assert.match(spark, /campaign-agent\/draft/);
  // The campaign agent REFUSES to draft without a brief (its own design
  // principle 3), so the button asks for one instead of inventing it.
  assert.match(spark, /window\.prompt/);
  assert.match(settingsRow, /Run it now/);
  assert.match(settingsRow, /onRunNow/);
});

test("the founder page carries the kill switches, the limits and the code queue", () => {
  assert.match(founder, /<AgentControlsCard/);
  assert.match(founder, /<AgentCodeProposalsCard/);
  const controls = read("pages/admin/AgentControlsCard.tsx");
  // Every write echoes the WORDS back. A `confirm: true` flag is one stray body
  // field away from no confirmation at all, and two of these stop the platform.
  assert.match(controls, /confirm_words/);
  assert.match(controls, /Type exactly/);
  // And what the card SENDS is what the person typed, not a boolean it made up.
  // Comments are stripped first: the header explains why `confirm: true` is wrong
  // and would otherwise trip its own rule.
  assert.match(controls, /confirm: typed/);
  assert.equal(/confirm: true/.test(visibleText(controls)), false,
    "a `confirm: true` flag is one stray body field away from no confirmation at all");
  assert.match(controls, /il\/admin\/agents\/controls\/spend/);
  assert.match(controls, /il\/admin\/agents\/controls\/ceiling/);
  assert.match(controls, /il\/admin\/agents\/controls\/stop/);
  // "We could not read it" must never render as "it is switched off".
  assert.match(controls, /UNKNOWN/);
  assert.match(controls, /should be read as "switched off"/);
  // There is no start-everywhere button, deliberately.
  assert.equal(/Start everywhere|Turn on everywhere/i.test(controls), false);

  const proposals = read("pages/admin/AgentCodeProposalsCard.tsx");
  assert.match(proposals, /Approving does not apply anything/);
  assert.equal(/proposals\/[^'"]*\/apply/i.test(proposals), false, "there is no apply route and there must never be one");
});

test("the oversight layer's numbers are never counted as runs or as cost", () => {
  // argus.governance_run_index holds one row per OTHER agent's run, each already
  // carrying that agent's own cost. Counting them again would double every total
  // on the page whose entire job is a per-business total.
  // TWICE: the by-agent table and the by-business table both print these numbers,
  // and one of them left unguarded is one place the page doubles its own totals.
  assert.equal((founder.match(/kind === "oversight"/g) || []).length, 2,
    "both tables must special-case the oversight layer");
  assert.match(founder, /checked \{a\.checked \?\? 0\} runs/);
  assert.match(founder, /no spend/);
});

test("the Responder keeps ONE settings page — the row links, it does not duplicate", () => {
  assert.match(settingsRow, /agent\.settings_href \? \(/);
  assert.match(settingsRow, />\s*Its settings</);
  const responderSettings = read("pages/settings/ResponderSettingsPage.tsx");
  assert.match(responderSettings, /Answer new inquiries for me/, "the page it links to still exists");
  assert.equal(/Answer new inquiries for me/.test(spark), false,
    "the SPARK Agents page must not grow a second copy of those switches");
});
