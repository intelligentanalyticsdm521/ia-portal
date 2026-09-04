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
//   • ARION's agent is shown as coming, with NO button to press
//   • the engine is "ARGUS AI" and no model vendor is named anywhere
//   • no surface says "tenant" to a human
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

/* ── ARION: coming, and no button ────────────────────────────────────── */

test("the ARION page says its agent is coming and offers nothing to press", () => {
  assert.match(arion, /Content &amp; Social Agent — coming/);
  assert.equal(/<button/.test(arion), false, "a button here would 404 — the API is not on this line");
  assert.equal(/useOliverApi|useSparkApi|fetch\(/.test(arion), false, "there is nothing to call yet");
  // Plain words, no dates, no jargon (feedback_no_tenant_in_ui).
  assert.match(arion, /we will let you know as soon as it is/);
  const text = visibleText(arion);
  for (const jargon of ["API", "endpoint", "merged", "branch", "migration"]) {
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
  assert.match(oliver, /Powered by \{activity\?\.meta\.engine \|\| settings\?\.engine \|\| "ARGUS AI"\}/);
  assert.match(spark, /Powered by \{activity\?\.meta\.engine \|\| settings\?\.engine \|\| "ARGUS AI"\}/);
  assert.match(arion, /Powered by ARGUS AI/);
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
  // The one hard-coded attribution is the ARION agent that has no server yet.
  assert.match(arion, /Created by Intelligent Analytics — ARION Content &amp; Social Agent/);
});

test("the Responder keeps ONE settings page — the row links, it does not duplicate", () => {
  assert.match(settingsRow, /agent\.settings_href \? \(/);
  assert.match(settingsRow, />\s*Its settings</);
  const responderSettings = read("pages/settings/ResponderSettingsPage.tsx");
  assert.match(responderSettings, /Answer new inquiries for me/, "the page it links to still exists");
  assert.equal(/Answer new inquiries for me/.test(spark), false,
    "the SPARK Agents page must not grow a second copy of those switches");
});
